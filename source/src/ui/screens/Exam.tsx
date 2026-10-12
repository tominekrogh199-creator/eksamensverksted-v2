import { isExamSet } from '../../domain/types';
// Eksamensmodus: tidsbegrenset prøve uten hjelp, med vurdering etterpå.

import { useEffect, useState } from 'react';
import type { ExamSim, GeneratedTask, Attempt, SubTask, SourceDoc, GenPart } from '../../domain/types';
import { nowIso } from '../../domain/types';
import { store, useStore } from '../../state/store';
import { buildExam, reservedDocs, startAttempt, submitPart, taskFromSubtask, planSession, setReserved } from '../../learning/actions';
import { Workspace } from './Workspace';
import { originalTask } from '../../learning/originals';
import { buildExamLike, canMakeExamLike, examLikePlan } from '../../learning/examlike';
import { Spinner } from '../components/common';
import { Icon } from '../components/Icon';
import { ConfirmButton, DemoBadge, Empty, Notice, Pill, fmtDate } from '../components/common';
import { skillName } from '../../families/skills';
import { Rat } from '../../math/rational';

function openTaskFromSubtask(st: SubTask): GeneratedTask {
  const now = nowIso();
  const crit = (st.analysis.criteria ?? []).slice(0, 6);
  const part: GenPart = {
    id: 'a',
    label: st.label,
    prompt: st.text,
    kind: 'forklaring',
    skills: st.analysis.skills?.value ?? [],
    rubric: crit.length ? crit.map((c, i) => ({ id: `k${i + 1}`, text: c.text, basis: c.basis, required: c.basis !== 'faglig-tolkning' || i < 2 })) : [{ id: 'k1', text: 'Svarer på det oppgaven spør om, med begrunnelse.', basis: 'faglig-tolkning', required: true }],
    solution: [],
    hints: { small: '', firstStep: '', stepExplanation: '', workedExample: { intro: '', steps: [] } },
    methodCheckpoints: [],
  };
  return {
    id: `orig-${st.id}`,
    kind: 'gen',
    courseId: st.courseId,
    createdAt: now,
    updatedAt: now,
    demo: st.demo,
    familyKbId: st.analysis.familyKbId ?? 'ukjent',
    templateId: 'original',
    templateVersion: 1,
    level: 4,
    style: 'standard',
    params: {},
    seed: 0,
    title: `Originaloppgave ${st.label}`,
    intro: st.intro ?? '',
    context: 'original',
    parts: [part],
    skills: part.skills,
    structureKey: `original|${st.id}`,
    sourceRefs: { subtaskIds: [st.id] },
    validation: { status: 'gyldig', checks: [{ name: 'Åpen oppgave', ok: true, detail: 'Vurderes mot kriteriene fra analysen (foreløpig).' }] },
    wording: 'mal',
    estMinutes: st.analysis.time?.estimate ?? 10,
  };
}

function startExam(exam: ExamSim) {
  let taskIds = exam.taskIds;
  if (exam.source.type === 'reservert') {
    const tasks = exam.subtaskIds
      .map((id) => store.get<SubTask>('subtask', id))
      .filter((s): s is SubTask => !!s)
      .map((st) => (st.guide?.text || st.choices?.length ? originalTask(st) : null) ?? taskFromSubtask(st) ?? openTaskFromSubtask(st));
    store.upsertMany(tasks);
    taskIds = tasks.map((t) => t.id);
  }
  const atts = taskIds.map((id) => startAttempt(store.get<GeneratedTask>('gen', id)!, 'eksamen', undefined, exam.id));
  store.upsert({ ...exam, taskIds, attemptIds: atts.map((a) => a.id), startedAt: nowIso(), status: 'pågår' });
}

