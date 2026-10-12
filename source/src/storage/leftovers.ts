// «Fortsett uten synk»: når skylagringen ikke svarte, ble arbeidet lagret bare i denne
// nettleseren. Neste gang skyen svarer, tilbyr appen å laste det opp, i stedet for at det
// blir liggende usynlig. Bare for samme bruker som lagret det (nettleseren kan deles).

import type { Entity } from '../domain/types';
import { entityKey } from '../domain/types';
import { LocalBackend } from './backend';

const OWNER_KEY = 'ev-local-owner';
let found: Entity[] = [];

export function markLocalOwner(uid: string | null) {
  try {
    if (uid) localStorage.setItem(OWNER_KEY, uid);
  } catch {
    /* valgfritt */
  }
}

/** Finner lokalt lagrede endringer som mangler i skyen eller er nyere der. */
export async function findLeftovers(uid: string | null, inCloud: (key: string) => Entity | undefined): Promise<number> {
  let owner: string | null = null;
  try {
    owner = localStorage.getItem(OWNER_KEY);
  } catch {
    return 0;
  }
  if (!uid || owner !== uid) return 0;
  try {
    const local = await new LocalBackend().loadAll();
    found = local.filter((e) => {
      const c = inCloud(entityKey(e));
      return !c || (e.updatedAt ?? '') > (c.updatedAt ?? '');
    });
    if (!found.length) await clearLeftovers();
    return found.length;
  } catch {
    return 0;
  }
}

export function leftovers(): Entity[] {
  return found;
}

export async function clearLeftovers() {
  const lb = new LocalBackend();
  try {
    for (const e of await lb.loadAll()) await lb.remove(e);
  } catch {
    /* beste forsøk */
  }
  found = [];
  try {
    localStorage.removeItem(OWNER_KEY);
  } catch {
    /* valgfritt */
  }
}
