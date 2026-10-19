// Datamodellen. Alt som lagres har stabil ID, type (kind) og tilhører et fag.
// Kildegrunnlaget (dokumenter, sider, deloppgaver, familier) holdes adskilt
// fra elevhistorikken (forsøk, hjelp, evidens).

import type { MathContext, AnswerTarget } from '../math/check';

export type ID = string;

export type EntityKind = 'course' | 'doc' | 'page' | 'subtask' | 'family' | 'gen' | 'attempt' | 'evidence' | 'session' | 'exam' | 'settings' | 'profile' | 'lesson' | 'game' | 'flash';

export interface BaseEntity {
  id: ID;
  kind: EntityKind;
  courseId: ID;
  createdAt: string;
  updatedAt: string;
  demo?: boolean;
}

export interface Course extends BaseEntity {
  kind: 'course';
  name: string;
  examDate?: string;
  timeBudget?: string;
  ambition?: string;
  examInfo: {
    durationMin?: number;
    aids?: string;
    format?: string;
    notes?: string;
  };
  lastActivity?: { label: string; route: string; at: string };
  settings: { cloudOriginals: boolean; reducedMotion?: boolean; ttsRate?: number; calculator?: CalculatorKind };
}

export type DocType = 'eksamen' | 'sensorveiledning' | 'losningsforslag' | 'oppgavesamling' | 'laerernotat' | 'studentbesvarelse' | 'fagbeskrivelse' | 'annet';

export const DOC_TYPES: Record<DocType, { label: string; authority: string; note: string }> = {
  eksamen: { label: 'Eksamensoppgave', authority: 'Kilde for oppgavekrav', note: 'Oppgaveteksten er grunnlaget for hva som faktisk spørres om.' },
  sensorveiledning: { label: 'Sensorveiledning', authority: 'Offisielle kriterier', note: 'Kriterier herfra merkes som offisielle når koblingen til riktig sett er bekreftet.' },
  losningsforslag: { label: 'Offisielt løsningsforslag', authority: 'Offisiell løsning', note: 'Brukes som fasit, men kontrolleres matematisk. Konflikter vises.' },
  oppgavesamling: { label: 'Oppgavesamling med løsninger', authority: 'Øvingsgrunnlag', note: 'Oppgavene brukes til øving og løsningene som fasit, men samlingen teller ikke som et eksamenssett i kartet.' },
  laerernotat: { label: 'Lærerens notater', authority: 'Veiledende', note: 'Kan gi nyttige hint, men er ikke offisielle vurderingskriterier.' },
  studentbesvarelse: { label: 'Studentbesvarelse (uoffisiell)', authority: 'Ikke fasit', note: 'En opplastet besvarelse er aldri automatisk riktig. Brukes bare som eksempel.' },
  fagbeskrivelse: { label: 'Fagbeskrivelse / læringsutbytte', authority: 'Pensumgrunnlag', note: 'Brukes til å finne relevante læringsmål som eksamenene ikke dekker.' },
  annet: { label: 'Annet', authority: 'Kontekst', note: 'Leses, men brukes ikke som grunnlag for vurderingskriterier.' },
};

export type Term = 'vår' | 'høst' | 'sommer' | 'ukjent';
export type ExamType = 'ordinær' | 'konte' | 'utsatt' | 'prøveeksamen' | 'ukjent';

export type Basis = 'avlest' | 'bruker' | 'regelbasert' | 'ai-tolkning' | 'mangler';

export interface Suggestion<T> {
  value: T;
  basis: Basis;
  why: string;
}

export type StageName = 'registrering' | 'sidelesing' | 'bildelesing' | 'segmentering' | 'analyse' | 'kobling' | 'dekning';
export type StageStatus = 'venter' | 'pågår' | 'ferdig' | 'trenger-hjelp' | 'hoppet-over' | 'feil';

export interface StageState {
  status: StageStatus;
  note?: string;
  progress?: { done: number; total: number };
  updatedAt?: string;
}

export const STAGE_ORDER: StageName[] = ['registrering', 'sidelesing', 'bildelesing', 'segmentering', 'analyse', 'kobling', 'dekning'];
export const STAGE_LABEL: Record<StageName, string> = {
  registrering: 'Registrert',
  sidelesing: 'Sider lest',
  bildelesing: 'Bilder og skann',
  segmentering: 'Oppgaver funnet',
  analyse: 'Analysert',
  kobling: 'Koblet til veiledning',
  dekning: 'Dekningskontroll',
};

