// Felles hjelpere for oppgavefamiliene: seedet tilfeldighet, formatering og
// bygging av uttrykk. All tallformatering bruker norsk desimalkomma.

import { Rat } from '../math/rational';
import type { GenPart, GeneratedTask, SolutionStep, VariationLevel, GenStyle, SubtaskAnalysis, TaskType, Criterion } from '../domain/types';

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export function randInt(rng: Rng, min: number, max: number, step = 1): number {
  const n = Math.floor((max - min) / step) + 1;
  return min + Math.floor(rng() * n) * step;
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const R = (x: number | string): Rat => (typeof x === 'number' ? Rat.fromNumber(x) : Rat.parse(x));

/** Norsk tall, med vanlig minus (−). */
export function no(x: Rat | number, maxDec = 4): string {
  const r = typeof x === 'number' ? Rat.fromNumber(x) : x;
  return r.toNo(maxDec);
}

/** Tall som tekst i en formel: 2,5 og −3. */
export function texNum(x: Rat | number): string {
  const r = typeof x === 'number' ? Rat.fromNumber(x) : x;
  if (r.isExactDecimal(4)) return r.toNo().replace('−', '-').replace(',', '{,}').replace(/ /g, '\\,');
  return r.toLatex();
}

/** «a − bX» / «c + dX» med riktige fortegn og uten «1X». */
export function linExpr(konst: Rat | number, coef: Rat | number, v: string, style: 'text' | 'tex' = 'text'): string {
  const k = typeof konst === 'number' ? Rat.fromNumber(konst) : konst;
  const c = typeof coef === 'number' ? Rat.fromNumber(coef) : coef;
  const fmt = style === 'tex' ? texNum : (r: Rat) => no(r);
  const vv = style === 'tex' ? v : v;
  const coefAbs = c.abs();
  const coefStr = coefAbs.eq(Rat.ONE) ? '' : fmt(coefAbs);
  const minus = style === 'tex' ? '-' : '−';
  const term = `${coefStr}${style === 'tex' && coefStr && !coefAbs.isInteger() ? '\\,' : ''}${vv}`;
  if (k.isZero()) return c.sign() < 0 ? `${minus}${term}` : term;
  const kStr = k.sign() < 0 ? `${minus}${fmt(k.abs())}` : fmt(k);
  return `${kStr} ${c.sign() < 0 ? minus : '+'} ${term}`;
}

export function step(tex: string, text: string, why: string, kind?: SolutionStep['kind']): SolutionStep {
  return { tex, text, why, kind };
}

export interface GenOptions {
  level: VariationLevel;
  style: GenStyle;
  seed: number;
  fade?: number; // antall gitte steg ved fading
  avoidKeys?: Set<string>;
}

export interface TemplateDef {
  id: string;
  version: number;
  level: VariationLevel;
  style: GenStyle;
  name: string;
  description: string;
  skills: string[];
  build: (rng: Rng, opts: GenOptions) => Omit<GeneratedTask, 'id' | 'kind' | 'courseId' | 'createdAt' | 'updatedAt' | 'validation' | 'sourceRefs' | 'wording' | 'seed' | 'templateId' | 'templateVersion' | 'familyKbId' | 'level' | 'style'>;
}

export interface FormulaDef {
  id: string;
  tex: string;
  name: string;
  kind: 'definisjon' | 'identitet' | 'modellantakelse' | 'tilnærming' | 'avledet sammenheng';
  kindWhy: string;
  symbols: { sym: string; meaning: string; unit: string }[];
  conditions: string[];
  whatIf: string[];
  derivation?: SolutionStep[];
  figure?: 'likevekt' | 'kostnad' | 'prosent' | 'avgift' | 'wsps';
  /** Enkel utforsker: skyv på inngangsverdiene og se resultatet regnet ut med samme formel. */
  calc?: { inputs: { sym: string; label: string; min: number; max: number; step: number; value: number }[]; compute: (v: Record<string, number>) => { label: string; value: string }[] };
}

export interface ComputedAnswer {
  label: string;
  value: string;
  display: string;
  symbol?: string;
  unit?: 'kr' | '%' | 'prosentpoeng' | 'mengde';
}

export interface IntentDef {
  id: string;
  label: string;
  match: RegExp[];
  /** Spesifikke mønstre (f.eks. «tilbake til», «prosentpoeng») vinner uansett hvor de står i teksten. */
  specific?: boolean;
  skills: string[];
  taskType: TaskType[];
  assignment: string;
  /** Faglig tolkning av hva svaret må vise (ikke offisielle kriterier). */
  interpretation: string[];
  prerequisites: string[];
  misconceptions: string[];
  variation: string[];
  estMinutes: number;
  compute?: (params: Record<string, string>, text: string) => ComputedAnswer[] | null;
}

export interface RecognizeResult {
  params: Record<string, string>;
  basis: string;
  strength: number; // 0–1, bare for rangering internt
}

export interface ExplanationSet {
  short: (p: Record<string, string>) => { text: string; example: string };
  analogy: { text: string; limits: string };
  derivationFormulaId: string;
}

export type Domain = 'økonomi' | 'elektro' | 'digital' | 'org';

export interface FamilyKB {
  id: string;
  /** Fagområde. Familier fra andre fagområder vises ikke i et fag. */
  domain?: Domain;
  name: string;
  shortName: string;
  topic: string;
  subtopics: string[];
  description: string;
  skills: string[];
  formulas: FormulaDef[];
  intents: IntentDef[];
  templates: TemplateDef[];
  misconceptions: { id: string; label: string; explanation: string }[];
  recognize: (text: string) => RecognizeResult | null;
  explanations: ExplanationSet;
  /** Kort beskrivelse av felles løsningsstruktur (brukes i sammenlikning). */
  solutionStructure: string[];
  surfaceFeatures: string[];
}

export function baseAnalysis(): SubtaskAnalysis {
  const now = new Date().toISOString();
  return {
    analyzer: 'ingen',
    analyzedAt: now,
    assignment: { value: '', status: 'mangler', basis: 'Ikke analysert' },
    topics: { value: [], status: 'mangler', basis: 'Ikke analysert' },
    skills: { value: [], status: 'mangler', basis: 'Ikke analysert' },
    taskType: { value: [], status: 'mangler', basis: 'Ikke analysert' },
    formulas: { value: [], status: 'mangler', basis: 'Ikke analysert' },
    prerequisites: { value: [], status: 'mangler', basis: 'Ikke analysert' },
    criteria: [],
    points: {},
    time: {},
    misconceptions: { value: [], status: 'mangler', basis: 'Ikke analysert' },
    variation: { value: [], status: 'mangler', basis: 'Ikke analysert' },
    certainty: { level: 'lav', basis: 'Ikke analysert ennå', uncertainties: [], extraction: 'mangler', validation: 'ikke-kontrollert' },
    conflicts: [],
  };
}

/** Oppgavekrav som står eksplisitt i teksten (verb som «forklar», «vis», «tegn»). */
export function documentedRequirements(text: string): { text: string; basis: Criterion['basis'] }[] {
  const out: { text: string; basis: Criterion['basis'] }[] = [];
  const t = text.toLowerCase();
  const add = (s: string) => out.push({ text: s, basis: 'oppgavekrav' });
  if (/vis (utregning|beregning|hvordan)|vis at|vis framgangs/.test(t)) add('Utregningen skal vises, ikke bare svaret («vis …» står i oppgaven).');
  if (/forklar|begrunn|hvorfor/.test(t)) add('Svaret skal inneholde en forklaring eller begrunnelse («forklar/begrunn» står i oppgaven).');
  if (/tolk/.test(t)) add('Resultatet skal tolkes i sammenhengen («tolk» står i oppgaven).');
  if (/tegn|illustrer|figur|diagram/.test(t)) add('Oppgaven ber om eller viser til en figur eller et diagram.');
  if (/drøft|vurder|diskuter/.test(t)) add('Svaret skal drøfte eller vurdere, ikke bare beregne («drøft/vurder» står i oppgaven).');
  if (/kontroller|sjekk/.test(t)) add('Svaret skal kontrolleres («kontroller» står i oppgaven).');
  if (/(finn|beregn|regn ut)/.test(t)) add('Oppgaven ber om en beregnet verdi («finn/beregn»).');
  if (/avrund|to desimaler|én desimal|en desimal/.test(t)) add('Oppgaven angir avrunding.');
  return out;
}

/** Leser tall fra tekst med norsk skrivemåte (1 200, 2,5). */
export function readNumber(s: string): number | null {
  const t = s.replace(/[   ]/g, '').replace(',', '.').replace(/[−–]/g, '-');
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : null;
}

export function partId(i: number): string {
  return String.fromCharCode(97 + i);
}

export interface GraphLines {
  demand?: { a: number; b: number };
  supply?: { c: number; d: number };
  supplyTax?: { c: number; d: number; t: number };
}
