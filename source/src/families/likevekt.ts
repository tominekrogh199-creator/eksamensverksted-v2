// Familie: Finne og tolke markedslikevekt fra lineær tilbud og etterspørsel.
// Modell: Qd = a − bP, Qs = c + dP (b, d > 0). Likevekt: Qd = Qs.
// P* = (a − c)/(b + d), Q* = a − bP*.

import { Rat } from '../math/rational';
import { parseExpr } from '../math/parse';
import { toRF } from '../math/poly';
import type { GenPart, MethodCheckpoint, RubricItem } from '../domain/types';
import {
  FamilyKB, TemplateDef, Rng, randInt, pick, shuffle, R, no, texNum, linExpr, step, GenOptions, IntentDef, RecognizeResult, partId,
} from './common';

export const CONTEXTS = [
  { good: 'kaffe fra kaffebarer på campus', unit: 'kopper', per: 'dag', price: 'kr per kopp', seller: 'kaffebarene', buyer: 'studentene' },
  { good: 'økologiske epler', unit: 'kg', per: 'uke', price: 'kr per kg', seller: 'produsentene', buyer: 'kundene' },
  { good: 'leiesykler i en by', unit: 'utleietimer', per: 'dag', price: 'kr per time', seller: 'utleierne', buyer: 'syklistene' },
  { good: 'brukte lærebøker', unit: 'bøker', per: 'semester', price: 'kr per bok', seller: 'selgerne', buyer: 'kjøperne' },
  { good: 'billetter til en studentrevy', unit: 'billetter', per: 'forestilling', price: 'kr per billett', seller: 'arrangørene', buyer: 'publikum' },
  { good: 'fiskekaker på et lokalt marked', unit: 'pakker', per: 'uke', price: 'kr per pakke', seller: 'fiskebutikkene', buyer: 'kundene' },
] as const;

export type Ctx = (typeof CONTEXTS)[number];

/** Uttrykk som parseren leser entydig (punktum som desimaltegn internt). */
export function defLin(konst: Rat, coef: Rat, v: string): string {
  const k = konst.isExactDecimal(6) ? konst.toNumber().toString() : `(${konst.toString()})`;
  const c = coef.isExactDecimal(6) ? coef.toNumber().toString() : `(${coef.toString()})`;
  return `${k} + (${c})*${v}`;
}

export function eqParams(p: Record<string, string>) {
  const a = R(p.a);
  const b = R(p.b);
  const c = R(p.c);
  const d = R(p.d);
  const P = a.sub(c).div(b.add(d));
  const Q = a.sub(b.mul(P));
  return { a, b, c, d, P, Q };
}

export function eqCheckpoints(P: Rat, Q: Rat, a: Rat, b: Rat, c: Rat, d: Rat, withControl = true): MethodCheckpoint[] {
  const cps: MethodCheckpoint[] = [
    { id: 'oppsett', label: 'Satte opp likevektsbetingelsen Qd = Qs', skill: 'lik.betingelse', detect: { type: 'oppsett', v: 'P' }, required: true },
    { id: 'isolering', label: `Isolerte P og fant P = ${no(P)}`, skill: 'alg.isolere', detect: { type: 'isolering', v: 'P' }, required: true },
    { id: 'innsetting', label: `Fant Q ved å sette prisen inn`, skill: 'alg.innsetting', detect: { type: 'verdi', value: Q.toString(), symbols: ['Q', 'Qd', 'Qs'] }, required: true },
  ];
  if (withControl) cps.push({ id: 'kontroll', label: 'Kontrollerte kvantumet i begge uttrykk', skill: 'lik.kontroll', detect: { type: 'kontroll', value: Q.toString(), count: 2 }, required: false });
  void a; void b; void c; void d;
  return cps;
}

export function eqSolution(a: Rat, b: Rat, c: Rat, d: Rat) {
  const P = a.sub(c).div(b.add(d));
  const Q = a.sub(b.mul(P));
  const k = a.sub(c);
  const m = b.add(d);
  const cMove = c.isZero() ? '' : c.sign() > 0 ? ` og trekker fra ${no(c)} på begge sider` : ` og legger til ${no(c.neg())} på begge sider`;
  const qsTex = c.isZero() ? `${texNum(d)} \\cdot ${texNum(P)}` : `${texNum(c)} + ${texNum(d)} \\cdot ${texNum(P)}`;
  return [
    step('Q_d = Q_s', 'Likevektsbetingelsen: Qd = Qs', 'I denne modellen er markedet i likevekt når kjøperne vil kjøpe akkurat like mye som selgerne vil selge. Det er definisjonen av likevekt her.', 'definisjon'),
    step(`${linExpr(a, b.neg(), 'P', 'tex')} = ${linExpr(c, d, 'P', 'tex')}`, 'Sett inn uttrykkene', 'Vi erstatter Qd og Qs med uttrykkene fra oppgaven. Da får vi én likning med én ukjent.', 'innsetting'),
    step(`${texNum(k)} = ${texNum(m)}P`, 'Samle P-leddene på én side og tallene på den andre', `Vi legger til ${no(b)}P på begge sider${cMove}. Da står alle P-leddene til høyre: ${no(d)}P + ${no(b)}P = ${no(m)}P.`, 'omforming'),
    step(`P = \\frac{${texNum(k)}}{${texNum(m)}} = ${texNum(P)}`, 'Del begge sider på tallet foran P', `${no(m)}P betyr ${no(m)} ganger P. For å få P alene deler vi begge sider på ${no(m)}.`, 'omforming'),
    step(`Q = ${texNum(a)} - ${texNum(b)} \\cdot ${texNum(P)} = ${texNum(Q)}`, 'Sett prisen inn i etterspørselen', 'Likevektskvantumet er det kvantumet som etterspørres (og tilbys) ved likevektsprisen.', 'innsetting'),
    step(`Q_s = ${qsTex} = ${texNum(Q)}`, `Kontroll: tilbudet gir også ${no(Q)}`, 'Setter vi samme pris inn i tilbudet, skal vi få samme kvantum. Gjør vi ikke det, er det en regnefeil et sted.', 'kontroll'),
  ];
}

function niceEq(rng: Rng, opts?: { allowNegC?: boolean; maxA?: number }) {
  for (let tries = 0; tries < 200; tries++) {
    const P = randInt(rng, 6, 48);
    const b = randInt(rng, 1, 5);
    const d = randInt(rng, 1, 5);
    const Q = randInt(rng, 20, 180, 5);
    const a = Q + b * P;
    const c = Q - d * P;
    if (a > (opts?.maxA ?? 360)) continue;
    if (!opts?.allowNegC && c < 0) continue;
    if (c <= -120) continue;
    if (b === d && rng() < 0.6) continue;
    return { a, b, c, d, P, Q };
  }
  return { a: 120, b: 2, c: 20, d: 3, P: 20, Q: 80 };
}

function exampleParams(avoidP: number) {
  const set = [
    { a: 90, b: 1, c: 10, d: 3, P: 20, Q: 70 },
    { a: 150, b: 3, c: 30, d: 3, P: 20, Q: 90 },
    { a: 100, b: 2, c: 10, d: 4, P: 15, Q: 70 },
  ].filter((s) => s.P !== avoidP);
  return set[0];
}

export function eqHints(a: Rat, b: Rat, c: Rat, d: Rat) {
  const ex = exampleParams(Number(a.sub(c).div(b.add(d)).toNumber()));
  const [ea, eb, ec, ed] = [R(ex.a), R(ex.b), R(ex.c), R(ex.d)];
  return {
    small: 'Hva kjennetegner likevekt i denne modellen? Prøv å skrive det som en likning med Qd og Qs.',
    firstStep: `Start med Qd = Qs og sett inn uttrykkene: ${linExpr(a, b.neg(), 'P')} = ${linExpr(c, d, 'P')}.`,
    stepExplanation: 'Likevekt betyr at kjøperne vil kjøpe akkurat like mye som selgerne vil selge. Derfor setter vi de to uttrykkene lik hverandre. Da får vi én likning der P er den eneste ukjente, og den kan vi løse.',
    workedExample: {
      intro: `Eksempel med andre tall: Qd = ${linExpr(ea, eb.neg(), 'P')} og Qs = ${linExpr(ec, ed, 'P')}.`,
      steps: eqSolution(ea, eb, ec, ed),
    },
  };
}

export function eqMathCtx(a: Rat, b: Rat, c: Rat, d: Rat, P: Rat, Q: Rat) {
  return {
    symbols: ['Qd', 'Qs'],
    defs: { Qd: defLin(a, b.neg(), 'P'), Qs: defLin(c, d, 'P') },
    param: 'P',
    unknown: 'P',
    solution: { P: P.toString(), Q: Q.toString(), Qd: Q.toString(), Qs: Q.toString() },
  };
}

export function interpretationRubric(P: Rat, Q: Rat, ctx: Ctx, withModel: boolean): RubricItem[] {
  const r: RubricItem[] = [
    { id: 'k1', text: `Sier at ved prisen ${no(P)} ${ctx.price} vil ${ctx.buyer} kjøpe like mye som ${ctx.seller} vil selge (${no(Q)} ${ctx.unit}).`, basis: 'faglig-tolkning', required: true },
    { id: 'k2', text: 'Forklarer at det verken er overskudd eller mangel, og at det derfor ikke er noe press på prisen til å endre seg.', basis: 'faglig-tolkning', required: true },
    { id: 'k3', text: 'Knytter forklaringen til tallene og enhetene i oppgaven.', basis: 'faglig-tolkning', required: false },
  ];
  if (withModel) r.push({ id: 'k4', text: 'Skiller modellen fra virkeligheten: likevekten gjelder under modellens forutsetninger (mange kjøpere og selgere, lineære sammenhenger, alt annet likt).', basis: 'faglig-tolkning', required: false });
  return r;
}

