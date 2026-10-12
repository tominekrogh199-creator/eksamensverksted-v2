// Arbeidsmarkedet i CORE/SØK-pensum: arbeidsdisiplinmodellen (verdien av
// jobben) og lønns- og prissettingsmodellen (WS–PS). Innholdet følger
// begrepene sensorveiledningene bruker: arbeidsstyrke, reservasjonslønn,
// employment rent, lønnssettingskurve, prissettingslinje, prispåslag,
// forhandlingseffekt og stemmeeffekt («voice»).

import type { GenPart } from '../domain/types';
import { FamilyKB, TemplateDef, IntentDef, randInt, pick, R, no, texNum, step, readNumber } from './common';
import { mcTemplate, explainTemplate, shockTemplate, keywordRecognizer, McItem, ExplainItem, ShockItem } from './verbal';
import { Rat } from '../math/rational';

const x = (label: string, value: Rat, aliases: string[], minDecimals?: number, percent?: boolean) => ({ symbol: 'x', label, value: value.toString(), aliases, minDecimals, percent });
const numMath = () => ({ symbols: [], defs: {}, param: 'x', unknown: 'x', solution: {}, answerSymbols: ['x'] });

// ——— Arbeidsdisiplin og verdien av jobben ———

const NAMES = ['Maria', 'Jonas', 'Sara', 'Ali', 'Ingrid', 'Emil', 'Nora', 'Henrik'];

function rentParams(rng: () => number) {
  for (let t = 0; t < 300; t++) {
    const w = randInt(rng, 11, 26) * 10;
    const e = randInt(rng, 2, 8) * 5;
    const b = randInt(rng, 6, 20) * 5;
    const p = randInt(rng, 1, 4) * 5;
    const h = pick(rng, [30, 35, 37.5, 40]);
    const u = randInt(rng, 10, 52);
    const r = w - e - (b - p);
    if (r < 30) continue;
    const total = R(r).mul(R(h)).mul(R(u));
    if (!total.isInteger()) continue;
    return { w, e, b, p, h, u, r, total };
  }
  return { w: 120, e: 20, b: 40, p: 10, h: 35, u: 44, r: 70, total: R(107800) };
}

function rentParts(P: ReturnType<typeof rentParams>, name: string): GenPart[] {
  const net = P.w - P.e;
  const alt = P.b - P.p;
  return [
    {
      id: 'a',
      label: 'a',
      prompt: `Hva er nettoverdien per time av å ha jobben sammenliknet med å være arbeidsledig (den økonomiske verdien av jobben per time)?`,
      kind: 'beregning',
      skills: ['disiplin.rent'],
      math: numMath(),
      targets: [x('Verdi av jobben per time', R(P.r), ['time', 'timen', 'netto', 'verdi'], 0)],
      solution: [
        step(`${P.w} - ${P.e} = ${net}`, `Netto per time i jobb: lønn minus innsatskostnad`, 'Innsats er en kostnad for den ansatte, så den trekkes fra lønnen.', 'innsetting'),
        step(`${P.b} - ${P.p} = ${alt}`, 'Netto per time som arbeidsledig: trygd minus kostnadene ved ledighet', 'Å være ledig koster også noe utover inntektstapet, for eksempel stress og tapt nettverk.', 'innsetting'),
        step(`${net} - ${alt} = ${P.r}`, 'Forskjellen er verdien av jobben per time', 'Employment rent er gevinsten ved jobben sammenliknet med det nest beste alternativet.', 'definisjon'),
      ],
      hints: { small: 'Sammenlikn det du sitter igjen med per time i jobb med det du sitter igjen med per time som ledig.', firstStep: `I jobb: ${P.w} − ${P.e}. Som ledig: ${P.b} − ${P.p}.`, stepExplanation: 'Den økonomiske verdien av jobben er gevinsten ved jobben sammenliknet med beste alternativ (å være arbeidsledig og søke ny jobb).', workedExample: { intro: 'Eksempel: 150 kr/t, innsats 30, trygd 70, ledighetskostnad 15.', steps: [step('150 - 30 = 120', '', '', 'innsetting'), step('70 - 15 = 55', '', '', 'innsetting'), step('120 - 55 = 65', 'kr per time', '', 'definisjon')] } },
      methodCheckpoints: [
        { id: 'jobb', label: 'Fant netto per time i jobb', skill: 'disiplin.rent', detect: { type: 'verdi', value: String(net), symbols: [] }, required: false },
        { id: 'ledig', label: 'Fant netto per time som ledig', skill: 'disiplin.rent', detect: { type: 'verdi', value: String(alt), symbols: [] }, required: false },
      ],
    },
    {
      id: 'b',
      label: 'b',
      prompt: `Mister ${name} jobben, regner hen med å gå ledig i ${P.u} uker før hen finner en tilsvarende jobb. Hvor mye er jobben verdt totalt, når ${name} jobber ${no(P.h)} timer i uka?`,
      kind: 'beregning',
      skills: ['disiplin.rent'],
      math: numMath(),
      targets: [x('Økonomisk verdi av jobben', P.total, ['verdi', 'jobben', 'samlet', 'totalt', 'rent'], 0)],
      solution: [step(`${P.r} \\cdot ${texNum(R(P.h))} \\cdot ${P.u} = ${texNum(P.total)}`, 'Verdi per time · timer per uke · uker uten jobb', 'Tapet ved å miste jobben varer bare så lenge man er ledig; etterpå er man i en like god jobb igjen.', 'innsetting')],
      hints: { small: 'Hvor lenge varer tapet hvis hen mister jobben?', firstStep: `Gang ${P.r} kr per time med antall timer per uke.`, stepExplanation: `Etter ${P.u} uker har hen en like god jobb igjen, så bare ledighetsperioden teller – ikke hele planleggingshorisonten.`, workedExample: { intro: '', steps: [] } },
      methodCheckpoints: [],
    },
  ];
}

const tplRent: TemplateDef = {
  id: 'dis-rent',
  version: 1,
  level: 1,
  style: 'standard',
  name: 'Beregn verdien av jobben',
  description: 'Employment rent per time og samlet over ledighetsperioden.',
  skills: ['disiplin.rent'],
  build: (rng) => {
    const P = rentParams(rng);
    const name = pick(rng, NAMES);
    const intro = `${name} har en jobb som gir ${P.w} kr i timen, ${no(P.h)} timer i uka. Innsatsen i jobben oppleves som et ubehag verdt ${P.e} kr per time. Uten jobb ville ${name} fått dagpenger som svarer til ${P.b} kr per time, men det å være ledig har også en personlig kostnad (stress, tapt nettverk) som ${name} setter til ${P.p} kr per time.`;
    return { title: 'Den økonomiske verdien av jobben', intro, context: name, parts: rentParts(P, name), params: { w: String(P.w), e: String(P.e), b: String(P.b), p: String(P.p), h: String(P.h), u: String(P.u) }, skills: ['disiplin.rent'], structureKey: 'dis-rent', estMinutes: 8 };
  },
};

