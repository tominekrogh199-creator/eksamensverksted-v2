// Mikrodelen av SØK-pensum (CORE): valg mellom fritid og konsum,
// alternativkostnad og økonomisk gevinst, tilbud og etterspørsel i
// frikonkurranse, teknologivalg med isokostlinjer, prinsipal–agent og
// kjennetegn ved kapitalismen.

import type { GenPart } from '../domain/types';
import { FamilyKB, TemplateDef, IntentDef, randInt, pick, R, no, texNum, step } from './common';
import { mcTemplate, explainTemplate, shockTemplate, keywordRecognizer, mcPart, McItem, ExplainItem, ShockItem } from './verbal';
import type { Rat } from '../math/rational';

const x = (label: string, value: Rat, aliases: string[], minDecimals?: number, percent?: boolean) => ({ symbol: 'x', label, value: value.toString(), aliases, minDecimals, percent });
const numMath = () => ({ symbols: [], defs: {}, param: 'x', unknown: 'x', solution: {}, answerSymbols: ['x'] });

// ——— Fritid og konsum ———

const AF_MC: McItem[] = [
  { id: 'indiff', skill: 'af.indiff', stem: 'Punktene X og Y ligger på samme indifferenskurve mellom fritid og konsum. Hva kan vi si om dem?', correct: 'Personen synes X og Y er like gode; de gir samme nytte, selv om de har ulik fritid og ulikt konsum.', wrong: ['Personen har bare råd til X og Y, ikke til andre punkter.', 'Personen foretrekker punktet med mest fritid.', 'X og Y gir samme inntekt.'], why: 'En indifferenskurve samler kombinasjoner med samme nytte. Hva personen har råd til, er budsjettlinjen, ikke indifferenskurven.' },
  { id: 'msb', skill: 'af.indiff', stem: 'En student har en indifferenskurve mellom fritid (timer per dag) og konsum (kroner). Hva forteller MSB i et punkt på kurven?', correct: 'Hvor mange kroner konsum studenten akkurat er villig til å bytte bort mot én time ekstra fritid, uten å få det verre.', wrong: ['Hvor mange kroner konsum studenten faktisk taper ved å jobbe én time mindre, gitt timelønnen.', 'Hvor mye nytten øker når både fritid og konsum dobles.', 'Hvor mange timer studenten må jobbe for å ha råd til én krone mer konsum.'], why: 'MSB er helningen på indifferenskurven og beskriver hva personen er villig til å bytte (preferanser). Det man faktisk må gi opp, er helningen på budsjettlinjen (MTB, som er timelønnen).' },
  { id: 'helning', skill: 'af.budsjett', stem: 'Timelønnen er 220 kr. Fritid står på den vannrette aksen og konsum på den loddrette. Hvordan ser budsjettlinjen ut?', correct: 'Den faller med 220 kr konsum for hver ekstra time fritid, fordi en time fritid koster en time lønn.', wrong: ['Den stiger med 220 kr for hver time fritid, fordi fritid gir nytte.', 'Helningen avhenger av hvor mye personen liker fritid.', 'Den er vannrett, fordi konsumet ikke avhenger av arbeidstiden.'], why: 'Helningen på budsjettlinjen er alternativkostnaden for fritid, altså timelønnen. Preferansene bestemmer indifferenskurvene, ikke budsjettlinjen.' },
  { id: 'subst', skill: 'af.effekter', stem: 'Etter et lønnshopp velger Lise å jobbe tre timer mer i uka. Hva sier modellen for fritid og konsum om dette?', correct: 'Effekten av at fritid er blitt dyrere, er sterkere enn effekten av at hun er blitt rikere.', wrong: ['Hun er blitt rikere, og rikere personer vil alltid jobbe mer.', 'Lønnsøkningen påvirker bare konsumet, ikke valget av arbeidstid.', 'Fritid må være et mindreverdig gode, siden hun ikke vil ha mer av det.'], why: 'Substitusjonseffekten (fritid er dyrere) trekker mot mer arbeid, og inntektseffekten (hun er rikere) trekker mot mer fritid når fritid er et normalt gode. Mer arbeid betyr at substitusjonseffekten er sterkest; det krever ikke at fritid er mindreverdig.' },
  { id: 'inntekt', skill: 'af.effekter', stem: 'Olav får høyere timelønn og går ned fra full stilling til 80 prosent. Hvordan forklares det best?', correct: 'Han er blitt rikere og bruker noe av den økte kjøpekraften på fritid; denne inntektseffekten er sterkere enn substitusjonseffekten.', wrong: ['Fritid er blitt billigere, så han kjøper mer av den.', 'Høyere lønn gjør at arbeid gir mindre nytte.', 'Substitusjonseffekten og inntektseffekten trekker begge mot kortere arbeidstid.'], why: 'En lønnsøkning gjør fritid dyrere (trekker mot mer arbeid) og personen rikere (trekker mot mer fritid). Kortere arbeidstid betyr at inntektseffekten dominerer.' },
  { id: 'arbeidsfri', skill: 'af.effekter', stem: 'En person får en arbeidsfri inntekt (f.eks. fra staten) i tillegg til lønnen. Timelønnen er uendret. Hva er effekten?', correct: 'Bare en inntektseffekt: personen har råd til mer av begge goder, og vil typisk velge mer fritid.', wrong: ['Bare en substitusjonseffekt, fordi fritid blir dyrere.', 'Både inntekts- og substitusjonseffekt, som alltid gir mer arbeid.', 'Ingen effekt, fordi timelønnen er uendret.'], why: 'Budsjettlinjen skifter parallelt ut; helningen (timelønnen) er den samme. Da er det bare en inntektseffekt.' },
  { id: 'optimum', skill: 'af.optimum', stem: 'I punktet personen har valgt, er MSB større enn MTB (timelønnen). Hva betyr det?', correct: 'Personen er villig til å ofre mer konsum for en time fritid enn hen må, så mer fritid gir høyere nytte; punktet er ikke optimalt.', wrong: ['Punktet er optimalt, fordi MSB er større enn MTB.', 'Personen bør jobbe mer, fordi fritid er for billig.', 'Vi kan ikke si noe uten å vite om inntekts- eller substitusjonseffekten dominerer.'], why: 'Optimum krever MSB = MTB (indifferenskurven tangerer budsjettlinjen). MSB > MTB betyr at fritid verdsettes mer enn den koster.' },
  { id: 'ingen-kurver', skill: 'af.indiff', stem: 'Hvilket utsagn om indifferenskurver er riktig?', correct: 'Kurver som ligger lenger ut fra origo gir høyere nytte, og hver person har uendelig mange indifferenskurver.', wrong: ['Hver person har én indifferenskurve.', 'Indifferenskurver stiger fordi mer fritid gir mer konsum.', 'Indifferenskurvene blir brattere når vi går mot høyre.'], why: 'Mer av begge goder er bedre, så kurvene lenger ut gir høyere nytte. De faller og blir flatere mot høyre.' },
];

const AF_EXPLAIN: ExplainItem[] = [
  { id: 'effekter', skills: ['af.effekter'], prompt: 'Lønnen din øker med 15 prosent. Forklar de to kreftene som påvirker hvor mange timer du vil jobbe, og hvorfor utfallet ikke er gitt på forhånd.', rubric: [['Substitusjonseffekt: hver time fritid koster nå mer i tapt lønn, og det trekker mot flere arbeidstimer.', true], ['Inntektseffekt: med høyere lønn er du rikere og kan «kjøpe» mer fritid, og det trekker mot færre timer.', true], ['Effektene trekker hver sin vei, og den sterkeste bestemmer utfallet.', true]], model: 'To krefter virker samtidig. Fritid blir dyrere fordi hver time fri nå koster mer lønn, og det trekker mot mer arbeid (substitusjonseffekten). Samtidig gir samme arbeidstid mer inntekt, og noe av den økte kjøpekraften kan brukes på fritid, som trekker mot mindre arbeid (inntektseffekten). Hvilken som vinner, avhenger av preferansene, så utfallet kan gå begge veier.', hints: { small: 'Det er to effekter, og de trekker hver sin vei.', firstStep: 'Hva koster én time fritid før og etter lønnsøkningen?', why: 'Prisen på fritid er lønnen du gir avkall på.' } },
  { id: 'msb-mtb', skills: ['af.indiff', 'af.budsjett'], prompt: 'Forklar hvorfor en person som maksimerer nytten, velger et punkt der indifferenskurven og budsjettlinjen har samme helning.', rubric: [['Budsjettlinjens helning (MTB) viser hvor mye konsum man må gi opp for en time fritid, altså timelønnen.', true], ['Indifferenskurvens helning (MSB) viser hvor mye konsum man er villig til å gi opp for en time fritid.', true], ['Er MSB større enn MTB, lønner det seg å ta mer fritid (og omvendt); bare der de er like, kan personen ikke få det bedre.', true]], model: 'Budsjettlinjen viser hva som er mulig: hver ekstra time fritid koster timelønnen i konsum (MTB). Indifferenskurven viser hva personen er villig til å bytte (MSB). Er personen villig til å betale mer for fritid enn den koster, øker nytten ved å jobbe mindre; er det omvendt, lønner det seg å jobbe mer. Nytten er størst der de to helningene er like.', hints: { small: 'Sammenlikn «vil bytte» og «må bytte».', firstStep: 'Hva skjer hvis MSB er større enn timelønnen?', why: 'I optimum er MSB = MTB.' } },
  { id: 'budsjett', skills: ['af.budsjett'], prompt: 'En person har 16 timer til rådighet per dag og tjener 180 kr per time. Forklar hva budsjettlinjen viser, og hvor den treffer aksene.', rubric: [['Linjen viser alle kombinasjoner av fritid og konsum personen har råd til.', true], ['Med 16 timer fritid er konsumet 0; med 0 timer fritid er konsumet 16 · 180 = 2880 kr.', true], ['Helningen er −180: én time mer fritid koster 180 kr konsum.', true]], model: 'Budsjettlinjen viser mulighetene: alle kombinasjoner av fritid og konsum som kan nås med lønnsinntekten. Tar personen alle 16 timene som fritid, er konsumet 0. Jobber personen alle 16 timene, blir konsumet 2880 kr. Linjen mellom punktene faller med 180 kr per time fritid, som er timelønnen.', hints: { small: 'Start i de to endepunktene.', firstStep: 'Hva blir konsumet hvis personen jobber alle timene?', why: 'Helningen er prisen på fritid.' } },
];

