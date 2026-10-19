// Læringsstien: temaene i faget i den rekkefølgen som gir mest uttelling på
// eksamen, delt i kapitler etter hvor ofte de kommer. Bare temaer som faktisk
// finnes i eksamenssettene dine (eller i oppgavesamlingen) er med.

import type { SubTask, SourceDoc, LessonRec } from '../domain/types';
import { isExamSet } from '../domain/types';
import { store } from '../state/store';
import { getFamily, type FamilyKB } from '../families';
import { BASIC_SKILLS } from '../families/skills';
import { originalPool } from './originals';
import { facetsFor } from './mastery';
import { topicState, chapterBest } from './game';
import { ORG_TOPICS } from '../families/org';

export interface TopicStat {
  kbId: string;
  fam: FamilyKB;
  /** Antall eksamenssett temaet er med i, av alle analyserte sett. */
  inSets: number;
  sets: number;
  /** Antall spørsmål om temaet i settene (og i oppgavesamlingen). */
  questions: number;
  collection: number;
  formats: string[];
  parts: number[];
  weight: number;
  relevance: 'svært høy' | 'høy' | 'middels' | 'lav';
  share: number;
  /** Satt når temaet er løftet fram fordi et viktigere tema bygger på det. */
  prereqFor?: string;
}

export interface TopicProgress {
  lessonDone: boolean;
  quizBest?: number;
  quizMax?: number;
  solved: number;
  attempted: number;
  indepSkills: number;
  coreSkills: number;
  /** 0–4: ingenting, Lær ferdig, quiz bestått, løst oppgaver selv, mestret. */
  level: number;
}

export interface Chapter {
  id: string;
  title: string;
  subtitle: string;
  topics: TopicStat[];
}

function examDocs(): SourceDoc[] {
  return store.docs().filter((d) => isExamSet(d) && !d.reserved && d.status !== 'duplikat' && !d.supersededBy && d.stages.analyse.status === 'ferdig');
}

export function topicStats(): TopicStat[] {
  const pool = originalPool();
  const exams = examDocs();
  const examIds = new Set(exams.map((d) => d.id));
  const subs = [...pool.flervalg, ...pool.kortsvar, ...pool.langsvar, ...pool.oppgave];
  const coll = pool.samling;
  const byKb = new Map<string, { sets: Set<string>; q: number; c: number; formats: Set<string>; parts: Set<number> }>();
  const add = (s: SubTask, isColl: boolean) => {
    const k = s.analysis.familyKbId;
    if (!k || !getFamily(k)) return;
    const cur = byKb.get(k) ?? { sets: new Set<string>(), q: 0, c: 0, formats: new Set<string>(), parts: new Set<number>() };
    if (isColl) cur.c++;
    else {
      cur.q++;
      if (examIds.has(s.docId)) cur.sets.add(s.docId);
      if (s.format) cur.formats.add(s.format);
      if (s.part) cur.parts.add(s.part);
    }
    byKb.set(k, cur);
  };
  for (const s of subs) add(s, false);
  for (const s of coll) add(s, true);
  // Essayfag: hvert sett har bare fem spørsmål fra et stort pensum, så et tema er sjelden med i de
  // fleste settene. Terskelene er lavere, og pensumtemaer som ikke er spurt om ennå, er med til slutt.
  const essay = exams.length > 0 && exams.every((d) => d.layout === 'essay');
  if (essay && [...byKb.keys()].some((k) => getFamily(k)?.domain === 'org'))
    for (const t of ORG_TOPICS) if (!byKb.has(t.id)) byKb.set(t.id, { sets: new Set(), q: 0, c: 0, formats: new Set(), parts: new Set() });
  const fewSets = exams.length < 3;
  // Med få sett sier «på 1 av 1 sett» lite; da rangeres temaene etter hvor mange spørsmål de har.
  const maxQ = Math.max(1, ...[...byKb.values()].map((v) => v.q + v.c * 0.25));
  const out: TopicStat[] = [];
  for (const [kbId, v] of byKb) {
    const fam = getFamily(kbId)!;
    const share = !fewSets ? v.sets.size / exams.length : (v.q + v.c * 0.25) / maxQ;
    const relevance: TopicStat['relevance'] = essay && !fewSets
      ? share >= 0.4 ? 'svært høy' : share >= 0.3 ? 'høy' : share >= 0.2 ? 'middels' : 'lav'
      : !fewSets
      ? share >= 0.75 ? 'svært høy' : share >= 0.45 ? 'høy' : share >= 0.2 ? 'middels' : 'lav'
      : !v.q ? 'lav' : share >= 0.6 ? 'svært høy' : share >= 0.3 ? 'høy' : 'middels';
    // Vekten er bare eksamenshyppighet (ikke studentens svar), så rekkefølgen står stille mens du øver.
    out.push({ kbId, fam, inSets: v.sets.size, sets: exams.length, questions: v.q, collection: v.c, formats: [...v.formats], parts: [...v.parts].sort(), weight: v.q + v.c * 0.25, relevance, share });
  }
  return out.sort((a, b) => b.share - a.share || b.questions - a.questions || b.collection - a.collection || a.kbId.localeCompare(b.kbId));
}

