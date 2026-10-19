// Organisasjonsatferd og ledelse som oppgavefamilier. Hvert tema blir én
// familie med flervalg om begreper og modeller, korte case-oppgaver fra
// arbeidslivet og hele eksamenssvar (essay) med vurderingsramme.
// Vurderingsrammene er faglig tolkning; de offisielle kriteriene kommer fra
// sensorveiledningene i studentens egne dokumenter.

import type { GenPart } from '../../domain/types';
import type { FamilyKB, IntentDef, Rng, TemplateDef } from '../common';
import { pick, shuffle, step } from '../common';
import { explainPart, keywordRecognizer } from '../verbal';
import type { OrgConcept, OrgIntent, OrgLevel, OrgModel, OrgTopic } from './types';
import { INDIVID_TOPICS } from './individ';
import { GRUPPE_TOPICS } from './gruppe';
import { ORGANISASJON_TOPICS } from './organisasjon';
import { LEDELSE_TOPICS } from './ledelse';
import { ORG_MODELS, ORG_MODEL_MAP } from './models';

export const ORG_TOPICS: OrgTopic[] = [...INDIVID_TOPICS, ...GRUPPE_TOPICS, ...ORGANISASJON_TOPICS, ...LEDELSE_TOPICS];
export const ORG_TOPIC_MAP: Record<string, OrgTopic> = Object.fromEntries(ORG_TOPICS.map((t) => [t.id, t]));
export { ORG_MODELS, ORG_MODEL_MAP };

export const LEVEL_LABEL: Record<OrgLevel, string> = {
  individ: 'Individnivå',
  gruppe: 'Gruppe og arbeidsmiljø',
  organisasjon: 'Organisasjonsnivå',
  ledelse: 'Ledelse',
};

/** Minutter per spørsmål på en tretimers eksamen med fem likeverdige spørsmål. */
export const ESSAY_MINUTES = 36;

const short = (id: string) => id.replace(/^org-/, '');
export const skillBegrep = (t: OrgTopic) => `org.${short(t.id)}.begreper`;
export const skillAnvende = (t: OrgTopic) => `org.${short(t.id)}.anvende`;

/** Alle begreper med tema, for flashcards og oppslag. */
export interface ConceptRef {
  concept: OrgConcept;
  topic: OrgTopic;
}
export const ORG_CONCEPTS: ConceptRef[] = ORG_TOPICS.flatMap((topic) => topic.concepts.map((concept) => ({ concept, topic })));
export const ORG_CONCEPT_MAP: Record<string, ConceptRef> = Object.fromEntries(ORG_CONCEPTS.map((c) => [c.concept.id, c]));

/** Delene i en modell som er selve innholdet (ikke senteret i en trekant eller et venndiagram). */
export function modelParts(m: OrgModel) {
  return m.parts.filter((p) => p.group !== 'senter');
}

/** Navnet på en del. Har to deler samme navn (f.eks. «Menneskesyn» i begge kolonnene), tas gruppen med. */
export function partName(m: OrgModel, p: OrgModel['parts'][number]): string {
  const dup = m.parts.some((x) => x !== p && x.label.toLowerCase() === p.label.toLowerCase());
  const g = dup ? m.groups?.find((x) => x.id === p.group)?.label : undefined;
  return g ? `${p.label} (${g.toLowerCase()})` : p.label;
}

