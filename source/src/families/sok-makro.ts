// Makrodelen: BNP, inflasjon og reallønn, og konjunkturer (konsum,
// investering, konsumutjevning og multiplikatoren).

import type { GenPart } from '../domain/types';
import { FamilyKB, TemplateDef, IntentDef, randInt, pick, R, no, texNum, step } from './common';
import { mcTemplate, explainTemplate, keywordRecognizer, mcPart, McItem, ExplainItem } from './verbal';
import type { Rat } from '../math/rational';

const x = (label: string, value: Rat, aliases: string[], minDecimals?: number, percent?: boolean) => ({ symbol: 'x', label, value: value.toString(), aliases, minDecimals, percent });
const numMath = () => ({ symbols: [], defs: {}, param: 'x', unknown: 'x', solution: {}, answerSymbols: ['x'] });

// ——— BNP, inflasjon og reallønn ———

function realParams(text: string): Record<string, string> {
  const num = (s: string) => s.replace(',', '.');
  const nom = /(?:lønnsøkning\w*|lønnsvekst\w*|lønnen (?:økte|steg)|nominell(?:e)? lønn\w*)[^%]{0,60}?(\d+(?:[.,]\d+)?)\s*%/i.exec(text);
  const inf = /(?:inflasjon(?:en)?|prisvekst(?:en)?|prisene (?:økte|steg))[^%]{0,30}?(\d+(?:[.,]\d+)?)\s*%/i.exec(text);
  const real = /reallønnsvekst(?:en)?[^%]{0,40}?(\d+(?:[.,]\d+)?)\s*%/i.exec(text);
  const out: Record<string, string> = {};
  if (nom) out.nom = num(nom[1]);
  if (inf) out.inf = num(inf[1]);
  if (real) out.real = num(real[1]);
  return out;
}

const tplReal: TemplateDef = {
  id: 'makro-reallonn',
  version: 1,
  level: 1,
  style: 'standard',
  name: 'Reallønn og kjøpekraft',
  description: 'Reallønnsvekst ≈ nominell lønnsvekst − inflasjon.',
  skills: ['makro.inflasjon'],
  build: (rng) => {
    const nom = randInt(rng, 2, 8);
    let inf = randInt(rng, 1, 9);
    if (inf === nom) inf += 1;
    const real = nom - inf;
    const exact = R(100 + nom).div(R(100 + inf)).sub(R(1)).mul(R(100));
    const parts: GenPart[] = [
      { id: 'a', label: 'a', prompt: 'Omtrent hvor mye endret reallønnen seg (i prosent)?', kind: 'beregning', skills: ['makro.inflasjon'], math: numMath(), targets: [{ ...x('Endring i reallønn', R(real), ['reallønn', 'endring', 'reallønnen'], 0, true), tolerance: '0.2' }], solution: [step(`${nom}\\,\\% - ${inf}\\,\\% = ${real}\\,\\%`, 'Nominell lønnsvekst minus inflasjon', `Tilnærming som er god når tallene er små. Eksakt: (1,${String(nom).padStart(2, '0')}/1,${String(inf).padStart(2, '0')} − 1) · 100 % ≈ ${no(exact, 2)} %.`, 'identitet')], hints: { small: 'Hva måler reallønnen?', firstStep: `${nom} − ${inf}`, stepExplanation: 'Reallønnen er lønnen justert for prisnivået: hvor mye du faktisk kan kjøpe.', workedExample: { intro: '', steps: [] } }, methodCheckpoints: [] },
      mcPart(rng, { id: 'kjopekraft', skill: 'makro.inflasjon', stem: 'Hva har skjedd med kjøpekraften?', correct: real > 0 ? 'Den har økt, fordi lønnen har steget mer enn prisene.' : 'Den har falt, fordi prisene har steget mer enn lønnen.', wrong: [real > 0 ? 'Den har falt, fordi prisene har steget.' : 'Den har økt, fordi lønnen har steget.', 'Den er uendret, fordi både lønn og priser har økt.', 'Den har økt hvis personen sparer mer.'], why: 'Kjøpekraften følger reallønnen: nominell lønnsvekst minus prisvekst.' }, 'b', 'b'),
    ];
    return { title: 'Inflasjon og reallønn', intro: `I fjor fikk du en lønnsøkning på ${nom} %, samtidig som inflasjonen var ${inf} %.`, context: 'reallønn', parts, params: { nom: String(nom), inf: String(inf) }, skills: ['makro.inflasjon'], structureKey: `makro-reallonn|${real > 0 ? 'opp' : 'ned'}`, estMinutes: 4 };
  },
};

