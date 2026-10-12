// Tutorfigurene: egne, enkle SVG-figurer (ikke kjente maskoter). Standard er
// roboten Bolt; studenten kan velge en annen figur og et annet navn under «Meg».
// Humøret styrer øyne, munn og bevegelse.

import type { MascotKind } from '../../domain/types';
import { LessonText, plainMarks } from './LessonText';
import { SpeakButton } from './Voice';

export type Mood = 'glad' | 'tenker' | 'jubler' | 'oi';

export const MASCOTS: { id: MascotKind; label: string; defaultName: string }[] = [
  { id: 'robot', label: 'Robot', defaultName: 'Bolt' },
  { id: 'rev', label: 'Rev med briller', defaultName: 'Rikke' },
  { id: 'katt', label: 'Katt med hodetelefoner', defaultName: 'Kasper' },
];

function Eyes({ mood, cx1, cx2, cy, r, pupil = '#2b1830' }: { mood: Mood; cx1: number; cx2: number; cy: number; r: number; pupil?: string }) {
  if (mood === 'jubler')
    return (
      <g stroke={pupil} strokeWidth="3.2" fill="none" strokeLinecap="round">
        <path d={`M${cx1 - r * 0.6} ${cy + 2} q${r * 0.6} ${-r * 0.9} ${r * 1.2} 0`} />
        <path d={`M${cx2 - r * 0.6} ${cy + 2} q${r * 0.6} ${-r * 0.9} ${r * 1.2} 0`} />
      </g>
    );
  const dy = mood === 'tenker' ? -r * 0.3 : 0;
  const dx = mood === 'tenker' ? r * 0.3 : 0;
  const pr = mood === 'oi' ? r * 0.32 : r * 0.45;
  return (
    <g>
      <circle cx={cx1} cy={cy} r={r} fill="#fff" />
      <circle cx={cx2} cy={cy} r={r} fill="#fff" />
      <circle cx={cx1 + dx} cy={cy + dy} r={pr} fill={pupil} />
      <circle cx={cx2 + dx} cy={cy + dy} r={pr} fill={pupil} />
      <circle cx={cx1 + dx + pr * 0.35} cy={cy + dy - pr * 0.35} r={pr * 0.3} fill="#fff" />
      <circle cx={cx2 + dx + pr * 0.35} cy={cy + dy - pr * 0.35} r={pr * 0.3} fill="#fff" />
    </g>
  );
}

