// Kontroll av elevens mellomregninger og svar. Alt her er deterministisk og
// eksakt: hver linje vurderes mot definisjonene i oppgaven og mot den
// kontrollerte løsningen. Uleselige eller tvetydige linjer blir aldri
// registrert som matematikkfeil.

import { Rat } from './rational';
import { parseLine, parseExpr, Node, Statement, Ambiguity, DEFAULT_SYMBOLS, varsIn, numbersIn, hasPercent } from './parse';
import { RF, toRF, Env, Unsupported, solveUnivariate, sameSolutions, SolveResult } from './poly';

export interface MathContext {
  symbols: string[];
  /** Definisjoner, f.eks. { Qd: '120 - 2P', Qs: '20 + 3P' }. Sanne for alle verdier av den ukjente. */
  defs: Record<string, string>;
  /** Hvilken variabel definisjonene avhenger av (brukes for Qd(20)). */
  param: string;
  /** Den kontrollerte løsningen i denne deloppgaven, f.eks. { P: 20, Q: 80, Qd: 80, Qs: 80 }. */
  solution: Record<string, string>;
  /** Hovedukjent i likningene (P). */
  unknown: string;
  /** Symboler som bare navngir svaret (e for prosentvis endring). Par med dem kontrolleres via svarkontrollen. */
  answerSymbols?: string[];
  /** Alternative, like gyldige oppsett (f.eks. P som produsentpris i stedet for konsumentpris). */
  alt?: Omit<MathContext, 'alt'>[];
  /** Tekniske fag: tall med SI-enhet («4 kΩ») regnes om, og svar godtas med relativ toleranse. */
  units?: 'si';
}

export interface CompiledContext {
  ctx: MathContext;
  env: Env;
  sol: Record<string, Rat>;
  symbols: string[];
}

export function compileContext(ctx: MathContext): CompiledContext {
  const defs: Record<string, RF> = {};
  const funcs: Env['funcs'] = {};
  for (const [k, src] of Object.entries(ctx.defs)) {
    const rf = toRF(parseExpr(src, [...new Set([...DEFAULT_SYMBOLS, ...ctx.symbols, ...Object.keys(ctx.defs)])]), { defs });
    defs[k] = rf;
    funcs[k] = { param: ctx.param, body: rf };
  }
  const sol: Record<string, Rat> = {};
  for (const [k, v] of Object.entries(ctx.solution)) sol[k] = Rat.parse(v);
  const symbols = [...new Set([...DEFAULT_SYMBOLS, ...ctx.symbols, ...Object.keys(ctx.solution), ...(ctx.answerSymbols ?? []), ...Object.keys(ctx.defs)])].filter((x) => x.length > 1);
  return { ctx, env: { defs, funcs }, sol, symbols };
}

export type PairVerdict = 'identitet' | 'stemmer' | 'avrundet' | 'avvik' | 'ukontrollerbar';

export interface PairCheck {
  left: Node;
  right: Node;
  verdict: PairVerdict;
  note?: string;
}

export type LineStatus = 'ok' | 'avrundet' | 'avvik' | 'uavklart-inndata' | 'kan-ikke-lese' | 'tekst' | 'ukontrollerbar' | 'tom';

export interface StatementCheck {
  statement: Statement;
  pairs: PairCheck[];
  status: LineStatus;
  /** Likningen som enkelt-variabel-likning i den ukjente, når det gir mening. */
  solve?: SolveResult;
}

export interface LineCheck {
  index: number;
  raw: string;
  status: LineStatus;
  statements: StatementCheck[];
  ambiguities: Ambiguity[];
  error?: string;
  /** Hvor linjen kom fra: skrevet eller avlest fra bilde. */
  source?: 'typed' | 'image';
  /** Avlesningssikkerhet for linjer fra bilde. */
  readingCertain?: boolean;
}

function decimalsOf(n: Node): number | null {
  if (n.t === 'num') {
    const m = /[.,](\d+)$/.exec(n.raw.replace(/\s/g, ''));
    return m ? m[1].length : 0;
  }
  if (n.t === 'neg') return decimalsOf(n.a);
  if (n.t === 'pct') {
    const d = decimalsOf(n.a);
    return d === null ? null : d + 2;
  }
  return null;
}

