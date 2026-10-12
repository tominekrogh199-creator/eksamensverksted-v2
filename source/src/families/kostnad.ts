// Familie: Tolke og bruke en lineær kostnadsfunksjon.
// TC = F + cQ, AC = F/Q + c, MC = c. Nullpunkt ved pris p: Q = F/(p − c).

import { Rat } from '../math/rational';
import type { GenPart } from '../domain/types';
import { FamilyKB, TemplateDef, randInt, pick, R, no, texNum, step, IntentDef, RecognizeResult, readNumber } from './common';

const FIRMS = [
  { firm: 'Et lite bakeri', good: 'brød', unit: 'brød' },
  { firm: 'En studentbedrift som trykker T-skjorter', good: 'T-skjorter', unit: 'skjorter' },
  { firm: 'En sykkelverksted', good: 'reparasjoner', unit: 'reparasjoner' },
  { firm: 'Et mikrobryggeri', good: 'flasker', unit: 'flasker' },
  { firm: 'En app-utvikler som selger abonnement', good: 'abonnement', unit: 'abonnement' },
];

function costCtx(F: Rat, c: Rat, q: Rat, extra: Record<string, string> = {}) {
  const TC = F.add(c.mul(q));
  return {
    symbols: ['TC', 'AC', 'MC', 'FC', 'VC', 'TR'],
    defs: { TC: `${F.toString()} + (${c.toString()})*Q`, AC: `(${F.toString()} + (${c.toString()})*Q)/Q`, VC: `(${c.toString()})*Q` },
    param: 'Q',
    unknown: 'Q',
    solution: { Q: q.toString(), TC: TC.toString(), AC: TC.div(q).toString(), MC: c.toString(), FC: F.toString(), VC: c.mul(q).toString(), ...extra },
    answerSymbols: ['v'],
  };
}

function niceCost(rng: () => number) {
  for (let t = 0; t < 200; t++) {
    const F = randInt(rng, 2, 40) * 100;
    const c = randInt(rng, 5, 60);
    const q = pick(rng, [20, 25, 40, 50, 80, 100, 125, 200, 250]);
    const AC = R(F).div(R(q)).add(R(c));
    if (!AC.isExactDecimal(2)) continue;
    return { F: R(F), c: R(c), q: R(q), AC };
  }
  return { F: R(500), c: R(20), q: R(50), AC: R(30) };
}

