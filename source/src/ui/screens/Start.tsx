import { isExamSet } from '../../domain/types';
// Start: fortsett der du slapp, eller én anbefalt økt. Lite om gangen.

import { useState } from 'react';
import type { Attempt, GeneratedTask, SourceDoc } from '../../domain/types';
import { store, useStore } from '../../state/store';
import { recommend } from '../../learning/recommend';
import { createCourse } from '../../analysis/pipeline';
import { startDemoCourse, DEMO_FILES } from '../../demo/demo';
import { startSessionAndGo, startOriginalsAndGo, startExamLikeAndGo } from './Train';
import { originalPool } from '../../learning/originals';
import { canMakeExamLike, examTopicWeights } from '../../learning/examlike';
import { courseFamilies } from '../../learning/actions';
import { Icon } from '../components/Icon';
import { DemoBadge, Notice, Pill, relTime, Spinner } from '../components/common';

export function Welcome() {
  const [name, setName] = useState('');
  const busy = useStore((s) => s.ui.busy.demo);
  const storageKind = useStore((s) => s.ui.storageKind);
  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <section className="hero-card" style={{ padding: 'var(--s6) var(--s5)' }}>
        <span className="eyebrow">Eksamensverksted</span>
        <h1 style={{ fontSize: 'clamp(1.8rem, 5vw, 2.6rem)', maxWidth: '18ch' }}>Øv på din eksamen, ikke en tilfeldig en.</h1>
        <p>Last opp tidligere eksamener i faget ditt. Appen viser hva som går igjen, hva et godt svar må vise, og lar deg løse nye, kontrollerte oppgaver med en lærer som ser akkurat hvor det stopper.</p>
      </section>
      <section className="card stack">
        <h2>Opprett et fag</h2>
        <p className="small muted">Fagnavn er nok for å starte. Eksamensdato, tid og ambisjon kan du legge inn senere.</p>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createCourse(name);
            store.navigate({ name: 'arkiv' });
          }}
        >
          <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="f.eks. Innføring i samfunnsøkonomi" value={name} onChange={(e) => setName(e.target.value)} aria-label="Fagnavn" autoFocus />
          <button className="btn primary" type="submit" disabled={!name.trim()}>
            Opprett og last opp eksamener
          </button>
        </form>
      </section>
      <section className="card stack" style={{ borderColor: 'color-mix(in srgb, var(--amber) 40%, var(--line))' }}>
        <div className="row">
          <DemoBadge />
          <h3>Eller prøv med syntetisk demomateriale</h3>
        </div>
        <p className="small">Tre små, oppdiktede eksamenssett (DEMO A, B og C) med vurderingsforslag, en skannet side, et duplikat, en emnebeskrivelse og et håndskrevet elevforsøk. De sendes gjennom den samme opplastingen og analysen som dine egne filer. De er ikke eksamener fra noen skole.</p>
        <details className="disclosure">
          <summary className="small">Hva demoen inneholder</summary>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {DEMO_FILES.map((f) => (
              <li key={f.file}>
                <span className="mono">{f.file}</span>: {f.what}
              </li>
            ))}
          </ul>
        </details>
        <div>
          <button className="btn" onClick={() => startDemoCourse()} disabled={!!busy}>
            {busy ? <Spinner /> : <Icon name="sparkle" size={16} />} Start demo
          </button>
        </div>
      </section>
      <p className="xs faint">
        {storageKind === 'sky' ? 'Data lagres privat på kontoen din og synkroniseres mellom enhetene dine.' : storageKind === 'lokal' ? 'Data lagres i denne nettleseren.' : ''} AI-funksjoner bruker din egen Claude-kvote og spør om lov første gang.
      </p>
    </div>
  );
}

