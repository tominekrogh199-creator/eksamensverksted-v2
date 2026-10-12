// Eksamenskartet: samme plass i eksamen og samme faglige oppgavefamilie.

import { subtaskTitle } from '../../learning/originals';
import { startOriginalsAndGo, startSessionAndGo } from '../go';
import { useMemo, useState } from 'react';
import type { SubTask, SourceDoc } from '../../domain/types';
import { store, useStore } from '../../state/store';
import { buildComparison, frequencyText, extractOutcomes, FamilyRow, ComparisonModel } from '../../analysis/compare';
import { familyPriorities, PRIORITY_RULE, uncoveredOutcomes } from '../../learning/recommend';
import { getFamily } from '../../families';
import { skillName } from '../../families/skills';
import { BasisTag, DemoBadge, Empty, Notice, Pill, Sheet, SourceLink, Tabs } from '../components/common';
import { SubtaskAnalysisView, srcOf, boxesOf } from '../components/Analysis';
import { Icon } from '../components/Icon';
import { Tex } from '../components/Math';

type Tab = 'familier' | 'nummer' | 'prioritet' | 'pensum';

export function MapScreen() {
  const route = useStore((s) => s.ui.route);
  const docs = useStore((s) => s.docs());
  const subs = useStore((s) => s.currentSubtasks());
  const fams = useStore((s) => s.families());
  const evidence = useStore((s) => s.evidence());
  const sessions = useStore((s) => s.sessions());
  const pagesAll = useStore((s) => s.list<import('../../domain/types').PageRec>('page', s.ui.activeCourseId));
  const [tab, setTab] = useState<Tab>((route.name === 'kart' && route.tab) || 'familier');
  const [konte, setKonte] = useState(true);
  const [sel, setSel] = useState<SubTask | null>(null);
  const [famSel, setFamSel] = useState<FamilyRow | null>(null);
  const model = useMemo(() => buildComparison(docs, subs, fams, { includeKonte: konte }), [docs, subs, fams, konte]);
  const outcomesDoc = docs.find((d) => d.meta.docType === 'fagbeskrivelse' && d.status !== 'duplikat');
  const outcomes = useMemo(() => (outcomesDoc ? extractOutcomes(outcomesDoc, pagesAll) : []), [outcomesDoc, pagesAll]);
  const pr = useMemo(() => familyPriorities({ docs, subtasks: subs, families: fams, evidence, sessions, outcomeFamilies: outcomes.flatMap((o) => o.kbIds) }), [docs, subs, fams, evidence, sessions, outcomes]);
  const anyDemo = docs.some((d) => d.demo);
  return (
    <div className="page">
      <div className="page-head">
        <div className="stack sm">
          <span className="eyebrow">Eksamenskart {anyDemo ? <DemoBadge small /> : null}</span>
          <h1>Hva går igjen, og hva varierer?</h1>
          <p className="muted">Hver celle åpner kilden. Tallene er historisk forekomst i settene dine, ikke sannsynligheten for neste eksamen.</p>
        </div>
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        label="Visninger"
        items={[
          { id: 'familier', label: 'Oppgavefamilier' },
          { id: 'nummer', label: 'Samme oppgavenummer' },
          { id: 'prioritet', label: 'Hva bør jeg øve på?' },
          { id: 'pensum', label: 'Læringsmål' },
        ]}
      />
      <SetSummary model={model} konte={konte} setKonte={setKonte} />
      {!model.sets.length ? (
        <Empty icon="map" title="Ingen analyserte eksamenssett ennå" action={<button className="btn primary" onClick={() => store.navigate({ name: 'arkiv' })}>Gå til arkivet</button>}>
          Kartet fylles når minst ett eksamenssett er ferdig analysert.
        </Empty>
      ) : tab === 'familier' ? (
        <FamilyMatrix model={model} onCell={setSel} onRow={setFamSel} />
      ) : tab === 'nummer' ? (
        <PositionView model={model} onCell={setSel} />
      ) : tab === 'prioritet' ? (
        <Priorities pr={pr} />
      ) : (
        <Outcomes outcomes={outcomes} subs={subs} hasDoc={!!outcomesDoc} />
      )}
      {sel ? (
        <Sheet title={`${subtaskTitle(sel)} · ${store.get<SourceDoc>('doc', sel.docId)?.meta.setLabel ?? ''}`} onClose={() => setSel(null)}>
          <SubtaskAnalysisView st={store.get<SubTask>('subtask', sel.id) ?? sel} />
        </Sheet>
      ) : null}
      {famSel ? (
        <Sheet title={famSel.name} onClose={() => setFamSel(null)}>
          <FamilyDetail row={famSel} model={model} onCell={(s) => { setFamSel(null); setSel(s); }} />
        </Sheet>
      ) : null}
    </div>
  );
}