const tplGrunn: TemplateDef = {
  id: 'kost-grunn',
  version: 1,
  level: 1,
  style: 'standard',
  name: 'Samme metode, nye tall',
  description: 'Faste og variable kostnader, gjennomsnittskostnad og grensekostnad.',
  skills: ['kost.fast_var', 'kost.ac', 'kost.mc'],
  build: (rng) => {
    const { F, c, q, AC } = niceCost(rng);
    const f = pick(rng, FIRMS);
    const parts: GenPart[] = [
      {
        id: 'a',
        label: 'a',
        prompt: 'Hvor store er de faste kostnadene, og hva er den variable kostnaden per enhet?',
        kind: 'beregning',
        skills: ['kost.fast_var'],
        math: costCtx(F, c, q),
        targets: [
          { symbol: 'FC', label: 'Faste kostnader', value: F.toString(), aliases: ['faste', 'fast'], symbolAliases: ['F', 'FK'] },
          { symbol: 'v', label: 'Variabel kostnad per enhet', value: c.toString(), aliases: ['variabel', 'per enhet', 'enhetskostnad'], symbolAliases: ['c'] },
        ],
        solution: [step(`\\mathit{FC} = ${texNum(F)},\\quad \\text{variabel kostnad per enhet} = ${texNum(c)}`, 'Les av uttrykket', 'Konstantleddet påløper uansett hvor mye som produseres (faste kostnader). Tallet foran Q er kostnaden ved hver enhet.', 'definisjon')],
        hints: { small: 'Hvilken del av uttrykket endrer seg når Q endrer seg?', firstStep: `Konstantleddet er ${no(F)}.`, stepExplanation: 'Faste kostnader avhenger ikke av Q. Variable kostnader øker med Q.', workedExample: { intro: 'TC = 300 + 5Q', steps: [step('FC = 300,\\ c = 5', '', '', 'definisjon')] } },
        methodCheckpoints: [],
      },
      {
        id: 'b',
        label: 'b',
        prompt: `Beregn gjennomsnittskostnaden når bedriften produserer ${no(q)} ${f.unit}.`,
        kind: 'beregning',
        skills: ['kost.ac', 'alg.innsetting'],
        math: costCtx(F, c, q),
        targets: [{ symbol: 'AC', label: 'Gjennomsnittskostnad', value: AC.toString(), minDecimals: AC.isInteger() ? 0 : 1, aliases: ['gjennomsnittskostnad', 'gjennomsnitt'] }],
        solution: [
          step(`\\mathit{TC} = ${texNum(F)} + ${texNum(c)} \\cdot ${texNum(q)} = ${texNum(F.add(c.mul(q)))}`, 'Totalkostnad ved denne mengden', '', 'innsetting'),
          step(`\\mathit{AC} = \\frac{\\mathit{TC}}{Q} = \\frac{${texNum(F.add(c.mul(q)))}}{${texNum(q)}} = ${texNum(AC)}`, 'Del på antall enheter', 'Gjennomsnittskostnad er definert som totalkostnad per enhet.', 'definisjon'),
        ],
        hints: { small: 'Gjennomsnittskostnad = totalkostnad delt på antall enheter.', firstStep: `Regn ut TC ved Q = ${no(q)} først.`, stepExplanation: 'Vi fordeler hele kostnaden likt på alle enhetene.', workedExample: { intro: 'TC = 300 + 5Q, Q = 60', steps: [step('TC = 600', '', '', 'innsetting'), step('AC = 10', '', '', 'definisjon')] } },
        methodCheckpoints: [{ id: 'tc', label: 'Regnet ut totalkostnaden', skill: 'alg.innsetting', detect: { type: 'verdi', value: F.add(c.mul(q)).toString(), symbols: ['TC'] }, required: false }],
      },
      {
        id: 'c',
        label: 'c',
        prompt: 'Hva er grensekostnaden? Forklar kort hva den betyr for denne bedriften.',
        kind: 'forklaring',
        skills: ['kost.mc'],
        math: costCtx(F, c, q),
        targets: [{ symbol: 'MC', label: 'Grensekostnad', value: c.toString(), aliases: ['grensekostnad', 'grense'] }],
        rubric: [
          { id: 'k1', text: `Sier at grensekostnaden er ${no(c)} kr.`, basis: 'faglig-tolkning', required: true },
          { id: 'k2', text: 'Forklarer at grensekostnad er hvor mye totalkostnaden øker når produksjonen øker med én enhet.', basis: 'faglig-tolkning', required: true },
          { id: 'k3', text: 'Forklarer at den er konstant fordi kostnadsfunksjonen er lineær, og at de faste kostnadene ikke påvirker den.', basis: 'faglig-tolkning', required: false },
        ],
        solution: [step(`\\mathit{MC} = ${texNum(c)}`, 'Grensekostnad', `Én enhet til øker TC med ${no(c)} kr, uansett nivå, fordi TC er lineær.`, 'identitet')],
        hints: { small: 'Hva skjer med TC når Q øker fra 10 til 11?', firstStep: `TC øker med ${no(c)} for hver ekstra enhet.`, stepExplanation: 'Grensekostnad er kostnaden ved den siste enheten.', workedExample: { intro: '', steps: [] } },
        methodCheckpoints: [{ id: 'forklaring', label: 'Forklarte grensekostnad', skill: 'kost.mc', detect: { type: 'forklaring' }, required: true }],
        modelAnswer: `Grensekostnaden er ${no(c)} kr: hver ekstra enhet øker totalkostnaden med ${no(c)} kr. Den er konstant fordi kostnadsfunksjonen er lineær.`,
      },
    ];
    return { title: 'Kostnadsfunksjon', intro: `${f.firm} har totalkostnadene TC = ${no(F)} + ${no(c)}Q, der Q er antall ${f.unit} per måned og TC er i kroner.`, context: f.firm, parts, params: { F: F.toString(), c: c.toString(), q: q.toString() }, skills: ['kost.fast_var', 'kost.ac', 'kost.mc', 'alg.innsetting'], structureKey: 'kost-grunn', estMinutes: 8 };
  },
};

