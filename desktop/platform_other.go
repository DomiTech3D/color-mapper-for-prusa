// Color Mapper for Prusa – Copyright (C) 2026 DomiTech3D
// SPDX-License-Identifier: GPL-3.0-only – additional terms (attribution) in NOTICE.md

//go:build !windows

package main

import (
	"os/exec"
	"runtime"
)

// Ausserhalb von Windows (nur für Tests): Datei mit Rechten 0600, ohne Verschlüsselung.
func protect(data []byte) ([]byte, error)   { return append([]byte(nil), data...), nil }
func unprotect(data []byte) ([]byte, error) { return append([]byte(nil), data...), nil }

func browserCandidates() []string {
	if runtime.GOOS == "darwin" {
		return []string{
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		}
	}
	return []string{"/usr/bin/microsoft-edge", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"}
}

func defaultBrowserExe() string { return "" }

func runtimeInfo() string { return runtime.GOOS }

func openBrowser(url string) {
	name := "xdg-open"
	if runtime.GOOS == "darwin" {
		name = "open"
	}
	_ = exec.Command(name, url).Start()
}

func hideConsole(cmd *exec.Cmd) {}

func setConsoleTitle(string) {}