/**
 * Er «rounded» en rimelig avrunding av «exact» med «dec» desimaler? Innenfor en halv
 * enhet i siste siffer, OG svaret må ha minst to gjeldende sifre eller ligge innenfor
 * 1 % av det eksakte. Ellers godtas 0 eller 1 for 0,5, og 3 for 2,5.
 */
export function roundingOk(exact: Rat, rounded: Rat, dec: number): boolean {
  const tol = Rat.of(1n, 10n ** BigInt(dec)).mul(Rat.of(1, 2));
  if (exact.sub(rounded).abs().cmp(tol) > 0) return false;
  const digits = Math.round(Math.abs(rounded.toNumber()) * 10 ** dec)
    .toString()
    .replace(/^0+/, '').length;
  if (digits >= 2) return true;
  const e = Math.abs(exact.toNumber());
  return e > 0 && Math.abs(exact.toNumber() - rounded.toNumber()) / e <= 0.01;
}

function checkPair(a: Node, b: Node, cc: CompiledContext): PairCheck {
  const ans = cc.ctx.answerSymbols ?? [];
  if ((a.t === 'var' && ans.includes(a.name) && !(a.name in cc.sol)) || (b.t === 'var' && ans.includes(b.name) && !(b.name in cc.sol))) {
    return { left: a, right: b, verdict: 'identitet', note: 'Navngir svaret' };
  }
  try {
    const ra = toRF(a, cc.env);
    const rb = toRF(b, cc.env);
    if (ra.equals(rb)) return { left: a, right: b, verdict: 'identitet' };
    const diff = ra.sub(rb);
    const vars = diff.vars();
    const missing = [...vars].filter((v) => !(v in cc.sol));
    if (missing.length) return { left: a, right: b, verdict: 'ukontrollerbar', note: `Ukjent symbol: ${missing.join(', ')}` };
    const va = ra.evaluate(cc.sol);
    const vb = rb.evaluate(cc.sol);
    if (va.eq(vb)) return { left: a, right: b, verdict: 'stemmer' };
    // Avrunding: den ene siden er et avrundet tall.
    const da = decimalsOf(a);
    const db = decimalsOf(b);
    for (const [dec, exact, rounded] of [
      [db, va, vb],
      [da, vb, va],
    ] as [number | null, Rat, Rat][]) {
      if (dec !== null && dec <= 6 && roundingOk(exact, rounded, dec)) return { left: a, right: b, verdict: 'avrundet', note: `Avrundet til ${dec} desimal${dec === 1 ? '' : 'er'}` };
    }
    return { left: a, right: b, verdict: 'avvik' };
  } catch (e) {
    if (e instanceof Unsupported) return { left: a, right: b, verdict: 'ukontrollerbar', note: e.message };
    return { left: a, right: b, verdict: 'ukontrollerbar', note: e instanceof Error ? e.message : String(e) };
  }
}

export function solveStatementIn(st: Statement, cc: CompiledContext, v: string): SolveResult | undefined {
  if (st.kind !== 'eq' || st.sides.length !== 2 || st.continuation) return undefined;
  try {
    const diff = toRF(st.sides[0], cc.env).sub(toRF(st.sides[1], cc.env));
    const vars = diff.vars();
    if (!vars.has(v) || vars.size > 1) return undefined;
    return solveUnivariate(diff, v);
  } catch {
    return undefined;
  }
}

export interface CheckOptions {
  resolutions?: Record<string, string>;
  /** Linjer som er avlest fra bilde og hvor avlesningen ikke er bekreftet. */
  uncertainLines?: Set<number>;
  sources?: ('typed' | 'image')[];
}