const tplBaklengs: TemplateDef = {
  id: 'kost-ac-baklengs',
  version: 1,
  level: 2,
  style: 'standard',
  name: 'Annen ukjent: finn mengden fra gjennomsnittskostnaden',
  description: 'Gjennomsnittskostnaden er gitt; finn produksjonsmengden.',
  skills: ['kost.ac', 'alg.isolere'],
  build: (rng) => {
    const { F, c, q, AC } = niceCost(rng);
    const f = pick(rng, FIRMS);
    const part: GenPart = {
      id: 'a',
      label: 'a',
      prompt: `Ved hvilken produksjonsmengde er gjennomsnittskostnaden ${no(AC)} kr?`,
      kind: 'beregning',
      skills: ['kost.ac', 'alg.isolere'],
      math: costCtx(F, c, q),
      targets: [{ symbol: 'Q', label: 'Mengde', value: q.toString(), aliases: ['mengde', 'antall'] }],
      solution: [
        step(`\\frac{${texNum(F)}}{Q} + ${texNum(c)} = ${texNum(AC)}`, 'Sett opp AC = gitt verdi', 'AC = TC/Q = F/Q + c.', 'definisjon'),
        step(`\\frac{${texNum(F)}}{Q} = ${texNum(AC.sub(c))}`, `Trekk fra ${no(c)}`, '', 'omforming'),
        step(`Q = \\frac{${texNum(F)}}{${texNum(AC.sub(c))}} = ${texNum(q)}`, 'Løs for Q', 'Gang med Q og del på tallet på høyre side.', 'omforming'),
      ],
      hints: { small: 'Skriv gjennomsnittskostnaden som et uttrykk i Q.', firstStep: `AC = ${no(F)}/Q + ${no(c)}. Sett dette lik ${no(AC)}.`, stepExplanation: 'Når Q står i nevneren, kan du gange begge sider med Q.', workedExample: { intro: '300/Q + 5 = 11', steps: [step('300/Q = 6', '', '', 'omforming'), step('Q = 50', '', '', 'omforming')] } },
      methodCheckpoints: [
        { id: 'oppsett', label: 'Satte opp AC-uttrykket lik den gitte verdien', skill: 'kost.ac', detect: { type: 'oppsett', v: 'Q' }, required: true },
        { id: 'isolering', label: 'Isolerte Q', skill: 'alg.isolere', detect: { type: 'isolering', v: 'Q' }, required: true },
      ],
    };
    return { title: 'Finn mengden', intro: `${f.firm} har totalkostnadene TC = ${no(F)} + ${no(c)}Q.`, context: f.firm, parts: [part], params: { F: F.toString(), c: c.toString(), AC: AC.toString() }, skills: part.skills, structureKey: 'kost-ac-baklengs', estMinutes: 5 };
  },
};

const tplEndret: TemplateDef = {
  id: 'kost-endret',
  version: 1,
  level: 3,
  style: 'standard',
  name: 'Endret forutsetning: høyere faste kostnader',
  description: 'Hva endres og hva endres ikke når faste kostnader øker?',
  skills: ['kost.mc', 'kost.ac', 'kost.tolke'],
  build: (rng) => {
    const { F, c, q, AC } = niceCost(rng);
    const f = pick(rng, FIRMS);
    const dF = R(randInt(rng, 1, 10) * 100);
    const F2 = F.add(dF);
    const AC2 = F2.div(q).add(c);
    const parts: GenPart[] = [
      {
        id: 'a',
        label: 'a',
        prompt: `Husleien øker, slik at de faste kostnadene blir ${no(F2)} kr. Hva blir den nye gjennomsnittskostnaden ved Q = ${no(q)}?`,
        kind: 'beregning',
        skills: ['kost.ac'],
        math: costCtx(F2, c, q),
        targets: [{ symbol: 'AC', label: 'Ny gjennomsnittskostnad', value: AC2.toString(), minDecimals: AC2.isInteger() ? 0 : 1, aliases: ['gjennomsnittskostnad'] }],
        solution: [step(`\\mathit{AC} = \\frac{${texNum(F2)}}{${texNum(q)}} + ${texNum(c)} = ${texNum(AC2)}`, 'Ny gjennomsnittskostnad', `Før var den ${no(AC)} kr.`, 'innsetting')],
        hints: { small: 'Hvilket ledd i AC påvirkes av de faste kostnadene?', firstStep: `AC = ${no(F2)}/${no(q)} + ${no(c)}`, stepExplanation: 'De faste kostnadene fordeles på alle enhetene.', workedExample: { intro: '', steps: [] } },
        methodCheckpoints: [],
      },
      {
        id: 'b',
        label: 'b',
        prompt: 'Endres grensekostnaden? Begrunn svaret.',
        kind: 'forklaring',
        skills: ['kost.mc', 'kost.tolke'],
        rubric: [
          { id: 'k1', text: `Sier at grensekostnaden er uendret, ${no(c)} kr.`, basis: 'faglig-tolkning', required: true },
          { id: 'k2', text: 'Begrunner med at faste kostnader ikke endres når produksjonen øker med én enhet.', basis: 'faglig-tolkning', required: true },
        ],
        solution: [step('', 'Modellsvar', `Grensekostnaden er fortsatt ${no(c)} kr. Den faste kostnaden påløper uansett, så den ekstra kostnaden ved én enhet til er den samme.`, 'tolkning')],
        hints: { small: 'Påvirker husleien kostnaden ved å lage én enhet til?', firstStep: 'Se på hvilket ledd i TC som endres med Q.', stepExplanation: 'Grensekostnad handler om endringen i TC, og konstantleddet forsvinner i en endring.', workedExample: { intro: '', steps: [] } },
        methodCheckpoints: [{ id: 'forklaring', label: 'Forklarte hvorfor MC er uendret', skill: 'kost.mc', detect: { type: 'forklaring' }, required: true }],
        modelAnswer: `Nei. Grensekostnaden er fortsatt ${no(c)} kr, fordi de faste kostnadene ikke påvirker kostnaden ved én enhet til.`,
      },
    ];
    return { title: 'Når faste kostnader øker', intro: `${f.firm} har totalkostnadene TC = ${no(F)} + ${no(c)}Q.`, context: f.firm, parts, params: { F: F.toString(), c: c.toString(), q: q.toString(), F2: F2.toString() }, skills: ['kost.ac', 'kost.mc', 'kost.tolke'], structureKey: 'kost-endret', estMinutes: 6 };
  },
};

