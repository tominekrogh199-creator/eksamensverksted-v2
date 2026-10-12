// Min utvikling: dokumentert mestring per ferdighet, med evidens og regler.

import { useMemo, useState } from 'react';
import type { Evidence, Attempt, GeneratedTask } from '../../domain/types';
import { store, useStore } from '../../state/store';
import { SKILLS } from '../../families/skills';
import { facetsFor, MASTERY_RULES, STAGE_LABELS, SkillFacets, stageLabel } from '../../learning/mastery';
import { recommend } from '../../learning/recommend';
import { Icon } from '../components/Icon';
import { Empty, Pill, fmtDate, relTime } from '../components/common';
import { startSessionAndGo, sessionTitle } from './Train';
import { skillName } from '../../families/skills';
import { getFamily, domainOf } from '../../families';
import { courseFamilies } from '../../learning/actions';

const groupDomain = (g: string) => (g === 'elektro' ? 'elektro' : g === 'digital' ? 'digital' : 'økonomi');

const GROUPS: { id: string; label: string }[] = [
  { id: 'grunnlag', label: 'Grunnleggende' },
  { id: 'likevekt', label: 'Markedslikevekt' },
  { id: 'avgift', label: 'Avgift' },
  { id: 'prosent', label: 'Prosent' },
  { id: 'kostnad', label: 'Kostnader' },
  { id: 'arbeidsmarked', label: 'Arbeidsmarkedet' },
  { id: 'mikro', label: 'Mikro: valg, markeder og bedrifter' },
  { id: 'makro', label: 'Makro' },
  { id: 'elektro', label: 'Elektriske kretser' },
  { id: 'digital', label: 'Digitalteknikk' },
];

const OUTCOME: Record<Evidence['outcome'], { label: string; tone: 'teal' | 'accent' | 'amber' | 'red' | 'outline' }> = {
  'selvstendig-riktig': { label: 'Selvstendig', tone: 'teal' },
  'riktig-med-støtte': { label: 'Med støtte', tone: 'accent' },
  delvis: { label: 'Delvis', tone: 'amber' },
  'ikke-riktig': { label: 'Ikke riktig ennå', tone: 'red' },
  uavklart: { label: 'Uavklart', tone: 'outline' },
};