function Fox({ mood }: { mood: Mood }) {
  return (
    <g>
      <ellipse cx="60" cy="92" rx="26" ry="22" fill="#e07a2f" />
      <ellipse cx="60" cy="98" rx="14" ry="14" fill="#fbf1e6" />
      <path d="M26 22 l14 30 l-22 6 z" fill="#e07a2f" />
      <path d="M94 22 l-14 30 l22 6 z" fill="#e07a2f" />
      <path d="M28 30 l9 18 l-12 4 z" fill="#3a2230" />
      <path d="M92 30 l-9 18 l12 4 z" fill="#3a2230" />
      <path d="M20 50 q40 -26 80 0 q-6 30 -40 34 q-34 -4 -40 -34 z" fill="#e8873a" />
      <path d="M30 62 q30 30 60 0 q-6 22 -30 24 q-24 -2 -30 -24 z" fill="#fbf1e6" />
      <Eyes mood={mood} cx1={46} cx2={74} cy={58} r={7} />
      <g stroke="#2b1830" strokeWidth="2.4" fill="none">
        <circle cx="46" cy="58" r="10.5" />
        <circle cx="74" cy="58" r="10.5" />
        <path d="M56.5 58 h7" />
      </g>
      <ellipse cx="60" cy="72" rx="4" ry="3" fill="#2b1830" />
      <path d={mood === 'oi' ? 'M56 79 q4 -3 8 0' : 'M54 77 q6 6 12 0'} stroke="#2b1830" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Cat({ mood }: { mood: Mood }) {
  return (
    <g>
      <ellipse cx="60" cy="94" rx="26" ry="20" fill="#6c7a89" />
      <path d="M28 30 l8 26 l-18 2 z" fill="#6c7a89" />
      <path d="M92 30 l-8 26 l18 2 z" fill="#6c7a89" />
      <circle cx="60" cy="62" r="32" fill="#7d8b9a" />
      <path d="M44 38 q16 -6 32 0" stroke="#5d6a78" strokeWidth="3" fill="none" />
      <Eyes mood={mood} cx1={47} cx2={73} cy={60} r={8} pupil="#1f3b2c" />
      <path d="M57 72 l3 3 l3 -3 z" fill="#e48aa0" />
      <path d={mood === 'oi' ? 'M56 80 q4 -3 8 0' : 'M54 77 q3 4 6 0 q3 4 6 0'} stroke="#2b1830" strokeWidth="2" fill="none" strokeLinecap="round" />
      <g stroke="#e9eef2" strokeWidth="1.6">
        <path d="M30 70 h14 M30 76 l14 -3 M90 70 h-14 M90 76 l-14 -3" />
      </g>
      {/* hodetelefoner */}
      <path d="M26 60 q0 -40 34 -40 q34 0 34 40" stroke="#6b3fc9" strokeWidth="5" fill="none" />
      <rect x="20" y="54" width="12" height="20" rx="5" fill="#6b3fc9" />
      <rect x="88" y="54" width="12" height="20" rx="5" fill="#6b3fc9" />
    </g>
  );
}

function Robot({ mood }: { mood: Mood }) {
  const eye = mood === 'oi' ? '#ff8fa3' : '#5ee6c8';
  const line = '#4a4f78';
  const up = mood === 'jubler';
  return (
    <g strokeLinejoin="round">
      {/* antenne */}
      <path d="M60 22 v-10" stroke={line} strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy="9" r="5.5" fill={up ? '#ffd43b' : '#8f7cf0'} stroke={line} strokeWidth="1.5" />
      {/* armer */}
      {up ? (
        <g stroke={line} strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M26 82 q-12 -10 -10 -26" />
          <path d="M94 82 q12 -10 10 -26" />
        </g>
      ) : mood === 'tenker' ? (
        <g stroke={line} strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M26 84 q-8 10 -4 20" />
          <path d="M94 84 q10 -4 -2 -14" />
        </g>
      ) : (
        <g stroke={line} strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M26 84 q-8 10 -4 20" />
          <path d="M94 84 q8 10 4 20" />
        </g>
      )}
      <circle cx={up ? 16 : 22} cy={up ? 54 : 105} r="5" fill="#c9cfe6" stroke={line} strokeWidth="1.5" />
      <circle cx={up ? 104 : mood === 'tenker' ? 91 : 98} cy={up ? 54 : mood === 'tenker' ? 69 : 105} r="5" fill="#c9cfe6" stroke={line} strokeWidth="1.5" />
      {/* blyant i hånden */}
      {!up && mood !== 'tenker' ? (
        <g transform="rotate(-30 100 104)">
          <rect x="97" y="88" width="6" height="18" rx="1.5" fill="#ffd43b" stroke={line} strokeWidth="1.2" />
          <path d="M97 106 l3 6 l3 -6 z" fill="#f3d9b1" stroke={line} strokeWidth="1.2" />
        </g>
      ) : null}
      {/* kropp */}
      <rect x="34" y="78" width="52" height="34" rx="12" fill="#c9cfe6" stroke={line} strokeWidth="2" />
      <rect x="46" y="86" width="28" height="16" rx="5" fill="#2a2f55" />
      <path d="M53 92 h14 M53 96 h14" stroke="#5ee6c8" strokeWidth="2" strokeLinecap="round" />
      {/* hode */}
      <rect x="22" y="22" width="76" height="58" rx="20" fill="#dfe3f5" stroke={line} strokeWidth="2.2" />
      <rect x="31" y="32" width="58" height="38" rx="13" fill="#2a2f55" />
      {up ? (
        <g stroke={eye} strokeWidth="3.6" fill="none" strokeLinecap="round">
          <path d="M40 52 q6 -8 12 0" />
          <path d="M68 52 q6 -8 12 0" />
        </g>
      ) : (
        <g fill={eye}>
          <rect x={mood === 'tenker' ? 44 : 41} y={mood === 'tenker' ? 41 : 44} width="10" height={mood === 'oi' ? 6 : 11} rx="3.5" />
          <rect x={mood === 'tenker' ? 72 : 69} y={mood === 'tenker' ? 41 : 44} width="10" height={mood === 'oi' ? 6 : 11} rx="3.5" />
        </g>
      )}
      <path d={mood === 'oi' ? 'M53 62 q7 -4 14 0' : 'M51 60 q9 6 18 0'} stroke={eye} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <circle cx="36" cy="64" r="3" fill="#ff8fa3" opacity="0.7" />
      <circle cx="84" cy="64" r="3" fill="#ff8fa3" opacity="0.7" />
    </g>
  );
}

export function Mascot({ kind = 'robot', mood = 'glad', size = 72, label }: { kind?: MascotKind; mood?: Mood; size?: number; label?: string }) {
  return (
    <svg className={`mascot mood-${mood}`} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={label ?? MASCOTS.find((m) => m.id === kind)?.label}>
      {kind === 'rev' ? <Fox mood={mood} /> : kind === 'katt' ? <Cat mood={mood} /> : <Robot mood={mood} />}
    </svg>
  );
}

/** Tutorfiguren med en snakkeboble. Teksten kan ha fargemarkering og $matematikk$. */
export function MascotSays({ kind, name, mood = 'glad', text, size = 64, speak = true, children }: { kind: MascotKind; name: string; mood?: Mood; text?: string; size?: number; speak?: boolean; children?: React.ReactNode }) {
  return (
    <div className="mascot-says">
      <Mascot kind={kind} mood={mood} size={size} />
      <div className="bubble" role="status" aria-live="polite">
        <span className="bubble-name">{name}</span>
        {text ? <LessonText text={text} /> : null}
        {children}
        {speak && text ? <SpeakButton text={plainMarks(text).replace(/\$/g, '')} label="Les opp" /> : null}
      </div>
    </div>
  );
}
