// Begrenset uttrykksformat for elevsvar. Elevtekst kjøres aldri som kode:
// den tokeniseres og parses til et lite syntakstre som bare støtter
// tall, symboler, + − · / ^, parenteser, prosent og noen få funksjoner.

import { Rat, MathError } from './rational';

export type Node =
  | { t: 'num'; v: Rat; raw: string }
  | { t: 'var'; name: string }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node; implicit?: boolean }
  | { t: 'neg'; a: Node }
  | { t: 'pct'; a: Node }
  | { t: 'call'; fn: string; args: Node[] };

export interface Statement {
  kind: 'expr' | 'eq' | 'text';
  sides: Node[];
  approx: boolean[]; // approx[i] gjelder relasjonen mellom sides[i] og sides[i+1]
  continuation: boolean; // linjen starter med «=» og fortsetter forrige uttrykk
  units: string[];
  raw: string;
  /** Navngitt størrelse skrevet med ord, f.eks. «endring = 15 %». */
  label?: string;
}

export interface Ambiguity {
  id: string;
  text: string;
  question: string;
  options: { value: string; label: string }[];
  chosen?: string;
}

export interface ParseResult {
  ok: boolean;
  statements: Statement[];
  ambiguities: Ambiguity[];
  unresolved: Ambiguity[];
  error?: string;
}

export const DEFAULT_SYMBOLS = [
  'Qd', 'Qs', 'TC', 'AC', 'MC', 'VC', 'FC', 'TR', 'MR', 'TVC', 'AVC', 'ATC', 'Pk', 'Pp', 'V0', 'V1', 'Q0', 'P0', 'Q1', 'P1', 'TI',
];
const FUNCS = ['sqrt', 'ln', 'log', 'exp', 'rot'];
const UNITS = ['kr', 'nok', 'kroner', 'stk', 'enheter', 'enhet', 'mill', 'millioner', 'prosent', 'prosentpoeng', 'pp', 'mrd', 'tusen', 'per', 'år', 'timer', 'time', 'kg', 'liter'];
const CONNECTORS = ['og', 'så', 'gir', 'dvs', 'altså', 'da', 'blir', 'eller'];
// Symboler som kan tas som funksjonsverdi: Qd(20) betyr Qd evaluert i P = 20.
export const FUNCTION_SYMBOLS = ['Qd', 'Qs', 'TC', 'AC', 'MC', 'TR', 'VC'];

type Tok =
  | { k: 'num'; raw: string; v: Rat; amb?: Ambiguity; alt?: Rat; altKind?: 'split' }
  | { k: 'id'; name: string }
  | { k: 'fn'; name: string }
  | { k: 'op'; v: '+' | '-' | '*' | '/' | '^' }
  | { k: 'lp' }
  | { k: 'rp' }
  | { k: 'eq'; approx: boolean }
  | { k: 'pct' }
  | { k: 'sep' }
  | { k: 'unit'; v: string }
  | { k: 'word'; v: string }
  | { k: 'comma' };

function normalizeInput(s: string): string {
  return s
    .replace(/[−–—]/g, '-')
    .replace(/[·×⋅∙]/g, '*')
    .replace(/÷/g, '/')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/\\cdot/g, '*')
    .replace(/\\times/g, '*')
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))')
    .replace(/[{}]/g, (c) => (c === '{' ? '(' : ')'))
    .replace(/(\p{L})_\(([\p{L}\d]{1,4})\)/gu, '$1$2') // R_{Th} → RTh
    .replace(/(\p{L})_(\p{L}|\d)/gu, '$1$2') // Q_d → Qd
    .replace(/ | /g, ' ')
    .replace(/\btau\b/g, 'τ')
    .replace(/\btheta\b/g, 'θ')
    .replace(/\bomega_?c\b|\bw_?c\b|ω_c/g, 'ωc')
    .replace(/A_?\(?max\)?\s*,\s*dB|A_?max_?dB|A_?dB/g, 'AdB');
}

/** Samme normalisering av et symbol som parseren gjør på elevens tekst («Amax,dB» → «AdB»). */
export function normalizeMathText(s: string): string {
  return normalizeInput(s);
}

