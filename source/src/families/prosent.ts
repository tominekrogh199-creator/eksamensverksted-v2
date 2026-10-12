// Familie: Beregne og tolke prosentvis endring.
// e = (V1 − V0)/V0 · 100 %.

import { Rat } from '../math/rational';
import type { GenPart, SolutionStep } from '../domain/types';
import { FamilyKB, TemplateDef, randInt, pick, R, no, texNum, step, IntentDef, RecognizeResult, readNumber } from './common';

const ITEMS = [
  { what: 'Prisen på en månedsbillett', unit: 'kr', a: 'prisen' },
  { what: 'Omsetningen i en nettbutikk', unit: 'kr', a: 'omsetningen' },
  { what: 'Husleien for en hybel', unit: 'kr per måned', a: 'husleien' },
  { what: 'Antall besøkende på et museum', unit: 'besøkende', a: 'antallet' },
  { what: 'Prisen på en kaffe', unit: 'kr', a: 'prisen' },
  { what: 'Timelønnen i en deltidsjobb', unit: 'kr per time', a: 'timelønnen' },
];

const PCTS = [5, 10, 12.5, 15, 20, 25, 30, 40, 50, 60, 75];

function pctCtx(V0: Rat, V1: Rat) {
  return { symbols: ['V0', 'V1'], defs: {}, param: 'x', unknown: 'x', solution: { V0: V0.toString(), V1: V1.toString() }, answerSymbols: ['e', 'p'] };
}

function pctSolution(V0: Rat, V1: Rat, up: boolean): SolutionStep[] {
  const diff = V1.sub(V0);
  const e = diff.div(V0).mul(R(100));
  return [
    step(`${texNum(V1)} - ${texNum(V0)} = ${texNum(diff)}`, 'Finn endringen', 'Hvor mye har verdien endret seg i absolutte tall?', 'innsetting'),
    step(`\\frac{${texNum(diff)}}{${texNum(V0)}} = ${texNum(diff.div(V0))}`, 'Del på startverdien', 'Prosentvis endring sammenlikner endringen med det vi startet med. Derfor står startverdien i nevneren.', 'definisjon'),
    step(`${texNum(diff.div(V0))} \\cdot 100\\,\\% = ${texNum(e)}\\,\\%`, 'Gjør om til prosent', '«Prosent» betyr hundredeler.', 'identitet'),
    step('', up ? `Økningen er ${no(e.abs())} %` : `Nedgangen er ${no(e.abs())} %`, 'Svar med ord og fortegn/retning.', 'tolkning'),
  ];
}

function niceChange(rng: () => number) {
  for (let t = 0; t < 200; t++) {
    const pct = pick(rng, PCTS);
    const up = rng() < 0.65;
    const V0 = randInt(rng, 20, 400, pct === 12.5 ? 8 : 4);
    const V1 = R(V0).mul(R(100 + (up ? pct : -pct))).div(R(100));
    if (!V1.isInteger() && !V1.isExactDecimal(1)) continue;
    return { V0: R(V0), V1, pct: R(pct), up };
  }
  return { V0: R(80), V1: R(92), pct: R(15), up: true };
}

const tplGrunn: TemplateDef = {
  id: 'pst-grunn',
  version: 1,
  level: 1,
  style: 'standard',
  name: 'Samme metode, nye tall',
  description: 'Finn prosentvis endring fra startverdi og sluttverdi.',
  skills: ['pst.endring'],
  build: (rng, opts) => {
    const { V0, V1, up } = niceChange(rng);
    const it = pick(rng, ITEMS);
    const e = V1.sub(V0).div(V0).mul(R(100));
    const part: GenPart = {
      id: 'a',
      label: 'a',
      prompt: `${it.what} ${up ? 'økte' : 'falt'} fra ${no(V0)} ${it.unit} til ${no(V1)} ${it.unit}. Hvor mange prosent ${up ? 'økte' : 'falt'} ${it.a}?`,
      kind: 'beregning',
      skills: ['pst.endring'],
      math: pctCtx(V0, V1),
      targets: [{ symbol: 'e', label: up ? 'Prosentvis økning' : 'Prosentvis nedgang', value: e.abs().toString(), percent: true, minDecimals: 0, aliases: ['endring', 'økning', 'nedgang', 'prosent'] }],
      solution: pctSolution(V0, V1, up),
      hints: {
        small: 'Prosentvis endring: hvor stor er endringen sammenliknet med det du startet med?',
        firstStep: `Endringen er ${no(V1)} − ${no(V0)} = ${no(V1.sub(V0))}. Hva skal du dele på?`,
        stepExplanation: 'Vi måler endringen i forhold til utgangspunktet. Derfor deler vi på startverdien, ikke på den nye verdien.',
        workedExample: { intro: 'Eksempel: fra 40 til 46.', steps: pctSolution(R(40), R(46), true) },
      },
      methodCheckpoints: [{ id: 'grunnlag', label: 'Delte endringen på startverdien', skill: 'pst.endring', detect: { type: 'verdi', value: V1.sub(V0).div(V0).toString(), symbols: [] }, required: false }],
    };
    if (opts.style === 'fading') part.givenSteps = part.solution.slice(0, Math.max(1, Math.min(2, opts.fade ?? 1))).map((s) => s.tex);
    return {
      title: 'Prosentvis endring',
      intro: '',
      context: it.what,
      parts: [part],
      params: { V0: V0.toString(), V1: V1.toString() },
      skills: ['pst.endring'],
      structureKey: `pst-grunn|${up ? 'opp' : 'ned'}`,
      estMinutes: 3,
    };
  },
};

