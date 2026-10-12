// Segmentering av oppgavesett der løsningen står i samme dokument, typisk
// fra tekniske fag:
//
//  • «Oppgave N» med deloppgaver a), b) … og en løsning rett etter hver
//    oppgave, enten under overskriften «Løsning» eller som en ny runde med
//    a), b) … (sensor- og løsningsforslag).
//  • Oppgavesamlinger med nummererte oppgaver (P-1.1, P-1.2 …) i to spalter og
//    en egen løsningsdel der de samme numrene gjentas.
//
// Formler, brøker og kretsfigurer blir sjelden gode som ren tekst. Derfor
// lagres også områdene på siden der oppgaven og løsningen står, slik at de kan
// vises som utsnitt av originalen. Teksten brukes til gjenkjenning og søk.

import { normalizeMathText, normalizeSymbol } from '../math/parse';

export interface OLine {
  page: number;
  text: string;
  box: [number, number, number, number];
  bold?: boolean;
  col?: 0 | 1 | 2; // 0 = venstre spalte, 1 = høyre spalte, 2 = hele bredden
}

export interface OPageInput {
  pdfPage: number;
  text: string;
  lines?: { t: string; b: [number, number, number, number]; bold?: boolean }[];
  figureBoxes?: [number, number, number, number][];
}

export interface Region {
  page: number;
  box: [number, number, number, number];
}

export interface AnswerKey {
  symbol: string;
  /** Verdi i SI-enhet som desimalstreng. */
  value: string;
  unit?: string;
  /** Slik det står i løsningen, f.eks. «i1 = 7,5 A». */
  display: string;
}

export interface OItem {
  label: string; // «2a», «P-1.3»
  taskNo: number;
  sub: string;
  intro: string;
  stem: string;
  stemLines: OLine[];
  guide: string;
  guideLines: OLine[];
  regions: Region[];
  solutionRegions: Region[];
  figures: { page: number; box: [number, number, number, number]; inGuide?: boolean }[];
  pages: number[];
  answerKeys: AnswerKey[];
  topicHint?: string;
}

export interface OSegmentation {
  format: 'oppgave' | 'samling';
  items: OItem[];
  notes: string[];
  hasSolutions: boolean;
}

const TRAILER_RE = /^(Errata|Vedlegg|Appendiks|Formelark|Formelsamling|Formelverk|Tabeller?)\b/i;
const HEADER_RE = /^(?:[Oo]ppgave|OPPGAVE|Oppg\.|Spørsmål|SPØRSMÅL|Question|QUESTION|Task|TASK|Problem|PROBLEM)\s+(\d{1,2}|I{1,3}|IV|V|VI{1,3}|IX|X)\b\s*[:.)]?\s*(.*)$/;
const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
export const taskNumber = (s: string) => (/^\d+$/.test(s) ? Number(s) : ROMAN[s.toUpperCase()] ?? NaN);
const P_RE = /^(P-\d{1,2}\.\d{1,2})\b\s*(.*)$/;
const SOL_RE = /^(Løsning|Løsningsforslag|LF|Svar|Fasit)\s*:?\s*$/i;
const SUB_RE = /^\(?([a-l])\)\s*(.*)$/;
const PART_HEAD_RE = /^Del\s+(I{1,3}|IV|V|[1-5])\s*$/;

export function looksLikeOppg(pages: OPageInput[]): 'oppgave' | 'samling' | null {
  const lines = pages.flatMap((p) => (p.lines?.length ? p.lines.map((l) => l.t.trim()) : p.text.split('\n').map((t) => t.trim())));
  const plabels = new Set(lines.map((t) => P_RE.exec(t)?.[1]).filter(Boolean));
  if (plabels.size >= 8) return 'samling';
  const heads = lines.filter((t) => HEADER_RE.test(t) && t.length < 60).length;
  return heads >= 2 ? 'oppgave' : null;
}

// ——— Felles hjelpere ———

