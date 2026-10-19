// Tegner modellene i organisasjonsfaget som figurer: matriser, pyramider,
// sirkler, trinn, trekanter og grupper. Hver del er en knapp; trykk for å se
// forklaringen og et eksempel fra arbeidslivet. I øvemodus er navnene skjult
// til du trykker, så du kan teste om du husker delene.

import { useState, type ReactNode, type CSSProperties } from 'react';
import type { OrgModel, OrgModelPart } from '../../families/org/types';

export interface ModelViewProps {
  model: OrgModel;
  /** Øvemodus: navnene er skjult til delen er avslørt. */
  quiz?: boolean;
  revealed?: Set<string>;
  onReveal?: (id: string) => void;
  /** Vis forklaringen til valgt del under figuren (standard: ja). */
  detail?: boolean;
}

interface Ctx {
  sel?: string;
  pick: (id: string) => void;
  quiz: boolean;
  revealed: Set<string>;
  order: Map<string, number>;
}

function Part({ p, ctx, className = '' }: { p: OrgModelPart; ctx: Ctx; className?: string }) {
  const hidden = ctx.quiz && !ctx.revealed.has(p.id);
  const n = (ctx.order.get(p.id) ?? 0) + 1;
  return (
    <button
      type="button"
      className={`om-part ${className}${ctx.sel === p.id ? ' sel' : ''}${hidden ? ' hidden' : ''}`}
      aria-pressed={ctx.sel === p.id}
      aria-label={hidden ? `Del ${n}, skjult. Trykk for å vise.` : p.label}
      onClick={() => ctx.pick(p.id)}
    >
      {hidden ? (
        <span className="om-q">
          <b>{n}</b> ?
        </span>
      ) : (
        <span className="om-label">{p.label}</span>
      )}
    </button>
  );
}

const byGroup = (m: OrgModel, g: string) => m.parts.filter((p) => p.group === g);

function Matrix({ m, ctx }: { m: OrgModel; ctx: Ctx }) {
  const a = m.axes!;
  const cell = (q: string) => {
    const p = m.parts.find((x) => x.group === q);
    return p ? <Part key={q} p={p} ctx={ctx} className={`om-cell q-${q}`} /> : <span key={q} />;
  };
  return (
    <div className="om-matrix">
      <div className="om-yaxis" aria-hidden="true">
        <span>{a.yHigh}</span>
        <b>{a.y}</b>
        <span>{a.yLow}</span>
      </div>
      <div className="om-grid">{['tl', 'tr', 'bl', 'br'].map(cell)}</div>
      <span />
      <div className="om-xaxis" aria-hidden="true">
        <span>{a.xLow}</span>
        <b>{a.x}</b>
        <span>{a.xHigh}</span>
      </div>
    </div>
  );
}

function Levels({ m, ctx }: { m: OrgModel; ctx: Ctx }) {
  const n = m.parts.length;
  if (m.shape === 'trapp')
    return (
      <div className="om-stairs">
        {m.parts.map((p, i) => (
          <div key={p.id} className="om-stair" style={{ height: `${46 + (54 * (i + 1)) / n}%` }}>
            <span className="om-stair-n">{i + 1}</span>
            <Part p={p} ctx={ctx} />
          </div>
        ))}
      </div>
    );
  if (m.shape === 'isfjell')
    return (
      <div className="om-iceberg">
        {m.parts.map((p, i) => (
          <div key={p.id} className={`om-ice${i === 0 ? ' top' : ' under'}`}>
            {i === 1 ? (
              <div className="om-water" aria-hidden="true">
                <span>↑ synlig</span>
                <span>usynlig ↓</span>
              </div>
            ) : null}
            <div className="om-ice-body" style={{ width: `${46 + (54 * (i + 1)) / n}%` }}>
              <Part p={p} ctx={ctx} />
            </div>
          </div>
        ))}
      </div>
    );
  return (
    <div className="om-pyramid">
      {m.parts.map((p, i) => (
        <div key={p.id} className="om-tier" style={{ width: `${34 + (66 * (i + 1)) / n}%` }}>
          <Part p={p} ctx={ctx} />
        </div>
      ))}
    </div>
  );
}

function Tree({ m, ctx }: { m: OrgModel; ctx: Ctx }) {
  const ids = new Set(m.parts.map((p) => p.id));
  const roots = m.parts.filter((p) => !p.group || !ids.has(p.group));
  const node = (p: OrgModelPart): ReactNode => {
    const kids = m.parts.filter((c) => c.group === p.id);
    return (
      <li key={p.id}>
        <Part p={p} ctx={ctx} />
        {kids.length ? <ul>{kids.map(node)}</ul> : null}
      </li>
    );
  };
  return (
    <div className="om-tree">
      <ul>{roots.map(node)}</ul>
    </div>
  );
}

