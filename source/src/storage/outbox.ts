// Utboks for skrivinger som ikke er bekreftet av skylagringen ennå.
// Hver endring legges her først (IndexedDB i denne nettleseren), og fjernes
// først når databasen har bekreftet den. Lukkes siden før skrivingen er
// ferdig, sendes den på nytt neste gang appen åpnes.
//
// Alt her er «beste forsøk»: blokkerer nettleseren IndexedDB, fungerer appen
// som før, bare uten denne ekstra sikringen.

import type { Entity } from '../domain/types';

export interface OutboxEntry {
  key: string;
  op: 'put' | 'del';
  e: Entity;
  seq: number;
  at: number;
}

let dbp: Promise<IDBDatabase | null> | null = null;
// Én utboks per bruker: på en delt nettleser skal ikke A sine ulagrede endringer sendes inn på B sin konto.
let scope = 'ukjent';

export function setOutboxScope(uid: string | null) {
  const next = uid ? uid.replace(/[^\w-]/g, '').slice(0, 64) : 'lokal';
  if (next === scope) return;
  scope = next;
  dbp = null;
}

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(`eksamensverksted-utboks-${scope}`, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('w')) db.createObjectStore('w', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((res) => {
    tx.oncomplete = () => res();
    tx.onerror = () => res();
    tx.onabort = () => res();
  });
}

export const outbox = {
  async put(entry: OutboxEntry): Promise<void> {
    const db = await open();
    if (!db) return;
    try {
      const tx = db.transaction('w', 'readwrite');
      tx.objectStore('w').put(JSON.parse(JSON.stringify(entry)));
      await done(tx);
    } catch {
      /* beste forsøk */
    }
  },
  /** Fjerner en post bare hvis den fortsatt gjelder samme endring (seq). */
  async remove(key: string, seq: number): Promise<void> {
    const db = await open();
    if (!db) return;
    try {
      const tx = db.transaction('w', 'readwrite');
      const st = tx.objectStore('w');
      const r = st.get(key);
      r.onsuccess = () => {
        const cur = r.result as OutboxEntry | undefined;
        if (cur && cur.seq <= seq) st.delete(key);
      };
      await done(tx);
    } catch {
      /* beste forsøk */
    }
  },
  async all(): Promise<OutboxEntry[]> {
    const db = await open();
    if (!db) return [];
    try {
      const tx = db.transaction('w', 'readonly');
      const r = tx.objectStore('w').getAll();
      return await new Promise((res) => {
        r.onsuccess = () => res((r.result as OutboxEntry[]) ?? []);
        r.onerror = () => res([]);
      });
    } catch {
      return [];
    }
  },
  async clear(): Promise<void> {
    const db = await open();
    if (!db) return;
    try {
      const tx = db.transaction('w', 'readwrite');
      tx.objectStore('w').clear();
      await done(tx);
    } catch {
      /* beste forsøk */
    }
  },
};
