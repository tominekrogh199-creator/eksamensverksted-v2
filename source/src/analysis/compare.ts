import { isExamSet } from '../domain/types';
// Sammenlikning mellom eksamenssett: samme oppgavenummer og samme faglige
// oppgavefamilie. Tellere viser alltid teller og nevner, og historisk
// frekvens omgjøres aldri til sannsynlighet for neste eksamen.

import type { SourceDoc, SubTask, Family, PageRec } from '../domain/types';
import { getFamily, FAMILIES } from '../families';
import { evalRat } from './guide';

export interface SetInfo {
  doc: SourceDoc;
  label: string;
  sortKey: number;
  analyzed: boolean;
  comparable: boolean;
  note?: string;
  subtasks: SubTask[];
}

export interface FamilyRow {
  key: string;
  familyId?: string;
  kbId?: string;
  name: string;
  basis: Family['basis'] | 'ukjent';
  cells: Record<string, SubTask[]>;
  setCount: number;
  denominator: number;
  years: number[];
  subtaskCount: number;
  positions: number[];
  commonStructure: string[];
  surfaceOnly: string[];
  differences: { subtask: SubTask; setLabel: string; changes: string[] }[];
  combos: string[];
  difficulty: { text: string; basis: 'dokumentert' | 'faglig-vurdering' };
  pointsNote: string;
}

export interface ComparisonModel {
  sets: SetInfo[];
  comparable: SetInfo[];
  pending: SetInfo[];
  excluded: SetInfo[];
  rows: FamilyRow[];
  positions: number[];
  unknown: SubTask[];
}

const TERM_ORDER: Record<string, number> = { vår: 1, sommer: 2, høst: 3, ukjent: 0 };

export function examSets(docs: SourceDoc[], subtasks: SubTask[], includeKonte = true): SetInfo[] {
  return docs
    .filter((d) => isExamSet(d) && d.status !== 'duplikat' && d.status !== 'erstattet' && !d.supersededBy)
    .map((d) => {
      const sts = subtasks.filter((s) => s.docId === d.id && s.docVersion === d.version).sort((a, b) => a.taskNo - b.taskNo || a.sub.localeCompare(b.sub, 'nb', { numeric: true }));
      const analyzed = d.stages.analyse.status === 'ferdig' && sts.length > 0;
      const comparable = d.meta.comparable !== false && (includeKonte || d.meta.examType !== 'konte');
      const label = d.meta.setLabel || `${d.meta.term !== 'ukjent' ? d.meta.term + ' ' : ''}${d.meta.year ?? 'ukjent år'}`;
      const sortKey = (d.meta.year ?? 0) * 10 + (TERM_ORDER[d.meta.term] ?? 0) + (d.meta.examType === 'konte' ? 0.5 : 0);
      let note: string | undefined;
      if (d.meta.comparable === false) note = d.meta.comparabilityNote || 'Merket som ikke sammenliknbar (f.eks. annen eksamensform).';
      else if (!includeKonte && d.meta.examType === 'konte') note = 'Kontinuasjonseksamen er holdt utenfor etter ditt valg.';
      else if (!analyzed) note = 'Ikke ferdig analysert ennå.';
      return { doc: d, label, sortKey, analyzed, comparable, note, subtasks: sts };
    })
    .sort((a, b) => a.sortKey - b.sortKey);
}

