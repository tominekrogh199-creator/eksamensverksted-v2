import { isExamSet } from '../../domain/types';
// Eksamensarkivet: opplasting, behandlingsstatus, originaler og metadata.

import { INSTRUCTION_NOTE_PREFIX } from '../../analysis/injection';
import { useRef, useState } from 'react';
import type { SourceDoc, SubTask, PageRec, DocType, Term, ExamType } from '../../domain/types';
import { DOC_TYPES, STAGE_ORDER, STAGE_LABEL } from '../../domain/types';
import { store, useStore } from '../../state/store';
import { ingestFiles, acceptedFile, updateDocMeta, rerunFrom, deleteDocument, replaceDocument, confirmGuideLink, resolveSimilar, setPageText } from '../../analysis/pipeline';
import { setReserved } from '../../learning/actions';
import { Icon } from '../components/Icon';
import { ConfirmButton, DemoBadge, Empty, Notice, Pill, Sheet, Spinner, Certainty } from '../components/common';
import { SubtaskAnalysisView } from '../components/Analysis';
import { pageStatusLabel } from '../components/SourceViewer';
import { DEMO_B_GUIDE_TEXT, isDemoGuideHash } from '../../demo/demo';
import { aiImagesAvailable } from '../../ai/client';

async function readFiles(list: FileList | File[]): Promise<{ ok: { name: string; type: string; bytes: Uint8Array }[]; rejected: string[] }> {
  const ok: { name: string; type: string; bytes: Uint8Array }[] = [];
  const rejected: string[] = [];
  for (const f of Array.from(list)) {
    const acc = acceptedFile(f.name, f.type);
    if (!acc.ok) {
      rejected.push(`${f.name}: ${acc.why}`);
      continue;
    }
    if (f.size > 60 * 1024 * 1024) {
      rejected.push(`${f.name}: filen er større enn 60 MB.`);
      continue;
    }
    ok.push({ name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) });
  }
  return { ok, rejected };
}