const tplBnp: TemplateDef = {
  id: 'makro-bnp',
  version: 1,
  level: 1,
  style: 'standard',
  name: 'BNP med utgiftsmetoden',
  description: 'BNP = C + I + G + (X − M).',
  skills: ['makro.bnp'],
  build: (rng) => {
    const C = randInt(rng, 180, 260) * 10;
    const I = randInt(rng, 60, 120) * 10;
    const G = randInt(rng, 100, 160) * 10;
    const X = randInt(rng, 150, 250) * 10;
    const M = randInt(rng, 120, 220) * 10;
    const Y = C + I + G + X - M;
    const parts: GenPart[] = [
      { id: 'a', label: 'a', prompt: 'Beregn BNP (mrd. kr).', kind: 'beregning', skills: ['makro.bnp'], math: numMath(), targets: [x('BNP', R(Y), ['bnp', 'bruttonasjonalprodukt'], 0)], solution: [step(`${no(R(C))} + ${no(R(I))} + ${no(R(G))} + (${no(R(X))} - ${no(R(M))}) = ${no(R(Y))}`, 'C + I + G + nettoeksport', 'Importen trekkes fra fordi den er produsert i andre land, men inngår i C, I og G.', 'identitet')], hints: { small: 'Utgiftsmetoden: alle sluttanvendelser av det som produseres i landet.', firstStep: 'C + I + G + (X − M)', stepExplanation: 'Import trekkes fra fordi den ikke er innenlandsk produksjon.', workedExample: { intro: '', steps: [] } }, methodCheckpoints: [] },
      mcPart(rng, { id: 'import', skill: 'makro.bnp', stem: 'Hvorfor trekkes importen fra når BNP beregnes med utgiftsmetoden?', correct: 'Fordi import er produsert i andre land, men er med i konsum, investering og offentlige kjøp.', wrong: ['Fordi import er dårlig for økonomien.', 'Fordi import allerede er med i eksporten.', 'Fordi staten betaler for importen.'], why: 'BNP måler innenlandsk produksjon. Utgiftene til importerte varer må trekkes ut.' }, 'b', 'b'),
    ];
    return { title: 'BNP med utgiftsmetoden', intro: `Et land har privat konsum på ${no(R(C))} mrd. kr, investeringer på ${no(R(I))} mrd., offentlig konsum og investering på ${no(R(G))} mrd., eksport på ${no(R(X))} mrd. og import på ${no(R(M))} mrd.`, context: 'bnp', parts, params: { C: String(C), I: String(I), G: String(G), X: String(X), M: String(M) }, skills: ['makro.bnp'], structureKey: 'makro-bnp', estMinutes: 4 };
  },
};