function describeChanges(st: SubTask, ref: SubTask | undefined, setLabel: string, figurePages: boolean): string[] {
  const out: string[] = [];
  const a = st.analysis;
  if (ref && ref.id !== st.id) {
    const pa = a.params ?? {};
    const pb = ref.analysis.params ?? {};
    const keys = Object.keys(pa).filter((k) => k in pb && pa[k] !== pb[k] && !isNaN(evalRat(pa[k])));
    if (keys.length) out.push(`Andre tall (${keys.map((k) => `${k} = ${fmt(pa[k])}`).join(', ')})`);
    if (a.intentId && ref.analysis.intentId && a.intentId !== ref.analysis.intentId) out.push(`Annet spørsmål: ${intentLabel(a.familyKbId, a.intentId)}`);
  }
  if (figurePages || st.figures.length) out.push('Representasjon: figur som må leses');
  if (a.taskType.value.includes('forklaring') || a.taskType.value.includes('drøfting')) out.push('Krever forklaring med ord');
  if (/maksimalpris|minstepris|avgift|tilbake til|prosentpoeng/i.test(st.text)) out.push('Endret forutsetning i teksten');
  const others = a.skills.value.filter((s) => !(getFamily(a.familyKbId)?.skills ?? []).includes(s));
  if (others.length) out.push(`Kombinert med: ${others.join(', ')}`);
  out.push(`Står som oppgave ${st.label} i ${setLabel}`);
  return out;
}