async function submitExam(examId: string) {
  const exam = store.get<ExamSim>('exam', examId)!;
  store.setBusy('exam', 'Vurderer prøven …');
  for (const aid of exam.attemptIds) {
    const a = store.get<Attempt>('attempt', aid);
    if (!a) continue;
    for (const p of a.parts) if (!p.submitted) await submitPart(aid, p.partId);
    store.upsert({ ...store.get<Attempt>('attempt', aid)!, status: 'levert', submittedAt: nowIso() });
  }
  const perTask: NonNullable<ExamSim['result']>['perTask'] = [];
  const failedFams = new Set<string>();
  const unanswered = new Set<string>();
  let usedOfficial = false;
  let notAssessed = 0;
  for (const aid of exam.attemptIds) {
    const a = store.get<Attempt>('attempt', aid)!;
    const t = store.get<GeneratedTask>('gen', a.taskRef.id)!;
    const orig = t.sourceRefs.subtaskIds[0] ? store.get<SubTask>('subtask', t.sourceRefs.subtaskIds[0]) : undefined;
    let score = 0;
    let max = 0;
    let uncertain = false;
    let answered = 0;
    for (const part of t.parts) {
      const pa = a.parts.find((p) => p.partId === part.id)!;
      const blank = !pa.lines.some((l) => l.text.trim()) && !pa.explanation.trim() && !pa.images.length && pa.choiceId === undefined && pa.flawedLine === undefined && !(pa.graphPoints ?? []).some((g) => g.points.length);
      const as = pa.assessment;
      const off = exam.source.type === 'reservert' ? orig?.analysis.points?.official : undefined;
      if (off !== undefined) usedOfficial = true;
      const partMax0 = off !== undefined ? off / t.parts.length : part.targets?.length ?? part.rubric?.filter((r) => r.required).length ?? 1;
      if (blank) {
        max += partMax0;
        if (t.familyKbId !== 'ukjent') failedFams.add(t.familyKbId);
        continue;
      }
      answered++;
      const partMax = partMax0;
      max += partMax;
      if (!as) continue;
      if (as.uncertain) uncertain = true;
      let frac = 0;
      if (as.interpretation && as.interpretation.basis !== 'ikke-vurdert') {
        const req = as.interpretation.criteria.filter((c) => part.rubric?.find((r) => r.id === c.id)?.required);
        frac = req.length ? req.filter((c) => c.verdict === 'oppfylt').length / req.length + req.filter((c) => c.verdict === 'delvis').length / (2 * req.length) : 0;
        if (as.interpretation.basis === 'ai-vurdering') uncertain = uncertain || as.interpretation.verdict === 'uavklart';
      } else if (as.interpretation?.basis === 'ikke-vurdert') {
        // Kunne ikke vurderes (f.eks. uten AI): telles ikke med i maks og gir ikke reparasjonsoppgaver.
        uncertain = true;
        max -= partMax;
        notAssessed++;
        continue;
      } else if (as.answer.items.length) {
        frac = as.answer.items.filter((i) => i.verdict.startsWith('riktig') || i.verdict === 'true').length / as.answer.items.length;
      }
      score += Math.round(frac * partMax * 10) / 10;
      if (frac < 0.99 && t.familyKbId !== 'ukjent') failedFams.add(t.familyKbId);
    }
    perTask.push({ ref: t.id, title: t.title, score: Math.round(score * 10) / 10, max, verdict: !answered ? 'ikke besvart' : score >= max - 0.01 ? 'riktig' : score > 0 ? 'delvis' : 'feil', uncertain: answered > 0 && uncertain });
    if (!answered) for (const sk of t.skills) unanswered.add(sk);
  }
  const evs = store.evidence().filter((e) => exam.attemptIds.includes(e.attemptId) && !e.voided);
  const perSkill = [...new Set(evs.map((e) => e.skillId))].map((s) => {
    const list = evs.filter((e) => e.skillId === s);
    const out = list.every((e) => e.outcome === 'selvstendig-riktig') ? 'Vist selvstendig' : list.some((e) => e.outcome === 'selvstendig-riktig') ? 'Delvis vist' : list.every((e) => e.outcome === 'uavklart') ? 'Uavklart' : 'Ikke vist ennå';
    return { skillId: s, outcome: out };
  });
  for (const s of unanswered) if (!perSkill.some((p) => p.skillId === s)) perSkill.push({ skillId: s, outcome: 'Ikke besvart' });
  const repair = failedFams.size ? planSession({ type: 'reparasjon', families: [...failedFams], level: 1, count: Math.min(4, failedFams.size * 2), reason: 'Reparasjonsøkt etter prøven: oppgaver fra familiene der prøven viste hull.' }) : null;
  const official = usedOfficial;
  store.upsert({
    ...store.get<ExamSim>('exam', examId)!,
    submittedAt: nowIso(),
    status: 'levert',
    result: {
      perTask,
      perSkill,
      pointsNote: official
        ? 'Maks per oppgave er de offisielle poengene eller vektene fra settet der de er oppgitt (ellers ett treningspoeng per delsvar). Din poengsum er beregnet av appen (andel riktige delsvar × maks) og er et treningsanslag, ikke sensur.'
        : 'Poengene er treningspoeng laget av appen (ett poeng per delsvar eller nødvendig kriterium). De er ikke offisielle og sier ikke noe om karakter.',
      repairTaskIds: repair?.tasks.map((t) => t.id) ?? [],
      ...(notAssessed ? { pointsNote: `${official ? 'Maks per oppgave er de offisielle poengene eller vektene der de er oppgitt.' : 'Poengene er treningspoeng laget av appen.'} ${notAssessed} tekstsvar kunne ikke vurderes automatisk (AI var ikke tilgjengelig) og er holdt utenfor poengsummen. Sammenlikn dem selv med vurderingsrammen.` } : {}),
    },
  });
  if (exam.source.type === 'reservert' && store.get<SourceDoc>('doc', exam.source.docId)?.reserved) setReserved(exam.source.docId, false);
  store.setBusy('exam', null);
}

