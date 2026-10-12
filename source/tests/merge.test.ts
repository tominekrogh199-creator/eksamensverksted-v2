import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeGame } from '../src/learning/merge';
import type { GameRec } from '../src/domain/types';

const base = (p: Partial<GameRec>): GameRec => ({ id: 'g', kind: 'game', courseId: '', createdAt: '', updatedAt: '', xp: 0, days: {}, streak: 0, bestStreak: 0, topics: {}, chapters: {}, ...p });

test('nullstilt fag kommer ikke tilbake fra en annen enhet', () => {
  const local = base({ resets: { c1: '2026-10-12T10:00:00Z' }, topics: { 'c2:x': { lessonDoneAt: '2026-10-01T00:00:00Z', lastAt: '2026-10-01T00:00:00Z' } } });
  const remote = base({ topics: { 'c1:kost': { lessonDoneAt: '2026-10-05T00:00:00Z', lastAt: '2026-10-05T00:00:00Z', quizBest: 3, quizMax: 4 } }, chapters: { 'c1:k1': { runs: 2, best: { score: 9, correct: 3, total: 4, ms: 1, splits: [], at: '2026-10-05T00:00:00Z' } } } });
  const m = mergeGame(local, remote);
  assert.equal(m.topics['c1:kost'], undefined);
  assert.equal(m.chapters['c1:k1'], undefined);
  assert.ok(m.topics['c2:x']);
  assert.equal(mergeGame(remote, local).topics['c1:kost'], undefined, 'begge retninger');
});

test('fremgang etter nullstillingen beholdes', () => {
  const local = base({ resets: { c1: '2026-10-12T10:00:00Z' } });
  const remote = base({ topics: { 'c1:kost': { lessonDoneAt: '2026-10-12T11:00:00Z', lastAt: '2026-10-12T11:00:00Z' } } });
  assert.ok(mergeGame(local, remote).topics['c1:kost']);
});