const tplFading: TemplateDef = { ...tplGrunn, id: 'pst-fading', style: 'fading', name: 'Gradvis færre løsningssteg', description: 'Første steg er gitt.' };

const tplBaklengs: TemplateDef = {
  id: 'pst-baklengs',
  version: 1,
  level: 2,
  style: 'standard',
  name: 'Annen ukjent: regn baklengs',
  description: 'Sluttverdi og prosent er kjent. Finn startverdien.',
  skills: ['pst.baklengs', 'pst.vekstfaktor'],
  build: (rng) => {
    const { V0, V1, pct, up } = niceChange(rng);
    const it = pick(rng, ITEMS);
    const f = R(100).add(up ? pct : pct.neg()).div(R(100));
    const wrong = up ? V1.mul(R(1).sub(pct.div(R(100)))) : V1.mul(R(1).add(pct.div(R(100))));
    const part: GenPart = {
      id: 'a',
      label: 'a',
      prompt: `Etter ${up ? 'en økning' : 'en nedgang'} på ${no(pct)} % er ${it.a} ${no(V1)} ${it.unit}. Hva var ${it.a} før endringen?`,
      kind: 'beregning',
      skills: ['pst.baklengs', 'pst.vekstfaktor'],
      math: { symbols: ['V0', 'V1'], defs: {}, param: 'x', unknown: 'V0', solution: { V0: V0.toString(), V1: V1.toString() }, answerSymbols: [] },
      targets: [{ symbol: 'V0', label: 'Startverdi', value: V0.toString(), minDecimals: V0.isInteger() ? 0 : 1, aliases: ['før', 'start', 'opprinnelig'] }],
      solution: [
        step(`V_1 = V_0 \\cdot ${texNum(f)}`, 'Vekstfaktor', `En ${up ? 'økning' : 'nedgang'} på ${no(pct)} % betyr at ny verdi er ${no(f)} ganger den gamle.`, 'identitet'),
        step(`${texNum(V1)} = V_0 \\cdot ${texNum(f)}`, 'Sett inn', '', 'innsetting'),
        step(`V_0 = \\frac{${texNum(V1)}}{${texNum(f)}} = ${texNum(V0)}`, 'Del på vekstfaktoren', `Vi går baklengs ved å dele på ${no(f)}, ikke ved å trekke fra ${no(pct)} % av den nye verdien.`, 'omforming'),
      ],
      hints: {
        small: `${no(pct)} % av hvilken verdi? Er det startverdien eller sluttverdien prosenten er regnet av?`,
        firstStep: `Skriv ${no(V1)} = V0 · ${no(f)}.`,
        stepExplanation: `Prosenten er regnet av startverdien. Å ta ${no(pct)} % av ${no(V1)} gir derfor feil svar (${no(wrong)}).`,
        workedExample: { intro: 'Eksempel: etter 25 % økning koster noe 150 kr.', steps: [step('150 = V_0 \\cdot 1{,}25', '', '', 'innsetting'), step('V_0 = 120', '', '', 'omforming')] },
      },
      methodCheckpoints: [{ id: 'isolering', label: 'Isolerte startverdien', skill: 'pst.baklengs', detect: { type: 'isolering', v: 'V0' }, required: false }],
    };
    return { title: 'Regn baklengs fra en prosentvis endring', intro: '', context: it.what, parts: [part], params: { V0: V0.toString(), V1: V1.toString(), pct: pct.toString() }, skills: part.skills, structureKey: `pst-baklengs|${up ? 'opp' : 'ned'}`, estMinutes: 4 };
  },
};

