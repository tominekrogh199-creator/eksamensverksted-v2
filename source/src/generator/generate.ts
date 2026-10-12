// Oppgavegeneratoren. Oppgaver lages fra dokumenterte oppgavefamilier og
// eksplisitte maler, valideres uavhengig og forkastes hvis kontrollen feiler.

import type { GeneratedTask, VariationLevel, GenStyle, ID } from '../domain/types';
import { newId, nowIso } from '../domain/types';
import { FAMILIES, getFamily } from '../families';
import type { TemplateDef, FamilyKB } from '../families/common';
import { mulberry32 } from '../families/common';
import { validateTask } from './validate';

export interface GenerateRequest {
  courseId: ID;
  families: string[];
  count: number;
  level: VariationLevel | 'blandet';
  style?: GenStyle | 'variert';
  fadeStart?: number;
  seed?: number;
  existing?: GeneratedTask[];
  sourceRefs?: Record<string, { familyId?: ID; subtaskIds: ID[] }>;
  demo?: boolean;
  maxMinutes?: number;
}

export interface GenerateReport {
  tasks: GeneratedTask[];
  rejected: { templateId: string; reason: string }[];
  note?: string;
}

function templatesFor(fam: FamilyKB, level: VariationLevel | 'blandet', style: GenStyle | 'variert'): TemplateDef[] {
  let ts = fam.templates;
  if (style === 'variert') ts = ts.filter((t) => t.style === 'standard' || t.style === 'finn-feilen');
  else ts = ts.filter((t) => t.style === style);
  if (level !== 'blandet') {
    const exact = ts.filter((t) => t.level === level);
    if (exact.length) ts = exact;
    else ts = ts.filter((t) => t.level <= level).sort((a, b) => b.level - a.level).slice(0, 2);
  }
  return ts;
}

function paramKey(t: Pick<GeneratedTask, 'templateId' | 'params'>): string {
  return t.templateId + '|' + Object.entries(t.params).sort().map(([k, v]) => `${k}=${v}`).join(',');
}

function tooSimilar(a: GeneratedTask, b: GeneratedTask): boolean {
  if (a.templateId !== b.templateId) return false;
  if (paramKey(a) === paramKey(b)) return true;
  // Nesten identisk: samme mal, samme kontekst og nesten like tall.
  const keys = Object.keys(a.params).filter((k) => k in b.params);
  const numeric = keys.filter((k) => !isNaN(Number(a.params[k])) && !isNaN(Number(b.params[k])));
  if (!numeric.length) return false;
  const close = numeric.every((k) => Math.abs(Number(a.params[k]) - Number(b.params[k])) <= Math.max(1, Math.abs(Number(a.params[k])) * 0.05));
  return close && a.context === b.context;
}

export function generateOne(courseId: ID, familyId: string, tpl: TemplateDef, seed: number, opts: { fade?: number; demo?: boolean; sourceRefs?: { familyId?: ID; subtaskIds: ID[] } } = {}): GeneratedTask {
  const rng = mulberry32(seed);
  const body = tpl.build(rng, { level: tpl.level, style: tpl.style, seed, fade: opts.fade });
  const t: GeneratedTask = {
    id: newId('gen'),
    kind: 'gen',
    courseId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    demo: opts.demo,
    familyKbId: familyId,
    templateId: tpl.id,
    templateVersion: tpl.version,
    level: tpl.level,
    style: tpl.style,
    seed,
    wording: 'mal',
    sourceRefs: opts.sourceRefs ?? { subtaskIds: [] },
    validation: { status: 'til-kontroll', checks: [] },
    ...body,
  };
  const v = validateTask(t);
  t.validation = v;
  return t;
}

/** Lager en variert, validert øvingsmengde. Prioriterer variasjon og fungerende oppgaver framfor antall. */
export function generateTasks(req: GenerateRequest): GenerateReport {
  const style = req.style ?? 'variert';
  const fams = req.families.map((id) => getFamily(id)).filter((f): f is FamilyKB => !!f);
  if (!fams.length) return { tasks: [], rejected: [], note: 'Ingen kjente oppgavefamilier er valgt.' };
  let seed = req.seed ?? Math.floor(Math.random() * 1e9);
  const out: GeneratedTask[] = [];
  const rejected: GenerateReport['rejected'] = [];
  const pool = [...(req.existing ?? [])];
  let minutes = 0;
  let attempts = 0;
  let fi = 0;
  const lastKeys: string[] = [];
  while (out.length < req.count && attempts < req.count * 25) {
    attempts++;
    const fam = fams[fi % fams.length];
    fi++;
    const lvl: VariationLevel | 'blandet' = req.level === 'blandet' ? ((((out.length % 4) + 1) as VariationLevel)) : req.level;
    const ts = templatesFor(fam, lvl, style);
    if (!ts.length) continue;
    // Unngå samme struktur to ganger på rad når det finnes alternativer.
    const choices = ts.filter((t) => !lastKeys.slice(-1).includes(t.id));
    const tpl = (choices.length ? choices : ts)[(seed >>> 3) % (choices.length ? choices.length : ts.length)];
    seed = (seed * 1664525 + 1013904223) >>> 0;
    let task: GeneratedTask;
    try {
      const fade = tpl.style === 'fading' ? Math.max(0, (req.fadeStart ?? 3) - out.filter((x) => x.style === 'fading').length) : undefined;
      task = generateOne(req.courseId, fam.id, tpl, seed, { fade, demo: req.demo, sourceRefs: req.sourceRefs?.[fam.id] });
    } catch (e) {
      rejected.push({ templateId: tpl.id, reason: e instanceof Error ? e.message : String(e) });
      continue;
    }
    if (task.validation.status === 'forkastet') {
      rejected.push({ templateId: tpl.id, reason: task.validation.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join('; ') });
      continue;
    }
    if (pool.some((p) => tooSimilar(p, task))) continue;
    if (req.maxMinutes && minutes + task.estMinutes > req.maxMinutes && out.length > 0) break;
    out.push(task);
    pool.push(task);
    lastKeys.push(tpl.id);
    minutes += task.estMinutes;
  }
  let note: string | undefined;
  if (out.length < req.count) note = `Laget ${out.length} av ${req.count} oppgaver. ${req.maxMinutes && minutes >= (req.maxMinutes ?? 0) * 0.8 ? 'Tidsrammen er fylt.' : 'Malene for dette valget ga ikke flere tydelig forskjellige oppgaver.'}`;
  return { tasks: out, rejected, note };
}

export function availableStyles(familyIds: string[]): GenStyle[] {
  const s = new Set<GenStyle>();
  for (const id of familyIds) getFamily(id)?.templates.forEach((t) => s.add(t.style));
  return [...s];
}

export function levelsFor(familyId: string): VariationLevel[] {
  const f = getFamily(familyId);
  return f ? [...new Set(f.templates.filter((t) => t.style === 'standard').map((t) => t.level))].sort() : [];
}

export const LEVEL_LABEL: Record<VariationLevel, string> = {
  1: 'Samme metode, nye tall',
  2: 'Samme kompetanse, annen innpakning',
  3: 'Endret forutsetning',
  4: 'Blandet eksamensoppgave',
};

export const STYLE_LABEL: Record<GenStyle, string> = {
  standard: 'Vanlig oppgave',
  delferdighet: 'Kort delferdighet',
  fading: 'Gradvis færre løsningssteg',
  'finn-feilen': 'Finn og forklar feilen',
  eksempel: 'Gjennomarbeidet eksempel',
};

export { FAMILIES };