function introText(ctx: Ctx, a: Rat, b: Rat, c: Rat, d: Rat) {
  return `I et marked for ${ctx.good} er etterspørselen og tilbudet gitt ved\nQd = ${linExpr(a, b.neg(), 'P')}  og  Qs = ${linExpr(c, d, 'P')},\nder P er prisen (${ctx.price}) og Q er antall ${ctx.unit} per ${ctx.per}.`;
}

function calcPart(label: string, prompt: string, a: Rat, b: Rat, c: Rat, d: Rat, extraSkills: string[] = []): GenPart {
  const P = a.sub(c).div(b.add(d));
  const Q = a.sub(b.mul(P));
  return {
    id: label,
    label,
    prompt,
    kind: 'beregning',
    skills: ['lik.betingelse', 'lik.losning', 'alg.isolere', 'alg.innsetting', ...extraSkills],
    math: eqMathCtx(a, b, c, d, P, Q),
    targets: [
      { symbol: 'P', label: 'Likevektspris', value: P.toString(), minDecimals: P.isInteger() ? 0 : 1, aliases: ['pris', 'likevektspris'] },
      { symbol: 'Q', label: 'Likevektskvantum', value: Q.toString(), minDecimals: Q.isInteger() ? 0 : 1, aliases: ['kvantum', 'mengde', 'likevektskvantum'] },
    ],
    solution: eqSolution(a, b, c, d),
    hints: eqHints(a, b, c, d),
    methodCheckpoints: eqCheckpoints(P, Q, a, b, c, d),
  };
}

export function equilibriumBody(a: Rat, b: Rat, c: Rat, d: Rat, ctx: Ctx, opts: { withInterp: boolean; fade?: number; style?: string }) {
  const P = a.sub(c).div(b.add(d));
  const Q = a.sub(b.mul(P));
  const parts: GenPart[] = [calcPart('a', 'Finn likevektsprisen og likevektskvantumet.', a, b, c, d)];
  if (opts.withInterp)
    parts.push({
      id: 'b',
      label: 'b',
      prompt: 'Forklar kort hva likevekten betyr i dette markedet.',
      kind: 'forklaring',
      skills: ['lik.tolke'],
      rubric: interpretationRubric(P, Q, ctx, false),
      solution: [step('', 'Modellsvar', `Ved en pris på ${no(P)} ${ctx.price} ønsker ${ctx.buyer} å kjøpe ${no(Q)} ${ctx.unit} per ${ctx.per}, og ${ctx.seller} ønsker å selge nøyaktig like mange. Ingen står igjen med usolgte varer, og ingen kjøpere går tomhendte. Derfor har verken kjøpere eller selgere grunn til å presse prisen opp eller ned.`, 'tolkning')],
      hints: {
        small: 'Tenk på hva som skjer med prisen hvis det er flere som vil kjøpe enn som vil selge. Hva skjer når tallene er like?',
        firstStep: `Begynn med: «Ved prisen ${no(P)} ${ctx.price} er etterspurt kvantum lik tilbudt kvantum, ${no(Q)} ${ctx.unit}.»`,
        stepExplanation: 'En god forklaring sier både hva som er likt (kvantumene) og hvorfor prisen da blir liggende (ikke noe press opp eller ned).',
        workedExample: { intro: 'Eksempel fra et annet marked:', steps: [step('', 'Eksempel', 'Ved 50 kr per billett vil publikum kjøpe 300 billetter, og arrangøren vil selge 300. Det blir ingen kø av skuffede kjøpere og ingen usolgte billetter, så prisen har ingen grunn til å endre seg.', 'tolkning')] },
      },
      methodCheckpoints: [{ id: 'forklaring', label: 'Forklarte likevekt med egne ord', skill: 'lik.tolke', detect: { type: 'forklaring' }, required: true }],
      modelAnswer: `Ved en pris på ${no(P)} ${ctx.price} ønsker ${ctx.buyer} å kjøpe ${no(Q)} ${ctx.unit}, og ${ctx.seller} ønsker å selge like mange. Det er verken overskudd eller mangel, så prisen har ingen tendens til å endre seg.`,
    });
  const givenCount = opts.style === 'fading' ? Math.max(0, Math.min(4, opts.fade ?? 2)) : 0;
  if (givenCount > 0) parts[0].givenSteps = parts[0].solution.slice(0, givenCount).map((s) => s.tex);
  return {
    title: opts.style === 'fading' ? 'Likevekt – fullfør løsningen' : 'Likevekt i et marked',
    intro: introText(ctx, a, b, c, d),
    context: ctx.good,
    parts,
    params: { a: a.toString(), b: b.toString(), c: c.toString(), d: d.toString() },
    skills: [...new Set(parts.flatMap((p) => p.skills))],
    structureKey: `lik-grunn|${c.sign() < 0 ? 'negc' : 'posc'}|${opts.withInterp ? 'tolk' : ''}`,
    estMinutes: opts.withInterp ? 9 : 6,
  };
}

const tplGrunn: TemplateDef = {
  id: 'lik-grunn',
  version: 2,
  level: 1,
  style: 'standard',
  name: 'Samme metode, nye tall',
  description: 'Finn og tolk likevekten fra to lineære uttrykk.',
  skills: ['lik.betingelse', 'lik.losning', 'alg.isolere', 'alg.innsetting', 'lik.tolke'],
  build: (rng, opts) => {
    const e = niceEq(rng, { allowNegC: rng() < 0.3 });
    const ctx = pick(rng, CONTEXTS);
    return equilibriumBody(R(e.a), R(e.b), R(e.c), R(e.d), ctx, { withInterp: opts.style !== 'fading', fade: opts.fade, style: opts.style });
  },
};

const tplFading: TemplateDef = { ...tplGrunn, id: 'lik-fading', version: 1, style: 'fading', name: 'Gradvis færre løsningssteg', description: 'Noen steg er gitt. Fullfør resten selv.' };

const tplInvers: TemplateDef = {
  id: 'lik-invers',
  version: 1,
  level: 2,
  style: 'standard',
  name: 'Annen innpakning: pris som funksjon av kvantum',
  description: 'Uttrykkene er skrevet som P = … . Samme kompetanse, annen representasjon og annen ukjent.',
  skills: ['lik.betingelse', 'lik.losning', 'alg.isolere', 'alg.innsetting'],
  build: (rng) => {
    const ctx = pick(rng, CONTEXTS);
    for (let t = 0; t < 200; t++) {
      const beta = pick(rng, ['0.5', '1', '2', '0.25']);
      const delta = pick(rng, ['0.5', '1', '0.25', '1.5']);
      const Qs = randInt(rng, 20, 160, 4);
      const Ps = randInt(rng, 20, 120);
      const B = R(beta);
      const D = R(delta);
      const alpha = R(Ps).add(B.mul(R(Qs)));
      const gamma = R(Ps).sub(D.mul(R(Qs)));
      if (gamma.sign() <= 0 || !alpha.isInteger() || !gamma.isInteger()) continue;
      const Pst = R(Ps);
      const Qst = R(Qs);
      const cps: MethodCheckpoint[] = [
        { id: 'oppsett', label: 'Satte de to prisuttrykkene lik hverandre', skill: 'lik.betingelse', detect: { type: 'oppsett', v: 'Q' }, required: true },
        { id: 'isolering', label: `Isolerte Q og fant Q = ${no(Qst)}`, skill: 'alg.isolere', detect: { type: 'isolering', v: 'Q' }, required: true },
        { id: 'innsetting', label: 'Fant prisen ved innsetting', skill: 'alg.innsetting', detect: { type: 'verdi', value: Pst.toString(), symbols: ['P'] }, required: true },
      ];
      const m = B.add(D);
      const k = alpha.sub(gamma);
      const solution = [
        step('P_{\\text{etterspørsel}} = P_{\\text{tilbud}}', 'I likevekt er prisen kjøperne er villige til å betale lik prisen selgerne krever', 'Når begge uttrykk gir pris som funksjon av kvantum, er likevekt der de gir samme pris for samme kvantum. Det er den samme betingelsen som Qd = Qs, bare skrevet med en annen ukjent.', 'definisjon'),
        step(`${linExpr(alpha, B.neg(), 'Q', 'tex')} = ${linExpr(gamma, D, 'Q', 'tex')}`, 'Sett uttrykkene lik hverandre', 'Nå er Q den ukjente.', 'innsetting'),
        step(`${texNum(k)} = ${texNum(m)}Q`, 'Samle Q-leddene', `Legg til ${no(B)}Q og trekk fra ${no(gamma)} på begge sider.`, 'omforming'),
        step(`Q = \\frac{${texNum(k)}}{${texNum(m)}} = ${texNum(Qst)}`, 'Del på tallet foran Q', 'For å få Q alene deler vi begge sider på det samme tallet.', 'omforming'),
        step(`P = ${texNum(alpha)} - ${texNum(B)} \\cdot ${texNum(Qst)} = ${texNum(Pst)}`, 'Sett kvantumet inn for å finne prisen', 'Prisen i likevekt er det kjøperne betaler ved dette kvantumet.', 'innsetting'),
      ];
      const parts: GenPart[] = [
        {
          id: 'a',
          label: 'a',
          prompt: 'Finn likevektskvantumet og likevektsprisen.',
          kind: 'beregning',
          skills: ['lik.betingelse', 'lik.losning', 'alg.isolere', 'alg.innsetting'],
          math: { symbols: [], defs: {}, param: 'Q', unknown: 'Q', solution: { Q: Qst.toString(), P: Pst.toString() } },
          targets: [
            { symbol: 'Q', label: 'Likevektskvantum', value: Qst.toString(), aliases: ['kvantum', 'mengde'] },
            { symbol: 'P', label: 'Likevektspris', value: Pst.toString(), aliases: ['pris'] },
          ],
          solution,
          hints: {
            small: 'Begge uttrykkene gir prisen. Hva må være sant om prisene i likevekt?',
            firstStep: `Sett uttrykkene lik hverandre: ${linExpr(alpha, B.neg(), 'Q')} = ${linExpr(gamma, D, 'Q')}.`,
            stepExplanation: 'Uttrykket for etterspørselen sier hva kjøperne er villige til å betale for et gitt kvantum. Uttrykket for tilbudet sier hva selgerne må ha. I likevekt er disse like.',
            workedExample: { intro: 'Eksempel: P = 100 − Q og P = 20 + Q.', steps: [step('100 - Q = 20 + Q', 'Sett lik hverandre', '', 'innsetting'), step('80 = 2Q', 'Samle Q-leddene', '', 'omforming'), step('Q = 40', 'Del på 2', '', 'omforming'), step('P = 100 - 40 = 60', 'Sett inn', '', 'innsetting')] },
          },
          methodCheckpoints: cps,
        },
        {
          id: 'b',
          label: 'b',
          prompt: `Hva betyr tallet ${no(alpha)} i etterspørselsuttrykket?`,
          kind: 'flervalg',
          skills: ['lik.graf'],
          choices: shuffle(rng, [
            { id: 'c1', text: `Den høyeste prisen noen er villig til å betale: ved P = ${no(alpha)} etterspørres ingenting.`, correct: true, why: `Når Q = 0, blir P = ${no(alpha)}. Det er der etterspørselskurven treffer den loddrette prisaksen.` },
            { id: 'c2', text: `Antall ${ctx.unit} som etterspørres når prisen er null.`, correct: false, why: `Det ville vært konstantleddet hvis uttrykket var skrevet som Q = … . Her er det skrevet som P = …, så konstantleddet er en pris.` },
            { id: 'c3', text: 'Likevektsprisen.', correct: false, why: `Likevektsprisen er ${no(Pst)}, der kurvene skjærer hverandre.` },
          ]),
          solution: [step('', 'Forklaring', `Når Q = 0 gir etterspørselen P = ${no(alpha)}. Konstantleddet i et uttrykk på formen P = … er altså en pris.`, 'tolkning')],
          hints: { small: 'Sett Q = 0 i uttrykket. Hva får du?', firstStep: `P = ${no(alpha)} − ${no(B)} · 0 = ${no(alpha)}.`, stepExplanation: 'Konstantleddet er verdien til venstre side når den andre variabelen er null.', workedExample: { intro: '', steps: [] } },
          methodCheckpoints: [],
        },
      ];
      return {
        title: 'Likevekt med pris som funksjon av kvantum',
        intro: `Etterspørselen etter ${ctx.good} kan skrives som P = ${linExpr(alpha, B.neg(), 'Q')}, og tilbudet som P = ${linExpr(gamma, D, 'Q')},\nder P er prisen (${ctx.price}) og Q er antall ${ctx.unit} per ${ctx.per}.`,
        context: ctx.good,
        parts,
        params: { alpha: alpha.toString(), beta: B.toString(), gamma: gamma.toString(), delta: D.toString() },
        skills: ['lik.betingelse', 'lik.losning', 'alg.isolere', 'alg.innsetting', 'lik.graf'],
        structureKey: 'lik-invers',
        estMinutes: 8,
      };
    }
    throw new Error('Fant ikke gyldige parametere');
  },
};

