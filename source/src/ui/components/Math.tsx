import katex from 'katex';
import { useMemo } from 'react';
import { parseLine } from '../../math/parse';
import { statementTex } from '../../math/latex';

export function Tex({ tex, display = false, className }: { tex: string; display?: boolean; className?: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { throwOnError: false, displayMode: display, strict: 'ignore', output: 'htmlAndMathml' });
    } catch {
      return tex;
    }
  }, [tex, display]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Tekst med innebygd matematikk mellom $…$. Vanlig tekst escapes av React. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => {
    const out: { math: boolean; s: string }[] = [];
    const re = /\$([^$]+)\$/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ math: false, s: text.slice(last, m.index) });
      out.push({ math: true, s: m[1] });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ math: false, s: text.slice(last) });
    return out;
  }, [text]);
  return (
    <span className={className}>
      {parts.map((p, i) => (p.math ? <Tex key={i} tex={p.s} /> : <span key={i}>{p.s}</span>))}
    </span>
  );
}

/** Setter elevens linje pent opp. Returnerer null når linjen ikke kan leses som matematikk. */
export function LinePreview({ text, symbols, resolutions }: { text: string; symbols?: string[]; resolutions?: Record<string, string> }) {
  const tex = useMemo(() => {
    if (!text.trim()) return '';
    const r = parseLine(text, { symbols, resolutions });
    if (!r.ok) return null;
    const parts = r.statements.filter((s) => s.kind !== 'text').map(statementTex);
    if (!parts.length) return '';
    return parts.join(' \\quad\\Rightarrow\\quad ');
  }, [text, symbols, resolutions]);
  if (tex === null) return <span className="xs faint">Kan ikke settes opp som matematikk ennå</span>;
  if (!tex) return null;
  return <Tex tex={tex} />;
}

/** Enkel lesbar tekst av LaTeX (til teksting og opplesing). */
export function texToSpeech(tex: string): string {
  return tex
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1 delt på $2')
    .replace(/\\cdot/g, ' ganger ')
    .replace(/Q_d/g, 'Q d')
    .replace(/Q_s/g, 'Q s')
    .replace(/P_k/g, 'P k')
    .replace(/P_p/g, 'P p')
    .replace(/\\mathit\{([^}]*)\}/g, '$1')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\{,\}/g, ',')
    .replace(/\\quad|\\,|\\;|\\ /g, ' ')
    .replace(/\\Rightarrow/g, ' som gir ')
    .replace(/\\approx/g, ' omtrent lik ')
    .replace(/\\%/g, ' prosent')
    .replace(/-/g, ' minus ')
    .replace(/=/g, ' er lik ')
    .replace(/[{}\\^]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function texToPlain(tex: string): string {
  return tex
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\\cdot/g, '·')
    .replace(/\\mathit\{([^}]*)\}/g, '$1')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\{,\}/g, ',')
    .replace(/\\quad|\\,|\\;|\\ /g, ' ')
    .replace(/\\Rightarrow/g, '⇒')
    .replace(/\\approx/g, '≈')
    .replace(/\\%/g, '%')
    .replace(/_\{?([a-z0-9]+)\}?/gi, '$1')
    .replace(/\^\{?2\}?/g, '²')
    .replace(/\\left|\\right/g, '')
    .replace(/[{}\\]/g, '')
    .replace(/-/g, '−')
    .replace(/\s+/g, ' ')
    .trim();
}
