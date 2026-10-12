// Polynomer og rasjonale funksjoner med eksakte koeffisienter.
// Dette gir en symbolsk (ikke numerisk) kontroll av likeverdige uttrykk
// for alt som kan skrives som en brøk av polynomer.

import { Rat, MathError } from './rational';
import type { Node } from './parse';

export class Unsupported extends MathError {}

type Mono = [string, number][]; // sortert på variabelnavn

function monoKey(m: Mono): string {
  return m.map(([v, e]) => (e === 1 ? v : `${v}^${e}`)).join('*');
}
function parseKey(k: string): Mono {
  if (!k) return [];
  return k.split('*').map((p) => {
    const [v, e] = p.split('^');
    return [v, e ? parseInt(e, 10) : 1] as [string, number];
  });
}
function mulMono(a: Mono, b: Mono): Mono {
  const m = new Map<string, number>();
  for (const [v, e] of a) m.set(v, (m.get(v) ?? 0) + e);
  for (const [v, e] of b) m.set(v, (m.get(v) ?? 0) + e);
  return [...m.entries()].filter(([, e]) => e !== 0).sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
}

export class Poly {
  readonly terms: Map<string, Rat>;
  constructor(terms?: Map<string, Rat>) {
    this.terms = new Map();
    if (terms) for (const [k, v] of terms) if (!v.isZero()) this.terms.set(k, v);
  }
  static const(r: Rat): Poly {
    return new Poly(new Map([['', r]]));
  }
  static variable(name: string): Poly {
    return new Poly(new Map([[name, Rat.ONE]]));
  }
  static zero(): Poly {
    return new Poly();
  }
  add(o: Poly): Poly {
    const t = new Map(this.terms);
    for (const [k, v] of o.terms) t.set(k, (t.get(k) ?? Rat.ZERO).add(v));
    return new Poly(t);
  }
  neg(): Poly {
    const t = new Map<string, Rat>();
    for (const [k, v] of this.terms) t.set(k, v.neg());
    return new Poly(t);
  }
  sub(o: Poly): Poly {
    return this.add(o.neg());
  }
  scale(r: Rat): Poly {
    const t = new Map<string, Rat>();
    for (const [k, v] of this.terms) t.set(k, v.mul(r));
    return new Poly(t);
  }
  mul(o: Poly): Poly {
    const t = new Map<string, Rat>();
    for (const [ka, va] of this.terms)
      for (const [kb, vb] of o.terms) {
        const k = monoKey(mulMono(parseKey(ka), parseKey(kb)));
        t.set(k, (t.get(k) ?? Rat.ZERO).add(va.mul(vb)));
      }
    return new Poly(t);
  }
  isZero(): boolean {
    return this.terms.size === 0;
  }
  isConst(): boolean {
    return this.terms.size === 0 || (this.terms.size === 1 && this.terms.has(''));
  }
  constValue(): Rat {
    return this.terms.get('') ?? Rat.ZERO;
  }
  vars(): Set<string> {
    const s = new Set<string>();
    for (const k of this.terms.keys()) for (const [v] of parseKey(k)) s.add(v);
    return s;
  }
  degreeIn(v: string): number {
    let d = 0;
    for (const k of this.terms.keys()) for (const [x, e] of parseKey(k)) if (x === v) d = Math.max(d, e);
    return d;
  }
  /** Koeffisientene som polynom i én variabel (krever at ingen andre variabler finnes). */
  univariateCoeffs(v: string): Rat[] {
    const others = [...this.vars()].filter((x) => x !== v);
    if (others.length) throw new Unsupported(`Flere ukjente: ${others.join(', ')}`);
    const deg = this.degreeIn(v);
    const c: Rat[] = Array.from({ length: deg + 1 }, () => Rat.ZERO);
    for (const [k, val] of this.terms) {
      const m = parseKey(k);
      const e = m.length ? m[0][1] : 0;
      c[e] = c[e].add(val);
    }
    return c;
  }
  evaluate(env: Record<string, Rat>): Rat {
    let sum = Rat.ZERO;
    for (const [k, val] of this.terms) {
      let term = val;
      for (const [v, e] of parseKey(k)) {
        const x = env[v];
        if (!x) throw new MathError(`Mangler verdi for ${v}`);
        term = term.mul(x.pow(e));
      }
      sum = sum.add(term);
    }
    return sum;
  }
  /** Delvis innsetting: erstatt noen variabler med rasjonale funksjoner. */
  substitute(sub: Record<string, RF>): RF {
    let acc = RF.zero();
    for (const [k, val] of this.terms) {
      let term = RF.const(val);
      for (const [v, e] of parseKey(k)) {
        const s = sub[v];
        const base = s ?? RF.variable(v);
        term = term.mul(base.pow(e));
      }
      acc = acc.add(term);
    }
    return acc;
  }
  toString(): string {
    if (this.isZero()) return '0';
    return [...this.terms.entries()].map(([k, v]) => `${v}${k ? '*' + k : ''}`).join(' + ');
  }
}

