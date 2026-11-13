// Unit-Tests für den Farbabgleich (node app/test/match.test.js) – ohne Abhängigkeiten
const assert = require('assert');
const M = require('../match.js');

let n = 0, failed = 0;
function test(name, fn) {
  n++;
  try { fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); }
}
const L = (tool, hex, material, key) => ({ key: key || 'T' + tool, hex, material, kind: 'loaded', tool });
const St = (key, hex, material, fill) => ({ key, hex, material, kind: 'stock', fill });
const solve1 = (hex, material, loaded, stock, extra) => M.solve(Object.assign({ colors: [{ idx: 1, hex, material, share: 1 }], loaded, stock, nTools: 8,
  toolHex: loaded.reduce((a, c) => { a[c.tool - 1] = c.hex; return a; }, []), empty: [...Array(8)].map((_, i) => !loaded.some((c) => c.tool === i + 1)) }, extra || {})).rows[1];

// ---------------------------------------------------------------- Farbe
test('gleiche Farbe hat Abstand 0 und ist «sehr ähnlich»', () => { assert.ok(M.dist('#1E5631', '#1e5631') < 0.01); assert.strictEqual(M.quality(0), 'high'); });
test('#RRGGBBAA aus OpenPrintTag wird verstanden', () => { assert.strictEqual(M.norm('#617512ff'), '#617512'); assert.ok(M.dist('#617512ff', '#617512') < 0.01); });
test('Farbfamilien: Dunkelgrün ist grün, Schwarz schwarz, Petrol blau', () => {
  assert.strictEqual(M.info('#164B35').fam, 'green'); assert.strictEqual(M.info('#000000').fam, 'black'); assert.strictEqual(M.info('#00676B').fam, 'blue');
});
for (const g of ['#1E5631', '#164B35', '#0B3D2E']) {
  test('Abstand: ' + g + ' liegt näher bei Grün/Petrol als bei Schwarz', () => {
    assert.ok(M.dist(g, '#2E9E35') < M.dist(g, '#000000'));
    assert.ok(M.dist(g, '#00676B') < M.dist(g, '#000000'));
  });
}
test('Braun liegt näher bei Braun als bei Rot oder Altrosa', () => {
  for (const b of ['#6F4E37', '#5C3A21', '#8B4513', '#795548']) {
    assert.ok(M.dist(b, '#9E744A') < M.dist(b, '#BC2726'), b + ' vs Rot');
    assert.ok(M.dist(b, '#9E744A') < M.dist(b, '#976664'), b + ' vs Altrosa');
  }
});

// ---------------------------------------------------------------- Abnahme: Dunkelgrün wird nicht zu Schwarz
test('Dunkelgrün PLA: Grün aus dem Lager statt geladenem Schwarz, auch in anderem Material', () => {
  const r = solve1('#164B35', 'PLA', [L(4, '#000000', 'PLA')], [St('s1', '#1F5C3A', 'PETG'), St('s2', '#00676B', 'PETG')]);
  assert.strictEqual(r.cand.key, 's1'); assert.notStrictEqual(r.tool, 4);
});
test('Dunkelgrün: Türkis/Petrol statt Schwarz, wenn kein Grün da ist', () => {
  const r = solve1('#164B35', 'PLA', [L(4, '#000000', 'PLA'), L(1, '#FFFFFF', 'PLA')], [St('pet', '#00676B', 'PLA')]);
  assert.strictEqual(r.cand.key, 'pet');
});
test('Dunkelgrün: geladenes Grün wird genommen', () => {
  const r = solve1('#1E5631', 'PLA', [L(4, '#000000', 'PLA'), L(6, '#2E9E35', 'PLA')], []);
  assert.strictEqual(r.tool, 6);
});