const tplBudsjett: TemplateDef = {
  id: 'af-budsjett',
  version: 1,
  level: 1,
  style: 'standard',
  name: 'Budsjettlinjen i tall',
  description: 'Konsum ved gitt fritid, med og uten arbeidsfri inntekt.',
  skills: ['af.budsjett'],
  build: (rng) => {
    const w = randInt(rng, 12, 30) * 10;
    const m = pick(rng, [0, 200, 300, 400, 500]);
    const fritid = randInt(rng, 14, 18);
    const arbeid = 24 - fritid;
    const C = R(w).mul(R(arbeid)).add(R(m));
    const parts: GenPart[] = [
      { id: 'a', label: 'a', prompt: `Hvor mye kan personen konsumere per døgn hvis hen tar ${fritid} timer fritid?`, kind: 'beregning', skills: ['af.budsjett'], math: numMath(), targets: [x('Konsum', C, ['konsum', 'konsumet'], 0)], solution: [step(`${w} \\cdot (24 - ${fritid})${m ? ` + ${m}` : ''} = ${texNum(C)}`, 'Lønn · timer i arbeid (+ arbeidsfri inntekt)', 'Timer i arbeid er 24 minus fritid.', 'innsetting')], hints: { small: 'Hvor mange timer jobber personen?', firstStep: `24 − ${fritid} = ${arbeid} timer arbeid.`, stepExplanation: 'Konsum = lønn · arbeidstimer (+ eventuell arbeidsfri inntekt).', workedExample: { intro: '', steps: [] } }, methodCheckpoints: [] },
      mcPart(rng, { id: 'helning', skill: 'af.budsjett', stem: 'Hvor mye konsum må personen gi opp for én time mer fritid?', correct: `${w} kr – timelønnen`, wrong: [`${w * 24} kr – døgnlønnen`, `${m || 100} kr – den arbeidsfrie inntekten`, '0 kr – fritid er gratis'], why: 'Helningen på budsjettlinjen er timelønnen: én time mindre arbeid gir timelønnen mindre konsum.' }, 'b', 'b'),
    ];
    return { title: 'Budsjettlinjen mellom fritid og konsum', intro: `En person tjener ${w} kr per time og kan selv velge hvor mange av døgnets 24 timer hen vil jobbe. ${m ? `I tillegg får hen en arbeidsfri inntekt på ${m} kr per døgn. ` : ''}Hele inntekten brukes på konsum.`, context: 'budsjett', parts, params: { w: String(w), m: String(m), fritid: String(fritid) }, skills: ['af.budsjett'], structureKey: `af-budsjett|${m ? 'm' : '0'}`, estMinutes: 4 };
  },
};

export const arbeidFritid: FamilyKB = {
  id: 'fritid-konsum',
  name: 'Valg mellom fritid og konsum: indifferenskurver og budsjettlinje',
  shortName: 'Fritid og konsum',
  topic: 'Arbeidstilbud og preferanser',
  subtopics: ['Indifferenskurver og MSB', 'Budsjettlinje og MTB', 'Inntekts- og substitusjonseffekt', 'Arbeidsfri inntekt'],
  description: 'Hvordan en person velger arbeidstid: preferanser (indifferenskurver, MSB), muligheter (budsjettlinjen, timelønn) og hva som skjer når lønn eller arbeidsfri inntekt endres.',
  skills: ['af.indiff', 'af.budsjett', 'af.optimum', 'af.effekter'],
  formulas: [
    {
      id: 'f-budsjett',
      tex: 'C = w\\,(24 - t) + m',
      name: 'Budsjettlinjen (fritid og konsum)',
      kind: 'definisjon',
      kindWhy: 'Følger av at konsumet er lik inntekten: lønn for timene man jobber pluss arbeidsfri inntekt.',
      symbols: [
        { sym: 'C', meaning: 'Konsum', unit: 'kr per døgn' },
        { sym: 'w', meaning: 'Timelønn (= helningen, MTB)', unit: 'kr per time' },
        { sym: 't', meaning: 'Timer fritid', unit: 'timer' },
        { sym: 'm', meaning: 'Arbeidsfri inntekt', unit: 'kr per døgn' },
      ],
      conditions: ['Hele inntekten brukes på konsum.'],
      whatIf: ['Høyere w: brattere budsjettlinje.', 'Arbeidsfri inntekt: parallellforskyvning ut.'],
      calc: {
        inputs: [
          { sym: 'w', label: 'Timelønn (kr)', min: 50, max: 500, step: 10, value: 200 },
          { sym: 't', label: 'Timer fritid', min: 0, max: 24, step: 1, value: 16 },
          { sym: 'm', label: 'Arbeidsfri inntekt (kr)', min: 0, max: 2000, step: 50, value: 0 },
        ],
        compute: (v) => [
          { label: 'Konsum', value: `${no(R(v.w).mul(R(24 - v.t)).add(R(v.m)))} kr` },
          { label: 'Pris på én time fritid (MTB)', value: `${no(R(v.w))} kr` },
        ],
      },
    },
  ],
  intents: [
    { id: 'af.effekter', specific: true, label: 'Inntekts- og substitusjonseffekt', match: [/inntektseffekt|substitusjonseffekt|arbeidsfri inntekt/i], skills: ['af.effekter'], taskType: ['forklaring'], assignment: 'Skille inntekts- og substitusjonseffekten og si hvilken som dominerer.', interpretation: ['Substitusjonseffekten: fritid blir dyrere ved høyere lønn (mer arbeid).', 'Inntektseffekten: man blir rikere og vil ha mer fritid (mindre arbeid).', 'Arbeidsfri inntekt gir bare inntektseffekt.'], prerequisites: ['Budsjettlinjen'], misconceptions: ['Tror substitusjonseffekten gir mer fritid', 'Tror arbeidsfri inntekt gir substitusjonseffekt'], variation: ['Lønn opp/ned, arbeidsfri inntekt'], estMinutes: 5 },
    { id: 'af.optimum', specific: true, label: 'Optimalt valg', match: [/optimal|tilpasset seg|MSB\s*[=<>]|høyest(?:e)? nytte|velge|valgt minst/i], skills: ['af.optimum'], taskType: ['tolkning'], assignment: 'Finne og forklare det optimale valget der indifferenskurven tangerer budsjettlinjen (MSB = MTB).', interpretation: ['Optimum er på budsjettlinjen og på høyest mulige indifferenskurve.', 'I optimum er MSB = MTB (timelønnen).'], prerequisites: ['Indifferenskurver', 'Budsjettlinjen'], misconceptions: ['Velger et punkt utenfor budsjettlinjen'], variation: ['Lese av figur', 'Arbeidsfri inntekt'], estMinutes: 5 },
    { id: 'af.budsjett', label: 'Budsjettlinjen', match: [/budsjettlinje|budsjettbetingelse|mulighetskurve|stigningstall|helning(?:en)? på budsjett|transformasjonsbrøk|\bMTB\b|\bMRT\b/i], skills: ['af.budsjett'], taskType: ['forklaring'], assignment: 'Forklare hva budsjettlinjen viser og hva som bestemmer helningen (timelønnen).', interpretation: ['Budsjettlinjen viser kombinasjonene som er mulige.', 'Helningen er timelønnen (alternativkostnaden for fritid).'], prerequisites: [], misconceptions: ['Blander budsjettlinjen med en indifferenskurve'], variation: [], estMinutes: 4 },
    { id: 'af.indiff', label: 'Indifferenskurver og MSB', match: [/indifferenskurve|substitusjonsbrøk|\bMSB\b|\bMRS\b|preferanse/i], skills: ['af.indiff'], taskType: ['forklaring'], assignment: 'Forklare hva indifferenskurver og MSB viser om preferansene.', interpretation: ['En indifferenskurve viser kombinasjoner med samme nytte; det finnes mange kurver.', 'MSB er helningen: hvor mye konsum man er villig til å ofre for mer fritid, og den varierer langs kurven.', 'MSB er preferanser, ikke priser.'], prerequisites: [], misconceptions: ['Tror hver person har bare én indifferenskurve', 'Tolker MSB som en pris eller lønn'], variation: [], estMinutes: 4 },
  ],
  templates: [
    mcTemplate({ id: 'af-mc', level: 1, name: 'Flervalg: fritid og konsum', description: 'Indifferenskurver, MSB, budsjettlinje og effekter.', title: 'Fritid og konsum', items: AF_MC }),
    tplBudsjett,
    explainTemplate({ id: 'af-forklar', level: 3, name: 'Forklar med ord', description: 'Kortsvar som på eksamen.', title: 'Fritid og konsum: forklar', items: AF_EXPLAIN }),
  ],
  misconceptions: [
    { id: 'en-kurve', label: 'Tror det finnes bare én indifferenskurve', explanation: 'Hver person har uendelig mange; kurver lenger ut gir høyere nytte.' },
    { id: 'msb-pris', label: 'Tolker MSB som en pris', explanation: 'MSB er preferanser (villighet), MTB er muligheter (timelønnen).' },
  ],
  recognize: keywordRecognizer(
    [
      [/indifferenskurve/i, 3],
      [/fritid/i, 1.5],
      [/budsjettlinje|budsjettbetingelse|mulighetskurve|budget constraint/i, 2],
      [/marginale? substitusjonsbrøk|\bMSB\b|\bMRS\b/i, 3],
      [/transformasjonsbrøk|\bMTB\b|\bMRT\b/i, 2],
      [/inntektseffekt|substitusjonseffekt/i, 3],
      [/arbeidsfri inntekt/i, 2],
      [/nyttenivå/i, 1],
      [/timelønn/i, 1],
    ],
    2.5,
    'valg mellom fritid og konsum',
  ),
  explanations: {
    short: () => ({ text: 'Personen velger den kombinasjonen på budsjettlinjen som ligger på høyest mulig indifferenskurve. Der er MSB (hva hen er villig til å ofre) lik timelønnen (hva hen må ofre).', example: 'Med 200 kr timelønn koster én time fritid 200 kr i konsum.' }),
    analogy: { text: 'Fritid har en pris som ikke står på noen prislapp: lønnen du ikke tjener.', limits: 'Analogien forklarer budsjettlinjen, ikke preferansene.' },
    derivationFormulaId: 'f-budsjett',
  },
  solutionStructure: ['Mulighetene (budsjettlinjen)', 'Preferansene (indifferenskurver)', 'Optimum MSB = MTB', 'Effekter av endringer'],
  surfaceFeatures: ['Personer A og B', 'Tall på aksene', 'Lønn vs arbeidsfri inntekt'],
};

