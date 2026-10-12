// Lagring av entiteter og filer. Tre nivåer:
// «sky»: privat per bruker i artefaktens database (synkroniseres mellom enheter)
// «lokal»: IndexedDB i denne nettleseren
// «minne»: bare så lenge siden er åpen (når nettleseren blokkerer lagring)

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Entity } from '../domain/types';
import { entityKey } from '../domain/types';
import type { Platform } from './platform';

export interface Backend {
  kind: 'sky' | 'lokal' | 'minne';
  describe: string;
  loadAll(onProgress?: (n: number) => void): Promise<Entity[]>;
  loadSince?(since: string): Promise<Entity[]>;
  put(e: Entity): Promise<void>;
  remove(e: Pick<Entity, 'kind' | 'id'>): Promise<void>;
}

const KINDS: Entity['kind'][] = ['settings', 'profile', 'game', 'course', 'lesson', 'doc', 'page', 'subtask', 'family', 'gen', 'attempt', 'evidence', 'session', 'exam'];

function clean<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

// ——— IndexedDB ———

let idbPromise: Promise<IDBDatabase> | null = null;
function openIdb(): Promise<IDBDatabase> {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open('eksamensverksted', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('entities')) db.createObjectStore('entities', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB er blokkert'));
    } catch (e) {
      reject(e);
    }
  });
  return idbPromise;
}

function idbReq<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export class LocalBackend implements Backend {
  kind: 'lokal' = 'lokal';
  describe = 'Lagres bare i denne nettleseren på denne enheten.';
  async loadAll(): Promise<Entity[]> {
    const db = await openIdb();
    const rows = await idbReq(db.transaction('entities').objectStore('entities').getAll());
    return rows.map((r: any) => r.value as Entity);
  }
  async put(e: Entity) {
    const db = await openIdb();
    await idbReq(db.transaction('entities', 'readwrite').objectStore('entities').put({ key: entityKey(e), value: clean(e) }));
  }
  async remove(e: Pick<Entity, 'kind' | 'id'>) {
    const db = await openIdb();
    await idbReq(db.transaction('entities', 'readwrite').objectStore('entities').delete(entityKey(e)));
  }
}

export class MemoryBackend implements Backend {
  kind: 'minne' = 'minne';
  describe = 'Nettleseren tillater ikke lagring. Arbeidet forsvinner når siden lukkes.';
  async loadAll() {
    return [];
  }
  async put() {}
  async remove() {}
}

