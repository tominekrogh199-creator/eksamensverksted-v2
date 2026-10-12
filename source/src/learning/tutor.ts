// Læreren: deterministisk, målrettet hjelp basert på matematikkmotorens
// diagnose, med AI som valgfri utdyping. Hjelpetrinn registreres.

import type { GenPart, PartAttempt, GeneratedTask, Attempt, Evidence, SubTask, Course } from '../domain/types';
import { checkWorkBest, findFirstDeviation } from '../math/check';
import { toRF } from '../math/poly';
import { varsIn } from '../math/parse';
import { statementPlain } from '../math/latex';
import { getFamily, allFormulas, domainOf, familyShort } from '../families';
import { store } from '../state/store';
import { tutorRules } from '../ai/prompts';
import { effectiveLines } from './assess';
import { Rat } from '../math/rational';

export const HELP_LEVELS = [
  { level: 1 as const, type: 'hint' as const, label: 'Lite hint' },
  { level: 2 as const, type: 'første-steg' as const, label: 'Første steg' },
  { level: 3 as const, type: 'forklaring' as const, label: 'Forklaring på steget' },
  { level: 4 as const, type: 'eksempel' as const, label: 'Gjennomarbeidet eksempel' },
  { level: 5 as const, type: 'løsning' as const, label: 'Full løsning' },
];

/** Hva er det meningsfulle neste steget ut fra elevens siste riktige linje? */
export function nextStepHint(part: GenPart, pa: PartAttempt): string {
  if (!part.math) return part.hints.firstStep;
  const el = effectiveLines(pa);
  if (!el.texts.some((t) => t.trim())) return part.hints.firstStep;
  const { checks, cc } = checkWorkBest(el.texts, part.math, { resolutions: pa.resolutions, uncertainLines: el.uncertain, sources: el.sources });
  const dev = findFirstDeviation(checks, cc);
  if (dev && !dev.needsReadingConfirmation) return `Se på steget «${statementPlain(dev.bad.statement)}» i linje ${dev.lineIndex + 1}. ${dev.detail}`;
  const okSts = checks.flatMap((c) => c.statements.filter((s) => s.status === 'ok' || s.status === 'avrundet'));
  const last = okSts[okSts.length - 1];
  if (!last) return part.hints.firstStep;
  const v = part.math.unknown;
  const st = last.statement;
  const vars = new Set(st.sides.flatMap((x) => [...varsIn(x)]));
  if (vars.has('Qd') && vars.has('Qs') && st.sides.length === 2) return 'Sett inn uttrykkene for Qd og Qs fra oppgaven, så får du én likning med P som eneste ukjent.';
  if (st.sides.length === 2) {
    try {
      const L = toRF(st.sides[0], cc.env);
      const R = toRF(st.sides[1], cc.env);
      const lv = L.vars().has(v);
      const rv = R.vars().has(v);
      if (lv && rv) return `Samle alle ledd med ${v} på én side og tallene på den andre. Et ledd som bytter side, skifter fortegn.`;
      const [cst, other] = L.isConst() ? [L, R] : R.isConst() ? [R, L] : [null, null];
      if (cst && other && other.den.isConst()) {
        const co = other.num.univariateCoeffs(v);
        if (co.length === 2 && co[0].isZero()) {
          const m = co[1].div(other.den.constValue());
          if (!m.eq(Rat.ONE)) return `${m.toNo()}${v} betyr ${m.toNo()} ganger ${v}. Del begge sider på ${m.toNo()}, så står ${v} alene.`;
        }
        if (co.length === 2 && !co[0].isZero()) return `Flytt tallet som står sammen med ${v}-leddet over til den andre siden (skift fortegn).`;
      }
      if (st.sides[0].t === 'var' && st.sides[0].name === v && varsIn(st.sides[1]).size === 0) {
        const remaining = (part.targets ?? []).filter((t) => t.symbol !== v && !okSts.some((s) => s.statement.sides[0]?.t === 'var' && (s.statement.sides[0] as { name: string }).name === t.symbol));
        if (part.math.units === 'si') return 'Du har en verdi for den ukjente. Kontroller at enheten stemmer og at størrelsen er rimelig (f.eks. med en grov overslagsregning), og lever når du er fornøyd.';
        if (remaining.length) return `Nå har du ${v}. Sett verdien inn i et av uttrykkene for å finne ${remaining.map((t) => t.label.toLowerCase()).join(' og ')}.`;
        return 'Du har funnet svaret. Kontroller det ved å sette det inn i begge uttrykkene, og lever når du er fornøyd.';
      }
    } catch {
      /* faller til standardhint */
    }
  }
  return part.hints.firstStep;
}