// ——— Alternativkostnad og økonomisk gevinst ———

const tplGevinst: TemplateDef = {
  id: 'ak-gevinst',
  version: 1,
  level: 1,
  style: 'standard',
  name: 'Økonomisk gevinst',
  description: 'Nettogevinst av valget minus alternativkostnaden (nettogevinsten av beste alternativ).',
  skills: ['ak.gevinst'],
  build: (rng) => {
    for (let t = 0; t < 200; t++) {
      const timer = pick(rng, [2, 3, 4]);
      const lonn = randInt(rng, 4, 9) * 100;
      const slit = randInt(rng, 1, 3) * 100;
      const gev = randInt(rng, 6, 15) * 100;
      const mental = randInt(rng, 1, 4) * 100;
      const alt = lonn - slit;
      const net = gev - mental;
      const rent = net - alt;
      if (alt <= 0 || net <= 0 || rent === 0) continue;
      const parts: GenPart[] = [
        { id: 'a', label: 'a', prompt: 'Hva er alternativkostnaden ved å hjelpe vennen?', kind: 'beregning', skills: ['ak.gevinst'], math: numMath(), targets: [x('Alternativkostnad', R(alt), ['alternativkostnad', 'alternativkostnaden'], 0)], solution: [step(`${lonn} - ${slit} = ${alt}`, 'Nettogevinsten av beste alternativ (ekstravakten)', 'Alternativkostnaden er nettoverdien av det beste alternativet du lar være: vaktlønnen minus det du setter ubehaget til.', 'definisjon')], hints: { small: 'Hva gir du opp, og hva er det verdt netto?', firstStep: `${lonn} − ${slit}`, stepExplanation: 'Alternativkostnad = verdien av beste alternativ du gir opp.', workedExample: { intro: '', steps: [] } }, methodCheckpoints: [] },
        { id: 'b', label: 'b', prompt: 'Hva er den økonomiske gevinsten (economic rent) ved å hjelpe vennen?', kind: 'beregning', skills: ['ak.gevinst'], math: numMath(), targets: [x('Økonomisk gevinst', R(rent), ['gevinst', 'gevinsten', 'rent'], 0)], solution: [step(`${gev} - ${mental} = ${net}`, 'Nettogevinsten av å hjelpe', '', 'innsetting'), step(`${net} - ${alt} = ${rent}`, 'Minus alternativkostnaden', 'Økonomisk gevinst = nettogevinst av valget minus alternativkostnaden.', 'definisjon')], hints: { small: 'Sammenlikn nettogevinsten ved å hjelpe med alternativkostnaden.', firstStep: `Å hjelpe gir netto ${gev} − ${mental}.`, stepExplanation: 'Er den økonomiske gevinsten positiv, er valget bedre enn beste alternativ.', workedExample: { intro: '', steps: [] } }, methodCheckpoints: [] },
        mcPart(rng, { id: 'lonnsomt', skill: 'ak.gevinst', stem: 'Lønner det seg å hjelpe vennen i dette eksempelet?', correct: rent > 0 ? 'Ja, fordi den økonomiske gevinsten er positiv.' : 'Nei, fordi den økonomiske gevinsten er negativ.', wrong: [rent > 0 ? 'Nei, fordi den økonomiske gevinsten er negativ.' : 'Ja, fordi den økonomiske gevinsten er positiv.', 'Ja, fordi gleden ved å hjelpe er større enn null.', 'Det kan ikke avgjøres uten å vite hvor lenge flyttingen tar.'], why: 'Valget er lønnsomt når gevinsten er større enn alternativkostnaden, altså når den økonomiske gevinsten er positiv.' }, 'c', 'c'),
      ];
      return { title: 'Alternativkostnad og økonomisk gevinst', intro: `En lørdag kan du enten hjelpe en venn med å flytte i ${timer} timer eller ta en ekstravakt på jobben. Vakten gir ${lonn} kroner, men du regner ubehaget ved vakten som en kostnad på ${slit} kroner. Å hjelpe vennen gir deg en glede du setter til ${gev} kroner, mens bæringen er et slit du setter til ${mental} kroner.`, context: 'flytte', parts, params: { lonn: String(lonn), slit: String(slit), gev: String(gev), mental: String(mental) }, skills: ['ak.gevinst'], structureKey: 'ak-gevinst', estMinutes: 6 };
    }
    throw new Error('Fant ikke gyldige tall');
  },
};

const AK_MC: McItem[] = [
  { id: 'def', skill: 'ak.gevinst', stem: 'Hva er alternativkostnaden ved et valg?', correct: 'Verdien av det beste alternativet man gir opp.', wrong: ['Summen av alle kostnadene ved valget.', 'Prisen man betaler i kroner.', 'Verdien av alle alternativene man gir opp.'], why: 'Bare det beste alternativet teller – man kunne uansett bare valgt ett.' },
  { id: 'vaske-bil', skill: 'ak.gevinst', stem: 'Å vaske bilen selv gir deg en nytte du setter til 900 kr, og utstyret koster 150 kr. Hvor høy kan alternativkostnaden ved tiden din være, hvis det fortsatt skal lønne seg å vaske selv?', correct: 'Lavere enn 750 kroner', wrong: ['Lavere enn 150 kroner', 'Lavere enn 1050 kroner', 'Den må være 0 kroner'], why: 'Nettoverdien av å vaske selv er 900 − 150 = 750 kr. Er alternativkostnaden lavere enn det, gir valget en økonomisk gevinst.' },
  { id: 'kveldskurs', skill: 'ak.gevinst', stem: 'Du vurderer et kveldskurs. Det beste alternativet er å gi privattimer for 500 kr, men forberedelsene verdsetter du som en kostnad på 150 kr. Hvor mye må kurset minst være verdt for deg (netto) for å gi en økonomisk gevinst?', correct: 'Mer enn 350 kroner', wrong: ['Mer enn 150 kroner', 'Mer enn 500 kroner', 'Mer enn 650 kroner'], why: 'Alternativkostnaden er nettoverdien av beste alternativ: 500 − 150 = 350 kr. Kurset må gi mer enn det.' },
  { id: 'sykkel', skill: 'ak.gevinst', stem: 'Du kan bruke kvelden på å sykle, se en film eller jobbe. Du velger å sykle. Hva er alternativkostnaden?', correct: 'Verdien av det beste av de to alternativene du valgte bort.', wrong: ['Summen av verdien av å se film og å jobbe.', 'Det sykkelturen koster i penger.', 'Verdien av det dårligste alternativet.'], why: 'Alternativkostnaden er verdien av det beste alternativet man gir opp, ikke summen av alle og ikke bare pengeutlegg.' },
];

