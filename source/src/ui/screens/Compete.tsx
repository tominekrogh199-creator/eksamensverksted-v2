// Konkurranse på slutten av et kapittel: 8 raske spørsmål på tid mot din egen
// rekord. «Spøkelset» viser hvor langt du var kommet på samme tid i rekordløpet.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { QuizItem, CompetitionRun } from '../../domain/types';
import { store, useStore } from '../../state/store';
import { getFamily } from '../../families';
import { chapters } from '../../learning/path';
import { cachedLesson, examMc, templateMc } from '../../learning/lesson';
import { awardXp, chapterBest, playSound, profile, saveRun } from '../../learning/game';
import { Mascot, MascotSays } from '../components/Mascot';
import { Confetti, Trophy } from '../components/Game';
import { LessonText } from '../components/LessonText';
import { Icon } from '../components/Icon';

const N = 8;
const PER_Q_MS = 25000;

function buildPool(kbIds: string[]): QuizItem[] {
  const all: QuizItem[] = [];
  for (const kb of kbIds) {
    const fam = getFamily(kb);
    if (!fam) continue;
    all.push(...(cachedLesson(kb)?.quiz ?? []), ...examMc(kb, 4), ...templateMc(fam, 3));
  }
  const seen = new Set<string>();
  const uniq = all.filter((q) => (seen.has(q.question) ? false : (seen.add(q.question), true)));
  // Bland, men fordel på temaene.
  return uniq.sort(() => Math.random() - 0.5).slice(0, N);
}

