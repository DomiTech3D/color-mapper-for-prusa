// Color Mapper for Prusa – Copyright (C) 2026 DomiTech3D
// SPDX-License-Identifier: GPL-3.0-only – additional terms (attribution) in NOTICE.md

package main

// Anmeldung bei Prusa Connect: OAuth 2 (Authorization Code + PKCE) wie die Connect-Webseite.
// Ein eigenes Browserfenster (Edge/Chrome) zeigt die Prusa-Anmeldung. Über das DevTools-Protokoll
// fangen wir die Rückleitung auf connect.prusa3d.com/login/auth-callback ab, bevor die Seite lädt,
// und lesen den Code aus der Adresse. Passwörter sieht dieses Programm nie.

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

func b64url(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func randomString(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b64url(b)
}

type pkce struct{ verifier, challenge, state string }

func newPKCE() pkce {
	v := randomString(64)
	h := sha256.Sum256([]byte(v))
	return pkce{verifier: v, challenge: b64url(h[:]), state: randomString(24)}
}

func authorizeURL(p pkce) string {
	q := url.Values{}
	q.Set("response_type", "code")
	q.Set("client_id", cfg.clientID)
	q.Set("code_challenge_method", "S256")
	q.Set("code_challenge", p.challenge)
	q.Set("redirect_uri", cfg.redirectURI)
	q.Set("scope", cfg.scope)
	q.Set("state", p.state)
	return strings.TrimRight(cfg.accountURL, "/") + "/o/authorize/?" + q.Encode()
}

// --- CDP -----------------------------------------------------------------
//
// Wir verbinden uns mit dem ganzen Browser (nicht nur mit einem Tab). So überstehen wir,
// dass Edge den Startprozess an einen anderen Prozess übergibt, dass Tabs beim Seitenwechsel
// ausgetauscht werden und dass die Anmeldung in einem Popup weiterläuft.

type cdpMsg struct {
	ID        int             `json:"id,omitempty"`
	SessionID string          `json:"sessionId,omitempty"`
	Method    string          `json:"method,omitempty"`
	Params    json.RawMessage `json:"params,omitempty"`
	Result    json.RawMessage `json:"result,omitempty"`
	Error     *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

type cdpClient struct {
	ws      *wsConn
	mu      sync.Mutex
	nextID  int
	pending map[int]chan cdpMsg
	events  chan cdpMsg
	closed  chan struct{}
}

func newCDP(ws *wsConn) *cdpClient {
	c := &cdpClient{ws: ws, pending: map[int]chan cdpMsg{}, events: make(chan cdpMsg, 256), closed: make(chan struct{})}
	go func() {
		defer close(c.closed)
		for {
			raw, err := ws.ReadMessage()
			if err != nil {
				return
			}
			var m cdpMsg
			if json.Unmarshal(raw, &m) != nil {
				continue
			}
			if m.ID != 0 {
				c.mu.Lock()
				ch := c.pending[m.ID]
				delete(c.pending, m.ID)
				c.mu.Unlock()
				if ch != nil {
					ch <- m
				}
				continue
			}
			select {
			case c.events <- m:
			default: // Ereignisse verwerfen, falls niemand liest
			}
		}
	}()
	return c
}

func (c *cdpClient) call(sessionID, method string, params any) (json.RawMessage, error) {
	c.mu.Lock()
	c.nextID++
	id := c.nextID
	ch := make(chan cdpMsg, 1)
	c.pending[id] = ch
	c.mu.Unlock()
	if params == nil {
		params = map[string]any{}
	}
	msg := map[string]any{"id": id, "method": method, "params": params}
	if sessionID != "" {
		msg["sessionId"] = sessionID
	}
	b, _ := json.Marshal(msg)
	if err := c.ws.WriteText(b); err != nil {
		return nil, err
	}
	select {
	case m := <-ch:
		if m.Error != nil {
			return nil, fmt.Errorf("%s: %s", method, m.Error.Message)
		}
		return m.Result, nil
	case <-c.closed:
		return nil, errors.New(T("browserGone"))
	case <-time.After(15 * time.Second):
		return nil, fmt.Errorf("%s: no response", method)
	}
}

var chromiumExes = map[string]bool{"brave.exe": true, "chrome.exe": true, "msedge.exe": true, "vivaldi.exe": true, "chromium.exe": true,
	"brave": true, "chrome": true, "chromium": true, "google-chrome": true, "microsoft-edge": true, "brave-browser": true}

// findBrowser wählt den Browser für das Anmeldefenster: Standardbrowser, falls Chromium-basiert
// (Brave, Chrome, Edge, Vivaldi), sonst Edge oder Chrome.
func findBrowser() (string, error) {
	if p := os.Getenv("INDX_BROWSER"); p != "" {
		return p, nil
	}
	if p := defaultBrowserExe(); p != "" {
		if chromiumExes[strings.ToLower(filepath.Base(p))] {
			if st, err := os.Stat(p); err == nil && !st.IsDir() {
				return p, nil
			}
		}
		logf("Login: default browser %s is not suitable for signing in, using Edge/Chrome", filepath.Base(p))
	}
	for _, p := range browserCandidates() {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p, nil
		}
	}
	return "", errors.New(T("noBrowser"))
}

func readDevToolsPort(dir string, deadline time.Time) (int, string, error) {
	f := filepath.Join(dir, "DevToolsActivePort")
	for first := true; first || time.Now().Before(deadline); first = false {
		b, err := os.ReadFile(f)
		if err == nil {
			lines := strings.Split(strings.ReplaceAll(strings.TrimSpace(string(b)), "\r", ""), "\n")
			if port, err := strconv.Atoi(strings.TrimSpace(lines[0])); err == nil && port > 0 {
				path := ""
				if len(lines) > 1 {
					path = strings.TrimSpace(lines[1])
				}
				return port, path, nil
			}
		}
		time.Sleep(150 * time.Millisecond)
	}
	return 0, "", errors.New(T("noDevtools"))
}

func browserWebSocket(port int, path string) (string, error) {
	if path != "" {
		return fmt.Sprintf("ws://127.0.0.1:%d%s", port, path), nil
	}
	var lastErr error
	for i := 0; i < 40; i++ {
		resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/json/version", port))
		if err == nil {
			var v struct {
				WS string `json:"webSocketDebuggerUrl"`
			}
			err = json.NewDecoder(resp.Body).Decode(&v)
			resp.Body.Close()
			if err == nil && v.WS != "" {
				return v.WS, nil
			}
		}
		lastErr = err
		time.Sleep(200 * time.Millisecond)
	}
	return "", errors.New(T("browserUnreachable", lastErr))
}

func browserAlive(port int) bool {
	resp, err := (&http.Client{Timeout: 1500 * time.Millisecond}).Get(fmt.Sprintf("http://127.0.0.1:%d/json/version", port))
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == 200
}

type targetInfo struct {
	TargetID string `json:"targetId"`
	Type     string `json:"type"`
	URL      string `json:"url"`
}

func stripQuery(u string) string { return strings.SplitN(u, "?", 2)[0] }

// matchesState prüft, ob eine Rückleitung zu genau dieser Anmeldung gehört (nicht zu einer alten).
func matchesState(raw, state string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Query().Get("state") == state
}

// runLoginBrowser öffnet das Anmeldefenster und liefert die Rückleitungs-Adresse mit dem Code.
// errReuseFailed: der noch laufende Anmeldebrowser liess sich nicht übernehmen (z. B. gerade am Schliessen)
var errReuseFailed = errors.New("reusing the running sign-in browser failed")

func runLoginBrowser(ctx context.Context, authURL, state string) (string, error) {
	code, err := runLoginBrowserOnce(ctx, authURL, state, true)
	if errors.Is(err, errReuseFailed) {
		logf("Login: running sign-in browser not usable – starting a new one")
		time.Sleep(time.Second) // dem alten Browser Zeit zum Beenden geben
		code, err = runLoginBrowserOnce(ctx, authURL, state, false)
	}
	return code, err
}

func runLoginBrowserOnce(ctx context.Context, authURL, state string, allowReuse bool) (string, error) {
	exe, err := findBrowser()
	if err != nil {
		return "", err
	}
	name := strings.TrimSuffix(strings.ToLower(filepath.Base(exe)), ".exe")
	dir := filepath.Join(cfg.dataDir, "login-"+name)
	_ = os.MkdirAll(dir, 0o700)

	// 1) Läuft vom letzten Mal noch ein Anmeldebrowser mit diesem Profil (z. B. Brave/Edge im
	//    Hintergrund)? Dann übernehmen wir ihn, statt einen zweiten zu starten.
	reused := false
	port, wsPath := 0, ""
	if p, path, err := readDevToolsPort(dir, time.Now()); allowReuse && err == nil && browserAlive(p) {
		port, wsPath, reused = p, path, true
		logf("Login: sign-in browser still running (port %d), reusing it", p)
	}
	launch := func(dir string) (int, string, error) {
		_ = os.Remove(filepath.Join(dir, "DevToolsActivePort"))
		args := []string{
			"--remote-debugging-port=0",
			"--user-data-dir=" + dir,
			"--no-first-run", "--no-default-browser-check", "--disable-default-apps",
			"--window-size=560,820",
			"--app=about:blank",
		}
		if extra := strings.TrimSpace(os.Getenv("INDX_BROWSER_ARGS")); extra != "" {
			args = append(strings.Fields(extra), args...)
		}
		logf("Login: starting browser %s (profile %s)", exe, filepath.Base(dir))
		cmd := exec.Command(exe, args...)
		if err := cmd.Start(); err != nil {
			return 0, "", errors.New(T("browserStart", err))
		}
		go func() {
			err := cmd.Wait()
			logf("Login: launcher process exited (%v)", err)
		}()
		return readDevToolsPort(dir, time.Now().Add(20*time.Second))
	}
	if !reused {
		port, wsPath, err = launch(dir)
		if err != nil {
			// 2) Profil ist von einem Browser belegt, den wir nicht erreichen: frisches Profil nehmen.
			logf("Login: profile %s is blocked (%v) – using a fresh profile", filepath.Base(dir), err)
			fresh := dir + "-" + time.Now().Format("20060102-150405")
			_ = os.MkdirAll(fresh, 0o700)
			port, wsPath, err = launch(fresh)
			if err != nil {
				return "", err
			}
		}
	}
	wsURL, err := browserWebSocket(port, wsPath)
	if err != nil {
		if reused {
			return "", errReuseFailed
		}
		return "", err
	}
	ws, err := wsDial(wsURL)
	if err != nil {
		if reused {
			return "", errReuseFailed
		}
		return "", errors.New(T("browserConnect", err))
	}
	cdp := newCDP(ws)
	defer ws.Close()
	closeBrowser := func() {
		_, _ = cdp.call("", "Browser.close", nil)
	}

	prefix := stripQuery(cfg.redirectURI)
	patterns := map[string]any{"patterns": []map[string]any{{"urlPattern": prefix + "*", "requestStage": "Request"}}}
	sessions := map[string]string{} // targetId -> sessionId
	pages := map[string]bool{}
	attach := func(t targetInfo) {
		if t.Type != "page" || sessions[t.TargetID] != "" {
			return
		}
		res, err := cdp.call("", "Target.attachToTarget", map[string]any{"targetId": t.TargetID, "flatten": true})
		if err != nil {
			logf("Login: attaching to tab failed: %v", err)
			return
		}
		var r struct {
			SessionID string `json:"sessionId"`
		}
		_ = json.Unmarshal(res, &r)
		sessions[t.TargetID] = r.SessionID
		if _, err := cdp.call(r.SessionID, "Fetch.enable", patterns); err != nil {
			logf("Login: Fetch.enable failed: %v", err)
		}
		logf("Login: watching tab (%s %s)", t.TargetID[:8], stripQuery(t.URL))
	}

	if _, err := cdp.call("", "Target.setDiscoverTargets", map[string]any{"discover": true}); err != nil {
		if reused {
			return "", errReuseFailed
		}
		return "", err
	}
	// ersten Tab finden (das App-Fenster) – bzw. bei übernommenem Browser ein neues Fenster öffnen
	var first targetInfo
	if reused {
		res, err := cdp.call("", "Target.createTarget", map[string]any{"url": "about:blank", "newWindow": true})
		if err == nil {
			var r struct {
				TargetID string `json:"targetId"`
			}
			_ = json.Unmarshal(res, &r)
			first = targetInfo{TargetID: r.TargetID, Type: "page", URL: "about:blank"}
			pages[r.TargetID] = true
		} else {
			logf("Login: new window in running browser failed: %v", err)
		}
	}
	for i := 0; i < 50 && first.TargetID == ""; i++ {
		res, err := cdp.call("", "Target.getTargets", nil)
		if err == nil {
			var r struct {
				TargetInfos []targetInfo `json:"targetInfos"`
			}
			_ = json.Unmarshal(res, &r)
			for _, t := range r.TargetInfos {
				if t.Type == "page" {
					pages[t.TargetID] = true
					if first.TargetID == "" || t.URL == "about:blank" {
						first = t
					}
				}
			}
		}
		if first.TargetID == "" {
			if i == 10 { // Browser ohne offenes Fenster: selbst eines öffnen
				_, _ = cdp.call("", "Target.createTarget", map[string]any{"url": "about:blank"})
			}
			time.Sleep(200 * time.Millisecond)
		}
	}
	if first.TargetID == "" {
		if reused {
			return "", errReuseFailed
		}
		closeBrowser()
		return "", errors.New(T("noTab"))
	}
	for id := range pages {
		attach(targetInfo{TargetID: id, Type: "page"})
	}
	// Nicht auf die Antwort warten: Ist man schon angemeldet, folgt die Rückleitung sofort und
	// bleibt in unserem Abfangen hängen – die Antwort käme erst, nachdem wir sie bearbeitet haben.
	go func(sid string) {
		logf("Login: opening sign-in page in tab %s", first.TargetID[:8])
		if _, err := cdp.call(sid, "Page.navigate", map[string]any{"url": authURL}); err != nil {
			logf("Login: Page.navigate reports: %v", err)
		}
	}(sessions[first.TargetID])
	logf("Login: sign-in page open, waiting for sign-in …")

	finish := func(u string) (string, error) {
		time.Sleep(1500 * time.Millisecond)
		closeBrowser()
		return u, nil
	}
	for {
		select {
		case <-ctx.Done():
			closeBrowser()
			return "", errors.New(T("timeout"))
		case <-cdp.closed:
			return "", errors.New(T("closed"))
		case m := <-cdp.events:
			switch m.Method {
			case "Target.targetCreated", "Target.targetInfoChanged":
				var p struct {
					TargetInfo targetInfo `json:"targetInfo"`
				}
				_ = json.Unmarshal(m.Params, &p)
				t := p.TargetInfo
				if t.Type != "page" {
					continue
				}
				pages[t.TargetID] = true
				attach(t)
				if strings.HasPrefix(t.URL, prefix) && strings.Contains(t.URL, "code=") && matchesState(t.URL, state) {
					// Rückleitung ist ohne Abfangen geladen worden – Code trotzdem verwenden
					logf("Login: redirect detected in address bar (fallback)")
					return finish(t.URL)
				}
			case "Target.targetDestroyed":
				var p struct {
					TargetID string `json:"targetId"`
				}
				_ = json.Unmarshal(m.Params, &p)
				delete(pages, p.TargetID)
				delete(sessions, p.TargetID)
				if len(pages) == 0 {
					return "", errors.New(T("closed"))
				}
			case "Target.detachedFromTarget":
				var p struct {
					TargetID string `json:"targetId"`
				}
				_ = json.Unmarshal(m.Params, &p)
				delete(sessions, p.TargetID)
			case "Fetch.requestPaused":
				var p struct {
					RequestID string `json:"requestId"`
					Request   struct {
						URL string `json:"url"`
					} `json:"request"`
				}
				_ = json.Unmarshal(m.Params, &p)
				if !strings.HasPrefix(p.Request.URL, prefix) {
					_, _ = cdp.call(m.SessionID, "Fetch.continueRequest", map[string]any{"requestId": p.RequestID})
					continue
				}
				if !matchesState(p.Request.URL, state) {
					logf("Login: ignored outdated redirect")
					_, _ = cdp.call(m.SessionID, "Fetch.fulfillRequest", map[string]any{
						"requestId": p.RequestID, "responseCode": 200,
						"responseHeaders": []map[string]string{{"name": "Content-Type", "value": "text/html; charset=utf-8"}},
						"body":            base64.StdEncoding.EncodeToString([]byte(stalePage())),
					})
					continue
				}
				logf("Login: redirect intercepted")
				_, _ = cdp.call(m.SessionID, "Fetch.fulfillRequest", map[string]any{
					"requestId":       p.RequestID,
					"responseCode":    200,
					"responseHeaders": []map[string]string{{"name": "Content-Type", "value": "text/html; charset=utf-8"}},
					"body":            base64.StdEncoding.EncodeToString([]byte(callbackPage())),
				})
				return finish(p.Request.URL)
			}
		}
	}
}

// --- Token ---------------------------------------------------------------

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	Error        string `json:"error"`
	ErrorDesc    string `json:"error_description"`
}

