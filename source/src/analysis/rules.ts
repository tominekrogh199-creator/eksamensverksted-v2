// Regelbasert analyse av deloppgaver for de oppgavefamiliene appen kjenner.
// Den leser parametere fra teksten, regner fasit eksakt og merker alt som
// «regelbasert». Ukjente oppgaver får lav sikkerhet og sendes til AI-analyse
// eller manuell merking; de får aldri en oppdiktet analyse.

import type { SubtaskAnalysis, Criterion, SourceRef, TaskType } from '../domain/types';
import { FAMILIES, domainOf } from '../families';
import type { FamilyKB, IntentDef, ComputedAnswer } from '../families/common';
import { baseAnalysis, documentedRequirements } from '../families/common';

export interface RuleInput {
  /** Fagområder dokumentet hører til; familier fra andre fagområder vurderes ikke. */
  domains?: string[];
  intro: string;
  priorText: string; // tidligere deloppgaver i samme oppgave (avhengigheter)
  text: string;
  /** Sensorveiledningens tekst for spørsmålet, når den står i samme dokument. Brukes til å kjenne igjen tema. */
  guideText?: string;
  format?: 'flervalg' | 'kortsvar' | 'langsvar' | 'oppgave';
  choices?: { letter: string; text: string; correct?: boolean }[];
  label: string;
  points?: number;
  pointsQuote?: string;
  taskPoints?: number;
  taskWeightPct?: number;
  subtaskCount: number;
  equalSubWeights?: boolean;
  figurePages: number[];
  extraction: SubtaskAnalysis['certainty']['extraction'];
  source: SourceRef;
  examMinutes?: number;
}

export interface RuleResult {
  analysis: SubtaskAnalysis;
  family?: FamilyKB;
  intent?: IntentDef;
}

const EXPLAIN_RE = /\b(forklar|drøft|vurder|diskuter|hvorfor|begrunn|tolk)\b/i;
const CALC_RE = /\b(finn|beregn|regn ut|bestem|hvor mange|hvor mye|hva blir|hva er)\b/i;

function pickFamily(input: RuleInput): { family: FamilyKB; params: Record<string, string>; basis: string } | null {
  const combined = [input.intro, input.priorText, input.text, (input.choices ?? []).map((c) => c.text).join(' '), input.guideText].filter(Boolean).join('\n');
  let best: { family: FamilyKB; params: Record<string, string>; basis: string; score: number } | null = null;
  for (const f of FAMILIES) {
    if (input.domains?.length && !input.domains.includes(domainOf(f))) continue;
    const rec = f.recognize(combined);
    if (!rec) continue;
    let score = rec.strength;
    if (f.recognize(input.text)) score += 0.1;
    if (f.intents.some((it) => it.match.some((r) => r.test(input.text)))) score += 0.15;
    // Avgift er en endret forutsetning av likevekt: krever at avgiften faktisk er nevnt.
    if (f.id === 'likevekt-avgift' && !/avgift/i.test(input.text) && !/avgift/i.test(input.priorText)) score -= 1;
    // Tall leses helst fra selve oppgaveteksten, ikke fra veiledningen.
    const qText = [input.intro, input.priorText, input.text, (input.choices ?? []).map((c) => c.text).join(' ')].filter(Boolean).join('\n');
    const recQ = qText.trim() ? f.recognize(qText) : null;
    const params = recQ && Object.keys(recQ.params).length ? recQ.params : rec.params;
    if (!best || score > best.score) best = { family: f, params, basis: rec.basis, score };
  }
  return best && best.score > 0.3 ? best : null;
}

function firstIndex(it: IntentDef, text: string): number {
  let best = Infinity;
  for (const r of it.match) {
    const m = new RegExp(r.source, r.flags.replace('g', '')).exec(text);
    if (m && m.index < best) best = m.index;
  }
  return best;
}

function pickIntents(f: FamilyKB, text: string): { primary?: IntentDef; all: IntentDef[] } {
  const all = f.intents.filter((it) => it.match.some((r) => r.test(text)));
  // Spesifikke mønstre vinner; ellers er det det som spørres om først i teksten, som er hovedoppdraget.
  const specific = all.filter((it) => it.specific);
  let primary: IntentDef | undefined = specific[0] ?? [...all].sort((a, b) => firstIndex(a, text) - firstIndex(b, text))[0];
  if (!primary) {
    if (EXPLAIN_RE.test(text) && !CALC_RE.test(text)) primary = f.intents.find((it) => it.taskType[0] === 'forklaring') ?? f.intents.find((it) => it.taskType.includes('forklaring'));
    else primary = f.intents[f.intents.length - 1];
  }
  const merged: IntentDef[] = primary && !all.includes(primary) ? [primary, ...all] : all;
  return { primary, all: merged };
}

