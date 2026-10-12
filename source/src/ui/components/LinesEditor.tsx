// Skrivefelt for utregning: én linje per steg, pen visning, formelmeny,
// norsk desimalkomma og avklaring av tvetydige tall.

import { useEffect, useRef, useState } from 'react';
import type { WorkLine } from '../../domain/types';
import { parseLine } from '../../math/parse';
import { LinePreview } from './Math';
import { Icon } from './Icon';

export interface LineStatusView {
  tone: 'ok' | 'bad' | 'warn';
  text: string;
}

const MENU: { label: string; insert: string; title: string }[] = [
  { label: '·', insert: '·', title: 'Gange' },
  { label: '/', insert: '/', title: 'Dele (brøk)' },
  { label: '( )', insert: '()', title: 'Parentes' },
  { label: 'x²', insert: '^2', title: 'Potens' },
  { label: '−', insert: '−', title: 'Minus' },
  { label: '=', insert: ' = ', title: 'Er lik' },
  { label: '→', insert: ' → ', title: 'Neste steg på samme linje' },
  { label: '%', insert: ' %', title: 'Prosent' },
  { label: 'Qd', insert: 'Qd', title: 'Etterspurt kvantum' },
  { label: 'Qs', insert: 'Qs', title: 'Tilbudt kvantum' },
  { label: 'P', insert: 'P', title: 'Pris' },
  { label: 'Q', insert: 'Q', title: 'Kvantum' },
];

// Tekniske fag: SI-enheter i stedet for økonomisymbolene.
const MENU_SI: { label: string; insert: string; title: string }[] = [
  ...MENU.slice(0, 7),
  { label: 'Ω', insert: ' Ω', title: 'Ohm' },
  { label: 'kΩ', insert: ' kΩ', title: 'Kiloohm' },
  { label: 'V', insert: ' V', title: 'Volt' },
  { label: 'A', insert: ' A', title: 'Ampere' },
  { label: 'mA', insert: ' mA', title: 'Milliampere' },
  { label: 'W', insert: ' W', title: 'Watt' },
  { label: 'µF', insert: ' µF', title: 'Mikrofarad' },
  { label: 'mH', insert: ' mH', title: 'Millihenry' },
];

