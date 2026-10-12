// Poeng, aktive dager, dagsmål og rekorder. Dette er motivasjon, ikke mestring:
// mestringsbildet bygger fortsatt bare på selvstendige prestasjoner. Poeng gis for
// det som faktisk er læring (riktig på første forsøk, oppgaver løst selv, fullført
// leksjon), ikke for å klikke seg videre.

import type { GameRec, LearnerProfile, CompetitionRun } from '../domain/types';
import { nowIso } from '../domain/types';
import { store } from '../state/store';

export const GAME_ID = 'spill';
export const PROFILE_ID = 'meg';

export function today(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return today(d);
}

export const DEFAULT_PROFILE: Omit<LearnerProfile, 'createdAt' | 'updatedAt'> = {
  id: PROFILE_ID,
  kind: 'profile',
  courseId: '',
  interests: [],
  personalize: true,
  learnStyle: 'blanding',
  mascot: 'robot',
  mascotName: 'Bolt',
  calculator: 'enkel',
  dailyGoal: 30,
  sound: false,
  focusMode: true,
};

export function profile(): LearnerProfile {
  const p = store.get<LearnerProfile>('profile', PROFILE_ID);
  const now = nowIso();
  const out = { ...DEFAULT_PROFILE, createdAt: now, updatedAt: now, ...(p ?? {}) } as LearnerProfile;
  // Uglen er tatt ut; tidligere valg blir roboten.
  if ((out.mascot as string) === 'ugle') return { ...out, mascot: 'robot', mascotName: out.mascotName === 'Uglis' ? 'Bolt' : out.mascotName };
  return out;
}

export function saveProfile(patch: Partial<LearnerProfile>) {
  const cur = profile();
  return store.upsert({ ...cur, ...patch, id: PROFILE_ID, kind: 'profile', courseId: '' });
}

/** Kalkulatoren for faget (eget valg per fag, ellers profilens). */
export function calculatorFor(courseId?: string): LearnerProfile['calculator'] {
  const c = courseId ? store.get<import('../domain/types').Course>('course', courseId) : store.course();
  return c?.settings.calculator ?? profile().calculator;
}

export function game(): GameRec {
  const g = store.get<GameRec>('game', GAME_ID);
  if (g) return g;
  const now = nowIso();
  return { id: GAME_ID, kind: 'game', courseId: '', createdAt: now, updatedAt: now, xp: 0, days: {}, streak: 0, bestStreak: 0, topics: {}, chapters: {} };
}

export const topicKey = (courseId: string, kbId: string) => `${courseId}:${kbId}`;

/** Nivå ut fra samlet XP (stigende avstand mellom nivåene). */
export function levelOf(xp: number): { level: number; from: number; to: number } {
  let level = 1;
  let need = 60;
  let from = 0;
  while (xp >= from + need) {
    from += need;
    level++;
    need = Math.round(need * 1.25);
  }
  return { level, from, to: from + need };
}

/** Dager på rad: teller bare hvis du har vært aktiv i dag eller i går. */
export function streakNow(g = game()): number {
  return g.lastDay === today() || g.lastDay === yesterday() ? g.streak : 0;
}

export function todayXp(g = game()): number {
  return g.days[today()] ?? 0;
}

/** De siste sju dagene (eldst først), med poeng per dag. */
export function lastWeek(g = game()): { day: string; label: string; points: number; today: boolean }[] {
  const names = ['sø', 'ma', 'ti', 'on', 'to', 'fr', 'lø'];
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = today(d);
    out.push({ day: k, label: names[d.getDay()], points: g.days[k] ?? 0, today: i === 0 });
  }
  return out;
}

type Listener = (e: { amount: number; reason: string; goalReached: boolean }) => void;
const listeners = new Set<Listener>();
export function onXp(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Gir XP, oppdaterer dagsmål og dager på rad. Returnerer ny tilstand. */
export function awardXp(amount: number, reason: string, ctx: { kbId?: string; courseId?: string } = {}): GameRec {
  const g = game();
  const t = today();
  const before = g.days[t] ?? 0;
  const days = { ...g.days, [t]: before + amount };
  // Behold bare de siste 60 dagene.
  for (const k of Object.keys(days).sort().slice(0, -60)) delete days[k];
  let streak = g.streak;
  if (g.lastDay !== t) streak = g.lastDay === yesterday() ? g.streak + 1 : 1;
  const topics = { ...g.topics };
  const cid = ctx.courseId ?? store.ui.activeCourseId;
  if (ctx.kbId && cid) {
    const k = topicKey(cid, ctx.kbId);
    topics[k] = { ...topics[k], xp: (topics[k]?.xp ?? 0) + amount, lastAt: nowIso() };
  }
  const next = store.upsert({ ...g, xp: g.xp + amount, days, streak, bestStreak: Math.max(g.bestStreak, streak), lastDay: t, topics });
  const goal = profile().dailyGoal;
  const goalReached = before < goal && before + amount >= goal;
  for (const l of listeners) l({ amount, reason, goalReached });
  return next;
}

export function topicState(kbId: string, courseId = store.ui.activeCourseId ?? '') {
  return game().topics[topicKey(courseId, kbId)] ?? {};
}

export function patchTopic(kbId: string, patch: GameRec['topics'][string], courseId = store.ui.activeCourseId ?? '') {
  const g = game();
  const k = topicKey(courseId, kbId);
  return store.upsert({ ...g, topics: { ...g.topics, [k]: { ...g.topics[k], ...patch } } });
}

/** Lagrer et konkurranseforsøk. Returnerer om det ble ny rekord. */
export function saveRun(chapterId: string, run: CompetitionRun, courseId = store.ui.activeCourseId ?? ''): { record: boolean; best?: CompetitionRun } {
  const g = game();
  const k = `${courseId}:${chapterId}`;
  const cur = g.chapters[k];
  const record = !cur?.best || run.score > cur.best.score;
  store.upsert({ ...g, chapters: { ...g.chapters, [k]: { runs: (cur?.runs ?? 0) + 1, best: record ? run : cur?.best } } });
  return { record, best: record ? run : cur?.best };
}

export function chapterBest(chapterId: string, courseId = store.ui.activeCourseId ?? ''): CompetitionRun | undefined {
  return game().chapters[`${courseId}:${chapterId}`]?.best;
}

/** Korte lyder for riktig/feil/feiring (bare når lyd er slått på i Om meg). */
let audio: AudioContext | null = null;
export function playSound(kind: 'riktig' | 'feil' | 'feiring') {
  if (!profile().sound) return;
  try {
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio = audio ?? new Ctx();
    const notes = kind === 'riktig' ? [660, 880] : kind === 'feil' ? [300, 220] : [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      const o = audio!.createOscillator();
      const gn = audio!.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t0 = audio!.currentTime + i * 0.09;
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      o.connect(gn).connect(audio!.destination);
      o.start(t0);
      o.stop(t0 + 0.18);
    });
  } catch {
    /* lyd er valgfritt */
  }
}
