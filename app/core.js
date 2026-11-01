// Color Mapper for Prusa – Copyright (C) 2026 DomiTech3D
// SPDX-License-Identifier: GPL-3.0-only – additional terms (attribution) in NOTICE.md
// Color Mapper for Prusa – Kern (läuft im Web Worker, im Hauptthread oder in Node).
// Keine externen Abhängigkeiten: ZIP über (De)CompressionStream, XML über Byte-Scanner.
function coreFactory() {
  'use strict';
  const te = new TextEncoder();
  const td = new TextDecoder();

  // ------------------------------------------------------------------ Texte (en/de)
  let lang = 'en';
  const MSG = {
    en: {
      notZip: 'This is not a valid 3MF file (not a ZIP archive).',
      badZip: 'Damaged ZIP archive: {0}',
      badMethod: 'Unsupported ZIP compression ({0}) in {1}',
      tooBig: 'The file is getting too large (over 4 GB).',
      unpack: 'Unpacking archive …',
      noModel: 'The file has no 3D/3dmodel.model – is it really a 3MF?',
      readModel: 'Reading model …',
      reading: 'Reading {0} …',
      done: 'Done',
      wSettings: 'project_settings.config could not be read.',
      wExtItem: 'Skipped a build item with an external path.',
      object: 'Object {0}',
      objectAny: 'object',
      writing: 'Writing {0} …',
      compress: 'Compressing …',
      compressModel: 'Compressing model …',
      compressing: 'Compressing {0} …',
      repaint: 'Remapping paint in {0} …',
      wFacets: 'Slic3r_facets_annotation.json could not be updated.',
      wPs3: 'PrusaSlicer3_project.json could not be updated.',
    },
    de: {
      notZip: 'Das ist keine gültige 3MF-Datei (kein ZIP-Archiv).',
      badZip: 'Beschädigtes ZIP-Archiv: {0}',
      badMethod: 'Nicht unterstützte ZIP-Kompression ({0}) in {1}',
      tooBig: 'Die Datei wird zu gross (über 4 GB).',
      unpack: 'Entpacke Archiv …',
      noModel: 'In der Datei fehlt 3D/3dmodel.model – ist das wirklich eine 3MF?',
      readModel: 'Lese Modell …',
      reading: 'Lese {0} …',
      done: 'Fertig',
      wSettings: 'project_settings.config konnte nicht gelesen werden.',
      wExtItem: 'Build-Item mit externem Pfad übersprungen.',
      object: 'Objekt {0}',
      objectAny: 'Objekt',
      writing: 'Schreibe {0} …',
      compress: 'Komprimiere …',
      compressModel: 'Komprimiere Modell …',
      compressing: 'Komprimiere {0} …',
      repaint: 'Ordne Bemalung in {0} neu zu …',
      wFacets: 'Slic3r_facets_annotation.json konnte nicht angepasst werden.',
      wPs3: 'PrusaSlicer3_project.json konnte nicht angepasst werden.',
    },
  };
  function M(key, ...a) {
    const s = (MSG[lang] && MSG[lang][key]) || MSG.en[key] || key;
    return s.replace(/\{(\d)\}/g, (_, i) => String(a[+i]));
  }
  function setLang(l) { if (MSG[l]) lang = l; }

  // ------------------------------------------------------------------ CRC32
  const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  function crc32(u8) {
    let c = -1;
    const T = CRC_TABLE;
    for (let i = 0, n = u8.length; i < n; i++) c = T[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }

  // ------------------------------------------------------------------ ZIP
  async function streamToU8(stream, sizeHint) {
    const reader = stream.getReader();
    if (sizeHint > 0) {
      let out = new Uint8Array(sizeHint), len = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (len + value.length > out.length) {
          const nb = new Uint8Array(Math.max(out.length * 2, len + value.length));
          nb.set(out.subarray(0, len)); out = nb;
        }
        out.set(value, len); len += value.length;
      }
      return len === out.length ? out : out.slice(0, len);
    }
    const chunks = []; let len = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value); len += value.length;
    }
    const out = new Uint8Array(len); let p = 0;
    for (const c of chunks) { out.set(c, p); p += c.length; }
    return out;
  }
  function inflateRaw(u8, size) {
    return streamToU8(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw')), size);
  }
  function deflateRaw(u8) {
    return streamToU8(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw')), 0);
  }

  function readZipDirectory(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error(M('notZip'));
    let count = dv.getUint16(eocd + 10, true);
    let cdOff = dv.getUint32(eocd + 16, true);
    if (cdOff === 0xFFFFFFFF || count === 0xFFFF) {
      const loc = eocd - 20;
      if (loc >= 0 && dv.getUint32(loc, true) === 0x07064b50) {
        const z = Number(dv.getBigUint64(loc + 8, true));
        if (dv.getUint32(z, true) === 0x06064b50) {
          count = Number(dv.getBigUint64(z + 32, true));
          cdOff = Number(dv.getBigUint64(z + 48, true));
        }
      }
    }
    const entries = [];
    let p = cdOff;
    for (let k = 0; k < count; k++) {
      if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      let csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      let lho = dv.getUint32(p + 42, true);
      const name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
      let xp = p + 46 + nlen; const xe = xp + xlen;
      while (xp + 4 <= xe) {
        const id = dv.getUint16(xp, true), sz = dv.getUint16(xp + 2, true);
        if (id === 1) {
          let q = xp + 4;
          if (usize === 0xFFFFFFFF) { usize = Number(dv.getBigUint64(q, true)); q += 8; }
          if (csize === 0xFFFFFFFF) { csize = Number(dv.getBigUint64(q, true)); q += 8; }
          if (lho === 0xFFFFFFFF) { lho = Number(dv.getBigUint64(q, true)); q += 8; }
        }
        xp += 4 + sz;
      }
      entries.push({ name, method, csize, usize, lho });
      p += 46 + nlen + xlen + clen;
    }
    for (const e of entries) {
      if (dv.getUint32(e.lho, true) !== 0x04034b50) throw new Error(M('badZip', e.name));
      e.dataStart = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true);
    }
    return entries;
  }

  async function extractEntry(u8, e) {
    const raw = u8.subarray(e.dataStart, e.dataStart + e.csize);
    if (e.method === 0) return raw.slice();
    if (e.method === 8) return inflateRaw(raw, e.usize);
    throw new Error(M('badMethod', e.method, e.name));
  }

  function dosDateTime(d) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
  }

  // files: [{name, data: Uint8Array, store?: bool}] -> Blob
  async function buildZip(files, onFile) {
    const { time, date } = dosDateTime(new Date());
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      if (onFile) onFile(f.name);
      const nameBytes = te.encode(f.name);
      const crc = crc32(f.data);
      let comp = f.data, method = 0;
      if (!f.store && f.data.length > 64) {
        const d = await deflateRaw(f.data);
        if (d.length < f.data.length) { comp = d; method = 8; }
      }
      const lh = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, method, true); lv.setUint16(10, time, true); lv.setUint16(12, date, true);
      lv.setUint32(14, crc, true); lv.setUint32(18, comp.length, true); lv.setUint32(22, f.data.length, true);
      lv.setUint16(26, nameBytes.length, true); lv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);
      const ch = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true); cv.setUint16(10, method, true); cv.setUint16(12, time, true);
      cv.setUint16(14, date, true); cv.setUint32(16, crc, true); cv.setUint32(20, comp.length, true);
      cv.setUint32(24, f.data.length, true); cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      ch.set(nameBytes, 46);
      parts.push(lh, comp); central.push(ch);
      offset += lh.length + comp.length;
      if (offset > 0xFFFFFFFF) throw new Error(M('tooBig'));
    }
    let cdSize = 0;
    for (const c of central) cdSize += c.length;
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    return new Blob([...parts, ...central, eocd], { type: 'application/zip' });
  }

  // ------------------------------------------------------------------ Hilfen
  const DEFAULT_COLORS = ['#F2F2F2', '#1E1E1E', '#D9382E', '#2F6FD6', '#F2C230', '#3A9E54', '#8A4FC8', '#F07F2E',
    '#7FD3E6', '#E68FB8', '#8C6A4F', '#9AA3AB', '#B5E05A', '#1F4F5F', '#FFD9A8', '#5A2E2E'];

  function normColor(c, fallback) {
    if (typeof c !== 'string') return fallback;
    const m = c.trim().match(/^#?([0-9a-fA-F]{6})/);
    return m ? '#' + m[1].toUpperCase() : fallback;
  }
  function decodeEntities(s) {
    if (s.indexOf('&') < 0) return s;
    return s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (m, g) => {
      if (g === 'lt') return '<'; if (g === 'gt') return '>'; if (g === 'amp') return '&';
      if (g === 'quot') return '"'; if (g === 'apos') return "'";
      if (g[1] === 'x') return String.fromCodePoint(parseInt(g.slice(2), 16));
      return String.fromCodePoint(parseInt(g.slice(1), 10));
    });
  }
  function xmlEsc(s) {
    return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
  }
  function attrsOf(str) {
    const o = {}; const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g; let m;
    while ((m = re.exec(str))) o[m[1]] = decodeEntities(m[3] !== undefined ? m[3] : m[4]);
    return o;
  }

  // Transformationen im 3MF-Format (Zeilenvektoren): [m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32]
  const IDENT = Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0);
  function parseTransform(s) {
    if (!s) return IDENT;
    const a = s.trim().split(/\s+/).map(Number);
    if (a.length !== 12 || a.some((x) => !isFinite(x))) return IDENT;
    return Float64Array.from(a);
  }
  // zuerst A, dann B anwenden
  function mulT(A, B) {
    const C = new Float64Array(12);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
      C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
    for (let c = 0; c < 3; c++) C[9 + c] = A[9] * B[c] + A[10] * B[3 + c] + A[11] * B[6 + c] + B[9 + c];
    return C;
  }
  function isIdent(T) {
    for (let i = 0; i < 12; i++) if (Math.abs(T[i] - IDENT[i]) > 1e-12) return false;
    return true;
  }
  function fmtNum(v) {
    if (v === 0 || Math.abs(v) < 1e-9) return '0';
    return String(Number(v.toPrecision(9)));
  }
  function fmtT(T) { return Array.from(T, fmtNum).join(' '); }

  // ------------------------------------------------------------------ Byte-Parser für .model
  function parseNum(b, s, e) {
    let i = s, neg = false, c = b[i];
    if (c === 45) { neg = true; i++; } else if (c === 43) i++;
    let v = 0;
    while (i < e) { c = b[i]; if (c >= 48 && c <= 57) { v = v * 10 + (c - 48); i++; } else break; }
    if (b[i] === 46 && i < e) {
      i++; let f = 0, d = 1;
      while (i < e) { c = b[i]; if (c >= 48 && c <= 57) { f = f * 10 + (c - 48); d *= 10; i++; } else break; }
      v += f / d;
    }
    if (i < e && (b[i] === 101 || b[i] === 69)) {
      i++; let en = false;
      if (b[i] === 45) { en = true; i++; } else if (b[i] === 43) i++;
      let x = 0;
      while (i < e) { c = b[i]; if (c >= 48 && c <= 57) { x = x * 10 + (c - 48); i++; } else break; }
      v *= Math.pow(10, en ? -x : x);
    }
    return neg ? -v : v;
  }
  function parseIntB(b, s, e) {
    let v = 0;
    for (let i = s; i < e; i++) { const c = b[i] - 48; if (c < 0 || c > 9) break; v = v * 10 + c; }
    return v;
  }
  function pat(s) { return te.encode(s); }
  function eqAt(b, p, P) {
    for (let k = 0; k < P.length; k++) if (b[p + k] !== P[k]) return false;
    return true;
  }
  function findBytes(b, P, from) {
    const f = P[0];
    let p = from;
    for (;;) {
      p = b.indexOf(f, p);
      if (p < 0 || p + P.length > b.length) return -1;
      if (eqAt(b, p, P)) return p;
      p++;
    }
  }
  const P_PAINT_COLOR = pat('paint_color');
  const P_MMU = pat('slic3rpe:mmu_segmentation');
  const P_PSUP = pat('paint_supports');
  const P_CSUP = pat('slic3rpe:custom_supports');
  const P_PSEAM = pat('paint_seam');
  const P_CSEAM = pat('slic3rpe:custom_seam');
  const P_FUZZ = pat('slic3rpe:fuzzy_skin');

  function growF64(a, need) { if (need <= a.length) return a; const n = new Float64Array(Math.max(need, a.length * 2)); n.set(a); return n; }
  function growI32(a, need) { if (need <= a.length) return a; const n = new Int32Array(Math.max(need, a.length * 2)); n.set(a); return n; }
  function growU32(a, need) { if (need <= a.length) return a; const n = new Uint32Array(Math.max(need, a.length * 2)); n.set(a); return n; }

  function newMesh() {
    return { nv: 0, vx: new Float64Array(3072), vtag: new Int32Array(2048), nt: 0, t: new Uint32Array(3072), mm: new Int32Array(2048), extra: [] };
  }
  function finishMesh(m) {
    m.vx = m.vx.subarray(0, m.nv * 3); m.vtag = m.vtag.subarray(0, m.nv * 2);
    m.t = m.t.subarray(0, m.nt * 3); m.mm = m.mm.subarray(0, m.nt * 2);
  }

  function readTagAttrs(b, i) {
    // i: direkt nach dem Tag-Namen
    const attrs = {};
    for (;;) {
      let c = b[i];
      while (c === 32 || c === 9 || c === 10 || c === 13) c = b[++i];
      if (c === 47 || c === 63) { while (b[i] !== 62) i++; return { attrs, end: i + 1, selfClose: c === 47 }; }
      if (c === 62) return { attrs, end: i + 1, selfClose: false };
      if (c === undefined) return { attrs, end: b.length, selfClose: true };
      const ns = i;
      while (b[i] !== 61 && b[i] !== 62 && b[i] !== undefined) i++;
      if (b[i] !== 61) continue;
      let ne = i; while (ne > ns && (b[ne - 1] === 32 || b[ne - 1] === 9)) ne--;
      i++;
      while (b[i] !== 34 && b[i] !== 39 && b[i] !== undefined) i++;
      if (b[i] === undefined) return { attrs, end: b.length, selfClose: true };
      const q = b[i++]; const vs = i;
      while (b[i] !== q && b[i] !== undefined) i++;
      attrs[td.decode(b.subarray(ns, ne))] = decodeEntities(td.decode(b.subarray(vs, i)));
      i++;
    }
  }

  function parseModel(b, wantMeta) {
    const n = b.length;
    const out = { objects: new Map(), items: [], meta: {} };
    let p = 0, cur = null, mesh = null;
    for (;;) {
      p = b.indexOf(60, p);
      if (p < 0) break;
      const c1 = b[p + 1];
      if (c1 === 33) {
        if (b[p + 2] === 45) { const e = findBytes(b, pat('-->'), p + 4); p = e < 0 ? b.length : e + 3; }
        else p = b.indexOf(62, p) + 1;
        continue;
      }
      if (c1 === 63) { p = b.indexOf(62, p) + 1; continue; }
      let q = p + 1; if (c1 === 47) q++;
      const ns = q;
      for (;;) { const c = b[q]; if (c === 32 || c === 9 || c === 10 || c === 13 || c === 47 || c === 62 || c === undefined) break; q++; }
      const nl = q - ns, f = b[ns];
      if (c1 === 47) {
        if (nl === 6 && f === 111) { if (mesh) finishMesh(mesh); cur = null; mesh = null; }
        p = b.indexOf(62, q) + 1; if (p === 0) break;
        continue;
      }
      if (f === 118 && nl === 6 && mesh) { // <vertex
        let i = q, x = 0, y = 0, z = 0;
        for (;;) {
          let c = b[i];
          while (c === 32 || c === 9 || c === 10 || c === 13) c = b[++i];
          if (c === 47 || c === 62 || c === undefined) break;
          const as = i;
          while (i < n && b[i] !== 61) i++;
          const al = i - as;
          i++;
          while (i < n && b[i] !== 34 && b[i] !== 39) i++;
          const qc = b[i++]; const vs = i;
          while (i < n && b[i] !== qc) i++;
          if (i >= n) break;
          if (al === 1) { const a = b[as]; const v = parseNum(b, vs, i); if (a === 120) x = v; else if (a === 121) y = v; else if (a === 122) z = v; }
          i++;
        }
        while (i < n && b[i] !== 62) i++;
        if (i >= n) break;
        const k = mesh.nv;
        if ((k + 1) * 3 > mesh.vx.length) { mesh.vx = growF64(mesh.vx, (k + 1) * 3); mesh.vtag = growI32(mesh.vtag, (k + 1) * 2); }
        mesh.vx[k * 3] = x; mesh.vx[k * 3 + 1] = y; mesh.vx[k * 3 + 2] = z;
        mesh.vtag[k * 2] = p; mesh.vtag[k * 2 + 1] = i + 1;
        mesh.nv = k + 1;
        p = i + 1;
        continue;
      }
      if (f === 116 && nl === 8 && mesh) { // <triangle
        let i = q, v1 = 0, v2 = 0, v3 = 0, mmS = -1, mmL = 0, mmPrio = 0;
        const k = mesh.nt;
        for (;;) {
          let c = b[i];
          while (c === 32 || c === 9 || c === 10 || c === 13) c = b[++i];
          if (c === 47 || c === 62 || c === undefined) break;
          const as = i;
          while (i < n && b[i] !== 61) i++;
          const al = i - as;
          i++;
          while (i < n && b[i] !== 34 && b[i] !== 39) i++;
          const qc = b[i++]; const vs = i;
          while (i < n && b[i] !== qc) i++;
          if (i >= n) break;
          const ve = i; i++;
          if (al === 2 && b[as] === 118) {
            const d = b[as + 1], v = parseIntB(b, vs, ve);
            if (d === 49) v1 = v; else if (d === 50) v2 = v; else if (d === 51) v3 = v;
          } else if (al === 11 && eqAt(b, as, P_PAINT_COLOR)) {
            if (mmPrio < 1 && ve > vs) { mmS = vs; mmL = ve - vs; mmPrio = 1; }
          } else if (al === 25 && eqAt(b, as, P_MMU)) {
            if (ve > vs) { mmS = vs; mmL = ve - vs; mmPrio = 2; }
          } else if ((al === 14 && eqAt(b, as, P_PSUP)) || (al === 24 && eqAt(b, as, P_CSUP))) {
            if (ve > vs) mesh.extra.push(k, 1, vs, ve - vs);
          } else if ((al === 10 && eqAt(b, as, P_PSEAM)) || (al === 20 && eqAt(b, as, P_CSEAM))) {
            if (ve > vs) mesh.extra.push(k, 2, vs, ve - vs);
          } else if (al === 19 && eqAt(b, as, P_FUZZ)) {
            if (ve > vs) mesh.extra.push(k, 3, vs, ve - vs);
          }
        }
        while (i < n && b[i] !== 62) i++;
        if (i >= n) break;
        if ((k + 1) * 3 > mesh.t.length) { mesh.t = growU32(mesh.t, (k + 1) * 3); mesh.mm = growI32(mesh.mm, (k + 1) * 2); }
        mesh.t[k * 3] = v1; mesh.t[k * 3 + 1] = v2; mesh.t[k * 3 + 2] = v3;
        mesh.mm[k * 2] = mmS; mesh.mm[k * 2 + 1] = mmL;
        mesh.nt = k + 1;
        p = i + 1;
        continue;
      }
      if (f === 111 && nl === 6) { // <object
        const { attrs, end } = readTagAttrs(b, q);
        cur = { id: String(attrs.id), name: attrs.name || '', type: attrs.type || 'model', mesh: null, components: [] };
        out.objects.set(cur.id, cur);
        p = end; continue;
      }
      if (f === 109 && nl === 4 && cur) { // <mesh
        mesh = cur.mesh = newMesh();
        p = b.indexOf(62, q) + 1; continue;
      }
      if (f === 99 && nl === 9 && cur) { // <component
        const { attrs, end } = readTagAttrs(b, q);
        cur.components.push({ path: normPath(attrs['p:path']), objectid: String(attrs.objectid), transform: parseTransform(attrs.transform) });
        p = end; continue;
      }
      if (f === 105 && nl === 4) { // <item
        const { attrs, end } = readTagAttrs(b, q);
        out.items.push({ objectid: String(attrs.objectid), path: normPath(attrs['p:path']), transform: parseTransform(attrs.transform), printable: attrs.printable !== '0' });
        p = end; continue;
      }
      if (f === 109 && nl === 8 && !cur && wantMeta) { // <metadata
        const { attrs, end, selfClose } = readTagAttrs(b, q);
        if (!selfClose) {
          const close = b.indexOf(60, end);
          if (attrs.name) out.meta[attrs.name] = decodeEntities(td.decode(b.subarray(end, close)));
          p = close;
        } else p = end;
        continue;
      }
      p = b.indexOf(62, q) + 1;
      if (p === 0) break;
    }
    if (mesh) finishMesh(mesh);
    return out;
  }
  function normPath(s) {
    if (!s) return null;
    return s.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
  }

  // ------------------------------------------------------------------ Bemalung (TriangleSelector-Bitstrom)
  function hexVal(c) { return c <= 57 ? c - 48 : (c | 32) - 87; }
  const HEX = '0123456789ABCDEF';

  // Bemalung neu zuordnen: table[state] -> neuer state (state 0 bleibt 0)
  function remapPaintBytes(b, s, len, table) {
    const nib = [];
    let i = s + len - 1;
    const end = s;
    while (i >= end) {
      const code = hexVal(b[i--]);
      if ((code & 3) !== 0) { nib.push(code); continue; }
      let st;
      if ((code & 12) === 12) {
        const n1 = hexVal(b[i--]);
        if (n1 === 14) { const lo = hexVal(b[i--]), hi = hexVal(b[i--]); st = 17 + (lo | (hi << 4)); }
        else st = n1 + 3;
      } else st = code >> 2;
      const ns = st === 0 ? 0 : (table[st] || st);
      if (ns < 3) nib.push(ns << 2);
      else if (ns <= 16) nib.push(12, ns - 3);
      else nib.push(12, 14, (ns - 17) & 15, (ns - 17) >> 4);
    }
    let out = '';
    for (let k = nib.length - 1; k >= 0; k--) out += HEX[nib[k]];
    return out;
  }
  // Prüft die Baumstruktur und liefert die Blätter (für Tests)
  function decodeLeaves(str) {
    const leaves = [];
    let i = str.length - 1;
    const next = () => { if (i < 0) throw new Error('truncated'); return hexVal(str.charCodeAt(i--)); };
    const node = () => {
      const code = next();
      const ss = code & 3;
      if (ss) { for (let k = 0; k <= ss; k++) node(); return; }
      if ((code & 12) === 12) {
        const n1 = next();
        if (n1 === 14) { const lo = next(), hi = next(); leaves.push(17 + (lo | (hi << 4))); }
        else leaves.push(n1 + 3);
      } else leaves.push(code >> 2);
    };
    node();
    if (i !== -1) throw new Error('trailing nibbles');
    return leaves;
  }

  // Geometrische Zerlegung wie PrusaSlicer TriangleSelector::perform_split (Kinder im Strom rückwärts)
  function walkPaint(b, s, len, a, bb, c, sink) {
    const r = { i: s + len - 1, s };
    const mid = (p, q) => [(p[0] + q[0]) * 0.5, (p[1] + q[1]) * 0.5, (p[2] + q[2]) * 0.5];
    const node = (A, B, C) => {
      if (r.i < r.s) return;
      const code = hexVal(b[r.i--]);
      const ss = code & 3;
      if (ss) {
        const sp = code >> 2;
        const t = [A, B, C];
        const v0 = t[sp % 3], v1 = t[(sp + 1) % 3], v2 = t[(sp + 2) % 3];
        if (ss === 1) {
          const m = mid(v2, v1);
          node(m, v2, v0); node(v0, v1, m);
        } else if (ss === 2) {
          const mab = mid(v1, v0), mac = mid(v0, v2);
          node(v1, v2, mac); node(mab, v1, mac); node(v0, mab, mac);
        } else {
          const mab = mid(v1, v0), mbc = mid(v2, v1), mca = mid(v0, v2);
          node(mab, mbc, mca); node(mbc, v2, mca); node(mab, v1, mbc); node(v0, mab, mca);
        }
        return;
      }
      let st;
      if ((code & 12) === 12) {
        const n1 = hexVal(b[r.i--]);
        if (n1 === 14) { const lo = hexVal(b[r.i--]), hi = hexVal(b[r.i--]); st = 17 + (lo | (hi << 4)); }
        else st = n1 + 3;
      } else st = code >> 2;
      sink(A, B, C, st);
    };
    node(a, bb, c);
  }
  function countLeavesBytes(b, s, len) {
    let n = 0;
    for (let i = s + len - 1; i >= s;) {
      const code = hexVal(b[i--]);
      if (code & 3) continue;
      n++;
      if ((code & 12) === 12) { const n1 = hexVal(b[i--]); if (n1 === 14) i -= 2; }
    }
    return n;
  }

  // ------------------------------------------------------------------ Projekt laden
  async function loadProject(input, fileName, progress) {
    progress = progress || (() => {});
    const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
    progress(M('unpack'), 0.05);
    const dir = readZipDirectory(u8);
    const entries = [];
    const byName = new Map();
    let total = 0; for (const e of dir) total += e.usize;
    let done = 0;
    for (const e of dir) {
      if (e.name.endsWith('/')) continue;
      const data = await extractEntry(u8, e);
      done += e.usize;
      progress(M('unpack'), 0.05 + 0.35 * (total ? done / total : 1));
      const name = e.name.replace(/\\/g, '/').replace(/^\/+/, '');
      const ent = { name, data };
      entries.push(ent);
      byName.set(name.toLowerCase(), ent);
    }
    const get = (n) => byName.get(n.toLowerCase());
    const text = (n) => { const e = get(n); return e ? td.decode(e.data) : null; };

    const root = get('3D/3dmodel.model');
    if (!root) throw new Error('In der Datei fehlt 3D/3dmodel.model – ist das wirklich eine 3MF?');
    progress(M('readModel'), 0.42);
    const parsed = new Map();
    parsed.set('3d/3dmodel.model', parseModel(root.data, true));
    const rootModel = parsed.get('3d/3dmodel.model');
    const app = rootModel.meta.Application || '';

    const isBambu = !!get('Metadata/model_settings.config') || /^(BambuStudio|OrcaSlicer)/i.test(app) || !!get('Metadata/project_settings.config');
    const kind = isBambu ? 'bambu' : 'prusa';

    // weitere .model-Dateien bei Bedarf
    const getModel = (path) => {
      const key = path || '3d/3dmodel.model';
      if (parsed.has(key)) return parsed.get(key);
      const e = byName.get(key);
      if (!e) return null;
      progress(M('reading', e.name), 0.5);
      const m = parseModel(e.data, false);
      m.bytes = e.data;
      parsed.set(key, m);
      return m;
    };
    rootModel.bytes = root.data;
    for (const ref of collectPaths(rootModel)) getModel(ref);

    const proj = { kind, fileName, entries, byName, rootModel, getModel, app, title: rootModel.meta.Title || '', warnings: [] };
    if (kind === 'bambu') assembleBambu(proj, text);
    else assemblePrusa(proj, text);
    progress(M('done'), 1);
    return proj;
  }
  function collectPaths(model) {
    const s = new Set();
    for (const o of model.objects.values()) for (const c of o.components) if (c.path) s.add(c.path);
    for (const it of model.items) if (it.path) s.add(it.path);
    return s;
  }

  function flattenObject(proj, path, id, T, depth) {
    const model = proj.getModel(path);
    if (!model) return [];
    const obj = model.objects.get(String(id));
    if (!obj || depth > 16) return [];
    if (obj.mesh) return [{ mesh: obj.mesh, bytes: model.bytes, T, t0: 0, t1: obj.mesh.nt }];
    const out = [];
    for (const c of obj.components) out.push(...flattenObject(proj, c.path || path, c.objectid, mulT(c.transform, T), depth + 1));
    return out;
  }

  const SUBTYPE_TO_TYPE = { normal_part: 'ModelPart', modifier_part: 'ParameterModifier', negative_part: 'NegativeVolume', support_enforcer: 'SupportEnforcer', support_blocker: 'SupportBlocker' };

  function filamentName(id) {
    if (!id) return '';
    return String(id).replace(/\s*@.*$/, '').trim();
  }

  function assembleBambu(proj, text) {
    const root = proj.rootModel;
    // Einstellungen
    const ms = text('Metadata/model_settings.config') || '';
    const objSettings = new Map();
    const reObj = /<object\s+id="(\d+)"[^>]*>([\s\S]*?)<\/object>/g; let m;
    while ((m = reObj.exec(ms))) {
      const body = m[2];
      const parts = [];
      const rePart = /<part\s+([^>]*)>([\s\S]*?)<\/part>/g; let pm;
      while ((pm = rePart.exec(body))) {
        const a = attrsOf(pm[1]);
        const md = metaKV(pm[2]);
        parts.push({ id: a.id, subtype: a.subtype || 'normal_part', name: md.name || '', extruder: parseInt(md.extruder || '0', 10) || 0 });
      }
      const md = metaKV(body.replace(/<part[\s\S]*?<\/part>/g, ''));
      objSettings.set(m[1], { name: md.name || '', extruder: parseInt(md.extruder || '1', 10) || 1, parts });
    }
    const plates = [];
    const rePlate = /<plate>([\s\S]*?)<\/plate>/g;
    while ((m = rePlate.exec(ms))) {
      const body = m[1];
      const md = metaKV(body.replace(/<model_instance>[\s\S]*?<\/model_instance>/g, ''));
      const inst = [];
      const reInst = /<model_instance>([\s\S]*?)<\/model_instance>/g; let im;
      while ((im = reInst.exec(body))) { const k = metaKV(im[1]); inst.push({ object_id: k.object_id, instance_id: parseInt(k.instance_id || '0', 10) }); }
      plates.push({ id: parseInt(md.plater_id || String(plates.length + 1), 10), name: md.plater_name || '', thumb: md.thumbnail_file || '', inst });
    }

    // Filamente
    let fil = [];
    const ps = text('Metadata/project_settings.config');
    if (ps) {
      try {
        const j = JSON.parse(ps);
        const cols = j.filament_colour || [];
        for (let i = 0; i < cols.length; i++) {
          fil.push({ idx: i + 1, color: normColor(cols[i], DEFAULT_COLORS[i % 16]), type: (j.filament_type || [])[i] || '', name: filamentName((j.filament_settings_id || [])[i]) });
        }
      } catch (e) { proj.warnings.push(M('wSettings')); }
    }

    // Objekte
    const objDefs = new Map();
    const items = [];
    const instCount = new Map();
    for (const it of root.items) {
      const key = String(it.objectid);
      if (it.path) { proj.warnings.push(M('wExtItem')); continue; }
      if (!objDefs.has(key)) {
        const obj = root.objects.get(key);
        if (!obj) continue;
        const st = objSettings.get(key) || { name: '', extruder: 1, parts: [] };
        const volumes = [];
        if (obj.mesh) {
          const part = st.parts[0] || {};
          volumes.push({ name: part.name || st.name, type: SUBTYPE_TO_TYPE[part.subtype] || 'ModelPart', extruder: part.extruder || 0, pieces: [{ mesh: obj.mesh, bytes: root.bytes, T: IDENT, t0: 0, t1: obj.mesh.nt }] });
        } else {
          obj.components.forEach((c, ci) => {
            const part = st.parts.find((p) => String(p.id) === String(c.objectid)) || st.parts[ci] || {};
            const pieces = flattenObject(proj, c.path, c.objectid, c.transform, 0);
            if (pieces.length) volumes.push({ name: part.name || '', type: SUBTYPE_TO_TYPE[part.subtype] || 'ModelPart', extruder: part.extruder || 0, pieces });
          });
        }
        objDefs.set(key, { key, name: st.name || obj.name || M('object', key), extruder: st.extruder || 1, volumes, items: [] });
      }
      const od = objDefs.get(key);
      const n = instCount.get(key) || 0; instCount.set(key, n + 1);
      const item = { idx: items.length, od, inst: n, T: it.transform, printable: it.printable };
      items.push(item); od.items.push(item);
    }
    // Platten
    let plateList = plates.map((p) => ({
      id: p.id, name: p.name, thumb: p.thumb,
      items: p.inst.map((i) => items.find((it) => it.od.key === String(i.object_id) && it.inst === i.instance_id)).filter(Boolean),
    })).filter((p) => p.items.length);
    if (!plateList.length) plateList = [{ id: 1, name: '', thumb: '', items: items.slice() }];

    // Farbwechsel nach Höhe
    const cg = text('Metadata/custom_gcode_per_layer.xml');
    const layerChanges = new Map();
    if (cg) {
      const reP = /<plate>([\s\S]*?)<\/plate>/g; let pm;
      while ((pm = reP.exec(cg))) {
        const idm = pm[1].match(/<plate_info\s+id="(\d+)"/);
        const pid = idm ? parseInt(idm[1], 10) : 1;
        const codes = []; const reL = /<layer\s+([^>]*?)\/?>/g; let lm;
        while ((lm = reL.exec(pm[1]))) { const a = attrsOf(lm[1]); codes.push({ z: a.top_z, type: parseInt(a.type || '0', 10), extruder: parseInt(a.extruder || '1', 10), color: a.color || '', extra: a.extra || '' }); }
        const mm = pm[1].match(/<mode\s+value="([^"]*)"/);
        if (codes.length) layerChanges.set(pid, { codes, mode: mm ? mm[1] : 'MultiAsSingle' });
      }
    }

    proj.objDefs = [...objDefs.values()];
    proj.items = items;
    proj.plates = plateList;
    proj.layerChanges = layerChanges;
    proj.filaments = fil;
    proj.recenter = true;
  }
  function metaKV(s) {
    const o = {}; const re = /<metadata\s+([^>]*?)\/?>/g; let m;
    while ((m = re.exec(s))) { const a = attrsOf(m[1]); if (a.key !== undefined) o[a.key] = a.value || ''; }
    return o;
  }

  function parseIniList(v) {
    // "a";"b" oder a;b
    const out = []; let cur = '', q = false;
    for (let i = 0; i < v.length; i++) {
      const c = v[i];
      if (c === '"') { q = !q; continue; }
      if (c === ';' && !q) { out.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    out.push(cur.trim());
    return out;
  }

  function assemblePrusa(proj, text) {
    const root = proj.rootModel;
    const cfg = text('Metadata/Slic3r_PE_model.config');
    const objCfg = new Map();
    if (cfg) {
      const reObj = /<object\s+id="(\d+)"[^>]*>([\s\S]*?)<\/object>/g; let m;
      while ((m = reObj.exec(cfg))) {
        const body = m[2];
        const vols = [];
        const reV = /<volume\s+([^>]*)>([\s\S]*?)<\/volume>/g; let vm;
        while ((vm = reV.exec(body))) {
          const a = attrsOf(vm[1]); const md = metaKV(vm[2]);
          vols.push({ t0: parseInt(a.firstid, 10), t1: parseInt(a.lastid, 10) + 1, type: md.volume_type || (md.modifier === '1' ? 'ParameterModifier' : 'ModelPart'), extruder: parseInt(md.extruder || '0', 10) || 0, name: md.name || '' });
        }
        const md = metaKV(body.replace(/<volume[\s\S]*?<\/volume>/g, ''));
        objCfg.set(m[1], { name: md.name || '', extruder: parseInt(md.extruder || '0', 10) || 0, vols });
      }
    }
    // Farben aus Slic3r_PE.config
    const ini = text('Metadata/Slic3r_PE.config') || '';
    const iniVal = (k) => { const mm = ini.match(new RegExp('^; ' + k + ' = (.*)$', 'm')); return mm ? mm[1] : null; };
    const ec = iniVal('extruder_colour'), fc = iniVal('filament_colour'), fs = iniVal('filament_settings_id'), ft = iniVal('filament_type');
    const ecl = ec ? parseIniList(ec) : [], fcl = fc ? parseIniList(fc) : [], fsl = fs ? parseIniList(fs) : [], ftl = ft ? parseIniList(ft) : [];
    const n = Math.max(ecl.length, fcl.length);
    proj.srcTools = n;
    proj.srcPrinter = (iniVal('printer_settings_id') || iniVal('printer_model') || '').replace(/ HF?\d\.\d+ nozzle$|\s+\d\.\d+ nozzle$/i, '');
    const fil = [];
    for (let i = 0; i < n; i++) {
      const col = normColor(ecl[i], null) || normColor(fcl[i], null) || DEFAULT_COLORS[i % 16];
      fil.push({ idx: i + 1, color: col, type: ftl[i] || '', name: filamentName(fsl[i] || '') });
    }

    const objDefs = [];
    const map = new Map();
    const items = [];
    const instCount = new Map();
    for (const it of root.items) {
      const key = String(it.objectid);
      if (!map.has(key)) {
        const obj = root.objects.get(key);
        if (!obj) continue;
        const oc = objCfg.get(key);
        const volumes = [];
        if (obj.mesh) {
          if (oc && oc.vols.length) {
            for (const v of oc.vols) volumes.push({ name: v.name, type: v.type, extruder: v.extruder, pieces: [{ mesh: obj.mesh, bytes: root.bytes, T: IDENT, t0: v.t0, t1: Math.min(v.t1, obj.mesh.nt) }] });
          } else volumes.push({ name: obj.name, type: 'ModelPart', extruder: 0, pieces: [{ mesh: obj.mesh, bytes: root.bytes, T: IDENT, t0: 0, t1: obj.mesh.nt }] });
        } else {
          obj.components.forEach((c) => {
            const pieces = flattenObject(proj, c.path, c.objectid, c.transform, 0);
            if (pieces.length) volumes.push({ name: '', type: 'ModelPart', extruder: 0, pieces });
          });
        }
        const od = { key, name: (oc && oc.name) || obj.name || M('object', key), extruder: (oc && oc.extruder) || 1, volumes, items: [] };
        map.set(key, od); objDefs.push(od);
      }
      const od = map.get(key);
      const nI = instCount.get(key) || 0; instCount.set(key, nI + 1);
      const item = { idx: items.length, od, inst: nI, T: it.transform, printable: it.printable };
      items.push(item); od.items.push(item);
    }
    proj.objDefs = objDefs;
    proj.items = items;
    proj.plates = [{ id: 1, name: '', thumb: '', items: items.slice() }];
    proj.filaments = fil;
    proj.recenter = false;
    proj.layerChanges = new Map();
    proj.isPrusa3 = !!proj.byName.get('metadata/prusaslicer3_project.json');
  }

  // ------------------------------------------------------------------ Platzierung & Vorschau
  const BED = { w: 248, d: 205 }; // Standard: Prusa CORE One INDX – per setBed() je Drucker
  function setBed(b) { if (b && b.w > 0 && b.d > 0) { BED.w = b.w; BED.d = b.d; } }

  function transformVerts(mesh, W) {
    const n = mesh.nv, src = mesh.vx, out = new Float64Array(n * 3);
    const [a, b, c, d, e, f, g, h, i, j, k, l] = W;
    for (let v = 0; v < n; v++) {
      const x = src[v * 3], y = src[v * 3 + 1], z = src[v * 3 + 2];
      out[v * 3] = x * a + y * d + z * g + j;
      out[v * 3 + 1] = x * b + y * e + z * h + k;
      out[v * 3 + 2] = x * c + y * f + z * i + l;
    }
    return out;
  }
  function pieceBBox(piece, W, bb) {
    const m = piece.mesh, t = m.t, vx = m.vx;
    const [a, b, c, d, e, f, g, h, i, j, k, l] = W;
    // nur Eckpunkte der Dreiecke im Bereich
    const seen = new Uint8Array(m.nv);
    for (let tri = piece.t0; tri < piece.t1; tri++) {
      for (let q = 0; q < 3; q++) {
        const v = t[tri * 3 + q];
        if (seen[v]) continue; seen[v] = 1;
        const x = vx[v * 3], y = vx[v * 3 + 1], z = vx[v * 3 + 2];
        const X = x * a + y * d + z * g + j, Y = x * b + y * e + z * h + k, Z = x * c + y * f + z * i + l;
        if (X < bb[0]) bb[0] = X; if (Y < bb[1]) bb[1] = Y; if (Z < bb[2]) bb[2] = Z;
        if (X > bb[3]) bb[3] = X; if (Y > bb[4]) bb[4] = Y; if (Z > bb[5]) bb[5] = Z;
      }
    }
  }
  function plateShift(proj, plateIdx) {
    proj._shift = proj._shift || new Map();
    const skey = plateIdx + '@' + BED.w + 'x' + BED.d;
    if (proj._shift.has(skey)) return proj._shift.get(skey);
    const plate = proj.plates[plateIdx];
    const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const it of plate.items) for (const vol of it.od.volumes) {
      if (vol.type !== 'ModelPart') continue;
      for (const pc of vol.pieces) pieceBBox(pc, mulT(pc.T, it.T), bb);
    }
    let s = [0, 0, 0];
    if (proj.recenter && isFinite(bb[0])) s = [BED.w / 2 - (bb[0] + bb[3]) / 2, BED.d / 2 - (bb[1] + bb[4]) / 2, -bb[2]];
    const size = isFinite(bb[0]) ? [bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]] : [0, 0, 0];
    const res = { s, size };
    proj._shift.set(skey, res);
    return res;
  }
  function withShift(T, s) {
    const R = Float64Array.from(T); R[9] += s[0]; R[10] += s[1]; R[11] += s[2]; return R;
  }

  function buildPreview(proj, plateIdx, maxLeaves) {
    maxLeaves = maxLeaves || 9e6;
    const plate = proj.plates[plateIdx];
    const { s, size } = plateShift(proj, plateIdx);
    // 1) Blätter zählen
    const cache = new Map();
    let leaves = 0;
    const jobs = [];
    for (const it of plate.items) for (const vol of it.od.volumes) {
      if (vol.type !== 'ModelPart') continue;
      const def = vol.extruder || it.od.extruder || 1;
      for (const pc of vol.pieces) {
        const m = pc.mesh, mm = m.mm, b = pc.bytes;
        let cnt = 0;
        for (let tri = pc.t0; tri < pc.t1; tri++) {
          const ps = mm[tri * 2];
          if (ps < 0) { cnt++; continue; }
          const pl = mm[tri * 2 + 1];
          if (pl === 1) { cnt++; continue; }
          let key = ''; for (let k = 0; k < pl; k++) key += String.fromCharCode(b[ps + k]);
          let c = cache.get(key);
          if (c === undefined) { c = countLeavesBytes(b, ps, pl); cache.set(key, c); }
          cnt += c;
        }
        jobs.push({ it, pc, def, cnt });
        leaves += cnt;
      }
    }
    const capped = leaves > maxLeaves;
    // 2) Füllen
    const total = capped ? jobs.reduce((a, j) => a + (j.pc.t1 - j.pc.t0), 0) : leaves;
    const pos = new Float32Array(total * 9);
    const fil = new Uint8Array(total * 3);
    const areas = new Float64Array(256);
    let o = 0;
    const emit = (A, B, C, st) => {
      const p = o * 9;
      pos[p] = A[0]; pos[p + 1] = A[1]; pos[p + 2] = A[2];
      pos[p + 3] = B[0]; pos[p + 4] = B[1]; pos[p + 5] = B[2];
      pos[p + 6] = C[0]; pos[p + 7] = C[1]; pos[p + 8] = C[2];
      fil[o * 3] = fil[o * 3 + 1] = fil[o * 3 + 2] = st;
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      areas[st] += Math.sqrt(cx * cx + cy * cy + cz * cz) * 0.5;
      o++;
    };
    for (const job of jobs) {
      const { it, pc, def } = job;
      const W = withShift(mulT(pc.T, it.T), s);
      const V = transformVerts(pc.mesh, W);
      const m = pc.mesh, t = m.t, mm = m.mm, b = pc.bytes;
      for (let tri = pc.t0; tri < pc.t1; tri++) {
        const i0 = t[tri * 3] * 3, i1 = t[tri * 3 + 1] * 3, i2 = t[tri * 3 + 2] * 3;
        const A = [V[i0], V[i0 + 1], V[i0 + 2]], B = [V[i1], V[i1 + 1], V[i1 + 2]], C = [V[i2], V[i2 + 1], V[i2 + 2]];
        const ps = mm[tri * 2];
        if (ps < 0) { emit(A, B, C, def); continue; }
        const pl = mm[tri * 2 + 1];
        if (capped) {
          // nur dominanter Zustand (erstes Blatt)
          let st = def;
          walkPaint(b, ps, pl, A, B, C, (a1, b1, c1, s1) => { if (st === def) st = s1 || def; });
          emit(A, B, C, st);
          continue;
        }
        walkPaint(b, ps, pl, A, B, C, (a1, b1, c1, s1) => emit(a1, b1, c1, s1 || def));
      }
    }
    const used = [];
    let tot = 0; for (let k = 1; k < 256; k++) tot += areas[k];
    for (let k = 1; k < 256; k++) if (areas[k] > 0) used.push({ idx: k, share: areas[k] / tot });
    return {
      positions: o * 9 === pos.length ? pos : pos.slice(0, o * 9), fil: o * 3 === fil.length ? fil : fil.slice(0, o * 3),
      triangles: o, capped, used, bed: BED, size,
    };
  }

  // ------------------------------------------------------------------ Schreiben
  class ByteWriter {
    constructor(cap) { this.buf = new Uint8Array(Math.max(1 << 16, cap | 0)); this.len = 0; }
    ensure(n) {
      if (this.len + n <= this.buf.length) return;
      let c = this.buf.length * 2; while (c < this.len + n) c *= 2;
      const nb = new Uint8Array(c); nb.set(this.buf.subarray(0, this.len)); this.buf = nb;
    }
    ascii(s) { const n = s.length; this.ensure(n); const b = this.buf; let p = this.len; for (let i = 0; i < n; i++) b[p++] = s.charCodeAt(i); this.len = p; }
    text(s) { this.raw(te.encode(s)); }
    raw(u, s, e) { s = s || 0; e = e === undefined ? u.length : e; const n = e - s; this.ensure(n); this.buf.set(u.subarray(s, e), this.len); this.len += n; }
    int(v) {
      this.ensure(12); const b = this.buf; let p = this.len;
      if (v === 0) { b[p++] = 48; this.len = p; return; }
      const st = p;
      while (v > 0) { b[p++] = 48 + (v % 10); v = Math.floor(v / 10); }
      for (let i = st, j = p - 1; i < j; i++, j--) { const t = b[i]; b[i] = b[j]; b[j] = t; }
      this.len = p;
    }
    result() { return this.buf.subarray(0, this.len); }
  }

  function mapTable(map) {
    const t = new Uint8Array(256);
    for (let s = 0; s < 256; s++) t[s] = s;
    if (map) for (let s = 1; s < map.length && s < 256; s++) if (map[s] > 0) t[s] = map[s];
    return t;
  }

  async function exportBambu(proj, plateIdx, map, progress) {
    progress = progress || (() => {});
    const table = mapTable(map);
    const plate = proj.plates[plateIdx];
    const { s } = plateShift(proj, plateIdx);
    const ods = [];
    for (const it of plate.items) if (!ods.includes(it.od)) ods.push(it.od);
    let est = 4096;
    for (const od of ods) for (const v of od.volumes) for (const pc of v.pieces) est += pc.bytes.length;
    const w = new ByteWriter(Math.min(est * 1.05, 1.9e9));
    w.ascii('<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">\n');
    w.ascii(' <metadata name="slic3rpe:Version3mf">1</metadata>\n');
    w.ascii(' <metadata name="slic3rpe:MmPaintingVersion">1</metadata>\n');
    w.ascii(' <metadata name="slic3rpe:FdmSupportsPaintingVersion">1</metadata>\n');
    w.ascii(' <metadata name="slic3rpe:SeamPaintingVersion">1</metadata>\n');
    if (proj.title) w.text(' <metadata name="Title">' + xmlEsc(proj.title) + '</metadata>\n');
    const designer = proj.rootModel.meta.Designer;
    if (designer) w.text(' <metadata name="Designer">' + xmlEsc(designer) + '</metadata>\n');
    w.ascii(' <metadata name="Application">INDX Farb-Mapper</metadata>\n <resources>\n');
    const remapCache = new Map();
    const P_OPEN = ' slic3rpe:mmu_segmentation="';
    const EXTRA_NAMES = [null, ' slic3rpe:custom_supports="', ' slic3rpe:custom_seam="', ' slic3rpe:fuzzy_skin="'];
    const cfgObjs = [];
    let oid = 0, done = 0, totalTris = 0;
    for (const od of ods) for (const v of od.volumes) for (const pc of v.pieces) totalTris += pc.t1 - pc.t0;
    for (const od of ods) {
      oid++;
      progress(M('writing', od.name || M('objectAny')), 0.05 + 0.6 * (done / Math.max(1, totalTris)));
      w.ascii('  <object id="'); w.int(oid); w.ascii('" type="model">\n   <mesh>\n    <vertices>\n');
      // Eckpunkte: pro Teilstück fortlaufend
      const pieceBase = [];
      let vbase = 0;
      for (const v of od.volumes) for (const pc of v.pieces) {
        const m = pc.mesh, b = pc.bytes;
        // nur benutzte Eckpunkte des Bereichs (bei Prusa-Bereichen) – hier: Bereich min..max
        let vmin = Infinity, vmax = -1;
        for (let tri = pc.t0; tri < pc.t1; tri++) for (let q = 0; q < 3; q++) { const x = m.t[tri * 3 + q]; if (x < vmin) vmin = x; if (x > vmax) vmax = x; }
        if (vmax < 0) { vmin = 0; vmax = -1; }
        pieceBase.push({ pc, base: vbase - vmin });
        if (isIdent(pc.T)) {
          for (let k = vmin; k <= vmax; k++) { w.ascii('     '); w.raw(b, m.vtag[k * 2], m.vtag[k * 2 + 1]); w.ascii('\n'); }
        } else {
          const V = transformVerts(m, pc.T);
          for (let k = vmin; k <= vmax; k++) {
            w.ascii('     <vertex x="' + fmtNum(V[k * 3]) + '" y="' + fmtNum(V[k * 3 + 1]) + '" z="' + fmtNum(V[k * 3 + 2]) + '"/>\n');
          }
        }
        vbase += vmax - vmin + 1;
      }
      w.ascii('    </vertices>\n    <triangles>\n');
      let tbase = 0, pi = 0;
      const vols = [];
      for (const v of od.volumes) {
        const first = tbase;
        for (const pc of v.pieces) {
          const { base } = pieceBase[pi++];
          const m = pc.mesh, b = pc.bytes, t = m.t, mm = m.mm;
          // Zusatzbemalung (Stützen/Naht) nach Dreieck indizieren
          let extraIdx = null;
          if (m.extra.length) {
            extraIdx = new Map();
            for (let e = 0; e < m.extra.length; e += 4) {
              const tri = m.extra[e];
              if (tri < pc.t0 || tri >= pc.t1) continue;
              if (!extraIdx.has(tri)) extraIdx.set(tri, []);
              extraIdx.get(tri).push(m.extra[e + 1], m.extra[e + 2], m.extra[e + 3]);
            }
          }
          for (let tri = pc.t0; tri < pc.t1; tri++) {
            w.ascii('     <triangle v1="'); w.int(t[tri * 3] + base);
            w.ascii('" v2="'); w.int(t[tri * 3 + 1] + base);
            w.ascii('" v3="'); w.int(t[tri * 3 + 2] + base); w.ascii('"');
            const ps = mm[tri * 2];
            if (ps >= 0) {
              const pl = mm[tri * 2 + 1];
              let key = ''; for (let k = 0; k < pl; k++) key += String.fromCharCode(b[ps + k]);
              let outS = remapCache.get(key);
              if (outS === undefined) { outS = remapPaintBytes(b, ps, pl, table); remapCache.set(key, outS); }
              w.ascii(P_OPEN); w.ascii(outS); w.ascii('"');
            }
            if (extraIdx && extraIdx.has(tri)) {
              const ex = extraIdx.get(tri);
              for (let e = 0; e < ex.length; e += 3) { w.ascii(EXTRA_NAMES[ex[e]]); w.raw(b, ex[e + 1], ex[e + 1] + ex[e + 2]); w.ascii('"'); }
            }
            w.ascii('/>\n');
          }
          tbase += pc.t1 - pc.t0;
          done += pc.t1 - pc.t0;
          progress(M('writing', od.name || M('objectAny')), 0.05 + 0.6 * (done / Math.max(1, totalTris)));
        }
        if (tbase > first) vols.push({ v, first, last: tbase - 1 });
      }
      w.ascii('    </triangles>\n   </mesh>\n  </object>\n');
      cfgObjs.push({ oid, od, vols });
    }
    w.ascii(' </resources>\n <build>\n');
    oid = 0;
    let instTotal = 0;
    for (const od of ods) {
      oid++;
      for (const it of plate.items) if (it.od === od) {
        instTotal++;
        w.ascii('  <item objectid="'); w.int(oid); w.ascii('" transform="' + fmtT(withShift(it.T, s)) + '" printable="' + (it.printable ? 1 : 0) + '"/>\n');
      }
    }
    w.ascii(' </build>\n</model>\n');
    const modelBytes = w.result();

    // Slic3r_PE_model.config
    let c = '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n';
    for (const { oid: id, od, vols } of cfgObjs) {
      const inst = plate.items.filter((it) => it.od === od).length;
      let nm = od.name;
      if (proj.title && ods.length === 1 && (!nm || /^[0-9a-f-]{20,}/i.test(nm))) nm = proj.title;
      c += ' <object id="' + id + '" instances_count="' + inst + '">\n';
      c += '  <metadata type="object" key="name" value="' + xmlEsc(nm) + '"/>\n';
      c += '  <metadata type="object" key="extruder" value="' + table[od.extruder || 1] + '"/>\n';
      for (const { v, first, last } of vols) {
        c += '  <volume firstid="' + first + '" lastid="' + last + '">\n';
        const vn = !v.name || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(v.name) ? nm : v.name;
        c += '   <metadata type="volume" key="name" value="' + xmlEsc(vn) + '"/>\n';
        c += '   <metadata type="volume" key="volume_type" value="' + v.type + '"/>\n';
        if (v.type === 'ModelPart' && v.extruder > 0) c += '   <metadata type="volume" key="extruder" value="' + table[v.extruder] + '"/>\n';
        c += '   <mesh edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>\n';
        c += '  </volume>\n';
      }
      c += ' </object>\n';
    }
    c += '</config>\n';

    const files = [];
    files.push({ name: '[Content_Types].xml', data: te.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n <Default Extension="png" ContentType="image/png"/>\n</Types>') });
    const thumb = plate.thumb ? proj.byName.get(plate.thumb.replace(/^\/+/, '').toLowerCase()) : (proj.byName.get('metadata/plate_' + plate.id + '.png') || null);
    files.push({ name: '_rels/.rels', data: te.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n' + (thumb ? ' <Relationship Target="/Metadata/thumbnail.png" Id="rel-2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>\n' : '') + '</Relationships>') });
    files.push({ name: '3D/3dmodel.model', data: modelBytes });
    if (thumb) files.push({ name: 'Metadata/thumbnail.png', data: thumb.data, store: true });
    files.push({ name: 'Metadata/Slic3r_PE_model.config', data: te.encode(c) });
    const lc = proj.layerChanges.get(plate.id);
    if (lc) {
      let x = '<?xml version="1.0" encoding="utf-8"?>\n<custom_gcodes_per_print_z bed_idx="0">\n';
      for (const k of lc.codes) {
        const ex = k.extruder > 0 ? table[k.extruder] : k.extruder;
        x += '<code print_z="' + xmlEsc(k.z) + '" type="' + k.type + '" extruder="' + ex + '" color="' + xmlEsc(k.color) + '" extra="' + xmlEsc(k.extra) + '" gcode="' + (k.type === 2 ? 'T' + Math.max(0, ex - 1) : k.type === 0 ? 'M600' : k.type === 1 ? 'M601' : xmlEsc(k.extra)) + '"/>\n';
      }
      x += '<mode value="' + xmlEsc(lc.mode) + '"/>\n</custom_gcodes_per_print_z>\n';
      files.push({ name: 'Metadata/Prusa_Slicer_custom_gcode_per_print_z.xml', data: te.encode(x) });
    }
    progress(M('compress'), 0.7);
    const blob = await buildZip(files, (n) => { if (n === '3D/3dmodel.model') progress(M('compressModel'), 0.75); });
    return { blob, objects: ods.length, instances: instTotal };
  }

  const EXTRUDER_KEYS = ['extruder', 'perimeter_extruder', 'infill_extruder', 'solid_infill_extruder', 'support_material_extruder', 'support_material_interface_extruder', 'wipe_tower_extruder'];

  function remapModelFile(b, table, progress) {
    // ersetzt Werte von slic3rpe:mmu_segmentation (und paint_color) direkt im Byte-Strom
    const pats = [pat('slic3rpe:mmu_segmentation="'), pat('paint_color="')];
    const w = new ByteWriter(b.length + 1024);
    const cache = new Map();
    let p = 0, changed = false;
    const nextPos = pats.map(() => -2);
    for (;;) {
      let best = -1, bp = null;
      for (let k = 0; k < pats.length; k++) {
        if (nextPos[k] === -1) continue;
        if (nextPos[k] < p) nextPos[k] = findBytes(b, pats[k], p);
        const x = nextPos[k];
        if (x >= 0 && (best < 0 || x < best)) { best = x; bp = pats[k]; }
      }
      if (best < 0) break;
      const vs = best + bp.length;
      const ve = b.indexOf(34, vs);
      w.raw(b, p, vs);
      let key = ''; for (let k = vs; k < ve; k++) key += String.fromCharCode(b[k]);
      let outS = cache.get(key);
      if (outS === undefined) { outS = ve > vs ? remapPaintBytes(b, vs, ve - vs, table) : ''; cache.set(key, outS); }
      if (outS !== key) changed = true;
      w.ascii(outS);
      p = ve;
    }
    if (!changed) return null;
    w.raw(b, p, b.length);
    return w.result().slice();
  }

  async function exportPrusa(proj, map, progress) {
    progress = progress || (() => {});
    const table = mapTable(map);
    const files = [];
    const mapEx = (v) => { const n = parseInt(v, 10); return n > 0 ? String(table[n] || n) : v; };
    let hasModelCfg = false;
    let i = 0;
    for (const e of proj.entries) {
      i++;
      const ln = e.name.toLowerCase();
      let data = e.data;
      if (ln.endsWith('.model')) {
        progress(M('repaint', e.name), 0.05 + 0.5 * i / proj.entries.length);
        const r = remapModelFile(e.data, table);
        if (r) data = r;
      } else if (ln === 'metadata/slic3r_pe_model.config') {
        hasModelCfg = true;
        let s = td.decode(e.data);
        s = s.replace(/(<metadata\s+type="(?:object|volume)"\s+key="(\w+)"\s+value=")(\d+)("\s*\/>)/g, (m0, a, key, val, z) => EXTRUDER_KEYS.includes(key) ? a + mapEx(val) + z : m0);
        // Objekte ohne eigenen Extruder erben Tool 1 – ausdrücklich setzen, falls Tool 1 umgelegt wird
        if (table[1] !== 1) {
          s = s.replace(/(<object\s+id="\d+"[^>]*>)([\s\S]*?)(<\/object>)/g, (m0, a, body, z) => {
            const head = body.replace(/<volume[\s\S]*?<\/volume>/g, '');
            if (/key="extruder"/.test(head)) return m0;
            return a + '\n  <metadata type="object" key="extruder" value="' + table[1] + '"/>' + body + z;
          });
        }
        data = te.encode(s);
      } else if (ln === 'metadata/prusa_slicer_custom_gcode_per_print_z.xml') {
        let s = td.decode(e.data);
        s = s.replace(/(<code\s[^>]*?extruder=")(\d+)(")/g, (m0, a, v, z) => a + mapEx(v) + z);
        data = te.encode(s);
      } else if (ln === 'metadata/slic3r_facets_annotation.json') {
        try {
          const j = JSON.parse(td.decode(e.data));
          const fix = (arr) => { if (Array.isArray(arr)) for (const f of arr) if (f && typeof f.dividing === 'string' && f.dividing) { const bb = te.encode(f.dividing); f.dividing = remapPaintBytes(bb, 0, bb.length, table); } };
          const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o.mmSegmentationFacets) fix(o.mmSegmentationFacets); for (const k in o) if (k !== 'mmSegmentationFacets') walk(o[k]); } };
          walk(j);
          data = te.encode(JSON.stringify(j));
        } catch (err) { proj.warnings.push(M('wFacets')); }
      } else if (ln === 'metadata/prusaslicer3_project.json') {
        try {
          const j = JSON.parse(td.decode(e.data));
          const walk = (o, inObjects) => {
            if (Array.isArray(o)) { o.forEach((x) => walk(x, inObjects)); return; }
            if (!o || typeof o !== 'object') return;
            if ('print_z' in o && 'extruder' in o && typeof o.extruder === 'number' && o.extruder > 0) o.extruder = table[o.extruder] || o.extruder;
            for (const k of Object.keys(o)) {
              const v = o[k];
              if (inObjects && EXTRUDER_KEYS.includes(k)) {
                if (typeof v === 'number' && v > 0) o[k] = table[v] || v;
                else if (typeof v === 'string' && /^\d+$/.test(v) && +v > 0) o[k] = String(table[+v] || v);
              } else walk(v, inObjects || k === 'objects');
            }
            if (inObjects && o.object_settings && typeof o.object_settings === 'object' && !('extruder' in o.object_settings) && table[1] !== 1) o.object_settings.extruder = table[1];
          };
          walk(j, false);
          data = te.encode(JSON.stringify(j));
        } catch (err) { proj.warnings.push(M('wPs3')); }
      }
      files.push({ name: e.name, data, store: /\.(png|jpe?g|webp)$/i.test(e.name) });
    }
    if (!hasModelCfg && !proj.isPrusa3 && table[1] !== 1) {
      // Minimalkonfiguration, damit unbemalte Flächen dem neuen Tool folgen
      let c = '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n';
      for (const od of proj.objDefs) {
        const obj = proj.rootModel.objects.get(od.key);
        if (!obj || !obj.mesh) continue;
        c += ' <object id="' + od.key + '" instances_count="' + od.items.length + '">\n  <metadata type="object" key="name" value="' + xmlEsc(od.name) + '"/>\n  <metadata type="object" key="extruder" value="' + table[1] + '"/>\n';
        c += '  <volume firstid="0" lastid="' + (obj.mesh.nt - 1) + '">\n   <metadata type="volume" key="volume_type" value="ModelPart"/>\n  </volume>\n </object>\n';
      }
      c += '</config>\n';
      files.push({ name: 'Metadata/Slic3r_PE_model.config', data: te.encode(c) });
    }
    progress(M('compress'), 0.6);
    const blob = await buildZip(files, (n) => progress(M('compressing', n), 0.7));
    return { blob };
  }

  function summary(proj) {
    let tris = 0;
    for (const od of proj.objDefs) for (const v of od.volumes) for (const pc of v.pieces) tris += pc.t1 - pc.t0;
    return {
      kind: proj.kind, fileName: proj.fileName, title: proj.title, app: proj.app,
      filaments: proj.filaments,
      plates: proj.plates.map((p, i) => ({ index: i, id: p.id, name: p.name, objects: new Set(p.items.map((it) => it.od)).size, instances: p.items.length })),
      objects: proj.objDefs.length, triangles: tris, warnings: proj.warnings.slice(),
      isPrusa3: !!proj.isPrusa3, srcTools: proj.srcTools || 0, srcPrinter: proj.srcPrinter || '',
    };
  }

  async function exportProject(proj, plateIdx, map, progress) {
    if (proj.kind === 'bambu') return exportBambu(proj, plateIdx, map, progress);
    return exportPrusa(proj, map, progress);
  }

  // ZIP mit einer gespeicherten Datei (für Umgebungen, die .3mf nicht speichern dürfen)
  async function wrapInZip(name, blob) {
    const data = new Uint8Array(await blob.arrayBuffer());
    return buildZip([{ name, data, store: true }]);
  }

  return { loadProject, buildPreview, exportProject, summary, wrapInZip, remapPaintBytes, decodeLeaves, parseModel, readZipDirectory, extractEntry, buildZip, crc32, BED, setBed, setLang };
}
if (typeof module !== 'undefined' && module.exports) module.exports = coreFactory;
