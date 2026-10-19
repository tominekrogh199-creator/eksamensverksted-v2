// Lær for organisasjonsatferd og ledelse (essayfag). Leksjonen bygges fra
// kunnskapsbasen: hvordan temaet er spurt om på eksamenene dine, begrepene
// (snu kortet), modellene som figurer, situasjoner fra arbeidslivet,
// svarstruktur for et 36-minutters essay, feller og huskeregel.
// Med AI skrives i tillegg egne eksempler fra arbeidslivet (tilpasset
// interessene dine når det er slått på) og en svarskisse for spørsmålet som
// er spurt oftest. Kontrollspørsmålene fra AI dobbeltsjekkes før de vises.

import type { LessonCard, LessonRec, QuizItem, SubTask, LearnerProfile } from '../domain/types';
import { nowIso } from '../domain/types';
import { store } from '../state/store';
import { getFamily, type FamilyKB } from '../families';
import { ORG_TOPIC_MAP, ORG_MODEL_MAP, ESSAY_MINUTES } from '../families/org';
import type { OrgIntent, OrgTopic } from '../families/org/types';
import { aiJson, asData, DATA_RULE, V } from '../ai/client';
import { topicStats, relevanceText, formatText } from './path';

export function isOrgTopic(kbId: string): boolean {
  return !!ORG_TOPIC_MAP[kbId];
}

/** Hvilken intensjon (spørsmålstype) hvert eksamensspørsmål om temaet passer med. */
export function questionsByIntent(t: OrgTopic, qs: SubTask[]): { q: SubTask; intent: OrgIntent }[] {
  const out: { q: SubTask; intent: OrgIntent }[] = [];
  const seen = new Set<string>();
  for (const q of qs) {
    const text = `${q.intro ?? ''} ${q.text}`;
    const key = text.toLowerCase().replace(/[^a-zæøå]/g, '').slice(0, 90);
    if (seen.has(key) || q.text.length < 15) continue;
    seen.add(key);
    const specific = t.intents.filter((i) => i.specific && i.match.some((r) => r.test(text)));
    const intent = specific[0] ?? t.intents.find((i) => i.match.some((r) => r.test(text))) ?? t.intents[0];
    if (intent) out.push({ q, intent });
  }
  return out;
}

/** Intensjonene sortert etter hvor ofte de er spurt om (mest først). */
export function intentsByFrequency(t: OrgTopic, qs: SubTask[]): OrgIntent[] {
  const n = new Map<string, number>();
  for (const x of questionsByIntent(t, qs)) n.set(x.intent.id, (n.get(x.intent.id) ?? 0) + 1);
  return [...t.intents].sort((a, b) => (n.get(b.id) ?? 0) - (n.get(a.id) ?? 0));
}

function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

