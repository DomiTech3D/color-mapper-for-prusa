// Color Mapper for Prusa – Copyright (C) 2026 DomiTech3D
// SPDX-License-Identifier: GPL-3.0-only – additional terms (attribution) in NOTICE.md

package main

// Texte der Bridge auf Englisch und Deutsch.
// T(): Meldungen, die in der Seite erscheinen (Sprache der Seite, per X-Lang mitgeschickt).
// C(): Text im Konsolenfenster. Standard Englisch; die zuletzt in der Seite gewählte Sprache
// wird gemerkt (Datei «lang» im Datenordner) und gilt beim nächsten Start. COLORMAPPER_LANG überschreibt.

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var (
	langMu   sync.Mutex
	uiLang   = "en"
	conLang  = "en"
	langFile string
)

func normLang(l string) string {
	l = strings.ToLower(strings.TrimSpace(l))
	switch {
	case strings.HasPrefix(l, "de"):
		return "de"
	case strings.HasPrefix(l, "en"):
		return "en"
	}
	return ""
}

func setUILang(l string) {
	if l = normLang(l); l == "" {
		return
	}
	langMu.Lock()
	changed := l != uiLang
	uiLang = l
	langMu.Unlock()
	if changed && langFile != "" {
		_ = os.WriteFile(langFile, []byte(l), 0o600)
	}
}

func getUILang() string {
	langMu.Lock()
	defer langMu.Unlock()
	return uiLang
}

func initLang(dataDir string) {
	langFile = filepath.Join(dataDir, "lang")
	l := normLang(os.Getenv("COLORMAPPER_LANG"))
	if l == "" {
		if b, err := os.ReadFile(langFile); err == nil {
			l = normLang(string(b))
		}
	}
	if l == "" {
		l = "en"
	}
	conLang = l
	uiLang = l
}