export const alternativkostnad: FamilyKB = {
  id: 'alternativkostnad',
  name: 'Alternativkostnad og økonomisk gevinst (economic rent)',
  shortName: 'Alternativkostnad',
  topic: 'Valg og knapphet',
  subtopics: ['Alternativkostnad', 'Økonomisk gevinst'],
  description: 'Å vurdere et valg mot det beste alternativet: alternativkostnad, nettogevinst og økonomisk gevinst.',
  skills: ['ak.gevinst'],
  formulas: [
    {
      id: 'f-gevinst',
      tex: '\\text{Økonomisk gevinst} = (\\text{gevinst} - \\text{kostnad})_{\\text{valget}} - (\\text{gevinst} - \\text{kostnad})_{\\text{beste alternativ}}',
      name: 'Økonomisk gevinst',
      kind: 'definisjon',
      kindWhy: 'Definisjonen: det valget gir, utover det beste alternativet ville gitt.',
      symbols: [{ sym: '(\\ldots)_{\\text{beste alternativ}}', meaning: 'Alternativkostnaden', unit: 'kr' }],
      conditions: ['Alt verdsettes i samme enhet (kroner).'],
      whatIf: ['Positiv gevinst: valget er bedre enn beste alternativ.'],
      calc: {
        inputs: [
          { sym: 'g', label: 'Gevinst av valget (kr)', min: 0, max: 3000, step: 50, value: 1000 },
          { sym: 'c', label: 'Kostnad av valget (kr)', min: 0, max: 2000, step: 50, value: 300 },
          { sym: 'a', label: 'Gevinst av beste alternativ (kr)', min: 0, max: 3000, step: 50, value: 600 },
          { sym: 'd', label: 'Kostnad av beste alternativ (kr)', min: 0, max: 2000, step: 50, value: 200 },
        ],
        compute: (v) => [
          { label: 'Alternativkostnad', value: `${no(R(v.a - v.d))} kr` },
          { label: 'Økonomisk gevinst', value: `${no(R(v.g - v.c - (v.a - v.d)))} kr` },
        ],
      },
    },
  ],
  intents: [
    { id: 'ak.gevinst', label: 'Alternativkostnad og gevinst', match: [/alternativkostnad|opportunity cost|økonomisk gevinst|economic rent|nest beste alternativ/i], skills: ['ak.gevinst'], taskType: ['forklaring', 'beregning'], assignment: 'Definere alternativkostnad og økonomisk gevinst presist, og beregne gevinsten når tall er gitt.', interpretation: ['Alternativkostnad = nettoverdien av det beste valget du lar være.', 'Økonomisk gevinst = nettogevinsten av valget minus alternativkostnaden.', 'Vis hvordan du kommer fram til tallet.'], prerequisites: [], misconceptions: ['Tar med alle alternativer, ikke bare det beste', 'Glemmer kostnadene ved alternativet (f.eks. slit)'], variation: ['Tid mot ekstravakt', 'Gjøre selv eller kjøpe tjenesten', 'Fri mot lønn'], estMinutes: 5 },
  ],
  templates: [tplGevinst, mcTemplate({ id: 'ak-mc', level: 2, name: 'Flervalg: alternativkostnad', description: 'Små regnestykker og begreper.', title: 'Alternativkostnad', items: AK_MC })],
  misconceptions: [{ id: 'alle', label: 'Summerer alle alternativer', explanation: 'Bare det beste alternativet teller.' }],
  recognize: keywordRecognizer(
    [
      [/alternativkostnad|opportunity cost/i, 3],
      [/økonomisk(?:e)? gevinst|economic rent/i, 3],
      [/nest beste alternativ/i, 2],
      [/nettogevinst|nettoverdi(?:en)? av å/i, 1],
      [/beste alternativ(?:et)? (?:man|du) gir opp/i, 3],
    ],
    2.5,
    'alternativkostnad og økonomisk gevinst',
  ),
  explanations: {
    short: () => ({ text: 'Alternativkostnaden er verdien av det beste du gir opp. Et valg gir økonomisk gevinst når det gir mer enn det.', example: 'Studere gir netto 700, jobbe netto 400: gevinsten er 300.' }),
    analogy: { text: 'Hver time kan bare brukes én gang; prisen på timen er det beste du ellers kunne gjort med den.', limits: 'Ikke alt har en tydelig kroneverdi; det må anslås.' },
    derivationFormulaId: 'f-gevinst',
  },
  solutionStructure: ['Nettogevinst av valget', 'Nettogevinst av beste alternativ', 'Differanse'],
  surfaceFeatures: ['Studere, male, ferie'],
};

// ——— Tilbud og etterspørsel (kvalitativ) ———

const MARKED_SHOCKS: ShockItem[] = [
  mks('notter-avling', 'Dårlige avlinger gjør at det produseres færre nøtter, mens etterspørselen er uendret. Markedet er et frikonkurransemarked.', 'Tilbudskurven skifter mot venstre', 'Den øker', 'Den faller', 'Et negativt tilbudssjokk: ved hver pris tilbys mindre. Ny likevekt har høyere pris og lavere mengde.'),
  mks('notter-trend', 'Nøtter blir populære fordi de regnes som sunne, og forbrukerne vil kjøpe mer ved hver pris.', 'Etterspørselskurven skifter mot høyre', 'Den øker', 'Den øker', 'Et positivt etterspørselssjokk: høyere pris og høyere mengde i ny likevekt (tilbudskurven er stigende).'),
  mks('teknologi', 'En ny teknologi gjør det billigere å produsere varen.', 'Tilbudskurven skifter mot høyre', 'Den faller', 'Den øker', 'Lavere marginalkostnader betyr at mer tilbys ved hver pris. Prisen faller og mengden øker.'),
  mks('substitutt', 'Prisen på et nært substitutt stiger kraftig.', 'Etterspørselskurven skifter mot høyre', 'Den øker', 'Den øker', 'Når substituttet blir dyrere, vil flere kjøpe denne varen ved hver pris. Etterspørselen skifter ut.'),
  mks('inntekt-fall', 'Husholdningenes inntekter faller, og varen er et normalt gode.', 'Etterspørselskurven skifter mot venstre', 'Den faller', 'Den faller', 'Lavere inntekt gir lavere etterspørsel etter normale goder ved hver pris. Pris og mengde faller.'),
  mks('toll', 'Det innføres en toll på en innsatsfaktor, slik at produsentenes marginalkostnad øker ved ethvert produksjonsnivå.', 'Tilbudskurven skifter mot venstre', 'Den øker', 'Den faller', 'Høyere marginalkostnad skifter tilbudet opp/til venstre. Prisen øker (mindre enn kostnadsøkningen), og mengden faller.'),
];

function mks(id: string, scenario: string, curve: string, pris: string, mengde: string, why: string): ShockItem {
  const curves = ['Etterspørselskurven skifter mot høyre', 'Etterspørselskurven skifter mot venstre', 'Tilbudskurven skifter mot høyre', 'Tilbudskurven skifter mot venstre'];
  const eff = ['Den øker', 'Den faller', 'Den er uendret', 'Den kan både øke og falle'];
  return {
    id,
    scenario,
    questions: [
      { skill: 'marked.skift', stem: 'Hvilken kurve skifter, og hvilken vei?', correct: curve, wrong: curves.filter((c) => c !== curve), why },
      { skill: 'marked.skift', stem: 'Hva skjer med likevektsprisen?', correct: pris, wrong: eff.filter((c) => c !== pris), why },
      { skill: 'marked.skift', stem: 'Hva skjer med omsatt mengde?', correct: mengde, wrong: eff.filter((c) => c !== mengde), why },
    ],
    explain: {
      skills: ['marked.skift'],
      prompt: 'Forklar kort hva som skjer i markedet, med begrepene skift i kurven og ny likevekt.',
      rubric: [[`Sier at ${curve.toLowerCase()} og hvorfor.`, true], ['Beskriver ny likevekt: hva skjer med pris og mengde.', true], ['Skiller mellom skift i en kurve og bevegelse langs den andre.', false]],
      model: why,
      hints: { small: 'Påvirker endringen kjøperne (etterspørsel) eller selgerne (tilbud)?', firstStep: 'Spør: endres mengden ved hver pris for kjøperne eller for selgerne?', why: 'En endring i prisen på varen selv gir bevegelse langs kurvene, ikke skift.' },
    },
  };
}