const MAKRO_MC: McItem[] = [
  { id: 'bnp-per', skill: 'makro.bnp', stem: 'Land A har et BNP på 4000 mrd. kr og 5 millioner innbyggere. Hva er BNP per innbygger, og hva sier tallet?', correct: '800 000 kr: gjennomsnittlig verdiskaping per person, ikke hva hver enkelt faktisk tjener.', wrong: ['800 000 kr: det hver innbygger får utbetalt etter skatt.', '80 000 kr: gjennomsnittlig verdiskaping per person.', '800 000 kr: hvor mye penger hver innbygger har i banken.'], why: '4000 mrd. / 5 mill. = 800 000 kr. BNP per innbygger er et gjennomsnitt av produksjonen og sier ingenting om fordelingen.' },
  { id: 'inflasjon-def', skill: 'makro.inflasjon', stem: 'Konsumprisindeksen går fra 120 til 126 på ett år. Hva er inflasjonen?', correct: '5 prosent', wrong: ['6 prosent', '4,8 prosent', '126 prosent'], why: '(126 − 120) / 120 = 0,05, altså 5 prosent. Tallet 6 er endringen i indekspoeng, ikke i prosent.' },
  { id: 'deflasjon', skill: 'makro.inflasjon', stem: 'Hvilket utsagn stemmer ikke?', correct: 'Deflasjon betyr at prisene stiger saktere enn året før.', wrong: ['Deflasjon betyr at det generelle prisnivået faller.', 'Med uendret nominell lønn gir deflasjon høyere reallønn.', 'Høy og uforutsigbar inflasjon gjør det vanskeligere å tolke prissignaler.'], why: 'At prisveksten avtar, kalles disinflasjon. Deflasjon betyr at prisnivået faktisk faller.' },
  { id: 'utgift', skill: 'makro.bnp', stem: 'Hvilke komponenter inngår i BNP etter utgiftsmetoden?', correct: 'Privat konsum (C), investeringer (I), offentlig konsum og investering (G) og nettoeksport (eksport minus import).', wrong: ['Lønn, profitt og skatt.', 'Privat konsum, sparing og skatt.', 'Eksport, import og valutakurs.'], why: 'BNP = C + I + G + (X − M).' },
  { id: 'kjopekraft', skill: 'makro.inflasjon', stem: 'Lønnen din øker med 3 prosent, mens prisene stiger med 5 prosent. Hva skjer med hvor mye du kan kjøpe for lønnen?', correct: 'Du kan kjøpe omtrent 2 prosent mindre, fordi reallønnen faller.', wrong: ['Du kan kjøpe 3 prosent mer, fordi lønnen har økt.', 'Du kan kjøpe like mye, fordi både lønn og priser har økt.', 'Du kan kjøpe 8 prosent mindre.'], why: 'Reallønnsvekst ≈ lønnsvekst − prisvekst = 3 − 5 = −2 prosent.' },
];

const MAKRO_EXPLAIN: ExplainItem[] = [
  { id: 'bnp-svakheter', skills: ['makro.bnp'], prompt: 'Et land har høyere BNP per innbygger enn et annet. Forklar hva BNP måler, og gi tre grunner til at innbyggerne likevel ikke nødvendigvis har det bedre.', rubric: [['Definerer BNP som markedsverdien av alle ferdige varer og tjenester produsert i landet i en periode.', true], ['Gir minst tre grunner, for eksempel fordeling, miljøskader, ulønnet arbeid og fritid, offentlige tjenester målt til kostnad, helse.', true]], model: 'BNP er markedsverdien av alle ferdige varer og tjenester som produseres i et land i løpet av en periode. Et høyt BNP per innbygger kan skjule store forskjeller, fordi det er et gjennomsnitt. Miljøskader trekkes ikke fra, og opprydding etter dem kan til og med øke BNP. Ulønnet arbeid og fritid er ikke med, og offentlige tjenester måles til det de koster, ikke til verdien for innbyggerne.', hints: { small: 'Hva er med i BNP, og hva er ikke med?', firstStep: 'Start med en presis definisjon.', why: 'BNP måler produksjon, ikke velferd.' } },
  { id: 'reallonn', skills: ['makro.inflasjon'], prompt: 'Nominell lønnsvekst var 6 %, men reallønnsveksten bare 1 %. Forklar hvordan det henger sammen.', rubric: [['Forklarer at reallønn er nominell lønn justert for prisnivået.', true], ['Prisene har økt, så reallønnen stiger mindre enn nominell lønn.', true], ['Regner ut at prisene steg omtrent 5 % (6 − 1).', false]], model: 'Reallønnen er lønnen målt i hva den kan kjøpe. Når prisene stiger, øker reallønnen mindre enn den nominelle lønnen. Her tilsvarer det en prisvekst på omtrent 6 − 1 = 5 %.', hints: { small: 'Hva er forskjellen på nominell og reell?', firstStep: 'Reallønnsvekst ≈ lønnsvekst − inflasjon.', why: 'Kjøpekraft.' } },
];