export function Start() {
  const course = useStore((s) => s.course());
  const docs = useStore((s) => s.docs());
  const atts = useStore((s) => s.attempts());
  const busy = useStore((s) => s.ui.busy);
  const rec = useStore((s) => recommend({ course: s.course(), docs: s.docs(), subtasks: s.currentSubtasks(), families: s.families(), evidence: s.evidence(), sessions: s.sessions() }));
  const pool = useStore(() => originalPool());
  const canAi = useStore(() => canMakeExamLike());
  const [making, setMaking] = useState<string | null>(null);
  if (!course) return null;
  const realQ = pool.flervalg.length + pool.kortsvar.length + pool.langsvar.length + pool.oppgave.length + pool.samling.length;
  const startReal = () => {
    if (pool.flervalg.length) return startOriginalsAndGo({ format: 'blandet', count: 6, reason: 'Spørsmål fra dine tidligere eksamener, blandet: flervalg med fasit og tekstsvar vurdert mot sensorveiledningen.' });
    if (pool.oppgave.length) return startOriginalsAndGo({ format: 'oppgave', count: 3, reason: 'Tre oppgaver fra eksamenssettene dine. Løs dem, skriv sluttsvaret, og sammenlikn med løsningsforslaget.' });
    if (pool.kortsvar.length || pool.langsvar.length) return startOriginalsAndGo({ format: 'blandet', count: 4, reason: 'Spørsmål fra dine tidligere eksamener.' });
    return startOriginalsAndGo({ format: 'samling', count: 5, reason: 'Fem oppgaver fra oppgavesamlingen, med løsningsforslaget etter hver.' });
  };
  const unfinished = [...atts].reverse().find((a) => a.status === 'pågår' && a.mode !== 'eksamen');
  const unfinishedTask = unfinished ? store.get<GeneratedTask>('gen', unfinished.taskRef.id) : undefined;
  const exams = docs.filter((d) => isExamSet(d) && d.status !== 'duplikat' && !d.supersededBy);
  const analyzed = exams.filter((d) => d.stages.analyse.status === 'ferdig').length;
  const needHelp = docs.filter((d) => d.status === 'trenger-hjelp');
  const processing = docs.filter((d) => d.status === 'behandles');
  const daysLeft = course.examDate ? Math.ceil((Date.parse(course.examDate) - Date.now()) / 86400000) : undefined;
  const go = () => {
    const p = rec.primary;
    if (p.kind === 'last-opp' || p.kind === 'analyse') return store.navigate({ name: 'arkiv' });
    if (p.kind === 'eksamen') return store.navigate({ name: 'eksamen' });
    startSessionAndGo({ type: p.kind === 'diagnose' ? 'nivå' : p.kind === 'repetisjon' ? 'repetisjon' : p.kind === 'blandet' ? 'oppgaver' : p.kind === 'grunnleggende' ? 'grunnleggende' : 'familie', families: p.families, level: p.level as never, style: p.style as never, count: p.count, reason: p.reason });
  };
  return (
    <div className="page">
      <div className="page-head">
        <div className="stack sm">
          <span className="eyebrow">
            {course.name} {course.demo ? <DemoBadge small /> : null}
          </span>
          <h1>{unfinished ? 'Fortsett der du slapp' : 'Hva er neste steg?'}</h1>
          {daysLeft !== undefined && daysLeft >= 0 ? <p className="muted">{daysLeft === 0 ? 'Eksamen er i dag.' : `${daysLeft} dager til eksamen.`}</p> : null}
        </div>
      </div>
      {unfinished && unfinishedTask ? (
        <button className="card raised row between" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => store.navigate({ name: 'tren', attemptId: unfinished.id, sessionId: unfinished.sessionId })}>
          <div className="stack sm">
            <span className="eyebrow">Uferdig oppgave · {relTime(unfinished.updatedAt)}</span>
            <strong style={{ fontSize: '1.1rem' }}>{unfinishedTask.title}</strong>
            <span className="small muted">
              {unfinished.parts.filter((p) => p.submitted).length} av {unfinished.parts.length} deloppgaver levert
            </span>
          </div>
          <span className="btn primary">
            Fortsett <Icon name="chevron" size={16} />
          </span>
        </button>
      ) : null}
      <section className="hero-card">
        <span className="eyebrow">Anbefalt økt</span>
        <h2>{rec.primary.title}</h2>
        <p>{rec.primary.reason}</p>
        <div className="row">
          <button className="btn primary big" onClick={go}>
            {rec.primary.kind === 'last-opp' ? 'Gå til arkivet' : 'Start'} <Icon name="chevron" />
          </button>
          {rec.alternatives[0] ? (
            <button className="btn ghost" onClick={() => store.navigate({ name: 'tren' })}>
              Andre valg
            </button>
          ) : null}
        </div>
      </section>
      {realQ ? (
        <section className="stack sm">
          <h3>Øv som på eksamen</h3>
          <div className="grid-3">
            <button className="choice" onClick={startReal}>
              <span className="icon">
                <Icon name="check" />
              </span>
              <strong>Ekte eksamensspørsmål</strong>
              <span className="small muted">{realQ} spørsmål fra settene dine, med fasit eller sensorveiledning.</span>
            </button>
            {canAi ? (
              <button className="choice" disabled={!!making} onClick={() => void startExamLikeAndGo(pool.flervalg.length || pool.kortsvar.length || pool.langsvar.length ? 5 : 3, setMaking)}>
                <span className="icon">{making ? <Spinner /> : <Icon name="sparkle" />}</span>
                <strong>Nye eksamensnære oppgaver</strong>
                <span className="small muted">{making ?? 'Samme format, nivå og temaer som eksamenene dine – nye situasjoner og tall.'}</span>
              </button>
            ) : null}
            <button className="choice" onClick={() => store.navigate({ name: 'eksamen' })}>
              <span className="icon">
                <Icon name="clock" />
              </span>
              <strong>Prøveeksamen</strong>
              <span className="small muted">På tid og uten hjelp, slik det blir på eksamensdagen.</span>
            </button>
          </div>
        </section>
      ) : null}
      {exams.length ? (
        <div className="row">
          <span className="small muted">Bygge opp fra bunnen?</span>
          <button className="btn small ghost" onClick={() => startSessionAndGo({ type: 'grunnleggende', families: [examTopicWeights().find((w) => courseFamilies().includes(w.kbId))?.kbId ?? courseFamilies()[0]], reason: 'Det temaet som kommer oftest på eksamenene dine, fra helt enkelt og oppover. Bruk «Eksempel» i hjelpen når du står fast.' })}>
            <Icon name="layers" size={16} /> Start helt grunnleggende
          </button>
          <button className="btn small ghost" onClick={() => startSessionAndGo({ type: 'nivå', families: courseFamilies(), reason: 'Korte oppgaver fra familiene i settene dine.' })}>
            <Icon name="target" size={16} /> Finn nivået mitt
          </button>
          <button className="btn small ghost" onClick={() => store.navigate({ name: 'tren' })}>
            Alle valg
          </button>
        </div>
      ) : null}
      <section className="card tight stack sm">
        <div className="row between">
          <strong className="small">Eksamensarkivet</strong>
          <button className="src-link" onClick={() => store.navigate({ name: 'arkiv' })}>
            Åpne
          </button>
        </div>
        {processing.length || Object.keys(busy).length ? <Spinner label={Object.values(busy)[0] ?? `${processing.length} dokumenter behandles`} /> : null}
        <span className="small muted">
          {exams.length ? `${analyzed} av ${exams.length} eksamenssett analysert.` : 'Ingen eksamenssett lastet opp ennå.'} {docs.length - exams.length > 0 ? `${docs.length - exams.length} andre dokumenter.` : ''}
        </span>
        {needHelp.length ? (
          <Notice tone="amber">
            <span className="small">
              {needHelp.map((d: SourceDoc) => d.meta.setLabel ?? d.fileName).join(', ')} trenger hjelp. <button className="src-link" onClick={() => store.navigate({ name: 'arkiv' })}>Se hva som mangler</button>
            </span>
          </Notice>
        ) : null}
      </section>
      {atts.length === 0 && exams.length ? (
        <p className="xs faint">Ingen historikk ennå. Det betyr at nivået ditt er ukjent, ikke at det er svakt.</p>
      ) : null}
      {atts.length ? (
        <div className="row">
          <Pill tone="outline">{atts.filter((a: Attempt) => a.status === 'levert').length} leverte forsøk</Pill>
          <button className="src-link" onClick={() => store.navigate({ name: 'utvikling' })}>
            Se utviklingen din
          </button>
        </div>
      ) : null}
    </div>
  );
}