const tplParameter: TemplateDef = {
  id: 'lik-parameter',
  version: 1,
  level: 2,
  style: 'standard',
  name: 'Annen ukjent: finn en konstant fra kjent likevekt',
  description: 'Likevektsprisen er kjent. Finn konstanten i tilbudet.',
  skills: ['lik.parameter', 'alg.innsetting', 'alg.isolere'],
  build: (rng) => {
    const e = niceEq(rng, { allowNegC: true });
    const ctx = pick(rng, CONTEXTS);
    const [a, b, c, d, P, Q] = [R(e.a), R(e.b), R(e.c), R(e.d), R(e.P), R(e.Q)];
    const part: GenPart = {
      id: 'a',
      label: 'a',
      prompt: `Likevektsprisen er observert til ${no(P)} ${ctx.price}. Finn konstanten c og likevektskvantumet.`,
      kind: 'beregning',
      skills: ['lik.parameter', 'alg.innsetting', 'alg.isolere'],
      math: { symbols: ['Qd', 'Qs'], defs: { Qd: defLin(a, b.neg(), 'P'), Qs: `c + (${d.toString()})*P` }, param: 'P', unknown: 'c', solution: { P: P.toString(), c: c.toString(), Q: Q.toString(), Qd: Q.toString(), Qs: Q.toString() } },
      targets: [
        { symbol: 'c', label: 'Konstanten c', value: c.toString(), aliases: ['konstant'] },
        { symbol: 'Q', label: 'Likevektskvantum', value: Q.toString(), aliases: ['kvantum'] },
      ],
      solution: [
        step(`Q = ${texNum(a)} - ${texNum(b)} \\cdot ${texNum(P)} = ${texNum(Q)}`, 'Finn kvantumet fra etterspørselen', 'Etterspørselen er helt kjent, så vi kan regne ut kvantumet ved den observerte prisen.', 'innsetting'),
        step(`${texNum(Q)} = c + ${texNum(d)} \\cdot ${texNum(P)}`, 'I likevekt tilbys det samme kvantumet', 'Qs = Qd i likevekt, så tilbudet må også gi dette kvantumet ved samme pris.', 'definisjon'),
        step(`c = ${texNum(Q)} - ${texNum(d.mul(P))} = ${texNum(c)}`, 'Isoler c', 'Trekk fra det kjente leddet på begge sider.', 'omforming'),
      ],
      hints: {
        small: 'Hvilket av uttrykkene er helt kjent? Start der.',
        firstStep: `Regn ut Qd ved P = ${no(P)}: Qd = ${no(a)} − ${no(b)} · ${no(P)}.`,
        stepExplanation: 'I likevekt er Qd = Qs. Når prisen er kjent, gir etterspørselen kvantumet, og da må tilbudet gi det samme kvantumet.',
        workedExample: { intro: 'Eksempel: Qd = 100 − 2P, Qs = c + 2P og P = 20.', steps: [step('Q = 100 - 40 = 60', '', '', 'innsetting'), step('60 = c + 40', '', '', 'definisjon'), step('c = 20', '', '', 'omforming')] },
      },
      methodCheckpoints: [
        { id: 'kvantum', label: 'Fant kvantumet fra etterspørselen', skill: 'alg.innsetting', detect: { type: 'verdi', value: Q.toString(), symbols: ['Q', 'Qd'] }, required: true },
        { id: 'oppsett', label: 'Brukte at Qs = Qd i likevekt', skill: 'lik.parameter', detect: { type: 'oppsett', v: 'c' }, required: true },
        { id: 'isolering', label: 'Isolerte c', skill: 'alg.isolere', detect: { type: 'isolering', v: 'c' }, required: true },
      ],
    };
    return {
      title: 'Finn den ukjente konstanten',
      intro: `I et marked for ${ctx.good} er etterspørselen Qd = ${linExpr(a, b.neg(), 'P')}. Tilbudet er Qs = c + ${no(d)}P, der c er ukjent. P er prisen (${ctx.price}).`,
      context: ctx.good,
      parts: [part],
      params: { a: a.toString(), b: b.toString(), c: c.toString(), d: d.toString(), P: P.toString() },
      skills: part.skills,
      structureKey: 'lik-parameter',
      estMinutes: 6,
    };
  },
};