const TIER_ORDER: TopicStat['relevance'][] = ['svært høy', 'høy', 'middels', 'lav'];

/**
 * Rekkefølgen: viktigst først, men et tema som et annet bygger på, kommer alltid
 * før det (og flyttes opp i samme kapittel om nødvendig).
 */
function ordered(stats: TopicStat[]): TopicStat[] {
  const list = stats.map((t) => ({ ...t }));
  const byId = new Map(list.map((t) => [t.kbId, t]));
  // Løft forutsetninger til samme nivå som temaet som bygger på dem.
  for (let round = 0; round < 3; round++)
    for (const t of list)
      for (const pre of PREREQ_FIRST[t.kbId] ?? []) {
        const p = byId.get(pre);
        if (p && TIER_ORDER.indexOf(p.relevance) > TIER_ORDER.indexOf(t.relevance)) {
          p.relevance = t.relevance;
          p.prereqFor = t.fam.shortName;
        }
      }
  const out: TopicStat[] = [];
  const placed = new Set<string>();
  const place = (t: TopicStat, depth = 0) => {
    if (placed.has(t.kbId) || depth > 5) return;
    for (const pre of PREREQ_FIRST[t.kbId] ?? []) {
      const p = byId.get(pre);
      if (p && p.relevance === t.relevance) place(p, depth + 1);
    }
    placed.add(t.kbId);
    out.push(t);
  };
  for (const tier of TIER_ORDER) for (const t of list.filter((x) => x.relevance === tier)) place(t);
  return out;
}

const PREREQ_FIRST: Record<string, string[]> = {
  'likevekt-avgift': ['likevekt-lineaer'],
  'marked-frikonkurranse': ['likevekt-lineaer'],
  arbeidsdisiplin: ['ws-ps'],
  'prinsipal-agent': ['arbeidsdisiplin'],
  'fritid-konsum': ['alternativkostnad'],
  'konjunktur-konsum': ['bnp-inflasjon'],
  'el-motstand': ['el-grunnlag'],
  'el-kretsanalyse': ['el-motstand'],
  'el-opamp': ['el-kretsanalyse'],
  'el-filter': ['el-ac', 'el-transient'],
  'dig-sekvensiell': ['dig-logikk'],
};

export function chapters(): Chapter[] {
  const list = ordered(topicStats());
  const few = (list[0]?.sets ?? 0) < 3;
  const essay = list.length > 0 && list.every((t) => t.fam.domain === 'org');
  const tiers: { key: string; title: string; subtitle: string; tier: TopicStat['relevance'] }[] = essay && !few
    ? [
        { key: 'a', title: 'Kommer oftest', subtitle: 'Med i omtrent annethvert eksamenssett. Start her.', tier: 'svært høy' },
        { key: 'b', title: 'Kommer ofte', subtitle: 'Med i omtrent hvert tredje sett.', tier: 'høy' },
        { key: 'c', title: 'Har kommet flere ganger', subtitle: 'Med i to av settene dine.', tier: 'middels' },
        { key: 'd', title: 'Sjelden eller ikke ennå', subtitle: 'Bare i ett sett, eller i pensum uten å ha vært spurt om. Ta disse sist.', tier: 'lav' },
      ]
    : few
    ? [
        { key: 'a', title: 'Mest på eksamen', subtitle: 'Flest spørsmål i eksamenssettet ditt. Start her.', tier: 'svært høy' },
        { key: 'b', title: 'En god del på eksamen', subtitle: 'Færre spørsmål, men de kommer.', tier: 'høy' },
        { key: 'c', title: 'Litt på eksamen', subtitle: 'Ett eller to spørsmål i settet.', tier: 'middels' },
        { key: 'd', title: 'Grunnlag og øving', subtitle: 'Ikke spurt om direkte i settet ditt, men i oppgavesamlingen eller som grunnlag for andre temaer.', tier: 'lav' },
      ]
    : [
        { key: 'a', title: 'Kommer nesten alltid', subtitle: 'Med i de fleste eksamenssettene dine. Start her.', tier: 'svært høy' },
        { key: 'b', title: 'Kommer ofte', subtitle: 'Med i omtrent halvparten av settene.', tier: 'høy' },
        { key: 'c', title: 'Kommer av og til', subtitle: 'Mindre vanlig, men har kommet.', tier: 'middels' },
        { key: 'd', title: 'Sjelden', subtitle: 'Bare i ett sett eller i oppgavesamlingen. Ta disse sist.', tier: 'lav' },
      ];
  const out: Chapter[] = [];
  for (const tier of tiers) {
    const ts = list.filter((t) => t.relevance === tier.tier);
    for (let i = 0; i < ts.length; i += 5) {
      const chunk = ts.slice(i, i + 5);
      const n = Math.floor(i / 5) + 1;
      const part = ts.length > 5 ? ` (${n})` : '';
      // Stabil id (nivå + nummer), så rekorden henger igjen selv om rekkefølgen endrer seg.
      out.push({ id: `kap-${tier.key}${n}`, title: `${tier.title}${part}`, subtitle: tier.subtitle, topics: chunk });
    }
  }
  return out;
}

