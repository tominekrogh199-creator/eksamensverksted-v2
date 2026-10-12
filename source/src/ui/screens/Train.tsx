// Tren: velg økt, løs oppgaver i arbeidsflaten og få oppsummering.

import { useEffect, useState } from 'react';
import type { Attempt, GeneratedTask, SessionRec, VariationLevel, GenStyle } from '../../domain/types';
import { store, useStore } from '../../state/store';
import { planSession, startAttempt, endSession, courseFamilies, patchPart, planOriginalSession } from '../../learning/actions';
import { originalPool } from '../../learning/originals';
import type { SourceDoc } from '../../domain/types';
import { familiesFor, getFamily } from '../../families';
import { LEVEL_LABEL, STYLE_LABEL } from '../../generator/generate';
import { Workspace } from './Workspace';
import { Icon } from '../components/Icon';
import { DemoBadge, Notice, Pill, Progress, relTime } from '../components/common';
import { demoEquilibriumTask } from '../../demo/demo';
import { recommend } from '../../learning/recommend';
import { canMakeExamLike, examTopicWeights, startExamLikeSession, pendingGeneration, formatPool, type ExamLikeFormat } from '../../learning/examlike';
import { aiAvailable } from '../../ai/client';
import { Spinner } from '../components/common';

export { startSessionAndGo, startOriginalsAndGo } from '../go';
import { startSessionAndGo, startOriginalsAndGo } from '../go';

export async function startExamLikeAndGo(count: number, onProgress: (n: string | null) => void, format?: ExamLikeFormat, kbIds?: string[]) {
  onProgress('Lager første oppgave …');
  const r = await startExamLikeSession(count, (n) => onProgress(n), format, kbIds);
  onProgress(null);
  if (!r.session || !r.first) {
    store.toast(r.error ?? 'Klarte ikke å lage oppgaver akkurat nå.', 'feil');
    return;
  }
  const att = startAttempt(r.first, 'læring', r.session.id);
  store.navigate({ name: 'tren', attemptId: att.id, sessionId: r.session.id });
}

function ExamLikeCard() {
  const can = useStore(() => canMakeExamLike());
  const weights = useStore(() => examTopicWeights());
  const n = useStore(() => ({ flervalg: formatPool('flervalg').length, kortsvar: formatPool('kortsvar').length, langsvar: formatPool('langsvar').length, regne: formatPool('regne').length }));
  const [busy, setBusy] = useState<string | null>(null);
  if (!n.flervalg && !n.kortsvar && !n.langsvar && !n.regne) return null;
  const textOnly = !n.regne;
  const top = weights
    .slice(0, 4)
    .map((w) => getFamily(w.kbId)?.shortName)
    .filter(Boolean);
  if (!can)
    return aiAvailable() ? null : (
      <section className="card stack sm">
        <span className="eyebrow">Eksamensnære oppgaver</span>
        <p className="small muted">Nye oppgaver i samme format som eksamenene dine lages med AI, som ikke er tilgjengelig i denne visningen. Øv på de ekte eksamensspørsmålene under i mellomtiden.</p>
      </section>
    );
  return (
    <section className="card stack" style={{ borderColor: 'color-mix(in srgb, var(--accent) 45%, var(--line))' }}>
      <div className="stack sm" style={{ gap: 2 }}>
        <span className="eyebrow">Mest eksamensrelevant</span>
        <h3>Eksamensnære oppgaver</h3>
      </div>
      <p className="small muted">
        Nye oppgaver i samme format, på samme nivå og fra de samme temaene som eksamenene dine{top.length ? ` – oftest ${top.join(', ')}` : ''}. Temaer som kommer ofte på eksamen, og temaer du har slitt med, kommer oftere.{' '}
        {textOnly ? 'Flervalg har kontrollert fasit; tekstsvar vurderes mot en vurderingsramme i samme stil som sensorveiledningen.' : 'Kretsen eller oppgaven beskrives i tekst. Fasiten er regnet ut to ganger uavhengig av hverandre, og svarene dine sjekkes med matematikkmotoren.'}
      </p>
      {busy ? (
        <Spinner label={busy} />
      ) : (
        <div className="row">
          <button className="btn primary" onClick={() => void startExamLikeAndGo(n.flervalg || n.kortsvar || n.langsvar ? 5 : 4, setBusy)}>
            <Icon name="sparkle" size={16} /> {textOnly ? '5 blandede som på eksamen' : n.flervalg || n.kortsvar || n.langsvar ? '5 blandede som på eksamen' : '4 nye regneoppgaver som på eksamen'}
          </button>
          {n.regne && (n.flervalg || n.kortsvar || n.langsvar) ? (
            <button className="btn" onClick={() => void startExamLikeAndGo(3, setBusy, 'regne')}>
              <Icon name="pencil" size={16} /> 3 nye regneoppgaver
            </button>
          ) : null}
          {n.flervalg ? (
            <button className="btn" onClick={() => void startExamLikeAndGo(10, setBusy, 'flervalg')}>
              <Icon name="check" size={16} /> 10 nye flervalg
            </button>
          ) : null}
          {n.kortsvar ? (
            <button className="btn" onClick={() => void startExamLikeAndGo(3, setBusy, 'kortsvar')}>
              <Icon name="pencil" size={16} /> 3 nye kortsvar
            </button>
          ) : null}
          {n.langsvar ? (
            <button className="btn" onClick={() => void startExamLikeAndGo(1, setBusy, 'langsvar')}>
              <Icon name="layers" size={16} /> En ny lengre oppgave
            </button>
          ) : null}
        </div>
      )}
      <p className="xs faint">Den første oppgaven er klar etter noen sekunder; resten lages mens du jobber.</p>
    </section>
  );
}

