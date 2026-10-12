// Henting fra skylagringen i små sider når svarene blir for store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CloudBackend } from '../src/storage/backend';

/** Enkel etterlikning av databasen: filtrering, sortering, grense og et tak på svarstørrelsen. */
function mockDb(docs: Record<string, unknown>[], maxBytes: number) {
  let calls = 0;
  const query = (filters: [string, string, unknown][], order?: string, lim = 1000): any => ({
    where: (f: string, op: string, v: unknown) => query([...filters, [f, op, v]], order, lim),
    orderBy: (f: string) => query(filters, f, lim),
    limit: (n: number) => query(filters, order, n),
    get: async () => {
      calls++;
      let r = docs.filter((d) => filters.every(([f, op, v]) => (op === '==' ? d[f] === v : op === '>' ? String(d[f]) > String(v) : true)));
      if (order) r = [...r].sort((a, b) => (String(a[order]) < String(b[order]) ? -1 : 1));
      r = r.slice(0, lim);
      if (JSON.stringify(r).length > maxBytes) throw { code: 'resource_exhausted', message: 'result too large' };
      return { size: r.length, docs: r.map((d) => ({ data: () => d })) };
    },
  });
  return { db: { collection: () => query([]) }, calls: () => calls };
}

test('skylagring: store deloppgaver hentes i mindre sider i stedet for å feile', async () => {
  const docs: Record<string, unknown>[] = [{ kind: 'settings', id: 'innstillinger' }, { kind: 'course', id: 'fag1', name: 'Fag' }];
  for (let i = 0; i < 300; i++) docs.push({ kind: 'subtask', id: `st${String(i).padStart(4, '0')}`, text: 'x'.repeat(20000 + (i % 7) * 3000) });
  for (let i = 0; i < 150; i++) docs.push({ kind: 'page', id: `p${String(i).padStart(4, '0')}`, text: 'y'.repeat(12000) });
  const m = mockDb(docs, 400_000); // ca. 15 store deloppgaver per svar
  const b = new CloudBackend(m.db, 'me');
  const all = await b.loadAll();
  assert.equal(all.length, docs.length);
  assert.equal(new Set(all.map((d: any) => d.kind + ':' + d.id)).size, docs.length, 'ingen dubletter');
});

test('skylagring: en side som aldri kan hentes gir feil, ikke et tomt resultat', async () => {
  const docs = [{ kind: 'subtask', id: 'a', text: 'x'.repeat(5000) }];
  const m = mockDb(docs, 100);
  const b = new CloudBackend(m.db, 'me');
  await assert.rejects(() => b.loadAll(), (e: any) => e.code === 'resource_exhausted');
});