export function LinesEditor({
  lines,
  onChange,
  symbols,
  resolutions,
  onResolve,
  statuses,
  confirmed,
  onConfirmReading,
  disabled,
  focusIndex,
  onFocusLine,
  extraMenu,
  units,
}: {
  lines: WorkLine[];
  onChange: (lines: WorkLine[]) => void;
  symbols?: string[];
  resolutions: Record<string, string>;
  onResolve: (id: string, value: string) => void;
  statuses?: Record<number, LineStatusView>;
  confirmed: Record<number, string>;
  onConfirmReading: (i: number, text: string) => void;
  disabled?: boolean;
  focusIndex?: number;
  onFocusLine?: (i: number) => void;
  extraMenu?: string[];
  units?: 'si';
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  // Tilbud og etterspørsel-symbolene vises bare i oppgaver som bruker dem.
  const econ = units !== 'si' && (symbols ?? []).some((x) => x === 'Qd' || x === 'Qs');
  const [focus, setFocus] = useState(0);
  const view = lines.length ? lines : [{ text: '', source: 'typed' as const }];
  useEffect(() => {
    if (focusIndex !== undefined) refs.current[focusIndex]?.focus();
  }, [focusIndex]);
  const set = (i: number, text: string) => {
    const next = [...view];
    // Retter studenten en linje som er lest fra bilde, er det studentens egen avlesning.
    next[i] = { ...next[i], text, ...(next[i].source === 'image' && text !== next[i].text ? { certain: true } : {}) };
    onChange(next);
  };
  const insert = (s: string) => {
    const el = refs.current[focus];
    const cur = view[focus]?.text ?? '';
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    const nextText = cur.slice(0, start) + s + cur.slice(end);
    set(focus, nextText);
    requestAnimationFrame(() => {
      const pos = start + (s === '()' ? 1 : s.length);
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };
  return (
    <div className="stack">
      <div className="fmenu" role="toolbar" aria-label="Formelmeny">
        {[...(units === 'si' ? MENU_SI : econ ? MENU : MENU.slice(0, 8)), ...(extraMenu ?? []).filter((x) => !(econ && ['Qd', 'Qs', 'P', 'Q'].includes(x))).map((x) => ({ label: x, insert: x, title: x }))].map((m) => (
          <button key={m.label} type="button" title={m.title} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(m.insert)} disabled={disabled}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="lines">
        {view.map((l, i) => {
          const pr = parseLine(confirmed[i] ?? l.text, { symbols, resolutions });
          const unresolved = pr.ambiguities.filter((a) => !a.chosen);
          const st = statuses?.[i];
          const uncertain = l.source === 'image' && l.certain === false && confirmed[i] === undefined;
          return (
            <div className="line" key={i}>
              <div className="line-no">{i + 1}</div>
              <div className={`line-box ${st?.tone ?? ''} ${uncertain ? 'warn' : ''}`}>
                <input
                  ref={(el) => (refs.current[i] = el)}
                  value={confirmed[i] ?? l.text}
                  disabled={disabled}
                  aria-label={`Linje ${i + 1} i utregningen`}
                  placeholder={i === 0 ? (units === 'si' ? 'Skriv første steg, f.eks. i = 12 V / 4 kΩ' : econ ? 'Skriv første steg, f.eks. Qd = Qs' : symbols?.[0] ? `Skriv første steg, f.eks. ${symbols[0]} = …` : 'Skriv første steg') : 'Neste steg'}
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  onFocus={() => {
                    setFocus(i);
                    onFocusLine?.(i);
                  }}
                  onChange={(e) => set(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const next = [...view];
                      next.splice(i + 1, 0, { text: '', source: 'typed' });
                      onChange(next);
                      requestAnimationFrame(() => refs.current[i + 1]?.focus());
                    } else if (e.key === 'Backspace' && !(confirmed[i] ?? l.text) && view.length > 1) {
                      e.preventDefault();
                      const next = view.filter((_, k) => k !== i);
                      onChange(next);
                      requestAnimationFrame(() => refs.current[Math.max(0, i - 1)]?.focus());
                    } else if (e.key === 'ArrowUp') refs.current[i - 1]?.focus();
                    else if (e.key === 'ArrowDown') refs.current[i + 1]?.focus();
                  }}
                />
                <div className="line-preview">
                  <LinePreview text={confirmed[i] ?? l.text} symbols={symbols} resolutions={resolutions} />
                </div>
                {l.source === 'image' ? (
                  <div className="line-status">
                    <span className="line-tag warn" style={{ color: 'var(--ink-3)' }}>
                      <Icon name="image" size={13} /> Avlest fra bilde{l.certain === false && confirmed[i] === undefined ? ' – usikker' : confirmed[i] !== undefined ? ' – bekreftet av deg' : ''}
                    </span>
                  </div>
                ) : null}
                {uncertain ? (
                  <div className="line-status" role="group" aria-label="Bekreft avlesning">
                    <span className="small">Vi er usikre på hva som står her. Hva skrev du?</span>
                    <div className="row">
                      {[l.text, ...(l.alternatives ?? [])].filter((v, k, arr) => v && arr.indexOf(v) === k).map((alt) => (
                        <button key={alt} className="btn small" onClick={() => onConfirmReading(i, alt)}>
                          «{alt}»
                        </button>
                      ))}
                      <button className="btn small ghost" onClick={() => onConfirmReading(i, l.text)}>
                        Noe annet (rett i feltet)
                      </button>
                    </div>
                  </div>
                ) : null}
                {unresolved.length ? (
                  <div className="line-status">
                    {unresolved.map((a) => (
                      <div key={a.id} className="stack sm">
                        <span className="small">{a.question}</span>
                        <div className="row">
                          {a.options.map((o) => (
                            <button key={o.value} className="btn small" onClick={() => onResolve(a.id, o.value)}>
                              {o.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {!pr.ok && (confirmed[i] ?? l.text).trim() ? (
                  <div className="line-status">
                    <span className="line-tag warn">Kan ikke leses som matematikk: {pr.error}</span>
                  </div>
                ) : null}
                {st ? (
                  <div className="line-status">
                    <span className={`line-tag ${st.tone}`}>
                      <Icon name={st.tone === 'ok' ? 'check' : st.tone === 'bad' ? 'x' : 'help'} size={13} stroke={2.4} />
                      {st.text}
                    </span>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Fjern linje ${i + 1}`}
                disabled={disabled || view.length <= 1}
                onClick={() => onChange(view.filter((_, k) => k !== i))}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="row">
        <button type="button" className="btn small ghost" disabled={disabled} onClick={() => onChange([...view, { text: '', source: 'typed' }])}>
          <Icon name="plus" size={16} /> Ny linje
        </button>
        <span className="xs faint">
          <span className="kbd">Enter</span> gir ny linje. Desimalkomma: 2,5. {units === 'si' ? 'Enheter med prefiks: 4 kΩ, 2,5 mA, 10 µF.' : econ ? 'Skriv 5P for 5 · P.' : 'Bruk · eller * for gange.'}
        </span>
      </div>
    </div>
  );
}
