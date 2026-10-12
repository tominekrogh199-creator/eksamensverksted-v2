// En vanlig kalkulator på skjermen: «Vis meg» trykker tastene én og én,
// «Prøv selv» lar deg taste og viser neste tast hvis du står fast.

import { useEffect, useMemo, useRef, useState } from 'react';
import { BasicCalc, CALC_LAYOUT, CALC_EXTRA, keysText, planKeys, type CalcKey } from '../../learning/calculator';
import { Icon } from './Icon';

export function CalcPad({ expression, onSolved, compact }: { expression: string; onSolved?: () => void; compact?: boolean }) {
  const plan = useMemo(() => planKeys(expression), [expression]);
  const calc = useRef(new BasicCalc());
  const [display, setDisplay] = useState('0');
  const [mem, setMem] = useState(false);
  const [active, setActive] = useState<CalcKey | null>(null);
  const [mode, setMode] = useState<'idle' | 'demo' | 'selv'>('idle');
  const [step, setStep] = useState(0);
  const [pressed, setPressed] = useState<CalcKey[]>([]);
  const [solved, setSolved] = useState(false);
  const [hint, setHint] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  if (!plan) return null;
  const reset = () => {
    calc.current = new BasicCalc();
    setDisplay('0');
    setMem(false);
    setStep(0);
    setPressed([]);
    setActive(null);
  };
  const press = (k: CalcKey) => {
    calc.current.press(k);
    setDisplay(calc.current.error ? 'E' : calc.current.display);
    setMem(calc.current.memoryIndicator);
    setActive(k);
    window.setTimeout(() => setActive((a) => (a === k ? null : a)), 220);
  };
  const demo = () => {
    reset();
    setMode('demo');
    let i = 0;
    const tick = () => {
      if (i >= plan.keys.length) {
        timer.current = null;
        return;
      }
      press(plan.keys[i]);
      setStep(++i);
      timer.current = window.setTimeout(tick, document.documentElement.classList.contains('reduce-motion') ? 120 : 650);
    };
    timer.current = window.setTimeout(tick, 300);
  };
  const userPress = (k: CalcKey) => {
    if (mode === 'demo') return;
    if (mode !== 'selv') {
      reset();
      setMode('selv');
    }
    press(k);
    const next = [...pressed, k];
    setPressed(next);
    const val = Number(calc.current.display);
    if (!solved && (k === '=' || k === 'MRC' || k === '√') && Math.abs(val - plan.result) <= Math.max(1e-9, Math.abs(plan.result) * 1e-6)) {
      setSolved(true);
      onSolved?.();
    }
  };
  // Neste tast i fasiten: hvor langt har studenten fulgt den?
  let matched = 0;
  while (matched < pressed.length && pressed[matched] === plan.keys[matched]) matched++;
  const offTrack = mode === 'selv' && matched < pressed.length;
  const nextKey = mode === 'selv' && !offTrack ? plan.keys[matched] : null;
  return (
    <div className={`calcpad${compact ? ' compact' : ''}`}>
      <div className="calc-body" aria-label="Kalkulator">
        <div className="calc-display" aria-live="polite">
          <span className="calc-m">{mem ? 'M' : ''}</span>
          <span className="calc-num">{display}</span>
        </div>
        <div className="calc-keys">
          {[...CALC_LAYOUT, CALC_EXTRA].map((row, r) => (
            <div key={r} className={`calc-row${r === CALC_LAYOUT.length ? ' extra' : ''}`}>
              {row.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`calc-key${/[0-9.]/.test(k) ? ' num' : k === '=' ? ' eq' : k.startsWith('M') ? ' mem' : ' op'}${active === k ? ' pressed' : ''}${hint && nextKey === k ? ' hint' : ''}`}
                  onClick={() => userPress(k)}
                  aria-label={`Tast ${k}`}
                >
                  {k}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="calc-side stack sm">
        <div className="row">
          <button className="btn small primary" onClick={demo} disabled={mode === 'demo' && step < plan.keys.length && !!timer.current}>
            <Icon name="play" size={14} /> Vis meg
          </button>
          <button
            className="btn small"
            onClick={() => {
              reset();
              setMode('selv');
              setSolved(false);
            }}
          >
            <Icon name="hand" size={14} /> Prøv selv
          </button>
          {mode === 'selv' ? (
            <button className={`btn small ghost${hint ? ' on' : ''}`} onClick={() => setHint(!hint)} aria-pressed={hint}>
              <Icon name="bulb" size={14} /> {hint ? 'Skjul hjelp' : 'Vis neste tast'}
            </button>
          ) : null}
        </div>
        <ol className="calc-steps">
          {plan.groups.map((g, i) => {
            const start = plan.groups.slice(0, i).reduce((n, x) => n + x.keys.length, 0);
            const done = mode === 'demo' ? step >= start + g.keys.length : mode === 'selv' ? matched >= start + g.keys.length : false;
            const now = mode === 'demo' && step > start && step < start + g.keys.length;
            return (
              <li key={i} className={done ? 'done' : now ? 'now' : ''}>
                <span className="keys mono">{keysText(g.keys)}</span>
                <span className="xs muted">{g.note}</span>
              </li>
            );
          })}
        </ol>
        {mode === 'selv' && offTrack ? <p className="xs" style={{ color: 'var(--amber)' }}>Du har gått bort fra oppskriften. Trykk «Prøv selv» for å starte på nytt, eller fortsett hvis du vet hva du gjør.</p> : null}
        {solved ? <p className="small ok-text">Riktig tastet! Displayet viser {display}.</p> : null}
      </div>
    </div>
  );
}
