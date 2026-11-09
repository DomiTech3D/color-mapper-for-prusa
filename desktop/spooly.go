// Color Mapper for Prusa – Copyright (C) 2026 DomiTech3D
// SPDX-License-Identifier: GPL-3.0-only – additional terms (attribution) in NOTICE.md

package main

// Anbindung an Spooly (spooly.eu): öffentliche REST-API mit persönlichem Schlüssel (Bearer spk_…).
// Der Schlüssel wird einmal in der Seite eingegeben, hier verschlüsselt gespeichert und nie
// an die Seite zurückgegeben oder protokolliert. Schreibend nur auf ausdrücklichen Klick in der
// Seite: eine Spule einem Slot zuordnen oder einen Slot leeren (PUT/DELETE /slots/{id}).

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// SpoolInfo: eine Spule aus dem Spooly-Lager (für Vorschläge in der Seite).
type SpoolInfo struct {
	ID       string  `json:"id"`
	Number   int     `json:"no,omitempty"`
	Title    string  `json:"title"`
	Brand    string  `json:"brand,omitempty"`
	Material string  `json:"m,omitempty"`
	Color    string  `json:"c,omitempty"`
	Grams    float64 `json:"g"`
	HasGrams bool    `json:"hasG"`
	Fill     string  `json:"fill,omitempty"` // "low", "crit" oder leer
	Location string  `json:"loc,omitempty"`
}

type spoolySnap struct {
	Printers  []PrinterInfo     `json:"printers"`
	Spools    []SpoolInfo       `json:"spools"`
	UpdatedAt time.Time         `json:"updatedAt"`
	slotIDs   map[string]string // "printerID#tool" → slot_id in Spooly
}

func slotKey(printerID string, tool int) string { return printerID + "#" + strconv.Itoa(tool) }

type spoolyState struct {
	mu        sync.Mutex
	key       string
	keyName   string
	account   string
	snap      *spoolySnap
	spoolsAt  time.Time
	spools    []SpoolInfo
	lastErr   string
	fetching  sync.Mutex
	lastAsked time.Time
	lastDiag  string
}

var spooly = &spoolyState{}

func spoolyBase() string {
	return strings.TrimRight(env("INDX_SPOOLY_URL", "https://spooly.eu/api/v1"), "/")
}
func spoolyFile() string { return filepath.Join(cfg.dataDir, "spooly-key.bin") }

var errSpoolyKey = errors.New("invalid_key")

type spoolyError struct {
	Status  int
	Code    string
	Message string
}

func (e *spoolyError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return fmt.Sprintf("Spooly: HTTP %d", e.Status)
}

// spoolyGet ruft einen Endpunkt mit dem gegebenen Schlüssel ab.
func spoolyGet(key, path string, out any) error { return spoolyDo(key, "GET", path, nil, out) }

// spoolyDo führt einen Aufruf aus; schreibende Aufrufe bekommen einen Idempotency-Key.
func spoolyDo(key, method, path string, in, out any) error {
	var rd io.Reader
	if in != nil {
		b, err := json.Marshal(in)
		if err != nil {
			return err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, spoolyBase()+path, rd)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "ColorMapperForPrusa/"+version)
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if method != "GET" {
		var r [16]byte
		_, _ = rand.Read(r[:])
		req.Header.Set("Idempotency-Key", "cm-"+hex.EncodeToString(r[:]))
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if resp.StatusCode != http.StatusOK {
		se := &spoolyError{Status: resp.StatusCode}
		var e struct {
			Detail json.RawMessage `json:"detail"`
		}
		if json.Unmarshal(body, &e) == nil && len(e.Detail) > 0 {
			var d struct{ Code, Message string }
			var txt string
			if json.Unmarshal(e.Detail, &d) == nil {
				se.Code, se.Message = d.Code, d.Message
			} else if json.Unmarshal(e.Detail, &txt) == nil {
				se.Message = txt
			}
		}
		return se
	}
	if out == nil || len(bytes.TrimSpace(body)) == 0 {
		return nil
	}
	return json.Unmarshal(body, out)
}

// spoolyMessage übersetzt Fehler von Spooly in einen Satz für die Seite.
func spoolyMessage(err error) string {
	var se *spoolyError
	if errors.As(err, &se) {
		switch {
		case se.Status == http.StatusUnauthorized || se.Code == "invalid_key":
			return T("spoolyBadKey")
		case se.Status == http.StatusTooManyRequests:
			return T("spoolyLimit")
		case se.Status == http.StatusForbidden:
			if se.Message != "" {
				return T("spoolySays", se.Message)
			}
			return T("spoolyNoAccess")
		}
		if se.Message != "" {
			return T("spoolySays", se.Message)
		}
		return T("spoolyStatus", se.Status)
	}
	return T("spoolyUnreachable", err)
}

func (s *spoolyState) load() {
	b, err := os.ReadFile(spoolyFile())
	if err != nil {
		return
	}
	plain, err := unprotect(b)
	if err != nil {
		log.Println("Spooly: saved key could not be read")
		return
	}
	s.mu.Lock()
	s.key = strings.TrimSpace(string(plain))
	s.mu.Unlock()
}

func (s *spoolyState) connected() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.key != ""
}

