// Tekstgjenkjenning (OCR) i nettleseren med Tesseract, uten AI og uten nett:
// motor, arbeider og norsk språkmodell ligger som egne filer ved siden av
// appen. Brukes når en side er skannet, eller når tekstlaget er kodet slik at
// det ikke kan leses (typisk for utskrifter fra Wiseflow). Hvert ord får en
// sikkerhet; lav sikkerhet vises som usikker lesing.
//
// For flervalg finner vi også hvilket alternativ som er markert som riktig
// (hake eller strek ved alternativet) ved å se på pikslene ved hvert
// alternativ. Det er en regel, ikke en tolkning, og resultatet merkes med
// hvordan det ble funnet.

import { createWorker, type Worker as TWorker } from 'tesseract.js';
import { simd } from 'wasm-feature-detect';

export interface OcrLine {
  t: string;
  b: [number, number, number, number];
  conf: number;
  lowWords: string[];
  /** Satt for alternativer i flervalg: markert som riktig i utskriften. */
  mark?: 'valgt' | 'ikke-valgt';
}

export interface OcrResult {
  text: string;
  lines: OcrLine[];
  confidence: number;
  width: number;
  height: number;
}

let workerP: Promise<TWorker> | null = null;
let failed: string | null = null;

function abs(path: string): string {
  return new URL(path, typeof location !== 'undefined' ? location.href : 'http://localhost/').href;
}

async function langData(): Promise<Uint8Array> {
  const r = await fetch(abs('vendor/tesseract/nor.traineddata.gz.b64.txt'));
  if (!r.ok) throw new Error('Fant ikke den norske språkmodellen for tekstgjenkjenning.');
  const b64 = (await r.text()).trim();
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getWorker(onStatus?: (s: string) => void): Promise<TWorker> {
  if (failed) throw new Error(failed);
  if (!workerP) {
    workerP = (async () => {
      onStatus?.('Starter tekstgjenkjenning …');
      const hasSimd = await simd().catch(() => false);
      const core = abs(hasSimd ? 'vendor/tesseract/tesseract-core-simd-lstm.wasm.js' : 'vendor/tesseract/tesseract-core-lstm.wasm.js');
      const data = await langData();
      // Først en vanlig arbeider fra fil; noen visninger krever en blob-arbeider.
      // Lastes den ikke innen rimelig tid, prøves neste måte før vi gir opp.
      const make = (blob: boolean) =>
        Promise.race([
          createWorker([{ code: 'nor', data: data.slice() }] as never, 1, {
            workerPath: abs('vendor/tesseract/worker.min.js'),
            corePath: core,
            workerBlobURL: blob,
            cacheMethod: 'none',
            gzip: true,
          } as never),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Tekstgjenkjenningen startet ikke (tidsavbrudd).')), 60000)),
        ]);
      let w: TWorker;
      try {
        w = await make(false);
      } catch {
        onStatus?.('Starter tekstgjenkjenning på en annen måte …');
        w = await make(true);
      }
      await w.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: '200' } as never);
      return w;
    })().catch((e) => {
      failed = e instanceof Error ? e.message : String(e);
      workerP = null;
      throw e;
    });
  }
  return workerP;
}

export function ocrAvailable(): boolean {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined' && !failed;
}

export async function terminateOcr() {
  if (!workerP) return;
  try {
    (await workerP).terminate();
  } catch {
    /* ignorer */
  }
  workerP = null;
}

/** Leser et lerret (en gjengitt side). */
export async function ocrCanvas(canvas: HTMLCanvasElement, onStatus?: (s: string) => void): Promise<OcrResult> {
  const w = await getWorker(onStatus);
  onStatus?.('Leser teksten på siden …');
  const r: any = await w.recognize(canvas, {}, { text: true, blocks: true } as never);
  const W = canvas.width;
  const H = canvas.height;
  const lines: OcrLine[] = [];
  for (const block of r.data.blocks ?? [])
    for (const para of block.paragraphs ?? [])
      for (const line of para.lines ?? []) {
        const words = (line.words ?? []).filter((x: any) => String(x.text ?? '').trim());
        if (!words.length) continue;
        const t = words.map((x: any) => String(x.text)).join(' ').replace(/\s+/g, ' ').trim();
        const bb = line.bbox;
        lines.push({
          t,
          b: [bb.x0 / W, bb.y0 / H, (bb.x1 - bb.x0) / W, (bb.y1 - bb.y0) / H],
          conf: Math.round(line.confidence ?? 0),
          lowWords: words.filter((x: any) => (x.confidence ?? 100) < 55).map((x: any) => String(x.text)),
        });
      }
  lines.sort((a, b) => a.b[1] - b.b[1] || a.b[0] - b.b[0]);
  markChoices(canvas, lines);
  const text = lines.map((l) => l.t).join('\n');
  const confidence = lines.length ? Math.round(lines.reduce((n, l) => n + l.conf * l.t.length, 0) / Math.max(1, lines.reduce((n, l) => n + l.t.length, 0))) : 0;
  return { text, lines, confidence, width: W, height: H };
}

