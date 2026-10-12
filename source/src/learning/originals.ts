// Øving på de ekte eksamensspørsmålene: hvert spørsmål fra et eksamenssett
// (eller en sensorveiledning med spørsmålene) blir en oppgave i arbeidsflaten.
// Flervalg vurderes mot fasit fra kilden. Kortsvar og lengre spørsmål vurderes
// mot kriteriene i sensorveiledningen (AI når tilgjengelig, ellers
// selvvurdering). Regnbare deler kontrolleres med matematikkmotoren.

import type { GeneratedTask, GenPart, SubTask, SourceDoc, RubricItem } from '../domain/types';
import { nowIso, isExamSet } from '../domain/types';
import { store } from '../state/store';
import { familyShort, getFamily } from '../families';
import { Rat } from '../math/rational';
import { elMath, eng } from '../families/el-common';

export function subtaskTitle(st: Pick<SubTask, 'part' | 'sub' | 'label'>): string {
  if (st.part) return `Del ${st.part} · ${st.part === 3 ? `${st.sub})` : `spørsmål ${st.sub}`}`;
  if (/^[A-ZÆØÅ]-/.test(st.label)) return `Oppgave ${st.label}`;
  const m = /^(\d+)([a-h])$/.exec(st.label);
  return m ? `Oppgave ${m[1]} ${m[2]})` : `Oppgave ${st.label}`;
}

const keyLabel = (k: { symbol: string; display: string }) => k.display.split('=')[0].trim() || k.symbol;

/** Oppgaver med løsning i samme dokument (tekniske fag): originalen vises som utsnitt, sluttsvar sjekkes mot løsningsforslaget. */
function originalOppgave(st: SubTask, doc: SourceDoc | undefined, skills: string[]): GenPart[] {
  const fam = getFamily(st.analysis.familyKbId);
  const parts: GenPart[] = [];
  const keys = st.answerKeys ?? [];
  if (keys.length) {
    const syms = keys.map((k) => k.symbol);
    parts.push({
      id: 'a',
      label: 'Sluttsvar',
      prompt: `Løs oppgaven, og skriv sluttsvaret med symbol og enhet, for eksempel «${keyLabel(keys[0])} = … ${keys[0].unit ?? ''}». Svaret sjekkes mot løsningsforslaget.`.replace(' »', '»'),
      kind: 'beregning',
      skills,
      math: elMath(syms),
      targets: keys.map((k) => ({ symbol: k.symbol, label: keyLabel(k), value: k.value, unit: k.unit, aliases: [k.symbol.toLowerCase()], tolerance: String(Math.max(Math.abs(Number(k.value)) * 0.02, 1e-12)) })),
      solution: keys.map((k) => ({ tex: '', text: `Løsningsforslaget: ${k.display}`, why: 'Lest fra løsningsforslaget i dokumentet. Se hele løsningen under.', kind: 'innsetting' as const })),
      hints: { small: fam ? `${fam.shortName}: ${familyShort(fam).text}` : 'Tegn kretsen på nytt og marker det du vet.', firstStep: familyShort(fam).example, stepExplanation: '', workedExample: { intro: '', steps: [] } },
      methodCheckpoints: [],
    });
  }
  parts.push({
    id: parts.length ? 'b' : 'a',
    label: parts.length ? 'Sammenlikn' : 'a',
    prompt: parts.length
      ? 'Etter at du har levert sluttsvaret: se løsningsforslaget og kryss av for det du fikk til. Dette er en egenkontroll og teller ikke som dokumentert mestring.'
      : 'Løs oppgaven linje for linje her (eller på papir), og lever. Da vises løsningsforslaget, og du krysser av for det du fikk til.',
    kind: 'forklaring',
    selfCheck: true,
    skills,
    // Regneoppgave uten avlest sluttsvar: utregning linje for linje, vurdert mot løsningsforslaget.
    ...(parts.length ? {} : { math: elMath([]) }),
    modelAnswer: st.guide?.text ? st.guide.text.slice(0, 4000) : undefined,
    rubric: [
      { id: 'k1', text: 'Samme metode som løsningsforslaget, eller en annen gyldig metode.', basis: 'faglig-tolkning', required: true },
      { id: 'k2', text: 'Riktige mellomresultater (for eksempel ekvivalenter, likninger, tabeller).', basis: 'faglig-tolkning', required: true },
      { id: 'k3', text: 'Riktig sluttsvar med enhet eller riktig figur/uttrykk.', basis: 'offisielt', required: true },
    ],
    solution: [{ tex: '', text: 'Løsningsforslaget', why: 'Vises som utsnitt av originalen etter at du har levert.', kind: 'tolkning' }],
    hints: { small: fam ? `Dette er ${fam.shortName.toLowerCase()}. ${familyShort(fam).text}` : 'Hva spør oppgaven om?', firstStep: fam?.solutionStructure.length ? `Typisk fremgang: ${fam.solutionStructure.join(' → ')}.` : '', stepExplanation: '', workedExample: { intro: '', steps: [] } },
    methodCheckpoints: [{ id: 'forklaring', label: 'Sammenliknet med løsningsforslaget', skill: skills[0] ?? 'ukjent', detect: { type: 'forklaring' }, required: true }],
  });
  void doc;
  void eng;
  return parts;
}

