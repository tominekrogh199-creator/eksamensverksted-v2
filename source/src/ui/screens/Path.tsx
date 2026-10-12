// Hjem: læringsstien. Temaene i den rekkefølgen som gir mest uttelling på
// eksamen, med relevans, fremgang, Lær/Oppgaver og en konkurranse per kapittel.

import { useState } from 'react';
import type { Attempt, GeneratedTask } from '../../domain/types';
import { store, useStore } from '../../state/store';
import { getFamily } from '../../families';
import { chapters, chapterState, nextStep, topicProgress, relevanceText, formatText, type TopicStat, type Chapter } from '../../learning/path';
import { topicQuestions, cachedLesson } from '../../learning/lesson';
import { profile, game } from '../../learning/game';
import { canMakeExamLike, formatPool } from '../../learning/examlike';
import { originalPool } from '../../learning/originals';
import { startSessionAndGo, startOriginalsAndGo } from '../go';
import { startExamLikeAndGo } from './Train';
import { Mascot, MascotSays } from '../components/Mascot';
import { StatBar, Flame, Trophy, Star } from '../components/Game';
import { Icon } from '../components/Icon';
import { Pill, Sheet, Spinner, relTime } from '../components/common';

/** Oppgaver om ett tema: nye eksamensnære (AI) først, så ekte eksamensspørsmål, så øvingsoppgaver. */
export async function startTopicPractice(kbId: string, setBusy: (s: string | null) => void, kind?: 'ai' | 'ekte' | 'mal') {
  const pool = originalPool();
  const exam = [...pool.flervalg, ...pool.kortsvar, ...pool.langsvar, ...pool.oppgave].filter((s) => s.analysis.familyKbId === kbId);
  const coll = pool.samling.filter((s) => s.analysis.familyKbId === kbId);
  const aiOk = canMakeExamLike() && (['flervalg', 'kortsvar', 'langsvar', 'regne'] as const).some((f) => formatPool(f).some((s) => s.analysis.familyKbId === kbId));
  const choice = kind ?? (aiOk ? 'ai' : exam.length || coll.length ? 'ekte' : 'mal');
  if (choice === 'ai' && aiOk) return startExamLikeAndGo(3, setBusy, undefined, [kbId]);
  if (choice !== 'mal' && exam.length) return startOriginalsAndGo({ format: 'blandet', families: [kbId], count: Math.min(5, exam.length), reason: `Spørsmål om «${getFamily(kbId)?.shortName}» fra eksamenene dine.` });
  if (choice !== 'mal' && coll.length) return startOriginalsAndGo({ format: 'samling', families: [kbId], count: Math.min(4, coll.length), reason: `Oppgaver om «${getFamily(kbId)?.shortName}» fra oppgavesamlingen.` });
  return startSessionAndGo({ type: 'familie', families: [kbId], level: 1, count: 3, reason: `Tre øvingsoppgaver om «${getFamily(kbId)?.shortName}», fra enkel til eksamensnivå.` });
}

const OFFSETS = [0, 56, 84, 56, 0, -56, -84, -56];
const FLAMES: Record<TopicStat['relevance'], number> = { 'svært høy': 3, høy: 2, middels: 1, lav: 0 };