const MARKED_MC: McItem[] = [
  { id: 'langs', skill: 'marked.skift', stem: 'Hvilken hendelse gir en bevegelse langs etterspørselskurven for kaffe, og ikke et skift i kurven?', correct: 'Kaffeprisen stiger, og folk kjøper mindre kaffe.', wrong: ['Te blir billigere, og folk kjøper mindre kaffe.', 'Inntektene øker, og folk kjøper mer kaffe.', 'En helsestudie gjør kaffe mer populært.'], why: 'Bare en endring i varens egen pris gir bevegelse langs kurven. Priser på andre varer, inntekt og smak flytter kurven.' },
  { id: 'bensin', skill: 'marked.skift', stem: 'Bensinprisen stiger kraftig. Hvilken påstand er riktig?', correct: 'Etterspørselskurven for elbiler skifter utover.', wrong: ['Etterspørselskurven for bensin skifter innover.', 'Tilbudskurven for bensin skifter utover.', 'Etterspørselen etter elbiler faller, fordi alt blir dyrere.'], why: 'For elbiler er bensinprisen prisen på et substitutt, så etterspørselskurven flyttes ut. For bensin selv er det en bevegelse langs kurven.' },
  { id: 'sesong', skill: 'marked.helning', stem: 'Etterspørselen etter hotellrom i en liten by dobles under en festival. Hvorfor stiger prisene mye?', correct: 'Fordi antall rom er nesten fast på kort sikt, så tilbudskurven er bratt og økningen i etterspørselen slår ut i prisen.', wrong: ['Fordi hotellene får høyere kostnader per rom under festivalen.', 'Fordi etterspørselskurven blir brattere når flere vil ha rom.', 'Fordi høyere pris alltid øker tilbudt mengde like mye som etterspørselen.'], why: 'Når tilbudet er lite elastisk på kort sikt, gir et skift i etterspørselen stort prisutslag og liten endring i mengden.' },
  { id: 'avgift', skill: 'marked.helning', stem: 'En avgift legges på en vare i et frikonkurransemarked. Når vil konsumentprisen øke minst?', correct: 'Når etterspørselen er svært prisfølsom (flat etterspørselskurve).', wrong: ['Når etterspørselen er lite prisfølsom (bratt etterspørselskurve).', 'Prisen øker alltid like mye som avgiften.', 'Når tilbudskurven er flat.'], why: 'Med flat etterspørsel faller mengden mye ved høyere pris, så produsentene må ta mesteparten av avgiften.' },
  { id: 'frikonkurranse', skill: 'marked.frikonkurranse', stem: 'En av 400 epleprodusenter vurderer å sette opp prisen med 10 prosent. Hva skjer ifølge frikonkurransemodellen?', correct: 'Den mister i praksis alle kundene, fordi de kan kjøpe den samme varen til markedsprisen hos andre.', wrong: ['Den tjener mer, fordi etterspørselen etter epler er lite prisfølsom.', 'De andre produsentene følger etter, så markedsprisen stiger med 10 prosent.', 'Ingenting skjer, fordi myndighetene fastsetter prisen.'], why: 'En pristaker er så liten at den ikke kan påvirke markedsprisen. Etterspørselen den enkelte bedriften møter, er i praksis vannrett.' },
  { id: 'mc-p', skill: 'marked.frikonkurranse', stem: 'Hvorfor produserer en bedrift i frikonkurranse der marginalkostnaden er lik prisen?', correct: 'Er prisen høyere enn MC, øker profitten ved å produsere mer; er den lavere, øker profitten ved å produsere mindre.', wrong: ['Fordi staten krever at prisen skal være lik kostnaden.', 'Fordi gjennomsnittskostnaden da er lavest.', 'Fordi bedriften da selger mest mulig.'], why: 'Siste enhet gir inntekt lik prisen og kostnad lik MC. Profitten er høyest når de er like.' },
  { id: 'vertikal', skill: 'marked.helning', stem: 'Et konsertlokale har 2000 plasser, og alle billettene blir solgt. Så øker etterspørselen. Hva skjer i en modell med tilbud og etterspørsel?', correct: 'Prisen stiger, men omsatt mengde er den samme, fordi tilbudskurven er loddrett.', wrong: ['Både pris og mengde øker like mye.', 'Mengden øker, men prisen er den samme.', 'Prisen faller, fordi flere vil ha billetter.'], why: 'Når tilbudt mengde er fast, er tilbudskurven loddrett. Et skift i etterspørselen slår da bare ut i prisen.' },
  { id: 'dodvekt', skill: 'marked.frikonkurranse', stem: 'Myndighetene innfører et pristak under likevektsprisen på utleieboliger. Hva skjer med det samlede overskuddet?', correct: 'Det blir mindre, fordi det leies ut færre boliger enn i likevekt, og noen gunstige avtaler blir ikke inngått.', wrong: ['Det blir større, fordi leietakerne betaler mindre.', 'Det er uendret; det flyttes bare fra utleiere til leietakere.', 'Det blir større, fordi flere boliger blir leid ut.'], why: 'Lavere pris gir lavere tilbudt mengde. Avtaler der betalingsviljen er høyere enn kostnaden, faller bort, og det gir et dødvektstap.' },
];

const MARKED_EXPLAIN: ExplainItem[] = [
  { id: 'prishopp', skills: ['marked.skift'], prompt: 'Prisen på avokado har steget kraftig på kort tid, i et marked med mange kjøpere og selgere. Forklar hvilke typer hendelser som kan ligge bak.', rubric: [['Tilbudet kan ha falt (tilbudskurven skifter mot venstre), for eksempel på grunn av tørke eller høyere transportkostnader.', true], ['Etterspørselen kan ha økt (etterspørselskurven skifter mot høyre), for eksempel fordi avokado har blitt mer populært eller inntektene har økt.', true], ['Begge deler kan skje samtidig og gi et ekstra stort prisutslag; utslaget er størst når kurvene er bratte.', false]], model: 'En kraftig prisøkning kommer av at tilbudskurven har skiftet mot venstre, at etterspørselskurven har skiftet mot høyre, eller begge deler. Tørke eller dyrere frakt reduserer tilbudet ved hver pris. Større popularitet eller høyere inntekter øker etterspørselen ved hver pris. Er tilbudet lite følsomt for pris på kort sikt, blir prisutslaget ekstra stort.', hints: { small: 'Hvilke to kurver kan skifte?', firstStep: 'Gi ett eksempel på hver side av markedet.', why: 'Pris kan øke både ved mindre tilbud og ved mer etterspørsel.' } },
  { id: 'tilbud-mc', skills: ['marked.frikonkurranse'], prompt: 'Hvorfor kan vi lese tilbudskurven i et marked med mange små bedrifter som bedriftenes marginalkostnad?', rubric: [['Hver bedrift er pristaker og produserer så lenge prisen minst dekker kostnaden ved én enhet til.', true], ['Bedriften velger derfor mengden der pris = marginalkostnad; summert over bedriftene gir det tilbudskurven.', true]], model: 'En pristaker tar markedsprisen som gitt. Den øker produksjonen så lenge en ekstra enhet gir minst like mye i inntekt (prisen) som den koster (MC). Mengden velges derfor der P = MC. For hver pris kan vi lese av hvor mye som tilbys, og kurven vi får, er marginalkostnaden summert over alle bedriftene.', hints: { small: 'Når lønner det seg å lage én enhet til?', firstStep: 'Sammenlikn prisen med kostnaden ved én enhet til.', why: 'P = MC gir tilbudskurven.' } },
  { id: 'sesong', skills: ['marked.helning'], prompt: 'Flybilletter i fellesferien blir mye dyrere når etterspørselen øker, mens prisen på brød knapt endres når folk kjøper mer brød til jul. Forklar forskjellen med tilbud og etterspørsel.', rubric: [['Hvor mye prisen endres når etterspørselen øker, avhenger av hvor bratt tilbudskurven er.', true], ['Flybilletter: antall seter er nesten fast på kort sikt (bratt tilbudskurve), så økt etterspørsel gir stor prisøkning.', true], ['Brød: produksjonen kan økes lett (slak tilbudskurve), så mengden øker og prisen endres lite.', true]], model: 'Et skift i etterspørselen gir ulikt prisutslag avhengig av tilbudskurven. Flyselskapene kan ikke øke antall seter mye på kort sikt, så tilbudskurven er bratt og økt etterspørsel gir høyere pris. Bakeriene kan lett bake mer, så tilbudskurven er slak: mengden øker, og prisen endres lite.', hints: { small: 'Se på tilbudssiden, ikke på kundene.', firstStep: 'Hvor lett er det å øke produksjonen i hvert marked?', why: 'Slak tilbudskurve gir små prisutslag.' } },
];

