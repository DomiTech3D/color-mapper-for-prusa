// Color Mapper for Prusa – Copyright (C) 2026 DomiTech3D
// SPDX-License-Identifier: GPL-3.0-only – additional terms (attribution) in NOTICE.md

package main

// Color Mapper for Prusa als Windows-Programm (ColorMapperForPrusa.exe): liefert die Seite lokal aus und holt die
// Tool-Farben live aus Prusa Connect. Intern heisst dieser Teil «Bridge».
// Interne Kennungen (app "indx-bridge", Header X-INDX, Umgebungsvariablen INDX_*) bleiben für die Kompatibilität mit älteren Versionen.

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var version = "1.4.0" // beim Release-Build per -ldflags "-X main.version=…" gesetzt

//go:embed web/color-mapper.html
var pageHTML []byte

type config struct {
	accountURL, graphqlURL, clientID, redirectURI, scope, listen, dataDir string
	noOpen                                                                bool
}

var cfg config
var tokens = &tokenStore{}
var httpClient = &http.Client{Timeout: 25 * time.Second}

var logFile *os.File

// ringLog hält die letzten Protokollzeilen für die Anzeige im Farb-Mapper.
type ringLog struct {
	mu      sync.Mutex
	lines   []string
	partial string
}

func (r *ringLog) Write(p []byte) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	parts := strings.Split(r.partial+string(p), "\n")
	r.partial = parts[len(parts)-1]
	for _, l := range parts[:len(parts)-1] {
		r.lines = append(r.lines, strings.TrimRight(l, "\r"))
	}
	if len(r.lines) > 300 {
		r.lines = r.lines[len(r.lines)-300:]
	}
	return len(p), nil
}

func (r *ringLog) snapshot() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.lines...)
}

var memLog = &ringLog{}

// logf schreibt ins Konsolenfenster und in bridge.log (ohne Codes oder Tokens).
func logf(format string, a ...any) { log.Printf(format, a...) }

func env(k, def string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return def
}

// ---------------------------------------------------------------- Daten aus Connect

type ToolInfo struct {
	T   int    `json:"t"`
	C   string `json:"c,omitempty"`
	M   string `json:"m,omitempty"`
	N   string `json:"n,omitempty"`
	B   string `json:"b,omitempty"`
	NFC bool   `json:"nfc,omitempty"`
	// nur aus Spooly
	No     int      `json:"no,omitempty"`   // Spulennummer
	G      *float64 `json:"g,omitempty"`    // Restgewicht in Gramm
	Fill   string   `json:"fill,omitempty"` // "low" oder "crit"
	Loc    string   `json:"loc,omitempty"`
	Spid   string   `json:"spid,omitempty"`   // Spulen-ID in Spooly
	Slot   bool     `json:"slot,omitempty"`   // Spooly kennt diesen Slot (Spule kann zugeordnet werden)
	Listed bool     `json:"listed,omitempty"` // Spooly führt den Slot in GET /slots (auch ohne slot_id)
}

type PrinterInfo struct {
	ID    string     `json:"id"`
	Name  string     `json:"name"`
	Type  string     `json:"type"`
	Model string     `json:"model,omitempty"` // Druckermodell im PrusaSlicer-Format (aus Spooly), z. B. COREONE_INDX8T
	State string     `json:"state,omitempty"`
	MMU   bool       `json:"mmu"` // Tools sind die Slots einer MMU
	Tools []ToolInfo `json:"tools"`
}

type snapshot struct {
	Printers  []PrinterInfo `json:"printers"`
	UpdatedAt time.Time     `json:"updatedAt"`
}

type liveState struct {
	mu         sync.Mutex
	snap       *snapshot
	lastErr    string
	fetching   bool
	fetchDone  chan struct{}
	lastClient time.Time
	loginState string // "", "waiting", "error"
	loginErr   string
	orgIDs     []string
}

var live = &liveState{}

