// Visning av analysen for én deloppgave: hver påstand har grunnlag og kilde.

import { useState } from 'react';
import type { SubTask, SourceDoc, Criterion } from '../../domain/types';
import { store, useStore } from '../../state/store';
import { editSubtaskText, familyNameForSubtask } from '../../analysis/pipeline';
import { BasisTag, Certainty, DemoBadge, Notice, Pill, SourceLink } from './common';
import { Tex, RichText } from './Math';
import { Icon } from './Icon';
import { skillName } from '../../families/skills';
import { getFamily } from '../../families';
import { FigureCrop } from './FigureCrop';
import { subtaskTitle } from '../../learning/originals';
import { startSessionAndGo, practiceSubtask } from '../go';

const TYPE_LABEL: Record<string, string> = { beregning: 'Beregning', utledning: 'Utledning', tolkning: 'Tolkning', tegning: 'Tegning/figur', sammenlikning: 'Sammenlikning', drøfting: 'Drøfting', flervalg: 'Flervalg', forklaring: 'Forklaring' };

export function srcOf(st: SubTask) {
  return { docId: st.docId, docVersion: st.docVersion, pdfPage: st.pages[0], printedPage: st.printedPages?.[0], quote: st.text.slice(0, 140), taskLabel: st.label };
}

export function boxesOf(st: SubTask, page = st.pages[0]) {
  return st.seg.lineBoxes.filter((b) => b.page === page).map((b) => b.box);
}