function OriginalsCard() {
  const pool = useStore(() => originalPool());
  const total = pool.flervalg.length + pool.kortsvar.length + pool.langsvar.length + pool.oppgave.length + pool.samling.length;
  if (!total) return null;
  const del3Sets = [...new Set(pool.langsvar.filter((s) => s.part === 3).map((s) => s.docId))];
  return (
    <section className="card stack">
      <div className="row between">
        <div className="stack sm" style={{ gap: 2 }}>
          <span className="eyebrow">Fra eksamenssettene dine</span>
          <h3>Øv på de ekte eksamensspørsmålene</h3>
        </div>
      </div>
      <p className="small muted">
        {[
          pool.flervalg.length ? `${pool.flervalg.length} flervalg med fasit` : '',
          pool.kortsvar.length ? `${pool.kortsvar.length} kortsvar` : '',
          pool.langsvar.length ? `${pool.langsvar.length} spørsmål fra lengre oppgaver` : '',
          pool.oppgave.length ? `${pool.oppgave.length} eksamensoppgaver med løsningsforslag` : '',
          pool.samling.length ? `${pool.samling.length} oppgaver i oppgavesamlingen` : '',
        ]
          .filter(Boolean)
          .join(' · ')}
        .{' '}
        {pool.oppgave.length || pool.samling.length
          ? 'Oppgaven vises slik den står i originalen. Sluttsvar sjekkes mot løsningsforslaget der det kan leses, og hele løsningen vises når du har levert.'
          : 'Flervalg rettes mot fasiten i kilden; forklaringer vurderes mot punktene i sensorveiledningen (med AI når det er tilgjengelig, ellers vurderer du selv).'}
      </p>
      <div className="row">
        {pool.flervalg.length ? (
          <button className="btn primary" onClick={() => startOriginalsAndGo({ format: 'flervalg', count: 10, reason: 'Ti flervalgsspørsmål fra tidligere eksamener, blandet. Du får fasit etter hvert svar.' })}>
            <Icon name="check" size={16} /> 10 flervalg
          </button>
        ) : null}
        {pool.kortsvar.length ? (
          <button className="btn" onClick={() => startOriginalsAndGo({ format: 'kortsvar', count: 3, reason: 'Tre kortsvarsspørsmål (Del 2). Skriv som på eksamen, maks 200 ord.' })}>
            <Icon name="pencil" size={16} /> 3 kortsvar
          </button>
        ) : null}
        {pool.oppgave.length ? (
          <button className={pool.flervalg.length ? 'btn' : 'btn primary'} onClick={() => startOriginalsAndGo({ format: 'oppgave', count: 3, reason: 'Tre oppgaver fra eksamenssettene. Løs dem, skriv sluttsvaret, og sammenlikn med løsningsforslaget.' })}>
            <Icon name="pencil" size={16} /> 3 eksamensoppgaver
          </button>
        ) : null}
        {pool.samling.length ? (
          <button className="btn" onClick={() => startOriginalsAndGo({ format: 'samling', count: 5, reason: 'Fem oppgaver fra oppgavesamlingen, med løsningsforslaget etter hver.' })}>
            <Icon name="layers" size={16} /> 5 fra oppgavesamlingen
          </button>
        ) : null}
        {del3Sets.length ? (
          <button
            className="btn"
            onClick={() => {
              const docId = del3Sets[Math.floor(Math.random() * del3Sets.length)];
              const ids = pool.langsvar.filter((s) => s.docId === docId && s.part === 3).sort((a, b) => a.sub.localeCompare(b.sub)).map((s) => s.id);
              const label = store.get<SourceDoc>('doc', docId)?.meta.setLabel ?? '';
              startOriginalsAndGo({ format: 'langsvar', count: ids.length, subtaskIds: ids, keepOrder: true, reason: `Del 3 fra ${label}: hele oppgaven med alle delspørsmålene i rekkefølge.` });
            }}
          >
            <Icon name="layers" size={16} /> En hel Del 3
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function Train() {
  const route = useStore((s) => s.ui.route);
  if (route.name !== 'tren') return null;
  if (route.attemptId) return <SessionRunner attemptId={route.attemptId} sessionId={route.sessionId} />;
  if (route.sessionId) return <SessionSummary sessionId={route.sessionId} />;
  return <TrainSetup setup={route.setup} />;
}

function SessionRunner({ attemptId, sessionId }: { attemptId: string; sessionId?: string }) {
  const session = useStore((s) => s.get<SessionRec>('session', sessionId));
  const att = useStore((s) => s.get<Attempt>('attempt', attemptId));
  const [waiting, setWaiting] = useState(false);
  useEffect(() => setWaiting(false), [attemptId]);
  if (!att) return <div className="page"><Notice tone="amber">Fant ikke forsøket.</Notice></div>;
  // En «ny variant» står ikke i planen; da fortsetter økten fra der den var.
  const planned = session ? session.plan.taskIds.indexOf(att.taskRef.id) : -1;
  const idx = session ? (planned >= 0 ? planned : Math.min(session.currentIndex ?? 0, session.plan.taskIds.length - 1)) : -1;
  const total = session?.plan.taskIds.length ?? 0;
  const next = async () => {
    if (!session) {
      store.navigate({ name: 'tren' });
      return;
    }
    const ni = idx + 1;
    // Eksamensnære oppgaver lages i bakgrunnen: vent på neste hvis den ikke er klar ennå.
    const pending = pendingGeneration(session.id);
    if (ni >= session.plan.taskIds.length && pending) {
      setWaiting(true);
      while (pendingGeneration(session.id) && (store.get<SessionRec>('session', session.id)?.plan.taskIds.length ?? 0) <= ni) await new Promise((r) => setTimeout(r, 400));
      setWaiting(false);
    }
    const fresh = store.get<SessionRec>('session', session.id) ?? session;
    if (ni < fresh.plan.taskIds.length) {
      const t = store.get<GeneratedTask>('gen', fresh.plan.taskIds[ni]);
      if (!t) return;
      const existing = store.attempts().find((a) => a.taskRef.id === t.id && a.sessionId === session.id);
      const na = existing ?? startAttempt(t, att.mode, session.id);
      store.upsert({ ...fresh, currentIndex: ni });
      store.navigate({ name: 'tren', attemptId: na.id, sessionId: session.id });
    } else {
      endSession(session.id);
      store.navigate({ name: 'tren', sessionId: session.id });
    }
  };
  return (
    <div className="page">
      {session ? (
        <div className="stack sm">
          <div className="row between">
            <span className="small muted">
              {sessionTitle(session.type)} · oppgave {Math.max(1, idx + 1)} av {total}
            </span>
            <button className="btn small ghost" onClick={() => { endSession(session.id); store.navigate({ name: 'tren', sessionId: session.id }); }}>
              Avslutt økten
            </button>
          </div>
          <Progress value={Math.max(0, idx)} max={total} label="Framdrift i økten" />
          {session.plan.reason && idx === 0 ? <p className="small muted">{session.plan.reason}</p> : null}
          {waiting ? <Spinner label="Lager neste oppgave …" /> : null}
        </div>
      ) : null}
      <Workspace key={attemptId} attemptId={attemptId} onNext={() => void next()} onExit={() => store.navigate({ name: 'tren' })} />
    </div>
  );
}

export function sessionTitle(t: SessionRec['type']) {
  return ({ grunnleggende: 'Helt grunnleggende', nivå: 'Finn nivået mitt', oppgaver: 'Rett til oppgaver', familie: 'Trening', repetisjon: 'Repetisjon', reparasjon: 'Reparasjonsøkt', fri: 'Egen økt', eksamensspm: 'Eksamensspørsmål', eksamensnær: 'Eksamensnære oppgaver' } as Record<string, string>)[t] ?? 'Økt';
}

function SessionSummary({ sessionId }: { sessionId: string }) {
  const s = useStore((st) => st.get<SessionRec>('session', sessionId));
  const atts = useStore((st) => st.attempts().filter((a) => a.sessionId === sessionId));
  if (!s) return null;
  const sum = s.summary ?? endSession(sessionId)?.summary;
  const indep = atts.some((a) => a.parts.some((p) => p.assessment?.answer.verdict === 'riktig' && p.assessment.method.verdict === 'riktig') && a.help.every((h) => h.level <= 1));
  return (
    <div className="page">
      <div className="stack sm">
        <span className="eyebrow">Økten er ferdig</span>
        <h1>{sessionTitle(s.type)}</h1>
        {indep ? (
          <span className="celebrate">
            <Icon name="check" size={18} stroke={2.6} /> Du løste minst én oppgave helt selv
          </span>
        ) : null}
      </div>
      <div className="grid-3">
        <div className="card stack sm">
          <span className="eyebrow" style={{ color: 'var(--teal)' }}>
            Hva jeg fikk til selv
          </span>
          {sum?.selv.length ? sum.selv.map((x, i) => <p key={i} className="small">{x}</p>) : <p className="small muted">Ingen selvstendige løsninger registrert i denne økten.</p>}
        </div>
        <div className="card stack sm">
          <span className="eyebrow" style={{ color: 'var(--amber)' }}>
            Hva jeg fortsatt trengte hjelp til
          </span>
          {sum?.hjelp.length ? sum.hjelp.map((x, i) => <p key={i} className="small">{x}</p>) : <p className="small muted">Ingenting registrert.</p>}
        </div>
        <div className="card stack sm">
          <span className="eyebrow" style={{ color: 'var(--accent-2)' }}>
            Neste økt
          </span>
          {sum?.neste.map((x, i) => (
            <p key={i} className="small">
              {x}
            </p>
          ))}
        </div>
      </div>
      <div className="row">
        <button className="btn primary" onClick={() => store.navigate({ name: 'start' })}>
          Til start
        </button>
        <button className="btn" onClick={() => store.navigate({ name: 'utvikling' })}>
          Se utviklingen min
        </button>
        <button className="btn ghost" onClick={() => store.navigate({ name: 'tren' })}>
          Ny økt
        </button>
      </div>
    </div>
  );
}

function TrainSetup({ setup }: { setup?: { families?: string[]; level?: number | 'blandet'; style?: string; count?: number; minutes?: number } }) {
  const course = useStore((s) => s.course());
  const inCourse = useStore(() => courseFamilies());
  const atts = useStore((s) => s.attempts().filter((a) => a.status === 'pågår' && a.mode !== 'eksamen'));
  const [fams, setFams] = useState<string[]>(setup?.families ?? inCourse.slice(0, 1));
  const [level, setLevel] = useState<VariationLevel | 'blandet'>((setup?.level as VariationLevel) ?? 1);
  const [style, setStyle] = useState<GenStyle | 'variert'>((setup?.style as GenStyle) ?? 'standard');
  const [count, setCount] = useState(setup?.count ?? 3);
  const [minutes, setMinutes] = useState<number | ''>(setup?.minutes ?? '');
  const rec = useStore((s) => recommend({ course: s.course(), docs: s.docs(), subtasks: s.currentSubtasks(), families: s.families(), evidence: s.evidence(), sessions: s.sessions() }));
  const present = new Set(useStore((s) => s.currentSubtasks().map((x) => x.analysis.familyKbId)));
  // Temaene sortert etter hvor ofte de kommer på eksamenene dine.
  const prioritized = useStore(() => examTopicWeights().map((w) => w.kbId)).filter((k) => inCourse.includes(k));
  return (
    <div className="page">
      <div className="page-head">
        <div className="stack sm">
          <span className="eyebrow">Tren</span>
          <h1>Hva vil du gjøre nå?</h1>
          <p className="muted">
            Anbefalt: <strong>{rec.primary.title}</strong>. {rec.primary.reason}
          </p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => store.navigate({ name: 'formel' })}>
            <Icon name="book" size={16} /> Forstå formelen
          </button>
          <button className="btn" onClick={() => store.navigate({ name: 'eksamen' })}>
            <Icon name="clock" size={16} /> Eksamensmodus
          </button>
        </div>
      </div>
      <ExamLikeCard />
      <OriginalsCard />
      <h3 style={{ marginTop: 'var(--s2)' }}>Bygg opp ferdighetene</h3>
      <div className="grid-3">
        <button className="choice" onClick={() => startSessionAndGo({ type: 'grunnleggende', families: [prioritized[0] ?? fams[0] ?? inCourse[0]], reason: 'Vi starter med gjennomarbeidede eksempler der du fullfører stadig flere steg selv, og trener delferdighetene oppgaven bygger på.' })}>
          <span className="icon">
            <Icon name="layers" />
          </span>
          <strong>Start helt grunnleggende</strong>
          <span className="small muted">Eksempler med gradvis færre steg, deretter korte delferdigheter og én hel oppgave.</span>
        </button>
        <button className="choice" onClick={() => startSessionAndGo({ type: 'nivå', families: prioritized.length ? prioritized : inCourse, reason: 'Korte oppgaver fra temaene som kommer oftest på eksamenene dine. Ingen historikk betyr ukjent nivå, ikke svakt nivå.' })}>
          <span className="icon">
            <Icon name="target" />
          </span>
          <strong>Finn nivået mitt</strong>
          <span className="small muted">Korte oppgaver fra temaene som kommer oftest på eksamen, pluss et par litt vanskeligere.</span>
        </button>
        <button className="choice" onClick={() => startSessionAndGo({ type: 'oppgaver', families: prioritized.length ? prioritized : inCourse, count: 4, reason: 'Blandede øvingsoppgaver på ulike nivåer fra temaene i eksamenene dine.' })}>
          <span className="icon">
            <Icon name="pencil" />
          </span>
          <strong>Blandede øvingsoppgaver</strong>
          <span className="small muted">Genererte regne- og forståelsesoppgaver fra temaene i eksamenene dine. Hjelpen er der hvis du trenger den.</span>
        </button>
      </div>
      {course?.demo ? (
        <div className="card stack sm" style={{ borderColor: 'color-mix(in srgb, var(--amber) 40%, var(--line))' }}>
          <div className="row">
            <DemoBadge />
            <strong>Demo: det kontrollerbare eksempelet</strong>
          </div>
          <p className="small">Qd = 120 − 2P og Qs = 20 + 3P. Et elevforsøk ender med P = 500. Se hvordan læreren finner stedet der det stopper, og hvordan et utydelig bilde avklares før noe regnes som feil.</p>
          <div className="row">
            <button
              className="btn"
              onClick={() => {
                const t = store.upsert(demoEquilibriumTask(course.id));
                const a = startAttempt(t, 'læring');
                patchPart(a, 'a', { lines: [{ text: '120 − 2P = 20 + 3P → 100 = 5P → P = 500', source: 'typed' }] });
                store.navigate({ name: 'tren', attemptId: a.id });
              }}
            >
              Åpne med forsøket skrevet inn
            </button>
            <button
              className="btn"
              onClick={() => {
                const t = store.upsert(demoEquilibriumTask(course.id));
                const a = startAttempt(t, 'læring');
                store.navigate({ name: 'tren', attemptId: a.id });
                store.toast('Trykk «Bruk demobildet» under utregningsfeltet.', 'info');
              }}
            >
              Åpne og bruk demobildet
            </button>
            <button className="btn ghost" onClick={() => store.navigate({ name: 'formel', formulaId: 'f-pstar' })}>
              Endre kurvene i Forstå formelen
            </button>
          </div>
        </div>
      ) : null}
      <section className="card stack">
        <h3>Sett sammen din egen økt</h3>
        <div className="stack sm">
          <span className="label">Oppgavefamilier</span>
          <div className="row">
            {[...familiesFor(present)].sort((a, b) => Number(present.has(b.id)) - Number(present.has(a.id))).map((f) => (
              <label key={f.id} className="pill" style={{ cursor: 'pointer', padding: '8px 12px', background: fams.includes(f.id) ? 'var(--accent-soft)' : undefined, borderColor: fams.includes(f.id) ? 'var(--accent-line)' : undefined }}>
                <input type="checkbox" checked={fams.includes(f.id)} onChange={(e) => setFams(e.target.checked ? [...fams, f.id] : fams.filter((x) => x !== f.id))} style={{ marginRight: 6 }} />
                {f.shortName}
                {present.has(f.id) ? <span className="faint"> · i settene dine</span> : null}
              </label>
            ))}
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="t-level">Nivå</label>
            <select id="t-level" className="input" value={String(level)} onChange={(e) => setLevel(e.target.value === 'blandet' ? 'blandet' : (Number(e.target.value) as VariationLevel))}>
              {([1, 2, 3, 4] as VariationLevel[]).map((l) => (
                <option key={l} value={l}>
                  {l}. {LEVEL_LABEL[l]}
                </option>
              ))}
              <option value="blandet">Blandet</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-style">Type</label>
            <select id="t-style" className="input" value={style} onChange={(e) => setStyle(e.target.value as GenStyle | 'variert')}>
              {(['standard', 'delferdighet', 'fading', 'finn-feilen'] as GenStyle[]).filter((s) => s === 'standard' || fams.some((id) => getFamily(id)?.templates.some((t) => t.style === s))).map((s) => (
                <option key={s} value={s}>
                  {STYLE_LABEL[s]}
                </option>
              ))}
              <option value="variert">Variert</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-count">Antall oppgaver</label>
            <input id="t-count" className="input" type="number" min={1} max={10} value={count} onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} />
          </div>
          <div className="field">
            <label htmlFor="t-min">Ønsket tid (minutter, valgfritt)</label>
            <input id="t-min" className="input" type="number" min={5} max={180} value={minutes} onChange={(e) => setMinutes(e.target.value ? Number(e.target.value) : '')} />
          </div>
        </div>
        <div className="row">
          <button className="btn primary" disabled={!fams.length} onClick={() => startSessionAndGo({ type: 'fri', families: fams, level, style, count, minutes: minutes || undefined, reason: `${fams.map((f) => getFamily(f)?.shortName).join(', ')} · ${level === 'blandet' ? 'blandet nivå' : LEVEL_LABEL[level as VariationLevel].toLowerCase()}` })}>
            <Icon name="sparkle" size={16} /> Lag oppgaver og start
          </button>
          <span className="xs muted">Oppgavene lages fra kontrollerte maler, og fasit regnes ut med kode. Nesten like oppgaver i samme økt unngås.</span>
        </div>
      </section>
      {atts.length ? (
        <section className="stack sm">
          <h3>Uferdige forsøk</h3>
          {atts.slice(-5).reverse().map((a) => {
            const t = store.get<GeneratedTask>('gen', a.taskRef.id);
            return (
              <button key={a.id} className="card tight row between" style={{ cursor: 'pointer', textAlign: 'left' }} onClick={() => store.navigate({ name: 'tren', attemptId: a.id, sessionId: a.sessionId })}>
                <span>
                  <strong>{t?.title ?? 'Oppgave'}</strong> <span className="small muted">· startet {relTime(a.startedAt)}</span>
                </span>
                <Pill tone="accent">Fortsett</Pill>
              </button>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