/** Kontrollerer alle linjer i et forsøk. */
export function checkWork(lines: string[], cc: CompiledContext, opts: CheckOptions = {}): LineCheck[] {
  const out: LineCheck[] = [];
  let prevLast: Node | null = null;
  lines.forEach((raw, index) => {
    const src = opts.sources?.[index] ?? 'typed';
    if (!raw.trim()) {
      out.push({ index, raw, status: 'tom', statements: [], ambiguities: [], source: src });
      return;
    }
    const pr = parseLine(raw, { symbols: cc.symbols, resolutions: opts.resolutions, siUnits: cc.ctx.units === 'si' });
    if (!pr.ok) {
      out.push({ index, raw, status: 'kan-ikke-lese', statements: [], ambiguities: [], error: pr.error, source: src });
      prevLast = null;
      return;
    }
    const stChecks: StatementCheck[] = [];
    for (const st of pr.statements) {
      if (st.kind === 'text') {
        stChecks.push({ statement: st, pairs: [], status: 'tekst' });
        continue;
      }
      const pairs: PairCheck[] = [];
      const seq = st.continuation && prevLast ? [prevLast, ...st.sides] : st.sides;
      for (let i = 0; i + 1 < seq.length; i++) pairs.push(checkPair(seq[i], seq[i + 1], cc));
      let status: LineStatus = 'ok';
      if (pairs.some((p) => p.verdict === 'avvik')) status = 'avvik';
      else if (pairs.some((p) => p.verdict === 'ukontrollerbar')) status = 'ukontrollerbar';
      else if (pairs.some((p) => p.verdict === 'avrundet')) status = 'avrundet';
      if (st.continuation && !prevLast) status = 'ukontrollerbar';
      stChecks.push({ statement: st, pairs, status, solve: solveStatementIn(st, cc, cc.ctx.unknown) });
      prevLast = st.sides[st.sides.length - 1];
    }
    let status: LineStatus = 'ok';
    const ss = stChecks.map((s) => s.status);
    if (pr.unresolved.length) status = 'uavklart-inndata';
    else if (ss.includes('avvik')) status = 'avvik';
    else if (ss.includes('ukontrollerbar')) status = 'ukontrollerbar';
    else if (ss.includes('avrundet')) status = 'avrundet';
    else if (ss.length && ss.every((x) => x === 'tekst')) status = 'tekst';
    const lc: LineCheck = { index, raw, status, statements: stChecks, ambiguities: pr.ambiguities, source: src };
    if (src === 'image') lc.readingCertain = !opts.uncertainLines?.has(index);
    out.push(lc);
  });
  return out;
}

/** Kjører kontrollen mot alle gyldige oppsett og velger det som passer elevens arbeid best. */
export function checkWorkBest(lines: string[], ctx: MathContext, opts: CheckOptions = {}): { checks: LineCheck[]; cc: CompiledContext } {
  const variants: MathContext[] = [ctx, ...(ctx.alt ?? []).map((a) => ({ ...a, answerSymbols: a.answerSymbols ?? ctx.answerSymbols }))];
  let best: { checks: LineCheck[]; cc: CompiledContext; score: number } | null = null;
  for (const v of variants) {
    const cc = compileContext(v);
    const checks = checkWork(lines, cc, opts);
    const firstBad = checks.findIndex((c) => c.status === 'avvik');
    const bad = checks.filter((c) => c.status === 'avvik').length;
    const unk = checks.filter((c) => c.status === 'ukontrollerbar').length;
    const score = (firstBad === -1 ? 1000 : firstBad * 10) - bad * 3 - unk;
    if (!best || score > best.score) best = { checks, cc, score };
  }
  return { checks: best!.checks, cc: best!.cc };
}

export interface FirstDeviation {
  lineIndex: number;
  statementIndex: number;
  lastGoodLine: number | null;
  lastGoodStatement: StatementCheck | null;
  bad: StatementCheck;
  kind: DeviationKind;
  detail: string;
  /** Hvis linjen kommer fra et bilde og avlesningen er usikker, må vi avklare før vi kaller det en feil. */
  needsReadingConfirmation: boolean;
}

export type DeviationKind =
  | 'ganget-i-stedet-for-delt'
  | 'delt-feil-vei'
  | 'fortegnsfeil-flytting'
  | 'regnefeil-konstant'
  | 'regnefeil-koeffisient'
  | 'regnefeil'
  | 'feil-fortegn-svar'
  | 'ugyldig-omforming'
  | 'feil-oppsett';