function relevantFormulas(f: FamilyKB, intent?: IntentDef) {
  const id = intent?.id ?? '';
  const pickIds: Record<string, string[]> = {
    'lik.beregn': ['f-lik', 'f-qd', 'f-qs', 'f-pstar'],
    'lik.graf': ['f-lik', 'f-qd', 'f-qs'],
    'lik.overskudd': ['f-qd', 'f-qs'],
    'lik.tolke': ['f-lik'],
    'avg.likevekt': ['f-kile'],
    'avg.fordeling': ['f-andel', 'f-kile'],
    'pst.endring': ['f-pst'],
    'pst.tilbake': ['f-pst'],
    'pst.gjentatt': ['f-vekst'],
    'pst.poeng': ['f-poeng', 'f-pst'],
    'pst.tolke': ['f-pst'],
    'kost.ac': ['f-tc', 'f-ac'],
    'kost.mc': ['f-mc'],
    'kost.fast_var': ['f-tc'],
    'kost.tolke': ['f-ac'],
    'kost.nullpunkt': ['f-null'],
    'kost.overskudd': ['f-tc', 'f-null'],
  };
  const ids = pickIds[id] ?? f.formulas.slice(0, 2).map((x) => x.id);
  return f.formulas
    .filter((x) => ids.includes(x.id))
    .map((x) => ({ expr: x.tex, meaning: x.name, assumptions: x.conditions.join(' '), why: `${x.kind[0].toUpperCase()}${x.kind.slice(1)}: ${x.kindWhy}` }));
}

export function analyzeSubtaskRules(input: RuleInput): RuleResult {
  const a = baseAnalysis();
  a.analyzedAt = new Date().toISOString();
  const quote = input.text.slice(0, 160);
  const src: SourceRef = { ...input.source, quote, taskLabel: input.label };

  // Poeng og tid: offisielle verdier holdes adskilt fra anslag.
  if (input.points !== undefined) {
    a.points.official = input.points;
    a.points.officialQuote = input.pointsQuote;
    a.points.officialSource = { ...src, quote: input.pointsQuote };
  } else if (input.taskWeightPct !== undefined) {
    if (input.equalSubWeights) {
      a.points.official = Math.round((input.taskWeightPct / input.subtaskCount) * 10) / 10;
      a.points.officialQuote = `Oppgaven teller ${input.taskWeightPct} %, og forsiden sier at deloppgavene teller likt`;
    } else {
      a.points.estimate = Math.round((input.taskWeightPct / input.subtaskCount) * 10) / 10;
      a.points.estimateBasis = `Anslag: oppgavens vekt (${input.taskWeightPct} %) fordelt likt på ${input.subtaskCount} deloppgaver. Ikke oppgitt per deloppgave.`;
    }
  } else if (input.taskPoints !== undefined) {
    a.points.estimate = Math.round((input.taskPoints / input.subtaskCount) * 10) / 10;
    a.points.estimateBasis = `Anslag: oppgavens ${input.taskPoints} poeng fordelt likt. Ikke oppgitt per deloppgave.`;
  }

  const req = documentedRequirements(input.text);
  const criteria: Criterion[] = req.map((r, i) => ({ id: `req${i}`, text: r.text, basis: 'oppgavekrav', source: src }));

  const fam = pickFamily(input);
  if (!fam) {
    a.analyzer = 'ingen';
    a.assignment = { value: req.length ? req.map((r) => r.text).join(' ') : 'Ikke tolket', status: 'mangler', basis: 'Ingen kjent oppgavefamilie ble gjenkjent i teksten.' };
    a.taskType = { value: input.format === 'flervalg' ? ['flervalg'] : guessTypes(input.text || input.guideText || ''), status: 'regelbasert', basis: input.format === 'flervalg' ? 'Flervalgsspørsmål.' : 'Fra verbene i oppgaveteksten.' };
    a.criteria = criteria;
    a.certainty = {
      level: 'lav',
      basis: 'Regelmotoren kjenner ikke denne oppgavetypen. Den trenger AI-analyse eller at du merker den selv.',
      uncertainties: ['Tema, ferdigheter og fasit er ikke analysert.'],
      extraction: input.extraction,
      validation: 'ikke-kontrollert',
    };
    if (input.examMinutes && a.points.official !== undefined) a.time = { estimate: undefined, basis: 'Ukjent' };
    return { analysis: a };
  }

  const { family, params, basis } = fam;
  const intentText = [input.text, (input.choices ?? []).map((c) => c.text).join(' '), input.text.trim() ? '' : input.guideText ?? ''].filter(Boolean).join('\n');
  const { primary, all } = pickIntents(family, intentText);
  const skills = [...new Set(all.flatMap((i) => i.skills))];
  const types = (input.format === 'flervalg' ? ['flervalg'] : [...new Set(all.flatMap((i) => i.taskType))]) as TaskType[];
  a.analyzer = 'regelbasert';
  a.familyKbId = family.id;
  a.familyBasis = basis;
  a.intentId = primary?.id;
  a.params = params;
  a.assignment = { value: primary?.assignment ?? family.description, status: 'regelbasert', basis: `Gjenkjent som «${primary?.label ?? family.shortName}» ut fra ordlyden.` };
  a.topics = { value: [family.topic, ...family.subtopics.slice(0, 2)], status: 'regelbasert', basis: `Oppgavefamilien «${family.shortName}».` };
  a.skills = { value: skills, status: 'regelbasert', basis: 'Ferdighetene familien og deloppgavetypen krever.' };
  a.taskType = { value: types.length ? types : guessTypes(input.text), status: 'regelbasert', basis: 'Fra verbene i oppgaveteksten og deloppgavetypen.' };
  a.formulas = { value: relevantFormulas(family, primary), status: 'regelbasert', basis: 'Formler som hører til denne typen oppgave.' };
  a.prerequisites = { value: [...new Set(all.flatMap((i) => i.prerequisites))], status: 'regelbasert', basis: 'Forkunnskaper familien bygger på.' };
  a.misconceptions = { value: [...new Set(all.flatMap((i) => i.misconceptions))], status: 'regelbasert', basis: 'Vanlige feil for denne typen oppgave (faglig vurdering, ikke observert hos deg).' };
  a.variation = { value: [...new Set(all.flatMap((i) => i.variation))], status: 'regelbasert', basis: 'Endringer som vil endre løsningsmetoden.' };
  for (const it of all) for (const t of it.interpretation) if (!criteria.some((c) => c.text === t)) criteria.push({ id: `tolk${criteria.length}`, text: t, basis: 'faglig-tolkning' });
  a.criteria = criteria;

  // Fasit fra hovedtypen. Bare hvis den ikke regner noe, brukes neste type som kontekst (f.eks. tallene en forklaring bør bruke).
  const answers: ComputedAnswer[] = [];
  const ordered = primary ? [primary, ...all.filter((x) => x !== primary)] : all;
  for (const it of ordered) {
    try {
      const r = it.compute?.(params, input.text);
      if (r && r.length) {
        for (const x of r) if (!answers.some((y) => y.label === x.label)) answers.push(x);
        break;
      }
    } catch {
      /* uberegnelig med disse parameterne */
    }
  }
  const uncertainties: string[] = [];
  if (input.figurePages.length && /figur|diagram|grafen|les av/i.test(input.text)) uncertainties.push(`Oppgaven bygger på en figur (PDF-side ${input.figurePages.join(', ')}). Regelmotoren leser ikke figurer; beregningene bruker uttrykkene i teksten.`);
  if (!answers.length && types.includes('beregning')) uncertainties.push('Fant ikke nok tall i teksten til å regne ut fasit.');
  if (a.points.official === undefined && a.points.estimate === undefined) uncertainties.push('Poeng er ikke oppgitt.');
  if (answers.length) a.computed = { status: 'kontrollert', method: 'Parametere lest fra oppgaveteksten; svar regnet eksakt med brøkaritmetikk.', answers };
  a.time = { estimate: primary?.estMinutes, basis: 'Anslag for denne typen deloppgave' };
  if (input.examMinutes && a.points.official !== undefined && input.taskWeightPct === undefined && input.points !== undefined) {
    a.time = { estimate: primary?.estMinutes, basis: 'Anslag for denne typen deloppgave' };
  }
  a.certainty = {
    level: primary && all.length && (answers.length || !types.includes('beregning')) ? (uncertainties.some((u) => u.includes('figur')) ? 'middels' : 'høy') : 'middels',
    basis: `${basis} ${primary ? `Deloppgaven passer mønsteret «${primary.label}».` : ''}`.trim(),
    uncertainties,
    extraction: input.extraction,
    validation: answers.length ? 'kontrollert' : 'ikke-kontrollert',
  };
  return { analysis: a, family, intent: primary };
}

