import { isExamSet } from '../domain/types';
// Handlinger i læringsflyten: økter, forsøk, hjelp, levering og evidens.

import type { Attempt, GeneratedTask, GenPart, PartAttempt, SessionRec, Evidence, HelpEvent, ExamSim, SubTask, SourceDoc, VariationLevel, GenStyle } from '../domain/types';
import { newId, nowIso } from '../domain/types';
import { store } from '../state/store';
import { generateTasks, generateOne } from '../generator/generate';
import { FAMILIES, getFamily, findTemplate, familiesFor } from '../families';
import { assessMathPart, assessChoice, assessFlawed, assessGraph, assessExplanation } from './assess';
import { evidenceForPart, summarizeSession, voidEvidenceForAttempt } from './mastery';
import { recommend } from './recommend';
import { HELP_LEVELS } from './tutor';
import { awardXp, patchTopic, topicState } from './game';
import { originalTask, originalPool } from './originals';
import { topicStats } from './path';

export function emptyPartAttempt(p: GenPart): PartAttempt {
  return { partId: p.id, lines: [], resolutions: {}, explanation: '', images: [], confirmedReadings: {}, submitted: false };
}

export function courseFamilies(): string[] {
  const subs = store.currentSubtasks();
  const found = [...new Set(subs.map((s) => s.analysis.familyKbId).filter((x): x is string => !!x))];
  return found.length ? found : familiesFor([]).map((f) => f.id);
}

function sourceRefsFor(kbIds: string[]) {
  const subs = store.currentSubtasks().filter((s) => !store.get<SourceDoc>('doc', s.docId)?.reserved);
  const fams = store.families();
  const out: Record<string, { familyId?: string; subtaskIds: string[] }> = {};
  for (const id of kbIds) out[id] = { familyId: fams.find((f) => f.kbId === id)?.id, subtaskIds: subs.filter((s) => s.analysis.familyKbId === id).map((s) => s.id) };
  return out;
}

export function startAttempt(task: GeneratedTask, mode: Attempt['mode'] = 'læring', sessionId?: string, examId?: string): Attempt {
  const now = nowIso();
  const att: Attempt = {
    id: newId('forsok'),
    kind: 'attempt',
    courseId: task.courseId,
    createdAt: now,
    updatedAt: now,
    demo: task.demo,
    taskRef: { type: 'gen', id: task.id },
    mode,
    sessionId,
    examId,
    startedAt: now,
    parts: task.parts.map(emptyPartAttempt),
    help: [],
    chat: [],
    sawSolution: false,
    status: 'pågår',
    timeSpentSec: 0,
  };
  // Kursdokumentet skrives ikke her: det ble overskrevet ved hver oppgavestart og kunne
  // viske ut endringer gjort på en annen enhet (f.eks. eksamensdato). «Uferdig oppgave» på
  // Hjem finner siste forsøk direkte.
  store.upsert(att);
  return att;
}

export interface SessionOptions {
  type: SessionRec['type'];
  families?: string[];
  level?: VariationLevel | 'blandet';
  style?: GenStyle | 'variert';
  count?: number;
  minutes?: number;
  skills?: string[];
  reason?: string;
}

