import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './styles/app.css';
import { App } from './ui/App';
import { store } from './state/store';
import { initPlatform } from './storage/platform';
import { chooseBackend, type Backend } from './storage/backend';
import { configurePdfWorker } from './ingest/pdf';
import { resumeInterrupted, migrateDocs } from './analysis/pipeline';
import type { Route } from './state/store';
import type { SettingsRec } from './domain/types';
import { setOutboxScope } from './storage/outbox';
import { findLeftovers, markLocalOwner } from './storage/leftovers';
import { cleanupCandidates, runCleanup } from './storage/cleanup';

(window as unknown as { __eksamensverksted: unknown }).__eksamensverksted = { store };

// Feilsiden ved oppstart har «Prøv igjen» og (når skyen ikke svarer) «Fortsett uten synk».
let resolveChoice: ((c: 'retry' | 'local') => void) | null = null;
(window as unknown as { __evRetryLoad: () => void }).__evRetryLoad = () => resolveChoice?.('retry');
(window as unknown as { __evUseLocal: () => void }).__evUseLocal = () => resolveChoice?.('local');
const waitChoice = () => new Promise<'retry' | 'local'>((r) => (resolveChoice = r));

const errText = (what: string, e: unknown) => {
  const code = (e as { code?: string })?.code;
  return `${what}${code ? ` (${code})` : ''}. Ingenting er slettet. Prøv igjen om litt.`;
};

let lastSync = new Date().toISOString();

async function boot() {
  configurePdfWorker('vendor/pdf.worker.min.js');
  try {
    if (localStorage.getItem('ev-reduced-motion') === '1') store.setUi({ reducedMotion: true });
  } catch {
    /* lagring er valgfri */
  }
  store.setUi({ loadingNote: 'Kobler til lagring …' });
  const platform = await initPlatform();
  store.platform = platform;
  setOutboxScope(platform.uid);

  // 1. Velg lagring. Svarer ikke skylagringen, vises en feilside, ikke en tom app.
  let backend: Backend | null = null;
  let allowLocal = false;
  while (!backend) {
    try {
      backend = await chooseBackend(platform, { allowLocal });
    } catch (e) {
      store.setUi({ loadError: errText('Får ikke kontakt med lagringen der fagene dine ligger', e), loadErrorLocal: true });
      allowLocal = (await waitChoice()) === 'local';
      store.setUi({ loadError: undefined, loadingNote: 'Kobler til lagring …' });
    }
  }
  store.backend = backend;
  if (allowLocal) markLocalOwner(platform.uid);
  store.setUi({
    storageKind: backend.kind,
    storageNote: allowLocal ? 'Skylagringen svarte ikke. Det du gjør nå, lagres bare i denne nettleseren.' : backend.describe,
    aiStatus: platform.sample ? 'ukjent' : 'ikke-tilgjengelig',
    aiNote: platform.sample ? undefined : 'AI er ikke tilgjengelig i denne visningen.',
    loadingNote: 'Henter fagene dine …',
  });

  // 2. Hent alt. Feiler det, vises «Prøv igjen» i stedet for en tom app
  //    (det ville se ut som om fagene var borte).
  for (;;) {
    try {
      const started = new Date().toISOString();
      const all = await backend.loadAll((n) => store.setUi({ loadingNote: `Henter fagene dine … (${n})` }));
      store.load(all);
      lastSync = started;
      break;
    } catch (e) {
      store.setUi({ loadError: errText('Kunne ikke hente dataene dine fra lagringen', e), loadErrorLocal: false });
      await waitChoice();
      store.setUi({ loadError: undefined, loadingNote: 'Henter fagene dine …' });
    }
  }

  // 3. Endringer som ikke ble bekreftet sist (siden ble lukket for tidlig), sendes nå.
  const replayed = await store.replayOutbox();
  // Arbeid som ble lagret bare i nettleseren da skyen ikke svarte, tilbys lastet opp.
  if (backend.kind === 'sky') {
    const left = await findLeftovers(platform.uid, (k) => store.getByKey(k));
    if (left) store.setUi({ localLeftovers: left });
  }

  const s = store.list<SettingsRec>('settings')[0];
  const courses = store.courses();
  const active = s?.activeCourseId && courses.some((c) => c.id === s.activeCourseId) ? s.activeCourseId : courses[0]?.id;
  const hash = (location.hash || '').replace('#', '');
  const valid: Route['name'][] = ['start', 'arkiv', 'kart', 'tren', 'formel', 'utvikling', 'eksamen', 'innstillinger', 'status', 'ommeg'];
  store.setUi({ activeCourseId: active, ready: true, route: active ? { name: valid.includes(hash as Route['name']) ? (hash as 'start') : 'start' } : { name: 'velkommen' } });
  if (replayed) store.toast(`${replayed} endring${replayed === 1 ? '' : 'er'} som ikke rakk å bli lagret sist, er lagret nå.`, 'info');
  // Rester av dokumenter som ble slettet midt i analysen, ryddes stille bort.
  const orphans = cleanupCandidates({ orphansOnly: true }).items;
  if (orphans.length) runCleanup(orphans);
  const m = await migrateDocs();
  if (m) store.toast(`${m} dokument${m === 1 ? '' : 'er'} leses og analyseres på nytt med forbedret lesing av bilder, figurer og flervalg.`, 'info');
  const n = m ? 0 : await resumeInterrupted();
  if (n) store.toast(`Fortsetter analysen av ${n} dokument${n === 1 ? '' : 'er'} der den stoppet.`, 'info');

  // 4. Lagre med en gang når siden skjules eller lukkes (mobil sender ikke alltid «beforeunload»).
  window.addEventListener('beforeunload', (e) => {
    if (store.hasPendingWrites()) {
      void store.flush();
      e.preventDefault();
    }
  });
  window.addEventListener('pagehide', () => void store.flush());
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      void store.flush();
    } else if (Date.now() - hiddenAt > 20000) void syncFromOtherDevices();
  });
  // Hent endringer fra andre enheter jevnlig mens appen er åpen.
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncFromOtherDevices();
  }, 120000);
}

let syncing = false;
async function syncFromOtherDevices() {
  const b = store.backend;
  if (!b?.loadSince || syncing) return;
  syncing = true;
  try {
    const started = new Date(Date.now() - 5000).toISOString();
    const list = await b.loadSince(lastSync);
    store.mergeRemote(list);
    lastSync = started;
  } catch {
    /* prøver igjen neste gang */
  } finally {
    syncing = false;
  }
}

const root = createRoot(document.getElementById('app')!);
root.render(<App />);
void boot();