/** Distraktorer: forvekslingsbegreper først, så andre fra samme tema, så fra samme nivå. */
function conceptDistractors(rng: Rng, c: OrgConcept, topic: OrgTopic, n = 3, skipUmbrella = false): OrgConcept[] {
  // Temaets første begrep er ofte overbegrepet (f.eks. «organisasjonskultur»). I «hvilket begrep passer?»
  // ville det også vært et forsvarlig svar, så det brukes ikke som galt alternativ der.
  const umbrella = skipUmbrella && topic.concepts[0]?.id !== c.id ? topic.concepts[0]?.id : undefined;
  const confuse = (c.confuse ?? []).map((id) => ORG_CONCEPT_MAP[id]?.concept).filter((x): x is OrgConcept => !!x && x.id !== c.id && x.id !== umbrella);
  const same = shuffle(rng, topic.concepts.filter((x) => x.id !== c.id && x.id !== umbrella && !confuse.includes(x)));
  const level = shuffle(
    rng,
    ORG_TOPICS.filter((t) => t.level === topic.level && t.id !== topic.id).flatMap((t) => t.concepts),
  );
  const out: OrgConcept[] = [];
  for (const x of [...confuse, ...same, ...level]) {
    if (out.length >= n) break;
    if (x.id === c.id || out.some((y) => y.id === x.id || y.term === x.term || y.definition === x.definition)) continue;
    out.push(x);
  }
  return out;
}

const HINTS_MC = (why: string) => ({
  small: 'Les alle alternativene. Hvilket stemmer med måten pensum bruker begrepet på, ikke bare med hverdagsspråket?',
  firstStep: 'Stryk alternativene som beskriver et nabobegrep. De ligner ofte, men mangler et kjennetegn.',
  stepExplanation: why,
  workedExample: { intro: '', steps: [] },
});

function mc(rng: Rng, o: { stem: string; correct: string; wrong: string[]; why: string; wrongWhy?: Record<string, string>; skill: string }): GenPart {
  const opts = shuffle(rng, [o.correct, ...o.wrong.slice(0, 3)]);
  const letters = ['A', 'B', 'C', 'D'];
  return {
    id: 'a',
    label: 'a',
    prompt: o.stem,
    kind: 'flervalg',
    skills: [o.skill],
    choices: opts.map((t, i) => ({
      id: letters[i],
      text: t,
      correct: t === o.correct,
      why: t === o.correct ? o.why : `${o.wrongWhy?.[t] ?? 'Dette passer ikke.'} Riktig er: «${o.correct}». ${o.why}`,
    })),
    solution: [step('', `Riktig svar: ${o.correct}`, o.why, 'tolkning')],
    hints: HINTS_MC(o.why),
    methodCheckpoints: [],
  };
}

type Built = ReturnType<TemplateDef['build']>;

function built(topic: OrgTopic, tplId: string, key: string, title: string, intro: string, parts: GenPart[], est: number, params: Record<string, string> = {}): Built {
  return {
    title,
    intro,
    context: key,
    parts,
    params: { item: key, ...params },
    skills: [...new Set(parts.flatMap((p) => p.skills))],
    structureKey: `${tplId}|${key}`,
    estMinutes: est,
  };
}

function conceptTemplate(topic: OrgTopic): TemplateDef {
  const id = `${topic.id}.begrep`;
  return {
    id,
    version: 1,
    level: 1,
    style: 'standard',
    name: 'Begrep → definisjon',
    description: `Kjenn igjen riktig definisjon av begrepene i ${topic.shortName.toLowerCase()}.`,
    skills: [skillBegrep(topic)],
    build: (rng) => {
      const c = pick(rng, topic.concepts);
      const wrong = conceptDistractors(rng, c, topic);
      const wrongWhy = Object.fromEntries(wrong.map((w) => [w.definition, `Dette er ${w.term.toLowerCase()}.`]));
      const why = `${c.term}${c.author ? ` (${c.author})` : ''}: ${c.definition} Eksempel: ${c.example}`;
      return built(topic, id, c.id, `Hva betyr ${c.term.toLowerCase()}?`, '', [mc(rng, { stem: `Hva menes med «${c.term}»?`, correct: c.definition, wrong: wrong.map((w) => w.definition), why, wrongWhy, skill: skillBegrep(topic) })], 2, { concept: c.id });
    },
  };
}