function SetSummary({ model, konte, setKonte }: { model: ComparisonModel; konte: boolean; setKonte: (b: boolean) => void }) {
  if (!model.sets.length) return null;
  const years = new Set(model.comparable.map((s) => s.doc.meta.year).filter(Boolean)).size;
  const subCount = model.comparable.reduce((n, s) => n + s.subtasks.length, 0);
  return (
    <div className="card tight stack sm">
      <div className="row between">
        <span className="small">
          <strong>{model.comparable.length}</strong> sammenliknbare, analyserte sett · <strong>{years}</strong> år · <strong>{subCount}</strong> deloppgaver
          {model.pending.length ? ` · ${model.pending.length} ikke ferdig analysert` : ''}
          {model.excluded.length ? ` · ${model.excluded.length} holdt utenfor` : ''}
        </span>
        <label className="row small" style={{ gap: 6 }}>
          <input type="checkbox" checked={konte} onChange={(e) => setKonte(e.target.checked)} /> Ta med kontinuasjonseksamener
        </label>
      </div>
      {model.excluded.length || model.pending.length ? (
        <div className="row">
          {[...model.pending, ...model.excluded].map((s) => (
            <Pill key={s.doc.id} tone="outline" title={s.note}>
              {s.label}: {s.doc.reserved ? 'holdt av til prøve' : s.note}
            </Pill>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function cellLabel(st: SubTask) {
  const pts = st.analysis.points?.official;
  const name = st.part ? (st.part === 3 ? `Del 3 ${st.sub})` : `Del ${st.part} · spm. ${st.sub}`) : st.label;
  return `${name}${pts !== undefined ? ` · ${pts}${st.seg.taskWeightPct !== undefined && st.seg.points === undefined ? ' %' : ' p'}` : ''}`;
}

function FamilyMatrix({ model, onCell, onRow }: { model: ComparisonModel; onCell: (s: SubTask) => void; onRow: (r: FamilyRow) => void }) {
  const sets = model.sets.filter((s) => !s.doc.reserved);
  return (
    <div className="stack">
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th className="rowhead">Oppgavefamilie</th>
              {sets.map((s) => (
                <th key={s.doc.id}>
                  <div className="stack sm" style={{ gap: 2 }}>
                    <span>{s.label}</span>
                    <span className="xs faint">
                      {s.doc.meta.examType !== 'ukjent' ? s.doc.meta.examType : ''} {s.comparable ? '' : '· ikke sammenliknbar'} {!s.analyzed ? '· ikke ferdig' : ''}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.rows.map((r) => (
              <tr key={r.key}>
                <th className="rowhead">
                  <button className="src-link" style={{ fontSize: '0.92rem', textAlign: 'left', color: 'var(--ink)' }} onClick={() => onRow(r)}>
                    {r.name}
                  </button>
                  <div className="xs muted" style={{ fontWeight: 400 }}>
                    {r.setCount} av {r.denominator} sett {r.basis === 'ai-forslag' ? <BasisTag basis="ai-tolkning" /> : null}
                  </div>
                </th>
                {sets.map((s) => (
                  <td key={s.doc.id}>
                    {r.cells[s.doc.id]?.length ? (
                      <div className="stack sm">
                        {r.cells[s.doc.id].map((st) => (
                          <button key={st.id} className="cell-btn" onClick={() => onCell(st)}>
                            {cellLabel(st)}
                            <small>{st.analysis.assignment?.value?.slice(0, 48) ?? ''}…</small>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="cell-empty">–</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {model.unknown.length ? (
        <Notice tone="amber">
          <span className="small">{model.unknown.length} deloppgaver er ikke plassert i en familie ennå (ukjent type). De trenger AI-analyse eller at du retter teksten.</span>
          <div className="row">
            {model.unknown.slice(0, 8).map((s) => (
              <button key={s.id} className="btn small" onClick={() => onCell(s)}>
                {s.label}
              </button>
            ))}
          </div>
        </Notice>
      ) : null}
    </div>
  );
}

function FamilyDetail({ row, model, onCell }: { row: FamilyRow; model: ComparisonModel; onCell: (s: SubTask) => void }) {
  const kb = getFamily(row.kbId);
  return (
    <div className="stack">
      <p>{frequencyText(row, model)}</p>
      <p className="xs muted">Historisk forekomst sier ikke noe sikkert om neste eksamen. Temaer kan være relevante selv om de ikke har vært gitt før.</p>
      <div className="grid-2">
        <div className="card flat stack sm">
          <strong className="small">Felles løsningsstruktur</strong>
          <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {row.commonStructure.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
        </div>
        <div className="card flat stack sm">
          <strong className="small">Bare overflatelikhet</strong>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {row.surfaceOnly.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="stack sm">
        <strong className="small">Hva er endret i hver variant?</strong>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Sett</th>
                <th>Oppgave</th>
                <th>Endringer</th>
              </tr>
            </thead>
            <tbody>
              {row.differences.map((d) => (
                <tr key={d.subtask.id}>
                  <td>{d.setLabel}</td>
                  <td>
                    <button className="src-link" onClick={() => onCell(d.subtask)}>
                      {subtaskTitle(d.subtask)}
                    </button>
                  </td>
                  <td>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {d.changes.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="small">
        <strong>Ferdigheter som kombineres:</strong> {row.combos.map(skillName).join(', ')}
      </p>
      <p className="small">
        <strong>Vanskelighetsgrad:</strong> {row.difficulty.text} <BasisTag basis={row.difficulty.basis === 'dokumentert' ? 'offisiell' : 'faglig-tolkning'} />
      </p>
      <p className="small muted">{row.pointsNote}</p>
      {kb ? (
        <div className="row">
          <button className="btn primary" onClick={() => startSessionAndGo({ type: 'familie', families: [kb.id], level: 1, count: 3, reason: `Tre oppgaver av typen «${kb.shortName}», fra enkel til eksamensnivå.` })}>
            <Icon name="pencil" size={16} /> Tren på denne typen
          </button>
          <button className="btn" onClick={() => startOriginalsAndGo({ format: 'blandet', families: [kb.id], count: 8, reason: `Eksamensspørsmål om ${kb.shortName.toLowerCase()} fra settene dine.` })}>
            <Icon name="doc" size={16} /> Øv på disse eksamensspørsmålene
          </button>
          <button className="btn" onClick={() => store.navigate({ name: 'formel' })}>
            <Icon name="book" size={16} /> Forstå formlene
          </button>
        </div>
      ) : (
        <Notice tone="amber">
          <span className="small">Appen har ingen kontrollert oppgavemal for denne familien ennå, så den kan ikke generere øvingsoppgaver av typen. Analysen og kildene er likevel tilgjengelige.</span>
        </Notice>
      )}
    </div>
  );
}

function PositionView({ model, onCell }: { model: ComparisonModel; onCell: (s: SubTask) => void }) {
  const [pos, setPos] = useState(model.positions[0] ?? 1);
  const sets = model.sets.filter((s) => !s.doc.reserved);
  const cols = sets.map((s) => ({ set: s, subs: s.subtasks.filter((st) => st.taskNo === pos) }));
  const famIds = [...new Set(cols.flatMap((c) => c.subs.map((s) => s.analysis.familyKbId)).filter((x): x is string => !!x))];
  const byPart = sets.some((s) => s.subtasks.some((st) => st.part));
  const posName = (p: number) => (byPart ? `Del ${p}` : `Oppgave ${p}`);
  return (
    <div className="stack">
      <div className="row">
        <span className="small muted">Velg oppgavenummer:</span>
        {model.positions.map((p) => (
          <button key={p} className="part-tab" aria-selected={p === pos} onClick={() => setPos(p)}>
            {posName(p)}
          </button>
        ))}
      </div>
      <Notice tone={famIds.length > 1 ? 'amber' : 'accent'} icon="info">
        <span className="small">
          {famIds.length > 1
            ? `${posName(pos)} tester ${famIds.length} ulike familier i settene dine (${famIds.map((f) => getFamily(f)?.shortName).join(', ')}). Samme nummer betyr ikke samme faglige innhold.`
            : famIds.length === 1
              ? `${posName(pos)} tester samme familie (${getFamily(famIds[0])?.shortName}) i settene der den finnes. Oppgavenummeret alene er likevel ikke bevis på faglig likhet.`
              : 'Ingen gjenkjente familier på denne plassen.'}
        </span>
      </Notice>
      <div className="cols">
        {cols.map(({ set, subs }) => (
          <div key={set.doc.id} className="card tight stack">
            <div className="row between">
              <strong>{set.label}</strong>
              {set.doc.demo ? <DemoBadge small /> : null}
            </div>
            {!subs.length ? (
              <span className="small muted">Ingen {posName(pos).toLowerCase()} i dette settet.</span>
            ) : (
              subs.map((st) => (
                <div key={st.id} className="stack sm" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                  <div className="row between">
                    <button className="src-link" onClick={() => onCell(st)}>
                      {cellLabel(st)}
                    </button>
                    <SourceLink src={srcOf(st)} highlight={boxesOf(st)} label="original" />
                  </div>
                  <span className="xs">{getFamily(st.analysis.familyKbId)?.shortName ?? 'Ukjent familie'}</span>
                  <span className="small">{st.analysis.assignment?.value}</span>
                  <div className="row">
                    {(st.analysis.skills?.value ?? []).slice(0, 3).map((s) => (
                      <Pill key={s} tone="outline">
                        {skillName(s)}
                      </Pill>
                    ))}
                  </div>
                  {(st.analysis.formulas?.value ?? []).slice(0, 2).map((f, i) => (
                    <span key={i} className="small">
                      {/\\|_/.test(f.expr) ? <Tex tex={f.expr} /> : f.expr}
                    </span>
                  ))}
                  <span className="xs muted">Krav: {(st.analysis.criteria ?? []).filter((c) => c.basis !== 'faglig-tolkning').length} dokumenterte, {(st.analysis.criteria ?? []).filter((c) => c.basis === 'faglig-tolkning').length} tolkede</span>
                </div>
              ))
            )}
          </div>
        ))}
      </div>
      <GenerateLike label={posName(pos)} famIds={famIds} />
    </div>
  );
}

function GenerateLike({ label, famIds }: { label: string; famIds: string[] }) {
  const [choice, setChoice] = useState<string>('blanding');
  if (!famIds.length) return null;
  return (
    <div className="card stack sm">
      <strong>Øv på flere som {label.toLowerCase()}</strong>
      <p className="small muted">
        {label} i settene dine hører til: {famIds.map((f) => getFamily(f)?.shortName).join(', ')}. {famIds.length > 1 ? 'Velg en blanding eller én familie. Vi lager ikke én felles mal som skjuler forskjellene.' : ''}
      </p>
      <div className="row">
        {famIds.length > 1 ? (
          <label className="row small" style={{ gap: 6 }}>
            <input type="radio" checked={choice === 'blanding'} onChange={() => setChoice('blanding')} /> Blanding av alle
          </label>
        ) : null}
        {famIds.map((f) => (
          <label key={f} className="row small" style={{ gap: 6 }}>
            <input type="radio" checked={choice === f || (famIds.length === 1 && choice === 'blanding')} onChange={() => setChoice(f)} /> {getFamily(f)?.shortName}
          </label>
        ))}
      </div>
      <div>
        <button className="btn primary" onClick={() => startSessionAndGo({ type: 'familie', families: choice === 'blanding' ? famIds : [choice], level: 2, count: 3, reason: `Oppgaver som ${label.toLowerCase()} i settene dine.` })}>
          <Icon name="sparkle" size={16} /> Lag øvingsoppgaver
        </button>
      </div>
    </div>
  );
}

function Priorities({ pr }: { pr: ReturnType<typeof familyPriorities> }) {
  return (
    <div className="stack">
      {pr.map((p, i) => (
        <div key={p.kbId} className="card tight row between">
          <div className="stack sm" style={{ flex: 1, minWidth: 220 }}>
            <div className="row">
              <span className="mono faint">{i + 1}.</span>
              <strong>{p.name}</strong>
              {!p.inExams ? <Pill tone="outline">Ikke i settene</Pill> : null}
              {p.due ? <Pill tone="accent">Repetisjon</Pill> : null}
            </div>
            <span className="small">{p.reason}</span>
          </div>
          <button className="btn small" onClick={() => startSessionAndGo({ type: 'familie', families: [p.kbId], level: p.need > 0.6 ? 1 : 2, count: 3, reason: p.reason })}>
            Tren nå
          </button>
        </div>
      ))}
      <details className="disclosure">
        <summary className="small">Slik prioriterer appen</summary>
        <p className="small muted">{PRIORITY_RULE} Regelen er enkel og forklarbar. Den er ikke en optimert eller validert modell for poenggevinst, og du kan alltid velge noe annet.</p>
      </details>
    </div>
  );
}

function Outcomes({ outcomes, subs, hasDoc }: { outcomes: ReturnType<typeof extractOutcomes>; subs: SubTask[]; hasDoc: boolean }) {
  if (!hasDoc)
    return (
      <Notice tone="amber">
        <strong className="small">Pensumdekningen er uavklart</strong>
        <span className="small">Last opp gjeldende emnebeskrivelse eller læringsutbytte i arkivet. Uten den kan appen ikke si hvilke relevante mål de gamle eksamenene ikke dekker. Et tema er ikke unødvendig bare fordi det mangler i noen få gamle sett.</span>
      </Notice>
    );
  const unc = uncoveredOutcomes(outcomes, subs);
  const present = new Set(subs.map((s) => s.analysis.familyKbId));
  return (
    <div className="stack">
      <div className="table-wrap card tight">
        <table className="table">
          <thead>
            <tr>
              <th>Mål</th>
              <th>Læringsutbytte</th>
              <th>Dekket av settene?</th>
              <th>Kilde</th>
            </tr>
          </thead>
          <tbody>
            {outcomes.map((o) => (
              <tr key={o.code}>
                <td className="mono">{o.code}</td>
                <td>{o.text}</td>
                <td>{o.kbIds.some((k) => present.has(k)) ? <Pill tone="teal">Ja</Pill> : <Pill tone="amber">Ikke i settene</Pill>}</td>
                <td>
                  <SourceLink src={{ docId: o.source.docId, docVersion: store.get<SourceDoc>('doc', o.source.docId)?.version ?? 1, pdfPage: o.source.pdfPage, quote: o.text }} label="se" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unc.length ? (
        <Notice tone="accent">
          <strong className="small">Relevante mål som de historiske eksamenene ikke dekker</strong>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {unc.map((u) => (
              <li key={u.code}>
                {u.code} {u.text} <span className="faint">– {u.reason}</span>
              </li>
            ))}
          </ul>
          <span className="small">Disse kan likevel komme på eksamen. Koblingen mellom mål og familier er regelbasert (nøkkelord) og bør kontrolleres.</span>
        </Notice>
      ) : null}
    </div>
  );
}
