// En vanlig, enkel kalkulator (+ − × ÷ √ % = og M+ M− MRC) slik den faktisk
// oppfører seg: den regner fra venstre mot høyre uten «gange før pluss», har ett
// minne og ingen parenteser. Modulen
//  1) simulerer kalkulatoren tast for tast (det som står i displayet), og
//  2) gjør et regneuttrykk om til tastetrykk som gir riktig svar på en slik
//     kalkulator, og kontrollerer det ved å kjøre tastene i simulatoren.
// Slik kan Lær-delen vise nøyaktig hva du skal trykke på eksamen, og et tall
// fra AI blir aldri vist uten å være regnet ut på nytt.

export type CalcKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | '+' | '−' | '×' | '÷' | '=' | '%' | '√' | 'M+' | 'M−' | 'MRC' | 'C';

export const CALC_LAYOUT: CalcKey[][] = [
  ['MRC', 'M−', 'M+', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['C', '0', '.', '='],
];
export const CALC_EXTRA: CalcKey[] = ['√', '%'];

const MAX_DIGITS = 10;

/** Tallet slik displayet viser det (punktum som desimaltegn, høyst 10 siffer). */
export function formatDisplay(v: number): string {
  if (!Number.isFinite(v)) return 'E';
  if (Math.abs(v) >= 10 ** MAX_DIGITS) return 'E';
  if (v === 0) return '0';
  const intDigits = Math.max(1, Math.floor(Math.log10(Math.abs(v))) + 1);
  const dec = Math.max(0, MAX_DIGITS - intDigits);
  let s = v.toFixed(Math.min(dec, 9));
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}

export class BasicCalc {
  display = '0';
  private acc: number | null = null;
  private op: '+' | '−' | '×' | '÷' | null = null;
  private entering = false;
  private hasEntry = false;
  memory = 0;
  private lastKey: CalcKey | null = null;
  error = false;

  /** Verdien bak displayet (kalkulatoren regner videre med flere siffer enn den viser). */
  private cur = 0;
  get value(): number {
    return this.entering ? Number(this.display) : this.cur;
  }
  get memoryIndicator(): boolean {
    return this.memory !== 0;
  }

  private apply(a: number, op: string, b: number): number {
    if (op === '+') return a + b;
    if (op === '−') return a - b;
    if (op === '×') return a * b;
    if (b === 0) {
      this.error = true;
      return NaN;
    }
    return a / b;
  }

  private show(v: number) {
    const s = formatDisplay(v);
    if (s === 'E') this.error = true;
    this.display = s;
    this.cur = v;
  }

  /** Fullfører et ventende regnestykke (som «=»). */
  private finish() {
    if (this.entering) this.cur = Number(this.display);
    if (this.op && this.acc !== null) {
      const b = this.hasEntry ? this.value : this.acc;
      this.show(this.apply(this.acc, this.op, b));
      this.acc = null;
      this.op = null;
    }
    this.entering = false;
  }

  press(k: CalcKey) {
    if (this.error && k !== 'C') return;
    if (/^[0-9]$/.test(k)) {
      if (!this.entering) {
        this.display = k;
        this.entering = true;
      } else if (this.display.replace(/[-.]/g, '').length < MAX_DIGITS) this.display = this.display === '0' ? k : this.display + k;
      this.hasEntry = true;
    } else if (k === '.') {
      if (!this.entering) {
        this.display = '0.';
        this.entering = true;
      } else if (!this.display.includes('.')) this.display += '.';
      this.hasEntry = true;
    } else if (k === '+' || k === '−' || k === '×' || k === '÷') {
      if (this.op && this.acc !== null && this.hasEntry) this.show(this.apply(this.acc, this.op, this.value));
      else if (this.entering) this.cur = Number(this.display);
      this.acc = this.value;
      this.op = k;
      this.entering = false;
      this.hasEntry = false;
    } else if (k === '=') {
      this.finish();
    } else if (k === '%') {
      const cur = this.value;
      if (this.op && this.acc !== null) {
        const a = this.acc;
        const r = this.op === '×' ? (a * cur) / 100 : this.op === '÷' ? (a / cur) * 100 : this.op === '+' ? a + (a * cur) / 100 : a - (a * cur) / 100;
        this.show(r);
        this.acc = null;
        this.op = null;
      } else this.show(cur / 100);
      this.entering = false;
    } else if (k === '√') {
      const cur = this.value;
      if (cur < 0) this.error = true;
      this.show(Math.sqrt(cur));
      this.entering = false;
      this.hasEntry = true;
    } else if (k === 'M+' || k === 'M−') {
      this.finish();
      this.memory += (k === 'M+' ? 1 : -1) * this.value;
      this.entering = false;
    } else if (k === 'MRC') {
      if (this.lastKey === 'MRC') this.memory = 0;
      else {
        this.show(this.memory);
        this.entering = false;
        this.hasEntry = true;
      }
    } else if (k === 'C') {
      this.display = '0';
      this.cur = 0;
      this.acc = null;
      this.op = null;
      this.entering = false;
      this.hasEntry = false;
      this.error = false;
    }
    this.lastKey = k;
  }

  run(keys: CalcKey[]): string[] {
    return keys.map((k) => {
      this.press(k);
      return this.error ? 'E' : this.display;
    });
  }
}

// ——— Regneuttrykk ———

type Node = { t: 'num'; v: number } | { t: 'bin'; op: '+' | '−' | '×' | '÷'; a: Node; b: Node } | { t: 'sqrt'; a: Node } | { t: 'pow'; a: Node; n: number } | { t: 'neg'; a: Node };

/** Leser et regneuttrykk («230·6 + 200», «(12−4)/(2+6)», «√(16)», «4,5^2», «15 %»). */
export function parseExpr(src: string): Node {
  const s = src
    .replace(/\s+/g, '')
    .replace(/[·*x]/g, '×')
    .replace(/[/:]/g, '÷')
    .replace(/[−–-]/g, '−')
    .replace(/sqrt|rot/gi, '√');
  let i = 0;
  const peek = () => s[i];
  const num = (): Node => {
    const m = /^\d+(?:[.,]\d+)?/.exec(s.slice(i));
    if (!m) throw new Error(`Ventet et tall ved «${s.slice(i, i + 6)}»`);
    i += m[0].length;
    let v = Number(m[0].replace(',', '.'));
    if (peek() === '%') {
      i++;
      v = v / 100;
    }
    return { t: 'num', v };
  };
  const atom = (): Node => {
    const c = peek();
    if (c === '(') {
      i++;
      const e = expr();
      if (peek() !== ')') throw new Error('Mangler )');
      i++;
      return e;
    }
    if (c === '√') {
      i++;
      return { t: 'sqrt', a: atom() };
    }
    if (c === '−') {
      i++;
      return { t: 'neg', a: factor() };
    }
    return num();
  };
  const factor = (): Node => {
    let a = atom();
    while (peek() === '^' || peek() === '²') {
      if (peek() === '²') {
        i++;
        a = { t: 'pow', a, n: 2 };
        continue;
      }
      i++;
      const n = num();
      if (n.t !== 'num' || !Number.isInteger(n.v)) throw new Error('Bare hele eksponenter');
      a = { t: 'pow', a, n: n.v };
    }
    return a;
  };
  const term = (): Node => {
    let a = factor();
    while (peek() === '×' || peek() === '÷') {
      const op = s[i++] as '×' | '÷';
      a = { t: 'bin', op, a, b: factor() };
    }
    return a;
  };
  const expr = (): Node => {
    let a = term();
    while (peek() === '+' || peek() === '−') {
      const op = s[i++] as '+' | '−';
      a = { t: 'bin', op, a, b: term() };
    }
    return a;
  };
  const e = expr();
  if (i !== s.length) throw new Error(`Forstår ikke «${s.slice(i)}»`);
  return e;
}

export function evalExpr(n: Node): number {
  switch (n.t) {
    case 'num':
      return n.v;
    case 'neg':
      return -evalExpr(n.a);
    case 'sqrt':
      return Math.sqrt(evalExpr(n.a));
    case 'pow':
      return evalExpr(n.a) ** n.n;
    case 'bin': {
      const a = evalExpr(n.a);
      const b = evalExpr(n.b);
      return n.op === '+' ? a + b : n.op === '−' ? a - b : n.op === '×' ? a * b : a / b;
    }
  }
}

export function evaluate(src: string): number | null {
  try {
    const v = evalExpr(parseExpr(src));
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

// ——— Fra uttrykk til tastetrykk ———

function numKeys(v: number): CalcKey[] {
  const s = formatDisplay(Math.abs(v));
  return s.split('') as CalcKey[];
}

/** Tastene for et «atom»: et tall, eller kvadratroten av et tall (tall, så √). */
function atomKeys(n: Node): CalcKey[] | null {
  if (n.t === 'num') return n.v < 0 ? null : numKeys(n.v);
  if (n.t === 'sqrt') {
    const k = atomKeys(n.a);
    return k ? [...k, '√'] : null;
  }
  return null;
}

/** Skriver om potenser til gjentatt multiplikasjon (x² → x·x). */
function expandPow(n: Node): Node {
  switch (n.t) {
    case 'pow': {
      if (n.n < 1 || n.n > 4) throw new Error('For stor eksponent for en enkel kalkulator');
      const a = expandPow(n.a);
      let r: Node = a;
      for (let k = 1; k < n.n; k++) r = { t: 'bin', op: '×', a: r, b: a };
      return r;
    }
    case 'bin':
      return { ...n, a: expandPow(n.a), b: expandPow(n.b) };
    case 'sqrt':
      return { ...n, a: expandPow(n.a) };
    case 'neg':
      return { ...n, a: expandPow(n.a) };
    default:
      return n;
  }
}

/**
 * Venstre-til-høyre: (((x0 op x1) op x2) …) der hver x til høyre er et atom.
 * Bruker at + og × kan byttes om, og at «MEM» (minnet) kan stå som et atom.
 */
function ltr(n: Node, mem: Node | null): CalcKey[] | null {
  const atomOrMem = (x: Node): CalcKey[] | null => (mem && x === mem ? ['MRC'] : atomKeys(x));
  const a0 = atomOrMem(n);
  if (a0) return a0;
  if (n.t !== 'bin') return null;
  const right = atomOrMem(n.b);
  if (right) {
    const left = ltr(n.a, mem);
    if (left) return [...left, n.op, ...right];
  }
  if (n.op === '+' || n.op === '×') {
    const r2 = atomOrMem(n.a);
    if (r2) {
      const left = ltr(n.b, mem);
      if (left) return [...left, n.op, ...r2];
    }
  }
  return null;
}

/** Leddene i en sum med fortegn: a − b + c → [+a, −b, +c]. */
function terms(n: Node, sign = 1): { sign: number; node: Node }[] {
  if (n.t === 'bin' && (n.op === '+' || n.op === '−')) return [...terms(n.a, sign), ...terms(n.b, n.op === '+' ? sign : -sign)];
  if (n.t === 'neg') return terms(n.a, -sign);
  return [{ sign, node: n }];
}

/** Alle deluttrykk (for å finne ett som kan regnes først og legges i minnet). */
function subNodes(n: Node): Node[] {
  if (n.t === 'bin') return [n, ...subNodes(n.a), ...subNodes(n.b)];
  if (n.t === 'sqrt' || n.t === 'neg' || n.t === 'pow') return [n, ...subNodes(n.a)];
  return [n];
}

const OPS: CalcKey[] = ['+', '−', '×', '÷', '='];

/** Deler en rett-fram-sekvens i biter som slutter på en regneoperasjon, med det displayet viser etter hver bit. */
function splitDirect(keys: CalcKey[]): { keys: CalcKey[]; note: string }[] {
  const groups: CalcKey[][] = [];
  let cur: CalcKey[] = [];
  for (const k of keys) {
    cur.push(k);
    if (OPS.includes(k)) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length) groups.push(cur);
  if (groups.length <= 1) return [{ keys, note: 'Tast inn og trykk =.' }];
  const calc = new BasicCalc();
  return groups.map((g, i) => {
    const shown = calc.run(g).pop();
    if (i === 0) return { keys: g, note: 'Start med det første tallet og regnetegnet.' };
    const last = g[g.length - 1];
    return { keys: g, note: last === '=' ? `Displayet viser svaret: ${shown}` : `Displayet viser ${shown} så langt.` };
  });
}

export interface CalcPlan {
  expression: string;
  keys: CalcKey[];
  displays: string[];
  result: number;
  usesMemory: boolean;
  /** Tastene delt i grupper med en kort forklaring. */
  groups: { keys: CalcKey[]; note: string }[];
}

function sameValue(a: number, b: number) {
  return Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-9);
}

/**
 * Lager tastetrykk for en enkel kalkulator. Returnerer null når uttrykket er for
 * sammensatt (da må mellomsvar skrives ned), eller når simulatoren ikke gir
 * samme svar som en eksakt utregning.
 */
export function planKeys(expression: string): CalcPlan | null {
  let node: Node;
  try {
    node = expandPow(parseExpr(expression));
  } catch {
    return null;
  }
  return planNode(expression, node);
}

function planNode(expression: string, node: Node): CalcPlan | null {
  // Kvadratroten av et sammensatt uttrykk: regn uttrykket, og trykk √ til slutt.
  if (node.t === 'sqrt' && !ltr(node, null)) {
    const inner = planNode(expression, node.a);
    if (!inner) return null;
    const keys = [...inner.keys, '√'] as CalcKey[];
    const calc = new BasicCalc();
    const displays = calc.run(keys);
    const exactR = Math.sqrt(evalExpr(node.a));
    if (calc.error || !sameValue(Number(displays[displays.length - 1]), Number(formatDisplay(exactR)))) return null;
    return { expression, keys, displays, result: Number(displays[displays.length - 1]), usesMemory: inner.usesMemory, groups: [...inner.groups, { keys: ['√'], note: 'Ta kvadratroten til slutt.' }] };
  }
  const exact = evalExpr(node);
  if (!Number.isFinite(exact)) return null;
  const candidates: { groups: { keys: CalcKey[]; note: string }[]; mem: boolean }[] = [];
  // 1) Rett fram fra venstre mot høyre.
  const direct = ltr(node, null);
  if (direct) candidates.push({ groups: splitDirect([...direct, ...(direct.length > 1 ? (['='] as CalcKey[]) : [])]), mem: false });
  // 2) Sum av ledd: hvert ledd regnes og legges i minnet (M+ / M−), så MRC.
  const ts = terms(node);
  if (!direct && ts.length > 1) {
    const parts = ts.map((t) => ({ t, k: ltr(t.node, null) }));
    if (parts.every((p) => p.k)) {
      const groups: { keys: CalcKey[]; note: string }[] = [{ keys: ['MRC', 'MRC', 'C'], note: 'Tøm minnet først (MRC to ganger), og nullstill.' }];
      for (const p of parts) groups.push({ keys: [...p.k!, p.t.sign > 0 ? 'M+' : 'M−'], note: p.t.sign > 0 ? 'Regn ut leddet og legg det til i minnet med M+.' : 'Regn ut leddet og trekk det fra minnet med M−.' });
      groups.push({ keys: ['MRC'], note: 'Hent svaret fra minnet.' });
      candidates.push({ groups, mem: true });
    }
  }
  // 3) Ett deluttrykk (f.eks. nevneren) regnes først og legges i minnet.
  if (!direct && !candidates.length) {
    for (const sub of subNodes(node)) {
      if (sub === node || sub.t === 'num') continue;
      const rest = ltr(node, sub);
      if (!rest) continue;
      // Deluttrykket rett inn i minnet, eller ledd for ledd (M+ / M−) når det er en sum.
      const first = ltr(sub, null);
      const subTerms = first ? null : terms(sub).map((t) => ({ t, k: ltr(t.node, null) }));
      if (!first && !(subTerms && subTerms.length > 1 && subTerms.every((p) => p.k))) continue;
      const memGroups: { keys: CalcKey[]; note: string }[] = first
        ? [{ keys: [...first, 'M+'], note: 'Regn ut parentesen først og legg den i minnet.' }]
        : subTerms!.map((p) => ({ keys: [...p.k!, p.t.sign > 0 ? 'M+' : 'M−'] as CalcKey[], note: 'Regn ut hvert ledd i parentesen og samle dem i minnet.' }));
      candidates.push({
        groups: [{ keys: ['MRC', 'MRC', 'C'], note: 'Tøm minnet først (MRC to ganger), og nullstill.' }, ...memGroups, { keys: [...rest, '='], note: 'Regn resten. MRC henter parentesen fra minnet.' }],
        mem: true,
      });
      break;
    }
  }
  for (const c of candidates) {
    const keys = c.groups.flatMap((g) => g.keys);
    const calc = new BasicCalc();
    const displays = calc.run(keys);
    if (calc.error) continue;
    const shown = Number(displays[displays.length - 1]);
    // Kontroll: kalkulatoren må vise samme svar som den eksakte utregningen (innen visningens nøyaktighet).
    if (!sameValue(shown, Number(formatDisplay(exact)))) continue;
    return { expression, keys, displays, result: shown, usesMemory: c.mem, groups: c.groups };
  }
  return null;
}

/** Tastene som tekst: «2 3 0 × 6 =» (sifre i samme tall står sammen). */
export function keysText(keys: CalcKey[]): string {
  const out: string[] = [];
  for (const k of keys) {
    const prev = out[out.length - 1];
    if (prev !== undefined && /^[0-9.]+$/.test(k) && /^[0-9.]+$/.test(prev)) out[out.length - 1] = prev + k;
    else out.push(k);
  }
  return out.join(' ');
}

/** Norsk visning av et tall (desimalkomma). */
export function noNum(v: number, max = 4): string {
  const r = Number(v.toFixed(max));
  return r.toLocaleString('nb-NO', { maximumFractionDigits: max }).replace(/ /g, ' ');
}