// connect prüft den Schlüssel mit GET /me und speichert ihn verschlüsselt.
func (s *spoolyState) connect(key string) (map[string]any, error) {
	key = strings.TrimSpace(key)
	if !strings.HasPrefix(key, "spk_") || len(key) < 8 || strings.ContainsAny(key, " \t\r\n") {
		return nil, errors.New(T("spoolyKeyFormat"))
	}
	var me struct {
		Account    string `json:"account"`
		KeyName    string `json:"key_name"`
		CallsToday int    `json:"calls_today"`
		DailyLimit int    `json:"daily_limit"`
	}
	if err := spoolyGet(key, "/me", &me); err != nil {
		return nil, errors.New(spoolyMessage(err))
	}
	enc, err := protect([]byte(key))
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(spoolyFile(), enc, 0o600); err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.key, s.keyName, s.account = key, me.KeyName, me.Account
	s.snap, s.spools, s.spoolsAt, s.lastErr = nil, nil, time.Time{}, ""
	s.mu.Unlock()
	log.Printf("Spooly: connected (key %q, %s account)", me.KeyName, me.Account)
	return map[string]any{"ok": true, "keyName": me.KeyName, "account": me.Account}, nil
}

func (s *spoolyState) disconnect() {
	s.mu.Lock()
	s.key, s.keyName, s.account = "", "", ""
	s.snap, s.spools, s.spoolsAt, s.lastErr = nil, nil, time.Time{}, ""
	s.mu.Unlock()
	_ = os.Remove(spoolyFile())
	log.Println("Spooly: disconnected, key deleted.")
}

var slotRe = regexp.MustCompile(`^(\d+)-(\d+)$`)

type spoolySlot struct {
	Printer string  `json:"printer"`
	Slot    string  `json:"slot"`
	SlotID  *string `json:"slot_id"`
	Spool   *struct {
		ID       string  `json:"id"`
		Number   *int    `json:"number"`
		Title    string  `json:"title"`
		Material *string `json:"material"`
		ColorHex *string `json:"color_hex"`
	} `json:"spool"`
}

type spoolyPrinter struct {
	ID     string  `json:"printer_id"`
	Name   *string `json:"name"`
	Vendor string  `json:"vendor"`
	Model  *string `json:"model"`
	State  string  `json:"state"`
}

type spoolySpool struct {
	ID           string   `json:"id"`
	Number       *int     `json:"number"`
	Title        string   `json:"title"`
	Manufacturer *string  `json:"manufacturer"`
	Material     *string  `json:"material"`
	ColorHex     *string  `json:"color_hex"`
	Remaining    *float64 `json:"remaining_grams"`
	FillLevel    *string  `json:"fill_level"`
	Location     *string  `json:"location"`
	Archived     bool     `json:"archived"`
}

