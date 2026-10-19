// Lær-delen: korte leksjoner per tema som bare tar med det eksamen faktisk krever.
//
// Med AI lages leksjonen i tre steg:
//  1. Analyse: AI leser ALLE eksamensspørsmålene dine om temaet (med fasit og
//     sensorveiledning) og avgjør hva eksamen spør om, hvilke formler som trengs,
//     hvordan spørsmålene er formulert, typiske feller og hva som kan hoppes over.
//  2. Leksjon: AI skriver korte kort ut fra analysen, tilpasset læringsmåten og
//     (om du vil) interessene dine.
//  3. Kontroll: et uavhengig AI-kall løser kontrollspørsmålene og quizen uten
//     fasit; spørsmål der svarene ikke stemmer, fjernes. Alle tall i
//     kalkulatorkortene regnes ut på nytt av appen, og tastetrykkene kjøres i en
//     simulert kalkulator før de vises.
// Uten AI bygges leksjonen fra kunnskapsbasen (formler, gjennomregnet eksempel,
// feller) og de ekte flervalgsspørsmålene dine.

import type { LessonRec, LessonCard, QuizItem, SubTask, SourceDoc, LearnerProfile, LessonVisual } from '../domain/types';
import { nowIso } from '../domain/types';
import { store } from '../state/store';
import { getFamily, familyShort, type FamilyKB } from '../families';
import { skillName } from '../families/skills';
import { generateOne } from '../generator/generate';
import { originalPool } from './originals';
import { aiJson, aiAvailable, asData, DATA_RULE, V } from '../ai/client';
import { evaluate, planKeys } from './calculator';
import { eng } from '../families/el-common';
import { profile, calculatorFor } from './game';
import { topicStats, relevanceText, formatText } from './path';
import { isOrgTopic, orgKbLesson, orgEnrich, mergeEnrich } from './orgLesson';

export const LESSON_VERSION = 2;

/** Én leksjon per tema. Tekst/visuelt og kalkulatortype styrer bare visningen, ikke innholdet. */
export const lessonId = (courseId: string, kbId: string) => `les-${courseId}-${kbId}`;

export function cachedLesson(kbId: string): LessonRec | undefined {
  const cid = store.ui.activeCourseId ?? '';
  const l = store.get<LessonRec>('lesson', lessonId(cid, kbId));
  return l && l.version === LESSON_VERSION ? l : undefined;
}

// ——— Studentens eksamensspørsmål om temaet ———

export function topicQuestions(kbId: string): SubTask[] {
  const pool = originalPool();
  const exam = [...pool.flervalg, ...pool.kortsvar, ...pool.langsvar, ...pool.oppgave].filter((s) => s.analysis.familyKbId === kbId);
  const coll = pool.samling.filter((s) => s.analysis.familyKbId === kbId && (s.text ?? '').length > 15);
  return [...exam, ...coll];
}

/**
 * Utvalget AI-analysen leser: spredt over formatene (flervalg, kortsvar, lengre,
 * regneoppgaver) og settene, nyeste først, slik at de tunge tekstspørsmålene ikke
 * drukner i flervalg.
 */
export function sampleQuestions(kbId: string, n = 12): SubTask[] {
  const year = (s: SubTask) => store.get<SourceDoc>('doc', s.docId)?.meta.year ?? 0;
  const groups = new Map<string, SubTask[]>();
  for (const q of topicQuestions(kbId)) {
    const k = store.get<SourceDoc>('doc', q.docId)?.meta.docType === 'oppgavesamling' ? 'samling' : q.format ?? 'oppgave';
    groups.set(k, [...(groups.get(k) ?? []), q]);
  }
  for (const g of groups.values()) g.sort((a, b) => year(b) - year(a) || Number(!!b.guide?.text) - Number(!!a.guide?.text));
  const order = ['langsvar', 'kortsvar', 'oppgave', 'flervalg', 'samling'].map((k) => groups.get(k) ?? []).filter((g) => g.length);
  const out: SubTask[] = [];
  for (let i = 0; out.length < n && order.some((g) => g.length > i); i++) for (const g of order) if (g[i] && out.length < n) out.push(g[i]);
  return out;
}

function questionText(st: SubTask, i: number): string {
  const doc = store.get<SourceDoc>('doc', st.docId);
  const lines = [`Spørsmål ${i + 1} (${doc?.meta.docType === 'oppgavesamling' ? 'oppgavesamlingen' : doc?.meta.setLabel ?? 'eksamen'}${st.part ? `, Del ${st.part}` : ''}, ${st.format ?? 'oppgave'}):`];
  if (st.intro) lines.push(`Innledning: ${st.intro.slice(0, 600)}`);
  lines.push(st.text.slice(0, 900));
  if (st.choices?.length) st.choices.forEach((c) => lines.push(`  ${c.letter}) ${c.text}${c.correct ? '   [riktig]' : ''}`));
  if (st.guide?.text) lines.push(`${st.format === 'oppgave' ? 'Løsning' : 'Sensorveiledning'}: ${st.guide.text.slice(0, 900)}`);
  if (st.answerKeys?.length) lines.push(`Sluttsvar: ${st.answerKeys.map((k) => k.display).join('; ')}`);
  return lines.join('\n');
}

// ——— Leksjon fra kunnskapsbasen (uten AI) ———