const tplRentTrygd: TemplateDef = {
  id: 'dis-rent-trygd',
  version: 1,
  level: 3,
  style: 'standard',
  name: 'Endret forutsetning: høyere trygd',
  description: 'Verdien av jobben før og etter en økning i ledighetstrygden, og hva det betyr for lønnssettingen.',
  skills: ['disiplin.rent', 'disiplin.modell', 'wsps.skift'],
  build: (rng) => {
    const P = rentParams(rng);
    const name = pick(rng, NAMES);
    let b2 = P.b + randInt(rng, 2, 6) * 5;
    if (P.w - P.e - (b2 - P.p) <= 0) b2 = P.b + 5;
    const r2 = P.w - P.e - (b2 - P.p);
    const total2 = R(r2).mul(R(P.h)).mul(R(P.u));
    const parts = rentParts(P, name);
    parts.push({
      id: 'c',
      label: 'c',
      prompt: `Trygden økes fra ${P.b} til ${b2} kr per time. Hva blir den nye samlede verdien av jobben?`,
      kind: 'beregning',
      skills: ['disiplin.rent'],
      math: numMath(),
      targets: [x('Ny verdi av jobben', total2, ['ny', 'verdi', 'jobben', 'samlet'], 0)],
      solution: [step(`(${P.w} - ${P.e}) - (${b2} - ${P.p}) = ${r2}`, 'Ny verdi per time', '', 'innsetting'), step(`${r2} \\cdot ${texNum(R(P.h))} \\cdot ${P.u} = ${texNum(total2)}`, 'Ny samlet verdi', '', 'innsetting')],
      hints: { small: 'Bare nettoverdien som ledig endres.', firstStep: `Ny netto som ledig: ${b2} − ${P.p}.`, stepExplanation: 'Høyere trygd gjør det mindre kostbart å miste jobben.', workedExample: { intro: '', steps: [] } },
      methodCheckpoints: [],
    });
    parts.push({
      id: 'd',
      label: 'd',
      prompt: 'Hva betyr dette for lønnen bedriften må betale for å få innsats, og for lønnssettingskurven (WS)? Forklar kort.',
      kind: 'forklaring',
      skills: ['disiplin.modell', 'wsps.skift'],
      rubric: [
        { id: 'k1', text: 'Sier at lavere verdi av jobben svekker insentivet til å yte innsats (det koster mindre å miste jobben).', basis: 'faglig-tolkning', required: true },
        { id: 'k2', text: 'Konkluderer med at bedriften må øke lønnen for å få samme innsats, slik at WS-kurven skifter opp.', basis: 'faglig-tolkning', required: true },
        { id: 'k3', text: 'Nevner at dette gir høyere likevektsledighet (reallønnen er bestemt av PS).', basis: 'faglig-tolkning', required: false },
      ],
      solution: [step('', 'Modellsvar', 'Verdien av jobben faller, så trusselen om å miste jobben disiplinerer mindre. For å få samme innsats må bedriften betale høyere lønn ved hvert sysselsettingsnivå: WS-kurven skifter opp. I WS–PS-likevekten gir det høyere arbeidsledighet med samme reallønn.', 'tolkning')],
      hints: { small: 'Hva skjer med kostnaden ved å miste jobben?', firstStep: 'Koble lavere verdi av jobben til insentivet til å yte innsats.', stepExplanation: 'WS viser lønnen som skal til for innsats ved hvert nivå på sysselsettingen.', workedExample: { intro: '', steps: [] } },
      methodCheckpoints: [{ id: 'forklaring', label: 'Koblet trygd, innsats og WS', skill: 'disiplin.modell', detect: { type: 'forklaring' }, required: true }],
      modelAnswer: 'Lavere verdi av jobben svekker innsatsinsentivet; bedriften må betale mer for samme innsats, så WS skifter opp.',
    });
    return { title: 'Verdien av jobben når trygden øker', intro: `${name} har en jobb som gir ${P.w} kr i timen, ${no(P.h)} timer i uka. Innsatsen oppleves som et ubehag verdt ${P.e} kr per time. Uten jobb ville ${name} fått dagpenger som svarer til ${P.b} kr per time, og det å være ledig har en personlig kostnad som ${name} setter til ${P.p} kr per time.`, context: name, parts, params: { w: String(P.w), e: String(P.e), b: String(P.b), b2: String(b2), p: String(P.p), h: String(P.h), u: String(P.u) }, skills: ['disiplin.rent', 'disiplin.modell', 'wsps.skift'], structureKey: 'dis-rent-trygd', estMinutes: 14 };
  },
};

const DIS_MC: McItem[] = [
  { id: 'res-opp', skill: 'disiplin.modell', stem: 'Kommunen innfører gratis kollektivtransport og billigere barnehage for alle, også for dem som er uten jobb. Hva skjer med lønnen bedriftene må betale for å få innsats?', correct: 'Den øker, fordi det blir mindre ille å være uten jobb (reservasjonslønnen øker).', wrong: ['Den faller, fordi de ansatte får lavere utgifter.', 'Den er uendret, fordi tiltakene gjelder alle.', 'Den faller, fordi de ansatte blir mer fornøyde og jobber hardere.'], why: 'Tiltak som gjør livet uten jobb bedre, øker reservasjonslønnen. Da må lønnen opp for at det fortsatt skal koste noe å miste jobben.' },
  { id: 's-opp', skill: 'disiplin.modell', stem: 'En bedrift går over til hjemmekontor, og det blir vanskeligere å se hvem som jobber lite. Hva sier arbeidsdisiplinmodellen om lønnen som trengs for å få innsats?', correct: 'Den må øke, fordi det er mindre sannsynlig at unnasluntring blir oppdaget.', wrong: ['Den kan senkes, fordi de ansatte sparer reisetid.', 'Den er uendret, fordi arbeidsoppgavene er de samme.', 'Den kan senkes, fordi de ansatte får mer fritid.'], why: 'Lavere sannsynlighet for å bli oppdaget gjør unnasluntring mer lønnsomt. Jobben må da være mer verdt, altså høyere lønn, for at innsats skal lønne seg.' },
  { id: 'trygd-opp', skill: 'disiplin.modell', stem: 'Dagpengene til arbeidsledige heves. Hva skjer med hvor mye det koster en ansatt å miste jobben, alt annet likt?', correct: 'Det koster mindre, så verdien av jobben (employment rent) faller.', wrong: ['Det koster mer, fordi de ansatte betaler mer i skatt.', 'Ingenting, fordi dagpengene bare gjelder dem som er ledige.', 'Det koster mer, fordi flere vil søke på de ledige jobbene.'], why: 'Verdien av jobben måles mot alternativet. Høyere dagpenger gjør alternativet bedre og gevinsten ved å beholde jobben mindre.' },
  { id: 'ledighet', skill: 'disiplin.modell', stem: 'Hvorfor kan bedriftene holde en lavere lønn og likevel få innsats når arbeidsledigheten er høy?', correct: 'Det tar lengre tid å finne ny jobb, så verdien av jobben ved en gitt lønn er høyere.', wrong: ['Fordi arbeidsledige tar lavere betalte jobber, og det presser produktiviteten opp.', 'Fordi høy ledighet gir høyere trygd.', 'Fordi innsatskostnaden faller når ledigheten er høy.'], why: 'Høy ledighet gjør ledighetsperioden lengre. Da blir tapet ved å miste jobben større, og en lavere lønn er nok til å motivere innsats.' },
  { id: 'betingelse', skill: 'disiplin.modell', stem: 'Når velger en ansatt i arbeidsdisiplinmodellen å jobbe hardt?', correct: 'Når det forventede tapet ved å bli tatt i unnasluntring og miste jobben er minst like stort som gevinsten ved å ta det med ro.', wrong: ['Alltid, fordi arbeidskontrakten krever det.', 'Bare når lønnen er lik reservasjonslønnen.', 'Når kostnaden ved innsats er høyere enn lønnen.'], why: 'Innsats velges når den lønner seg minst like godt som unnasluntring. Det er insentivbetingelsen i modellen.' },
  { id: 'reservasjon', skill: 'disiplin.modell', stem: 'Hva er reservasjonslønnen?', correct: 'Den laveste lønnen en person vil akseptere for å ta jobben; den tilsvarer verdien av det beste alternativet.', wrong: ['Den høyeste lønnen bedriften har råd til.', 'Minstelønnen som er fastsatt i tariffavtalen.', 'Lønnen den ansatte får når hun jobber overtid.'], why: 'Reservasjonslønnen er verdien av det nest beste alternativet, altså alternativkostnaden ved å ta jobben.' },
  { id: 'rent-def', skill: 'disiplin.modell', stem: 'Hva mener vi med den økonomiske verdien av jobben (employment rent)?', correct: 'Hvor mye bedre stilt en person er i jobben enn i det beste alternativet, for eksempel å være ledig og søke ny jobb.', wrong: ['Lønnen etter skatt.', 'Hvor mye den ansatte produserer for bedriften per time.', 'Lønnen pluss det den ansatte ville fått i dagpenger.'], why: 'Employment rent sammenlikner jobben med det nest beste alternativet, ikke med null.' },
];

