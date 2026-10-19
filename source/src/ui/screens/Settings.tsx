// Innstillinger: eksamensopplysninger, fag, lagring, AI, personvern og sletting.

import { useState } from 'react';
import type { Course, SourceDoc, Attempt, GameRec } from '../../domain/types';
import { nowIso } from '../../domain/types';
import { store, useStore } from '../../state/store';
import { createCourse } from '../../analysis/pipeline';
import { blobs } from '../../storage/backend';
import { offerDownload } from '../../storage/platform';
import { cleanupCandidates, runCleanup, entityCount, DOC_LIMIT } from '../../storage/cleanup';
import { GAME_ID } from '../../learning/game';
import { ConfirmButton, Notice, Pill } from '../components/common';
import { Icon } from '../components/Icon';

export function Settings() {
  // Nytt skjema når faget byttes, så feltene aldri viser (og lagrer) et annet fag.
  const id = useStore((s) => s.course()?.id);
  return <SettingsForm key={id ?? 'ingen'} />;
}

function SettingsForm() {
  const course = useStore((s) => s.course());
  const courses = useStore((s) => s.courses());
  const ui = useStore((s) => s.ui);
  const [c, setC] = useState<Course | undefined>(course);
  const [newName, setNewName] = useState('');
  if (!course || !c) return null;
  const save = () => {
    store.upsert({ ...course, ...c, name: c.name.trim() || course.name });
    store.toast('Eksamensopplysningene er lagret.', 'ok');
  };
  const exportData = async () => {
    const all = [...store.entities.values()].filter((e) => e.courseId === course.id || e.id === course.id);
    const blob = new Blob([JSON.stringify({ app: 'Eksamensverksted', exportedAt: nowIso(), course: course.name, entities: all }, null, 1)], { type: 'application/json' });
    const r = store.platform ? await offerDownload(store.platform, `eksamensverksted-${course.name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.json`, blob) : 'utilgjengelig';
    store.toast(r === 'lagret' ? 'Eksporten er lagret.' : r === 'avslått' ? 'Eksporten ble avbrutt.' : 'Nedlasting er ikke tilgjengelig i denne visningen.', r === 'lagret' ? 'ok' : 'info');
  };
  // Bilder av håndskrift hører til forsøkene og slettes sammen med dem.
  const removePhotos = async () => {
    for (const a of store.list<Attempt>('attempt', course.id))
      for (const p of a.parts)
        for (const img of p.images ?? []) if (store.platform) await blobs.remove(store.platform, { localKey: img.localKey ?? img.id, assetId: (img as { assetId?: string }).assetId }).catch(() => undefined);
  };
  const deleteHistory = async () => {
    await removePhotos();
    // Alt som bygger på det du har gjort: forsøk, evidens, økter, prøver, flashcard-fremgang og genererte oppgaver.
    for (const k of ['attempt', 'evidence', 'session', 'exam', 'flash', 'gen'] as const) for (const e of store.list(k, course.id)) store.remove(e);
    // Fremgangen i eksamensplanen (Lær, quiz, løste oppgaver, rekorder) for faget nullstilles; poengene beholdes.
    const g = store.get<GameRec>('game', GAME_ID);
    if (g) {
      const pre = `${course.id}:`;
      store.upsert({ ...g, topics: Object.fromEntries(Object.entries(g.topics).filter(([k]) => !k.startsWith(pre))), chapters: Object.fromEntries(Object.entries(g.chapters).filter(([k]) => !k.startsWith(pre))) });
    }
    store.toast('Forsøk, bilder, mestring, prøver, flashcards og fremgangen i planen for faget er slettet. Poengene dine beholdes.', 'ok');
  };
  const [cleanup, setCleanup] = useState<ReturnType<typeof cleanupCandidates> | null>(null);
  const deleteCourse = async () => {
    await removePhotos();
    for (const d of store.docs(course.id)) if (store.platform) await blobs.remove(store.platform, { localKey: d.storage.localKey ?? d.id, assetId: d.storage.assetId });
    for (const e of [...store.entities.values()].filter((x) => x.courseId === course.id && x.kind !== 'course')) store.remove(e);
    store.remove(course);
    const rest = store.courses().filter((x) => x.id !== course.id);
    const s = store.settings();
    if (s) store.upsert({ ...s, activeCourseId: rest[0]?.id });
    store.setUi({ activeCourseId: rest[0]?.id });
    store.navigate(rest[0] ? { name: 'start' } : { name: 'velkommen' });
    store.toast('Faget og alt innholdet er slettet.', 'ok');
  };
  const uploadOriginals = async () => {
    if (!store.platform?.assets) return;
    let n = 0;
    for (const d of store.docs(course.id)) {
      if (d.storage.assetId || d.status === 'duplikat') continue;
      const b = await blobs.get({ localKey: d.storage.localKey ?? d.id });
      if (!b) continue;
      const r = await blobs.uploadCloud(store.platform, b, d.mime);
      if (r.assetId) {
        store.upsert({ ...store.get<SourceDoc>('doc', d.id)!, storage: { ...d.storage, assetId: r.assetId } });
        n++;
      }
    }
    store.toast(`${n} originalfiler lastet opp.`, 'ok');
  };
  return (
    <div className="page">
      <div className="page-head">
        <div className="stack sm">
          <span className="eyebrow">Innstillinger</span>
          <h1>{course.name}</h1>
        </div>
      </div>
      <section className="card stack">
        <h3>Eksamen</h3>
        <p className="small muted">Alt er valgfritt. Dato, tid og hjelpemidler brukes i eksamensmodus og på startsiden. Ambisjon og tid til rådighet er notater for deg selv; de endrer ikke anbefalingene.</p>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="c-name">Fagnavn</label>
            <input id="c-name" className="input" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="c-date">Eksamensdato</label>
            <input id="c-date" type="date" className="input" value={c.examDate ?? ''} onChange={(e) => setC({ ...c, examDate: e.target.value || undefined })} />
          </div>
          <div className="field">
            <label htmlFor="c-format">Eksamensform</label>
            <input id="c-format" className="input" placeholder="f.eks. Skriftlig skoleeksamen" value={c.examInfo.format ?? ''} onChange={(e) => setC({ ...c, examInfo: { ...c.examInfo, format: e.target.value || undefined } })} />
          </div>
          <div className="field">
            <label htmlFor="c-dur">Varighet (minutter)</label>
            <input id="c-dur" type="number" className="input" value={c.examInfo.durationMin ?? ''} onChange={(e) => setC({ ...c, examInfo: { ...c.examInfo, durationMin: e.target.value ? Number(e.target.value) : undefined } })} />
          </div>
          <div className="field">
            <label htmlFor="c-aids">Hjelpemidler</label>
            <input id="c-aids" className="input" placeholder="f.eks. Enkel kalkulator" value={c.examInfo.aids ?? ''} onChange={(e) => setC({ ...c, examInfo: { ...c.examInfo, aids: e.target.value || undefined } })} />
          </div>
          <div className="field">
            <label htmlFor="c-amb">Ambisjon</label>
            <input id="c-amb" className="input" placeholder="f.eks. Bestå, eller god karakter" value={c.ambition ?? ''} onChange={(e) => setC({ ...c, ambition: e.target.value || undefined })} />
          </div>
          <div className="field">
            <label htmlFor="c-time">Tid du har til rådighet</label>
            <input id="c-time" className="input" placeholder="f.eks. 5 timer i uka" value={c.timeBudget ?? ''} onChange={(e) => setC({ ...c, timeBudget: e.target.value || undefined })} />
          </div>
        </div>
        <div>
          <button className="btn primary" onClick={save}>
            Lagre
          </button>
        </div>
      </section>
      <section className="card stack">
        <h3>Fag</h3>
        <div className="stack sm">
          {courses.map((x) => (
            <div key={x.id} className="row between">
              <span>
                {x.name} {x.demo ? <Pill tone="demo">DEMO</Pill> : null}
              </span>
              {x.id === course.id ? (
                <Pill tone="teal">Aktivt</Pill>
              ) : (
                <button
                  className="btn small"
                  onClick={() => {
                    const s = store.settings();
                    if (s) store.upsert({ ...s, activeCourseId: x.id });
                    store.setUi({ activeCourseId: x.id });
                    store.navigate({ name: 'start' });
                  }}
                >
                  Bytt til
                </button>
              )}
            </div>
          ))}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            createCourse(newName);
            setNewName('');
            store.navigate({ name: 'arkiv' });
          }}
        >
          <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Nytt fag, f.eks. Mikroøkonomi" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Navn på nytt fag" />
          <button className="btn" type="submit">
            <Icon name="plus" size={16} /> Opprett
          </button>
        </form>
      </section>
      <section className="card stack">
        <h3>Lagring og synk</h3>
        <p className="small">
          <strong>{ui.storageKind === 'sky' ? 'Privat lagring på kontoen din' : ui.storageKind === 'lokal' ? 'Bare denne nettleseren' : 'Ingen varig lagring'}.</strong> {ui.storageNote}
        </p>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Analyser, oppgaver, forsøk og mestring: {ui.storageKind === 'sky' ? 'lagres i ditt private område i appens database og synkroniseres mellom enhetene dine.' : 'lagres lokalt i nettleseren.'}</li>
          <li>Originalfiler og bilder: lagres alltid i denne nettleseren. {store.platform?.assets ? 'Du kan også lagre dem i artefaktens fillager, slik at originalvisningen virker på andre enheter.' : 'Fillager er ikke tilgjengelig i denne visningen.'}</li>
          <li>Innholdet sendes til Claude bare når en funksjon trenger AI (analyse, bildelesing, vurdering av forklaringer, læreren). Det bruker din egen Claude-kvote.</li>
        </ul>
        {store.platform?.assets ? (
          <div className="stack sm">
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" checked={course.settings.cloudOriginals} onChange={(e) => store.upsert({ ...course, settings: { ...course.settings, cloudOriginals: e.target.checked } })} /> Lagre nye originalfiler også i artefaktens fillager
            </label>
            <span className="xs muted">Filer i fillageret er knyttet til denne artefakten og kan i prinsippet nås av andre med redigeringstilgang til den. Oversikten over filene dine ligger i ditt private område.</span>
            <div>
              <button className="btn small" onClick={uploadOriginals}>
                Last opp eksisterende originaler nå
              </button>
            </div>
          </div>
        ) : null}
        {ui.writeError ? <Notice tone="red">{ui.writeError}</Notice> : null}
        {ui.storageKind === 'sky' ? (
          <div className="stack sm">
            <span className="small">
              Elementer lagret av deg: <strong>{entityCount()}</strong>. Appens database har en grense på {DOC_LIMIT} elementer totalt.
            </span>
            {ui.storageFull ? <Notice tone="red">Lagringen tar ikke imot flere endringer. Rydd opp under, eller slett et fag du ikke bruker.</Notice> : null}
            {cleanup ? (
              cleanup.items.length ? (
                <div className="stack sm">
                  <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                    {cleanup.summary.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  <div className="row">
                    <ConfirmButton
                      confirmText={`Slette ${cleanup.items.length} elementer som ikke brukes? Ingenting du har levert, slettes.`}
                      onConfirm={() => {
                        const n = runCleanup(cleanup.items);
                        setCleanup(null);
                        store.setUi({ storageFull: false });
                        store.toast(`${n} elementer ryddet bort.`, 'ok');
                      }}
                    >
                      Rydd opp ({cleanup.items.length})
                    </ConfirmButton>
                    <button className="btn ghost small" onClick={() => setCleanup(null)}>
                      Avbryt
                    </button>
                  </div>
                </div>
              ) : (
                <p className="small muted">Ingenting å rydde: alt som er lagret, er i bruk.</p>
              )
            ) : (
              <div>
                <button className="btn small" onClick={() => setCleanup(cleanupCandidates())}>
                  Finn ubrukte elementer
                </button>
              </div>
            )}
          </div>
        ) : null}
      </section>
      <section className="card stack">
        <h3>AI</h3>
        <p className="small">
          Status: <strong>{ui.aiStatus === 'tilgjengelig' ? 'tilgjengelig' : ui.aiStatus === 'ukjent' ? (store.platform?.sample ? 'tilgjengelig (spør om lov ved første bruk)' : 'ikke tilgjengelig i denne visningen') : ui.aiStatus === 'avslått' ? 'avslått for denne visningen' : 'ikke tilgjengelig'}</strong>
          {store.platform?.imageLimits ? ` · bildelesing: opptil ${store.platform.imageLimits.maxCount} bilder per forespørsel` : ' · bildelesing: ikke tilgjengelig'}
        </p>
        {ui.aiNote ? <p className="small muted">{ui.aiNote}</p> : null}
        <p className="small muted">Uten AI fungerer regelbasert analyse av kjente oppgavetyper, oppgavegenerering, matematisk kontroll, hjelpetrinn, mestring og eksamensmodus. Bildelesing, analyse av ukjente oppgavetyper, vurdering av forklaringer og fri samtale med læreren krever AI.</p>
      </section>
      <section className="card stack">
        <h3>Tilgjengelighet</h3>
        <label className="row small" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={ui.reducedMotion}
            onChange={(e) => {
              store.setUi({ reducedMotion: e.target.checked });
              try {
                localStorage.setItem('ev-reduced-motion', e.target.checked ? '1' : '0');
              } catch {
                /* ikke viktig */
              }
            }}
          />
          Redusert bevegelse
        </label>
      </section>
      <section className="card stack">
        <h3>Personvern, eksport og sletting</h3>
        <button className="src-link small" style={{ alignSelf: 'flex-start' }} onClick={() => store.navigate({ name: 'status' })}>
          Hva appen kan, og hva som krever AI
        </button>
        <p className="small muted">Appen logger ikke besvarelsene dine andre steder enn i lagringen over.</p>
        <div className="row">
          <button className="btn" onClick={exportData}>
            <Icon name="download" size={16} /> Eksporter data for faget (JSON)
          </button>
          <ConfirmButton confirmText="Slette alle forsøk, prøver og mestringshistorikk for faget?" onConfirm={deleteHistory}>
            Slett forsøk og historikk
          </ConfirmButton>
          <ConfirmButton confirmText="Slette faget med alle dokumenter, bilder, analyser og historikk?" onConfirm={deleteCourse}>
            <Icon name="trash" size={16} /> Slett faget
          </ConfirmButton>
        </div>
      </section>
    </div>
  );
}