const CALC_EXAMPLES: Record<string, [string, string]> = {
  'likevekt-lineaer': ['Qd = 120 − 2P og Qs = 20 + 3P. Likevektsprisen er P = (120 − 20)/(2 + 3).', '(120 − 20)/(2 + 3)'],
  'likevekt-avgift': ['Med en avgift på 5 kr per enhet blir kjøperprisen P = (120 − 20 + 3·5)/(2 + 3).', '(120 − 20 + 3·5)/(2 + 3)'],
  'prosent-endring': ['Prisen går fra 250 til 290 kr. Endring i prosent = (290 − 250)/250 · 100.', '(290 − 250)/250 · 100'],
  'kostnad-lineaer': ['TC = 5000 + 12Q. Gjennomsnittskostnaden ved Q = 250 er 5000/250 + 12.', '5000/250 + 12'],
  'ws-ps': ['Reallønnen når nominell lønn er 230 og prisnivået 1,15: 230/1,15.', '230/1,15'],
  arbeidsdisiplin: ['Verdien av jobben over 26 uker med lønn 6000 og dagpenger 3720: (6000 − 3720) · 26.', '(6000 − 3720)·26'],
  'fritid-konsum': ['Timelønn 230 kr, 18 timer fritid og 200 kr arbeidsfri inntekt: konsum = 230 · (24 − 18) + 200.', '230·(24 − 18) + 200'],
  'marked-frikonkurranse': ['Pris 55, gjennomsnittskostnad 40 og 300 enheter: overskudd = (55 − 40) · 300.', '(55 − 40)·300'],
  alternativkostnad: ['Inntekt 3000, kostnad 500 og beste alternativ 1200: økonomisk gevinst = 3000 − 500 − 1200.', '3000 − 500 − 1200'],
  'teknologi-isokost': ['Lønn 200 og kapitalpris 500, med 10 arbeidstimer og 4 maskiner: kostnad = 200·10 + 500·4.', '200·10 + 500·4'],
  'prinsipal-agent': ['80 % sjanse for 5000 kr, og innsatsen koster 1500: forventet gevinst = 0,8 · 5000 − 1500.', '0,8·5000 − 1500'],
  'bnp-inflasjon': ['KPI går fra 120 til 126. Inflasjon = (126 − 120)/120 · 100.', '(126 − 120)/120 · 100'],
  'konjunktur-konsum': ['Marginal konsumtilbøyelighet 0,8: multiplikatoren er 1/(1 − 0,8).', '1/(1 − 0,8)'],
  kapitalisme: ['De rikeste har 450 av 1500 i samlet inntekt. Andel i prosent = 450/1500 · 100.', '450/1500·100'],
  'el-grunnlag': ['Ohms lov: I = U/R med U = 12 V og R = 4,7 kΩ = 4700 Ω.', '12/4700'],
  'el-motstand': ['To motstander på 2 kΩ og 3 kΩ i parallell: R = 1/(1/2000 + 1/3000).', '1/(1/2000 + 1/3000)'],
  'el-kretsanalyse': ['Spenningsdeling: U2 = 12 · 3000/(2000 + 3000).', '12·3000/(2000 + 3000)'],
  'el-opamp': ['Ikke-inverterende forsterker: A = 1 + 10 kΩ/2 kΩ.', '1 + 10000/2000'],
  'el-transient': ['Tidskonstant τ = R·C med R = 1 kΩ og C = 47 µF.', '1000·0,000047'],
  'el-ac': ['Impedansens størrelse: |Z| = √(30² + 40²).', '√(30^2 + 40^2)'],
  'el-filter': ['Knekkfrekvens f = 1/(2π·R·C) med R = 1 kΩ og C = 100 nF (π ≈ 3,1416).', '1/(2·3,1416·1000·0,0000001)'],
  'dig-tall': ['Binært 10110110 til desimalt: 128 + 32 + 16 + 4 + 2.', '128 + 32 + 16 + 4 + 2'],
  'dig-logikk': ['Antall rader i en sannhetstabell med fire innganger: 2·2·2·2.', '2·2·2·2'],
  'dig-sekvensiell': ['Klokkefrekvens når perioden er 2 µs: f = 1/0,000002.', '1/0,000002'],
};

function calcCard(task: string, expression: string, calculator: LearnerProfile['calculator']): LessonCard | null {
  const v = evaluate(expression);
  if (v === null) return null;
  if (calculator !== 'enkel') {
    return { type: 'calculator', title: 'Slik taster du det', task, expression, keys: [], result: String(v), tip: 'Tast inn hele uttrykket med parenteser rundt teller og nevner, og trykk =. Sjekk at svaret er rimelig.' };
  }
  const p = planKeys(expression);
  // Også når uttrykket er for sammensatt for én tastesekvens: da viser kortet hvordan det regnes i biter.
  return {
    type: 'calculator',
    title: 'På en vanlig kalkulator',
    task,
    expression,
    keys: p?.keys ?? [],
    result: String(v),
    tip: !p ? 'Dette er for sammensatt for én tastesekvens på en enkel kalkulator. Regn delene hver for seg, skriv ned mellomsvarene, og sett dem sammen.' : p.usesMemory ? 'Kalkulatoren regner fra venstre mot høyre og har ingen parenteser. Minnet (M+, M−, MRC) holder på mellomsvaret for deg.' : 'Kalkulatoren regner fra venstre mot høyre, så rekkefølgen du taster i avgjør svaret.',
  };
}

/** Et gjennomregnet eksempel: helst en regneoppgave med minst tre steg (ikke bare et flervalg). */
function genericExampleTask(fam: FamilyKB) {
  const tpls = [...fam.templates.filter((t) => t.style === 'standard')].sort((a, b) => a.level - b.level);
  let fallback: ReturnType<typeof generateOne> | null = null;
  for (const tpl of tpls)
    for (let i = 0; i < 3; i++) {
      try {
        const t = generateOne(store.ui.activeCourseId ?? '', fam.id, tpl, 1000 + i * 7919);
        if (t.validation.status === 'forkastet') continue;
        const calc = t.parts.find((p) => p.kind === 'beregning' && p.solution.length >= 3 && p.targets?.length);
        if (calc) return { task: t, part: calc };
        if (!fallback && t.parts.some((p) => p.solution.length >= 2)) fallback = t;
      } catch {
        /* prøv et annet frø */
      }
    }
  const part = fallback?.parts.find((p) => p.solution.length >= 2);
  return fallback && part ? { task: fallback, part } : null;
}

/** Ekte flervalgsspørsmål fra eksamenene dine om temaet, med fasit fra kilden. */
const FIG_WORDS = /\b(figur|diagram|tabell|grafen|illustrasjon|følgende figur)/i;

/** Viser spørsmålet til en figur eller tabell som må ses? */
export function needsFigure(s: SubTask): boolean {
  return (s.figures ?? []).some((f) => !f.inGuide) || FIG_WORDS.test(`${s.intro ?? ''} ${s.text}`);
}

/**
 * Ekte flervalgsspørsmål fra eksamenene dine om temaet, med fasit fra kilden.
 * Spørsmål med figur får utsnittet med (eller utelates når figuren ikke kan vises).
 */
export function examMc(kbId: string, n: number, opts: { figures?: boolean } = {}): QuizItem[] {
  return originalPool()
    .flervalg.filter((s) => s.analysis.familyKbId === kbId && s.choices?.some((c) => c.correct) && (s.choices?.length ?? 0) >= 2)
    .filter((s) => {
      if (!needsFigure(s)) return true;
      if (!opts.figures) return false;
      return (s.figures ?? []).some((f) => !f.inGuide && f.box);
    })
    .sort(() => Math.random() - 0.5)
    .slice(0, n)
    .map((s) => {
      const ch = s.choices!;
      const correct = ch.findIndex((c) => c.correct);
      const doc = store.get<SourceDoc>('doc', s.docId);
      const fig = (s.figures ?? []).find((f) => !f.inGuide && f.box);
      return {
        question: `${s.intro ? `${s.intro.slice(0, 300)} ` : ''}${s.text}`.trim(),
        options: ch.map((c) => c.text),
        correct,
        why: `Fasit fra ${doc?.meta.setLabel ?? 'eksamen'}: ${ch[correct].letter}).${s.guide?.text ? ` ${s.guide.text.slice(0, 260)}` : ''}`,
        source: 'eksamen' as const,
        ...(fig && fig.box ? { figure: { docId: s.docId, page: fig.page, box: fig.box } } : {}),
      };
    });
}