func str(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func normColor(c string) string {
	c = strings.TrimSpace(c)
	if len(c) >= 7 && c[0] == '#' {
		return strings.ToUpper(c[:7])
	}
	return ""
}

// slotTool: "1-3" → Tool 3. Bei mehreren Einheiten (z. B. mehrere Bambu-AMS) fortlaufend zu je 4.
// Andere Slots (z. B. "EXT") zählen nicht.
func slotTool(slot string, units int) int {
	m := slotRe.FindStringSubmatch(strings.TrimSpace(slot))
	if m == nil {
		return 0
	}
	u, _ := strconv.Atoi(m[1])
	i, _ := strconv.Atoi(m[2])
	if u < 1 || i < 1 {
		return 0
	}
	if units > 1 {
		return (u-1)*4 + i
	}
	return i
}

// printersFromSpooly baut aus Druckern, Slots und Spulen die Drucker mit ihren Tools (nur Prusa).
func printersFromSpooly(printers []spoolyPrinter, slots []spoolySlot, spools map[string]SpoolInfo) ([]PrinterInfo, map[string]string) {
	ids := map[string]string{}
	byName := map[string][]spoolySlot{}
	for _, sl := range slots {
		byName[sl.Printer] = append(byName[sl.Printer], sl)
	}
	var out []PrinterInfo
	for _, p := range printers {
		if !strings.EqualFold(p.Vendor, "prusa") {
			continue
		}
		name := str(p.Name)
		model := str(p.Model)
		units := map[string]bool{}
		for _, sl := range byName[name] {
			if m := slotRe.FindStringSubmatch(sl.Slot); m != nil {
				units[m[1]] = true
			}
		}
		pi := PrinterInfo{ID: "spooly:" + p.ID, Name: name, Model: model, State: p.State,
			MMU: strings.Contains(strings.ToUpper(model), "MMU")}
		maxT := 0
		tools := map[int]ToolInfo{}
		for _, sl := range byName[name] {
			t := slotTool(sl.Slot, len(units))
			if t == 0 {
				continue
			}
			ti := ToolInfo{T: t, Listed: true}
			if id := str(sl.SlotID); id != "" {
				ti.Slot = true
				ids[slotKey(pi.ID, t)] = id
			}
			if sl.Spool != nil {
				ti.Spid = sl.Spool.ID
				ti.M, ti.N, ti.C = str(sl.Spool.Material), sl.Spool.Title, normColor(str(sl.Spool.ColorHex))
				if sl.Spool.Number != nil {
					ti.No = *sl.Spool.Number
				}
				if sp, ok := spools[sl.Spool.ID]; ok {
					ti.B, ti.Fill, ti.Loc = sp.Brand, sp.Fill, sp.Location
					if sp.HasGrams {
						g := sp.Grams
						ti.G = &g
					}
				}
			}
			tools[t] = ti
			if t > maxT {
				maxT = t
			}
		}
		for t := 1; t <= maxT; t++ {
			if ti, ok := tools[t]; ok {
				pi.Tools = append(pi.Tools, ti)
			} else {
				pi.Tools = append(pi.Tools, ToolInfo{T: t}) // Slot ohne Eintrag in Spooly
			}
		}
		out = append(out, pi)
	}
	sort.SliceStable(out, func(a, b int) bool { return strings.ToLower(out[a].Name) < strings.ToLower(out[b].Name) })
	return out, ids
}

func spoolsFromSpooly(list []spoolySpool) []SpoolInfo {
	var out []SpoolInfo
	for _, s := range list {
		if s.Archived {
			continue
		}
		si := SpoolInfo{ID: s.ID, Title: s.Title, Brand: str(s.Manufacturer), Material: str(s.Material),
			Color: normColor(str(s.ColorHex)), Fill: str(s.FillLevel), Location: str(s.Location)}
		if s.Number != nil {
			si.Number = *s.Number
		}
		if s.Remaining != nil {
			si.Grams, si.HasGrams = *s.Remaining, true
		}
		out = append(out, si)
	}
	return out
}

// slotDiag beschreibt pro Drucker, welche Tools Spooly zum Zuordnen anbietet.
func slotDiag(ps []PrinterInfo) string {
	var b strings.Builder
	for _, p := range ps {
		var ok, noID, missing []string
		for _, t := range p.Tools {
			tn := "T" + strconv.Itoa(t.T)
			if p.MMU {
				tn = "S" + strconv.Itoa(t.T)
			}
			switch {
			case t.Slot:
				ok = append(ok, tn)
			case t.Listed:
				noID = append(noID, tn)
			default:
				missing = append(missing, tn)
			}
		}
		dash := func(l []string) string {
			if len(l) == 0 {
				return "–"
			}
			return strings.Join(l, ", ")
		}
		b.WriteString(T("spoolySlotDiag", p.Name, dash(ok), dash(noID), dash(missing)) + "\n")
	}
	return b.String()
}

// fetch holt Drucker und Slots; das Lager nur alle 5 Minuten (schont das Tageslimit).
func (s *spoolyState) fetch(force bool) {
	s.fetching.Lock()
	defer s.fetching.Unlock()
	s.mu.Lock()
	key := s.key
	needSpools := force || s.spools == nil || time.Since(s.spoolsAt) > 5*time.Minute
	spoolList := s.spools
	s.mu.Unlock()
	if key == "" {
		return
	}
	fail := func(err error) {
		msg := spoolyMessage(err)
		s.mu.Lock()
		s.lastErr = msg
		s.mu.Unlock()
		log.Println("Spooly: fetch failed:", msg)
	}
	if needSpools {
		var all []spoolySpool
		for offset := 0; offset < 5000; offset += 500 {
			var page struct {
				Items []spoolySpool `json:"items"`
				Total int           `json:"total"`
			}
			if err := spoolyGet(key, fmt.Sprintf("/spools?limit=500&offset=%d", offset), &page); err != nil {
				fail(err)
				return
			}
			all = append(all, page.Items...)
			if len(page.Items) == 0 || offset+len(page.Items) >= page.Total {
				break
			}
		}
		spoolList = spoolsFromSpooly(all)
	}
	var printers struct {
		Items []spoolyPrinter `json:"items"`
	}
	if err := spoolyGet(key, "/printers", &printers); err != nil {
		fail(err)
		return
	}
	var slots struct {
		Items []spoolySlot `json:"items"`
	}
	if err := spoolyGet(key, "/slots", &slots); err != nil {
		fail(err)
		return
	}
	byID := map[string]SpoolInfo{}
	for _, sp := range spoolList {
		byID[sp.ID] = sp
	}
	ps, ids := printersFromSpooly(printers.Items, slots.Items, byID)
	snap := &spoolySnap{Printers: ps, Spools: spoolList, UpdatedAt: time.Now().UTC(), slotIDs: ids}
	// Im Protokoll festhalten, welche Slots Spooly zum Zuordnen anbietet (nur bei Änderung)
	diag := slotDiag(ps)
	s.mu.Lock()
	if diag != s.lastDiag {
		s.lastDiag = diag
		for _, line := range strings.Split(diag, "\n") {
			if line != "" {
				log.Println("Spooly:", line)
			}
		}
	}
	if s.key == key { // nicht überschreiben, wenn inzwischen getrennt
		s.snap, s.lastErr = snap, ""
		if needSpools {
			s.spools, s.spoolsAt = spoolList, time.Now()
		}
	}
	s.mu.Unlock()
}

// spoolyPoller aktualisiert jede Minute, solange die Seite in den letzten 3 Minuten gefragt hat.
func spoolyPoller() {
	for {
		time.Sleep(60 * time.Second)
		s := spooly
		s.mu.Lock()
		active := s.key != "" && time.Since(s.lastAsked) < 3*time.Minute
		s.mu.Unlock()
		if active {
			s.fetch(false)
		}
	}
}

// setSlot ordnet eine Spule einem Tool zu (spoolID) oder leert den Slot (spoolID leer).
// Nur auf ausdrücklichen Klick in der Seite.
func (s *spoolyState) setSlot(printerID string, tool int, spoolID string, confirm bool) map[string]any {
	s.mu.Lock()
	key := s.key
	var slotID, pname, title string
	if s.snap != nil {
		slotID = s.snap.slotIDs[slotKey(printerID, tool)]
		for _, p := range s.snap.Printers {
			if p.ID == printerID {
				pname = p.Name
			}
		}
		for _, sp := range s.snap.Spools {
			if sp.ID == spoolID {
				title = sp.Title
				if sp.Number > 0 {
					title = "#" + strconv.Itoa(sp.Number) + " " + sp.Title
				}
			}
		}
	}
	s.mu.Unlock()
	if key == "" {
		return map[string]any{"ok": false, "error": T("spoolyNotConnected")}
	}
	if slotID == "" {
		return map[string]any{"ok": false, "error": T("spoolyNoSlot")}
	}
	if spoolID != "" && title == "" {
		title = spoolID
	}
	where := fmt.Sprintf("%s T%d", pname, tool)
	var err error
	if spoolID == "" {
		err = spoolyDo(key, "DELETE", "/slots/"+slotID, nil, nil)
	} else {
		err = spoolyDo(key, "PUT", "/slots/"+slotID, map[string]any{"spool_id": spoolID, "confirm_color": confirm}, nil)
	}
	if err != nil {
		var se *spoolyError
		if errors.As(err, &se) {
			if se.Status == http.StatusConflict && se.Code == "andere_farbe" {
				return map[string]any{"ok": false, "needConfirm": true, "error": T("spoolyColorDiffers")}
			}
			if se.Status == http.StatusForbidden {
				msg := T("spoolyNoWrite")
				if se.Message != "" {
					msg += " (" + se.Message + ")"
				}
				log.Printf("Spooly: changing slot %s refused: %s", where, msg)
				return map[string]any{"ok": false, "error": msg}
			}
		}
		msg := spoolyMessage(err)
		log.Printf("Spooly: changing slot %s failed: %s", where, msg)
		return map[string]any{"ok": false, "error": msg}
	}
	var msg string
	if spoolID == "" {
		msg = T("spoolyCleared", where)
	} else {
		msg = T("spoolyAssigned", title, where)
	}
	log.Println("Spooly:", msg)
	s.fetch(false) // Slots sofort neu lesen
	return map[string]any{"ok": true, "message": msg}
}

func registerSpooly(mux *http.ServeMux) {
	mux.HandleFunc("/api/spooly", guard(func(w http.ResponseWriter, r *http.Request) {
		s := spooly
		s.mu.Lock()
		s.lastAsked = time.Now()
		connected := s.key != ""
		stale := s.snap == nil || time.Since(s.snap.UpdatedAt) > 55*time.Second
		s.mu.Unlock()
		if !connected {
			writeJSON(w, map[string]any{"connected": false})
			return
		}
		if stale || r.URL.Query().Get("refresh") == "1" {
			s.fetch(r.URL.Query().Get("refresh") == "1")
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		out := map[string]any{"connected": s.key != "", "error": s.lastErr, "keyName": s.keyName}
		if s.snap != nil {
			out["printers"] = s.snap.Printers
			out["spools"] = s.snap.Spools
			out["updatedAt"] = s.snap.UpdatedAt
		}
		writeJSON(w, out)
	}))
	mux.HandleFunc("/api/spooly/connect", guard(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST", http.StatusMethodNotAllowed)
			return
		}
		var in struct {
			Key string `json:"key"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&in); err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": T("spoolyKeyFormat")})
			return
		}
		res, err := spooly.connect(in.Key)
		if err != nil {
			log.Println("Spooly: connecting failed:", err)
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		go spooly.fetch(true)
		writeJSON(w, res)
	}))
	mux.HandleFunc("/api/spooly/slot", guard(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST", http.StatusMethodNotAllowed)
			return
		}
		var in struct {
			PrinterID    string `json:"printerId"`
			Tool         int    `json:"tool"`
			SpoolID      string `json:"spoolId"`
			Clear        bool   `json:"clear"`
			ConfirmColor bool   `json:"confirmColor"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&in); err != nil || in.Tool < 1 || in.Tool > 64 ||
			!strings.HasPrefix(in.PrinterID, "spooly:") || (in.SpoolID == "") != in.Clear || len(in.SpoolID) > 200 {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		writeJSON(w, spooly.setSlot(in.PrinterID, in.Tool, in.SpoolID, in.ConfirmColor))
	}))
	mux.HandleFunc("/api/spooly/disconnect", guard(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST", http.StatusMethodNotAllowed)
			return
		}
		spooly.disconnect()
		writeJSON(w, map[string]any{"ok": true})
	}))
}
