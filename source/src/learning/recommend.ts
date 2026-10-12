import { isExamSet } from '../domain/types';
// Enkel, forklarbar prioriteringsregel for hva studenten bør øve på nå.
// Ikke en «optimert forventet poenggevinst»: bare synlige vekter.

import type { SourceDoc, SubTask, Evidence, SessionRec, Course, Family } from '../domain/types';
import { FAMILIES, getFamily } from '../families';
import { BASIC_SKILLS, skillName } from '../families/skills';
import { facetsFor } from './mastery';
import { examSets } from '../analysis/compare';

export interface FamilyPriority {
  kbId: string;
  name: string;
  relevance: number;
  inSets: number;
  denominator: number;
  need: number;
  due: boolean;
  recentLoad: number;
  score: number;
  reason: string;
  weakSkill?: string;
  inExams: boolean;
}

export type RecKind = 'diagnose' | 'grunnleggende' | 'drill' | 'familie' | 'repetisjon' | 'blandet' | 'eksamen' | 'analyse' | 'last-opp';

export interface Recommendation {
  kind: RecKind;
  title: string;
  reason: string;
  families?: string[];
  level?: number | 'blandet';
  style?: string;
  count?: number;
  skills?: string[];
}

export const PRIORITY_RULE = 'Prioritet = 0,5 × relevans (andel av dine sammenliknbare, analyserte sett der familien forekommer) + 0,35 × behov (andel av familiens kjerneferdigheter du ikke har vist selvstendig) + 0,15 × repetisjon (vist selvstendig, men ikke etter pause) − 0,2 × hvis de tre siste øktene var samme familie. Familier som ikke finnes i eksamenene dine, men står i læringsutbyttet, får relevans 0,3.';

export function familyPriorities(input: { docs: SourceDoc[]; subtasks: SubTask[]; families: Family[]; evidence: Evidence[]; sessions: SessionRec[]; outcomeFamilies?: string[] }): FamilyPriority[] {
  const sets = examSets(input.docs, input.subtasks).filter((s) => s.analyzed && s.comparable && !s.doc.reserved);
  const denom = sets.length;
  const out: FamilyPriority[] = [];
  for (const kb of FAMILIES) {
    const inSets = sets.filter((s) => s.subtasks.some((st) => st.analysis.familyKbId === kb.id)).length;
    const inOutcomes = input.outcomeFamilies?.includes(kb.id) ?? false;
    if (!inSets && !inOutcomes && denom > 0) continue;
    const relevance = denom ? inSets / denom : 0.3;
    const core = kb.skills.filter((s) => !BASIC_SKILLS.includes(s));
    const facets = core.map((s) => facetsFor(s, input.evidence));
    const notIndep = facets.filter((f) => !f.independent);
    const need = core.length ? notIndep.length / core.length : 1;
    const due = facets.some((f) => f.independent && !f.afterPause && f.lastIndependentAt && Date.now() - Date.parse(f.lastIndependentAt) > 20 * 3600e3);
    const last3 = input.sessions.slice(-3);
    const recentLoad = last3.length === 3 && last3.every((s) => s.plan.families.length === 1 && s.plan.families[0] === kb.id) ? 1 : 0;
    const score = 0.5 * (inSets ? relevance : inOutcomes ? 0.3 : relevance) + 0.35 * need + 0.15 * (due ? 1 : 0) - 0.2 * recentLoad;
    const weak = facets.find((f) => f.recentStruggle) ?? notIndep.find((f) => f.examined) ?? notIndep[0];
    const parts: string[] = [];
    if (inSets) parts.push(`Relevant i ${inSets} av ${denom} sammenliknbare sett`);
    else if (inOutcomes) parts.push('Står i læringsutbyttet, men ikke i de analyserte settene');
    else parts.push('Ingen analyserte sett ennå');
    if (weak?.recentStruggle) parts.push(`siste forsøk på «${lcName(weak.name)}» gikk ikke`);
    else if (weak?.withSupport) parts.push(`du har klart «${lcName(weak.name)}» med støtte, men ikke vist det selvstendig`);
    else if (weak && !weak.examined) parts.push(`«${lcName(weak.name)}» er ikke undersøkt ennå`);
    else if (due) parts.push('klar for repetisjon etter pause');
    else if (!notIndep.length) parts.push('kjerneferdighetene er vist selvstendig');
    if (recentLoad) parts.push('du har trent mye på denne i det siste');
    out.push({ kbId: kb.id, name: kb.shortName, relevance, inSets, denominator: denom, need, due, recentLoad, score, reason: parts.join('; ') + '.', weakSkill: weak?.skillId, inExams: inSets > 0 });
  }
  return out.sort((a, b) => b.score - a.score);
}