/** Korte regnespørsmål fra oppgavemalene (ett tallsvar), til quiz og utfordring i regnefag. */
export function templateNumeric(fam: FamilyKB, n: number): QuizItem[] {
  const out: QuizItem[] = [];
  const seen = new Set<string>();
  for (let round = 0; round < 3 && out.length < n; round++)
    for (const tpl of fam.templates.filter((t) => t.style === 'standard')) {
      if (out.length >= n) break;
      try {
        const t = generateOne(store.ui.activeCourseId ?? '', fam.id, tpl, Math.floor(Math.random() * 1e9));
        if (t.validation.status === 'forkastet') continue;
        const p = t.parts.find((x) => x.kind === 'beregning' && x.targets?.length === 1);
        if (!p) continue;
        const target = p.targets![0];
        const value = evaluate(target.value);
        if (value === null) continue;
        const question = `${t.intro ? `${t.intro} ` : ''}${p.prompt}`.trim();
        if (question.length > 420 || seen.has(question)) continue;
        seen.add(question);
        const tol = target.tolerance ? Math.abs(Number(target.tolerance)) || Math.abs(value) * 0.01 : Math.max(Math.abs(value) * 0.01, 0.005);
        out.push({ question, options: [], correct: -1, why: `${target.label} = ${formatAnswer(value, target.unit)}.`, source: 'mal', numeric: { value, unit: target.unit, tol } });
      } catch {
        /* hopp over */
      }
    }
  return out;
}

/** Leser et tallsvar som «1580», «1 580», «1580,5 kr», «2,5 mA» eller «4,7 kΩ». */
export function parseNumericAnswer(raw: string, unit?: string): number | null {
  const t = raw.replace(/\u00a0/g, ' ').trim().replace(/^(svar|ca\.?|≈)\s*[:=]?\s*/i, '');
  const m = /^(-?\d{1,3}(?:[ .]\d{3})+|-?\d+)(?:[,.](\d+))?\s*([GMkmµun]?)/.exec(t.replace(/−/g, '-'));
  if (!m) return null;
  const whole = m[1].replace(/[ .]/g, '');
  let v = Number(`${whole}${m[2] ? '.' + m[2] : ''}`);
  if (!Number.isFinite(v)) return null;
  const pre: Record<string, number> = { G: 1e9, M: 1e6, k: 1e3, m: 1e-3, µ: 1e-6, u: 1e-6, n: 1e-9 };
  // Prefiks bare når det står foran en SI-enhet (ikke «m» for meter i økonomi).
  if (m[3] && unit && /^(Ω|V|A|W|F|H|Hz|s|S)$/.test(unit)) v *= pre[m[3]] ?? 1;
  return v;
}

export function formatAnswer(v: number, unit?: string): string {
  if (unit && /^(Ω|V|A|W|F|H|Hz|s|S|J|C)$/.test(unit)) return eng(v, unit, 4).replace('.', ',');
  const r = Math.abs(v) >= 100 ? Math.round(v * 100) / 100 : Math.round(v * 10000) / 10000;
  return `${r.toLocaleString('nb-NO', { maximumFractionDigits: 4 }).replace(/\u00a0/g, ' ')}${unit ? (unit === '%' ? ' %' : ` ${unit}`) : ''}`;
}

/** Flervalg fra oppgavemalene (kontrollert fasit). */
export function templateMc(fam: FamilyKB, n: number): QuizItem[] {
  const out: QuizItem[] = [];
  const seen = new Set<string>();
  const tpls = fam.templates.filter((t) => t.style !== 'fading');
  for (let round = 0; round < 3 && out.length < n; round++)
  for (const tpl of tpls) {
    if (out.length >= n) break;
    try {
      const t = generateOne(store.ui.activeCourseId ?? '', fam.id, tpl, Math.floor(Math.random() * 1e9));
      if (t.validation.status === 'forkastet') continue;
      for (const p of t.parts) {
        if (p.kind !== 'flervalg' || !p.choices?.length || out.length >= n) continue;
        const correct = p.choices.findIndex((c) => c.correct);
        if (correct < 0) continue;
        const question = `${t.intro ? `${t.intro} ` : ''}${p.prompt}`.trim();
        if (seen.has(question)) continue;
        seen.add(question);
        out.push({ question, options: p.choices.map((c) => c.text), correct, why: p.choices[correct].why || 'Riktig.', source: 'mal' });
      }
    } catch {
      /* hopp over malen */
    }
  }
  return out;
}

/** Ordene et oppgavemønster kjenner igjen («inntektseffekt», «arbeidsfri inntekt» …), lesbart. */
function signalWords(re: RegExp[]): string[] {
  const out: string[] = [];
  for (const r of re)
    for (const alt of r.source.split('|')) {
      const w = alt
        .replace(/\\[bsdwSWD]/g, ' ')
        .replace(/\(\?:|\(|\)|\[[^\]]*\]|[?*+^$\\{}]|\d+,?\d*\}/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (w.length >= 4 && /^[a-zæøåA-ZÆØÅ][a-zæøåA-ZÆØÅ .\-]+$/.test(w) && !out.includes(w)) out.push(w);
    }
  return out.slice(0, 4);
}