/** Rasjonal funksjon num/den. */
export class RF {
  constructor(
    readonly num: Poly,
    readonly den: Poly,
  ) {
    if (den.isZero()) throw new MathError('Deling på null');
  }
  static const(r: Rat): RF {
    return new RF(Poly.const(r), Poly.const(Rat.ONE));
  }
  static variable(v: string): RF {
    return new RF(Poly.variable(v), Poly.const(Rat.ONE));
  }
  static zero(): RF {
    return RF.const(Rat.ZERO);
  }
  private static norm(num: Poly, den: Poly): RF {
    if (den.isConst()) {
      const c = den.constValue();
      return new RF(num.scale(c.inv()), Poly.const(Rat.ONE));
    }
    return new RF(num, den);
  }
  add(o: RF): RF {
    if (this.den.isConst() && o.den.isConst()) return RF.norm(this.num.add(o.num), Poly.const(Rat.ONE));
    return RF.norm(this.num.mul(o.den).add(o.num.mul(this.den)), this.den.mul(o.den));
  }
  sub(o: RF): RF {
    return this.add(o.neg());
  }
  neg(): RF {
    return new RF(this.num.neg(), this.den);
  }
  mul(o: RF): RF {
    return RF.norm(this.num.mul(o.num), this.den.mul(o.den));
  }
  div(o: RF): RF {
    if (o.num.isZero()) throw new MathError('Deling på null');
    return RF.norm(this.num.mul(o.den), this.den.mul(o.num));
  }
  pow(k: number): RF {
    if (!Number.isInteger(k)) throw new Unsupported('Ikke-heltallig eksponent');
    if (k === 0) return RF.const(Rat.ONE);
    if (k < 0) return RF.const(Rat.ONE).div(this.pow(-k));
    let r = RF.const(Rat.ONE);
    for (let i = 0; i < k; i++) r = r.mul(this);
    return r;
  }
  isConst(): boolean {
    return this.num.isConst() && this.den.isConst();
  }
  constValue(): Rat {
    return this.num.constValue().div(this.den.constValue());
  }
  isZero(): boolean {
    return this.num.isZero();
  }
  vars(): Set<string> {
    const s = this.num.vars();
    for (const v of this.den.vars()) s.add(v);
    return s;
  }
  evaluate(env: Record<string, Rat>): Rat {
    const d = this.den.evaluate(env);
    if (d.isZero()) throw new MathError('Deling på null i innsetting');
    return this.num.evaluate(env).div(d);
  }
  substitute(sub: Record<string, RF>): RF {
    return this.num.substitute(sub).div(this.den.substitute(sub));
  }
  /** Symbolsk likhet: a/b = c/d ⇔ ad − cb ≡ 0. */
  equals(o: RF): boolean {
    return this.num.mul(o.den).sub(o.num.mul(this.den)).isZero();
  }
}

export interface Env {
  /** Definisjoner som settes inn symbolsk, f.eks. Qd → 120 − 2P. */
  defs?: Record<string, RF>;
  /** Funksjonssymboler som kan evalueres: Qd(20). Parameteren heter normalt P. */
  funcs?: Record<string, { param: string; body: RF }>;
}

export function toRF(n: Node, env: Env = {}): RF {
  switch (n.t) {
    case 'num':
      return RF.const(n.v);
    case 'var': {
      const d = env.defs?.[n.name];
      return d ?? RF.variable(n.name);
    }
    case 'neg':
      return toRF(n.a, env).neg();
    case 'pct':
      return toRF(n.a, env).mul(RF.const(Rat.of(1, 100)));
    case 'bin': {
      const a = toRF(n.a, env);
      if (n.op === '^') {
        const e = toRF(n.b, env);
        if (!e.isConst()) throw new Unsupported('Variabel eksponent');
        const ev = e.constValue();
        if (!ev.isInteger()) throw new Unsupported('Brøkeksponent');
        const k = Number(ev.n);
        if (Math.abs(k) > 12) throw new Unsupported('For stor eksponent');
        return a.pow(k);
      }
      const b = toRF(n.b, env);
      switch (n.op) {
        case '+':
          return a.add(b);
        case '-':
          return a.sub(b);
        case '*':
          return a.mul(b);
        case '/':
          return a.div(b);
      }
      throw new Unsupported('Ukjent operator');
    }
    case 'call': {
      const f = env.funcs?.[n.fn];
      if (f) {
        const arg = toRF(n.args[0], env);
        return f.body.substitute({ [f.param]: arg });
      }
      throw new Unsupported(`Funksjonen ${n.fn} kan ikke kontrolleres symbolsk`);
    }
  }
}