export interface SourceDoc extends BaseEntity {
  kind: 'doc';
  fileName: string;
  mime: string;
  size: number;
  fingerprint: string;
  version: number;
  lineageId: ID; // felles ID for alle versjoner av samme dokument
  previousVersionId?: ID;
  supersededBy?: ID;
  sourceFormat: 'pdf-tekst' | 'pdf-skann' | 'pdf-blandet' | 'bilde' | 'docx' | 'tekst' | 'ukjent';
  meta: {
    title?: string;
    year?: number;
    term: Term;
    examType: ExamType;
    docType: DocType;
    setLabel?: string;
    examCode?: string;
    confirmed: boolean;
    comparable: boolean;
    comparabilityNote?: string;
    suggestions: { field: string; value: string; basis: Basis; why: string }[];
  };
  pageCount: number;
  status: 'behandles' | 'ferdig' | 'trenger-hjelp' | 'duplikat' | 'feil' | 'erstattet';
  duplicateOf?: ID;
  storage: { local: boolean; localKey?: string; assetId?: string };
  reserved?: boolean;
  stages: Record<StageName, StageState>;
  linkedExamDocId?: ID;
  linkBasis?: string[];
  linkConfirmed?: boolean;
  errors: string[];
  analyzer?: 'regelbasert' | 'ai' | 'regelbasert+ai';
  guide?: { header: string; items: { taskNo: number; sub: string; label: string; page: number; text: string; points?: number; pointsQuote?: string; lines: { page: number; text: string; box?: [number, number, number, number] }[] }[] };
  linkCandidates?: { examDocId: string; score: number; basis: string[] }[];
  similarTo?: { docId: string; similarity: number; resolved?: 'duplikat' | 'alternativ' | 'eget' };
  notes?: string[];
  questions?: string[];
  equalSubWeights?: boolean;
  /** Oppgavetekst og sensorveiledning i samme dokument (vanlig ved BI: «Sensorveiledning» med spørsmålene). */
  selfContained?: boolean;
  /** Versjon av behandlingskjeden dokumentet sist ble kjørt med. Eldre dokumenter analyseres på nytt. */
  pipelineVersion?: number;
  /** «essay»: fem likeverdige tekstoppgaver (f.eks. organisasjonsatferd og ledelse). */
  layout?: 'essay';
  /** Generelle vurderingskriterier fra veiledningen (gjelder alle spørsmålene i settet). */
  essayCriteria?: { text: string; quote: string; page: number }[];
  /** Pensumlisten slik veiledningen oppgir den. */
  curriculum?: string[];
  language?: 'nb' | 'nn';
}

/** Dokumenter som gir oppgaver til kart, trening og prøver. */
export function isExamSet(d: Pick<SourceDoc, 'meta' | 'selfContained'>): boolean {
  if (d.meta.docType === 'oppgavesamling') return false;
  return d.meta.docType === 'eksamen' || !!d.selfContained;
}

export type PageStatus = 'ikke-behandlet' | 'lest' | 'trenger-ai-lesing' | 'trenger-visuell-kontroll' | 'uleselig' | 'irrelevant' | 'manuelt-rettet' | 'ai-lest' | 'ocr-lest';

export interface PageRec extends BaseEntity {
  kind: 'page';
  docId: ID;
  docVersion: number;
  pdfPage: number;
  printedPage?: string;
  text: string;
  textSource: 'tekstlag' | 'ai-lesing' | 'manuell' | 'docx' | 'ingen' | 'ocr';
  /** Gjennomsnittlig sikkerhet ved tekstgjenkjenning (0–100). */
  ocrConfidence?: number;
  hasFigure: boolean;
  figureNote?: string;
  status: PageStatus;
  statusNote?: string;
  uncertainties?: string[];
  taskRefs: ID[];
  /** Tekstlinjer med posisjon (0–1 av sidebredde/-høyde), brukt til markering i originalvisningen. */
  lines?: { t: string; b: [number, number, number, number]; bold?: boolean; mark?: 'valgt' | 'ikke-valgt'; conf?: number }[];
  figureBoxes?: [number, number, number, number][];
  width?: number;
  height?: number;
}