export const markedKvalitativ: FamilyKB = {
  id: 'marked-frikonkurranse',
  name: 'Tilbud og etterspørsel i frikonkurranse: skift, helning og overskudd',
  shortName: 'Tilbud og etterspørsel',
  topic: 'Markeder',
  subtopics: ['Skift og bevegelse langs kurven', 'Helning og prisutslag', 'Frikonkurranse og MC = P', 'Avgift, toll og overskudd'],
  description: 'Hvordan pris og mengde bestemmes i frikonkurranse, hva som skifter kurvene, og hvordan helningen avgjør hvor mye prisen endres.',
  skills: ['marked.skift', 'marked.helning', 'marked.frikonkurranse'],
  formulas: [
    {
      id: 'f-mcp',
      tex: 'MC(Q) = P',
      name: 'Profittmaksimering for en pristaker',
      kind: 'avledet sammenheng',
      kindWhy: 'Følger av at siste enhet gir inntekt P og kostnad MC; profitten er størst når de er like.',
      symbols: [
        { sym: 'MC', meaning: 'Marginalkostnad', unit: 'kr per enhet' },
        { sym: 'P', meaning: 'Markedsprisen (gitt for bedriften)', unit: 'kr per enhet' },
      ],
      conditions: ['Frikonkurranse: bedriften er pristaker.'],
      whatIf: ['Toll eller avgift øker MC: tilbudet skifter opp.'],
      calc: {
        inputs: [
          { sym: 'P', label: 'Markedspris', min: 10, max: 200, step: 1, value: 80 },
          { sym: 't', label: 'Kostnadsøkning (toll) i %', min: 0, max: 50, step: 1, value: 15 },
        ],
        compute: (v) => [
          { label: 'MC i opprinnelig optimum', value: `${no(R(v.P))}` },
          { label: 'Ny MC ved samme mengde', value: `${no(R(v.P).mul(R(100 + v.t)).div(R(100)), 2)}` },
          { label: 'Tolkning', value: v.t > 0 ? 'MC > P: bedriften reduserer produksjonen' : 'Uendret' },
        ],
      },
    },
  ],
  intents: [
    { id: 'marked.skift', specific: true, label: 'Skift og ny likevekt', match: [/skift|forskyv|årsak(?:er)? til prishopp|prishopp|prisoppgang|prisøkning|selger mer|bevegelse langs/i], skills: ['marked.skift'], taskType: ['forklaring'], assignment: 'Forklare hvilke skift i tilbud eller etterspørsel som kan gi endringen, og hva som skjer med pris og mengde.', interpretation: ['Skill mellom skift i kurven og bevegelse langs kurven.', 'Vurder både tilbuds- og etterspørselssiden; flere årsaker kan virke samtidig.', 'Høyere pris betyr ikke nødvendigvis høyere mengde (tilbudssjokk).'], prerequisites: ['Tilbud og etterspørsel'], misconceptions: ['Tror høyere pris alltid gir høyere solgt mengde', 'Kaller en prisendring for et skift i kurven'], variation: ['Tømmer, nøtter, strøm', 'Tilbud eller etterspørselssjokk'], estMinutes: 6 },
    { id: 'marked.helning', specific: true, label: 'Helning og prisutslag', match: [/sesong|bratt|helning|elastisk|hvor mye (?:slike )?avgifter|hvor stor(?:e)? endring/i], skills: ['marked.helning'], taskType: ['forklaring'], assignment: 'Forklare hvordan helningen på kurvene avgjør hvor mye prisen endres.', interpretation: ['Flat tilbudskurve (elastisk tilbud): små prisutslag ved skift i etterspørselen.', 'Ved avgift: flat etterspørsel gir liten økning i konsumentprisen.', 'Koble gjerne tilbudskurvens helning til marginalkostnadene.'], prerequisites: ['Tilbud og etterspørsel'], misconceptions: ['Tror prisen alltid øker like mye som avgiften', 'Forklarer med forbrukerne når spørsmålet gjelder tilbudssiden'], variation: ['Sesong', 'Avgift/toll'], estMinutes: 6 },
    { id: 'marked.frikonkurranse', label: 'Frikonkurranse og MC = P', match: [/frikonkurranse|competitive market|pristaker|price taker|marginalkostnad|tilbudskurve/i], skills: ['marked.frikonkurranse'], taskType: ['forklaring'], assignment: 'Forklare kjennetegn ved frikonkurranse, hvorfor bedriften produserer der MC = P, og at tilbudskurven viser marginalkostnaden.', interpretation: ['Mange kjøpere og selgere som er pristakere, like produkter, god informasjon.', 'Profitt maksimeres ved MC = P.', 'Tilbudskurven er marginalkostnadskurven.'], prerequisites: [], misconceptions: ['Tror bedriften velger prisen'], variation: [], estMinutes: 5 },
  ],
  templates: [
    shockTemplate({ id: 'marked-sjokk', level: 2, name: 'Hva skjer i markedet?', description: 'Et sjokk: hvilken kurve skifter, og hva skjer med pris og mengde?', title: 'Skift i tilbud og etterspørsel', items: MARKED_SHOCKS }),
    mcTemplate({ id: 'marked-mc', level: 1, name: 'Flervalg: tilbud og etterspørsel', description: 'Skift, helning, pristaker og overskudd.', title: 'Tilbud og etterspørsel', items: MARKED_MC }),
    explainTemplate({ id: 'marked-forklar', level: 3, name: 'Forklar som på eksamen', description: 'Kortsvar og Del 3-spørsmål.', title: 'Tilbud og etterspørsel: forklar', items: MARKED_EXPLAIN }),
  ],
  misconceptions: [
    { id: 'pris-mengde', label: 'Høyere pris betyr solgt mer', explanation: 'Ved et tilbudssjokk øker prisen mens mengden faller.' },
    { id: 'skift-langs', label: 'Blander skift og bevegelse langs kurven', explanation: 'Endring i varens egen pris er bevegelse langs kurven.' },
  ],
  recognize: keywordRecognizer(
    [
      [/tilbudskurve/i, 2],
      [/etterspørselskurve/i, 2],
      [/frikonkurranse|competitive market|konkurranseutsatt marked|sterk konkurranse/i, 2],
      [/pristaker|price taker/i, 2],
      [/likevektspris/i, 1.5],
      [/sesong/i, 1.2],
      [/skift|forskyv/i, 0.8],
      [/tilbudsoverskudd|etterspørselsoverskudd|konsumentoverskudd|produsentoverskudd|dødvektstap|samfunnsøkonomisk(?:e)? overskudd/i, 1.5],
      [/marginalkostnad/i, 1],
      [/avgift/i, 0.8],
      [/\btoll/i, 1.2],
      [/\bMC\b/, 1],
      [/dødvektstap/i, 1],
    ],
    2,
    'tilbud og etterspørsel i frikonkurranse',
  ),
  explanations: {
    short: () => ({ text: 'Prisen bestemmes der tilbud og etterspørsel møtes. Endringer i andre forhold enn varens pris skifter kurvene; helningen avgjør hvor mye prisen endres.', example: 'Dårlig avling: tilbudet skifter til venstre, prisen stiger og mengden faller.' }),
    analogy: { text: 'Markedet er en vektskål: skift i én side flytter balansepunktet, og hvor stivt den andre siden er, avgjør om det er prisen eller mengden som flytter seg mest.', limits: 'Analogien sier ikke noe om overskudd og effektivitet.' },
    derivationFormulaId: 'f-mcp',
  },
  solutionStructure: ['Hvilken side påvirkes', 'Skift eller bevegelse', 'Ny likevekt', 'Helningens betydning'],
  surfaceFeatures: ['Vare (nøtter, tømmer, strøm, iskrem)', 'Sjokkets type'],
};

// ——— Teknologi og isokost ———

const tplIsokost: TemplateDef = {
  id: 'tek-isokost',
  version: 1,
  level: 1,
  style: 'standard',
  name: 'Velg billigste teknologi',
  description: 'Kostnad = lønn · arbeid + pris · kapital for to teknologier.',
  skills: ['tek.isokost'],
  build: (rng) => {
    for (let t = 0; t < 300; t++) {
      const LA = randInt(rng, 1, 5);
      const KA = randInt(rng, 5, 10);
      const LB = randInt(rng, 6, 10);
      const KB = randInt(rng, 1, 4);
      const w = randInt(rng, 5, 30) * 10;
      const r = randInt(rng, 5, 30) * 10;
      const cA = LA * w + KA * r;
      const cB = LB * w + KB * r;
      if (cA === cB) continue;
      const cheap = cA < cB ? 'A' : 'B';
      const parts: GenPart[] = [
        { id: 'a', label: 'a', prompt: 'Hva koster det å produsere med teknologi A?', kind: 'beregning', skills: ['tek.isokost'], math: numMath(), targets: [x('Kostnad med A', R(cA), ['kostnad', 'a'], 0)], solution: [step(`${LA} \\cdot ${w} + ${KA} \\cdot ${r} = ${cA}`, 'Arbeid · lønn + kapital · pris', '', 'innsetting')], hints: { small: 'Hver innsatsfaktor har sin pris.', firstStep: `${LA} · ${w} + ${KA} · ${r}`, stepExplanation: 'Kostnad = w·L + r·K.', workedExample: { intro: '', steps: [] } }, methodCheckpoints: [] },
        { id: 'b', label: 'b', prompt: 'Hva koster det med teknologi B?', kind: 'beregning', skills: ['tek.isokost'], math: numMath(), targets: [x('Kostnad med B', R(cB), ['kostnad', 'b'], 0)], solution: [step(`${LB} \\cdot ${w} + ${KB} \\cdot ${r} = ${cB}`, '', '', 'innsetting')], hints: { small: 'Samme regel.', firstStep: `${LB} · ${w} + ${KB} · ${r}`, stepExplanation: '', workedExample: { intro: '', steps: [] } }, methodCheckpoints: [] },
        mcPart(rng, { id: 'valg', skill: 'tek.isokost', stem: 'Hvilken teknologi velger en kostnadsminimerende bedrift, og hva kan endre valget?', correct: `Teknologi ${cheap}; valget kan endres hvis de relative prisene på arbeid og kapital endres.`, wrong: [`Teknologi ${cheap === 'A' ? 'B' : 'A'}, fordi den bruker mest av den billigste innsatsfaktoren.`, `Teknologi ${cheap}, og valget endres aldri fordi teknologien er gitt.`, 'Begge er like gode fordi de produserer det samme.'], why: 'Bedriften velger teknologien med lavest kostnad ved dagens priser. Endres forholdet w/r (isokostlinjens helning), kan en annen teknologi bli billigst.' }, 'c', 'c'),
      ];
      return { title: 'Teknologivalg', intro: `To teknologier produserer samme mengde. Teknologi A bruker ${LA} arbeidere og ${KA} enheter kapital. Teknologi B bruker ${LB} arbeidere og ${KB} enheter kapital. Lønnen er ${w} kr per arbeider og prisen på kapital er ${r} kr per enhet.`, context: 'teknologi', parts, params: { LA: String(LA), KA: String(KA), LB: String(LB), KB: String(KB), w: String(w), r: String(r) }, skills: ['tek.isokost'], structureKey: 'tek-isokost', estMinutes: 6 };
    }
    throw new Error('Fant ikke gyldige tall');
  },
};