function exampleTemplate(topic: OrgTopic): TemplateDef {
  const id = `${topic.id}.eksempel`;
  return {
    id,
    version: 1,
    level: 2,
    style: 'standard',
    name: 'Eksempel → begrep',
    description: `Kjenn igjen begrepene i ${topic.shortName.toLowerCase()} i situasjoner fra arbeidslivet.`,
    skills: [skillAnvende(topic)],
    build: (rng) => {
      const c = pick(rng, topic.concepts);
      const wrong = conceptDistractors(rng, c, topic, 3, true);
      const wrongWhy = Object.fromEntries(wrong.map((w) => [w.term, `${w.term}: ${w.definition}`]));
      const why = `${c.term}: ${c.definition}`;
      return built(topic, id, c.id, 'Hvilket begrep passer?', c.example, [mc(rng, { stem: 'Hvilket begrep fra pensum beskriver situasjonen best?', correct: c.term, wrong: wrong.map((w) => w.term), why, wrongWhy, skill: skillAnvende(topic) })], 2, { concept: c.id });
    },
  };
}

function modelTemplate(topic: OrgTopic, models: OrgModel[]): TemplateDef {
  const id = `${topic.id}.modell`;
  const others = ORG_MODELS.filter((m) => !models.includes(m));
  return {
    id,
    version: 1,
    level: 2,
    style: 'standard',
    name: 'Modell → delene',
    description: `Kjenn delene i modellene: ${models.map((m) => m.name).join(', ')}.`,
    skills: [skillBegrep(topic)],
    build: (rng) => {
      const m = pick(rng, models);
      const parts = modelParts(m);
      const kind = rng() < 0.5 && parts.length >= 3 ? 'ikke' : 'del';
      if (kind === 'ikke') {
        // Hvilken del hører ikke til? Tre ekte deler og én fra en annen modell.
        // Tre ekte deler med ulike navn.
        const real = shuffle(rng, parts).filter((p, i, a) => a.findIndex((x) => x.label.toLowerCase() === p.label.toLowerCase()) === i).slice(0, 3);
        const labels = new Set(parts.map((p) => p.label.toLowerCase()));
        // Helst en del fra en modell av samme type (f.eks. en annen firefeltsmatrise), så alternativet ikke er åpenbart.
        const foreignPool = shuffle(rng, others.flatMap((o) => modelParts(o).map((p) => ({ p, o }))))
          .filter((x) => !labels.has(x.p.label.toLowerCase()))
          .sort((a, b) => Number(b.o.kind === m.kind) - Number(a.o.kind === m.kind));
        const foreign = foreignPool[0];
        const why = `«${foreign.p.label}» hører til ${foreign.o.name} (${foreign.o.author}). ${m.name} består av: ${[...new Set(parts.map((p) => p.label))].join(', ')}.`;
        return built(topic, id, `${m.id}|ikke`, m.name, m.summary, [mc(rng, { stem: `Hvilken av disse hører ikke til ${m.name}?`, correct: foreign.p.label, wrong: real.map((p) => p.label), why, skill: skillBegrep(topic) })], 2, { model: m.id });
      }
      const target = pick(rng, parts);
      const wrong = shuffle(rng, parts.filter((p) => p.id !== target.id && p.text !== target.text)).filter((p, i, a) => a.findIndex((x) => x.text === p.text) === i).slice(0, 3);
      const name = partName(m, target);
      const why = `${name}: ${target.text}${target.example ? ` Eksempel: ${target.example}` : ''}`;
      return built(topic, id, `${m.id}|${target.id}`, m.name, m.summary, [mc(rng, { stem: `Hva kjennetegner «${name}» i ${m.name}?`, correct: target.text, wrong: wrong.map((p) => p.text), why, skill: skillBegrep(topic) })], 2, { model: m.id });
    },
  };
}