var errNotConnected = errors.New("not connected to Prusa Connect")

func postToken(form url.Values) (*tokenResponse, int, error) {
	req, _ := http.NewRequest("POST", strings.TrimRight(cfg.accountURL, "/")+"/o/token/", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var tr tokenResponse
	_ = json.Unmarshal(body, &tr)
	if resp.StatusCode != 200 || tr.AccessToken == "" {
		msg := tr.ErrorDesc
		if msg == "" {
			msg = tr.Error
		}
		if msg == "" {
			msg = resp.Status
		}
		return &tr, resp.StatusCode, errors.New(T("account", msg))
	}
	return &tr, resp.StatusCode, nil
}

type tokenStore struct {
	mu        sync.Mutex
	access    string
	accessExp time.Time
	refresh   string
}

func (s *tokenStore) file() string { return filepath.Join(cfg.dataDir, "connect-login.bin") }

func (s *tokenStore) load() {
	b, err := os.ReadFile(s.file())
	if err != nil {
		return
	}
	plain, err := unprotect(b)
	if err != nil {
		return
	}
	s.mu.Lock()
	s.refresh = strings.TrimSpace(string(plain))
	s.mu.Unlock()
}

func (s *tokenStore) saveLocked() error {
	enc, err := protect([]byte(s.refresh))
	if err != nil {
		return err
	}
	tmp := s.file() + ".tmp"
	if err := os.WriteFile(tmp, enc, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.file())
}

func (s *tokenStore) hasLogin() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.refresh != ""
}

