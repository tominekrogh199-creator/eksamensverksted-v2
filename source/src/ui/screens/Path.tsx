// Hjem: eksamensplanen. Temaene i faget som en prioritert liste, sortert etter
// hvor ofte de kommer på eksamenene dine. Hver rad viser hvor mye temaet teller,
// hvor langt du har kommet, og Lær / Oppgaver. Hvert nivå avsluttes med en
// kapittelutfordring mot din egen rekord.

import { useMemo, useState } from 'react';
import type { Attempt, GeneratedTask, ExamSim } from '../../domain/types';
import { store, useStore } from '../../state/store';
import { getFamily } from '../../families';
import { chapters, chapterState, nextStep, topicProgress, relevanceText, relevanceBar, formatText, type TopicStat, type Chapter } from '../../learning/path';
import { topicQuestions, cachedLesson } from '../../learning/lesson';
import { profile } from '../../learning/game';
import { canMakeExamLike, formatPool } from '../../learning/examlike';
import { originalPool } from '../../learning/originals';
import { aiAvailable } from '../../ai/client';
import { startSessionAndGo, startOriginalsAndGo } from '../go';
import { startExamLikeAndGo } from './Train';
import { competitionPoolSize, COMPETITION_N } from './Compete';
import { MascotSays } from '../components/Mascot';
import { StatBar, Trophy } from '../components/Game';
import { Icon } from '../components/Icon';
import { Pill, Sheet, Spinner, relTime } from '../components/common';

type PracticeKind = 'ai' | 'ekte' | 'mal';

/** Hvilke måter å øve på temaet som finnes, og hvilken som er best akkurat nå. */
export function practiceOptions(kbId: string) {
  const pool = originalPool();
  const exam = [...pool.flervalg, ...pool.kortsvar, ...pool.langsvar, ...pool.oppgave].filter((s) => s.analysis.familyKbId === kbId);
  const coll = pool.samling.filter((s) => s.analysis.familyKbId === kbId);
  const ai = canMakeExamLike() && (['flervalg', 'kortsvar', 'langsvar', 'regne'] as const).some((f) => formatPool(f).some((s) => s.analysis.familyKbId === kbId));
  const templates = (getFamily(kbId)?.templates.length ?? 0) > 0;
  // Uten AI kan tekstsvar bare vurderes av deg selv. Da er spørsmål appen kan rette
  // (flervalg, regneoppgaver med sluttsvar) eller maloppgaver bedre som hovedvalg.
  const checkable = exam.filter((s) => s.format === 'flervalg' || (s.format === 'oppgave' && s.answerKeys?.length)).length + coll.filter((s) => s.answerKeys?.length).length;
  const best: PracticeKind = ai ? 'ai' : aiAvailable() && (exam.length || coll.length) ? 'ekte' : checkable >= 2 ? 'ekte' : templates ? 'mal' : 'ekte';
  return { exam: exam.length, coll: coll.length, ai, templates, best };
}

/** Oppgaver om ett tema (nye eksamensnære, ekte eksamensspørsmål eller øvingsoppgaver). */
export async function startTopicPractice(kbId: string, setBusy: (s: string | null) => void, kind?: PracticeKind) {
  const o = practiceOptions(kbId);
  const choice = kind ?? o.best;
  const name = getFamily(kbId)?.shortName;
  if (choice === 'ai' && o.ai) return startExamLikeAndGo(3, setBusy, undefined, [kbId]);
  if (choice !== 'mal' && o.exam) return startOriginalsAndGo({ format: 'blandet', families: [kbId], count: Math.min(5, o.exam), reason: `Spørsmål om «${name}» fra eksamenene dine.` });
  if (choice !== 'mal' && o.coll) return startOriginalsAndGo({ format: 'samling', families: [kbId], count: Math.min(4, o.coll), reason: `Oppgaver om «${name}» fra oppgavesamlingen.` });
  return startSessionAndGo({ type: 'familie', families: [kbId], level: 1, count: 3, reason: `Tre øvingsoppgaver om «${name}», fra enkel til eksamensnivå.` });
}

const STEP_LABELS = ['Lær', 'Quiz', 'Oppgaver', 'Sikker'];

