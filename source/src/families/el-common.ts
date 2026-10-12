// Felles byggeklosser for tekniske familier (elektriske kretser og
// digitalteknikk): SI-enheter med prefiks, svar med relativ toleranse og
// tall skrevet på norsk (desimalkomma).

import type { GenPart, SolutionStep } from '../domain/types';
import type { AnswerTarget, MathContext } from '../math/check';
import { Rat } from '../math/rational';
import { step } from './common';

export function elMath(symbols: string[]): MathContext {
  return { symbols, defs: {}, param: symbols[0] ?? 'x', unknown: symbols[0] ?? 'x', solution: {}, answerSymbols: symbols, units: 'si' };
}

/** Desimalstreng med høyst 10 gjeldende siffer (uten e-notasjon). */
export function dec(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '0';
  const s = Number(v.toPrecision(10)).toString();
  if (!/e/i.test(s)) return s;
  const [m, e] = s.split(/e/i);
  const exp = Number(e);
  const neg = m.startsWith('-');
  const [ip, fp = ''] = m.replace('-', '').split('.');
  const digits = ip + fp;
  if (exp < 0) return `${neg ? '-' : ''}0.${'0'.repeat(-exp - 1)}${digits}`;
  return (neg ? '-' : '') + digits + '0'.repeat(Math.max(0, exp - fp.length));
}

const PREFIXES: [number, string][] = [
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
];

/** 0,0075 A → «7,5 mA». Enheter uten prefiks (dB, °) skrives rett. */
export function eng(v: number, unit: string, sig = 4): string {
  if (!unit || unit === 'dB' || unit === '°' || unit === 'rad/s' || unit === '%') return `${fmtNum(v, sig)}${unit ? (unit === '%' ? ' %' : unit === '°' ? '°' : ' ' + unit) : ''}`;
  const a = Math.abs(v);
  let [f, p] = [1, ''];
  if (a > 0) for (const [ff, pp] of PREFIXES) if (a >= ff * 0.9999) {
    [f, p] = [ff, pp];
    break;
  }
  if (a > 0 && a < 1e-12) [f, p] = [1e-12, 'p'];
  return `${fmtNum(v / f, sig)} ${p}${unit}`;
}

export function fmtNum(v: number, sig = 4): string {
  if (!Number.isFinite(v)) return '–';
  if (v === 0) return '0';
  const r = Number(v.toPrecision(sig));
  const s = Math.abs(r) >= 1e6 || Math.abs(r) < 1e-4 ? r.toPrecision(sig) : String(r);
  return s.replace('-', '−').replace('.', ',');
}

/** Samme som eng, men for KaTeX. */
export function engTex(v: number, unit: string, sig = 4): string {
  const t = eng(v, unit, sig).replace('−', '-').replace(/,/g, '{,}');
  const m = /^(-?[\d{},.]+)\s*(.*)$/.exec(t);
  if (!m) return t;
  const u = m[2].replace('µ', '\\mu ').replace('Ω', '\\Omega');
  return u ? `${m[1]}\\,\\mathrm{${u}}` : m[1];
}

export function tgt(symbol: string, label: string, value: number | Rat, unit: string, aliases: string[] = [], relTol = 0.01): AnswerTarget {
  const v = typeof value === 'number' ? value : value.toNumber();
  const exact = typeof value === 'number' ? dec(value) : value.isExactDecimal(8) ? value.toString() : dec(v);
  const tol = Math.max(Math.abs(v) * relTol, 1e-12);
  return { symbol, label, value: exact, unit, aliases: [symbol.toLowerCase(), ...aliases], tolerance: dec(tol) };
}

export function hints(small: string, firstStep: string, why: string): GenPart['hints'] {
  return { small, firstStep, stepExplanation: why, workedExample: { intro: '', steps: [] } };
}

export function calcPart(o: { id: string; label: string; prompt: string; skills: string[]; symbols: string[]; targets: AnswerTarget[]; solution: SolutionStep[]; hints: GenPart['hints'] }): GenPart {
  return { id: o.id, label: o.label, prompt: o.prompt, kind: 'beregning', skills: o.skills, math: elMath(o.symbols), targets: o.targets, solution: o.solution, hints: o.hints, methodCheckpoints: [] };
}

export { step };

/** Vanlige motstandsverdier (E12) i en gitt dekade. */
const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82];
export function eR(rng: () => number, decade = 1): number {
  return E12[Math.floor(rng() * E12.length)] * decade;
}

export const par = (a: Rat, b: Rat): Rat => a.mul(b).div(a.add(b));

export const r = (n: number | string): Rat => (typeof n === 'number' ? Rat.fromNumber(n) : Rat.parse(n));

/** «4 kΩ»-skriving av en motstand gitt som Rat i ohm. */
export function ohm(x: Rat | number): string {
  return eng(typeof x === 'number' ? x : x.toNumber(), 'Ω', 4);
}