func (s *tokenStore) clear() {
	s.mu.Lock()
	s.access, s.refresh, s.accessExp = "", "", time.Time{}
	s.mu.Unlock()
	_ = os.Remove(s.file())
}

func (s *tokenStore) setFrom(tr *tokenResponse) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.access = tr.AccessToken
	exp := tr.ExpiresIn
	if exp <= 0 {
		exp = 3600
	}
	s.accessExp = time.Now().Add(time.Duration(exp) * time.Second)
	if tr.RefreshToken != "" {
		s.refresh = tr.RefreshToken
	}
	return s.saveLocked()
}

// accessToken liefert ein gültiges Zugriffstoken und erneuert es bei Bedarf.
func (s *tokenStore) accessToken() (string, error) {
	s.mu.Lock()
	if s.access != "" && time.Until(s.accessExp) > 90*time.Second {
		a := s.access
		s.mu.Unlock()
		return a, nil
	}
	rt := s.refresh
	s.mu.Unlock()
	if rt == "" {
		return "", errNotConnected
	}
	form := url.Values{"grant_type": {"refresh_token"}, "refresh_token": {rt}, "client_id": {cfg.clientID}}
	tr, status, err := postToken(form)
	if err != nil {
		if status == 400 || status == 401 {
			// Anmeldung abgelaufen oder widerrufen
			s.clear()
			return "", errNotConnected
		}
		return "", err
	}
	if err := s.setFrom(tr); err != nil {
		return "", err
	}
	return tr.AccessToken, nil
}

func (s *tokenStore) invalidateAccess() {
	s.mu.Lock()
	s.access = ""
	s.mu.Unlock()
}

// login führt den kompletten Ablauf aus.
func login(ctx context.Context) error {
	p := newPKCE()
	cbURL, err := runLoginBrowser(ctx, authorizeURL(p), p.state)
	if err != nil {
		return err
	}
	u, err := url.Parse(cbURL)
	if err != nil {
		return err
	}
	q := u.Query()
	if e := q.Get("error"); e != "" {
		if e == "access_denied" {
			return errors.New(T("denied"))
		}
		return errors.New(T("accountSays", e))
	}
	if q.Get("state") != p.state {
		return errors.New(T("stateMismatch"))
	}
	code := q.Get("code")
	if code == "" {
		return errors.New(T("noCode"))
	}
	form := url.Values{"grant_type": {"authorization_code"}, "code": {code}, "client_id": {cfg.clientID}, "redirect_uri": {cfg.redirectURI}, "code_verifier": {p.verifier}}
	tr, _, err := postToken(form)
	if err != nil {
		return err
	}
	return tokens.setFrom(tr)
}
