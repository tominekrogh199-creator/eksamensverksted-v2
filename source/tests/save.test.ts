// Lagring: ingen endring skal gå tapt når lagringen svarer med feil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../src/state/store';
import type { Backend } from '../src/storage/backend';
import type { Entity } from '../src/domain/types';

function fakeBackend(fail: (e: Entity, n: number) => string | null) {
  const saved = new Map<string, Entity>();
  let n = 0;
  let concurrent = 0;
  let maxConcurrent = 0;
  const b: Backend = {
    kind: 'sky',
    describe: 'test',
    loadAll: async () => [],
    put: async (e) => {
      n++;
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      concurrent--;
      const code = fail(e, n);
      if (code) throw { code, message: code };
      saved.set(`${e.kind}:${e.id}`, JSON.parse(JSON.stringify(e)));
    },
    remove: async (e) => {
      saved.delete(`${e.kind}:${e.id}`);
    },
  };
  return { b, saved, calls: () => n, maxConcurrent: () => maxConcurrent };
}

const att = (id: string, text: string) => ({ id, kind: 'attempt', courseId: 'c1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '', parts: [{ partId: 'a', lines: [{ text }] }], chat: [], help: [] }) as unknown as Entity;

test('lagring: travel database (resource_exhausted) gir nye forsøk, ikke tapte endringer', async () => {
  const f = fakeBackend((_e, n) => (n <= 4 ? 'resource_exhausted' : null));
  store.backend = f.b;
  for (let i = 0; i < 6; i++) store.upsert(att(`a${i}`, `linje ${i}`));
  store.upsert(att('a0', 'siste versjon'));
  const ok = await store.waitSaved(20000);
  assert.ok(ok, 'alt ble lagret til slutt');
  assert.equal(f.saved.size, 6);
  assert.equal((f.saved.get('attempt:a0') as any).parts[0].lines[0].text, 'siste versjon');
  assert.ok(f.maxConcurrent() <= 3, `høyst tre samtidige skrivinger (var ${f.maxConcurrent()})`);
  assert.equal(store.getSave().state, 'lagret');
});

test('lagring: uendret innhold skrives ikke på nytt', async () => {
  const f = fakeBackend(() => null);
  store.backend = f.b;
  store.upsert(att('b1', 'x'));
  await store.waitSaved(5000);
  const before = f.calls();
  store.upsert(att('b1', 'x'));
  await store.waitSaved(5000);
  assert.equal(f.calls(), before);
});

test('lagring: et element som aldri kan lagres, vises som feil og blokkerer ikke resten', async () => {
  const f = fakeBackend((e) => ((e as any).id === 'stor' ? 'invalid_argument' : null));
  store.backend = f.b;
  store.upsert(att('stor', 'x'));
  store.upsert(att('liten', 'y'));
  await new Promise((r) => setTimeout(r, 1500));
  assert.ok(f.saved.has('attempt:liten'));
  assert.equal(store.getSave().state, 'feil');
  assert.equal(store.failedList().length, 1);
  store.retryFailed();
});
