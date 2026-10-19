// Flashcards for begrepsfag (organisasjonsatferd og ledelse). Tre korttyper:
//  - begrep → definisjon
//  - eksempel fra arbeidslivet → hvilket begrep
//  - modell → delene
// Repetisjon med Leitner-bokser: kort du kan, kommer sjeldnere; kort du ikke
// kan, kommer tilbake samme økt og neste dag. Fremgangen lagres per fag.
// Pensumhenvisningene hentes fra sensorveiledningene i faget (ikke fra appen).

import type { FlashCardState, FlashRec, SourceDoc, SubTask } from '../domain/types';
import { nowIso } from '../domain/types';
import { store } from '../state/store';
import { ORG_CONCEPTS, ORG_CONCEPT_MAP, ORG_MODELS, ORG_MODEL_MAP, ORG_TOPICS, ORG_TOPIC_MAP, modelParts, partName } from '../families/org';
import type { OrgConcept, OrgModel, OrgTopic } from '../families/org/types';

export type CardType = 'begrep' | 'eksempel' | 'modell';
export const CARD_TYPES: { id: CardType; label: string; hint: string }[] = [
  { id: 'begrep', label: 'Begrep → definisjon', hint: 'Du ser begrepet. Forklar det med egne ord før du snur kortet.' },
  { id: 'eksempel', label: 'Eksempel → begrep', hint: 'Du ser en situasjon fra en arbeidsplass. Hvilket begrep fra pensum passer?' },
  { id: 'modell', label: 'Modell → delene', hint: 'Du ser navnet på en modell. Hvilke deler har den?' },
];

export interface Card {
  id: string;
  type: CardType;
  topic: OrgTopic;
  concept?: OrgConcept;
  model?: OrgModel;
}

/** Dager til neste repetisjon for hver boks (boks 1 = samme dag). */
export const BOX_DAYS = [0, 0, 1, 3, 7, 16, 35];
export const MAX_BOX = 6;
/** Boks 4 eller høyere regnes som «kan det». */
export const KNOWN_BOX = 4;

const prefix: Record<CardType, string> = { begrep: 'd', eksempel: 'e', modell: 'm' };

export function cardId(type: CardType, id: string) {
  return `${prefix[type]}:${id}`;
}

export function allCards(): Card[] {
  const out: Card[] = [];
  for (const { concept, topic } of ORG_CONCEPTS) {
    out.push({ id: cardId('begrep', concept.id), type: 'begrep', topic, concept });
    out.push({ id: cardId('eksempel', concept.id), type: 'eksempel', topic, concept });
  }
  for (const m of ORG_MODELS) {
    const topic = ORG_TOPIC_MAP[m.topic];
    if (topic) out.push({ id: cardId('modell', m.id), type: 'modell', topic, model: m });
  }
  return out;
}

export function cardById(id: string): Card | undefined {
  const [p, rest] = [id.slice(0, 1), id.slice(2)];
  if (p === 'm') {
    const model = ORG_MODEL_MAP[rest];
    const topic = model && ORG_TOPIC_MAP[model.topic];
    return model && topic ? { id, type: 'modell', topic, model } : undefined;
  }
  const c = ORG_CONCEPT_MAP[rest];
  if (!c) return undefined;
  return { id, type: p === 'e' ? 'eksempel' : 'begrep', topic: c.topic, concept: c.concept };
}

const day = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const addDays = (n: number) => day(new Date(Date.now() + n * 864e5));

export function flashRecId(courseId: string) {
  return `kort-${courseId}`;
}

export function flashRec(courseId = store.course()?.id): FlashRec | undefined {
  return courseId ? store.get<FlashRec>('flash', flashRecId(courseId)) : undefined;
}

export function cardState(id: string, rec = flashRec()): FlashCardState | undefined {
  return rec?.cards[id];
}

export type Grade = 'kunne' | 'nesten' | 'ikke';

