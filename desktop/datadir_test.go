// Color Mapper for Prusa – Copyright (C) 2026 DomiTech3D
// SPDX-License-Identifier: GPL-3.0-only – additional terms (attribution) in NOTICE.md

package main

import (
	"os"
	"path/filepath"
	"testing"
)

// The sign-in saved by older versions (folder «INDX-Bridge» or «ColorMapperBridge») is taken over.
func TestDataDirMigration(t *testing.T) {
	for _, old := range []string{"INDX-Bridge", "ColorMapperBridge"} {
		base := t.TempDir()
		_ = os.MkdirAll(filepath.Join(base, old), 0o700)
		_ = os.WriteFile(filepath.Join(base, old, "connect-login.bin"), []byte("x"), 0o600)
		dir := dataDirFor(base)
		if filepath.Base(dir) != "ColorMapperForPrusa" {
			t.Fatalf("%s: got %s", old, dir)
		}
		if _, err := os.Stat(filepath.Join(dir, "connect-login.bin")); err != nil {
			t.Errorf("%s: saved sign-in not taken over", old)
		}
	}
	base := t.TempDir()
	if filepath.Base(dataDirFor(base)) != "ColorMapperForPrusa" {
		t.Errorf("fresh install: wrong folder")
	}
}
