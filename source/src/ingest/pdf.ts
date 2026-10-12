// Tekstuttrekking og sidegjengivelse for PDF med pdf.js. Hver side får egen
// status: tekstlag lest, trenger bildelesing (skann eller uleselig tekstlag)
// eller visuell kontroll (figur). Figurer får et utsnitt beregnet fra
// tegneoperasjonene, og linjer med fet skrift merkes (brukes til fasit i
// flervalg der riktig svar er uthevet).

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';

export interface ExtractedLine {
  t: string;
  b: [number, number, number, number]; // x, y, w, h normalisert (y fra toppen)
  size: number;
  bold?: boolean;
  garbled?: boolean;
}

export interface ExtractedPage {
  pdfPage: number;
  text: string;
  lines: ExtractedLine[];
  width: number;
  height: number;
  imageOps: number;
  pathOps: number;
  hasTextLayer: boolean;
  /** Tekstlaget finnes, men er kodet slik at det ikke kan leses (egendefinert skrift). */
  garbled: boolean;
  hasFigure: boolean;
  figureBoxes: [number, number, number, number][];
  printedPage?: string;
}

export interface ExtractedPdf {
  pageCount: number;
  info: { title?: string; subject?: string; author?: string };
  pages: ExtractedPage[];
}

let workerConfigured = false;
export function configurePdfWorker(src: string) {
  if (workerConfigured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = src;
  workerConfigured = true;
}

export async function openPdf(bytes: Uint8Array) {
  const task = pdfjsLib.getDocument({ data: bytes.slice(0), isEvalSupported: false, useSystemFonts: true });
  return task.promise;
}

type PdfDoc = Awaited<ReturnType<typeof openPdf>>;

// ——— Uleselig tekstlag ———

const VOWEL = /[aeiouyæøåAEIOUYÆØÅéèêóòüö]/;
const MATH_TOKEN = /^(?:[=+\-−·×÷/|<>≤≥≈∞^_*,.:;()[\]{}′'→←↔∑∫√∆∂]+|[(\[]?[−-]?[A-Za-zΩΩµμπθωτλφαβΔ]{1,3}[\d′']{0,3}[)\].,]?|[−-]?\d+(?:[.,]\d+)?(?:[kMmµμnpG]?(?:Ω|Ω|V|A|W|F|H|Hz|s|J|C|dB|rad|°))?[.,)]?|[kMmµμnpG]?(?:Ω|Ω|V|A|W|F|H|Hz|dB|°))$/u;