/** Neste tilstand etter en vurdering. Ren funksjon (testes). */
export function nextState(cur: FlashCardState | undefined, g: Grade, now = new Date()): FlashCardState {
  const b0 = cur?.b ?? 1;
  // Et nytt kort du kan med en gang, trenger ikke komme igjen i morgen: rett til boks 3.
  const b = g === 'kunne' ? (cur ? Math.min(MAX_BOX, b0 + 1) : 3) : g === 'nesten' ? Math.max(2, b0) : 1;
  const days = g === 'nesten' ? 1 : BOX_DAYS[b];
  return {
    b,
    d: day(new Date(now.getTime() + days * 864e5)),
    r: (cur?.r ?? 0) + (g === 'kunne' ? 1 : 0),
    w: (cur?.w ?? 0) + (g === 'ikke' ? 1 : 0),
    l: now.toISOString(),
  };
}

export function grade(cardIdStr: string, g: Grade): void {
  const course = store.course();
  if (!course) return;
  const id = flashRecId(course.id);
  const cur = store.get<FlashRec>('flash', id);
  const now = nowIso();
  const rec: FlashRec = cur ?? { id, kind: 'flash', courseId: course.id, createdAt: now, updatedAt: now, demo: course.demo, cards: {} };
  store.upsert({ ...rec, cards: { ...rec.cards, [cardIdStr]: nextState(rec.cards[cardIdStr], g) } });
}

export function isDue(s: FlashCardState | undefined, today = day()): boolean {
  return !!s && s.d <= today;
}

