// Familie: Stykkavgift i en lineær markedsmodell (endret forutsetning for likevekt).
// Qd = a − b·Pk, Qs = c + d·Pp, Pp = Pk − t.
// Pk* = (a − c + d·t)/(b + d), Pp* = Pk* − t, Q* = a − b·Pk*.

import { Rat } from '../math/rational';
import type { GenPart } from '../domain/types';
import { FamilyKB, TemplateDef, randInt, pick, R, no, texNum, linExpr, step, IntentDef, RecognizeResult } from './common';
import { CONTEXTS, defLin, eqParams, linearCoeffs } from './likevekt';

export function taxParams(p: Record<string, string>) {
  const { a, b, c, d, P: P0, Q: Q0 } = eqParams(p);
  const t = R(p.t);
  const Pk = a.sub(c).add(d.mul(t)).div(b.add(d));
  const Pp = Pk.sub(t);
  const Q = a.sub(b.mul(Pk));
  return { a, b, c, d, t, P0, Q0, Pk, Pp, Q, cons: Pk.sub(P0), prod: P0.sub(Pp) };
}

const tplAvgift: TemplateDef = {
  id: 'avg-grunn',
  version: 1,
  level: 3,
  style: 'standard',
  name: 'Endret forutsetning: stykkavgift',
  description: 'En avgift skiller prisen kjøperne betaler fra prisen selgerne sitter igjen med.',
  skills: ['lik.losning', 'avg.modell', 'avg.fordeling'],
  build: (rng) => {
    const ctx = pick(rng, CONTEXTS);
    for (let tries = 0; tries < 400; tries++) {
      const b = randInt(rng, 1, 5);
      const d = randInt(rng, 1, 5);
      const P0 = randInt(rng, 10, 45);
      const Q0 = randInt(rng, 40, 180, 5);
      const t = (b + d) * randInt(rng, 1, 3);
      const a = Q0 + b * P0;
      const c = Q0 - d * P0;
      if (c < 0 || a > 360) continue;
      const p = { a: String(a), b: String(b), c: String(c), d: String(d), t: String(t) };
      const T = taxParams(p);
      if (T.Pp.sign() <= 0 || T.Q.sign() <= 0) continue;
      const [A, B, C, D, TT] = [T.a, T.b, T.c, T.d, T.t];
      const ctxK = {
        symbols: ['Qd', 'Qs', 'Pk', 'Pp'],
        defs: { Qd: defLin(A, B.neg(), 'P'), Qs: `${C.toString()} + (${D.toString()})*(P - ${TT.toString()})` },
        param: 'P',
        unknown: 'P',
        solution: { P: T.Pk.toString(), Pk: T.Pk.toString(), Pp: T.Pp.toString(), Q: T.Q.toString(), Qd: T.Q.toString(), Qs: T.Q.toString(), t: TT.toString() },
        alt: [
          {
            symbols: ['Qd', 'Qs', 'Pk', 'Pp'],
            defs: { Qd: `${A.toString()} - (${B.toString()})*(P + ${TT.toString()})`, Qs: defLin(C, D, 'P') },
            param: 'P',
            unknown: 'P',
            solution: { P: T.Pp.toString(), Pk: T.Pk.toString(), Pp: T.Pp.toString(), Q: T.Q.toString(), Qd: T.Q.toString(), Qs: T.Q.toString(), t: TT.toString() },
          },
        ],
      };
      const k = A.sub(C).add(D.mul(TT));
      const m = B.add(D);
      const partA: GenPart = {
        id: 'a',
        label: 'a',
        prompt: 'Finn likevektsprisen og likevektskvantumet før avgiften innføres.',
        kind: 'beregning',
        skills: ['lik.betingelse', 'lik.losning', 'alg.isolere'],
        math: { symbols: ['Qd', 'Qs'], defs: { Qd: defLin(A, B.neg(), 'P'), Qs: defLin(C, D, 'P') }, param: 'P', unknown: 'P', solution: { P: T.P0.toString(), Q: T.Q0.toString(), Qd: T.Q0.toString(), Qs: T.Q0.toString() } },
        targets: [
          { symbol: 'P', label: 'Likevektspris før avgift', value: T.P0.toString(), aliases: ['pris'] },
          { symbol: 'Q', label: 'Likevektskvantum før avgift', value: T.Q0.toString(), aliases: ['kvantum'] },
        ],
        solution: [
          step('Q_d = Q_s', 'Likevektsbetingelsen', '', 'definisjon'),
          step(`${linExpr(A, B.neg(), 'P', 'tex')} = ${linExpr(C, D, 'P', 'tex')}`, 'Sett inn', '', 'innsetting'),
          step(`P = ${texNum(T.P0)},\\quad Q = ${texNum(T.Q0)}`, 'Løs og sett inn', '', 'omforming'),
        ],
        hints: {
          small: 'Dette er en vanlig likevekt: Qd = Qs.',
          firstStep: `${linExpr(A, B.neg(), 'P')} = ${linExpr(C, D, 'P')}`,
          stepExplanation: 'Før avgiften betaler kjøperne og får selgerne samme pris.',
          workedExample: { intro: '', steps: [] },
        },
        methodCheckpoints: [
          { id: 'oppsett', label: 'Satte opp Qd = Qs', skill: 'lik.betingelse', detect: { type: 'oppsett', v: 'P' }, required: true },
          { id: 'isolering', label: 'Isolerte P', skill: 'alg.isolere', detect: { type: 'isolering', v: 'P' }, required: true },
        ],
      };
      const partB: GenPart = {
        id: 'b',
        label: 'b',
        prompt: `Myndighetene innfører en stykkavgift på ${no(TT)} kr per enhet som produsentene betaler inn. Finn prisen konsumentene betaler (Pk), prisen produsentene sitter igjen med (Pp), og det nye kvantumet.`,
        kind: 'beregning',
        skills: ['avg.modell', 'alg.isolere', 'alg.innsetting'],
        math: ctxK,
        targets: [
          { symbol: 'Pk', label: 'Konsumentpris', value: T.Pk.toString(), aliases: ['konsumentpris', 'konsumentene'] },
          { symbol: 'Pp', label: 'Produsentpris', value: T.Pp.toString(), aliases: ['produsentpris', 'produsentene'] },
          { symbol: 'Q', label: 'Nytt kvantum', value: T.Q.toString(), aliases: ['kvantum'] },
        ],
        solution: [
          step(`Q_s = ${texNum(C)} + ${texNum(D)}(P - ${texNum(TT)})`, 'Tilbudet avhenger av prisen selgerne sitter igjen med', `Selgerne betaler ${no(TT)} kr til staten for hver enhet. Når kjøperne betaler P, sitter selgerne igjen med P − ${no(TT)}. Dette er en modellantakelse: selgerne reagerer på prisen de faktisk får.`, 'modellantakelse'),
          step(`${linExpr(A, B.neg(), 'P', 'tex')} = ${texNum(C)} + ${texNum(D)}P - ${texNum(D.mul(TT))}`, 'Likevekt med avgift', 'Qd = Qs, der P er konsumentprisen.', 'innsetting'),
          step(`${texNum(k)} = ${texNum(m)}P`, 'Samle leddene', '', 'omforming'),
          step(`P_k = ${texNum(T.Pk)},\\quad P_p = ${texNum(T.Pk)} - ${texNum(TT)} = ${texNum(T.Pp)}`, 'Konsumentpris og produsentpris', 'Forskjellen mellom dem er avgiften.', 'identitet'),
          step(`Q = ${texNum(A)} - ${texNum(B)} \\cdot ${texNum(T.Pk)} = ${texNum(T.Q)}`, 'Kvantum', 'Kjøperne reagerer på prisen de betaler, Pk.', 'innsetting'),
        ],
        hints: {
          small: 'Etter avgiften er det to priser: den kjøperne betaler og den selgerne sitter igjen med. Hvilken pris reagerer selgerne på?',
          firstStep: `Skriv tilbudet som Qs = ${no(C)} + ${no(D)}(P − ${no(TT)}), der P er prisen kjøperne betaler.`,
          stepExplanation: `Avgiften legger seg som en kile mellom prisene: Pp = Pk − ${no(TT)}. Kjøperne ser Pk, selgerne ser Pp. Derfor bytter vi P i tilbudet med P − ${no(TT)}.`,
          workedExample: {
            intro: 'Eksempel: Qd = 100 − P, Qs = 20 + P, avgift 10 kr.',
            steps: [step('100 - P = 20 + (P - 10)', '', '', 'innsetting'), step('90 = 2P', '', '', 'omforming'), step('P_k = 45,\\ P_p = 35,\\ Q = 55', '', '', 'innsetting')],
          },
        },
        methodCheckpoints: [
          { id: 'modell', label: 'Modellerte avgiften som P − t i tilbudet (eller P + t i etterspørselen)', skill: 'avg.modell', detect: { type: 'oppsett', v: 'P' }, required: true },
          { id: 'pk', label: 'Fant konsumentprisen', skill: 'alg.isolere', detect: { type: 'verdi', value: T.Pk.toString(), symbols: ['Pk', 'P'] }, required: true },
          { id: 'pp', label: 'Fant produsentprisen', skill: 'avg.modell', detect: { type: 'verdi', value: T.Pp.toString(), symbols: ['Pp', 'P'] }, required: true },
        ],
      };
      const partC: GenPart = {
        id: 'c',
        label: 'c',
        prompt: 'Hvor mye av avgiften bærer konsumentene, og hvor mye bærer produsentene? Forklar hvorfor fordelingen ble slik.',
        kind: 'forklaring',
        skills: ['avg.fordeling'],
        targets: [
          { symbol: 'Kons', label: 'Konsumentenes andel (kr)', value: T.cons.toString(), aliases: ['konsumentene', 'konsument'] },
          { symbol: 'Prod', label: 'Produsentenes andel (kr)', value: T.prod.toString(), aliases: ['produsentene', 'produsent'] },
        ],
        math: { symbols: ['Pk', 'Pp'], defs: {}, param: 'x', unknown: 'x', solution: { Pk: T.Pk.toString(), Pp: T.Pp.toString(), P: T.P0.toString(), Kons: T.cons.toString(), Prod: T.prod.toString() }, answerSymbols: [] },
        rubric: [
          { id: 'k1', text: `Regner ut at konsumentprisen øker med ${no(T.cons)} kr og produsentprisen faller med ${no(T.prod)} kr (til sammen ${no(TT)} kr).`, basis: 'faglig-tolkning', required: true },
          { id: 'k2', text: `Forklarer fordelingen med hvor sterkt de to sidene reagerer på pris: den siden som reagerer minst, bærer mest. Her er b = ${no(B)} og d = ${no(D)}.`, basis: 'faglig-tolkning', required: true },
          { id: 'k3', text: 'Skiller mellom hvem som betaler avgiften inn, og hvem som bærer den økonomisk.', basis: 'faglig-tolkning', required: false },
        ],
        solution: [
          step(`${texNum(T.Pk)} - ${texNum(T.P0)} = ${texNum(T.cons)}`, 'Konsumentenes byrde', 'Hvor mye mer kjøperne betaler enn før avgiften.', 'tolkning'),
          step(`${texNum(T.P0)} - ${texNum(T.Pp)} = ${texNum(T.prod)}`, 'Produsentenes byrde', 'Hvor mye mindre selgerne sitter igjen med.', 'tolkning'),
          step('', 'Forklaring', `Konsumentene bærer andelen d/(b + d) = ${no(D)}/${no(m)} av avgiften. ${B.cmp(D) < 0 ? 'Kjøperne reagerer svakere på pris enn selgerne (b < d), så de bærer mest.' : B.cmp(D) > 0 ? 'Selgerne reagerer svakere på pris enn kjøperne (d < b), så de bærer mest.' : 'Begge sider reagerer like sterkt (b = d), så byrden deles likt.'} Det spiller ingen rolle hvem som betaler inn avgiften.`, 'tolkning'),
        ],
        hints: {
          small: 'Sammenlikn prisene med likevektsprisen før avgiften.',
          firstStep: `Konsumentene: ${no(T.Pk)} − ${no(T.P0)}. Produsentene: ${no(T.P0)} − ${no(T.Pp)}.`,
          stepExplanation: 'Den siden av markedet som har færrest gode alternativer (reagerer minst på pris), må ta mest av avgiften.',
          workedExample: { intro: '', steps: [] },
        },
        methodCheckpoints: [
          { id: 'kons', label: 'Regnet ut konsumentenes andel', skill: 'avg.fordeling', detect: { type: 'verdi', value: T.cons.toString(), symbols: ['Kons'] }, required: true },
          { id: 'forklaring', label: 'Forklarte fordelingen', skill: 'avg.fordeling', detect: { type: 'forklaring' }, required: true },
        ],
        modelAnswer: `Konsumentene betaler ${no(T.cons)} kr mer og produsentene får ${no(T.prod)} kr mindre enn før. Den siden som reagerer minst på pris, bærer mest av avgiften.`,
      };
      return {
        title: 'Stykkavgift i et marked',
        intro: `I et marked for ${ctx.good} er Qd = ${linExpr(A, B.neg(), 'P')} og Qs = ${linExpr(C, D, 'P')}, der P er prisen (${ctx.price}).`,
        context: ctx.good,
        parts: [partA, partB, partC],
        params: p,
        skills: ['lik.betingelse', 'lik.losning', 'alg.isolere', 'avg.modell', 'avg.fordeling'],
        structureKey: 'avg-grunn',
        estMinutes: 16,
      };
    }
    throw new Error('Fant ikke gyldige parametere');
  },
};