interface Linear {
  a: Rat; // koeffisient foran ukjent
  b: Rat; // konstant, slik at a·x + b = 0
}

function linearOf(st: Statement, cc: CompiledContext, v: string): Linear | null {
  if (st.sides.length !== 2) return null;
  try {
    const diff = toRF(st.sides[0], cc.env).sub(toRF(st.sides[1], cc.env));
    if (!diff.den.isConst()) return null;
    const vars = diff.vars();
    if (vars.size !== 1 || !vars.has(v)) return null;
    const c = diff.num.univariateCoeffs(v);
    if (c.length !== 2) return null;
    return { a: c[1], b: c[0] };
  } catch {
    return null;
  }
}

/** «k = m·x» eller «m·x = k»: én side konstant, andre side bare m·x. */
function isolationForm(st: Statement, cc: CompiledContext, v: string): { k: Rat; m: Rat } | null {
  if (st.sides.length !== 2) return null;
  const sides = st.sides.map((s) => {
    try {
      return toRF(s, cc.env);
    } catch {
      return null;
    }
  });
  if (!sides[0] || !sides[1]) return null;
  for (const [c, x] of [
    [sides[0], sides[1]],
    [sides[1], sides[0]],
  ] as [RF, RF][]) {
    if (c.isConst() && x.den.isConst()) {
      const vars = x.vars();
      if (vars.size === 1 && vars.has(v)) {
        const co = x.num.univariateCoeffs(v);
        if (co.length === 2 && co[0].isZero()) return { k: c.constValue(), m: co[1].div(x.den.constValue()) };
      }
    }
  }
  return null;
}

/** Deler et uttrykk i ledd med fortegn (for å finne fortegnsfeil ved flytting). */
function termsOf(n: Node, sign = 1): { n: Node; sign: number }[] {
  if (n.t === 'bin' && (n.op === '+' || n.op === '-')) return [...termsOf(n.a, sign), ...termsOf(n.b, n.op === '+' ? sign : -sign)];
  if (n.t === 'neg') return termsOf(n.a, -sign);
  return [{ n, sign }];
}

function sumRF(terms: { n: Node; sign: number }[], cc: CompiledContext): RF {
  let acc = RF.zero();
  for (const t of terms) {
    const r = toRF(t.n, cc.env);
    acc = t.sign > 0 ? acc.add(r) : acc.sub(r);
  }
  return acc;
}

