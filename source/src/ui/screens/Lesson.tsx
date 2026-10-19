// Lær: én kort leksjon per tema, ett kort om gangen. Tutorfiguren kommenterer,
// kontrollspørsmål og kalkulatoroppgaver gir poeng, og en valgfri quiz avslutter.
//
// Tilstanden per kort (valgt svar, viste steg, løst kalkulator) holdes her, så
// «Tilbake» viser det du allerede har gjort, og knappen «Fortsett» bare er låst
// når kortet faktisk venter på deg. Poeng gis for innsats som viser noe: riktig
// på første forsøk, riktig tastet utregning, fullført leksjon, og bare for
// forbedring i quizen. Å bla gjennom kort gir ingen poeng.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LessonCard, LessonRec, QuizItem, LearnerProfile } from '../../domain/types';
import { store, useStore } from '../../state/store';
import { getFamily } from '../../families';
import { getLesson, kbLesson, prefetchLesson, parseNumericAnswer, formatAnswer } from '../../learning/lesson';
import { awardXp, calculatorFor, patchTopic, playSound, profile, saveProfile, topicState } from '../../learning/game';
import { chapters, topicStats, relevanceText, formatText } from '../../learning/path';
import { aiAvailable } from '../../ai/client';
import { evaluate, keysText, noNum, paperSteps, planKeys } from '../../learning/calculator';
import { Mascot, MascotSays, type Mood } from '../components/Mascot';
import { OrgModelView } from '../components/OrgModelView';
import { ORG_MODEL_MAP } from '../../families/org';
import { LessonText, ColorFormula } from '../components/LessonText';
import { CalcPad } from '../components/CalcPad';
import { FigureCrop } from '../components/FigureCrop';
import { Confetti, StatBar } from '../components/Game';
import { Icon } from '../components/Icon';
import { Tex } from '../components/Math';
import { Pill, Spinner } from '../components/common';
import { Explorer } from './Formula';
import { practiceOptions, startTopicPractice } from './Path';

const OK_LINES = ['Riktig!', 'Helt rett!', 'Det sitter.', 'Bra, du tenkte som sensor.', 'Sånn skal det gjøres!'];
const OOPS_LINES = ['Nesten. Les forklaringen, så tar vi neste.', 'Ikke helt, men det er her du lærer mest.', 'Feil nå er bedre enn feil på eksamen. Se hvorfor:', 'Godt forsøk. Les forklaringen.'];
const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
const L = 'ABCD';

type Phase = 'kort' | 'pause' | 'ferdig' | 'quiz' | 'oppsummering';
interface CardState {
  picked?: number;
  shown?: number;
  open?: number[];
  calcDone?: boolean;
  calcTry?: string;
  calcChecked?: boolean;
}

/** Svaret studenten skrev («1 580», «1580,5», «ca. 66,7») som tall. */
function readNumber(s: string): number | null {
  const t = s.replace(/^\s*(svar|ca\.?|≈)\s*[:=]?\s*/i, '').replace(/[\s ]/g, '').replace(/,(?=\d)/g, '.').replace(/[−–]/g, '-').replace(/[^\d.\-eE]+$/, '');
  if (!/^-?\d+(\.\d+)?([eE]-?\d+)?$/.test(t)) return null;
  return Number(t);
}