function Steps({ m, ctx }: { m: OrgModel; ctx: Ctx }) {
  return (
    <ol className={`om-steps${m.parts.length <= 5 ? ' row' : ''}`}>
      {m.parts.map((p, i) => (
        <li key={p.id}>
          <span className="om-step-n" aria-hidden="true">
            {i + 1}
          </span>
          <Part p={p} ctx={ctx} />
        </li>
      ))}
    </ol>
  );
}

/**
 * Plassering av en etikett rundt en figur. Etiketter nær kanten forankres til kanten
 * (i stedet for å sentreres på punktet), så de aldri stikker utenfor på smal skjerm.
 */
function edgePos(x: number, y: number): CSSProperties {
  if (x >= 70) return { right: 0, top: `${y}%`, transform: 'translateY(-50%)' };
  if (x <= 30) return { left: 0, top: `${y}%`, transform: 'translateY(-50%)' };
  return { left: `${x}%`, top: `${y}%` };
}

function Cycle({ m, ctx }: { m: OrgModel; ctx: Ctx }) {
  const n = m.parts.length;
  return (
    <div className="om-cycle">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <marker id={`om-arr-${m.id}`} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
          </marker>
        </defs>
        {m.parts.map((_, i) => {
          const a0 = ((i + 0.22) / n) * 2 * Math.PI - Math.PI / 2;
          const a1 = ((i + 0.78) / n) * 2 * Math.PI - Math.PI / 2;
          const r = 72;
          const x0 = 100 + r * Math.cos(a0);
          const y0 = 100 + r * Math.sin(a0);
          const x1 = 100 + r * Math.cos(a1);
          const y1 = 100 + r * Math.sin(a1);
          return <path key={i} d={`M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}`} fill="none" stroke="currentColor" strokeWidth="2.5" markerEnd={`url(#om-arr-${m.id})`} />;
        })}
      </svg>
      {m.parts.map((p, i) => {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        return (
          <div key={p.id} className="om-cycle-pos" style={edgePos(50 + 40 * Math.cos(a), 50 + 40 * Math.sin(a))}>
            <Part p={p} ctx={ctx} />
          </div>
        );
      })}
    </div>
  );
}

function Triangle({ m, ctx }: { m: OrgModel; ctx: Ctx }) {
  const outer = m.parts.filter((p) => p.group !== 'senter').slice(0, 3);
  const center = m.parts.find((p) => p.group === 'senter');
  const pos = [edgePos(50, 8), edgePos(84, 86), edgePos(16, 86)];
  return (
    <div className="om-triangle">
      <svg viewBox="0 0 200 170" aria-hidden="true" preserveAspectRatio="none">
        <polygon points="100,18 182,150 18,150" fill="var(--accent-soft)" stroke="currentColor" strokeWidth="2" />
      </svg>
      {outer.map((p, i) => (
        <div key={p.id} className="om-abs" style={pos[i]}>
          <Part p={p} ctx={ctx} />
        </div>
      ))}
      {center ? (
        <div className="om-abs center" style={{ left: '50%', top: '62%' }}>
          <Part p={center} ctx={ctx} className="core" />
        </div>
      ) : null}
    </div>
  );
}

function Venn({ m, ctx }: { m: OrgModel; ctx: Ctx }) {
  const outer = m.parts.filter((p) => p.group !== 'senter').slice(0, 3);
  const center = m.parts.find((p) => p.group === 'senter');
  const circles = [
    { cx: 100, cy: 72 },
    { cx: 136, cy: 132 },
    { cx: 64, cy: 132 },
  ];
  const pos = [edgePos(50, 17), edgePos(78, 84), edgePos(22, 84)];
  return (
    <div className="om-venn">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        {circles.map((c, i) => (
          <circle key={i} cx={c.cx} cy={c.cy} r="56" className={`om-vc c${i}`} />
        ))}
      </svg>
      {outer.map((p, i) => (
        <div key={p.id} className="om-abs" style={pos[i]}>
          <Part p={p} ctx={ctx} />
        </div>
      ))}
      {center ? (
        <div className="om-abs center" style={{ left: '50%', top: '57%' }}>
          <Part p={center} ctx={ctx} className="core" />
        </div>
      ) : null}
    </div>
  );
}

