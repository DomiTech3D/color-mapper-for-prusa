// Color Mapper for Prusa – Copyright (C) 2026 DomiTech3D
// SPDX-License-Identifier: GPL-3.0-only – additional terms (attribution) in NOTICE.md
/* Farbabgleich (ohne Seitenbezug, mit Unit-Tests in test/match.test.js)
 *
 * Begriffe
 *   Filament (Kandidat): { key, hex, material, kind: 'loaded'|'stock'|'catalog'|'own', tool?, fill? }
 *     loaded  = steckt jetzt im Drucker (tool = Tool-Nummer)   stock = eigenes Lager (Spooly)
 *     catalog = Herstellerkatalog (OpenPrintTag)               own   = eigene Farbe von Hand
 *   Dateifarbe: { idx, hex, material, share }
 *   Zeile (Ergebnis): { cand, tool, d, quality, shared }
 *
 * Regeln (vom Nutzer festgelegt)
 *   - Farbe: CIEDE2000 (Helligkeit halb gewichtet) plus Aufschlag für eine andere Farbfamilie.
 *   - Material: Spulen im Material der Datei, solange eine davon mindestens «ähnlich» ist; sonst alle.
 *   - Geladen vor Lager bei praktisch gleicher Farbe (Toleranz SAME_TOL), damit nicht unnötig gewechselt wird.
 *   - Lager-Spulen: zuerst in ein nicht benötigtes Tool mit praktisch gleicher Farbe, dann in leere Slots,
 *     dann in das nicht benötigte Tool mit der ähnlichsten bisherigen Farbe. Benötigte Tools nie ersetzen.
 *   - Kein Tool mehr frei: die Farbe teilt sich das Tool mit der ähnlichsten bereits gewählten Spule.
 *   - Von Hand gesetzte Zeilen (Filament und/oder Tool) bleiben, wie sie sind.
 */