export function Progress() {
  const ev = useStore((s) => s.evidence());
  const sessions = useStore((s) => s.sessions());
  const rec = useStore((s) => recommend({ course: s.course(), docs: s.docs(), subtasks: s.currentSubtasks(), families: s.families(), evidence: s.evidence(), sessions: s.sessions() }));
  const [open, setOpen] = useState<string | null>(null);
  const subs = useStore((s) => s.currentSubtasks());
  // Bare ferdighetene i dette fagets fagområde (et elektrofag skal ikke vise økonomiferdigheter).
  const domains = useMemo(() => new Set(courseFamilies().map((id) => domainOf(getFamily(id)))), [subs]);
  const groups = GROUPS.filter((g) => domains.has(groupDomain(g.id)));
  const skills = useMemo(() => SKILLS.filter((s) => domains.has(groupDomain(s.group))), [domains]);
  const facets = useMemo(() => skills.map((s) => facetsFor(s.id, ev)), [ev, skills]);
  const examined = facets.filter((f) => f.examined);
  const counts = [0, 1, 2, 3, 4].map((st) => facets.filter((f) => f.examined && f.stage === st).length);
  return (
    <div className="page">
      <div className="page-head">
        <div className="stack sm">
          <span className="eyebrow">Min utvikling</span>
          <h1>Hva du har vist, og hva som gjenstår</h1>
          <p className="muted">Bygger bare på det du har gjort selv. Å ha sett en forklaring er ikke det samme som å kunne løse oppgaven uten hjelp.</p>
        </div>
      </div>
      <section className="hero-card">
        <span className="eyebrow">Anbefalt nå</span>
        <h2>{rec.primary.title}</h2>
        <p>{rec.primary.reason}</p>
        <div className="row">
          <button
            className="btn primary"
            onClick={() => {
              if (rec.primary.kind === 'eksamen') store.navigate({ name: 'eksamen' });
              else if (rec.primary.kind === 'last-opp' || rec.primary.kind === 'analyse') store.navigate({ name: 'arkiv' });
              else startSessionAndGo({ type: rec.primary.kind === 'diagnose' ? 'nivå' : rec.primary.kind === 'repetisjon' ? 'repetisjon' : rec.primary.kind === 'blandet' ? 'oppgaver' : 'familie', families: rec.primary.families, level: rec.primary.level as never, style: rec.primary.style as never, count: rec.primary.count, reason: rec.primary.reason });
            }}
          >
            Start
          </button>
          <button className="btn ghost" onClick={() => store.navigate({ name: 'tren' })}>
            Velg noe annet
          </button>
        </div>
      </section>
      {!examined.length ? (
        <Empty icon="chart" title="Ingen evidens ennå">
          Ingen historikk betyr ukjent nivå, ikke svakt nivå. Løs noen oppgaver, så dukker ferdighetene opp her.
        </Empty>
      ) : (
        <div className="row">
          {STAGE_LABELS.slice(1).map((l, i) => (
            <Pill key={l} tone={i >= 1 ? 'teal' : 'accent'}>
              {counts[i + 1]} · {l.toLowerCase()}
            </Pill>
          ))}
          {counts[0] ? <Pill tone="amber">{counts[0]} · prøvd eller uavklart, ikke vist ennå</Pill> : null}
          <Pill tone="outline">{facets.length - examined.length} ikke undersøkt</Pill>
        </div>
      )}
      {groups.map((g) => {
        const list = facets.filter((f) => skills.find((s) => s.id === f.skillId)?.group === g.id);
        if (!list.length) return null;
        const tried = list.filter((f) => f.examined);
        const untried = list.filter((f) => !f.examined);
        return (
          <section key={g.id} className="card stack sm">
            <div className="row between">
              <h3>{g.label}</h3>
              <span className="small muted">
                {tried.length} av {list.length} prøvd
              </span>
            </div>
            {tried.map((f) => (
              <SkillRow key={f.skillId} f={f} open={open === f.skillId} toggle={() => setOpen(open === f.skillId ? null : f.skillId)} />
            ))}
            {untried.length ? (
              <details className="disclosure">
                <summary className="small">{untried.length} ferdighet{untried.length === 1 ? '' : 'er'} ikke prøvd ennå</summary>
                <div className="stack sm" style={{ marginTop: 8 }}>
                  {untried.map((f) => (
                    <SkillRow key={f.skillId} f={f} open={open === f.skillId} toggle={() => setOpen(open === f.skillId ? null : f.skillId)} />
                  ))}
                </div>
              </details>
            ) : null}
          </section>
        );
      })}
      <details className="disclosure card">
        <summary>Slik leser vi evidensen</summary>
        <ul className="small" style={{ paddingLeft: 18 }}>
          {MASTERY_RULES.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
          <li>Nivåene beskriver ulike sider av mestring. De er ikke en vitenskapelig kalibrert skala og sier ingenting sikkert om eksamenskarakter.</li>
        </ul>
      </details>
      {sessions.filter((s) => s.summary).length ? (
        <section className="stack sm">
          <h3>Tidligere økter</h3>
          {sessions
            .filter((s) => s.summary)
            .slice(-6)
            .reverse()
            .map((s) => (
              <div key={s.id} className="card tight stack sm">
                <div className="row between">
                  <strong>{sessionTitle(s.type)}</strong>
                  <span className="xs muted">{fmtDate(s.startedAt)}</span>
                </div>
                {s.summary!.selv.length ? <p className="small">Selv: {s.summary!.selv.join(' ')}</p> : null}
                {s.summary!.hjelp.length ? <p className="small muted">Med hjelp: {s.summary!.hjelp.join(' ')}</p> : null}
              </div>
            ))}
        </section>
      ) : null}
    </div>
  );
}

function SkillRow({ f, open, toggle }: { f: SkillFacets; open: boolean; toggle: () => void }) {
  const def = SKILLS.find((s) => s.id === f.skillId)!;
  const marks = [f.withSupport || f.independent, f.independent, f.afterPause, f.transfer];
  return (
    <div>
      <div className="skill-row">
        <button className="src-link" style={{ color: 'var(--ink)', fontSize: '0.95rem', textAlign: 'left', textDecoration: 'none' }} onClick={toggle} aria-expanded={open}>
          <span className="stack sm" style={{ gap: 2 }}>
            <strong>{f.name}</strong>
            <span className="xs muted" style={{ fontWeight: 400 }}>
              {stageLabel(f)}
              {f.recentStruggle ? ' · siste forsøk gikk ikke' : ''}
              {f.lastAt ? ` · ${relTime(f.lastAt)}` : ''}
            </span>
          </span>
        </button>
        <div className="ladder-dots" aria-label={`${f.name}: ${stageLabel(f)}`}>
          {marks.map((m, i) => (
            <i key={i} className={m ? 'on' : ''} title={STAGE_LABELS[i + 1]} />
          ))}
        </div>
      </div>
      {open ? (
        <div className="stack sm" style={{ padding: '8px 0 16px' }}>
          <p className="small">
            <strong>Hva vi ser etter:</strong> {def.observable}
          </p>
          <ul className="facets">
            {[
              ['Gjennomført med støtte', f.withSupport],
              ['Vist selvstendig på en ny oppgave', f.independent],
              ['Vist igjen etter en pause', f.afterPause],
              ['Vist i en annerledes eller kombinert oppgave', f.transfer],
            ].map(([l, on]) => (
              <li key={String(l)} className={on ? 'on' : ''}>
                <span className="mark">{on ? <Icon name="check" size={13} stroke={3} /> : null}</span>
                {l as string}
              </li>
            ))}
          </ul>
          <p className="small">
            <strong>Neste sjekk:</strong> {f.nextCheck}
          </p>
          {f.evidence.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Når</th>
                    <th>Resultat</th>
                    <th>Oppgave</th>
                    <th>Grunnlag</th>
                  </tr>
                </thead>
                <tbody>
                  {f.evidence
                    .slice(-8)
                    .reverse()
                    .map((e) => {
                      const att = store.get<Attempt>('attempt', e.attemptId);
                      const t = store.get<GeneratedTask>('gen', e.taskRef.id);
                      return (
                        <tr key={e.id}>
                          <td className="xs">{fmtDate(e.at)}</td>
                          <td>
                            <Pill tone={OUTCOME[e.outcome].tone}>{OUTCOME[e.outcome].label}</Pill>
                            {e.novelty === 'repetisjon' ? <div className="xs faint">repetisjon, ny evidens teller ikke</div> : null}
                          </td>
                          <td className="small">
                            {att ? (
                              <button className="src-link" onClick={() => store.navigate({ name: 'tren', attemptId: att.id, sessionId: att.sessionId })}>
                                {t?.title ?? 'Oppgave'} {e.taskRef.partId})
                              </button>
                            ) : (
                              t?.title
                            )}
                            <div className="xs faint">Nivå {e.variationLevel} · {e.context}</div>
                          </td>
                          <td className="xs">{e.basis}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="small muted">Ikke undersøkt ennå.</p>
          )}
          {def.prerequisites.length ? <p className="xs muted">Bygger på: {def.prerequisites.map(skillName).join(', ')}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