function Tracks({ m, ctx }: { m: OrgModel; ctx: Ctx }) {
  const label = (id: string) => m.parts.find((p) => p.id === id)?.label ?? id;
  return (
    <div className="om-tracks">
      {(m.groups ?? []).map((g, gi) => (
        <div key={g.id} className={`om-track t${gi}`}>
          <span className="om-track-name">{g.label}</span>
          <div className="om-chain">
            {byGroup(m, g.id).map((p, i) => (
              <span key={p.id} className="om-chain-item">
                {i > 0 ? (
                  <span className="om-arrow" aria-hidden="true">
                    →
                  </span>
                ) : null}
                <Part p={p} ctx={ctx} />
              </span>
            ))}
          </div>
        </div>
      ))}
      {m.arrows?.length && !ctx.quiz ? (
        <ul className="om-links">
          {m.arrows.map(([a, b, t], i) => (
            <li key={i} className="xs">
              {label(a)} {t ? <em>{t}</em> : '→'} {label(b)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Columns({ m, ctx }: { m: OrgModel; ctx: Ctx }) {
  const gs = m.groups ?? [];
  return (
    <div className="om-columns" style={{ gridTemplateColumns: `repeat(${gs.length}, minmax(0, 1fr))` }}>
      {gs.map((g, gi) => (
        <div key={g.id} className={`om-col t${gi}`}>
          <span className="om-col-head">{g.label}</span>
          {byGroup(m, g.id).map((p) => (
            <Part key={p.id} p={p} ctx={ctx} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Groups({ m, ctx }: { m: OrgModel; ctx: Ctx }) {
  const gs = m.groups?.length ? m.groups : [{ id: '', label: m.name }];
  return (
    <div className="om-groups">
      {gs.map((g, gi) => (
        <div key={g.id} className={`om-group t${gi % 4}`}>
          {gs.length > 1 ? <span className="om-col-head">{g.label}</span> : null}
          <div className="om-chips">
            {m.parts
              .filter((p) => (gs.length > 1 ? p.group === g.id : true))
              .map((p) => (
                <Part key={p.id} p={p} ctx={ctx} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Scale({ m, ctx }: { m: OrgModel; ctx: Ctx }) {
  return (
    <div className="om-scale">
      <div className="om-scale-items">
        {m.parts.map((p) => (
          <Part key={p.id} p={p} ctx={ctx} />
        ))}
      </div>
      <div className="om-scale-bar" aria-hidden="true" />
      <div className="om-scale-ends" aria-hidden="true">
        <span>{m.axes?.xLow ?? 'Lav'}</span>
        <span>{m.axes?.xHigh ?? 'Høy'}</span>
      </div>
    </div>
  );
}

function Chain({ m, ctx }: { m: OrgModel; ctx: Ctx }) {
  const gs = m.groups ?? [];
  return (
    <div className="om-flow">
      {gs.map((g, gi) => (
        <div key={g.id} className="om-flow-step">
          {gi > 0 ? (
            <span className="om-flow-arrow" aria-hidden="true">
              →
            </span>
          ) : null}
          <div className={`om-col t${gi % 4}`}>
            <span className="om-col-head">{g.label}</span>
            {byGroup(m, g.id).map((p) => (
              <Part key={p.id} p={p} ctx={ctx} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function OrgModelView({ model: m, quiz = false, revealed, onReveal, detail = true }: ModelViewProps) {
  const [sel, setSel] = useState<string | undefined>();
  const [own, setOwn] = useState<Set<string>>(new Set());
  const rev = revealed ?? own;
  const order = new Map(m.parts.map((p, i) => [p.id, i]));
  const ctx: Ctx = {
    sel,
    quiz,
    revealed: rev,
    order,
    pick: (id) => {
      setSel((s) => (s === id && !quiz ? undefined : id));
      if (quiz && !rev.has(id)) {
        if (onReveal) onReveal(id);
        else setOwn(new Set([...rev, id]));
      }
    },
  };
  const body =
    m.kind === 'matrise' && m.axes ? (
      <Matrix m={m} ctx={ctx} />
    ) : m.kind === 'nivaer' ? (
      <Levels m={m} ctx={ctx} />
    ) : m.kind === 'hierarki' ? (
      <Tree m={m} ctx={ctx} />
    ) : m.kind === 'steg' ? (
      <Steps m={m} ctx={ctx} />
    ) : m.kind === 'syklus' ? (
      <Cycle m={m} ctx={ctx} />
    ) : m.kind === 'trekant' ? (
      <Triangle m={m} ctx={ctx} />
    ) : m.kind === 'venn' ? (
      <Venn m={m} ctx={ctx} />
    ) : m.kind === 'tospor' ? (
      <Tracks m={m} ctx={ctx} />
    ) : m.kind === 'kolonner' ? (
      <Columns m={m} ctx={ctx} />
    ) : m.kind === 'skala' ? (
      <Scale m={m} ctx={ctx} />
    ) : m.kind === 'kjede' ? (
      <Chain m={m} ctx={ctx} />
    ) : (
      <Groups m={m} ctx={ctx} />
    );
  const part = sel ? m.parts.find((p) => p.id === sel) : undefined;
  return (
    <figure className={`om om-k-${m.kind}`} aria-label={`Modell: ${m.name}`}>
      {body}
      {detail ? (
        <figcaption className="om-detail" aria-live="polite">
          {part ? (
            <>
              <strong>{part.label}</strong>
              <span>{part.text}</span>
              {part.example ? (
                <span className="om-example">
                  <b>På jobben:</b> {part.example}
                </span>
              ) : null}
            </>
          ) : (
            <span className="muted small">{quiz ? 'Hva heter delene? Tenk først, så trykk for å se svaret.' : 'Trykk på en del av modellen for å se hva den betyr, med et eksempel fra arbeidslivet.'}</span>
          )}
        </figcaption>
      ) : null}
    </figure>
  );
}
