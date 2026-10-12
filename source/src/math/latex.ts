import type { Node, Statement } from './parse';
import { Rat } from './rational';

const SYMBOL_TEX: Record<string, string> = {
  Qd: 'Q_d',
  Qs: 'Q_s',
  Pk: 'P_k',
  Pp: 'P_p',
  V0: 'V_0',
  V1: 'V_1',
  Q0: 'Q_0',
  Q1: 'Q_1',
  P0: 'P_0',
  P1: 'P_1',
  TC: '\\mathit{TC}',
  AC: '\\mathit{AC}',
  MC: '\\mathit{MC}',
  VC: '\\mathit{VC}',
  FC: '\\mathit{FC}',
  TR: '\\mathit{TR}',
  MR: '\\mathit{MR}',
  TVC: '\\mathit{TVC}',
  AVC: '\\mathit{AVC}',
  ATC: '\\mathit{ATC}',
  TI: '\\mathit{TI}',
};

export function symTex(name: string): string {
  return SYMBOL_TEX[name] ?? name;
}

function numTex(v: Rat, raw?: string): string {
  if (raw) {
    // Behold elevens skrivemåte, men med norsk komma og uten tvetydig mellomrom.
    const cleaned = raw.replace(/[  ]/g, '');
    if (/^\d+([.,]\d+)?$/.test(cleaned)) return cleaned.replace('.', '{,}').replace(',', '{,}');
  }
  return v.toLatex();
}

function prec(n: Node): number {
  switch (n.t) {
    case 'bin':
      return n.op === '+' || n.op === '-' ? 1 : n.op === '*' || n.op === '/' ? 2 : 3;
    case 'neg':
      return 1.5;
    default:
      return 4;
  }
}

export function toTex(n: Node): string {
  switch (n.t) {
    case 'num':
      return numTex(n.v, n.raw);
    case 'var':
      return symTex(n.name);
    case 'neg': {
      const inner = toTex(n.a);
      return prec(n.a) <= 1.5 ? `-\\left(${inner}\\right)` : `-${inner}`;
    }
    case 'pct':
      return `${wrap(n.a, 4)}\\,\\%`;
    case 'call':
      if (n.fn === 'sqrt') return `\\sqrt{${toTex(n.args[0])}}`;
      if (n.fn === 'ln' || n.fn === 'log' || n.fn === 'exp') return `\\${n.fn}\\left(${toTex(n.args[0])}\\right)`;
      return `${symTex(n.fn)}\\left(${toTex(n.args[0])}\\right)`;
    case 'bin': {
      switch (n.op) {
        case '+':
          return `${toTex(n.a)} + ${wrap(n.b, 1.5)}`;
        case '-':
          return `${toTex(n.a)} - ${wrap(n.b, 2)}`;
        case '*': {
          const a = wrap(n.a, 2);
          const b = wrap(n.b, 2.5);
          const needsDot = !n.implicit || n.b.t === 'num';
          return needsDot ? `${a} \\cdot ${b}` : `${a}${b}`;
        }
        case '/':
          return `\\frac{${toTex(n.a)}}{${toTex(n.b)}}`;
        case '^':
          return `${wrap(n.a, 3.5)}^{${toTex(n.b)}}`;
      }
    }
  }
  return '';
}

function wrap(n: Node, minPrec: number): string {
  const t = toTex(n);
  return prec(n) < minPrec ? `\\left(${t}\\right)` : t;
}

export function statementTex(st: Statement): string {
  if (st.kind === 'text') return '';
  let out = st.continuation ? '= ' : '';
  st.sides.forEach((s, i) => {
    if (i > 0) out += ` ${st.approx[i - 1] ? '\\approx' : '='} `;
    out += toTex(s);
  });
  if (st.units.length) out += `\\ \\text{${st.units.join(' ')}}`;
  return out;
}

/** Enkel lesbar tekst av et uttrykk (til tilbakemeldinger). */
export function toPlain(n: Node): string {
  const pr = (x: Node): number => (x.t === 'bin' ? (x.op === '+' || x.op === '-' ? 1 : x.op === '^' ? 3 : 2) : x.t === 'neg' ? 1.5 : 4);
  const w = (x: Node, min: number) => (pr(x) < min ? `(${toPlain(x)})` : toPlain(x));
  switch (n.t) {
    case 'num':
      return n.raw.replace('.', ',');
    case 'var':
      return n.name;
    case 'neg':
      return `−${w(n.a, 2)}`;
    case 'pct':
      return `${w(n.a, 4)} %`;
    case 'call':
      return `${n.fn}(${toPlain(n.args[0])})`;
    case 'bin':
      if (n.op === '*' && n.implicit && n.b.t !== 'num') return `${w(n.a, 2)}${w(n.b, 2.5)}`;
      return `${w(n.a, n.op === '^' ? 3.5 : pr(n))} ${n.op === '*' ? '·' : n.op === '-' ? '−' : n.op} ${w(n.b, n.op === '-' || n.op === '/' ? pr(n) + 0.5 : pr(n))}`;
  }
}

export function statementPlain(st: Statement): string {
  return (st.continuation ? '= ' : '') + st.sides.map(toPlain).join(' = ');
}