const DIS_EXPLAIN: ExplainItem[] = [
  { id: 'kjernen', skills: ['disiplin.modell'], prompt: 'Forklar kjernen i arbeidsdisiplinmodellen, og hvilken rolle arbeidsledigheten spiller.', rubric: [['Arbeidsgiveren kan ikke fullt ut observere innsatsen, så kontrakten er ufullstendig.', true], ['Lønnen settes over reservasjonslønnen slik at det koster noe å miste jobben (jobben har økonomisk verdi).', true], ['Høy ledighet gjør det vanskeligere å finne ny jobb og øker verdien av jobben, så lavere lønn gir innsats; lav ledighet krever høyere lønn.', true]], model: 'Innsats kan ikke skrives inn i en fullstendig kontrakt. For at det skal lønne seg å yte innsats, må det koste noe å miste jobben, så bedriften setter lønnen over reservasjonslønnen. Jo høyere ledighet, desto lengre tid tar det å finne ny jobb og desto mer er jobben verdt – da holder en lavere lønn. Ved lav ledighet må lønnen opp.', hints: { small: 'Hvorfor kan ikke bedriften bare skrive «full innsats» i kontrakten?', firstStep: 'Start med at innsats ikke kan observeres fullt ut.', why: 'Modellen forklarer hvorfor lønnen settes over reservasjonslønnen og hvorfor ledighet påvirker lønnen.' } },
  { id: 'rent', skills: ['disiplin.rent'], prompt: 'Forklar hva vi mener med den økonomiske verdien av jobben (employment rent), og gi to eksempler på endringer som gjør den mindre.', rubric: [['Definerer den som hvor mye bedre stilt personen er i jobben enn i det beste alternativet.', true], ['Gir to eksempler som gjør den mindre: høyere dagpenger, lavere ledighet (kortere tid uten jobb), lavere lønn eller mer krevende arbeid.', true]], model: 'Verdien av jobben er forskjellen mellom det man har i jobben (lønn minus ubehaget ved innsatsen) og det man ville hatt uten jobb (dagpenger minus ulempene ved å være ledig), for den tiden man regner med å være uten jobb. Den blir mindre hvis dagpengene øker, hvis det går raskere å finne ny jobb fordi ledigheten er lav, hvis lønnen faller eller hvis jobben blir mer slitsom.', hints: { small: 'Sammenlikn med alternativet, ikke med null.', firstStep: 'Hva er det beste alternativet til jobben?', why: 'Verdien av jobben er gevinsten over beste alternativ.' } },
];

const disFormulas = [
  {
    id: 'f-rent',
    tex: '\\text{Verdi av jobben} = \\big[(w - e) - (b - k)\\big] \\cdot t \\cdot u',
    name: 'Den økonomiske verdien av jobben (employment rent)',
    kind: 'definisjon' as const,
    kindWhy: 'En regnemåte som følger av definisjonen: gevinst per time sammenliknet med alternativet, ganget med tiden tapet varer.',
    symbols: [
      { sym: 'w', meaning: 'Lønn per time', unit: 'kr/time' },
      { sym: 'e', meaning: 'Innsatskostnad (ubehag) per time', unit: 'kr/time' },
      { sym: 'b', meaning: 'Arbeidsledighetstrygd per time', unit: 'kr/time' },
      { sym: 'k', meaning: 'Psykologiske og sosiale kostnader ved ledighet per time', unit: 'kr/time' },
      { sym: 't', meaning: 'Timer per uke', unit: 'timer' },
      { sym: 'u', meaning: 'Uker man forventer å være ledig', unit: 'uker' },
    ],
    conditions: ['Etter ledighetsperioden antas en like god jobb.'],
    whatIf: ['Høyere trygd b gir lavere verdi av jobben.', 'Lengre ledighet u gir høyere verdi av jobben.'],
    calc: {
      inputs: [
        { sym: 'w', label: 'Lønn (kr/t)', min: 80, max: 300, step: 5, value: 120 },
        { sym: 'e', label: 'Innsatskostnad (kr/t)', min: 0, max: 60, step: 5, value: 20 },
        { sym: 'b', label: 'Trygd (kr/t)', min: 0, max: 150, step: 5, value: 40 },
        { sym: 'k', label: 'Kostnad ved ledighet (kr/t)', min: 0, max: 40, step: 5, value: 10 },
        { sym: 't', label: 'Timer per uke', min: 10, max: 45, step: 2.5, value: 35 },
        { sym: 'u', label: 'Uker ledig', min: 1, max: 60, step: 1, value: 44 },
      ],
      compute: (v: Record<string, number>) => {
        const per = v.w - v.e - (v.b - v.k);
        return [
          { label: 'Verdi per time', value: `${no(R(per))} kr` },
          { label: 'Samlet verdi av jobben', value: `${no(R(per).mul(R(v.t)).mul(R(v.u)))} kr` },
        ];
      },
    },
  },
];

function rentFromText(text: string): Record<string, string> {
  const n = (re: RegExp) => {
    const m = re.exec(text);
    return m ? readNumber(m[1]) : null;
  };
  const w = n(/tjener\s+(\d+(?:[.,]\d+)?)\s*kr(?:oner)?\s*(?:per|pr\.?|i)\s*time/i) ?? n(/lønn(?:en)?\s*(?:er|på)?\s*(\d+(?:[.,]\d+)?)\s*kr\s*per\s*time/i);
  const e = n(/(?:ubehag|stresskostnad|innsatskostnad|kostnad(?:en)? ved å jobbe)[^.]{0,60}?(\d+(?:[.,]\d+)?)\s*kr/i);
  const b = n(/(?:arbeidsledighetstrygd|trygd|dagpenger)[^.]{0,40}?(\d+(?:[.,]\d+)?)\s*kr/i);
  const k = n(/(?:psykologiske|sosiale)[^.]{0,50}?(\d+(?:[.,]\d+)?)\s*kr/i);
  const h = n(/(\d+(?:[.,]\d+)?)\s*timer\s*(?:per|pr\.?|i)\s*uke/i);
  const u = n(/(?:etter|i)\s+(\d+)\s*uker/i);
  const out: Record<string, string> = {};
  if (w !== null) out.w = String(w);
  if (e !== null) out.e = String(e);
  if (b !== null) out.b = String(b);
  if (k !== null) out.k = String(k);
  if (h !== null) out.h = String(h);
  if (u !== null) out.u = String(u);
  return out;
}