const tplPoeng: TemplateDef = {
  id: 'pst-poeng',
  version: 1,
  level: 3,
  style: 'standard',
  name: 'Endret forutsetning: prosent og prosentpoeng',
  description: 'Når størrelsen selv er en prosent, gir «økte med» to ulike svar.',
  skills: ['pst.poeng', 'pst.endring'],
  build: (rng) => {
    const pairs = [
      [4, 5], [2, 3], [5, 4], [3, 4.5], [8, 6], [2.5, 3], [10, 12], [1.5, 2.25],
    ];
    const [r0n, r1n] = pick(rng, pairs);
    const r0 = R(r0n);
    const r1 = R(r1n);
    const what = pick(rng, ['Styringsrenten', 'Arbeidsledigheten', 'Renten på et studielån', 'Andelen som pendler med kollektivtransport']);
    const pp = r1.sub(r0);
    const e = r1.sub(r0).div(r0).mul(R(100));
    const up = pp.sign() > 0;
    const parts: GenPart[] = [
      {
        id: 'a',
        label: 'a',
        prompt: `${what} ${up ? 'økte' : 'falt'} fra ${no(r0)} % til ${no(r1)} %. Hvor mange prosentpoeng ${up ? 'økte' : 'falt'} den?`,
        kind: 'beregning',
        skills: ['pst.poeng'],
        math: { symbols: [], defs: {}, param: 'x', unknown: 'x', solution: {}, answerSymbols: ['pp', 'e'] },
        targets: [{ symbol: 'pp', label: 'Endring i prosentpoeng', value: pp.abs().toString(), aliases: ['prosentpoeng', 'poeng'] }],
        solution: [step(`${texNum(r1)} - ${texNum(r0)} = ${texNum(pp)}`, 'Prosentpoeng er differansen', 'Når størrelsen selv er i prosent, er endringen i prosentpoeng bare differansen.', 'definisjon')],
        hints: { small: 'Prosentpoeng er den vanlige differansen mellom to prosenttall.', firstStep: `${no(r1)} − ${no(r0)}`, stepExplanation: 'Prosentpoeng sier hvor mye selve prosenttallet har endret seg.', workedExample: { intro: 'Fra 2 % til 3 %:', steps: [step('3 - 2 = 1\\text{ prosentpoeng}', '', '', 'definisjon')] } },
        methodCheckpoints: [],
      },
      {
        id: 'b',
        label: 'b',
        prompt: `Hvor mange prosent ${up ? 'økte' : 'falt'} den?`,
        kind: 'beregning',
        skills: ['pst.endring', 'pst.poeng'],
        math: { symbols: [], defs: {}, param: 'x', unknown: 'x', solution: {}, answerSymbols: ['e', 'pp'] },
        targets: [{ symbol: 'e', label: 'Prosentvis endring', value: e.abs().toString(), percent: true, minDecimals: e.isExactDecimal(1) ? 0 : 1, aliases: ['prosent', 'endring'] }],
        solution: pctSolution(r0, r1, up),
        hints: { small: 'Nå skal du sammenlikne endringen med startverdien, som i vanlig prosentvis endring.', firstStep: `(${no(r1)} − ${no(r0)}) / ${no(r0)}`, stepExplanation: 'Prosentvis endring bruker startverdien som grunnlag, også når størrelsen selv er en prosent.', workedExample: { intro: 'Fra 2 % til 3 %:', steps: [step('\\frac{3-2}{2} = 0{,}5 = 50\\,\\%', '', '', 'definisjon')] } },
        methodCheckpoints: [],
      },
      {
        id: 'c',
        label: 'c',
        prompt: 'En avis skriver at endringen var «på ett prosentpoeng, altså bare litt». En annen skriver at den var «på hele ' + no(e.abs()) + ' %». Forklar hvorfor begge tallene kan være riktige.',
        kind: 'forklaring',
        skills: ['pst.poeng', 'pst.tolke'],
        rubric: [
          { id: 'k1', text: 'Forklarer at prosentpoeng er differansen mellom to prosenttall.', basis: 'faglig-tolkning', required: true },
          { id: 'k2', text: 'Forklarer at prosentvis endring sammenlikner endringen med startverdien.', basis: 'faglig-tolkning', required: true },
          { id: 'k3', text: 'Peker på at et lite utgangspunkt gjør at en liten differanse blir en stor prosent.', basis: 'faglig-tolkning', required: false },
        ],
        solution: [step('', 'Modellsvar', `Prosentpoeng er differansen (${no(pp.abs())}), mens prosentvis endring er differansen delt på startverdien (${no(e.abs())} %). Begge er riktige, men de svarer på ulike spørsmål.`, 'tolkning')],
        hints: { small: 'Hva er grunnlaget i hvert av tallene?', firstStep: 'Det ene tallet er en differanse, det andre er en differanse delt på noe.', stepExplanation: 'Samme endring kan beskrives absolutt (poeng) eller relativt (prosent).', workedExample: { intro: '', steps: [] } },
        methodCheckpoints: [{ id: 'forklaring', label: 'Skilte prosent og prosentpoeng', skill: 'pst.poeng', detect: { type: 'forklaring' }, required: true }],
        modelAnswer: `Differansen er ${no(pp.abs())} prosentpoeng. Sett i forhold til startverdien ${no(r0)} % er det ${no(e.abs())} %.`,
      },
    ];
    parts[2].prompt = parts[2].prompt.replace('ett prosentpoeng', `${no(pp.abs())} prosentpoeng`);
    return { title: 'Prosent eller prosentpoeng?', intro: '', context: what, parts, params: { r0: r0.toString(), r1: r1.toString() }, skills: ['pst.poeng', 'pst.endring', 'pst.tolke'], structureKey: 'pst-poeng', estMinutes: 8 };
  },
};