const tplMakspris: TemplateDef = {
  id: 'lik-makspris',
  version: 1,
  level: 3,
  style: 'standard',
  name: 'Endret forutsetning: pris som ikke er likevektsprisen',
  description: 'En maksimal- eller minstepris gjør at markedet ikke lenger er i likevekt.',
  skills: ['lik.losning', 'lik.overskudd', 'alg.innsetting'],
  build: (rng) => {
    const e = niceEq(rng, { allowNegC: false });
    const ctx = pick(rng, CONTEXTS);
    const [a, b, c, d, P, Q] = [R(e.a), R(e.b), R(e.c), R(e.d), R(e.P), R(e.Q)];
    const isMax = rng() < 0.6;
    const shift = randInt(rng, 2, Math.max(2, Math.min(8, e.P - 2)));
    let Pg = isMax ? P.sub(R(shift)) : P.add(R(shift));
    if (!isMax && a.sub(b.mul(Pg)).sign() <= 0) Pg = P.add(R(1));
    const Qd = a.sub(b.mul(Pg));
    const Qs = c.add(d.mul(Pg));
    const diff = isMax ? Qd.sub(Qs) : Qs.sub(Qd);
    const traded = isMax ? Qs : Qd;
    const kind = isMax ? 'maksimalpris' : 'minstepris';
    const partA = calcPart('a', 'Finn likevektsprisen og likevektskvantumet uten inngrep.', a, b, c, d);
    const partB: GenPart = {
      id: 'b',
      label: 'b',
      prompt: `Myndighetene innfører en ${kind} på ${no(Pg)} ${ctx.price}. Regn ut etterspurt og tilbudt kvantum ved denne prisen, og finn ${isMax ? 'overskuddsetterspørselen' : 'overskuddstilbudet'}.`,
      kind: 'beregning',
      skills: ['lik.overskudd', 'alg.innsetting'],
      math: { symbols: ['Qd', 'Qs'], defs: { Qd: defLin(a, b.neg(), 'P'), Qs: defLin(c, d, 'P') }, param: 'P', unknown: 'P', solution: { P: Pg.toString(), Qd: Qd.toString(), Qs: Qs.toString() } },
      targets: [
        { symbol: 'Qd', label: 'Etterspurt kvantum', value: Qd.toString(), aliases: ['etterspurt', 'etterspørsel'] },
        { symbol: 'Qs', label: 'Tilbudt kvantum', value: Qs.toString(), aliases: ['tilbudt', 'tilbud'] },
        { symbol: 'D', label: isMax ? 'Overskuddsetterspørsel' : 'Overskuddstilbud', value: diff.toString(), aliases: ['overskudd', 'overskuddsetterspørsel', 'overskuddstilbud', 'differanse', 'mangel'] },
      ],
      solution: [
        step(`Q_d = ${texNum(a)} - ${texNum(b)} \\cdot ${texNum(Pg)} = ${texNum(Qd)}`, 'Etterspurt kvantum ved den regulerte prisen', 'Prisen er nå bestemt av myndighetene, ikke av likevektsbetingelsen. Vi setter den inn i hvert uttrykk.', 'innsetting'),
        step(`Q_s = ${texNum(c)} + ${texNum(d)} \\cdot ${texNum(Pg)} = ${texNum(Qs)}`, 'Tilbudt kvantum ved samme pris', 'Selgerne tilpasser seg prisen de får.', 'innsetting'),
        step(`${isMax ? 'Q_d - Q_s' : 'Q_s - Q_d'} = ${texNum(diff)}`, isMax ? 'Overskuddsetterspørsel' : 'Overskuddstilbud', isMax ? 'Ved en pris under likevektsprisen vil flere kjøpe enn det som tilbys.' : 'Ved en pris over likevektsprisen tilbys mer enn det som etterspørres.', 'tolkning'),
      ],
      hints: {
        small: `Er ${no(Pg)} ${ctx.price} over eller under likevektsprisen? Gjelder Qd = Qs fortsatt?`,
        firstStep: `Sett P = ${no(Pg)} inn i etterspørselen: Qd = ${no(a)} − ${no(b)} · ${no(Pg)}.`,
        stepExplanation: 'Når prisen er låst av en regel, er markedet ikke i likevekt. Da regner vi ut hver side for seg ved den prisen og ser på forskjellen.',
        workedExample: { intro: 'Eksempel: Qd = 100 − 2P, Qs = 10 + 2P, maksimalpris 15.', steps: [step('Q_d = 100 - 30 = 70', '', '', 'innsetting'), step('Q_s = 10 + 30 = 40', '', '', 'innsetting'), step('Q_d - Q_s = 30', 'Overskuddsetterspørsel', '', 'tolkning')] },
      },
      methodCheckpoints: [
        { id: 'qd', label: 'Regnet ut etterspurt kvantum ved regulert pris', skill: 'lik.overskudd', detect: { type: 'verdi', value: Qd.toString(), symbols: ['Qd'] }, required: true },
        { id: 'qs', label: 'Regnet ut tilbudt kvantum ved regulert pris', skill: 'lik.overskudd', detect: { type: 'verdi', value: Qs.toString(), symbols: ['Qs'] }, required: true },
      ],
    };
    const partC: GenPart = {
      id: 'c',
      label: 'c',
      prompt: `Hvor mye blir faktisk omsatt, og hvorfor? Forklar kort hvorfor markedet ikke ender i likevekten fra a).`,
      kind: 'forklaring',
      skills: ['lik.overskudd', 'lik.tolke'],
      rubric: [
        { id: 'k1', text: `Sier at det omsatte kvantumet blir ${no(traded)} ${ctx.unit}, fordi ${isMax ? 'selgerne ikke vil tilby mer enn Qs' : 'kjøperne ikke vil kjøpe mer enn Qd'} ved denne prisen.`, basis: 'faglig-tolkning', required: true },
        { id: 'k2', text: `Forklarer at prisen ikke kan ${isMax ? 'stige' : 'falle'} fordi den er regulert, så overskuddet blir liggende.`, basis: 'faglig-tolkning', required: true },
        { id: 'k3', text: 'Skiller mellom etterspurt/tilbudt kvantum og faktisk omsatt kvantum.', basis: 'faglig-tolkning', required: false },
      ],
      targets: undefined,
      solution: [step('', 'Modellsvar', `Det omsettes ${no(traded)} ${ctx.unit}: ${isMax ? 'det er alt selgerne vil tilby ved denne prisen' : 'det er alt kjøperne vil kjøpe ved denne prisen'}. Uten reguleringen ville prisen ${isMax ? 'steget' : 'falt'} mot ${no(P)}, men nå er den låst.`, 'tolkning')],
      hints: {
        small: 'Kan noen tvinge selgerne til å selge mer enn de vil, eller kjøperne til å kjøpe mer enn de vil?',
        firstStep: `Den korte siden av markedet bestemmer omsetningen: ${isMax ? 'tilbudet' : 'etterspørselen'}.`,
        stepExplanation: 'Omsetningen krever både en kjøper og en selger. Derfor blir det minste av Qd og Qs det som faktisk handles.',
        workedExample: { intro: '', steps: [] },
      },
      methodCheckpoints: [{ id: 'forklaring', label: 'Forklarte omsatt kvantum', skill: 'lik.overskudd', detect: { type: 'forklaring' }, required: true }],
      modelAnswer: `Det omsettes ${no(traded)} ${ctx.unit}, fordi ${isMax ? 'selgerne bare vil tilby så mye' : 'kjøperne bare vil kjøpe så mye'} ved ${no(Pg)} ${ctx.price}. Prisen kan ikke tilpasse seg, så ${isMax ? 'overskuddsetterspørselen' : 'overskuddstilbudet'} på ${no(diff)} blir liggende.`,
    };
    return {
      title: `Likevekt og ${kind}`,
      intro: introText(ctx, a, b, c, d),
      context: ctx.good,
      parts: [partA, partB, partC],
      params: { a: a.toString(), b: b.toString(), c: c.toString(), d: d.toString(), Pg: Pg.toString(), type: kind },
      skills: [...new Set([...partA.skills, ...partB.skills, ...partC.skills])],
      structureKey: `lik-${kind}`,
      estMinutes: 14,
    };
  },
};

const tplSkift: TemplateDef = {
  id: 'lik-skift',
  version: 1,
  level: 4,
  style: 'standard',
  name: 'Blandet eksamensoppgave: skift i etterspørselen og prosentvis endring',
  description: 'Kombinerer likevekt, ny likevekt og prosentvis endring.',
  skills: ['lik.losning', 'pst.endring', 'lik.tolke'],
  build: (rng) => {
    const ctx = pick(rng, CONTEXTS);
    for (let t = 0; t < 300; t++) {
      const P0 = randInt(rng, 10, 40, 2);
      const pct = pick(rng, [10, 20, 25, 50, 30, 40]);
      const P1r = R(P0).mul(R(100 + pct)).div(R(100));
      if (!P1r.isInteger()) continue;
      const b = randInt(rng, 1, 4);
      const d = randInt(rng, 1, 4);
      const Q0 = randInt(rng, 30, 150, 5);
      const a = R(Q0 + b * P0);
      const c = R(Q0 - d * P0);
      if (c.sign() < 0) continue;
      const a2 = c.add(R(b + d).mul(P1r));
      const Q1 = c.add(R(d).mul(P1r));
      const B = R(b);
      const D = R(d);
      const P0r = R(P0);
      const partA = calcPart('a', 'Finn likevektsprisen og likevektskvantumet.', a, B, c, D);
      const partB = calcPart('b', `Etterspørselen øker til Qd = ${linExpr(a2, B.neg(), 'P')}. Finn den nye likevekten.`, a2, B, c, D);
      partB.math!.defs.Qd = defLin(a2, B.neg(), 'P');
      const pctR = P1r.sub(P0r).div(P0r).mul(R(100));
      const partC: GenPart = {
        id: 'c',
        label: 'c',
        prompt: 'Hvor mange prosent økte likevektsprisen?',
        kind: 'beregning',
        skills: ['pst.endring'],
        math: { symbols: ['V0', 'V1'], defs: {}, param: 'x', unknown: 'x', solution: { V0: P0r.toString(), V1: P1r.toString() } },
        targets: [{ symbol: 'e', label: 'Prosentvis endring', value: pctR.toString(), percent: true, aliases: ['endring', 'økning', 'prosent'] }],
        solution: [
          step(`\\frac{${texNum(P1r)} - ${texNum(P0r)}}{${texNum(P0r)}} \\cdot 100\\,\\% = ${texNum(pctR)}\\,\\%`, 'Endring delt på startverdien', 'Prosentvis endring måles alltid i forhold til verdien vi startet med.', 'definisjon'),
        ],
        hints: {
          small: 'Hva er startverdien her, og hva er endringen?',
          firstStep: `Endringen er ${no(P1r)} − ${no(P0r)} = ${no(P1r.sub(P0r))}. Del på startverdien ${no(P0r)}.`,
          stepExplanation: 'Vi sammenlikner endringen med utgangspunktet. Derfor står startverdien i nevneren.',
          workedExample: { intro: 'Fra 40 til 50:', steps: [step('\\frac{50-40}{40} = 0{,}25 = 25\\,\\%', '', '', 'definisjon')] },
        },
        methodCheckpoints: [{ id: 'grunnlag', label: 'Delte endringen på startverdien', skill: 'pst.endring', detect: { type: 'verdi', value: pctR.div(R(100)).toString(), symbols: [] }, required: false }],
      };
      const partD: GenPart = {
        id: 'd',
        label: 'd',
        prompt: 'Forklar med ord (gjerne med en skisse) hvorfor både prisen og kvantumet økte.',
        kind: 'forklaring',
        skills: ['lik.tolke', 'lik.graf'],
        rubric: [
          { id: 'k1', text: 'Sier at økt etterspørsel betyr at kjøperne vil kjøpe mer ved enhver pris (etterspørselskurven skifter utover/til høyre).', basis: 'faglig-tolkning', required: true },
          { id: 'k2', text: 'Forklarer at det ved den gamle prisen oppstår overskuddsetterspørsel som presser prisen opp.', basis: 'faglig-tolkning', required: true },
          { id: 'k3', text: 'Forklarer at høyere pris får selgerne til å tilby mer (bevegelse langs tilbudskurven), så kvantumet øker.', basis: 'faglig-tolkning', required: true },
          { id: 'k4', text: 'Skiller mellom skift i kurven og bevegelse langs kurven.', basis: 'faglig-tolkning', required: false },
        ],
        solution: [step('', 'Modellsvar', `Etterspørselen skifter utover: ved den gamle prisen ${no(P0r)} vil kjøperne nå ha mer enn selgerne tilbyr. Denne mangelen presser prisen opp. Når prisen stiger, beveger vi oss langs tilbudskurven, og selgerne tilbyr mer. Ny likevekt blir ved P = ${no(P1r)} og Q = ${no(Q1)}.`, 'tolkning')],
        hints: {
          small: 'Hva skjer ved den gamle prisen etter at etterspørselen har økt?',
          firstStep: 'Regn ut ny Qd ved den gamle prisen og sammenlikn med Qs.',
          stepExplanation: 'Skiftet i etterspørselen skaper en mangel ved den gamle prisen. Mangelen driver prisen opp til ny likevekt.',
          workedExample: { intro: '', steps: [] },
        },
        methodCheckpoints: [{ id: 'forklaring', label: 'Forklarte mekanismen', skill: 'lik.tolke', detect: { type: 'forklaring' }, required: true }],
        graph: { type: 'likevekt', params: { a: a.toString(), b: String(b), c: c.toString(), d: String(d), a2: a2.toString() }, task: 'vis' },
        modelAnswer: 'Etterspørselen skifter utover. Ved den gamle prisen blir det mangel, prisen stiger, og selgerne tilbyr mer langs tilbudskurven.',
      };
      return {
        title: 'Ny likevekt etter økt etterspørsel',
        intro: introText(ctx, a, B, c, D),
        context: ctx.good,
        parts: [partA, partB, partC, partD],
        params: { a: a.toString(), b: String(b), c: c.toString(), d: String(d), a2: a2.toString() },
        skills: [...new Set([partA, partB, partC, partD].flatMap((p) => p.skills))],
        structureKey: 'lik-skift',
        estMinutes: 20,
      };
    }
    throw new Error('Fant ikke gyldige parametere');
  },
};