export function kbLesson(kbId: string, prof = profile()): LessonRec {
  const fam = getFamily(kbId)!;
  // Essayfag (organisasjon og ledelse): begreper, modeller, eksempler og svarstruktur.
  if (isOrgTopic(kbId)) return { ...orgKbLesson(kbId, prof, topicQuestions(kbId), templateMc(fam, 7), lessonId(store.ui.activeCourseId ?? '', kbId)), version: LESSON_VERSION };
  const stat = topicStats().find((t) => t.kbId === kbId);
  const qs = topicQuestions(kbId);
  const cards: LessonCard[] = [];
  const short = familyShort(fam);
  const intents = fam.intents.filter((i) => i.assignment);
  const statLine = stat ? [relevanceText(stat), formatText(stat)].filter(Boolean).join('. ') : '';
  cards.push({
    type: 'intro',
    title: fam.name,
    body: `${statLine ? `{{1:${statLine}}}. ` : ''}${short.text}`,
    mascot: stat && stat.share >= 0.6 ? 'Dette er et av temaene som kommer oftest. Godt sted å starte.' : 'Vi tar bare det eksamen spør om.',
  });
  // Slik løses oppgavene i temaet, steg for steg (fra kunnskapsbasen).
  if (fam.solutionStructure.length >= 2) cards.push({ type: 'concept', title: 'Slik løser du denne typen oppgave', body: 'Nesten alle eksamensoppgavene i temaet følger denne rekkefølgen:', visual: { kind: 'flyt', items: fam.solutionStructure.slice(0, 6) } });
  const askedAs = intents.slice(0, 3).map((i) => i.label.toLowerCase());
  for (const f of fam.formulas.slice(0, 4)) {
    cards.push({
      type: 'formula',
      title: f.name,
      tex: f.tex,
      // «R_1, R_2» deles opp, så hver del kan farges i formelen.
      parts: f.symbols.flatMap((s) => s.sym.split(/\s*,\s*/).map((sym) => ({ tex: sym, meaning: `${s.meaning}${s.unit ? ` (${s.unit})` : ''}` }))).slice(0, 6),
      whenToUse: [askedAs.length ? `Brukes når oppgaven handler om ${askedAs.join(', ')}.` : '', f.conditions[0] ? `Forutsetning: ${f.conditions[0]}` : '', f.whatIf[0] ? `Hvis noe endres: ${f.whatIf[0]}` : ''].filter(Boolean).join(' '),
      formulaId: f.id,
    });
  }
  // Et kontrollspørsmål midt i: helst et ekte eksamensspørsmål om temaet.
  const pool = [...examMc(kbId, 5, { figures: true }), ...templateMc(fam, 3)];
  const firstCheck = pool.shift();
  if (firstCheck) cards.push({ type: 'check', question: firstCheck.question, options: firstCheck.options, correct: firstCheck.correct, why: firstCheck.why, figure: firstCheck.figure, mascot: firstCheck.source === 'eksamen' ? 'Dette er et ekte spørsmål fra eksamenene dine.' : undefined });
  const ex = genericExampleTask(fam);
  if (ex) {
    const p = ex.part;
    const ans = p.targets?.map((t) => `${t.label} = ${formatAnswer(evaluate(t.value) ?? Number(t.value), t.unit)}`).join(', ') || p.choices?.find((c) => c.correct)?.text || '';
    cards.push({ type: 'worked', title: 'Et eksempel steg for steg', problem: `${ex.task.intro ? ex.task.intro + ' ' : ''}${p.prompt}`, steps: p.solution.slice(0, 7).map((st) => ({ text: [st.text, st.why].filter(Boolean).join(' – '), tex: st.tex || undefined })), answer: ans ? `{{3:${ans}}}` : '' });
  }
  const ce = CALC_EXAMPLES[kbId];
  const cc = ce ? calcCard(ce[0], ce[1], prof.calculator) : null;
  if (cc) cards.push(cc);
  // Kjennetegn: hvilke ord i oppgaven som avslører typen, og hva du da skal gjøre.
  const pat = intents
    .map((i) => ({ i, words: signalWords(i.match) }))
    .filter((x) => x.words.length)
    .slice(0, 4);
  if (pat.length) cards.push({ type: 'patterns', title: 'Kjenn igjen spørsmålet', items: pat.map(({ i, words }) => ({ looksLike: `Står det ${words.map((w) => `«${w}»`).join(' eller ')}`, means: i.interpretation?.[0] ? `${i.assignment} ${i.interpretation[0]}` : i.assignment ?? '' })) });
  // Ekte spørsmål fra eksamenene, koblet til mønsteret de passer med.
  const real = qs
    .filter((q) => q.text.length > 25)
    .map((q) => ({ q, intent: intents.find((i) => i.match.some((r) => r.test(`${q.intro ?? ''} ${q.text}`))) }))
    .filter((x) => x.intent)
    .slice(0, 3);
  if (real.length) cards.push({ type: 'patterns', title: 'Fra eksamenene dine', items: real.map(({ q, intent }) => ({ looksLike: q.text.slice(0, 180) + (q.text.length > 180 ? ' …' : ''), means: `Dette er «${intent!.label.toLowerCase()}»: ${intent!.assignment}` })) });
  for (const m of fam.misconceptions.slice(0, 2)) cards.push({ type: 'trap', title: `Felle: ${m.label}`, body: m.explanation });
  if (fam.explanations?.analogy?.text) cards.push({ type: 'mnemonic', title: 'Husk det slik', body: fam.explanations.analogy.text });
  const quiz = pool.slice(0, 4);
  const now = nowIso();
  return {
    id: lessonId(store.ui.activeCourseId ?? '', kbId),
    kind: 'lesson',
    courseId: store.ui.activeCourseId ?? '',
    createdAt: now,
    updatedAt: now,
    kbId,
    style: prof.learnStyle,
    version: LESSON_VERSION,
    basis: 'kunnskapsbase',
    personalized: false,
    cards,
    quiz,
    checks: [{ name: 'Fra kunnskapsbasen', ok: true, detail: 'Fremgangsmåte, formler, eksempel, kjennetegn og feller fra appens kunnskapsbase for temaet. Kontrollspørsmålet og quizen bruker de ekte flervalgsspørsmålene dine (med fasit fra kilden) og kontrollerte maloppgaver.' }],
  };
}

function otherFamilyNames(fam: FamilyKB, n: number): string[] {
  const names = topicStats()
    .map((t) => t.fam.shortName)
    .filter((x) => x !== fam.shortName);
  return names.sort(() => Math.random() - 0.5).slice(0, n);
}

function shuffleWith<T>(a: T[]): T[] {
  return [...a].sort(() => Math.random() - 0.5);
}

// ——— AI: analyse ———

interface Analysis {
  examUse: string;
  mustKnow: string[];
  formulas: { tex: string; name: string; use: string; formulaId?: string }[];
  signals: { looksLike: string; means: string }[];
  traps: string[];
  skip: string[];
  calculations: { task: string; expression: string }[];
  order: string[];
}

const CALC_TEXT: Record<LearnerProfile['calculator'], string> = {
  enkel: 'en ENKEL kalkulator med bare + − × ÷ √ % = og minnetastene M+ M− MRC. Den har ingen parenteser og ingen potenstast, og regner fra venstre mot høyre (2 + 3 × 4 gir 20). Mellomsvar må legges i minnet eller skrives ned.',
  casio: 'en vitenskapelig Casio-kalkulator (fx-991) som har parenteser, brøk og potenser.',
  texas: 'en Texas-kalkulator med parenteser.',
};

