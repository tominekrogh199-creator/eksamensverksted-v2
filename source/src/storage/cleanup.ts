// Opprydding. Lagringen for artefaktet har en grense på antall elementer (5000, delt
// av alle som bruker appen), så elementer ingen bruker lenger, fjernes:
//  - sider og deloppgaver som hører til et dokument som ikke finnes (slettet midt i analysen)
//  - sider fra dokumentversjoner som er erstattet av en nyere versjon
//  - genererte oppgaver som aldri ble åpnet, eldre enn 14 dager, og ikke står i en
//    pågående økt eller prøve
//  - tilbaketrukket evidens eldre enn 30 dager
// Ingenting du har levert, eller som mestringsbildet bygger på, slettes.

import type { Entity, PageRec, SubTask, GeneratedTask, Evidence, SessionRec, ExamSim, Attempt, SourceDoc, LessonRec, Course, FlashRec } from '../domain/types';
import { store } from '../state/store';

export const DOC_LIMIT = 5000;

export function entityCount(): number {
  let n = 0;
  for (const k of ['settings', 'profile', 'game', 'flash', 'course', 'lesson', 'doc', 'page', 'subtask', 'family', 'gen', 'attempt', 'evidence', 'session', 'exam'] as const) n += store.list(k).length;
  return n;
}

export function cleanupCandidates(opts: { orphansOnly?: boolean } = {}): { items: Entity[]; summary: string[] } {
  const docs = new Map(store.list<SourceDoc>('doc').map((d) => [d.id, d]));
  const courses = new Set(store.list<Course>('course').map((c) => c.id));
  const orphanPages = store.list<PageRec>('page').filter((p) => !docs.has(p.docId));
  const orphanSubs = store.list<SubTask>('subtask').filter((s) => !docs.has(s.docId));
  const orphanLessons = [...store.list<LessonRec>('lesson'), ...store.list<FlashRec>('flash')].filter((l) => !courses.has(l.courseId));
  const out: Entity[] = [...orphanPages, ...orphanSubs, ...orphanLessons];
  const summary: string[] = [];
  if (orphanPages.length + orphanSubs.length) summary.push(`${orphanPages.length + orphanSubs.length} rester av dokumenter som er slettet`);
  if (orphanLessons.length) summary.push(`${orphanLessons.length} leksjoner og kortstokker fra fag som er slettet`);
  if (opts.orphansOnly) return { items: out, summary };

  const replacedPages = store.list<PageRec>('page').filter((p) => docs.get(p.docId)?.supersededBy);
  if (replacedPages.length) summary.push(`${replacedPages.length} sider fra dokumentversjoner som er erstattet`);
  out.push(...replacedPages);

  const used = new Set<string>();
  for (const a of store.list<Attempt>('attempt')) used.add(a.taskRef.id);
  for (const s of store.list<SessionRec>('session')) if (!s.endedAt) s.plan.taskIds.forEach((id) => used.add(id));
  for (const e of store.list<ExamSim>('exam')) {
    e.taskIds.forEach((id) => used.add(id));
    (e.result?.repairTaskIds ?? []).forEach((id) => used.add(id));
  }
  const old = Date.now() - 14 * 864e5;
  const unusedGens = store.list<GeneratedTask>('gen').filter((g) => !used.has(g.id) && Date.parse(g.createdAt) < old);
  if (unusedGens.length) summary.push(`${unusedGens.length} genererte oppgaver som aldri ble åpnet (eldre enn 14 dager)`);
  out.push(...unusedGens);

  const oldVoid = Date.now() - 30 * 864e5;
  const voided = store.list<Evidence>('evidence').filter((e) => e.voided && Date.parse(e.voided.at) < oldVoid);
  if (voided.length) summary.push(`${voided.length} tilbaketrukne vurderinger eldre enn 30 dager`);
  out.push(...voided);
  return { items: out, summary };
}

export function runCleanup(items: Entity[]): number {
  for (const e of items) store.remove(e);
  return items.length;
}