const tplToEndringer: TemplateDef = {
  id: 'pst-to-endringer',
  version: 1,
  level: 3,
  style: 'standard',
  name: 'Endret forutsetning: to endringer etter hverandre',
  description: 'Prosenter kan ikke legges sammen når grunnlaget endrer seg.',
  skills: ['pst.vekstfaktor', 'pst.tolke'],
  build: (rng) => {
    const p1 = pick(rng, [10, 20, 25, 40, 50]);
    const p2 = pick(rng, [10, 20, 25, 40]);
    const it = pick(rng, ITEMS);
    const f = R(100 + p1).div(R(100)).mul(R(100 - p2).div(R(100)));
    const tot = f.sub(R(1)).mul(R(100));
    const parts: GenPart[] = [
      {
        id: 'a',
        label: 'a',
        prompt: `${it.what} øker først med ${p1} % og faller deretter med ${p2} %. Hva er den samlede prosentvise endringen?`,
        kind: 'beregning',
        skills: ['pst.vekstfaktor'],
        math: { symbols: [], defs: {}, param: 'x', unknown: 'x', solution: {}, answerSymbols: ['e'] },
        targets: [{ symbol: 'e', label: 'Samlet prosentvis endring', value: tot.toString(), percent: true, minDecimals: 0, aliases: ['samlet', 'endring', 'total'] }],
        solution: [
          step(`${texNum(R(100 + p1).div(R(100)))} \\cdot ${texNum(R(100 - p2).div(R(100)))} = ${texNum(f)}`, 'Gang vekstfaktorene', 'Den andre endringen regnes av den nye verdien, ikke av startverdien. Derfor ganger vi vekstfaktorene.', 'avledet sammenheng' as never),
          step(`(${texNum(f)} - 1) \\cdot 100\\,\\% = ${texNum(tot)}\\,\\%`, 'Gjør om til prosentvis endring', '', 'identitet'),
        ].map((s) => ({ ...s, kind: s.kind === ('avledet sammenheng' as never) ? 'omforming' : s.kind })),
        hints: {
          small: `Blir svaret ${p1 - p2} %? Hvilket grunnlag har den andre endringen?`,
          firstStep: `Vekstfaktoren for +${p1} % er ${no(R(100 + p1).div(R(100)))}, og for −${p2} % er den ${no(R(100 - p2).div(R(100)))}.`,
          stepExplanation: 'Den andre prosenten regnes av en annen verdi enn den første. Derfor kan vi ikke bare legge sammen prosentene.',
          workedExample: { intro: '+50 % og så −50 %:', steps: [step('1{,}5 \\cdot 0{,}5 = 0{,}75', '', '', 'omforming'), step('-25\\,\\%', 'Samlet nedgang på 25 %', '', 'tolkning')] },
        },
        methodCheckpoints: [{ id: 'vekstfaktor', label: 'Brukte vekstfaktorer', skill: 'pst.vekstfaktor', detect: { type: 'verdi', value: f.toString(), symbols: [] }, required: false }],
      },
      {
        id: 'b',
        label: 'b',
        prompt: `Forklar hvorfor svaret ikke er ${p1 - p2} %.`,
        kind: 'forklaring',
        skills: ['pst.tolke'],
        rubric: [
          { id: 'k1', text: 'Forklarer at den andre endringen regnes av en annen (ny) verdi enn den første.', basis: 'faglig-tolkning', required: true },
          { id: 'k2', text: 'Bruker tall eller vekstfaktorer for å vise forskjellen.', basis: 'faglig-tolkning', required: false },
        ],
        solution: [step('', 'Modellsvar', `Etter økningen er grunnlaget større, så ${p2} % av den nye verdien er et annet kronebeløp enn ${p2} % av startverdien. Prosentene har ulikt grunnlag og kan ikke legges sammen.`, 'tolkning')],
        hints: { small: 'Hva er grunnlaget for den andre endringen?', firstStep: 'Prøv med 100 kr som startverdi.', stepExplanation: 'Prosent er alltid prosent av noe.', workedExample: { intro: '', steps: [] } },
        methodCheckpoints: [{ id: 'forklaring', label: 'Forklarte grunnlagseffekten', skill: 'pst.tolke', detect: { type: 'forklaring' }, required: true }],
        modelAnswer: 'Den andre prosenten regnes av en annen verdi enn den første, så prosentene kan ikke legges sammen.',
      },
    ];
    return { title: 'To prosentvise endringer', intro: '', context: it.what, parts, params: { p1: String(p1), p2: String(p2) }, skills: ['pst.vekstfaktor', 'pst.tolke'], structureKey: 'pst-to-endringer', estMinutes: 7 };
  },
};