export function axisFor(a: Rat, b: Rat, c: Rat, d: Rat) {
  const P = a.sub(c).div(b.add(d));
  const Q = a.sub(b.mul(P));
  const pChoke = a.div(b).toNumber();
  const qMax = Math.ceil(Math.max(a.toNumber(), Q.toNumber() * 1.6) / 10) * 10;
  const pMax = Math.ceil(Math.max(pChoke, P.toNumber() * 1.6) / 5) * 5;
  return { qMax, pMax };
}

const tplGrafLes: TemplateDef = {
  id: 'lik-graf-les',
  version: 1,
  level: 2,
  style: 'standard',
  name: 'Annen representasjon: les likevekten i en figur',
  description: 'Samme kompetanse, men informasjonen står i en figur. Avlesningen kontrolleres ved regning.',
  skills: ['lik.graf', 'graf.lese', 'lik.kontroll', 'alg.innsetting'],
  build: (rng) => {
    const e = niceEq(rng, { allowNegC: false, maxA: 200 });
    const ctx = pick(rng, CONTEXTS);
    const [a, b, c, d, P, Q] = [R(e.a), R(e.b), R(e.c), R(e.d), R(e.P), R(e.Q)];
    const ax = axisFor(a, b, c, d);
    const tolP = Math.max(1, Math.round(ax.pMax / 25));
    const tolQ = Math.max(2, Math.round(ax.qMax / 25));
    const partA: GenPart = {
      id: 'a',
      label: 'a',
      prompt: 'Figuren viser etterspørsel og tilbud. Les av likevektsprisen og likevektskvantumet.',
      kind: 'beregning',
      skills: ['lik.graf', 'graf.lese'],
      math: { symbols: [], defs: {}, param: 'P', unknown: 'P', solution: { P: P.toString(), Q: Q.toString() } },
      targets: [
        { symbol: 'P', label: 'Avlest likevektspris', value: P.toString(), tolerance: String(tolP), aliases: ['pris'] },
        { symbol: 'Q', label: 'Avlest likevektskvantum', value: Q.toString(), tolerance: String(tolQ), aliases: ['kvantum'] },
      ],
      graph: { type: 'likevekt', params: { a: a.toString(), b: b.toString(), c: c.toString(), d: d.toString() }, task: 'les', qMax: ax.qMax, pMax: ax.pMax },
      solution: [step('', 'Skjæringspunktet', `Kurvene krysser hverandre ved P = ${no(P)} (loddrett akse) og Q = ${no(Q)} (vannrett akse).`, 'tolkning')],
      hints: {
        small: 'Likevekten er der de to kurvene krysser hverandre. Hvilken akse viser prisen?',
        firstStep: 'Finn krysningspunktet. Gå vannrett til prisaksen og loddrett ned til kvantumsaksen.',
        stepExplanation: 'I samfunnsøkonomi står prisen på den loddrette aksen og kvantum på den vannrette, selv om vi ofte skriver Q som funksjon av P.',
        workedExample: { intro: '', steps: [] },
      },
      methodCheckpoints: [],
    };
    const partB = calcPart('b', `Uttrykkene bak figuren er Qd = ${linExpr(a, b.neg(), 'P')} og Qs = ${linExpr(c, d, 'P')}. Kontroller avlesningen ved regning.`, a, b, c, d, ['lik.kontroll']);
    return {
      title: 'Les likevekten i en figur',
      intro: `Markedet for ${ctx.good}. P er prisen (${ctx.price}) og Q er antall ${ctx.unit} per ${ctx.per}.`,
      context: ctx.good,
      parts: [partA, partB],
      params: { a: a.toString(), b: b.toString(), c: c.toString(), d: d.toString() },
      skills: ['lik.graf', 'graf.lese', 'lik.kontroll', 'lik.betingelse', 'lik.losning', 'alg.isolere', 'alg.innsetting'],
      structureKey: 'lik-graf-les',
      estMinutes: 8,
    };
  },
};

const tplGrafTegn: TemplateDef = {
  id: 'lik-graf-tegn',
  version: 1,
  level: 2,
  style: 'standard',
  name: 'Annen representasjon: tegn kurvene',
  description: 'Tegn etterspørsel og tilbud i et diagram med pris på loddrett akse.',
  skills: ['lik.graf', 'alg.innsetting'],
  build: (rng) => {
    const e = niceEq(rng, { allowNegC: false, maxA: 200 });
    const ctx = pick(rng, CONTEXTS);
    const [a, b, c, d, P, Q] = [R(e.a), R(e.b), R(e.c), R(e.d), R(e.P), R(e.Q)];
    const ax = axisFor(a, b, c, d);
    const part: GenPart = {
      id: 'a',
      label: 'a',
      prompt: 'Tegn etterspørselskurven og tilbudskurven i diagrammet. Plasser to punkter på hver kurve, og marker likevekten.',
      kind: 'graf',
      skills: ['lik.graf', 'alg.innsetting'],
      graph: { type: 'likevekt', params: { a: a.toString(), b: b.toString(), c: c.toString(), d: d.toString() }, task: 'tegn', qMax: ax.qMax, pMax: ax.pMax },
      solution: [
        step(`Q_d = 0 \Rightarrow P = ${texNum(a.div(b))}`, 'Etterspørselen treffer prisaksen', 'Sett Qd = 0 og løs for P. Et annet punkt: P = 0 gir Qd = ' + no(a) + '.', 'innsetting'),
        step(`P = 0 \Rightarrow Q_s = ${texNum(c)}`, 'Et punkt på tilbudet', 'Et annet punkt finner du ved å velge en pris, f.eks. P = ' + no(P) + ', som gir Qs = ' + no(Q) + '.', 'innsetting'),
        step(`(Q, P) = (${texNum(Q)},\ ${texNum(P)})`, 'Likevekten', 'Der kurvene krysser.', 'tolkning'),
      ],
      hints: {
        small: 'Velg to priser, regn ut Qd og Qs for hver, og plasser punktene (Q vannrett, P loddrett).',
        firstStep: `Med P = 0 er Qd = ${no(a)}. Med P = ${no(P)} er Qd = ${no(Q)}.`,
        stepExplanation: 'En rett linje er bestemt av to punkter. Regn ut kvantum for to priser og plasser punktene med kvantum langs den vannrette aksen.',
        workedExample: { intro: '', steps: [] },
      },
      methodCheckpoints: [],
    };
    return {
      title: 'Tegn tilbud og etterspørsel',
      intro: introText(ctx, a, b, c, d),
      context: ctx.good,
      parts: [part],
      params: { a: a.toString(), b: b.toString(), c: c.toString(), d: d.toString() },
      skills: ['lik.graf', 'alg.innsetting'],
      structureKey: 'lik-graf-tegn',
      estMinutes: 6,
    };
  },
};

// ——— Delferdigheter ———