export function Lesson() {
  const route = useStore((s) => s.ui.route);
  const kbId = route.name === 'laer' ? route.kbId : '';
  const startQuiz = route.name === 'laer' && route.part === 'quiz';
  const prof = useStore(() => profile());
  const courseId = useStore((s) => s.ui.activeCourseId);
  useStore((s) => s.course()?.settings.calculator);
  const calculator = calculatorFor(courseId ?? undefined);
  const fam = getFamily(kbId);
  const [lesson, setLesson] = useState<LessonRec | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>('Henter leksjonen …');
  const [slow, setSlow] = useState(false);
  const [ready, setReady] = useState<LessonRec | null>(null);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('kort');
  const [states, setStates] = useState<Record<number, CardState>>({});
  const [earned, setEarned] = useState(0);
  const [mood, setMood] = useState<Mood>('glad');
  const [say, setSay] = useState<string | null>(null);
  // Hver innlasting får et nummer; svar fra en eldre innlasting ignoreres.
  const req = useRef(0);
  // Studenten valgte den enkle leksjonen mens AI jobbet: ikke bytt under henne.
  const simple = useRef(false);

  const begin = (l: LessonRec, n: string | null, toQuiz: boolean) => {
    setLesson(l);
    setNote(n);
    setIdx(0);
    setStates({});
    setSay(null);
    setMood('glad');
    setReady(null);
    setPhase(toQuiz && l.quiz.length ? 'quiz' : 'kort');
  };
  const load = (regenerate = false, toQuiz = false) => {
    const id = ++req.current;
    simple.current = false;
    setLesson(null);
    setLoading(aiAvailable() ? `${prof.mascotName} leser eksamensspørsmålene dine …` : 'Lager leksjonen …');
    setSlow(false);
    const t = window.setTimeout(() => id === req.current && setSlow(true), 15000);
    getLesson(kbId, { regenerate, onProgress: (n) => id === req.current && !simple.current && setLoading(n) })
      .then((r) => {
        if (id !== req.current) return;
        if (simple.current) {
          if (r.lesson.basis === 'ai') setReady(r.lesson);
          return;
        }
        begin(r.lesson, r.note ?? null, toQuiz);
      })
      .catch((e) => {
        if (id !== req.current || simple.current) return;
        begin(kbLesson(kbId, { ...profile(), calculator }), `Leksjonen er laget fra kunnskapsbasen (${e instanceof Error ? e.message : 'ukjent feil'}).`, toQuiz);
      })
      .finally(() => {
        window.clearTimeout(t);
        if (id === req.current) setLoading(null);
      });
  };
  useEffect(() => {
    if (fam) load(false, startQuiz);
    return () => {
      req.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbId]);

  if (!fam) return <p className="page">Fant ikke temaet.</p>;
  const exit = () => store.navigate({ name: 'start' });
  const gain = (n: number, reason: string) => {
    if (n <= 0) return;
    awardXp(n, reason, { kbId });
    setEarned((x) => x + n);
  };

  if (!lesson)
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
                simple.current = true;
                begin(kbLesson(kbId, { ...prof, calculator }), 'Du startet med den enkle leksjonen fra kunnskapsbasen. Den AI-lagde blir ferdig i bakgrunnen, og du kan bytte når den er klar.', startQuiz);
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
  const st = states[idx] ?? {};
  const patch = (i: number, p: CardState) => setStates((s) => ({ ...s, [i]: { ...s[i], ...p } }));
  // Låst bare når kortet venter på deg: et ubesvart kontrollspørsmål eller steg som ikke er vist.
  const waiting = card.type === 'check' ? st.picked === undefined : card.type === 'worked' ? (st.shown ?? 1) < card.steps.length : false;

  const answerCheck = (i: number) => {
    if (card.type !== 'check' || st.picked !== undefined) return;
    // Tallsvar: i = 1 betyr riktig, 0 feil.
    const ok = card.numeric ? i === 1 : i === card.correct;
    patch(idx, { picked: i });
    setMood(ok ? 'jubler' : 'oi');
    setSay(ok ? pick(OK_LINES) : pick(OOPS_LINES));
    playSound(ok ? 'riktig' : 'feil');
    if (ok) gain(5, 'Riktig på første forsøk');
  };
  const calcSolved = () => {
    if (st.calcDone) return;
    patch(idx, { calcDone: true });
    setMood('jubler');
    setSay('Riktig! Akkurat sånn gjør du det på eksamen.');
    playSound('riktig');
    gain(5, 'Kalkulator');
  };
  const finishLesson = () => {
    const first = !topicState(kbId).lessonDoneAt;
    gain(first ? 20 : 5, first ? 'Leksjon fullført' : 'Leksjon repetert');
    patchTopic(kbId, { lessonDoneAt: new Date().toISOString(), lessonCards: cards.length });
    playSound('feiring');
    setPhase('ferdig');
    const order = chapters().flatMap((c) => c.topics.map((t) => t.kbId));
    const nxt = order[order.indexOf(kbId) + 1];
    if (nxt) prefetchLesson(nxt);
  };
  const next = () => {
    if (waiting) return;
    setSay(null);
    setMood('glad');
    if (idx + 1 >= cards.length) return finishLesson();
    if (prof.focusMode && (idx + 1) % 5 === 0 && cards.length - idx > 3) setPhase('pause');
    setIdx(idx + 1);
  };
  const back = () => {
    if (idx === 0) return;
    setSay(null);
    setMood('glad');
    setIdx(idx - 1);
  };
  const progress = phase === 'kort' || phase === 'pause' ? (idx + (phase === 'pause' ? 1 : 0)) / cards.length : 1;
  const mascotText = say ?? card.mascot ?? hintFor(card, st, calculator);
  const swap =
    ready && phase !== 'quiz' ? (
      <div className="notice teal small row between">
        <span>Den fullstendige leksjonen, laget ut fra eksamenene dine, er klar.</span>
        <button className="btn small primary" onClick={() => begin(ready, null, false)}>
          Bytt til den
        </button>
      </div>
    ) : null;

  return (
    <div className={`focus-shell${prof.focusMode ? ' focus-mode' : ''}`}>
      <div className="focus-top">
        <button className="icon-btn" onClick={exit} aria-label="Avslutt leksjonen">
          <Icon name="x" />
        </button>
        <div className="lesson-progress" role="progressbar" aria-label="Fremdrift i leksjonen" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="xp-chip" title="Poeng i denne leksjonen">
          +{earned}
        </span>
        <StyleToggle />
      </div>
      {phase === 'kort' ? (
        <div className="focus-center">
          {swap}
          {note && idx === 0 && !ready ? <div className="notice amber small">{note}</div> : null}
          <div key={idx} className={`lesson-card t-${card.type} slide-in`}>
            <CardView card={card} lesson={lesson} kbId={kbId} st={st} visual={prof.learnStyle !== 'tekst'} calculator={calculator} onPick={answerCheck} onPatch={(p) => patch(idx, p)} onCalcSolved={calcSolved} />
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
              <button className="btn primary big" onClick={next} disabled={waiting} title={waiting ? (card.type === 'check' ? 'Velg et svar først' : 'Se alle stegene først') : undefined}>
                {idx + 1 >= cards.length ? 'Fullfør' : 'Fortsett'} <Icon name="chevron" size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : phase === 'pause' ? (
        <div className="focus-center stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Mascot kind={prof.mascot} mood="jubler" size={130} />
          <h2>Kort pause</h2>
          <p>
            {idx} av {cards.length} kort er gjort. Ta et par pust, eller fortsett med en gang.
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
          <p className="big-xp">+{earned} poeng</p>
          {lesson.quiz.length ? (
            <p className="muted">Ta en kort quiz med {lesson.quiz.length} spørsmål i eksamensstil? Den er valgfri, men viser om det sitter, og gir poeng når du slår din beste.</p>
          ) : (
            <p className="muted">Det finnes ingen quizspørsmål til dette temaet ennå. Neste steg er oppgaver.</p>
          )}
          <div className="row" style={{ justifyContent: 'center' }}>
            {lesson.quiz.length ? (
              <button className="btn primary big" onClick={() => setPhase('quiz')}>
                Ta quizen
              </button>
            ) : null}
            <button className={`btn big${lesson.quiz.length ? '' : ' primary'}`} onClick={() => setPhase('oppsummering')}>
              {lesson.quiz.length ? 'Hopp over' : 'Videre'}
            </button>
          </div>
        </div>
      ) : phase === 'quiz' ? (
        <Quiz key={lesson.id + lesson.updatedAt} items={lesson.quiz} kbId={kbId} onPoints={(n) => gain(n, 'Quiz: ny beste')} onDone={() => setPhase('oppsummering')} />
      ) : (
        <Summary kbId={kbId} earned={earned} lesson={lesson} swap={swap} onRedo={() => load(true)} onReview={() => begin(lesson, null, false)} />
      )}
    </div>
  );
}

function hintFor(card: LessonCard, st: CardState, calculator: LearnerProfile['calculator']): string {
  switch (card.type) {
    case 'formula':
      return 'Fargene i formelen matcher forklaringene under.';
    case 'calculator':
      return calculator === 'enkel' && planKeys(card.expression) ? 'Trykk «Vis meg», og prøv så selv på tastaturet.' : 'Regn det ut på kalkulatoren din og skriv svaret.';
    case 'worked':
      return (st.shown ?? 1) < card.steps.length ? 'Ett steg om gangen. Prøv å gjette neste steg før du trykker.' : 'Der har du hele løsningen. Slik skal den se ut på eksamen.';
    case 'patterns':
      return 'Les hva som står, og tenk deg hva du ville gjort, før du snur kortet.';
    case 'trap':
      return 'Denne feilen gir trekk på eksamen.';
    case 'mnemonic':
      return 'Si den høyt én gang, så sitter den bedre.';
    case 'check':
      return st.picked !== undefined ? '' : card.numeric ? 'Regn selv før du ser fasiten. Første forsøk gir poeng.' : 'Velg det du tror er riktig. Første forsøk gir poeng.';
    case 'terms':
      return 'Forklar begrepet for deg selv først, så snu kortet og sjekk.';
    case 'case':
      return st.shown ? 'Se etter de samme kjennetegnene når du skriver eksempler på eksamen.' : 'Hvilket begrep er dette? Tenk før du trykker.';
    case 'outline':
      return 'Bruk denne rekkefølgen når du skriver. Den gir struktur, og sensor finner det de ser etter.';
    default:
      return '';
  }
}

function StyleToggle() {
  const p = useStore(() => profile());
  return (
    <div className="seg" role="group" aria-label="Visning">
      {(['tekst', 'visuell'] as const).map((s) => (
        <button key={s} aria-pressed={p.learnStyle === s || (s === 'visuell' && p.learnStyle === 'blanding')} onClick={() => saveProfile({ learnStyle: s })} title={s === 'tekst' ? 'Mest tekst, figurene lukket' : 'Diagrammer og interaktive figurer åpne'}>
          {s === 'tekst' ? 'Tekst' : 'Visuelt'}
        </button>
      ))}
    </div>
  );
}

function CardView({ card, lesson, kbId, st, visual, calculator, onPick, onPatch, onCalcSolved }: { card: LessonCard; lesson: LessonRec; kbId: string; st: CardState; visual: boolean; calculator: LearnerProfile['calculator']; onPick: (i: number) => void; onPatch: (p: CardState) => void; onCalcSolved: () => void }) {
  const fam = getFamily(kbId)!;
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
                    <li key={i}>
                      <LessonText text={m} />
                    </li>
                  ))}
                </ul>
              ) : null}
              {lesson.plan.skip.length ? <p className="xs muted">Dette hopper vi over fordi eksamen ikke spør om det: {lesson.plan.skip.slice(0, 4).join(' · ')}</p> : null}
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
          {card.visual ? <VisualView v={card.visual} kbId={kbId} visual={visual} /> : null}
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
            // Samme figur går igjen på flere formelkort; den er åpen bare første gang, så kortene ikke blir lange.
            <details className="disclosure play-box" open={visual && lesson.cards.find((c) => c.type === 'formula' && fam.formulas.find((x) => x.id === c.formulaId)?.figure === f.figure) === card}>
              <summary>
                <Icon name="hand" size={16} /> Lek med formelen
              </summary>
              <Explorer figure={f.figure} calc={f.calc} familyId={fam.id} />
            </details>
          ) : null}
        </div>
      );
    }
    case 'worked': {
      const shown = Math.min(st.shown ?? 1, card.steps.length);
      return (
        <div className="stack">
          <span className="eyebrow">Eksempel</span>
          <h2 className="lesson-h">{card.title}</h2>
          <div className="problem-box lesson-body">
            <LessonText text={card.problem} />
          </div>
          <ol className="worked-steps">
            {card.steps.slice(0, shown).map((s, i) => (
              <li key={i} className={i === shown - 1 ? 'slide-in' : ''}>
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
            <div className="row">
              <button className="btn" onClick={() => onPatch({ shown: shown + 1 })}>
                <Icon name="next" size={16} /> Vis neste steg ({shown} av {card.steps.length})
              </button>
              <button className="btn ghost small" onClick={() => onPatch({ shown: card.steps.length })}>
                Vis alle
              </button>
            </div>
          ) : card.answer ? (
            <p className="answer-box">
              <strong>Svar:</strong> <LessonText text={card.answer} />
            </p>
          ) : null}
        </div>
      );
    }
    case 'calculator':
      return <CalcCard card={card} st={st} calculator={calculator} onPatch={onPatch} onSolved={onCalcSolved} />;
    case 'patterns': {
      const open = new Set(st.open ?? []);
      return (
        <div className="stack">
          <span className="eyebrow">Kjenn igjen spørsmålet</span>
          <h2 className="lesson-h">{card.title}</h2>
          <div className="flip-grid">
            {card.items.map((it, i) => (
              <button key={i} className={`flip${open.has(i) ? ' open' : ''}`} onClick={() => onPatch({ open: [...open, i] })} aria-expanded={open.has(i)}>
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
      return (
        <div className="stack">
          <span className="eyebrow">{card.numeric ? 'Prøv selv' : 'Sjekk deg selv'}</span>
          {card.numeric ? <NumericQuestion q={{ ...card, numeric: card.numeric }} picked={st.picked ?? null} typed={st.calcTry ?? ''} onType={(v) => onPatch({ calcTry: v })} onAnswer={onPick} /> : <McQuestion q={card} picked={st.picked ?? null} onPick={onPick} />}
        </div>
      );
    case 'terms': {
      const open = new Set(st.open ?? []);
      return (
        <div className="stack">
          <span className="eyebrow">Begreper</span>
          <h2 className="lesson-h">{card.title}</h2>
          <div className="term-list">
            {card.items.map((it, i) => (
              <button key={i} className={`term${open.has(i) ? ' open' : ''}`} onClick={() => onPatch({ open: [...open, i] })} aria-expanded={open.has(i)}>
                <strong>{it.term}</strong>
                {open.has(i) ? (
                  <span className="term-back small">
                    <LessonText text={it.definition} />
                    {it.example ? (
                      <span className="term-ex xs">
                        <b>På jobben:</b> {it.example}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="xs faint">Trykk for definisjonen</span>
                )}
              </button>
            ))}
          </div>
          {open.size < card.items.length ? (
            <button className="btn ghost small" onClick={() => onPatch({ open: card.items.map((_, i) => i) })}>
              Vis alle
            </button>
          ) : null}
        </div>
      );
    }
    case 'case':
      return (
        <div className="stack">
          <span className="eyebrow">Eksempel fra arbeidslivet</span>
          <h2 className="lesson-h">{card.title}</h2>
          <div className="problem-box lesson-body case-box">
            <LessonText text={card.situation} />
          </div>
          {st.shown ? (
            <div className="why-box ok slide-in">
              <strong>{card.concept}</strong>
              <p className="small">
                <LessonText text={card.explanation} />
              </p>
            </div>
          ) : (
            <button className="btn" onClick={() => onPatch({ shown: 1 })}>
              Hvilket begrep er dette?
            </button>
          )}
        </div>
      );
    case 'outline':
      return (
        <div className="stack">
          <span className="eyebrow">Svarstruktur{card.minutes ? ` · ca. ${card.minutes} min` : ''}</span>
          <h2 className="lesson-h">{card.title}</h2>
          {card.question ? <p className="problem-box small src-text">{card.question}</p> : null}
          <ol className="outline-list">
            {card.items.map((it, i) => (
              <li key={i}>
                <span className={`step-dot c${(i % 4) + 1}`}>{i + 1}</span>
                <div className="stack sm" style={{ gap: 2 }}>
                  <strong className="small">{it.del}</strong>
                  <span className="small">
                    <LessonText text={it.tekst} />
                  </span>
                </div>
              </li>
            ))}
          </ol>
          {card.points?.length ? (
            <details className="disclosure">
              <summary className="small">Dette bør være med for god uttelling</summary>
              <ul className="small check-list">
                {card.points.map((p, i) => (
                  <li key={i}>
                    <LessonText text={p} />
                  </li>
                ))}
              </ul>
              <p className="xs muted">Appens faglige tolkning, ikke sensorveiledningens ordlyd.</p>
            </details>
          ) : null}
        </div>
      );
  }
}

/** Et flervalgsspørsmål med figur (når spørsmålet viser til en), alternativer og forklaring. */
function McQuestion({ q, picked, onPick }: { q: { question: string; options: string[]; correct: number; why: string; figure?: QuizItem['figure'] }; picked: number | null; onPick: (i: number) => void }) {
  return (
    <div className="stack">
      <p className="lesson-q">
        <LessonText text={q.question} />
      </p>
      {q.figure ? <FigureCrop docId={q.figure.docId} page={q.figure.page} box={q.figure.box} caption="Figur fra eksamensoppgaven" /> : null}
      <div className="options">
        {q.options.map((o, i) => {
          const state = picked === null ? '' : i === q.correct ? ' right' : i === picked ? ' wrong' : ' dim';
          return (
            <button key={i} className={`option${state}`} disabled={picked !== null} onClick={() => onPick(i)}>
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

/** Regnespørsmål med tallsvar. onAnswer(1) = riktig, onAnswer(0) = feil. Fasiten er regnet ut av appen. */
function NumericQuestion({ q, picked, typed, onType, onAnswer }: { q: { question: string; why: string; numeric: { value: number; unit?: string; tol: number } }; picked: number | null; typed: string; onType: (v: string) => void; onAnswer: (ok: number) => void }) {
  const n = parseNumericAnswer(typed, q.numeric.unit);
  const [hint, setHint] = useState(false);
  return (
    <div className="stack">
      <p className="lesson-q">
        <LessonText text={q.question} />
      </p>
      <form
        className="row calc-try"
        onSubmit={(e) => {
          e.preventDefault();
          if (picked !== null) return;
          if (n === null) return setHint(true);
          onAnswer(Math.abs(n - q.numeric.value) <= q.numeric.tol ? 1 : 0);
        }}
      >
        <label className="small" htmlFor="num-try">
          Svaret ditt{q.numeric.unit ? ` (${q.numeric.unit})` : ''}
        </label>
        <input id="num-try" className="input" inputMode="decimal" autoComplete="off" value={typed} onChange={(e) => (onType(e.target.value), setHint(false))} placeholder="Skriv tallet" style={{ maxWidth: 180 }} disabled={picked !== null} />
        <button className="btn small primary" type="submit" disabled={!typed.trim() || picked !== null}>
          Sjekk
        </button>
      </form>
      {hint && picked === null ? <p className="small" style={{ color: 'var(--amber)' }}>Skriv bare tallet, for eksempel 66,7.</p> : null}
      {picked !== null ? (
        <div className={`why-box${picked === 1 ? ' ok' : ' bad'}`}>
          <strong>{picked === 1 ? 'Riktig' : `Riktig svar er ${formatAnswer(q.numeric.value, q.numeric.unit)}`}</strong>
          {picked !== 1 && q.why ? (
            <p className="small">
              <LessonText text={q.why} />
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function VisualView({ v, kbId, visual }: { v: NonNullable<Extract<LessonCard, { type: 'concept' }>['visual']>; kbId: string; visual: boolean }) {
  if (v.kind === 'flyt')
    return visual ? (
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
    ) : (
      <ol className="plain-steps small">
        {v.items.map((it, i) => (
          <li key={i}>
            <LessonText text={it} />
          </li>
        ))}
      </ol>
    );
  if (v.kind === 'sammenlign')
    return (
      <div className={visual ? 'compare' : 'compare plain'}>
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
  if (v.kind === 'modell') {
    const m = ORG_MODEL_MAP[v.modelId];
    return m ? <OrgModelView model={m} /> : null;
  }
  const f = getFamily(kbId)?.formulas.find((x) => x.id === v.formulaId);
  if (!f) return null;
  return (
    <details className="disclosure play-box" open={visual}>
      <summary>
        <Icon name="hand" size={16} /> Prøv selv: dra i glidebryterne
      </summary>
      <Explorer figure={f.figure} calc={f.calc} familyId={kbId} />
    </details>
  );
}

const prettyExpr = (e: string) => e.replace(/\*/g, ' × ').replace(/·/g, ' × ').replace(/\//g, ' ÷ ').replace(/\s+/g, ' ').trim();

/**
 * Kalkulatorkortet vises for kalkulatoren du bruker nå (ikke den leksjonen ble laget for):
 * enkel kalkulator med tastene, i biter når uttrykket er for sammensatt, eller hele
 * uttrykket med parenteser for en vitenskapelig kalkulator. Du regner selv og skriver
 * svaret før fasiten vises.
 */
function CalcCard({ card, st, calculator, onPatch, onSolved }: { card: Extract<LessonCard, { type: 'calculator' }>; st: CardState; calculator: LearnerProfile['calculator']; onPatch: (p: CardState) => void; onSolved: () => void }) {
  const value = useMemo(() => evaluate(card.expression), [card.expression]);
  const plan = useMemo(() => (calculator === 'enkel' ? planKeys(card.expression) : null), [calculator, card.expression]);
  const paper = useMemo(() => (calculator === 'enkel' && !plan ? paperSteps(card.expression) : null), [calculator, plan, card.expression]);
  if (value === null) return null;
  const answer = noNum(value, 4);
  const typed = st.calcTry ?? '';
  const n = readNumber(typed);
  const right = n !== null && Math.abs(n - value) <= Math.max(0.005, Math.abs(value) * 0.005);
  const check = () => {
    onPatch({ calcChecked: true });
    if (right) onSolved();
  };
  const tryBox = (
    <form
      className="row calc-try"
      onSubmit={(e) => {
        e.preventDefault();
        check();
      }}
    >
      <label className="small" htmlFor="calc-try">
        Hva viser kalkulatoren?
      </label>
      <input id="calc-try" className="input" inputMode="decimal" value={typed} onChange={(e) => onPatch({ calcTry: e.target.value, calcChecked: false })} placeholder="Svaret ditt" style={{ maxWidth: 160 }} disabled={st.calcDone} />
      <button className="btn small" type="submit" disabled={!typed.trim() || st.calcDone}>
        Sjekk
      </button>
      {st.calcChecked ? right ? <span className="small ok-text">Riktig: {answer}</span> : <span className="small" style={{ color: 'var(--amber)' }}>{n === null ? 'Skriv bare tallet, for eksempel 66,7.' : `Ikke helt. Riktig er ${answer}. Sjekk parentesene og rekkefølgen.`}</span> : null}
    </form>
  );
  return (
    <div className="stack">
      <span className="eyebrow">Kalkulatoren på eksamen</span>
      <h2 className="lesson-h">{card.title}</h2>
      <p className="lesson-body">
        <LessonText text={card.task} />
      </p>
      {plan ? (
        <>
          <CalcPad expression={card.expression} onSolved={onSolved} />
          <p className="small">
            {plan.usesMemory ? 'Kalkulatoren har ingen parenteser, så minnet (M+, M−, MRC) holder på mellomsvaret.' : 'Kalkulatoren regner fra venstre mot høyre, så rekkefølgen du taster i avgjør svaret.'}
          </p>
          <p className="xs muted">Hele oppskriften: {keysText(plan.keys)}</p>
        </>
      ) : paper ? (
        <div className="card flat stack sm">
          <strong className="small">For sammensatt for én tastesekvens. Regn i biter og skriv ned mellomsvarene:</strong>
          <ol className="plain-steps mono small">
            {paper.map((s, i) => (
              <li key={i}>{s.text}</li>
            ))}
          </ol>
          {tryBox}
        </div>
      ) : (
        <div className="card flat stack sm">
          <span className="small">Tast inn hele uttrykket med parenteser:</span>
          <span className="mono big-keys">{prettyExpr(card.expression)} =</span>
          <span className="xs muted">Sett parenteser rundt hele telleren og hele nevneren. Sjekk at svaret er rimelig før du går videre.</span>
          {tryBox}
        </div>
      )}
    </div>
  );
}

function Quiz({ items, kbId, onPoints, onDone }: { items: QuizItem[]; kbId: string; onPoints: (n: number) => void; onDone: () => void }) {
  const prof = profile();
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [mood, setMood] = useState<Mood>('glad');
  const [say, setSay] = useState('Ta den tiden du trenger.');
  const [typed, setTyped] = useState('');
  const q = items[i];
  if (!q) return null;
  const finish = (final: number) => {
    // Poeng bare når du slår din beste andel riktige (gjentak gir ikke gratispoeng).
    const st = topicState(kbId);
    const prev = st.quizMax ? (st.quizBest ?? 0) / st.quizMax : 0;
    const now = final / items.length;
    if (now > prev) {
      onPoints(Math.round((now - prev) * items.length * 10));
      patchTopic(kbId, { quizBest: final, quizMax: items.length });
    }
    onDone();
  };
  return (
    <div className="focus-center">
      <div className="stack">
        <div className="row between">
          <span className="eyebrow">
            Quiz · spørsmål {i + 1} av {items.length}
          </span>
          {q.source === 'eksamen' ? <Pill tone="teal">Fra eksamenene dine</Pill> : q.source === 'mal' ? <Pill tone="outline">Øvingsspørsmål</Pill> : null}
        </div>
        {q.numeric ? (
          <NumericQuestion
            key={i}
            q={{ ...q, numeric: q.numeric }}
            picked={picked}
            typed={typed}
            onType={setTyped}
            onAnswer={(j) => {
              if (picked !== null) return;
              setPicked(j);
              const ok = j === 1;
              if (ok) setScore((s) => s + 1);
              setMood(ok ? 'jubler' : 'oi');
              setSay(ok ? pick(OK_LINES) : pick(OOPS_LINES));
              playSound(ok ? 'riktig' : 'feil');
            }}
          />
        ) : (
        <McQuestion
          q={q}
          picked={picked}
          onPick={(j) => {
            if (picked !== null) return;
            setPicked(j);
            const ok = j === q.correct;
            if (ok) setScore((s) => s + 1);
            setMood(ok ? 'jubler' : 'oi');
            setSay(ok ? pick(OK_LINES) : pick(OOPS_LINES));
            playSound(ok ? 'riktig' : 'feil');
          }}
        />
        )}
      </div>
      <div className="focus-bottom">
        <MascotSays kind={prof.mascot} name={prof.mascotName} mood={mood} text={say} size={56} speak={false} />
        <div className="row between">
          <span className="small muted">{score} riktige</span>
          <button
            className="btn primary big"
            disabled={picked === null}
            onClick={() => {
              if (i + 1 >= items.length) finish(score);
              else {
                setI(i + 1);
                setPicked(null);
                setTyped('');
                setMood('glad');
                setSay('Neste.');
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

function Summary({ kbId, earned, lesson, swap, onRedo, onReview }: { kbId: string; earned: number; lesson: LessonRec; swap: React.ReactNode; onRedo: () => void; onReview: () => void }) {
  const prof = profile();
  const st = topicState(kbId);
  const order = useMemo(() => chapters().flatMap((c) => c.topics.map((t) => t.kbId)), []);
  const nxt = order[order.indexOf(kbId) + 1];
  const nf = nxt ? getFamily(nxt) : undefined;
  const opts = useMemo(() => practiceOptions(kbId), [kbId]);
  const [busy, setBusy] = useState<string | null>(null);
  const passed = st.quizMax ? (st.quizBest ?? 0) / st.quizMax >= 0.75 : false;
  const practiceLabel = opts.best === 'ai' ? 'Nye oppgaver i eksamensstil' : opts.best === 'ekte' && opts.exam ? `Øv på ${Math.min(5, opts.exam)} spørsmål fra eksamenene dine` : opts.best === 'ekte' && opts.coll ? 'Øv på oppgaver fra oppgavesamlingen' : 'Tre øvingsoppgaver fra enkel til eksamensnivå';
  return (
    <div className="focus-center stack" style={{ alignItems: 'center', textAlign: 'center' }}>
      {swap}
      <Mascot kind={prof.mascot} mood="jubler" size={110} />
      <h2>Bra jobbet{prof.nickname ? `, ${prof.nickname}` : ''}!</h2>
      <p className="big-xp">+{earned} poeng</p>
      {st.quizMax ? (
        <p>
          Beste quiz: <strong>{st.quizBest ?? 0} av {st.quizMax}</strong> {passed ? '– bestått.' : '– 3 av 4 riktige gir bestått.'}
        </p>
      ) : null}
      <StatBar />
      <p className="small muted" style={{ maxWidth: 440 }}>
        Leksjonen gir deg verktøyene. Om det sitter, vises først når du løser oppgaver selv. Det er det som teller som «sikker» i planen.
      </p>
      <div className="stack sm" style={{ width: '100%', maxWidth: 420 }}>
        {busy ? (
          <Spinner label={busy} />
        ) : (
          <button className="btn primary big" onClick={() => void startTopicPractice(kbId, setBusy)}>
            <Icon name="pencil" size={16} /> {practiceLabel}
          </button>
        )}
        {nf ? (
          <button className="btn big" onClick={() => store.navigate({ name: 'laer', kbId: nxt })}>
            <Icon name="book" size={16} /> Neste tema: {nf.shortName}
          </button>
        ) : null}
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn ghost" onClick={onReview}>
            Gå gjennom kortene igjen
          </button>
          <button className="btn ghost" onClick={() => store.navigate({ name: 'start' })}>
            Tilbake til planen
          </button>
        </div>
      </div>
      <details className="disclosure" style={{ maxWidth: 520, textAlign: 'left' }}>
        <summary className="small">Hvordan leksjonen ble laget</summary>
        <ul className="small" style={{ paddingLeft: 18 }}>
          {lesson.checks.map((c, i) => (
            <li key={i}>
              <strong>{c.name}:</strong> {c.detail}
            </li>
          ))}
          {lesson.personalized ? <li>Eksemplene er tilpasset interessene dine fra «Meg».</li> : null}
        </ul>
        {aiAvailable() ? (
          <button className="btn small" onClick={onRedo}>
            <Icon name="refresh" size={14} /> {lesson.basis === 'ai' ? 'Lag leksjonen på nytt med andre eksempler' : 'Prøv å lage leksjonen med AI'}
          </button>
        ) : null}
      </details>
    </div>
  );
}