const tplInntekt: TemplateDef = {
  id: 'pst-inntekt',
  version: 1,
  level: 4,
  style: 'standard',
  name: 'Blandet eksamensoppgave: pris, mengde og inntekt',
  description: 'Kombinerer prosentvis endring med inntekt = pris · mengde.',
  skills: ['pst.endring', 'pst.vekstfaktor', 'pst.tolke', 'alg.innsetting'],
  build: (rng) => {
    for (let t = 0; t < 200; t++) {
      const P0 = randInt(rng, 20, 120, 5);
      const Q0 = randInt(rng, 200, 1200, 50);
      const dp = pick(rng, [10, 20, 25]);
      const dq = pick(rng, [5, 10, 20, 25]);
      const P1 = R(P0).mul(R(100 + dp)).div(R(100));
      const Q1 = R(Q0).mul(R(100 - dq)).div(R(100));
      if (!P1.isInteger() || !Q1.isInteger()) continue;
      const R0 = R(P0).mul(R(Q0));
      const R1 = P1.mul(Q1);
      const e = R1.sub(R0).div(R0).mul(R(100));
      const parts: GenPart[] = [
        {
          id: 'a',
          label: 'a',
          prompt: `Et studentkafé-selskap økte prisen på lunsj fra ${P0} kr til ${no(P1)} kr. Antall solgte lunsjer per måned falt fra ${Q0} til ${no(Q1)}. Hvor mange prosent endret prisen og mengden seg?`,
          kind: 'beregning',
          skills: ['pst.endring'],
          math: { symbols: [], defs: {}, param: 'x', unknown: 'x', solution: {}, answerSymbols: ['p', 'q', 'e'] },
          targets: [
            { symbol: 'p', label: 'Prisendring i prosent', value: String(dp), percent: true, aliases: ['pris', 'prisendring'] },
            { symbol: 'q', label: 'Mengdeendring i prosent (nedgang)', value: String(dq), percent: true, aliases: ['mengde', 'antall', 'mengdeendring'] },
          ],
          solution: [
            step(`\\frac{${texNum(P1)} - ${P0}}{${P0}} = ${texNum(R(dp).div(R(100)))} = ${dp}\\,\\%`, 'Prisen', '', 'definisjon'),
            step(`\\frac{${texNum(Q1)} - ${Q0}}{${Q0}} = ${texNum(R(-dq).div(R(100)))} = -${dq}\\,\\%`, 'Mengden', '', 'definisjon'),
          ],
          hints: { small: 'To separate prosentvise endringer, hver med sin startverdi.', firstStep: `Prisen: (${no(P1)} − ${P0}) / ${P0}.`, stepExplanation: 'Samme formel to ganger.', workedExample: { intro: '', steps: [] } },
          methodCheckpoints: [],
        },
        {
          id: 'b',
          label: 'b',
          prompt: 'Hvor mange prosent endret inntekten (pris · mengde) seg?',
          kind: 'beregning',
          skills: ['pst.vekstfaktor', 'alg.innsetting'],
          math: { symbols: ['TR'], defs: {}, param: 'x', unknown: 'x', solution: { TR: R1.toString() }, answerSymbols: ['e'] },
          targets: [{ symbol: 'e', label: 'Endring i inntekt (%)', value: e.toString(), percent: true, minDecimals: 0, aliases: ['inntekt', 'endring'] }],
          solution: [
            step(`${P0} \\cdot ${Q0} = ${texNum(R0)}`, 'Inntekt før', '', 'innsetting'),
            step(`${texNum(P1)} \\cdot ${texNum(Q1)} = ${texNum(R1)}`, 'Inntekt etter', '', 'innsetting'),
            step(`\\frac{${texNum(R1)} - ${texNum(R0)}}{${texNum(R0)}} = ${texNum(e)}\\,\\%`, 'Prosentvis endring i inntekt', 'Alternativt: vekstfaktorene ganges, (1 + p)(1 − q) − 1.', 'definisjon'),
          ],
          hints: { small: 'Inntekt er pris ganger mengde. Regn ut før og etter.', firstStep: `Før: ${P0} · ${Q0}.`, stepExplanation: `Du kan ikke trekke ${dq} fra ${dp}: endringene ganges, fordi inntekten er et produkt.`, workedExample: { intro: '', steps: [] } },
          methodCheckpoints: [{ id: 'r1', label: 'Regnet ut inntekt etter endringen', skill: 'alg.innsetting', detect: { type: 'verdi', value: R1.toString(), symbols: ['TR'] }, required: false }],
        },
        {
          id: 'c',
          label: 'c',
          prompt: 'Var prisøkningen lønnsom målt i inntekt? Drøft kort hva mer en bedrift burde vite før den konkluderer.',
          kind: 'forklaring',
          skills: ['pst.tolke'],
          rubric: [
            { id: 'k1', text: `Konkluderer riktig om inntekten økte eller falt (${e.sign() >= 0 ? 'økte' : 'falt'} med ${no(e.abs())} %).`, basis: 'faglig-tolkning', required: true },
            { id: 'k2', text: 'Påpeker at inntekt ikke er det samme som overskudd: kostnadene endres også når mengden endres.', basis: 'faglig-tolkning', required: true },
            { id: 'k3', text: 'Nevner andre forhold (f.eks. at andre ting også kan ha endret seg i perioden).', basis: 'faglig-tolkning', required: false },
          ],
          solution: [step('', 'Modellsvar', `Inntekten ${e.sign() >= 0 ? 'økte' : 'falt'} med ${no(e.abs())} %. Om det var lønnsomt, avhenger også av kostnadene: færre solgte lunsjer gir lavere variable kostnader. Bedriften bør også vurdere om andre forhold endret seg samtidig.`, 'tolkning')],
          hints: { small: 'Er høyere inntekt det samme som høyere overskudd?', firstStep: 'Tenk på hva som skjer med kostnadene når det selges færre lunsjer.', stepExplanation: 'Lønnsomhet handler om inntekt minus kostnad.', workedExample: { intro: '', steps: [] } },
          methodCheckpoints: [{ id: 'forklaring', label: 'Drøftet lønnsomhet', skill: 'pst.tolke', detect: { type: 'forklaring' }, required: true }],
          modelAnswer: 'Inntekten endret seg, men lønnsomhet avhenger også av kostnadene.',
        },
      ];
      return { title: 'Pris, mengde og inntekt', intro: '', context: 'studentkafé', parts, params: { P0: String(P0), Q0: String(Q0), dp: String(dp), dq: String(dq) }, skills: ['pst.endring', 'pst.vekstfaktor', 'pst.tolke', 'alg.innsetting'], structureKey: 'pst-inntekt', estMinutes: 14 };
    }
    throw new Error('Fant ikke gyldige parametere');
  },
};

