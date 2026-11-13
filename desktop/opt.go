// Color Mapper for Prusa – Copyright (C) 2026 DomiTech3D
// SPDX-License-Identifier: GPL-3.0-only – additional terms (attribution) in NOTICE.md

package main

// OpenPrintTag: offener Filament-Katalog (https://database.openprinttag.org, Daten unter MIT-Lizenz).
// Das Programm holt die Gesamtliste selbst, damit die Seite keine fremde Website aufrufen muss,
// und hält eine Kopie im Datenordner – ist OpenPrintTag nicht erreichbar, gilt die letzte Kopie.

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const optMaxAge = 6 * time.Hour

var optMu sync.Mutex

func optURL() string {
	return env("INDX_OPT_URL", "https://database.openprinttag.org/api/search-index.json")
}

// optIndex liefert die Liste (JSON), wann sie geholt wurde und ob es eine ältere Kopie ist.
func optIndex(force bool) ([]byte, time.Time, bool, error) {
	optMu.Lock()
	defer optMu.Unlock()
	file := filepath.Join(cfg.dataDir, "openprinttag.json")
	cached, cerr := os.ReadFile(file)
	var at time.Time
	if st, err := os.Stat(file); err == nil {
		at = st.ModTime()
	}
	if cerr == nil && !force && time.Since(at) < optMaxAge {
		return cached, at, false, nil
	}
	body, err := optFetch()
	if err != nil {
		if cerr == nil {
			log.Printf("OpenPrintTag: %v – using the copy from %s", err, at.Format("02.01. 15:04"))
			return cached, at, true, nil
		}
		return nil, time.Time{}, false, err
	}
	_ = os.WriteFile(file, body, 0o600)
	at = time.Now()
	log.Printf("OpenPrintTag: catalog loaded (%d KB)", len(body)/1024)
	return body, at, false, nil
}

func optFetch() ([]byte, error) {
	req, err := http.NewRequest("GET", optURL(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "ColorMapperForPrusa/"+version)
	c := &http.Client{Timeout: 60 * time.Second}
	resp, err := c.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if err != nil {
		return nil, err
	}
	if len(body) < 2 || body[0] != '[' {
		return nil, fmt.Errorf("unexpected format")
	}
	return body, nil
}

func registerOpt(mux *http.ServeMux) {
	mux.HandleFunc("/api/opt", guard(func(w http.ResponseWriter, r *http.Request) {
		body, at, stale, err := optIndex(r.URL.Query().Get("refresh") == "1")
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadGateway)
			fmt.Fprintf(w, `{"error":%q}`, err.Error())
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-OPT-Fetched", at.UTC().Format(time.RFC3339))
		if stale {
			w.Header().Set("X-OPT-Stale", "1")
		}
		_, _ = w.Write(body)
	}))
}