export function Exam() {
  const route = useStore((s) => s.ui.route);
  const exams = useStore((s) => s.exams());
  const examId = route.name === 'eksamen' ? route.examId : undefined;
  const exam = examId ? exams.find((e) => e.id === examId) : undefined;
  if (exam && exam.status === 'pågår') return <ExamRunning exam={exam} />;
  if (exam && (exam.status === 'levert' || exam.status === 'avbrutt')) return <ExamResult exam={exam} />;
  if (exam && exam.status === 'klar') return <ExamReady exam={exam} />;
  return <ExamSetup />;
}

function ExamSetup() {
  const course = useStore((s) => s.course());
  const reserved = useStore(() => reservedDocs());
  const exams = useStore((s) => s.exams());
  const [minutes, setMinutes] = useState<number | ''>(course?.examInfo.durationMin ?? '');
  const sets = useStore((s) => s.docs().filter((d) => isExamSet(d) && d.status !== 'duplikat' && !d.supersededBy && d.stages.analyse.status === 'ferdig'));
  const canAi = useStore(() => canMakeExamLike());
  const plan = useStore(() => (canAi ? examLikePlan() : []));
  const [making, setMaking] = useState<string | null>(null);
  const [setId, setSetId] = useState('');
  const open = exams.filter((e) => e.status === 'pågår' || e.status === 'klar');
  const FORMAT_LABEL: Record<string, string> = { flervalg: 'flervalg', kortsvar: 'kortsvar', langsvar: 'lengre oppgave', regne: 'regneoppgaver' };
  const sorted = [...sets].sort((a, b) => Number(!!b.reserved) - Number(!!a.reserved) || (b.meta.year ?? 0) - (a.meta.year ?? 0));
  const chosen = sorted.find((d) => d.id === setId) ?? sorted[0];
  return (
    <div className="page">
      <div className="page-head">
        <div className="stack sm">
          <span className="eyebrow">Eksamensmodus</span>
          <h1>Prøv deg under eksamensforhold</h1>
          <p className="muted">På tid og uten hint, fasit eller lærer før du leverer. Etterpå får du vurdering per oppgave og ferdighet, og en reparasjonsøkt.</p>
        </div>
      </div>
      {open.length ? (
        <section className="stack sm">
          <h3>Ikke fullført</h3>
          {open.map((e) => (
            <button key={e.id} className="card tight row between" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => store.navigate({ name: 'eksamen', examId: e.id })}>
              <span className="stack sm" style={{ gap: 2 }}>
                <strong>{e.source.type === 'reservert' ? store.get<SourceDoc>('doc', e.source.docId)?.meta.setLabel ?? 'Eksamenssett' : e.source.basis}</strong>
                <span className="small muted">
                  {e.status === 'pågår' ? `Startet ${fmtDate(e.startedAt)}` : 'Klar til start'} · {e.durationMin} min
                </span>
              </span>
              <span className="btn primary small">
                {e.status === 'pågår' ? 'Fortsett' : 'Start'} <Icon name="chevron" size={16} />
              </span>
            </button>
          ))}
        </section>
      ) : null}
      <div className="card stack sm">
        <strong>Eksamensopplysninger</strong>
        <p className="small">
          {course?.examInfo.durationMin ? `${course.examInfo.durationMin} minutter` : 'Tid ikke oppgitt'} · Hjelpemidler: {course?.examInfo.aids ?? 'ikke oppgitt'} {course?.examInfo.format ? `· ${course.examInfo.format}` : ''}
          {!course?.examInfo.durationMin && !course?.examInfo.aids ? (
            <>
              {' '}
              · <button className="src-link" onClick={() => store.navigate({ name: 'innstillinger' })}>Fyll inn</button>
            </>
          ) : null}
        </p>
        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor="ex-min">Tid for denne prøven (minutter)</label>
          <input id="ex-min" className="input" type="number" min={10} max={360} value={minutes} onChange={(e) => setMinutes(e.target.value ? Number(e.target.value) : '')} placeholder="foreslås ut fra oppgavene" />
          <span className="hint">En kortere prøve enn hele eksamen er fint for trening.</span>
        </div>
      </div>
      <div className="grid-2">
        {canAi ? (
          <div className="card stack" style={{ borderColor: 'color-mix(in srgb, var(--accent) 45%, var(--line))' }}>
            <div className="row">
              <Icon name="sparkle" />
              <strong>Ny prøve i samme format som eksamen</strong>
            </div>
            <p className="small muted">
              Nye oppgaver laget etter mønster av det nyeste settet ditt: {plan.map((p) => `${p.count} ${FORMAT_LABEL[p.format]}`).join(', ')}. Du har ikke sett oppgavene før, så prøven viser hva du klarer på en ukjent eksamen.
            </p>
            {making ? (
              <Spinner label={making} />
            ) : (
              <div>
                <button
                  className="btn primary"
                  onClick={async () => {
                    setMaking('Lager prøven …');
                    const r = await buildExamLike((n) => setMaking(n), minutes || undefined);
                    setMaking(null);
                    if (r.exam) store.navigate({ name: 'eksamen', examId: r.exam.id });
                    else store.toast(r.error ?? 'Klarte ikke å lage prøven.', 'feil');
                  }}
                >
                  Lag prøve
                </button>
              </div>
            )}
            <p className="xs faint">Tar 1–3 minutter å lage. Fasiten er kontrollert, men oppgavene er laget av AI og ikke kvalitetssikret av en faglærer.</p>
          </div>
        ) : null}
        <div className="card stack">
          <div className="row">
            <Icon name="lock" />
            <strong>Et tidligere eksamenssett</strong>
          </div>
          <p className="small muted">Originaloppgavene fra et sett, med fasit og sensorveiledning. Et sett du har holdt av (aldri øvd på) gir den mest ærlige prøven.</p>
          {sorted.length ? (
            <>
              <select className="input" value={chosen?.id ?? ''} onChange={(e) => setSetId(e.target.value)} aria-label="Velg eksamenssett">
                {sorted.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.meta.setLabel ?? d.fileName}
                    {d.reserved ? ' (holdt av)' : ''}
                  </option>
                ))}
              </select>
              <div>
                <button
                  className={canAi ? 'btn' : 'btn primary'}
                  onClick={() => {
                    if (!chosen) return;
                    const ex = buildExam({ source: 'reservert', docId: chosen.id, minutes: minutes || undefined });
                    if (ex) store.navigate({ name: 'eksamen', examId: ex.id });
                    else store.toast('Settet er ikke ferdig analysert.', 'info');
                  }}
                >
                  Ta dette settet
                </button>
              </div>
              {chosen && !chosen.reserved ? <p className="xs faint">Du kan ha øvd på disse oppgavene før. Vil du spare et sett, velg «Hold av til prøve» i arkivet.</p> : null}
              {!reserved.length ? null : <p className="xs faint">{reserved.length} sett holdt av.</p>}
            </>
          ) : (
            <p className="small">
              Ingen analyserte eksamenssett ennå. <button className="src-link" onClick={() => store.navigate({ name: 'arkiv' })}>Gå til arkivet</button>
            </p>
          )}
        </div>
        {!canAi ? (
          <div className="card stack">
            <div className="row">
              <Icon name="sparkle" />
              <strong>Varianter av oppgavetypene</strong>
            </div>
            <p className="small muted">Genererte, kontrollerte varianter av oppgavefamiliene i det siste settet ditt. Nye eksamensnære oppgaver i samme format krever AI.</p>
            <button
              className="btn"
              disabled={!sets.length}
              onClick={() => {
                const ex = buildExam({ source: 'generert', minutes: minutes || undefined });
                if (ex) store.navigate({ name: 'eksamen', examId: ex.id });
              }}
            >
              Lag prøve
            </button>
          </div>
        ) : null}
      </div>
      {exams.filter((e) => e.status === 'levert' || e.status === 'avbrutt').length ? (
        <section className="stack sm">
          <h3>Tidligere prøver</h3>
          {exams
            .filter((e) => e.status === 'levert' || e.status === 'avbrutt')
            .reverse()
            .map((e) => {
              const pts = e.result?.perTask.reduce((a, t) => ({ s: a.s + t.score, m: a.m + t.max }), { s: 0, m: 0 });
              return (
                <button key={e.id} className="card tight row between" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => store.navigate({ name: 'eksamen', examId: e.id })}>
                  <span>
                    {fmtDate(e.startedAt)} · {e.source.type === 'reservert' ? store.get<SourceDoc>('doc', e.source.docId)?.meta.setLabel ?? 'Eksamenssett' : 'Nye oppgaver'}
                    {pts && pts.m ? ` · ${Math.round(pts.s * 10) / 10} av ${Math.round(pts.m * 10) / 10} treningspoeng` : ''}
                  </span>
                  <Pill tone={e.status === 'levert' ? 'teal' : 'outline'}>{e.status === 'levert' ? 'Levert' : 'Avbrutt'}</Pill>
                </button>
              );
            })}
        </section>
      ) : null}
    </div>
  );
}