const tplDrillAndel: TemplateDef = {
  id: 'drill-andel',
  version: 1,
  level: 1,
  style: 'delferdighet',
  name: 'Delferdighet: prosent av et tall',
  description: 'Regn ut en prosentandel.',
  skills: ['pst.andel'],
  build: (rng) => {
    const pct = pick(rng, [5, 10, 15, 20, 25, 30, 40, 75]);
    const base = randInt(rng, 20, 400, 20);
    const val = R(base).mul(R(pct)).div(R(100));
    const part: GenPart = {
      id: 'a',
      label: 'a',
      prompt: `Hva er ${pct} % av ${base}?`,
      kind: 'beregning',
      skills: ['pst.andel'],
      math: { symbols: [], defs: {}, param: 'x', unknown: 'x', solution: {}, answerSymbols: ['x'] },
      targets: [{ symbol: 'x', label: 'Svar', value: val.toString() }],
      solution: [step(`${base} \\cdot ${texNum(R(pct).div(R(100)))} = ${texNum(val)}`, `${pct} % er ${no(R(pct).div(R(100)))}`, 'Prosent betyr hundredeler.', 'identitet')],
      hints: { small: `${pct} % betyr ${pct} hundredeler.`, firstStep: `${base} · ${no(R(pct).div(R(100)))}`, stepExplanation: '«Av» betyr ganger når vi regner med andeler.', workedExample: { intro: '20 % av 50:', steps: [step('50 \\cdot 0{,}2 = 10', '', '', 'identitet')] } },
      methodCheckpoints: [],
    };
    return { title: 'Prosent av et tall', intro: '', context: 'prosent', parts: [part], params: { pct: String(pct), base: String(base) }, skills: ['pst.andel'], structureKey: 'drill-andel', estMinutes: 1 };
  },
};

const tplFinnFeil: TemplateDef = {
  id: 'pst-finnfeil',
  version: 1,
  level: 2,
  style: 'finn-feilen',
  name: 'Finn og forklar feilen',
  description: 'En beregning med feil grunnlag.',
  skills: ['pst.endring'],
  build: (rng) => {
    const { V0, V1, up } = niceChange(rng);
    const it = pick(rng, ITEMS);
    const diff = V1.sub(V0);
    const wrong = diff.div(V1).mul(R(100));
    const right = diff.div(V0).mul(R(100));
    const lines = [`${no(V1)} − ${no(V0)} = ${no(diff)}`, `${no(diff)} / ${no(V1)} = ${no(diff.div(V1), 4)}`, `≈ ${no(wrong.round(1))} %`];
    const part: GenPart = {
      id: 'a',
      label: 'a',
      prompt: `${it.what} ${up ? 'økte' : 'falt'} fra ${no(V0)} til ${no(V1)} ${it.unit}. En student regnet slik. Hvilken linje inneholder feilen? Skriv riktig utregning.`,
      kind: 'finn-feilen',
      skills: ['pst.endring'],
      flawed: { lines, errorLine: 1, correction: `Endringen skal deles på startverdien ${no(V0)}, ikke på ${no(V1)}.` },
      math: pctCtx(V0, V1),
      targets: [{ symbol: 'e', label: 'Riktig prosent', value: right.abs().toString(), percent: true, minDecimals: 0, aliases: ['endring', 'prosent'] }],
      solution: pctSolution(V0, V1, up),
      hints: { small: 'Hvilket tall er grunnlaget for en prosentvis endring?', firstStep: 'Se på nevneren i linje 2.', stepExplanation: 'Grunnlaget er alltid det vi sammenlikner med: startverdien.', workedExample: { intro: '', steps: [] } },
      methodCheckpoints: [],
    };
    return { title: 'Finn feilen', intro: '', context: it.what, parts: [part], params: { V0: V0.toString(), V1: V1.toString() }, skills: ['pst.endring'], structureKey: 'pst-finnfeil', estMinutes: 3 };
  },
};

function recognize(text: string): RecognizeResult | null {
  const num = '(\\d{1,3}(?:[\\u00a0 ]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)';
  const unit = '(%|prosent|kr|kroner|mill\\.?\\s*kr|millioner|mrd\\.?)?';
  const re = new RegExp(`(økte|økt|steg|falt|sank|gikk (?:opp|ned)|redusert|endret seg|ble (?:økt|redusert))\\s+fra\\s+${num}\\s*${unit}[^\\d]{0,20}?\\s+til\\s+${num}\\s*${unit}`, 'i');
  const m = re.exec(text);
  if (!m) return null;
  const v0 = readNumber(m[2]);
  const v1 = readNumber(m[4]);
  if (v0 === null || v1 === null || v0 === 0) return null;
  const isRate = /%|prosent/.test(m[3] ?? '') || /%|prosent/.test(m[5] ?? '');
  return {
    params: { V0: Rat.fromNumber(v0).toString(), V1: Rat.fromNumber(v1).toString(), rate: isRate ? '1' : '0' },
    basis: `Fant «${m[0].trim()}» i teksten.`,
    strength: /prosent|%/.test(text) ? 0.9 : 0.6,
  };
}