function CriteriaList({ items }: { items: Criterion[] }) {
  const order = ['offisielt', 'oppgavekrav', 'faglig-tolkning', 'uavklart'];
  const sorted = [...items].sort((a, b) => order.indexOf(a.basis) - order.indexOf(b.basis));
  if (!sorted.length) return <p className="small muted">Ingen kriterier registrert.</p>;
  return (
    <ul className="criteria">
      {sorted.map((c) => (
        <li key={c.id}>
          <BasisTag basis={c.basis} />
          <span className="small">
            {c.text} {c.source && c.basis === 'offisielt' ? <SourceLink src={c.source} label="kilde" /> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SubtaskAnalysisView({ st, compact }: { st: SubTask; compact?: boolean }) {
  const doc = useStore((s) => s.get<SourceDoc>('doc', st.docId));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(st.text);
  const a = st.analysis;
  const fam = familyNameForSubtask(st);
  if (doc?.reserved)
    return (
      <Notice tone="blue" icon="lock">
        <span className="small">Dette settet er holdt av til en prøve. Innholdet vises ikke før du har tatt prøven eller opphevet reservasjonen i arkivet.</span>
      </Notice>
    );
  return (
    <div className="stack">
      <div className="row between">
        <div className="row">
          <h3>{subtaskTitle(st)}</h3>
          {st.demo ? <DemoBadge small /> : null}
          <SourceLink src={srcOf(st)} highlight={boxesOf(st)} />
          {st.pages.length > 1 ? <span className="xs faint">(går over PDF-side {st.pages.join(' og ')})</span> : null}
        </div>
        {a.certainty ? <Certainty level={a.certainty.level} basis={a.certainty.basis} /> : null}
      </div>
      {st.intro ? (
        <div className="source-block">
          <span className="eyebrow">Felles innledning</span>
          <div className="source-text small">{st.intro}</div>
        </div>
      ) : null}
      <div className="source-block">
        <span className="eyebrow">Oppgavetekst{st.textVersion > 1 ? ` (rettet, versjon ${st.textVersion})` : ''}</span>
        {editing ? (
          <div className="stack sm">
            <textarea className="input source-text" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Rett oppgaveteksten" />
            <div className="row">
              <button
                className="btn small primary"
                onClick={() => {
                  editSubtaskText(st.id, draft);
                  setEditing(false);
                }}
              >
                Lagre og analyser på nytt
              </button>
              <button className="btn small ghost" onClick={() => setEditing(false)}>
                Avbryt
              </button>
            </div>
          </div>
        ) : (
          <div className="row top between" style={{ flexWrap: 'nowrap' }}>
            <div className="source-text">{st.text}</div>
            <button className="icon-btn" aria-label="Rett oppgaveteksten" title="Rett en feiltolket oppgavetekst" onClick={() => setEditing(true)}>
              <Icon name="pencil" size={18} />
            </button>
          </div>
        )}
      </div>
      {st.choices?.length ? (
        <div className="stack sm">
          <span className="eyebrow">Svaralternativer</span>
          <ul className="choice-list">
            {st.choices.map((c) => (
              <li key={c.letter} className={c.correct ? 'correct' : ''}>
                <strong>{c.letter})</strong> <span className="small">{c.text}</span> {c.correct ? <Pill tone="teal">Riktig</Pill> : null}
              </li>
            ))}
          </ul>
          <p className="xs muted">{st.choices.some((c) => c.correct) ? `Fasit: ${st.answerBasis ?? 'fra kilden'}.` : 'Fant ikke hvilket alternativ som er riktig i kilden.'}</p>
        </div>
      ) : null}
      {st.stemMissing ? (
        <Notice tone="amber" icon="info">
          <span className="small">Kilden har bare svaret på dette spørsmålet, ikke selve oppgaveteksten. Svaret og temaet er likevel med i kartet.</span>
        </Notice>
      ) : null}
      {st.regions?.length ? (
        <div className="stack sm">
          {st.regions.map((r, i) => (
            <FigureCrop key={`r${i}`} docId={st.docId} page={r.page} box={r.box} caption="Oppgaven i originalen" />
          ))}
        </div>
      ) : null}
      {st.figures.filter((f) => !f.inGuide && !(st.regions ?? []).some((r) => r.page === f.page && f.box && f.box[1] >= r.box[1] - 0.01 && f.box[1] + f.box[3] <= r.box[1] + r.box[3] + 0.01)).map((f, i) =>
        f.box ? (
          <FigureCrop key={i} docId={st.docId} page={f.page} box={f.box} caption={f.note && !/^Figur (i|på)/.test(f.note) ? f.note : 'Figur i oppgaven'} />
        ) : (
          <Notice key={i} tone="blue" icon="image">
            <span className="small">Oppgaven viser til en figur på PDF-side {f.page}.</span>
          </Notice>
        ),
      )}
      {st.solutionRegions?.length ? (
        <details className="disclosure" open={!compact}>
          <summary className="small">
            <strong>Løsningsforslaget</strong> i dokumentet
          </summary>
          <div className="stack sm">
            {st.answerKeys?.length ? (
              <p className="small">
                Sluttsvar lest fra løsningen: <strong>{st.answerKeys.map((k) => k.display).join(' · ')}</strong>
              </p>
            ) : null}
            {st.solutionRegions.map((r, i) => (
              <FigureCrop key={`s${i}`} docId={st.docId} page={r.page} box={r.box} caption="Løsningsforslaget" />
            ))}
            {st.guide?.text ? (
              <details className="disclosure">
                <summary className="xs">Løsningen som tekst (formler kan bli rotete)</summary>
                <div className="source-text xs">{st.guide.text}</div>
              </details>
            ) : null}
          </div>
        </details>
      ) : st.guide?.text ? (
        <details className="disclosure" open={!compact}>
          <summary className="small">
            <strong>Sensorveiledningen</strong> for dette spørsmålet
          </summary>
          <div className="source-block">
            <div className="source-text small">{st.guide.text}</div>
            {st.figures.filter((f) => f.inGuide && f.box).map((f, i) => (
              <FigureCrop key={i} docId={st.docId} page={f.page} box={f.box!} caption="Figur i sensorveiledningen" />
            ))}
          </div>
        </details>
      ) : null}
      {st.dependsOn.length ? <p className="xs muted">Bygger på: {st.dependsOn.map((d) => (st.part ? `${d.slice(1)})` : `oppgave ${d}`)).join(', ')}</p> : null}

      <section className="stack sm">
        <div className="row">
          <h4>Dette må svaret vise</h4>
        </div>
        <CriteriaList items={a.criteria ?? []} />
      </section>

      {a.conflicts?.length ? (
        <Notice tone="red" icon="alert">
          <strong className="small">Konflikt mellom veiledning og matematisk kontroll</strong>
          {a.conflicts.map((c) => (
            <div key={c.id} className="stack sm">
              <span className="small">{c.description}</span>
              {c.resolution ? <span className="small muted">Mulig forklaring: {c.resolution}</span> : null}
              <SourceLink src={c.source} label="Se veiledningen" />
            </div>
          ))}
        </Notice>
      ) : null}
      {a.agreements?.length && !compact ? (
        <p className="xs" style={{ color: 'var(--teal)' }}>
          <Icon name="check" size={12} /> {a.agreements.map((x) => x.replace(/\s\[[^\]]+\]$/, '')).join(' ')}
        </p>
      ) : null}

      <div className="grid-2">
        <div className="stack sm">
          <span className="eyebrow">Oppdrag</span>
          <p className="small">{a.assignment?.value || '–'}</p>
          <BasisTag basis={a.assignment?.status ?? 'mangler'} />
        </div>
        <div className="stack sm">
          <span className="eyebrow">Oppgavefamilie</span>
          <p className="small">{fam ?? 'Ikke gjenkjent'}</p>
          {a.familyBasis ? <span className="xs faint">{a.familyBasis}</span> : null}
        </div>
        <div className="stack sm">
          <span className="eyebrow">Poeng</span>
          {a.points?.official !== undefined ? (
            <p className="small">
              {a.points.official} {st.seg.taskWeightPct !== undefined && !st.seg.points ? '% av eksamen' : 'poeng'} <BasisTag basis="offisiell" /> {a.points.officialSource ? <SourceLink src={a.points.officialSource} label={a.points.officialQuote ?? 'kilde'} /> : a.points.officialQuote ? <span className="xs faint">«{a.points.officialQuote}»</span> : null}
            </p>
          ) : a.points?.estimate !== undefined ? (
            <p className="small">
              Ikke oppgitt. Anslag: {a.points.estimate} <span className="xs faint">({a.points.estimateBasis})</span>
            </p>
          ) : (
            <p className="small muted">Ikke oppgitt i materialet</p>
          )}
        </div>
        <div className="stack sm">
          <span className="eyebrow">Tid</span>
          <p className="small">{a.time?.official ? `${a.time.official} min (oppgitt)` : a.time?.estimate ? `Ca. ${a.time.estimate} min (anslag, ${a.time.basis?.toLowerCase()})` : 'Ukjent'}</p>
        </div>
      </div>

      {a.computed?.answers.length ? (
        <div className="stack sm">
          <div className="row">
            <span className="eyebrow">Løsningsgrunnlag</span>
            <BasisTag basis="kontrollert" />
          </div>
          <div className="row">
            {a.computed.answers.map((x) => (
              <Pill key={x.label} tone="teal">
                {x.label}: {x.display}
                {x.unit === '%' && !x.display.includes('%') ? ' %' : ''}
              </Pill>
            ))}
          </div>
          <span className="xs faint">{a.computed.method}</span>
        </div>
      ) : null}

      {!compact ? (
        <details className="disclosure">
          <summary>Ferdigheter, formler, forkunnskaper og variasjon</summary>
          <div className="stack" style={{ paddingTop: 8 }}>
            <FieldRow label="Oppgavetype" status={a.taskType?.status}>
              {(a.taskType?.value ?? []).map((t) => TYPE_LABEL[t] ?? t).join(', ') || '–'}
            </FieldRow>
            <FieldRow label="Tema" status={a.topics?.status}>
              {(a.topics?.value ?? []).join(', ') || '–'}
            </FieldRow>
            <FieldRow label="Ferdigheter" status={a.skills?.status}>
              {(a.skills?.value ?? []).map(skillName).join(', ') || '–'}
            </FieldRow>
            <FieldRow label="Formler" status={a.formulas?.status}>
              <ul className="stack sm" style={{ margin: 0, paddingLeft: 18 }}>
                {(a.formulas?.value ?? []).map((f, i) => (
                  <li key={i}>
                    {/\\|_|\^/.test(f.expr) ? <Tex tex={f.expr} /> : <span className="mono">{f.expr}</span>} – {f.meaning}
                    {f.why ? <div className="xs faint">{f.why}</div> : null}
                    {f.assumptions ? <div className="xs faint">Forutsetninger: {f.assumptions}</div> : null}
                  </li>
                ))}
              </ul>
            </FieldRow>
            <FieldRow label="Forkunnskaper" status={a.prerequisites?.status}>
              {(a.prerequisites?.value ?? []).join(', ') || '–'}
            </FieldRow>
            <FieldRow label="Vanlige feil" status={a.misconceptions?.status}>
              <ul style={{ margin: 0, paddingLeft: 18 }}>{(a.misconceptions?.value ?? []).map((m, i) => <li key={i}>{m}</li>)}</ul>
            </FieldRow>
            <FieldRow label="Endringer som endrer metoden" status={a.variation?.status}>
              <ul style={{ margin: 0, paddingLeft: 18 }}>{(a.variation?.value ?? []).map((m, i) => <li key={i}>{m}</li>)}</ul>
            </FieldRow>
            <FieldRow label="Sikkerhet" status={undefined}>
              <div className="stack sm">
                <span>{a.certainty?.basis}</span>
                {a.certainty?.uncertainties.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {a.certainty.uncertainties.map((u, i) => (
                      <li key={i}>{u}</li>
                    ))}
                  </ul>
                ) : null}
                <span className="xs faint">
                  Tekst: {a.certainty?.extraction} · Kontroll: {a.certainty?.validation} · Analysert av: {a.analyzer}
                </span>
              </div>
            </FieldRow>
            {a.ai ? (
              <div className="card flat stack sm">
                <div className="row">
                  <strong className="small">AI-tolkning</strong>
                  <BasisTag basis="ai-tolkning" />
                </div>
                <p className="small">{a.ai.assignment}</p>
                {a.ai.criteria.length ? (
                  <ul className="criteria">
                    {a.ai.criteria.map((c, i) => (
                      <li key={i}>
                        <BasisTag basis={c.basis} />
                        <span className="small">{c.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {a.ai.misconceptions.length ? <p className="xs muted">Mulige misforståelser: {a.ai.misconceptions.join('; ')}</p> : null}
                <p className="xs faint">
                  Sikkerhet ifølge AI: {a.ai.certainty.level}. {a.ai.certainty.basis}
                </p>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
      {st.analysis.familyKbId && getFamily(st.analysis.familyKbId) && !doc?.reserved ? (
        <div className="row">
          <button className="btn small primary" onClick={() => practiceSubtask(st)}>
            <Icon name="pencil" size={16} /> Øv på dette spørsmålet
          </button>
          <button className="btn small" onClick={() => startSessionAndGo({ type: 'familie', families: [st.analysis.familyKbId!], level: 1, count: 3, reason: 'Tre oppgaver av samme type, fra enkel til eksamensnivå.' })}>
            <Icon name="layers" size={16} /> Tren på denne typen
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FieldRow({ label, status, children }: { label: string; status?: string; children: React.ReactNode }) {
  return (
    <div className="grid-2" style={{ gridTemplateColumns: 'minmax(120px, 180px) 1fr', gap: 12 }}>
      <div className="stack sm">
        <span className="small" style={{ fontWeight: 600 }}>
          {label}
        </span>
        {status ? <BasisTag basis={status} /> : null}
      </div>
      <div className="small">{children}</div>
    </div>
  );
}

export { RichText };
