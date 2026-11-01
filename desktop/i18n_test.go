// Color Mapper for Prusa – Copyright (C) 2026 DomiTech3D
// SPDX-License-Identifier: GPL-3.0-only – additional terms (attribution) in NOTICE.md

package main

import (
	"strings"
	"testing"
)

// Every message exists in English and German with the same placeholders.
func TestMessagesComplete(t *testing.T) {
	for _, pair := range [][2]string{{"en", "de"}, {"de", "en"}} {
		for k, v := range msgs[pair[0]] {
			w, ok := msgs[pair[1]][k]
			if !ok {
				t.Errorf("%s: missing %q", pair[1], k)
				continue
			}
			if strings.Count(v, "%") != strings.Count(w, "%") {
				t.Errorf("%q: placeholders differ between %s and %s", k, pair[0], pair[1])
			}
		}
	}
}

func TestLanguageSwitch(t *testing.T) {
	setUILang("de-CH")
	if got := T("timeout"); !strings.Contains(got, "Anmeldung") {
		t.Errorf("German expected, got %q", got)
	}
	setUILang("xx") // unknown: unchanged
	if getUILang() != "de" {
		t.Errorf("unknown language must not change the setting")
	}
	setUILang("en")
	if !strings.Contains(callbackPage(), `lang="en"`) || !strings.Contains(callbackPage(), "Connected to Prusa Connect") {
		t.Errorf("English callback page expected")
	}
}
