// Grafer tegnet fra de samme parameterne som regnestykket. Pris står på den
// loddrette aksen, kvantum på den vannrette (samfunnsøkonomisk konvensjon).

import { useRef } from 'react';

const W = 480;
const H = 360;
const ML = 48;
const MB = 38;
const MT = 14;
const MR = 18;

export function niceStep(max: number, target = 6): number {
  const raw = max / target;
  const steps = [1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  return steps.find((s) => s >= raw) ?? raw;
}

function fmt(n: number) {
  return (Math.round(n * 100) / 100).toString().replace('.', ',');
}

interface Frame {
  qMax: number;
  pMax: number;
  x: (q: number) => number;
  y: (p: number) => number;
  inv: (px: number, py: number) => { q: number; p: number };
}

function frame(qMax: number, pMax: number): Frame {
  const iw = W - ML - MR;
  const ih = H - MT - MB;
  return {
    qMax,
    pMax,
    x: (q) => ML + (q / qMax) * iw,
    y: (p) => MT + ih - (p / pMax) * ih,
    inv: (px, py) => ({ q: ((px - ML) / iw) * qMax, p: ((MT + ih - py) / ih) * pMax }),
  };
}

function Axes({ f, xLabel, yLabel }: { f: Frame; xLabel: string; yLabel: string }) {
  const sx = niceStep(f.qMax);
  const sy = niceStep(f.pMax);
  const xs: number[] = [];
  for (let q = 0; q <= f.qMax + 1e-9; q += sx) xs.push(q);
  const ys: number[] = [];
  for (let p = 0; p <= f.pMax + 1e-9; p += sy) ys.push(p);
  return (
    <g>
      <g className="grid">
        {xs.map((q) => (
          <line key={'x' + q} x1={f.x(q)} x2={f.x(q)} y1={f.y(0)} y2={f.y(f.pMax)} />
        ))}
        {ys.map((p) => (
          <line key={'y' + p} x1={f.x(0)} x2={f.x(f.qMax)} y1={f.y(p)} y2={f.y(p)} />
        ))}
      </g>
      <line className="axis" x1={f.x(0)} x2={f.x(f.qMax)} y1={f.y(0)} y2={f.y(0)} />
      <line className="axis" x1={f.x(0)} x2={f.x(0)} y1={f.y(0)} y2={f.y(f.pMax)} />
      {xs.map((q) => (
        <text key={'tx' + q} x={f.x(q)} y={f.y(0) + 16} textAnchor="middle">
          {fmt(q)}
        </text>
      ))}
      {ys.map((p) => (
        <text key={'ty' + p} x={f.x(0) - 7} y={f.y(p) + 4} textAnchor="end">
          {fmt(p)}
        </text>
      ))}
      <text x={f.x(f.qMax)} y={H - 4} textAnchor="end" style={{ fontWeight: 600 }}>
        {xLabel}
      </text>
      <text x={8} y={MT + 2} textAnchor="start" style={{ fontWeight: 600 }} transform={`rotate(0)`}>
        {yLabel}
      </text>
    </g>
  );
}

/** Linjestykke av Q = k + m·P innenfor rammen (P på y-aksen). */
function segQ(f: Frame, k: number, m: number): [number, number, number, number] | null {
  // Q = k + mP  ⇒  P = (Q − k)/m
  const pts: { q: number; p: number }[] = [];
  const add = (q: number, p: number) => {
    if (q >= -1e-9 && q <= f.qMax + 1e-9 && p >= -1e-9 && p <= f.pMax + 1e-9) pts.push({ q, p });
  };
  add(k, 0); // P = 0
  add(k + m * f.pMax, f.pMax); // P = pMax
  add(0, -k / m); // Q = 0
  add(f.qMax, (f.qMax - k) / m); // Q = qMax
  const uniq = pts.filter((a, i) => pts.findIndex((b) => Math.abs(b.q - a.q) < 1e-6 && Math.abs(b.p - a.p) < 1e-6) === i);
  if (uniq.length < 2) return null;
  uniq.sort((a, b) => a.q - b.q);
  const A = uniq[0];
  const B = uniq[uniq.length - 1];
  return [f.x(A.q), f.y(A.p), f.x(B.q), f.y(B.p)];
}

export interface EqGraphProps {
  a: number;
  b: number;
  c: number;
  d: number;
  a2?: number;
  t?: number;
  qMax?: number;
  pMax?: number;
  showEq?: boolean;
  showGuides?: boolean;
  priceLine?: number;
  highlight?: 'demand' | 'supply' | 'both' | 'point' | 'none';
  label?: string;
  unitQ?: string;
  unitP?: string;
  user?: { curve: string; points: { x: number; y: number }[] }[];
  onPlace?: (q: number, p: number) => void;
  hideCurves?: boolean;
}

export function axisFor(a: number, b: number, c: number, d: number, extra = 1) {
  const P = (a - c) / (b + d);
  const Q = a - b * P;
  const qMax = Math.ceil(Math.max(a, Q * 1.6, 10) * extra / 10) * 10;
  const pMax = Math.ceil(Math.max(a / b, P * 1.6, 5) * extra / 5) * 5;
  return { qMax, pMax, P, Q };
}

export function EquilibriumGraph(p: EqGraphProps) {
  const ax = axisFor(Math.max(p.a, p.a2 ?? 0), p.b, p.c, p.d);
  const f = frame(p.qMax ?? ax.qMax, p.pMax ?? ax.pMax);
  const P = (p.a - p.c) / (p.b + p.d);
  const Q = p.a - p.b * P;
  const svg = useRef<SVGSVGElement>(null);
  const dem = segQ(f, p.a, -p.b);
  const sup = segQ(f, p.c, p.d);
  const dem2 = p.a2 !== undefined ? segQ(f, p.a2, -p.b) : null;
  const supT = p.t ? segQ(f, p.c - p.d * p.t, p.d) : null;
  const P2 = p.a2 !== undefined ? (p.a2 - p.c) / (p.b + p.d) : undefined;
  const Q2 = P2 !== undefined ? p.c + p.d * P2 : undefined;
  const Pk = p.t ? (p.a - p.c + p.d * p.t) / (p.b + p.d) : undefined;
  const Qt = Pk !== undefined ? p.a - p.b * Pk : undefined;
  const dim = (k: string) => (p.highlight && p.highlight !== 'both' && p.highlight !== 'none' && p.highlight !== k ? 0.35 : 1);
  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!p.onPlace || !svg.current) return;
    const r = svg.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    const v = f.inv(px, py);
    if (v.q < 0 || v.p < 0 || v.q > f.qMax || v.p > f.pMax) return;
    p.onPlace(Math.round(v.q * 2) / 2, Math.round(v.p * 4) / 4);
  };
  return (
    <svg ref={svg} className="graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={p.label ?? `Diagram med etterspørsel og tilbud. Likevekt ved P = ${fmt(P)} og Q = ${fmt(Q)}.`} onPointerDown={onDown} style={p.onPlace ? { cursor: 'crosshair' } : undefined}>
      <Axes f={f} xLabel={`Q${p.unitQ ? ` (${p.unitQ})` : ''}`} yLabel={`P${p.unitP ? ` (${p.unitP})` : ''}`} />
      {!p.hideCurves && dem ? <line className="demand" x1={dem[0]} y1={dem[1]} x2={dem[2]} y2={dem[3]} style={{ opacity: dim('demand') }} /> : null}
      {!p.hideCurves && sup ? <line className="supply" x1={sup[0]} y1={sup[1]} x2={sup[2]} y2={sup[3]} style={{ opacity: dim('supply') }} /> : null}
      {dem2 ? <line className="demand2" x1={dem2[0]} y1={dem2[1]} x2={dem2[2]} y2={dem2[3]} /> : null}
      {supT ? <line className="supply2" x1={supT[0]} y1={supT[1]} x2={supT[2]} y2={supT[3]} /> : null}
      {!p.hideCurves && dem ? (
        <text x={dem[0] + 8} y={dem[1] + 14} style={{ fill: 'var(--accent)', fontWeight: 700 }}>
          Etterspørsel
        </text>
      ) : null}
      {!p.hideCurves && sup ? (
        <text x={sup[2] - 6} y={sup[3] + 16} textAnchor="end" style={{ fill: 'var(--teal)', fontWeight: 700 }}>
          Tilbud
        </text>
      ) : null}
      {p.priceLine !== undefined && p.priceLine <= f.pMax ? (
        <g>
          <line className="guide" x1={f.x(0)} x2={f.x(f.qMax)} y1={f.y(p.priceLine)} y2={f.y(p.priceLine)} />
          <text x={f.x(f.qMax) - 4} y={f.y(p.priceLine) - 6} textAnchor="end">
            P = {fmt(p.priceLine)}
          </text>
        </g>
      ) : null}
      {p.showEq !== false && !p.hideCurves && P > 0 && Q > 0 ? (
        <g style={{ opacity: p.highlight === 'point' || !p.highlight || p.highlight === 'both' ? 1 : 0.6 }}>
          {p.showGuides !== false ? (
            <>
              <line className="guide" x1={f.x(0)} x2={f.x(Q)} y1={f.y(P)} y2={f.y(P)} />
              <line className="guide" x1={f.x(Q)} x2={f.x(Q)} y1={f.y(0)} y2={f.y(P)} />
            </>
          ) : null}
          <circle className="eq" cx={f.x(Q)} cy={f.y(P)} r={p.highlight === 'point' ? 8 : 6} />
          <text x={f.x(Q) + 10} y={f.y(P) - 10} style={{ fontWeight: 700 }}>
            ({fmt(Q)}, {fmt(P)})
          </text>
        </g>
      ) : null}
      {P2 !== undefined && Q2 !== undefined ? <circle className="eq" cx={f.x(Q2)} cy={f.y(P2)} r={6} /> : null}
      {Pk !== undefined && Qt !== undefined ? (
        <g>
          <circle className="eq" cx={f.x(Qt)} cy={f.y(Pk)} r={6} />
          <line className="guide" x1={f.x(0)} x2={f.x(Qt)} y1={f.y(Pk)} y2={f.y(Pk)} />
          <line className="guide" x1={f.x(0)} x2={f.x(Qt)} y1={f.y(Pk - (p.t ?? 0))} y2={f.y(Pk - (p.t ?? 0))} />
          <text x={f.x(0) + 6} y={f.y(Pk) - 6}>
            Pk = {fmt(Pk)}
          </text>
          <text x={f.x(0) + 6} y={f.y(Pk - (p.t ?? 0)) + 14}>
            Pp = {fmt(Pk - (p.t ?? 0))}
          </text>
        </g>
      ) : null}
      {p.user?.map((u) => (
        <g key={u.curve}>
          {u.points.length === 2 ? <line className="userline" x1={f.x(u.points[0].x)} y1={f.y(u.points[0].y)} x2={f.x(u.points[1].x)} y2={f.y(u.points[1].y)} /> : null}
          {u.points.map((pt, i) => (
            <circle key={i} className="user" cx={f.x(pt.x)} cy={f.y(pt.y)} r={u.curve === 'likevekt' ? 8 : 6} />
          ))}
        </g>
      ))}
    </svg>
  );
}

