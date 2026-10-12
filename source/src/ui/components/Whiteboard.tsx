// «Vis meg»: styrbar tavlegjennomgang bygd på den kontrollerte løsningen.
// Graf, regnesteg og teksting bruker samme parametere. Kan eksporteres til en
// ekte videofil (WebM) i nettleseren, med teksting men uten lyd.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeneratedTask, GenPart } from '../../domain/types';
import { Rat } from '../../math/rational';
import { Tex, texToSpeech, texToPlain } from './Math';
import { EquilibriumGraph, CostGraph, PercentBars, axisFor, niceStep } from './Graphs';
import { Icon } from './Icon';
import { speak, ttsAvailable, norwegianVoice } from './Voice';
import { store } from '../../state/store';
import { offerDownload } from '../../storage/platform';

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
        <VideoExport task={task} frames={frames} />
      </div>
    </div>
  );
}

// ——— Videoeksport ———

function drawFrameToCanvas(ctx: CanvasRenderingContext2D, task: GeneratedTask, frames: WbFrame[], i: number, fade: number) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const f = frames[i];
  ctx.fillStyle = '#1d2a28';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f2c14e';
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.fillText(`${task.title} · Eksamensverksted`, 48, 52);
  ctx.fillStyle = 'rgba(241,244,239,0.55)';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText(task.demo ? 'DEMO · generert øvingsoppgave' : 'Generert øvingsoppgave', 48, 80);
  const all = frames[frames.length - 1].lines;
  ctx.font = '30px "DejaVu Sans", system-ui, sans-serif';
  all.forEach((l, k) => {
    const shown = k < f.lines.length;
    ctx.globalAlpha = shown ? (k === f.lines.length - 1 && k === f.current ? fade : 1) : 0.18;
    if (k === f.current) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(40, 118 + k * 58, 600, 50);
      ctx.fillStyle = '#f2c14e';
      ctx.fillRect(40, 118 + k * 58, 5, 50);
    }
    ctx.fillStyle = '#f1f4ef';
    ctx.fillText(texToPlain(l), 58, 153 + k * 58);
  });
  ctx.globalAlpha = 1;
  const p = task.params;
  if ((task.familyKbId === 'likevekt-lineaer' || task.familyKbId === 'likevekt-avgift') && p.a) {
    const [a, b, c, d] = [n(p.a), n(p.b), n(p.c), n(p.d)];
    const ax = axisFor(a, b, c, d);
    const gx = 700;
    const gy = 110;
    const gw = 520;
    const gh = 400;
    const X = (q: number) => gx + (q / ax.qMax) * gw;
    const Y = (pp: number) => gy + gh - (pp / ax.pMax) * gh;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    const sx = niceStep(ax.qMax);
    const sy = niceStep(ax.pMax);
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = '#cfd8d3';
    for (let q = 0; q <= ax.qMax; q += sx) {
      ctx.beginPath();
      ctx.moveTo(X(q), Y(0));
      ctx.lineTo(X(q), Y(ax.pMax));
      ctx.stroke();
      ctx.fillText(nf(q), X(q) - 8, Y(0) + 22);
    }
    for (let pp = 0; pp <= ax.pMax; pp += sy) {
      ctx.beginPath();
      ctx.moveTo(X(0), Y(pp));
      ctx.lineTo(X(ax.qMax), Y(pp));
      ctx.stroke();
      ctx.fillText(nf(pp), X(0) - 36, Y(pp) + 5);
    }
    ctx.strokeStyle = '#cfd8d3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(ax.pMax));
    ctx.lineTo(X(0), Y(0));
    ctx.lineTo(X(ax.qMax), Y(0));
    ctx.stroke();
    ctx.fillText('P', X(0) - 8, gy - 10);
    ctx.fillText('Q', X(ax.qMax) + 8, Y(0) + 5);
    const line = (k: number, m: number, color: string) => {
      const pts: [number, number][] = [];
      for (let pp = 0; pp <= ax.pMax; pp += ax.pMax / 200) {
        const q = k + m * pp;
        if (q >= 0 && q <= ax.qMax) pts.push([X(q), Y(pp)]);
      }
      if (pts.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const pt of pts) ctx.lineTo(pt[0], pt[1]);
      ctx.stroke();
    };
    line(a, -b, '#c3adfa');
    line(c, d, '#7fd6c9');
    if (f.graph?.priceLine !== undefined) {
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = '#f2c14e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(f.graph.priceLine));
      ctx.lineTo(X(ax.qMax), Y(f.graph.priceLine));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (f.graph?.showEq) {
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath();
      ctx.arc(X(ax.Q), Y(ax.P), 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f1f4ef';
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.fillText(`(${nf(ax.Q)}, ${nf(ax.P)})`, X(ax.Q) + 14, Y(ax.P) - 12);
    }
  }
  // Teksting
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(40, H - 150, W - 80, 110);
  ctx.fillStyle = '#ffffff';
  ctx.font = '24px system-ui, sans-serif';
  const words = f.caption.split(' ');
  let line = '';
  let y = H - 108;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > W - 130) {
      ctx.fillText(line, 64, y);
      line = w;
      y += 34;
    } else line = test;
  }
  if (line) ctx.fillText(line, 64, y);
}