func gql(query string, vars map[string]any, out any) error {
	tok, err := tokens.accessToken()
	if err != nil {
		return err
	}
	body, _ := json.Marshal(map[string]any{"query": query, "variables": vars})
	do := func(tok string) (*http.Response, error) {
		req, _ := http.NewRequest("POST", cfg.graphqlURL, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")
		req.Header.Set("Authorization", "Bearer "+tok)
		req.Header.Set("graphql-client-name", "color-mapper-for-prusa")
		return httpClient.Do(req)
	}
	resp, err := do(tok)
	if err != nil {
		return err
	}
	if resp.StatusCode == 401 {
		resp.Body.Close()
		tokens.invalidateAccess()
		tok, err = tokens.accessToken()
		if err != nil {
			return err
		}
		if resp, err = do(tok); err != nil {
			return err
		}
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if resp.StatusCode != 200 {
		return errors.New(T("connectStatus", resp.Status))
	}
	var env struct {
		Data   json.RawMessage `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return errors.New(T("connectBad"))
	}
	if len(env.Errors) > 0 && len(env.Data) == 0 || (len(env.Errors) > 0 && string(env.Data) == "null") {
		return fmt.Errorf("Prusa Connect: %s", env.Errors[0].Message)
	}
	return json.Unmarshal(env.Data, out)
}

const qMe = `query { authorization { me { id organizations { id name } } } }`

const qPrinters = `query P($o: UUID!, $first: Int!) { printer { printers(organizationId: $o, first: $first, sortBy: NAME) { __typename ... on PrinterConnection { edges { node { id name state printerType fff { tools { id type materialPackageInstance { __typename ... on FFFToolMaterialPackageInstance { isFromNfc package { material { name abbreviation brand { name } primaryColor { colorRgba } } } } } } } } } } ... on ConnectError { message } } } }`

// connectTool: ein Eintrag aus fff.tools. Druckköpfe haben den Typ PRINT_HEAD und die IDs "0", "1", …;
// MMU-Slots haben den Typ FEEDER und IDs wie "0.1" (Slot des Druckkopfs 0).
type connectTool struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	MPI  *struct {
		Typename  string `json:"__typename"`
		IsFromNfc bool   `json:"isFromNfc"`
		Package   *struct {
			Material *struct {
				Name         string `json:"name"`
				Abbreviation string `json:"abbreviation"`
				Brand        *struct {
					Name string `json:"name"`
				} `json:"brand"`
				PrimaryColor *struct {
					ColorRgba string `json:"colorRgba"`
				} `json:"primaryColor"`
			} `json:"material"`
		} `json:"package"`
	} `json:"materialPackageInstance"`
}

// toolsFromConnect ordnet die Einträge so wie Prusa Connect selbst: Hat ein Druckkopf MMU-Slots,
// zählen die Slots (S1, S2, … in der Reihenfolge von Connect); sonst die Druckköpfe (Tool = ID + 1).
func toolsFromConnect(tools []connectTool) (out []ToolInfo, mmu bool) {
	info := func(t connectTool, n int) ToolInfo {
		ti := ToolInfo{T: n}
		if t.MPI != nil && t.MPI.Typename == "FFFToolMaterialPackageInstance" && t.MPI.Package != nil && t.MPI.Package.Material != nil {
			m := t.MPI.Package.Material
			ti.M, ti.N, ti.NFC = m.Abbreviation, m.Name, t.MPI.IsFromNfc
			if m.Brand != nil {
				ti.B = m.Brand.Name
			}
			if m.PrimaryColor != nil && len(m.PrimaryColor.ColorRgba) >= 7 && m.PrimaryColor.ColorRgba[0] == '#' {
				ti.C = strings.ToUpper(m.PrimaryColor.ColorRgba[:7])
			}
		}
		return ti
	}
	var heads, feeders []connectTool
	for _, t := range tools {
		if t.Type == "FEEDER" {
			feeders = append(feeders, t)
		} else {
			heads = append(heads, t)
		}
	}
	if len(feeders) > 0 {
		// Slots nach Druckkopf gruppiert, wie in Connect; Slots ohne passenden Druckkopf am Schluss
		used := make([]bool, len(feeders))
		for _, h := range heads {
			for i, f := range feeders {
				if !used[i] && strings.SplitN(f.ID, ".", 2)[0] == h.ID {
					used[i] = true
					out = append(out, info(f, len(out)+1))
				}
			}
		}
		for i, f := range feeders {
			if !used[i] {
				out = append(out, info(f, len(out)+1))
			}
		}
		return out, true
	}
	for i, h := range heads {
		n, err := strconv.Atoi(h.ID)
		if err != nil {
			n = i
		}
		out = append(out, info(h, n+1))
	}
	sort.SliceStable(out, func(a, b int) bool { return out[a].T < out[b].T })
	return out, false
}

func fetchSnapshot() (*snapshot, error) {
	live.mu.Lock()
	orgs := live.orgIDs
	live.mu.Unlock()
	if len(orgs) == 0 {
		var me struct {
			Authorization struct {
				Me struct {
					Organizations []struct {
						ID string `json:"id"`
					} `json:"organizations"`
				} `json:"me"`
			} `json:"authorization"`
		}
		if err := gql(qMe, nil, &me); err != nil {
			return nil, err
		}
		for _, o := range me.Authorization.Me.Organizations {
			orgs = append(orgs, o.ID)
		}
		if len(orgs) == 0 {
			return nil, errors.New(T("noOrg"))
		}
		live.mu.Lock()
		live.orgIDs = orgs
		live.mu.Unlock()
	}
	snap := &snapshot{UpdatedAt: time.Now()}
	for _, o := range orgs {
		var res struct {
			Printer struct {
				Printers struct {
					Typename string `json:"__typename"`
					Message  string `json:"message"`
					Edges    []struct {
						Node struct {
							ID          string `json:"id"`
							Name        string `json:"name"`
							State       string `json:"state"`
							PrinterType string `json:"printerType"`
							Fff         *struct {
								Tools []connectTool `json:"tools"`
							} `json:"fff"`
						} `json:"node"`
					} `json:"edges"`
				} `json:"printers"`
			} `json:"printer"`
		}
		if err := gql(qPrinters, map[string]any{"o": o, "first": 50}, &res); err != nil {
			return nil, err
		}
		if res.Printer.Printers.Typename == "ConnectError" {
			return nil, fmt.Errorf("Prusa Connect: %s", res.Printer.Printers.Message)
		}
		for _, e := range res.Printer.Printers.Edges {
			n := e.Node
			if n.Fff == nil || len(n.Fff.Tools) == 0 {
				continue
			}
			p := PrinterInfo{ID: n.ID, Name: n.Name, Type: n.PrinterType, State: n.State}
			p.Tools, p.MMU = toolsFromConnect(n.Fff.Tools)
			snap.Printers = append(snap.Printers, p)
		}
	}
	return snap, nil
}

// refresh holt neue Daten (höchstens ein Abruf gleichzeitig) und wartet bis maxWait.
func refresh(maxWait time.Duration) {
	live.mu.Lock()
	if !live.fetching {
		live.fetching = true
		live.fetchDone = make(chan struct{})
		go func(done chan struct{}) {
			snap, err := fetchSnapshot()
			live.mu.Lock()
			if err != nil {
				logf("Fetching from Prusa Connect failed: %v", err)
				if errors.Is(err, errNotConnected) {
					live.lastErr = ""
					live.snap = nil
					live.orgIDs = nil
				} else {
					live.lastErr = err.Error()
				}
			} else {
				live.snap = snap
				live.lastErr = ""
			}
			live.fetching = false
			live.mu.Unlock()
			close(done)
		}(live.fetchDone)
	}
	done := live.fetchDone
	live.mu.Unlock()
	if maxWait > 0 {
		select {
		case <-done:
		case <-time.After(maxWait):
		}
	}
}

func poller() {
	t := time.NewTicker(30 * time.Second)
	for range t.C {
		live.mu.Lock()
		active := time.Since(live.lastClient) < 3*time.Minute
		fresh := live.snap != nil && time.Since(live.snap.UpdatedAt) < 25*time.Second
		live.mu.Unlock()
		if active && !fresh && tokens.hasLogin() {
			refresh(0)
		}
	}
}

// ---------------------------------------------------------------- HTTP

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}

func guard(next http.HandlerFunc) http.HandlerFunc {
	_, port, _ := net.SplitHostPort(cfg.listen)
	allowed := map[string]bool{"127.0.0.1:" + port: true, "localhost:" + port: true}
	return func(w http.ResponseWriter, r *http.Request) {
		if !allowed[r.Host] {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		setUILang(r.Header.Get("X-Lang"))
		if r.Method == http.MethodPost && r.Header.Get("X-INDX") != "1" {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next(w, r)
	}
}

func statusPayload() map[string]any {
	live.mu.Lock()
	defer live.mu.Unlock()
	st := map[string]any{
		"app": "indx-bridge", "version": version,
		"connected":  tokens.hasLogin(),
		"login":      live.loginState,
		"loginError": live.loginErr,
		"error":      live.lastErr,
		"spooly":     spooly.connected(),
	}
	if live.snap != nil {
		st["updatedAt"] = live.snap.UpdatedAt
	}
	return st
}

var loginMu sync.Mutex

func startServer(ln net.Listener) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", guard(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && r.URL.Path != "/index.html" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(pageHTML)
	}))
	mux.HandleFunc("/api/ping", guard(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"app": "indx-bridge", "version": version})
	}))
	mux.HandleFunc("/api/status", guard(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, statusPayload())
	}))
	mux.HandleFunc("/api/tools", guard(func(w http.ResponseWriter, r *http.Request) {
		live.mu.Lock()
		live.lastClient = time.Now()
		stale := live.snap == nil || time.Since(live.snap.UpdatedAt) > 20*time.Second
		live.mu.Unlock()
		if !tokens.hasLogin() {
			writeJSON(w, map[string]any{"connected": false})
			return
		}
		if stale {
			refresh(10 * time.Second)
		}
		live.mu.Lock()
		defer live.mu.Unlock()
		out := map[string]any{"connected": tokens.hasLogin(), "error": live.lastErr}
		if live.snap != nil {
			out["printers"] = live.snap.Printers
			out["updatedAt"] = live.snap.UpdatedAt
		}
		writeJSON(w, out)
	}))
	mux.HandleFunc("/api/login", guard(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST", http.StatusMethodNotAllowed)
			return
		}
		if !loginMu.TryLock() {
			writeJSON(w, map[string]any{"started": false, "reason": "already running"})
			return
		}
		live.mu.Lock()
		live.loginState, live.loginErr = "waiting", ""
		live.mu.Unlock()
		go func() {
			defer loginMu.Unlock()
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
			defer cancel()
			log.Println("Prusa Connect sign-in window opened …")
			err := login(ctx)
			live.mu.Lock()
			if err != nil {
				live.loginState, live.loginErr = "error", err.Error()
				live.mu.Unlock()
				log.Println("Sign-in failed:", err)
				return
			}
			live.loginState, live.loginErr = "", ""
			live.orgIDs = nil
			live.snap = nil
			live.mu.Unlock()
			log.Println("Connected to Prusa Connect.")
			refresh(0)
		}()
		writeJSON(w, map[string]any{"started": true})
	}))
	mux.HandleFunc("/api/log", guard(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"version": version, "lines": memLog.snapshot()})
	}))
	mux.HandleFunc("/api/shutdown", guard(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, map[string]any{"ok": true})
		logf("Being replaced by a newer version.")
		go func() { time.Sleep(300 * time.Millisecond); os.Exit(0) }()
	}))
	mux.HandleFunc("/api/logout", guard(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST", http.StatusMethodNotAllowed)
			return
		}
		tokens.clear()
		live.mu.Lock()
		live.snap, live.orgIDs, live.lastErr = nil, nil, ""
		live.mu.Unlock()
		log.Println("Disconnected from Prusa Connect.")
		writeJSON(w, map[string]any{"ok": true})
	}))
	registerSpooly(mux)
	registerOpt(mux)
	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	log.Fatal(srv.Serve(ln))
}

func main() {
	log.SetFlags(log.Ltime)
	setConsoleTitle("Color Mapper for Prusa")
	base, err := os.UserConfigDir()
	if err != nil {
		base = "."
	}
	cfg = config{
		accountURL:  env("INDX_ACCOUNT_URL", "https://account.prusa3d.com"),
		graphqlURL:  env("INDX_GRAPHQL_URL", "https://connect-api.prusa3d.com/graphql"),
		clientID:    env("INDX_CLIENT_ID", "MRHTlZhZqkNrrQ6FUPtjyusAz8nc59ErHXP8XkS4"),
		redirectURI: env("INDX_REDIRECT_URI", "https://connect.prusa3d.com/login/auth-callback"),
		scope:       env("INDX_SCOPE", "basic_info user_operations email_lists openid connect employee"),
		listen:      env("INDX_LISTEN", "127.0.0.1:8765"),
		dataDir:     env("INDX_DATA_DIR", dataDirFor(base)),
		noOpen:      os.Getenv("INDX_NO_OPEN") == "1",
	}
	_ = os.MkdirAll(cfg.dataDir, 0o700)
	initLang(cfg.dataDir)
	if f, err := os.OpenFile(filepath.Join(cfg.dataDir, "bridge.log"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600); err == nil {
		logFile = f
		log.SetOutput(io.MultiWriter(os.Stderr, f, memLog))
	} else {
		log.SetOutput(io.MultiWriter(os.Stderr, memLog))
	}
	logf("Color Mapper for Prusa %s started (%s)", version, runtimeInfo())
	uiURL := "http://" + cfg.listen + "/"

	fmt.Println(C("banner", version))
	fmt.Println("----------------------------------------------------------------------")

	ln, err := net.Listen("tcp", cfg.listen)
	if err != nil {
		running := pingVersion(uiURL)
		switch {
		case running == version:
			fmt.Println(C("already"))
			if !cfg.noOpen {
				openBrowser(uiURL)
			}
			time.Sleep(1500 * time.Millisecond)
			return
		case running != "":
			fmt.Println(C("replace", running))
			req, _ := http.NewRequest("POST", uiURL+"api/shutdown", nil)
			req.Header.Set("X-INDX", "1")
			if resp, e := (&http.Client{Timeout: 2 * time.Second}).Do(req); e == nil {
				resp.Body.Close()
			}
			for i := 0; i < 1200 && err != nil; i++ {
				time.Sleep(100 * time.Millisecond)
				ln, err = net.Listen("tcp", cfg.listen)
				if err != nil && i == 30 {
					fmt.Println(C("closeOld"))
				}
			}
		}
		if err != nil {
			fmt.Println(C("portBusy", cfg.listen, err))
			waitForEnter()
			os.Exit(1)
		}
	}

	tokens.load()
	spooly.load()
	if tokens.hasLogin() {
		fmt.Println(C("stored"))
		go refresh(0)
	} else {
		fmt.Println(C("notYet"))
	}
	go poller()
	go spoolyPoller()
	fmt.Println(C("url", uiURL))
	fmt.Println(C("keepOpen"))
	fmt.Println()
	if !cfg.noOpen {
		go func() { time.Sleep(300 * time.Millisecond); openBrowser(uiURL) }()
	}
	startServer(ln)
}

func pingVersion(uiURL string) string {
	resp, err := (&http.Client{Timeout: 2 * time.Second}).Get(uiURL + "api/ping")
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	var p struct {
		App     string `json:"app"`
		Version string `json:"version"`
	}
	if json.NewDecoder(resp.Body).Decode(&p) != nil || p.App != "indx-bridge" {
		return ""
	}
	if p.Version == "" {
		return "?"
	}
	return p.Version
}

func waitForEnter() {
	fmt.Print(C("enter"))
	_, _ = fmt.Scanln()
}

// dataDirFor: Datenordner. Ältere Versionen nutzten «INDX-Bridge» bzw. «ColorMapperBridge» –
// deren Ordner (mit der gespeicherten Anmeldung) wird übernommen.
func dataDirFor(base string) string {
	dir := filepath.Join(base, "ColorMapperForPrusa")
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		return dir
	}
	for _, name := range []string{"ColorMapperBridge", "INDX-Bridge"} {
		old := filepath.Join(base, name)
		if _, err := os.Stat(old); err == nil {
			if os.Rename(old, dir) != nil {
				return old // z. B. noch von einem offenen Anmeldefenster belegt
			}
			return dir
		}
	}
	return dir
}