function analysisPrompt(course: string, fam: FamilyKB, qs: SubTask[], statText: string, calc: LearnerProfile['calculator']): string {
  const formulas = fam.formulas.map((f) => `${f.id}: ${f.name}: ${f.tex}`).join('\n');
  return `${DATA_RULE}

Du er en erfaren foreleser og eksamensveileder i faget «${course}». En student som ikke er sterk i matte, skal lære temaet «${fam.name}» – men BARE det som trengs for å få poeng på eksamen. Ingen tid skal brukes på det eksamen ikke spør om.

Hyppighet: ${statText}
Temaet i kunnskapsbasen: ${fam.description}
Formler appen kjenner (id: navn: formel):
${formulas || '(ingen)'}
Typiske feil appen kjenner: ${fam.misconceptions.map((m) => m.label).join('; ') || '(ingen)'}
Studenten bruker ${CALC_TEXT[calc]}

Under er studentens egne eksamensspørsmål om temaet, med fasit og sensorveiledning eller løsning:
${qs.slice(0, 12).map((q, i) => asData(`SPØRSMÅL-${i + 1}`, questionText(q, i), 2400)).join('\n')}

Tenk grundig gjennom:
1) Hva spør eksamen faktisk om i dette temaet? Hvilke oppgavetyper, formuleringer og deler av eksamen?
2) Hvilke formler og sammenhenger trengs, og nøyaktig hvordan brukes de i disse spørsmålene?
3) Hvilke signalord i oppgaveteksten avslører hvilken formel eller metode som skal brukes?
4) Hvilke feller og feil fører til trekk (se sensorveiledningen og de gale flervalgsalternativene)?
5) Hva i temaet trengs IKKE til eksamen og skal hoppes over?
6) Hvilke utregninger må gjøres på kalkulatoren? Gi 1–3 typiske utregninger med konkrete tall i eksamensstil.
7) I hvilken rekkefølge bør en svak student lære dette?

Svar bare med JSON:
{"examUse":"2–3 setninger om hvordan temaet brukes på eksamen","mustKnow":["…"],"formulas":[{"tex":"LaTeX","name":"…","use":"når og hvordan den brukes på eksamen","formulaId":"id fra listen eller null"}],"signals":[{"looksLike":"slik står det i oppgaven","means":"det betyr at du skal …"}],"traps":["…"],"skip":["…"],"calculations":[{"task":"kort oppgave med tall","expression":"regneuttrykk med bare tall, + − · / ( ) √ ^"}],"order":["…"]}`;
}

function validateAnalysis(x: unknown): Analysis | string {
  const o = V.obj(x);
  if (!o) return 'mangler analyse';
  const formulas = V.arr(o.formulas)
    .map((f) => V.obj(f))
    .filter((f): f is Record<string, unknown> => !!f)
    .map((f) => ({ tex: V.str(f.tex, 300)?.trim() ?? '', name: V.str(f.name, 120)?.trim() ?? '', use: V.str(f.use, 400)?.trim() ?? '', formulaId: V.str(f.formulaId, 40) ?? undefined }))
    .filter((f) => f.tex || f.name)
    .slice(0, 6);
  const signals = V.arr(o.signals)
    .map((f) => V.obj(f))
    .filter((f): f is Record<string, unknown> => !!f)
    .map((f) => ({ looksLike: V.str(f.looksLike, 300)?.trim() ?? '', means: V.str(f.means, 300)?.trim() ?? '' }))
    .filter((f) => f.looksLike && f.means)
    .slice(0, 6);
  const calculations = V.arr(o.calculations)
    .map((f) => V.obj(f))
    .filter((f): f is Record<string, unknown> => !!f)
    .map((f) => ({ task: V.str(f.task, 400)?.trim() ?? '', expression: V.str(f.expression, 200)?.trim() ?? '' }))
    .filter((f) => f.task && f.expression && evaluate(f.expression) !== null)
    .slice(0, 3);
  const mustKnow = V.strs(o.mustKnow, 8, 300);
  if (!mustKnow.length && !formulas.length) return 'tom analyse';
  return { examUse: V.str(o.examUse, 600)?.trim() ?? '', mustKnow, formulas, signals, traps: V.strs(o.traps, 6, 300), skip: V.strs(o.skip, 6, 300), calculations, order: V.strs(o.order, 8, 200) };
}

// ——— AI: leksjon ———

const STYLE_TEXT: Record<LearnerProfile['learnStyle'], string> = {
  tekst: 'Studenten vil lære via kort tekst og steg-for-steg-forklaringer.',
  visuell: 'Studenten vil lære visuelt: bruk "visual" på konseptkortene (flyt = steg i en prosess med piler, sammenlign = to kolonner, utforsk = interaktiv figur med glidebrytere for en formel-id fra listen). Bruk få ord og mye struktur.',
  blanding: 'Bland korte tekster med visuelle kort ("visual": flyt, sammenlign eller utforsk) der det hjelper.',
};

