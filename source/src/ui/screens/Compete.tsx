// Kapittelutfordring: raske spørsmål på tid mot din egen rekord. «Spøkelset»
// viser hvor langt du var kommet på samme tid i rekordløpet. Spørsmålene kommer
// fra quizene dine, de ekte flervalgsspørsmålene fra eksamenene og kontrollerte
// maloppgaver (i regnefag også korte regnespørsmål med tallsvar).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { QuizItem, CompetitionRun } from '../../domain/types';
import { store, useStore } from '../../state/store';
import { getFamily } from '../../families';
import { chapters } from '../../learning/path';
import { cachedLesson, examMc, templateMc, templateNumeric, parseNumericAnswer, formatAnswer } from '../../learning/lesson';
import { awardXp, chapterBest, playSound, profile, saveRun } from '../../learning/game';
import { Mascot, MascotSays } from '../components/Mascot';
import { Confetti, Trophy } from '../components/Game';
import { LessonText } from '../components/LessonText';
import { Icon } from '../components/Icon';

export const COMPETITION_N = 8;
const PER_Q_MS = 25000;
const PER_NUM_MS = 60000;

function buildPool(kbIds: string[], n = COMPETITION_N): QuizItem[] {
  const all: QuizItem[] = [];
  for (const kb of kbIds) {
    const fam = getFamily(kb);
    if (!fam) continue;
    // Uten figurer: på tid skal spørsmålet kunne leses uten et utsnitt som må lastes.
    all.push(...(cachedLesson(kb)?.quiz ?? []).filter((q) => !q.figure && !q.numeric), ...examMc(kb, 6), ...templateMc(fam, 3), ...templateNumeric(fam, 2));
  }
  const seen = new Set<string>();
  const uniq = all.filter((q) => (seen.has(q.question) ? false : (seen.add(q.question), true)));
  // Fordel på temaene: annenhver fra hvert tema.
  const byKb = kbIds.map(() => [] as QuizItem[]);
  uniq.sort(() => Math.random() - 0.5).forEach((q, i) => byKb[i % byKb.length].push(q));
  const out: QuizItem[] = [];
  for (let i = 0; out.length < n && byKb.some((b) => b.length > i); i++) for (const b of byKb) if (b[i] && out.length < n) out.push(b[i]);
  return out;
}