const tplNullpunkt: TemplateDef = {
  id: 'kost-nullpunkt',
  version: 1,
  level: 4,
  style: 'standard',
  name: 'Blandet eksamensoppgave: nullpunkt og overskudd',
  description: 'Kombinerer kostnadsfunksjon, inntekt og likningsløsning.',
  skills: ['kost.nullpunkt', 'alg.isolere', 'kost.tolke'],
  build: (rng) => {
    for (let t = 0; t < 200; t++) {
      const F = randInt(rng, 5, 60) * 100;
      const c = randInt(rng, 5, 60);
      const margin = pick(rng, [5, 10, 20, 25, 40, 50]);
      const p = c + margin;
      const Q0 = R(F).div(R(margin));
      if (!Q0.isInteger()) continue;
      const q2 = Q0.mul(R(2));
      const profit = R(p).mul(q2).sub(R(F).add(R(c).mul(q2)));
      const f = pick(rng, FIRMS);
      const ctx = { symbols: ['TC', 'TR', 'AC'], defs: { TC: `${F} + ${c}*Q`, TR: `${p}*Q` }, param: 'Q', unknown: 'Q', solution: { Q: Q0.toString(), TC: R(F).add(R(c).mul(Q0)).toString(), TR: R(p).mul(Q0).toString() }, answerSymbols: ['pi'] };
      const parts: GenPart[] = [
        {
          id: 'a',
          label: 'a',
          prompt: `Bedriften selger hver enhet for ${p} kr. Hvor mange enheter må den selge for å gå i null (nullpunktsmengden)?`,
          kind: 'beregning',
          skills: ['kost.nullpunkt', 'alg.isolere'],
          math: ctx,
          targets: [{ symbol: 'Q', label: 'Nullpunktsmengde', value: Q0.toString(), aliases: ['nullpunkt', 'mengde'] }],
          solution: [
            step(`${p}Q = ${F} + ${c}Q`, 'Inntekt = kostnad', 'I nullpunktet er overskuddet null, altså TR = TC.', 'definisjon'),
            step(`${margin}Q = ${F}`, 'Samle Q-leddene', `${p} − ${c} = ${margin} er dekningsbidraget per enhet.`, 'omforming'),
            step(`Q = ${texNum(Q0)}`, `Del på ${margin}`, '', 'omforming'),
          ],
          hints: { small: 'Hva er overskuddet i nullpunktet?', firstStep: `Sett ${p}Q = ${F} + ${c}Q.`, stepExplanation: 'Hver solgte enhet gir et bidrag på p − c til å dekke de faste kostnadene.', workedExample: { intro: 'p = 30, TC = 400 + 10Q', steps: [step('30Q = 400 + 10Q', '', '', 'definisjon'), step('Q = 20', '', '', 'omforming')] } },
          methodCheckpoints: [
            { id: 'oppsett', label: 'Satte inntekt lik kostnad', skill: 'kost.nullpunkt', detect: { type: 'oppsett', v: 'Q' }, required: true },
            { id: 'isolering', label: 'Isolerte Q', skill: 'alg.isolere', detect: { type: 'isolering', v: 'Q' }, required: true },
          ],
        },
        {
          id: 'b',
          label: 'b',
          prompt: `Hva blir overskuddet hvis bedriften selger ${no(q2)} enheter?`,
          kind: 'beregning',
          skills: ['alg.innsetting', 'kost.nullpunkt'],
          math: { ...ctx, solution: { Q: q2.toString(), TC: R(F).add(R(c).mul(q2)).toString(), TR: R(p).mul(q2).toString() } },
          targets: [{ symbol: 'pi', label: 'Overskudd', value: profit.toString(), aliases: ['overskudd', 'profitt', 'resultat'] }],
          solution: [step(`${p} \\cdot ${texNum(q2)} - (${F} + ${c} \\cdot ${texNum(q2)}) = ${texNum(profit)}`, 'Overskudd = inntekt − kostnad', '', 'definisjon')],
          hints: { small: 'Overskudd = inntekt − kostnad.', firstStep: `TR = ${p} · ${no(q2)}.`, stepExplanation: 'Regn ut inntekt og kostnad hver for seg og trekk fra.', workedExample: { intro: '', steps: [] } },
          methodCheckpoints: [],
        },
        {
          id: 'c',
          label: 'c',
          prompt: 'Forklar hvorfor overskuddet ble akkurat så stort, med utgangspunkt i dekningsbidraget.',
          kind: 'forklaring',
          skills: ['kost.tolke'],
          rubric: [
            { id: 'k1', text: `Forklarer at hver enhet over nullpunktet bidrar med ${margin} kr (p − c) til overskudd.`, basis: 'faglig-tolkning', required: true },
            { id: 'k2', text: `Kobler dette til at ${no(q2)} − ${no(Q0)} = ${no(q2.sub(Q0))} enheter er over nullpunktet.`, basis: 'faglig-tolkning', required: false },
          ],
          solution: [step('', 'Modellsvar', `Når de faste kostnadene er dekket ved ${no(Q0)} enheter, gir hver ekstra enhet ${margin} kr i overskudd. ${no(q2.sub(Q0))} ekstra enheter gir ${no(profit)} kr.`, 'tolkning')],
          hints: { small: 'Hva gir hver enhet etter at de faste kostnadene er dekket?', firstStep: `p − c = ${margin}.`, stepExplanation: 'Dekningsbidraget dekker først de faste kostnadene, deretter blir det overskudd.', workedExample: { intro: '', steps: [] } },
          methodCheckpoints: [{ id: 'forklaring', label: 'Forklarte med dekningsbidrag', skill: 'kost.tolke', detect: { type: 'forklaring' }, required: true }],
          modelAnswer: `Hver enhet over nullpunktet gir ${margin} kr i overskudd.`,
        },
      ];
      return { title: 'Nullpunkt og overskudd', intro: `${f.firm} har totalkostnadene TC = ${F} + ${c}Q.`, context: f.firm, parts, params: { F: String(F), c: String(c), p: String(p) }, skills: ['kost.nullpunkt', 'alg.isolere', 'alg.innsetting', 'kost.tolke'], structureKey: 'kost-nullpunkt', estMinutes: 12 };
    }
    throw new Error('Fant ikke gyldige parametere');
  },
};