function lessonPrompt(course: string, fam: FamilyKB, a: Analysis, prof: LearnerProfile, statText: string): string {
  const interests = prof.personalize ? [...prof.interests, prof.interestsNote ?? ''].map((x) => x.trim()).filter(Boolean).join(', ') : '';
  const ids = fam.formulas.map((f) => `${f.id} (${f.name})`).join(', ');
  return `${DATA_RULE}

Lag en kort, engasjerende leksjon for temaet «${fam.name}» i faget «${course}», ut fra analysen under. Målet er maksimal uttelling på eksamen for en student som ikke er sterk i matte. Bare det eksamen spør om.
Hyppighet: ${statText}
Analyse av studentens eksamensspørsmål:
${asData('ANALYSE', JSON.stringify(a), 7000)}

Regler (viktig: korte biter, tydelig struktur, tidlig mestring – studenten skal aldri lure på hva som er poenget):
- ${prof.focusMode ? '7–10 kort. Høyst 30 ord brødtekst per kort' : '9–14 kort. Høyst 45 ord brødtekst per kort'}. Én idé per kort. Konkret og vennlig, norsk bokmål, «du»-form.
- Fremhev nøkkelord med farger: {{1:…}} blå = størrelser/begreper, {{2:…}} oransje = det som endres, {{3:…}} grønn = svaret/konklusjonen, {{4:…}} lilla = regel å huske. Bruk dem sparsomt (2–4 per kort).
- Matematikk i tekst skrives som $…$ (LaTeX).
- Rekkefølge: intro (hvorfor dette gir poeng på eksamen) → 1–2 konseptkort med "visual" (flyt = fremgangsmåten steg for steg, sammenlign = to ting som ofte forveksles) → formelkort for hver formel som trengs (med "parts": hver del av formelen og hva den betyr; "whenToUse": hvilke ord i oppgaven som betyr at formelen skal brukes) → et gjennomregnet eksempel i eksamensstil → kalkulatorkort (bare hvis temaet har utregninger) → «slik kan spørsmålet se ut» (patterns: hvordan spørsmålet er formulert → hva du skal gjøre) → felle → huskeregel. Ikke lag et eget oppsummeringskort; appen viser oppsummeringen selv.
- Legg inn 2 kontrollspørsmål (type "check") underveis, med fire alternativer, ett riktig.
- Kalkulatorkort: oppgi bare "task" og "expression" (regneuttrykk med tall). Appen regner selv ut svaret og tastetrykkene for kalkulatoren.
- Gjennomregnet eksempel: samme type og vanskelighetsgrad som eksamen, med nye tall. Er temaet et teori-/tekstspørsmål uten tall, vis i stedet hvordan et fullt svar bygges opp (begrep → forklaring → eksempel/figur → konklusjon).
- "mascot": én kort, oppmuntrende eller forklarende setning fra tutorfiguren «${prof.mascotName}» (høyst 15 ord) på noen av kortene.
- ${STYLE_TEXT[prof.learnStyle]} Formel-id-er som finnes: ${ids || '(ingen)'}.
${interests ? `- Studenten er interessert i: ${asData('INTERESSER', interests, 400)} Bruk gjerne dette i eksemplene og bildene, men selve spørsmålstypen, tallnivået og fagbegrepene skal være som på eksamen.` : ''}
- Avslutt med en quiz på 4 flervalgsspørsmål i eksamensstil (fire alternativer, ett riktig, troverdige gale alternativer basert på typiske feil, kort forklaring).

Korttyper (JSON):
{"type":"intro","title":"…","body":"…","mascot":"…"}
{"type":"concept","title":"…","body":"…","visual":{"kind":"flyt","items":["…","…"]}}
{"type":"concept","title":"…","body":"…","visual":{"kind":"sammenlign","left":{"title":"…","items":["…"]},"right":{"title":"…","items":["…"]}}}
{"type":"concept","title":"…","body":"…","visual":{"kind":"utforsk","formulaId":"…"}}
{"type":"formula","title":"…","tex":"…","parts":[{"tex":"…","meaning":"…"}],"whenToUse":"…","formulaId":"… eller null"}
{"type":"worked","title":"…","problem":"…","steps":[{"text":"…","tex":"…"}],"answer":"…"}
{"type":"calculator","title":"…","task":"…","expression":"…"}
{"type":"patterns","title":"…","items":[{"looksLike":"…","means":"…"}]}
{"type":"trap","title":"…","body":"…"}
{"type":"mnemonic","title":"…","body":"…"}
{"type":"check","question":"…","options":["…","…","…","…"],"correct":0,"why":"…"}

Svar bare med JSON: {"cards":[…],"quiz":[{"question":"…","options":["…","…","…","…"],"correct":0,"why":"…"}]}`;
}

const TYPES = ['intro', 'concept', 'formula', 'worked', 'calculator', 'patterns', 'trap', 'mnemonic', 'check'];

function cleanVisual(x: unknown, formulaIds: string[]): LessonVisual | undefined {
  const o = V.obj(x);
  if (!o) return undefined;
  if (o.kind === 'flyt') {
    const items = V.strs(o.items, 6, 120);
    return items.length >= 2 ? { kind: 'flyt', items } : undefined;
  }
  if (o.kind === 'sammenlign') {
    const l = V.obj(o.left);
    const r = V.obj(o.right);
    if (!l || !r) return undefined;
    const left = { title: V.str(l.title, 80) ?? '', items: V.strs(l.items, 5, 140) };
    const right = { title: V.str(r.title, 80) ?? '', items: V.strs(r.items, 5, 140) };
    return left.items.length && right.items.length ? { kind: 'sammenlign', left, right } : undefined;
  }
  if (o.kind === 'utforsk') {
    const id = V.str(o.formulaId, 40) ?? '';
    return formulaIds.includes(id) ? { kind: 'utforsk', formulaId: id } : undefined;
  }
  return undefined;
}

function cleanMc(o: Record<string, unknown>): { question: string; options: string[]; correct: number; why: string } | null {
  const question = V.str(o.question, 700)?.trim() ?? '';
  const options = V.strs(o.options, 4, 300).map((s) => s.replace(/^[A-Da-d][).]\s*/, '').trim());
  const correct = V.num(o.correct);
  if (question.length < 8 || options.length < 3 || new Set(options.map((s) => s.toLowerCase())).size !== options.length) return null;
  if (correct === null || !Number.isInteger(correct) || correct < 0 || correct >= options.length) return null;
  // Språkmodeller legger svært ofte riktig svar først. Stokk, men behold «Alle/Ingen av de over» sist.
  const fixedLast = (t: string) => /\b(alle|ingen) av (de|alternativene)/i.test(t);
  const idx = options.map((_, i) => i);
  const movable = shuffleWith(idx.filter((i) => !fixedLast(options[i])));
  const order = [...movable, ...idx.filter((i) => fixedLast(options[i]))];
  return { question, options: order.map((i) => options[i]), correct: order.indexOf(correct), why: (V.str(o.why, 500)?.trim() ?? '').replace(/\b(alternativ|svar) [A-D]\b/gi, 'det riktige alternativet') };
}