export function planSession(opts: SessionOptions): { session: SessionRec; tasks: GeneratedTask[]; note?: string } {
  const cid = store.ui.activeCourseId!;
  const course = store.course();
  const fams = opts.families?.length ? opts.families : courseFamilies();
  const existing = store.gens();
  let tasks: GeneratedTask[] = [];
  let note: string | undefined;
  const refs = sourceRefsFor(fams);
  const gen = (families: string[], level: VariationLevel | 'blandet', style: GenStyle | 'variert', count: number, fadeStart?: number) => {
    const r = generateTasks({ courseId: cid, families, count, level, style, existing: [...existing, ...tasks], sourceRefs: refs, demo: course?.demo, maxMinutes: opts.minutes, fadeStart });
    let out = r.tasks;
    // Finnes ikke nivået for familien, brukes nærmeste nivå i stedet for å gi en tom økt.
    if (out.length < count && typeof level === 'number') {
      for (const alt of [level + 1, level - 1, level + 2, level + 3].filter((l) => l >= 1 && l <= 4) as VariationLevel[]) {
        if (out.length >= count) break;
        const r2 = generateTasks({ courseId: cid, families, count: count - out.length, level: alt, style, existing: [...existing, ...tasks, ...out], sourceRefs: refs, demo: course?.demo, maxMinutes: opts.minutes, fadeStart });
        out = [...out, ...r2.tasks];
      }
    }
    if (r.note && out.length < count) note = r.note;
    return out;
  };
  switch (opts.type) {
    case 'grunnleggende': {
      // Gjennomarbeidet eksempel via fading (3 → 1 gitte steg), deretter delferdighet og én hel oppgave.
      // Familier uten slike maler får i stedet oppgaver fra laveste nivå og oppover (med eksempel i hjelpen).
      const f = fams[0];
      const fam = getFamily(f);
      const styles = new Set(fam?.templates.map((t) => t.style));
      const levels = (fam?.templates.filter((t) => t.style === 'standard').map((t) => t.level) ?? [1]) as VariationLevel[];
      const low = (levels.length ? Math.min(...levels) : 1) as VariationLevel;
      if (styles.has('fading')) tasks.push(...gen([f], 1, 'fading', 3, 3));
      if (styles.has('delferdighet')) tasks.push(...gen([f], 1, 'delferdighet', 2));
      if (styles.has('fading') || styles.has('delferdighet')) tasks.push(...gen([f], low, 'standard', 1));
      else {
        tasks.push(...gen([f], low, 'standard', 2));
        tasks.push(...gen([f], Math.min(4, low + 1) as VariationLevel, 'standard', 1));
      }
      break;
    }
    case 'nivå': {
      for (const f of fams.slice(0, 4)) tasks.push(...gen([f], 1, 'standard', 1));
      tasks.push(...gen(fams.slice(0, 3), 2, 'standard', Math.min(2, fams.length)));
      break;
    }
    case 'oppgaver':
      tasks.push(...gen(fams, 'blandet', 'variert', opts.count ?? 4));
      break;
    case 'repetisjon':
      tasks.push(...gen(fams, (opts.level as VariationLevel) ?? 2, 'standard', opts.count ?? 2));
      break;
    case 'reparasjon':
    case 'familie':
    case 'fri':
    default:
      tasks.push(...gen(fams, opts.level ?? 1, opts.style ?? 'standard', opts.count ?? 3));
  }
  const now = nowIso();
  const session: SessionRec = {
    id: newId('okt'),
    kind: 'session',
    courseId: cid,
    createdAt: now,
    updatedAt: now,
    demo: course?.demo,
    type: opts.type,
    startedAt: now,
    plan: { taskIds: tasks.map((t) => t.id), families: fams, level: typeof opts.level === 'number' ? opts.level : undefined, targetMinutes: opts.minutes, reason: opts.reason ?? '' },
    currentIndex: 0,
  };
  store.upsertMany([...tasks, session]);
  return { session, tasks, note };
}

export function newVariant(task: GeneratedTask, harder = false): GeneratedTask | null {
  const fam = getFamily(task.familyKbId);
  if (!fam) return null;
  let tpl = fam.templates.find((t) => t.id === task.templateId);
  // Originaloppgaver (fra eksamen) har ingen mal: øv videre på en standardoppgave i samme familie.
  if (!tpl) tpl = fam.templates.find((t) => t.style === 'standard' && t.level === 2) ?? fam.templates.find((t) => t.style === 'standard') ?? fam.templates[0];
  if (harder) tpl = fam.templates.find((t) => t.style === 'standard' && t.level === Math.min(4, task.level + 1)) ?? tpl;
  if (!tpl) return null;
  for (let i = 0; i < 12; i++) {
    const g = generateOne(task.courseId, fam.id, tpl, Math.floor(Math.random() * 1e9), { demo: task.demo, sourceRefs: task.sourceRefs, fade: tpl.style === 'fading' ? 1 : undefined });
    if (g.validation.status !== 'forkastet' && JSON.stringify(g.params) !== JSON.stringify(task.params)) {
      store.upsert(g);
      return g;
    }
  }
  return null;
}