const disIntents: IntentDef[] = [
  {
    id: 'dis.beregn',
    specific: true,
    label: 'Beregne verdien av jobben',
    match: [/(?:hva er|beregn|regn ut)[^.?]{0,60}(?:verdi(?:en)? av (?:den nåværende )?jobben|employment rent)/i, /\d+\s*kr\s*per\s*time[\s\S]{0,400}(?:trygd|arbeidsledig)/i],
    skills: ['disiplin.rent', 'disiplin.modell'],
    taskType: ['beregning', 'forklaring'],
    assignment: 'Forklare hva den økonomiske verdien av jobben er, og beregne den fra tallene i oppgaven.',
    interpretation: ['Du må trekke innsatskostnaden fra lønnen og kostnadene ved ledighet fra trygden, og ta differansen per time.', 'Du må gange med timer per uke og antall uker man forventer å være ledig (ikke hele planleggingshorisonten).', 'Vis utregningen: det kan gi uttelling selv om tallet blir feil.'],
    prerequisites: ['Alternativkostnad'],
    misconceptions: ['Ganger med hele planleggingshorisonten i stedet for ledighetsperioden', 'Glemmer innsatskostnaden eller kostnadene ved ledighet', 'Sammenlikner med null i stedet for med det å være ledig'],
    variation: ['Endret trygd eller ledighetsperiode', 'Spør om hva som skjer med lønnssettingskurven'],
    estMinutes: 10,
    compute: (p) => {
      if (!p.w || !p.e || !p.b || !p.k) return null;
      const per = R(p.w).sub(R(p.e)).sub(R(p.b).sub(R(p.k)));
      const out = [{ label: 'Verdi av jobben per time', value: per.toString(), display: `${no(per)} kr per time`, unit: 'kr' as const }];
      if (p.h && p.u) {
        const tot = per.mul(R(p.h)).mul(R(p.u));
        out.push({ label: 'Samlet økonomisk verdi av jobben', value: tot.toString(), display: `${no(tot)} kr`, unit: 'kr' as const });
      }
      return out;
    },
  },
  {
    id: 'dis.modell',
    label: 'Forklare arbeidsdisiplinmodellen',
    match: [/arbeidsdisiplin|disiplinmodell|labou?r discipline|reservasjonslønn|unnaslunt|skulk|innsats/i],
    skills: ['disiplin.modell'],
    taskType: ['forklaring'],
    assignment: 'Forklare hvorfor lønnen settes over reservasjonslønnen, og hvordan ledighet, trygd og overvåking påvirker lønnen som gir innsats.',
    interpretation: ['Innsats kan ikke kontraktsfestes fullt ut (ufullstendig kontrakt).', 'Det må koste noe å miste jobben; lønnen settes derfor over reservasjonslønnen.', 'Høy ledighet øker verdien av jobben, så lavere lønn gir innsats.'],
    prerequisites: ['Alternativkostnad', 'Prinsipal–agent'],
    misconceptions: ['Tror høy trygd gjør jobben mer verdifull', 'Blander reservasjonslønn og minstelønn'],
    variation: ['Endring i trygd, overvåking, ledighet eller innsatskostnad'],
    estMinutes: 6,
  },
];

export const disiplin: FamilyKB = {
  id: 'arbeidsdisiplin',
  name: 'Arbeidsdisiplinmodellen og den økonomiske verdien av jobben',
  shortName: 'Verdien av jobben',
  topic: 'Arbeidsmarkedet',
  subtopics: ['Employment rent', 'Reservasjonslønn', 'Innsats og overvåking'],
  description: 'Hvorfor bedrifter betaler over reservasjonslønnen, hvordan verdien av jobben beregnes, og hvordan trygd, ledighet og overvåking påvirker lønnen som gir innsats.',
  skills: ['disiplin.rent', 'disiplin.modell'],
  formulas: disFormulas,
  intents: disIntents,
  templates: [tplRent, tplRentTrygd, mcTemplate({ id: 'dis-mc', level: 2, name: 'Flervalg: arbeidsdisiplin', description: 'Hva skjer med nødvendig lønn og verdien av jobben når forutsetningene endres?', title: 'Arbeidsdisiplinmodellen', items: DIS_MC }), explainTemplate({ id: 'dis-forklar', level: 3, name: 'Forklar modellen', description: 'Kortsvar som på eksamen.', title: 'Forklar med ord', items: DIS_EXPLAIN })],
  misconceptions: [
    { id: 'horisont', label: 'Ganger med hele planleggingshorisonten', explanation: 'Tapet varer bare mens man er ledig; etterpå har man en like god jobb.' },
    { id: 'trygd', label: 'Tror høyere trygd øker verdien av jobben', explanation: 'Trygd gjør alternativet bedre og verdien av jobben lavere.' },
  ],
  recognize: keywordRecognizer(
    [
      [/arbeidsdisiplin|disiplinmodell|labou?r discipline/i, 3],
      [/employment rent|økonomisk(?:e)? verdi(?:en)? av (?:å ha )?(?:den nåværende )?jobben/i, 3],
      [/reservasjonslønn/i, 2],
      [/innsatskostnad|ubehag(?:et)?\/?|kostnad(?:en)? ved (?:å yte )?innsats/i, 1.5],
      [/unnaslunt|skulk/i, 1.5],
      [/arbeidsledighetstrygd/i, 0.7],
      [/nettoverdien av (?:å ha )?jobben|(?:får|fått|få) (?:som|ved å (?:bli|være)) (?:arbeids)?ledig/i, 3],
    ],
    2,
    'arbeidsdisiplin og verdien av jobben',
    rentFromText,
  ),
  explanations: {
    short: () => ({ text: 'Bedriften kan ikke kontraktsfeste innsats. Den betaler derfor over reservasjonslønnen, slik at det koster noe å miste jobben. Den kostnaden er verdien av jobben.', example: '120 kr/t − 20 i innsatskostnad = 100. Som ledig: 40 − 10 = 30. Verdien er 70 kr per time i ledighetsperioden.' }),
    analogy: { text: 'Det er som et depositum: jo mer du taper hvis du blir kastet ut, desto mer passer du på.', limits: 'Analogien sier ikke noe om hvordan ledigheten i hele økonomien påvirker verdien.' },
    derivationFormulaId: 'f-rent',
  },
  solutionStructure: ['Netto i jobb', 'Netto som ledig', 'Differanse per time', 'Gange med tiden tapet varer', 'Tolke for innsats og lønn'],
  surfaceFeatures: ['Navn og tall', 'Om det spørs om endring i trygd eller ledighet'],
};

// ——— WS–PS ———

const SHOCKS: ShockItem[] = [
  mk('trygd', 'Myndighetene øker arbeidsledighetstrygden kraftig. Økonomien var i utgangspunktet i likevekt der lønnssettingskurven (WS) krysser prissettingslinjen (PS).', 'WS skifter opp', 'Den øker', 'Den er uendret', 'Høyere trygd gjør det mindre kostbart å miste jobben. Bedriftene må betale høyere reallønn for innsats ved hvert sysselsettingsnivå: WS skifter opp. PS er uendret, så ny likevekt har samme reallønn og lavere sysselsetting (høyere likevektsledighet).'),
  mk('fagforening', 'Fagforeningene blir sterkere og bruker streiketrusselen til å forhandle fram høyere lønn (forhandlingseffekten).', 'WS skifter opp', 'Den øker', 'Den er uendret', 'Forhandlingsmakt presser lønnen over det som ellers skal til for innsats: WS skifter opp. Reallønnen i likevekt bestemmes av PS og er uendret, men likevektsledigheten øker.'),
  mk('koordinert', 'Et land innfører koordinert lønnsdannelse (som frontfagsmodellen), der partene tar hensyn til konkurranseevne og ledighet i hele økonomien.', 'WS skifter ned', 'Den faller', 'Den er uendret', 'Moderat lønnsvekst ved hvert ledighetsnivå betyr at WS skifter ned. PS er uendret, så ny likevekt har høyere sysselsetting, lavere ledighet og samme reallønn.'),
  mk('konkurranse', 'Digitalisering og netthandel gjør konkurransen i produktmarkedene hardere, og bedriftenes prispåslag (mark-up) faller.', 'PS skifter opp', 'Den faller', 'Den øker', 'Lavere prispåslag betyr lavere priser for gitt nominell lønn: en større del av verdiskapingen går til arbeiderne. PS skifter opp, og ny likevekt har høyere reallønn og lavere ledighet.'),
  mk('produktivitet', 'Arbeiderne blir mer produktive, mens konkurranseforholdene er de samme som før.', 'PS skifter opp', 'Den faller', 'Den øker', 'Høyere produksjon per arbeider med samme prispåslag gir høyere reallønn på PS-linjen: PS skifter opp. Likevekten flytter seg langs WS til høyere sysselsetting og reallønn.'),
  mk('svakere', 'Konkurransen i produktmarkedene svekkes, og bedriftene øker prispåslaget (mark-up).', 'PS skifter ned', 'Den øker', 'Den faller', 'Høyere påslag gir høyere priser for gitt lønn, så reallønnen på PS-linjen faller: PS skifter ned. Ny likevekt har lavere reallønn og høyere ledighet.'),
  mk('voice', 'Fagforeningene sørger for medbestemmelse og bedre dialog om arbeidsmiljø og strategi, og de ansatte trives bedre (stemmeeffekten, «voice»).', 'WS skifter ned', 'Den faller', 'Den er uendret', 'Når de ansatte er mer motivert, yter de innsats for lavere reallønn ved hvert sysselsettingsnivå: WS skifter ned. Ledigheten faller og reallønnen er uendret.'),
  mk('lavprod', 'Produktiviteten i økonomien faller, mens konkurranseforholdene er uendret.', 'PS skifter ned', 'Den øker', 'Den faller', 'Lavere produksjon per arbeider gir lavere reallønn på PS-linjen: PS skifter ned. Ny likevekt har lavere reallønn og høyere ledighet.'),
];