export interface SourceRef {
  docId: ID;
  docVersion: number;
  pdfPage: number;
  printedPage?: string;
  quote?: string;
  taskLabel?: string;
}

export type FieldStatus = 'avlest' | 'offisiell' | 'regelbasert' | 'ai-tolkning' | 'bruker' | 'mangler';

export interface Field<T> {
  value: T;
  status: FieldStatus;
  basis: string;
}

export type CriterionBasis = 'offisielt' | 'oppgavekrav' | 'faglig-tolkning' | 'uavklart';

export interface Criterion {
  id: string;
  text: string;
  basis: CriterionBasis;
  source?: SourceRef;
  skill?: string;
}

export interface Conflict {
  id: string;
  description: string;
  officialValue: string;
  computedValue: string;
  source?: SourceRef;
  status: 'åpen' | 'undersøkt';
  resolution?: string;
}

export type TaskType = 'beregning' | 'utledning' | 'tolkning' | 'tegning' | 'sammenlikning' | 'drøfting' | 'flervalg' | 'forklaring';

export interface SubtaskAnalysis {
  analyzer: 'regelbasert' | 'ai' | 'regelbasert+ai' | 'ingen';
  analyzedAt: string;
  assignment: Field<string>;
  topics: Field<string[]>;
  skills: Field<string[]>; // ferdighets-ID-er eller fritekst
  taskType: Field<TaskType[]>;
  formulas: Field<{ expr: string; meaning: string; assumptions?: string; why?: string }[]>;
  prerequisites: Field<string[]>;
  criteria: Criterion[];
  points: { official?: number; officialSource?: SourceRef; officialQuote?: string; estimate?: number; estimateBasis?: string };
  time: { official?: number; estimate?: number; basis?: string };
  misconceptions: Field<string[]>;
  variation: Field<string[]>;
  familyKbId?: string;
  familyBasis?: string;
  intentId?: string;
  params?: Record<string, string>;
  computed?: {
    status: 'kontrollert' | 'ikke-kontrollert';
    method: string;
    answers: { label: string; value: string; display: string; symbol?: string; unit?: 'kr' | '%' | 'prosentpoeng' | 'mengde' }[];
  };
  certainty: {
    level: 'høy' | 'middels' | 'lav';
    basis: string;
    uncertainties: string[];
    extraction: 'tekstlag' | 'ai-lesing' | 'manuell' | 'mangler';
    validation: 'kontrollert' | 'delvis' | 'ikke-kontrollert';
  };
  conflicts: Conflict[];
  agreements?: string[];
  ai?: {
    at: string;
    assignment: string;
    topics: string[];
    skills: string[];
    taskType: TaskType[];
    formulas: { expr: string; meaning: string; assumptions?: string; why?: string }[];
    prerequisites: string[];
    criteria: { text: string; basis: CriterionBasis }[];
    misconceptions: string[];
    variation: string[];
    familyGuess: { knownFamilyId: string | null; proposedName: string };
    certainty: { level: 'høy' | 'middels' | 'lav'; basis: string; uncertainties: string[] };
    timeMinutes?: number;
  };
}

export interface SubTask extends BaseEntity {
  kind: 'subtask';
  docId: ID;
  docVersion: number;
  taskNo: number;
  sub: string;
  label: string;
  pages: number[];
  printedPages?: string[];
  intro?: string;
  text: string;
  textVersion: number;
  textHistory: { text: string; at: string; by: 'bruker' | 'system' }[];
  figures: { page: number; note: string; box?: [number, number, number, number]; inGuide?: boolean }[];
  dependsOn: string[];
  /** Del i eksamen (BI: Del 1 flervalg, Del 2 kortsvar, Del 3 lengre oppgave). */
  part?: number;
  format?: 'flervalg' | 'kortsvar' | 'langsvar' | 'oppgave';
  /** Svaralternativer i flervalg, med riktig svar når det kan leses av kilden. */
  choices?: { letter: string; text: string; correct?: boolean }[];
  answerBasis?: string;
  /** Sensorveiledningens tekst for akkurat denne oppgaven (når den står i samme dokument). */
  guide?: { text: string; lines: { page: number; text: string; box?: [number, number, number, number] }[] };
  /** Kilden har bare svaret, ikke oppgaveteksten. */
  stemMissing?: boolean;
  /** Områder i originalen der oppgaven står (vises som utsnitt: formler og figurer blir riktige). */
  regions?: { page: number; box: [number, number, number, number] }[];
  /** Områder i originalen der løsningsforslaget står. */
  solutionRegions?: { page: number; box: [number, number, number, number] }[];
  /** Sluttsvar lest fra løsningsforslaget, i SI-enheter. */
  answerKeys?: { symbol: string; value: string; unit?: string; display: string }[];
  /** Kapittel eller tema oppgaven står under i kilden (oppgavesamlinger). */
  topicHint?: string;
  /** Oppgaven kommer fra en oppgavesamling, ikke et eksamenssett. */
  fromCollection?: boolean;
  analysis: SubtaskAnalysis;
  stale?: boolean;
  seg: { points?: number; pointsQuote?: string; taskPoints?: number; taskWeightPct?: number; subtaskCount: number; lineBoxes: { page: number; box: [number, number, number, number] }[] };
}