function caseTemplate(topic: OrgTopic): TemplateDef {
  const id = `${topic.id}.case`;
  return {
    id,
    version: 1,
    level: 3,
    style: 'standard',
    name: 'Case fra arbeidslivet',
    description: `Bruk et begrep fra ${topic.shortName.toLowerCase()} til å forklare en situasjon på en arbeidsplass.`,
    skills: [skillBegrep(topic), skillAnvende(topic)],
    build: (rng) => {
      const c = pick(rng, topic.concepts);
      const model = `${c.term}${c.author ? ` (${c.author})` : ''}: ${c.definition}\n\nI caset: ${c.example} Dette passer med begrepet fordi situasjonen viser kjennetegnene i definisjonen. Knytt gjerne til en modell fra temaet (${topic.models.map((m) => ORG_MODEL_MAP[m]?.name).filter(Boolean).join(', ') || topic.shortName}) og si hva det kan bety for den ansatte og organisasjonen.`;
      const part = explainPart(
        {
          id: c.id,
          skills: [skillBegrep(topic), skillAnvende(topic)],
          prompt: 'Hvilket begrep fra pensum kan forklare situasjonen? Definer begrepet og vis hvordan det passer på caset. Skriv 4–8 setninger.',
          rubric: [
            [`Navngir begrepet: ${c.term}${c.aka?.length ? ` (eller ${c.aka.join(', ')})` : ''}.`, true],
            [`Definerer det i tråd med pensum: ${c.definition}`, true],
            ['Peker på konkrete trekk i caset som passer med definisjonen.', true],
            ['Sier noe om konsekvenser eller hva en leder/organisasjon kan gjøre.', false],
          ],
          model,
          hints: {
            small: `Temaet er ${topic.shortName.toLowerCase()}. Hvilke begreper har du lært der?`,
            firstStep: 'Finn det som skjer i caset med ett ord. Hvilket begrep beskriver akkurat det?',
            why: `${c.term}: ${c.definition}`,
          },
        },
        'a',
        'a',
      );
      return built(topic, id, c.id, `Case: ${topic.shortName}`, c.example, [part], 6, { concept: c.id });
    },
  };
}

