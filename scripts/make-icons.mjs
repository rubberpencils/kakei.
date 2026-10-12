// Draws the "k." mark in Syne ExtraBold (the wordmark font) into every icon and splash PNG.
// Run: node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const INK = [14, 14, 16];
const PAPER = [247, 247, 245];
const PURPLE = [112, 74, 248];
const WHITE = [255, 255, 255];
const TRACKING = -0.06;

const font = readFileSync(new URL('../node_modules/@expo-google-fonts/syne/800ExtraBold/Syne_800ExtraBold.ttf', import.meta.url));

function tables(buf) {
  const out = {};
  const n = buf.readUInt16BE(4);
  for (let i = 0; i < n; i += 1) {
    const at = 12 + i * 16;
    out[buf.toString('latin1', at, at + 4)] = buf.readUInt32BE(at + 8);
  }
  return out;
}

const T = tables(font);
const upm = font.readUInt16BE(T.head + 18);
const longLoca = font.readInt16BE(T.head + 50) === 1;
const metrics = font.readUInt16BE(T.hhea + 34);

function glyphId(code) {
  const count = font.readUInt16BE(T.cmap + 2);
  for (let i = 0; i < count; i += 1) {
    const sub = T.cmap + font.readUInt32BE(T.cmap + 4 + i * 8 + 4);
    const format = font.readUInt16BE(sub);
    if (format === 4) {
      const segs = font.readUInt16BE(sub + 6) / 2;
      const ends = sub + 14;
      const starts = ends + segs * 2 + 2;
      const deltas = starts + segs * 2;
      const ranges = deltas + segs * 2;
      for (let s = 0; s < segs; s += 1) {
        if (code > font.readUInt16BE(ends + s * 2) || code < font.readUInt16BE(starts + s * 2)) continue;
        const ro = font.readUInt16BE(ranges + s * 2);
        const delta = font.readInt16BE(deltas + s * 2);
        if (!ro) return (code + delta) & 0xffff;
        const g = font.readUInt16BE(ranges + s * 2 + ro + (code - font.readUInt16BE(starts + s * 2)) * 2);
        return g ? (g + delta) & 0xffff : 0;
      }
    }
    if (format === 12) {
      const groups = font.readUInt32BE(sub + 12);
      for (let g = 0; g < groups; g += 1) {
        const at = sub + 16 + g * 12;
        const lo = font.readUInt32BE(at);
        if (code >= lo && code <= font.readUInt32BE(at + 4)) return font.readUInt32BE(at + 8) + code - lo;
      }
    }
  }
  throw new Error(`no glyph for ${String.fromCharCode(code)}`);
}

const advance = (g) => font.readUInt16BE(T.hmtx + Math.min(g, metrics - 1) * 4);

// Quadratic TrueType contours flattened to closed polylines, in font units (y up).
function outline(g) {
  const loca = (i) => (longLoca ? font.readUInt32BE(T.loca + i * 4) : font.readUInt16BE(T.loca + i * 2) * 2);
  const start = T.glyf + loca(g);
  if (loca(g + 1) === loca(g)) return [];
  const contours = font.readInt16BE(start);
  if (contours < 0) throw new Error('composite glyphs are not supported');
  const ends = [];
  for (let i = 0; i < contours; i += 1) ends.push(font.readUInt16BE(start + 10 + i * 2));
  const total = ends[ends.length - 1] + 1;
  let p = start + 10 + contours * 2;
  p += 2 + font.readUInt16BE(p);
  const flags = [];
  while (flags.length < total) {
    const f = font[p++];
    flags.push(f);
    if (f & 8) for (let r = font[p++]; r > 0; r -= 1) flags.push(f);
  }
  const coords = (short, same) => {
    let v = 0;
    return flags.map((f) => {
      if (f & short) v += f & same ? font[p++] : -font[p++];
      else if (!(f & same)) { v += font.readInt16BE(p); p += 2; }
      return v;
    });
  };
  const xs = coords(2, 16);
  const ys = coords(4, 32);
  const polys = [];
  let first = 0;
  for (const end of ends) {
    const pts = [];
    for (let i = first; i <= end; i += 1) pts.push({ x: xs[i], y: ys[i], on: !!(flags[i] & 1) });
    first = end + 1;
    const n = pts.length;
    const at = (i) => pts[(i + n) % n];
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, on: true });
    const s = pts.findIndex((q) => q.on);
    const origin = s >= 0 ? pts[s] : mid(pts[0], pts[1]);
    const from = s >= 0 ? s : 0;
    const poly = [[origin.x, origin.y]];
    let cur = origin;
    for (let k = 1; k <= n; k += 1) {
      const q = at(from + k);
      if (q.on) {
        poly.push([q.x, q.y]);
        cur = q;
        continue;
      }
      const nx = at(from + k + 1);
      const end2 = nx.on ? nx : mid(q, nx);
      for (let t = 1; t <= 16; t += 1) {
        const u = t / 16;
        poly.push([
          (1 - u) ** 2 * cur.x + 2 * (1 - u) * u * q.x + u * u * end2.x,
          (1 - u) ** 2 * cur.y + 2 * (1 - u) * u * q.y + u * u * end2.y,
        ]);
      }
      cur = end2;
      if (nx.on) k += 1;
    }
    polys.push(poly);
  }
  return polys;
}