function diagnoseTransition(prev: StatementCheck, bad: StatementCheck, cc: CompiledContext): { kind: DeviationKind; detail: string } {
  const v = cc.ctx.unknown;
  const correct = cc.sol[v];
  const badSolve = bad.solve;
  const badRoot = badSolve && badSolve.kind === 'roots' && badSolve.roots.length === 1 ? badSolve.roots[0] : null;
  const iso = isolationForm(prev.statement, cc, v);
  if (iso && badRoot) {
    if (badRoot.eq(iso.k.mul(iso.m))) return { kind: 'ganget-i-stedet-for-delt', detail: `Fra ${iso.k.toNo()} = ${iso.m.toNo()}${v} ble ${v} satt til ${iso.k.toNo()} · ${iso.m.toNo()} = ${badRoot.toNo()}. For å få ${v} alene må begge sider deles på ${iso.m.toNo()}.` };
    if (!iso.k.isZero() && badRoot.eq(iso.m.div(iso.k))) return { kind: 'delt-feil-vei', detail: `${v} ble satt til ${iso.m.toNo()} / ${iso.k.toNo()}. Det er ${iso.k.toNo()} som skal deles på ${iso.m.toNo()}.` };
    if (badRoot.eq(iso.k.sub(iso.m)) || badRoot.eq(iso.k.add(iso.m))) return { kind: 'ugyldig-omforming', detail: `${iso.m.toNo()} ble trukket fra eller lagt til i stedet for å dele. ${iso.m.toNo()}${v} betyr ${iso.m.toNo()} ganger ${v}.` };
  }
  if (badRoot && correct && badRoot.eq(correct.neg())) return { kind: 'feil-fortegn-svar', detail: `Svaret har motsatt fortegn av det riktige. Sjekk fortegnet i siste omforming.` };
  // Fortegnsfeil ved flytting av ledd: prøv å flytte hvert ledd uten å skifte fortegn.
  const pst = prev.statement;
  if (pst.sides.length === 2 && badSolve) {
    try {
      const L = termsOf(pst.sides[0]);
      const R = termsOf(pst.sides[1]);
      const candidates: RF[] = [];
      L.forEach((_, i) => {
        const nl = L.filter((__, j) => j !== i);
        const nr = [...R, L[i]]; // feil: samme fortegn
        candidates.push(sumRF(nl, cc).sub(sumRF(nr, cc)));
      });
      R.forEach((_, i) => {
        const nr = R.filter((__, j) => j !== i);
        const nl = [...L, R[i]];
        candidates.push(sumRF(nl, cc).sub(sumRF(nr, cc)));
      });
      for (const c of candidates) {
        const vars = c.vars();
        if (vars.size === 1 && vars.has(v)) {
          const s = solveUnivariate(c, v);
          if (sameSolutions(s, badSolve)) return { kind: 'fortegnsfeil-flytting', detail: `Et ledd ser ut til å ha byttet side uten å skifte fortegn. Når et ledd flyttes over likhetstegnet, skifter det fortegn.` };
        }
      }
    } catch {
      /* ingen diagnose */
    }
  }
  // Regnefeil i konstant eller koeffisient: sammenlikn med en riktig «k = m·x»-form.
  const badIso = isolationForm(bad.statement, cc, v);
  const prevLin = linearOf(pst, cc, v);
  if (badIso && prevLin && correct) {
    // Riktig form har k/m = correct.
    if (badIso.m.eq(prevLin.a.abs()) || badIso.m.eq(prevLin.a.abs().neg())) {
      return { kind: 'regnefeil-konstant', detail: `Koeffisienten foran ${v} (${badIso.m.toNo()}) er riktig, men konstantleddet (${badIso.k.toNo()}) stemmer ikke. Regn ut konstantene på nytt.` };
    }
    if (badIso.k.abs().eq(prevLin.b.abs())) {
      return { kind: 'regnefeil-koeffisient', detail: `Konstantleddet er riktig, men koeffisienten foran ${v} (${badIso.m.toNo()}) stemmer ikke. Sjekk hvordan ${v}-leddene ble slått sammen.` };
    }
  }
  // Rene tallutregninger som ikke stemmer.
  const allNumeric = bad.pairs.some((p) => p.verdict === 'avvik' && varsIn(p.left).size === 0 && varsIn(p.right).size === 0);
  if (allNumeric) return { kind: 'regnefeil', detail: 'En utregning med tall gir ikke det som står etter likhetstegnet.' };
  return { kind: 'ugyldig-omforming', detail: 'Denne omformingen gir ikke en likning med samme løsning som forrige linje.' };
}

/** Finner siste steg som stemmer og første dokumenterbare avvik. */
export function findFirstDeviation(checks: LineCheck[], cc: CompiledContext): FirstDeviation | null {
  let lastGood: { line: number; st: StatementCheck } | null = null;
  for (const lc of checks) {
    for (let si = 0; si < lc.statements.length; si++) {
      const sc = lc.statements[si];
      if (sc.status === 'tekst') continue;
      if (sc.status === 'avvik') {
        const needsReadingConfirmation = lc.source === 'image' && lc.readingCertain === false;
        let kind: DeviationKind = 'feil-oppsett';
        let detail = 'Sjekk at du har brukt riktig formel og satt inn tallene fra oppgaven.';
        if (lastGood) {
          const d = diagnoseTransition(lastGood.st, sc, cc);
          kind = d.kind;
          detail = d.detail;
        } else {
          const allNumeric = sc.pairs.some((p) => p.verdict === 'avvik' && varsIn(p.left).size === 0 && varsIn(p.right).size === 0);
          if (allNumeric) {
            kind = 'regnefeil';
            detail = 'En utregning med tall gir ikke det som står etter likhetstegnet.';
          }
        }
        return { lineIndex: lc.index, statementIndex: si, lastGoodLine: lastGood?.line ?? null, lastGoodStatement: lastGood?.st ?? null, bad: sc, kind, detail, needsReadingConfirmation };
      }
      if (sc.status === 'ok' || sc.status === 'avrundet') lastGood = { line: lc.index, st: sc };
    }
  }
  return null;
}

