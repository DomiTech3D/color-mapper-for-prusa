// Color Mapper for Prusa – Copyright (C) 2026 DomiTech3D
// SPDX-License-Identifier: GPL-3.0-only – additional terms (attribution) in NOTICE.md

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Echte Antwort von Spooly (gekürzt): ein Bambu-Drucker mit AMS und EXT, ein CORE One INDX,
// bei dem «1-2» fehlt und «1-6» leer ist.
const spoolyPrintersJSON = `{"items":[
 {"printer_id":"d4d1","name":"3DP-039-704","vendor":"bambu","model":null,"state":"unknown"},
 {"printer_id":"4cf7","name":"CoreOne+ INDX","vendor":"prusa","model":"COREONE_INDX8T","state":"unknown"}]}`

const spoolySlotsJSON = `{"items":[
 {"printer":"3DP-039-704","slot":"1-1","spool":{"id":"b1","number":178,"title":"Black","material":"PETG Matte","color_hex":"#000000"}},
 {"printer":"3DP-039-704","slot":"EXT","spool":{"id":"b2","number":120,"title":"Black","material":"PLA+","color_hex":"#000000"}},
 {"printer":"CoreOne+ INDX","slot":"1-1","spool":{"id":"s24","number":24,"title":"A95 Dark Blue","material":"TPU","color_hex":"#314E82"}},
 {"printer":"CoreOne+ INDX","slot":"1-3","slot_id":"slot3","spool":{"id":"s144","number":144,"title":"Red","material":"PLA","color_hex":"#BC2726"}},
 {"printer":"CoreOne+ INDX","slot":"1-4","spool":{"id":"s171","number":171,"title":"Black","material":"ASA+","color_hex":"#000000"}},
 {"printer":"CoreOne+ INDX","slot":"1-5","spool":{"id":"s86","number":86,"title":"Beige","material":"PLA","color_hex":"#9E744A"}},
 {"printer":"CoreOne+ INDX","slot":"1-6","slot_id":"slot6","spool":null},
 {"printer":"CoreOne+ INDX","slot":"1-7","spool":{"id":"s107","number":107,"title":"Wood","material":"PLA Wood","color_hex":"#CFAF94"}},
 {"printer":"CoreOne+ INDX","slot":"1-8","spool":{"id":"s82","number":82,"title":"ePLA-SS White","material":"PLA","color_hex":"#FFFFFF"}}]}`

const spoolySpoolsJSON = `{"items":[
 {"id":"s144","number":144,"title":"Red","manufacturer":"Prusament","material":"PLA","color_hex":"#BC2726","remaining_grams":35.0,"fill_level":"crit","location":"Büro","archived":false},
 {"id":"s24","number":24,"title":"A95 Dark Blue","manufacturer":null,"material":"TPU","color_hex":"#314E82","remaining_grams":null,"fill_level":null,"location":null,"archived":false},
 {"id":"old","number":3,"title":"Alt","material":"PLA","color_hex":"#123456","remaining_grams":0,"archived":true}],"total":3}`

func TestSpoolyINDX(t *testing.T) {
	var pr struct{ Items []spoolyPrinter }
	var sl struct{ Items []spoolySlot }
	var sp struct{ Items []spoolySpool }
	for _, x := range []struct {
		s string
		v any
	}{{spoolyPrintersJSON, &pr}, {spoolySlotsJSON, &sl}, {spoolySpoolsJSON, &sp}} {
		if err := json.Unmarshal([]byte(x.s), x.v); err != nil {
			t.Fatal(err)
		}
	}
	spools := spoolsFromSpooly(sp.Items)
	if len(spools) != 2 {
		t.Fatalf("archived spool must be skipped, got %d", len(spools))
	}
	byID := map[string]SpoolInfo{}
	for _, s := range spools {
		byID[s.ID] = s
	}
	ps, ids := printersFromSpooly(pr.Items, sl.Items, byID)
	if len(ps) != 1 || ps[0].Name != "CoreOne+ INDX" || ps[0].Model != "COREONE_INDX8T" || ps[0].MMU {
		t.Fatalf("only the Prusa printer expected: %+v", ps)
	}
	tools := ps[0].Tools
	if len(tools) != 8 {
		t.Fatalf("want 8 tools, got %d", len(tools))
	}
	want := []string{"#314E82", "", "#BC2726", "#000000", "#9E744A", "", "#CFAF94", "#FFFFFF"}
	for i, w := range want {
		if tools[i].T != i+1 || tools[i].C != w {
			t.Errorf("T%d = %+v, want %q", i+1, tools[i], w)
		}
	}
	t3 := tools[2]
	if t3.Fill != "crit" || t3.G == nil || *t3.G != 35 || t3.Loc != "Büro" || t3.B != "Prusament" || t3.No != 144 || t3.M != "PLA" {
		t.Errorf("T3 details: %+v", t3)
	}
	if tools[0].G != nil {
		t.Errorf("T1 has no weight in Spooly: %+v", tools[0])
	}
	if t3.Spid != "s144" || !t3.Slot || tools[5].Spid != "" || !tools[5].Slot || tools[1].Slot || tools[0].Slot {
		t.Errorf("slot ids: T1 %+v T2 %+v T3 %+v T6 %+v", tools[0], tools[1], t3, tools[5])
	}
	if d := slotDiag(ps); !strings.Contains(d, "fehlt in GET /slots: T2") && !strings.Contains(d, "not listed in GET /slots: T2") {
		t.Errorf("diag: %s", d)
	}
	if ids["spooly:4cf7#3"] != "slot3" || ids["spooly:4cf7#6"] != "slot6" || len(ids) != 2 {
		t.Errorf("slot id map: %v", ids)
	}
}

