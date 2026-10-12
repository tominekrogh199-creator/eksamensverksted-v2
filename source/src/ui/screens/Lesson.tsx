// Lær: én kort leksjon per tema, ett kort om gangen. Tutorfiguren kommenterer,
// kontrollspørsmål gir poeng, og en valgfri quiz avslutter.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LessonCard, LessonRec, QuizItem } from '../../domain/types';
import { store, useStore } from '../../state/store';
import { getFamily } from '../../families';
import { getLesson, kbLesson, prefetchLesson, topicQuestions } from '../../learning/lesson';
import { awardXp, patchTopic, playSound, profile, saveProfile, topicState } from '../../learning/game';
import { chapters, topicStats, relevanceText, formatText } from '../../learning/path';
import { aiAvailable } from '../../ai/client';
import { Mascot, MascotSays, type Mood } from '../components/Mascot';
import { LessonText, ColorFormula } from '../components/LessonText';
import { CalcPad } from '../components/CalcPad';
import { Confetti, StatBar } from '../components/Game';
import { Icon } from '../components/Icon';
import { Tex } from '../components/Math';
import { Pill, Spinner } from '../components/common';
import { Explorer } from './Formula';
import { keysText } from '../../learning/calculator';
import { startTopicPractice } from './Path';

const OK_LINES = ['Riktig!', 'Helt rett!', 'Yes, det sitter.', 'Bra, du tenkte som sensor.', 'Sånn skal det gjøres!', 'Du har taket på dette.'];
const OOPS_LINES = ['Nesten! Se forklaringen, så tar vi neste.', 'Ikke helt, men det er her hjernen lærer mest.', 'Feil er bare data. Les hvorfor:', 'Godt forsøk. Neste gang sitter den.'];
const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];

const TYPE_HINT: Partial<Record<LessonCard['type'], string>> = {
  formula: 'Fargene viser hvilken del av formelen som er hva.',
  calculator: 'Prøv å taste selv – akkurat sånn gjør du det på eksamen.',
  worked: 'Ett steg om gangen. Trykk for å se neste.',
  patterns: 'Trykk på kortene for å se hva du skal gjøre.',
  trap: 'Denne fellen koster poeng på eksamen. Pass på!',
  mnemonic: 'Si den høyt én gang, så sitter den bedre.',
  check: 'Velg det du tror er riktig.',
};

