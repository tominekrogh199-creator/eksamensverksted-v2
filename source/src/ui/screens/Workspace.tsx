// Arbeidsflaten: oppgaven, studentens arbeid og læreren henger sammen.

import { FigureCrop } from '../components/FigureCrop';
import { subtaskTitle } from '../../learning/originals';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Attempt, GeneratedTask, GenPart, PartAttempt, PartAssessment, WorkLine, ImageRef, ExamSim } from '../../domain/types';
import { newId, nowIso } from '../../domain/types';
import { store, useStore } from '../../state/store';
import { patchPart, recordHelp, submitPart, newVariant, startAttempt, correctAssessment, emptyPartAttempt } from '../../learning/actions';
import { checkWorkBest } from '../../math/check';
import { effectiveLines } from '../../learning/assess';
import { LinesEditor, LineStatusView } from '../components/LinesEditor';
import { eng } from '../../families/el-common';
import { TutorPanel, addChat, StepList } from '../components/TutorPanel';
import { Whiteboard, boardWorthIt } from '../components/Whiteboard';
import { onFlush } from '../flush';
import { EquilibriumGraph } from '../components/Graphs';
import { Tex, RichText } from '../components/Math';
import { Icon } from '../components/Icon';
import { BasisTag, DemoBadge, Notice, Pill, Sheet, SourceLink, Spinner } from '../components/common';
import { getFamily } from '../../families';
import { LEVEL_LABEL, STYLE_LABEL } from '../../generator/generate';
import { skillName } from '../../families/skills';
import { blobs } from '../../storage/backend';
import { sha256Hex } from '../../ingest/fingerprint';
import { readHandwriting } from '../../ai/prompts';
import { aiImagesAvailable, aiAvailable } from '../../ai/client';
import { DEMO_HANDWRITING, demoImageRef, isDemoImageHash } from '../../demo/demo';
import { Rat } from '../../math/rational';
import { SpeakButton } from '../components/Voice';
import { commentSketchAi } from '../../ai/prompts';
import { similarExamLike } from '../../learning/examlike';
import { ORG_TOPIC_MAP } from '../../families/org';

const n = (s: string) => Rat.parse(s).toNumber();

function verdictTone(v: string): string {
  return v === 'riktig' || v === 'oppfylt' ? 'ok' : v === 'delvis' || v === 'ikke-vist' ? 'partial' : v === 'feil' || v === 'ikke-oppfylt' || v === 'mangler' ? 'bad' : 'unk';
}
const METHOD_TEXT: Record<string, string> = { riktig: 'Metoden stemmer', delvis: 'Godt oppsett, ett steg feil', feil: 'Metoden stemmer ikke', 'ikke-vist': 'Metoden er ikke vist', uavklart: 'Uavklart (avlesning)' };
const ANSWER_TEXT: Record<string, string> = { riktig: 'Svaret er riktig', delvis: 'Delvis riktig svar', feil: 'Svaret er feil', mangler: 'Svar mangler', uavklart: 'Uavklart', 'ikke-relevant': 'Ingen tallsvar' };