export function PathHome() {
  const course = useStore((s) => s.course());
  useStore((s) => s.get('game', 'spill'));
  const chs = useStore(() => chapters());
  const nxt = useStore(() => nextStep());
  const prof = useStore(() => profile());
  const atts = useStore((s) => s.attempts());
  const exams = useStore((s) => s.exams());
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!course) return null;
  const running = exams.find((e: ExamSim) => e.status === 'pågår');
  const unfinished = [...atts].reverse().find((a: Attempt) => a.status === 'pågår' && a.mode !== 'eksamen' && Date.now() - Date.parse(a.updatedAt) < 14 * 864e5);
  const unfinishedTask = unfinished ? store.get<GeneratedTask>('gen', unfinished.taskRef.id) : undefined;
  const nf = nxt ? getFamily(nxt.kbId) : undefined;
  const hello = prof.nickname ? `Hei, ${prof.nickname}!` : 'Hei!';
  const daysLeft = course.examDate ? Math.ceil((Date.parse(course.examDate) - Date.now()) / 864e5) : undefined;
  const order = chs.flatMap((c) => c.topics.map((t) => t.kbId));
  const rankOfNext = nxt ? order.indexOf(nxt.kbId) : -1;
  const startNext = () => {
    if (!nxt) return;
    if (nxt.action === 'laer') store.navigate({ name: 'laer', kbId: nxt.kbId });
    else void startTopicPractice(nxt.kbId, setBusy);
  };
  return (
    <div className="page plan-page">
      <section className="plan-hero">
        <MascotSays
          kind={prof.mascot}
          name={prof.mascotName}
          mood="glad"
          size={76}
          text={
            nf
              ? `${hello} ${daysLeft !== undefined && daysLeft >= 0 ? `${daysLeft} dager til eksamen. ` : ''}Neste i planen: {{1:${nxt!.action === 'laer' ? 'Lær' : 'Oppgaver'}}} i «${nf.shortName}»${rankOfNext >= 0 && rankOfNext < 3 ? ', et av temaene som kommer oftest på eksamen' : ''}.`
              : chs.length
                ? `${hello} Du har vært gjennom hele planen. Ta en prøveeksamen og se hvor du står.`
                : `${hello} Last opp tidligere eksamener i arkivet, så lager jeg en eksamensplan med temaene som teller mest.`
          }
        >
          <div className="row" style={{ marginTop: 8 }}>
            {nf ? (
              busy ? (
                <Spinner label={busy} />
              ) : (
                <button className="btn primary" onClick={startNext}>
                  {nxt!.action === 'laer' ? 'Start leksjonen' : 'Start oppgavene'} <Icon name="chevron" size={16} />
                </button>
              )
            ) : chs.length ? (
              <button className="btn primary" onClick={() => store.navigate({ name: 'eksamen' })}>
                Prøveeksamen
              </button>
            ) : (
              <button className="btn primary" onClick={() => store.navigate({ name: 'arkiv' })}>
                Gå til arkivet
              </button>
            )}
          </div>
        </MascotSays>
        <StatBar />
      </section>
      {running ? (
        <button className="card raised row between banner-exam" onClick={() => store.navigate({ name: 'eksamen', examId: running.id })}>
          <span className="stack sm" style={{ gap: 2 }}>
            <span className="eyebrow">Prøveeksamen pågår</span>
            <strong>Startet {relTime(running.startedAt ?? running.createdAt)}</strong>
          </span>
          <span className="btn small primary">
            Fortsett <Icon name="chevron" size={14} />
          </span>
        </button>
      ) : null}
      {unfinished && unfinishedTask ? (
        <button className="card raised row between" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => store.navigate({ name: 'tren', attemptId: unfinished.id, sessionId: unfinished.sessionId })}>
          <span className="stack sm" style={{ gap: 2 }}>
            <span className="eyebrow">Uferdig oppgave · {relTime(unfinished.updatedAt)}</span>
            <strong>{unfinishedTask.title}</strong>
          </span>
          <span className="btn small">
            Fortsett <Icon name="chevron" size={14} />
          </span>
        </button>
      ) : null}
      {chs.length ? (
        <div className="plan-title">
          <h2>Eksamensplanen din</h2>
          <p className="small muted">Sortert etter hvor ofte temaene kommer på eksamenene dine. Det som teller mest, står først.</p>
        </div>
      ) : null}
      {chs.map((ch, ci) => (
        <TierSection key={ch.id} ch={ch} index={ci} offset={chs.slice(0, ci).reduce((n, c) => n + c.topics.length, 0)} nextKb={nxt?.kbId} onOpen={setOpen} setBusy={setBusy} busy={!!busy} />
      ))}
      {!chs.length ? <p className="muted small">Planen lages fra de analyserte eksamenssettene dine. Ingen er ferdig analysert ennå.</p> : null}
      {open ? <TopicSheet kbId={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function TierSection({ ch, index, offset, nextKb, onOpen, setBusy, busy }: { ch: Chapter; index: number; offset: number; nextKb?: string; onOpen: (kb: string) => void; setBusy: (s: string | null) => void; busy: boolean }) {
  const st = chapterState(ch);
  const pool = useMemo(() => competitionPoolSize(ch.topics.map((t) => t.kbId)), [ch]);
  const ready = st.unlocked && pool >= COMPETITION_N;
  return (
    <section className={`plan-tier tier-${(index % 4) + 1}`}>
      <header className="tier-head">
        <div className="stack sm" style={{ gap: 2, minWidth: 0 }}>
          <h3>{ch.title}</h3>
          <span className="small muted">{ch.subtitle}</span>
        </div>
        <span className="tier-count" title="Temaer du har gått gjennom Lær i">
          {st.lessons} av {st.total} lært
        </span>
      </header>
      <ol className="plan-list">
        {ch.topics.map((t, j) => (
          <TopicRow key={t.kbId} t={t} rank={offset + j + 1} isNext={t.kbId === nextKb} onOpen={onOpen} setBusy={setBusy} busy={busy} />
        ))}
      </ol>
      <div className={`challenge-row${ready ? '' : ' locked'}`}>
        <Trophy size={26} on={ready} />
        <div className="stack sm" style={{ gap: 0, flex: 1, minWidth: 0 }}>
          <strong className="small">Kapittelutfordring</strong>
          <span className="xs muted">
            {ready
              ? `${COMPETITION_N} spørsmål på tid mot din egen rekord${st.best ? ` (rekord: ${st.best.score} poeng)` : ''}.`
              : !st.unlocked
                ? `Låses opp når du har gjort Lær i ${Math.min(2, st.total)} av temaene over.`
                : `Trenger minst ${COMPETITION_N} spørsmål; har ${pool} nå. Gjør Lær i flere av temaene for å få flere.`}
          </span>
        </div>
        <button className="btn small" disabled={!ready} onClick={() => store.navigate({ name: 'konkurranse', chapter: ch.id })}>
          Start
        </button>
      </div>
    </section>
  );
}

function TopicRow({ t, rank, isNext, onOpen, setBusy, busy }: { t: TopicStat; rank: number; isNext: boolean; onOpen: (kb: string) => void; setBusy: (s: string | null) => void; busy: boolean }) {
  const p = topicProgress(t.kbId);
  const done = [p.lessonDone, (p.quizMax ?? 0) > 0 && (p.quizBest ?? 0) / (p.quizMax ?? 1) >= 0.75, p.solved >= 2, p.level >= 4];
  return (
    <li className={`topic-row${isNext ? ' next' : ''}`}>
      <span className="rank" aria-hidden="true">
        {rank}
      </span>
      <div className="topic-main">
        <div className="row" style={{ gap: 8 }}>
          <button className="topic-name" onClick={() => onOpen(t.kbId)}>
            {t.fam.shortName}
          </button>
          {isNext ? <Pill tone="accent">Neste</Pill> : null}
          {p.level >= 4 ? <Pill tone="teal">Sikker</Pill> : null}
        </div>
        <div className="freq" title={relevanceText(t)}>
          <span className="freq-bar" aria-hidden="true">
            <i style={{ width: `${Math.round(relevanceBar(t) * 100)}%` }} />
          </span>
          <span className="xs muted">{relevanceText(t)}</span>
        </div>
        <div className="steps4" aria-label={`Fremgang: ${STEP_LABELS.filter((_, i) => done[i]).join(', ') || 'ikke startet'}`}>
          {STEP_LABELS.map((l, i) => (
            <span key={l} className={`s4${done[i] ? ' on' : ''}`}>
              <i />
              <span className="xs">{l === 'Oppgaver' ? `Oppgaver ${Math.min(p.solved, 2)}/2` : l}</span>
            </span>
          ))}
        </div>
        {t.prereqFor ? <span className="xs muted">Grunnlag for «{t.prereqFor}», derfor tidlig i planen.</span> : null}
      </div>
      <div className="topic-actions">
        <button className={`btn small${!p.lessonDone ? ' primary' : ''}`} onClick={() => store.navigate({ name: 'laer', kbId: t.kbId })}>
          <Icon name="book" size={15} /> Lær
        </button>
        <button className={`btn small${p.lessonDone && p.level < 3 ? ' primary' : ''}`} disabled={busy} onClick={() => void startTopicPractice(t.kbId, setBusy)}>
          <Icon name="pencil" size={15} /> Oppgaver
        </button>
      </div>
    </li>
  );
}

function TopicSheet({ kbId, onClose }: { kbId: string; onClose: () => void }) {
  const t = chapters()
    .flatMap((c) => c.topics)
    .find((x) => x.kbId === kbId);
  const p = topicProgress(kbId);
  const [busy, setBusy] = useState<string | null>(null);
  if (!t) return null;
  const o = practiceOptions(kbId);
  const qs = topicQuestions(kbId).length;
  const steps: [string, boolean, string][] = [
    ['Lær', p.lessonDone, p.lessonDone ? 'Fullført' : 'Formlene, kalkulatoren og hvordan spørsmålet ser ut på eksamen'],
    ['Quiz', (p.quizMax ?? 0) > 0 && (p.quizBest ?? 0) / (p.quizMax ?? 1) >= 0.75, p.quizMax ? `Beste: ${p.quizBest ?? 0} av ${p.quizMax} (3 av 4 er bestått)` : 'Valgfri, på slutten av Lær'],
    ['Oppgaver', p.solved >= 2, `Løst helt selv: ${p.solved} av 2${p.attempted ? ` · ${p.attempted} levert` : ''}`],
    ['Sikker', p.level >= 4, `${p.indepSkills} av ${p.coreSkills} kjerneferdigheter vist uten hjelp`],
  ];
  return (
    <Sheet title={t.fam.name} onClose={onClose} narrow>
      <div className="stack">
        <div className="row">
          <Pill tone="accent">{relevanceText(t)}</Pill>
          {formatText(t) ? <Pill tone="outline">{formatText(t)}</Pill> : null}
        </div>
        <ol className="topic-steps">
          {steps.map(([name, done, sub]) => (
            <li key={name} className={done ? 'done' : ''}>
              <span className="tick">{done ? <Icon name="check" size={14} /> : null}</span>
              <span className="stack sm" style={{ gap: 0 }}>
                <strong className="small">{name}</strong>
                <span className="xs muted">{sub}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="stack sm">
          <button className="btn primary" onClick={() => store.navigate({ name: 'laer', kbId })}>
            <Icon name="book" size={16} /> Lær {cachedLesson(kbId) ? '(klar)' : ''}
          </button>
          {busy ? <Spinner label={busy} /> : null}
          {o.ai ? (
            <button className="btn" disabled={!!busy} onClick={() => void startTopicPractice(kbId, setBusy, 'ai')}>
              <Icon name="sparkle" size={16} /> Nye oppgaver i eksamensstil
            </button>
          ) : null}
          {o.exam || o.coll ? (
            <button className="btn" disabled={!!busy} onClick={() => void startTopicPractice(kbId, setBusy, 'ekte')}>
              <Icon name="check" size={16} /> {o.exam ? `Ekte eksamensspørsmål (${o.exam})` : `Fra oppgavesamlingen (${o.coll})`}
            </button>
          ) : null}
          {o.templates ? (
            <button className="btn" disabled={!!busy} onClick={() => void startTopicPractice(kbId, setBusy, 'mal')}>
              <Icon name="layers" size={16} /> Øvingsoppgaver med hjelp
            </button>
          ) : null}
          {cachedLesson(kbId)?.quiz.length ? (
            <button className="btn ghost" onClick={() => store.navigate({ name: 'laer', kbId, part: 'quiz' })}>
              <Icon name="target" size={16} /> Ta quizen igjen
            </button>
          ) : null}
          {t.fam.formulas[0] ? (
            <button className="btn ghost" onClick={() => store.navigate({ name: 'formel', formulaId: t.fam.formulas[0].id })}>
              <Icon name="book" size={16} /> Formlene i temaet
            </button>
          ) : null}
        </div>
        {!aiAvailable() && qs && !o.ai ? <p className="xs muted">Uten AI kan appen rette flervalg og regneoppgaver med sluttsvar. Tekstsvar vurderer du selv mot sensorveiledningen, og de teller ikke som «løst helt selv».</p> : null}
      </div>
    </Sheet>
  );
}