export interface Family extends BaseEntity {
  kind: 'family';
  kbId?: string;
  name: string;
  description: string;
  basis: 'regelbasert' | 'ai-forslag' | 'bruker';
  members: ID[];
  commonStructure: string[];
  surfaceOnly: string[];
  differences: { subtaskId: ID; changes: string[] }[];
  difficultyNote?: { text: string; basis: 'dokumentert' | 'faglig-vurdering' };
  skills: string[];
}

export interface RubricItem {
  id: string;
  text: string;
  basis: CriterionBasis;
  required: boolean;
  example?: string;
}

export interface SolutionStep {
  tex: string;
  text: string;
  why: string;
  kind?: 'definisjon' | 'modellantakelse' | 'identitet' | 'omforming' | 'innsetting' | 'tolkning' | 'kontroll';
}

export interface HintLadder {
  small: string;
  firstStep: string;
  stepExplanation: string;
  workedExample: { intro: string; steps: SolutionStep[] };
}

export type PartKind = 'beregning' | 'forklaring' | 'graf' | 'flervalg' | 'finn-feilen';

export interface GenPart {
  id: string;
  label: string;
  prompt: string;
  kind: PartKind;
  /** Hvor fasiten kommer fra, når den ikke er fra en mal (f.eks. sensorveiledningen). */
  answerSource?: string;
  skills: string[];
  math?: MathContext;
  targets?: AnswerTarget[];
  rubric?: RubricItem[];
  choices?: { id: string; text: string; correct: boolean; why: string }[];
  flawed?: { lines: string[]; errorLine: number; correction: string };
  graph?: GraphSpec;
  solution: SolutionStep[];
  hints: HintLadder;
  methodCheckpoints: MethodCheckpoint[];
  givenSteps?: string[]; // for fading: steg som er gitt
  modelAnswer?: string;
  /** Egenkontroll mot løsningsforslaget: alltid selvvurdering, teller aldri som mestring, og tas ikke med på prøver. */
  selfCheck?: boolean;
}

export type CheckpointDetect =
  | { type: 'oppsett'; v: string } // likning i v som stemmer, men ikke er selve svaret
  | { type: 'isolasjonsform'; v: string; k: string; m: string } // k = m·v med riktige tall
  | { type: 'isolering'; v: string } // v = løsningsverdi
  | { type: 'verdi'; value: string; symbols: string[] } // en beregnet verdi dukker opp
  | { type: 'kontroll'; value: string; count: number } // verdien regnet ut på flere måter
  | { type: 'forklaring' }; // vurderes via vurderingsramme

export interface MethodCheckpoint {
  id: string;
  label: string;
  skill: string;
  detect: CheckpointDetect;
  required: boolean;
}

export interface GraphSpec {
  type: 'likevekt' | 'kostnad' | 'prosent';
  params: Record<string, string>;
  task?: 'tegn' | 'les' | 'vis';
  /** Aksegrenser for tegneoppgaver (Q vannrett, P loddrett). */
  qMax?: number;
  pMax?: number;
}

export type VariationLevel = 1 | 2 | 3 | 4;
export type GenStyle = 'standard' | 'delferdighet' | 'fading' | 'finn-feilen' | 'eksempel';