function mk(id: string, scenario: string, curve: string, ledighet: string, reallonn: string, why: string): ShockItem {
  const curves = ['WS skifter opp', 'WS skifter ned', 'PS skifter opp', 'PS skifter ned'];
  const eff = ['Den øker', 'Den faller', 'Den er uendret', 'Vi kan ikke si noe uten tall'];
  return {
    id,
    scenario,
    questions: [
      { skill: 'wsps.skift', stem: 'Hvilken kurve skifter, og hvilken vei?', correct: curve, wrong: curves.filter((c) => c !== curve), why },
      { skill: 'wsps.likevekt', stem: 'Hva skjer med arbeidsledigheten i den nye likevekten?', correct: ledighet, wrong: eff.filter((c) => c !== ledighet), why },
      { skill: 'wsps.likevekt', stem: 'Hva skjer med reallønnen i den nye likevekten?', correct: reallonn, wrong: eff.filter((c) => c !== reallonn), why: `${why} Reallønnen i likevekt bestemmes av PS-linjen.` },
    ],
    explain: {
      skills: ['wsps.skift', 'wsps.likevekt'],
      prompt: 'Forklar kort mekanismen i modellen: hvorfor skifter kurven, og hvorfor endres (eller endres ikke) reallønnen og ledigheten?',
      rubric: [
        [`Sier hvilken kurve som skifter og hvorfor (${curve.toLowerCase()}).`, true],
        ['Forklarer effekten på likevektsledigheten ved å se hvor WS og PS krysser.', true],
        ['Forklarer at reallønnen i likevekt bestemmes av PS (produktivitet og prispåslag).', true],
      ],
      model: why,
      hints: { small: 'Spør deg: påvirker endringen lønnen som skal til for innsats (WS), eller prisene bedriftene setter (PS)?', firstStep: 'WS: trygd, fagforeninger, koordinering, trivsel. PS: produktivitet og konkurranse (prispåslag).', why: 'Likevekten er der WS krysser PS. Bare et skift i PS kan endre reallønnen i likevekt.' },
    },
  };
}

const WSPS_MC: McItem[] = [
  { id: 'ws-def', skill: 'wsps.ws', stem: 'Hva viser et punkt på lønnssettingskurven (WS)?', correct: 'Den reallønnen bedriftene må betale for å få innsats ved et gitt sysselsettingsnivå.', wrong: ['Hvor mye bedriftene legger på prisene i forhold til lønnskostnadene.', 'Sammenhengen mellom inflasjon og rente.', 'Hvor mange som ønsker å jobbe ved en gitt nominell lønn.'], why: 'WS bygger på arbeidsdisiplinmodellen: jo lavere ledighet, jo høyere reallønn må til for å få innsats.' },
  { id: 'ps-def', skill: 'wsps.ps', stem: 'Hva bestemmer hvor prissettingslinjen (PS) ligger?', correct: 'Produktiviteten per arbeider og bedriftenes prispåslag (mark-up), dvs. konkurransen i produktmarkedet.', wrong: ['Arbeidsledighetstrygden og fagforeningenes styrke.', 'Hvor mange som er i arbeidsstyrken.', 'Hvor mye de ansatte trives på jobb.'], why: 'PS viser reallønnen som er forenlig med bedriftenes prissetting. Den flyttes av produktivitet og konkurranse.' },
  { id: 'ws-stiger', skill: 'wsps.ws', stem: 'Hvorfor stiger lønnssettingskurven (høyere reallønn ved høyere sysselsetting)?', correct: 'Ved lav ledighet er det lett å få ny jobb, så verdien av jobben faller, og bedriftene må betale mer for å få innsats.', wrong: ['Fordi bedriftene tjener mer når de ansetter flere.', 'Fordi produktiviteten alltid øker når flere jobber.', 'Fordi fagforeningene er sterkest når ledigheten er høy.'], why: 'WS bygger på arbeidsdisiplinmodellen: lav ledighet svekker trusselen om å miste jobben.' },
  { id: 'likevekt-lonn', skill: 'wsps.likevekt', stem: 'Økonomien er i WS–PS-likevekt, men det finnes arbeidsledige som vil jobbe. Hvorfor presser ikke bedriftene lønnen ned?', correct: 'Med lavere reallønn enn WS-kurven viser, vil ikke de ansatte yte nok innsats.', wrong: ['Fordi loven forbyr lønn under tariff.', 'Fordi de arbeidsledige egentlig ikke ønsker jobb.', 'Fordi lavere lønn ville gitt høyere produktivitet.'], why: 'WS er nettopp lønnen som skal til for innsats. Lavere lønn gir unnasluntring og lavere profitt.' },
  { id: 'arbeidsstyrke', skill: 'wsps.arbeidsstyrke', stem: 'I et land er 2,8 millioner i jobb og 0,2 millioner uten jobb, men aktivt på jobbsøking. Hva er ledighetsraten?', correct: 'Omtrent 6,7 prosent', wrong: ['Omtrent 7,1 prosent', 'Omtrent 2 prosent', 'Den kan ikke beregnes uten å vite hvor mange som er pensjonister.'], why: 'Arbeidsstyrken er 2,8 + 0,2 = 3,0 millioner. Ledighetsraten er 0,2 / 3,0 ≈ 6,7 prosent. 7,1 prosent får man hvis man feilaktig deler på de sysselsatte.' },
  { id: 'arbeidsstyrke2', skill: 'wsps.arbeidsstyrke', stem: 'Hvem regnes med i arbeidsstyrken?', correct: 'De som er sysselsatt, og de som er arbeidsledige og aktivt søker jobb.', wrong: ['Alle mellom 15 og 74 år.', 'Bare de som er i jobb.', 'Alle over 16 år som ikke er pensjonister, også heltidsstudenter.'], why: 'Studenter, pensjonister og uføre som ikke søker jobb, står utenfor arbeidsstyrken.' },
  { id: 'reallonn-kilde', skill: 'wsps.likevekt', stem: 'Påstand: «Hvis fagforeningene blir sterkere, vil reallønnen i likevekt øke.» Hva sier WS–PS-modellen?', correct: 'Påstanden er feil: WS skifter opp, men reallønnen i likevekt bestemmes av PS; det er ledigheten som øker.', wrong: ['Påstanden er riktig: høyere lønnskrav gir alltid høyere reallønn.', 'Påstanden er riktig fordi PS skifter opp når fagforeningene blir sterkere.', 'Modellen sier ingenting om fagforeninger.'], why: 'Nominelle lønnsøkninger «spises opp» av prisøkninger. Bare produktivitet og konkurranse flytter PS.' },
  { id: 'punkt-over', skill: 'wsps.likevekt', stem: 'Økonomien befinner seg i et punkt der reallønnen er høyere enn PS-linjen tillater. Hva vil skje?', correct: 'Reallønnen er for høy for bedriftenes lønnsomhet; mange bedrifter setter opp prisene, og det gir inflasjon.', wrong: ['Arbeidstakerne slutter å yte innsats.', 'Fagforeningene klager på for sterkt press på de ansatte.', 'Bedriftene senker prisene, og vi får deflasjon.'], why: 'Over PS er profittmarginen for lav. Bedriftene øker prisene for å gjenopprette påslaget.' },
];