// ---------------------------------------------------------------- Material und Quellen-Vorrang
test('Gleiches Material gewinnt, wenn es mindestens «ähnlich» ist', () => {
  const r = solve1('#C12E1F', 'PLA', [], [St('petg', '#C12E1F', 'PETG'), St('pla', '#BC2726', 'PLA')]);
  assert.strictEqual(r.cand.key, 'pla');
});
test('Anderes Material, wenn im eigenen Material nichts passt', () => {
  const r = solve1('#C12E1F', 'PLA', [], [St('petg', '#C12E1F', 'PETG'), St('pla', '#0A2989', 'PLA')]);
  assert.strictEqual(r.cand.key, 'petg');
});
test('Geladen gewinnt bei praktisch gleicher Farbe', () => {
  const r = solve1('#C12E1F', 'PLA', [L(3, '#BC2726', 'PLA')], [St('s', '#C12E1F', 'PLA')]);
  assert.strictEqual(r.tool, 3); assert.strictEqual(r.cand.kind, 'loaded');
});
test('Lager gewinnt, wenn es deutlich besser passt', () => {
  const r = solve1('#C12E1F', 'PLA', [L(3, '#E07A5F', 'PLA')], [St('s', '#C12E1F', 'PLA')]);
  assert.strictEqual(r.cand.key, 's');
});
test('Fast leere Spule kommt nach hinten', () => {
  const r = solve1('#C12E1F', 'PLA', [], [St('leer', '#C12E1F', 'PLA', 'crit'), St('voll', '#C42F22', 'PLA')]);
  assert.strictEqual(r.cand.key, 'voll');
});
test('Rangliste liefert Alternativen mit Qualität', () => {
  const r = M.rank('#164B35', 'PLA', [St('a', '#1F5C3A', 'PLA'), St('b', '#00676B', 'PLA'), St('c', '#000000', 'PLA'), St('d', '#2E9E35', 'PLA')]);
  assert.strictEqual(r[0].cand.key, 'a'); assert.strictEqual(r[0].quality, 'high');
  assert.strictEqual(r[r.length - 1].cand.key, 'c'); assert.strictEqual(r[r.length - 1].quality, 'low');
});

// ---------------------------------------------------------------- Tool-Vergabe
test('Lager-Spule: zuerst ins Tool mit praktisch gleicher Farbe (Schwarz PLA ins schwarze ASA-Tool)', () => {
  const r = M.solve({ colors: [{ idx: 1, hex: '#000000', material: 'PLA', share: 1 }], loaded: [L(4, '#000000', 'ASA')], stock: [St('blk', '#000000', 'PLA')], nTools: 8,
    toolHex: [null, null, null, '#000000'], empty: [true, true, true, false, true, true, true, true] }).rows[1];
  assert.strictEqual(r.cand.key, 'blk'); assert.strictEqual(r.tool, 4);
});
test('Lager-Spule: sonst in einen leeren Slot, bekannte Slots zuerst', () => {
  const r = M.solve({ colors: [{ idx: 1, hex: '#E8A5CC', material: 'PLA', share: 1 }], loaded: [L(1, '#FFFFFF', 'PLA')], stock: [St('pink', '#E8A5CC', 'PLA')], nTools: 4,
    toolHex: ['#FFFFFF'], empty: [false, true, true, true], known: [true, false, true, true] }).rows[1];
  assert.strictEqual(r.tool, 3);
});
test('Alle belegt: ähnlich durch ähnlich, benötigte Tools bleiben', () => {
  const loaded = [L(1, '#FFFFFF', 'PLA'), L(2, '#000000', 'PLA'), L(3, '#BC2726', 'PLA'), L(4, '#0A2989', 'PLA')];
  const res = M.solve({ colors: [{ idx: 1, hex: '#FFFFFF', material: 'PLA', share: 0.5 }, { idx: 2, hex: '#E8A5CC', material: 'PLA', share: 0.5 }],
    loaded, stock: [St('pink', '#E8A5CC', 'PLA')], nTools: 4, toolHex: loaded.map((c) => c.hex), empty: [false, false, false, false] });
  assert.strictEqual(res.rows[1].tool, 1);
  assert.strictEqual(res.rows[2].tool, 3, 'Rosa ersetzt Rot, nicht Schwarz oder Weiss');
});
test('Zwei Dateifarben, dieselbe Spule: gleiches Tool, «teilt sich»', () => {
  const res = M.solve({ colors: [{ idx: 1, hex: '#FFFFFF', share: 0.5 }, { idx: 2, hex: '#F7F7F7', share: 0.5 }], loaded: [L(1, '#FFFFFF')], stock: [], nTools: 2, toolHex: ['#FFFFFF'], empty: [false, true] });
  assert.strictEqual(res.rows[1].tool, 1); assert.strictEqual(res.rows[2].tool, 1); assert.ok(res.rows[1].shared && res.rows[2].shared);
});
test('Mehr Farben als Tools: die überzählige teilt sich das ähnlichste Tool', () => {
  const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF8800'].map((hex, i) => ({ idx: i + 1, hex, share: 0.2 - i * 0.01 }));
  const stock = colors.map((c) => St('s' + c.idx, c.hex));
  const res = M.solve({ colors, loaded: [], stock, nTools: 4, toolHex: [], empty: [true, true, true, true] });
  const tools = Object.values(res.rows).map((r) => r.tool);
  assert.ok(tools.every((t) => t >= 1 && t <= 4), 'jede Farbe hat ein Tool');
  assert.strictEqual(res.noRoom.length, 1);
  assert.strictEqual(res.rows[5].tool, res.rows[1].tool, 'Orange teilt sich das Tool mit Rot');
});

