// Kobling av sensorveiledninger til riktig eksamenssett. Koblingen bygger på
// innhold (emnekode, år/termin, oppgavenummer og tall som stemmer), aldri
// bare på filnavn. Offisielle kriterier merkes med kilde, og konflikter mellom
// veiledning og matematisk kontroll vises.

import type { SourceDoc, SubTask, Criterion, Conflict } from '../domain/types';
import type { GuideItem } from './segment';
import { guideClaims } from './segment';

export interface LinkCandidate {
  examDocId: string;
  score: number;
  basis: string[];
  signals: number;
}

export function scoreGuideLink(guide: SourceDoc, guideText: string, items: GuideItem[], exam: SourceDoc, examText: string, examSubtasks: SubTask[]): LinkCandidate {
  const basis: string[] = [];
  let score = 0;
  let signals = 0;
  const gl = guideText.toLowerCase();
  if (exam.meta.examCode && gl.includes(exam.meta.examCode.toLowerCase())) {
    score += 3;
    signals++;
    basis.push(`Emnekoden ${exam.meta.examCode} står i veiledningen.`);
  }
  if (guide.meta.year && exam.meta.year && guide.meta.year === exam.meta.year && guide.meta.term === exam.meta.term) {
    score += 1.5;
    signals++;
    basis.push(`Samme år og termin (${exam.meta.term} ${exam.meta.year}).`);
    if (guide.meta.examType === exam.meta.examType && exam.meta.examType !== 'ukjent') {
      score += 0.5;
      basis.push(`Samme eksamenstype (${exam.meta.examType}).`);
    }
  } else if (guide.meta.year && exam.meta.year && guide.meta.year !== exam.meta.year) {
    score -= 2;
    basis.push(`Ulikt år (${guide.meta.year} mot ${exam.meta.year}).`);
  }
  const labels = new Set(examSubtasks.map((s) => s.label));
  const taskNos = new Set(examSubtasks.map((s) => String(s.taskNo)));
  if (items.length) {
    const hit = items.filter((i) => labels.has(i.label) || (!i.sub && taskNos.has(String(i.taskNo)))).length;
    const frac = hit / items.length;
    score += 2 * frac;
    if (frac > 0.6) signals++;
    basis.push(`${hit} av ${items.length} oppgavehenvisninger i veiledningen finnes i eksamenssettet.`);
  }
  // Tall i veiledningen som stemmer med beregninger fra eksamensteksten.
  let numHits = 0;
  let numTotal = 0;
  for (const it of items) {
    const st = examSubtasks.find((s) => s.label === it.label);
    const answers = st?.analysis.computed?.answers ?? [];
    if (!answers.length) continue;
    for (const c of guideClaims(it.text)) {
      numTotal++;
      if (answers.some((a) => Math.abs(Number(evalRat(a.value)) - c.value) <= 0.5 * Math.pow(10, -c.decimals) + 1e-9)) numHits++;
    }
  }
  if (numHits >= 2) {
    score += Math.min(3, numHits * 0.75);
    signals++;
    basis.push(`${numHits} av ${numTotal} tall i veiledningen stemmer med beregninger fra oppgaveteksten.`);
  }
  // Uttrykk som går igjen (f.eks. «800 + 15»).
  const exprs = [...examText.matchAll(/\d+\s*[−+-]\s*\d+\s*[A-Z]/g)].map((m) => m[0].replace(/\s/g, ''));
  const shared = exprs.filter((e) => guideText.replace(/\s/g, '').includes(e.replace(/[A-Z]$/, '')));
  if (shared.length) {
    score += 0.5;
    basis.push(`Samme tall eller uttrykk går igjen (${[...new Set(shared)].slice(0, 2).join(', ')}).`);
  }
  if (guide.fileName && exam.fileName && similarName(guide.fileName, exam.fileName)) basis.push('Filnavnene ligner, men det brukes ikke som bevis.');
  return { examDocId: exam.id, score, basis, signals };
}

function similarName(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/\.[a-z]+$/, '').replace(/[^a-z0-9]/g, '');
  const x = n(a);
  const y = n(b);
  return x.slice(0, 6) === y.slice(0, 6);
}

export function evalRat(v: string): number {
  if (v.includes('/')) {
    const [a, b] = v.split('/');
    return Number(a) / Number(b);
  }
  return Number(v);
}

export function chooseLink(cands: LinkCandidate[]): { chosen?: LinkCandidate; ambiguous: boolean } {
  const sorted = [...cands].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  if (!top || top.score < 3 || top.signals < 2) return { ambiguous: true };
  if (sorted[1] && sorted[1].score > top.score - 1) return { chosen: top, ambiguous: true };
  return { chosen: top, ambiguous: false };
}