/** Er en tekstlinje «søppel» fra en skrift uten tegnkoding? */
export function isGarbledLine(t: string): boolean {
  const s = t.trim();
  if (!s) return false;
  let ctrl = 0;
  let odd = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 32 && c !== 9) ctrl++;
    else if ((c >= 0xe000 && c <= 0xf8ff) || c === 0xfffd || ch === 'ÿ') odd++;
  }
  if ((ctrl + odd) / s.length > 0.05) return true;
  const tokens = s.split(/\s+/).filter(Boolean);
  if (s.length < 20 || tokens.length < 3) return false;
  const good = tokens.filter((w) => /^[«("„'“]?[A-Za-zÆØÅæøåÀ-ÿ][A-Za-zÆØÅæøåÀ-ÿ-]+[.,:;!?»)"'”]*$/.test(w) && VOWEL.test(w)).length;
  const numeric = tokens.filter((w) => /^[-−+]?[\d.,%()kr]+$/.test(w)).length;
  // Formler (symboler, operatorer, enheter) er ikke tegn på uleselig tekst.
  const math = tokens.filter((w) => MATH_TOKEN.test(w)).length;
  const judged = tokens.length - numeric - math;
  if (judged < 3) return false;
  return good / judged < 0.3;
}

export function garbledShare(lines: { t: string }[]): number {
  const total = lines.reduce((n, l) => n + l.t.length, 0);
  if (!total) return 0;
  return lines.filter((l) => isGarbledLine(l.t)).reduce((n, l) => n + l.t.length, 0) / total;
}

// ——— Linjer ———

function assembleLines(items: any[], vw: number, vh: number, boldOf: (fontName: string) => boolean): ExtractedLine[] {
  const rows: { y: number; size: number; parts: { x: number; w: number; s: string; size: number; bold: boolean }[] }[] = [];
  for (const it of items) {
    if (!it || typeof it.str !== 'string' || !it.str.length) continue;
    const [, , c, d, x, y] = it.transform as number[];
    const size = Math.hypot(c, d) || it.height || 10;
    let row = rows.find((r) => Math.abs(r.y - y) < Math.max(r.size, size) * 0.55);
    if (!row) {
      row = { y, size, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, w: it.width ?? 0, s: it.str, size, bold: boldOf(it.fontName) });
    row.size = Math.max(row.size, size);
  }
  rows.sort((a, b) => b.y - a.y);
  // En rad med et stort mellomrom (to spalter, eller tekst ved siden av en figur) deles i
  // separate linjer, slik at spaltene ikke flettes sammen.
  const split: typeof rows = [];
  const wOf = (p: { w: number; s: string; size: number }) => (p.w > 0 ? p.w : p.s.length * p.size * 0.5);
  // Spaltemellomrom: en loddrett stripe som ligger i et mellomrom i mange rader (to spalter med
  // løsning, eller tekst ved siden av figurer). Rader med et mellomrom der deles, selv om det er smalt.
  const rowGaps = rows.map((r) => {
    const ps = [...r.parts].sort((a, b) => a.x - b.x);
    const gaps: [number, number][] = [];
    let end = -Infinity;
    for (const p of ps) {
      if (end > -Infinity && p.x - end > r.size * 0.8) gaps.push([end / vw, p.x / vw]);
      end = Math.max(end, p.x + wOf(p));
    }
    return gaps;
  });
  let gutter: number | null = null;
  let best = 0;
  for (let g = 0.4; g <= 0.62; g += 0.005) {
    const n = rowGaps.filter((gs) => gs.some(([a, b]) => a < g && b > g)).length;
    if (n > best) {
      best = n;
      gutter = g;
    }
  }
  if (best < 6) gutter = null;
  rows.forEach((r, ri) => {
    r.parts.sort((a, b) => a.x - b.x);
    let cur: typeof r.parts = [];
    let end = -Infinity;
    const gap = Math.max(vw * 0.035, r.size * 1.6);
    const colGap = gutter !== null ? rowGaps[ri].find(([a, b]) => a < gutter! && b > gutter!) : undefined;
    for (const p of r.parts) {
      const w = wOf(p);
      if (cur.length && (p.x - end > gap || (colGap && p.x / vw >= colGap[1] - 1e-6 && end / vw <= colGap[0] + 1e-6))) {
        split.push({ y: r.y, size: r.size, parts: cur });
        cur = [];
      }
      cur.push(p);
      end = Math.max(end, p.x + w);
    }
    if (cur.length) split.push({ y: r.y, size: r.size, parts: cur });
  });
  const out: ExtractedLine[] = [];
  for (const r of split) {
    let text = '';
    let end = -Infinity;
    let boldChars = 0;
    let chars = 0;
    for (const p of r.parts) {
      if (text && p.x - end > r.size * 0.2 && !text.endsWith(' ') && !p.s.startsWith(' ')) text += ' ';
      text += p.s;
      end = p.x + p.w;
      const n = p.s.replace(/\s/g, '').length;
      chars += n;
      if (p.bold) boldChars += n;
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const x0 = Math.min(...r.parts.map((p) => p.x));
    const x1 = Math.max(...r.parts.map((p) => p.x + p.w));
    const line: ExtractedLine = { t: text, b: [x0 / vw, 1 - (r.y + r.size) / vh, (x1 - x0) / vw, (r.size * 1.3) / vh], size: r.size };
    // «Fet» bare når det aller meste av linjen er fet (ikke en enkelt uthevet bokstav).
    if (chars >= 3 && boldChars / chars > 0.8) line.bold = true;
    if (isGarbledLine(text)) line.garbled = true;
    out.push(line);
  }
  return out;
}

function detectPrinted(lines: ExtractedLine[]): string | undefined {
  for (const l of lines) {
    const m = /^(?:Side|Page|s\.)\s*(\d+)(?:\s*(?:av|of|\/)\s*\d+)?$/i.exec(l.t.trim());
    if (m) return m[1];
  }
  // Et alene-stående tall nederst på siden.
  const bottom = lines.filter((l) => l.b[1] > 0.9);
  for (const l of bottom) if (/^\d{1,3}$/.test(l.t.trim())) return l.t.trim();
  return undefined;
}

// ——— Figurer fra tegneoperasjonene ———

type M = number[];
const mul = (m1: M, m2: M): M => [m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1], m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3], m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]];
const apply = (p: [number, number], m: M): [number, number] => [p[0] * m[0] + p[1] * m[2] + m[4], p[0] * m[1] + p[1] * m[3] + m[5]];