func TestSpoolySetSlot(t *testing.T) {
	var got []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer spk_test" {
			w.WriteHeader(401)
			return
		}
		if r.Method == "GET" {
			io.WriteString(w, `{"items":[],"total":0}`)
			return
		}
		b, _ := io.ReadAll(r.Body)
		got = append(got, r.Method+" "+r.URL.Path+" "+string(b))
		if r.Header.Get("Idempotency-Key") == "" {
			t.Error("write without Idempotency-Key")
		}
		switch {
		case strings.Contains(string(b), `"s9"`) && !strings.Contains(string(b), `"confirm_color":true`):
			w.WriteHeader(409)
			io.WriteString(w, `{"detail":{"code":"andere_farbe","message":"Der Drucker meldet Rot."}}`)
		case strings.Contains(string(b), `"s403"`):
			w.WriteHeader(403)
			io.WriteString(w, `{"detail":"Not allowed"}`)
		default:
			io.WriteString(w, `{"ok":true}`)
		}
	}))
	defer srv.Close()
	t.Setenv("INDX_SPOOLY_URL", srv.URL)
	s := &spoolyState{key: "spk_test", snap: &spoolySnap{
		Printers: []PrinterInfo{{ID: "spooly:p1", Name: "INDX"}},
		Spools:   []SpoolInfo{{ID: "s61", Number: 61, Title: "Purple"}},
		slotIDs:  map[string]string{"spooly:p1#6": "slot6"}}}
	if r := s.setSlot("spooly:p1", 6, "s61", false); r["ok"] != true {
		t.Fatalf("assign: %v", r)
	}
	s.snap = &spoolySnap{slotIDs: map[string]string{"spooly:p1#6": "slot6"}} // nach dem Schreiben neu gelesen (hier leer)
	if r := s.setSlot("spooly:p1", 6, "s9", false); r["ok"] != false || r["needConfirm"] != true {
		t.Fatalf("color mismatch must ask: %v", r)
	}
	s.snap = &spoolySnap{slotIDs: map[string]string{"spooly:p1#6": "slot6"}}
	if r := s.setSlot("spooly:p1", 6, "s9", true); r["ok"] != true {
		t.Fatalf("confirmed assign: %v", r)
	}
	s.snap = &spoolySnap{slotIDs: map[string]string{"spooly:p1#6": "slot6"}}
	if r := s.setSlot("spooly:p1", 6, "s403", false); r["ok"] != false || !strings.Contains(fmt.Sprint(r["error"]), "Not allowed") || !strings.Contains(fmt.Sprint(r["error"]), "write access") {
		t.Fatalf("403: %v", r)
	}
	s.snap = &spoolySnap{slotIDs: map[string]string{"spooly:p1#6": "slot6"}}
	if r := s.setSlot("spooly:p1", 6, "", false); r["ok"] != true {
		t.Fatalf("clear: %v", r)
	}
	s.snap = &spoolySnap{slotIDs: map[string]string{"spooly:p1#6": "slot6"}}
	if r := s.setSlot("spooly:p1", 2, "s61", false); r["ok"] != false {
		t.Fatalf("unknown slot must fail: %v", r)
	}
	want := []string{
		`PUT /slots/slot6 {"confirm_color":false,"spool_id":"s61"}`,
		`PUT /slots/slot6 {"confirm_color":false,"spool_id":"s9"}`,
		`PUT /slots/slot6 {"confirm_color":true,"spool_id":"s9"}`,
		`PUT /slots/slot6 {"confirm_color":false,"spool_id":"s403"}`,
		`DELETE /slots/slot6 `,
	}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Errorf("calls:\n%s", strings.Join(got, "\n"))
	}
}

func TestSlotTool(t *testing.T) {
	cases := []struct {
		slot  string
		units int
		want  int
	}{{"1-1", 1, 1}, {"1-8", 1, 8}, {"EXT", 1, 0}, {"2-3", 2, 7}, {"0-1", 1, 0}, {" 1-5 ", 1, 5}}
	for _, c := range cases {
		if got := slotTool(c.slot, c.units); got != c.want {
			t.Errorf("slotTool(%q,%d) = %d, want %d", c.slot, c.units, got, c.want)
		}
	}
}

func TestSpoolyKeyFormat(t *testing.T) {
	for _, k := range []string{"", "abc", "spk_", "spk_ab cd", "Bearer spk_abcdef"} {
		if _, err := (&spoolyState{}).connect(k); err == nil {
			t.Errorf("key %q must be rejected before calling Spooly", k)
		}
	}
}