// ——— Markerte alternativer ———

const OPTION_RE = /^\(?([A-Da-d])[).]?\s+\S/;

function darkAt(data: Uint8ClampedArray, W: number, x: number, y: number): boolean {
  const i = (y * W + x) * 4;
  const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return lum < 150;
}

/** Tekstspor etter markering: en strek foran bokstaven leses ofte som «|», og haken bak teksten som «v». */
const BAR_ART = /^[|\[\]!Il¦]\s*(?=\(?[A-D][).]?\s)/;
const CHECK_ART = /\s+(?:v|V|✓|✔)$/;
/** Løsere variant som bare brukes på et alternativ vi allerede vet er markert. */
const CHECK_TAIL = /\s+(?:v|V|vs|Vs|Må|må|J|w|W|✓|✔)$/;

export function cleanOptionArtifacts(lines: OcrLine[]): Map<OcrLine, { bar: boolean; check: boolean }> {
  const hints = new Map<OcrLine, { bar: boolean; check: boolean }>();
  // «A» leses av og til som «Å» eller «À» når en strek står rett foran.
  lines.forEach((l, i) => {
    const m = /^([|\[\]!Il¦]\s*)?[ÅÀÄ](?=\s)/.exec(l.t);
    if (m && lines.slice(i + 1, i + 5).some((o) => /^(?:[|\[\]!Il¦]\s*)?B\s/.test(o.t) && Math.abs(o.b[0] - l.b[0]) < 0.04)) l.t = (m[1] ?? '') + 'A' + l.t.slice(m[0].length);
  });
  // Et «A» som er lest som ett eller to andre tegn («i», «4», «Al»): linjen står rett
  // over et «B»-alternativ, på samme innrykk, og er ikke selv et alternativ.
  // Innrykket til alternativene (median), fordi en markert linje kan ha streken med i boksen.
  const optXs = lines.filter((l) => /^(?:[|\[\]!Il¦]\s*)?[A-D]\s+\S/.test(l.t) && l.b[0] < 0.35).map((l) => l.b[0]).sort((a, b) => a - b);
  const refX = optXs.length ? optXs[Math.floor(optXs.length / 2)] : null;
  lines.forEach((l, i) => {
    if (!/^(?:[|\[\]!Il¦]\s*)?B\s+\S/.test(l.t)) return;
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
      const o = lines[j];
      const near = Math.abs(o.b[0] - l.b[0]) <= 0.01 || (refX !== null && Math.abs(o.b[0] - refX) <= 0.012);
      if (!near) continue;
      if (OPTION_RE.test(o.t) || BAR_ART.test(o.t)) break;
      if (/^\S{1,3}\s+\S/.test(o.t) && !/^(?:Hva|Hvilk|Et|En|Er|Om|Ja|Nei|Vi|Du|Det|Den|Når|Hvis|For|Som|Med)\b/.test(o.t)) o.t = o.t.replace(/^\S{1,3}/, 'A');
      break;
    }
  });
  for (const l of lines) {
    let bar = false;
    let check = false;
    if (BAR_ART.test(l.t)) {
      l.t = l.t.replace(BAR_ART, '');
      bar = true;
    }
    if (OPTION_RE.test(l.t) && CHECK_ART.test(l.t)) {
      l.t = l.t.replace(CHECK_ART, '');
      check = true;
    }
    if (bar || check) hints.set(l, { bar, check });
  }
  return hints;
}

/**
 * Finner alternativer (linjer som starter med A–D) og ser etter markeringen
 * Wiseflow setter på valgt svar: en loddrett strek rett til venstre for
 * bokstaven og en hake til høyre. Rekkefølge: streken i pikslene, så
 * tekstsporene, så haken. Bare når nøyaktig ett alternativ i en gruppe er
 * markert, settes merket.
 */
