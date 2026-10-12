// Ferdighetsevidens og mestringsbilde. Enkle, synlige beslutningsregler, ingen
// prosenter. Hjelp registreres slik at oppgaver løst med mye støtte ikke telles
// som selvstendig mestring. Usikre avlesninger gir «uavklart», ikke svakhet.

import type { Attempt, Evidence, EvidenceOutcome, GeneratedTask, GenPart, PartAssessment } from '../domain/types';
import { newId, nowIso } from '../domain/types';
import { skillName } from '../families/skills';

export const MASTERY_RULES = [
  'Selvstendig betyr: riktig metode og riktig svar uten mer hjelp enn et lite hint, og uten å ha sett løsningen først.',
  'Med støtte betyr: riktig til slutt, men etter første steg, forklaring, eksempel eller løsning.',
  '«Vist igjen etter pause» krever to selvstendige løsninger med minst 20 timer imellom.',
  '«Vist i annerledes oppgave» krever en selvstendig løsning på en oppgave med annen struktur (annen innpakning, endret forutsetning, blandet oppgave eller eksamensmodus).',
  'Flere nesten like oppgaver fra samme mal samme dag teller som repetisjon og gir ikke ny evidens for de høyere nivåene.',
  'Usikker bildeavlesning, uklar inndata eller en AI-vurdering som er usikker, registreres som uavklart og påvirker ikke bildet.',
  'Selvvurdering av forklaringer teller ikke som dokumentert mestring.',
];

export function supportLevel(att: Attempt, partId: string): number {
  return att.help.filter((h) => h.partId === partId || !h.partId).reduce((m, h) => Math.max(m, h.level), 0);
}

const DEV_SKILL: Record<string, string> = {
  'ganget-i-stedet-for-delt': 'alg.isolere',
  'delt-feil-vei': 'alg.isolere',
  'ugyldig-omforming': 'alg.isolere',
  'feil-fortegn-svar': 'alg.isolere',
  'fortegnsfeil-flytting': 'alg.flytte',
  'regnefeil-konstant': 'alg.flytte',
  'regnefeil-koeffisient': 'alg.flytte',
  regnefeil: 'alg.innsetting',
};

function outcomeFor(skill: string, part: GenPart, a: PartAssessment, independent: boolean): { outcome: EvidenceOutcome; basis: string } | null {
  if (a.uncertain && a.method.verdict === 'uavklart') return { outcome: 'uavklart', basis: 'Avlesning eller inndata var uklar.' };
  const pos = (basis: string): { outcome: EvidenceOutcome; basis: string } => ({ outcome: independent ? 'selvstendig-riktig' : 'riktig-med-støtte', basis });
  const cp = a.method.checkpoints.filter((c) => c.skill === skill);
  const defs = part.methodCheckpoints.filter((c) => c.skill === skill);
  const ansOk = a.answer.verdict === 'riktig';
  const ip = a.interpretation;
  const dev = a.method.firstDeviation;
  // Forklaringer vurderes mot vurderingsrammen.
  if (part.kind === 'forklaring' && ip && (part.skills[0] === skill || cp.some((c) => c.shown === null))) {
    if (ip.basis === 'selvvurdering') return { outcome: 'uavklart', basis: 'Selvvurdert forklaring.' };
    if (ip.basis !== 'ai-vurdering') return null;
    if (ip.verdict === 'uavklart') return { outcome: 'uavklart', basis: 'AI-vurderingen var usikker.' };
    if (ip.verdict === 'oppfylt') return pos('Forklaringen oppfylte de nødvendige punktene (AI-vurdering).');
    if (ip.verdict === 'delvis') return { outcome: 'delvis', basis: 'Forklaringen var delvis dekkende (AI-vurdering).' };
    return { outcome: 'ikke-riktig', basis: 'Forklaringen manglet nødvendige punkter (AI-vurdering).' };
  }
  // Flervalg: riktig alternativ er evidens (svakere enn en utregning, men selvstendig når ingen hjelp er brukt).
  if (part.kind === 'flervalg') {
    if (ansOk) return pos('Valgte riktig alternativ.');
    if (a.answer.verdict === 'feil') return { outcome: 'ikke-riktig', basis: 'Valgte feil alternativ.' };
    return null;
  }
  // Ferdigheten der første avvik skjedde.
  if (dev && !dev.needsReadingConfirmation && DEV_SKILL[dev.kind] === skill) return { outcome: 'ikke-riktig', basis: `Første avvik (linje ${dev.line + 1}): ${dev.detail}` };
  if (cp.length) {
    if (cp.some((c) => c.shown === true)) return pos(`Viste: ${cp.filter((c) => c.shown).map((c) => c.label.toLowerCase()).join(', ')}.`);
    if (dev) return null; // ikke nådd på grunn av en tidligere feil
    const required = defs.some((d) => d.required);
    if (ansOk && required) return { outcome: 'uavklart', basis: 'Riktig svar, men steget ble ikke vist.' };
    return null;
  }
  if (ansOk) return a.method.verdict === 'riktig' ? pos('Riktig svar med riktig metode.') : { outcome: 'riktig-med-støtte', basis: 'Riktig svar uten vist metode.' };
  if (a.answer.verdict === 'delvis') return { outcome: 'delvis', basis: 'Delvis riktig svar.' };
  if (dev) return { outcome: a.method.checkpoints.some((c) => c.shown) ? 'delvis' : 'ikke-riktig', basis: `Svaret ble feil på grunn av steget i linje ${dev.line + 1}.` };
  if (a.answer.verdict === 'feil') return { outcome: 'ikke-riktig', basis: 'Feil svar.' };
  return null;
}