function ExamReady({ exam }: { exam: ExamSim }) {
  return (
    <div className="page">
      <div className="card stack">
        <span className="eyebrow">Klar til å starte</span>
        <h2>{exam.durationMin} minutter · {exam.source.type === 'reservert' ? `${exam.subtaskIds.length} deloppgaver fra reservert sett` : `${exam.taskIds.length} oppgaver`}</h2>
        <p className="small">{exam.basisNote}</p>
        <p className="small">Hjelpemidler: {exam.aids}. Hint, fasit og lærer er av til du leverer. Går du over til øving underveis, registreres ikke prøven som fullført uten hjelp.</p>
        <div className="row">
          <button className="btn primary big" onClick={() => startExam(exam)}>
            <Icon name="clock" /> Start prøven
          </button>
          <button className="btn ghost" onClick={() => { store.remove(exam); store.navigate({ name: 'eksamen' }); }}>
            Avbryt
          </button>
        </div>
      </div>
    </div>
  );
}

function ExamRunning({ exam }: { exam: ExamSim }) {
  const [idx, setIdx] = useState(0);
  const [now, setNow] = useState(Date.now());
  const busy = useStore((s) => s.ui.busy.exam);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const end = Date.parse(exam.startedAt!) + exam.durationMin * 60000;
  const left = Math.max(0, Math.round((end - now) / 1000));
  useEffect(() => {
    if (left === 0 && !busy) {
      store.toast('Tiden er ute. Prøven leveres.', 'info');
      void submitExam(exam.id);
    }
  }, [left, busy, exam.id]);
  const aid = exam.attemptIds[idx];
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className="page">
      <div className="card tight row between" style={{ position: 'sticky', top: 64, zIndex: 12 }}>
        <div className="row">
          <Icon name="clock" />
          <span className="timer tnum" aria-live="off" aria-label={`${mm} minutter og ${ss} sekunder igjen`}>
            {mm}:{ss}
          </span>
          <span className="small muted">igjen · {exam.aids}</span>
        </div>
        <div className="row">
          <ConfirmButton
            className="btn small ghost"
            confirmText="Gå over til øving? Prøven registreres ikke som fullført."
            onConfirm={() => {
              for (const id of exam.attemptIds) {
                const a = store.get<Attempt>('attempt', id);
                if (a) store.upsert({ ...a, mode: 'læring', examId: undefined });
              }
              store.upsert({ ...exam, status: 'avbrutt' });
              store.navigate({ name: 'tren', attemptId: exam.attemptIds[idx] });
            }}
          >
            Gå over til øving
          </ConfirmButton>
          <ConfirmButton className="btn small primary" confirmText="Levere hele prøven nå?" onConfirm={() => submitExam(exam.id)}>
            Lever prøven
          </ConfirmButton>
        </div>
      </div>
      <div className="part-tabs" role="tablist" aria-label="Oppgaver i prøven">
        {exam.attemptIds.map((id, i) => {
          const a = store.get<Attempt>('attempt', id);
          const done = a?.parts.every((p) => p.submitted);
          return (
            <button key={id} role="tab" className="part-tab" aria-selected={i === idx} onClick={() => setIdx(i)}>
              {i + 1}
              {done ? <span className="dot ok" /> : null}
            </button>
          );
        })}
      </div>
      {busy ? <Notice>{busy}</Notice> : null}
      {aid ? <Workspace key={aid} attemptId={aid} onNext={idx < exam.attemptIds.length - 1 ? () => setIdx(idx + 1) : undefined} /> : null}
    </div>
  );
}