const tplDrillAC: TemplateDef = {
  id: 'drill-ac',
  version: 1,
  level: 1,
  style: 'delferdighet',
  name: 'Delferdighet: gjennomsnittskostnad',
  description: 'Del totalkostnaden på antall enheter.',
  skills: ['kost.ac'],
  build: (rng) => {
    const { F, c, q, AC } = niceCost(rng);
    const TC = F.add(c.mul(q));
    const part: GenPart = {
      id: 'a',
      label: 'a',
      prompt: `Totalkostnaden ved å produsere ${no(q)} enheter er ${no(TC)} kr. Hva er gjennomsnittskostnaden?`,
      kind: 'beregning',
      skills: ['kost.ac'],
      math: costCtx(F, c, q),
      targets: [{ symbol: 'AC', label: 'Gjennomsnittskostnad', value: AC.toString(), aliases: ['gjennomsnitt'] }],
      solution: [step(`\\frac{${texNum(TC)}}{${texNum(q)}} = ${texNum(AC)}`, 'Totalkostnad per enhet', '', 'definisjon')],
      hints: { small: 'Gjennomsnitt = total delt på antall.', firstStep: `${no(TC)} / ${no(q)}`, stepExplanation: '', workedExample: { intro: '', steps: [] } },
      methodCheckpoints: [],
    };
    return { title: 'Gjennomsnittskostnad', intro: '', context: 'kostnad', parts: [part], params: { F: F.toString(), c: c.toString(), q: q.toString() }, skills: ['kost.ac'], structureKey: 'drill-ac', estMinutes: 1 };
  },
};