export function evidenceForPart(att: Attempt, task: GeneratedTask | undefined, part: GenPart, a: PartAssessment, previous: Evidence[], context: Evidence['context'], ref: { type: 'gen' | 'subtask'; id: string }, structureKey: string, level: number): Evidence[] {
  const support = supportLevel(att, part.id);
  // Har studenten sagt at svaret var gjettet, teller det ikke som selvstendig mestring.
  const independent = support <= 1 && !att.sawSolution && att.confidence !== 'gjettet';
  const skills = [...new Set([...part.skills, ...part.methodCheckpoints.map((c) => c.skill)])];
  const out: Evidence[] = [];
  const now = nowIso();
  for (const skill of skills) {
    const o = outcomeFor(skill, part, a, independent);
    if (!o) continue;
    const prev = previous.filter((e) => e.skillId === skill && !e.voided);
    const sameTplRecent = prev.find((e) => e.structureKey === structureKey && Date.now() - Date.parse(e.at) < 20 * 3600e3 && e.outcome === 'selvstendig-riktig');
    const sameTpl = prev.find((e) => e.structureKey === structureKey);
    out.push({
      id: newId('ev'),
      kind: 'evidence',
      courseId: att.courseId,
      createdAt: now,
      updatedAt: now,
      demo: att.demo,
      skillId: skill,
      attemptId: att.id,
      taskRef: { ...ref, partId: part.id },
      familyKbId: task?.familyKbId,
      at: now,
      outcome: o.outcome,
      supportLevel: support,
      sawSolution: att.sawSolution,
      variationLevel: level,
      structureKey,
      // Flervalg viser ikke overføring til en ny oppgavestruktur (man kan gjenkjenne svaret).
      novelty: sameTplRecent ? 'repetisjon' : sameTpl || part.kind === 'flervalg' ? 'samme-mal' : 'ny-struktur',
      context,
      basis: `${o.basis}${support > 1 ? ` Brukte hjelp (nivå ${support}).` : ''}${att.confidence === 'gjettet' ? ' Studenten oppga at svaret var gjettet.' : ''}`,
    });
  }
  return out;
}

export interface SkillFacets {
  skillId: string;
  name: string;
  examined: boolean;
  withSupport: boolean;
  independent: boolean;
  afterPause: boolean;
  transfer: boolean;
  recentStruggle: boolean;
  lastOutcome?: EvidenceOutcome;
  lastAt?: string;
  lastIndependentAt?: string;
  evidence: Evidence[];
  stage: 0 | 1 | 2 | 3 | 4;
  nextCheck: string;
}

export const STAGE_LABELS = ['Ikke undersøkt ennå', 'Gjennomført med støtte', 'Vist selvstendig på en ny oppgave', 'Vist igjen etter en pause', 'Vist i en annerledes eller kombinert oppgave'];

/** Tekst for nivået, der «prøvd» og «uavklart» skilles fra «ikke undersøkt». */
export function stageLabel(f: SkillFacets): string {
  if (f.stage > 0 || !f.examined) return STAGE_LABELS[f.stage];
  if (f.evidence.every((e) => e.outcome === 'uavklart')) return 'Uavklart så langt (teller ikke)';
  return 'Prøvd, ikke vist ennå';
}