const tplDrillIsolere: TemplateDef = {
  id: 'drill-isolere',
  version: 1,
  level: 1,
  style: 'delferdighet',
  name: 'Delferdighet: isolere P',
  description: 'Kort trening i å løse en lineær likning.',
  skills: ['alg.isolere'],
  build: (rng) => {
    const m = randInt(rng, 2, 9);
    const Pv = randInt(rng, 3, 40);
    const n = rng() < 0.5 ? 0 : randInt(rng, 5, 60, 5);
    const k = m * Pv + n;
    const form = pick(rng, ['k=mP', 'mP=k', 'mP+n=k', 'k=n+mP'] as const);
    const shown = n === 0 ? (form.startsWith('k') ? `${k} = ${m}P` : `${m}P = ${k}`) : form === 'k=n+mP' || form === 'k=mP' ? `${k} = ${n} + ${m}P` : `${m}P + ${n} = ${k}`;
    const part: GenPart = {
      id: 'a',
      label: 'a',
      prompt: `Løs likningen ${shown}.`,
      kind: 'beregning',
      skills: ['alg.isolere'],
      math: { symbols: [], defs: {}, param: 'P', unknown: 'P', solution: { P: String(Pv) } },
      targets: [{ symbol: 'P', label: 'P', value: String(Pv) }],
      solution: [
        ...(n ? [step(`${k - n} = ${m}P`, `Trekk fra ${n} på begge sider`, 'Vi vil ha P-leddet alene på én side. Det vi gjør på den ene siden, må vi gjøre på den andre.', 'omforming' as const)] : []),
        step(`P = \\frac{${k - n}}{${m}} = ${Pv}`, `Del begge sider på ${m}`, `${m}P betyr ${m} · P. Det motsatte av å gange med ${m} er å dele på ${m}.`, 'omforming'),
      ],
      hints: {
        small: n ? `Hva må bort fra siden med P først?` : `${m}P betyr ${m} ganger P. Hvilken regneoperasjon opphever «ganger ${m}»?`,
        firstStep: n ? `Trekk fra ${n} på begge sider.` : `Del begge sider på ${m}.`,
        stepExplanation: 'En likning er som en skålvekt i balanse: gjør du det samme på begge sider, er den fortsatt i balanse. Målet er å få P alene.',
        workedExample: { intro: 'Eksempel: 60 = 4P', steps: [step('P = \\frac{60}{4} = 15', 'Del begge sider på 4', 'Kontroll: 4 · 15 = 60.', 'omforming')] },
      },
      methodCheckpoints: [{ id: 'isolering', label: 'Isolerte P', skill: 'alg.isolere', detect: { type: 'isolering', v: 'P' }, required: true }],
    };
    return { title: 'Isolere P', intro: '', context: 'algebra', parts: [part], params: { m: String(m), n: String(n), k: String(k) }, skills: ['alg.isolere'], structureKey: `drill-isolere|${form}`, estMinutes: 2 };
  },
};

const tplDrillFlytte: TemplateDef = {
  id: 'drill-flytte',
  version: 1,
  level: 1,
  style: 'delferdighet',
  name: 'Delferdighet: samle P-leddene',
  description: 'Flytt ledd over likhetstegnet med riktig fortegn.',
  skills: ['alg.flytte', 'alg.isolere'],
  build: (rng) => {
    const e = niceEq(rng, { allowNegC: false, maxA: 200 });
    const [a, b, c, d, P] = [R(e.a), R(e.b), R(e.c), R(e.d), R(e.P)];
    const k = a.sub(c);
    const m = b.add(d);
    const part: GenPart = {
      id: 'a',
      label: 'a',
      prompt: `Skriv likningen ${linExpr(a, b.neg(), 'P')} = ${linExpr(c, d, 'P')} på formen tall = tall · P, og løs den.`,
      kind: 'beregning',
      skills: ['alg.flytte', 'alg.isolere'],
      math: { symbols: [], defs: {}, param: 'P', unknown: 'P', solution: { P: P.toString() } },
      targets: [{ symbol: 'P', label: 'P', value: P.toString() }],
      solution: [
        step(`${texNum(a)} - ${texNum(c)} = ${texNum(d)}P + ${texNum(b)}P`, 'Flytt ledd og skift fortegn', `−${no(b)}P flyttes til høyre og blir +${no(b)}P. +${no(c)} flyttes til venstre og blir −${no(c)}.`, 'omforming'),
        step(`${texNum(k)} = ${texNum(m)}P`, 'Regn sammen', '', 'omforming'),
        step(`P = ${texNum(P)}`, `Del på ${no(m)}`, '', 'omforming'),
      ],
      hints: {
        small: 'Når et ledd bytter side, skifter det fortegn. Hvilke ledd må bytte side?',
        firstStep: `Flytt −${no(b)}P til høyre (blir +${no(b)}P) og ${no(c)} til venstre (blir −${no(c)}).`,
        stepExplanation: `Å «flytte» et ledd er egentlig å legge til eller trekke fra det samme på begge sider. Legger vi til ${no(b)}P på begge sider, forsvinner −${no(b)}P fra venstre side.`,
        workedExample: { intro: 'Eksempel: 50 − P = 10 + 3P', steps: [step('50 - 10 = 3P + P', '', '', 'omforming'), step('40 = 4P', '', '', 'omforming'), step('P = 10', '', '', 'omforming')] },
      },
      methodCheckpoints: [
        { id: 'samlet', label: `Samlet leddene til ${no(k)} = ${no(m)}P`, skill: 'alg.flytte', detect: { type: 'isolasjonsform', v: 'P', k: k.toString(), m: m.toString() }, required: true },
        { id: 'isolering', label: 'Isolerte P', skill: 'alg.isolere', detect: { type: 'isolering', v: 'P' }, required: true },
      ],
    };
    return { title: 'Samle P-leddene', intro: '', context: 'algebra', parts: [part], params: { a: a.toString(), b: b.toString(), c: c.toString(), d: d.toString() }, skills: part.skills, structureKey: 'drill-flytte', estMinutes: 3 };
  },
};

const tplDrillInnsetting: TemplateDef = {
  id: 'drill-innsetting',
  version: 1,
  level: 1,
  style: 'delferdighet',
  name: 'Delferdighet: sette inn en pris',
  description: 'Regn ut Qd eller Qs for en gitt pris.',
  skills: ['alg.innsetting'],
  build: (rng) => {
    const e = niceEq(rng, { allowNegC: false });
    const [a, b, c, d] = [R(e.a), R(e.b), R(e.c), R(e.d)];
    const Pv = R(randInt(rng, 2, Math.max(3, Math.floor(e.a / e.b) - 1)));
    const useD = rng() < 0.5;
    const val = useD ? a.sub(b.mul(Pv)) : c.add(d.mul(Pv));
    const sym = useD ? 'Qd' : 'Qs';
    const expr = useD ? linExpr(a, b.neg(), 'P') : linExpr(c, d, 'P');
    const part: GenPart = {
      id: 'a',
      label: 'a',
      prompt: `${sym} = ${expr}. Regn ut ${sym} når P = ${no(Pv)}.`,
      kind: 'beregning',
      skills: ['alg.innsetting'],
      math: { symbols: ['Qd', 'Qs'], defs: { Qd: defLin(a, b.neg(), 'P'), Qs: defLin(c, d, 'P') }, param: 'P', unknown: 'P', solution: { P: Pv.toString(), [sym]: val.toString() } },
      targets: [{ symbol: sym, label: sym, value: val.toString() }],
      solution: [step(`${sym === 'Qd' ? 'Q_d' : 'Q_s'} = ${useD ? `${texNum(a)} - ${texNum(b)}` : `${texNum(c)} + ${texNum(d)}`} \\cdot ${texNum(Pv)} = ${texNum(val)}`, 'Bytt ut P med tallet', 'Gang først, legg sammen eller trekk fra etterpå.', 'innsetting')],
      hints: {
        small: `Bytt ut P med ${no(Pv)}. Husk at ${useD ? no(b) : no(d)}P betyr ${useD ? no(b) : no(d)} · P.`,
        firstStep: `${sym} = ${useD ? `${no(a)} − ${no(b)}` : `${no(c)} + ${no(d)}`} · ${no(Pv)}`,
        stepExplanation: 'Et uttrykk som 120 − 2P er en oppskrift: ta 120 og trekk fra to ganger prisen.',
        workedExample: { intro: 'Eksempel: Qd = 100 − 3P og P = 10', steps: [step('Q_d = 100 - 3 \\cdot 10 = 70', '', '', 'innsetting')] },
      },
      methodCheckpoints: [],
    };
    return { title: 'Sett inn en pris', intro: '', context: 'algebra', parts: [part], params: { a: a.toString(), b: b.toString(), c: c.toString(), d: d.toString(), P: Pv.toString() }, skills: ['alg.innsetting'], structureKey: `drill-innsetting|${sym}`, estMinutes: 2 };
  },
};

