// Color Mapper for Prusa – Copyright (C) 2026 DomiTech3D
// SPDX-License-Identifier: GPL-3.0-only – additional terms (attribution) in NOTICE.md

package main

import (
	"encoding/json"
	"fmt"
	"testing"
)

// tool baut einen Eintrag wie in der Antwort von Prusa Connect.
func tool(id, typ, abbr, name, rgba string) string {
	mpi := `{"__typename":"ToolMaterialPackageInstanceEmpty"}`
	if abbr != "" {
		mpi = fmt.Sprintf(`{"__typename":"FFFToolMaterialPackageInstance","isFromNfc":false,"package":{"material":{"name":%q,"abbreviation":%q,"brand":null,"primaryColor":{"colorRgba":%q}}}}`, name, abbr, rgba)
	}
	return fmt.Sprintf(`{"id":%q,"type":%q,"materialPackageInstance":%s}`, id, typ, mpi)
}

func parseTools(t *testing.T, items ...string) []connectTool {
	var out []connectTool
	raw := "["
	for i, it := range items {
		if i > 0 {
			raw += ","
		}
		raw += it
	}
	if err := json.Unmarshal([]byte(raw+"]"), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

// MK4S + MMU3: Druckkopf «0» (mit schwarzem Filament geladen) und fünf Slots.
// Slot 2 hat PETG Blue – muss als S2 blau ankommen, egal ob die Slots ab 0 oder ab 1 nummeriert sind.
func TestMMUSlots(t *testing.T) {
	for _, base := range []int{0, 1} {
		id := func(n int) string { return fmt.Sprintf("0.%d", n-1+base) }
		tools := parseTools(t,
			tool("0", "PRINT_HEAD", "PLA", "Galaxy Black", "#1A1A1AFF"),
			tool(id(1), "FEEDER", "PLA", "Prusa Orange", "#FA6831FF"),
			tool(id(2), "FEEDER", "PETG", "PETG Blue", "#1F5FBFFF"),
			tool(id(3), "FEEDER", "", "", ""),
			tool(id(4), "FEEDER", "PLA", "Signal White", "#F4F4F4FF"),
			tool(id(5), "FEEDER", "PLA", "Galaxy Black", "#1A1A1AFF"),
		)
		got, mmu := toolsFromConnect(tools)
		if !mmu || len(got) != 5 {
			t.Fatalf("base %d: want 5 slots, got %d: %+v", base, len(got), got)
		}
		want := []string{"#FA6831", "#1F5FBF", "", "#F4F4F4", "#1A1A1A"}
		for i, w := range want {
			if got[i].T != i+1 || got[i].C != w {
				t.Errorf("base %d: S%d = %+v, want color %q", base, i+1, got[i], w)
			}
		}
		if got[1].M != "PETG" || got[1].N != "PETG Blue" {
			t.Errorf("base %d: S2 material %+v", base, got[1])
		}
	}
}

// CORE One INDX: acht Druckköpfe «0»…«7» → Tool 1…8 (unverändert).
func TestINDXTools(t *testing.T) {
	var items []string
	for i := 7; i >= 0; i-- { // absichtlich verkehrt herum
		items = append(items, tool(fmt.Sprint(i), "PRINT_HEAD", "PLA", "", fmt.Sprintf("#0000%02XFF", i)))
	}
	got, mmu := toolsFromConnect(parseTools(t, items...))
	if mmu || len(got) != 8 {
		t.Fatalf("want 8 tools, got %d", len(got))
	}
	for i, ti := range got {
		if ti.T != i+1 || ti.C != fmt.Sprintf("#0000%02X", i) {
			t.Errorf("tool %d: %+v", i+1, ti)
		}
	}
}

// Ältere Antworten ohne «type»: wie bisher als Druckköpfe behandeln.
func TestToolsWithoutType(t *testing.T) {
	got, mmu := toolsFromConnect(parseTools(t, tool("0", "", "PLA", "", "#FF0000FF"), tool("1", "", "", "", "")))
	if mmu || len(got) != 2 || got[0].T != 1 || got[0].C != "#FF0000" || got[1].T != 2 {
		t.Errorf("got %+v", got)
	}
}

// Prusa XL: fünf Druckköpfe – auch wenn nicht alle bestückt sind, zählt die Nummer aus Connect.
func TestXLTools(t *testing.T) {
	got, mmu := toolsFromConnect(parseTools(t,
		tool("0", "PRINT_HEAD", "PLA", "", "#FF0000FF"),
		tool("1", "PRINT_HEAD", "PETG", "", "#00FF00FF"),
		tool("4", "PRINT_HEAD", "PLA", "", "#0000FFFF"),
	))
	if mmu || len(got) != 3 || got[0].T != 1 || got[1].T != 2 || got[2].T != 5 || got[2].C != "#0000FF" {
		t.Errorf("got %+v", got)
	}
}