function lowerFirst(s: string) {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

export function intentModelAnswer(it: OrgIntent): string {
  return it.outline.map((o) => `${o.del}: ${o.tekst}`).join('\n\n');
}

function essayTemplate(topic: OrgTopic): TemplateDef {
  const id = `${topic.id}.essay`;
  return {
    id,
    version: 1,
    level: 4,
    style: 'standard',
    name: 'Eksamenssvar',
    description: `Skriv et helt eksamenssvar om ${topic.shortName.toLowerCase()} (${ESSAY_MINUTES} min, uten hjelpemidler).`,
    skills: [skillBegrep(topic), skillAnvende(topic)],
    build: (rng) => {
      const it = pick(rng, topic.intents);
      const part = explainPart(
        {
          id: it.id,
          skills: [skillBegrep(topic), skillAnvende(topic)],
          prompt: `Skriv et eksamenssvar der du skal ${lowerFirst(it.assignment).replace(/\.$/, '')}. Sett av ${ESSAY_MINUTES} minutter, uten hjelpemidler.`,
          rubric: it.keyPoints.map((k, i) => [k, i < 2] as [string, boolean]),
          model: intentModelAnswer(it),
          hints: {
            small: `Start med en definisjon. Svarstruktur: ${topic.structure.join(' → ')}.`,
            firstStep: it.outline[0] ? `${it.outline[0].del}: ${it.outline[0].tekst}` : 'Definer de sentrale begrepene først.',
            why: it.keyPoints.join(' '),
          },
        },
        'a',
        'a',
      );
      return built(topic, id, it.id, it.label, '', [part], it.estMinutes || ESSAY_MINUTES, { intent: it.id });
    },
  };
}

function toIntent(t: OrgTopic, it: OrgIntent): IntentDef {
  return {
    id: it.id,
    label: it.label,
    match: it.match,
    specific: it.specific,
    skills: [skillBegrep(t), skillAnvende(t)],
    taskType: ['forklaring', 'drøfting'],
    assignment: it.assignment,
    interpretation: it.keyPoints,
    prerequisites: [],
    misconceptions: t.traps.map((x) => `${x.label}: ${x.explanation}`),
    variation: [],
    estMinutes: it.estMinutes || ESSAY_MINUTES,
  };
}

export function topicFamily(t: OrgTopic): FamilyKB {
  const models = t.models.map((id) => ORG_MODEL_MAP[id]).filter((m): m is OrgModel => !!m);
  const templates: TemplateDef[] = [conceptTemplate(t), exampleTemplate(t), caseTemplate(t), essayTemplate(t)];
  if (models.length) templates.splice(2, 0, modelTemplate(t, models));
  const first = t.concepts[0];
  return {
    id: t.id,
    domain: 'org',
    name: t.name,
    shortName: t.shortName,
    topic: LEVEL_LABEL[t.level],
    subtopics: [t.shortName, ...models.map((m) => m.name)].slice(0, 4),
    description: t.description,
    skills: [skillBegrep(t), skillAnvende(t)],
    formulas: [],
    intents: t.intents.map((it) => toIntent(t, it)),
    templates,
    misconceptions: t.traps.map((x, i) => ({ id: `${t.id}.felle${i + 1}`, label: x.label, explanation: x.explanation })),
    recognize: keywordRecognizer(t.signals, t.minScore, t.shortName.toLowerCase()),
    explanations: {
      short: () => ({ text: t.description, example: first ? `${first.term}: ${first.example}` : '' }),
      analogy: { text: t.mnemonic ?? '', limits: '' },
      derivationFormulaId: '',
    },
    solutionStructure: t.structure,
    surfaceFeatures: [],
  };
}

export const ORG_FAMILIES: FamilyKB[] = ORG_TOPICS.map(topicFamily);

/** Temaer på samme nivå regnes som beslektet; i tillegg noen faglige koblinger på tvers. */
export const ORG_RELATED: Record<string, string[]> = (() => {
  const extra: Record<string, string[]> = {
    'org-stress': ['org-engasjement', 'org-mobbing'],
    'org-engasjement': ['org-stress', 'org-tilfredshet', 'org-motivasjon'],
    'org-tilfredshet': ['org-engasjement', 'org-tillit'],
    'org-motivasjon': ['org-engasjement', 'org-teori'],
    'org-teori': ['org-motivasjon', 'org-kultur'],
    'org-kultur': ['org-endring', 'org-mangfold'],
    'org-endring': ['org-kompetanse', 'org-transformasjon'],
    'org-kompetanse': ['org-laering', 'org-endring'],
    'org-laering': ['org-kompetanse'],
    'org-lederstil': ['org-transformasjon', 'org-lederjobb'],
    'org-transformasjon': ['org-lederstil', 'org-destruktiv'],
    'org-destruktiv': ['org-transformasjon', 'org-mobbing'],
    'org-lederjobb': ['org-lederstil'],
    'org-personlighet': ['org-intelligens', 'org-lederstil'],
    'org-intelligens': ['org-personlighet'],
    'org-mobbing': ['org-destruktiv', 'org-stress'],
    'org-tillit': ['org-tilfredshet'],
    'org-mangfold': ['org-kjonn', 'org-grupper'],
    'org-kjonn': ['org-mangfold'],
    'org-grupper': ['org-mangfold'],
    'org-selvledelse': ['org-motivasjon'],
    'org-beslutning': ['org-kreativitet'],
    'org-kreativitet': ['org-beslutning', 'org-motivasjon'],
  };
  return Object.fromEntries(ORG_TOPICS.map((t) => [t.id, (extra[t.id] ?? []).filter((x) => ORG_TOPIC_MAP[x])]));
})();

export const ORG_SKILLS = ORG_TOPICS.flatMap((t) => [
  { id: skillBegrep(t), name: `${t.shortName}: begreper og modeller`, observable: `Definerer begrepene i ${t.shortName.toLowerCase()} i tråd med pensum og kjenner delene i modellene.`, group: 'org' as const, prerequisites: [] as string[] },
  { id: skillAnvende(t), name: `${t.shortName}: bruke teorien`, observable: `Bruker teori om ${t.shortName.toLowerCase()} på eksempler fra arbeidslivet og drøfter med forskning.`, group: 'org' as const, prerequisites: [skillBegrep(t)] },
]);