export function Compete() {
  const route = useStore((s) => s.ui.route);
  const chId = route.name === 'konkurranse' ? route.chapter : '';
  const ch = useMemo(() => chapters().find((c) => c.id === chId), [chId]);
  const prof = profile();
  const [phase, setPhase] = useState<'intro' | 'tell' | 'spill' | 'slutt'>('intro');
  const [count, setCount] = useState(3);
  const [items, setItems] = useState<QuizItem[]>([]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [splits, setSplits] = useState<number[]>([]);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<{ run: CompetitionRun; record: boolean; prev?: CompetitionRun } | null>(null);
  const start = useRef(0);
  const qStart = useRef(0);
  const best = ch ? chapterBest(ch.id) : undefined;
  useEffect(() => {
    if (phase !== 'tell') return;
    if (count <= 0) {
      setPhase('spill');
      start.current = performance.now();
      qStart.current = start.current;
      return;
    }
    const t = window.setTimeout(() => setCount(count - 1), 700);
    return () => window.clearTimeout(t);
  }, [phase, count]);
  useEffect(() => {
    if (phase !== 'spill') return;
    const t = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(t);
  }, [phase]);
  // Tiden går ut på et spørsmål: teller som feil.
  useEffect(() => {
    if (phase === 'spill' && picked === null && now - qStart.current > PER_Q_MS) answer(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);
  if (!ch) return <div className="page">Fant ikke kapitlet.</div>;
  const names = ch.topics.map((t) => t.fam.shortName);
  const begin = () => {
    const pool = buildPool(ch.topics.map((t) => t.kbId));
    if (pool.length < 4) {
      store.toast('Det er for få spørsmål ennå. Gjør Lær i temaene først, så får konkurransen flere spørsmål.', 'info');
      return;
    }
    setItems(pool);
    setI(0);
    setScore(0);
    setCorrect(0);
    setSplits([]);
    setPicked(null);
    setCount(3);
    setPhase('tell');
  };
  function answer(j: number) {
    if (picked !== null) return;
    const q = items[i];
    const t = performance.now();
    const used = t - qStart.current;
    const ok = j === q.correct;
    const pts = ok ? 100 + Math.round(Math.max(0, 1 - used / PER_Q_MS) * 50) : 0;
    setPicked(j);
    setScore((s) => s + pts);
    if (ok) setCorrect((c) => c + 1);
    setSplits((s) => [...s, Math.round(t - start.current)]);
    playSound(ok ? 'riktig' : 'feil');
    window.setTimeout(() => {
      if (i + 1 >= items.length) finish(score + pts, correct + (ok ? 1 : 0), [...splits, Math.round(t - start.current)]);
      else {
        setI(i + 1);
        setPicked(null);
        qStart.current = performance.now();
      }
    }, ok ? 650 : 1400);
  }
  function finish(finalScore: number, finalCorrect: number, finalSplits: number[]) {
    const run: CompetitionRun = { score: finalScore, correct: finalCorrect, total: items.length, ms: finalSplits[finalSplits.length - 1] ?? 0, splits: finalSplits, at: new Date().toISOString() };
    const prev = chapterBest(ch!.id);
    const r = saveRun(ch!.id, run);
    awardXp(Math.max(5, Math.round(finalScore / 25)) + (r.record && prev ? 30 : 0), r.record ? 'Ny rekord' : 'Konkurranse');
    playSound('feiring');
    setResult({ run, record: r.record, prev });
    setPhase('slutt');
  }
  const elapsed = phase === 'spill' ? now - start.current : 0;
  // Spøkelset: hvor mange spørsmål rekordløpet hadde besvart på samme tid.
  const ghostDone = best ? best.splits.filter((s) => s <= elapsed).length : 0;
  const q = items[i];
  const L = 'ABCD';
  return (
    <div className="focus-shell compete">
      <div className="focus-top">
        <button className="icon-btn" onClick={() => store.navigate({ name: 'start' })} aria-label="Avslutt">
          <Icon name="x" />
        </button>
        <strong className="focus-title">Konkurranse · {ch.title}</strong>
      </div>
      {phase === 'intro' ? (
        <div className="focus-center stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Trophy size={64} />
          <h2>Slå din egen rekord</h2>
          <p className="muted" style={{ maxWidth: 460 }}>
            {N} raske spørsmål fra {names.join(', ')}. Riktig svar gir 100 poeng, og jo raskere du svarer, jo mer bonus (opptil 50). Du har {PER_Q_MS / 1000} sekunder per spørsmål.
          </p>
          {best ? (
            <p>
              Rekorden din: <strong>{best.score} poeng</strong> ({best.correct} av {best.total} riktige). Spøkelset viser hvor langt du var kommet i rekordløpet.
            </p>
          ) : (
            <p>Første forsøk setter rekorden.</p>
          )}
          <MascotSays kind={prof.mascot} name={prof.mascotName} mood="jubler" text="Ikke stress: feil svar koster bare tid, ikke poeng du allerede har." size={56} speak={false} />
          <button className="btn primary big" onClick={begin}>
            Start <Icon name="chevron" size={16} />
          </button>
        </div>
      ) : phase === 'tell' ? (
        <div className="focus-center" style={{ display: 'grid', placeItems: 'center' }}>
          <span className="countdown" aria-live="assertive">
            {count || 'Kjør!'}
          </span>
        </div>
      ) : phase === 'spill' && q ? (
        <div className="focus-center">
          <div className="race" aria-label="Fremgang mot rekorden">
            <div className="lane">
              <span className="runner you" style={{ left: `${(i / items.length) * 100}%` }}>
                <Mascot kind={prof.mascot} mood="glad" size={30} />
              </span>
              <span className="lane-label xs">Du</span>
            </div>
            {best ? (
              <div className="lane ghost">
                <span className="runner" style={{ left: `${(Math.min(ghostDone, items.length) / items.length) * 100}%` }}>
                  <Mascot kind={prof.mascot} mood="tenker" size={30} />
                </span>
                <span className="lane-label xs">Rekorden</span>
              </div>
            ) : null}
          </div>
          <div className="row between">
            <span className="eyebrow">
              Spørsmål {i + 1} av {items.length}
            </span>
            <strong>{score} poeng</strong>
          </div>
          <div className="q-timer">
            <span style={{ width: `${Math.max(0, 100 - ((now - qStart.current) / PER_Q_MS) * 100)}%` }} />
          </div>
          <p className="lesson-q">
            <LessonText text={q.question} />
          </p>
          <div className="options">
            {q.options.map((o, j) => {
              const state = picked === null ? '' : j === q.correct ? ' right' : j === picked ? ' wrong' : ' dim';
              return (
                <button key={j} className={`option${state}`} disabled={picked !== null} onClick={() => answer(j)}>
                  <span className="opt-letter">{L[j]}</span>
                  <LessonText text={o} />
                </button>
              );
            })}
          </div>
          {picked !== null && picked !== q.correct && q.why ? (
            <p className="small why-box bad">
              <LessonText text={q.why} />
            </p>
          ) : null}
        </div>
      ) : result ? (
        <div className="focus-center stack celebrate" style={{ alignItems: 'center', textAlign: 'center' }}>
          {result.record ? <Confetti n={48} /> : null}
          <Mascot kind={prof.mascot} mood={result.record || result.run.correct >= result.run.total * 0.75 ? 'jubler' : 'glad'} size={120} />
          <h2>{result.record && result.prev ? 'Ny rekord!' : result.record && result.run.score > 0 ? 'Første rekord er satt!' : result.record ? 'Første forsøk er gjort' : 'Godt kjempet!'}</h2>
          <p className="big-xp">{result.run.score} poeng</p>
          <p>
            {result.run.correct} av {result.run.total} riktige på {Math.round(result.run.ms / 1000)} sekunder.
            {result.prev && !result.record ? ` Rekorden er ${result.prev.score}.` : ''}
            {result.prev && result.record ? ` Forrige rekord var ${result.prev.score}.` : ''}
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary big" onClick={begin}>
              <Icon name="refresh" size={16} /> Prøv igjen
            </button>
            <button className="btn big" onClick={() => store.navigate({ name: 'start' })}>
              Tilbake til stien
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