export function orgKbCards(kbId: string, qs: SubTask[], mcs: QuizItem[]): { cards: LessonCard[]; quiz: QuizItem[] } {
  const t = ORG_TOPIC_MAP[kbId];
  const fam = getFamily(kbId) as FamilyKB;
  const stat = topicStats().find((s) => s.kbId === kbId);
  const statLine = stat ? [relevanceText(stat), formatText(stat)].filter(Boolean).join('. ') : '';
  const cards: LessonCard[] = [];
  const asked = questionsByIntent(t, qs);
  cards.push({
    type: 'intro',
    title: t.name,
    body: `${statLine ? `{{1:${statLine}}}. ` : ''}${t.description} På eksamen er det fem likeverdige spørsmål på tre timer, så du har {{4:omtrent ${ESSAY_MINUTES} minutter}} per spørsmål.`,
    mascot: stat && stat.share >= 0.5 ? 'Dette temaet kommer ofte. Lær begrepene først, så modellen.' : 'Vi tar det sensor ser etter: begreper, modell, eksempel og drøfting.',
  });
  if (asked.length)
    cards.push({
      type: 'patterns',
      title: 'Slik er det spurt om på eksamenene dine',
      items: asked.slice(0, 4).map(({ q, intent }) => ({ looksLike: q.text.length > 220 ? `${q.text.slice(0, 217)} …` : q.text, means: intent.assignment })),
      mascot: asked.length > 1 ? 'Samme tema, litt ulik vinkling. Legg merke til hva som faktisk spørres om.' : undefined,
    });
  // Begrepene: snu kortet. Hovedbegrepet først.
  const concepts = t.concepts.slice(0, 12);
  chunk(concepts, 6).forEach((part, i) =>
    cards.push({
      type: 'terms',
      title: i === 0 ? 'Begrepene du må kunne' : 'Flere begreper i temaet',
      items: part.map((c) => ({ term: c.term, definition: `${c.definition}${c.author ? ` (${c.author})` : ''}`, example: c.example })),
      mascot: i === 0 ? 'Si definisjonen høyt før du snur kortet.' : undefined,
    }),
  );
  const checks = [...mcs];
  const c1 = checks.shift();
  if (c1) cards.push({ type: 'check', question: c1.question, options: c1.options, correct: c1.correct, why: c1.why });
  // Modellene som figurer.
  for (const id of t.models.slice(0, 3)) {
    const m = ORG_MODEL_MAP[id];
    if (!m) continue;
    cards.push({ type: 'concept', title: m.name, body: `${m.summary} {{4:På eksamen:}} ${m.examUse}`, visual: { kind: 'modell', modelId: m.id } });
  }
  // Situasjoner fra arbeidslivet.
  const withEx = t.concepts.filter((c) => c.example);
  for (const c of [withEx[1], withEx[3]].filter(Boolean).slice(0, 2))
    cards.push({ type: 'case', title: 'Slik ser det ut på jobben', situation: c!.example, concept: c!.term, explanation: c!.definition });
  const c2 = checks.shift();
  if (c2) cards.push({ type: 'check', question: c2.question, options: c2.options, correct: c2.correct, why: c2.why });
  // Svarstrukturen for spørsmålet som er spurt oftest (og for et til, hvis det også er spurt).
  const freq = intentsByFrequency(t, qs);
  const askedIds = new Set(asked.map((x) => x.intent.id));
  const outlined = freq.filter((it, i) => i === 0 || askedIds.has(it.id)).slice(0, 2);
  for (const it of outlined) {
    const q = asked.find((x) => x.intent.id === it.id)?.q;
    cards.push({
      type: 'outline',
      title: outlined.length > 1 ? `Slik bygger du svaret: ${it.label.toLowerCase()}` : 'Slik bygger du svaret',
      question: q ? q.text : undefined,
      items: it.outline,
      points: it.keyPoints,
      minutes: it.estMinutes || ESSAY_MINUTES,
      mascot: 'Definer først. Sensor gir uttelling for begreper i tråd med pensum.',
    });
  }
  for (const tr of t.traps.slice(0, 2)) cards.push({ type: 'trap', title: `Felle: ${tr.label}`, body: tr.explanation });
  if (t.mnemonic) cards.push({ type: 'mnemonic', title: 'Husk det slik', body: t.mnemonic });
  else if (fam?.solutionStructure.length) cards.push({ type: 'mnemonic', title: 'Huskeliste for svaret', body: fam.solutionStructure.join(' → ') });
  return { cards, quiz: checks.slice(0, 5) };
}

export function orgKbLesson(kbId: string, prof: LearnerProfile, qs: SubTask[], mcs: QuizItem[], id: string): LessonRec {
  const { cards, quiz } = orgKbCards(kbId, qs, mcs);
  const now = nowIso();
  return {
    id,
    kind: 'lesson',
    courseId: store.ui.activeCourseId ?? '',
    createdAt: now,
    updatedAt: now,
    kbId,
    style: prof.learnStyle,
    version: 0,
    basis: 'kunnskapsbase',
    personalized: false,
    cards,
    quiz,
    checks: [
      { name: 'Fra kunnskapsbasen', ok: true, detail: 'Begreper, modeller, eksempler, svarstruktur og feller er skrevet av appen ut fra fagstoffet. Sjekk ordlyden i definisjonene mot pensum.' },
      { name: 'Bygget på eksamenene dine', ok: qs.length > 0, detail: qs.length ? `${qs.length} eksamensspørsmål om temaet er brukt til å vise hvordan det spørres og hvilken svarstruktur som trengs.` : 'Ingen eksamensspørsmål om temaet ennå; leksjonen viser hele temaet.' },
    ],
  };
}