export function validateLesson(x: unknown, fam: FamilyKB, calculator: LearnerProfile['calculator']): { cards: LessonCard[]; quiz: QuizItem[] } | string {
  const o = V.obj(x);
  if (!o) return 'mangler leksjon';
  const formulaIds = fam.formulas.map((f) => f.id);
  const cards: LessonCard[] = [];
  for (const raw of V.arr(o.cards)) {
    const c = V.obj(raw);
    if (!c || !TYPES.includes(String(c.type))) continue;
    const title = V.str(c.title, 120)?.trim() ?? '';
    const body = V.str(c.body, 700)?.trim() ?? '';
    const mascot = V.str(c.mascot, 160)?.trim() || undefined;
    switch (c.type) {
      case 'intro':
      case 'trap':
      case 'mnemonic':
        if (body) cards.push({ type: c.type, title: title || (c.type === 'trap' ? 'Felle' : c.type === 'mnemonic' ? 'Husk det slik' : fam.name), body, mascot });
        break;
      case 'concept':
        if (body || c.visual) cards.push({ type: 'concept', title, body, visual: cleanVisual(c.visual, formulaIds), mascot });
        break;
      case 'formula': {
        const tex = V.str(c.tex, 300)?.trim() ?? '';
        if (!tex) break;
        const parts = V.arr(c.parts)
          .map((p) => V.obj(p))
          .filter((p): p is Record<string, unknown> => !!p)
          .map((p) => ({ tex: V.str(p.tex, 80)?.trim() ?? '', meaning: V.str(p.meaning, 200)?.trim() ?? '' }))
          .filter((p) => p.tex && p.meaning)
          .slice(0, 6);
        const fid = V.str(c.formulaId, 40) ?? undefined;
        cards.push({ type: 'formula', title: title || 'Formelen', tex, parts, whenToUse: V.str(c.whenToUse, 500)?.trim() ?? '', formulaId: fid && formulaIds.includes(fid) ? fid : undefined, mascot });
        break;
      }
      case 'worked': {
        const steps = V.arr(c.steps)
          .map((p) => V.obj(p))
          .filter((p): p is Record<string, unknown> => !!p)
          .map((p) => ({ text: V.str(p.text, 400)?.trim() ?? '', tex: V.str(p.tex, 300)?.trim() || undefined }))
          .filter((p) => p.text || p.tex)
          .slice(0, 8);
        const problem = V.str(c.problem, 900)?.trim() ?? '';
        if (problem && steps.length) cards.push({ type: 'worked', title: title || 'Eksempel', problem, steps, answer: V.str(c.answer, 300)?.trim() ?? '', mascot });
        break;
      }
      case 'calculator': {
        const task = V.str(c.task, 500)?.trim() ?? '';
        const expression = V.str(c.expression, 200)?.trim() ?? '';
        const card = task && expression ? calcCard(task, expression, calculator) : null;
        if (card && card.type === 'calculator') cards.push({ ...card, title: title || card.title, mascot });
        break;
      }
      case 'patterns': {
        const items = V.arr(c.items)
          .map((p) => V.obj(p))
          .filter((p): p is Record<string, unknown> => !!p)
          .map((p) => ({ looksLike: V.str(p.looksLike, 300)?.trim() ?? '', means: V.str(p.means, 300)?.trim() ?? '' }))
          .filter((p) => p.looksLike && p.means)
          .slice(0, 5);
        if (items.length) cards.push({ type: 'patterns', title: title || 'Slik kan spørsmålet se ut', items, mascot });
        break;
      }
      case 'check': {
        const m = cleanMc(c);
        if (m) cards.push({ type: 'check', ...m, mascot });
        break;
      }
    }
  }
  const quiz: QuizItem[] = V.arr(o.quiz)
    .map((q) => V.obj(q))
    .filter((q): q is Record<string, unknown> => !!q)
    .map((q) => cleanMc(q))
    .filter((q): q is NonNullable<typeof q> => !!q)
    .slice(0, 6)
    .map((q) => ({ ...q, source: 'ai' as const }));
  if (cards.length < 5) return 'for få gyldige kort';
  if (!cards.some((c) => c.type === 'formula' || c.type === 'worked' || c.type === 'concept')) return 'mangler innhold';
  return { cards: cards.slice(0, 18), quiz };
}

/** Uavhengig kontroll: løser kontrollspørsmål og quiz uten fasit. Returnerer hvilke som stemmer. */
async function verifyMcBatch(course: string, items: { question: string; options: string[]; correct: number }[]): Promise<boolean[] | null> {
  if (!items.length) return [];
  const L = 'ABCD';
  const prompt = `${DATA_RULE}
Du er sensor i «${course}». Løs hvert flervalgsspørsmål selvstendig etter standard pensum. Avgjør også om nøyaktig ett alternativ er riktig.
${asData('SPØRSMÅL', items.map((q, i) => `${i + 1}. ${q.question}\n${q.options.map((o, j) => `   ${L[j]}) ${o}`).join('\n')}`).join('\n\n'), 12000)}
Svar bare med JSON: {"answers":[{"n":1,"answer":"A","exactlyOne":true}]}`;
  const r = await aiJson(prompt, (x) => {
    const o = V.obj(x);
    const list = V.arr(o?.answers).map((a) => V.obj(a)).filter((a): a is Record<string, unknown> => !!a);
    if (!list.length) return 'mangler svar';
    return list.map((a) => ({ n: V.num(a.n) ?? 0, answer: L.indexOf((V.str(a.answer, 3) ?? '').trim().toUpperCase().charAt(0)), one: a.exactlyOne !== false }));
  }, { tier: 'default', cache: false });
  if (!r.ok) return null;
  return items.map((q, i) => {
    const a = r.data.find((x) => x.n === i + 1);
    return !!a && a.one && a.answer === q.correct;
  });
}

// ——— Hent eller lag ———

const inflight = new Map<string, Promise<{ lesson: LessonRec; note?: string }>>();
/** Når AI nettopp feilet for et tema, prøver vi ikke igjen ved hvert besøk (sparer tid og kvote). */
const failedAt = new Map<string, { at: number; note: string }>();
const RETRY_MS = 10 * 60_000;

/**
 * Leksjonen for et tema. Lagret leksjon brukes om den finnes; ellers lages den
 * med AI (når tilgjengelig) eller fra kunnskapsbasen.
 */
