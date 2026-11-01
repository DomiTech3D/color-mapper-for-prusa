// Color Mapper for Prusa – Copyright (C) 2026 DomiTech3D
// SPDX-License-Identifier: GPL-3.0-only – additional terms (attribution) in NOTICE.md

//go:build windows

package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

var (
	crypt32       = syscall.NewLazyDLL("crypt32.dll")
	kernel32      = syscall.NewLazyDLL("kernel32.dll")
	procTitle     = kernel32.NewProc("SetConsoleTitleW")
	procProtect   = crypt32.NewProc("CryptProtectData")
	procUnprotect = crypt32.NewProc("CryptUnprotectData")
	procLocalFree = kernel32.NewProc("LocalFree")
)

type dataBlob struct {
	cbData uint32
	pbData *byte
}

func newBlob(d []byte) *dataBlob {
	if len(d) == 0 {
		return &dataBlob{}
	}
	return &dataBlob{cbData: uint32(len(d)), pbData: &d[0]}
}

func (b *dataBlob) toBytes() []byte {
	if b.cbData == 0 || b.pbData == nil {
		return nil
	}
	out := make([]byte, b.cbData)
	copy(out, unsafe.Slice(b.pbData, b.cbData))
	return out
}

const cryptprotectUIForbidden = 0x1

// protect verschlüsselt mit Windows DPAPI (nur dieser Windows-Benutzer kann es lesen).
func protect(data []byte) ([]byte, error) {
	var out dataBlob
	r, _, err := procProtect.Call(uintptr(unsafe.Pointer(newBlob(data))), 0, 0, 0, 0, cryptprotectUIForbidden, uintptr(unsafe.Pointer(&out)))
	if r == 0 {
		return nil, err
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(out.pbData)))
	return out.toBytes(), nil
}

func unprotect(data []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, errors.New("empty")
	}
	var out dataBlob
	r, _, err := procUnprotect.Call(uintptr(unsafe.Pointer(newBlob(data))), 0, 0, 0, 0, cryptprotectUIForbidden, uintptr(unsafe.Pointer(&out)))
	if r == 0 {
		return nil, err
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(out.pbData)))
	return out.toBytes(), nil
}

func browserCandidates() []string {
	var c []string
	for _, base := range []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LocalAppData")} {
		if base == "" {
			continue
		}
		c = append(c,
			filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(base, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
		)
	}
	return c
}

// defaultBrowserExe liest den Standardbrowser für https-Links aus der Registry.
func defaultBrowserExe() string {
	q := func(args ...string) string {
		cmd := exec.Command("reg", args...)
		hideConsole(cmd)
		out, err := cmd.Output()
		if err != nil {
			return ""
		}
		return string(out)
	}
	out := q("query", `HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice`, "/v", "ProgId")
	progID := ""
	for _, line := range strings.Split(out, "\n") {
		f := strings.Fields(line)
		if len(f) >= 3 && strings.EqualFold(f[0], "ProgId") {
			progID = f[len(f)-1]
		}
	}
	if progID == "" {
		return ""
	}
	out = q("query", `HKCR\`+progID+`\shell\open\command`, "/ve")
	for _, line := range strings.Split(out, "\n") {
		i := strings.Index(line, "REG_SZ")
		if i < 0 {
			continue
		}
		v := strings.TrimSpace(line[i+len("REG_SZ"):])
		if strings.HasPrefix(v, `"`) {
			if j := strings.Index(v[1:], `"`); j >= 0 {
				return v[1 : j+1]
			}
		}
		if j := strings.Index(strings.ToLower(v), ".exe"); j >= 0 {
			return v[:j+4]
		}
	}
	return ""
}

func runtimeInfo() string {
	b := defaultBrowserExe()
	if b == "" {
		b = "unbekannt"
	}
	return "Windows, Standardbrowser: " + filepath.Base(b)
}

func openBrowser(url string) {
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	hideConsole(cmd)
	_ = cmd.Start()
}

func hideConsole(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}

// setConsoleTitle: Titel des schwarzen Konsolenfensters
func setConsoleTitle(t string) {
	if p, err := syscall.UTF16PtrFromString(t); err == nil {
		procTitle.Call(uintptr(unsafe.Pointer(p)))
	}
}