// ——— Svarkontroll ———

export interface AnswerTarget {
  symbol: string;
  label: string;
  value: string; // eksakt verdi som desimal- eller brøkstreng
  /** Minste antall desimaler vi krever når svaret må avrundes. */
  minDecimals?: number;
  /** Svaret er en prosentverdi (15 betyr 15 %). */
  percent?: boolean;
  unit?: string;
  /** Ord eleven kan bruke som navn på størrelsen («endring», «kvantum»). */
  aliases?: string[];
  /** Absolutt toleranse, f.eks. ved avlesning fra figur. */
  tolerance?: string;
  /** Andre bokstaver for samme størrelse («F» for FC, «c» for variabel kostnad per enhet). */
  symbolAliases?: string[];
}

export type AnswerVerdict = 'riktig' | 'riktig-avrundet' | 'feil' | 'mangler' | 'uavklart';

export interface AnswerCheck {
  target: AnswerTarget;
  verdict: AnswerVerdict;
  given?: Rat;
  givenRaw?: string;
  note?: string;
  lineIndex?: number;
}

function parseTargetValue(v: string): Rat {
  if (v.includes('/')) {
    const [a, b] = v.split('/');
    return Rat.parseDecimal(a).div(Rat.parseDecimal(b));
  }
  return Rat.parseDecimal(v);
}

/** Leter etter elevens siste verdi for hvert målsymbol. */
export function extractValues(checks: LineCheck[], cc: CompiledContext): Map<string, { value: Rat; raw: string; line: number; wasPercent: boolean; decimals: number | null; certain: boolean }> {
  const found = new Map<string, { value: Rat; raw: string; line: number; wasPercent: boolean; decimals: number | null; certain: boolean }>();
  for (const lc of checks) {
    if (lc.status === 'uavklart-inndata' || lc.status === 'kan-ikke-lese') continue;
    for (const sc of lc.statements) {
      const st = sc.statement;
      if (st.label && st.sides.length >= 1) {
        const lastL = st.sides[st.sides.length - 1];
        if (!varsIn(lastL).size) {
          try {
            const v = toRF(lastL, cc.env);
            if (v.isConst())
              found.set('label:' + st.label, { value: v.constValue(), raw: lc.raw, line: lc.index, wasPercent: hasPercent(lastL), decimals: decimalsOf(lastL), certain: lc.source !== 'image' || lc.readingCertain !== false });
          } catch {
            /* hopp over */
          }
        }
      }
      if (st.kind !== 'eq' || st.sides.length < 2) continue;
      const first = st.sides[0];
      const last = st.sides[st.sides.length - 1];
      const target = first.t === 'var' ? first.name : last.t === 'var' ? last.name : null;
      const valueNode = first.t === 'var' ? last : first;
      if (!target || st.continuation) continue;
      if (varsIn(valueNode).size) continue;
      try {
        const v = toRF(valueNode, cc.env);
        if (!v.isConst()) continue;
        found.set(target, {
          value: v.constValue(),
          raw: lc.raw,
          line: lc.index,
          wasPercent: hasPercent(valueNode),
          decimals: decimalsOf(valueNode),
          certain: lc.source !== 'image' || lc.readingCertain !== false,
        });
      } catch {
        /* hopp over */
      }
    }
  }
  return found;
}