export interface GeneratedTask extends BaseEntity {
  kind: 'gen';
  familyKbId: string;
  templateId: string;
  templateVersion: number;
  level: VariationLevel;
  style: GenStyle;
  params: Record<string, string>;
  seed: number;
  title: string;
  intro: string;
  context: string;
  parts: GenPart[];
  skills: string[];
  structureKey: string;
  sourceRefs: { familyId?: ID; subtaskIds: ID[] };
  validation: { status: 'gyldig' | 'til-kontroll' | 'forkastet'; checks: { name: string; ok: boolean; detail: string }[] };
  wording: 'mal' | 'ai-formulert';
  estMinutes: number;
  reservedForExam?: boolean;
  /** Figurer fra originaldokumentet som hører til oppgaven (vises som utsnitt). */
  sourceFigures?: { docId: string; page: number; box: [number, number, number, number] }[];
  /** Oppgaven slik den står i originalen (utsnitt med tekst, formler og figur). */
  sourceRegions?: { docId: string; page: number; box: [number, number, number, number] }[];
  /** Løsningsforslaget i originalen, vist etter at eleven har levert. */
  solutionRegions?: { docId: string; page: number; box: [number, number, number, number] }[];
  /** Hvor originalen kommer fra (vises over tittelen). */
  sourceKind?: 'eksamen' | 'oppgavesamling';
}

export interface HelpEvent {
  at: string;
  level: 0 | 1 | 2 | 3 | 4 | 5; // 0 = spørsmål/avklaring, 1 lite hint … 5 full løsning
  type: 'hint' | 'første-steg' | 'forklaring' | 'eksempel' | 'løsning' | 'chat' | 'sjekk-steg' | 'vis-meg' | 'avklaring';
  partId?: string;
  text?: string;
}

export interface WorkLine {
  text: string;
  source: 'typed' | 'image';
  imageId?: string;
  region?: { x: number; y: number; w: number; h: number };
  certain?: boolean;
  alternatives?: string[];
}

export interface ImageRef {
  id: string;
  localKey?: string;
  assetId?: string;
  name: string;
  at: string;
  transcription?: {
    by: 'ai' | 'elev' | 'demo-fast';
    steps: { text: string; legible: 'sikker' | 'usikker' | 'uleselig'; alternatives?: string[]; region?: { x: number; y: number; w: number; h: number } }[];
    note?: string;
  };
  demo?: boolean;
}

export interface PartAttempt {
  partId: string;
  lines: WorkLine[];
  resolutions: Record<string, string>;
  explanation: string;
  choiceId?: string;
  flawedLine?: number;
  graphPoints?: { curve: string; points: { x: number; y: number }[] }[];
  images: ImageRef[];
  confirmedReadings: Record<number, string>;
  assessment?: PartAssessment;
  submitted: boolean;
  /** Poeng og fremgang er allerede gitt for denne deloppgaven (gis bare én gang per forsøk). */
  counted?: boolean;
  /** Hvor mange ganger vurderingen er trukket tilbake («Vurderingen er feil»). */
  reassessed?: number;
}

export interface PartAssessment {
  at: string;
  method: {
    verdict: 'riktig' | 'delvis' | 'feil' | 'ikke-vist' | 'uavklart';
    checkpoints: { id: string; label: string; skill: string; shown: boolean | null }[];
    firstDeviation?: { line: number; kind: string; detail: string; needsReadingConfirmation: boolean };
    lastGoodLine?: number | null;
  };
  answer: {
    verdict: 'riktig' | 'delvis' | 'feil' | 'mangler' | 'uavklart' | 'ikke-relevant';
    items: { label: string; verdict: string; given?: string; expected?: string; note?: string }[];
  };
  interpretation?: {
    verdict: 'oppfylt' | 'delvis' | 'ikke-oppfylt' | 'uavklart' | 'ikke-vurdert';
    basis: 'ai-vurdering' | 'selvvurdering' | 'ikke-vurdert';
    criteria: { id: string; text: string; verdict: string; evidence?: string; comment?: string }[];
    summary?: string;
  };
  misconception?: { id: string; label: string; detail: string };
  readingIssues: string[];
  feedback: string;
  basis: string;
  uncertain: boolean;
}

export interface ChatMsg {
  role: 'elev' | 'lærer' | 'system';
  text: string;
  at: string;
  basis?: 'regelbasert' | 'ai' | 'demo';
  partId?: string;
}