const kId = glyphId(107);
const dotId = glyphId(46);
const dotShift = advance(kId) + TRACKING * upm;
const kPolys = outline(kId);
const dotPolys = outline(dotId).map((poly) => poly.map(([x, y]) => [x + dotShift, y]));
const all = [...kPolys, ...dotPolys].flat();
const box = {
  x0: Math.min(...all.map((q) => q[0])),
  x1: Math.max(...all.map((q) => q[0])),
  y0: Math.min(...all.map((q) => q[1])),
  y1: Math.max(...all.map((q) => q[1])),
};

// Nonzero scanline fill with ss x ss supersampling. Returns per-pixel coverage 0..1.
function coverage(polys, size, map) {
  const ss = 4;
  const cov = new Float32Array(size * size);
  const edges = [];
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i += 1) {
      const [ax, ay] = map(poly[i]);
      const [bx, by] = map(poly[(i + 1) % poly.length]);
      if (ay !== by) edges.push({ ax, ay, bx, by, dir: ay < by ? 1 : -1 });
    }
  }
  for (let row = 0; row < size * ss; row += 1) {
    const y = (row + 0.5) / ss;
    const hits = [];
    for (const e of edges) {
      const lo = Math.min(e.ay, e.by);
      const hi = Math.max(e.ay, e.by);
      if (y < lo || y >= hi) continue;
      hits.push({ x: e.ax + ((y - e.ay) / (e.by - e.ay)) * (e.bx - e.ax), dir: e.dir });
    }
    hits.sort((a, b) => a.x - b.x);
    let wind = 0;
    for (let h = 0; h < hits.length - 1; h += 1) {
      wind += hits[h].dir;
      if (!wind) continue;
      const a = Math.max(0, Math.ceil(hits[h].x * ss - 0.5));
      const b = Math.min(size * ss - 1, Math.floor(hits[h + 1].x * ss - 0.5));
      const py = Math.floor(row / ss) * size;
      for (let sx = a; sx <= b; sx += 1) cov[py + Math.floor(sx / ss)] += 1 / (ss * ss);
    }
  }
  return cov;
}

function render(size, { bg, k, dot, scale }) {
  const s = (0.56 * size * scale) / Math.max(box.x1 - box.x0, box.y1 - box.y0);
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const map = ([x, y]) => [(x - cx) * s + size / 2, size / 2 - (y - cy) * s];
  const ak = coverage(kPolys, size, map);
  const ad = coverage(dotPolys, size, map);
  const px = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    const a1 = Math.min(1, ak[i]);
    const a2 = Math.min(1, ad[i]);
    const cover = Math.min(1, a1 + a2);
    const fg = [0, 1, 2].map((c) => (cover ? (k[c] * a1 + dot[c] * a2) / (a1 + a2) : 0));
    if (bg) {
      for (let c = 0; c < 3; c += 1) px[i * 4 + c] = Math.round(bg[c] * (1 - cover) + fg[c] * cover);
      px[i * 4 + 3] = 255;
    } else {
      for (let c = 0; c < 3; c += 1) px[i * 4 + c] = Math.round(fg[c]);
      px[i * 4 + 3] = Math.round(cover * 255);
    }
  }
  return png(size, px);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = (name, buf) => writeFileSync(new URL(`../assets/images/${name}`, import.meta.url), buf);
out('icon.png', render(1024, { bg: INK, k: PAPER, dot: PURPLE, scale: 1 }));
out('android-icon-foreground.png', render(1024, { bg: null, k: PAPER, dot: PURPLE, scale: 0.66 }));
out('android-icon-monochrome.png', render(1024, { bg: null, k: WHITE, dot: WHITE, scale: 0.66 }));
out('splash-icon.png', render(512, { bg: null, k: PAPER, dot: PURPLE, scale: 1.3 }));
out('favicon.png', render(48, { bg: INK, k: PAPER, dot: PURPLE, scale: 1.1 }));
console.log('icons written');