export function CostGraph({ F, c, mode, q, price }: { F: number; c: number; mode: 'enhet' | 'total'; q?: number; price?: number }) {
  const qMax = Math.max(50, Math.ceil(((q ?? 50) * 2.2) / 10) * 10);
  if (mode === 'total') {
    const tcMax = F + c * qMax;
    const trMax = price ? price * qMax : 0;
    const f = frame(qMax, Math.ceil(Math.max(tcMax, trMax) / 100) * 100 || 100);
    const be = price && price > c ? F / (price - c) : undefined;
    return (
      <svg className="graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Totalkostnad TC = ${F} + ${c}Q.`}>
        <Axes f={f} xLabel="Q" yLabel="kr" />
        <line className="demand" x1={f.x(0)} y1={f.y(F)} x2={f.x(qMax)} y2={f.y(F + c * qMax)} />
        <line className="guide" x1={f.x(0)} y1={f.y(F)} x2={f.x(qMax)} y2={f.y(F)} />
        <text x={f.x(qMax) - 4} y={f.y(F) - 6} textAnchor="end">
          Faste kostnader {fmt(F)}
        </text>
        <text x={f.x(qMax) - 4} y={f.y(F + c * qMax) + 16} textAnchor="end" style={{ fill: 'var(--accent)', fontWeight: 700 }}>
          TC
        </text>
        {price ? <line className="supply" x1={f.x(0)} y1={f.y(0)} x2={f.x(qMax)} y2={f.y(price * qMax)} /> : null}
        {price ? (
          <text x={f.x(qMax * 0.72)} y={f.y(price * qMax * 0.72) - 8} style={{ fill: 'var(--teal)', fontWeight: 700 }}>
            Inntekt
          </text>
        ) : null}
        {be && be < qMax ? <circle className="eq" cx={f.x(be)} cy={f.y(price! * be)} r={6} /> : null}
      </svg>
    );
  }
  const acAt = (Q: number) => F / Q + c;
  const qMin = Math.max(1, qMax / 40);
  const pMax = Math.ceil(Math.min(acAt(qMin), c * 6 + 20) / 5) * 5;
  const f = frame(qMax, pMax);
  const pts: string[] = [];
  for (let Q = qMin; Q <= qMax; Q += qMax / 120) {
    const v = acAt(Q);
    if (v <= pMax) pts.push(`${f.x(Q).toFixed(1)},${f.y(v).toFixed(1)}`);
  }
  return (
    <svg className="graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gjennomsnittskostnad AC = ${F}/Q + ${c} og grensekostnad MC = ${c}.`}>
      <Axes f={f} xLabel="Q" yLabel="kr per enhet" />
      <polyline className="demand" points={pts.join(' ')} />
      <line className="supply" x1={f.x(0)} y1={f.y(c)} x2={f.x(qMax)} y2={f.y(c)} />
      <text x={f.x(qMax) - 4} y={f.y(c) - 8} textAnchor="end" style={{ fill: 'var(--teal)', fontWeight: 700 }}>
        MC = {fmt(c)}
      </text>
      <text x={f.x(qMax * 0.2)} y={f.y(Math.min(pMax * 0.9, acAt(qMax * 0.2))) - 8} style={{ fill: 'var(--accent)', fontWeight: 700 }}>
        AC
      </text>
      {q ? (
        <g>
          <line className="guide" x1={f.x(q)} x2={f.x(q)} y1={f.y(0)} y2={f.y(acAt(q))} />
          <circle className="eq" cx={f.x(q)} cy={f.y(acAt(q))} r={6} />
          <text x={f.x(q) + 8} y={f.y(acAt(q)) - 8}>
            AC({fmt(q)}) = {fmt(acAt(q))}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

export function PercentBars({ v0, v1, label0 = 'Før', label1 = 'Etter' }: { v0: number; v1: number; label0?: string; label1?: string }) {
  const max = Math.max(v0, v1) * 1.15 || 1;
  const bw = 90;
  const base = H - MB;
  const h = (v: number) => (v / max) * (H - MB - MT - 20);
  const pct = ((v1 - v0) / v0) * 100;
  return (
    <svg className="graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Fra ${v0} til ${v1}: endring ${fmt(pct)} prosent av startverdien.`}>
      <line className="axis" x1={40} x2={W - 20} y1={base} y2={base} />
      <rect x={110} y={base - h(v0)} width={bw} height={h(v0)} rx={8} style={{ fill: 'var(--accent-soft)', stroke: 'var(--accent)', strokeWidth: 2 }} />
      <rect x={290} y={base - h(v1)} width={bw} height={h(v1)} rx={8} style={{ fill: 'var(--teal-soft)', stroke: 'var(--teal)', strokeWidth: 2 }} />
      <line className="guide" x1={110} x2={290 + bw} y1={base - h(v0)} y2={base - h(v0)} />
      <text x={110 + bw / 2} y={base + 18} textAnchor="middle">
        {label0}: {fmt(v0)}
      </text>
      <text x={290 + bw / 2} y={base + 18} textAnchor="middle">
        {label1}: {fmt(v1)}
      </text>
      <text x={290 + bw + 10} y={base - (h(v0) + h(v1)) / 2} style={{ fontWeight: 700 }}>
        {v1 >= v0 ? '+' : '−'}
        {fmt(Math.abs(v1 - v0))}
      </text>
      <text x={W / 2} y={MT + 12} textAnchor="middle" style={{ fontWeight: 700 }}>
        {fmt(Math.abs(v1 - v0))} av grunnlaget {fmt(v0)} = {fmt(Math.abs(pct))} %
      </text>
    </svg>
  );
}