const tplFinnFeil: TemplateDef = {
  id: 'lik-finnfeil',
  version: 1,
  level: 2,
  style: 'finn-feilen',
  name: 'Finn og forklar feilen',
  description: 'En løsning med én feil. Finn linjen og rett den.',
  skills: ['alg.isolere', 'alg.flytte', 'lik.losning'],
  build: (rng) => {
    const e = niceEq(rng, { allowNegC: false, maxA: 240 });
    const ctx = pick(rng, CONTEXTS);
    const [a, b, c, d, P, Q] = [R(e.a), R(e.b), R(e.c), R(e.d), R(e.P), R(e.Q)];
    const k = a.sub(c);
    const m = b.add(d);
    const errType = pick(rng, ['ganget', 'fortegn', 'konstant'] as const);
    const lines = ['Qd = Qs', `${linExpr(a, b.neg(), 'P')} = ${linExpr(c, d, 'P')}`];
    let errorLine = 0;
    let correction = '';
    if (errType === 'fortegn') {
      const wrongM = d.sub(b);
      if (wrongM.isZero() || wrongM.sign() < 0) {
        lines.push(`${no(a.add(c))} = ${no(m)}P`);
        errorLine = 2;
        correction = `${no(c)} skal trekkes fra, ikke legges til: ${no(a)} − ${no(c)} = ${no(k)}.`;
        lines.push(`P = ${no(a.add(c).div(m))}`);
      } else {
        lines.push(`${no(k)} = ${no(wrongM)}P`);
        errorLine = 2;
        correction = `−${no(b)}P skifter fortegn når det flyttes: ${no(d)}P + ${no(b)}P = ${no(m)}P.`;
        lines.push(`P = ${no(k.div(wrongM))}`);
      }
    } else if (errType === 'konstant') {
      const wrongK = k.add(R(10));
      lines.push(`${no(wrongK)} = ${no(m)}P`);
      errorLine = 2;
      correction = `${no(a)} − ${no(c)} = ${no(k)}, ikke ${no(wrongK)}.`;
      lines.push(`P = ${no(wrongK.div(m))}`);
    } else {
      lines.push(`${no(k)} = ${no(m)}P`);
      lines.push(`P = ${no(k.mul(m))}`);
      errorLine = 3;
      correction = `Her er ${no(k)} ganget med ${no(m)}. For å få P alene må begge sider deles på ${no(m)}: P = ${no(P)}.`;
    }
    const part: GenPart = {
      id: 'a',
      label: 'a',
      prompt: 'En student har løst oppgaven slik. Hvilken linje inneholder den første feilen? Skriv en riktig løsning fra og med den linjen.',
      kind: 'finn-feilen',
      skills: ['alg.isolere', 'alg.flytte', 'lik.losning'],
      flawed: { lines, errorLine, correction },
      math: eqMathCtx(a, b, c, d, P, Q),
      targets: [{ symbol: 'P', label: 'Riktig likevektspris', value: P.toString() }],
      solution: eqSolution(a, b, c, d),
      hints: {
        small: 'Kontroller hver linje: har den samme løsning som linjen over?',
        firstStep: 'Sett inn P fra siste linje i linje 2. Stemmer venstre og høyre side?',
        stepExplanation: 'En gyldig omforming endrer ikke løsningen. Den første linjen der løsningen endrer seg, er der feilen er.',
        workedExample: { intro: '', steps: [] },
      },
      methodCheckpoints: [{ id: 'isolering', label: 'Kom fram til riktig P', skill: 'alg.isolere', detect: { type: 'isolering', v: 'P' }, required: true }],
    };
    return {
      title: 'Finn feilen i løsningen',
      intro: introText(ctx, a, b, c, d),
      context: ctx.good,
      parts: [part],
      params: { a: a.toString(), b: b.toString(), c: c.toString(), d: d.toString(), feil: errType },
      skills: part.skills,
      structureKey: `lik-finnfeil|${errType}`,
      estMinutes: 5,
    };
  },
};

// ——— Analyse av eksisterende oppgaver ———

function extractSide(text: string, sym: 'd' | 's'): string | null {
  const t = text.replace(/[\u2212\u2013]/g, '−');
  const re = new RegExp(`Q\\s?_?\\s?(?:${sym}|${sym.toUpperCase()})\\s*=\\s*([^\\n;]+?)(?=\\s+og\\s|,\\s|;|\\.\\s|\\n|$|\\s{2,})`);
  const m = re.exec(t);
  return m ? m[1].trim() : null;
}

export function linearCoeffs(expr: string, v = 'P'): { k: Rat; m: Rat } | null {
  try {
    const rf = toRF(parseExpr(expr.replace(/−/g, '-'), ['Qd', 'Qs']));
    if (!rf.den.isConst()) return null;
    const vars = rf.vars();
    if (vars.size !== 1 || !vars.has(v)) return null;
    const co = rf.num.univariateCoeffs(v);
    if (co.length !== 2) return null;
    const den = rf.den.constValue();
    return { k: co[0].div(den), m: co[1].div(den) };
  } catch {
    return null;
  }
}

function recognize(text: string): RecognizeResult | null {
  const ds = extractSide(text, 'd');
  const ss = extractSide(text, 's');
  if (!ds || !ss) return null;
  const dc = linearCoeffs(ds);
  const sc = linearCoeffs(ss);
  if (!dc || !sc) return null;
  if (dc.m.sign() >= 0 || sc.m.sign() <= 0) return null;
  return {
    params: { a: dc.k.toString(), b: dc.m.neg().toString(), c: sc.k.toString(), d: sc.m.toString() },
    basis: `Fant Qd = ${ds} og Qs = ${ss} i oppgaveteksten og leste koeffisientene med matematikkmotoren.`,
    strength: 0.95,
  };
}

function givenPrice(text: string): Rat | null {
  const m = /(?:maksimalpris|makspris|minstepris|minimumspris|pris(?:en)?)\s*(?:på|er|lik|settes til|fastsettes til)?\s*(?:P\s*=\s*)?(\d+(?:[.,]\d+)?)\s*(?:kr|kroner)/i.exec(text) || /P\s*=\s*(\d+(?:[.,]\d+)?)/.exec(text);
  return m ? Rat.parseDecimal(m[1]) : null;
}

const intents: IntentDef[] = [
  {
    id: 'lik.overskudd',
    specific: true,
    label: 'Kvantum og overskudd ved en gitt pris',
    match: [/maksimalpris|makspris|minstepris|minimumspris|overskudd|underskudd|mangel ved/i],
    skills: ['lik.overskudd', 'alg.innsetting'],
    taskType: ['beregning', 'tolkning'],
    assignment: 'Regne ut etterspurt og tilbudt kvantum ved en pris som ikke er likevektsprisen, og tolke forskjellen.',
    interpretation: ['Du må sette den oppgitte prisen inn i både etterspørselen og tilbudet.', 'Du må si om det blir overskudd av etterspørsel eller tilbud, og hvor stort det er.', 'Du må skille mellom ønsket kvantum og faktisk omsatt kvantum hvis oppgaven spør om omsetning.'],
    prerequisites: ['Sette inn tall i et uttrykk', 'Forstå hva likevektsprisen er'],
    misconceptions: ['Løser Qd = Qs selv om prisen er låst', 'Tror omsatt kvantum er Qd ved en maksimalpris'],
    variation: ['Pris over eller under likevekt endrer hvilken side som er kort', 'Om oppgaven spør om omsatt kvantum eller bare overskudd'],
    estMinutes: 8,
    compute: (p, text) => {
      const Pg = givenPrice(text);
      if (!Pg) return null;
      const { a, b, c, d } = eqParams(p);
      const Qd = a.sub(b.mul(Pg));
      const Qs = c.add(d.mul(Pg));
      return [
        { label: `Qd ved P = ${no(Pg)}`, value: Qd.toString(), display: no(Qd), symbol: 'Qd', unit: 'mengde' },
        { label: `Qs ved P = ${no(Pg)}`, value: Qs.toString(), display: no(Qs), symbol: 'Qs', unit: 'mengde' },
        { label: Qd.cmp(Qs) > 0 ? 'Overskuddsetterspørsel' : 'Overskuddstilbud', value: Qd.sub(Qs).abs().toString(), display: no(Qd.sub(Qs).abs()), unit: 'mengde' },
      ];
    },
  },
  {
    id: 'lik.graf',
    label: 'Lese eller tegne likevekt i diagram',
    match: [/figur|diagram|grafisk|tegn|les av|skisser/i],
    skills: ['lik.graf', 'graf.lese', 'lik.kontroll'],
    taskType: ['tegning', 'beregning'],
    assignment: 'Finne likevekten i et diagram og kontrollere den ved regning.',
    interpretation: ['Du må lese av skjæringspunktet mellom kurvene (pris på loddrett akse).', 'Du må kontrollere avlesningen ved å regne ut Qd og Qs ved den avleste prisen.'],
    prerequisites: ['Lese av en rett linje i et koordinatsystem'],
    misconceptions: ['Bytter om aksene (pris skal stå på den loddrette aksen)', 'Leser av skjæringspunktet med en akse i stedet for mellom kurvene'],
    variation: ['Kurvene kan være gitt som uttrykk eller bare som figur', 'Oppgaven kan be om avlesning, tegning eller begge deler'],
    estMinutes: 8,
    compute: (p) => {
      const { P, Q } = eqParams(p);
      return [
        { label: 'Likevektspris', value: P.toString(), display: no(P), symbol: 'P', unit: 'kr' },
        { label: 'Likevektskvantum', value: Q.toString(), display: no(Q), symbol: 'Q', unit: 'mengde' },
      ];
    },
  },
  {
    id: 'lik.tolke',
    label: 'Forklare likevekt',
    match: [/(forklar|tolk|hva betyr|hva menes|hvorfor).{0,80}(likevekt|marked)/i, /(likevekt).{0,60}(forklar|tolk|betyr)/i],
    skills: ['lik.tolke'],
    taskType: ['forklaring', 'tolkning'],
    assignment: 'Forklare hva likevekten betyr i markedet.',
    interpretation: ['Du må si at etterspurt og tilbudt kvantum er like ved likevektsprisen.', 'Du må forklare at det da ikke er noe press på prisen til å endre seg.', 'Du bør knytte forklaringen til tallene og enhetene i oppgaven.'],
    prerequisites: ['Vite hva etterspørsel og tilbud måler'],
    misconceptions: ['Sier at likevekt betyr at pris er lik kvantum', 'Sier at alle som vil kjøpe, får kjøpt til en hvilken som helst pris'],
    variation: ['Kan spørre om tolkning av tallene eller om hvorfor markedet går mot likevekt'],
    estMinutes: 5,
  },
  {
    id: 'lik.beregn',
    label: 'Beregne likevekt',
    match: [/(finn|beregn|regn ut|bestem|løs).{0,60}(likevekt|pris|kvantum)/i, /likevekt/i],
    skills: ['lik.betingelse', 'lik.losning', 'alg.isolere', 'alg.innsetting'],
    taskType: ['beregning'],
    assignment: 'Sette opp likevektsbetingelsen og finne likevektspris og -kvantum.',
    interpretation: ['Du må sette opp Qd = Qs med uttrykkene fra oppgaven.', 'Du må løse for P og deretter finne Q ved innsetting.', 'En kontroll i begge uttrykk viser at svaret henger sammen.'],
    prerequisites: ['Løse lineære likninger', 'Sette inn tall i et uttrykk'],
    misconceptions: ['Ganger i stedet for å dele når P isoleres', 'Glemmer å skifte fortegn når et ledd flyttes', 'Oppgir bare prisen og ikke kvantumet'],
    variation: ['Tallene kan endres uten at metoden endres', 'Uttrykkene kan være skrevet som P = … (annen ukjent)', 'En avgift eller regulert pris endrer metoden'],
    estMinutes: 7,
    compute: (p) => {
      const { P, Q } = eqParams(p);
      return [
        { label: 'Likevektspris P', value: P.toString(), display: no(P), symbol: 'P', unit: 'kr' },
        { label: 'Likevektskvantum Q', value: Q.toString(), display: no(Q), symbol: 'Q', unit: 'mengde' },
      ];
    },
  },
];