const WSPS_EXPLAIN: ExplainItem[] = [
  { id: 'hoy-reallonn', skills: ['wsps.ps', 'wsps.likevekt'], prompt: 'Basert på WS–PS-modellen: hva kan gi økt reallønn i likevekt? Begrunn svaret.', rubric: [['Produktivitet: høyere produksjon per arbeider skifter PS opp.', true], ['Konkurranse: lavere prispåslag (mark-up) skifter PS opp.', true], ['Forklarer at det virker via lavere priser for gitt nominell lønn (høyere kjøpekraft).', false]], model: 'Reallønnen i likevekt bestemmes av PS. Den øker hvis produktiviteten øker (mer verdi per arbeider å fordele) eller hvis konkurransen blir sterkere (lavere prispåslag). I begge tilfeller går prisene ned for gitt nominell lønn, og reallønnen øker.', hints: { small: 'Hvilken kurve bestemmer reallønnen i likevekt?', firstStep: 'Tenk på hva som flytter PS.', why: 'WS-skift endrer ledigheten, ikke reallønnen i likevekt.' } },
  { id: 'pose-sekk', skills: ['wsps.likevekt'], prompt: 'En politiker sier: «Skal vi få ned arbeidsledigheten, må arbeidstakerne godta lavere reallønn.» Drøft utsagnet med WS–PS-modellen.', rubric: [['Viser at utsagnet ikke stemmer generelt: reallønnen i likevekt er bestemt av PS.', true], ['Lavere lønnskrav (WS skifter ned) gir lavere ledighet ved samme reallønn.', true], ['Høyere produktivitet eller sterkere konkurranse (PS skifter opp) gir både høyere reallønn og lavere ledighet.', true]], model: 'I WS–PS-modellen bestemmer PS reallønnen i likevekt. Hvis arbeidstakerne krever mindre ved hvert ledighetsnivå, skifter WS ned: ledigheten faller, men reallønnen er den samme, så de trenger ikke godta lavere reallønn. Øker produktiviteten, eller blir konkurransen sterkere slik at påslaget faller, skifter PS opp, og vi får både høyere reallønn og lavere ledighet. Utsagnet stemmer derfor ikke.', hints: { small: 'Skill mellom skift i WS og skift i PS.', firstStep: 'Hvilken kurve bestemmer reallønnen i likevekt?', why: 'Et skift i PS kan gi både høyere lønn og lavere ledighet.' } },
  { id: 'hoykonjunktur', skills: ['wsps.likevekt'], prompt: 'Anta at etterspørselen i økonomien blir så sterk at ledigheten faller under likevektsledigheten. Forklar hvorfor dette kan gi økende inflasjon.', rubric: [['Ved lav ledighet må bedriftene betale høyere lønn for å få innsats (WS ligger over PS ved denne sysselsettingen).', true], ['Bedriftene setter opp prisene for å beholde påslaget, og arbeidstakerne krever ny lønnsøkning.', true], ['Så lenge kravene til sammen er større enn det som produseres, fortsetter lønns- og prisveksten.', true]], model: 'Med lav ledighet er det lett å få ny jobb, så bedriftene må betale mer for å få innsats. Lønningene stiger. Bedriftene vil beholde påslaget og setter opp prisene, noe som spiser opp reallønnsøkningen. Arbeidstakerne krever da nye lønnstillegg. Så lenge arbeidstakernes og bedriftenes krav til sammen overstiger produksjonen, fortsetter lønns- og prisveksten.', hints: { small: 'Hvem vil ha mer når ledigheten er lav, og hva gjør bedriftene da?', firstStep: 'Start med at WS krever mer reallønn enn PS gir ved lav ledighet.', why: 'Motstridende krav gir en lønn–pris-spiral.' } },
  { id: 'ws-stiger', skills: ['wsps.ws'], prompt: 'Hvorfor må bedriftene betale høyere reallønn når sysselsettingen er høy? Knytt svaret til arbeidsdisiplinmodellen.', rubric: [['Høy sysselsetting betyr kort tid uten jobb for den som mister jobben.', true], ['Da er tapet ved å miste jobben mindre, og trusselen om oppsigelse disiplinerer svakere.', true], ['For å få innsats må bedriftene derfor betale mer, så WS stiger med sysselsettingen.', true]], model: 'Når nesten alle er i jobb, finner den som mister jobben raskt en ny. Tapet ved å bli oppsagt er da lite, og trusselen om oppsigelse gir svake insentiver til innsats. Bedriftene må gjøre jobben mer verdt ved å betale høyere lønn. Derfor stiger lønnssettingskurven når sysselsettingen øker.', hints: { small: 'Koble ledighet til verdien av jobben.', firstStep: 'Hva skjer med tapet ved å miste jobben når ledigheten er lav?', why: 'WS bygger på arbeidsdisiplinmodellen.' } },
];

// Arbeidsmarkedsbegreper med tall.
const tplArbeidsmarked: TemplateDef = {
  id: 'wsps-arbeidsmarked',
  version: 1,
  level: 1,
  style: 'standard',
  name: 'Arbeidsstyrke og ledighetsrate',
  description: 'Regn ut arbeidsstyrken, ledighetsraten og yrkesdeltakelsen.',
  skills: ['wsps.arbeidsstyrke'],
  build: (rng) => {
    for (let t = 0; t < 200; t++) {
      const N = randInt(rng, 38, 44) * 100; // tusen personer 15–74 år
      const S = randInt(rng, 26, 30) * 100 + randInt(rng, 0, 9) * 10;
      const U = randInt(rng, 6, 18) * 10;
      const L = S + U;
      if (L >= N) continue;
      const rate = R(U).div(R(L)).mul(R(100));
      const part = R(L).div(R(N)).mul(R(100));
      const parts: GenPart[] = [
        { id: 'a', label: 'a', prompt: 'Hvor stor er arbeidsstyrken (i tusen personer)?', kind: 'beregning', skills: ['wsps.arbeidsstyrke'], math: numMath(), targets: [x('Arbeidsstyrken', R(L), ['arbeidsstyrken', 'arbeidsstyrke'], 0)], solution: [step(`${no(R(S))} + ${U} = ${no(R(L))}`, 'Sysselsatte pluss arbeidsledige', 'De som står utenfor (studenter, pensjonister, uføre som ikke søker jobb), er ikke med.', 'definisjon')], hints: { small: 'Hvem er med i arbeidsstyrken?', firstStep: 'Arbeidsstyrken = sysselsatte + arbeidsledige.', stepExplanation: 'Befolkningen i arbeidsfør alder er ikke det samme som arbeidsstyrken.', workedExample: { intro: '', steps: [] } }, methodCheckpoints: [] },
        { id: 'b', label: 'b', prompt: 'Hva er arbeidsledighetsraten (i prosent, én desimal)?', kind: 'beregning', skills: ['wsps.arbeidsstyrke'], math: numMath(), targets: [x('Ledighetsrate', rate, ['ledighet', 'rate', 'ledighetsrate'], 1, true)], solution: [step(`\\frac{${U}}{${no(R(L))}} \\cdot 100\\,\\% = ${no(rate, 2)}\\,\\%`, 'Ledige delt på arbeidsstyrken', 'Ledighetsraten måles mot arbeidsstyrken, ikke mot hele befolkningen.', 'definisjon')], hints: { small: 'Hva er grunnlaget for ledighetsraten?', firstStep: `${U} / ${no(R(L))}`, stepExplanation: 'Andelen ledige av dem som tilbyr arbeid.', workedExample: { intro: '', steps: [] } }, methodCheckpoints: [] },
        { id: 'c', label: 'c', prompt: 'Hva er yrkesdeltakelsen (arbeidsstyrken som andel av befolkningen i arbeidsfør alder, én desimal)?', kind: 'beregning', skills: ['wsps.arbeidsstyrke'], math: numMath(), targets: [x('Yrkesdeltakelse', part, ['yrkesdeltakelse', 'deltakelse', 'andel'], 1, true)], solution: [step(`\\frac{${no(R(L))}}{${no(R(N))}} \\cdot 100\\,\\% = ${no(part, 2)}\\,\\%`, 'Arbeidsstyrken delt på befolkningen i arbeidsfør alder', '', 'definisjon')], hints: { small: 'Hvem er i teller, og hvem i nevner?', firstStep: `${no(R(L))} / ${no(R(N))}`, stepExplanation: 'Yrkesdeltakelsen viser hvor mange av dem i arbeidsfør alder som tilbyr arbeid.', workedExample: { intro: '', steps: [] } }, methodCheckpoints: [] },
      ];
      return { title: 'Arbeidsmarkedsbegreper', intro: `I et land er det ${no(R(N))} tusen personer i alderen 15–74 år. ${no(R(S))} tusen er sysselsatt, og ${U} tusen er arbeidsledige som aktivt søker jobb.`, context: 'arbeidsmarked', parts, params: { N: String(N), S: String(S), U: String(U) }, skills: ['wsps.arbeidsstyrke'], structureKey: 'wsps-arbeidsmarked', estMinutes: 6 };
    }
    throw new Error('Fant ikke gyldige tall');
  },
};