const Match = (() => {
  'use strict';
  // ---------------------------------------------------------------- Farbe
  function norm(hex) {
    let h = String(hex || '').trim().toLowerCase();
    if (!h.startsWith('#')) h = '#' + h;
    if (/^#[0-9a-f]{3}$/.test(h)) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    if (/^#[0-9a-f]{8}$/.test(h)) h = h.slice(0, 7);          // #RRGGBBAA (OpenPrintTag) → #RRGGBB
    return /^#[0-9a-f]{6}$/.test(h) ? h : '#999999';
  }
  function rgb(hex) { const n = parseInt(norm(hex).slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  function toLab(hex) {
    const lin = rgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    const X = (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047;
    const Y = lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722;
    const Z = (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  }
  const cache = new Map();
  // Lab-Werte und Farbfamilie (Rot, Braun, Orange, Beige, Gelb, Oliv, Grün, Blau, Violett, Rosa, Altrosa, Weiss, Grau, Schwarz)
  function info(hex) {
    hex = norm(hex);
    let c = cache.get(hex);
    if (c) return c;
    const lab = toLab(hex), C = Math.hypot(lab[1], lab[2]);
    const [r, g, b] = rgb(hex), mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn;
    let h = 0;
    if (dd) { h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h *= 60; if (h < 0) h += 360; }
    const sat = mx ? dd / mx : 0, v = mx, L = lab[0];
    let fam;
    if (C < 7) fam = L > 88 ? 'white' : L < 22 ? 'black' : 'gray';
    else if (h >= 345 || h < 10) fam = L > 65 && sat < 0.6 ? 'pink' : sat < 0.6 && v < 0.35 ? 'brown' : sat < 0.5 && v < 0.75 ? 'rose' : 'red';
    else if (h < 40) fam = sat < 0.45 && v >= 0.7 ? 'beige' : v < 0.7 ? 'brown' : 'orange';
    else if (h < 70) fam = sat < 0.45 && v >= 0.7 && h < 50 ? 'beige' : v < 0.6 ? 'olive' : 'yellow';
    else fam = h < 170 ? 'green' : h < 245 ? 'blue' : h < 320 ? 'purple' : 'pink';
    c = { lab, fam };
    cache.set(hex, c);
    return c;
  }
  const FAM_NEAR = { brown: 'orange beige rose olive', orange: 'brown yellow red', red: 'rose pink orange', rose: 'red pink brown', pink: 'rose red purple', beige: 'brown white yellow',
    yellow: 'orange olive beige', olive: 'yellow green brown', green: 'olive blue', blue: 'purple green', purple: 'blue pink', white: 'gray beige', gray: 'white black', black: 'gray' };
  const NEUTRAL = { white: 1, gray: 1, black: 1 };
  function famPenalty(a, b) {
    if (a === b) return 0;
    if ((' ' + FAM_NEAR[a] + ' ').includes(' ' + b + ' ')) return 5;   // Nachbarfamilie (Braun–Orange, Grün–Blau …)
    if (NEUTRAL[a] || NEUTRAL[b]) return 8;                            // lieber neutral als ein falscher Farbton
    return 14;
  }
  function de2000(A, B, kL) {
    const [L1, a1, b1] = A, [L2, a2, b2] = B, rad = Math.PI / 180;
    const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2, C7 = Math.pow(Cb, 7);
    const G = 0.5 * (1 - Math.sqrt(C7 / (C7 + 6103515625)));
    const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const hp = (x, y) => { if (!x && !y) return 0; const h = Math.atan2(y, x) / rad; return h < 0 ? h + 360 : h; };
    const h1p = hp(a1p, b1), h2p = hp(a2p, b2);
    let dhp = 0;
    if (C1p * C2p) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
    const dLp = L2 - L1, dCp = C2p - C1p, dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * rad / 2);
    const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
    let hbp = h1p + h2p;
    if (C1p * C2p) hbp = Math.abs(h1p - h2p) > 180 ? (h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2) : (h1p + h2p) / 2;
    const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
    const Cb7 = Math.pow(Cbp, 7), RC = 2 * Math.sqrt(Cb7 / (Cb7 + 6103515625));
    const SL = 1 + 0.015 * (Lbp - 50) * (Lbp - 50) / Math.sqrt(20 + (Lbp - 50) * (Lbp - 50)), SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
    const RT = -Math.sin(60 * Math.exp(-Math.pow((hbp - 275) / 25, 2)) * rad) * RC;
    const l = dLp / (kL * SL), c = dCp / SC, h = dHp / SH;
    return Math.sqrt(Math.max(0, l * l + c * c + h * h + RT * c * h));
  }
  // Farbabstand: etwa halb so gross wie ΔE76; unter ~5 kaum zu unterscheiden, über ~12 deutlich anders
  function dist(a, b) {
    const A = info(a), B = info(b);
    return de2000(A.lab, B.lab, 2) + famPenalty(A.fam, B.fam);
  }
  const Q_HIGH = 5, Q_MID = 12;
  function quality(d) { return d <= Q_HIGH ? 'high' : d <= Q_MID ? 'mid' : 'low'; }

  // ---------------------------------------------------------------- Material und Bewertung
  function baseMat(m) { return String(m || '').trim().split(/\s+/)[0].toUpperCase().replace(/[^A-Z0-9-]/g, ''); }
  const SAME_TOL = 4;                                   // «praktisch gleich» (innerhalb «sehr ähnlich»): geladen/eigenes Lager gewinnt
  const KIND_RANK = { loaded: 0, stock: 1, own: 1, catalog: 2 };
  const FILL_PEN = { crit: 6, low: 3 };
  function sameMat(fm, c) { return !fm || !c.material || baseMat(c.material) === fm; }
  // Alle Kandidaten für eine Dateifarbe, beste zuerst (mit Material- und Quellen-Regel)
  function rank(fileHex, fileMat, cands) {
    const fm = baseMat(fileMat);
    const list = cands.map((c) => {
      const d = dist(fileHex, c.hex);
      return { cand: c, d, quality: quality(d), sameMat: sameMat(fm, c), s: d + (FILL_PEN[c.fill] || 0) };
    });
    // Gleiches Material zählt nur, wenn davon mindestens eines «ähnlich» ist
    const matOk = list.some((x) => x.sameMat && x.s <= Q_MID);
    const eff = (x) => x.s + (matOk && !x.sameMat ? 100 : 0);
    list.sort((a, b) => eff(a) - eff(b) || (KIND_RANK[a.cand.kind] || 0) - (KIND_RANK[b.cand.kind] || 0));
    // Quellen-Vorrang bei praktisch gleicher Farbe: geladen vor Lager vor Katalog
    if (list.length > 1) {
      const top = eff(list[0]);
      let bi = 0;
      for (let k = 1; k < list.length && eff(list[k]) <= top + SAME_TOL; k++) {
        if ((KIND_RANK[list[k].cand.kind] || 0) < (KIND_RANK[list[bi].cand.kind] || 0)) bi = k;
      }
      if (bi) list.unshift(list.splice(bi, 1)[0]);
    }
    return list;
  }

  // ---------------------------------------------------------------- Zuordnung aller Dateifarben
  /* opts:
   *   colors  [{ idx, hex, material, share }]
   *   loaded  [{ key, hex, material, kind:'loaded', tool, fill? }]   – was im Drucker steckt (inkl. eigene Farbe von Hand)
   *   stock   [{ key, hex, material, kind:'stock', fill? }]           – eigenes Lager
   *   nTools  Anzahl Tools/Slots
   *   empty   [bool] pro Tool (Index 0 = T1): nichts geladen
   *   known   [bool] pro Tool: Spooly kennt den Slot (bevorzugt für Lager-Spulen)
   *   toolHex [hex|null] pro Tool: bisherige Farbe (für «ähnlich durch ähnlich»)
   *   fixed   { idx: { cand?, tool? } } – von Hand gesetzt, wird nicht verändert
   * Ergebnis: { rows: { idx: { cand, tool, d, quality, shared, fixed } }, planned: { tool: cand }, noRoom: [idx] }
   */
  function solve(opts) {
    const n = opts.nTools;
    const loaded = (opts.loaded || []).filter((c) => c.tool >= 1 && c.tool <= n);
    const stock = opts.stock || [];
    const fixed = opts.fixed || {};
    const toolHex = opts.toolHex || [];
    const empty = opts.empty || [];
    const known = opts.known || [];
    const colors = [...opts.colors].sort((a, b) => (b.share || 0) - (a.share || 0) || a.idx - b.idx);
    const toolCand = {};                  // tool → cand, das dort gedruckt wird (geladen oder geplant)
    const rows = {};
    const loadedAt = (tn) => loaded.find((c) => c.tool === tn) || null;
    // 1) Von Hand gesetzte Zeilen zuerst – sie belegen ihre Tools
    for (const c of colors) {
      const f = fixed[c.idx];
      if (!f) continue;
      let cand = f.cand || null, tool = f.tool || 0;
      if (!cand && tool) cand = loadedAt(tool);                 // nur Tool gewählt: was dort steckt
      if (cand && !tool && cand.kind === 'loaded') tool = cand.tool;
      rows[c.idx] = { cand, tool, fixed: true };
      if (tool && cand && !toolCand[tool]) toolCand[tool] = cand;
    }
    // Tool aus einer Handzuordnung nur mit Tool (ohne Filament): später mit dem dort geplanten Filament füllen
    // 2) Wahl pro Farbe (noch ohne Tool für Lager-Spulen)
    const blocked = (c) => c.kind === 'loaded' && toolCand[c.tool] && toolCand[c.tool].key !== c.key;  // Tool von Hand anders belegt
    const usable = loaded.filter((c) => !blocked(c));
    for (const c of colors) {
      if (rows[c.idx]) continue;
      const r = rank(c.hex, c.material, usable.concat(stock));
      if (!r.length) { rows[c.idx] = { cand: null, tool: 0 }; continue; }
      rows[c.idx] = { cand: r[0].cand, tool: r[0].cand.kind === 'loaded' ? r[0].cand.tool : 0, alt: r };
    }
    // 3) Benötigte Tools: geladen und gewählt, oder von Hand belegt
    const needed = new Set();
    for (const idx in rows) if (rows[idx].tool) needed.add(rows[idx].tool);
    for (const idx in rows) { const r = rows[idx]; if (r.tool && r.cand && !toolCand[r.tool]) toolCand[r.tool] = r.cand; }
    // 4) Lager-Spulen und von Hand gewählte Filamente ohne Tool verteilen, grösster Flächenanteil zuerst
    const want = new Map();
    for (const c of colors) {
      const r = rows[c.idx];
      if (!r.cand || r.tool) continue;
      const w = want.get(r.cand.key) || { cand: r.cand, share: 0, idxs: [] };
      w.share += c.share || 0; w.idxs.push(c.idx); want.set(r.cand.key, w);
    }
    let spare = [];
    for (let tn = 1; tn <= n; tn++) if (!needed.has(tn) && !empty[tn - 1] && toolHex[tn - 1]) spare.push(tn);
    const empties = [];
    for (let tn = 1; tn <= n; tn++) if (!needed.has(tn) && !spare.includes(tn)) empties.push(tn);
    empties.sort((a, b) => (known[b - 1] ? 1 : 0) - (known[a - 1] ? 1 : 0) || a - b);
    const noRoom = [];
    for (const w of [...want.values()].sort((a, b) => b.share - a.share)) {
      let tn = 0;
      spare.sort((a, b) => dist(toolHex[a - 1], w.cand.hex) - dist(toolHex[b - 1], w.cand.hex) || a - b);
      if (spare.length && dist(toolHex[spare[0] - 1], w.cand.hex) < 8) tn = spare.shift();      // praktisch gleiche Farbe
      else if (empties.length) tn = empties.shift();
      else if (spare.length) tn = spare.shift();
      if (tn) {
        toolCand[tn] = w.cand; needed.add(tn);
        for (const idx of w.idxs) rows[idx].tool = tn;
      } else {
        // Kein Tool frei: Tool mit der ähnlichsten schon gewählten Spule mitbenutzen
        for (const idx of w.idxs) {
          const fc = colors.find((c) => c.idx === idx);
          let best = 0, bd = Infinity;
          for (const t in toolCand) { const d = dist(fc.hex, toolCand[t].hex); if (d < bd) { bd = d; best = +t; } }
          if (!best) for (const l of loaded) { const d = dist(fc.hex, l.hex); if (d < bd) { bd = d; best = l.tool; } }
          rows[idx].cand = best ? (toolCand[best] || loadedAt(best)) : rows[idx].cand;
          rows[idx].tool = best || 0;
          rows[idx].shared = !!best;
          noRoom.push(idx);
        }
      }
    }
    // 5) Von Hand nur ein Tool gewählt, dort aber nichts: das dort geplante Filament übernehmen
    for (const c of colors) {
      const r = rows[c.idx];
      if (r.tool && !r.cand) r.cand = toolCand[r.tool] || null;
    }
    // 6) Abstand, Qualität und «teilt sich ein Tool» für alle Zeilen
    const byTool = {};
    for (const c of colors) { const r = rows[c.idx]; if (r.tool) (byTool[r.tool] = byTool[r.tool] || []).push(c.idx); }
    const out = {};
    for (const c of colors) {
      const r = rows[c.idx];
      const d = r.cand ? dist(c.hex, r.cand.hex) : Infinity;
      out[c.idx] = { cand: r.cand, tool: r.tool, d, quality: r.cand ? quality(d) : 'low', shared: !!(r.tool && byTool[r.tool].length > 1), noRoom: noRoom.includes(c.idx), fixed: !!r.fixed };
    }
    // Konflikt: zwei Zeilen wollen verschiedene Filamente im selben Tool (nur bei Handzuordnungen möglich)
    const conflicts = [];
    for (const t in byTool) {
      const keys = new Set(byTool[t].map((idx) => out[idx].cand && out[idx].cand.key));
      if (keys.size > 1) conflicts.push(+t);
    }
    const planned = {};
    for (const t in toolCand) planned[t] = toolCand[t];
    return { rows: out, planned, noRoom, conflicts };
  }

  return { norm, info, dist, quality, rank, solve, baseMat, Q_HIGH, Q_MID, SAME_TOL };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Match;