export const likevekt: FamilyKB = {
  id: 'likevekt-lineaer',
  name: 'Finne og tolke markedslikevekt fra lineær tilbud og etterspørsel',
  shortName: 'Markedslikevekt',
  topic: 'Marked og likevekt',
  subtopics: ['Etterspørsel', 'Tilbud', 'Likevekt', 'Regulerte priser'],
  description: 'Oppgaver der etterspørsel og tilbud er gitt som lineære uttrykk i pris, og der studenten skal finne, kontrollere og tolke likevekten.',
  skills: ['lik.betingelse', 'lik.losning', 'lik.kontroll', 'lik.tolke', 'lik.overskudd', 'lik.graf', 'lik.parameter', 'alg.isolere', 'alg.innsetting', 'alg.flytte'],
  formulas: [
    {
      id: 'f-qd',
      tex: 'Q_d = a - bP',
      name: 'Lineær etterspørsel',
      kind: 'modellantakelse',
      kindWhy: 'At etterspørselen er en rett linje, er en forenkling vi velger. I virkeligheten kan sammenhengen være krum.',
      symbols: [
        { sym: 'Q_d', meaning: 'Etterspurt kvantum: hvor mye kjøperne vil kjøpe', unit: 'enheter per periode' },
        { sym: 'a', meaning: 'Konstantledd: hvor mye som ville blitt etterspurt hvis prisen var 0', unit: 'enheter per periode' },
        { sym: 'b', meaning: 'Hvor mye etterspørselen faller når prisen øker med 1 kr', unit: 'enheter per krone' },
        { sym: 'P', meaning: 'Pris', unit: 'kr per enhet' },
      ],
      conditions: ['b > 0: etterspørselen faller når prisen stiger.', 'Gjelder bare der Qd ≥ 0, altså for 0 ≤ P ≤ a/b.'],
      whatIf: ['Større b: kjøperne reagerer sterkere på pris. I et diagram med P på loddrett akse blir linjen slakere.', 'Større a: kurven skifter utover. Det etterspørres mer ved enhver pris.'],
      figure: 'likevekt',
    },
    {
      id: 'f-qs',
      tex: 'Q_s = c + dP',
      name: 'Lineært tilbud',
      kind: 'modellantakelse',
      kindWhy: 'Også tilbudet er forenklet til en rett linje.',
      symbols: [
        { sym: 'Q_s', meaning: 'Tilbudt kvantum: hvor mye selgerne vil selge', unit: 'enheter per periode' },
        { sym: 'c', meaning: 'Konstantledd. Hvis c er negativ, tilbys ingenting før prisen er over −c/d.', unit: 'enheter per periode' },
        { sym: 'd', meaning: 'Hvor mye tilbudet øker når prisen øker med 1 kr', unit: 'enheter per krone' },
      ],
      conditions: ['d > 0: tilbudet øker med prisen.', 'Gjelder bare der Qs ≥ 0.'],
      whatIf: ['Større d: selgerne reagerer sterkere på pris.', 'Høyere kostnader for selgerne gir ofte lavere c, altså et innoverskift.'],
      figure: 'likevekt',
    },
    {
      id: 'f-lik',
      tex: 'Q_d = Q_s',
      name: 'Likevektsbetingelsen',
      kind: 'definisjon',
      kindWhy: 'Dette er hvordan vi definerer likevekt i denne modellen. Det er ikke noe vi regner oss fram til.',
      symbols: [
        { sym: 'Q_d', meaning: 'Etterspurt kvantum', unit: 'enheter' },
        { sym: 'Q_s', meaning: 'Tilbudt kvantum', unit: 'enheter' },
      ],
      conditions: ['Forutsetter at prisen kan tilpasse seg fritt. Ved en regulert pris gjelder den ikke.'],
      whatIf: ['Er prisen over likevekt, blir Qs > Qd (overskuddstilbud).', 'Er prisen under likevekt, blir Qd > Qs (overskuddsetterspørsel).'],
      figure: 'likevekt',
    },
    {
      id: 'f-pstar',
      tex: 'P^* = \\frac{a - c}{b + d}',
      name: 'Likevektsprisen',
      kind: 'avledet sammenheng',
      kindWhy: 'Følger av likevektsbetingelsen og de to lineære uttrykkene. Den gjelder bare for denne modellen.',
      symbols: [
        { sym: 'P^*', meaning: 'Likevektspris', unit: 'kr per enhet' },
        { sym: 'a - c', meaning: 'Forskjellen mellom konstantleddene', unit: 'enheter' },
        { sym: 'b + d', meaning: 'Hvor mye forskjellen mellom Qd og Qs endres per krone', unit: 'enheter per krone' },
      ],
      conditions: ['b + d > 0', 'a > c gir positiv pris'],
      whatIf: ['Øker a (mer etterspørsel), øker P*.', 'Øker c (mer tilbud), faller P*.'],
      derivation: [
        step('Q_d = Q_s', 'Start med definisjonen av likevekt', '', 'definisjon'),
        step('a - bP = c + dP', 'Sett inn modellens uttrykk', '', 'modellantakelse'),
        step('a - c = (b + d)P', 'Samle P-leddene', 'Legg til bP og trekk fra c på begge sider.', 'omforming'),
        step('P^* = \\frac{a - c}{b + d}', 'Del på b + d', 'Lov fordi b + d > 0.', 'omforming'),
      ],
      figure: 'likevekt',
    },
  ],
  intents,
  templates: [tplGrunn, tplFading, tplInvers, tplParameter, tplGrafLes, tplGrafTegn, tplMakspris, tplSkift, tplDrillIsolere, tplDrillFlytte, tplDrillInnsetting, tplFinnFeil],
  misconceptions: [
    { id: 'ganget-i-stedet-for-delt', label: 'Ganger i stedet for å dele når P isoleres', explanation: 'Fra 100 = 5P blir P = 500. Men 5P betyr 5 ganger P, så vi må dele på 5.' },
    { id: 'fortegnsfeil-flytting', label: 'Glemmer å skifte fortegn når et ledd flyttes', explanation: 'Et ledd som flyttes over likhetstegnet, skifter fortegn fordi vi egentlig legger til eller trekker fra på begge sider.' },
    { id: 'bare-pris', label: 'Oppgir bare prisen', explanation: 'Likevekten består av både pris og kvantum.' },
    { id: 'likevekt-ved-regulert-pris', label: 'Løser Qd = Qs selv om prisen er regulert', explanation: 'Når prisen er låst, er markedet ikke i likevekt. Regn ut Qd og Qs hver for seg.' },
  ],
  recognize,
  explanations: {
    short: (p) => {
      const { a, b, c, d, P, Q } = eqParams(p);
      return {
        text: 'Likevekt er prisen der kjøperne vil kjøpe akkurat like mye som selgerne vil selge. Derfor setter vi Qd = Qs og løser for P.',
        example: `Med Qd = ${linExpr(a, b.neg(), 'P')} og Qs = ${linExpr(c, d, 'P')}: ved P = ${no(P)} får vi Qd = ${no(Q)} og Qs = ${no(Q)}.`,
      };
    },
    analogy: {
      text: 'Tenk på et loppemarked for brukte bøker. Prises bøkene for høyt, blir mange stående usolgt. Prises de for lavt, blir de revet bort, og noen går tomhendte hjem. Likevektsprisen er der antallet bøker folk vil kjøpe, akkurat går opp mot antallet selgerne vil selge.',
      limits: 'Analogien slutter å passe fordi modellen antar mange kjøpere og selgere, at alle møter samme pris, og at prisen justerer seg fritt. På et ekte loppemarked forhandler folk en og en, og prisene kan være forskjellige.',
    },
    derivationFormulaId: 'f-pstar',
  },
  solutionStructure: ['Sette opp Qd = Qs', 'Samle P-leddene og isolere P', 'Sette prisen inn for å finne Q', 'Kontrollere i begge uttrykk', 'Tolke resultatet i konteksten'],
  surfaceFeatures: ['Hvilken vare markedet gjelder', 'Tallene i uttrykkene', 'Om uttrykkene heter Qd/Qs eller er skrevet med ord'],
};
