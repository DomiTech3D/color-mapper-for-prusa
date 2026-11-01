// Color Mapper for Prusa – Copyright (C) 2026 DomiTech3D
// SPDX-License-Identifier: GPL-3.0-only – additional terms (attribution) in NOTICE.md
// Roundtrip test: load a 3MF, export with a reversed mapping, reload and check that every painted
// triangle moved to the expected tool; then map back and compare with the original.
// Usage: node app/test/roundtrip.js demo/benchy_8t.3mf [more.3mf …]
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../core.js')();
let failed = false;

function hist(proj) {
  // Blatt-Zustände (effektiv, 0 -> Volume-Default) über alle Dreiecke zählen
  const h = new Map();
  let tris = 0, bad = 0;
  for (const od of proj.objDefs) for (const v of od.volumes) {
    if (v.type !== 'ModelPart') continue;
    const def = v.extruder || od.extruder || 1;
    for (const pc of v.pieces) {
      const m = pc.mesh, b = pc.bytes;
      for (let t = pc.t0; t < pc.t1; t++) {
        tris++;
        const ps = m.mm[t * 2];
        if (ps < 0) { h.set(def, (h.get(def) || 0) + 1); continue; }
        const s = Buffer.from(b.subarray(ps, ps + m.mm[t * 2 + 1])).toString('latin1');
        let leaves;
        try { leaves = core.decodeLeaves(s); } catch (e) { bad++; continue; }
        for (const l of leaves) { const st = l || def; h.set(st, (h.get(st) || 0) + 1); }
      }
    }
  }
  return { h: [...h.entries()].sort((a, b) => a[0] - b[0]), tris, bad };
}

(async () => {
  const files = process.argv.slice(2);
  for (const f of files) {
    const t0 = Date.now();
    const buf = fs.readFileSync(f);
    const proj = await core.loadProject(new Uint8Array(buf), path.basename(f), () => {});
    const t1 = Date.now();
    const sum = core.summary(proj);
    console.log('==', path.basename(f), sum.kind, 'objects', sum.objects, 'tris', sum.triangles, 'plates', JSON.stringify(sum.plates), 'load ms', t1 - t0);
    console.log('   filaments', sum.filaments.map((x) => x.idx + ':' + x.color + ' ' + x.name).join(' | '));
    const pv = core.buildPreview(proj, 0);
    const t2 = Date.now();
    console.log('   preview tris', pv.triangles, 'capped', pv.capped, 'size', pv.size.map((x) => x.toFixed(1)).join('x'), 'used', pv.used.map((u) => u.idx + ':' + (u.share * 100).toFixed(1) + '%').join(' '), 'ms', t2 - t1);
    let bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (let i = 0; i < pv.positions.length; i += 3) for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], pv.positions[i + k]); bb[k + 3] = Math.max(bb[k + 3], pv.positions[i + k]); }
    console.log('   preview bbox', bb.map((x) => x.toFixed(1)).join(' '));
    const h0 = hist(proj);
    console.log('   orig hist', JSON.stringify(h0.h), 'bad', h0.bad);
    // Zuordnung: Filament s -> Tool (9 - s) (umkehren), um Wirkung zu sehen
    const n = Math.max(8, sum.filaments.length);
    const map = [0]; for (let s = 1; s <= n; s++) map.push(((8 - s) % 8 + 8) % 8 + 1);
    const res = await core.exportProject(proj, 0, map, () => {});
    const t3 = Date.now();
    const outBuf = new Uint8Array(await res.blob.arrayBuffer());
    const outName = path.join(os.tmpdir(), path.basename(f).replace(/\.3mf$/i, '') + '_INDX.3mf');
    fs.writeFileSync(outName, outBuf);
    console.log('   export bytes', outBuf.length, 'ms', t3 - t2, '->', outName);
    const proj2 = await core.loadProject(outBuf, 'out', () => {});
    const sum2 = core.summary(proj2);
    const h1 = hist(proj2);
    console.log('   out kind', sum2.kind, 'tris', sum2.triangles, 'hist', JSON.stringify(h1.h), 'bad', h1.bad);
    // erwartete Histogramm-Abbildung
    const exp = new Map();
    for (const [st, c] of h0.h) { const ns = map[st] || st; exp.set(ns, (exp.get(ns) || 0) + c); }
    const ok = JSON.stringify([...exp.entries()].sort((a, b) => a[0] - b[0])) === JSON.stringify(h1.h) && h0.tris === h1.tris;
    if (!ok) failed = true;
    console.log('   MAPPING CHECK', ok ? 'OK' : 'MISMATCH', JSON.stringify([...exp.entries()].sort((a, b) => a[0] - b[0])));
    const pv2 = core.buildPreview(proj2, 0);
    let bb2 = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (let i = 0; i < pv2.positions.length; i += 3) for (let k = 0; k < 3; k++) { bb2[k] = Math.min(bb2[k], pv2.positions[i + k]); bb2[k + 3] = Math.max(bb2[k + 3], pv2.positions[i + k]); }
    console.log('   out preview tris', pv2.triangles, 'bbox', bb2.map((x) => x.toFixed(1)).join(' '));
    // Prusa -> Prusa: zurück umkehren
    const res2 = await core.exportProject(proj2, 0, map, () => {});
    const back = new Uint8Array(await res2.blob.arrayBuffer());
    fs.writeFileSync(outName.replace('_INDX.3mf', '_INDX_back.3mf'), back);
    const proj3 = await core.loadProject(back, 'back', () => {});
    const h3 = hist(proj3);
    const same = JSON.stringify(h3.h) === JSON.stringify(h0.h);
    if (!same || h0.bad || h1.bad) failed = true;
    console.log('   ROUNDTRIP CHECK', same ? 'OK' : 'MISMATCH ' + JSON.stringify(h3.h));
  }
  if (!files.length) { console.error('usage: node app/test/roundtrip.js file.3mf …'); process.exit(2); }
  console.log(failed ? 'FAILED' : 'ALL OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
