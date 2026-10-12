// Sammenslåing av poeng og fremgang fra to enheter. Spilldokumentet skrives ofte
// (hver gang du får poeng), så «siste skriving vinner» ville viske ut det den andre
// enheten gjorde. Her tas det beste fra begge, felt for felt.

import type { GameRec } from '../domain/types';

const max = (a?: number, b?: number) => (a === undefined ? b : b === undefined ? a : Math.max(a, b));
const later = (a?: string, b?: string) => (!a ? b : !b ? a : a > b ? a : b);
const earlier = (a?: string, b?: string) => (!a ? b : !b ? a : a < b ? a : b);

export function mergeGame(local: GameRec, remote: GameRec): GameRec {
  const days: Record<string, number> = { ...remote.days };
  for (const [d, n] of Object.entries(local.days)) days[d] = Math.max(n, days[d] ?? 0);
  const topics: GameRec['topics'] = { ...remote.topics };
  for (const [k, l] of Object.entries(local.topics)) {
    const r = topics[k];
    if (!r) {
      topics[k] = l;
      continue;
    }
    // Quizen: behold forsøket med best andel riktige (med sitt eget antall spørsmål).
    const ratio = (t: typeof l) => (t.quizMax ? (t.quizBest ?? 0) / t.quizMax : -1);
    const quiz = ratio(l) >= ratio(r) ? { quizBest: l.quizBest, quizMax: l.quizMax } : { quizBest: r.quizBest, quizMax: r.quizMax };
    topics[k] = {
      lessonDoneAt: earlier(l.lessonDoneAt, r.lessonDoneAt),
      lessonCards: max(l.lessonCards, r.lessonCards),
      ...quiz,
      solved: max(l.solved, r.solved),
      attempted: max(l.attempted, r.attempted),
      xp: max(l.xp, r.xp),
      lastAt: later(l.lastAt, r.lastAt),
    };
  }
  const chapters: GameRec['chapters'] = { ...remote.chapters };
  for (const [k, l] of Object.entries(local.chapters)) {
    const r = chapters[k];
    if (!r) {
      chapters[k] = l;
      continue;
    }
    const best = !l.best ? r.best : !r.best ? l.best : l.best.score >= r.best.score ? l.best : r.best;
    chapters[k] = { best, runs: Math.max(l.runs, r.runs) };
  }
  return {
    ...local,
    xp: Math.max(local.xp, remote.xp),
    days,
    streak: Math.max(local.streak, remote.streak),
    bestStreak: Math.max(local.bestStreak, remote.bestStreak),
    lastDay: later(local.lastDay, remote.lastDay),
    topics,
    chapters,
  };
}

/** Like uten å se på tidsstempelet? */
export function sameGame(a: GameRec, b: GameRec): boolean {
  const strip = (g: GameRec) => JSON.stringify({ ...g, updatedAt: '', createdAt: '' });
  return strip(a) === strip(b);
}
