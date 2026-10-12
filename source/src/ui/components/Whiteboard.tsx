// «Vis meg»: styrbar tavlegjennomgang bygd på den kontrollerte løsningen.
// Graf, regnesteg og teksting bruker samme parametere. Vises bare når løsningen
// har nok regnesteg til at en gjennomgang faktisk gir noe (se boardWorthIt).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeneratedTask, GenPart } from '../../domain/types';
import { Rat } from '../../math/rational';
import { Tex, texToSpeech, texToPlain } from './Math';
import { EquilibriumGraph, CostGraph, PercentBars, axisFor, niceStep } from './Graphs';
import { Icon } from './Icon';
import { speak, ttsAvailable, norwegianVoice } from './Voice';

export interface WbFrame {
  lines: string[];
  current: number;
  caption: string;
  graph?: { highlight?: 'demand' | 'supply' | 'both' | 'point' | 'none'; showEq?: boolean; priceLine?: number; q?: number };
}

const n = (s: string) => Rat.parse(s).toNumber();
const nf = (x: number) => (Math.round(x * 100) / 100).toString().replace('.', ',');

export function buildWalkthrough(task: GeneratedTask, part: GenPart, detail: 'kort' | 'detaljert'): WbFrame[] {
  const p = task.params;
  const frames: WbFrame[] = [];
  const isEq = task.familyKbId === 'likevekt-lineaer' && p.a && p.b && p.c && p.d && part.math?.defs.Qd;
  if (isEq) {
    const [a, b, c, d] = [n(p.a), n(p.b), n(p.c), n(p.d)];
    const P = (a - c) / (b + d);
    const Q = a - b * P;
    const L = [
      'Q_d = Q_s',
      `${nf(a)} - ${nf(b)}P = ${c < 0 ? '-' + nf(-c) : nf(c)} + ${nf(d)}P`,
      `${nf(a - c)} = ${nf(b + d)}P`,
      `P = \\frac{${nf(a - c)}}{${nf(b + d)}} = ${nf(P)}`,
      `Q = ${nf(a)} - ${nf(b)} \\cdot ${nf(P)} = ${nf(Q)}`,
      `Q_s = ${nf(c)} + ${nf(d)} \\cdot ${nf(P)} = ${nf(Q)}`,
    ].map((x) => x.replace(/(\d),(\d)/g, '$1{,}$2'));
    frames.push({ lines: [], current: -1, caption: `Her er modellen: etterspørselen (lilla) faller når prisen stiger, tilbudet (turkis) øker. Pris står på den loddrette aksen.`, graph: { highlight: 'both', showEq: false } });
    frames.push({ lines: L.slice(0, 1), current: 0, caption: 'Likevekt betyr at kjøperne vil kjøpe akkurat like mye som selgerne vil selge. Det skriver vi som Qd = Qs.', graph: { highlight: 'both', showEq: false } });
    frames.push({ lines: L.slice(0, 2), current: 1, caption: 'Vi setter inn uttrykkene fra oppgaven. Nå er P den eneste ukjente.', graph: { highlight: 'both', showEq: false } });
    if (detail === 'detaljert') frames.push({ lines: L.slice(0, 2), current: 1, caption: `Vi legger til ${nf(b)}P på begge sider${c ? ` og ${c > 0 ? 'trekker fra' : 'legger til'} ${nf(Math.abs(c))}` : ''}. Det vi gjør på den ene siden, gjør vi på den andre.`, graph: { highlight: 'both', showEq: false } });
    frames.push({ lines: L.slice(0, 3), current: 2, caption: `P-leddene står nå samlet: ${nf(b)}P + ${nf(d)}P = ${nf(b + d)}P.`, graph: { highlight: 'both', showEq: false } });
    frames.push({ lines: L.slice(0, 4), current: 3, caption: `${nf(b + d)}P betyr ${nf(b + d)} ganger P. Vi deler begge sider på ${nf(b + d)} og får P = ${nf(P)}.`, graph: { highlight: 'point', showEq: false, priceLine: P } });
    frames.push({ lines: L.slice(0, 5), current: 4, caption: `Ved denne prisen etterspørres ${nf(Q)} enheter. Det er likevektskvantumet.`, graph: { highlight: 'point', showEq: true } });
    frames.push({ lines: L, current: 5, caption: `Kontroll: tilbudet gir også ${nf(Q)}. Kurvene krysser i (${nf(Q)}, ${nf(P)}).`, graph: { highlight: 'point', showEq: true } });
    if (detail === 'detaljert') frames.push({ lines: L, current: -1, caption: 'Tolkning: ved denne prisen er det verken overskudd eller mangel, så verken kjøpere eller selgere har grunn til å presse prisen. Dette gjelder innenfor modellens forutsetninger.', graph: { highlight: 'point', showEq: true } });
    return frames;
  }
  const steps = part.solution.filter((s) => s.tex || s.text);
  const lines: string[] = [];
  steps.forEach((s) => {
    if (s.tex) lines.push(s.tex);
    const cap = detail === 'detaljert' && s.why ? `${s.text}. ${s.why}` : s.text;
    frames.push({ lines: [...lines], current: s.tex ? lines.length - 1 : -1, caption: cap.replace(/\.\./g, '.'), graph: { highlight: 'both', q: p.q ? n(p.q) : undefined } });
  });
  return frames;
}