export const makro: FamilyKB = {
  id: 'bnp-inflasjon',
  name: 'BNP, inflasjon og reallønn',
  shortName: 'BNP og inflasjon',
  topic: 'Makroøkonomi',
  subtopics: ['BNP og utgiftsmetoden', 'Inflasjon og KPI', 'Reallønn og kjøpekraft'],
  description: 'Hvordan vi måler produksjon og prisvekst, og hvordan inflasjon påvirker reallønn og kjøpekraft.',
  skills: ['makro.bnp', 'makro.inflasjon'],
  formulas: [
    {
      id: 'f-reallonn',
      tex: '\\text{Reallønnsvekst} \\approx \\text{nominell lønnsvekst} - \\text{inflasjon}',
      name: 'Reallønnsvekst',
      kind: 'tilnærming',
      kindWhy: 'Tilnærming til den eksakte sammenhengen (1 + nominell)/(1 + inflasjon) − 1, god når tallene er små.',
      symbols: [
        { sym: '\\text{nominell lønnsvekst}', meaning: 'Prosentvis økning i kronelønnen', unit: '%' },
        { sym: '\\text{inflasjon}', meaning: 'Prosentvis økning i prisnivået (KPI)', unit: '%' },
      ],
      conditions: ['Små prosenttall (under ca. 10 %).'],
      whatIf: ['Inflasjon høyere enn lønnsvekst: kjøpekraften faller.'],
      calc: {
        inputs: [
          { sym: 'n', label: 'Nominell lønnsvekst (%)', min: -5, max: 15, step: 0.5, value: 4 },
          { sym: 'i', label: 'Inflasjon (%)', min: -5, max: 15, step: 0.5, value: 7 },
        ],
        compute: (v) => [
          { label: 'Tilnærmet reallønnsvekst', value: `${no(R(v.n - v.i), 1)} %` },
          { label: 'Eksakt', value: `${no(R(100 + v.n).div(R(100 + v.i)).sub(R(1)).mul(R(100)), 2)} %` },
        ],
      },
    },
    {
      id: 'f-bnp',
      tex: 'Y = C + I + G + (X - M)',
      name: 'BNP etter utgiftsmetoden',
      kind: 'identitet',
      kindWhy: 'En regnskapsidentitet: alt som produseres, brukes til noe.',
      symbols: [
        { sym: 'C', meaning: 'Privat konsum', unit: 'kr' },
        { sym: 'I', meaning: 'Investeringer', unit: 'kr' },
        { sym: 'G', meaning: 'Offentlig konsum og investering', unit: 'kr' },
        { sym: 'X - M', meaning: 'Nettoeksport', unit: 'kr' },
      ],
      conditions: [],
      whatIf: ['Høyere import ved gitt C, I, G gir lavere BNP.'],
    },
  ],
  intents: [
    { id: 'makro.reallonn', specific: true, label: 'Reallønn og kjøpekraft', match: [/reallønn|kjøpekraft/i], skills: ['makro.inflasjon'], taskType: ['forklaring', 'beregning'], assignment: 'Forklare reallønn og regne ut endringen i kjøpekraft fra lønnsvekst og inflasjon.', interpretation: ['Reallønn er nominell lønn justert for prisnivået.', 'Reallønnsvekst ≈ nominell lønnsvekst − inflasjon.'], prerequisites: ['Prosent'], misconceptions: ['Tror høyere nominell lønn alltid gir høyere kjøpekraft'], variation: [], estMinutes: 4, compute: (p) => {
      if (p.nom && p.inf) {
        const r = R(p.nom).sub(R(p.inf));
        return [{ label: 'Endring i reallønn (tilnærmet)', value: r.toString(), display: `${no(r)} %`, unit: '%' }];
      }
      if (p.nom && p.real) {
        const i = R(p.nom).sub(R(p.real));
        return [{ label: 'Prisvekst (tilnærmet)', value: i.toString(), display: `${no(i)} %`, unit: '%' }];
      }
      return null;
    } },
    { id: 'makro.inflasjon', label: 'Inflasjon', match: [/inflasjon|deflasjon|prisnivå|konsumprisindeks|KPI/i], skills: ['makro.inflasjon'], taskType: ['forklaring'], assignment: 'Forklare hva inflasjon er og hvordan den måles.', interpretation: ['Inflasjon er vedvarende vekst i det generelle prisnivået, målt med KPI.'], prerequisites: [], misconceptions: ['Blander prisnivå og prisvekst'], variation: [], estMinutes: 3 },
    { id: 'makro.bnp', label: 'BNP', match: [/\bBNP\b|bruttonasjonalprodukt|utgiftsmetoden/i], skills: ['makro.bnp'], taskType: ['forklaring'], assignment: 'Definere BNP presist og drøfte svakheter som velferdsmål.', interpretation: ['BNP = markedsverdien av ferdige varer og tjenester produsert innenlands i en periode.', 'Et godt svar drøfter flere svakheter (fordeling, miljø, ulønnet arbeid, offentlig sektor).'], prerequisites: [], misconceptions: ['Tror BNP måler inntekt etter skatt'], variation: [], estMinutes: 5 },
  ],
  templates: [tplReal, tplBnp, mcTemplate({ id: 'makro-mc', level: 1, name: 'Flervalg: BNP og inflasjon', description: 'Begreper.', title: 'BNP og inflasjon', items: MAKRO_MC }), explainTemplate({ id: 'makro-forklar', level: 3, name: 'Forklar som på eksamen', description: 'Kortsvar.', title: 'BNP og inflasjon: forklar', items: MAKRO_EXPLAIN })],
  misconceptions: [{ id: 'nominell', label: 'Blander nominell og reell', explanation: 'Reallønn er justert for prisvekst.' }],
  recognize: keywordRecognizer(
    [
      [/\bBNP\b|bruttonasjonalprodukt/i, 2.5],
      [/inflasjon|deflasjon/i, 2],
      [/kjøpekraft/i, 2],
      [/konsumprisindeks|\bKPI\b/i, 2],
      [/reallønnsvekst|reallønnen[^.]{0,30}(?:lavere|høyere) enn lønnsøkningen/i, 2],
      [/nominell/i, 0.8],
      [/utgiftsmetoden|nettoeksport/i, 2],
      [/representativ kurv|kurv av varer/i, 2.5],
    ],
    2,
    'BNP, inflasjon og reallønn',
    realParams,
  ),
  explanations: {
    short: () => ({ text: 'BNP måler produksjonen; inflasjon er prisveksten. Reallønnen er lønnen justert for prisveksten.', example: 'Lønn +4 %, inflasjon 7 %: reallønnen faller med om lag 3 %.' }),
    analogy: { text: 'Reallønn er hvor mange handlekurver lønnen kan kjøpe.', limits: 'Kurven endrer innhold over tid.' },
    derivationFormulaId: 'f-reallonn',
  },
  solutionStructure: ['Definisjon', 'Beregning', 'Tolkning'],
  surfaceFeatures: ['Lærere, egen lønn'],
};