function recognize(text: string): RecognizeResult | null {
  const m = /(?:TC|TK|K|C)\s*(?:\(\s*[Qx]\s*\))?\s*=\s*([\d\s.,]+?)\s*\+\s*([\d.,]+)\s*·?\s*([Qx])\b/.exec(text);
  if (!m) return null;
  const F = readNumber(m[1]);
  const c = readNumber(m[2]);
  if (F === null || c === null) return null;
  const pm = /(?:pris(?:en)?|selge[rs]?[^.]{0,30}?for)\s*(?:på|er|lik)?\s*(\d+(?:[.,]\d+)?)\s*(?:kr|kroner)/i.exec(text);
  const qm = /(?:produserer|produksjon(?:en)? på|Q\s*=|mengde(?:n)? (?:på|er))\s*(\d+)/i.exec(text);
  const params: Record<string, string> = { F: Rat.fromNumber(F).toString(), c: Rat.fromNumber(c).toString() };
  if (pm) params.p = Rat.parseDecimal(pm[1]).toString();
  if (qm) params.q = qm[1];
  return { params, basis: `Fant kostnadsfunksjonen «${m[0].trim()}» i teksten.`, strength: 0.9 };
}

const intents: IntentDef[] = [
  {
    id: 'kost.overskudd',
    specific: true,
    label: 'Overskudd ved gitt mengde',
    match: [/overskudd|profitt|driftsresultat/i],
    skills: ['alg.innsetting', 'kost.nullpunkt'],
    taskType: ['beregning'],
    assignment: 'Regne ut overskuddet (inntekt minus kostnad) ved en gitt mengde.',
    interpretation: ['Du må regne ut både inntekt og totalkostnad ved mengden og trekke fra.'],
    prerequisites: ['Sette inn tall i et uttrykk'],
    misconceptions: ['Glemmer de faste kostnadene', 'Bruker bare dekningsbidraget uten å trekke fra faste kostnader'],
    variation: ['Mengden kan være over eller under nullpunktet'],
    estMinutes: 5,
    compute: (p, text) => {
      const qm = /(?:selger|produserer|ved)\s+(\d+)\s*(?:enheter|flasker|brød|skjorter|stk)?/i.exec(text);
      if (!p.p || !qm) return null;
      const q = R(qm[1]);
      const pi = R(p.p).mul(q).sub(R(p.F).add(R(p.c).mul(q)));
      return [{ label: `Overskudd ved Q = ${qm[1]}`, value: pi.toString(), display: no(pi, 2), unit: 'kr' }];
    },
  },
  {
    id: 'kost.nullpunkt',
    specific: true,
    label: 'Nullpunkt',
    match: [/nullpunkt|gå i null|break.?even|dekke kostnadene/i],
    skills: ['kost.nullpunkt', 'alg.isolere'],
    taskType: ['beregning'],
    assignment: 'Finne mengden der inntekten akkurat dekker kostnadene.',
    interpretation: ['Du må sette inntekt lik kostnad (overskudd lik null).', 'Du må løse for mengden.'],
    prerequisites: ['Løse lineære likninger'],
    misconceptions: ['Deler faste kostnader på prisen i stedet for på dekningsbidraget'],
    variation: ['Kan be om pris i stedet for mengde (annen ukjent)'],
    estMinutes: 6,
    compute: (p) => {
      if (!p.p) return null;
      const Q = R(p.F).div(R(p.p).sub(R(p.c)));
      return [{ label: 'Nullpunktsmengde', value: Q.toString(), display: no(Q, 2), symbol: 'Q', unit: 'mengde' }];
    },
  },
  {
    id: 'kost.tolke',
    label: 'Forklare kostnadsutvikling',
    match: [/(forklar|hvorfor|drøft|tolk).{0,80}(gjennomsnitts|kostnad|faller|synker)/i],
    skills: ['kost.tolke'],
    taskType: ['forklaring'],
    assignment: 'Forklare hvordan gjennomsnittskostnaden endres med produksjonen.',
    interpretation: ['Du må forklare at de faste kostnadene fordeles på flere enheter når produksjonen øker.', 'Du bør nevne at AC nærmer seg den variable kostnaden per enhet.'],
    prerequisites: ['Beregne gjennomsnittskostnad'],
    misconceptions: ['Tror grensekostnaden faller når gjennomsnittskostnaden faller'],
    variation: ['Kan spørre om AC, MC eller begge'],
    estMinutes: 5,
  },
  {
    id: 'kost.ac',
    label: 'Gjennomsnittskostnad',
    match: [/gjennomsnittskostnad|kostnad per enhet|enhetskostnad/i],
    skills: ['kost.ac', 'alg.innsetting'],
    taskType: ['beregning'],
    assignment: 'Beregne gjennomsnittskostnaden ved en gitt mengde.',
    interpretation: ['Du må regne ut totalkostnaden og dele på mengden.'],
    prerequisites: ['Sette inn tall i et uttrykk'],
    misconceptions: ['Glemmer de faste kostnadene', 'Deler bare de variable kostnadene på mengden'],
    variation: ['Kan be om mengden ved en gitt AC (annen ukjent)'],
    estMinutes: 4,
    compute: (p) => {
      if (!p.q) return null;
      const AC = R(p.F).div(R(p.q)).add(R(p.c));
      return [{ label: `Gjennomsnittskostnad ved Q = ${p.q}`, value: AC.toString(), display: no(AC, 2), symbol: 'AC', unit: 'kr' }];
    },
  },
  {
    id: 'kost.mc',
    label: 'Grensekostnad',
    match: [/grensekostnad|marginalkostnad/i],
    skills: ['kost.mc'],
    taskType: ['beregning', 'forklaring'],
    assignment: 'Finne og tolke grensekostnaden.',
    interpretation: ['Du må si hva grensekostnaden er og hva den betyr: kostnaden ved én enhet til.'],
    prerequisites: ['Skille faste og variable kostnader'],
    misconceptions: ['Blander grensekostnad og gjennomsnittskostnad'],
    variation: ['Ved ikke-lineær TC er MC ikke konstant'],
    estMinutes: 4,
    compute: (p) => [{ label: 'Grensekostnad', value: R(p.c).toString(), display: no(R(p.c)), symbol: 'MC', unit: 'kr' }],
  },
  {
    id: 'kost.fast_var',
    label: 'Faste og variable kostnader',
    match: [/faste kostnader|variable kostnader|fast kostnad|variabel kostnad/i],
    skills: ['kost.fast_var'],
    taskType: ['tolkning'],
    assignment: 'Skille mellom faste og variable kostnader i kostnadsfunksjonen.',
    interpretation: ['Du må peke ut konstantleddet som faste kostnader og leddet med Q som variable kostnader.'],
    prerequisites: [],
    misconceptions: ['Tror faste kostnader endres med produksjonen'],
    variation: ['Kan gis som tekst i stedet for uttrykk'],
    estMinutes: 3,
    compute: (p) => [
      { label: 'Faste kostnader', value: R(p.F).toString(), display: no(R(p.F)), symbol: 'FC', unit: 'kr' },
      { label: 'Variabel kostnad per enhet', value: R(p.c).toString(), display: no(R(p.c)), unit: 'kr' },
    ],
  },
];