// ——— AI: egne eksempler og svarskisse ———

export interface OrgEnrich {
  examples: { situation: string; concept: string; explanation: string }[];
  sketch?: { question: string; parts: { del: string; tekst: string }[] };
  checks: { question: string; options: string[]; correct: number; why: string }[];
}

export function orgEnrichPrompt(course: string, t: OrgTopic, qs: SubTask[], prof: LearnerProfile): string {
  const interests = prof.personalize ? [...prof.interests, prof.interestsNote ?? ''].map((x) => x.trim()).filter(Boolean).join(', ') : '';
  const asked = questionsByIntent(t, qs).slice(0, 6);
  const kb = [
    `Tema: ${t.name}. ${t.description}`,
    `Begreper (bruk disse navnene og definisjonene): ${t.concepts.map((c) => `${c.term}: ${c.definition}`).join(' | ')}`,
    `Modeller: ${t.models.map((id) => ORG_MODEL_MAP[id]).filter(Boolean).map((m) => `${m!.name} (${m!.author}): ${m!.parts.map((p) => p.label).join(', ')}`).join(' | ')}`,
    `Svarstruktur: ${t.structure.join(' → ')}`,
  ].join('\n');
  return `${DATA_RULE}

Du er en erfaren foreleser i «${course}» (organisasjonsatferd og ledelse). Eksamen er fem likeverdige essayspørsmål på tre timer uten hjelpemidler. Sensor gir uttelling for begreper definert i tråd med pensum, relevante modeller med forfatternavn, forskning, gode eksempler og drøfting.

Kunnskapsbasen for temaet (appens egne formuleringer):
${asData('KUNNSKAPSBASE', kb, 6000)}

Studentens eksamensspørsmål om temaet (med sensorveiledningens pensumhenvisning der den finnes):
${asked.length ? asked.map(({ q }, i) => asData(`SPØRSMÅL-${i + 1}`, `${q.text}${q.guide?.text ? `\nVeiledning: ${q.guide.text.slice(0, 600)}` : ''}`, 1600)).join('\n') : '(ingen ennå)'}

Lag:
1) "examples": 3 korte, realistiske situasjoner fra arbeidslivet (butikk, sykehus, kontor, barnehage, bedrift, frivillighet${interests ? '' : ', studiehverdag'}). Hver situasjon er 2–4 setninger og skal IKKE nevne begrepet. "concept" er NØYAKTIG ett av begrepsnavnene i kunnskapsbasen. "explanation" er 1–2 setninger om hvilke trekk i situasjonen som viser begrepet.
${interests ? `   Studenten er interessert i: ${asData('INTERESSER', interests, 400)} Bruk gjerne dette i én eller to av situasjonene.` : ''}
2) "sketch": en svarskisse for det spørsmålet som er spurt oftest (eller et typisk spørsmål om temaet hvis ingen er gitt): 5–6 deler (Innledning, Definisjon, Teori/modell, Eksempel, Forskning og drøfting, Avslutning), hver 1–3 setninger med det som faktisk skal stå der. Bruk navnene på teoretikerne fra kunnskapsbasen. Ikke dikt opp sidetall eller kapittelnumre.
3) "checks": 2 flervalgsspørsmål som tester forståelse (ikke pugg av ordlyd), fire alternativer, ett riktig, troverdige gale alternativer, kort forklaring.
Norsk bokmål.

Svar bare med JSON: {"examples":[{"situation":"…","concept":"…","explanation":"…"}],"sketch":{"question":"…","parts":[{"del":"…","tekst":"…"}]},"checks":[{"question":"…","options":["…","…","…","…"],"correct":0,"why":"…"}]}`;
}