export function normalizeSymbol(sym: string): string {
  return normalizeInput(sym).replace(/\s+/g, '');
}

function tokenize(input: string, symbols: string[], resolutions: Record<string, string>, siUnits = false): { toks: Tok[]; ambiguities: Ambiguity[] } {
  const s = normalizeInput(input);
  const toks: Tok[] = [];
  const ambiguities: Ambiguity[] = [];
  const symSet = [...symbols].sort((a, b) => b.length - a.length);
  let i = 0;
  const isDigit = (c: string | undefined) => !!c && c >= '0' && c <= '9';
  const isLetter = (c: string | undefined) => !!c && /\p{L}/u.test(c);
  /** Leser en SI-enhet rett etter et tall og skalerer tallet. */
  const eatUnit = (pos: number): number => {
    const m = SI_UNIT_RE.exec(s.slice(pos));
    if (!m) return pos;
    const last = toks[toks.length - 1];
    if (last && last.k === 'num' && m[1]) {
      const f = SI_PREFIX[m[1]];
      last.v = last.v.mul(f.includes('/') ? Rat.of(1).div(Rat.parseDecimal(f.split('/')[1])) : Rat.parseDecimal(f));
    }
    toks.push({ k: 'unit', v: (m[1] ?? '') + (m[2] ?? m[4] ?? '') });
    return pos + m[0].length;
  };

  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === ' ' || c === '\n') {
      i++;
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(s[i + 1])) || (c === ',' && isDigit(s[i + 1]) && !isDigit(s[i - 1]) && toks.length > 0 && toks[toks.length - 1].k !== 'num')) {
      const start = i;
      let intPart = '';
      while (isDigit(s[i])) intPart += s[i++];
      // Grupperte tusener med hardt mellomrom er entydig.
      while (s[i] === ' ' && isDigit(s[i + 1]) && isDigit(s[i + 2]) && isDigit(s[i + 3]) && !isDigit(s[i + 4])) {
        intPart += s.slice(i + 1, i + 4);
        i += 4;
      }
      let frac = '';
      let sepChar = '';
      if ((s[i] === ',' || s[i] === '.') && isDigit(s[i + 1])) {
        sepChar = s[i];
        i++;
        while (isDigit(s[i])) frac += s[i++];
      }
      const raw = s.slice(start, i);
      let value = Rat.parseDecimal((intPart || '0') + (frac ? '.' + frac : ''));
      let amb: Ambiguity | undefined;
      // 1,200 eller 1.200: desimal eller tusenskille?
      // I tekniske fag er komma alltid desimalkomma (tusener skrives med mellomrom eller prefiks).
      if (sepChar && frac.length === 3 && /^[1-9]\d{0,2}$/.test(intPart) && !(siUnits && sepChar === ',')) {
        const id = `sep:${raw}`;
        const thousands = Rat.parseDecimal(intPart + frac);
        amb = {
          id,
          text: raw,
          question: `Mener du ${intPart},${frac} (desimaltall) eller ${intPart}${frac} (tusen­skille)?`,
          options: [
            { value: 'decimal', label: `${intPart},${frac}` },
            { value: 'thousands', label: `${intPart}${frac}` },
          ],
        };
        if (resolutions[id]) {
          amb.chosen = resolutions[id];
          if (resolutions[id] === 'thousands') value = thousands;
        }
        ambiguities.push(amb);
      }
      // «1 200»: tusenskille med vanlig mellomrom eller to tall?
      if (!frac && /^[1-9]\d{0,2}$/.test(intPart) && s[i] === ' ' && isDigit(s[i + 1]) && isDigit(s[i + 2]) && isDigit(s[i + 3]) && !isDigit(s[i + 4]) && s[i + 4] !== ',' && s[i + 4] !== '.') {
        let groups = intPart;
        let j = i;
        while (s[j] === ' ' && isDigit(s[j + 1]) && isDigit(s[j + 2]) && isDigit(s[j + 3]) && !isDigit(s[j + 4])) {
          groups += s.slice(j + 1, j + 4);
          j += 4;
        }
        const rawAll = s.slice(start, j);
        const id = `space:${rawAll}`;
        const a: Ambiguity = {
          id,
          text: rawAll,
          question: `Står «${rawAll}» for tallet ${groups}?`,
          options: [
            { value: 'thousands', label: `Ja, ${groups}` },
            { value: 'split', label: 'Nei, det er to tall' },
          ],
        };
        ambiguities.push(a);
        const choice = resolutions[id];
        if (choice) a.chosen = choice;
        if (choice !== 'split') {
          // Standard for visning er tusenskille, men linjen regnes som uavklart til eleven har svart.
          value = Rat.parseDecimal(groups);
          i = j;
          toks.push({ k: 'num', raw: rawAll, v: value, amb: a });
          if (siUnits) i = eatUnit(i);
          continue;
        }
      }
      toks.push({ k: 'num', raw, v: value, amb });
      if (siUnits) i = eatUnit(i);
      continue;
    }
    if (isLetter(c) || c === 'Ω' || c === 'µ') {
      // Symboler med små bokstaver og tall (i1, vTh, RTh) leses som ett symbol.
      const whole = symSet.find((x) => s.startsWith(x, i) && !/[\p{L}\d]/u.test(s[i + x.length] ?? ''));
      if (whole && (whole.length > 1)) {
        toks.push({ k: 'id', name: whole });
        i += whole.length;
        continue;
      }
      let j = i;
      while (j < s.length && (isLetter(s[j]) || (isDigit(s[j]) && j > i && /^[A-Z]{1,3}$/.test(s.slice(i, j))))) j++;
      const run = s.slice(i, j);
      const lower = run.toLowerCase();
      if (FUNCS.includes(lower) && s[j] === '(') {
        toks.push({ k: 'fn', name: lower === 'rot' ? 'sqrt' : lower });
        i = j;
        continue;
      }
      if (symSet.includes(run)) {
        toks.push({ k: 'id', name: run });
        i = j;
        continue;
      }
      if (CONNECTORS.includes(lower)) {
        toks.push({ k: 'sep' });
        i = j;
        continue;
      }
      if (UNITS.includes(lower)) {
        toks.push({ k: 'unit', v: lower });
        i = j;
        continue;
      }
      if (run.length === 1) {
        toks.push({ k: 'id', name: run });
        i = j;
        continue;
      }
      // Korte kombinasjoner med stor bokstav deles i symboler og enkeltbokstaver (Pt → P·t).
      // Rene småbokstavord (er, av, for, som …) behandles som tekst.
      if (run.length <= 3 && /[A-ZÆØÅ]/.test(run[0])) {
        let k = 0;
        const parts: string[] = [];
        while (k < run.length) {
          const sym = symSet.find((x) => run.startsWith(x, k));
          if (sym) {
            parts.push(sym);
            k += sym.length;
          } else {
            parts.push(run[k]);
            k++;
          }
        }
        for (const p of parts) toks.push({ k: 'id', name: p });
        i = j;
        continue;
      }
      toks.push({ k: 'word', v: run });
      i = j;
      continue;
    }
    switch (c) {
      case '+':
      case '-':
      case '*':
      case '/':
      case '^':
        if (c === '-' && s[i + 1] === '>') {
          toks.push({ k: 'sep' });
          i += 2;
          continue;
        }
        toks.push({ k: 'op', v: c });
        i++;
        continue;
      case ':':
        // «100 : 5» er deling; «Svar:» er en etikett.
        if (toks.length && (toks[toks.length - 1].k === 'num' || toks[toks.length - 1].k === 'rp' || toks[toks.length - 1].k === 'id') && /\s*[\d(]/.test(s.slice(i + 1, i + 3))) {
          toks.push({ k: 'op', v: '/' });
        } else {
          toks.push({ k: 'sep' });
        }
        i++;
        continue;
      case '(':
      case '[':
        toks.push({ k: 'lp' });
        i++;
        continue;
      case ')':
      case ']':
        toks.push({ k: 'rp' });
        i++;
        continue;
      case '=':
        if (s[i + 1] === '>') {
          toks.push({ k: 'sep' });
          i += 2;
          continue;
        }
        toks.push({ k: 'eq', approx: false });
        i++;
        continue;
      case '≈':
        toks.push({ k: 'eq', approx: true });
        i++;
        continue;
      case '→':
      case '⇒':
      case '⇔':
      case ';':
        toks.push({ k: 'sep' });
        i++;
        continue;
      case ',':
        toks.push({ k: 'sep' });
        i++;
        continue;
      case '%':
        toks.push({ k: 'pct' });
        i++;
        continue;
      case '.':
      case '!':
      case '?':
        toks.push({ k: 'sep' });
        i++;
        continue;
      case '<':
      case '>':
      case '≤':
      case '≥':
        throw new MathError('Ulikheter støttes ikke i utregningsfeltet ennå');
      default:
        throw new MathError(`Ukjent tegn «${c}»`);
    }
  }
  return { toks, ambiguities };
}

