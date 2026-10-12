// Små belønningselementer: dagsmål-ring, dager på rad, XP-sprett og konfetti.

import { useEffect, useState } from 'react';
import { useStore } from '../../state/store';
import { game, levelOf, onXp, profile, streakNow, todayXp } from '../../learning/game';

export function GoalRing({ value, goal, size = 44, label }: { value: number; goal: number; size?: number; label?: string }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, goal ? value / goal : 0);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `${value} av ${goal} XP i dag`} className="goal-ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={frac >= 1 ? 'var(--teal)' : 'var(--accent)'} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="54%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.26} fontWeight="700" fill="var(--ink)">
        {frac >= 1 ? '✓' : Math.round(frac * 100) + '%'}
      </text>
    </svg>
  );
}

export function Flame({ size = 20, on = true }: { size?: number; on?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1-.5-2-1-3 3 1 5 4 5 7a7 7 0 0 1-14 0c0-6 6-8 7-13z" fill={on ? '#f08c2e' : 'var(--line-strong)'} />
      <path d="M12 13c.6 1.6-1.5 2.2-1.5 4a1.5 1.5 0 0 0 3 0c0-1.4-.6-2.6-1.5-4z" fill={on ? '#ffd43b' : 'var(--surface-3)'} />
    </svg>
  );
}

export function Star({ size = 18, on = true }: { size?: number; on?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" fill={on ? '#f5b300' : 'var(--line-strong)'} />
    </svg>
  );
}

export function Trophy({ size = 22, on = true }: { size?: number; on?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3h10v4a5 5 0 0 1-10 0V3z" fill={on ? '#f5b300' : 'var(--line-strong)'} />
      <path d="M7 5H4a3 3 0 0 0 3 4M17 5h3a3 3 0 0 1-3 4" stroke={on ? '#d99400' : 'var(--line-strong)'} strokeWidth="1.6" fill="none" />
      <path d="M10.5 12h3v4h-3z M8 17h8v3H8z" fill={on ? '#d99400' : 'var(--line-strong)'} />
    </svg>
  );
}

/** Dager på rad, XP i dag mot dagsmålet, og nivå. */
export function StatBar({ compact }: { compact?: boolean }) {
  useStore((s) => s.get('game', 'spill'));
  useStore((s) => s.get('profile', 'meg'));
  const g = game();
  const p = profile();
  const streak = streakNow(g);
  const xpToday = todayXp(g);
  const lv = levelOf(g.xp);
  return (
    <div className={`statbar${compact ? ' compact' : ''}`}>
      <div className="stat" title="Dager på rad">
        <Flame on={streak > 0} />
        <strong>{streak}</strong>
        {!compact ? <span className="xs muted">{streak === 1 ? 'dag' : 'dager'} på rad</span> : null}
      </div>
      <div className="stat" title="Dagsmål">
        <GoalRing value={xpToday} goal={p.dailyGoal} size={compact ? 30 : 38} />
        {!compact ? (
          <span className="xs muted">
            {xpToday} / {p.dailyGoal} XP i dag
          </span>
        ) : null}
      </div>
      <div className="stat" title="Nivå">
        <Star />
        <strong>Nivå {lv.level}</strong>
        {!compact ? (
          <span className="lvl-bar" aria-label={`${g.xp - lv.from} av ${lv.to - lv.from} XP til neste nivå`}>
            <span style={{ width: `${Math.round(((g.xp - lv.from) / (lv.to - lv.from)) * 100)}%` }} />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Konfetti (bare CSS; slås av med «redusert bevegelse»). */
export function Confetti({ n = 36 }: { n?: number }) {
  const colors = ['#6b3fc9', '#f5b300', '#2b9348', '#e0620d', '#2f74d0', '#c2255c'];
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} style={{ left: `${(i * 97) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 9) * 60}ms`, transform: `rotate(${(i * 47) % 360}deg)` }} />
      ))}
    </div>
  );
}

/** «+15 XP» som spretter opp øverst når du tjener poeng, og feiring når dagsmålet nås. */
export function XpBursts() {
  const [items, setItems] = useState<{ id: number; text: string; big?: boolean }[]>([]);
  useEffect(() => {
    let id = 0;
    return onXp((e) => {
      const add = (text: string, big?: boolean) => {
        const k = ++id;
        setItems((x) => [...x, { id: k, text, big }]);
        window.setTimeout(() => setItems((x) => x.filter((y) => y.id !== k)), big ? 3200 : 1600);
      };
      add(`+${e.amount} XP`);
      if (e.goalReached) add('Dagsmålet er nådd!', true);
    });
  }, []);
  return (
    <div className="xp-bursts" aria-live="polite">
      {items.map((i) => (
        <span key={i.id} className={`xp-burst${i.big ? ' big' : ''}`}>
          {i.text}
        </span>
      ))}
    </div>
  );
}