const intents: IntentDef[] = [
  {
    id: 'pst.tilbake',
    specific: true,
    label: 'Prosent tilbake til startverdien',
    match: [/tilbake til|komme tilbake|samme (?:pris|nivå) som før/i],
    skills: ['pst.endring', 'pst.tolke'],
    taskType: ['beregning', 'tolkning'],
    assignment: 'Finne hvor mange prosent verdien må endres for å komme tilbake til startverdien, med den nye verdien som grunnlag.',
    interpretation: ['Du må bruke den nye verdien som grunnlag, fordi endringen tilbake starter der.', 'Du bør vise at svaret er et annet enn den første prosenten.'],
    prerequisites: ['Prosentvis endring'],
    misconceptions: ['Bruker samme prosent tilbake som fram', 'Deler på den opprinnelige startverdien'],
    variation: ['Kan spørres som «hvor mye må prisen falle» eller «hva blir prisen etter …»'],
    estMinutes: 4,
    compute: (p) => {
      const V0 = R(p.V0);
      const V1 = R(p.V1);
      const e = V1.sub(V0).div(V1).mul(R(100)).abs();
      return [{ label: 'Nødvendig prosentvis endring tilbake', value: e.toString(), display: `${no(e, 2)} %`, unit: '%' }];
    },
  },
  {
    id: 'pst.gjentatt',
    specific: true,
    label: 'Ny endring fra en ny verdi',
    match: [/(?:falt|økte|steg|sank|reduseres|øker)\s+(?:\S+\s+){0,3}med\s+\d+(?:[.,]\d+)?\s*%/i],
    skills: ['pst.vekstfaktor', 'pst.tolke'],
    taskType: ['beregning', 'forklaring'],
    assignment: 'Regne ut en ny verdi etter en ny prosentvis endring, og forklare hvorfor grunnlaget har endret seg.',
    interpretation: ['Du må bruke den nye verdien som grunnlag for den neste endringen.', 'Du må forklare hvorfor samme prosent opp og ned ikke gir startverdien.'],
    prerequisites: ['Vekstfaktor'],
    misconceptions: ['Tror at +x % og −x % opphever hverandre', 'Regner den andre endringen av den opprinnelige verdien'],
    variation: ['Rekkefølgen på endringene', 'Om oppgaven spør om ny verdi eller samlet prosent'],
    estMinutes: 7,
    compute: (p, text) => {
      const m = /(falt|økte|steg|sank|reduseres|øker)\s+(?:\S+\s+){0,3}med\s+(\d+(?:[.,]\d+)?)\s*%/i.exec(text);
      if (!m) return null;
      const pct = Rat.parseDecimal(m[2]);
      const down = /falt|sank|reduseres/i.test(m[1]);
      const base = R(p.V1);
      const f = R(100).add(down ? pct.neg() : pct).div(R(100));
      const nv = base.mul(f);
      return [{ label: 'Ny verdi', value: nv.toString(), display: no(nv, 2), unit: 'kr' }];
    },
  },
  {
    id: 'pst.poeng',
    specific: true,
    label: 'Prosentpoeng',
    match: [/prosentpoeng/i],
    skills: ['pst.poeng', 'pst.endring'],
    taskType: ['beregning', 'sammenlikning'],
    assignment: 'Skille mellom endring i prosentpoeng og prosentvis endring.',
    interpretation: ['Du må regne ut differansen i prosentpoeng.', 'Du må regne ut prosentvis endring med startverdien som grunnlag.', 'Du bør forklare forskjellen på de to målene.'],
    prerequisites: ['Prosentvis endring'],
    misconceptions: ['Kaller differansen mellom to prosenttall for «prosent»'],
    variation: ['Kan spørre om begge mål eller bare ett'],
    estMinutes: 5,
    compute: (p) => {
      const V0 = R(p.V0);
      const V1 = R(p.V1);
      const e = V1.sub(V0).div(V0).mul(R(100));
      return [
        { label: 'Endring i prosentpoeng', value: V1.sub(V0).toString(), display: no(V1.sub(V0)), unit: 'prosentpoeng' },
        { label: 'Prosentvis endring', value: e.toString(), display: `${no(e, 2)} %`, unit: '%' },
      ];
    },
  },
  {
    id: 'pst.tolke',
    label: 'Tolke prosentvis endring',
    match: [/(forklar|hvorfor|tolk|drøft).{0,80}(prosent|tilbake|samme)/i],
    skills: ['pst.tolke'],
    taskType: ['forklaring'],
    assignment: 'Forklare hva en prosentvis endring betyr og hvorfor grunnlaget avgjør svaret.',
    interpretation: ['Du må peke på hvilket grunnlag prosenten er regnet av.', 'Du bør bruke tallene til å vise poenget.'],
    prerequisites: ['Prosentvis endring'],
    misconceptions: ['Tror +x % og −x % opphever hverandre'],
    variation: ['Kan handle om to påfølgende endringer eller om prosentpoeng'],
    estMinutes: 5,
  },
  {
    id: 'pst.endring',
    label: 'Beregne prosentvis endring',
    match: [/(hvor mange prosent(?!poeng)|prosentvis|prosentvise)/i],
    skills: ['pst.endring'],
    taskType: ['beregning'],
    assignment: 'Beregne den prosentvise endringen fra en startverdi til en sluttverdi.',
    interpretation: ['Du må dele endringen på startverdien.', 'Du må oppgi svaret i prosent med riktig retning (økning eller nedgang).'],
    prerequisites: ['Regne med prosent og andeler'],
    misconceptions: ['Deler på den nye verdien i stedet for startverdien', 'Oppgir endringen i kroner i stedet for prosent'],
    variation: ['Kan be om ny verdi eller startverdi i stedet (annen ukjent)', 'Kan kombineres med flere endringer'],
    estMinutes: 4,
    compute: (p) => {
      const V0 = R(p.V0);
      const V1 = R(p.V1);
      const e = V1.sub(V0).div(V0).mul(R(100));
      return [{ label: 'Prosentvis endring', value: e.toString(), display: `${no(e, 2)} %`, unit: '%' }];
    },
  },
];