class Parser {
  private p = 0;
  constructor(private toks: Tok[]) {}
  peek(): Tok | undefined {
    return this.toks[this.p];
  }
  next(): Tok | undefined {
    return this.toks[this.p++];
  }
  done(): boolean {
    return this.p >= this.toks.length;
  }

  expr(): Node {
    let left = this.term();
    for (;;) {
      const t = this.peek();
      if (t && t.k === 'op' && (t.v === '+' || t.v === '-')) {
        this.next();
        const right = this.term();
        left = { t: 'bin', op: t.v, a: left, b: right };
      } else break;
    }
    return left;
  }

  term(): Node {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (t && t.k === 'op' && (t.v === '*' || t.v === '/')) {
        this.next();
        const right = this.unary();
        left = { t: 'bin', op: t.v, a: left, b: right };
      } else if (t && (t.k === 'num' || t.k === 'id' || t.k === 'lp' || t.k === 'fn')) {
        const right = this.power();
        left = { t: 'bin', op: '*', a: left, b: right, implicit: true };
      } else break;
    }
    return left;
  }

  unary(): Node {
    const t = this.peek();
    if (t && t.k === 'op' && (t.v === '-' || t.v === '+')) {
      this.next();
      const a = this.unary();
      return t.v === '-' ? { t: 'neg', a } : a;
    }
    return this.power();
  }

  power(): Node {
    const base = this.postfix();
    const t = this.peek();
    if (t && t.k === 'op' && t.v === '^') {
      this.next();
      const exp = this.unary();
      return { t: 'bin', op: '^', a: base, b: exp };
    }
    return base;
  }

  postfix(): Node {
    let n = this.primary();
    for (;;) {
      const t = this.peek();
      if (t && t.k === 'pct') {
        this.next();
        n = { t: 'pct', a: n };
      } else break;
    }
    return n;
  }

  primary(): Node {
    const t = this.next();
    if (!t) throw new MathError('Uttrykket slutter for tidlig');
    if (t.k === 'num') return { t: 'num', v: t.v, raw: t.raw };
    if (t.k === 'id') {
      const nx = this.peek();
      if (nx && nx.k === 'lp' && FUNCTION_SYMBOLS.includes(t.name)) {
        this.next();
        const arg = this.expr();
        this.expectRp();
        return { t: 'call', fn: t.name, args: [arg] };
      }
      return { t: 'var', name: t.name };
    }
    if (t.k === 'fn') {
      const lp = this.next();
      if (!lp || lp.k !== 'lp') throw new MathError('Mangler parentes etter funksjon');
      const arg = this.expr();
      this.expectRp();
      return { t: 'call', fn: t.name, args: [arg] };
    }
    if (t.k === 'lp') {
      const e = this.expr();
      this.expectRp();
      return e;
    }
    if (t.k === 'op') throw new MathError(`Uventet «${t.v}»`);
    if (t.k === 'rp') throw new MathError('Uventet sluttparentes');
    if (t.k === 'eq') throw new MathError('Uventet likhetstegn');
    if (t.k === 'pct') throw new MathError('Prosenttegn uten tall foran');
    throw new MathError('Kunne ikke lese uttrykket');
  }

  expectRp() {
    const t = this.next();
    if (!t || t.k !== 'rp') throw new MathError('Mangler sluttparentes');
  }
}