export function patchPart(att: Attempt, partId: string, patch: Partial<PartAttempt>): Attempt {
  // Alltid den nyeste versjonen fra lagringen, så ingen annen endring overskrives.
  const cur = store.get<Attempt>('attempt', att.id) ?? att;
  const has = cur.parts.some((p) => p.partId === partId);
  const parts = has ? cur.parts.map((p) => (p.partId === partId ? { ...p, ...patch } : p)) : [...cur.parts, { ...emptyPartAttempt({ id: partId } as GenPart), ...patch }];
  return store.upsert({ ...cur, parts });
}

export function recordHelp(att: Attempt, ev: Omit<HelpEvent, 'at'>): Attempt {
  const cur = store.get<Attempt>('attempt', att.id) ?? att;
  const help = [...cur.help, { ...ev, at: nowIso() }];
  return store.upsert({ ...cur, help, sawSolution: cur.sawSolution || ev.level >= 5 });
}

export function helpLabel(level: number) {
  return HELP_LEVELS.find((h) => h.level === level)?.label ?? 'Hjelp';
}

export async function submitPart(attId: string, partId: string, opts: { self?: Record<string, boolean> } = {}): Promise<Attempt> {
  let att = store.get<Attempt>('attempt', attId)!;
  const task = store.get<GeneratedTask>('gen', att.taskRef.id);
  const part = task?.parts.find((p) => p.id === partId);
  const pa = att.parts.find((p) => p.partId === partId);
  if (!task || !part || !pa) return att;
  let a;
  if (part.kind === 'flervalg') a = assessChoice(part, pa);
  else if (part.kind === 'finn-feilen') a = assessFlawed(part, pa, task);
  else if (part.kind === 'graf') a = assessGraph(part, pa);
  else if (part.kind === 'forklaring') a = await assessExplanation(task, part, pa, opts.self);
  else a = assessMathPart(part, pa, task);
  att = store.get<Attempt>('attempt', attId)!;
  att = patchPart(att, partId, { assessment: a, submitted: true });
  // Evidens: erstatt tidligere evidens for samme deloppgave i dette forsøket.
  const old = store.evidence().filter((e) => e.attemptId === attId && e.taskRef.partId === partId && !e.voided);
  for (const e of old) store.upsert({ ...e, voided: { reason: 'Erstattet av ny levering', at: nowIso() } });
  const prev = store.evidence().filter((e) => e.attemptId !== attId);
  const context: Evidence['context'] = att.mode === 'eksamen' ? 'eksamen' : att.mode === 'diagnose' ? 'diagnose' : 'øving';
  const evs = a.uncertain && a.method.verdict === 'uavklart' ? [] : evidenceForPart(att, task, part, a, prev, context, { type: 'gen', id: task.id }, task.structureKey, task.level);
  store.upsertMany(evs);
  // Poeng og fremgang: én gang per deloppgave og forsøk, aldri for tomme svar, og
  // bare når vurderingen er sikker (motivasjon; påvirker ikke mestringsbildet).
  const blank = !pa.lines.some((l) => l.text.trim()) && !pa.explanation.trim() && !pa.images.length && pa.choiceId === undefined && pa.flawedLine === undefined && !(pa.graphPoints ?? []).some((g) => g.points.length);
  if (!a.uncertain && !blank && !pa.counted && !part.selfCheck) {
    const indep = evs.some((e) => e.outcome === 'selvstendig-riktig');
    const ok = indep || a.answer.verdict === 'riktig' || a.interpretation?.verdict === 'oppfylt';
    if (indep || ok) awardXp(indep ? 15 : 5, indep ? 'Løst selvstendig' : 'Riktig med hjelp', { kbId: task.familyKbId, courseId: task.courseId });
    const st = topicState(task.familyKbId, task.courseId);
    patchTopic(task.familyKbId, { attempted: (st.attempted ?? 0) + 1, ...(indep ? { solved: (st.solved ?? 0) + 1 } : {}) }, task.courseId);
    att = patchPart(store.get<Attempt>('attempt', attId)!, partId, { counted: true });
  }
  if (att.parts.every((p) => p.submitted)) att = store.upsert({ ...store.get<Attempt>('attempt', attId)!, status: 'levert', submittedAt: nowIso() });
  return att;
}