export function getLesson(kbId: string, opts: { regenerate?: boolean; onProgress?: (note: string) => void } = {}): Promise<{ lesson: LessonRec; note?: string }> {
  const prof = profile();
  const key = lessonId(store.ui.activeCourseId ?? '', kbId);
  if (!opts.regenerate) {
    const c = cachedLesson(kbId);
    if (c) return Promise.resolve({ lesson: c });
    const cur = inflight.get(key);
    if (cur) return cur;
    const f = failedAt.get(key);
    const course = store.course();
    if (f && Date.now() - f.at < RETRY_MS && course) return Promise.resolve({ lesson: kbLesson(kbId, { ...prof, calculator: calculatorFor(course.id) }), note: f.note });
  }
  const p = buildLesson(kbId, prof, opts.onProgress)
    .then((r) => {
      if (r.lesson.basis === 'ai') failedAt.delete(key);
      else if (r.note) failedAt.set(key, { at: Date.now(), note: r.note });
      return r;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function buildLesson(kbId: string, prof: LearnerProfile, onProgress?: (n: string) => void): Promise<{ lesson: LessonRec; note?: string }> {
  const fam = getFamily(kbId);
  const course = store.course();
  if (!fam || !course) throw new Error('Fant ikke temaet.');
  const calculator = calculatorFor(course.id);
  const fallback = () => ({ ...kbLesson(kbId, { ...prof, calculator }) });
  if (!aiAvailable()) return { lesson: fallback() };
  if (isOrgTopic(kbId)) return buildOrgLesson(kbId, prof, fallback, onProgress);
  const stat = topicStats().find((t) => t.kbId === kbId);
  const statText = stat ? `${relevanceText(stat)}. ${formatText(stat)}.` : 'ukjent';
  const qs = sampleQuestions(kbId, 12);
  // Analysen gjenbrukes når leksjonen lages på nytt (den avhenger bare av eksamenene, ikke av stil eller interesser).
  const old = store.get<LessonRec>('lesson', lessonId(course.id, kbId));
  const reused = old?.analysis ? validateAnalysis(old.analysis) : null;
  let analysis: Analysis;
  if (reused && typeof reused !== 'string') analysis = reused;
  else {
    onProgress?.(`${prof.mascotName} leser ${qs.length} eksamensspørsmål om temaet …`);
    const an = await aiJson(analysisPrompt(course.name, fam, qs, statText, calculator), validateAnalysis, { tier: 'complex', cache: false });
    if (!an.ok) return { lesson: fallback(), note: `Leksjonen er laget fra kunnskapsbasen fordi AI-analysen ikke lyktes (${an.message}).` };
    analysis = an.data;
  }
  const an = { data: analysis };
  onProgress?.(`${prof.mascotName} skriver leksjonen …`);
  let built: { cards: LessonCard[]; quiz: QuizItem[] } | null = null;
  let lastErr = '';
  for (let i = 0; i < 2 && !built; i++) {
    const r = await aiJson(lessonPrompt(course.name, fam, an.data, { ...prof, calculator }, statText), (x) => validateLesson(x, fam, calculator), { tier: 'complex', cache: false });
    if (r.ok) built = r.data;
    else {
      lastErr = r.message;
      if (r.code !== 'validation') break;
    }
  }
  if (!built) return { lesson: fallback(), note: `Leksjonen er laget fra kunnskapsbasen fordi AI ikke ga en gyldig leksjon (${lastErr}).` };
  // Kalkulatorkort fra analysen hvis leksjonen mangler dem.
  if (!built.cards.some((c) => c.type === 'calculator'))
    for (const c of an.data.calculations.slice(0, 1)) {
      const card = calcCard(c.task, c.expression, calculator);
      if (card) built.cards.splice(Math.min(built.cards.length, 5), 0, card);
    }
  onProgress?.(`${prof.mascotName} dobbeltsjekker svarene …`);
  const checkIdx = built.cards.map((c, i) => (c.type === 'check' ? i : -1)).filter((i) => i >= 0);
  const items = [...checkIdx.map((i) => built!.cards[i] as Extract<LessonCard, { type: 'check' }>), ...built.quiz];
  const ok = await verifyMcBatch(course.name, items);
  const checks: LessonRec['checks'] = [
    { name: 'Bygget på eksamenene dine', ok: true, detail: `Analysen leste ${qs.length} eksamensspørsmål om temaet (spredt over flervalg, kortsvar, langsvar og regneoppgaver) med fasit og sensorveiledning der den fantes.` },
    { name: 'Utregninger regnet på nytt', ok: true, detail: 'Tall og tastetrykk i kalkulatorkortene er regnet ut av appen og kjørt i en simulert kalkulator.' },
  ];
  if (ok) {
    const badChecks = new Set(checkIdx.filter((_, j) => !ok[j]));
    const cards = built.cards.filter((_, i) => !badChecks.has(i));
    const quiz = built.quiz.filter((_, j) => ok[checkIdx.length + j]);
    const removed = badChecks.size + (built.quiz.length - quiz.length);
    checks.push({ name: 'Fasit kontrollert', ok: true, detail: removed ? `${removed} spørsmål ble fjernet fordi en uavhengig kontroll kom til et annet svar.` : 'En uavhengig kontroll løste alle spørsmålene uten fasit og kom til samme svar.' });
    built = { cards, quiz };
  } else checks.push({ name: 'Fasit kontrollert', ok: false, detail: 'Kontrollen kunne ikke kjøres nå. Spørsmålene er laget av AI og ikke dobbeltsjekket.' });
  // Fyll opp quizen med ekte eksamensspørsmål om temaet.
  const quiz = [...built.quiz, ...examMc(kbId, 2, { figures: true })].slice(0, 5);
  if (quiz.length < 3) quiz.push(...templateMc(fam, 3 - quiz.length));
  const now = nowIso();
  const lesson: LessonRec = {
    id: lessonId(course.id, kbId),
    kind: 'lesson',
    courseId: course.id,
    createdAt: now,
    updatedAt: now,
    kbId,
    style: prof.learnStyle,
    version: LESSON_VERSION,
    basis: 'ai',
    personalized: prof.personalize && (prof.interests.length > 0 || !!prof.interestsNote?.trim()),
    plan: { mustKnow: an.data.mustKnow, skip: an.data.skip, examUse: an.data.examUse },
    analysis: an.data,
    cards: built.cards,
    quiz,
    checks,
  };
  store.upsert(lesson);
  return { lesson };
}

/** Essayfag: kunnskapsbase-leksjonen pluss egne eksempler og en svarskisse fra AI (kontrollert). */
async function buildOrgLesson(kbId: string, prof: LearnerProfile, fallback: () => LessonRec, onProgress?: (n: string) => void): Promise<{ lesson: LessonRec; note?: string }> {
  const course = store.course()!;
  const qs = topicQuestions(kbId);
  const base = fallback();
  onProgress?.(`${prof.mascotName} skriver eksempler fra arbeidslivet …`);
  const r = await orgEnrich(course.name, kbId, qs, prof);
  if (!r.ok) return { lesson: base, note: `Leksjonen er laget fra kunnskapsbasen fordi AI ikke ga gyldige eksempler (${r.message}).` };
  onProgress?.(`${prof.mascotName} dobbeltsjekker spørsmålene …`);
  const ok = r.data.checks.length ? await verifyMcBatch(course.name, r.data.checks) : [];
  const { cards, extraQuiz } = mergeEnrich(base.cards, r.data, ok ?? r.data.checks.map(() => false));
  const now = nowIso();
  const lesson: LessonRec = {
    ...base,
    createdAt: now,
    updatedAt: now,
    basis: 'ai',
    personalized: prof.personalize && (prof.interests.length > 0 || !!prof.interestsNote?.trim()),
    cards,
    quiz: [...extraQuiz, ...base.quiz].slice(0, 5),
    checks: [
      ...base.checks,
      { name: 'Eksempler og svarskisse fra AI', ok: true, detail: `${r.data.examples.length} eksempler fra arbeidslivet${r.data.sketch ? ' og en svarskisse' : ''} er skrevet av AI ut fra kunnskapsbasen. Hvert eksempel er koblet til et begrep som finnes i kunnskapsbasen.` },
      ok ? { name: 'Fasit kontrollert', ok: true, detail: `${extraQuiz.length} av ${r.data.checks.length} AI-spørsmål ble bekreftet av en uavhengig kontroll; resten er fjernet.` } : { name: 'Fasit kontrollert', ok: false, detail: 'Kontrollen kunne ikke kjøres nå, så AI-spørsmålene er tatt ut. Quizen bruker kontrollerte maloppgaver.' },
    ],
  };
  store.upsert(lesson);
  return { lesson };
}

/** Lager neste leksjon i bakgrunnen, så den er klar når du kommer dit. */
export function prefetchLesson(kbId: string) {
  if (!aiAvailable() || cachedLesson(kbId)) return;
  void getLesson(kbId).catch(() => undefined);
}

export function lessonSkillsText(kbId: string): string {
  const fam = getFamily(kbId);
  return (fam?.skills ?? []).slice(0, 4).map(skillName).join(', ');
}