export function Workspace({ attemptId, onNext, onExit }: { attemptId: string; onNext?: () => void; onExit?: () => void }) {
  const att = useStore((s) => s.get<Attempt>('attempt', attemptId));
  const task = useStore((s) => (att ? s.get<GeneratedTask>('gen', att.taskRef.id) : undefined));
  const [partIdx, setPartIdx] = useState(0);
  const [board, setBoard] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const started = useRef(Date.now());
  useEffect(() => {
    started.current = Date.now();
    return () => {
      // Tiden telles også når oppgaven ble levert mens den var åpen (fram til leveringen).
      const a = store.get<Attempt>('attempt', attemptId);
      const sub = a?.submittedAt ? Date.parse(a.submittedAt) : NaN;
      const end = a?.status === 'pågår' ? Date.now() : sub >= started.current ? sub : NaN;
      if (a && Number.isFinite(end)) store.upsert({ ...a, timeSpentSec: a.timeSpentSec + Math.max(0, Math.round((end - started.current) / 1000)) });
    };
  }, [attemptId]);
  if (!att || !task) return <Notice tone="amber">Fant ikke oppgaven. Den kan være slettet.</Notice>;
  if (!task.parts.length) return <Notice tone="amber">Oppgaven har ingen deler å svare på.</Notice>;
  const part = task.parts[Math.min(partIdx, task.parts.length - 1)];
  // Et eldre forsøk kan mangle en deloppgave (oppgaven er bygget på nytt): lag en tom.
  const pa = att.parts.find((p) => p.partId === part.id) ?? emptyPartAttempt(part);
  const fam = getFamily(task.familyKbId);
  const exam = att.examId ? store.get<ExamSim>('exam', att.examId) : undefined;
  // Eksamensmodus gjelder bare mens prøven pågår. Etterpå vises vurdering og løsning.
  const examMode = att.mode === 'eksamen' && (!exam || exam.status === 'klar' || exam.status === 'pågår');
  const isOriginal = task.templateId === 'original';
  return (
    <div className="stack lg">
      <div className="workspace">
        <div className="task-col stack">
          <article className="task-card">
            <header className="stack sm">
              <div className="row between">
                <span className="gen-label">
                  <Icon name={isOriginal ? 'doc' : 'sparkle'} size={14} />
                  {examMode ? 'Prøveeksamen' : isOriginal ? (task.sourceKind === 'oppgavesamling' ? 'Oppgave fra oppgavesamlingen' : 'Originaloppgave fra eksamenssett') : task.templateId === 'ai-eksamen' ? 'Eksamensnær oppgave (AI, etter mønster fra eksamenene dine)' : 'Generert øvingsoppgave'}
                </span>
                <div className="row">
                  {task.demo ? <DemoBadge small /> : null}
                  {!isOriginal && !examMode && task.templateId !== 'ai-eksamen' ? <Pill>{task.style === 'standard' ? `Nivå ${task.level}: ${LEVEL_LABEL[task.level]}` : STYLE_LABEL[task.style]}</Pill> : null}
                </div>
              </div>
              {isOriginal && task.title.includes(' · Del ') ? (
                <>
                  <h2 style={{ fontSize: '1.3rem' }}>{task.title.slice(0, task.title.indexOf(' · Del '))}</h2>
                  <span className="small muted">
                    {task.title.slice(task.title.indexOf(' · Del ') + 3)}
                    {fam ? ` · ${fam.name}` : ''}
                  </span>
                </>
              ) : (
                <>
                  <h2 style={{ fontSize: '1.3rem' }}>{task.title}</h2>
                  {fam ? <span className="small muted">{fam.name}</span> : null}
                </>
              )}
            </header>
            <div className="body stack">
              {task.sourceRegions?.length ? (
                <>
                  {task.sourceRegions.map((r, i) => (
                    <FigureCrop key={`r${i}`} docId={r.docId} page={r.page} box={r.box} caption={task.sourceKind === 'oppgavesamling' ? 'Oppgaven i oppgavesamlingen' : 'Oppgaven i eksamenssettet'} />
                  ))}
                  {task.intro ? (
                    <details className="disclosure">
                      <summary className="small">Oppgaveteksten som tekst</summary>
                      <div className="source-text small">
                        <RichText text={task.intro} />
                      </div>
                    </details>
                  ) : null}
                </>
              ) : task.intro ? (
                <div className="source-block">
                  <div className="source-text">
                    <RichText text={task.intro} />
                  </div>
                </div>
              ) : null}
              {task.sourceFigures?.map((f, i) => <FigureCrop key={i} docId={f.docId} page={f.page} box={f.box} caption={task.sourceKind === 'oppgavesamling' ? 'Figur fra oppgavesamlingen' : 'Figur fra eksamenssettet'} />)}
              {task.solutionRegions?.length && !examMode && att.parts.some((p) => p.submitted) ? (
                <details className="disclosure" open>
                  <summary className="small">
                    <strong>Løsningsforslaget fra dokumentet</strong>
                  </summary>
                  <div className="stack sm">
                    {task.parts.some((p) => p.targets?.length) ? (
                      <p className="xs muted">
                        Sluttsvaret ditt ble sjekket mot {task.parts.flatMap((p) => p.targets ?? []).map((t) => `${t.label} = ${eng(Number(t.value), t.unit ?? '', 4)}`).join(', ')}, lest automatisk fra løsningen. Stemmer ikke det med utsnittet, er det utsnittet som gjelder.
                      </p>
                    ) : null}
                    {task.solutionRegions.map((r, i) => (
                      <FigureCrop key={`s${i}`} docId={r.docId} page={r.page} box={r.box} caption="Løsningsforslaget" />
                    ))}
                  </div>
                </details>
              ) : task.solutionRegions?.length && !examMode ? (
                <p className="xs muted">Løsningsforslaget fra dokumentet vises når du har levert.</p>
              ) : null}
              {task.parts.length > 1 ? (
                <div className="part-tabs" role="tablist" aria-label="Deloppgaver">
                  {task.parts.map((p, i) => {
                    const a = att.parts.find((x) => x.partId === p.id)?.assessment;
                    const tone = a ? verdictTone(a.interpretation ? a.interpretation.verdict : a.answer.verdict !== 'ikke-relevant' ? a.answer.verdict : a.method.verdict) : '';
                    return (
                      <button key={p.id} role="tab" className="part-tab" aria-selected={i === partIdx} onClick={() => setPartIdx(i)}>
                        {p.label.length === 1 ? `${p.label})` : p.label}
                        <span className={`dot ${tone === 'ok' ? 'ok' : tone === 'partial' ? 'partial' : tone === 'bad' ? 'bad' : ''}`} />
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <div className="stack sm">
                <strong>
                  {task.parts.length > 1 ? (part.label.length === 1 ? `${part.label}) ` : `${part.label}: `) : ''}
                  <RichText text={part.prompt} />
                </strong>
                <div className="row">
                  {(task.templateId === 'ai-eksamen' || examMode ? [] : part.skills.slice(0, 4)).map((s) => (
                    <Pill key={s} tone="outline">
                      {skillName(s)}
                    </Pill>
                  ))}
                </div>
                {!examMode ? <SpeakButton text={`${task.intro}. ${part.prompt}`} label="Les oppgaven" /> : null}
              </div>
              {part.graph && (part.graph.task === 'les' || part.graph.task === 'vis') && part.graph.type === 'likevekt' ? (
                <EquilibriumGraph a={n(part.graph.params.a)} b={n(part.graph.params.b)} c={n(part.graph.params.c)} d={n(part.graph.params.d)} qMax={part.graph.qMax} pMax={part.graph.pMax} showEq={false} a2={part.graph.task === 'vis' && pa.submitted && part.graph.params.a2 ? n(part.graph.params.a2) : undefined} />
              ) : null}
              {part.givenSteps?.length ? (
                <Notice tone="accent" icon="layers">
                  <strong className="small">Gitt: de første stegene. Fullfør resten selv.</strong>
                  <div className="stack sm">
                    {part.givenSteps.map((t, i) => (
                      <Tex key={i} tex={t} />
                    ))}
                  </div>
                </Notice>
              ) : null}
              {part.flawed ? <FlawedView part={part} pa={pa} att={att} disabled={pa.submitted} /> : null}
              {!examMode ? (
                <details className="disclosure">
                  <summary className="small">Hvor kommer oppgaven fra?</summary>
                  <Provenance task={task} revealed={att.parts.every((p) => p.submitted)} />
                </details>
              ) : null}
            </div>
          </article>
        </div>
        <div className="stack">
          <PartWork key={`${att.id}-${part.id}`} att={att} task={task} part={part} pa={pa} examMode={examMode} onShowBoard={() => setBoard(true)} />
          {!examMode ? (
            <div className="desktop-tutor" style={{ display: 'block' }}>
              <TutorPanel att={att} task={task} part={part} onShowBoard={() => setBoard(true)} />
            </div>
          ) : (
            <Notice tone="blue" icon="lock">
              <span className="small">Eksamensmodus: hint, fasit og lærer er skrudd av til du leverer.</span>
            </Notice>
          )}
          <div className="row between">
            {onExit ? (
              <button className="btn ghost" onClick={onExit}>
                <Icon name="prev" size={16} /> Tilbake
              </button>
            ) : (
              <span />
            )}
            <div className="row">
              {task.parts.length > 1 && partIdx < task.parts.length - 1 ? (
                <button className="btn" onClick={() => setPartIdx(partIdx + 1)}>
                  Neste deloppgave <Icon name="chevron" size={16} />
                </button>
              ) : null}
              {onNext && att.parts.every((p) => p.submitted) ? (
                <button className="btn primary" onClick={onNext}>
                  Neste oppgave <Icon name="chevron" size={16} />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      {board ? (
        <Sheet title="Vis meg: tavlegjennomgang" onClose={() => setBoard(false)}>
          <Whiteboard
            task={task}
            part={part}
            onAsk={(caption) => {
              setBoard(false);
              const a = addChat(att, { role: 'elev', text: `Jeg forstår ikke dette steget: «${caption}»`, partId: part.id });
              addChat(a, { role: 'lærer', text: `${part.hints.stepExplanation}\n\nSi gjerne hvilket ord eller tall i steget som er uklart, så tar vi det derfra.`, basis: 'regelbasert', partId: part.id });
              setTutorOpen(true);
            }}
          />
        </Sheet>
      ) : null}
    </div>
  );
}

function Provenance({ task, revealed }: { task: GeneratedTask; revealed: boolean }) {
  const subs = task.sourceRefs.subtaskIds.map((id) => store.get<import('../../domain/types').SubTask>('subtask', id)).filter(Boolean);
  return (
    <div className="stack sm small">
      {task.templateId === 'original' ? (
        <p>{task.templateVersion >= 2 ? 'Originalspørsmål fra eksamenssettet ditt. Flervalg vurderes mot fasit i kilden; forklaringer mot punktene i sensorveiledningen (foreløpig vurdering). Regnbare svar er regnet eksakt fra tallene i teksten.' : 'Originaloppgave. Fasit er regnet eksakt fra tallene i oppgaveteksten.'}</p>
      ) : (
        <p>
          Laget fra malen «{task.templateId}» (versjon {task.templateVersion}) i familien «{getFamily(task.familyKbId)?.shortName}». Tallene er valgt av appen, og fasit er regnet ut og kontrollert med kode. {task.wording === 'ai-formulert' ? 'Ordlyden er formulert av AI.' : 'Ordlyden kommer fra malen.'} Oppgaven er ikke en tidligere eksamensoppgave.
        </p>
      )}
      <div>
        <span className="eyebrow">Kontroll</span>
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {task.validation.checks.slice(0, 8).map((c, i) => (
            <li key={i} style={{ color: c.ok ? undefined : 'var(--amber)' }}>
              {c.ok ? '✓' : '!'} {c.name}
              {revealed ? `: ${c.detail}` : ''}
            </li>
          ))}
          {!revealed ? <li className="faint">Detaljene (med fasit) vises når du har levert.</li> : null}
          {task.validation.checks.length > 8 ? <li className="faint">… {task.validation.checks.length - 8} kontroller til, alle bestått</li> : null}
        </ul>
      </div>
      {subs.length ? (
        <div className="stack sm">
          <span className="eyebrow">Samme familie i eksamenssettene dine</span>
          <div className="row">
            {subs.slice(0, 6).map((s) => (
              <SourceLink key={s!.id} src={{ docId: s!.docId, docVersion: s!.docVersion, pdfPage: s!.pages[0], quote: s!.text.slice(0, 120), taskLabel: s!.label }} label={subtaskTitle(s!)} highlight={s!.seg.lineBoxes.filter((b) => b.page === s!.pages[0]).map((b) => b.box)} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FlawedView({ part, pa, att, disabled }: { part: GenPart; pa: PartAttempt; att: Attempt; disabled?: boolean }) {
  return (
    <div className="stack sm">
      <span className="eyebrow">Studentens løsning – trykk på linjen med den første feilen</span>
      {part.flawed!.lines.map((l, i) => (
        <button
          key={i}
          className="btn"
          style={{ justifyContent: 'flex-start', fontFamily: 'var(--f-mono)', borderColor: pa.flawedLine === i ? 'var(--accent)' : undefined, background: pa.flawedLine === i ? 'var(--accent-soft)' : undefined }}
          aria-pressed={pa.flawedLine === i}
          disabled={disabled}
          onClick={() => patchPart(att, part.id, { flawedLine: i })}
        >
          <span className="faint" style={{ width: 28 }}>
            {i + 1}
          </span>
          {l}
        </button>
      ))}
    </div>
  );
}

function PartWork({ att, task, part, pa, examMode, onShowBoard }: { att: Attempt; task: GeneratedTask; part: GenPart; pa: PartAttempt; examMode: boolean; onShowBoard: () => void }) {
  const [lines, setLines] = useState<WorkLine[]>(() => mergeConfirmed(pa));
  const [explanation, setExplanation] = useState(pa.explanation);
  const [statuses, setStatuses] = useState<Record<number, LineStatusView>>({});
  const [focusLine, setFocusLine] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [selfOpen, setSelfOpen] = useState(false);
  const [self, setSelf] = useState<Record<string, boolean>>({});
  const [checks, setChecks] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatch = useRef<Partial<PartAttempt>>({});
  const cur = () => store.get<Attempt>('attempt', att.id)!;
  useEffect(() => setLines(mergeConfirmed(pa)), [pa.lines]);
  // Eldre forsøk lagret bekreftede avlesninger per linjenummer; flytt dem inn i linjene én gang.
  useEffect(() => {
    if (Object.keys(pa.confirmedReadings ?? {}).length) patchPart(cur(), part.id, { lines: mergeConfirmed(pa), confirmedReadings: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Endringer samles og lagres etter en kort pause, når feltet mister fokus,
  // og alltid når deloppgaven lukkes (bytte fane, neste oppgave, navigering).
  const flushPatch = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const p = pendingPatch.current;
    if (!Object.keys(p).length) return;
    pendingPatch.current = {};
    const c = store.get<Attempt>('attempt', att.id);
    if (c) patchPart(c, part.id, p);
  };
  const persist = (patch: Partial<PartAttempt>) => {
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushPatch, 350);
  };
  useEffect(() => () => flushPatch(), []);
  // Prøven kan leveres utenfra (tiden er ute); da må det som er skrevet, lagres først.
  useEffect(() => onFlush(() => flushPatch()), []);
  const symbols = useMemo(() => [...new Set([...(part.math?.symbols ?? []), ...Object.keys(part.math?.solution ?? {}), ...(part.targets ?? []).map((t) => t.symbol)])], [part]);
  const submitted = pa.submitted;
  const a = pa.assessment;

  const checkLine = () => {
    if (!part.math) return;
    const el = effectiveLines({ ...pa, lines });
    const { checks: cs } = checkWorkBest(el.texts, part.math, { resolutions: pa.resolutions, uncertainLines: el.uncertain, sources: el.sources });
    const c = cs[focusLine];
    if (!c || !c.raw.trim()) return;
    let st: LineStatusView;
    if (c.status === 'ok') st = { tone: 'ok', text: c.statements.some((s) => s.pairs.some((p) => p.verdict === 'identitet')) && !c.statements.some((s) => s.pairs.some((p) => p.verdict === 'stemmer')) ? 'Stemmer (gyldig omskriving)' : 'Stemmer' };
    else if (c.status === 'avrundet') st = { tone: 'ok', text: 'Stemmer med avrunding' };
    else if (c.status === 'avvik') st = c.source === 'image' && c.readingCertain === false ? { tone: 'warn', text: 'Avlesningen må bekreftes før steget kan vurderes' } : { tone: 'bad', text: 'Dette steget stemmer ikke med linjene over eller oppgaven' };
    else if (c.status === 'uavklart-inndata') st = { tone: 'warn', text: 'Svar på spørsmålet om tallet først' };
    else if (c.status === 'tekst') st = { tone: 'warn', text: 'Tekst – vurderes ikke som regnesteg' };
    else if (c.status === 'kan-ikke-lese') st = { tone: 'warn', text: `Kan ikke leses: ${c.error}` };
    else st = { tone: 'warn', text: c.statements.flatMap((s) => s.pairs.map((p) => p.note)).filter(Boolean)[0] ?? 'Kan ikke kontrolleres automatisk' };
    const nChecks = checks + 1;
    if (nChecks === 3) st = { ...st, text: `${st.text}. Fra nå teller kontrollene som hjelp.` };
    setStatuses({ ...statuses, [focusLine]: st });
    setChecks(nChecks);
    recordHelp(cur(), { level: nChecks >= 3 ? 2 : 1, type: 'sjekk-steg', partId: part.id, text: `Linje ${focusLine + 1}` });
  };

  const dontKnow = () => {
    let at = recordHelp(cur(), { level: 2, type: 'første-steg', partId: part.id });
    at = addChat(at, { role: 'elev', text: 'Jeg vet ikke hvordan jeg starter.', partId: part.id });
    const ex = part.hints.workedExample.steps[0];
    addChat(at, { role: 'lærer', text: `${part.hints.firstStep}${ex ? `\n\nSlik ser første steg ut med andre tall: ${ex.tex ? `$${ex.tex}$` : ''} ${ex.text}` : ''}\n\nSkriv første linje, så ser vi på den sammen.`, basis: 'regelbasert', partId: part.id });
  };

  const submit = async (selfAssess?: Record<string, boolean>) => {
    const empty =
      !lines.some((l) => l.text.trim()) && !explanation.trim() && !pa.choiceId && !(pa.graphPoints ?? []).some((g) => g.points.length) && pa.flawedLine === undefined && !pa.images.length;
    if (empty && !examMode) {
      store.toast(part.kind === 'flervalg' ? 'Velg et alternativ før du leverer.' : 'Skriv svaret ditt før du leverer.', 'info');
      return;
    }
    // Åpne spørsmål om hvordan et tall skal leses, eller en avlesning fra bilde som ikke er
    // bekreftet: avklar først, ellers låses deloppgaven som «uavklart» uten vurdering.
    if (part.math) {
      const el = effectiveLines({ ...pa, lines });
      const { checks: cs } = checkWorkBest(el.texts, part.math, { resolutions: pa.resolutions, uncertainLines: el.uncertain, sources: el.sources });
      const open = cs.find((c) => c.status === 'uavklart-inndata');
      const unsure = [...el.uncertain][0];
      if (open || unsure !== undefined) {
        const i = open ? open.index : unsure!;
        setFocusLine(i);
        store.toast(open ? `Svar på spørsmålet ved linje ${i + 1} først, så vurderes svaret riktig.` : `Bekreft avlesningen av linje ${i + 1} fra bildet først.`, 'info');
        document.querySelectorAll<HTMLElement>('.lines .line')[i]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
    }
    setSubmitting(true);
    flushPatch();
    patchPart(cur(), part.id, { lines, explanation });
    const after = await submitPart(att.id, part.id, { self: selfAssess });
    setSubmitting(false);
    setSelfOpen(false);
    const pa2 = after.parts.find((p) => p.partId === part.id);
    if (pa2?.assessment && !examMode) {
      addChat(after, { role: 'lærer', text: pa2.assessment.feedback || 'Levert.', basis: 'regelbasert', partId: part.id });
      if (pa2.assessment.answer.verdict === 'riktig' && pa2.assessment.method.verdict === 'riktig' && after.help.filter((h) => h.partId === part.id && h.level > 1).length === 0) store.toast('Løst selvstendig.', 'ok');
    }
  };

  const needsSelf = part.kind === 'forklaring' && (part.selfCheck || !aiAvailable()) && !examMode;
  const orgTopic = ORG_TOPIC_MAP[task.familyKbId];
  const essayLike = !!orgTopic && part.kind === 'forklaring' && (task.estMinutes ?? 0) >= 20;

  return (
    <section className="card stack" aria-label="Ditt arbeid" onBlur={flushPatch}>
      <div className="row between">
        <h3>Ditt arbeid</h3>
        {submitted ? <Pill tone="teal">Levert</Pill> : null}
      </div>
      {part.kind === 'flervalg' ? (
        <div className="stack sm" role="radiogroup" aria-label="Alternativer">
          {part.choices!.map((c) => (
            <label key={c.id} className="choice" style={{ minHeight: 0, flexDirection: 'row', alignItems: 'center', borderColor: pa.choiceId === c.id ? 'var(--accent)' : undefined }}>
              <input type="radio" name={`choice-${part.id}`} checked={pa.choiceId === c.id} disabled={submitted} onChange={() => patchPart(cur(), part.id, { choiceId: c.id })} />
              <span>{c.text}</span>
            </label>
          ))}
        </div>
      ) : null}
      {part.kind === 'graf' ? <GraphInput att={att} part={part} pa={pa} disabled={submitted} examMode={examMode} /> : null}
      {part.kind === 'forklaring' ? (
        <div className="field">
          <div className="row between">
            <label htmlFor={`exp-${part.id}`}>{part.math && !part.targets?.length ? 'Kommentar (valgfritt)' : 'Svaret ditt'}</label>
            {orgTopic && essayLike && !submitted && !examMode && !explanation.trim() ? (
              <button
                type="button"
                className="btn ghost small"
                title="Setter inn overskrifter for en god svarstruktur. Fyll inn under hver."
                onClick={() => {
                  const tpl = orgTopic.structure.map((h) => `${h}:\n`).join('\n');
                  setExplanation(tpl);
                  persist({ explanation: tpl });
                }}
              >
                Sett inn svarmal
              </button>
            ) : null}
          </div>
          <textarea
            id={`exp-${part.id}`}
            className="input"
            style={{ minHeight: part.math && !part.targets?.length ? 70 : essayLike ? 340 : 160 }}
            value={explanation}
            disabled={submitted}
            onChange={(e) => {
              setExplanation(e.target.value);
              persist({ explanation: e.target.value });
            }}
            placeholder={part.math && !part.targets?.length ? 'F.eks. hva du er usikker på.' : orgTopic ? 'Skriv som på eksamen: definer begrepene i tråd med pensum, bruk en modell med navn på forfatterne, gi et eksempel fra arbeidslivet, vis til forskning og drøft.' : /\d/.test(`${task.intro} ${part.prompt}`) ? 'Skriv som på eksamen: definer begrepene, forklar sammenhengen og bruk tallene fra oppgaven.' : 'Skriv som på eksamen: definer begrepene, forklar sammenhengen og konkluder.'}
          />
          <WordCount text={explanation} limit={wordLimitOf(`${task.intro} ${part.prompt}`)} />
        </div>
      ) : null}
      {part.kind === 'beregning' || part.kind === 'finn-feilen' || (part.kind === 'forklaring' && (part.targets?.length || part.math)) ? (
        <>
          <LinesEditor
            lines={lines}
            disabled={submitted}
            symbols={symbols}
            resolutions={pa.resolutions}
            onResolve={(id, v) => patchPart(cur(), part.id, { resolutions: { ...pa.resolutions, [id]: v } })}
            statuses={statuses}
            confirmed={pa.confirmedReadings}
            onConfirmReading={(i, text) => {
              // Den bekreftede avlesningen blir selve linjen, så den følger med når linjer settes inn eller slettes.
              const ls = lines.map((l, k) => (k === i ? { ...l, text, certain: true } : l));
              setLines(ls);
              setStatuses({});
              persist({ lines: ls });
              if (!examMode) addChat(cur(), { role: 'system', text: `Avlesning av linje ${i + 1} bekreftet: «${text}»`, partId: part.id });
            }}
            onChange={(ls) => {
              setLines(ls);
              setStatuses({});
              persist({ lines: ls });
            }}
            onFocusLine={setFocusLine}
            units={part.math?.units}
            extraMenu={part.math?.units === 'si' ? symbols.filter((s) => s.length <= 4 && !['V', 'A', 'W'].includes(s)).slice(0, 5) : symbols.filter((s) => s.length <= 4 && !/^s\d$/.test(s) && s !== 'x').slice(0, 6)}
          />
          {!submitted ? <PhotoInput att={att} task={task} part={part} pa={pa} examMode={examMode} onLines={(ls) => setLines(ls)} /> : pa.images.length ? <PhotoInput att={att} task={task} part={part} pa={pa} examMode={examMode} readOnly onLines={() => {}} /> : null}
        </>
      ) : null}
      {!submitted ? (
        <div className="actionbar sticky">
          {part.math && !examMode ? (
            <button className="btn" onClick={checkLine} title={checks >= 2 ? 'Fra tredje kontroll teller det som hjelp' : 'Kontrollerer linjen du står i'}>
              <Icon name="check" size={16} /> Sjekk dette steget{checks ? ` (${checks})` : ''}
            </button>
          ) : null}
          {!examMode ? (
            <button className="btn ghost" onClick={dontKnow}>
              <Icon name="help" size={16} /> Jeg vet ikke hvordan jeg starter
            </button>
          ) : null}
          <ConfidencePicker att={att} />
          <button className="btn primary" disabled={submitting} onClick={() => (needsSelf ? setSelfOpen(true) : submit())}>
            {submitting ? <Spinner /> : <Icon name="send" size={16} />}
            Lever svar
          </button>
        </div>
      ) : null}
      {selfOpen ? (
        <div className="card flat stack">
          <strong>{part.selfCheck ? 'Sammenlikn med løsningsforslaget' : 'Sammenlikn med vurderingsrammen'}</strong>
          <p className="small muted">
            {part.selfCheck
              ? 'Se løsningsforslaget under og kryss av for det du faktisk fikk til. Dette er en egenkontroll: den hjelper deg å se hva du må øve mer på, men teller ikke som dokumentert mestring.'
              : 'Automatisk vurdering av forklaringer krever AI, som ikke er tilgjengelig her. Les sensorveiledningen eller modellsvaret under, og kryss av for det svaret ditt faktisk sier. Selvvurdering vises, men teller ikke som dokumentert mestring.'}
          </p>
          {part.modelAnswer || task.solutionRegions?.length ? (
            <details className="disclosure" open>
              <summary className="small">{task.templateId === 'original' ? 'Sensorveiledningen / løsningen' : 'Modellsvar'}</summary>
              {part.modelAnswer ? (
                <div className="source-text small" style={{ whiteSpace: 'pre-wrap' }}>
                  <RichText text={part.modelAnswer} />
                </div>
              ) : null}
              {task.solutionRegions?.map((r, i) => <FigureCrop key={i} docId={r.docId} page={r.page} box={r.box} caption="Løsningsforslaget" />)}
            </details>
          ) : null}
          {part.rubric!.map((r) => (
            <label key={r.id} className="row top small" style={{ gap: 10, flexWrap: 'nowrap' }}>
              <input type="checkbox" style={{ flex: 'none', marginTop: 3 }} checked={!!self[r.id]} onChange={(e) => setSelf({ ...self, [r.id]: e.target.checked })} />
              <span>
                {r.text} {r.required ? <span className="faint">(nødvendig)</span> : null}
              </span>
            </label>
          ))}
          <div className="row">
            <button className="btn primary" onClick={() => submit(self)}>
              Lever med selvvurdering
            </button>
            <button className="btn ghost" onClick={() => setSelfOpen(false)}>
              Avbryt
            </button>
          </div>
        </div>
      ) : null}
      {a && !examMode ? <FeedbackView att={att} task={task} part={part} a={a} onShowBoard={onShowBoard} /> : null}
      {a && examMode ? <p className="small muted">Levert. Vurderingen vises når hele prøven er levert.</p> : null}
    </section>
  );
}

function ConfidencePicker({ att }: { att: Attempt }) {
  return (
    <label className="xs muted row" style={{ gap: 6 }}>
      Hvor sikker er du?
      <select className="input" style={{ minHeight: 40, width: 'auto', padding: '4px 8px' }} value={att.confidence ?? ''} onChange={(e) => store.upsert({ ...store.get<Attempt>('attempt', att.id)!, confidence: (e.target.value || undefined) as Attempt['confidence'] })}>
        <option value="">Ikke oppgitt</option>
        <option value="sikker">Sikker</option>
        <option value="usikker">Usikker</option>
        <option value="gjettet">Gjettet</option>
      </select>
    </label>
  );
}

function FeedbackView({ att, task, part, a, onShowBoard }: { att: Attempt; task: GeneratedTask; part: GenPart; a: PartAssessment; onShowBoard: () => void }) {
  const [showSolution, setShowSolution] = useState(false);
  const [making, setMaking] = useState(false);
  const sawSol = att.help.some((h) => h.partId === part.id && h.level >= 5);
  const ip = a.interpretation;
  return (
    <div className="feedback" aria-live="polite">
      <div className="fb-head" style={(ip && !a.answer.items.length) || part.kind === 'flervalg' ? { gridTemplateColumns: '1fr' } : undefined}>
        {(ip && !a.answer.items.length) || part.kind === 'flervalg' ? null : (
          <div className="fb-cell">
            <span className="eyebrow">Metode</span>
            <span className={`verdict ${verdictTone(a.method.verdict)}`}>{part.math?.units === 'si' && a.method.verdict === 'riktig' ? 'Regningen stemmer' : METHOD_TEXT[a.method.verdict] ?? a.method.verdict}</span>
          </div>
        )}
        <div className="fb-cell">
          <span className="eyebrow">{ip ? 'Forklaring' : 'Svar'}</span>
          <span className={`verdict ${verdictTone(ip ? ip.verdict : a.answer.verdict)}`}>{ip ? (ip.verdict === 'oppfylt' ? 'Dekker det som trengs' : ip.verdict === 'delvis' ? 'Delvis dekkende' : ip.verdict === 'ikke-oppfylt' ? 'Mangler viktige punkter' : ip.verdict === 'ikke-vurdert' ? 'Ikke vurdert' : 'Uavklart') : ANSWER_TEXT[a.answer.verdict]}</span>
        </div>
      </div>
      <div className="stack" style={{ padding: 'var(--s4)' }}>
        <div style={{ whiteSpace: 'pre-wrap' }}>
          <RichText text={a.feedback} />
        </div>
        {a.method.checkpoints.length ? (
          <ul className="facets">
            {a.method.checkpoints.map((c) => (
              <li key={c.id} className={c.shown ? 'on' : ''}>
                <span className="mark">{c.shown ? <Icon name="check" size={13} stroke={3} /> : null}</span>
                {c.label}
                {c.shown === false ? <span className="faint xs">(ikke vist)</span> : c.shown === null ? <span className="faint xs">(vurderes i forklaringen)</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {a.answer.items.length && !ip ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Størrelse</th>
                  <th>Ditt svar</th>
                  <th>Vurdering</th>
                </tr>
              </thead>
              <tbody>
                {a.answer.items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.label}</td>
                    <td className="tnum">{it.given ?? '–'}</td>
                    <td>
                      {it.verdict === 'riktig' ? 'Riktig' : it.verdict === 'riktig-avrundet' ? 'Riktig (avrundet)' : it.verdict === 'mangler' ? 'Mangler' : it.verdict === 'uavklart' ? 'Uavklart' : it.verdict === 'true' ? 'Riktig' : it.verdict === 'false' ? 'Ikke riktig' : 'Ikke riktig'}
                      {it.note ? <div className="xs faint">{it.note}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {ip && ip.criteria.length ? (
          <div className="stack sm">
            <div className="row">
              <span className="eyebrow">Vurderingsramme</span>
              <BasisTag basis={ip.basis === 'ai-vurdering' ? 'ai-tolkning' : ip.basis === 'selvvurdering' ? 'bruker' : 'uavklart'} />
              {ip.basis === 'ai-vurdering' ? <span className="xs faint">Foreløpig AI-vurdering, ikke offisiell sensur</span> : null}
            </div>
            <ul className="criteria">
              {ip.criteria.map((c) => (
                <li key={c.id}>
                  <Pill tone={c.verdict === 'oppfylt' ? 'teal' : c.verdict === 'delvis' ? 'amber' : c.verdict === 'uavklart' ? 'outline' : 'red'}>{c.verdict}</Pill>
                  <span className="small">
                    {c.text}
                    {c.evidence ? <span className="faint"> Sitat: «{c.evidence}»</span> : null}
                    {c.comment ? <span className="muted"> {c.comment}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            {ip.summary ? <p className="small muted">{ip.summary}</p> : null}
          </div>
        ) : null}
        {a.readingIssues.length ? (
          <Notice tone="amber">
            {a.readingIssues.map((r, i) => (
              <span key={i} className="small">
                {r}
              </span>
            ))}
          </Notice>
        ) : null}
        <p className="xs faint">Grunnlag: {a.basis}</p>
        <div className="row">
          <button
            className="btn small"
            onClick={() => {
              if (!sawSol) recordHelp(att, { level: 5, type: 'løsning', partId: part.id });
              setShowSolution(!showSolution);
            }}
          >
            <Icon name="book" size={16} /> {showSolution ? 'Skjul' : 'Vis'} full forklaring
          </button>
          {boardWorthIt(task, part) ? (
            <button className="btn small" onClick={onShowBoard}>
              <Icon name="play" size={16} /> Vis meg på tavla
            </button>
          ) : null}
          <button
            className="btn small soft"
            disabled={making}
            onClick={async () => {
              // Eksamensspørsmål og eksamensnære oppgaver: en ny oppgave i samme tema og format (AI).
              // Ellers: en ny variant av malen med nye tall.
              let v: GeneratedTask | null = null;
              if (aiAvailable() && (task.templateId === 'original' || task.templateId === 'ai-eksamen')) {
                setMaking(true);
                const r = await similarExamLike(task);
                setMaking(false);
                v = r.task ?? null;
                if (!v && r.error) store.toast(r.error, 'info');
              }
              if (!v) v = newVariant(task);
              if (!v) return store.toast('Fant ikke en ny variant akkurat nå.', 'info');
              const na = startAttempt(v, att.mode === 'eksamen' ? 'læring' : att.mode, att.sessionId);
              store.navigate({ name: 'tren', attemptId: na.id, sessionId: att.sessionId });
            }}
          >
            <Icon name="shuffle" size={16} /> {making ? 'Lager oppgave …' : task.templateId === 'original' || task.templateId === 'ai-eksamen' ? 'Lignende eksamensoppgave' : 'Prøv en ny variant selv'}
          </button>
          {(a.uncertain || ip?.basis === 'ai-vurdering') && !(att.parts.find((x) => x.partId === part.id)?.reassessed ?? 0) ? (
            <button className="btn small ghost" title="Trekker vurderingen tilbake så du kan rette og levere på nytt (én gang per deloppgave)" onClick={() => correctAssessment(att.id, part.id, 'Studenten meldte at vurderingen var feil (avlesning eller AI-vurdering).')}>
              Vurderingen er feil
            </button>
          ) : null}
        </div>
        {showSolution ? (
          <div className="card flat stack">
            <StepList steps={part.solution} />
            {part.modelAnswer ? (
              <p className="small">
                <strong>Eksempel på et godt svar:</strong> {part.modelAnswer}
              </p>
            ) : null}
            <p className="xs muted">Når du har sett løsningen, teller ikke denne oppgaven som selvstendig mestring. Prøv en ny variant for å vise det selv.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ——— Bilde av håndskrift ———

function PhotoInput({ att, task, part, pa, examMode, onLines, readOnly }: { att: Attempt; task: GeneratedTask; part: GenPart; pa: PartAttempt; examMode: boolean; onLines: (l: WorkLine[]) => void; readOnly?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [zoomed, setZoomed] = useState<ImageRef | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cur = () => store.get<Attempt>('attempt', att.id)!;
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const im of pa.images) {
        const b = await blobs.get({ localKey: im.localKey, assetId: im.assetId });
        if (b) out[im.id] = URL.createObjectURL(b);
      }
      if (alive) setUrls(out);
    })();
    return () => {
      alive = false;
    };
  }, [pa.images]);

  const handle = async (blob: Blob, name: string, demoHint = false) => {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const hash = await sha256Hex(bytes);
      const id = newId('bilde');
      await blobs.putLocal(id, blob);
      const ref: ImageRef = { id, localKey: id, name, at: nowIso(), demo: demoHint || isDemoImageHash(hash) };
      const taskText = `${task.intro}\n${part.prompt}`;
      if (aiImagesAvailable()) {
        const r = await readHandwriting(blob, taskText);
        if (r.ok) ref.transcription = { by: 'ai', steps: r.data.steps, note: r.data.note };
        else store.toast(`Bildet kunne ikke leses automatisk: ${r.message}`, 'feil');
      } else if (ref.demo) {
        ref.transcription = { by: 'demo-fast', steps: DEMO_HANDWRITING.steps, note: DEMO_HANDWRITING.note };
      }
      const imgLines: WorkLine[] = (ref.transcription?.steps ?? []).map((s) => ({ text: s.text, source: 'image', imageId: id, region: s.region, certain: s.legible === 'sikker', alternatives: s.alternatives }));
      // Nye bildelinjer legges etter det som allerede står (f.eks. side 2 av en håndskrevet løsning).
      const existing = (cur().parts.find((p) => p.partId === part.id)?.lines ?? []).filter((l) => l.text.trim());
      const typed = existing;
      const lines = imgLines.length ? [...existing, ...imgLines] : existing;
      const at = patchPart(cur(), part.id, { images: [...(cur().parts.find((p) => p.partId === part.id)?.images ?? pa.images), ref], lines });
      onLines(lines);
      if (!examMode) {
        const unc = imgLines.map((l, i) => ({ l, i: i + typed.length })).filter((x) => !x.l.certain);
        if (ref.transcription) {
          const by = ref.transcription.by === 'ai' ? 'Jeg har lest bildet ditt (AI-avlesning).' : 'DEMO: bildet er lest med en forhåndslagret avlesning, ikke av AI.';
          const msg = unc.length ? `${by} Før jeg sier noe om matematikken: linje ${unc.map((u) => u.i + 1).join(', ')} er utydelig. ${unc[0].l.alternatives?.length ? `Står det «${unc[0].l.text}» eller «${unc[0].l.alternatives[0]}»?` : `Står det «${unc[0].l.text}»?`} Bekreft ved linjen.` : `${by} Kontroller at linjene til venstre stemmer med det du skrev, og rett dem om nødvendig.`;
          addChat(at, { role: 'lærer', text: msg, basis: ref.transcription.by === 'demo-fast' ? 'demo' : 'ai', partId: part.id });
        } else {
          addChat(at, { role: 'lærer', text: 'Bildet er lagret sammen med forsøket. Automatisk lesing av håndskrift krever AI, som ikke er tilgjengelig her. Skriv av stegene i feltene, så kontrollerer jeg dem.', basis: 'regelbasert', partId: part.id });
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const isDemoTask = task.id.startsWith('demo-lik-');
  // Uten AI-bildelesing kan appen bare lagre bildet, ikke vurdere det. Da tilbyr vi det ikke.
  const canRead = aiImagesAvailable() || isDemoTask;
  if (!canRead && !pa.images.length) return null;
  return (
    <div className="stack sm">
      {!readOnly && canRead ? (
        <div className="row">
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && handle(e.target.files[0], e.target.files[0].name)} />
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && handle(e.target.files[0], e.target.files[0].name)} />
          <button className="btn small" onClick={() => camRef.current?.click()} disabled={busy}>
            <Icon name="camera" size={16} /> Ta bilde av arbeidet
          </button>
          <button className="btn small ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Icon name="image" size={16} /> Velg bilde
          </button>
          {isDemoTask ? (
            <button
              className="btn small soft"
              disabled={busy}
              onClick={async () => {
                const d = await demoImageRef();
                await handle(d.blob, d.ref.name, true);
              }}
            >
              <Icon name="image" size={16} /> Bruk demobildet (DEMO)
            </button>
          ) : null}
          {busy ? <Spinner label={aiImagesAvailable() ? 'Leser håndskriften …' : 'Lagrer bildet …'} /> : null}
        </div>
      ) : null}
      {pa.images.length ? (
        <div className="grid-2">
          {pa.images.map((im) => (
            <figure key={im.id} className="stack sm" style={{ margin: 0 }}>
              <button className="photo" onClick={() => setZoomed(im)} style={{ padding: 0, cursor: 'zoom-in' }} aria-label={`Forstørr ${im.name}`}>
                {urls[im.id] ? <img src={urls[im.id]} alt={`Bilde av utregning: ${im.name}`} /> : <div style={{ padding: 20 }} className="small muted">Bildet finnes ikke på denne enheten.</div>}
                {im.transcription?.steps.map((s, i) =>
                  s.region ? <span key={i} className={`region ${s.legible !== 'sikker' ? 'warn' : ''}`} style={{ left: `${s.region.x * 100}%`, top: `${s.region.y * 100}%`, width: `${s.region.w * 100}%`, height: `${s.region.h * 100}%` }} /> : null,
                )}
              </button>
              <figcaption className="xs muted row">
                {im.demo ? <DemoBadge small /> : null}
                {im.transcription ? (im.transcription.by === 'ai' ? 'Avlest av AI' : im.transcription.by === 'demo-fast' ? 'Forhåndslagret demo-avlesning' : 'Skrevet av deg') : 'Ikke avlest automatisk'}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}
      {zoomed ? <ImageZoom im={zoomed} url={urls[zoomed.id]} onClose={() => setZoomed(null)} onCrop={readOnly ? undefined : async (blob) => {
        setZoomed(null);
        await handle(blob, `${zoomed.name} (utsnitt)`);
      }} /> : null}
    </div>
  );
}

function ImageZoom({ im, url, onClose, onCrop }: { im: ImageRef; url?: string; onClose: () => void; onCrop?: (b: Blob) => void }) {
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const pos = (e: React.PointerEvent) => {
    const r = imgRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const crop = async () => {
    if (!sel || !imgRef.current || !onCrop) return;
    const img = imgRef.current;
    const c = document.createElement('canvas');
    const x = Math.min(sel.x0, sel.x1) * img.naturalWidth;
    const y = Math.min(sel.y0, sel.y1) * img.naturalHeight;
    const w = Math.abs(sel.x1 - sel.x0) * img.naturalWidth;
    const h = Math.abs(sel.y1 - sel.y0) * img.naturalHeight;
    if (w < 20 || h < 20) return;
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(img, x, y, w, h, 0, 0, w, h);
    c.toBlob((b) => b && onCrop(b), 'image/jpeg', 0.9);
  };
  return (
    <Sheet title={im.name} onClose={onClose}>
      <div className="row">
        <button className="icon-btn" aria-label="Zoom ut" onClick={() => setZoom(Math.max(0.6, zoom - 0.25))}>
          <Icon name="zoomOut" />
        </button>
        <button className="icon-btn" aria-label="Zoom inn" onClick={() => setZoom(Math.min(3, zoom + 0.25))}>
          <Icon name="zoomIn" />
        </button>
        {onCrop ? <span className="xs muted">Dra over et område for å beskjære og lese det på nytt.</span> : null}
        {sel && onCrop ? (
          <button className="btn small primary" onClick={crop} disabled={!aiImagesAvailable()} title={aiImagesAvailable() ? '' : 'Krever AI-bildelesing'}>
            Les utsnittet på nytt
          </button>
        ) : null}
      </div>
      <div className="zoom-wrap">
        <div style={{ position: 'relative', width: `${zoom * 100}%`, touchAction: 'none' }} onPointerDown={(e) => { if (!onCrop) return; const p = pos(e); setSel({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); setDrag(true); }} onPointerMove={(e) => drag && sel && setSel({ ...sel, x1: pos(e).x, y1: pos(e).y })} onPointerUp={() => setDrag(false)}>
          {url ? <img ref={imgRef} src={url} alt={im.name} style={{ width: '100%', display: 'block', borderRadius: 8 }} draggable={false} /> : null}
          {im.transcription?.steps.map((s, i) => (s.region ? <span key={i} className={`hl ${s.legible !== 'sikker' ? 'fig' : ''}`} style={{ left: `${s.region.x * 100}%`, top: `${s.region.y * 100}%`, width: `${s.region.w * 100}%`, height: `${s.region.h * 100}%` }} /> : null))}
          {sel ? <span className="hl" style={{ left: `${Math.min(sel.x0, sel.x1) * 100}%`, top: `${Math.min(sel.y0, sel.y1) * 100}%`, width: `${Math.abs(sel.x1 - sel.x0) * 100}%`, height: `${Math.abs(sel.y1 - sel.y0) * 100}%` }} /> : null}
        </div>
      </div>
      {im.transcription ? (
        <ol className="small">
          {im.transcription.steps.map((s, i) => (
            <li key={i}>
              «{s.text}» – {s.legible}
              {s.alternatives?.length ? ` (kan også være: ${s.alternatives.join(', ')})` : ''}
            </li>
          ))}
        </ol>
      ) : null}
    </Sheet>
  );
}

// ——— Graf-inndata ———

function GraphInput({ att, part, pa, disabled, examMode }: { att: Attempt; part: GenPart; pa: PartAttempt; disabled?: boolean; examMode?: boolean }) {
  const [mode, setMode] = useState<'etterspørsel' | 'tilbud' | 'likevekt'>('etterspørsel');
  const g = part.graph!;
  const user = pa.graphPoints ?? [];
  const place = (q: number, p: number) => {
    if (disabled) return;
    const existing = user.find((u) => u.curve === mode);
    const max = mode === 'likevekt' ? 1 : 2;
    const pts = existing ? [...existing.points, { x: q, y: p }].slice(-max) : [{ x: q, y: p }];
    const next = [...user.filter((u) => u.curve !== mode), { curve: mode, points: pts }];
    patchPart(store.get<Attempt>('attempt', att.id)!, part.id, { graphPoints: next });
    if (mode === 'etterspørsel' && pts.length === 2) setMode('tilbud');
    else if (mode === 'tilbud' && pts.length === 2) setMode('likevekt');
  };
  const [sketchNote, setSketchNote] = useState<string | null>(null);
  return (
    <div className="stack sm">
      <div className="tabs" role="tablist" aria-label="Hva plasserer du?">
        {(['etterspørsel', 'tilbud', 'likevekt'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>
            {m === 'etterspørsel' ? 'Etterspørsel (2 punkter)' : m === 'tilbud' ? 'Tilbud (2 punkter)' : 'Likevekt (1 punkt)'}
          </button>
        ))}
      </div>
      <EquilibriumGraph a={n(g.params.a)} b={n(g.params.b)} c={n(g.params.c)} d={n(g.params.d)} qMax={g.qMax} pMax={g.pMax} hideCurves={!pa.submitted || !!examMode} showEq={pa.submitted && !examMode} user={user} onPlace={place} label="Tegneflate: trykk for å plassere punkter. Pris på loddrett akse, kvantum på vannrett." />
      <div className="row">
        <span className="xs muted">Trykk i diagrammet for å plassere punkter. Punktene festes til nærmeste halve enhet.</span>
        {!disabled ? (
          <button className="btn small ghost" onClick={() => patchPart(store.get<Attempt>('attempt', att.id)!, part.id, { graphPoints: user.filter((u) => u.curve !== mode) })}>
            Nullstill {mode}
          </button>
        ) : null}
      </div>
      <details className="disclosure">
        <summary className="small">Har du tegnet på papir?</summary>
        <div className="stack sm">
          <p className="small muted">Last opp et bilde av skissen. {examMode ? 'Bildet lagres sammen med besvarelsen.' : aiImagesAvailable() ? 'AI-læreren kommenterer hva skissen viser (tolkning, ikke poeng).' : 'Automatisk kommentar krever AI; bildet lagres sammen med forsøket.'}</p>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Last opp bilde av grafskisse"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const id = newId('bilde');
              await blobs.putLocal(id, f);
              patchPart(store.get<Attempt>('attempt', att.id)!, part.id, { images: [...pa.images, { id, localKey: id, name: f.name, at: nowIso() }] });
              if (aiImagesAvailable() && !examMode) {
                setSketchNote('Ser på skissen …');
                const r = await commentSketchAi(f, `etterspørselen Qd = ${g.params.a} − ${g.params.b}P og tilbudet Qs = ${g.params.c} + ${g.params.d}P, med pris på loddrett akse og likevekten markert`);
                setSketchNote(r.ok ? r.data : r.message);
              } else setSketchNote('Bildet er lagret.');
            }}
          />
          {sketchNote ? (
            <div className="notice accent small">
              <RichText text={sketchNote} />
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}

/** Linjene med eventuelle eldre bekreftelser (lagret per linjenummer) flettet inn. */
function mergeConfirmed(pa: PartAttempt): WorkLine[] {
  const c = pa.confirmedReadings ?? {};
  if (!Object.keys(c).length) return pa.lines;
  return pa.lines.map((l, i) => (c[i] !== undefined ? { ...l, text: c[i], certain: true } : l));
}

/** Ordgrense fra oppgaveteksten («maks 200 ord», «høyst 200 ord»). */
function wordLimitOf(text: string): number | undefined {
  const m = /(?:maks(?:imalt)?|høyst|inntil|grense på)\s*(\d{2,4})\s*ord/i.exec(text);
  return m ? Number(m[1]) : undefined;
}

function WordCount({ text, limit }: { text: string; limit?: number }) {
  const n = text.trim() ? text.trim().split(/\s+/).length : 0;
  if (!n && !limit) return null;
  const over = limit !== undefined && n > limit;
  return (
    <span className="xs" style={{ color: over ? 'var(--red)' : 'var(--ink-3)', alignSelf: 'flex-end' }} aria-live="polite">
      {n} ord{limit ? ` av høyst ${limit}` : ''}
      {over ? ' – for langt' : ''}
    </span>
  );
}
