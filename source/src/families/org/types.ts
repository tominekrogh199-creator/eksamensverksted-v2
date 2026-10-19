// Kunnskapsbase for organisasjonsatferd og ledelse: temaer, begreper, modeller
// og eksempler fra arbeidslivet. All tekst er skrevet av appen ut fra fagstoffet
// (ikke kopiert fra lærebøkene eller eksamensfilene). Definisjonene bør sjekkes
// mot ordlyden i pensum, siden sensor gir uttelling for «begreper definert i
// samsvar med pensum».

export type OrgLevel = 'individ' | 'gruppe' | 'organisasjon' | 'ledelse';

export interface OrgConcept {
  id: string;
  term: string;
  /** Andre navn studenten kan møte (engelsk, synonymer). */
  aka?: string[];
  definition: string;
  /** En kort situasjon fra en arbeidsplass. Nevner ikke begrepet selv (brukes i «Eksempel → hvilket begrep?»). */
  example: string;
  /** Teoretiker eller forfatter knyttet til begrepet. */
  author?: string;
  /** Begreper som ofte forveksles med dette (id-er). */
  confuse?: string[];
}

export interface OrgIntent {
  id: string;
  label: string;
  match: RegExp[];
  /** Spesifikke mønstre vinner over generelle når flere intensjoner treffer. */
  specific?: boolean;
  /** Hva oppgaven ber om. */
  assignment: string;
  /** Faglig tolkning av hva et godt svar må få med (ikke offisielle kriterier). */
  keyPoints: string[];
  /** Svarskisse: én linje per del av svaret. */
  outline: { del: string; tekst: string }[];
  estMinutes: number;
}

export interface OrgTopic {
  id: string;
  name: string;
  shortName: string;
  level: OrgLevel;
  description: string;
  /** Vektede signalord for å kjenne igjen temaet i eksamensspørsmål. */
  signals: [RegExp, number][];
  minScore: number;
  intents: OrgIntent[];
  concepts: OrgConcept[];
  /** Modeller (id-er i ORG_MODELS) som hører til temaet. */
  models: string[];
  traps: { label: string; explanation: string }[];
  /** Huskeregel. */
  mnemonic?: string;
  /** Kort svarstruktur for temaet. */
  structure: string[];
}

export type OrgModelKind = 'matrise' | 'nivaer' | 'hierarki' | 'steg' | 'syklus' | 'trekant' | 'venn' | 'tospor' | 'kolonner' | 'grupper' | 'skala' | 'kjede';

export interface OrgModelPart {
  id: string;
  label: string;
  /** Kort tekst inne i figuren. */
  short?: string;
  text: string;
  example?: string;
  /** For grupper og kolonner: hvilken gruppe delen hører til. */
  group?: string;
}

export interface OrgModel {
  id: string;
  name: string;
  author: string;
  topic: string;
  kind: OrgModelKind;
  summary: string;
  parts: OrgModelPart[];
  /** Matrise: aksenavn og endepunkter. */
  axes?: { x: string; xLow: string; xHigh: string; y: string; yLow: string; yHigh: string };
  /** Grupper/kolonner: navn på gruppene i rekkefølge. */
  groups?: { id: string; label: string }[];
  /** Tospor/kjede: piler mellom deler (fra-id, til-id, valgfri tekst). */
  arrows?: [string, string, string?][];
  /** Hvordan modellen brukes i et eksamenssvar. */
  examUse: string;
  /** Pyramide (nederst bredest) eller isfjell (øverst synlig) for nivåer. */
  shape?: 'pyramide' | 'isfjell' | 'trapp';
}