const META = /(denne oppgaven kan besvares kort|trenger ikke forklares|figur \d|kap\.? \d|CORE|I vurderingen skal det tas hensyn|besvarelser som er god|skal ha en ekstra god vurdering|Her er det tilstrekkelig)/i;

/** Vurderingsramme fra sensorveiledningens tekst: sentrale punkter er nødvendige, «ekstra»-punkter valgfrie. */
export function rubricFromGuide(text: string): RubricItem[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÆØÅ«"“(•–-])|\s+(?=•)|\s+(?=–\s)/)
    .map((t) => t.replace(/^[•–-]\s*/, '').trim())
    .filter((t) => t.length > 12 && !META.test(t));
  const out: RubricItem[] = [];
  let content = 0;
  for (const t of sentences) {
    if (out.length >= 7) break;
    const optional = /ekstra|pluss|tilleggspoeng|ikke nødvendig|gjerne|kan også|positivt hvis/i.test(t);
    const negative = /gis (?:ikke|trekk|svært liten) uttelling|gis det trekk|skal det ikke gis/i.test(t);
    const key = /må|et godt svar|full uttelling|god uttelling|det viktige|nøkkelen/i.test(t);
    const required = !optional && !negative && (key || content < 2);
    if (!optional && !negative) content++;
    out.push({ id: `k${out.length + 1}`, text: negative ? `Unngå dette (trekk ifølge veiledningen): ${t}` : t, basis: 'offisielt', required });
  }
  if (!out.some((r) => r.required) && out.length) out[0].required = true;
  return out;
}