export interface Attempt extends BaseEntity {
  kind: 'attempt';
  taskRef: { type: 'gen' | 'subtask'; id: ID };
  mode: 'læring' | 'eksamen' | 'diagnose';
  sessionId?: ID;
  examId?: ID;
  startedAt: string;
  submittedAt?: string;
  parts: PartAttempt[];
  help: HelpEvent[];
  chat: ChatMsg[];
  sawSolution: boolean;
  confidence?: 'sikker' | 'usikker' | 'gjettet';
  status: 'pågår' | 'levert' | 'avbrutt';
  timeSpentSec: number;
}

export type EvidenceOutcome = 'selvstendig-riktig' | 'riktig-med-støtte' | 'delvis' | 'ikke-riktig' | 'uavklart';

export interface Evidence extends BaseEntity {
  kind: 'evidence';
  skillId: string;
  attemptId: ID;
  taskRef: { type: 'gen' | 'subtask'; id: ID; partId: string };
  familyKbId?: string;
  at: string;
  outcome: EvidenceOutcome;
  supportLevel: number;
  sawSolution: boolean;
  variationLevel: number;
  structureKey: string;
  novelty: 'ny-struktur' | 'samme-mal' | 'repetisjon';
  context: 'øving' | 'eksamen' | 'diagnose';
  basis: string;
  voided?: { reason: string; at: string };
}

export interface SessionRec extends BaseEntity {
  kind: 'session';
  type: 'grunnleggende' | 'nivå' | 'oppgaver' | 'familie' | 'repetisjon' | 'reparasjon' | 'fri' | 'eksamensspm' | 'eksamensnær';
  startedAt: string;
  endedAt?: string;
  plan: { taskIds: ID[]; families: string[]; level?: number; targetMinutes?: number; reason: string; /** Planlagt antall når resten lages i bakgrunnen. */ targetCount?: number };
  currentIndex: number;
  summary?: { selv: string[]; hjelp: string[]; neste: string[] };
}

export interface ExamSim extends BaseEntity {
  kind: 'exam';
  source: { type: 'reservert'; docId: ID } | { type: 'generert'; basis: string };
  basisNote: string;
  durationMin: number;
  aids: string;
  taskIds: ID[];
  subtaskIds: ID[];
  startedAt?: string;
  submittedAt?: string;
  status: 'klar' | 'pågår' | 'levert' | 'avbrutt';
  attemptIds: ID[];
  result?: {
    perTask: { ref: string; title: string; score: number; max: number; verdict: string; uncertain: boolean }[];
    perSkill: { skillId: string; outcome: string }[];
    pointsNote: string;
    repairTaskIds: ID[];
    /** Oppgaver som ikke gikk, men som mangler tema (og derfor ikke fikk reparasjonsoppgaver). */
    unknownGaps?: number;
  };
}

export interface SettingsRec extends BaseEntity {
  kind: 'settings';
  activeCourseId?: ID;
  onboarded: boolean;
}

// ——— Om meg, Lær-leksjoner og poeng ———

export type MascotKind = 'robot' | 'rev' | 'katt';
export type CalculatorKind = 'enkel' | 'casio' | 'texas';

/** Studentens egne valg: interesser, læringsmåte, tutorfigur og kalkulator. Privat per bruker. */
export interface LearnerProfile extends BaseEntity {
  kind: 'profile';
  nickname?: string;
  interests: string[];
  interestsNote?: string;
  /** Bruk interessene i eksemplene (sendes da med til AI når en leksjon lages). */
  personalize: boolean;
  learnStyle: 'tekst' | 'visuell' | 'blanding';
  mascot: MascotKind;
  mascotName: string;
  calculator: CalculatorKind;
  dailyGoal: number;
  sound: boolean;
  /** Én ting om gangen, større knapper og korte tekster. */
  focusMode: boolean;
}

export type LessonVisual =
  | { kind: 'flyt'; items: string[] }
  | { kind: 'sammenlign'; left: { title: string; items: string[] }; right: { title: string; items: string[] } }
  | { kind: 'utforsk'; formulaId: string }
  /** En modell fra organisasjonsfaget, tegnet som figur med trykkbare deler. */
  | { kind: 'modell'; modelId: string };