// ——— Konjunkturer, konsum og multiplikator ———

const tplMult: TemplateDef = {
  id: 'konj-mult',
  version: 1,
  level: 2,
  style: 'standard',
  name: 'Multiplikatoren',
  description: 'ΔY = ΔI / (1 − c) og ΔC = c · ΔY.',
  skills: ['konj.multiplikator'],
  build: (rng) => {
    const c = pick(rng, [0.5, 0.6, 0.75, 0.8]);
    const dI = randInt(rng, 2, 20) * 5;
    const cR = R(c);
    const mult = R(1).div(R(1).sub(cR));
    const dY = R(dI).mul(mult);
    const dC = cR.mul(dY);
    const parts: GenPart[] = [
      { id: 'a', label: 'a', prompt: 'Hvor stor er multiplikatoren?', kind: 'beregning', skills: ['konj.multiplikator'], math: numMath(), targets: [x('Multiplikator', mult, ['multiplikator', 'multiplikatoren'], 1)], solution: [step(`\\frac{1}{1 - ${texNum(cR)}} = ${texNum(mult)}`, '1 / (1 − c)', 'Hver krone i ny etterspørsel gir inntekt, og en andel c av den brukes igjen.', 'avledet sammenheng' as never)].map((s) => ({ ...s, kind: 'omforming' as const })), hints: { small: 'Hvor stor del av hver ekstra krone blir brukt igjen?', firstStep: `1 − ${no(cR)}`, stepExplanation: 'Multiplikatoren er summen av rundene 1 + c + c² + … = 1/(1 − c).', workedExample: { intro: '', steps: [] } }, methodCheckpoints: [] },
      { id: 'b', label: 'b', prompt: `Investeringene øker med ${dI} mrd. kr. Hvor mye øker BNP?`, kind: 'beregning', skills: ['konj.multiplikator'], math: numMath(), targets: [x('Økning i BNP', dY, ['bnp', 'økning', 'y'], 0)], solution: [step(`${dI} \\cdot ${texNum(mult)} = ${texNum(dY)}`, 'Endring i etterspørsel · multiplikator', '', 'innsetting')], hints: { small: 'Bruk multiplikatoren.', firstStep: `${dI} · ${no(mult)}`, stepExplanation: '', workedExample: { intro: '', steps: [] } }, methodCheckpoints: [] },
      { id: 'c', label: 'c', prompt: 'Hvor mye øker det private konsumet?', kind: 'beregning', skills: ['konj.multiplikator', 'konj.konsum'], math: numMath(), targets: [x('Økning i konsum', dC, ['konsum', 'økning'], 0)], solution: [step(`${texNum(cR)} \\cdot ${texNum(dY)} = ${texNum(dC)}`, 'c · ΔY', 'Konsumet øker med den marginale konsumtilbøyeligheten ganger inntektsøkningen.', 'innsetting')], hints: { small: 'Konsumfunksjonen: C = z + cY.', firstStep: `${no(cR)} · ${no(dY)}`, stepExplanation: '', workedExample: { intro: '', steps: [] } }, methodCheckpoints: [] },
    ];
    return { title: 'Multiplikatoren', intro: `I en enkel modell er den marginale konsumtilbøyeligheten c = ${no(cR)}. Det er ingen skatter eller import.`, context: 'multiplikator', parts, params: { c: String(c), dI: String(dI) }, skills: ['konj.multiplikator', 'konj.konsum'], structureKey: 'konj-mult', estMinutes: 6 };
  },
};