type Box = { x0: number; y0: number; x1: number; y1: number; n: number; image: boolean };

function boxOf(corners: [number, number][], vpT: M, vw: number, vh: number): Box {
  const pts = corners.map((c) => apply(c, vpT));
  const xs = pts.map((p) => p[0] / vw);
  const ys = pts.map((p) => p[1] / vh);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), n: 1, image: false };
}

/** Finner områder med tegninger eller bilder. Rammer, streker og små tegn filtreres bort. */
export function figureRegions(fnArray: number[], argsArray: any[], vpTransform: M, vw: number, vh: number): Box[] {
  const OPS: any = (pdfjsLib as any).OPS;
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const raw: Box[] = [];
  let pending: Box | null = null;
  const PAINT = new Set([OPS.stroke, OPS.closeStroke, OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].filter((x) => x !== undefined));
  const unit: [number, number][] = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ];
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    if (fn === OPS.save) stack.push(ctm.slice());
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform && args) ctm = mul(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm.slice());
      if (Array.isArray(args?.[0]) && args[0].length === 6) ctm = mul(ctm, args[0]);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintJpegXObject || fn === OPS.paintImageXObjectRepeat) {
      const b = boxOf(unit.map((u) => apply(u, ctm)), vpTransform, vw, vh);
      b.image = true;
      if (b.x1 - b.x0 > 0.04 && b.y1 - b.y0 > 0.03) raw.push(b);
    } else if (fn === OPS.constructPath && args?.[2]) {
      // pdf.js lagrer [minX, maxX, minY, maxY] i banens lokale koordinater.
      const [minX, maxX, minY, maxY] = args[2] as number[];
      if (![minX, maxX, minY, maxY].every(Number.isFinite)) continue;
      const bx = boxOf(
        [
          [minX, minY],
          [maxX, minY],
          [minX, maxY],
          [maxX, maxY],
        ].map((p) => apply(p as [number, number], ctm)),
        vpTransform,
        vw,
        vh,
      );
      const w = bx.x1 - bx.x0;
      const h = bx.y1 - bx.y0;
      // Rammer, bokser rundt oppgaver og bakgrunner: én enkelt bane som dekker mye av siden.
      if (w > 0.6 || h > 0.6 || (w > 0.45 && h > 0.12)) continue;
      if (w < 0.002 && h < 0.002) continue;
      if ((h < 0.004 && w > 0.3) || (w < 0.004 && h > 0.25)) continue; // skillelinjer, rammekanter og spaltestreker
      // Banen teller bare hvis den faktisk tegnes (ikke når den bare brukes til klipping).
      pending = bx;
    } else if (pending && PAINT.has(fn)) {
      // Store fylte flater er bakgrunner (f.eks. bak en tekstspalte), ikke tegninger.
      const filledOnly = fn === OPS.fill || fn === OPS.eoFill;
      if (!(filledOnly && pending.x1 - pending.x0 > 0.25 && pending.y1 - pending.y0 > 0.1)) raw.push(pending);
      pending = null;
    } else if (fn === OPS.endPath) {
      pending = null;
    }
  }
  // Slå sammen nære bokser til klynger.
  const pad = 0.018;
  const boxes = raw.map((b) => ({ ...b }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i];
        const B = boxes[j];
        if (A.x0 - pad <= B.x1 && B.x0 - pad <= A.x1 && A.y0 - pad <= B.y1 && B.y0 - pad <= A.y1) {
          boxes[i] = { x0: Math.min(A.x0, B.x0), y0: Math.min(A.y0, B.y0), x1: Math.max(A.x1, B.x1), y1: Math.max(A.y1, B.y1), n: A.n + B.n, image: A.image || B.image };
          boxes.splice(j, 1);
          merged = true;
          break outer;
        }
      }
  }
  return boxes.filter((b) => {
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    if (w < 0.08 || h < 0.05) return false;
    return b.image || b.n >= 4;
  });
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