export type LessonCard =
  | { type: 'intro'; title: string; body: string; mascot?: string }
  | { type: 'concept'; title: string; body: string; visual?: LessonVisual; mascot?: string }
  | { type: 'formula'; title: string; tex: string; parts: { tex: string; meaning: string }[]; whenToUse: string; formulaId?: string; mascot?: string }
  | { type: 'worked'; title: string; problem: string; steps: { text: string; tex?: string }[]; answer: string; mascot?: string }
  | { type: 'calculator'; title: string; task: string; expression: string; keys: string[]; result: string; tip: string; mascot?: string }
  | { type: 'patterns'; title: string; items: { looksLike: string; means: string }[]; mascot?: string }
  | { type: 'mnemonic'; title: string; body: string; mascot?: string }
  | { type: 'trap'; title: string; body: string; mascot?: string }
  | { type: 'check'; question: string; options: string[]; correct: number; why: string; mascot?: string; figure?: { docId: string; page: number; box: [number, number, number, number] } }
  /** Begreper som snus: begrepet foran, definisjonen (og et eksempel) bak. */
  | { type: 'terms'; title: string; items: { term: string; definition: string; example?: string }[]; mascot?: string }
  /** En situasjon fra arbeidslivet: hvilket begrep er dette? */
  | { type: 'case'; title: string; situation: string; concept: string; explanation: string; mascot?: string }
  /** Svarstruktur for et essayspørsmål: delene i rekkefølge og det sensor ser etter. */
  | { type: 'outline'; title: string; question?: string; items: { del: string; tekst: string }[]; points?: string[]; minutes?: number; mascot?: string };

export interface QuizItem {
  question: string;
  options: string[];
  correct: number;
  why: string;
  source: 'ai' | 'eksamen' | 'mal';
  /** Figuren spørsmålet viser til (utsnitt fra originalen). */
  figure?: { docId: string; page: number; box: [number, number, number, number] };
  /** Regnespørsmål med tallsvar i stedet for alternativer. */
  numeric?: { value: number; unit?: string; tol: number };
}

export interface LessonRec extends BaseEntity {
  kind: 'lesson';
  kbId: string;
  style: LearnerProfile['learnStyle'];
  version: number;
  basis: 'ai' | 'kunnskapsbase';
  personalized: boolean;
  /** Hva eksamen faktisk krever i temaet (AI-analysen), vist som «Dette spør eksamen om». */
  plan?: { mustKnow: string[]; skip: string[]; examUse: string };
  /** Hele AI-analysen av eksamensspørsmålene, gjenbrukt når leksjonen lages på nytt. */
  analysis?: unknown;
  cards: LessonCard[];
  quiz: QuizItem[];
  checks: { name: string; ok: boolean; detail: string }[];
}

export interface CompetitionRun {
  score: number;
  correct: number;
  total: number;
  ms: number;
  /** Tid (ms fra start) da hvert spørsmål ble besvart, for «spøkelset». */
  splits: number[];
  at: string;
}

/** Poeng, dager på rad og rekorder. Motivasjon, ikke mestring: mestring bygger fortsatt bare på evidens. */
export interface GameRec extends BaseEntity {
  kind: 'game';
  xp: number;
  days: Record<string, number>;
  streak: number;
  bestStreak: number;
  lastDay?: string;
  topics: Record<string, { lessonDoneAt?: string; lessonCards?: number; quizBest?: number; quizMax?: number; solved?: number; attempted?: number; xp?: number; lastAt?: string }>;
  chapters: Record<string, { best?: CompetitionRun; runs: number }>;
}

/** Status for ett flashcard (Leitner-bokser). */
export interface FlashCardState {
  /** Boks 1–6. Høyere boks = lengre tid til neste repetisjon. */
  b: number;
  /** Neste repetisjon (dato, ÅÅÅÅ-MM-DD). */
  d: string;
  /** Antall ganger «kunne det» og «kunne ikke». */
  r: number;
  w: number;
  /** Sist øvd (ISO-tid). */
  l: string;
}

/** Flashcard-fremgang for ett fag. Ett dokument per fag. */
export interface FlashRec extends BaseEntity {
  kind: 'flash';
  cards: Record<string, FlashCardState>;
}

export type Entity = Course | SourceDoc | PageRec | SubTask | Family | GeneratedTask | Attempt | Evidence | SessionRec | ExamSim | SettingsRec | LearnerProfile | LessonRec | GameRec | FlashRec;

export function entityKey(e: Pick<BaseEntity, 'kind' | 'id'>): string {
  return `${e.kind}:${e.id}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

let counter = 0;
export function newId(prefix: string): ID {
  counter = (counter + 1) % 1e6;
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${rnd}`;
}