function recognize(text: string): RecognizeResult | null {
  const tm = /(?:stykkavgift|avgift|særavgift)\D{0,30}?(\d+(?:[.,]\d+)?)\s*(?:kr|kroner)/i.exec(text);
  if (!tm) return null;
  const t = text.replace(/[−–]/g, '−');
  const dm = /Q\s?_?\s?[dD]\s*=\s*([^\n;]+?)(?=\s+og\s|,\s|;|\.\s|\n|$|\s{2,})/.exec(t);
  const sm = /Q\s?_?\s?[sS]\s*=\s*([^\n;]+?)(?=\s+og\s|,\s|;|\.\s|\n|$|\s{2,})/.exec(t);
  if (!dm || !sm) return null;
  const dc = linearCoeffs(dm[1]);
  const sc = linearCoeffs(sm[1]);
  if (!dc || !sc || dc.m.sign() >= 0 || sc.m.sign() <= 0) return null;
  return {
    params: { a: dc.k.toString(), b: dc.m.neg().toString(), c: sc.k.toString(), d: sc.m.toString(), t: Rat.parseDecimal(tm[1]).toString() },
    basis: `Fant etterspørsel, tilbud og en avgift på ${tm[1]} kr i teksten.`,
    strength: 0.97,
  };
}

const intents: IntentDef[] = [
  {
    id: 'avg.fordeling',
    specific: true,
    label: 'Hvem bærer avgiften',
    match: [/(bærer|fordel|belastning|hvem betaler|byrde)/i],
    skills: ['avg.fordeling'],
    taskType: ['beregning', 'forklaring'],
    assignment: 'Beregne hvor mye av avgiften konsumenter og produsenter bærer, og forklare fordelingen.',
    interpretation: ['Du må sammenlikne konsumentprisen og produsentprisen med likevektsprisen før avgiften.', 'Du må forklare fordelingen med hvor sterkt kjøpere og selgere reagerer på pris.', 'Du bør skille mellom hvem som betaler inn avgiften og hvem som bærer den.'],
    prerequisites: ['Likevekt før og etter avgift'],
    misconceptions: ['Tror den som betaler inn avgiften, alltid bærer hele avgiften'],
    variation: ['Hvem som betaler inn avgiften, endrer ikke fordelingen i modellen'],
    estMinutes: 7,
    compute: (p) => {
      const T = taxParams(p);
      return [
        { label: 'Konsumentenes andel (kr)', value: T.cons.toString(), display: no(T.cons), unit: 'kr' },
        { label: 'Produsentenes andel (kr)', value: T.prod.toString(), display: no(T.prod), unit: 'kr' },
      ];
    },
  },
  {
    id: 'avg.likevekt',
    label: 'Likevekt med avgift',
    match: [/(avgift)/i],
    skills: ['avg.modell', 'lik.losning', 'alg.isolere'],
    taskType: ['beregning'],
    assignment: 'Finne konsumentpris, produsentpris og kvantum etter at en stykkavgift er innført.',
    interpretation: ['Du må modellere avgiften som en forskjell mellom prisen kjøperne betaler og prisen selgerne sitter igjen med.', 'Du må finne både Pk, Pp og det nye kvantumet.'],
    prerequisites: ['Finne likevekt uten avgift'],
    misconceptions: ['Legger avgiften til likevektsprisen uten å regne ny likevekt', 'Setter inn avgiften med feil fortegn'],
    variation: ['Avgiften kan betales inn av kjøper eller selger', 'Kan være subsidie i stedet for avgift (motsatt fortegn)'],
    estMinutes: 10,
    compute: (p) => {
      const T = taxParams(p);
      return [
        { label: 'Konsumentpris Pk', value: T.Pk.toString(), display: no(T.Pk), symbol: 'Pk', unit: 'kr' },
        { label: 'Produsentpris Pp', value: T.Pp.toString(), display: no(T.Pp), symbol: 'Pp', unit: 'kr' },
        { label: 'Kvantum Q', value: T.Q.toString(), display: no(T.Q), symbol: 'Q', unit: 'mengde' },
      ];
    },
  },
];