/** Utvider en figur med aksetekster og tall som står tett inntil. */
function withLabels(b: Box, lines: ExtractedLine[]): [number, number, number, number] {
  let { x0, y0, x1, y1 } = b;
  for (const l of lines) {
    const [lx, ly, lw, lh] = l.b;
    const near = lx < x1 + 0.04 && lx + lw > x0 - 0.04 && ly < y1 + 0.03 && ly + lh > y0 - 0.03;
    // Aksetekster og kurvenavn er korte; overskrifter og setninger hører ikke til figuren.
    const words = l.t.split(/\s+/).filter((w) => /[A-Za-zÆØÅæøå]/.test(w)).length;
    const short = l.t.length <= 40 && words <= 4 && !/^(Spørsmål|Oppgave|Del|DEL|Svar|Løsning|Sensor)\b/.test(l.t) && !/[:?]$/.test(l.t.trim());
    if (near && short) {
      x0 = Math.min(x0, lx);
      x1 = Math.max(x1, lx + lw);
      y0 = Math.min(y0, ly);
      y1 = Math.max(y1, ly + lh);
    }
  }
  x0 = clamp01(x0 - 0.01);
  y0 = clamp01(y0 - 0.01);
  x1 = clamp01(x1 + 0.01);
  y1 = clamp01(y1 + 0.01);
  return [x0, y0, x1 - x0, y1 - y0];
}