/** Offisielle kriterier fra en veiledning, med kilde. */
export function officialCriteria(guide: SourceDoc, item: GuideItem): Criterion[] {
  const sentences = item.lines
    .flatMap((l) => l.text.split(/(?<=[.!?])\s+(?=[A-ZÆØÅ])/).map((t) => ({ t: t.trim(), page: l.page })))
    .filter((s) => s.t.length > 3);
  return sentences.map((s, i) => ({
    id: `off-${guide.id}-${item.label}-${i}`,
    text: s.t,
    basis: 'offisielt' as const,
    source: { docId: guide.id, docVersion: guide.version, pdfPage: s.page, quote: s.t, taskLabel: item.label },
  }));
}

/** Sammenlikner påstander i veiledningen med matematisk kontroll. */
export function findConflicts(guide: SourceDoc, item: GuideItem, st: SubTask): { conflicts: Conflict[]; agreements: string[] } {
  const answers = st.analysis.computed?.answers ?? [];
  const claims = guideClaims(item.text);
  const conflicts: Conflict[] = [];
  const agreements: string[] = [];
  if (!answers.length || !claims.length) return { conflicts, agreements };
  const unitOf = (u?: string): string | undefined => (u === '%' ? '%' : u === 'prosentpoeng' ? 'prosentpoeng' : u === 'kr' ? 'kr' : u ? 'mengde' : undefined);
  const close = (claim: { value: number; decimals: number }, v: number) => Math.abs(claim.value - v) <= 0.5 * Math.pow(10, -claim.decimals) + 1e-9;
  for (const a of answers) {
    const v = evalRat(a.value);
    const bySym = a.symbol ? claims.filter((c) => c.symbol === a.symbol) : [];
    const byUnit = !bySym.length && a.unit ? claims.filter((c) => !c.symbol && unitOf(c.unit) === a.unit) : [];
    const relevant = bySym.length ? bySym : byUnit;
    if (!relevant.length) continue;
    if (relevant.some((c) => close(c, v))) {
      agreements.push(`${a.label}: veiledningen (${relevant.find((c) => close(c, v))!.raw.trim()}) stemmer med kontrollen (${a.display}).`);
      continue;
    }
    // Ved flere svar med samme enhet: bare konflikt hvis påstanden ikke passer noen av dem.
    const sameUnit = answers.filter((x) => x.unit === a.unit);
    const orphan = relevant.filter((c) => !sameUnit.some((x) => close(c, evalRat(x.value))));
    if (!orphan.length) continue;
    const c = orphan[0];
    conflicts.push({
      id: `konf-${guide.id}-${st.label}-${a.label}`,
      description: `Veiledningen oppgir ${c.raw.replace(/^(=|≈|med|er|på|bærer)\s*/, '').trim()} for «${a.label}», men beregning fra oppgaveteksten gir ${a.display}${a.unit === '%' && !a.display.includes('%') ? ' %' : ''}.`,
      officialValue: c.raw.trim(),
      computedValue: a.display,
      source: { docId: guide.id, docVersion: guide.version, pdfPage: item.page, quote: item.text.slice(0, 200), taskLabel: item.label },
      status: 'åpen',
    });
  }
  return { conflicts, agreements };
}

/** Forklarer en mulig årsak til konflikten når mønsteret er kjent. */
export function explainConflict(c: Conflict, st: SubTask): string | undefined {
  const p = st.analysis.params;
  const off = parseFloat(c.officialValue.replace(/[^\d,.-]/g, '').replace(',', '.'));
  if (st.analysis.familyKbId === 'prosent-endring' && p?.V0 && p?.V1 && Number.isFinite(off)) {
    const V0 = evalRat(p.V0);
    const V1 = evalRat(p.V1);
    const wrongBase = Math.abs(((V1 - V0) / V1) * 100);
    if (Math.abs(wrongBase - off) < 0.06) return `Tallet i veiledningen tilsvarer endringen delt på sluttverdien (${V1}) i stedet for startverdien (${V0}). Det ser ut som en grunnlagsfeil i veiledningen.`;
  }
  return undefined;
}

/** Offisielle kriterier fra veiledningsteksten som står sammen med spørsmålet (samme dokument). */
export function officialFromGuide(doc: SourceDoc, label: string, lines: { page: number; text: string }[]): Criterion[] {
  const text = lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  // Setninger; punktlister beholdes som egne punkter.
  const parts = text
    .split(/(?<=[.!?])\s+(?=[A-ZÆØÅ«"“(•–-])|\s+(?=•)|\s+(?=–\s[A-ZÆØÅ])/)
    .map((t) => t.replace(/^[•–-]\s*/, '').trim())
    .filter((t) => t.length > 3);
  const pageOf = (t: string) => lines.find((l) => l.text.includes(t.slice(0, 18)))?.page ?? lines[0]?.page ?? 1;
  return parts.map((t, i) => ({
    id: `off-${doc.id}-${label}-${i}`,
    text: t,
    basis: 'offisielt' as const,
    source: { docId: doc.id, docVersion: doc.version, pdfPage: pageOf(t), quote: t.slice(0, 200), taskLabel: label },
  }));
}