export const kostnad: FamilyKB = {
  id: 'kostnad-lineaer',
  name: 'Tolke og bruke en lineær kostnadsfunksjon (faste kostnader, gjennomsnitts- og grensekostnad)',
  shortName: 'Kostnadsfunksjon',
  topic: 'Produksjon og kostnader',
  subtopics: ['Faste og variable kostnader', 'Gjennomsnittskostnad', 'Grensekostnad', 'Nullpunkt'],
  description: 'Oppgaver der totalkostnaden er gitt som TC = F + cQ, og studenten skal regne ut og tolke kostnadsbegreper.',
  skills: ['kost.fast_var', 'kost.ac', 'kost.mc', 'kost.nullpunkt', 'kost.tolke', 'alg.innsetting', 'alg.isolere'],
  formulas: [
    {
      id: 'f-tc',
      tex: '\\mathit{TC} = F + cQ',
      name: 'Lineær totalkostnad',
      kind: 'modellantakelse',
      kindWhy: 'At hver enhet koster like mye å lage (konstant c), er en forenkling.',
      symbols: [
        { sym: '\\mathit{TC}', meaning: 'Totalkostnad', unit: 'kr per periode' },
        { sym: 'F', meaning: 'Faste kostnader: påløper uansett produksjon', unit: 'kr per periode' },
        { sym: 'c', meaning: 'Variabel kostnad per enhet', unit: 'kr per enhet' },
        { sym: 'Q', meaning: 'Produsert mengde', unit: 'enheter per periode' },
      ],
      conditions: ['Q ≥ 0', 'Gjelder innenfor kapasiteten, der c er konstant.'],
      whatIf: ['Større F flytter hele linjen opp, men endrer ikke stigningen.', 'Større c gjør linjen brattere.'],
      figure: 'kostnad',
    },
    {
      id: 'f-ac',
      tex: '\\mathit{AC} = \\frac{\\mathit{TC}}{Q} = \\frac{F}{Q} + c',
      name: 'Gjennomsnittskostnad',
      kind: 'definisjon',
      kindWhy: 'AC er definert som TC/Q. Den andre formen følger når vi setter inn den lineære TC.',
      symbols: [
        { sym: '\\mathit{AC}', meaning: 'Kostnad per enhet i gjennomsnitt', unit: 'kr per enhet' },
        { sym: 'F/Q', meaning: 'Faste kostnader fordelt per enhet', unit: 'kr per enhet' },
      ],
      conditions: ['Q > 0'],
      whatIf: ['Når Q øker, blir F/Q mindre, så AC faller mot c.'],
      derivation: [
        step('\\mathit{AC} = \\frac{\\mathit{TC}}{Q}', 'Definisjon', '', 'definisjon'),
        step('= \\frac{F + cQ}{Q}', 'Sett inn TC', '', 'modellantakelse'),
        step('= \\frac{F}{Q} + c', 'Del hvert ledd på Q', '', 'omforming'),
      ],
      figure: 'kostnad',
    },
    {
      id: 'f-mc',
      tex: '\\mathit{MC} = \\frac{\\Delta \\mathit{TC}}{\\Delta Q} = c',
      name: 'Grensekostnad',
      kind: 'definisjon',
      kindWhy: 'MC er definert som endring i TC per ekstra enhet. At den blir c, følger av den lineære modellen.',
      symbols: [{ sym: '\\mathit{MC}', meaning: 'Kostnaden ved én enhet til', unit: 'kr per enhet' }],
      conditions: ['For lineær TC er MC konstant. Med krum TC er MC den deriverte og varierer med Q.'],
      whatIf: ['Endring i F påvirker ikke MC.'],
      figure: 'kostnad',
    },
    {
      id: 'f-null',
      tex: 'Q_0 = \\frac{F}{p - c}',
      name: 'Nullpunktsmengde',
      kind: 'avledet sammenheng',
      kindWhy: 'Utledes fra TR = TC med konstant pris p.',
      symbols: [
        { sym: 'p', meaning: 'Pris per enhet', unit: 'kr per enhet' },
        { sym: 'p - c', meaning: 'Dekningsbidrag per enhet', unit: 'kr per enhet' },
      ],
      conditions: ['p > c. Ellers dekkes aldri de faste kostnadene.'],
      whatIf: ['Høyere pris eller lavere c gir lavere nullpunkt.'],
      derivation: [
        step('pQ = F + cQ', 'Inntekt lik kostnad', '', 'definisjon'),
        step('(p - c)Q = F', 'Samle Q-leddene', '', 'omforming'),
        step('Q_0 = \\frac{F}{p - c}', 'Del på p − c', 'Lov når p > c.', 'omforming'),
      ],
      figure: 'kostnad',
    },
  ],
  intents,
  templates: [tplGrunn, tplBaklengs, tplEndret, tplNullpunkt, tplDrillAC],
  misconceptions: [
    { id: 'glemmer-faste', label: 'Glemmer de faste kostnadene i AC', explanation: 'AC = (F + cQ)/Q. Hele totalkostnaden skal deles på Q.' },
    { id: 'mc-ac', label: 'Blander grensekostnad og gjennomsnittskostnad', explanation: 'MC er kostnaden ved én enhet til; AC er gjennomsnittet over alle enheter.' },
  ],
  recognize,
  explanations: {
    short: (p) => {
      const F = R(p.F ?? '500');
      const c = R(p.c ?? '20');
      return { text: 'Totalkostnaden består av en fast del og en del som øker med mengden. Gjennomsnittskostnaden fordeler hele kostnaden på alle enhetene.', example: `TC = ${no(F)} + ${no(c)}Q: ved Q = 50 er AC = ${no(F.div(R(50)).add(c))}.` };
    },
    analogy: { text: 'Tenk på en hyttetur der hytteleien er fast og maten koster per person. Jo flere som blir med, jo mindre hytteleie per person, men maten koster det samme per person.', limits: 'På en hyttetur blir det til slutt fullt. Modellen har ingen kapasitetsgrense, og antar at hver ekstra enhet koster nøyaktig det samme.' },
    derivationFormulaId: 'f-ac',
  },
  solutionStructure: ['Lese av faste og variable kostnader', 'Sette inn mengden', 'Dele på mengden (AC) eller se på endringen (MC)', 'Tolke'],
  surfaceFeatures: ['Hva bedriften lager', 'Størrelsen på faste kostnader'],
};
