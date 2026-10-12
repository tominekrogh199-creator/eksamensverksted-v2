// Tutorfigurene: egne, enkle SVG-figurer (ikke kjente maskoter). Studenten
// velger figur og navn i «Om meg». Humøret styrer øyne, munn og bevegelse.

import type { MascotKind } from '../../domain/types';
import { LessonText } from './LessonText';
import { SpeakButton } from './Voice';

export type Mood = 'glad' | 'tenker' | 'jubler' | 'oi';

export const MASCOTS: { id: MascotKind; label: string; defaultName: string }[] = [
  { id: 'ugle', label: 'Ugle med studenthatt', defaultName: 'Uglis' },
  { id: 'rev', label: 'Rev med briller', defaultName: 'Rikke' },
  { id: 'katt', label: 'Katt med hodetelefoner', defaultName: 'Kasper' },
  { id: 'robot', label: 'Robot', defaultName: 'Bolt' },
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

function Owl({ mood }: { mood: Mood }) {
  return (
    <g>
      {/* kropp */}
      <ellipse cx="60" cy="72" rx="34" ry="38" fill="#7a5aa6" />
      <ellipse cx="60" cy="82" rx="22" ry="25" fill="#f3e6d3" />
      <path d="M44 74 q4 4 8 0 M52 84 q4 4 8 0 M60 74 q4 4 8 0 M68 84 q4 4 8 0" stroke="#d9c4a8" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* vinger */}
      {mood === 'jubler' ? (
        <>
          <path d="M27 66 q-14 -18 -6 -30 q8 10 12 26 z" fill="#5f4387" />
          <path d="M93 66 q14 -18 6 -30 q-8 10 -12 26 z" fill="#5f4387" />
        </>
      ) : (
        <>
          <path d="M27 62 q-8 22 6 34 q2 -18 -6 -34 z" fill="#5f4387" />
          <path d="M93 62 q8 22 -6 34 q-2 -18 6 -34 z" fill="#5f4387" />
        </>
      )}
      {/* ansikt */}
      <circle cx="47" cy="52" r="13" fill="#efe3f7" />
      <circle cx="73" cy="52" r="13" fill="#efe3f7" />
      <Eyes mood={mood} cx1={47} cx2={73} cy={52} r={8} />
      <path d={mood === 'oi' ? 'M57 63 l3 6 l3 -6 z' : 'M55 61 l5 8 l5 -8 z'} fill="#f0a23b" />
      {/* føtter */}
      <path d="M48 108 l-3 5 M52 108 l0 6 M56 108 l3 5 M64 108 l-3 5 M68 108 l0 6 M72 108 l3 5" stroke="#f0a23b" strokeWidth="3" strokeLinecap="round" />
      {/* studenthatt */}
      <path d="M60 14 l30 11 l-30 11 l-30 -11 z" fill="#2b1830" stroke="#9b80c8" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M44 30 v8 q16 8 32 0 v-8 l-16 6 z" fill="#3b2541" stroke="#9b80c8" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M88 25 v14" stroke="#e8b931" strokeWidth="2.4" />
      <circle cx="88" cy="41" r="3" fill="#e8b931" />
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
  const eye = mood === 'oi' ? '#ec8697' : '#5ee6c8';
  return (
    <g>
      <path d="M60 10 v14" stroke="#4b3a55" strokeWidth="3" />
      <circle cx="60" cy="9" r="5" fill={mood === 'jubler' ? '#e8b931' : '#ec8697'} />
      <rect x="24" y="24" width="72" height="56" rx="16" fill="#9aa7c7" />
      <rect x="32" y="34" width="56" height="34" rx="10" fill="#26304a" />
      {mood === 'jubler' ? (
        <g stroke={eye} strokeWidth="3.4" fill="none" strokeLinecap="round">
          <path d="M40 54 q6 -8 12 0" />
          <path d="M68 54 q6 -8 12 0" />
        </g>
      ) : (
        <g fill={eye}>
          <rect x={mood === 'tenker' ? 44 : 41} y={mood === 'tenker' ? 44 : 46} width="10" height="10" rx="3" />
          <rect x={mood === 'tenker' ? 72 : 69} y={mood === 'tenker' ? 44 : 46} width="10" height="10" rx="3" />
        </g>
      )}
      <path d={mood === 'oi' ? 'M54 63 h12' : 'M52 61 q8 5 16 0'} stroke={eye} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <rect x="18" y="44" width="6" height="16" rx="3" fill="#7d8aab" />
      <rect x="96" y="44" width="6" height="16" rx="3" fill="#7d8aab" />
      <rect x="36" y="84" width="48" height="30" rx="10" fill="#8492b5" />
      <circle cx="60" cy="98" r="6" fill="#e8b931" />
    </g>
  );
}

export function Mascot({ kind = 'ugle', mood = 'glad', size = 72, label }: { kind?: MascotKind; mood?: Mood; size?: number; label?: string }) {
  return (
    <svg className={`mascot mood-${mood}`} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={label ?? MASCOTS.find((m) => m.id === kind)?.label}>
      {kind === 'rev' ? <Fox mood={mood} /> : kind === 'katt' ? <Cat mood={mood} /> : kind === 'robot' ? <Robot mood={mood} /> : <Owl mood={mood} />}
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
        {speak && text ? <SpeakButton text={text.replace(/\{\{\d:([^}]*)\}\}/g, '$1').replace(/\$/g, '')} label="Les opp" /> : null}
      </div>
    </div>
  );
}