/** Lager en øvingsoppgave av et originalt spørsmål. Returnerer null når kilden ikke gir nok til å øve (f.eks. bare svar). */
export function originalTask(st: SubTask): GeneratedTask | null {
  const doc = store.get<SourceDoc>('doc', st.docId);
  const setLabel = doc?.meta.setLabel ?? doc?.fileName ?? '';
  const now = nowIso();
  const parts: GenPart[] = [];
  const skills = st.analysis.skills?.value?.length ? st.analysis.skills.value : getFamily(st.analysis.familyKbId)?.skills.slice(0, 2) ?? [];
  const guide = st.guide?.text ?? '';
  const fam = getFamily(st.analysis.familyKbId);
  if (st.format === 'oppgave' && (st.regions?.length || st.solutionRegions?.length)) {
    parts.push(...originalOppgave(st, doc, skills));
  } else if (st.format === 'flervalg') {
    if (st.stemMissing || st.choices === undefined || st.choices.length < 2) return null;
    const correct = st.choices.find((c) => c.correct);
    if (!correct) return null;
    parts.push({
      id: 'a',
      label: 'a',
      prompt: st.text,
      kind: 'flervalg',
      skills,
      answerSource: `Fasit: ${st.answerBasis ?? 'oppgitt i sensorveiledningen'}.`.replace(/\.\.$/, '.'),
      choices: st.choices.map((c) => ({ id: c.letter, text: c.text, correct: !!c.correct, why: c.correct ? `Riktig ifølge sensorveiledningen (${st.answerBasis?.toLowerCase() ?? 'fasit'}).` : `Riktig svar ifølge sensorveiledningen er ${correct.letter}) ${correct.text}` })),
      solution: [{ tex: '', text: `Riktig svar: ${correct.letter}) ${correct.text}`, why: st.answerBasis ?? 'Fasit fra sensorveiledningen.', kind: 'tolkning' }],
      hints: { small: 'Les alle alternativene nøye. Spørsmålet kan be om det som er feil.', firstStep: fam ? `Tenk på ${fam.shortName.toLowerCase()}: ${familyShort(fam).text}` : 'Stryk alternativer som blander begreper.', stepExplanation: familyShort(fam).text, workedExample: { intro: '', steps: [] } },
      methodCheckpoints: [],
    });
  } else {
    if (st.stemMissing || !st.text.trim()) return null;
    const answers = st.analysis.computed?.answers ?? [];
    if (answers.length && st.analysis.certainty.validation === 'kontrollert') {
      parts.push({
        id: 'a',
        label: 'a',
        prompt: `Regn ut: ${answers.map((a) => a.label.toLowerCase()).join(' og ')}.`,
        kind: 'beregning',
        skills,
        math: { symbols: [], defs: {}, param: 'x', unknown: 'x', solution: {}, answerSymbols: answers.map((_, i) => `s${i}`) },
        // «Tilnærmet» (f.eks. reallønn ≈ lønnsvekst − prisvekst): både tilnærmingen og den eksakte
        // formelen er riktige på eksamen, så svaret godtas innenfor et halvt prosentpoeng.
        targets: answers.map((a, i) => ({ symbol: answers.length === 1 ? 'x' : `s${i}`, label: a.label.replace(/\s*\(tilnærmet\)/i, ''), value: a.value, percent: a.unit === '%', minDecimals: Rat.parse(a.value).isExactDecimal(2) ? 0 : 1, tolerance: /tilnærmet/i.test(a.label) ? '0.5' : undefined, aliases: a.label.toLowerCase().replace(/\(tilnærmet\)/, '').split(/\s+/).filter((w) => w.length > 3) })),
        solution: answers.map((a) => ({ tex: '', text: `${a.label}: ${a.display}`, why: 'Regnet eksakt fra tallene i oppgaveteksten.', kind: 'innsetting' as const })),
        hints: { small: 'Skriv mellomregningene linje for linje.', firstStep: familyShort(fam).example, stepExplanation: familyShort(fam).text, workedExample: { intro: '', steps: [] } },
        methodCheckpoints: [],
      });
      if (answers.length > 1) parts[0].math!.answerSymbols = answers.map((_, i) => `s${i}`);
      else parts[0].math!.answerSymbols = ['x'];
    }
    // Ordgrensen for kortsvar står i innledningen til Del 2 («grense på 200 ord per spørsmål»).
    let limitNote = '';
    if (st.format === 'kortsvar') {
      const txt = store.pages(st.docId).map((p) => p.text).join(' ');
      const m = /grense på\s*(\d{2,4})\s*ord|(\d{2,4})\s*ord per spørsmål|maks(?:imalt)?\s*(\d{2,4})\s*ord/i.exec(txt);
      const n = m ? Number(m[1] ?? m[2] ?? m[3]) : 0;
      if (n) limitNote = `\n\n(Høyst ${n} ord, som på eksamen.)`;
    }
    const rubric = guide ? rubricFromGuide(guide) : st.analysis.criteria.filter((c) => c.basis !== 'offisielt').slice(0, 4).map((c, i) => ({ id: `k${i + 1}`, text: c.text, basis: c.basis, required: i < 2 }));
    if (!rubric.length) return null;
    parts.push({
      id: parts.length ? 'b' : 'a',
      label: parts.length ? 'b' : 'a',
      prompt: (parts.length ? 'Forklar og begrunn svaret ditt slik oppgaven ber om.' : st.text) + limitNote,
      kind: 'forklaring',
      skills,
      rubric,
      solution: [{ tex: '', text: 'Sensorveiledningen', why: guide || 'Ingen veiledningstekst.', kind: 'tolkning' }],
      hints: { small: fam ? `Dette er ${fam.shortName.toLowerCase()}. ${familyShort(fam).text}` : 'Hva spør oppgaven egentlig om? Finn verbet (forklar, drøft, beregn).', firstStep: rubric[0] ? `Start med dette: ${rubric[0].text}` : '', stepExplanation: guide.slice(0, 400), workedExample: { intro: '', steps: [] } },
      methodCheckpoints: [{ id: 'forklaring', label: 'Dekket punktene i sensorveiledningen', skill: skills[0] ?? 'ukjent', detect: { type: 'forklaring' }, required: true }],
      modelAnswer: guide || undefined,
    });
    if (parts.length === 2) parts[0].prompt = `${st.text}\n\nFørst: ${parts[0].prompt.charAt(0).toLowerCase()}${parts[0].prompt.slice(1)}`;
  }
  return {
    id: `orig-${st.id}`,
    kind: 'gen',
    courseId: st.courseId,
    createdAt: now,
    updatedAt: now,
    demo: st.demo,
    familyKbId: st.analysis.familyKbId ?? 'ukjent',
    templateId: 'original',
    templateVersion: 2,
    level: 4,
    style: 'standard',
    params: {},
    seed: 0,
    title: `${setLabel} · ${subtaskTitle(st)}`,
    intro: st.format === 'oppgave' && st.regions?.length ? [st.intro, st.text].filter(Boolean).join('\n') : st.intro ?? '',
    context: 'original',
    parts,
    skills,
    structureKey: `original|${st.id}`,
    sourceRefs: { subtaskIds: [st.id] },
    validation: { status: 'gyldig', checks: [{ name: st.format === 'oppgave' ? 'Fra løsningsforslaget' : 'Fra sensorveiledningen', ok: true, detail: st.format === 'flervalg' ? `Fasit: ${st.answerBasis ?? 'oppgitt'}.` : st.format === 'oppgave' ? `${st.answerKeys?.length ?? 0} sluttsvar lest fra løsningsforslaget; hele løsningen vises som utsnitt.` : 'Vurderingsrammen er sensorveiledningens egne punkter.' }] },
    wording: 'mal',
    estMinutes: st.format === 'flervalg' ? 2 : st.format === 'kortsvar' ? 8 : 10,
    sourceFigures: st.regions?.length ? st.figures.filter((f) => f.box && !f.inGuide && !st.regions!.some((r) => r.page === f.page && f.box![1] >= r.box[1] - 0.01 && f.box![1] + f.box![3] <= r.box[1] + r.box[3] + 0.01)).map((f) => ({ docId: st.docId, page: f.page, box: f.box! })) : st.figures.filter((f) => f.box && !f.inGuide).map((f) => ({ docId: st.docId, page: f.page, box: f.box! })),
    sourceRegions: st.regions?.map((r) => ({ docId: st.docId, page: r.page, box: r.box })),
    solutionRegions: st.solutionRegions?.map((r) => ({ docId: st.docId, page: r.page, box: r.box })),
    sourceKind: st.fromCollection ? 'oppgavesamling' : 'eksamen',
  };
}