const TEK_MC: McItem[] = [
  { id: 'tek-def', skill: 'tek.isokost', stem: 'To bakerier lager like mange brød per dag. Det ene bruker 4 bakere og én stor ovn, det andre 8 bakere og to små ovner. Hvordan beskriver en økonom dette?', correct: 'De bruker to ulike teknologier: to ulike kombinasjoner av arbeidskraft og kapital som gir samme produksjon.', wrong: ['Det første bakeriet har mer teknologi, fordi ovnen er større.', 'Det andre bakeriet bruker ingen teknologi, fordi det er arbeidsintensivt.', 'De bruker samme teknologi, fordi produktet er det samme.'], why: 'I økonomisk forstand er en teknologi en oppskrift: hvor mye av hver innsatsfaktor som gir en bestemt produksjon.' },
  { id: 'helning', skill: 'tek.isokost', stem: 'Hva bestemmer helningen på en isokostlinje (arbeid vannrett, kapital loddrett)?', correct: 'Forholdet mellom lønnen og prisen på kapital (de relative innsatsfaktorprisene).', wrong: ['Hvor mye bedriften produserer.', 'Hvor mange arbeidere bedriften har.', 'Bedriftens profitt.'], why: 'Isokost: w·L + r·K = konstant, så helningen er −w/r.' },
  { id: 'robot', skill: 'tek.isokost', stem: 'Hvorfor kan en melkerobot lønne seg for gårder i ett land, men ikke i et annet?', correct: 'Fordi forholdet mellom lønn og kapitalkostnad er ulikt: der arbeidskraft er dyr i forhold til maskiner, er den kapitalintensive teknologien billigst.', wrong: ['Fordi roboter alltid er billigere enn arbeidskraft.', 'Fordi bøndene i noen land er mindre flinke.', 'Fordi melk er lik overalt.'], why: 'Isokostlinjens helning (lønn delt på kapitalkostnad) avgjør hvilken teknologi som gir lavest kostnad.' },
  { id: 'dominert', skill: 'tek.isokost', stem: 'Teknologi B bruker mer av både arbeid og kapital enn teknologi A for samme produksjon. Hva kan vi si?', correct: 'B er dominert av A og vil aldri bli valgt, uansett priser.', wrong: ['B blir valgt når lønnen er høy.', 'B blir valgt når kapital er billig.', 'Vi må kjenne prisene for å vite.'], why: 'Bruker B mer av alt, er den dyrere ved alle positive priser.' },
  { id: 'gjsnitt', skill: 'tek.produkt', stem: 'Et fiskebruk ansetter flere arbeidere, men har like mange filetmaskiner. Hver ny arbeider øker produksjonen, men mindre enn den forrige. Hvilket utsagn stemmer ikke?', correct: 'Produksjonen per arbeider stiger når flere blir ansatt.', wrong: ['Samlet produksjon øker med flere arbeidere.', 'Grenseproduktet til den siste arbeideren er lavere enn til den første.', 'Dobles antall arbeidere, blir produksjonen mindre enn doblet.'], why: 'Med avtagende grenseprodukt faller produksjonen per arbeider når flere deler på de samme maskinene.' },
];

export const teknologi: FamilyKB = {
  id: 'teknologi-isokost',
  name: 'Teknologivalg, isokostlinjer og produktfunksjon',
  shortName: 'Teknologi og isokost',
  topic: 'Bedrifter og teknologi',
  subtopics: ['Isokostlinjer', 'Relative priser', 'Produktfunksjon og gjennomsnittsprodukt'],
  description: 'Hvordan bedrifter velger teknologi ut fra relative innsatsfaktorpriser, og hvordan produksjonen avhenger av innsats.',
  skills: ['tek.isokost', 'tek.produkt'],
  formulas: [
    {
      id: 'f-isokost',
      tex: 'wL + rK = \\bar{C} \\quad\\Rightarrow\\quad K = \\frac{\\bar{C}}{r} - \\frac{w}{r}\\,L',
      name: 'Isokostlinjen',
      kind: 'definisjon',
      kindWhy: 'Alle kombinasjoner av arbeid og kapital som koster det samme.',
      symbols: [
        { sym: 'w', meaning: 'Lønn per arbeider', unit: 'kr' },
        { sym: 'r', meaning: 'Pris på kapital', unit: 'kr' },
        { sym: 'L, K', meaning: 'Arbeid og kapital', unit: 'enheter' },
      ],
      conditions: [],
      whatIf: ['Høyere w/r: brattere isokostlinje, mer kapitalintensiv teknologi blir billigst.'],
      calc: {
        inputs: [
          { sym: 'w', label: 'Lønn (w)', min: 10, max: 400, step: 10, value: 100 },
          { sym: 'r', label: 'Pris på kapital (r)', min: 10, max: 400, step: 10, value: 100 },
          { sym: 'LA', label: 'Arbeid i A', min: 0, max: 10, step: 1, value: 3 },
          { sym: 'KA', label: 'Kapital i A', min: 0, max: 10, step: 1, value: 6 },
          { sym: 'LB', label: 'Arbeid i B', min: 0, max: 10, step: 1, value: 7 },
          { sym: 'KB', label: 'Kapital i B', min: 0, max: 10, step: 1, value: 2 },
        ],
        compute: (v) => {
          const a = v.LA * v.w + v.KA * v.r;
          const b = v.LB * v.w + v.KB * v.r;
          return [
            { label: 'Kostnad A', value: `${no(R(a))} kr` },
            { label: 'Kostnad B', value: `${no(R(b))} kr` },
            { label: 'Billigst', value: a === b ? 'Like dyre' : a < b ? 'Teknologi A' : 'Teknologi B' },
            { label: 'Helning på isokostlinjen (−w/r)', value: `−${no(R(v.w).div(R(v.r)), 2)}` },
          ];
        },
      },
    },
  ],
  intents: [
    { id: 'tek.isokost', label: 'Teknologivalg', match: [/isokost|teknologi|innsatsfaktor|robot/i], skills: ['tek.isokost'], taskType: ['forklaring'], assignment: 'Bruke isokostlinjer og relative innsatsfaktorpriser til å forklare hvilken teknologi som velges.', interpretation: ['Isokostlinjens helning er −w/r.', 'Bedriften velger teknologien på den laveste isokostlinjen.', 'Endrede relative priser kan endre valget.'], prerequisites: [], misconceptions: ['Tror den nyeste teknologien alltid velges'], variation: ['Figur med punkter', 'Roboter mellom land'], estMinutes: 5 },
    { id: 'tek.produkt', label: 'Produktfunksjon', match: [/produktfunksjon|produksjonsfunksjon|gjennomsnittsprodu/i], skills: ['tek.produkt'], taskType: ['tolkning'], assignment: 'Lese av en produktfunksjon og regne gjennomsnittsprodukt.', interpretation: ['Gjennomsnittsprodukt = produksjon / innsats.', 'Avtagende utbytte: hver ny arbeider gir mindre ekstra.'], prerequisites: [], misconceptions: ['Blander gjennomsnitts- og marginalprodukt'], variation: [], estMinutes: 4 },
  ],
  templates: [tplIsokost, mcTemplate({ id: 'tek-mc', level: 1, name: 'Flervalg: teknologi og isokost', description: 'Begreper og figurtolkning.', title: 'Teknologi og isokost', items: TEK_MC })],
  misconceptions: [{ id: 'nyest', label: 'Tror nyeste teknologi alltid er best', explanation: 'Det avhenger av relative priser.' }],
  recognize: keywordRecognizer(
    [
      [/isokost/i, 3],
      [/teknologi/i, 1.3],
      [/innsatsfaktor/i, 1.5],
      [/produktfunksjon|produksjonsfunksjon/i, 2.5],
      [/gjennomsnittsprodu/i, 2],
      [/robot|arbeidsbesparende/i, 1],
      [/relative? pris/i, 0.8],
      [/produksjon per arbeider|gjennomsnittlig produksjon/i, 2],
    ],
    2,
    'teknologivalg og isokostlinjer',
  ),
  explanations: {
    short: () => ({ text: 'Bedriften velger teknologien som er billigst ved dagens lønn og kapitalpris. Isokostlinjens helning er forholdet mellom dem.', example: 'Høy lønn og billig kapital: kapitalintensiv teknologi (roboter) blir billigst.' }),
    analogy: { text: 'Som å velge oppskrift når prisene på ingrediensene endrer seg.', limits: 'Sier ikke noe om innovasjon.' },
    derivationFormulaId: 'f-isokost',
  },
  solutionStructure: ['Kostnad per teknologi', 'Sammenlikne', 'Relative priser'],
  surfaceFeatures: ['Kull/tekstil/strøm', 'Tall i figuren'],
};

// ——— Prinsipal–agent ———

const PA_MC: McItem[] = [
  { id: 'ufullstendig', skill: 'pa.kontrakt', stem: 'En butikkjede ansetter en ny butikksjef. Hvorfor sier vi at arbeidskontrakten er ufullstendig?', correct: 'Fordi innsatsen og mange av beslutningene til butikksjefen ikke kan beskrives og håndheves i kontrakten.', wrong: ['Fordi kontrakten ikke er signert av begge parter.', 'Fordi lønnen ikke er avtalt på forhånd.', 'Fordi butikksjefen eier en del av butikken.'], why: 'En kontrakt er ufullstendig når viktige forhold, som innsats, ikke kan observeres eller skrives inn slik at de kan håndheves.' },
  { id: 'aksjonar', skill: 'pa.kontrakt', stem: 'Hva kan aksjonærene gjøre for å få ledelsen til å ta beslutninger aksjonærene er tjent med?', correct: 'Knytte lederlønnen til aksjekursen, og la styret overvåke ledelsen og kunne si opp daglig leder.', wrong: ['Gi ledelsen fast lønn uansett resultat.', 'Selge aksjene sine.', 'Kreve at alle beslutninger står i arbeidskontrakten.'], why: 'Insentiver (resultatavhengig lønn) og overvåking er de to hovedverktøyene.' },
  { id: 'asymmetrisk', skill: 'pa.kontrakt', stem: 'Hva er asymmetrisk informasjon?', correct: 'At den ene parten i en avtale vet noe relevant som den andre ikke vet.', wrong: ['At begge parter har lik informasjon.', 'At informasjonen er feil.', 'At informasjon koster penger.'], why: 'F.eks. vet den ansatte mer om egen innsats enn eieren.' },
];