export function facetsFor(skillId: string, all: Evidence[]): SkillFacets {
  const ev = all.filter((e) => e.skillId === skillId && !e.voided).sort((a, b) => a.at.localeCompare(b.at));
  const indep = ev.filter((e) => e.outcome === 'selvstendig-riktig' && e.novelty !== 'repetisjon');
  const indepAll = ev.filter((e) => e.outcome === 'selvstendig-riktig');
  let afterPause = false;
  for (let i = 0; i < indepAll.length && !afterPause; i++) for (let j = i + 1; j < indepAll.length; j++) if (Date.parse(indepAll[j].at) - Date.parse(indepAll[i].at) >= 20 * 3600e3) afterPause = true;
  const firstKey = indep[0]?.structureKey;
  const transfer = indep.some((e) => (e.variationLevel >= 2 || e.context === 'eksamen') && e.structureKey !== firstKey) || new Set(indep.map((e) => e.structureKey)).size >= 2;
  const recent = ev.filter((e) => e.outcome !== 'uavklart').slice(-3);
  const recentStruggle = recent.length > 0 && recent[recent.length - 1].outcome === 'ikke-riktig';
  const withSupport = ev.some((e) => e.outcome === 'riktig-med-støtte');
  const independent = indep.length > 0;
  const stage: SkillFacets['stage'] = transfer && independent ? 4 : afterPause ? 3 : independent ? 2 : withSupport ? 1 : 0;
  const last = ev[ev.length - 1];
  let nextCheck = 'Prøv en første oppgave for å se hvor du står.';
  if (ev.length && !independent) nextCheck = 'Løs en ny oppgave av samme type uten hjelp.';
  else if (independent && !afterPause) nextCheck = 'Vis det igjen etter en pause (i morgen eller senere).';
  else if (afterPause && !transfer) nextCheck = 'Prøv en annerledes formulert eller blandet oppgave.';
  else if (transfer) nextCheck = 'Hold det ved like med blandede oppgaver og eksamensmodus.';
  if (recentStruggle) nextCheck = 'Siste forsøk gikk ikke. Gå gjennom hjelpen og prøv en ny variant.';
  return {
    skillId,
    name: skillName(skillId),
    examined: ev.length > 0,
    withSupport,
    independent,
    afterPause,
    transfer: transfer && independent,
    recentStruggle,
    lastOutcome: last?.outcome,
    lastAt: last?.at,
    lastIndependentAt: indepAll[indepAll.length - 1]?.at,
    evidence: ev,
    stage,
    nextCheck,
  };
}

export function voidEvidenceForAttempt(all: Evidence[], attemptId: string, reason: string): Evidence[] {
  return all.filter((e) => e.attemptId === attemptId && !e.voided).map((e) => ({ ...e, voided: { reason, at: nowIso() } }));
}

export interface SessionSummary {
  selv: string[];
  hjelp: string[];
  neste: string[];
}

export function summarizeSession(evidence: Evidence[], nextReason: string): SessionSummary {
  const bySkill = new Map<string, Evidence[]>();
  for (const e of evidence) if (!e.voided) bySkill.set(e.skillId, [...(bySkill.get(e.skillId) ?? []), e]);
  const selv: string[] = [];
  const hjelp: string[] = [];
  for (const [skill, ev] of bySkill) {
    const ind = ev.filter((e) => e.outcome === 'selvstendig-riktig');
    const sup = ev.filter((e) => e.outcome === 'riktig-med-støtte' || e.outcome === 'delvis' || e.outcome === 'ikke-riktig');
    const structs = new Set(ind.map((e) => e.structureKey)).size;
    if (ind.length) selv.push(`${skillName(skill)}: selv${ind.length > 1 ? ` i ${ind.length} oppgaver` : ''}${structs > 1 ? ` med ${structs} ulike oppgavetyper` : ''}.`);
    else if (sup.length) hjelp.push(`${skillName(skill)}: ${sup.some((e) => e.outcome === 'ikke-riktig') ? 'ikke riktig ennå' : 'riktig med støtte'}.`);
  }
  const unclear = evidence.filter((e) => e.outcome === 'uavklart').length;
  if (unclear) hjelp.push(`${unclear} vurdering${unclear === 1 ? '' : 'er'} er uavklart (utydelig avlesning, selvvurdering eller manglende steg) og teller ikke.`);
  return { selv, hjelp, neste: [nextReason] };
}
