import { useEffect, useState } from 'react';
import { store, useStore, useSaveState, Route } from '../state/store';
import { Icon } from './components/Icon';
import { SourceViewer } from './components/SourceViewer';
import { Sheet, Pill, DemoBadge, Spinner } from './components/common';
import { Welcome } from './screens/Start';
import { PathHome } from './screens/Path';
import { Lesson } from './screens/Lesson';
import { Compete } from './screens/Compete';
import { AboutMe } from './screens/AboutMe';
import { XpBursts } from './components/Game';
import { Archive } from './screens/Archive';
import { MapScreen } from './screens/MapScreen';
import { Train } from './screens/Train';
import { Formula } from './screens/Formula';
import { Progress } from './screens/Progress';
import { Exam } from './screens/Exam';
import { Settings } from './screens/Settings';
import { Status } from './screens/Status';

// Fanelinjen på mobil: det du bruker hver dag. Resten ligger i menyen (trykk på fagnavnet).
const NAV: { name: Route['name']; label: string; short: string; icon: string; tab?: boolean }[] = [
  { name: 'start', label: 'Eksamensplan', short: 'Plan', icon: 'home', tab: true },
  { name: 'tren', label: 'Tren', short: 'Tren', icon: 'pencil', tab: true },
  { name: 'eksamen', label: 'Prøveeksamen', short: 'Prøve', icon: 'clock', tab: true },
  { name: 'arkiv', label: 'Eksamensarkiv', short: 'Arkiv', icon: 'archive', tab: true },
  { name: 'ommeg', label: 'Meg', short: 'Meg', icon: 'chart', tab: true },
  { name: 'utvikling', label: 'Min utvikling', short: 'Utvikling', icon: 'target' },
  { name: 'kart', label: 'Eksamenskart', short: 'Kart', icon: 'map' },
  { name: 'formel', label: 'Formler', short: 'Formler', icon: 'book' },
];

function go(name: Route['name']) {
  store.navigate({ name } as Route);
}