/** Løpende topp- og bunntekst (samme tekst på samme sted på mange sider) og sidetall. */
function runningLines(pages: OPageInput[]): Set<string> {
  const count = new Map<string, number>();
  for (const p of pages)
    for (const l of p.lines ?? []) {
      if (l.b[1] > 0.06 && l.b[1] < 0.93) continue;
      const key = `${l.t.replace(/\d+/g, '#').trim()}@${Math.round(l.b[1] * 50)}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  const out = new Set<string>();
  for (const [k, n] of count) if (n >= Math.max(2, pages.length * 0.4)) out.add(k);
  return out;
}

function isRunning(l: { t: string; b: number[] }, running: Set<string>): boolean {
  if (/^[-–]?\s*\d{1,3}\s*[-–]?$/.test(l.t.trim()) && (l.b[1] < 0.06 || l.b[1] > 0.93)) return true;
  return running.has(`${l.t.replace(/\d+/g, '#').trim()}@${Math.round(l.b[1] * 50)}`);
}

/** Kort tekst som ser ut som merking i en figur (verdier, nodenavn), ikke setninger. */
function labelLike(t: string): boolean {
  const words = t.split(/\s+/).filter((w) => /\p{L}{3,}/u.test(w) && !UNIT_LIKE.test(w));
  return t.length <= 30 && words.length <= 1;
}
const UNIT_LIKE = /^(k|M|m|µ)?(Ω|V|A|W|F|H|Hz)$/;

function inBox(l: OLine, boxes: [number, number, number, number][]): boolean {
  const [x, y, w, h] = l.box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return boxes.some(([bx, by, bw, bh]) => cx >= bx && cx <= bx + bw && cy >= by && cy <= by + bh);
}

const PREFIX: Record<string, number> = { G: 1e9, M: 1e6, k: 1e3, m: 1e-3, µ: 1e-6, μ: 1e-6, u: 1e-6, n: 1e-9, p: 1e-12 };

function toDecimalString(v: number): string {
  if (!Number.isFinite(v)) return '0';
  if (v === 0) return '0';
  // Fire gjeldende siffer holder for sammenlikning med toleranse.
  const s = Number(v.toPrecision(6));
  const str = s.toString();
  if (!/e/i.test(str)) return str;
  const [m, e] = str.split(/e/i);
  const exp = Number(e);
  const [ip, fp = ''] = m.replace('-', '').split('.');
  const digits = ip + fp;
  const sign = v < 0 ? '-' : '';
  if (exp < 0) return `${sign}0.${'0'.repeat(-exp - 1)}${digits}`;
  return sign + digits + '0'.repeat(Math.max(0, exp - fp.length));
}

const UNIT_WORDS = /^(Ω|Ω|V|A|W|F|H|Hz|s|J|C|dB|VA|var|kΩ|mA|mV|kV|µF|nF|pF|mH|ms|µs|rad)$/;
const SYMBOL_RE = /^(?:[A-Za-zτωφθ][A-Za-z0-9τωφθ]{0,5}(?:,[A-Za-z0-9]{1,3})?)$/;
const VALUE_RE = /^([−-]?\d+(?:[.,]\d+)?)\s*(G|M|k|m|µ|μ|n|p)?(Ω|Ω|V|A|W|F|H|Hz|s|J|C|dB|VA|var|rad\/s|rad s−1)?(?![\p{L}\d])\s*(.*)$/u;

/** Leser «symbol = … = tall enhet» fra løsningstekst. Siste verdi per symbol er svaret. */
export function extractAnswerKeys(input: (string | { text: string; x?: number; y?: number })[]): AnswerKey[] {
  const out = new Map<string, AnswerKey>();
  // Ankere: linjer som starter med et symbol. En fortsettelseslinje «= 63 V»
  // hører til ankeret på samme rad (brøk imellom), eller til det siste ankeret
  // like over og til venstre. Uten koordinater: linja rett over.
  const anchors: { sym: string; x: number; y: number }[] = [];
  let lastSym: string | null = null;
  for (const item of input) {
    const raw = typeof item === 'string' ? item : item.text;
    const x = typeof item === 'string' ? undefined : item.x;
    const y = typeof item === 'string' ? undefined : item.y;
    const geo = x !== undefined && y !== undefined;
    // Senket indeks skilt fra størrelsen i tekstlaget («i a = …» = ia).
    const line = raw.replace(/\s+/g, ' ').trim().replace(/^([ivpRV]) ([a-z0-9]) ?(?==)/, '$1$2 ');
    if (!line.includes('=')) {
      lastSym = null;
      continue;
    }
    const sides = line.split('=').map((t) => t.trim());
    let sym = sides[0];
    const row = geo ? [...anchors].reverse().find((a) => Math.abs(a.y - y!) < 0.008 && a.x < x!) : undefined;
    const near = geo ? [...anchors].reverse().find((a) => a.x <= x! + 0.02 && y! - a.y >= -0.008 && y! - a.y <= 0.045) : undefined;
    if (!sym) sym = geo ? row?.sym ?? near?.sym ?? '' : lastSym ?? ''; // fortsettelseslinje «= 63 V»
    else if (/^[a-e]$/.test(sym) && row) sym = row.sym; // «b = −9,5 A» midt i en brøk på samme rad
    if (!SYMBOL_RE.test(sym) || UNIT_WORDS.test(sym) || /^(og|er|av|for|med|der|som|gir)$/i.test(sym)) {
      lastSym = null;
      // Ukjent venstreside («i 6 Ω =»): fortsettelser på samme rad hører til den, ikke til et eldre anker.
      if (geo && sides[0]) anchors.push({ sym: '', x: x!, y: y! });
      continue;
    }
    lastSym = sym;
    if (geo) anchors.push({ sym, x: sides[0] ? x! : row?.x ?? near?.x ?? x!, y: y! });
    const lastSide = sides[sides.length - 1];
    const m = VALUE_RE.exec(lastSide);
    if (!m || sides.length < 2) continue;
    const rest = m[4] ?? '';
    // Et uttrykk som fortsetter (brøk, sum, differanse, kompleks del) er ikke et ferdig svar.
    if (/^[+·×*/^(|∠j−-]/.test(rest)) continue;
    // Et symbol rett etter verdien betyr et produkt med en brøk («v = 90 V · R/RT»).
    if (/^\p{L}/u.test(rest)) continue;
    const num = Number(m[1].replace('−', '-').replace(',', '.'));
    if (!Number.isFinite(num)) continue;
    const unit = m[3] ? m[3].replace('Ω', 'Ω').replace('rad s−1', 'rad/s') : undefined;
    if (m[2] && !unit) continue;
    const factor = m[2] ? PREFIX[m[2]] ?? 1 : 1;
    let key = normalizeSymbol(sym).replace(/,/g, '');
    // Senket indeks på egen linje («i» over «b = −9,5 A»): størrelsen følger av enheten.
    const QTY: Record<string, string> = { A: 'i', V: 'v', Ω: 'R', W: 'p' };
    if (/^[a-eghj-oqrsuxyz]$/.test(key) && unit && QTY[unit]) {
      key = QTY[unit] + key;
      sym = key;
    }
    if (!unitFits(key, unit)) continue;
    out.set(key, { symbol: key, value: toDecimalString(num * factor), unit, display: `${sym} = ${m[1]}${unit ? ' ' + (m[2] ?? '') + unit : ''}` });
  }
  return [...out.values()];
}

/** Enheten må passe til størrelsen symbolet står for (v → V, i → A, R → Ω …). */
function unitFits(sym: string, unit?: string): boolean {
  const c = sym[0];
  const want: Record<string, string[]> = { v: ['V'], V: ['V', 'VA'], i: ['A'], I: ['A'], R: ['Ω'], Z: ['Ω'], X: ['Ω'], P: ['W'], p: ['W'], Q: ['var', 'VA', 'C'], S: ['VA'], C: ['F'], L: ['H'], τ: ['s'], t: ['s'], T: ['s'], ω: ['rad/s'], w: ['rad/s'], f: ['Hz'], W: ['J'], E: ['J'], G: [] };
  if (/^A/.test(sym)) return !unit || unit === 'dB';
  const list = want[c];
  if (!list) return true;
  if (!unit) return list.length === 0;
  return list.includes(unit);
}

/** Ord i oppgaven som peker på et svarsymbol. */
const SYNONYMS: [RegExp, RegExp][] = [
  [/thevenin-?spenning|thévenin-?spenning/i, /^[vV]_?(Th|th|TH|ab)$/],
  [/thevenin-?motstand/i, /^R_?(Th|th|TH)$/],
  [/norton-?strøm/i, /^[iI]_?(N|n|sc)$/],
  [/totalmotstand|ekvivalent motstand|samlet motstand/i, /^R_?(T|t|ekv|eq|ab|tot)$/],
  [/tidskonstant/i, /^(τ|tau)$/],
  [/startspenning/i, /^V_?0$/],
  [/sluttspenning/i, /^V_?f$/],
  [/knekkfrekvens|grensefrekvens/i, /^(ωc|wc|fc|ω_c)$/],
  [/maksimal (spennings)?forsterkning/i, /^(A_?max(dB)?|AdB)$/],
  [/totalimpedans/i, /^Z_?(T|tot)$/],
  [/effekt/i, /^[pP]\w{0,3}$/],
];

/** Behold bare svar på det oppgaven faktisk spør etter: symboler som står etter «finn/beregn …». */
export function keysForStem(keys: AnswerKey[], stem: string): AnswerKey[] {
  const asked: string[] = [];
  const verb = /(finn|beregn|bestem|regn ut|hva er|hvor stor)/gi;
  let m: RegExpExecArray | null;
  while ((m = verb.exec(stem))) {
    const after = stem.slice(m.index + m[0].length);
    const cut = (t: string) => t.split(/[.?;:]|\s(?:over|gjennom|slik at|når|dersom|hvis|ved|fra|mellom|med|for)\s/)[0];
    // Punktliste etter verbet: hvert punkt er en egen størrelse som skal finnes.
    if (/^\s*•/.test(after)) for (const b of after.split('•').slice(1)) asked.push(cut(b));
    else asked.push(cut(after));
  }
  // Senket indeks skilt fra størrelsen i tekstlaget («i b» = ib).
  const askedText = asked.join(' | ');
  const joined = askedText.replace(/(^|[^\p{L}])([ivpRV]) ([a-z0-9])(?=[^\p{L}\d]|$)/gu, '$1$2$3');
  return keys.filter((k) => {
    const re = new RegExp(`(?:^|[^\\p{L}\\d])${k.symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^\\p{L}\\d]|$)`, 'u');
    if (re.test(askedText) || re.test(joined) || re.test(normalizeMathText(askedText))) return true;
    return SYNONYMS.some(([w, s]) => w.test(askedText || stem) && s.test(k.symbol));
  });
}

/** Område (x, y, b, h) rundt linjene, utvidet til spaltebredden. */
function regionFor(lines: OLine[], x0: number, x1: number, extraBoxes: [number, number, number, number][] = []): [number, number, number, number] | null {
  if (!lines.length && !extraBoxes.length) return null;
  let top = Infinity;
  let bottom = -Infinity;
  for (const l of lines) {
    top = Math.min(top, l.box[1]);
    bottom = Math.max(bottom, l.box[1] + l.box[3]);
  }
  for (const b of extraBoxes) {
    top = Math.min(top, b[1]);
    bottom = Math.max(bottom, b[1] + b[3]);
  }
  top = Math.max(0, top - 0.008);
  bottom = Math.min(1, bottom + 0.01);
  return [Math.max(0, x0), top, Math.min(1, x1) - Math.max(0, x0), bottom - top];
}

// ——— «Oppgave N» med løsning ———

function segmentOppgave(pages: OPageInput[], opts: { solutionsExpected: boolean }): OSegmentation {
  const running = runningLines(pages);
  const figs = new Map<number, [number, number, number, number][]>();
  const all: OLine[] = [];
  for (const p of pages) {
    figs.set(p.pdfPage, p.figureBoxes ?? []);
    for (const l of p.lines ?? []) {
      const t = l.t.replace(/\s+/g, ' ').trim();
      if (!t || isRunning(l, running)) continue;
      all.push({ page: p.pdfPage, text: t, box: l.b, bold: l.bold });
    }
  }
  const heads: number[] = [];
  all.forEach((l, i) => {
    const m = HEADER_RE.exec(l.text);
    // Vekting i parentes («(Oppgaven teller 50 %. …)») kan gjøre overskriften lang.
    const weightOnly = !!m && /^\(.*\)$/.test(m[2].trim());
    if (m && l.box[0] < 0.3 && (l.text.length < 60 || weightOnly) && (l.bold || !m[2] || m[2].length < 40 || weightOnly)) heads.push(i);
  });
  // Samme nummer to ganger rett etter hverandre («Question 1 Attached» + «Problem 1 (25%)»): behold den siste.
  for (let h = heads.length - 2; h >= 0; h--) {
    const a = HEADER_RE.exec(all[heads[h]].text)![1];
    const b = HEADER_RE.exec(all[heads[h + 1]].text)![1];
    if (taskNumber(a) === taskNumber(b) && heads[h + 1] - heads[h] <= 8) heads.splice(h, 1);
  }
  // Etter siste oppgave: sider med errata, vedlegg eller formelark hører ikke til løsningen.
  if (heads.length) {
    const cut = all.findIndex((l, i) => i > heads[heads.length - 1] && TRAILER_RE.test(l.text) && l.text.length < 70 && (l.bold || all[i - 1]?.page !== l.page));
    if (cut > 0) all.splice(cut);
  }
  const items: OItem[] = [];
  let hasSolutions = false;
  const notes: string[] = [];
  for (let h = 0; h < heads.length; h++) {
    const start = heads[h];
    const end = h + 1 < heads.length ? heads[h + 1] : all.length;
    const no = taskNumber(HEADER_RE.exec(all[start].text)![1]);
    const body = all.slice(start + 1, end);
    // Grense mellom oppgave og løsning.
    let boundary = body.findIndex((l) => SOL_RE.test(l.text));
    const solHeader = boundary >= 0;
    if (boundary < 0) {
      let maxSub = -1;
      for (let i = 0; i < body.length; i++) {
        const m = SUB_RE.exec(body[i].text);
        if (!m || body[i].box[0] > 0.35) continue;
        const k = m[1].charCodeAt(0) - 97;
        // Neste bokstav i rekken er en ny deloppgave; en ny runde fra a) er løsningsdelen.
        // Andre treff (f.eks. «(i)» i en opplisting) ignoreres.
        if (k === maxSub + 1) {
          maxSub = k;
          continue;
        }
        if (k === 0 && maxSub >= 1) {
          boundary = i;
          break;
        }
      }
      // Stilskifte: mindre skrift og lenger til venstre enn oppgaveteksten.
      // Referanse: de første linjene i oppgaveteksten.
      const taskLines = body.slice(0, Math.min(3, boundary < 0 ? body.length : boundary)).filter((l) => l.text.length > 12 && !inBox(l, figs.get(l.page) ?? []));
      if (opts.solutionsExpected && taskLines.length) {
        const hs = taskLines.map((l) => l.box[3]).sort((a, b) => a - b);
        const mh = hs[Math.floor(hs.length / 2)];
        const minX = Math.min(...taskLines.map((l) => l.box[0]));
        const figBoxes = (p: number) => figs.get(p) ?? [];
        const styleIdx = body.findIndex((l, i) => i >= 1 && l.text.length > 8 && l.box[3] < mh * 0.94 && l.box[0] < minX - 0.008 && !inBox(l, figBoxes(l.page)));
        if (styleIdx >= 0 && (boundary < 0 || styleIdx < boundary)) boundary = styleIdx;
      }
      // Løsning rett etter figuren uten egen overskrift: etter figurteksten kommer
      // bare utregning og tabeller, ingen nye deloppgaver eller spørsmål.
      if (boundary < 0 && opts.solutionsExpected) {
        const cap = body.findIndex((l) => /^Figur:?\s*\d+\s*$/i.test(l.text));
        const after = cap >= 0 ? body.slice(cap + 1) : [];
        const ask = /^(Finn|Beregn|Bestem|Hva|Hvor|Tegn|Forklar|Gjør|Skriv|Vis|Lag|Sett|Bruk|Anta)\b/;
        if (after.length >= 3 && !after.some((l) => (SUB_RE.test(l.text) && l.box[0] < 0.35) || ask.test(l.text))) boundary = cap + 1;
      }
    }
    const taskPart = boundary >= 0 ? body.slice(0, boundary) : body;
    const solPart = boundary >= 0 ? body.slice(solHeader ? boundary + 1 : boundary) : [];
    if (solPart.length) hasSolutions = true;
    const figOf = (l: OLine) => inBox(l, figs.get(l.page) ?? []) && labelLike(l.text) && !SUB_RE.test(l.text) && l.box[0] > 0.2;
    const textLines = taskPart.filter((l) => !figOf(l) && !/^Figur:?\s*\d+\s*$/.test(l.text));
    // Deloppgaver.
    const subs: { letter: string; lines: OLine[] }[] = [];
    const intro: OLine[] = [];
    for (const l of textLines) {
      const m = SUB_RE.exec(l.text);
      // Deloppgaver må komme i rekkefølge (a, b, c …), så «(i)» i en opplisting ikke blir en ny deloppgave.
      const nextLetter = subs.length ? String.fromCharCode(subs[subs.length - 1].letter.charCodeAt(0) + 1) : 'a';
      if (m && l.box[0] < 0.35 && m[1] === nextLetter) subs.push({ letter: m[1], lines: m[2] ? [{ ...l, text: m[2] }] : [] });
      else if (subs.length) subs[subs.length - 1].lines.push(l);
      else intro.push(l);
    }
    // Områder: oppgaven fra overskriften til grensen, løsningen fra grensen til neste oppgave.
    const taskRegionLines = [all[start], ...taskPart];
    const regions = regionsAcrossPages(taskRegionLines, figs);
    const solutionRegions = regionsAcrossPages(solutionPartLines(solPart, solHeader ? body[boundary] : undefined), figs);
    const taskFigs = figuresIn(regions, figs, false);
    const solFigs = figuresIn(solutionRegions, figs, true);
    const guideLines = solPart.filter((l) => !figOf(l));
    const guide = guideLines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
    const keys = extractAnswerKeys(guideLines.map((l) => ({ text: l.text, x: l.box[0], y: l.page + l.box[1] })));
    const introText = intro.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
    const pagesUsed = [...new Set([...regions, ...solutionRegions].map((r) => r.page))].sort((a, b) => a - b);
    const base = { taskNo: no, intro: introText, guide, guideLines, regions, solutionRegions, figures: [...taskFigs, ...solFigs], pages: pagesUsed, answerKeys: keys };
    if (subs.length >= 2) {
      for (const s of subs) {
        const stem = s.lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
        items.push({ ...base, label: `${no}${s.letter}`, sub: s.letter, stem, stemLines: s.lines, answerKeys: keysForStem(keys, `${introText} ${stem}`) });
      }
    } else {
      const stemLines = subs.length ? [...intro, ...subs[0].lines] : intro;
      const stem = stemLines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
      items.push({ ...base, intro: '', label: String(no), sub: '', stem, stemLines, answerKeys: keysForStem(keys, stem) });
    }
  }
  const uniq = dedupe(items);
  if (!hasSolutions && opts.solutionsExpected) notes.push('Fant ingen løsninger i dokumentet.');
  return { format: 'oppgave', items: uniq, notes, hasSolutions };
}

function solutionPartLines(sol: OLine[], header?: OLine): OLine[] {
  return header ? [header, ...sol] : sol;
}

/** Ett område per side mellom første og siste linje, i full bredde. */
function regionsAcrossPages(lines: OLine[], figs: Map<number, [number, number, number, number][]>): Region[] {
  const byPage = new Map<number, OLine[]>();
  for (const l of lines) byPage.set(l.page, [...(byPage.get(l.page) ?? []), l]);
  const out: Region[] = [];
  for (const [page, ls] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    const top = Math.min(...ls.map((l) => l.box[1]));
    const bottom = Math.max(...ls.map((l) => l.box[1] + l.box[3]));
    // Ta med figurer som ligger i det samme vertikale området.
    // Figurer som begynner inne i området, hører med (ikke en høy figur som bare stikker ned i det).
    const extra = (figs.get(page) ?? []).filter((b) => b[1] >= top - 0.03 && b[1] < bottom);
    const r = regionFor(ls, 0.04, 0.96, extra);
    if (r) out.push({ page, box: r });
  }
  return out;
}

function figuresIn(regions: Region[], figs: Map<number, [number, number, number, number][]>, inGuide: boolean) {
  const out: OItem['figures'] = [];
  for (const r of regions)
    for (const b of figs.get(r.page) ?? []) {
      const cy = b[1] + b[3] / 2;
      if (cy >= r.box[1] && cy <= r.box[1] + r.box[3]) out.push({ page: r.page, box: b, inGuide });
    }
  return out;
}

function dedupe(items: OItem[]): OItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.label) ? false : (seen.add(i.label), true)));
}

// ——— Oppgavesamling med P-numre i to spalter ———

function segmentSamling(pages: OPageInput[]): OSegmentation {
  const running = runningLines(pages);
  const figs = new Map<number, [number, number, number, number][]>();
  const ordered: OLine[] = [];
  const colBounds = new Map<number, [number, number, number, number]>(); // venstre x0, x1, høyre x0, x1
  const sizes: number[] = [];
  for (const p of pages) for (const l of p.lines ?? []) sizes.push(l.b[3]);
  sizes.sort((a, b) => a - b);
  const medianH = sizes[Math.floor(sizes.length / 2)] || 0.015;
  for (const p of pages) {
    figs.set(p.pdfPage, p.figureBoxes ?? []);
    const ls: OLine[] = [];
    // To spalter bare når mange tekstlinjer starter ved midten av siden.
    const twoCol = (p.lines ?? []).filter((l) => l.b[0] > 0.47 && l.b[0] < 0.57 && l.t.length > 18).length >= 5;
    for (const l of p.lines ?? []) {
      const t = l.t.replace(/\s+/g, ' ').trim();
      if (!t || isRunning(l, running)) continue;
      const cx = l.b[0] + l.b[2] / 2;
      const col: 0 | 1 | 2 = !twoCol ? 0 : l.b[2] > 0.62 ? 2 : cx < 0.5 ? 0 : 1;
      ls.push({ page: p.pdfPage, text: t, box: l.b, bold: l.bold, col });
    }
    const left = ls.filter((l) => l.col === 0);
    const right = ls.filter((l) => l.col === 1);
    const lx0 = left.length ? Math.min(...left.map((l) => l.box[0])) : 0.06;
    const rx1 = right.length ? Math.max(...right.map((l) => l.box[0] + l.box[2])) : 0.94;
    const rx0 = right.length ? Math.min(...right.map((l) => l.box[0])) : 0.5;
    if (twoCol) colBounds.set(p.pdfPage, [lx0 - 0.012, Math.max(0.49, Math.min(rx0 - 0.008, 0.52)), Math.min(rx0 - 0.012, 0.51), rx1 + 0.012]);
    else colBounds.set(p.pdfPage, [Math.min(lx0, 0.08) - 0.012, 0.95, 0.95, 0.95]);
    const byY = (a: OLine, b: OLine) => a.box[1] - b.box[1];
    ordered.push(...[...ls.filter((l) => l.col !== 1)].sort(byY), ...right.sort(byY));
  }
  // Hendelser: P-numre, overskrifter for kapitler og deler.
  type Seg = { label: string; start: number; end: number; solution: boolean; topic?: string };
  const segs: Seg[] = [];
  const seen = new Set<string>();
  let inSolutions = false;
  let topic: string | undefined;
  let cur: Seg | null = null;
  const close = (i: number) => {
    if (cur) {
      cur.end = i;
      segs.push(cur);
      cur = null;
    }
  };
  for (let i = 0; i < ordered.length; i++) {
    const l = ordered[i];
    if (PART_HEAD_RE.test(l.text)) {
      close(i);
      continue;
    }
    if (/^(Løsning|Løsninger|Løsningsforslag)$/i.test(l.text) && l.box[3] > medianH * 1.3) {
      close(i);
      inSolutions = true;
      continue;
    }
    if (/^(Formelverk|Formelark|Formelsamling|Introduksjon|Emnebeskrivelse)$/i.test(l.text) && l.box[3] > medianH * 1.3) {
      close(i);
      continue;
    }
    // Kapitteloverskrift: stor skrift, kort tekst, ingen tall.
    if (l.box[3] > medianH * 1.6 && l.text.length < 50 && /^[A-ZÆØÅ][\p{L}\s,-]{4,}$/u.test(l.text) && !P_RE.test(l.text)) {
      close(i);
      topic = l.text;
      continue;
    }
    const m = P_RE.exec(l.text);
    if (m) {
      close(i);
      const label = m[1];
      const sol = inSolutions || seen.has(label);
      if (seen.has(label)) inSolutions = true;
      seen.add(label);
      cur = { label, start: i, end: i, solution: sol, topic };
    }
  }
  close(ordered.length);
  // Figurtekster «Figur P-1.8» knytter figurer til riktig oppgave.
  const captionFig = new Map<string, Region[]>();
  for (const l of ordered) {
    const m = /^Figur\s+(P-\d{1,2}\.\d{1,2})\b/.exec(l.text);
    if (!m) continue;
    const boxes = figs.get(l.page) ?? [];
    const cx = l.box[0] + l.box[2] / 2;
    const above = boxes.filter((b) => b[1] + b[3] <= l.box[1] + 0.02 && l.box[1] - (b[1] + b[3]) < 0.06 && cx >= b[0] - 0.05 && cx <= b[0] + b[2] + 0.05).sort((a, b) => b[1] + b[3] - (a[1] + a[3]));
    if (above[0]) {
      const top = above[0][1];
      const box: [number, number, number, number] = [above[0][0] - 0.01, top - 0.01, above[0][2] + 0.02, l.box[1] + l.box[3] - top + 0.015];
      captionFig.set(m[1], [...(captionFig.get(m[1]) ?? []), { page: l.page, box }]);
    }
  }
  const items = new Map<string, OItem>();
  const order: string[] = [];
  const num = (label: string) => label.slice(2).split('.').map(Number);
  for (const s of segs) {
    const lines = ordered.slice(s.start, s.end);
    const first = P_RE.exec(lines[0].text)!;
    const body = [{ ...lines[0], text: first[2] }, ...lines.slice(1)].filter((l) => l.text && !/^Figur\s+P-/.test(l.text));
    const textLines = body.filter((l) => !inBox(l, figs.get(l.page) ?? []));
    // Område: per side og spalte.
    const groups = new Map<string, OLine[]>();
    for (const l of lines) {
      const k = `${l.page}:${l.col === 1 ? 1 : 0}`;
      groups.set(k, [...(groups.get(k) ?? []), l]);
    }
    const regions: Region[] = [];
    for (const [k, ls] of groups) {
      const [pg, c] = k.split(':').map(Number);
      const cb = colBounds.get(pg) ?? [0.06, 0.5, 0.5, 0.94];
      const [x0, x1] = ls.some((l) => l.col === 2) ? [cb[0], cb[3]] : c === 1 ? [cb[2], cb[3]] : [cb[0], cb[1]];
      const top = Math.min(...ls.map((l) => l.box[1]));
      const bottom = Math.max(...ls.map((l) => l.box[1] + l.box[3]));
      // Figurer uten figurtekst som ligger i samme spalte og høyde, hører med.
      const extra = (figs.get(pg) ?? []).filter((b) => b[1] < bottom + 0.005 && b[1] + b[3] > top - 0.005 && b[0] + b[2] / 2 >= x0 && b[0] + b[2] / 2 <= x1);
      const r = regionFor(ls, x0, x1, extra);
      if (r) regions.push({ page: pg, box: r });
    }
    regions.sort((a, b) => a.page - b.page || a.box[0] - b.box[0] || a.box[1] - b.box[1]);
    let it = items.get(s.label);
    if (!it) {
      const [ch, n] = num(s.label);
      it = { label: s.label, taskNo: ch, sub: String(n), intro: '', stem: '', stemLines: [], guide: '', guideLines: [], regions: [], solutionRegions: [], figures: [], pages: [], answerKeys: [], topicHint: s.topic };
      items.set(s.label, it);
      order.push(s.label);
    }
    if (!s.solution) {
      it.stemLines.push(...textLines);
      it.stem = it.stemLines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
      it.regions.push(...regions);
      if (!it.topicHint) it.topicHint = s.topic;
    } else {
      it.guideLines.push(...textLines);
      it.guide = it.guideLines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
      it.solutionRegions.push(...regions);
      it.answerKeys = keysForStem(extractAnswerKeys(it.guideLines.map((l) => ({ text: l.text, x: l.box[0], y: l.page + l.box[1] }))), it.stem);
    }
  }
  for (const it of items.values()) {
    const cap = captionFig.get(it.label) ?? [];
    for (const c of cap) {
      // Figuren kan stå et annet sted enn teksten (flytende figurer): vis den som eget utsnitt.
      const inside = it.regions.some((r) => r.page === c.page && c.box[1] >= r.box[1] - 0.01 && c.box[1] + c.box[3] <= r.box[1] + r.box[3] + 0.01 && c.box[0] >= r.box[0] - 0.02 && c.box[0] + c.box[2] <= r.box[0] + r.box[2] + 0.02);
      if (!inside) it.figures.push({ page: c.page, box: c.box });
    }
    it.pages = [...new Set([...it.regions, ...it.solutionRegions, ...it.figures].map((r) => r.page))].sort((a, b) => a - b);
  }
  const list = order.map((l) => items.get(l)!).filter((i) => i.stem || i.regions.length);
  const withSol = list.filter((i) => i.solutionRegions.length).length;
  return { format: 'samling', items: list, notes: [`${list.length} oppgaver, løsning funnet for ${withSol}.`], hasSolutions: withSol > 0 };
}

export function segmentOppg(pages: OPageInput[], opts: { solutionsExpected: boolean }): OSegmentation {
  const kind = looksLikeOppg(pages);
  const seg = kind === 'samling' ? segmentSamling(pages) : segmentOppgave(pages, opts);
  for (const it of seg.items) guardSolution(it);
  return seg;
}

/**
 * Oppgaveutsnitt og figurer skal aldri vise løsningen. Står løsningen på
 * samme side (og i samme spalte), klippes utsnittet over den, og figurer
 * som ligger i løsningen flyttes til løsningsdelen.
 */
function guardSolution(it: OItem) {
  const sol = it.solutionRegions;
  if (!sol.length) return;
  const sameCol = (a: number[], b: number[]) => Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]) > 0.5 * Math.min(a[2], b[2]);
  const clip = (page: number, box: [number, number, number, number]): [number, number, number, number] | null => {
    let b = box;
    for (const s of sol) {
      if (s.page !== page || !sameCol(b, s.box)) continue;
      const top = s.box[1];
      if (b[1] >= top - 0.005) return null;
      if (b[1] + b[3] > top) b = [b[0], b[1], b[2], top - 0.004 - b[1]];
    }
    return b;
  };
  it.regions = it.regions.flatMap((r) => {
    const b = clip(r.page, r.box);
    return b && b[3] > 0.01 ? [{ ...r, box: b }] : [];
  });
  const seen = new Set<string>();
  it.figures = it.figures
    .map((f) => {
      if (f.inGuide) return f;
      const b = clip(f.page, f.box);
      return b && b[3] > 0.02 ? { ...f, box: b } : { ...f, inGuide: true };
    })
    .filter((f) => {
      const k = `${f.page}:${f.box.map((n) => n.toFixed(3)).join(',')}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}