export function PathHome() {
  const course = useStore((s) => s.course());
  useStore((s) => s.get('game', 'spill'));
  const chs = useStore(() => chapters());
  const nxt = useStore(() => nextStep());
  const prof = useStore(() => profile());
  const atts = useStore((s) => s.attempts());
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!course) return null;
  const unfinished = [...atts].reverse().find((a: Attempt) => a.status === 'pågår' && a.mode !== 'eksamen' && Date.now() - Date.parse(a.updatedAt) < 14 * 864e5);
  const unfinishedTask = unfinished ? store.get<GeneratedTask>('gen', unfinished.taskRef.id) : undefined;
  const nf = nxt ? getFamily(nxt.kbId) : undefined;
  const hello = prof.nickname ? `Hei, ${prof.nickname}!` : 'Hei!';
  const g = game();
  const daysLeft = course.examDate ? Math.ceil((Date.parse(course.examDate) - Date.now()) / 864e5) : undefined;
  const pool = originalPool();
  const realQ = pool.flervalg.length + pool.kortsvar.length + pool.langsvar.length + pool.oppgave.length + pool.samling.length;
  return (
    <div className="page path-page">
      <div className="path-head">
        <StatBar />
        <MascotSays
          kind={prof.mascot}
          name={prof.mascotName}
          mood={g.xp ? 'glad' : 'jubler'}
          size={72}
          text={
            nf
              ? `${hello} ${daysLeft !== undefined && daysLeft >= 0 ? `${daysLeft} dager til eksamen. ` : ''}Neste: {{1:${nxt!.action === 'laer' ? 'Lær' : 'Oppgaver'}}} i «${nf.shortName}». Det er et av temaene som teller mest på eksamenene dine.`
              : chs.length
                ? `${hello} Du har vært gjennom alle temaene! Ta en prøveeksamen og se hvor du står.`
                : `${hello} Last opp tidligere eksamener i arkivet, så lager jeg en sti med temaene som teller mest.`
          }
        >
          <div className="row" style={{ marginTop: 8 }}>
            {nf ? (
              busy ? (
                <Spinner label={busy} />
              ) : (
                <button className="btn primary big" onClick={() => (nxt!.action === 'laer' ? store.navigate({ name: 'laer', kbId: nxt!.kbId }) : void startTopicPractice(nxt!.kbId, setBusy))}>
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
            {!prof.interests.length ? (
              <button className="btn ghost small" onClick={() => store.navigate({ name: 'ommeg' })}>
                Fortell meg om deg
              </button>
            ) : null}
          </div>
        </MascotSays>
      </div>
      {unfinished && unfinishedTask ? (
        <button className="card raised row between" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => store.navigate({ name: 'tren', attemptId: unfinished.id, sessionId: unfinished.sessionId })}>
          <div className="stack sm">
            <span className="eyebrow">Uferdig oppgave · {relTime(unfinished.updatedAt)}</span>
            <strong>{unfinishedTask.title}</strong>
          </div>
          <span className="btn small">
            Fortsett <Icon name="chevron" size={14} />
          </span>
        </button>
      ) : null}
      {realQ ? (
        <div className="quick-row" role="group" aria-label="Øv som på eksamen">
          <button className="quick" onClick={() => startOriginalsAndGo(pool.flervalg.length ? { format: 'blandet', count: 6, reason: 'Spørsmål fra dine tidligere eksamener, blandet.' } : pool.oppgave.length ? { format: 'oppgave', count: 3, reason: 'Oppgaver fra eksamenssettene dine.' } : { format: 'samling', count: 5, reason: 'Oppgaver fra oppgavesamlingen.' })}>
            <Icon name="check" size={16} /> Ekte eksamensspørsmål
          </button>
          {canMakeExamLike() ? (
            <button className="quick" disabled={!!busy} onClick={() => void startExamLikeAndGo(pool.flervalg.length || pool.kortsvar.length ? 5 : 3, setBusy)}>
              <Icon name="sparkle" size={16} /> Nye eksamensnære
            </button>
          ) : null}
          <button className="quick" onClick={() => store.navigate({ name: 'eksamen' })}>
            <Icon name="clock" size={16} /> Prøveeksamen
          </button>
          <button className="quick" onClick={() => store.navigate({ name: 'ommeg' })}>
            <Icon name="settings" size={16} /> Om meg
          </button>
        </div>
      ) : null}
      {chs.map((ch, ci) => (
        <ChapterView key={ch.id} ch={ch} index={ci} nextKb={nxt?.kbId} onOpen={setOpen} />
      ))}
      {!chs.length ? <p className="muted small">Stien lages fra de analyserte eksamenssettene dine. Ingen er ferdig analysert ennå.</p> : null}
      {open ? <TopicSheet kbId={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function ChapterView({ ch, index, nextKb, onOpen }: { ch: Chapter; index: number; nextKb?: string; onOpen: (kb: string) => void }) {
  const st = chapterState(ch);
  const prof = profile();
  return (
    <section className={`chapter tone-${(index % 4) + 1}`}>
      <div className="chapter-band">
        <div className="stack sm" style={{ gap: 2 }}>
          <span className="eyebrow">Kapittel {index + 1}</span>
          <h3>{ch.title}</h3>
          <span className="small">{ch.subtitle}</span>
        </div>
        <span className="chapter-count">
          {st.lessons}/{st.total}
        </span>
      </div>
      <div className="path-track">
        {ch.topics.map((t, j) => {
          const p = topicProgress(t.kbId);
          const isNext = t.kbId === nextKb;
          return (
            <div key={t.kbId} className="path-node-wrap" style={{ transform: `translateX(${OFFSETS[(j + index * 2) % OFFSETS.length]}px)` }}>
              {isNext ? (
                <span className="node-mascot" aria-hidden="true">
                  <Mascot kind={prof.mascot} mood="glad" size={46} />
                </span>
              ) : null}
              <button className={`path-node lvl-${p.level}${isNext ? ' next' : ''}`} onClick={() => onOpen(t.kbId)} aria-label={`${t.fam.shortName}: ${relevanceText(t)}. ${['Ikke startet', 'Lær fullført', 'Quiz bestått', 'Løst oppgaver selv', 'Mestret'][p.level]}`}>
                <Ring level={p.level} />
                <span className="node-icon">{p.level >= 4 ? <Star size={30} /> : <Icon name={p.lessonDone ? 'pencil' : 'book'} size={26} />}</span>
              </button>
              <span className="node-label">{t.fam.shortName}</span>
              <span className="node-flames" title={relevanceText(t)}>
                {[0, 1, 2].map((k) => (
                  <Flame key={k} size={13} on={k < FLAMES[t.relevance]} />
                ))}
              </span>
            </div>
          );
        })}
        <div className="path-node-wrap" style={{ transform: `translateX(${OFFSETS[(ch.topics.length + index * 2) % OFFSETS.length]}px)` }}>
          <button
            className={`path-node trophy${st.unlocked ? '' : ' locked'}`}
            onClick={() => (st.unlocked ? store.navigate({ name: 'konkurranse', chapter: ch.id }) : store.toast(`Fullfør Lær i minst ${Math.min(2, st.total)} av temaene i kapitlet for å låse opp konkurransen.`, 'info'))}
            aria-label={st.unlocked ? `Konkurranse for kapittel ${index + 1}${st.best ? `, rekord ${st.best.score} poeng` : ''}` : 'Konkurransen er låst'}
          >
            {st.unlocked ? <Trophy size={34} on /> : <Icon name="lock" size={24} />}
          </button>
          <span className="node-label">Konkurranse{st.best ? ` · rekord ${st.best.score}` : ''}</span>
        </div>
      </div>
    </section>
  );
}

function Ring({ level }: { level: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const seg = c / 4;
  return (
    <svg className="node-ring" viewBox="0 0 92 92" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx="46" cy="46" r={r} fill="none" stroke={i < level ? (level >= 4 ? '#f5b300' : 'var(--teal)') : 'var(--surface-3)'} strokeWidth="6" strokeDasharray={`${seg - 6} ${c - seg + 6}`} strokeDashoffset={-i * seg} transform="rotate(-90 46 46)" strokeLinecap="round" />
      ))}
    </svg>
  );
}

function TopicSheet({ kbId, onClose }: { kbId: string; onClose: () => void }) {
  const t = chapters()
    .flatMap((c) => c.topics)
    .find((x) => x.kbId === kbId);
  const p = topicProgress(kbId);
  const [busy, setBusy] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  if (!t) return null;
  const qs = topicQuestions(kbId);
  const coll = new Set(originalPool().samling.map((s) => s.id));
  const exam = qs.filter((q) => !coll.has(q.id)).length;
  const aiOk = canMakeExamLike();
  const rank = chapters()
    .flatMap((c) => c.topics)
    .findIndex((x) => x.kbId === kbId);
  const steps: [string, boolean, string][] = [
    ['Lær', p.lessonDone, p.lessonDone ? 'Fullført' : 'Formler, kalkulator og hvordan spørsmålet ser ut'],
    ['Quiz', (p.quizMax ?? 0) > 0 && (p.quizBest ?? 0) / (p.quizMax ?? 1) >= 0.75, p.quizMax ? `Beste: ${p.quizBest ?? 0} av ${p.quizMax}` : 'Valgfri, på slutten av Lær'],
    ['Oppgaver', p.solved >= 2, `Løst selv: ${p.solved} (mål: 2)`],
    ['Mestret', p.level >= 4, `${p.indepSkills} av ${p.coreSkills} kjerneferdigheter vist selvstendig`],
  ];
  return (
    <Sheet title={t.fam.name} onClose={onClose} narrow>
      <div className="stack">
        <div className="row">
          <Pill tone="accent">{relevanceText(t)}</Pill>
          {formatText(t) ? <Pill tone="outline">{formatText(t)}</Pill> : null}
          {rank >= 0 && rank < 3 ? <Pill tone="teal">Blant de tre viktigste temaene</Pill> : null}
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
        <div className="big-choices">
          <button className="big-choice learn" onClick={() => store.navigate({ name: 'laer', kbId })}>
            <Icon name="book" size={28} />
            <strong>Lær</strong>
            <span className="xs">{cachedLesson(kbId) ? 'Klar' : 'Formler, regning og eksempler'}</span>
          </button>
          <button className="big-choice tasks" disabled={!!busy} onClick={() => void startTopicPractice(kbId, setBusy)}>
            <Icon name="pencil" size={28} />
            <strong>Oppgaver</strong>
            <span className="xs">{busy ?? (aiOk ? 'Nye i eksamensstil' : exam ? 'Fra eksamenene dine' : 'Øvingsoppgaver')}</span>
          </button>
        </div>
        {busy ? <Spinner label={busy} /> : null}
        <button className="src-link small" onClick={() => setMore(!more)} aria-expanded={more}>
          {more ? 'Færre valg' : 'Flere måter å øve på'}
        </button>
        {more ? (
          <div className="stack sm">
            {exam ? (
              <button className="btn" onClick={() => void startTopicPractice(kbId, setBusy, 'ekte')}>
                <Icon name="check" size={16} /> Ekte eksamensspørsmål om temaet ({exam})
              </button>
            ) : null}
            {aiOk ? (
              <button className="btn" onClick={() => void startTopicPractice(kbId, setBusy, 'ai')}>
                <Icon name="sparkle" size={16} /> Nye eksamensnære oppgaver
              </button>
            ) : null}
            <button className="btn" onClick={() => void startTopicPractice(kbId, setBusy, 'mal')}>
              <Icon name="layers" size={16} /> Øvingsoppgaver med hjelp, fra enkel til eksamensnivå
            </button>
            {cachedLesson(kbId)?.quiz.length ? (
              <button className="btn" onClick={() => store.navigate({ name: 'laer', kbId, part: 'quiz' })}>
                <Icon name="target" size={16} /> Ta quizen igjen
              </button>
            ) : null}
            {t.fam.formulas[0] ? (
              <button className="btn ghost" onClick={() => store.navigate({ name: 'formel', formulaId: t.fam.formulas[0].id })}>
                <Icon name="book" size={16} /> Formlene i temaet
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