export function Lesson() {
  const route = useStore((s) => s.ui.route);
  const kbId = route.name === 'laer' ? route.kbId : '';
  const startQuiz = route.name === 'laer' && route.part === 'quiz';
  const prof = useStore(() => profile());
  const fam = getFamily(kbId);
  const [lesson, setLesson] = useState<LessonRec | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>('Henter leksjonen …');
  const [slow, setSlow] = useState(false);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<'kort' | 'pause' | 'ferdig' | 'quiz' | 'oppsummering'>(startQuiz ? 'quiz' : 'kort');
  const [xp, setXp] = useState(0);
  const [mood, setMood] = useState<Mood>('glad');
  const [say, setSay] = useState<string | null>(null);
  const [gate, setGate] = useState(false);
  const seen = useRef(new Set<number>());
  const load = (regenerate = false) => {
    setLoading(aiAvailable() ? `${prof.mascotName} leser eksamensspørsmålene dine …` : 'Lager leksjonen …');
    setSlow(false);
    const t = window.setTimeout(() => setSlow(true), 15000);
    getLesson(kbId, { regenerate, onProgress: (n) => setLoading(n) })
      .then((r) => {
        setLesson(r.lesson);
        setNote(r.note ?? null);
        setIdx(0);
        seen.current.clear();
      })
      .catch((e) => {
        setLesson(kbLesson(kbId));
        setNote(`Leksjonen er laget fra kunnskapsbasen (${e instanceof Error ? e.message : 'ukjent feil'}).`);
      })
      .finally(() => {
        window.clearTimeout(t);
        setLoading(null);
      });
  };
  useEffect(() => {
    if (fam) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbId, prof.learnStyle]);
  if (!fam) return <p className="page">Fant ikke temaet.</p>;
  const exit = () => store.navigate({ name: 'start' });
  const gain = (n: number, reason: string) => {
    awardXp(n, reason, { kbId });
    setXp((x) => x + n);
  };
  if (loading || !lesson)
    return (
      <div className="focus-shell">
        <div className="focus-top">
          <button className="icon-btn" onClick={exit} aria-label="Lukk">
            <Icon name="x" />
          </button>
          <strong className="focus-title">{fam.shortName}</strong>
        </div>
        <div className="focus-center stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Mascot kind={prof.mascot} mood="tenker" size={120} />
          <Spinner label={loading ?? 'Henter …'} />
          <p className="small muted" style={{ maxWidth: 420 }}>
            {aiAvailable() ? 'Første gang lages leksjonen ut fra eksamenene dine. Det tar vanligvis under ett minutt, og neste gang er den klar med en gang.' : 'AI er ikke tilgjengelig her, så leksjonen bygges fra kunnskapsbasen.'}
          </p>
          {slow ? (
            <button
              className="btn"
              onClick={() => {
                setLesson(kbLesson(kbId));
                setNote('Du startet med den enkle leksjonen fra kunnskapsbasen. Den AI-lagde blir klar i bakgrunnen til neste gang.');
                setLoading(null);
              }}
            >
              Start med en enklere leksjon nå
            </button>
          ) : null}
        </div>
      </div>
    );
  const cards = lesson.cards;
  const card = cards[Math.min(idx, cards.length - 1)];
  const next = () => {
    if (!seen.current.has(idx)) {
      seen.current.add(idx);
      gain(2, 'Kort');
    }
    setSay(null);
    setMood('glad');
    setGate(false);
    if (idx + 1 >= cards.length) {
      const first = !topicState(kbId).lessonDoneAt;
      gain(first ? 20 : 10, 'Leksjon ferdig');
      patchTopic(kbId, { lessonDoneAt: new Date().toISOString(), lessonCards: cards.length });
      playSound('feiring');
      setPhase('ferdig');
      // Gjør neste tema klart i bakgrunnen.
      const order = chapters().flatMap((c) => c.topics.map((t) => t.kbId));
      const nxt = order[order.indexOf(kbId) + 1];
      if (nxt) prefetchLesson(nxt);
      return;
    }
    if (prof.focusMode && (idx + 1) % 5 === 0 && cards.length - idx > 3) setPhase('pause');
    setIdx(idx + 1);
  };
  const back = () => idx > 0 && setIdx(idx - 1);
  const progress = phase === 'kort' || phase === 'pause' ? (idx + (phase === 'pause' ? 1 : 0)) / cards.length : 1;
  const mascotText = say ?? card.mascot ?? TYPE_HINT[card.type] ?? '';
  return (
    <div className={`focus-shell${prof.focusMode ? ' focus-mode' : ''}`}>
      <div className="focus-top">
        <button className="icon-btn" onClick={exit} aria-label="Avslutt leksjonen">
          <Icon name="x" />
        </button>
        <div className="lesson-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="xp-chip" title="XP i denne leksjonen">
          +{xp} XP
        </span>
        <StyleToggle />
      </div>
      {phase === 'kort' ? (
        <div className="focus-center">
          {note && idx === 0 ? <div className="notice amber small">{note}</div> : null}
          <div key={idx} className={`lesson-card t-${card.type} slide-in`}>
            <CardView card={card} lesson={lesson} kbId={kbId} onCheck={(ok, first) => {
              setMood(ok ? 'jubler' : 'oi');
              setSay(ok ? pick(OK_LINES) : pick(OOPS_LINES));
              playSound(ok ? 'riktig' : 'feil');
              if (first) gain(ok ? 5 : 1, ok ? 'Riktig' : 'Forsøk');
            }} onGate={setGate} onCalcSolved={() => {
              setMood('jubler');
              setSay('Riktig tastet! Akkurat sånn gjør du det på eksamen.');
              playSound('riktig');
              gain(5, 'Kalkulator');
            }} />
          </div>
          <div className="focus-bottom">
            {mascotText ? <MascotSays kind={prof.mascot} name={prof.mascotName} mood={mood} text={mascotText} size={prof.focusMode ? 64 : 56} /> : null}
            <div className="row between">
              <button className="btn ghost" onClick={back} disabled={idx === 0}>
                <Icon name="prev" size={16} /> Tilbake
              </button>
              <span className="xs muted">
                Kort {idx + 1} av {cards.length}
              </span>
              <button className="btn primary big" onClick={next} disabled={gate}>
                {idx + 1 >= cards.length ? 'Fullfør' : 'Fortsett'} <Icon name="chevron" size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : phase === 'pause' ? (
        <div className="focus-center stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Mascot kind={prof.mascot} mood="jubler" size={130} />
          <h2>Pustepause!</h2>
          <p>
            {idx} av {cards.length} kort er unnagjort. Strekk deg, drikk litt vann, eller fortsett med en gang.
          </p>
          <button className="btn primary big" onClick={() => setPhase('kort')}>
            Fortsett <Icon name="chevron" size={16} />
          </button>
        </div>
      ) : phase === 'ferdig' ? (
        <div className="focus-center stack celebrate" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Confetti />
          <Mascot kind={prof.mascot} mood="jubler" size={140} />
          <h2>Leksjonen er ferdig!</h2>
          <p className="big-xp">+{xp} XP</p>
          <p className="muted">Vil du ta en kort quiz med {lesson.quiz.length} spørsmål i eksamensstil? Den er valgfri, men gir ekstra poeng og viser om det sitter.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            {lesson.quiz.length ? (
              <button className="btn primary big" onClick={() => setPhase('quiz')}>
                Ta quizen
              </button>
            ) : null}
            <button className="btn big" onClick={() => setPhase('oppsummering')}>
              {lesson.quiz.length ? 'Hopp over' : 'Videre'}
            </button>
          </div>
        </div>
      ) : phase === 'quiz' ? (
        <Quiz items={lesson.quiz} kbId={kbId} onXp={(n) => gain(n, 'Quiz')} onDone={() => setPhase('oppsummering')} />
      ) : (
        <Summary
          kbId={kbId}
          xp={xp}
          lesson={lesson}
          onRedo={() => {
            setPhase('kort');
            load(true);
          }}
        />
      )}
    </div>
  );
}

function StyleToggle() {
  const p = useStore(() => profile());
  return (
    <div className="seg" role="group" aria-label="Læringsmåte">
      {(['tekst', 'visuell'] as const).map((s) => (
        <button key={s} aria-pressed={p.learnStyle === s || (s === 'visuell' && p.learnStyle === 'blanding')} onClick={() => saveProfile({ learnStyle: s })}>
          {s === 'tekst' ? 'Tekst' : 'Visuelt'}
        </button>
      ))}
    </div>
  );
}

function CardView({ card, lesson, kbId, onCheck, onGate, onCalcSolved }: { card: LessonCard; lesson: LessonRec; kbId: string; onCheck: (ok: boolean, first: boolean) => void; onGate: (g: boolean) => void; onCalcSolved: () => void }) {
  const fam = getFamily(kbId)!;
  const visual = lesson.style !== 'tekst';
  switch (card.type) {
    case 'intro': {
      const stat = topicStats().find((t) => t.kbId === kbId);
      return (
        <div className="stack">
          <span className="eyebrow">Nytt tema</span>
          <h2 className="lesson-h">{card.title}</h2>
          {stat ? (
            <div className="row">
              <Pill tone="accent">{relevanceText(stat)}</Pill>
              {formatText(stat) ? <Pill tone="outline">{formatText(stat)}</Pill> : null}
            </div>
          ) : null}
          <p className="lesson-body">
            <LessonText text={card.body} />
          </p>
          {lesson.plan ? (
            <div className="plan-box stack sm">
              <strong className="small">Dette spør eksamen om</strong>
              <p className="small">{lesson.plan.examUse}</p>
              {lesson.plan.mustKnow.length ? (
                <ul className="small check-list">
                  {lesson.plan.mustKnow.slice(0, 5).map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              ) : null}
              {lesson.plan.skip.length ? <p className="xs muted">Dette hopper vi over (kommer ikke på eksamen): {lesson.plan.skip.slice(0, 4).join(' · ')}</p> : null}
            </div>
          ) : null}
        </div>
      );
    }
    case 'concept':
      return (
        <div className="stack">
          {card.title ? <h2 className="lesson-h">{card.title}</h2> : null}
          {card.body ? (
            <p className="lesson-body">
              <LessonText text={card.body} />
            </p>
          ) : null}
          {card.visual && (visual || card.visual.kind !== 'utforsk') ? <VisualView v={card.visual} kbId={kbId} /> : null}
        </div>
      );
    case 'formula': {
      const f = card.formulaId ? fam.formulas.find((x) => x.id === card.formulaId) : undefined;
      return (
        <div className="stack">
          <span className="eyebrow">Formel</span>
          <h2 className="lesson-h">{card.title}</h2>
          <ColorFormula tex={card.tex} parts={card.parts} />
          {card.whenToUse ? (
            <div className="when-box">
              <strong className="small">Når bruker du den?</strong>
              <p className="small">
                <LessonText text={card.whenToUse} />
              </p>
            </div>
          ) : null}
          {f && (f.calc || f.figure) ? (
            <details className="disclosure play-box" open={lesson.style === 'visuell'}>
              <summary>
                <Icon name="hand" size={16} /> Lek med formelen
              </summary>
              <Explorer figure={f.figure} calc={f.calc} familyId={fam.id} />
            </details>
          ) : null}
        </div>
      );
    }
    case 'worked':
      return <Worked card={card} onGate={onGate} />;
    case 'calculator':
      return (
        <div className="stack">
          <span className="eyebrow">Kalkulatoren på eksamen</span>
          <h2 className="lesson-h">{card.title}</h2>
          <p className="lesson-body">
            <LessonText text={card.task} />
          </p>
          {card.keys.length ? (
            <>
              <CalcPad expression={card.expression} onSolved={onCalcSolved} />
              <p className="small">
                Svar: <mark className="lx lx-3">{card.result.replace('.', ',')}</mark>. {card.tip}
              </p>
            </>
          ) : (
            <div className="card flat stack sm">
              <span className="small">Tast inn:</span>
              <span className="mono big-keys">{card.expression.replace(/\*/g, '×').replace(/\//g, ' ÷ ')} =</span>
              <span className="small">
                Svar: <mark className="lx lx-3">{Number(card.result).toLocaleString('nb-NO', { maximumFractionDigits: 4 })}</mark>. {card.tip}
              </span>
            </div>
          )}
          {card.keys.length ? <p className="xs muted">Hele oppskriften: {keysText(card.keys as never)}</p> : null}
        </div>
      );
    case 'patterns':
      return <Patterns card={card} />;
    case 'trap':
      return (
        <div className="stack trap-card">
          <span className="eyebrow">
            <Icon name="alert" size={14} /> Felle
          </span>
          <h2 className="lesson-h">{card.title}</h2>
          <p className="lesson-body">
            <LessonText text={card.body} />
          </p>
        </div>
      );
    case 'mnemonic':
      return (
        <div className="stack mnemonic-card">
          <span className="eyebrow">
            <Icon name="bulb" size={14} /> Huskeregel
          </span>
          <h2 className="lesson-h">{card.title}</h2>
          <p className="lesson-body big-mnemonic">
            <LessonText text={card.body} />
          </p>
        </div>
      );
    case 'check':
      return <Check q={card} onAnswer={onCheck} onGate={onGate} />;
  }
}

function VisualView({ v, kbId }: { v: NonNullable<Extract<LessonCard, { type: 'concept' }>['visual']>; kbId: string }) {
  if (v.kind === 'flyt')
    return (
      <div className="flow">
        {v.items.map((it, i) => (
          <div key={i} className="flow-step">
            <span className={`flow-dot c${(i % 4) + 1}`}>{i + 1}</span>
            <span className="small">
              <LessonText text={it} />
            </span>
          </div>
        ))}
      </div>
    );
  if (v.kind === 'sammenlign')
    return (
      <div className="compare">
        {[v.left, v.right].map((side, i) => (
          <div key={i} className={`compare-col c${i + 1}`}>
            <strong>{side.title}</strong>
            <ul className="small">
              {side.items.map((x, j) => (
                <li key={j}>
                  <LessonText text={x} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  const f = getFamily(kbId)?.formulas.find((x) => x.id === v.formulaId);
  return f ? (
    <div className="play-box">
      <Explorer figure={f.figure} calc={f.calc} familyId={kbId} />
    </div>
  ) : null;
}

function Worked({ card, onGate }: { card: Extract<LessonCard, { type: 'worked' }>; onGate: (g: boolean) => void }) {
  const [shown, setShown] = useState(1);
  useEffect(() => onGate(shown < card.steps.length), [shown, card.steps.length, onGate]);
  return (
    <div className="stack">
      <span className="eyebrow">Eksempel</span>
      <h2 className="lesson-h">{card.title}</h2>
      <div className="problem-box lesson-body">
        <LessonText text={card.problem} />
      </div>
      <ol className="worked-steps">
        {card.steps.slice(0, shown).map((s, i) => (
          <li key={i} className="slide-in">
            <span className={`step-dot c${(i % 4) + 1}`}>{i + 1}</span>
            <div className="stack sm">
              <span>
                <LessonText text={s.text} />
              </span>
              {s.tex ? <Tex tex={s.tex} display /> : null}
            </div>
          </li>
        ))}
      </ol>
      {shown < card.steps.length ? (
        <button className="btn" onClick={() => setShown(shown + 1)}>
          <Icon name="next" size={16} /> Vis neste steg ({shown} av {card.steps.length})
        </button>
      ) : card.answer ? (
        <p className="answer-box">
          <strong>Svar:</strong> <LessonText text={card.answer} />
        </p>
      ) : null}
    </div>
  );
}

function Patterns({ card }: { card: Extract<LessonCard, { type: 'patterns' }> }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  return (
    <div className="stack">
      <span className="eyebrow">Kjenn igjen spørsmålet</span>
      <h2 className="lesson-h">{card.title}</h2>
      <div className="flip-grid">
        {card.items.map((it, i) => (
          <button key={i} className={`flip${open.has(i) ? ' open' : ''}`} onClick={() => setOpen(new Set(open).add(i))} aria-expanded={open.has(i)}>
            <span className="flip-front small">
              <span className="xs muted">Står det …</span>
              <LessonText text={it.looksLike} />
            </span>
            {open.has(i) ? (
              <span className="flip-back small">
                <span className="xs">… så skal du</span>
                <LessonText text={it.means} />
              </span>
            ) : (
              <span className="xs faint">Trykk for å se hva du gjør</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function Check({ q, onAnswer, onGate }: { q: { question: string; options: string[]; correct: number; why: string }; onAnswer: (ok: boolean, first: boolean) => void; onGate: (g: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => onGate(picked === null), [picked, onGate]);
  const L = 'ABCD';
  return (
    <div className="stack">
      <span className="eyebrow">Sjekk deg selv</span>
      <p className="lesson-q">
        <LessonText text={q.question} />
      </p>
      <div className="options">
        {q.options.map((o, i) => {
          const state = picked === null ? '' : i === q.correct ? ' right' : i === picked ? ' wrong' : ' dim';
          return (
            <button
              key={i}
              className={`option${state}`}
              disabled={picked !== null}
              onClick={() => {
                setPicked(i);
                setTries(tries + 1);
                onAnswer(i === q.correct, tries === 0);
              }}
            >
              <span className="opt-letter">{L[i]}</span>
              <LessonText text={o} />
            </button>
          );
        })}
      </div>
      {picked !== null ? (
        <div className={`why-box${picked === q.correct ? ' ok' : ' bad'}`}>
          <strong>{picked === q.correct ? 'Riktig' : `Riktig svar er ${L[q.correct]}`}</strong>
          {q.why ? (
            <p className="small">
              <LessonText text={q.why} />
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Quiz({ items, kbId, onXp, onDone }: { items: QuizItem[]; kbId: string; onXp: (n: number) => void; onDone: () => void }) {
  const prof = profile();
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [mood, setMood] = useState<Mood>('glad');
  const q = items[i];
  const L = 'ABCD';
  if (!q) return null;
  const finish = (final: number) => {
    const st = topicState(kbId);
    const prevBest = st.quizMax === items.length ? st.quizBest ?? 0 : 0;
    patchTopic(kbId, { quizBest: Math.max(final, prevBest), quizMax: items.length });
    onDone();
  };
  return (
    <div className="focus-center">
      <div className="stack">
        <div className="row between">
          <span className="eyebrow">
            Quiz · spørsmål {i + 1} av {items.length}
          </span>
          {q.source === 'eksamen' ? <Pill tone="teal">Fra eksamenene dine</Pill> : null}
        </div>
        <p className="lesson-q">
          <LessonText text={q.question} />
        </p>
        <div className="options">
          {q.options.map((o, j) => {
            const state = picked === null ? '' : j === q.correct ? ' right' : j === picked ? ' wrong' : ' dim';
            return (
              <button
                key={j}
                className={`option${state}`}
                disabled={picked !== null}
                onClick={() => {
                  setPicked(j);
                  const ok = j === q.correct;
                  if (ok) {
                    setScore(score + 1);
                    onXp(10);
                  }
                  setMood(ok ? 'jubler' : 'oi');
                  playSound(ok ? 'riktig' : 'feil');
                }}
              >
                <span className="opt-letter">{L[j]}</span>
                <LessonText text={o} />
              </button>
            );
          })}
        </div>
        {picked !== null && q.why ? (
          <div className={`why-box${picked === q.correct ? ' ok' : ' bad'}`}>
            <p className="small">
              <LessonText text={q.why} />
            </p>
          </div>
        ) : null}
      </div>
      <div className="focus-bottom">
        <MascotSays kind={prof.mascot} name={prof.mascotName} mood={mood} text={picked === null ? 'Ta den tiden du trenger.' : picked === q.correct ? pick(OK_LINES) : pick(OOPS_LINES)} size={56} speak={false} />
        <div className="row between">
          <span className="small muted">
            {score} riktige
          </span>
          <button
            className="btn primary big"
            disabled={picked === null}
            onClick={() => {
              if (i + 1 >= items.length) finish(score);
              else {
                setI(i + 1);
                setPicked(null);
                setMood('glad');
              }
            }}
          >
            {i + 1 >= items.length ? 'Ferdig' : 'Neste'} <Icon name="chevron" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Summary({ kbId, xp, lesson, onRedo }: { kbId: string; xp: number; lesson: LessonRec; onRedo: () => void }) {
  const prof = profile();
  const st = topicState(kbId);
  const order = useMemo(() => chapters().flatMap((c) => c.topics.map((t) => t.kbId)), []);
  const nxt = order[order.indexOf(kbId) + 1];
  const nf = nxt ? getFamily(nxt) : undefined;
  const qs = topicQuestions(kbId).length;
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="focus-center stack" style={{ alignItems: 'center', textAlign: 'center' }}>
      <Mascot kind={prof.mascot} mood="jubler" size={110} />
      <h2>Bra jobbet{prof.nickname ? `, ${prof.nickname}` : ''}!</h2>
      <p className="big-xp">+{xp} XP</p>
      {st.quizMax ? (
        <p>
          Quiz: <strong>{st.quizBest ?? 0} av {st.quizMax}</strong> {(st.quizBest ?? 0) / st.quizMax >= 0.75 ? '– bestått!' : '– prøv igjen senere for å få stjerne.'}
        </p>
      ) : null}
      <StatBar />
      <div className="stack sm" style={{ width: '100%', maxWidth: 420 }}>
        {busy ? (
          <Spinner label={busy} />
        ) : (
          <button className="btn primary big" onClick={() => void startTopicPractice(kbId, setBusy)}>
            <Icon name="pencil" size={16} /> Øv på oppgaver om temaet{qs ? ` (${qs} fra eksamenene)` : ''}
          </button>
        )}
        {nf ? (
          <button className="btn big" onClick={() => store.navigate({ name: 'laer', kbId: nxt })}>
            <Icon name="book" size={16} /> Neste tema: {nf.shortName}
          </button>
        ) : null}
        <button className="btn ghost" onClick={() => store.navigate({ name: 'start' })}>
          Tilbake til stien
        </button>
      </div>
      <details className="disclosure" style={{ maxWidth: 520, textAlign: 'left' }}>
        <summary className="small">Hvordan leksjonen ble laget</summary>
        <ul className="small" style={{ paddingLeft: 18 }}>
          {lesson.checks.map((c, i) => (
            <li key={i}>
              <strong>{c.name}:</strong> {c.detail}
            </li>
          ))}
          {lesson.personalized ? <li>Eksemplene er tilpasset interessene dine fra «Om meg».</li> : null}
        </ul>
        {lesson.basis === 'ai' || aiAvailable() ? (
          <button className="btn small" onClick={onRedo}>
            <Icon name="refresh" size={14} /> Lag leksjonen på nytt med andre eksempler
          </button>
        ) : null}
      </details>
    </div>
  );
}