const GENERIC_LABELS = ['svar', 'kontroll', 'utregning', 'løsning', 'steg', 'dermed', 'altså', 'så', 'da', 'vi får', 'det gir', 'dette gir'];

/** Skiller ut en ledende etikett som «Svar:» eller «Faste kostnader:» når resten er matematikk. */
function splitLabel(line: string): { rest: string; label?: string } {
  const m = /^\s*([A-Za-zÆØÅæøå][A-Za-zÆØÅæøå .]{1,40}):\s*(.+)$/.exec(line);
  if (m && /[=\d]/.test(m[2])) {
    const label = m[1].trim().toLowerCase();
    return { rest: m[2], label: GENERIC_LABELS.includes(label) ? undefined : label };
  }
  return { rest: line };
}

function parseSegment(toks: Tok[], raw: string, continuation: boolean): Statement {
  const units = toks.filter((t): t is Extract<Tok, { k: 'unit' }> => t.k === 'unit').map((t) => t.v);
  const core = toks.filter((t) => t.k !== 'unit');
  // Del opp på likhetstegn.
  const groups: Tok[][] = [[]];
  const approx: boolean[] = [];
  for (const t of core) {
    if (t.k === 'eq') {
      groups.push([]);
      approx.push(t.approx);
    } else groups[groups.length - 1].push(t);
  }
  let isCont = continuation;
  if (groups[0].length === 0 && groups.length > 1) {
    groups.shift();
    approx.shift();
    isCont = true;
  }
  const sides = groups.map((g) => {
    if (!g.length) throw new MathError('Tomt ledd ved likhetstegn');
    const p = new Parser(g);
    const n = p.expr();
    if (!p.done()) throw new MathError('Kunne ikke lese hele uttrykket');
    return n;
  });
  return { kind: sides.length > 1 || isCont ? 'eq' : 'expr', sides, approx, continuation: isCont, units, raw };
}