const KONJ_MC: McItem[] = [
  { id: 'mpc', skill: 'konj.konsum', stem: 'Den marginale konsumtilbøyeligheten er 0,6. Hva betyr det?', correct: 'Når inntekten øker med 10 mrd. kr, øker konsumet med 6 mrd. kr.', wrong: ['60 % av inntekten spares.', 'Konsumet er 60 % av BNP.', 'Når konsumet øker med 10 mrd., øker inntekten med 6 mrd.'], why: 'Den marginale konsumtilbøyeligheten er endringen i konsum per krone endring i inntekt; den ligger mellom 0 og 1.' },
  { id: 'invest', skill: 'konj.konsum', stem: 'Hvilket utsagn om konsum og investeringer gjennom konjunkturene stemmer ikke?', correct: 'Når husholdningene får et midlertidig inntektsfall, kutter de som regel konsumet like mye som inntekten falt.', wrong: ['Investeringer svinger mer enn privat konsum.', 'Husholdninger bruker sparing og lån for å jevne ut konsumet.', 'Bedrifter kan utsette investeringer når fremtiden er usikker.'], why: 'Konsumutjevning betyr at et midlertidig inntektsfall gir et mindre fall i konsumet.' },
  { id: 'forsikring', skill: 'konj.konsum', stem: 'Hva av dette hjelper ikke en husholdning å holde konsumet stabilt når inntekten svinger?', correct: 'Å bruke all inntekt hver måned, slik at det ikke finnes noen buffer.', wrong: ['Å ha en sparebuffer.', 'Å kunne låne av familien i en vanskelig periode.', 'Offentlige ordninger som dagpenger ved arbeidsledighet.'], why: 'Sparing, lån og forsikringsordninger gjør det mulig å jevne ut konsumet. Uten buffer faller konsumet like mye som inntekten.' },
  { id: 'investering-forv', skill: 'konj.konsum', stem: 'Hvorfor svinger investeringene mer enn konsumet gjennom konjunkturene?', correct: 'Fordi bedriftene investerer ut fra hva de tror om fremtidig lønnsomhet, og slike forventninger kan endre seg raskt.', wrong: ['Fordi staten bestemmer investeringene hvert år.', 'Fordi investeringene alltid følger konsumet krone for krone.', 'Fordi renten aldri endres.'], why: 'Investeringer kan utsettes eller fremskyndes og avhenger av forventninger, som kan snu raskt.' },
  { id: 'spiral', skill: 'konj.konsum', stem: 'Hvorfor kan økt arbeidsledighet dempe inflasjonen?', correct: 'Arbeidstakerne får svakere forhandlingsposisjon og aksepterer lavere lønnskrav, så lønns- og prisveksten avtar.', wrong: ['Arbeidsledige kjøper mer, så prisene faller.', 'Bedriftene øker prisene når ledigheten øker.', 'Ledighet har ingen sammenheng med inflasjon.'], why: 'Motstridende krav (lønn vs profittmargin) gir lønn–pris-spiral; høyere ledighet demper kravene.' },
];