export function recommend(input: { course?: Course; docs: SourceDoc[]; subtasks: SubTask[]; families: Family[]; evidence: Evidence[]; sessions: SessionRec[]; outcomeFamilies?: string[] }): { primary: Recommendation; alternatives: Recommendation[]; priorities: FamilyPriority[] } {
  const pr = familyPriorities(input);
  const alts: Recommendation[] = [];
  const exams = input.docs.filter((d) => isExamSet(d) && d.status !== 'duplikat');
  const pendingHelp = input.docs.filter((d) => d.status === 'trenger-hjelp').length;
  if (!exams.length) {
    return {
      primary: { kind: 'last-opp', title: 'Last opp tidligere eksamener', reason: 'Analysen og anbefalingene bygger på dine egne eksamenssett.' },
      alternatives: [{ kind: 'grunnleggende', title: 'Start helt grunnleggende', reason: 'Du kan trene grunnferdigheter mens du samler eksamenene.', families: FAMILIES.map((f) => f.id).slice(0, 1) }],
      priorities: pr,
    };
  }
  const anyEvidence = input.evidence.some((e) => !e.voided);
  const basicStruggle = BASIC_SKILLS.map((s) => facetsFor(s, input.evidence)).filter((f) => f.recentStruggle);
  const top = pr[0];
  let primary: Recommendation;
  if (!anyEvidence) {
    primary = { kind: 'diagnose', title: 'Finn nivået mitt', reason: 'Vi vet ingenting om nivået ditt ennå. Noen korte oppgaver fra familiene i eksamenene dine viser hvor du bør starte.', families: pr.filter((p) => p.inExams).map((p) => p.kbId) };
  } else if (basicStruggle.length) {
    primary = { kind: 'drill', title: `Kort trening: ${lcName(basicStruggle[0].name)}`, reason: `Siste forsøk stoppet på «${lcName(basicStruggle[0].name)}». Det er en forutsetning for flere eksamensoppgaver, så en kort, målrettet runde lønner seg.`, skills: basicStruggle.map((f) => f.skillId), families: [top?.kbId ?? 'likevekt-lineaer'], style: 'delferdighet', count: 3 };
  } else if (top && top.need > 0) {
    const lvl = top.need > 0.6 ? 1 : 2;
    primary = { kind: 'familie', title: `Tren: ${top.name}`, reason: top.reason, families: [top.kbId], level: lvl, count: 3 };
  } else if (pr.some((p) => p.due)) {
    const d = pr.find((p) => p.due)!;
    primary = { kind: 'repetisjon', title: `Repetisjon: ${d.name}`, reason: `Du har vist dette selvstendig før. En ny oppgave etter pausen viser om det sitter.`, families: [d.kbId], level: 2, count: 2 };
  } else {
    primary = { kind: 'blandet', title: 'Blandede eksamensoppgaver', reason: 'Kjerneferdighetene i familiene dine er vist selvstendig. Blandede oppgaver trener valg av framgangsmåte.', families: pr.map((p) => p.kbId), level: 'blandet', count: 3 };
  }
  for (const p of pr.slice(0, 3)) if (!primary.families || primary.families.length !== 1 || primary.families[0] !== p.kbId) alts.push({ kind: 'familie', title: `Tren: ${p.name}`, reason: p.reason, families: [p.kbId], level: p.need > 0.6 ? 1 : 2, count: 3 });
  if (anyEvidence) alts.push({ kind: 'eksamen', title: 'Prøv eksamensmodus', reason: 'Tidsbegrenset prøve uten hjelp. Viser hva du klarer selvstendig.' });
  if (pendingHelp) alts.push({ kind: 'analyse', title: 'Fullfør analysen', reason: `${pendingHelp} dokument${pendingHelp === 1 ? '' : 'er'} trenger hjelp (f.eks. tekst på en skannet side).` });
  return { primary, alternatives: alts.slice(0, 4), priorities: pr };
}

export function uncoveredOutcomes(outcomes: { code: string; text: string; kbIds: string[] }[], subtasks: SubTask[]): { code: string; text: string; reason: string }[] {
  const present = new Set(subtasks.map((s) => s.analysis.familyKbId).filter(Boolean));
  return outcomes.filter((o) => !o.kbIds.some((k) => present.has(k))).map((o) => ({ code: o.code, text: o.text, reason: o.kbIds.length ? `Knyttet til «${getFamily(o.kbIds[0])?.shortName}», men ikke funnet i de analyserte settene.` : 'Ingen kjent oppgavefamilie i appen dekker dette ennå.' }));
}

export function weakSkillText(id?: string) {
  return id ? skillName(id) : '';
}

/** Små forbokstav midt i en setning, men ikke for forkortelser som «KVL» eller «RC-krets». */
function lcName(n: string): string {
  if (n.length > 1 && n[1] === n[1].toLowerCase() && n[1] !== n[1].toUpperCase()) return n[0].toLowerCase() + n.slice(1);
  return n;
}