export function checkAnswers(checks: LineCheck[], targets: AnswerTarget[], cc: CompiledContext): AnswerCheck[] {
  const vals = extractValues(checks, cc);
  // Samme størrelse skrevet med en annen bokstav (leksjonen bruker F og c, oppgaven FC og v).
  for (const t of targets)
    if (!vals.has(t.symbol))
      for (const a of t.symbolAliases ?? [])
        if (vals.has(a) && !targets.some((o) => o.symbol === a)) {
          vals.set(t.symbol, vals.get(a)!);
          break;
        }
  // Navngitte størrelser skrevet med ord («endring = 15 %»). Hver etikett knyttes til målet den ligner mest.
  const stem = (w: string) => w.toLowerCase().slice(0, 6);
  const labelKeys = [...vals.keys()].filter((k) => k.startsWith('label:'));
  const claimed = new Map<string, { key: string; score: number }>();
  for (const k of labelKeys) {
    const words = k.slice(6).split(/\s+/).filter((w) => w.length > 2).map(stem);
    let bestT: AnswerTarget | null = null;
    let bestS = 0;
    for (const t of targets) {
      if (vals.has(t.symbol) && !claimed.has(t.symbol)) continue;
      const names = [t.label, ...(t.aliases ?? [])].join(' ').toLowerCase().split(/\s+/).filter((w) => w.length > 2).map(stem);
      const score = words.filter((w) => names.includes(w)).length + (words.length && names.includes(words[0]) ? 0.5 : 0);
      if (score > bestS) {
        bestS = score;
        bestT = t;
      }
    }
    if (bestT && bestS > 0) {
      const prev = claimed.get(bestT.symbol);
      if (!prev || bestS >= prev.score) claimed.set(bestT.symbol, { key: k, score: bestS });
    }
  }
  for (const [sym, { key }] of claimed) vals.set(sym, vals.get(key)!);
  // Flere mål uten navn («70 kr per time», «107 800 kr»): finn hvert mål blant tallene eleven
  // har regnet fram (siste side i hver linje). Bare treff på riktig verdi telles, så dette
  // gjør aldri et galt svar riktig; det hindrer bare at riktige svar blir «mangler».
  if (targets.length > 1 && targets.some((t) => !vals.has(t.symbol))) {
    const cands: { value: Rat; raw: string; line: number; wasPercent: boolean; decimals: number | null; certain: boolean }[] = [];
    for (const lc of checks) {
      if (lc.status === 'uavklart-inndata' || lc.status === 'kan-ikke-lese') continue;
      for (const sc of lc.statements) {
        const st = sc.statement;
        if (st.kind === 'text' || !st.sides.length) continue;
        const last = st.sides[st.sides.length - 1];
        if (varsIn(last).size) continue;
        try {
          const v = toRF(last, cc.env);
          if (v.isConst()) cands.push({ value: v.constValue(), raw: lc.raw, line: lc.index, wasPercent: hasPercent(last), decimals: decimalsOf(last), certain: lc.source !== 'image' || lc.readingCertain !== false });
        } catch {
          /* hopp over */
        }
      }
    }
    const used = new Set<number>();
    for (const t of targets) {
      if (vals.has(t.symbol)) continue;
      const exact = parseTargetValue(t.value);
      const matches = (c: (typeof cands)[number]) => {
        const v = t.percent && c.wasPercent ? c.value.mul(Rat.of(100)) : c.value;
        if (v.eq(exact)) return true;
        if (t.tolerance) return v.sub(exact).abs().cmp(Rat.parse(t.tolerance)) <= 0;
        if (cc.ctx.units === 'si') return Math.abs(v.toNumber() - exact.toNumber()) <= Math.abs(exact.toNumber()) * 0.01;
        return roundingOk(exact, v, Math.max(0, (c.decimals ?? 0) - (t.percent && c.wasPercent ? 2 : 0)));
      };
      for (let k = cands.length - 1; k >= 0; k--)
        if (!used.has(k) && matches(cands[k])) {
          used.add(k);
          vals.set(t.symbol, cands[k]);
          break;
        }
    }
  }
  // Ett mål uten symbol: godta siste rene tallsvar.
  if (targets.length === 1 && !vals.has(targets[0].symbol)) {
    outer: for (let i = checks.length - 1; i >= 0; i--) {
      const lc = checks[i];
      if (lc.status === 'uavklart-inndata' || lc.status === 'kan-ikke-lese') continue;
      for (let j = lc.statements.length - 1; j >= 0; j--) {
        const st = lc.statements[j];
        if (st.statement.kind === 'text') continue;
        const last = st.statement.sides[st.statement.sides.length - 1];
        if (last && varsIn(last).size === 0) {
          try {
            const v = toRF(last, cc.env);
            if (v.isConst()) vals.set(targets[0].symbol, { value: v.constValue(), raw: lc.raw, line: lc.index, wasPercent: hasPercent(last), decimals: decimalsOf(last), certain: lc.source !== 'image' || lc.readingCertain !== false });
          } catch {
            /* ignore */
          }
        }
        break outer;
      }
    }
  }
  return targets.map((t) => {
    const g = vals.get(t.symbol);
    if (!g) return { target: t, verdict: 'mangler' as AnswerVerdict };
    if (!g.certain) return { target: t, verdict: 'uavklart' as AnswerVerdict, given: g.value, givenRaw: g.raw, lineIndex: g.line, note: 'Avlesningen av bildet må bekreftes før svaret vurderes.' };
    const exact = parseTargetValue(t.value);
    let given = g.value;
    let note: string | undefined;
    if (t.percent) {
      if (g.wasPercent) given = given.mul(Rat.of(100));
      else if (given.abs().cmp(Rat.of(1)) < 0 && !exact.abs().cmp(Rat.of(1)) && exact.sub(given.mul(Rat.of(100))).abs().cmp(Rat.of(1, 2)) <= 0) {
        given = given.mul(Rat.of(100));
        note = 'Skrevet som desimaltall; det tilsvarer prosentverdien.';
      } else if (given.abs().cmp(Rat.of(1)) < 0 && exact.abs().cmp(Rat.of(1)) >= 0) {
        const as100 = given.mul(Rat.of(100));
        if (as100.sub(exact).abs().cmp(Rat.of(1, 2)) <= 0) {
          given = as100;
          note = 'Skrevet som desimaltall; det tilsvarer prosentverdien.';
        }
      }
    }
    if (given.eq(exact)) return { target: t, verdict: 'riktig' as AnswerVerdict, given, givenRaw: g.raw, lineIndex: g.line, note };
    if (t.tolerance && given.sub(exact).abs().cmp(Rat.parse(t.tolerance)) <= 0) return { target: t, verdict: 'riktig-avrundet' as AnswerVerdict, given, givenRaw: g.raw, lineIndex: g.line, note: `Innenfor avlesningsnøyaktigheten (±${Rat.parse(t.tolerance).toNo()}).` };
    // SI: antall desimaler sier ingenting når enheten har prefiks («7,5 mA»). Toleransen avgjør.
    if (cc.ctx.units === 'si') return { target: t, verdict: 'feil' as AnswerVerdict, given, givenRaw: g.raw, lineIndex: g.line, note };
    const dec = g.decimals ?? 0;
    const effDec = t.percent && g.wasPercent ? Math.max(0, dec - 2) : dec;
    if (effDec >= (t.minDecimals ?? 0)) {
      if (roundingOk(exact, given, effDec)) return { target: t, verdict: 'riktig-avrundet' as AnswerVerdict, given, givenRaw: g.raw, lineIndex: g.line, note: `Avrundet til ${effDec} desimal${effDec === 1 ? '' : 'er'}.` };
    }
    return { target: t, verdict: 'feil' as AnswerVerdict, given, givenRaw: g.raw, lineIndex: g.line, note };
  });
}

/** Sjekker om to uttrykk er symbolsk like (eksakt). null = kan ikke avgjøres symbolsk. */
export function equivalentExpr(a: string, b: string, symbols: string[] = DEFAULT_SYMBOLS, env: Env = {}): boolean | null {
  try {
    return toRF(parseExpr(a, symbols), env).equals(toRF(parseExpr(b, symbols), env));
  } catch (e) {
    if (e instanceof Unsupported) return null;
    return null;
  }
}

export { numbersIn };