export function topicProgress(kbId: string): TopicProgress {
  const st = topicState(kbId);
  const fam = getFamily(kbId);
  const ev = store.evidence();
  const core = (fam?.skills ?? []).filter((s) => !BASIC_SKILLS.includes(s));
  const indep = core.filter((s) => facetsFor(s, ev).independent).length;
  const lessonDone = !!st.lessonDoneAt;
  const quizOk = st.quizMax ? (st.quizBest ?? 0) / st.quizMax >= 0.75 : false;
  const solved = st.solved ?? 0;
  const attempted = st.attempted ?? 0;
  const mastered = core.length > 0 && indep >= Math.ceil(core.length * 0.6) && solved >= 2;
  const level = mastered ? 4 : solved >= 2 ? 3 : quizOk ? 2 : lessonDone ? 1 : 0;
  return { lessonDone, quizBest: st.quizBest, quizMax: st.quizMax, solved, attempted, indepSkills: indep, coreSkills: core.length, level };
}

/**
 * Neste steg: første tema i planen som ikke er gjort. Lær først, så oppgaver til
 * du har løst to selv – eller prøvd fem (da går planen videre, så du aldri står fast).
 */
export function nextStep(): { kbId: string; action: 'laer' | 'oppgaver' } | null {
  for (const ch of chapters())
    for (const t of ch.topics) {
      const p = topicProgress(t.kbId);
      if (!p.lessonDone) return { kbId: t.kbId, action: 'laer' };
      if (p.level < 3 && p.attempted < 5) return { kbId: t.kbId, action: 'oppgaver' };
    }
  return null;
}

export function chapterState(ch: Chapter) {
  const progress = ch.topics.map((t) => topicProgress(t.kbId));
  const lessons = progress.filter((p) => p.lessonDone).length;
  return { lessons, total: ch.topics.length, unlocked: lessons >= Math.min(2, ch.topics.length), best: chapterBest(ch.id) };
}

export function relevanceText(t: TopicStat): string {
  const coll = t.collection ? ` · ${t.collection} i oppgavesamlingen` : '';
  if (!t.questions && !t.collection && t.fam.domain === 'org') return 'I pensum, ikke spurt om i eksamenene dine ennå';
  if (t.sets >= 3) return `På ${t.inSets} av ${t.sets} eksamenssett${t.questions ? ` · ${t.questions} spørsmål` : ''}${coll}`;
  if (t.questions) return `${t.questions} spørsmål i ${t.sets === 1 ? 'eksamenssettet ditt' : 'eksamenssettene dine'}${coll}`;
  return t.collection ? `${t.collection} oppgaver i oppgavesamlingen` : 'Grunnlag for andre temaer';
}

/** Hvor stor del av eksamen temaet utgjør (0–1), til stolpen i planen. */
export function relevanceBar(t: TopicStat): number {
  return Math.max(0.04, Math.min(1, t.share));
}

export function formatText(t: TopicStat): string {
  if (t.fam.domain === 'org') return t.questions ? 'Kommer som essayspørsmål (ca. 36 min)' : '';
  const f = t.formats.map((x) => (x === 'flervalg' ? 'flervalg' : x === 'kortsvar' ? 'kortsvar' : x === 'langsvar' ? 'lengre oppgave' : 'regneoppgave'));
  const parts = t.parts.length ? ` (Del ${t.parts.join(', ')})` : '';
  return f.length ? `Kommer som ${[...new Set(f)].join(', ')}${parts}` : '';
}

export type { LessonRec };