/** En tavlegjennomgang er bare verdt å tilby når den har minst tre steg og minst to regnelinjer. */
export function boardWorthIt(task: GeneratedTask, part: GenPart): boolean {
  const f = buildWalkthrough(task, part, 'kort');
  return f.length >= 3 && (f[f.length - 1]?.lines.length ?? 0) >= 2;
}

function GraphFor({ task, frame }: { task: GeneratedTask; frame: WbFrame }) {
  const p = task.params;
  if (task.familyKbId === 'likevekt-lineaer' || task.familyKbId === 'likevekt-avgift') {
    if (!p.a) return null;
    return <EquilibriumGraph a={n(p.a)} b={n(p.b)} c={n(p.c)} d={n(p.d)} t={task.familyKbId === 'likevekt-avgift' && frame.current >= 1 ? n(p.t) : undefined} highlight={frame.graph?.highlight} showEq={frame.graph?.showEq} priceLine={frame.graph?.priceLine} />;
  }
  if (task.familyKbId === 'kostnad-lineaer' && p.F && p.c) return <CostGraph F={n(p.F)} c={n(p.c)} mode="enhet" q={p.q ? n(p.q) : undefined} />;
  if (task.familyKbId === 'prosent-endring' && p.V0 && p.V1) return <PercentBars v0={n(p.V0)} v1={n(p.V1)} />;
  return null;
}

export function Whiteboard({ task, part, onAsk }: { task: GeneratedTask; part: GenPart; onAsk?: (caption: string) => void }) {
  const [detail, setDetail] = useState<'kort' | 'detaljert'>('kort');
  const frames = useMemo(() => buildWalkthrough(task, part, detail), [task, part, detail]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [narrate, setNarrate] = useState(false);
  const cancelSpeech = useRef<() => void>(() => {});
  const f = frames[Math.min(idx, frames.length - 1)];
  useEffect(() => setIdx(0), [detail]);
  useEffect(() => {
    if (!playing) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const advance = () => setIdx((i) => (i + 1 < frames.length ? i + 1 : (setPlaying(false), i)));
    if (narrate && ttsAvailable()) {
      cancelSpeech.current = speak(texToSpeech(f.caption), { rate: speed, onEnd: () => (t = setTimeout(advance, 450)) });
    } else {
      t = setTimeout(advance, Math.max(2200, f.caption.length * 55) / speed);
    }
    return () => {
      if (t) clearTimeout(t);
      cancelSpeech.current();
    };
  }, [playing, idx, narrate, speed, frames.length, f.caption]);
  useEffect(() => () => cancelSpeech.current(), []);
  if (!frames.length) return <p className="muted">Ingen gjennomgang for denne deloppgaven.</p>;
  return (
    <div className="stack">
      <div className="board" aria-live="polite">
        <div className="eqs">
          {frames[frames.length - 1].lines.map((l, i) => (
            <div key={i} className={`eq-line ${i < f.lines.length ? 'shown' : ''} ${i === f.current ? 'current' : ''}`} aria-hidden={i >= f.lines.length}>
              <Tex tex={l} />
            </div>
          ))}
        </div>
        <div>
          <GraphFor task={task} frame={f} />
        </div>
        <div className="caption" role="status">
          <span className="xs" style={{ opacity: 0.7 }}>
            Steg {idx + 1} av {frames.length}
          </span>
          <div>{f.caption}</div>
        </div>
      </div>
      <div className="row between">
        <div className="row">
          <button className="icon-btn" onClick={() => setIdx((i) => Math.max(0, i - 1))} aria-label="Forrige steg">
            <Icon name="prev" />
          </button>
          <button className="btn small primary" onClick={() => (idx >= frames.length - 1 && !playing ? (setIdx(0), setPlaying(true)) : setPlaying(!playing))}>
            <Icon name={playing ? 'pause' : 'play'} size={16} />
            {playing ? 'Pause' : idx >= frames.length - 1 ? 'Spill av igjen' : 'Spill av'}
          </button>
          <button className="icon-btn" onClick={() => setIdx((i) => Math.min(frames.length - 1, i + 1))} aria-label="Neste steg">
            <Icon name="next" />
          </button>
        </div>
        <div className="row">
          <label className="xs muted row" style={{ gap: 4 }}>
            Tempo
            <select className="input" style={{ minHeight: 36, padding: '4px 8px', width: 'auto' }} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={0.75}>Rolig</option>
              <option value={1}>Normal</option>
              <option value={1.4}>Raskt</option>
            </select>
          </label>
          <label className="xs muted row" style={{ gap: 4 }}>
            Detaljer
            <select className="input" style={{ minHeight: 36, padding: '4px 8px', width: 'auto' }} value={detail} onChange={(e) => setDetail(e.target.value as 'kort' | 'detaljert')}>
              <option value="kort">Kort</option>
              <option value="detaljert">Detaljert</option>
            </select>
          </label>
          {ttsAvailable() ? (
            <label className="xs muted row" style={{ gap: 4 }} title={norwegianVoice() ? '' : 'Ingen norsk stemme funnet; standardstemmen brukes'}>
              <input type="checkbox" checked={narrate} onChange={(e) => setNarrate(e.target.checked)} /> Opplesing
            </label>
          ) : (
            <span className="xs faint">Opplesing ikke tilgjengelig</span>
          )}
        </div>
      </div>
      <div className="row">
        {onAsk ? (
          <button className="btn small soft" onClick={() => onAsk(f.caption)}>
            <Icon name="help" size={16} />
            Spør om dette steget
          </button>
        ) : null}
      </div>
    </div>
  );
}