// ---------------------------------------------------------------- Abnahme: Handzuordnung bleibt, keine andere Zeile ändert sich
test('Handzuordnung bleibt erhalten und verändert keine andere Zeile', () => {
  const loaded = [L(1, '#FFFFFF', 'PLA'), L(2, '#000000', 'PLA'), L(3, '#2E9E35', 'PLA'), L(4, '#BC2726', 'PLA')];
  const base = { colors: [{ idx: 1, hex: '#FFFFFF', share: 0.4 }, { idx: 2, hex: '#1E5631', share: 0.3 }, { idx: 3, hex: '#C12E1F', share: 0.3 }],
    loaded, stock: [St('g2', '#00AE42', 'PLA')], nTools: 4, toolHex: loaded.map((c) => c.hex), empty: [false, false, false, false] };
  const before = M.solve(base).rows;
  const after = M.solve(Object.assign({}, base, { fixed: { 2: { cand: St('g2', '#00AE42', 'PLA') } } })).rows;
  assert.strictEqual(after[2].cand.key, 'g2'); assert.ok(after[2].fixed);
  assert.strictEqual(after[1].tool, before[1].tool); assert.strictEqual(after[3].tool, before[3].tool);
  assert.strictEqual(after[1].cand.key, before[1].cand.key); assert.strictEqual(after[3].cand.key, before[3].cand.key);
});
test('Von Hand nur ein Tool gewählt: Zeile druckt mit dem, was dort steckt', () => {
  const loaded = [L(1, '#FFFFFF'), L(2, '#000000')];
  const r = M.solve({ colors: [{ idx: 1, hex: '#FFFFFF', share: 1 }], loaded, stock: [], nTools: 2, toolHex: ['#FFFFFF', '#000000'], empty: [false, false], fixed: { 1: { tool: 2 } } }).rows[1];
  assert.strictEqual(r.tool, 2); assert.strictEqual(r.cand.key, 'T2'); assert.strictEqual(r.quality, 'low');
});
test('Ein von Hand belegtes Tool wird von der Automatik nicht genommen', () => {
  const loaded = [L(1, '#FFFFFF'), L(2, '#000000')];
  const res = M.solve({ colors: [{ idx: 1, hex: '#FFFFFF', share: 0.5 }, { idx: 2, hex: '#111111', share: 0.5 }], loaded, stock: [], nTools: 2, toolHex: ['#FFFFFF', '#000000'], empty: [false, false],
    fixed: { 1: { cand: St('rot', '#FF0000'), tool: 2 } } });
  assert.strictEqual(res.rows[1].tool, 2);
  assert.notStrictEqual(res.rows[2].cand.key, 'T2', 'schwarz in T2 ist durch die Handzuordnung ersetzt');
});
test('Konflikt: zwei Handzuordnungen, verschiedene Filamente, gleiches Tool', () => {
  const res = M.solve({ colors: [{ idx: 1, hex: '#FFFFFF', share: 0.5 }, { idx: 2, hex: '#000000', share: 0.5 }], loaded: [], stock: [], nTools: 2, toolHex: [], empty: [true, true],
    fixed: { 1: { cand: St('w', '#FFFFFF'), tool: 1 }, 2: { cand: St('b', '#000000'), tool: 1 } } });
  assert.deepStrictEqual(res.conflicts, [1]);
});
test('Ergebnis ist bei gleichen Daten immer gleich', () => {
  const loaded = [L(1, '#FFFFFF'), L(2, '#000000'), L(3, '#BC2726')];
  const o = { colors: ['#FFFFFF', '#222222', '#C12E1F', '#E8A5CC'].map((hex, i) => ({ idx: i + 1, hex, share: 0.25 })), loaded, stock: [St('p', '#E8A5CC')], nTools: 4, toolHex: loaded.map((c) => c.hex), empty: [false, false, false, true] };
  assert.strictEqual(JSON.stringify(M.solve(o).rows), JSON.stringify(M.solve(o).rows));
});

console.log(failed ? failed + ' von ' + n + ' Tests FEHLGESCHLAGEN' : 'alle ' + n + ' Tests ok');
process.exit(failed ? 1 : 0);