export function understandText(task: GeneratedTask | undefined, part: GenPart): string {
  const fam = getFamily(task?.familyKbId);
  const syms = fam?.formulas.flatMap((f) => f.symbols).filter((s, i, arr) => arr.findIndex((x) => x.sym === s.sym) === i).slice(0, 5) ?? [];
  const ask = /forklar|hvorfor/i.test(part.prompt) ? 'forklare med ord' : /tegn/i.test(part.prompt) ? 'tegne' : 'regne ut';
  const symText = syms.length ? ` Symbolene: ${syms.map((s) => `${s.sym.replace(/[\\{}_]/g, '').replace('mathit', '')} er ${s.meaning.charAt(0).toLowerCase() + s.meaning.slice(1)}`).join('; ')}.` : '';
  const targets = part.targets?.length ? ` Du skal finne: ${part.targets.map((t) => t.label.toLowerCase()).join(' og ')}.` : '';
  return `Oppgaven ber deg ${ask}.${targets}${symText}`;
}

export function chooseFormula(task: GeneratedTask | undefined, part: GenPart): string {
  const fam = getFamily(task?.familyKbId);
  const f = fam?.formulas.find((x) => (part.skills.includes('lik.betingelse') && x.id === 'f-lik') || (part.skills.includes('avg.modell') && x.id === 'f-kile') || (part.skills.includes('pst.endring') && x.id === 'f-pst') || (part.skills.includes('kost.ac') && x.id === 'f-ac') || (part.skills.includes('kost.nullpunkt') && x.id === 'f-null') || (part.skills.includes('pst.vekstfaktor') && x.id === 'f-vekst')) ?? fam?.formulas[0];
  if (!f) return part.hints.small;
  if (part.math?.units === 'si' || !fam?.formulas.some((x) => x.id === 'f-lik' || x.id === 'f-kile' || x.id === 'f-pst' || x.id === 'f-ac')) {
    const list = (fam?.formulas ?? []).slice(0, 4).map((x) => `- ${x.name}: $${x.tex}$`).join('\n');
    return `Formlene som oftest brukes i denne oppgavetypen:\n${list}\n\nSpør deg: hvilke størrelser er gitt, og hvilken størrelse skal du finne? Velg formelen som kobler akkurat disse.`;
  }
  return `Utgangspunktet er ${f.name.toLowerCase()}: $${f.tex}$. Dette er ${f.kind === 'avledet sammenheng' ? 'en avledet sammenheng' : f.kind === 'modellantakelse' ? 'en modellantakelse' : f.kind === 'identitet' ? 'en identitet' : f.kind === 'tilnærming' ? 'en tilnærming' : 'en definisjon'}: ${f.kindWhy}`;
}

export function interpretHint(task: GeneratedTask | undefined, part: GenPart): string {
  const fam = getFamily(task?.familyKbId);
  if (part.rubric?.length) return `En god tolkning svarer på: ${part.rubric.filter((r) => r.required).map((r) => r.text.charAt(0).toLowerCase() + r.text.slice(1)).join(' Og: ')}`;
  if (fam && task) return familyShort(fam, task.params).text;
  return 'Si med ord hva tallet betyr i situasjonen, med enhet.';
}