const sizeCache = new Map<string, { at: number; n: number }>();
/** Hvor mange ulike spørsmål kapitlet har (bufret et minutt, siden maloppgaver lages tilfeldig). */
export function competitionPoolSize(kbIds: string[]): number {
  const key = `${store.ui.activeCourseId}:${kbIds.join(',')}:${kbIds.map((k) => cachedLesson(k)?.updatedAt ?? '').join(',')}`;
  const c = sizeCache.get(key);
  if (c && Date.now() - c.at < 60000) return c.n;
  const n = buildPool(kbIds, 99).length;
  sizeCache.set(key, { at: Date.now(), n });
  return n;
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
  const [typed, setTyped] = useState('');
  const [score, setScore] = useState(0);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<{ run: CompetitionRun; record: boolean; prev?: CompetitionRun } | null>(null);
  // Løpende tall i refs, så tidtakeren og svarene aldri leser utdaterte verdier.
  const run = useRef({ start: 0, qStart: 0, score: 0, correct: 0, splits: [] as number[], locked: false });
  const best = ch ? chapterBest(ch.id) : undefined;
  useEffect(() => {
    if (phase !== 'tell') return;
    if (count <= 0) {
      setPhase('spill');
      run.current.start = performance.now();
      run.current.qStart = run.current.start;
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
  const q = items[i];
  const limit = q?.numeric ? PER_NUM_MS : PER_Q_MS;
  // Tiden går ut på et spørsmål: teller som feil.
  useEffect(() => {
    if (phase === 'spill' && q && !run.current.locked && now - run.current.qStart > limit) answer(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);
  if (!ch) return <div className="page">Fant ikke kapitlet.</div>;
  const names = ch.topics.map((t) => t.fam.shortName);
  const begin = () => {
    const pool = buildPool(ch.topics.map((t) => t.kbId));
    if (pool.length < 4) {
      store.toast('Det er for få spørsmål ennå. Gjør Lær i flere av temaene først.', 'info');
      return;
    }
    setItems(pool);
    setI(0);
    setScore(0);
    setPicked(null);
    setTyped('');
    run.current = { start: 0, qStart: 0, score: 0, correct: 0, splits: [], locked: false };
    setCount(3);
    setPhase('tell');
  };
  function answer(ok: boolean, choice?: number) {
    const r = run.current;
    if (r.locked || !items[i]) return;
    r.locked = true;
    const t = performance.now();
    const used = t - r.qStart;
    const lim = items[i].numeric ? PER_NUM_MS : PER_Q_MS;
    const pts = ok ? 100 + Math.round(Math.max(0, 1 - used / lim) * 50) : 0;
    r.score += pts;
    if (ok) r.correct++;
    r.splits.push(Math.round(t - r.start));
    setScore(r.score);
    setPicked(choice ?? (ok ? 1 : 0));
    playSound(ok ? 'riktig' : 'feil');
    window.setTimeout(() => {
      if (i + 1 >= items.length) finish();
      else {
        setI(i + 1);
        setPicked(null);
        setTyped('');
        r.qStart = performance.now();
        r.locked = false;
      }
    }, ok ? 650 : 1600);
  }
  function finish() {
    const r = run.current;
    const res: CompetitionRun = { score: r.score, correct: r.correct, total: items.length, ms: r.splits[r.splits.length - 1] ?? 0, splits: r.splits, at: new Date().toISOString() };
    const prev = chapterBest(ch!.id);
    const saved = saveRun(ch!.id, res);
    // Poeng for riktige svar, og en bonus for ny rekord.
    const pts = r.correct * 3 + (saved.record && prev ? 15 : 0);
    if (pts) awardXp(pts, saved.record ? 'Ny rekord' : 'Utfordring');
    playSound('feiring');
    setResult({ run: res, record: saved.record, prev });
    setPhase('slutt');
  }
  const elapsed = phase === 'spill' ? now - run.current.start : 0;
  const ghostDone = best ? best.splits.filter((s) => s <= elapsed).length : 0;
  const L = 'ABCD';
  const answered = picked !== null;
  return (
    <div className="focus-shell compete">
      <div className="focus-top">
        <button className="icon-btn" onClick={() => store.navigate({ name: 'start' })} aria-label="Avslutt">
          <Icon name="x" />
        </button>
        <strong className="focus-title">Kapittelutfordring · {ch.title}</strong>
      </div>
      {phase === 'intro' ? (
        <div className="focus-center stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Trophy size={56} />
          <h2>Slå din egen rekord</h2>
          <p className="muted" style={{ maxWidth: 480 }}>
            {COMPETITION_N} spørsmål fra {names.join(', ')}. Riktig svar gir 100 poeng, og jo raskere du svarer, jo mer bonus (opptil 50). Flervalg har {PER_Q_MS / 1000} sekunder, regnespørsmål {PER_NUM_MS / 1000}.
          </p>
          {best ? (
            <p>
              Rekorden din: <strong>{best.score} poeng</strong> ({best.correct} av {best.total} riktige). Den grå figuren viser rekordløpet.
            </p>
          ) : (
            <p>Første forsøk setter rekorden.</p>
          )}
          <MascotSays kind={prof.mascot} name={prof.mascotName} mood="glad" text="Feil svar koster bare tid. Du mister aldri poeng du allerede har." size={56} speak={false} />
          <button className="btn primary big" onClick={begin}>
            Start <Icon name="chevron" size={16} />
          </button>
        </div>
      ) : phase === 'tell' ? (
        <div className="focus-center" style={{ display: 'grid', placeItems: 'center' }}>
          <span className="countdown" aria-live="assertive">
            {count || 'Nå!'}
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
            <span style={{ width: `${Math.max(0, 100 - ((now - run.current.qStart) / limit) * 100)}%` }} />
          </div>
          <p className="lesson-q">
            <LessonText text={q.question} />
          </p>
          {q.numeric ? (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (answered) return;
                const v = parseNumericAnswer(typed, q.numeric!.unit);
                answer(v !== null && Math.abs(v - q.numeric!.value) <= q.numeric!.tol, v !== null && Math.abs(v - q.numeric!.value) <= q.numeric!.tol ? 1 : 0);
              }}
            >
              <input className="input" style={{ flex: 1, minWidth: 160, fontSize: '1.2rem' }} inputMode="decimal" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Svar${q.numeric.unit ? ` (${q.numeric.unit})` : ''}`} aria-label="Svaret ditt" disabled={answered} />
              <button className="btn primary" type="submit" disabled={answered || !typed.trim()}>
                Svar
              </button>
            </form>
          ) : (
            <div className="options">
              {q.options.map((o, j) => {
                const state = !answered ? '' : j === q.correct ? ' right' : j === picked ? ' wrong' : ' dim';
                return (
                  <button key={j} className={`option${state}`} disabled={answered} onClick={() => answer(j === q.correct, j)}>
                    <span className="opt-letter">{L[j]}</span>
                    <LessonText text={o} />
                  </button>
                );
              })}
            </div>
          )}
          {answered && q.numeric ? <p className={`small why-box ${picked ? 'ok' : 'bad'}`}>{picked ? 'Riktig!' : `Riktig svar: ${formatAnswer(q.numeric.value, q.numeric.unit)}`}</p> : null}
          {answered && !q.numeric && picked !== q.correct && q.why ? (
            <p className="small why-box bad">
              <LessonText text={q.why} />
            </p>
          ) : null}
        </div>
      ) : result ? (
        <div className="focus-center stack celebrate" style={{ alignItems: 'center', textAlign: 'center' }}>
          {result.record && result.run.score > 0 ? <Confetti n={40} /> : null}
          <Mascot kind={prof.mascot} mood={result.record || result.run.correct >= result.run.total * 0.75 ? 'jubler' : 'glad'} size={110} />
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
              Tilbake til planen
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