export class CloudBackend implements Backend {
  kind: 'sky' = 'sky';
  describe = 'Lagres privat på kontoen din og synkroniseres mellom enhetene dine.';
  private path: string;
  constructor(
    private db: any,
    uid: string,
  ) {
    this.path = `data/users/${uid}`;
  }
  /** Rask sjekk av at databasen svarer (ett lite dokument). */
  async probe(): Promise<void> {
    await this.db.collection(this.path).where('kind', '==', 'settings').limit(1).get();
  }
  /**
   * Henter alt i små sider. Databasen avviser svar som blir for store
   * (mange store deloppgaver), så sidestørrelsen krymper når det skjer og
   * vokser igjen etterpå. Kaster bare når en side ikke lar seg hente.
   */
  async loadAll(onProgress?: (n: number) => void): Promise<Entity[]> {
    const coll = this.db.collection(this.path);
    const out: Entity[] = [];
    const MAX = 40;
    for (const k of KINDS) {
      let last: string | null = null;
      let size = MAX;
      let tries = 0;
      for (let guard = 0; guard < 10000; guard++) {
        const base = coll.where('kind', '==', k);
        const q = (last ? base.where('id', '>', last) : base).orderBy('id').limit(size);
        let snap: any;
        try {
          snap = await q.get();
          tries = 0;
        } catch (e: any) {
          const code = e?.code;
          tries++;
          if (code === 'resource_exhausted' && tries <= 8) {
            size = Math.max(1, Math.floor(size / 3));
            await sleep(150 * tries);
            continue;
          }
          if ((code === 'unavailable' || code === undefined) && tries <= 3) {
            await sleep(400 * tries);
            continue;
          }
          throw e;
        }
        for (const d of snap.docs) out.push(d.data() as Entity);
        onProgress?.(out.length);
        if (snap.size < size) break;
        last = (snap.docs[snap.docs.length - 1].data() as Entity).id;
        size = Math.min(MAX, size * 2);
      }
    }
    return out;
  }
  /** Alt som er endret siden et tidspunkt (fra en annen enhet eller fane). */
  async loadSince(since: string): Promise<Entity[]> {
    const coll = this.db.collection(this.path);
    const out = new Map<string, Entity>();
    let from = since;
    let size = 40;
    for (let guard = 0; guard < 200; guard++) {
      let snap: any;
      try {
        snap = await coll.where('updatedAt', '>', from).orderBy('updatedAt').limit(size).get();
      } catch (e: any) {
        if (e?.code === 'resource_exhausted' && size > 2) {
          size = Math.max(2, Math.floor(size / 3));
          await sleep(300);
          continue;
        }
        throw e;
      }
      const docs = snap.docs.map((d: any) => d.data() as Entity);
      const before = out.size;
      for (const d of docs) out.set(entityKey(d), d);
      if (snap.size < size || out.size === before) break;
      const lastAt = docs[docs.length - 1]?.updatedAt;
      if (!lastAt || lastAt === from) break;
      // Samme tidsstempel kan deles av flere: ta med grensen på nytt i neste side.
      from = lastAt.slice(0, -1) + String.fromCharCode(lastAt.charCodeAt(lastAt.length - 1) - 1);
    }
    return [...out.values()];
  }
  async put(e: Entity) {
    await this.db.collection(this.path).doc(entityKey(e)).set(clean(e));
  }
  async remove(e: Pick<Entity, 'kind' | 'id'>) {
    await this.db.collection(this.path).doc(entityKey(e)).delete();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Velger lagring. Har appen tilgang til skylagringen, brukes den, også om den
 * ikke svarer med en gang: da kastes en feil slik at appen viser «Prøv igjen»
 * i stedet for å bytte stille til en tom, lokal lagring.
 */
export async function chooseBackend(p: Platform, opts: { allowLocal?: boolean } = {}): Promise<Backend> {
  if (p.db && p.uid && !opts.allowLocal) {
    const b = new CloudBackend(p.db, p.uid);
    let last: unknown = null;
    for (let i = 0; i < 4; i++) {
      try {
        await b.probe();
        return b;
      } catch (e) {
        last = e;
        await sleep(500 * (i + 1));
      }
    }
    throw last ?? new Error('Skylagringen svarer ikke');
  }
  try {
    await openIdb();
    return new LocalBackend();
  } catch {
    return new MemoryBackend();
  }
}

// ——— Filer (originaldokumenter og bilder) ———

export interface BlobRef {
  localKey?: string;
  assetId?: string;
}

const memBlobs = new Map<string, Blob>();

export const blobs = {
  async putLocal(id: string, blob: Blob): Promise<boolean> {
    try {
      const db = await openIdb();
      await idbReq(db.transaction('blobs', 'readwrite').objectStore('blobs').put({ id, blob }));
      return true;
    } catch {
      memBlobs.set(id, blob);
      return false;
    }
  },
  async getLocal(id: string): Promise<Blob | null> {
    if (memBlobs.has(id)) return memBlobs.get(id)!;
    try {
      const db = await openIdb();
      const r: any = await idbReq(db.transaction('blobs').objectStore('blobs').get(id));
      return r?.blob ?? null;
    } catch {
      return null;
    }
  },
  async deleteLocal(id: string) {
    memBlobs.delete(id);
    try {
      const db = await openIdb();
      await idbReq(db.transaction('blobs', 'readwrite').objectStore('blobs').delete(id));
    } catch {
      /* ignorer */
    }
  },
  async uploadCloud(p: Platform, blob: Blob, type: string): Promise<{ assetId?: string; error?: string }> {
    if (!p.assets) return { error: 'Skylagring av filer er ikke tilgjengelig i denne visningen.' };
    const ok = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!ok.includes(type)) return { error: 'Denne filtypen kan bare lagres lokalt.' };
    try {
      const r = await p.assets.upload(blob, { type });
      return { assetId: r.id };
    } catch (e: any) {
      return { error: e?.code === 'too_large' ? 'Filen er for stor for skylagring (maks 20 MB).' : e?.code === 'quota_or_state' ? 'Lagringskvoten er full.' : 'Opplasting til skylagring feilet.' };
    }
  },
  async get(ref: BlobRef): Promise<Blob | null> {
    if (ref.localKey) {
      const b = await blobs.getLocal(ref.localKey);
      if (b) return b;
    }
    if (ref.assetId) {
      try {
        const r = await fetch('/_blob/' + ref.assetId);
        if (r.ok) {
          const b = await r.blob();
          if (ref.localKey) void blobs.putLocal(ref.localKey, b);
          return b;
        }
      } catch {
        /* ikke tilgjengelig */
      }
    }
    return null;
  },
  async remove(p: Platform, ref: BlobRef) {
    if (ref.localKey) await blobs.deleteLocal(ref.localKey);
    if (ref.assetId && p.assets) {
      try {
        await p.assets.delete(ref.assetId);
      } catch {
        /* allerede slettet */
      }
    }
  },
};