// PS: reallønn = produksjon per arbeider · (1 − påslagsandel).
const tplPs: TemplateDef = {
  id: 'wsps-ps-tall',
  version: 1,
  level: 3,
  style: 'standard',
  name: 'Reallønnen på PS-linjen',
  description: 'Reallønn = produksjon per arbeider · andelen som går til arbeiderne. Hva skjer når produktivitet eller påslag endres?',
  skills: ['wsps.ps', 'wsps.skift'],
  build: (rng) => {
    const lam = randInt(rng, 40, 80) * 10;
    const sp = pick(rng, [60, 65, 70, 75, 80]);
    const share = R(sp).div(R(100));
    const w = R(lam).mul(share);
    const up = pick(rng, [5, 10, 20]);
    const lam2 = R(lam).mul(R(100 + up)).div(R(100));
    const sp2 = pick(rng, [sp + 5, sp - 5].filter((s) => s > 50 && s < 90));
    const share2 = R(sp2).div(R(100));
    const w2 = lam2.mul(share2);
    const parts: GenPart[] = [
      { id: 'a', label: 'a', prompt: 'Hva er reallønnen per time på prissettingslinjen?', kind: 'beregning', skills: ['wsps.ps'], math: numMath(), targets: [x('Reallønn', w, ['reallønn', 'reallønnen', 'lønn'], 0)], solution: [step(`${lam} \\cdot ${texNum(share)} = ${texNum(w)}`, 'Produksjon per arbeider ganger arbeidernes andel', 'Resten (påslaget) går til bedriftenes eiere som profitt.', 'modellantakelse')], hints: { small: 'Hvor stor del av verdiskapingen går til arbeiderne?', firstStep: `${lam} · ${no(share)}`, stepExplanation: 'PS: reallønnen er det som er igjen av produksjonen per arbeider etter bedriftenes påslag.', workedExample: { intro: '', steps: [] } }, methodCheckpoints: [] },
      { id: 'b', label: 'b', prompt: `Produktiviteten øker med ${up} %, og samtidig endres arbeidernes andel til ${no(share2)} fordi konkurransen ${sp2 > sp ? 'blir sterkere' : 'blir svakere'}. Hva blir den nye reallønnen på PS-linjen?`, kind: 'beregning', skills: ['wsps.ps'], math: numMath(), targets: [x('Ny reallønn', w2, ['ny', 'reallønn', 'reallønnen'], 1)], solution: [step(`${lam} \\cdot ${texNum(R(100 + up).div(R(100)))} = ${texNum(lam2)}`, 'Ny produksjon per arbeider', '', 'innsetting'), step(`${texNum(lam2)} \\cdot ${texNum(share2)} = ${texNum(w2)}`, 'Ny reallønn', '', 'innsetting')], hints: { small: 'To endringer: produktiviteten og andelen.', firstStep: `Ny produksjon per arbeider: ${lam} · ${no(R(100 + up).div(R(100)))}.`, stepExplanation: 'Både høyere produktivitet og sterkere konkurranse flytter PS opp.', workedExample: { intro: '', steps: [] } }, methodCheckpoints: [] },
    ];
    return { title: 'Prissettingslinjen i tall', intro: `I en økonomi produserer hver arbeider varer og tjenester for ${lam} kr per time (målt i faste priser). Bedriftenes prispåslag gjør at ${sp} % av verdiskapingen går til arbeiderne som reallønn.`, context: 'ps', parts, params: { lam: String(lam), share: String(sp), up: String(up), share2: String(sp2) }, skills: ['wsps.ps', 'wsps.skift'], structureKey: 'wsps-ps-tall', estMinutes: 7 };
  },
};

const wspsIntents: IntentDef[] = [
  { id: 'wsps.arbeidsstyrke', specific: true, label: 'Arbeidsstyrken', match: [/arbeidsstyrke|labou?r force|yrkesdeltak|sysselsettingsandel|ledighetsrate/i], skills: ['wsps.arbeidsstyrke'], taskType: ['forklaring'], assignment: 'Forklare hvem som er i arbeidsstyrken (sysselsatte + arbeidsledige som søker jobb), og hvem som står utenfor.', interpretation: ['Arbeidsstyrken er sysselsatte pluss arbeidsledige som aktivt søker arbeid.', 'Ikke bland arbeidsstyrken med befolkningen i arbeidsfør alder; studenter, pensjonister og uføre som ikke søker jobb står utenfor.'], prerequisites: [], misconceptions: ['Tror arbeidsstyrken er alle i arbeidsfør alder', 'Måler ledighetsraten mot hele befolkningen'], variation: ['Aldrende befolkning', 'Tall for befolkning og arbeidsstyrke'], estMinutes: 4 },
  { id: 'wsps.skift', specific: true, label: 'Skift i WS eller PS', match: [/skift|forskyv|flytte[sr]? (?:opp|ned)|opp, ned|uendret|koordinert|trygd(?:en)? øker|konkurranse|produktiv/i], skills: ['wsps.skift', 'wsps.likevekt'], taskType: ['forklaring', 'tolkning'], assignment: 'Avgjøre hvilken kurve som skifter (WS eller PS), hvilken vei, og hva som skjer med likevektsledighet og reallønn.', interpretation: ['Du må si hvilken kurve som skifter og begrunne det (WS: trygd, fagforeninger, koordinering, trivsel; PS: produktivitet og konkurranse/påslag).', 'Du må forklare den nye likevekten der kurvene krysser.', 'Reallønnen i likevekt bestemmes av PS.'], prerequisites: ['Arbeidsdisiplinmodellen'], misconceptions: ['Tror sterkere fagforeninger gir høyere reallønn i likevekt', 'Lar trygd flytte PS'], variation: ['Ulike sjokk (trygd, fagforeninger, konkurranse, produktivitet)'], estMinutes: 7 },
  { id: 'wsps.ws', label: 'Lønnssettingskurven', match: [/lønnssettingskurve|lønnsettingskurve|wage[- ]setting|\bWS\b/i], skills: ['wsps.ws'], taskType: ['forklaring'], assignment: 'Forklare hva lønnssettingskurven viser og hvorfor den stiger.', interpretation: ['WS viser reallønnen som må til for innsats ved hvert sysselsettingsnivå.', 'Den stiger fordi lav ledighet svekker verdien av jobben (arbeidsdisiplin).'], prerequisites: ['Arbeidsdisiplinmodellen'], misconceptions: ['Forklarer stigningen med produktivitet'], variation: [], estMinutes: 5 },
  { id: 'wsps.ps', label: 'Prissettingslinjen', match: [/prissettingslinje|prissettingskurve|price[- ]setting|\bPS\b|mark-?up|prispåslag/i], skills: ['wsps.ps'], taskType: ['forklaring'], assignment: 'Forklare hva som bestemmer prissettingslinjen: produktivitet og prispåslag.', interpretation: ['PS viser reallønnen som er forenlig med bedriftenes prissetting.', 'Den ligger høyere ved høy produktivitet og sterk konkurranse (lavt påslag).'], prerequisites: [], misconceptions: ['Tror fagforeninger flytter PS'], variation: [], estMinutes: 5 },
  { id: 'wsps.likevekt', label: 'Likevekt og strukturell ledighet', match: [/likevekt|reallønn|arbeidsledighet selv|pose og sekk|høykonjunktur|inflasjon/i], skills: ['wsps.likevekt'], taskType: ['forklaring', 'drøfting'], assignment: 'Forklare likevekten der WS krysser PS, hvorfor det er ledighet i likevekt, og hva som bestemmer reallønnen.', interpretation: ['Likevekten er der WS krysser PS.', 'Det er ledighet i likevekt fordi lavere lønn ville gitt for lite innsats.', 'Reallønnen i likevekt bestemmes av PS.'], prerequisites: ['WS og PS'], misconceptions: ['Tror bedriftene kan presse lønna ned så lenge det finnes ledige'], variation: [], estMinutes: 6 },
];