export interface ParseOptions {
  symbols?: string[];
  resolutions?: Record<string, string>;
  /** SI-enheter med prefiks etter tall («7,5 mA», «4 kΩ») regnes om til grunnenheten. */
  siUnits?: boolean;
}

const SI_PREFIX: Record<string, string> = { G: '1000000000', M: '1000000', k: '1000', m: '1/1000', µ: '1/1000000', μ: '1/1000000', u: '1/1000000', n: '1/1000000000', p: '1/1000000000000' };
const SI_UNIT_RE = /^\s*(?:(G|M|k|m|µ|μ|u|n|p)?(Ω|Ω|ohm|VA|var|Hz|dB|V|A|W|F|H|s|J|C|rad\/s)(?![\p{L}\d])|()(°))/u;

/** Parser én linje elevarbeid. En linje kan inneholde flere steg (piler, «og», semikolon). */
export function parseLine(line: string, opts: ParseOptions = {}): ParseResult {
  const symbols = opts.symbols ?? DEFAULT_SYMBOLS;
  const resolutions = opts.resolutions ?? {};
  const trimmed = line.trim();
  if (!trimmed) return { ok: true, statements: [], ambiguities: [], unresolved: [] };
  const { rest: src, label: leadLabel } = splitLabel(trimmed);
  try {
    const { toks, ambiguities } = tokenize(src, symbols, resolutions, !!opts.siUnits);
    const hasWords = toks.some((t) => t.k === 'word');
    const segs: Tok[][] = [[]];
    const segLabel: (string | undefined)[] = [leadLabel];
    let run: string[] = [];
    for (const t of toks) {
      if (t.k === 'word') {
        run.push(t.v);
        if (segs[segs.length - 1].length) {
          segs.push([]);
          segLabel.push(undefined);
        }
        segLabel[segLabel.length - 1] = run.slice(-4).join(' ').toLowerCase();
      } else if (t.k === 'sep') {
        segs.push([]);
        segLabel.push(run.length ? undefined : undefined);
        run = [];
      } else {
        if (t.k !== 'unit') run = [];
        segs[segs.length - 1].push(t);
      }
    }
    const statements: Statement[] = [];
    const startsWithEq = /^\s*[=≈]/.test(src);
    const unresolved = ambiguities.filter((a) => !a.chosen);
    if (hasWords) {
      // Forklaringstekst med innskutt matematikk: vi tar bare med likninger vi kan lese sikkert.
      segs.forEach((g, gi) => {
        if (!g.some((t) => t.k !== 'unit') || !g.some((t) => t.k === 'eq')) return;
        try {
          const st = parseSegment(g, trimmed, false);
          const lab = segLabel[gi];
          if (st.continuation && lab) {
            st.continuation = false;
            st.kind = st.sides.length > 1 ? 'eq' : 'expr';
            st.label = lab;
            statements.push(st);
          } else if (!st.continuation && st.sides.length >= 2) {
            if (lab) st.label = lab;
            statements.push(st);
          }
        } catch {
          /* ignorer uleselig innskudd i tekst */
        }
      });
      statements.push({ kind: 'text', sides: [], approx: [], continuation: false, units: [], raw: trimmed });
      return { ok: true, statements, ambiguities, unresolved };
    }
    segs
      .filter((g) => g.some((t) => t.k !== 'unit'))
      .forEach((g, idx) => {
        const st = parseSegment(g, trimmed, idx === 0 && startsWithEq && !leadLabel);
        if (idx === 0 && leadLabel) {
          st.label = leadLabel;
          if (st.continuation) {
            st.continuation = false;
            st.kind = st.sides.length > 1 ? 'eq' : 'expr';
          }
        }
        statements.push(st);
      });
    return { ok: true, statements, ambiguities, unresolved };
  } catch (e) {
    return { ok: false, statements: [], ambiguities: [], unresolved: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** Parser et enkelt uttrykk (brukt i maler og kunnskapsbase). Kaster ved feil. */
export function parseExpr(src: string, symbols: string[] = DEFAULT_SYMBOLS): Node {
  const r = parseLine(src, { symbols });
  if (!r.ok) throw new MathError(r.error ?? 'Parsefeil');
  const st = r.statements[0];
  if (!st || st.kind === 'text' || st.sides.length !== 1) throw new MathError(`Forventet ett uttrykk: ${src}`);
  return st.sides[0];
}

export function parseEquation(src: string, symbols: string[] = DEFAULT_SYMBOLS): [Node, Node] {
  const r = parseLine(src, { symbols });
  if (!r.ok) throw new MathError(r.error ?? 'Parsefeil');
  const st = r.statements[0];
  if (!st || st.sides.length !== 2) throw new MathError(`Forventet én likning: ${src}`);
  return [st.sides[0], st.sides[1]];
}

export function varsIn(n: Node, acc: Set<string> = new Set()): Set<string> {
  switch (n.t) {
    case 'var':
      acc.add(n.name);
      break;
    case 'bin':
      varsIn(n.a, acc);
      varsIn(n.b, acc);
      break;
    case 'neg':
    case 'pct':
      varsIn(n.a, acc);
      break;
    case 'call':
      if (FUNCTION_SYMBOLS.includes(n.fn)) acc.add(n.fn + '()');
      n.args.forEach((a) => varsIn(a, acc));
      break;
  }
  return acc;
}

export function numbersIn(n: Node, acc: Rat[] = []): Rat[] {
  switch (n.t) {
    case 'num':
      acc.push(n.v);
      break;
    case 'bin':
      numbersIn(n.a, acc);
      numbersIn(n.b, acc);
      break;
    case 'neg':
    case 'pct':
      numbersIn(n.a, acc);
      break;
    case 'call':
      n.args.forEach((a) => numbersIn(a, acc));
      break;
  }
  return acc;
}

export function hasPercent(n: Node): boolean {
  switch (n.t) {
    case 'pct':
      return true;
    case 'bin':
      return hasPercent(n.a) || hasPercent(n.b);
    case 'neg':
      return hasPercent(n.a);
    case 'call':
      return n.args.some(hasPercent);
    default:
      return false;
  }
}
