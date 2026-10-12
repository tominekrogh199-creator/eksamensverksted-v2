// Kobling til plattformfunksjonene i Claude-artefakten. Alt er valgfritt:
// uten plattform kjører appen med lokal lagring og uten AI.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SampleFn {
  (input: string | { role: 'user' | 'assistant'; content: string }[], opts?: any): Promise<{ text: string; truncated: boolean; modelTierApplied?: string }>;
  json: <T = unknown>(input: string | { role: 'user' | 'assistant'; content: string }[], opts?: any) => Promise<T>;
  limits: () => Promise<{ maxPromptBytes: number; images?: { maxCount: number; maxInputBytes: number; mediaTypes: string[] }; tools?: { maxCount: number } }>;
}

export interface Platform {
  inViewer: boolean;
  db: any | null;
  user: any | null;
  assets: any | null;
  sample: SampleFn | null;
  downloads: any | null;
  uid: string | null;
  isOwner: boolean;
  imageLimits: { maxCount: number; maxInputBytes: number; mediaTypes: string[] } | null;
  maxPromptBytes: number;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

export async function initPlatform(): Promise<Platform> {
  const w = typeof window !== 'undefined' ? (window as any) : undefined;
  const claude = w?.claude;
  const empty: Platform = { inViewer: false, db: null, user: null, assets: null, sample: null, downloads: null, uid: null, isOwner: false, imageLimits: null, maxPromptBytes: 60000 };
  if (!claude || typeof claude.use !== 'function') return empty;
  const use = (name: string) => withTimeout<any>(claude.use(name).catch(() => null), 9000);
  const [db, user, assets, sample, downloads] = await Promise.all([use('db'), use('user'), use('assets'), use('sample'), use('downloads')]);
  let uid: string | null = null;
  let isOwner = false;
  if (user) {
    try {
      uid = await user.id();
      isOwner = await user.isOwner();
    } catch {
      /* ingen identitet */
    }
  }
  let imageLimits: Platform['imageLimits'] = null;
  let maxPromptBytes = 60000;
  if (sample) {
    try {
      const lim = await sample.limits();
      imageLimits = lim?.images ?? null;
      maxPromptBytes = lim?.maxPromptBytes ?? 60000;
    } catch {
      /* ingen grenser oppgitt */
    }
  }
  return { inViewer: true, db, user, assets, sample, downloads, uid, isOwner, imageLimits, maxPromptBytes };
}

export async function offerDownload(p: Platform, filename: string, data: Blob | string): Promise<'lagret' | 'avslått' | 'utilgjengelig' | string> {
  if (!p.downloads) return 'utilgjengelig';
  try {
    await p.downloads.save({ filename, data });
    return 'lagret';
  } catch (e: any) {
    if (e?.code === 'declined') return 'avslått';
    if (e?.code === 'rejected_extension' || e?.code === 'extension_not_enabled') return 'Filformatet kan ikke lastes ned her.';
    return 'utilgjengelig';
  }
}