/** Numerisk evaluering (for grafer og som merket reserve når symbolsk kontroll ikke går). */
export function evalNum(n: Node, vars: Record<string, number>, env: Env = {}): number {
  switch (n.t) {
    case 'num':
      return n.v.toNumber();
    case 'var': {
      if (n.name in vars) return vars[n.name];
      const d = env.defs?.[n.name];
      if (d) {
        const r: Record<string, Rat> = {};
        for (const [k, v] of Object.entries(vars)) r[k] = Rat.fromNumber(v);
        return d.evaluate(r).toNumber();
      }
      throw new MathError(`Mangler verdi for ${n.name}`);
    }
    case 'neg':
      return -evalNum(n.a, vars, env);
    case 'pct':
      return evalNum(n.a, vars, env) / 100;
    case 'bin': {
      const a = evalNum(n.a, vars, env);
      const b = evalNum(n.b, vars, env);
      switch (n.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return a / b;
        case '^':
          return Math.pow(a, b);
      }
      return NaN;
    }
    case 'call': {
      const x = evalNum(n.args[0], vars, env);
      switch (n.fn) {
        case 'sqrt':
          return Math.sqrt(x);
        case 'ln':
          return Math.log(x);
        case 'log':
          return Math.log10(x);
        case 'exp':
          return Math.exp(x);
      }
      const f = env.funcs?.[n.fn];
      if (f) return f.body.evaluate({ [f.param]: Rat.fromNumber(x) }).toNumber();
      throw new MathError(`Ukjent funksjon ${n.fn}`);
    }
  }
}

function ratSqrt(r: Rat): Rat | null {
  if (r.sign() < 0) return null;
  const sn = isqrt(r.n);
  const sd = isqrt(r.d);
  if (sn * sn === r.n && sd * sd === r.d) return Rat.of(sn, sd);
  return null;
}
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  while (x * x > n) x--;
  while ((x + 1n) * (x + 1n) <= n) x++;
  return x;
}

export type SolveResult =
  | { kind: 'roots'; roots: Rat[] }
  | { kind: 'all' } // identitet
  | { kind: 'none' } // selvmotsigelse
  | { kind: 'unsupported'; reason: string };

/** Løser en likning (differanse = 0) i én variabel eksakt, når det er mulig. */
export function solveUnivariate(diff: RF, v: string): SolveResult {
  try {
    const num = diff.num;
    const coeffs = num.univariateCoeffs(v);
    const deg = coeffs.length - 1;
    const denVars = diff.den.vars();
    const excluded = (x: Rat) => {
      if (!denVars.size) return false;
      try {
        return diff.den.evaluate({ [v]: x }).isZero();
      } catch {
        return false;
      }
    };
    let roots: Rat[] = [];
    if (num.isZero()) return { kind: 'all' };
    if (deg === 0) return { kind: 'none' };
    if (deg === 1) roots = [coeffs[0].neg().div(coeffs[1])];
    else if (deg === 2) {
      const [c, b, a] = coeffs;
      const disc = b.mul(b).sub(Rat.of(4).mul(a).mul(c));
      if (disc.sign() < 0) return { kind: 'none' };
      const s = ratSqrt(disc);
      if (!s) return { kind: 'unsupported', reason: 'Irrasjonale røtter' };
      const two_a = Rat.of(2).mul(a);
      roots = [b.neg().sub(s).div(two_a), b.neg().add(s).div(two_a)];
      if (roots[0].eq(roots[1])) roots = [roots[0]];
    } else return { kind: 'unsupported', reason: 'Grad over 2' };
    roots = roots.filter((r) => !excluded(r)).sort((a, b) => a.cmp(b));
    return roots.length ? { kind: 'roots', roots } : { kind: 'none' };
  } catch (e) {
    return { kind: 'unsupported', reason: e instanceof Error ? e.message : String(e) };
  }
}

export function sameSolutions(a: SolveResult, b: SolveResult): boolean | null {
  if (a.kind === 'unsupported' || b.kind === 'unsupported') return null;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'roots' && b.kind === 'roots') return a.roots.length === b.roots.length && a.roots.every((r, i) => r.eq(b.roots[i]));
  return true;
}