const PA_EXPLAIN: ExplainItem[] = [
  { id: 'eiere-ansatte', skills: ['pa.kontrakt'], prompt: 'En eiendomsmegler får fast lønn uansett hvor mange boliger hun selger. Forklar hvilket problem dette kan skape for eieren av meglerforetaket, og hva eieren kan gjøre med det.', rubric: [['Beskriver forholdet som prinsipal (eieren) og agent (megleren) med ulike mål.', true], ['Innsats er vanskelig å observere (asymmetrisk informasjon) og kan ikke skrives inn i kontrakten (ufullstendig kontrakt).', true], ['Nevner et virkemiddel, for eksempel provisjon eller bonus, tettere oppfølging, eller lønn over reservasjonslønnen.', true]], model: 'Eieren (prinsipalen) vil at megleren (agenten) skal jobbe hardt for å selge, men megleren bærer selv kostnaden ved innsatsen og får samme lønn uansett. Eieren ser ikke hvor hardt megleren jobber (asymmetrisk informasjon), og innsats kan ikke avtales i kontrakten (ufullstendig kontrakt). Eieren kan knytte deler av lønnen til salg, følge opp arbeidet tettere eller betale mer enn reservasjonslønnen slik at jobben blir verdt å beholde.', hints: { small: 'Hvem vet hva om innsatsen?', firstStep: 'Bruk begrepene prinsipal, agent, asymmetrisk informasjon og ufullstendig kontrakt.', why: 'Dette er kjernen i prinsipal–agent-problemet.' } },
];

export const prinsipalAgent: FamilyKB = {
  id: 'prinsipal-agent',
  name: 'Eiere, ledere og ansatte: prinsipal–agent og ufullstendige kontrakter',
  shortName: 'Prinsipal–agent',
  topic: 'Bedrifter og kontrakter',
  subtopics: ['Asymmetrisk informasjon', 'Ufullstendige kontrakter', 'Insentiver og overvåking'],
  description: 'Hvorfor eiere ikke fullt ut kan styre ledere og ansatte, og hvilke verktøy de har (insentiver og overvåking).',
  skills: ['pa.kontrakt'],
  formulas: [],
  intents: [{ id: 'pa.kontrakt', label: 'Prinsipal–agent', match: [/prinsipal|agent|asymmetrisk|ufullstendig|aksjonær|eierne|insentiv/i], skills: ['pa.kontrakt'], taskType: ['forklaring'], assignment: 'Forklare prinsipal–agent-problemet med asymmetrisk informasjon og ufullstendige kontrakter, og hvilke verktøy eierne har.', interpretation: ['Bruk begrepene prinsipal, agent, asymmetrisk informasjon og ufullstendig kontrakt.', 'Nevn insentiver (resultatavhengig lønn) og overvåking (styret).'], prerequisites: [], misconceptions: ['Tror en detaljert kontrakt løser problemet'], variation: ['Aksjonærer og ledere', 'Eiere og ansatte'], estMinutes: 5 }],
  templates: [mcTemplate({ id: 'pa-mc', level: 1, name: 'Flervalg: prinsipal–agent', description: 'Begreper.', title: 'Prinsipal–agent', items: PA_MC }), explainTemplate({ id: 'pa-forklar', level: 3, name: 'Forklar som på eksamen', description: 'Kortsvar.', title: 'Prinsipal–agent: forklar', items: PA_EXPLAIN })],
  misconceptions: [],
  recognize: keywordRecognizer(
    [
      [/prinsipal|principal[- ]agent/i, 3],
      [/asymmetrisk informasjon/i, 2],
      [/ufullstendig(?:e)? kontrakt/i, 2],
      [/aksjonær/i, 1.5],
      [/insentiv/i, 0.8],
      [/overvåk/i, 0.8],
      [/skille mellom eierne/i, 2],
    ],
    2.5,
    'prinsipal–agent og kontrakter',
  ),
  explanations: { short: () => ({ text: 'Eieren (prinsipalen) vil ha innsats, men kan ikke se eller kontraktsfeste den. Løsningen er insentiver og overvåking.', example: 'Lederlønn knyttet til aksjekursen.' }), analogy: { text: 'Som å leie en håndverker du ikke kan følge med på hele dagen.', limits: 'Sier ikke noe om hvor mye overvåking koster.' }, derivationFormulaId: '' },
  solutionStructure: ['Hvem er prinsipal og agent', 'Hvorfor informasjonen er skjev', 'Insentiver og overvåking'],
  surfaceFeatures: ['Aksjonærer/ledere eller eiere/ansatte'],
};

// ——— Kapitalisme og ulikhet ———

const KAP_MC: McItem[] = [
  { id: 'kjennetegn', skill: 'kap.kjennetegn', stem: 'Hvilket av disse er ikke et av de tre institusjonelle kjennetegnene ved kapitalisme slik CORE beskriver dem?', correct: 'At staten eier de viktigste bedriftene og fastsetter prisene.', wrong: ['Privat eiendom til produksjonsmidler.', 'Markeder der varer og tjenester byttes frivillig.', 'Bedrifter der eierne ansetter arbeidere for å produsere.'], why: 'Kapitalisme kjennetegnes av privat eiendom, markeder og bedrifter. Statlig eierskap og prisfastsettelse kjennetegner sentralplanlegging.' },
  { id: 'eiendom', skill: 'kap.kjennetegn', stem: 'Hvilket av disse er ikke et eksempel på privat eiendomsrett?', correct: 'Nasjonal sikkerhet', wrong: ['Et privat sameie av en hytte', 'Aksjer i et børsnotert selskap', 'En gårdbrukers jord'], why: 'Nasjonal sikkerhet er et fellesgode ingen eier privat.' },
  { id: 'richpoor', skill: 'kap.kjennetegn', stem: 'I land X tjener de 10 prosent med høyest inntekt i gjennomsnitt 12 ganger så mye som de 10 prosent med lavest inntekt. Hva kalles dette målet, og hva er verdien?', correct: 'Rich/poor-ratioen, og den er 12.', wrong: ['Gini-koeffisienten, og den er 0,12.', 'Rich/poor-ratioen, og den er 1,2.', 'BNP per innbygger, og den er 12.'], why: 'Rich/poor-ratioen er gjennomsnittsinntekten i øverste tidel delt på gjennomsnittsinntekten i nederste tidel.' },
  { id: 'institusjoner', skill: 'kap.kjennetegn', stem: 'Hva må på plass for at eiendomsrett og avtaler skal bety noe i en kapitalistisk økonomi?', correct: 'Et rettssystem som beskytter eiendom og sørger for at inngåtte avtaler blir holdt.', wrong: ['At staten eier alle bedrifter.', 'At alle priser er fastsatt av myndighetene.', 'At det ikke finnes konkurranse.'], why: 'Kapitalismen hviler på institusjoner som beskytter eiendom og håndhever kontrakter.' },
];

export const kapitalisme: FamilyKB = {
  id: 'kapitalisme',
  name: 'Kapitalisme, eiendomsrett og ulikhet',
  shortName: 'Kapitalisme og ulikhet',
  topic: 'Økonomiske systemer',
  subtopics: ['Kjennetegn ved kapitalisme', 'Ulikhetsmål'],
  description: 'Privat eiendomsrett, markeder og bedrifter, og hvordan ulikhet måles.',
  skills: ['kap.kjennetegn'],
  formulas: [],
  intents: [{ id: 'kap.kjennetegn', label: 'Kapitalisme og ulikhet', match: [/kapitalism|eiendomsrett|rich\/poor|ulikhet/i], skills: ['kap.kjennetegn'], taskType: ['forklaring'], assignment: 'Kjenne igjen kjennetegn ved kapitalisme og tolke ulikhetsmål.', interpretation: ['Privat eiendomsrett, markeder og bedrifter.', 'Rich/poor-ratio: øverste mot nederste tidel.'], prerequisites: [], misconceptions: [], variation: [], estMinutes: 2 }],
  templates: [mcTemplate({ id: 'kap-mc', level: 1, name: 'Flervalg: kapitalisme og ulikhet', description: 'Begreper fra de første kapitlene.', title: 'Kapitalisme og ulikhet', items: KAP_MC })],
  misconceptions: [],
  recognize: keywordRecognizer(
    [
      [/kapitalism/i, 3],
      [/eiendomsrett/i, 2.5],
      [/rich\/poor|ulikhet/i, 2.5],
    ],
    2.5,
    'kapitalisme og ulikhet',
  ),
  explanations: { short: () => ({ text: 'Kapitalisme: privat eiendom, markeder og bedrifter.', example: 'Rich/poor-ratio 85: øverste tidel tjener 85 ganger nederste.' }), analogy: { text: '', limits: '' }, derivationFormulaId: '' },
  solutionStructure: ['Begrep', 'Eksempel'],
  surfaceFeatures: [],
};