function guessTypes(text: string): TaskType[] {
  const t: TaskType[] = [];
  if (CALC_RE.test(text)) t.push('beregning');
  if (/forklar|begrunn|hvorfor/i.test(text)) t.push('forklaring');
  if (/tolk/i.test(text)) t.push('tolkning');
  if (/tegn|skisser|figur|diagram/i.test(text)) t.push('tegning');
  if (/drøft|vurder|diskuter/i.test(text)) t.push('drøfting');
  if (/sammenlikn|sammenlign/i.test(text)) t.push('sammenlikning');
  if (/vis at|utled/i.test(text)) t.push('utledning');
  return t.length ? t : ['beregning'];
}


/** Hvilke fagområder et dokument hører til: flertallet av oppgavene avgjør. */
export function detectDomains(texts: string[]): string[] {
  const votes = new Map<string, number>();
  for (const t of texts) {
    let best: { d: string; s: number } | null = null;
    for (const f of FAMILIES) {
      const r = f.recognize(t);
      if (r && (!best || r.strength > best.s)) best = { d: domainOf(f), s: r.strength };
    }
    if (best) votes.set(best.d, (votes.get(best.d) ?? 0) + 1);
  }
  const total = [...votes.values()].reduce((a, b) => a + b, 0);
  if (!total) return [];
  const sorted = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.filter(([, n], i) => i === 0 || n / total >= 0.3).map(([d]) => d);
}