export function markChoices(canvas: HTMLCanvasElement, lines: OcrLine[]) {
  const hints = cleanOptionArtifacts(lines);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let data: Uint8ClampedArray | null = null;
  const W = canvas.width;
  const H = canvas.height;
  try {
    data = ctx ? ctx.getImageData(0, 0, W, H).data : null;
  } catch {
    data = null;
  }
  const idx = lines.map((l, i) => (OPTION_RE.test(l.t) && l.b[0] < 0.35 ? i : -1)).filter((i) => i >= 0);
  // Grupper påfølgende alternativer (A, B, C, D).
  const groups: number[][] = [];
  for (const i of idx) {
    const letter = OPTION_RE.exec(lines[i].t)![1].toUpperCase();
    const g = groups[groups.length - 1];
    const prev = g ? OPTION_RE.exec(lines[g[g.length - 1]].t)![1].toUpperCase() : '';
    if (g && letter.charCodeAt(0) === prev.charCodeAt(0) + 1) g.push(i);
    else groups.push([i]);
  }
  const one = (m: boolean[]) => m.filter(Boolean).length === 1;
  for (const g of groups) {
    if (g.length < 3) continue;
    const blocks = g.map((li, k) => {
      const l = lines[li];
      const nextTop = k + 1 < g.length ? lines[g[k + 1]].b[1] : l.b[1] + l.b[3] * 2.2;
      const members = lines.filter((o, oi) => oi >= li && o.b[1] >= l.b[1] - 0.002 && o.b[1] < nextTop - 0.002);
      return { l, nextTop, members };
    });
    let bars: boolean[] = g.map(() => false);
    let checks: boolean[] = g.map(() => false);
    const xsAll = blocks.map((b) => b.l.b[0]).sort((a, b) => a - b);
    const medX = xsAll[Math.floor(xsAll.length / 2)];
    if (data) {
      const d = data;
      const scores = blocks.map(({ l, nextTop, members }) => {
        const top = Math.max(0, Math.floor((l.b[1] - 0.004) * H));
        const bottom = Math.min(H - 1, Math.floor(Math.max(l.b[1] + l.b[3], nextTop - 0.006) * H));
        // Streken står i kolonnene rett til venstre for bokstaven. Er den lest inn
        // i linjeboksen (x helt til venstre), ligger bokstaven litt lenger inne.
        const letterX = Math.floor(Math.max(l.b[0], medX) * W);
        let bar = 0;
        const x0 = Math.max(0, letterX - Math.floor(0.045 * W));
        const x1 = Math.max(0, letterX - Math.floor(0.004 * W));
        for (let x = x0; x < x1; x++) {
          let run = 0;
          for (let y = top; y <= bottom; y++) if (darkAt(d, W, x, y)) run++;
          bar = Math.max(bar, run / Math.max(1, bottom - top + 1));
        }
        // Hake: mørke piksler til høyre for teksten, men før sidekanten.
        const textRight = Math.max(...members.map((o) => o.b[0] + o.b[2]));
        const cx0 = Math.floor(Math.min(textRight + 0.006, 0.9) * W);
        const cx1 = Math.floor(0.93 * W);
        let check = 0;
        for (let x = cx0; x < cx1; x++) {
          let col = 0;
          for (let y = top; y <= bottom; y++) if (darkAt(d, W, x, y)) col++;
          // Lange loddrette streker er ramme, ikke hake.
          if (col < (bottom - top + 1) * 0.6) check += col;
        }
        return { bar, check };
      });
      bars = scores.map((s) => s.bar > 0.45);
      const minCheck = Math.max(12, (W / 1700) * 30);
      const sorted = scores.map((s) => s.check).sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      checks = scores.map((s) => s.check > minCheck && s.check > median * 2.5 + 5);
    }
    const texts = g.map((li) => hints.has(lines[li]));
    // Wiseflow legger det valgte alternativet i en ramme: linjeboksen blir høyere og starter lenger til venstre.
    const hs = blocks.map((b) => b.l.b[3]).sort((a, b) => a - b);
    const xs = blocks.map((b) => b.l.b[0]).sort((a, b) => a - b);
    const mh = hs[Math.floor(hs.length / 2)];
    const mx = xs[Math.floor(xs.length / 2)];
    const boxed = blocks.map((b) => b.l.b[3] > mh * 2.2 && b.l.b[0] < mx - 0.012);
    const marked = one(bars) ? bars : one(texts) ? texts : one(boxed) ? boxed : one(checks) ? checks : null;
    if (!marked) continue;
    g.forEach((li, k) => {
      lines[li].mark = marked[k] ? 'valgt' : 'ikke-valgt';
      if (marked[k]) for (const o of blocks[k].members) o.t = o.t.replace(CHECK_TAIL, '');
    });
  }
}

/**
 * Figurbokser beregnet fra tegneoperasjonene kan på Wiseflow-sider også dekke
 * rammer rundt svaralternativene. Etter lesing kuttes boksen ved første
 * alternativ, og bokser som stort sett er tekst forkastes.
 */
export function refineFigureBoxes(boxes: [number, number, number, number][], lines: OcrLine[]): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (const [x, y, w, h] of boxes) {
    let bottom = y + h;
    const inside = lines.filter((l) => l.b[1] + l.b[3] / 2 > y && l.b[1] + l.b[3] / 2 < bottom && l.b[0] + l.b[2] / 2 > x && l.b[0] + l.b[2] / 2 < x + w);
    const firstOption = inside.filter((l) => OPTION_RE.test(l.t)).sort((a, b) => a.b[1] - b.b[1])[0];
    if (firstOption) bottom = Math.min(bottom, firstOption.b[1] - 0.005);
    const kept = inside.filter((l) => l.b[1] < bottom);
    const textArea = kept.filter((l) => l.t.split(/\s+/).length >= 5).reduce((n, l) => n + l.b[2] * l.b[3], 0);
    const area = w * (bottom - y);
    if (bottom - y < 0.06 || area <= 0) continue;
    if (textArea / area > 0.35) continue;
    out.push([x, y, w, bottom - y]);
  }
  return out;
}