const KONJ_EXPLAIN: ExplainItem[] = [
  { id: 'mpc', skills: ['konj.konsum'], prompt: 'Husholdningene i et land får 10 mrd. kr mer i samlet inntekt, og konsumet øker med 7 mrd. kr. Forklar hva den marginale konsumtilbøyeligheten er, og hva den er her.', rubric: [['Den marginale konsumtilbøyeligheten er hvor mye konsumet øker når inntekten øker med én krone.', true], ['Her er den 7 / 10 = 0,7.', true], ['Den ligger normalt mellom 0 og 1; resten spares.', false]], model: 'Den marginale konsumtilbøyeligheten viser hvor stor del av en ekstra krone i inntekt som brukes på konsum. Her gir 10 mrd. kr mer i inntekt 7 mrd. kr mer i konsum, så den er 7 / 10 = 0,7. De resterende 30 øre av hver krone spares.', hints: { small: 'Tenk på én ekstra krone i inntekt.', firstStep: 'Del økningen i konsum på økningen i inntekt.', why: 'Begrepet er grunnlaget for multiplikatoren.' } },
  { id: 'spiral', skills: ['konj.konsum'], prompt: 'Forklar hvordan en lønn–pris-spiral kan oppstå, og hvorfor den kan stoppe dersom ledigheten øker.', rubric: [['Bedriftene vil ha et prispåslag, og arbeidstakerne vil ha en reallønn; er kravene samlet større enn det som produseres, stiger lønninger og priser om hverandre.', true], ['Høyere ledighet gjør det dyrere å miste jobben, så lønnskravene dempes, og prisveksten avtar.', true]], model: 'Bedriftene setter prisene med et påslag på lønnskostnadene, og arbeidstakerne forhandler om lønn ut fra hvilken reallønn de krever. Er kravene til sammen større enn det som produseres, øker lønningene, prisene følger etter, og lønnskravene øker igjen. Når ledigheten øker, blir det dyrere å miste jobben, arbeidstakerne godtar lavere reallønn, og spiralen bremses.', hints: { small: 'Hvem krever hva av den samme kaken?', firstStep: 'Start med bedriftenes påslag og arbeidstakernes lønnskrav.', why: 'Knytter WS–PS til inflasjon.' } },
];

