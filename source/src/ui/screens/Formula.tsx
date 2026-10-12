// Forstå formelen: symboler, type sammenheng, forutsetninger, utledning og en
// interaktiv figur der graf og tall kommer fra samme beregning.

import { useMemo, useState } from 'react';
import { store, useStore } from '../../state/store';
import { FAMILIES, allFormulas, familiesFor } from '../../families';
import type { FormulaDef } from '../../families/common';
import { Rat } from '../../math/rational';
import { Tex } from '../components/Math';
import { EquilibriumGraph, CostGraph, PercentBars } from '../components/Graphs';
import { Icon } from '../components/Icon';
import { Notice, Pill, Tabs } from '../components/common';
import { generateOne } from '../../generator/generate';
import { startAttempt } from '../../learning/actions';
import { SpeakButton } from '../components/Voice';

const KIND_TEXT: Record<FormulaDef['kind'], string> = {
  definisjon: 'Definisjon',
  identitet: 'Identitet',
  modellantakelse: 'Modellantakelse',
  tilnærming: 'Tilnærming',
  'avledet sammenheng': 'Avledet sammenheng',
};

export function Formula() {
  const route = useStore((s) => s.ui.route);
  const all = allFormulas();
  const present = new Set(useStore((st) => st.currentSubtasks().map((x) => x.analysis.familyKbId)));
  const fams = [...familiesFor(present)].filter((f) => f.formulas.length).sort((a, b) => Number(present.has(b.id)) - Number(present.has(a.id)));
  const [sel, setSel] = useState<string>((route.name === 'formel' && route.formulaId) || fams[0]?.formulas[0]?.id || 'f-lik');
  const cur = all.find((x) => x.formula.id === sel) ?? all[0];
  return (
    <div className="page">
      <div className="page-head">
        <div className="stack sm">
          <span className="eyebrow">Forstå formelen</span>
          <h1>Hvor kommer den fra, og når gjelder den?</h1>
          <p className="muted">Ikke alle formler er like. Noen er definisjoner, noen er antakelser i modellen, og noen følger av andre. Det avgjør hvordan du bruker dem.</p>
        </div>
      </div>
      <div className="formula-layout">
        <nav className="card tight stack sm formula-nav" aria-label="Formler">
          {fams.map((f) => (
            <div key={f.id} className="stack sm">
              <span className="eyebrow">
                {f.shortName}
                {present.has(f.id) ? ' · i settene dine' : ''}
              </span>
              {f.formulas.map((x) => (
                <button key={x.id} className="nav-item" aria-current={x.id === sel ? 'page' : undefined} onClick={() => setSel(x.id)} style={{ minHeight: 40 }}>
                  <span className="small">{x.name}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <FormulaDetail key={cur.formula.id} f={cur.formula} familyId={cur.family.id} />
      </div>
    </div>
  );
}

function FormulaDetail({ f, familyId }: { f: FormulaDef; familyId: string }) {
  const [tab, setTab] = useState<'figur' | 'symboler' | 'utledning'>('figur');
  return (
    <article className="stack">
      <div className="card stack">
        <div className="row between">
          <h2>{f.name}</h2>
          <Pill tone="accent">{KIND_TEXT[f.kind]}</Pill>
        </div>
        <div style={{ fontSize: '1.5rem', padding: '8px 0' }}>
          <Tex tex={f.tex} display />
        </div>
        <p className="small">
          <strong>{KIND_TEXT[f.kind]}:</strong> {f.kindWhy}
        </p>
        <SpeakButton text={`${f.name}. ${KIND_TEXT[f.kind]}. ${f.kindWhy}`} label="Les forklaringen" />
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        label="Deler"
        items={[
          { id: 'figur', label: 'Utforsk' },
          { id: 'symboler', label: 'Symboler og forutsetninger' },
          { id: 'utledning', label: 'Utledning' },
        ]}
      />
      {tab === 'figur' ? <Explorer figure={f.figure} calc={f.calc} familyId={familyId} /> : null}
      {tab === 'symboler' ? (
        <div className="card stack">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Betydning</th>
                  <th>Enhet</th>
                </tr>
              </thead>
              <tbody>
                {f.symbols.map((s) => (
                  <tr key={s.sym}>
                    <td>
                      <Tex tex={s.sym} />
                    </td>
                    <td>{s.meaning}</td>
                    <td className="muted">{s.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid-2">
            <div className="stack sm">
              <strong className="small">Når gjelder den?</strong>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {f.conditions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
            <div className="stack sm">
              <strong className="small">Hva skjer når noe endres?</strong>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {f.whatIf.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
      {tab === 'utledning' ? (
        <div className="card stack">
          {f.derivation ? (
            <ol className="stack" style={{ margin: 0, paddingLeft: 20 }}>
              {f.derivation.map((d, i) => (
                <li key={i} className="stack sm">
                  <Tex tex={d.tex} />
                  <span className="small">
                    {d.text} {d.kind ? <Pill tone="outline">{d.kind}</Pill> : null}
                  </span>
                  {d.why ? <span className="xs muted">{d.why}</span> : null}
                </li>
              ))}
            </ol>
          ) : (
            <Notice>
              <span className="small">
                {f.kind === 'definisjon' ? 'Dette er en definisjon. Den utledes ikke; den bestemmer hva begrepet betyr.' : f.kind === 'modellantakelse' ? 'Dette er en antakelse vi velger for å lage en enkel modell. Den kan ikke utledes, men den kan diskuteres: passer den virkeligheten godt nok?' : 'Denne sammenhengen følger direkte av definisjonene.'}
              </span>
            </Notice>
          )}
        </div>
      ) : null}
    </article>
  );
}

function Slider({ id, label, value, min, max, step, onChange }: { id: string; label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="slider">
      <label htmlFor={id} className="small">
        {label}
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <output htmlFor={id} className="mono tnum">
        {String(value).replace('.', ',')}
      </output>
    </div>
  );
}

export function Explorer({ figure, calc, familyId }: { figure?: FormulaDef['figure']; calc?: FormulaDef['calc']; familyId: string }) {
  void familyId;
  if (figure === 'likevekt' || figure === 'avgift') return <EqExplorer tax={figure === 'avgift'} />;
  if (figure === 'kostnad') return <CostExplorer />;
  if (figure === 'prosent') return <PctExplorer />;
  if (figure === 'wsps') return <WsPsExplorer />;
  if (calc) return <CalcExplorer calc={calc} />;
  return <p className="small muted">Denne sammenhengen har ingen utforsker ennå. Se symbolene og forutsetningene.</p>;
}

function CalcExplorer({ calc }: { calc: NonNullable<FormulaDef['calc']> }) {
  const [v, setV] = useState<Record<string, number>>(() => Object.fromEntries(calc.inputs.map((i) => [i.sym, i.value])));
  const out = calc.compute(v);
  return (
    <div className="card stack">
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          {calc.inputs.map((i) => (
            <Slider key={i.sym} id={`c-${i.sym}`} label={i.label} value={v[i.sym]} min={i.min} max={i.max} step={i.step} onChange={(x) => setV({ ...v, [i.sym]: x })} />
          ))}
        </div>
        <div className="card flat stack sm">
          {out.map((o) => (
            <div key={o.label} className="row between">
              <span className="small">{o.label}</span>
              <strong className="tnum">{o.value}</strong>
            </div>
          ))}
        </div>
      </div>
      <p className="small muted">Tallene regnes med samme formel som i oppgavene. Endre én ting om gangen og se hva som skjer.</p>
    </div>
  );
}

/** WS–PS: lønnssettingskurven W = z + b/(L − N) og prissettingslinjen W = λ(1 − μ). */
function WsPsExplorer() {
  const L = 100;
  const bConst = 400;
  const [lam, setLam] = useState(100);
  const [mu, setMu] = useState(0.3);
  const [z, setZ] = useState(20);
  const ps = lam * (1 - mu);
  const valid = ps > z + bConst / L;
  const N = valid ? L - bConst / (ps - z) : 0;
  const u = valid ? ((L - N) / L) * 100 : 100;
  const W = 480;
  const H = 300;
  const pad = 40;
  const wMax = 140;
  const xOf = (n: number) => pad + (n / L) * (W - 2 * pad);
  const yOf = (w: number) => H - pad - (w / wMax) * (H - 2 * pad);
  const pts: string[] = [];
  for (let n = 0; n <= L - 3; n += 1) {
    const w = z + bConst / (L - n);
    if (w > wMax) break;
    pts.push(`${xOf(n).toFixed(1)},${yOf(w).toFixed(1)}`);
  }
  return (
    <div className="card stack">
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`WS–PS-figur. Reallønn i likevekt ${ps.toFixed(0)}, ledighet ${u.toFixed(1)} prosent.`} style={{ width: '100%', height: 'auto' }}>
          <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--ink-3)" />
          <line x1={pad} y1={pad / 2} x2={pad} y2={H - pad} stroke="var(--ink-3)" />
          <line x1={xOf(L)} y1={pad / 2} x2={xOf(L)} y2={H - pad} stroke="var(--ink-3)" strokeDasharray="4 4" />
          <text x={xOf(L) - 4} y={pad / 2 + 10} textAnchor="end" fontSize="11" fill="var(--ink-3)">Arbeidsstyrken</text>
          <text x={W - pad} y={H - pad + 26} textAnchor="end" fontSize="12" fill="var(--ink-2)">Sysselsetting</text>
          <text x={pad + 4} y={pad / 2 + 4} fontSize="12" fill="var(--ink-2)">Reallønn</text>
          <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
          <line x1={pad} y1={yOf(ps)} x2={W - pad} y2={yOf(ps)} stroke="var(--teal)" strokeWidth="2.5" />
          <text x={W - pad - 4} y={yOf(ps) - 6} textAnchor="end" fontSize="12" fill="var(--teal)">PS</text>
          {pts.length ? <text x={Number(pts[pts.length - 1].split(',')[0]) - 6} y={Number(pts[pts.length - 1].split(',')[1]) + 4} textAnchor="end" fontSize="12" fill="var(--accent)">WS</text> : null}
          {valid ? (
            <>
              <line x1={xOf(N)} y1={yOf(ps)} x2={xOf(N)} y2={H - pad} stroke="var(--ink-3)" strokeDasharray="3 3" />
              <circle cx={xOf(N)} cy={yOf(ps)} r="5" fill="var(--ink)" />
              <text x={xOf(N) + 6} y={yOf(ps) + 16} fontSize="12" fill="var(--ink)">Likevekt</text>
              <line x1={xOf(N)} y1={H - pad + 10} x2={xOf(L)} y2={H - pad + 10} stroke="var(--amber)" strokeWidth="3" />
              <text x={(xOf(N) + xOf(L)) / 2} y={H - pad + 24} textAnchor="middle" fontSize="11" fill="var(--amber)">ledige</text>
            </>
          ) : null}
        </svg>
        <div className="stack">
          <Slider id="w-lam" label="Produktivitet (produksjon per arbeider)" value={lam} min={60} max={160} step={5} onChange={setLam} />
          <Slider id="w-mu" label="Prispåslag (profittandel, μ)" value={mu} min={0.1} max={0.5} step={0.05} onChange={(x) => setMu(Math.round(x * 100) / 100)} />
          <Slider id="w-z" label="Trygd og lønnskrav (flytter WS)" value={z} min={0} max={60} step={5} onChange={setZ} />
          <div className="card flat stack sm">
            <div className="row between"><span className="small">Reallønn i likevekt (PS)</span><strong className="tnum">{ps.toFixed(0)}</strong></div>
            <div className="row between"><span className="small">Sysselsetting</span><strong className="tnum">{valid ? N.toFixed(1).replace('.', ',') : '–'} av {L}</strong></div>
            <div className="row between"><span className="small">Ledighet i likevekt</span><strong className="tnum">{valid ? `${u.toFixed(1).replace('.', ',')} %` : 'Ingen likevekt'}</strong></div>
          </div>
          {!valid ? <span className="small" style={{ color: 'var(--amber)' }}>PS ligger under WS for alle nivåer: ingen likevekt med sysselsetting.</span> : null}
        </div>
      </div>
      <p className="small">
        Prøv selv: øk trygden (WS opp) – ledigheten øker, reallønnen er den samme. Øk produktiviteten eller senk påslaget (PS opp) – reallønnen øker og ledigheten faller. Figuren og tallene regnes fra samme to kurver.
      </p>
    </div>
  );
}

function EqExplorer({ tax }: { tax: boolean }) {
  const [a, setA] = useState(120);
  const [b, setB] = useState(2);
  const [c, setC] = useState(20);
  const [d, setD] = useState(3);
  const [t, setT] = useState(tax ? 5 : 0);
  const exact = useMemo(() => {
    const A = Rat.of(a), B = Rat.fromNumber(b), C = Rat.of(c), D = Rat.fromNumber(d), T = Rat.fromNumber(t);
    const P = A.sub(C).div(B.add(D));
    const Q = A.sub(B.mul(P));
    const Pk = A.sub(C).add(D.mul(T)).div(B.add(D));
    return { P, Q, Pk, Pp: Pk.sub(T), Qt: A.sub(B.mul(Pk)) };
  }, [a, b, c, d, t]);
  const valid = exact.P.sign() > 0 && exact.Q.sign() > 0;
  const course = useStore((s) => s.course());
  return (
    <div className="card stack">
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <EquilibriumGraph a={a} b={b} c={c} d={d} t={tax && t ? t : undefined} qMax={Math.max(160, Math.ceil(a / 20) * 20)} pMax={Math.max(40, Math.ceil(a / b / 10) * 10)} />
        </div>
        <div className="stack">
          <Slider id="s-a" label="a (etterspørsel ved P = 0)" value={a} min={60} max={200} step={5} onChange={setA} />
          <Slider id="s-b" label="b (etterspørselens helning)" value={b} min={0.5} max={6} step={0.5} onChange={setB} />
          <Slider id="s-c" label="c (tilbud ved P = 0)" value={c} min={-40} max={60} step={5} onChange={setC} />
          <Slider id="s-d" label="d (tilbudets helning)" value={d} min={0.5} max={6} step={0.5} onChange={setD} />
          {tax ? <Slider id="s-t" label="t (avgift per enhet)" value={t} min={0} max={20} step={1} onChange={setT} /> : null}
          <div className="card flat stack sm">
            <Tex tex={`Q_d = ${a} - ${String(b).replace('.', '{,}')}P,\\quad Q_s = ${c < 0 ? '-' + -c : c} + ${String(d).replace('.', '{,}')}P`} />
            <Tex tex={`Q_d = Q_s \\Rightarrow P^* = \\frac{${a} - (${c})}{${String(b).replace('.', '{,}')} + ${String(d).replace('.', '{,}')}} = ${exact.P.toLatex()}`} />
            <Tex tex={`Q^* = ${exact.Q.toLatex()}`} />
            {tax && t ? <Tex tex={`P_k = ${exact.Pk.toLatex()},\\ P_p = ${exact.Pp.toLatex()},\\ Q = ${exact.Qt.toLatex()}`} /> : null}
            {!valid ? <span className="small" style={{ color: 'var(--amber)' }}>Med disse tallene blir pris eller kvantum null eller negativt. Da gir modellen ingen meningsfull likevekt.</span> : null}
          </div>
        </div>
      </div>
      <p className="small">
        Qd = Qs er likevektsbetingelsen <strong>i denne modellen</strong>: vi definerer likevekt som prisen der det kjøperne vil kjøpe, er lik det selgerne vil selge. Grafen og tallene over regnes fra de samme uttrykkene, så de endres sammen.
      </p>
      <div className="row">
        <button
          className="btn primary"
          onClick={() => {
            const f = FAMILIES.find((x) => x.id === (tax ? 'likevekt-avgift' : 'likevekt-lineaer'))!;
            const tpl = f.templates.find((x) => x.style === 'standard' && x.level === (tax ? 3 : 1))!;
            const g = generateOne(course!.id, f.id, tpl, Math.floor(Math.random() * 1e9), { demo: course?.demo });
            store.upsert(g);
            const at = startAttempt(g, 'læring');
            store.navigate({ name: 'tren', attemptId: at.id });
          }}
        >
          <Icon name="pencil" size={16} /> Løs en ny variant selv
        </button>
      </div>
    </div>
  );
}

function CostExplorer() {
  const [F, setF] = useState(500);
  const [c, setC] = useState(20);
  const [q, setQ] = useState(50);
  const [p, setP] = useState(35);
  const [mode, setMode] = useState<'enhet' | 'total'>('enhet');
  const AC = Rat.of(F).div(Rat.of(q)).add(Rat.of(c));
  const be = p > c ? Rat.of(F).div(Rat.of(p - c)) : null;
  return (
    <div className="card stack">
      <Tabs value={mode} onChange={setMode} label="Figur" items={[{ id: 'enhet', label: 'Per enhet (AC og MC)' }, { id: 'total', label: 'Totalt (TC og inntekt)' }]} />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <CostGraph F={F} c={c} mode={mode} q={q} price={mode === 'total' ? p : undefined} />
        <div className="stack">
          <Slider id="c-F" label="F (faste kostnader)" value={F} min={100} max={3000} step={100} onChange={setF} />
          <Slider id="c-c" label="c (kostnad per enhet)" value={c} min={5} max={60} step={1} onChange={setC} />
          <Slider id="c-q" label="Q (mengde)" value={q} min={5} max={200} step={5} onChange={setQ} />
          {mode === 'total' ? <Slider id="c-p" label="p (pris)" value={p} min={5} max={100} step={1} onChange={setP} /> : null}
          <div className="card flat stack sm">
            <Tex tex={`\\mathit{AC}(${q}) = \\frac{${F}}{${q}} + ${c} = ${AC.toLatex()}`} />
            <Tex tex={`\\mathit{MC} = ${c}`} />
            {mode === 'total' ? be ? <Tex tex={`Q_0 = \\frac{${F}}{${p} - ${c}} = ${be.toLatex()}`} /> : <span className="small" style={{ color: 'var(--amber)' }}>Prisen er ikke høyere enn c, så de faste kostnadene blir aldri dekket.</span> : null}
          </div>
          <p className="small muted">Øk F: AC flytter seg opp, men MC endres ikke. Øk Q: AC nærmer seg c fordi de faste kostnadene fordeles på flere enheter.</p>
        </div>
      </div>
    </div>
  );
}

function PctExplorer() {
  const [v0, setV0] = useState(80);
  const [v1, setV1] = useState(92);
  const e = Rat.of(v1 - v0).div(Rat.of(v0)).mul(Rat.of(100));
  const wrong = Rat.of(v1 - v0).div(Rat.of(v1)).mul(Rat.of(100));
  return (
    <div className="card stack">
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <PercentBars v0={v0} v1={v1} />
        <div className="stack">
          <Slider id="p-0" label="V₀ (start)" value={v0} min={10} max={400} step={5} onChange={setV0} />
          <Slider id="p-1" label="V₁ (slutt)" value={v1} min={10} max={400} step={1} onChange={setV1} />
          <div className="card flat stack sm">
            <Tex tex={`\\frac{${v1} - ${v0}}{${v0}} \\cdot 100\\,\\% = ${e.round(2).toLatex()}\\,\\%`} />
            <span className="small muted">Deler du på sluttverdien i stedet, får du {wrong.round(2).toNo()} %. Det er et annet tall fordi grunnlaget er et annet.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