export const avgift: FamilyKB = {
  id: 'likevekt-avgift',
  name: 'Finne ny likevekt og fordeling når en stykkavgift innføres',
  shortName: 'Stykkavgift',
  topic: 'Marked og likevekt',
  subtopics: ['Avgifter', 'Skattebyrde'],
  description: 'Oppgaver der en avgift per enhet skiller konsumentpris fra produsentpris. Samme modell som markedslikevekt, men forutsetningen er endret.',
  skills: ['avg.modell', 'avg.fordeling', 'lik.losning', 'alg.isolere'],
  formulas: [
    {
      id: 'f-kile',
      tex: 'P_p = P_k - t',
      name: 'Avgiftskilen',
      kind: 'identitet',
      kindWhy: 'Følger direkte av hva en stykkavgift er: selgerne sender t kr per enhet videre til staten.',
      symbols: [
        { sym: 'P_k', meaning: 'Prisen kjøperne betaler', unit: 'kr per enhet' },
        { sym: 'P_p', meaning: 'Prisen selgerne sitter igjen med', unit: 'kr per enhet' },
        { sym: 't', meaning: 'Avgift per enhet', unit: 'kr per enhet' },
      ],
      conditions: ['Gjelder en fast avgift per enhet (ikke prosentvis merverdiavgift).'],
      whatIf: ['Større t gir større avstand mellom prisene og lavere kvantum.'],
      figure: 'avgift',
    },
    {
      id: 'f-andel',
      tex: '\\Delta P_k = \\frac{d}{b + d}\\, t',
      name: 'Konsumentenes andel av avgiften',
      kind: 'avledet sammenheng',
      kindWhy: 'Utledes fra de lineære uttrykkene. Gjelder bare når både tilbud og etterspørsel er lineære.',
      symbols: [
        { sym: '\\Delta P_k', meaning: 'Økningen i konsumentprisen', unit: 'kr' },
        { sym: 'b', meaning: 'Hvor sterkt kjøperne reagerer på pris', unit: 'enheter per krone' },
        { sym: 'd', meaning: 'Hvor sterkt selgerne reagerer på pris', unit: 'enheter per krone' },
      ],
      conditions: ['Lineære kurver', 'b + d > 0'],
      whatIf: ['Hvis kjøperne nesten ikke reagerer (b liten), bærer de nesten hele avgiften.'],
      figure: 'avgift',
    },
  ],
  intents,
  templates: [tplAvgift],
  misconceptions: [
    { id: 'avgift-lagt-paa', label: 'Legger hele avgiften på prisen', explanation: 'Prisen kjøperne betaler øker vanligvis med mindre enn avgiften, fordi kvantumet også endres.' },
    { id: 'avgift-fortegn', label: 'Feil fortegn på avgiften i tilbudet', explanation: 'Selgerne sitter igjen med P − t, ikke P + t.' },
  ],
  recognize,
  explanations: {
    short: (p) => {
      const T = taxParams(p);
      return { text: 'En stykkavgift skaper to priser. Kjøperne betaler Pk, selgerne får Pp = Pk − t. Vi løser likevekten med tilbudet skrevet i Pp.', example: `Med t = ${no(T.t)}: Pk = ${no(T.Pk)}, Pp = ${no(T.Pp)}, Q = ${no(T.Q)}.` };
    },
    analogy: { text: 'Tenk på avgiften som en bomstasjon mellom kjøper og selger: kjøperen betaler inn på den ene siden, selgeren får det som er igjen på den andre.', limits: 'Analogien sier ikke noe om hvem som bærer kostnaden. Det avgjøres av hvor sterkt kjøpere og selgere reagerer på pris, ikke av hvem som står ved bommen.' },
    derivationFormulaId: 'f-andel',
  },
  solutionStructure: ['Finne likevekt før avgift', 'Skrive tilbudet med P − t', 'Løse ny likevekt', 'Finne Pk, Pp og Q', 'Sammenlikne med prisen før avgift'],
  surfaceFeatures: ['Størrelsen på avgiften', 'Hvem som formelt betaler inn'],
};