export function validateOrgEnrich(x: unknown, t: OrgTopic): OrgEnrich | string {
  const o = V.obj(x);
  if (!o) return 'mangler svar';
  const names = new Map<string, string>();
  for (const c of t.concepts) {
    names.set(c.term.toLowerCase(), c.term);
    for (const a of c.aka ?? []) names.set(a.toLowerCase(), c.term);
  }
  const examples = V.arr(o.examples)
    .map((e) => V.obj(e))
    .filter((e): e is Record<string, unknown> => !!e)
    .map((e) => ({ situation: V.str(e.situation, 700)?.trim() ?? '', concept: names.get((V.str(e.concept, 120) ?? '').trim().toLowerCase()) ?? '', explanation: V.str(e.explanation, 500)?.trim() ?? '' }))
    // Begrepet må finnes i kunnskapsbasen, og situasjonen skal ikke avsløre det.
    .filter((e) => e.situation.length > 40 && e.concept && e.explanation && !e.situation.toLowerCase().includes(e.concept.toLowerCase()))
    .slice(0, 3);
  const sk = V.obj(o.sketch);
  const parts = V.arr(sk?.parts)
    .map((p) => V.obj(p))
    .filter((p): p is Record<string, unknown> => !!p)
    .map((p) => ({ del: V.str(p.del, 60)?.trim() ?? '', tekst: V.str(p.tekst, 700)?.trim() ?? '' }))
    .filter((p) => p.del && p.tekst.length > 20)
    .slice(0, 7);
  const sketch = parts.length >= 4 ? { question: V.str(sk?.question, 500)?.trim() ?? '', parts } : undefined;
  const checks = V.arr(o.checks)
    .map((c) => V.obj(c))
    .filter((c): c is Record<string, unknown> => !!c)
    .map((c) => ({ question: V.str(c.question, 600)?.trim() ?? '', options: V.strs(c.options, 4, 300).map((s) => s.replace(/^[A-Da-d][).]\s*/, '').trim()), correct: V.num(c.correct) ?? -1, why: V.str(c.why, 500)?.trim() ?? '' }))
    .filter((c) => c.question.length > 10 && c.options.length === 4 && new Set(c.options.map((s) => s.toLowerCase())).size === 4 && Number.isInteger(c.correct) && c.correct >= 0 && c.correct < 4)
    .slice(0, 2);
  if (!examples.length && !sketch) return 'verken eksempler eller svarskisse';
  return { examples, sketch, checks };
}

/** Setter AI-innholdet inn i kunnskapsbase-leksjonen: egne eksempler etter modellene, svarskissen etter svarstrukturen. */
export function mergeEnrich(cards: LessonCard[], e: OrgEnrich, checksOk: boolean[]): { cards: LessonCard[]; extraQuiz: QuizItem[] } {
  const out = cards.filter((c) => c.type !== 'case' || !e.examples.length);
  const caseCards: LessonCard[] = e.examples.map((x) => ({ type: 'case', title: 'Slik ser det ut på jobben', situation: x.situation, concept: x.concept, explanation: x.explanation }));
  const afterModels = Math.max(
    out.map((c, i) => (c.type === 'concept' && c.visual?.kind === 'modell' ? i : -1)).reduce((a, b) => Math.max(a, b), -1) + 1,
    out.findIndex((c) => c.type === 'terms') + 1,
  );
  out.splice(afterModels, 0, ...caseCards);
  if (e.sketch) {
    const at = out.map((c, i) => (c.type === 'outline' ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    const sketchCard: LessonCard = { type: 'outline', title: 'Eksempel på et godt svar (skisse)', question: e.sketch.question || undefined, items: e.sketch.parts, minutes: ESSAY_MINUTES, mascot: 'Bruk skissen som mønster, ikke som fasit. Skriv med egne ord.' };
    out.splice(at >= 0 ? at + 1 : out.length, 0, sketchCard);
  }
  const extraQuiz: QuizItem[] = e.checks.filter((_, i) => checksOk[i]).map((c) => ({ ...c, source: 'ai' as const }));
  return { cards: out, extraQuiz };
}

export async function orgEnrich(course: string, kbId: string, qs: SubTask[], prof: LearnerProfile) {
  const t = ORG_TOPIC_MAP[kbId];
  return aiJson(orgEnrichPrompt(course, t, qs, prof), (x) => validateOrgEnrich(x, t), { tier: 'complex', cache: false });
}