export const konjunktur: FamilyKB = {
  id: 'konjunktur-konsum',
  name: 'Konjunkturer: konsum, investering og multiplikatoren',
  shortName: 'Konjunkturer og konsum',
  topic: 'Makroøkonomi',
  subtopics: ['Konsumfunksjon og konsumtilbøyelighet', 'Multiplikator', 'Konsumutjevning og forsikring', 'Investering og forventninger'],
  description: 'Hvorfor produksjonen svinger, hvordan konsum og investering reagerer, og hvordan en endring i etterspørselen forsterkes gjennom multiplikatoren.',
  skills: ['konj.konsum', 'konj.multiplikator'],
  formulas: [
    {
      id: 'f-mult',
      tex: '\\Delta Y = \\frac{1}{1 - c}\\,\\Delta I',
      name: 'Multiplikatoren',
      kind: 'avledet sammenheng',
      kindWhy: 'Følger av konsumfunksjonen C = z + cY og at produksjonen tilpasser seg etterspørselen (Y = C + I).',
      symbols: [
        { sym: 'c', meaning: 'Marginal konsumtilbøyelighet', unit: 'mellom 0 og 1' },
        { sym: '\\Delta I', meaning: 'Endring i investering (eller annen etterspørsel)', unit: 'kr' },
        { sym: '\\Delta Y', meaning: 'Endring i BNP', unit: 'kr' },
      ],
      conditions: ['Ingen skatter eller import i den enkle modellen.'],
      whatIf: ['Høyere c: større multiplikator.'],
      calc: {
        inputs: [
          { sym: 'c', label: 'Marginal konsumtilbøyelighet c', min: 0, max: 0.95, step: 0.05, value: 0.6 },
          { sym: 'dI', label: 'Endring i investering (mrd.)', min: -50, max: 50, step: 1, value: 10 },
        ],
        compute: (v) => {
          const m = R(1).div(R(1).sub(R(Math.round(v.c * 100)).div(R(100))));
          return [
            { label: 'Multiplikator', value: no(m, 2) },
            { label: 'Endring i BNP', value: `${no(m.mul(R(v.dI)), 1)} mrd.` },
          ];
        },
      },
    },
  ],
  intents: [
    { id: 'konj.multiplikator', specific: true, label: 'Multiplikator', match: [/multiplikator/i], skills: ['konj.multiplikator'], taskType: ['beregning', 'forklaring'], assignment: 'Beregne og forklare multiplikatoren.', interpretation: ['Multiplikatoren er 1/(1 − c).'], prerequisites: ['Konsumfunksjonen'], misconceptions: ['Bruker c i stedet for 1 − c i nevneren'], variation: [], estMinutes: 5 },
    { id: 'konj.konsum', label: 'Konsum og konjunkturer', match: [/konsumtilbøyelighet|konsumfunksjon|konjunktur|konsumutjevning|jevne ut|investering|forsikring|inflasjon/i], skills: ['konj.konsum'], taskType: ['forklaring'], assignment: 'Forklare konsumtilbøyelighet, konsumutjevning og hvorfor investeringer svinger mer enn konsum.', interpretation: ['Den marginale konsumtilbøyeligheten er endringen i konsum per krone endring i inntekt.', 'Husholdninger jevner ut konsumet; investeringer avhenger av forventninger.'], prerequisites: [], misconceptions: ['Tror konsumet faller like mye som en midlertidig inntektsnedgang'], variation: [], estMinutes: 4 },
  ],
  templates: [tplMult, mcTemplate({ id: 'konj-mc', level: 1, name: 'Flervalg: konjunkturer', description: 'Begreper.', title: 'Konjunkturer og konsum', items: KONJ_MC }), explainTemplate({ id: 'konj-forklar', level: 3, name: 'Forklar som på eksamen', description: 'Kortsvar.', title: 'Konjunkturer: forklar', items: KONJ_EXPLAIN })],
  misconceptions: [{ id: 'mult', label: 'Feil nevner i multiplikatoren', explanation: 'Det er 1/(1 − c), ikke 1/c.' }],
  recognize: keywordRecognizer(
    [
      [/konjunktur/i, 1.5],
      [/marginal(?:e)? konsumtilbøyelighet|marginal propensity/i, 3],
      [/multiplikator/i, 3],
      [/konsumfunksjon/i, 2],
      [/konsumutjevning|jevne ut (?:for|kon)/i, 2],
      [/forsikring/i, 1],
      [/investering/i, 0.8],
      [/forventning/i, 0.7],
      [/investeringsbeslutning/i, 1.5],
      [/lønn-?pris|pris-?lønn|motstridende krav/i, 1.5],
      [/nedgangstid|høykonjunktur|lavkonjunktur/i, 1],
      [/(?:investering\w*|konsum\w*)[^.?]{0,60}svinger|svinger[^.?]{0,40}(?:investering|konsum)/i, 1.5],
      [/privat konsum/i, 0.6],
      [/sparekapital|dårlige tider/i, 0.6],
    ],
    2,
    'konjunkturer og konsum',
  ),
  explanations: {
    short: () => ({ text: 'Når etterspørselen øker, øker produksjonen og inntekten; en del av inntekten brukes igjen. Derfor blir den samlede effekten større enn den første.', example: 'c = 0,6 gir multiplikator 2,5.' }),
    analogy: { text: 'Som ringer i vannet: første impuls sprer seg, men blir svakere for hver runde.', limits: 'Den enkle modellen ser bort fra skatt, import og renter.' },
    derivationFormulaId: 'f-mult',
  },
  solutionStructure: ['Konsumtilbøyelighet', 'Multiplikator', 'Tolkning'],
  surfaceFeatures: [],
};