function ExamResult({ exam }: { exam: ExamSim }) {
  const r = exam.result;
  if (exam.status === 'avbrutt')
    return (
      <div className="page">
        <Empty icon="clock" title="Prøven ble avbrutt">
          Du gikk over til øving underveis, så prøven er ikke registrert som fullført uten hjelp. Forsøkene finnes under Tren.
        </Empty>
      </div>
    );
  if (!r) return null;
  const total = r.perTask.reduce((n, t) => n + t.score, 0);
  const max = r.perTask.reduce((n, t) => n + t.max, 0);
  return (
    <div className="page">
      <div className="stack sm">
        <span className="eyebrow">Prøveresultat · {fmtDate(exam.submittedAt)}</span>
        <h1>
          {Rat.fromNumber(Math.round(total * 10) / 10).toNo(1)} av {Rat.fromNumber(max).toNo(1)} treningspoeng
        </h1>
        <p className="small muted">{r.pointsNote}</p>
      </div>
      <section className="card stack sm">
        <h3>Per oppgave</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Oppgave</th>
                <th>Poeng</th>
                <th>Vurdering</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {r.perTask.map((t, i) => (
                <tr key={t.ref}>
                  <td>{t.title}</td>
                  <td className="tnum">
                    {Rat.fromNumber(t.score).toNo(1)} / {Rat.fromNumber(t.max).toNo(1)}
                  </td>
                  <td>
                    <Pill tone={t.verdict === 'riktig' ? 'teal' : t.verdict === 'delvis' ? 'amber' : t.verdict === 'ikke besvart' ? 'outline' : 'red'}>{t.verdict}</Pill> {t.uncertain ? <Pill tone="outline">Usikker vurdering</Pill> : null}
                  </td>
                  <td>
                    <button className="src-link" onClick={() => store.navigate({ name: 'tren', attemptId: exam.attemptIds[i] })}>
                      Se gjennomgang
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="xs muted">Forklaringer er vurdert foreløpig (AI mot synlig ramme) eller ikke vurdert når AI mangler. Usikre vurderinger er merket og teller ikke i mestringsbildet.</p>
      </section>
      <section className="card stack sm">
        <h3>Per ferdighet</h3>
        <div className="row">
          {r.perSkill.map((s) => (
            <Pill key={s.skillId} tone={s.outcome === 'Vist selvstendig' ? 'teal' : s.outcome === 'Uavklart' || s.outcome === 'Ikke besvart' ? 'outline' : s.outcome === 'Delvis vist' ? 'amber' : 'red'}>
              {skillName(s.skillId)}: {s.outcome}
            </Pill>
          ))}
        </div>
      </section>
      {r.repairTaskIds.length ? (
        <section className="hero-card">
          <span className="eyebrow">Reparasjonsøkt</span>
          <h2>{r.repairTaskIds.length} oppgaver rettet mot hullene prøven viste</h2>
          <p>Med hjelp tilgjengelig. Start med første oppgave når du er klar.</p>
          <div>
            <button
              className="btn primary"
              onClick={() => {
                const s = store.sessions().find((x) => x.plan.taskIds[0] === r.repairTaskIds[0]);
                const t = store.get<GeneratedTask>('gen', r.repairTaskIds[0]);
                if (!t) return;
                const a = startAttempt(t, 'læring', s?.id);
                store.navigate({ name: 'tren', attemptId: a.id, sessionId: s?.id });
              }}
            >
              Start reparasjonsøkten
            </button>
          </div>
        </section>
      ) : (
        <Notice tone="teal">
          <span className="small">Ingen tydelige hull på denne prøven. Neste steg er en ny prøve etter en pause, eller blandede oppgaver.</span>
        </Notice>
      )}
    </div>
  );
}

export type { SourceDoc };
