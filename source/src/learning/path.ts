// Læringsstien: temaene i faget i den rekkefølgen som gir mest uttelling på
// eksamen, delt i kapitler etter hvor ofte de kommer. Bare temaer som faktisk
// finnes i eksamenssettene dine (eller i oppgavesamlingen) er med.

import type { SubTask, SourceDoc, LessonRec } from '../domain/types';
import { isExamSet } from '../domain/types';
import { store } from '../state/store';
import { getFamily, type FamilyKB } from '../families';
import { BASIC_SKILLS } from '../families/skills';
import { originalPool } from './originals';
import { examTopicWeights } from './examlike';
import { facetsFor } from './mastery';
import { topicState, chapterBest } from './game';

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
}

export interface TopicProgress {
  lessonDone: boolean;
  quizBest?: number;
  quizMax?: number;
  solved: number;
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
  const weights = new Map(examTopicWeights().map((w) => [w.kbId, w.weight]));
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
  const n = Math.max(1, exams.length);
  const out: TopicStat[] = [];
  for (const [kbId, v] of byKb) {
    const fam = getFamily(kbId)!;
    const share = exams.length ? v.sets.size / n : v.c ? 0.3 : 0;
    const relevance = share >= 0.75 ? 'svært høy' : share >= 0.45 ? 'høy' : share >= 0.2 || v.c >= 10 ? 'middels' : 'lav';
    out.push({ kbId, fam, inSets: v.sets.size, sets: exams.length, questions: v.q, collection: v.c, formats: [...v.formats], parts: [...v.parts].sort(), weight: weights.get(kbId) ?? v.c * 0.4, relevance, share });
  }
  return out.sort((a, b) => b.share - a.share || b.weight - a.weight);
}

/** Rekkefølgen: viktigst først, men et tema som bygger på et annet kommer etter det (når begge er like viktige). */
function ordered(stats: TopicStat[]): TopicStat[] {
  const out: TopicStat[] = [];
  const left = [...stats];
  while (left.length) {
    const next = left.shift()!;
    // Hent fram et nært beslektet, nesten like viktig tema som er en forutsetning (likevekt før avgift osv.).
    const pre = left.findIndex((t) => (PREREQ_FIRST[next.kbId] ?? []).includes(t.kbId) && t.share >= next.share - 0.15);
    if (pre >= 0) out.push(left.splice(pre, 1)[0]);
    out.push(next);
  }
  return out;
}

const PREREQ_FIRST: Record<string, string[]> = {
  'likevekt-avgift': ['likevekt-lineaer'],
  'marked-frikonkurranse': ['likevekt-lineaer'],
  arbeidsdisiplin: ['ws-ps'],
  'prinsipal-agent': ['arbeidsdisiplin'],
  alternativkostnad: [],
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
  const tiers: { key: string; title: string; subtitle: string; pick: (t: TopicStat) => boolean }[] = [
    { key: 'a', title: 'Kommer nesten alltid', subtitle: 'Temaene som er med i de fleste eksamenssettene dine. Start her.', pick: (t) => t.relevance === 'svært høy' },
    { key: 'b', title: 'Kommer ofte', subtitle: 'Med i omtrent halvparten av settene.', pick: (t) => t.relevance === 'høy' },
    { key: 'c', title: 'Kommer av og til', subtitle: 'Mindre vanlig, men har kommet.', pick: (t) => t.relevance === 'middels' },
    { key: 'd', title: 'Sjelden', subtitle: 'Bare i ett sett eller i oppgavesamlingen. Ta disse sist.', pick: (t) => t.relevance === 'lav' },
  ];
  const out: Chapter[] = [];
  for (const tier of tiers) {
    const ts = list.filter(tier.pick);
    for (let i = 0; i < ts.length; i += 4) {
      const chunk = ts.slice(i, i + 4);
      const part = ts.length > 4 ? ` (${Math.floor(i / 4) + 1})` : '';
      out.push({ id: `kap-${chunk[0].kbId}`, title: `${tier.title}${part}`, subtitle: tier.subtitle, topics: chunk });
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
  const mastered = core.length > 0 && indep >= Math.ceil(core.length * 0.6) && solved >= 2;
  const level = mastered ? 4 : solved >= 2 ? 3 : quizOk ? 2 : lessonDone ? 1 : 0;
  return { lessonDone, quizBest: st.quizBest, quizMax: st.quizMax, solved, indepSkills: indep, coreSkills: core.length, level };
}

/** Neste tema å gjøre: første tema på stien som ikke er mestret, med Lær før Oppgaver. */
export function nextStep(): { kbId: string; action: 'laer' | 'oppgaver' } | null {
  for (const ch of chapters())
    for (const t of ch.topics) {
      const p = topicProgress(t.kbId);
      if (!p.lessonDone) return { kbId: t.kbId, action: 'laer' };
      if (p.level < 3) return { kbId: t.kbId, action: 'oppgaver' };
    }
  return null;
}

export function chapterState(ch: Chapter) {
  const progress = ch.topics.map((t) => topicProgress(t.kbId));
  const lessons = progress.filter((p) => p.lessonDone).length;
  return { lessons, total: ch.topics.length, unlocked: lessons >= Math.min(2, ch.topics.length), best: chapterBest(ch.id) };
}

export function relevanceText(t: TopicStat): string {
  if (t.sets) return `På ${t.inSets} av ${t.sets} eksamenssett${t.questions ? ` · ${t.questions} spørsmål` : ''}${t.collection ? ` · ${t.collection} i samlingen` : ''}`;
  return `${t.collection} oppgaver i oppgavesamlingen`;
}

export function formatText(t: TopicStat): string {
  const f = t.formats.map((x) => (x === 'flervalg' ? 'flervalg' : x === 'kortsvar' ? 'kortsvar' : x === 'langsvar' ? 'lengre oppgave' : 'regneoppgave'));
  const parts = t.parts.length ? ` (Del ${t.parts.join(', ')})` : '';
  return f.length ? `Kommer som ${[...new Set(f)].join(', ')}${parts}` : '';
}

export type { LessonRec };