function fmt(v: string): string {
  const n = evalRat(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
}

function intentLabel(fam?: string, id?: string): string {
  return getFamily(fam)?.intents.find((i) => i.id === id)?.label ?? id ?? '';
}

export function buildComparison(docs: SourceDoc[], subtasks: SubTask[], families: Family[], opts: { includeKonte?: boolean } = {}): ComparisonModel {
  const sets = examSets(docs, subtasks, opts.includeKonte ?? true);
  const comparable = sets.filter((s) => s.comparable && s.analyzed && !s.doc.reserved);
  const pending = sets.filter((s) => !s.analyzed);
  const excluded = sets.filter((s) => !s.comparable || s.doc.reserved);
  const visibleSts = sets.filter((s) => !s.doc.reserved).flatMap((s) => s.subtasks);
  const rows: FamilyRow[] = [];
  const famOf = (st: SubTask) => families.find((f) => f.members.includes(st.id));
  const groups = new Map<string, SubTask[]>();
  for (const st of visibleSts) {
    const f = famOf(st);
    const key = f?.id ?? (st.analysis.familyKbId ? `kb:${st.analysis.familyKbId}` : 'ukjent');
    if (key === 'ukjent') continue;
    groups.set(key, [...(groups.get(key) ?? []), st]);
  }
  for (const [key, sts] of groups) {
    const fam = families.find((f) => f.id === key);
    const kb = getFamily(fam?.kbId ?? sts[0].analysis.familyKbId);
    const cells: Record<string, SubTask[]> = {};
    for (const st of sts) cells[st.docId] = [...(cells[st.docId] ?? []), st];
    const inSets = comparable.filter((s) => cells[s.doc.id]?.length);
    const years = [...new Set(inSets.map((s) => s.doc.meta.year).filter((y): y is number => !!y))];
    const ref = sts[0];
    const differences = sts.map((st) => {
      const set = sets.find((s) => s.doc.id === st.docId)!;
      return { subtask: st, setLabel: set.label, changes: describeChanges(st, ref, set.label, st.figures.length > 0) };
    });
    const combos = [...new Set(sts.flatMap((s) => s.analysis.skills.value))];
    const withPoints = sts.filter((s) => s.analysis.points.official !== undefined);
    const pointsNote = withPoints.length
      ? `Dokumentert poeng/vekt for ${withPoints.length} av ${sts.length} deloppgaver: ${withPoints.map((s) => `${s.label} (${sets.find((x) => x.doc.id === s.docId)?.label}): ${s.analysis.points.official}`).join('; ')}`
      : 'Ingen av deloppgavene har oppgitt poeng.';
    const hasHarder = differences.some((d) => d.changes.some((c) => c.startsWith('Endret forutsetning') || c.startsWith('Representasjon') || c.startsWith('Kombinert')));
    rows.push({
      key,
      familyId: fam?.id,
      kbId: kb?.id,
      name: fam?.name ?? kb?.name ?? 'Ukjent familie',
      basis: fam?.basis ?? 'regelbasert',
      cells,
      setCount: inSets.length,
      denominator: comparable.length,
      years,
      subtaskCount: sts.length,
      positions: [...new Set(sts.map((s) => s.taskNo))].sort(),
      commonStructure: fam?.commonStructure.length ? fam.commonStructure : kb?.solutionStructure ?? [],
      surfaceOnly: fam?.surfaceOnly.length ? fam.surfaceOnly : kb?.surfaceFeatures ?? [],
      differences,
      combos,
      difficulty: {
        text: hasHarder
          ? 'Noen varianter krever flere steg (figur, endret forutsetning eller kombinasjon). Dette er en faglig vurdering; oppgavesettene dokumenterer ikke vanskelighetsgrad.'
          : 'Variantene ser ut til å kreve samme framgangsmåte. Dette er en faglig vurdering, ikke dokumentert.',
        basis: 'faglig-vurdering',
      },
      pointsNote,
    });
  }
  rows.sort((a, b) => b.setCount - a.setCount || a.name.localeCompare(b.name));
  const positions = [...new Set(visibleSts.map((s) => s.taskNo))].sort((a, b) => a - b);
  const unknown = visibleSts.filter((s) => !famOf(s) && !s.analysis.familyKbId);
  return { sets, comparable, pending, excluded, rows, positions, unknown };
}

export function frequencyText(row: FamilyRow, model: ComparisonModel): string {
  const pend = model.pending.length ? ` ${model.pending.length} sett er ikke ferdig analysert og er ikke med i nevneren.` : '';
  return `Forekommer i ${row.setCount} av ${row.denominator} sammenliknbare, analyserte eksamenssett (${row.years.length} ${row.years.length === 1 ? 'år' : 'år'}, ${row.subtaskCount} deloppgaver).${pend}`;
}

/** Oppgavefamilier avledet fra regelbasert gjenkjenning. */
export function deriveRuleFamilies(courseId: string, subtasks: SubTask[], existing: Family[], demo?: boolean): Family[] {
  const out: Family[] = [];
  const now = new Date().toISOString();
  for (const kb of FAMILIES) {
    const members = subtasks.filter((s) => s.analysis.familyKbId === kb.id).map((s) => s.id);
    const id = `fam-${courseId}-${kb.id}`;
    const prev = existing.find((f) => f.id === id);
    if (!members.length) continue;
    out.push({
      id,
      kind: 'family',
      courseId,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      demo,
      kbId: kb.id,
      name: kb.name,
      description: kb.description,
      basis: 'regelbasert',
      members,
      commonStructure: kb.solutionStructure,
      surfaceOnly: kb.surfaceFeatures,
      differences: [],
      skills: kb.skills,
    });
  }
  return out;
}

// ——— Læringsutbytte ———

export interface LearningOutcome {
  code: string;
  text: string;
  kbIds: string[];
  source: { docId: string; pdfPage: number };
}

const LO_KEYWORDS: Record<string, RegExp> = {
  'likevekt-lineaer': /likevekt|tilbud og etterspørsel|markedsmodell/i,
  'likevekt-avgift': /avgift|skatt på vare/i,
  'prosent-endring': /prosent/i,
  'kostnad-lineaer': /kostnad/i,
};

export function extractOutcomes(doc: SourceDoc, pages: PageRec[]): LearningOutcome[] {
  const out: LearningOutcome[] = [];
  for (const p of pages.filter((x) => x.docId === doc.id).sort((a, b) => a.pdfPage - b.pdfPage)) {
    for (const line of p.text.split('\n')) {
      const m = /^\s*(LU\s?\d+|LO\s?\d+|K\d+|F\d+|\d+\.)\s+(.{8,})$/.exec(line.trim());
      if (!m) continue;
      const kbIds = Object.entries(LO_KEYWORDS)
        .filter(([, re]) => re.test(m[2]))
        .map(([k]) => k);
      out.push({ code: m[1].replace(/\s/g, ''), text: m[2].trim(), kbIds, source: { docId: doc.id, pdfPage: p.pdfPage } });
    }
  }
  return out;
}