/** Retter en vurdering når en avlesning eller AI-vurdering viser seg å være feil. */
export function correctAssessment(attId: string, partId: string, reason: string) {
  const att = store.get<Attempt>('attempt', attId);
  if (!att) return;
  const evs = voidEvidenceForAttempt(store.evidence().filter((e) => e.taskRef.partId === partId), attId, reason);
  store.upsertMany(evs);
  const cur = att.parts.find((p) => p.partId === partId);
  const after = patchPart(att, partId, { submitted: false, assessment: undefined, reassessed: (cur?.reassessed ?? 0) + 1 });
  if (after.status === 'levert') store.upsert({ ...after, status: 'pågår', submittedAt: undefined });
  store.toast('Vurderingen er trukket tilbake og påvirker ikke mestringsbildet.', 'ok');
}

export function endSession(sessionId: string): SessionRec | undefined {
  const s = store.get<SessionRec>('session', sessionId);
  if (!s) return;
  const atts = store.attempts().filter((a) => a.sessionId === sessionId).map((a) => a.id);
  const ev = store.evidence().filter((e) => atts.includes(e.attemptId));
  const rec = recommend({ course: store.course(), docs: store.docs(), subtasks: store.currentSubtasks(), families: store.families(), evidence: store.evidence(), sessions: store.sessions() });
  const summary = summarizeSession(ev, `${rec.primary.title}: ${rec.primary.reason}`);
  return store.upsert({ ...s, endedAt: nowIso(), summary });
}

// ——— Eksamensmodus ———

export function reservedDocs(): SourceDoc[] {
  return store.docs().filter((d) => d.reserved && isExamSet(d) && d.status !== 'duplikat');
}

export function setReserved(docId: string, reserved: boolean) {
  const d = store.get<SourceDoc>('doc', docId);
  if (!d) return;
  store.upsert({ ...d, reserved });
  store.toast(reserved ? `${d.meta.setLabel ?? d.fileName} er holdt utenfor trening, kart og hint til du tar prøven.` : `${d.meta.setLabel ?? d.fileName} er tilbake i treningen.`, 'ok');
}