export const wsps: FamilyKB = {
  id: 'ws-ps',
  name: 'Lønns- og prissetting (WS–PS) og likevektsledighet',
  shortName: 'WS–PS-modellen',
  topic: 'Arbeidsmarkedet',
  subtopics: ['Lønnssettingskurven', 'Prissettingslinjen', 'Arbeidsstyrke og ledighet', 'Fagforeninger'],
  description: 'Tilbudssiden i økonomien: hvorfor det er ledighet i likevekt, hva som bestemmer reallønnen, og hvordan trygd, fagforeninger, konkurranse og produktivitet flytter kurvene.',
  skills: ['wsps.arbeidsstyrke', 'wsps.ws', 'wsps.ps', 'wsps.likevekt', 'wsps.skift'],
  formulas: [
    {
      id: 'f-ps',
      tex: '\\frac{W}{P} = \\lambda\\,(1 - \\mu)',
      name: 'Prissettingslinjen (PS)',
      kind: 'modellantakelse',
      kindWhy: 'En forenkling i modellen: bedriftene setter prisen som et påslag på lønnskostnaden, så arbeiderne får andelen 1 − μ av produksjonen per arbeider.',
      symbols: [
        { sym: 'W/P', meaning: 'Reallønn', unit: 'varer per time' },
        { sym: '\\lambda', meaning: 'Produksjon per arbeider (produktivitet)', unit: 'varer per time' },
        { sym: '\\mu', meaning: 'Påslagets andel av prisen (profittandel)', unit: 'andel' },
      ],
      conditions: ['Gitt konkurranse i produktmarkedet.'],
      whatIf: ['Høyere λ: PS opp.', 'Høyere μ (svakere konkurranse): PS ned.'],
      figure: 'wsps',
    },
    {
      id: 'f-ledighet',
      tex: '\\text{Ledighetsrate} = \\frac{\\text{arbeidsledige}}{\\text{arbeidsstyrken}} \\cdot 100\\,\\%',
      name: 'Arbeidsledighetsrate',
      kind: 'definisjon',
      kindWhy: 'Definisjon brukt i offisiell statistikk.',
      symbols: [{ sym: '\\text{arbeidsstyrken}', meaning: 'Sysselsatte + arbeidsledige som søker jobb', unit: 'personer' }],
      conditions: [],
      whatIf: ['Flere som gir opp å søke jobb, gir lavere målt ledighet.'],
    },
  ],
  intents: wspsIntents,
  templates: [
    shockTemplate({ id: 'wsps-sjokk', level: 2, name: 'Hva skjer i WS–PS?', description: 'Et sjokk: hvilken kurve skifter, og hva skjer med ledighet og reallønn?', title: 'Skift i WS–PS-modellen', items: SHOCKS }),
    mcTemplate({ id: 'wsps-mc', level: 1, name: 'Flervalg: WS–PS og arbeidsmarkedet', description: 'Begreper og mekanismer.', title: 'WS–PS og arbeidsmarkedet', items: WSPS_MC }),
    tplArbeidsmarked,
    tplPs,
    explainTemplate({ id: 'wsps-drøft', level: 4, name: 'Drøft som på eksamen', description: 'Del 3-spørsmål: påstander og mekanismer.', title: 'Drøft i WS–PS-modellen', items: WSPS_EXPLAIN, estMinutes: 10 }),
  ],
  misconceptions: [
    { id: 'fag-reallonn', label: 'Tror sterkere fagforeninger gir høyere reallønn i likevekt', explanation: 'WS skifter opp, men reallønnen bestemmes av PS. Ledigheten øker.' },
    { id: 'trygd-ps', label: 'Lar trygd eller fagforeninger flytte PS', explanation: 'PS flyttes bare av produktivitet og konkurranse (påslag).' },
    { id: 'arbeidsstyrke', label: 'Blander arbeidsstyrken med befolkningen i arbeidsfør alder', explanation: 'Arbeidsstyrken er sysselsatte pluss ledige som søker jobb.' },
  ],
  recognize: keywordRecognizer(
    [
      [/lønnssettingskurve|lønnsettingskurve|wage[- ]setting|\bWS\b/i, 3],
      [/prissettingslinje|prissettingskurve|price[- ]setting|\bPS\b/i, 3],
      [/arbeidsstyrke|labou?r force/i, 1.5],
      [/likevektsledighet|strukturell (?:arbeids)?ledighet/i, 2],
      [/fagforening/i, 1],
      [/mark-?up|prispåslag|profittmargin/i, 1],
      [/reallønn/i, 0.8],
      [/sysselsettingsandel|yrkesdeltak|arbeidsledighetsrate|employment rate|participation rate/i, 1.5],
      [/insentiv(?:er)? til å yte innsats|yte innsats/i, 1.2],
      [/arbeidsledighet(?!strygd)/i, 0.8],
      [/likevekt\w*[^.]{0,25}arbeidsledighet/i, 2],
      [/forhandlingsmakt/i, 1],
    ],
    2.5,
    'lønns- og prissettingsmodellen (WS–PS)',
  ),
  explanations: {
    short: () => ({ text: 'WS viser reallønnen som skal til for innsats ved hvert sysselsettingsnivå; PS viser reallønnen bedriftenes prissetting gir. Likevekten er der de krysser, og der er det ledighet.', example: 'Høyere trygd: WS opp, ledigheten øker, reallønnen uendret. Høyere produktivitet: PS opp, reallønnen øker og ledigheten faller.' }),
    analogy: { text: 'To krav som må møtes: arbeiderne krever en viss lønn for å yte innsats (WS), bedriftene gir en viss lønn gitt prisene de setter (PS). Bare der kravene møtes, står lønn og priser stille.', limits: 'Analogien viser ikke hvorfor det er ledighet i likevekt – det kommer fra arbeidsdisiplinen.' },
    derivationFormulaId: 'f-ps',
  },
  solutionStructure: ['Hvilken kurve påvirkes', 'Hvilken vei', 'Ny likevekt', 'Effekt på ledighet og reallønn', 'Begrunnelse fra modellen'],
  surfaceFeatures: ['Hvilket sjokk (trygd, fagforening, konkurranse, produktivitet)', 'Om figuren viser ett eller to land'],
};

void readNumber;
void Rat;