function VideoExport({ task, frames }: { task: GeneratedTask; frames: WbFrame[] }) {
  const [state, setState] = useState<'idle' | 'lager' | 'klar' | 'feil'>('idle');
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [info, setInfo] = useState('');
  const supported = typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  if (!supported) return <span className="xs faint">Videofil: nettleseren støtter ikke opptak av lerret</span>;
  const make = async () => {
    setState('lager');
    setInfo('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d')!;
      const stream = (canvas as HTMLCanvasElement & { captureStream: (fps: number) => MediaStream }).captureStream(30);
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 2_500_000 } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise<void>((r) => (rec.onstop = () => r()));
      rec.start(250);
      for (let i = 0; i < frames.length; i++) {
        const dur = Math.max(2600, frames[i].caption.length * 60);
        const t0 = performance.now();
        await new Promise<void>((res) => {
          const tick = () => {
            const el = performance.now() - t0;
            drawFrameToCanvas(ctx, task, frames, i, Math.min(1, el / 500));
            if (el < dur) requestAnimationFrame(tick);
            else res();
          };
          tick();
        });
      }
      rec.stop();
      await done;
      const b = new Blob(chunks, { type: 'video/webm' });
      const u = URL.createObjectURL(b);
      // Bekreft at filen faktisk kan spilles av.
      const ok = await new Promise<number | null>((res) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => res(Number.isFinite(v.duration) ? v.duration : -1);
        v.onerror = () => res(null);
        v.src = u;
        setTimeout(() => res(null), 6000);
      });
      if (ok === null) {
        setState('feil');
        setInfo('Videoen ble laget, men nettleseren kunne ikke bekrefte at den spilles av.');
        URL.revokeObjectURL(u);
        return;
      }
      setUrl(u);
      setBlob(b);
      setState('klar');
      setInfo(`WebM, ${(b.size / 1024 / 1024).toFixed(1).replace('.', ',')} MB${ok > 0 ? `, ${Math.round(ok)} s` : ''}. Teksting er brent inn; filen har ikke lyd.`);
    } catch (e) {
      setState('feil');
      setInfo(e instanceof Error ? e.message : 'Kunne ikke lage video.');
    }
  };
  return (
    <div className="stack sm" style={{ flex: 1, minWidth: 220 }}>
      {state !== 'klar' ? (
        <button className="btn small" onClick={make} disabled={state === 'lager'}>
          <Icon name="video" size={16} />
          {state === 'lager' ? 'Lager videofil …' : 'Lag videofil'}
        </button>
      ) : null}
      {state === 'lager' ? <span className="xs muted">Spiller gjennomgangen i bakgrunnen og tar den opp. Tar omtrent like lang tid som videoen.</span> : null}
      {url && state === 'klar' ? (
        <div className="stack sm">
          <video src={url} controls style={{ width: '100%', borderRadius: 12, background: '#000' }} />
          <div className="row">
            <span className="xs muted">{info}</span>
            <button
              className="btn small"
              onClick={async () => {
                if (!store.platform || !blob) return;
                const r = await offerDownload(store.platform, `vis-meg-${task.templateId}.webm`, blob);
                store.toast(r === 'lagret' ? 'Videofilen er lagret.' : r === 'avslått' ? 'Nedlasting avbrutt.' : 'Nedlasting er ikke tilgjengelig i denne visningen; videoen kan spilles av her.', r === 'lagret' ? 'ok' : 'info');
              }}
            >
              <Icon name="download" size={16} />
              Last ned
            </button>
          </div>
        </div>
      ) : null}
      {state === 'feil' ? <span className="xs" style={{ color: 'var(--amber)' }}>{info}</span> : null}
    </div>
  );
}