/** Lager en prøve: enten et reservert sett (originaloppgaver) eller genererte oppgaver som speiler strukturen i settene. */
export function buildExam(opts: { source: 'reservert' | 'generert'; docId?: string; minutes?: number }): ExamSim | null {
  const course = store.course();
  const cid = store.ui.activeCourseId!;
  const now = nowIso();
  const aids = course?.examInfo.aids ?? 'Ikke oppgitt';
  const duration = opts.minutes ?? course?.examInfo.durationMin ?? 90;
  if (opts.source === 'reservert' && opts.docId) {
    const d = store.get<SourceDoc>('doc', opts.docId);
    const subs = store.currentSubtasks().filter((s) => s.docId === opts.docId);
    if (!d || !subs.length) return null;
    // Generer en kontrollert, gjenkjent variant for hver deloppgave med kjent familie, slik at svar kan vurderes.
    const exam: ExamSim = {
      id: newId('prove'),
      kind: 'exam',
      courseId: cid,
      createdAt: now,
      updatedAt: now,
      demo: d.demo,
      source: { type: 'reservert', docId: d.id },
      basisNote: `Originaloppgavene fra ${d.meta.setLabel ?? d.fileName}${d.reserved ? ', som har vært holdt utenfor treningen' : ' (du kan ha øvd på noen av dem før)'}. Flervalg rettes mot fasiten, tallsvar mot løsningsforslaget, og tekstsvar vurderes mot sensorveiledningen (foreløpig vurdering, ikke sensur).`,
      durationMin: duration,
      aids,
      taskIds: [],
      subtaskIds: subs.map((s) => s.id),
      status: 'klar',
      attemptIds: [],
    };
    return store.upsert(exam);
  }
  // Generert: speil siste sammenliknbare sett (oppgavefamilier i samme rekkefølge).
  const docs = store.docs().filter((d) => isExamSet(d) && d.status !== 'duplikat' && !d.supersededBy && !d.reserved);
  const latest = [...docs].sort((a, b) => (b.meta.year ?? 0) - (a.meta.year ?? 0))[0];
  const subs = store.currentSubtasks().filter((s) => s.docId === latest?.id);
  const famOrder = [...new Set(subs.map((s) => s.analysis.familyKbId).filter((x): x is string => !!x))];
  let fams = famOrder.length ? famOrder : courseFamilies();
  // Essayfag: fem hele essayspørsmål fra temaene som kommer oftest (vektet trekning, ingen like).
  const essay = fams.length > 0 && fams.every((f) => getFamily(f)?.domain === 'org');
  if (essay) {
    const stats = topicStats().filter((t) => t.questions > 0);
    const pool = stats.map((t) => ({ id: t.kbId, w: t.share + 0.1 }));
    const chosen: string[] = [];
    while (chosen.length < 5 && pool.length) {
      const sum = pool.reduce((a, b) => a + b.w, 0);
      let r = Math.random() * sum;
      const i = Math.max(0, pool.findIndex((x) => (r -= x.w) <= 0));
      chosen.push(pool.splice(i, 1)[0].id);
    }
    if (chosen.length) fams = chosen;
  }
  const tasks: GeneratedTask[] = [];
  const existing = store.gens();
  for (const f of fams) {
    const lvl: VariationLevel = essay ? 4 : subs.some((s) => s.analysis.familyKbId === f && /avgift|maksimalpris|prosentpoeng|tilbake/i.test(s.text)) ? 3 : 2;
    const r = generateTasks({ courseId: cid, families: [f], count: 1, level: lvl, style: 'standard', existing: [...existing, ...tasks], sourceRefs: sourceRefsFor([f]), demo: course?.demo });
    tasks.push(...r.tasks);
  }
  const exam: ExamSim = {
    id: newId('prove'),
    kind: 'exam',
    courseId: cid,
    createdAt: now,
    updatedAt: now,
    demo: course?.demo,
    source: { type: 'generert', basis: essay ? 'Fem essayspørsmål fra temaene som kommer oftest' : latest ? `Speiler oppgavefamiliene i ${latest.meta.setLabel ?? latest.fileName}` : 'Familiene i faget' },
    basisNote: `${course?.examInfo.durationMin ? `Tid og hjelpemidler fra eksamensopplysningene dine (${course.examInfo.durationMin} min, ${aids}).` : 'Eksamenstid er ikke oppgitt; simuleringen er et forslag basert på tilgjengelig materiale.'} Oppgavene er nye, genererte varianter av familiene i settene dine.`,
    durationMin: duration,
    aids,
    taskIds: tasks.map((t) => t.id),
    subtaskIds: [],
    status: 'klar',
    attemptIds: [],
  };
  store.upsertMany([...tasks, exam]);
  return exam;
}

/** Lager en vurderbar variant av en original deloppgave (samme parametere) til eksamensmodus. */
export function taskFromSubtask(st: SubTask): GeneratedTask | null {
  const fam = getFamily(st.analysis.familyKbId);
  const params = st.analysis.params;
  if (!fam || !params || st.analysis.certainty.validation !== 'kontrollert') return null;
  const answers = st.analysis.computed?.answers ?? [];
  if (!answers.length) return null;
  const now = nowIso();
  const targets = answers.map((a, i) => ({ symbol: a.symbol ?? `s${i}`, label: a.label, value: a.value, percent: a.unit === '%', minDecimals: 0, aliases: a.label.toLowerCase().split(/\s+/).filter((w) => w.length > 3) }));
  const solution: Record<string, string> = {};
  for (const a of answers) if (a.symbol) solution[a.symbol] = a.value;
  const defs: Record<string, string> = {};
  if (params.a && params.b && params.c && params.d && fam.id === 'likevekt-lineaer') {
    defs.Qd = `${params.a} - (${params.b})*P`;
    defs.Qs = `${params.c} + (${params.d})*P`;
    if (solution.P && solution.Q) {
      solution.Qd = solution.Q;
      solution.Qs = solution.Q;
    }
  }
  const part: GenPart = {
    id: 'a',
    label: st.label,
    prompt: st.text,
    kind: st.analysis.taskType.value.includes('forklaring') && !answers.length ? 'forklaring' : 'beregning',
    skills: st.analysis.skills.value,
    math: { symbols: ['Qd', 'Qs', 'Pk', 'Pp', 'TC', 'AC', 'MC', 'FC'], defs, param: 'P', unknown: solution.P ? 'P' : Object.keys(solution)[0] ?? 'x', solution, answerSymbols: targets.filter((t) => !solution[t.symbol]).map((t) => t.symbol) },
    targets,
    solution: [],
    hints: { small: '', firstStep: '', stepExplanation: '', workedExample: { intro: '', steps: [] } },
    methodCheckpoints: [],
  };
  const t: GeneratedTask = {
    id: `orig-${st.id}`,
    kind: 'gen',
    courseId: st.courseId,
    createdAt: now,
    updatedAt: now,
    demo: st.demo,
    familyKbId: fam.id,
    templateId: 'original',
    templateVersion: 1,
    level: 4,
    style: 'standard',
    params,
    seed: 0,
    title: `Originaloppgave ${st.label}`,
    intro: st.intro ?? '',
    context: 'original',
    parts: [part],
    skills: part.skills,
    structureKey: `original|${st.id}`,
    sourceRefs: { subtaskIds: [st.id] },
    validation: { status: 'gyldig', checks: [{ name: 'Fasit fra regelmotoren', ok: true, detail: 'Parametere lest fra teksten, svar regnet eksakt.' }] },
    wording: 'mal',
    estMinutes: st.analysis.time.estimate ?? 8,
  };
  return t;
}