/** Svar på fritekst uten AI: faste spørsmålstyper fra kunnskapsbasen. */
export function offlineAnswer(msg: string, task: GeneratedTask | undefined, part: GenPart): string {
  const m = msg.toLowerCase();
  const sym = /hva betyr (?:bokstaven |symbolet )?([a-zæøå_0-9]{1,4})\b/i.exec(msg);
  if (sym) {
    const s = sym[1].replace('_', '').toLowerCase();
    for (const { formula } of allFormulas())
      for (const x of formula.symbols) {
        const clean = x.sym.replace(/\\mathit\{|\}|\\|_|\{/g, '').toLowerCase();
        if (clean === s) return `${sym[1]} er ${x.meaning.charAt(0).toLowerCase() + x.meaning.slice(1)} (enhet: ${x.unit}). Den brukes i ${formula.name.toLowerCase()}, $${formula.tex}$.`;
      }
    return `Jeg finner ikke «${sym[1]}» i formlene appen kjenner. Se på oppgaveteksten der symbolet innføres.`;
  }
  if (/hvorfor/.test(m)) return part.hints.stepExplanation;
  if (/annen måte|annerledes|forklar igjen|skjønner ikke|forstår ikke/.test(m)) {
    const fam = getFamily(task?.familyKbId);
    return fam ? `${fam.explanations.analogy.text} Hvor analogien slutter å passe: ${fam.explanations.analogy.limits}` : part.hints.stepExplanation;
  }
  if (/start|begynne|begynn/.test(m)) return part.hints.firstStep;
  return 'Uten AI-tilkobling kan jeg svare på faste spørsmål: «Hva betyr P?», «Hvorfor gjør vi dette?» eller «Forklar på en annen måte». Du kan også velge et av valgene under eller be om et hint.';
}

/** Fag og fagområde for oppgaven (styrer lærerens regler og ordbruk). */
export function tutorRulesFor(task: GeneratedTask | undefined): string {
  const course = task ? store.get<Course>('course', task.courseId) : undefined;
  return tutorRules(course?.name ?? 'faget', domainOf(getFamily(task?.familyKbId)));
}

/** Originaloppgaven (deloppgaven fra eksamen eller oppgavesamlingen) bak en oppgave, hvis den finnes. */
export function sourceSubtask(task: GeneratedTask | undefined): SubTask | undefined {
  const id = task?.sourceRefs?.subtaskIds?.[0];
  return id && task?.templateId === 'original' ? store.get<SubTask>('subtask', id) : undefined;
}

export function buildTutorContext(task: GeneratedTask | undefined, part: GenPart, pa: PartAttempt, att: Attempt, history: Evidence[]): string {
  const lines: string[] = [];
  const course = task ? store.get<Course>('course', task.courseId) : undefined;
  if (course) lines.push(`Fag: ${course.name}`);
  lines.push(`Oppgave: ${task?.title ?? ''}`);
  if (task?.intro) lines.push(task.intro);
  lines.push(`Deloppgave ${part.label} (${part.kind}): ${part.prompt}`);
  const fam = getFamily(task?.familyKbId);
  if (fam) {
    lines.push(`Oppgavefamilie: ${fam.name}. Typisk løsningsgang: ${fam.solutionStructure.join(' → ')}`);
    if (fam.misconceptions.length) lines.push(`Vanlige misforståelser i denne familien: ${fam.misconceptions.slice(0, 5).map((m) => m.label).join('; ')}`);
  }
  // Originaloppgaven og sensorveiledningen (når oppgaven er fra en tidligere eksamen).
  const st = sourceSubtask(task);
  if (st) {
    if (st.intro) lines.push(`Felles innledning i originaloppgaven: ${st.intro.slice(0, 1500)}`);
    if (st.text) lines.push(`Oppgaveteksten i originalen: ${st.text.slice(0, 2500)}`);
    if (st.guide?.text) lines.push(`Sensorveiledning / løsningsforslag for oppgaven (bare for læreren; ikke gjengi den ordrett før studenten har levert eller ber om full løsning): ${st.guide.text.slice(0, 6000)}`);
    const crit = st.analysis.criteria.filter((c) => c.basis === 'offisielt').map((c) => c.text);
    if (crit.length) lines.push(`Offisielle krav fra sensorveiledningen: ${crit.slice(0, 8).join(' | ')}`);
  }
  if (part.choices?.length) {
    const letters = 'ABCDEFGH';
    lines.push('Svaralternativer:');
    part.choices.forEach((c, i) => lines.push(`  ${letters[i]}) ${c.text}`));
    const right = part.choices.findIndex((c) => c.correct);
    if (right >= 0) lines.push(`Riktig alternativ (bare for læreren; ikke avslør det før studenten har levert eller ber om full løsning): ${letters[right]}. ${part.choices[right].why ?? ''}`);
    const chosen = part.choices.findIndex((c) => c.id === pa.choiceId);
    if (chosen >= 0) lines.push(`Studenten har valgt ${letters[chosen]}${pa.submitted ? ' og levert' : ' (ikke levert ennå)'}.`);
  }
  if (part.math) {
    const el = effectiveLines(pa);
    const { checks, cc } = checkWorkBest(el.texts, part.math, { resolutions: pa.resolutions, uncertainLines: el.uncertain, sources: el.sources });
    const dev = findFirstDeviation(checks, cc);
    lines.push('Elevens linjer (status fra matematikkmotoren):');
    checks.forEach((c) => lines.push(`  ${c.index + 1}. «${c.raw}» – ${c.status}${c.source === 'image' ? (c.readingCertain === false ? ' (avlest fra bilde, USIKKER avlesning)' : ' (avlest fra bilde)') : ''}`));
    if (!checks.length) lines.push('  (ingen linjer ennå)');
    if (dev) lines.push(`Diagnose: siste riktige linje er ${dev.lastGoodLine !== null ? dev.lastGoodLine + 1 : 'ingen'}; første avvik i linje ${dev.lineIndex + 1} (${dev.kind}): ${dev.detail}${dev.needsReadingConfirmation ? ' Avlesningen av denne linjen er usikker; avklar den først.' : ''}`);
    else if (checks.length) lines.push(part.math.units === 'si' ? 'Diagnose: regningen i linjene henger sammen (motoren kjenner ikke kretsen, så metodevalget er ikke kontrollert).' : 'Diagnose: ingen avvik funnet i linjene så langt.');
    const sol = Object.entries(part.math.solution).map(([k, v]) => `${k} = ${Rat.parse(v).toNo(3)}`).join(', ');
    if (sol) lines.push(`Kontrollert løsning (bare for læreren; ikke oppgi den med mindre full løsning er valgt): ${sol}`);
    if (part.targets?.length) lines.push(`Sluttsvar som sjekkes (bare for læreren): ${part.targets.map((t) => `${t.label} = ${t.value}${t.unit ? ' ' + t.unit : ''}`).join(', ')}`);
  }
  if (part.solution?.length && part.solution.some((x) => x.text || x.tex)) {
    lines.push(`Løsningsgang (bare for læreren): ${part.solution.map((x, i) => `${i + 1}. ${x.text}${x.tex ? ` [$${x.tex}$]` : ''}${x.why ? ` – ${x.why}` : ''}`).join(' ').slice(0, 3000)}`);
  }
  if (part.modelAnswer) lines.push(`Modellsvar (bare for læreren): ${part.modelAnswer.slice(0, 2000)}`);
  if (pa.explanation) lines.push(`Studentens tekstsvar/utkast (${pa.explanation.trim().split(/\s+/).filter(Boolean).length} ord): ${pa.explanation.slice(0, 4000)}`);
  if (part.rubric?.length) lines.push(`Vurderingsramme: ${part.rubric.map((r) => `${r.text}${r.required ? '' : ' (ekstra)'}`).join(' | ')}`);
  if (pa.submitted && pa.assessment) {
    lines.push(`Levert og vurdert: metode ${pa.assessment.method.verdict}, sluttsvar ${pa.assessment.answer.verdict.toUpperCase()}. Tilbakemelding: ${pa.assessment.feedback.slice(0, 600)}`);
    const items = pa.assessment.answer.items.filter((i) => i.given || i.expected);
    if (items.length) lines.push(`Sluttsvar kontrollert av appen: ${items.map((i) => `${i.label}: studenten ga ${i.given ?? '–'}${i.expected ? `, riktig er ${i.expected}` : ''} → ${i.verdict.toUpperCase()}`).join('; ')}. Følg denne kontrollen: si aldri at et svar er riktig når det står FEIL her.`);
  }
  const used = att.help.filter((h) => !h.partId || h.partId === part.id);
  const maxLevel = used.reduce((m, h) => Math.max(m, h.level), 0);
  lines.push(`Hjelp brukt i denne deloppgaven: ${used.length ? [...new Set(used.map((h) => h.type))].join(', ') : 'ingen'}. Høyeste hjelpenivå: ${maxLevel}. ${att.sawSolution || pa.submitted ? 'Studenten har sett løsningen eller levert; du kan diskutere svaret åpent.' : 'Ikke gi full løsning eller fasit med mindre studenten ber om det.'}`);
  const prevErr = history.filter((e) => e.outcome === 'ikke-riktig' && e.familyKbId === task?.familyKbId).slice(-5).map((e) => e.basis);
  if (prevErr.length) lines.push(`Tidligere feil i samme familie: ${prevErr.join(' | ')}`);
  return lines.join('\n');
}

export function nearestFormulaForSkill(skill: string) {
  const map: Record<string, string> = { 'lik.betingelse': 'f-lik', 'lik.losning': 'f-pstar', 'avg.modell': 'f-kile', 'avg.fordeling': 'f-andel', 'pst.endring': 'f-pst', 'pst.vekstfaktor': 'f-vekst', 'pst.baklengs': 'f-vekst', 'pst.poeng': 'f-poeng', 'kost.ac': 'f-ac', 'kost.mc': 'f-mc', 'kost.nullpunkt': 'f-null', 'kost.fast_var': 'f-tc' };
  return map[skill];
}
