// Tekst i Lær-delen: {{1:…}} til {{4:…}} gir fargede nøkkelord, $…$ er matematikk.
// Fargene har faste betydninger: 1 blå = størrelser og begreper, 2 oransje = det
// som endres, 3 grønn = svaret, 4 lilla = regel å huske.

import { useMemo } from 'react';
import { RichText, Tex } from './Math';

export const PART_COLORS = ['#2f74d0', '#e0620d', '#2b9348', '#c2255c', '#7048e8', '#0b7f8c'];

/** Deler teksten i fargemarkeringer. Tåler klammer inni ($\\frac{a}{b}$ i en markering). */
export function splitMarks(text: string): { hl: number; s: string }[] {
  const out: { hl: number; s: string }[] = [];
  let i = 0;
  let plain = '';
  while (i < text.length) {
    const m = /^\{\{([1-4]):/.exec(text.slice(i, i + 4));
    if (m) {
      // «{{1:» er fire tegn; innholdet starter rett etter kolonet.
      let depth = 0;
      let j = i + 4;
      for (; j < text.length; j++) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') {
          if (depth === 0 && text[j + 1] === '}') break;
          depth = Math.max(0, depth - 1);
        }
      }
      if (j < text.length) {
        if (plain) out.push({ hl: 0, s: plain });
        plain = '';
        out.push({ hl: Number(m[1]), s: text.slice(i + 4, j) });
        i = j + 2;
        continue;
      }
    }
    plain += text[i++];
  }
  if (plain) out.push({ hl: 0, s: plain });
  return out;
}

/** Teksten uten fargekoder (til opplesning og korte sammendrag). */
export const plainMarks = (text: string) => splitMarks(text).map((p) => p.s).join('');

export function LessonText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => splitMarks(text), [text]);
  return (
    <span className={className}>
      {parts.map((p, i) => (p.hl ? <mark key={i} className={`lx lx-${p.hl}`}><RichText text={p.s} /></mark> : <RichText key={i} text={p.s} />))}
    </span>
  );
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Farger hver del av formelen (samme farge som i forklaringen under). */
export function colorTex(tex: string, parts: { tex: string }[]): string {
  // Tekstgrupper (\text{…} osv.) skjermes, så bokstaver inni dem ikke farges.
  const shielded: string[] = [];
  let out = tex.replace(/\\(?:text|mathrm|operatorname|textbf|mathit|mbox)\{[^{}]*\}/g, (m) => {
    shielded.push(m);
    return String.fromCharCode(0xe200 + shielded.length - 1);
  });
  const sorted = parts.map((p, i) => ({ ...p, i })).filter((p) => p.tex.trim()).sort((a, b) => b.tex.length - a.tex.length);
  const marks: string[] = [];
  for (const p of sorted) {
    const t = p.tex.trim();
    // Ikke inni en kommando som \cdot eller \frac, og ikke midt i et ord på flere bokstaver.
    const pre = /^[A-Za-z]/.test(t) ? '(?<!\\\\[A-Za-z]*)' : '';
    const post = /[A-Za-z]$/.test(t) && t.length > 1 ? '(?![A-Za-z])' : '';
    const re = new RegExp(`${pre}${esc(t)}${post}`, 'g');
    out = out.replace(re, () => {
      marks.push(`\\textcolor{${PART_COLORS[p.i % PART_COLORS.length]}}{${t}}`);
      return String.fromCharCode(0xe100 + marks.length - 1);
    });
  }
  return out.replace(/[\ue100-\ue1ff]/g, (c) => marks[c.charCodeAt(0) - 0xe100]).replace(/[\ue200-\ue2ff]/g, (c) => shielded[c.charCodeAt(0) - 0xe200]);
}

export function ColorFormula({ tex, parts, big = true }: { tex: string; parts: { tex: string; meaning: string }[]; big?: boolean }) {
  const colored = useMemo(() => colorTex(tex, parts), [tex, parts]);
  return (
    <div className="stack sm">
      <div className={`formula-big${big ? '' : ' small'}`}>
        <Tex tex={colored} display />
      </div>
      {parts.length ? (
        <ul className="formula-legend">
          {parts.map((p, i) => (
            <li key={i}>
              <span className="swatch" style={{ background: PART_COLORS[i % PART_COLORS.length] }} />
              <span style={{ color: PART_COLORS[i % PART_COLORS.length], fontWeight: 700 }}>
                <Tex tex={p.tex} />
              </span>
              <span className="small">
                <LessonText text={p.meaning} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