export function templateName(id: string) {
  return findTemplate(id)?.template.name ?? id;
}

// ——— Øving på originalspørsmålene ———

export function planOriginalSession(opts: { format: 'flervalg' | 'kortsvar' | 'langsvar' | 'oppgave' | 'samling' | 'blandet'; count: number; families?: string[]; subtaskIds?: string[]; keepOrder?: boolean; reason?: string }): { session: SessionRec; tasks: GeneratedTask[]; note?: string } {
  const cid = store.ui.activeCourseId!;
  const course = store.course();
  const pool = originalPool();
  let subs = opts.subtaskIds?.length
    ? store.currentSubtasks().filter((s) => opts.subtaskIds!.includes(s.id))
    : opts.format === 'blandet'
      ? [...pool.flervalg, ...pool.kortsvar, ...pool.langsvar, ...pool.oppgave]
      : pool[opts.format];
  if (opts.families?.length) subs = subs.filter((s) => s.analysis.familyKbId && opts.families!.includes(s.analysis.familyKbId));
  // Prioriter spørsmål du ikke har prøvd, og bland rekkefølgen.
  const tried = new Set(store.attempts().map((a) => a.taskRef.id));
  const order = (a: SubTask[]) => [...a].sort(() => Math.random() - 0.5).sort((x, y) => Number(tried.has(`orig-${x.id}`)) - Number(tried.has(`orig-${y.id}`)));
  let shuffled = opts.keepOrder ? subs : order(subs);
  if (opts.format === 'blandet' && !opts.subtaskIds?.length) {
    // Blandet: annenhver type (flervalg, kortsvar, lengre, regneoppgave), slik at økten dekker hele eksamensformatet.
    const groups = [pool.flervalg, pool.kortsvar, pool.langsvar, pool.oppgave].map((g) => order(g.filter((x) => subs.includes(x)))).filter((g) => g.length);
    const mixed: SubTask[] = [];
    for (let i = 0; groups.some((g) => i < g.length); i++) for (const g of groups) if (i < g.length) mixed.push(g[i]);
    shuffled = mixed;
  }
  const tasks: GeneratedTask[] = [];
  for (const st of shuffled) {
    if (tasks.length >= opts.count) break;
    const t = originalTask(st);
    if (t) tasks.push(t);
  }
  const now = nowIso();
  const session: SessionRec = {
    id: newId('okt'),
    kind: 'session',
    courseId: cid,
    createdAt: now,
    updatedAt: now,
    demo: course?.demo,
    type: 'eksamensspm',
    startedAt: now,
    plan: { taskIds: tasks.map((t) => t.id), families: [...new Set(tasks.map((t) => t.familyKbId))], reason: opts.reason ?? 'Spørsmål fra eksamenssettene dine, vurdert mot sensorveiledningen.' },
    currentIndex: 0,
  };
  store.upsertMany([...tasks, session]);
  return { session, tasks, note: tasks.length < opts.count ? `Fant ${tasks.length} spørsmål som kan øves på med fasit eller veiledning.` : undefined };
}
