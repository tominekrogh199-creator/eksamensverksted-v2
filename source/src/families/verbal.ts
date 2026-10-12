// Byggeklosser for familier der eksamen i stor grad spør om forståelse med
// ord og figurer: flervalg med én entydig fasit, «komparativ statikk»
// (hvilken kurve skifter, hvilken vei, hva skjer med pris/ledighet) og
// forklaringer med synlig vurderingsramme. Alt er faste, kontrollerte
// oppgaver: fasit står i malen og valideres (nøyaktig ett riktig alternativ).

import type { GenPart, RubricItem, SolutionStep } from '../domain/types';
import type { Rng, TemplateDef, RecognizeResult } from './common';
import { pick, shuffle, step } from './common';
import type { VariationLevel } from '../domain/types';

export interface McItem {
  id: string;
  skill: string;
  stem: string;
  correct: string;
  wrong: string[];
  /** Hvorfor riktig svar er riktig (vises etter levering). */
  why: string;
  /** Valgfritt: typisk feil og hvorfor den er feil, per galt alternativ. */
  wrongWhy?: Record<string, string>;
  intro?: string;
}

const EMPTY_HINTS = (why: string) => ({ small: 'Les alle alternativene. Hvilket stemmer med modellen fra kurset, ikke bare med hverdagsforståelsen?', firstStep: 'Stryk først alternativer som blander begreper (f.eks. skift i kurven og bevegelse langs kurven).', stepExplanation: why, workedExample: { intro: '', steps: [] } });

export function mcPart(rng: Rng, item: McItem, label = 'a', id = 'a'): GenPart {
  const opts = shuffle(rng, [item.correct, ...item.wrong.slice(0, 3)]);
  const letters = ['A', 'B', 'C', 'D'];
  return {
    id,
    label,
    prompt: item.stem,
    kind: 'flervalg',
    skills: [item.skill],
    choices: opts.map((t, i) => ({ id: letters[i], text: t, correct: t === item.correct, why: t === item.correct ? item.why : `${item.wrongWhy?.[t] ?? 'Dette stemmer ikke med modellen.'} Riktig er: «${item.correct}». ${item.why}` })),
    solution: [step('', `Riktig svar: ${item.correct}`, item.why, 'tolkning')],
    hints: EMPTY_HINTS(item.why),
    methodCheckpoints: [],
  };
}

export function mcTemplate(o: { id: string; level: VariationLevel; name: string; description: string; title: string; items: McItem[]; estMinutes?: number }): TemplateDef {
  const skills = [...new Set(o.items.map((i) => i.skill))];
  return {
    id: o.id,
    version: 1,
    level: o.level,
    style: 'standard',
    name: o.name,
    description: o.description,
    skills,
    build: (rng) => {
      const item = pick(rng, o.items);
      const part = mcPart(rng, item);
      return { title: o.title, intro: item.intro ?? '', context: item.id, parts: [part], params: { item: item.id }, skills: [item.skill], structureKey: `${o.id}|${item.id}`, estMinutes: o.estMinutes ?? 2 };
    },
  };
}

export function rubric(items: [string, boolean][]): RubricItem[] {
  return items.map(([text, required], i) => ({ id: `k${i + 1}`, text, basis: 'faglig-tolkning', required }));
}

export interface ExplainItem {
  id: string;
  skills: string[];
  intro?: string;
  prompt: string;
  rubric: [string, boolean][];
  model: string;
  hints: { small: string; firstStep: string; why: string };
}

export function explainPart(item: ExplainItem, label = 'a', id = 'a'): GenPart {
  return {
    id,
    label,
    prompt: item.prompt,
    kind: 'forklaring',
    skills: item.skills,
    rubric: rubric(item.rubric),
    solution: [step('', 'Modellsvar', item.model, 'tolkning')],
    hints: { small: item.hints.small, firstStep: item.hints.firstStep, stepExplanation: item.hints.why, workedExample: { intro: '', steps: [] } },
    methodCheckpoints: [{ id: 'forklaring', label: 'Forklarte med modellen', skill: item.skills[0], detect: { type: 'forklaring' }, required: true }],
    modelAnswer: item.model,
  };
}

export function explainTemplate(o: { id: string; level: VariationLevel; name: string; description: string; title: string; items: ExplainItem[]; estMinutes?: number }): TemplateDef {
  return {
    id: o.id,
    version: 1,
    level: o.level,
    style: 'standard',
    name: o.name,
    description: o.description,
    skills: [...new Set(o.items.flatMap((i) => i.skills))],
    build: (rng) => {
      const item = pick(rng, o.items);
      return { title: o.title, intro: item.intro ?? '', context: item.id, parts: [explainPart(item)], params: { item: item.id }, skills: item.skills, structureKey: `${o.id}|${item.id}`, estMinutes: o.estMinutes ?? 6 };
    },
  };
}

/** Komparativ statikk: et sjokk, og så «hvilken kurve», «hvilken vei» og «hva skjer med …». */
export interface ShockItem {
  id: string;
  scenario: string;
  questions: { skill: string; stem: string; correct: string; wrong: string[]; why: string }[];
  explain: Omit<ExplainItem, 'id' | 'intro'>;
}

export function shockTemplate(o: { id: string; level: VariationLevel; name: string; description: string; title: string; items: ShockItem[]; estMinutes?: number }): TemplateDef {
  return {
    id: o.id,
    version: 1,
    level: o.level,
    style: 'standard',
    name: o.name,
    description: o.description,
    skills: [...new Set(o.items.flatMap((i) => [...i.questions.map((q) => q.skill), ...i.explain.skills]))],
    build: (rng) => {
      const item = pick(rng, o.items);
      const parts: GenPart[] = item.questions.map((q, i) => mcPart(rng, { id: `${item.id}-${i}`, skill: q.skill, stem: q.stem, correct: q.correct, wrong: q.wrong, why: q.why }, String.fromCharCode(97 + i), String.fromCharCode(97 + i)));
      const k = parts.length;
      parts.push(explainPart({ ...item.explain, id: item.id }, String.fromCharCode(97 + k), String.fromCharCode(97 + k)));
      return { title: o.title, intro: item.scenario, context: item.id, parts, params: { item: item.id }, skills: [...new Set(parts.flatMap((p) => p.skills))], structureKey: `${o.id}|${item.id}`, estMinutes: o.estMinutes ?? 8 };
    },
  };
}

/** Nøkkelordgjenkjenning: summerer vekter for treff og krever en minstesum. */
export function keywordRecognizer(signals: [RegExp, number][], min: number, name: string, params?: (text: string) => Record<string, string>): (text: string) => RecognizeResult | null {
  return (text: string) => {
    let score = 0;
    const hits: string[] = [];
    for (const [re, w] of signals) {
      const m = re.exec(text);
      if (m) {
        score += w;
        if (hits.length < 3) hits.push(`«${m[0].trim()}»`);
      }
    }
    if (score < min) return null;
    return { params: params?.(text) ?? {}, basis: `Kjent igjen som ${name} ut fra begreper i teksten (${hits.join(', ')}).`, strength: Math.min(0.92, 0.3 + score * 0.08) };
  };
}

export function steps(...s: [string, string, string?][]): SolutionStep[] {
  return s.map(([tex, text, why]) => step(tex, text, why ?? '', 'omforming'));
}