export interface OriginalPool {
  flervalg: SubTask[];
  kortsvar: SubTask[];
  langsvar: SubTask[];
  /** Regne- og konstruksjonsoppgaver fra eksamenssett med løsning. */
  oppgave: SubTask[];
  /** Oppgaver fra oppgavesamlinger. */
  samling: SubTask[];
}

export function originalPool(): OriginalPool {
  const docs = store.docs().filter((d) => isExamSet(d) && !d.reserved && d.status !== 'duplikat' && !d.supersededBy);
  const ids = new Set(docs.map((d) => d.id));
  const subs = store.currentSubtasks().filter((s) => ids.has(s.docId));
  const colls = new Set(store.docs().filter((d) => d.meta.docType === 'oppgavesamling' && d.status !== 'duplikat' && !d.supersededBy).map((d) => d.id));
  const withRegions = (s: SubTask) => s.format === 'oppgave' && !!(s.regions?.length || s.solutionRegions?.length);
  return {
    flervalg: subs.filter((s) => s.format === 'flervalg' && !s.stemMissing && s.choices?.some((c) => c.correct)),
    kortsvar: subs.filter((s) => s.format === 'kortsvar' && !s.stemMissing),
    langsvar: subs.filter((s) => (s.format === 'langsvar' || (s.format === 'oppgave' && !withRegions(s)) || !s.format) && !s.stemMissing),
    oppgave: subs.filter(withRegions),
    samling: store.currentSubtasks().filter((s) => colls.has(s.docId) && withRegions(s)),
  };
}