var msgs = map[string]map[string]string{
	"en": {
		// Seite
		"connectStatus":      "Prusa Connect responded with %s",
		"connectBad":         "Unexpected response from Prusa Connect",
		"noOrg":              "No organization was found in your Prusa account.",
		"browserGone":        "The connection to the browser was closed",
		"noBrowser":          "No suitable browser found (Edge, Chrome or Brave).",
		"noDevtools":         "The sign-in window could not be controlled (no DevTools port).",
		"browserUnreachable": "Browser not reachable: %v",
		"browserStart":       "The browser could not be started: %v",
		"browserConnect":     "Connecting to the browser failed: %v",
		"noTab":              "No tab was found in the sign-in window.",
		"timeout":            "Signing in took too long. Please try again.",
		"closed":             "The sign-in window was closed before signing in was finished.",
		"account":            "Prusa account: %s",
		"denied":             "The sign-in was declined.",
		"accountSays":        "Prusa account reports: %s",
		"stateMismatch":      "The sign-in does not match this request (state). Please try again.",
		"noCode":             "No sign-in confirmation received.",
		"cbHead":             "Connected to Prusa Connect",
		"cbText":             "This window closes in a moment. The colors will appear in the Color Mapper.",
		"stalePage":          "Outdated sign-in – you can close this window.",
		"spoolyKeyFormat":    "That does not look like a Spooly API key. It starts with spk_ – copy it completely, without spaces.",
		"spoolyBadKey":       "Spooly does not accept this key. It may be incomplete, revoked or deleted – create a new key in Spooly.",
		"spoolyNoAccess":     "Spooly refused access. The API needs Spooly Pro (or the trial) and API access for your account.",
		"spoolyLimit":        "Spooly's daily limit for this account is used up. Colors update again tomorrow.",
		"spoolySays":         "Spooly reports: %s",
		"spoolyStatus":       "Spooly responded with HTTP %d",
		"spoolyUnreachable":  "Spooly is not reachable: %v",
		"spoolyNoWrite":      "Spooly does not allow this key to change slots. Create a key with write access in Spooly and connect it again.",
		"spoolyNoSlot":       "Spooly does not list this slot for the printer, so nothing can be entered there. Assign the spool in Spooly itself.",
		"spoolyColorDiffers": "The printer reports a different color for this slot than the spool has. Click «Assign anyway» if the spool is right.",
		"spoolyAssigned":     "Spool assigned in Spooly: %s → %s.",
		"spoolyCleared":      "Slot %s emptied in Spooly.",
		"spoolyNotConnected": "Spooly is not connected.",
		"spoolySlotDiag":     "slots of %s – assignable: %s · listed without slot_id: %s · not listed in GET /slots: %s",
		// Konsole
		"banner":   "Color Mapper for Prusa %s by DomiTech3D – with live colors from Prusa Connect",
		"already":  "Color Mapper for Prusa is already running. Opening it in the browser.",
		"replace":  "Another Color Mapper for Prusa (version %s) is still running. Replacing it …",
		"closeOld": ">>> Please close the old black \"Color Mapper for Prusa\" window. Startup continues here automatically.",
		"portBusy": "Port %s is in use: %v",
		"stored":   "Saved Prusa Connect sign-in found.",
		"notYet":   "Not connected to Prusa Connect yet. Click \"Connect to Prusa Connect\" in the Color Mapper.",
		"url":      "In the browser: %s",
		"keepOpen": "Keep this window open while you use the Color Mapper. Closing it stops the program.",
		"enter":    "Press Enter to exit …",
	},
	"de": {
		"connectStatus":      "Prusa Connect antwortet mit %s",
		"connectBad":         "Unerwartete Antwort von Prusa Connect",
		"noOrg":              "In deinem Prusa-Account wurde keine Organisation gefunden.",
		"browserGone":        "Die Verbindung zum Browser wurde beendet",
		"noBrowser":          "Kein passender Browser gefunden (Edge, Chrome oder Brave).",
		"noDevtools":         "Das Browserfenster für die Anmeldung liess sich nicht steuern (kein DevTools-Port).",
		"browserUnreachable": "Browser nicht erreichbar: %v",
		"browserStart":       "Browser konnte nicht gestartet werden: %v",
		"browserConnect":     "Verbindung zum Browser fehlgeschlagen: %v",
		"noTab":              "Im Anmeldefenster wurde kein Tab gefunden.",
		"timeout":            "Die Anmeldung hat zu lange gedauert. Bitte nochmals versuchen.",
		"closed":             "Das Anmeldefenster wurde geschlossen, bevor die Anmeldung fertig war.",
		"account":            "Prusa Account: %s",
		"denied":             "Die Anmeldung wurde abgelehnt.",
		"accountSays":        "Prusa Account meldet: %s",
		"stateMismatch":      "Die Anmeldung passt nicht zu dieser Anfrage (state). Bitte nochmals versuchen.",
		"noCode":             "Keine Anmeldebestätigung erhalten.",
		"cbHead":             "Mit Prusa Connect verbunden",
		"cbText":             "Dieses Fenster schliesst sich gleich. Die Farben erscheinen im Farb-Mapper.",
		"stalePage":          "Veraltete Anmeldung – dieses Fenster kann geschlossen werden.",
		"spoolyKeyFormat":    "Das sieht nicht nach einem Spooly-API-Schlüssel aus. Er beginnt mit spk_ – vollständig und ohne Leerzeichen kopieren.",
		"spoolyBadKey":       "Spooly nimmt diesen Schlüssel nicht an. Er ist vielleicht unvollständig, widerrufen oder gelöscht – erstelle in Spooly einen neuen Schlüssel.",
		"spoolyNoAccess":     "Spooly verweigert den Zugriff. Die API braucht Spooly Pro (oder die Testphase) und API-Zugang für dein Konto.",
		"spoolyLimit":        "Das Tageslimit von Spooly für dieses Konto ist aufgebraucht. Morgen werden die Farben wieder aktualisiert.",
		"spoolySays":         "Spooly meldet: %s",
		"spoolyStatus":       "Spooly antwortet mit HTTP %d",
		"spoolyUnreachable":  "Spooly ist nicht erreichbar: %v",
		"spoolyNoWrite":      "Spooly erlaubt diesem Schlüssel keine Änderungen an Slots. Erstelle in Spooly einen Schlüssel mit Schreibrecht und verbinde ihn neu.",
		"spoolyNoSlot":       "Spooly führt diesen Slot beim Drucker nicht, deshalb kann hier nichts eingetragen werden. Ordne die Spule in Spooly selbst zu.",
		"spoolyColorDiffers": "Der Drucker meldet für diesen Slot eine andere Farbe als die Spule hat. Klicke «Trotzdem eintragen», wenn die Spule stimmt.",
		"spoolyAssigned":     "In Spooly eingetragen: %s → %s.",
		"spoolyCleared":      "Slot %s in Spooly geleert.",
		"spoolyNotConnected": "Spooly ist nicht verbunden.",
		"spoolySlotDiag":     "Slots von %s – zuordenbar: %s · ohne slot_id: %s · fehlt in GET /slots: %s",
		"banner":             "Farb-Mapper für Prusa %s von DomiTech3D – mit Live-Farben aus Prusa Connect",
		"already":            "Der Farb-Mapper für Prusa läuft bereits. Ich öffne ihn im Browser.",
		"replace":            "Ein anderer Farb-Mapper für Prusa (Version %s) läuft noch. Ich ersetze ihn …",
		"closeOld":           ">>> Bitte das alte schwarze Fenster «Color Mapper for Prusa» schliessen. Danach geht es hier automatisch weiter.",
		"portBusy":           "Port %s ist belegt: %v",
		"stored":             "Gespeicherte Prusa-Connect-Anmeldung gefunden.",
		"notYet":             "Noch nicht mit Prusa Connect verbunden. Im Farb-Mapper auf «Mit Prusa Connect verbinden» klicken.",
		"url":                "Im Browser: %s",
		"keepOpen":           "Dieses Fenster offen lassen, solange du den Farb-Mapper nutzt. Schliessen beendet das Programm.",
		"enter":              "Enter drücken zum Beenden …",
	},
}

func msgFor(lang, key string, a ...any) string {
	s, ok := msgs[lang][key]
	if !ok {
		s = msgs["en"][key]
	}
	if len(a) > 0 {
		return fmt.Sprintf(s, a...)
	}
	return s
}

// T: Text für die Seite
func T(key string, a ...any) string { return msgFor(getUILang(), key, a...) }

// C: Text für das Konsolenfenster
func C(key string, a ...any) string { return msgFor(conLang, key, a...) }

// callbackPage: Bestätigungsseite im Anmeldefenster
func callbackPage() string {
	l := getUILang()
	return `<!doctype html><html lang="` + l + `"><head><meta charset="utf-8"><title>Color Mapper for Prusa</title>
<style>body{font:16px system-ui,sans-serif;background:#E9ECEE;color:#14181B;display:grid;place-items:center;height:100vh;margin:0}
div{background:#fff;border:2px solid #A9532A;border-radius:12px;padding:24px 28px;max-width:360px;text-align:center}b{display:block;font-size:20px;margin-bottom:6px}</style></head>
<body><div><b>` + msgFor(l, "cbHead") + `</b>` + msgFor(l, "cbText") + `</div></body></html>`
}

func stalePage() string {
	return "<!doctype html><meta charset=utf-8><title>Color Mapper for Prusa</title><p style='font:16px system-ui;padding:24px'>" + T("stalePage") + "</p>"
}