export function App() {
  const ready = useStore((s) => s.ui.ready);
  const note = useStore((s) => s.ui.loadingNote);
  const route = useStore((s) => s.ui.route);
  const course = useStore((s) => s.course());
  const toasts = useStore((s) => s.ui.toasts);
  const ai = useStore((s) => s.ui.aiStatus);
  const storageKind = useStore((s) => s.ui.storageKind);
  const reduced = useStore((s) => s.ui.reducedMotion);
  const busy = useStore((s) => s.ui.busy);
  const writeError = useStore((s) => s.ui.writeError);
  const loadError = useStore((s) => s.ui.loadError);
  const loadErrorLocal = useStore((s) => s.ui.loadErrorLocal);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduced);
  }, [reduced]);
  if (!ready && loadError)
    return (
      <div className="loading-screen">
        <div className="stack" style={{ alignItems: 'center', maxWidth: 440, textAlign: 'center', padding: 16 }}>
          <div className="brand-mark" style={{ width: 52, height: 52, fontSize: '1.5rem' }}>
            E
          </div>
          <p role="alert">{loadError}</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => (window as unknown as { __evRetryLoad?: () => void }).__evRetryLoad?.()}>
              Prøv igjen
            </button>
            {loadErrorLocal ? (
              <button className="btn ghost" onClick={() => (window as unknown as { __evUseLocal?: () => void }).__evUseLocal?.()}>
                Fortsett uten synk
              </button>
            ) : null}
          </div>
          {loadErrorLocal ? <p className="xs muted">«Fortsett uten synk» viser ikke fagene dine i skyen. Det du gjør da, lagres bare i denne nettleseren.</p> : null}
        </div>
      </div>
    );
  if (!ready)
    return (
      <div className="loading-screen">
        <div className="stack" style={{ alignItems: 'center' }}>
          <div className="brand-mark" style={{ width: 52, height: 52, fontSize: '1.5rem' }}>
            E
          </div>
          <Spinner label={note} />
        </div>
      </div>
    );
  const noCourse = !course;
  const active = route.name;
  const screen = noCourse ? (
    <Welcome />
  ) : active === 'start' || active === 'velkommen' ? (
    <PathHome />
  ) : active === 'laer' ? (
    // Ny leksjon (nytt tema eller quiz) = ny komponent, så ingen tilstand henger igjen.
    <Lesson key={route.name === 'laer' ? `${route.kbId}-${route.part ?? ''}` : 'laer'} />
  ) : active === 'konkurranse' ? (
    <Compete />
  ) : active === 'ommeg' ? (
    <AboutMe />
  ) : active === 'arkiv' ? (
    <Archive />
  ) : active === 'kart' ? (
    <MapScreen />
  ) : active === 'tren' ? (
    <Train />
  ) : active === 'formel' ? (
    <Formula />
  ) : active === 'utvikling' ? (
    <Progress />
  ) : active === 'eksamen' ? (
    <Exam />
  ) : active === 'innstillinger' ? (
    <Settings />
  ) : active === 'status' ? (
    <Status />
  ) : (
    <PathHome />
  );
  return (
    <div className="shell">
      <aside className="rail" aria-label="Hovedmeny">
        <div className="brand">
          <div className="brand-mark">E</div>
          <div>
            <div className="brand-name">Eksamensverksted</div>
            <div className="brand-sub">Øv på din egen eksamen</div>
          </div>
        </div>
        {!noCourse
          ? NAV.map((n) => (
              <button key={n.name} className="nav-item" aria-current={active === n.name ? 'page' : undefined} onClick={() => go(n.name)}>
                <Icon name={n.icon} />
                {n.label}
              </button>
            ))
          : null}
        <div className="rail-foot">
          {!noCourse ? (
            <>
              <button className="nav-item" aria-current={active === 'innstillinger' ? 'page' : undefined} onClick={() => go('innstillinger')}>
                <Icon name="settings" /> Fag og innstillinger
              </button>
            </>
          ) : null}
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">E</div>
          </div>
          {course ? (
            <button className="course-btn" onClick={() => setMenu(true)} aria-label="Bytt fag og se status">
              <span>{course.name}</span>
              {course.demo ? <DemoBadge small /> : null}
              <Icon name="chevronDown" size={16} />
            </button>
          ) : (
            <strong>Eksamensverksted</strong>
          )}
          <div className="topbar-spacer" />
          {Object.keys(busy).length ? <Spinner /> : null}
          <Pill tone={ai === 'tilgjengelig' || (ai === 'ukjent' && store.platform?.sample) ? 'accent' : 'outline'} title={store.ui.aiNote ?? 'AI-status for denne visningen'}>
            <Icon name="sparkle" size={12} /> <span className="pill-label">{ai === 'tilgjengelig' || (ai === 'ukjent' && store.platform?.sample) ? 'AI på' : 'Uten AI'}</span>
          </Pill>
          <SaveStatusPill storageKind={storageKind} />
        </header>
        {writeError ? (
          <div style={{ padding: '8px 16px' }}>
            <div className="notice red small" role="alert">
              {writeError} Endringene ligger trygt i nettleseren og sendes på nytt.{' '}
              <button className="src-link" onClick={() => store.retryFailed()}>
                Prøv igjen nå
              </button>
            </div>
          </div>
        ) : null}
        <main id="innhold">{screen}</main>
      </div>
      {!noCourse && !(active === 'eksamen' && route.name === 'eksamen' && route.examId && store.get<import('../domain/types').ExamSim>('exam', route.examId)?.status === 'pågår') ? (
        <nav className="tabbar" aria-label="Hovedmeny">
          {NAV.filter((n) => n.tab).map((n) => (
            <button key={n.name} className="tab" aria-current={active === n.name ? 'page' : undefined} onClick={() => go(n.name)}>
              <Icon name={n.icon} size={22} />
              {n.short}
            </button>
          ))}
        </nav>
      ) : null}
      {menu ? (
        <Sheet title="Fag og meny" narrow onClose={() => setMenu(false)}>
          <div className="stack sm">
            {store.courses().map((c) => (
              <button
                key={c.id}
                className="nav-item"
                aria-current={c.id === course?.id ? 'page' : undefined}
                onClick={() => {
                  const s = store.settings();
                  if (s) store.upsert({ ...s, activeCourseId: c.id });
                  store.setUi({ activeCourseId: c.id });
                  store.navigate({ name: 'start' });
                  setMenu(false);
                }}
              >
                <Icon name="book" /> {c.name} {c.demo ? <DemoBadge small /> : null}
              </button>
            ))}
            <button
              className="nav-item"
              onClick={() => {
                store.setUi({ activeCourseId: undefined });
                store.navigate({ name: 'velkommen' });
                setMenu(false);
              }}
            >
              <Icon name="plus" /> Nytt fag eller demo
            </button>
          </div>
          <hr className="divider" />
          <div className="stack sm">
            {NAV.filter((n) => !n.tab).map((n) => (
              <button key={n.name} className="nav-item" onClick={() => { go(n.name); setMenu(false); }}>
                <Icon name={n.icon} /> {n.label}
              </button>
            ))}
            <button className="nav-item" onClick={() => { go('innstillinger'); setMenu(false); }}>
              <Icon name="settings" /> Fag og innstillinger
            </button>
          </div>
        </Sheet>
      ) : null}
      <SourceViewer />
      <XpBursts />
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Viser om arbeidet er lagret: «Lagret», «Lagrer …», «Venter på nett» eller «Ikke lagret». */
function SaveStatusPill({ storageKind }: { storageKind: string }) {
  const sv = useSaveState();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);
  if (storageKind === 'minne')
    return (
      <Pill tone="outline" title="Nettleseren tillater ikke lagring. Arbeidet forsvinner når siden lukkes.">
        <Icon name="device" size={12} /> <span className="pill-label">Ikke lagret</span>
      </Pill>
    );
  const where = storageKind === 'sky' ? 'på kontoen din' : 'i denne nettleseren';
  const ago = sv.lastSavedAt ? Math.round((Date.now() - sv.lastSavedAt) / 60000) : null;
  const label = sv.state === 'lagrer' ? 'Lagrer …' : sv.state === 'venter' ? 'Venter på nett' : sv.state === 'feil' ? 'Ikke lagret' : sv.state === 'frakoblet' ? 'Frakoblet' : storageKind === 'sky' ? 'Lagret' : 'Lagret lokalt';
  const title =
    sv.state === 'lagret'
      ? `Alt er lagret ${where}${ago !== null ? (ago < 1 ? ' (nå nettopp)' : ` (for ${ago} min siden)`) : ''}.`
      : `${sv.pending} endring${sv.pending === 1 ? '' : 'er'} venter på å bli lagret ${where}. ${sv.message ?? ''}`.trim();
  return (
    <Pill tone={sv.state === 'feil' || sv.state === 'frakoblet' ? 'red' : sv.state === 'venter' ? 'outline' : 'outline'} title={title}>
      <Icon name={storageKind === 'sky' ? 'cloud' : 'device'} size={12} />{' '}
      <span className="pill-label" aria-live="polite">
        {label}
      </span>
    </Pill>
  );
}