export async function extractPdf(bytes: Uint8Array, onPage?: (n: number, total: number) => void): Promise<ExtractedPdf> {
  const doc = await openPdf(bytes);
  let info: ExtractedPdf['info'] = {};
  try {
    const md: any = await doc.getMetadata();
    info = { title: md?.info?.Title || undefined, subject: md?.info?.Subject || undefined, author: md?.info?.Author || undefined };
  } catch {
    /* metadata er valgfritt */
  }
  const pages: ExtractedPage[] = [];
  const OPS: any = (pdfjsLib as any).OPS;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    let imageOps = 0;
    let pathOps = 0;
    let regions: Box[] = [];
    let regionsOk = false;
    try {
      // Operatorlisten først: den laster skriftene, slik at vi kan se hvilke som er fete.
      const ol = await page.getOperatorList();
      for (const fn of ol.fnArray) {
        if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject || fn === OPS.paintJpegXObject) imageOps++;
        if (fn === OPS.constructPath) pathOps++;
      }
      regions = figureRegions(ol.fnArray as number[], ol.argsArray as any[], vp.transform as M, vp.width, vp.height);
      regionsOk = true;
    } catch {
      /* operatorliste er bare et hint */
    }
    const boldCache = new Map<string, boolean>();
    const boldOf = (fontName: string): boolean => {
      if (!fontName) return false;
      if (boldCache.has(fontName)) return boldCache.get(fontName)!;
      let b = false;
      try {
        const objs: any = (page as any).commonObjs;
        if (objs?.has?.(fontName)) {
          const f = objs.get(fontName);
          b = !!f?.bold || !!f?.black || /bold|black|heavy|semibold|demi/i.test(String(f?.name ?? '') + String(f?.loadedName ?? ''));
        }
      } catch {
        b = false;
      }
      boldCache.set(fontName, b);
      return b;
    };
    const tc = await page.getTextContent();
    const lines = assembleLines(tc.items as any[], vp.width, vp.height, boldOf);
    const readable = lines.filter((l) => !l.garbled);
    const garbled = lines.length > 0 && garbledShare(lines) > 0.3;
    const text = readable.map((l) => l.t).join('\n');
    // Kort, ren tekst uten bilde på siden (skilleark, «Del II») er lest, ikke skannet.
    const chars = text.replace(/\s/g, '').length;
    const hasTextLayer = !garbled && (chars > 25 || (chars >= 3 && imageOps === 0));
    const numericLines = lines.filter((l) => /^[\d\s.,−-]+$/.test(l.t) && l.t.trim().length <= 40).length;
    const figureBoxes: [number, number, number, number][] = regions.map((r) => withLabels(r, readable));
    if (!figureBoxes.length && (pathOps >= 12 || (imageOps > 0 && !regionsOk) || numericLines >= 5) && lines.length) {
      // Reserve: det største tomrommet mellom tekstlinjene.
      const sorted = [...lines].sort((a, b) => a.b[1] - b.b[1]);
      let best: [number, number] = [0, 0];
      for (let i = 0; i + 1 < sorted.length; i++) {
        const gap = sorted[i + 1].b[1] - (sorted[i].b[1] + sorted[i].b[3]);
        if (gap > best[1] - best[0]) best = [sorted[i].b[1] + sorted[i].b[3], sorted[i + 1].b[1]];
      }
      if (best[1] - best[0] > 0.12) figureBoxes.push([0.08, best[0], 0.84, best[1] - best[0]]);
    }
    const hasFigure = figureBoxes.length > 0;
    pages.push({ pdfPage: n, text, lines: garbled ? readable : lines, width: vp.width, height: vp.height, imageOps, pathOps, hasTextLayer, garbled, hasFigure, figureBoxes, printedPage: detectPrinted(readable) });
    onPage?.(n, doc.numPages);
    page.cleanup();
  }
  const count = doc.numPages;
  await doc.destroy();
  return { pageCount: count, info, pages };
}

/** Gjengir en side til et lerret. */
export async function renderPdfCanvas(bytes: Uint8Array, pageNo: number, targetWidth = 1200): Promise<HTMLCanvasElement> {
  const doc: PdfDoc = await openPdf(bytes);
  try {
    const page = await doc.getPage(pageNo);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = targetWidth / vp1.width;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas;
  } finally {
    await doc.destroy();
  }
}

/** Gjengir en side til et bilde (brukes for skannede sider, figurer og originalvisning). */
export async function renderPdfPage(bytes: Uint8Array, pageNo: number, targetWidth = 1200): Promise<{ blob: Blob; width: number; height: number }> {
  const canvas = await renderPdfCanvas(bytes, pageNo, targetWidth);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Kunne ikke lage bilde'))), 'image/jpeg', 0.88));
  return { blob, width: canvas.width, height: canvas.height };
}

/** Et utsnitt av en side som bilde-URL (figurer ved oppgaven). */
export async function renderPdfCrop(bytes: Uint8Array, pageNo: number, box: [number, number, number, number], targetWidth = 1400): Promise<string> {
  const canvas = await renderPdfCanvas(bytes, pageNo, targetWidth);
  const [x, y, w, h] = box;
  const sx = Math.max(0, Math.round(x * canvas.width));
  const sy = Math.max(0, Math.round(y * canvas.height));
  const sw = Math.max(1, Math.min(canvas.width - sx, Math.round(w * canvas.width)));
  const sh = Math.max(1, Math.min(canvas.height - sy, Math.round(h * canvas.height)));
  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  out.getContext('2d')!.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out.toDataURL('image/png');
}