export const prosent: FamilyKB = {
  id: 'prosent-endring',
  name: 'Beregne og tolke prosentvis endring med riktig grunnlag',
  shortName: 'Prosentvis endring',
  topic: 'Prosent og vekst',
  subtopics: ['Prosentvis endring', 'Prosentpoeng', 'Vekstfaktor'],
  description: 'Oppgaver der en størrelse endres fra én verdi til en annen, og studenten skal regne og tolke endringen relativt til et grunnlag.',
  skills: ['pst.endring', 'pst.baklengs', 'pst.poeng', 'pst.vekstfaktor', 'pst.tolke', 'pst.andel'],
  formulas: [
    {
      id: 'f-pst',
      tex: '\\text{Prosentvis endring} = \\frac{V_1 - V_0}{V_0} \\cdot 100\\,\\%',
      name: 'Prosentvis endring',
      kind: 'definisjon',
      kindWhy: 'Dette er selve definisjonen av prosentvis endring. Den kan ikke utledes fra noe annet.',
      symbols: [
        { sym: 'V_0', meaning: 'Startverdi (grunnlaget)', unit: 'samme enhet som størrelsen' },
        { sym: 'V_1', meaning: 'Sluttverdi', unit: 'samme enhet' },
      ],
      conditions: ['V0 ≠ 0'],
      whatIf: ['Samme endring i kroner gir større prosent når startverdien er liten.', 'En nedgang gir negativt tall.'],
      figure: 'prosent',
    },
    {
      id: 'f-vekst',
      tex: 'V_1 = V_0 \\cdot \\left(1 + \\frac{p}{100}\\right)',
      name: 'Vekstfaktor',
      kind: 'avledet sammenheng',
      kindWhy: 'Følger av definisjonen ved å løse for V1. Den er like sann som definisjonen, bare skrevet om.',
      symbols: [
        { sym: 'p', meaning: 'Endring i prosent (negativ ved nedgang)', unit: '%' },
        { sym: '1 + p/100', meaning: 'Vekstfaktoren', unit: 'uten enhet' },
      ],
      conditions: ['p > −100'],
      whatIf: ['To endringer etter hverandre: gang vekstfaktorene.'],
      derivation: [
        step('\\frac{p}{100} = \\frac{V_1 - V_0}{V_0}', 'Start med definisjonen', '', 'definisjon'),
        step('V_0 \\cdot \\frac{p}{100} = V_1 - V_0', 'Gang med V0', '', 'omforming'),
        step('V_1 = V_0\\left(1 + \\frac{p}{100}\\right)', 'Legg til V0 og faktoriser', '', 'omforming'),
      ],
      figure: 'prosent',
    },
    {
      id: 'f-poeng',
      tex: '\\text{Prosentpoeng} = r_1 - r_0',
      name: 'Endring i prosentpoeng',
      kind: 'definisjon',
      kindWhy: 'En definisjon av et annet mål på endring når størrelsen selv er i prosent.',
      symbols: [
        { sym: 'r_0, r_1', meaning: 'To prosenttall, f.eks. renter', unit: '%' },
      ],
      conditions: ['Brukes bare når størrelsen selv måles i prosent.'],
      whatIf: ['Fra 2 % til 3 % er 1 prosentpoeng, men 50 % økning.'],
      figure: 'prosent',
    },
  ],
  intents,
  templates: [tplGrunn, tplFading, tplBaklengs, tplPoeng, tplToEndringer, tplInntekt, tplDrillAndel, tplFinnFeil],
  misconceptions: [
    { id: 'feil-grunnlag', label: 'Deler på den nye verdien', explanation: 'Grunnlaget er startverdien. Å dele på den nye verdien gir et annet (feil) tall.' },
    { id: 'absolutt', label: 'Svarer med endringen i kroner', explanation: 'Oppgaven spør om endringen relativt til startverdien.' },
    { id: 'legger-sammen', label: 'Legger sammen prosenter ved flere endringer', explanation: 'Grunnlaget endrer seg etter første endring. Vekstfaktorene må ganges.' },
    { id: 'poeng-prosent', label: 'Blander prosent og prosentpoeng', explanation: 'Prosentpoeng er differansen; prosent er differansen delt på startverdien.' },
  ],
  recognize,
  explanations: {
    short: (p) => {
      const V0 = R(p.V0 ?? '80');
      const V1 = R(p.V1 ?? '92');
      return { text: 'Prosentvis endring er endringen delt på startverdien. Startverdien er grunnlaget vi sammenlikner med.', example: `Fra ${no(V0)} til ${no(V1)}: (${no(V1)} − ${no(V0)}) / ${no(V0)} = ${no(V1.sub(V0).div(V0).mul(R(100)), 2)} %.` };
    },
    analogy: { text: 'Tenk på det som å vokse: en valp som går fra 2 til 4 kg har doblet seg, mens en voksen hund som går fra 30 til 32 kg nesten ikke har endret seg. Samme kilo, ulikt utgangspunkt.', limits: 'Analogien viser hvorfor grunnlaget betyr noe, men sier ikke noe om prosentpoeng eller om negative endringer.' },
    derivationFormulaId: 'f-vekst',
  },
  solutionStructure: ['Finne endringen', 'Dele på startverdien', 'Gjøre om til prosent', 'Angi retning'],
  surfaceFeatures: ['Hva som endres (pris, omsetning, antall)', 'Om det er økning eller nedgang'],
};

void (0 as unknown as SolutionStep);
