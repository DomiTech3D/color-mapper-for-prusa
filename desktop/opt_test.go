// Color Mapper for Prusa – Copyright (C) 2026 DomiTech3D
// SPDX-License-Identifier: GPL-3.0-only – additional terms (attribution) in NOTICE.md

package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestOptIndexCacheAndFallback(t *testing.T) {
	calls := 0
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls == 3 {
			w.WriteHeader(500)
			return
		}
		_, _ = w.Write([]byte(`[{"type":"material","name":"PLA Jet Black","brandName":"Prusament","materialType":"PLA","color":"#000000ff","slug":"x"}]`))
	}))
	defer up.Close()
	t.Setenv("INDX_OPT_URL", up.URL)
	cfg.dataDir = t.TempDir()
	b, _, stale, err := optIndex(false)
	if err != nil || stale || len(b) == 0 || calls != 1 {
		t.Fatalf("first load: err=%v stale=%v calls=%d", err, stale, calls)
	}
	if _, _, _, err := optIndex(false); err != nil || calls != 1 {
		t.Fatalf("cache not used: calls=%d", calls)
	}
	if _, _, _, err := optIndex(true); err != nil || calls != 2 {
		t.Fatalf("refresh: calls=%d", calls)
	}
	old := time.Now().Add(-7 * time.Hour)
	_ = os.Chtimes(filepath.Join(cfg.dataDir, "openprinttag.json"), old, old)
	b, at, stale, err := optIndex(false)
	if err != nil || !stale || len(b) == 0 || calls != 3 || time.Since(at) < 6*time.Hour {
		t.Fatalf("fallback to old copy: err=%v stale=%v calls=%d", err, stale, calls)
	}
}