export function Archive() {
  const course = useStore((s) => s.course());
  const docs = useStore((s) => s.docs());
  const busy = useStore((s) => s.ui.busy);
  const storageKind = useStore((s) => s.ui.storageKind);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  if (!course) return null;
  const upload = async (list: FileList | File[]) => {
    const { ok, rejected: rej } = await readFiles(list);
    setRejected(rej);
    if (ok.length) {
      await ingestFiles(ok, course.id);
      store.toast(`${ok.length} ${ok.length === 1 ? 'fil' : 'filer'} lastet opp. Behandlingen fortsetter selv om du går til en annen side i appen.`, 'ok');
    }
  };
  const exams = docs.filter((d) => isExamSet(d) && d.status !== 'duplikat' && !d.supersededBy);
  // Veiledninger som selv inneholder oppgavene, er eksamenssett og vises bare én gang.
  const guides = docs.filter((d) => (d.meta.docType === 'sensorveiledning' || d.meta.docType === 'losningsforslag') && !d.selfContained && d.status !== 'duplikat' && !d.supersededBy);
  const other = docs.filter((d) => !exams.includes(d) && !guides.includes(d) && d.status !== 'duplikat' && !d.supersededBy);
  const dups = docs.filter((d) => d.status === 'duplikat' || d.supersededBy);
  const working = Object.values(busy);
  return (
    <div className="page">
      <div className="page-head">
        <div className="stack sm">
          <span className="eyebrow">Eksamensarkiv</span>
          <h1>Kildene dine</h1>
          <p className="muted">Last opp tidligere eksamener, sensorveiledninger, løsningsforslag og emnebeskrivelsen. Alt appen påstår om eksamen, skal kunne spores tilbake hit.</p>
        </div>
      </div>
      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
        }}
      >
        <Icon name="upload" size={28} />
        <strong>Dra filer hit, eller velg dem</strong>
        <span className="small muted">PDF (også skannet), JPG, PNG og DOCX. Flere filer samtidig går fint.</span>
        <div className="row" style={{ justifyContent: 'center' }}>
          <input ref={fileRef} type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,application/pdf,image/*" onChange={(e) => e.target.files && upload(e.target.files)} />
          <input ref={camRef} type="file" hidden accept="image/*" capture="environment" onChange={(e) => e.target.files && upload(e.target.files)} />
          <button className="btn primary" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={18} /> Velg filer
          </button>
          <button className="btn" onClick={() => camRef.current?.click()}>
            <Icon name="camera" size={18} /> Ta bilde av en side
          </button>
        </div>
        <span className="xs faint">
          {storageKind === 'sky' ? 'Analysene lagres privat på kontoen din. ' : storageKind === 'lokal' ? 'Alt lagres i denne nettleseren. ' : 'Nettleseren tillater ikke lagring; arbeidet forsvinner når siden lukkes. '}
          {course.settings.cloudOriginals ? 'Originalfilene lagres også i artefaktens fillager.' : 'Originalfilene lagres bare på denne enheten.'} {'Skannede sider og Wiseflow-utskrifter leses med tekstgjenkjenning (OCR) her i nettleseren. Figurer vises som utsnitt'}{aiImagesAvailable() ? ' og tolkes med AI.' : '.'}
        </span>
      </div>
      {rejected.length ? (
        <Notice tone="amber">
          {rejected.map((r, i) => (
            <span key={i} className="small">
              {r}
            </span>
          ))}
        </Notice>
      ) : null}
      {working.length ? (
        <div className="card tight row">
          <Spinner />
          <span className="small">{working.join(' · ')}</span>
          <span className="xs faint">Du kan bruke resten av appen imens. Lukker du siden, fortsetter analysen neste gang.</span>
        </div>
      ) : null}
      {!docs.length ? (
        <Empty icon="archive" title="Ingen dokumenter ennå">
          Start med eksamenssettene. Sensorveiledninger og løsningsforslag kobles til riktig sett ut fra innholdet, ikke filnavnet.
        </Empty>
      ) : null}
      <DocGroup title="Eksamenssett" docs={exams} open={open} setOpen={setOpen} />
      <DocGroup title="Veiledninger og løsningsforslag" docs={guides} open={open} setOpen={setOpen} />
      <DocGroup title="Andre dokumenter" docs={other} open={open} setOpen={setOpen} />
      {dups.length ? <DocGroup title="Duplikater og gamle versjoner" docs={dups} open={open} setOpen={setOpen} muted /> : null}
    </div>
  );
}

function DocGroup({ title, docs, open, setOpen, muted }: { title: string; docs: SourceDoc[]; open: string | null; setOpen: (id: string | null) => void; muted?: boolean }) {
  if (!docs.length) return null;
  return (
    <section className="stack">
      <h2 style={{ fontSize: '1.15rem' }} className={muted ? 'muted' : ''}>
        {title} <span className="faint small">({docs.length})</span>
      </h2>
      {docs.map((d) => (
        <DocCard key={d.id} doc={d} open={open === d.id} toggle={() => setOpen(open === d.id ? null : d.id)} />
      ))}
    </section>
  );
}

function statusPill(d: SourceDoc) {
  if (d.status === 'duplikat') return <Pill tone="outline">Duplikat</Pill>;
  if (d.supersededBy) return <Pill tone="outline">Erstattet av ny versjon</Pill>;
  if (d.status === 'ferdig') return <Pill tone="teal">Ferdig analysert</Pill>;
  if (d.status === 'trenger-hjelp') return <Pill tone="amber">Trenger hjelp</Pill>;
  if (d.status === 'feil') return <Pill tone="red">Feil</Pill>;
  // Ingen trinn har startet ennå: dokumentet venter på tur bak et annet.
  if (!STAGE_ORDER.some((s) => d.stages[s].status === 'pågår' || (s !== 'registrering' && d.stages[s].status === 'ferdig'))) return <Pill tone="outline">I kø</Pill>;
  return <Pill tone="accent">Behandles</Pill>;
}

const STAGE_STATUS: Record<string, string> = { ferdig: 'ferdig', pågår: 'pågår', venter: 'venter', 'trenger-hjelp': 'trenger hjelp', feil: 'feil', 'hoppet-over': 'ikke nødvendig' };

function DocCard({ doc, open, toggle }: { doc: SourceDoc; open: boolean; toggle: () => void }) {
  const [edit, setEdit] = useState(false);
  const pages = useStore((s) => s.pages(doc.id).filter((p) => p.docVersion === doc.version));
  const subs = useStore((s) => s.currentSubtasks().filter((x) => x.docId === doc.id));
  const exams = useStore((s) => s.docs().filter((d) => isExamSet(d) && d.status !== 'duplikat' && !d.supersededBy));
  const dupOf = doc.duplicateOf ? store.get<SourceDoc>('doc', doc.duplicateOf) : undefined;
  const linked = doc.linkedExamDocId ? store.get<SourceDoc>('doc', doc.linkedExamDocId) : undefined;
  const ext = doc.mime.includes('pdf') ? 'PDF' : doc.mime.includes('word') ? 'DOCX' : 'BILDE';
  const conflicts = subs.reduce((n, s) => n + (s.analysis.conflicts?.length ?? 0), 0);
  // Vis bare «ikke lesbar» når lesingen er ferdig; mens dokumentet behandles kan AI-lesingen fortsatt lykkes.
  const readingDone = doc.status !== 'behandles' && doc.stages.bildelesing.status !== 'pågår' && doc.stages.sidelesing.status !== 'pågår';
  const needsText = readingDone ? pages.filter((p) => p.status === 'trenger-ai-lesing' || p.status === 'uleselig') : [];
  const replaceRef = useRef<HTMLInputElement>(null);
  return (
    <article className="card stack" style={doc.status === 'duplikat' ? { opacity: 0.8 } : undefined}>
      <div className="doc-row">
        <span className="doc-icon" aria-hidden="true">
          {ext}
        </span>
        <div className="stack sm" style={{ minWidth: 0 }}>
          <div className="row">
            <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{doc.meta.setLabel ?? doc.fileName}</strong>
            {doc.demo ? <DemoBadge small /> : null}
            {statusPill(doc)}
            {doc.reserved ? (
              <Pill tone="blue">
                <Icon name="lock" size={12} /> Holdt av til prøve
              </Pill>
            ) : null}
            {conflicts ? <Pill tone="red">{conflicts} konflikt{conflicts === 1 ? '' : 'er'}</Pill> : null}
          </div>
          <span className="xs muted">
            {doc.fileName} · {DOC_TYPES[doc.meta.docType].label}
            {doc.selfContained ? ' med oppgavene' : ''}
            {doc.meta.year ? ` · ${doc.meta.term !== 'ukjent' ? doc.meta.term + ' ' : ''}${doc.meta.year}` : ''}
            {doc.meta.examType !== 'ukjent' && isExamSet(doc) ? ` · ${doc.meta.examType}` : ''} · {doc.pageCount || '?'} {doc.pageCount === 1 ? 'side' : 'sider'} · versjon {doc.version}
            {!doc.meta.confirmed && doc.status !== 'duplikat' ? ' · forslag, ikke bekreftet' : ''}
          </span>
          {!doc.meta.confirmed && doc.status !== 'duplikat' && doc.status !== 'behandles' ? (
            <span className="xs row" style={{ gap: 8 }}>
              <button className="src-link" onClick={() => { updateDocMeta(doc.id, {}); store.toast('Opplysningene er bekreftet.', 'ok'); }}>
                Stemmer
              </button>
              <button className="src-link" onClick={() => setEdit(true)}>
                Rett opp
              </button>
            </span>
          ) : null}
        </div>
        <button className="btn small ghost" onClick={toggle} aria-expanded={open}>
          {open ? 'Skjul' : 'Detaljer'} <Icon name={open ? 'chevronDown' : 'chevron'} size={16} />
        </button>
      </div>
      {doc.status !== 'duplikat' ? (
        <div className="stack sm">
          <div className="stages" role="list" aria-label="Behandlingstrinn">
            {STAGE_ORDER.map((s) => (
              <span key={s} role="listitem" className={`stage ${doc.stages[s].status}`} title={`${STAGE_LABEL[s]}: ${STAGE_STATUS[doc.stages[s].status] ?? doc.stages[s].status}${doc.stages[s].note ? ' – ' + doc.stages[s].note : ''}`} aria-label={`${STAGE_LABEL[s]}: ${STAGE_STATUS[doc.stages[s].status] ?? doc.stages[s].status}`} />
            ))}
          </div>
          {doc.status === 'behandles' ? (
            <span className="xs muted">
              {STAGE_ORDER.filter((s) => doc.stages[s].status === 'ferdig' || doc.stages[s].status === 'hoppet-over').length} av {STAGE_ORDER.length} trinn ferdig
            </span>
          ) : null}
          <span className="xs muted">
            {(() => {
              const cur = STAGE_ORDER.find((s) => doc.stages[s].status === 'pågår');
              if (cur) {
                const st = doc.stages[cur];
                return `${STAGE_LABEL[cur]}: ${st.note ?? 'pågår'}${st.progress ? ` (${st.progress.done} av ${st.progress.total})` : ''}`;
              }
              return doc.stages.dekning.note ?? doc.stages.segmentering.note ?? '';
            })()}
          </span>
        </div>
      ) : (
        <Notice icon="layers">
          <span className="small">
            Samme fingeravtrykk som «{dupOf?.fileName}». Den telles ikke som et nytt sett. <button className="src-link" onClick={() => deleteDocument(doc.id)}>Fjern duplikatet</button>
          </span>
        </Notice>
      )}
      {(doc.notes ?? []).filter((n) => n.startsWith(INSTRUCTION_NOTE_PREFIX)).map((n, i) => (
        <Notice key={`inj${i}`} tone="amber" icon="lock">
          <span className="small">{n}</span>
        </Notice>
      ))}
      {doc.similarTo && !doc.similarTo.resolved ? (
        <Notice tone="amber" icon="layers">
          <span className="small">Innholdet ligner svært på «{store.get<SourceDoc>('doc', doc.similarTo.docId)?.fileName}» ({Math.round(doc.similarTo.similarity * 100)} % like ordsekvenser). Hva er dette?</span>
          <div className="row">
            <button className="btn small" onClick={() => resolveSimilar(doc.id, 'duplikat')}>
              Duplikat
            </button>
            <button className="btn small" onClick={() => resolveSimilar(doc.id, 'alternativ')}>
              Alternativ versjon (holdes utenfor tellingen)
            </button>
            <button className="btn small" onClick={() => resolveSimilar(doc.id, 'eget')}>
              Eget sett
            </button>
          </div>
        </Notice>
      ) : null}
      {(doc.questions ?? []).length && doc.status !== 'duplikat' && !doc.meta.confirmed ? (
        <Notice tone="accent" icon="help">
          {(doc.questions ?? []).slice(0, 3).map((n, i) => (
            <span key={i} className="small">
              {n}
            </span>
          ))}
          <div>
            <button className="btn small" onClick={() => setEdit(true)}>
              Avklar
            </button>
          </div>
        </Notice>
      ) : null}
      {(doc.meta.docType === 'sensorveiledning' || doc.meta.docType === 'losningsforslag') && doc.status !== 'duplikat' ? (
        linked ? (
          <div className="row small">
            <Icon name="link" size={16} />
            <span>
              Koblet til <strong>{linked.meta.setLabel ?? linked.fileName}</strong>
              {doc.linkConfirmed ? ' (valgt av deg)' : ''}.
            </span>
            <details className="disclosure">
              <summary className="xs">Grunnlag</summary>
              <ul className="xs" style={{ margin: 0, paddingLeft: 18 }}>
                {(doc.linkBasis ?? []).map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </details>
          </div>
        ) : doc.stages.segmentering.status === 'ferdig' && !doc.selfContained && exams.some((e) => e.id !== doc.id) ? (
          <Notice tone="amber" icon="link">
            <span className="small">Hvilket eksamenssett gjelder veiledningen? Vi kobler ikke bare på filnavn.</span>
            <div className="row">
              {exams.filter((e) => e.id !== doc.id).map((e) => {
                const c = doc.linkCandidates?.find((x) => x.examDocId === e.id);
                return (
                  <button key={e.id} className="btn small" onClick={() => confirmGuideLink(doc.id, e.id)} title={c?.basis.join(' ')}>
                    {e.meta.setLabel ?? e.fileName} {c ? <span className="faint">({c.score})</span> : null}
                  </button>
                );
              })}
            </div>
          </Notice>
        ) : null
      ) : null}
      {needsText.length && doc.status !== 'duplikat' ? (
        <Notice tone="amber" icon="image">
          <span className="small">
            {needsText.length} {needsText.length === 1 ? 'side har' : 'sider har'} ikke lesbar tekst. Tekstgjenkjenningen klarte ikke å lese {needsText.length === 1 ? 'den' : 'dem'}{aiImagesAvailable() ? ', og AI-lesingen kunne ikke fullføres' : ''}. Du kan skrive inn teksten selv.
          </span>
          <div className="row">
            {needsText.map((p) => (
              <button key={p.id} className="btn small" onClick={() => store.setUi({ source: { docId: doc.id, page: p.pdfPage } })}>
                Skriv inn side {p.pdfPage}
              </button>
            ))}
            {doc.demo && isDemoGuideHash(doc.fingerprint) ? (
              <button
                className="btn small soft"
                onClick={() => {
                  setPageText(needsText[0].id, DEMO_B_GUIDE_TEXT);
                  const p = store.get<PageRec>('page', needsText[0].id);
                  if (p) store.upsert({ ...p, statusNote: 'DEMO: forhåndsskrevet transkripsjon (ikke lest av AI, ikke skrevet av deg).' });
                }}
              >
                Bruk demo-transkripsjon (DEMO)
              </button>
            ) : null}
            {aiImagesAvailable() ? (
              <button className="btn small" onClick={() => rerunFrom(doc.id, 'bildelesing')}>
                Prøv AI-lesing igjen
              </button>
            ) : null}
          </div>
        </Notice>
      ) : null}
      {edit ? <MetaEditor doc={doc} onClose={() => setEdit(false)} /> : null}
      {open ? (
        <div className="stack">
          <hr className="divider" />
          <div className="row">
            <button className="btn small" onClick={() => store.setUi({ source: { docId: doc.id, page: 1 } })}>
              <Icon name="eye" size={16} /> Åpne original
            </button>
            {doc.status !== 'duplikat' ? (
              <button className="btn small" onClick={() => setEdit(true)}>
                <Icon name="pencil" size={16} /> Rett metadata
              </button>
            ) : null}
            {isExamSet(doc) && doc.status !== 'duplikat' ? (
              <button className="btn small" onClick={() => setReserved(doc.id, !doc.reserved)} title="Et reservert sett holdes utenfor trening, kart, oppgavegenerering og lærerhint til du tar det som prøve.">
                <Icon name="lock" size={16} /> {doc.reserved ? 'Opphev reservasjon' : 'Hold av til prøve'}
              </button>
            ) : null}
            {doc.status !== 'duplikat' && !doc.supersededBy ? (
              <>
                <input
                  ref={replaceRef}
                  type="file"
                  hidden
                  accept=".pdf,.png,.jpg,.jpeg,.docx"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    await replaceDocument(doc.id, { name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) });
                  }}
                />
                <button className="btn small" onClick={() => replaceRef.current?.click()}>
                  <Icon name="refresh" size={16} /> Erstatt med ny versjon
                </button>
                <button className="btn small ghost" onClick={() => rerunFrom(doc.id, 'segmentering')}>
                  Analyser på nytt
                </button>
              </>
            ) : null}
            <ConfirmButton confirmText="Slette dokumentet og alt som er avledet av det?" onConfirm={() => deleteDocument(doc.id)}>
              <Icon name="trash" size={16} /> Slett
            </ConfirmButton>
          </div>
          {doc.status !== 'duplikat' ? (
            <>
              <div className="stack sm">
                <span className="eyebrow">Behandlingstrinn</span>
                <div className="table-wrap">
                  <table className="table">
                    <tbody>
                      {STAGE_ORDER.map((s) => (
                        <tr key={s}>
                          <td style={{ width: 170 }}>{STAGE_LABEL[s]}</td>
                          <td>
                            <Pill tone={doc.stages[s].status === 'ferdig' ? 'teal' : doc.stages[s].status === 'trenger-hjelp' ? 'amber' : doc.stages[s].status === 'feil' ? 'red' : doc.stages[s].status === 'pågår' ? 'accent' : 'outline'}>{doc.stages[s].status}</Pill>
                          </td>
                          <td className="muted">{doc.stages[s].note ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="stack sm">
                <span className="eyebrow">Sidedekning – hver side har status</span>
                <div className="pagegrid">
                  {pages.map((p) => (
                    <button key={p.id} className={`pagechip ${p.status === 'lest' || p.status === 'ai-lest' || p.status === 'ocr-lest' || p.status === 'manuelt-rettet' ? 'ok' : p.status === 'irrelevant' ? 'skip' : 'warn'}`} onClick={() => store.setUi({ source: { docId: doc.id, page: p.pdfPage } })} title={`${pageStatusLabel(p.status)}${p.statusNote ? ' – ' + p.statusNote : ''}`}>
                      {p.pdfPage}
                      <small>{p.printedPage && p.printedPage !== String(p.pdfPage) ? `trykt ${p.printedPage}` : pageStatusLabel(p.status)}</small>
                    </button>
                  ))}
                </div>
              </div>
              {subs.length ? <SubtaskList subs={subs} /> : null}
              {doc.guide?.items.length ? (
                <div className="stack sm">
                  <span className="eyebrow">Oppgavehenvisninger i veiledningen</span>
                  <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                    {doc.guide.items.map((it, i) => (
                      <li key={i}>
                        <strong>{it.label}</strong> (s. {it.page}){it.points !== undefined ? `, ${it.points} poeng` : ''}: {it.text.slice(0, 160)}
                        {it.text.length > 160 ? '…' : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function SubtaskList({ subs }: { subs: SubTask[] }) {
  const [sel, setSel] = useState<SubTask | null>(null);
  return (
    <div className="stack sm">
      <span className="eyebrow">Oppgaver og deloppgaver</span>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Oppgave</th>
              <th>Oppdrag</th>
              <th>Poeng</th>
              <th>Sikkerhet</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id}>
                <td>
                  <button className="src-link" onClick={() => setSel(s)}>
                    {s.label}
                  </button>
                </td>
                <td className="small">{s.analysis.assignment?.value?.slice(0, 110) || s.text.slice(0, 110)}</td>
                <td className="tnum">{s.analysis.points?.official ?? (s.analysis.points?.estimate !== undefined ? `~${s.analysis.points.estimate}` : '–')}</td>
                <td>{s.analysis.certainty ? <Certainty level={s.analysis.certainty.level} basis={s.analysis.certainty.basis} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel ? (
        <Sheet title={`Analyse av oppgave ${sel.label}`} onClose={() => setSel(null)}>
          <SubtaskAnalysisView st={store.get<SubTask>('subtask', sel.id) ?? sel} />
        </Sheet>
      ) : null}
    </div>
  );
}

function MetaEditor({ doc, onClose }: { doc: SourceDoc; onClose: () => void }) {
  const [m, setM] = useState({ ...doc.meta });
  const sug = (field: string) => doc.meta.suggestions.find((s) => s.field === field);
  return (
    <Sheet title="Rett metadata" onClose={onClose} narrow footer={
      <div className="row between">
        <span className="xs muted">Bare avklaringer som påvirker analysen.</span>
        <div className="row">
          <button className="btn ghost" onClick={onClose}>
            Avbryt
          </button>
          <button
            className="btn primary"
            onClick={() => {
              updateDocMeta(doc.id, m);
              onClose();
              store.toast('Metadata er lagret og analysen oppdatert.', 'ok');
            }}
          >
            Lagre
          </button>
        </div>
      </div>
    }>
      <div className="field">
        <label htmlFor="m-type">Dokumenttype</label>
        <select id="m-type" className="input" value={m.docType} onChange={(e) => setM({ ...m, docType: e.target.value as DocType })}>
          {Object.entries(DOC_TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <span className="hint">
          {DOC_TYPES[m.docType].authority}: {DOC_TYPES[m.docType].note} {sug('docType') ? `Forslag: ${sug('docType')!.why}` : ''}
        </span>
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="m-year">År</label>
          <input id="m-year" className="input" inputMode="numeric" value={m.year ?? ''} onChange={(e) => setM({ ...m, year: e.target.value ? parseInt(e.target.value, 10) || undefined : undefined })} />
          {sug('year') ? <span className="hint">{sug('year')!.why}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="m-term">Termin</label>
          <select id="m-term" className="input" value={m.term} onChange={(e) => setM({ ...m, term: e.target.value as Term })}>
            <option value="vår">Vår</option>
            <option value="sommer">Sommer</option>
            <option value="høst">Høst</option>
            <option value="ukjent">Ukjent</option>
          </select>
        </div>
      </div>
      {m.docType === 'eksamen' ? (
        <div className="grid-2">
          <div className="field">
            <label htmlFor="m-et">Eksamenstype</label>
            <select id="m-et" className="input" value={m.examType} onChange={(e) => setM({ ...m, examType: e.target.value as ExamType })}>
              <option value="ordinær">Ordinær</option>
              <option value="konte">Kontinuasjon</option>
              <option value="utsatt">Utsatt</option>
              <option value="prøveeksamen">Prøveeksamen</option>
              <option value="ukjent">Ukjent</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="m-label">Navn på settet</label>
            <input id="m-label" className="input" value={m.setLabel ?? ''} onChange={(e) => setM({ ...m, setLabel: e.target.value || undefined })} />
          </div>
        </div>
      ) : null}
      {m.docType === 'eksamen' ? (
        <div className="field">
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={m.comparable} onChange={(e) => setM({ ...m, comparable: e.target.checked })} /> Sammenliknbart med de andre settene
          </label>
          <span className="hint">Slå av hvis eksamensform, pensum eller hjelpemidler var annerledes. Settet vises da separat og telles ikke i frekvensene.</span>
          {!m.comparable ? <input className="input" placeholder="Hvorfor? (f.eks. «ny eksamensform fra 2025»)" value={m.comparabilityNote ?? ''} onChange={(e) => setM({ ...m, comparabilityNote: e.target.value })} /> : null}
        </div>
      ) : null}
    </Sheet>
  );
}