/** Hvor ofte temaet er spurt om i eksamenene i faget (antall spørsmål). */
export function examCounts(): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of store.currentSubtasks()) {
    const k = s.analysis.familyKbId;
    if (k && ORG_TOPIC_MAP[k]) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** Temaene i rekkefølge: de som kommer oftest på eksamen først, så resten i pensumrekkefølge. */
export function topicsByExam(): OrgTopic[] {
  const c = examCounts();
  return [...ORG_TOPICS].sort((a, b) => (c.get(b.id) ?? 0) - (c.get(a.id) ?? 0) || ORG_TOPICS.indexOf(a) - ORG_TOPICS.indexOf(b));
}

export interface DeckOptions {
  types: CardType[];
  topics?: string[];
  /** Bare temaer som har vært på eksamen i faget. */
  examOnly?: boolean;
  size?: number;
  newMax?: number;
  /** Ta med kort som ikke er forfalt (øv videre når dagens kort er gjort). */
  extra?: boolean;
}

/** Bygger en økt: forfalte kort først, så nye kort fra temaene som teller mest. */
export function buildDeck(o: DeckOptions): Card[] {
  const rec = flashRec();
  const today = day();
  const counts = examCounts();
  const order = topicsByExam().map((t) => t.id);
  const ok = (c: Card) => o.types.includes(c.type) && (!o.topics?.length || o.topics.includes(c.topic.id)) && (!o.examOnly || (counts.get(c.topic.id) ?? 0) > 0);
  const cards = allCards().filter(ok);
  const size = o.size ?? 20;
  const due = cards
    .filter((c) => isDue(rec?.cards[c.id], today))
    .sort((a, b) => rec!.cards[a.id].d.localeCompare(rec!.cards[b.id].d) || rec!.cards[a.id].b - rec!.cards[b.id].b);
  // Nye kort: temaene som kommer oftest først; innen temaet i rekkefølge (definisjoner før eksempler).
  const fresh = cards
    .filter((c) => !rec?.cards[c.id])
    .sort((a, b) => order.indexOf(a.topic.id) - order.indexOf(b.topic.id) || typeRank(a) - typeRank(b));
  const mixFresh = interleave(fresh, o.newMax ?? 8);
  let deck = [...due.slice(0, size), ...mixFresh].slice(0, size);
  if (o.extra && deck.length < size) {
    const later = cards
      .filter((c) => rec?.cards[c.id] && !isDue(rec.cards[c.id], today))
      .sort((a, b) => rec!.cards[a.id].b - rec!.cards[b.id].b || rec!.cards[a.id].d.localeCompare(rec!.cards[b.id].d));
    deck = [...deck, ...later].slice(0, size);
  }
  return deck;
}

function typeRank(c: Card) {
  return c.type === 'begrep' ? 0 : c.type === 'modell' ? 1 : 2;
}

/** Tar nye kort slik at et eksempelkort ikke kommer før definisjonskortet for samme begrep i samme økt. */
function interleave(fresh: Card[], n: number): Card[] {
  const out: Card[] = [];
  const seenDef = new Set<string>();
  const rec = flashRec();
  for (const c of fresh) {
    if (out.length >= n) break;
    if (c.type === 'eksempel' && c.concept && !seenDef.has(c.concept.id) && !rec?.cards[cardId('begrep', c.concept.id)]) continue;
    if (c.type === 'begrep' && c.concept) seenDef.add(c.concept.id);
    out.push(c);
  }
  return out;
}

export interface FlashStats {
  total: number;
  seen: number;
  known: number;
  due: number;
}

export function stats(filter: (c: Card) => boolean = () => true): FlashStats {
  const rec = flashRec();
  const today = day();
  const cards = allCards().filter(filter);
  let seen = 0;
  let known = 0;
  let due = 0;
  for (const c of cards) {
    const s = rec?.cards[c.id];
    if (!s) continue;
    seen++;
    if (s.b >= KNOWN_BOX) known++;
    if (isDue(s, today)) due++;
  }
  return { total: cards.length, seen, known, due };
}

/** Kortets fasit som tekst (brukes for skjermleser og i oppsummeringen). */
export function answerText(c: Card): string {
  if (c.type === 'modell' && c.model) return modelParts(c.model).map((p) => partName(c.model!, p)).join(', ');
  if (c.type === 'eksempel' && c.concept) return c.concept.term;
  return c.concept?.definition ?? '';
}

export function nextReviewText(s: FlashCardState | undefined): string {
  if (!s) return '';
  const today = day();
  if (s.d <= today) return 'igjen i dag';
  const n = Math.round((Date.parse(s.d) - Date.parse(today)) / 864e5);
  return n === 1 ? 'i morgen' : `om ${n} dager`;
}

// ——— Pensum fra sensorveiledningene ———

export interface PensumRef {
  text: string;
  set: string;
  docId: string;
  page?: number;
}

const REF_RE = /(kap(?:ittel)?\.?\s*\d|s\.\s*\d|side\s*\d|EMS|Perspektiver|Organisasjon og ledelse)/i;

/**
 * Pensumhenvisninger for et tema, hentet fra sensorveiledningene i faget
 * («Relevant pensum: …»). Tomt når faget ikke har sensorveiledninger.
 */
export function pensumRefs(topicId: string): PensumRef[] {
  const out: PensumRef[] = [];
  const seen = new Set<string>();
  for (const s of store.currentSubtasks() as SubTask[]) {
    if (s.analysis.familyKbId !== topicId || !s.guide?.text) continue;
    const doc = store.get<SourceDoc>('doc', s.docId);
    const t = s.guide.text.replace(/\s+/g, ' ').trim();
    if (!REF_RE.test(t)) continue;
    const short = t.length > 260 ? `${t.slice(0, 257)}…` : t;
    const key = short.toLowerCase().replace(/[^a-zæøå0-9]/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: short, set: doc?.meta.setLabel ?? doc?.fileName ?? '', docId: s.docId, page: s.guide.lines?.[0]?.page });
  }
  return out;
}

/** Eksamensspørsmålene i faget om temaet (for «Slik er det spurt om»). */
export function topicExamQuestions(topicId: string): { text: string; set: string }[] {
  const seen = new Set<string>();
  const out: { text: string; set: string }[] = [];
  for (const s of store.currentSubtasks()) {
    if (s.analysis.familyKbId !== topicId || !s.text.trim()) continue;
    const key = s.text.toLowerCase().replace(/[^a-zæøå]/g, '').slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    const doc = store.get<SourceDoc>('doc', s.docId);
    out.push({ text: s.text.replace(/\s+/g, ' ').trim(), set: doc?.meta.setLabel ?? '' });
  }
  return out;
}

export function isConceptCourse(): boolean {
  const subs = store.currentSubtasks();
  if (subs.some((s) => s.analysis.familyKbId && ORG_TOPIC_MAP[s.analysis.familyKbId])) return true;
  const c = store.course();
  return !!c && /organisasjon|ledelse|leiing|org\s?3/i.test(c.name);
}

export { addDays, day as today };
