// Elektriske kretser: grunnbegreper, resistive nettverk, kretsanalyse,
// operasjonsforsterkere, førsteordens kretser, vekselstrøm og filtre.
// Alle oppgaver er egne maler med egne tall. Fasit regnes med brøker der
// det går (motstandsnettverk), ellers med flyttall og relativ toleranse på
// 1 % (eksponentialfunksjoner, røtter og logaritmer).

import type { GenPart } from '../domain/types';
import type { FamilyKB, TemplateDef, Rng } from './common';
import { pick, randInt } from './common';
import { mcPart, mcTemplate, explainTemplate, keywordRecognizer, type McItem, type ExplainItem } from './verbal';
import { calcPart, tgt, eng, engTex, fmtNum, hints, step, eR, par, r, ohm } from './el-common';
import { Rat } from '../math/rational';

const n = (x: Rat) => x.toNumber();

// ——— 1. Grunnbegreper: ladning, strøm, spenning, effekt og energi ———

const tplEffekt: TemplateDef = {
  id: 'el-effekt-energi',
  version: 1,
  level: 1,
  style: 'standard',
  name: 'Effekt, energi og ladning',
  description: 'p = v·i, w = p·t og q = i·t med prefikser og enheter.',
  skills: ['el.grunnbegreper'],
  build: (rng) => {
    const dev = pick(rng, [
      { what: 'En lader for en nettbrett', v: pick(rng, [5, 9, 12]), iMa: randInt(rng, 8, 30) * 100 },
      { what: 'En LED-lampe', v: pick(rng, [12, 24]), iMa: randInt(rng, 2, 9) * 50 },
      { what: 'En liten vifte', v: pick(rng, [12, 24]), iMa: randInt(rng, 3, 12) * 100 },
    ]);
    const hours = pick(rng, [2, 3, 4, 6, 8]);
    const i = r(dev.iMa).div(r(1000));
    const p = r(dev.v).mul(i);
    const t = r(hours * 3600);
    const w = p.mul(t);
    const q = i.mul(t);
    const parts: GenPart[] = [
      calcPart({ id: 'a', label: 'a', prompt: 'Hvor stor effekt trekker apparatet?', skills: ['el.grunnbegreper'], symbols: ['p', 'P'], targets: [tgt('p', 'Effekt', p, 'W', ['effekt', 'P'])], solution: [step(`p = v\\cdot i = ${dev.v}\\,\\mathrm{V}\\cdot ${engTex(n(i), 'A')} = ${engTex(n(p), 'W')}`, `p = ${eng(n(p), 'W')}`, 'Effekt er spenning ganger strøm. Gjør mA om til A først.', 'definisjon')], hints: hints('Effekt = spenning · strøm.', `Skriv ${dev.iMa} mA som ${fmtNum(n(i))} A.`, 'Enhetene V · A gir W.') }),
      calcPart({ id: 'b', label: 'b', prompt: `Hvor mye energi bruker apparatet på ${hours} timer? Oppgi svaret i joule.`, skills: ['el.grunnbegreper'], symbols: ['w', 'W'], targets: [tgt('w', 'Energi', w, 'J', ['energi', 'W'])], solution: [step(`w = p\\cdot t = ${engTex(n(p), 'W')}\\cdot ${hours}\\cdot 3600\\,\\mathrm{s} = ${engTex(n(w), 'J')}`, `w = ${eng(n(w), 'J')}`, 'Energi er effekt ganger tid, med tiden i sekunder når svaret skal være i joule.', 'definisjon')], hints: hints('Energi = effekt · tid.', `${hours} timer = ${hours} · 3600 s.`, '1 W i 1 s er 1 J.') }),
      calcPart({ id: 'c', label: 'c', prompt: 'Hvor mye ladning har passert gjennom apparatet i samme tidsrom?', skills: ['el.grunnbegreper'], symbols: ['q', 'Q'], targets: [tgt('q', 'Ladning', q, 'C', ['ladning', 'Q'])], solution: [step(`q = i\\cdot t = ${engTex(n(i), 'A')}\\cdot ${fmtNum(n(t))}\\,\\mathrm{s} = ${engTex(n(q), 'C')}`, `q = ${eng(n(q), 'C')}`, 'Strøm er ladning per tid, så ladning er strøm ganger tid.', 'definisjon')], hints: hints('Strøm er ladning per sekund.', 'q = i · t', 'Enheten A · s er coulomb (C).') }),
    ];
    return { title: 'Effekt, energi og ladning', intro: `${dev.what} kobles til ${dev.v} V og trekker ${dev.iMa} mA.`, context: 'effekt', parts, params: { v: String(dev.v), i: String(dev.iMa), h: String(hours) }, skills: ['el.grunnbegreper'], structureKey: 'el-effekt', estMinutes: 5 };
  },
};

function fortegnItem(rng: Rng): McItem {
  const v = randInt(rng, 2, 40) * 5;
  const iA = randInt(rng, 1, 9);
  const intoPlus = rng() < 0.5;
  const sign = rng() < 0.5 ? 1 : -1;
  const p = (intoPlus ? 1 : -1) * sign * v * iA;
  const absorbs = p > 0;
  return {
    id: `fortegn-${v}-${iA}-${intoPlus}-${sign}`,
    skill: 'el.fortegn',
    stem: `Strømmen i = ${sign * iA} A går ${intoPlus ? 'inn' : 'ut'} i terminalen merket «+» på et kretselement, og spenningen over elementet er v = ${v} V (med «+» på samme terminal). Hva gjør elementet?`,
    correct: absorbs ? `Det mottar ${Math.abs(p)} W.` : `Det leverer ${Math.abs(p)} W.`,
    wrong: [absorbs ? `Det leverer ${Math.abs(p)} W.` : `Det mottar ${Math.abs(p)} W.`, `Det mottar ${v + iA} W.`, 'Det kan ikke avgjøres uten å kjenne motstanden.'],
    why: `Passiv fortegnskonvensjon: når strømmen går inn i «+», er p = v·i. Går den ut, er p = −v·i. Her blir p = ${p} W, og positiv p betyr mottatt effekt.`,
  };
}

const tplFortegn: TemplateDef = {
  id: 'el-fortegn',
  version: 1,
  level: 1,
  style: 'standard',
  name: 'Leverer eller mottar effekt?',
  description: 'Passiv fortegnskonvensjon.',
  skills: ['el.fortegn'],
  build: (rng) => {
    const item = fortegnItem(rng);
    return { title: 'Leverer eller mottar?', intro: '', context: item.id, parts: [mcPart(rng, item)], params: { item: item.id }, skills: ['el.fortegn'], structureKey: 'el-fortegn', estMinutes: 2 };
  },
};

const GRUNN_MC: McItem[] = [
  { id: 'amperetime', skill: 'el.grunnbegreper', stem: 'Et batteri er merket 2,5 Ah. Hva forteller det?', correct: 'Hvor mye ladning batteriet kan levere: 2,5 A i én time, eller tilsvarende 9000 C.', wrong: ['Hvor stor effekt batteriet kan levere.', 'Hvor høy spenning batteriet har.', 'Hvor mye energi batteriet har i kWh.'], why: 'Ah er strøm ganger tid, altså ladning: 2,5 A · 3600 s = 9000 C. Energien får du først når du ganger med spenningen.' },
  { id: 'kwh', skill: 'el.grunnbegreper', stem: 'Hva er 1 kWh i joule?', correct: '3,6 MJ', wrong: ['1000 J', '3600 J', '60 kJ'], why: '1 kWh = 1000 W · 3600 s = 3 600 000 J.' },
  { id: 'spenning-def', skill: 'el.grunnbegreper', stem: 'Hva er spenning mellom to punkter?', correct: 'Energi per ladning som trengs for å flytte ladningen mellom punktene (J/C).', wrong: ['Ladning per tid som passerer et tverrsnitt (C/s).', 'Effekt per strøm (W/A) bare i motstander.', 'Motstand ganger ladning.'], why: 'v = dw/dq. Strøm er ladning per tid.' },
];

const grunnlag: FamilyKB = {
  id: 'el-grunnlag',
  domain: 'elektro',
  name: 'Ladning, strøm, spenning, effekt og energi',
  shortName: 'Grunnbegreper',
  topic: 'Elektriske kretser',
  subtopics: ['Ladning og strøm', 'Spenning', 'Effekt og energi', 'Passiv fortegnskonvensjon'],
  description: 'Sammenhengene q = i·t, p = v·i og w = p·t, prefikser, og om et element leverer eller mottar effekt.',
  skills: ['el.grunnbegreper', 'el.fortegn'],
  formulas: [
    { id: 'f-effekt-el', tex: 'p = v\\,i', name: 'Effekt', kind: 'definisjon', kindWhy: 'Effekt er energi per tid; spenning er energi per ladning og strøm er ladning per tid.', symbols: [{ sym: 'p', meaning: 'Effekt', unit: 'W' }, { sym: 'v', meaning: 'Spenning', unit: 'V' }, { sym: 'i', meaning: 'Strøm', unit: 'A' }], conditions: ['Med passiv fortegnskonvensjon betyr positiv p mottatt effekt.'], whatIf: ['Dobbel strøm ved samme spenning gir dobbel effekt.'], calc: { inputs: [{ sym: 'v', label: 'Spenning (V)', min: 1, max: 240, step: 1, value: 12 }, { sym: 'i', label: 'Strøm (mA)', min: 1, max: 5000, step: 1, value: 500 }, { sym: 'h', label: 'Tid (timer)', min: 0.5, max: 24, step: 0.5, value: 3 }], compute: (v) => [{ label: 'Effekt', value: eng((v.v * v.i) / 1000, 'W', 3) }, { label: 'Energi', value: eng((v.v * v.i * v.h * 3600) / 1000, 'J', 3) }, { label: 'Ladning', value: eng((v.i * v.h * 3600) / 1000, 'C', 3) }] } },
    { id: 'f-energi-el', tex: 'w = p\\,t', name: 'Energi ved konstant effekt', kind: 'avledet sammenheng', kindWhy: 'Følger av at effekt er energi per tid.', symbols: [{ sym: 'w', meaning: 'Energi', unit: 'J' }, { sym: 't', meaning: 'Tid', unit: 's' }], conditions: ['Konstant effekt. Ellers er energien arealet under p(t).'], whatIf: ['1 kWh = 3,6 MJ.'] },
    { id: 'f-ladning', tex: 'q = i\\,t', name: 'Ladning ved konstant strøm', kind: 'avledet sammenheng', kindWhy: 'Strøm er ladning per tid.', symbols: [{ sym: 'q', meaning: 'Ladning', unit: 'C' }], conditions: ['Konstant strøm. Ellers er ladningen arealet under i(t).'], whatIf: ['Ett elektron har ladning 1,602 · 10⁻¹⁹ C.'] },
  ],
  intents: [
    { id: 'el.fortegn', specific: true, label: 'Leverer eller mottar effekt', match: [/leverer|mottar|gir fra seg|fortegnskonvensjon|referanseretning/i], skills: ['el.fortegn'], taskType: ['beregning', 'forklaring'], assignment: 'Avgjøre med passiv fortegnskonvensjon om elementer leverer eller mottar effekt, og kontrollere effektbalansen.', interpretation: ['Strøm inn i «+»: p = v·i. Positiv p betyr mottatt effekt.', 'Summen av effektene i en krets er null.'], prerequisites: [], misconceptions: ['Ser bare på fortegnet til spenningen'], variation: [], estMinutes: 5 },
    { id: 'el.ladning', label: 'Ladning og strøm', match: [/ladning|elektron|coulomb|ampertime|\bA ?h\b/i], skills: ['el.grunnbegreper'], taskType: ['beregning'], assignment: 'Regne mellom strøm, tid og ladning (og antall elektroner).', interpretation: ['q = i·t, og antall elektroner er q delt på elementærladningen.'], prerequisites: [], misconceptions: ['Blander ladning (Ah) og energi (Wh)'], variation: [], estMinutes: 4 },
    { id: 'el.effekt', label: 'Effekt og energi', match: [/effekt|energi|kWh|joule|watt|virkningsgrad/i], skills: ['el.grunnbegreper'], taskType: ['beregning'], assignment: 'Beregne effekt og energi fra spenning, strøm og tid.', interpretation: ['Bruk p = v·i og w = p·t, med tiden i sekunder for joule.', 'Gjør om prefikser (mA, kV) før du regner.'], prerequisites: ['Prefikser'], misconceptions: ['Glemmer å gjøre timer om til sekunder'], variation: ['Apparater', 'Batterikapasitet'], estMinutes: 5 },
  ],
  templates: [tplEffekt, tplFortegn, mcTemplate({ id: 'el-grunn-mc', level: 1, name: 'Flervalg: grunnbegreper', description: 'Ladning, spenning og energi.', title: 'Grunnbegreper', items: GRUNN_MC })],
  misconceptions: [{ id: 'timer', label: 'Timer i stedet for sekunder', explanation: 'Joule krever tid i sekunder.' }],
  recognize: keywordRecognizer([[/Tema: Elektrisitet/, 2.5], [/effekt/i, 1], [/energi|kWh|joule/i, 1.2], [/ladning|elektron(er)?|coulomb|\bA ?h\b|ampertime/i, 2], [/leverer|mottar|fortegnskonvensjon/i, 2], [/batteri/i, 0.6], [/\d\s*(m|k)?W\b/, 0.8]], 2, 'grunnbegreper (ladning, effekt, energi)'),
  explanations: { short: () => ({ text: 'Strøm er ladning per tid, spenning er energi per ladning, og effekt er spenning ganger strøm.', example: '12 V og 0,5 A gir 6 W; på én time blir det 21,6 kJ.' }), analogy: { text: 'Vannrør: strøm er hvor mye vann som renner, spenning er trykkforskjellen, effekt er hvor mye arbeid vannet kan gjøre per sekund.', limits: 'Analogien sier ingenting om hvorfor strømmen er lik gjennom seriekoblede elementer.' }, derivationFormulaId: 'f-effekt-el' },
  solutionStructure: ['Gjør om enheter', 'Sett inn i definisjonen', 'Tolk fortegn'],
  surfaceFeatures: ['Apparater, batterier'],
};

// ——— 2. Resistive kretser: Ohm, Kirchhoff, serie/parallell og deling ———

const tplRt: TemplateDef = {
  id: 'el-rt',
  version: 1,
  level: 1,
  style: 'standard',
  name: 'Seriekobling med parallellgren',
  description: 'R₁ i serie med R₂ ∥ R₃: totalmotstand, strøm og strømdeling.',
  skills: ['el.serieparallell', 'el.ohm', 'el.deling'],
  build: (rng) => {
    for (let k = 0; k < 100; k++) {
      const R1 = r(eR(rng, pick(rng, [1, 10])));
      const R2 = r(eR(rng, 10));
      const R3 = r(eR(rng, 10));
      const Vs = r(pick(rng, [9, 12, 15, 24, 30, 48]));
      const Rp = par(R2, R3);
      const RT = R1.add(Rp);
      if (!RT.isExactDecimal(3)) continue;
      const is = Vs.div(RT);
      const vp = is.mul(Rp);
      const i2 = vp.div(R2);
      const parts: GenPart[] = [
        calcPart({ id: 'a', label: 'a', prompt: 'Finn totalmotstanden RT sett fra kilden.', skills: ['el.serieparallell'], symbols: ['RT', 'Req'], targets: [tgt('RT', 'Totalmotstand', RT, 'Ω', ['totalmotstand', 'Req', 'R'])], solution: [step(`R_2\\parallel R_3 = \\frac{${n(R2)}\\cdot ${n(R3)}}{${n(R2)}+${n(R3)}}\\,\\Omega = ${engTex(n(Rp), 'Ω')}`, `R₂ ∥ R₃ = ${ohm(Rp)}`, 'Parallelle motstander: produkt over sum.', 'definisjon'), step(`R_T = R_1 + R_2\\parallel R_3 = ${engTex(n(RT), 'Ω')}`, `RT = ${ohm(RT)}`, 'Serie: legg sammen.', 'innsetting')], hints: hints('Start med det som står i parallell.', 'R₂ ∥ R₃ = R₂R₃/(R₂ + R₃)', 'Parallellgrenen byttes ut med én motstand, og så legger du til R₁ i serie.') }),
        calcPart({ id: 'b', label: 'b', prompt: 'Hvor stor strøm leverer kilden?', skills: ['el.ohm'], symbols: ['is', 'i'], targets: [tgt('is', 'Strøm fra kilden', is, 'A', ['strøm', 'i'])], solution: [step(`i_s = \\frac{V_s}{R_T} = \\frac{${n(Vs)}\\,\\mathrm{V}}{${engTex(n(RT), 'Ω')}} = ${engTex(n(is), 'A')}`, `is = ${eng(n(is), 'A')}`, 'Ohms lov på hele kretsen.', 'innsetting')], hints: hints('Bruk Ohms lov med totalmotstanden.', 'i = V/RT', 'Kilden ser bare totalmotstanden.') }),
        calcPart({ id: 'c', label: 'c', prompt: 'Hvor stor strøm går gjennom R₂?', skills: ['el.deling'], symbols: ['i2'], targets: [tgt('i2', 'Strøm gjennom R2', i2, 'A', ['strøm', 'R2'])], solution: [step(`v_{p} = i_s\\cdot (R_2\\parallel R_3) = ${engTex(n(vp), 'V')}`, `Spenningen over parallellgrenen er ${eng(n(vp), 'V')}.`, '', 'innsetting'), step(`i_2 = \\frac{v_p}{R_2} = ${engTex(n(i2), 'A')}`, `i2 = ${eng(n(i2), 'A')}`, 'Eller strømdeling: i₂ = is · R₃/(R₂ + R₃).', 'innsetting')], hints: hints('Finn spenningen over parallellgrenen først.', 'v = is · (R₂ ∥ R₃)', 'Strømmen deler seg omvendt proporsjonalt med motstandene.') }),
      ];
      return { title: 'Totalmotstand og strømdeling', intro: `En spenningskilde på ${n(Vs)} V er koblet til R₁ = ${ohm(R1)} i serie med en parallellkobling av R₂ = ${ohm(R2)} og R₃ = ${ohm(R3)}.`, context: 'rt', parts, params: { R1: R1.toString(), R2: R2.toString(), R3: R3.toString(), Vs: Vs.toString() }, skills: ['el.serieparallell', 'el.ohm', 'el.deling'], structureKey: 'el-rt', estMinutes: 7 };
    }
    throw new Error('Fant ikke gyldige tall');
  },
};

const tplDeler: TemplateDef = {
  id: 'el-spenningsdeler',
  version: 1,
  level: 2,
  style: 'standard',
  name: 'Spenningsdeler med og uten last',
  description: 'vo = Vs·R₂/(R₁ + R₂), og hva en last gjør med utgangsspenningen.',
  skills: ['el.deling', 'el.serieparallell'],
  build: (rng) => {
    for (let k = 0; k < 100; k++) {
      const Vs = r(pick(rng, [10, 12, 15, 20, 24]));
      const R1 = r(eR(rng, 1000));
      const R2 = r(eR(rng, 1000));
      const RL = r(eR(rng, pick(rng, [1000, 10000])));
      const vo = Vs.mul(R2).div(R1.add(R2));
      const Rp = par(R2, RL);
      const voL = Vs.mul(Rp).div(R1.add(Rp));
      if (Math.abs(n(vo) - n(voL)) < 0.05) continue;
      const parts: GenPart[] = [
        calcPart({ id: 'a', label: 'a', prompt: 'Hva er utgangsspenningen vo over R₂ uten last?', skills: ['el.deling'], symbols: ['vo', 'v0'], targets: [tgt('vo', 'Utgangsspenning uten last', vo, 'V', ['utgangsspenning', 'v'])], solution: [step(`v_o = V_s\\frac{R_2}{R_1+R_2} = ${n(Vs)}\\,\\mathrm{V}\\cdot\\frac{${ohm(R2).replace(' ', '\\,')}}{${ohm(R1.add(R2)).replace(' ', '\\,')}} = ${engTex(n(vo), 'V')}`, `vo = ${eng(n(vo), 'V')}`, 'Samme strøm går gjennom begge motstandene, så spenningen deler seg i forhold til motstandene.', 'definisjon')], hints: hints('Spenningsdeling.', 'vo = Vs · R₂/(R₁ + R₂)', 'Gjelder bare når ingen strøm går ut av midtpunktet.') }),
        calcPart({ id: 'b', label: 'b', prompt: `En last RL = ${ohm(RL)} kobles over utgangen. Hva blir vo nå?`, skills: ['el.deling', 'el.serieparallell'], symbols: ['vo', 'vL'], targets: [tgt('vo', 'Utgangsspenning med last', voL, 'V', ['utgangsspenning', 'vL'])], solution: [step(`R_2\\parallel R_L = ${engTex(n(Rp), 'Ω')}`, `R₂ ∥ RL = ${ohm(Rp)}`, 'Lasten står i parallell med R₂.', 'identitet'), step(`v_o = V_s\\frac{R_2\\parallel R_L}{R_1 + R_2\\parallel R_L} = ${engTex(n(voL), 'V')}`, `vo = ${eng(n(voL), 'V')}`, 'Spenningsdeling igjen, nå med den nye nedre motstanden.', 'innsetting')], hints: hints('Hva står i parallell med R₂?', 'Slå sammen R₂ og RL først.', 'En last trekker strøm og senker spenningen.') }),
        mcPart(rng, { id: 'last', skill: 'el.deling', stem: 'Hvorfor ble utgangsspenningen lavere med last?', correct: 'Lasten står i parallell med R₂, så motstanden i den nedre delen blir mindre og får en mindre andel av spenningen.', wrong: ['Lasten øker totalmotstanden i kretsen.', 'Kilden gir lavere spenning når den belastes.', 'Strømmen gjennom R₁ blir mindre.'], why: 'Parallellkobling gir lavere motstand. Da blir strømmen større, spenningsfallet over R₁ øker, og vo faller.' }, 'c', 'c'),
      ];
      return { title: 'Spenningsdeler', intro: `En spenningsdeler består av R₁ = ${ohm(R1)} og R₂ = ${ohm(R2)} i serie over en kilde på ${n(Vs)} V. Utgangen tas over R₂.`, context: 'deler', parts, params: { Vs: Vs.toString(), R1: R1.toString(), R2: R2.toString(), RL: RL.toString() }, skills: ['el.deling', 'el.serieparallell'], structureKey: 'el-deler', estMinutes: 7 };
    }
    throw new Error('Fant ikke gyldige tall');
  },
};

const tplKvl: TemplateDef = {
  id: 'el-kvl',
  version: 1,
  level: 1,
  style: 'standard',
  name: 'Kirchhoffs spenningslov i en sløyfe',
  description: 'Summen av spenningene rundt en lukket sløyfe er null.',
  skills: ['el.kirchhoff', 'el.ohm'],
  build: (rng) => {
    const V = randInt(rng, 6, 30) * 2;
    const v1 = randInt(rng, 2, Math.floor(V / 3));
    const v2 = randInt(rng, 2, Math.floor(V / 3));
    const v3 = V - v1 - v2;
    const R3 = eR(rng, 100);
    const i = r(v3).div(r(R3));
    const parts: GenPart[] = [
      calcPart({ id: 'a', label: 'a', prompt: 'Finn spenningen v₃ over R₃.', skills: ['el.kirchhoff'], symbols: ['v3'], targets: [tgt('v3', 'Spenning over R3', v3, 'V', ['v', 'spenning'])], solution: [step(`V - v_1 - v_2 - v_3 = 0 \\Rightarrow v_3 = ${V} - ${v1} - ${v2} = ${v3}\\,\\mathrm{V}`, `v3 = ${v3} V`, 'Går du rundt sløyfa, er summen av spenningsøkninger lik summen av spenningsfall.', 'identitet')], hints: hints('Gå rundt sløyfa.', `${V} = ${v1} + ${v2} + v₃`, 'Kirchhoffs spenningslov.') }),
      calcPart({ id: 'b', label: 'b', prompt: 'Hvor stor strøm går i sløyfa?', skills: ['el.ohm'], symbols: ['i'], targets: [tgt('i', 'Strøm', i, 'A', ['strøm'])], solution: [step(`i = \\frac{v_3}{R_3} = \\frac{${v3}\\,\\mathrm{V}}{${R3}\\,\\Omega} = ${engTex(n(i), 'A')}`, `i = ${eng(n(i), 'A')}`, 'Samme strøm går gjennom alle elementene i en seriekobling.', 'innsetting')], hints: hints('Bruk Ohms lov på R₃.', 'i = v₃/R₃', 'Seriekobling: én strøm.') }),
    ];
    return { title: 'Kirchhoffs spenningslov', intro: `En kilde på ${V} V er koblet i serie med tre motstander. Spenningen over R₁ er ${v1} V, over R₂ er ${v2} V, og R₃ = ${R3} Ω.`, context: 'kvl', parts, params: { V: String(V), v1: String(v1), v2: String(v2), R3: String(R3) }, skills: ['el.kirchhoff', 'el.ohm'], structureKey: 'el-kvl', estMinutes: 4 };
  },
};

const RES_MC: McItem[] = [
  { id: 'parallell-mindre', skill: 'el.serieparallell', stem: 'To motstander kobles i parallell. Hva gjelder alltid for den ekvivalente motstanden?', correct: 'Den er mindre enn den minste av de to.', wrong: ['Den er summen av de to.', 'Den er gjennomsnittet av de to.', 'Den er større enn den største av de to.'], why: 'Parallellgrener gir strømmen flere veier, så kretsen leder bedre. 1/R = 1/R₁ + 1/R₂ gir alltid R < min(R₁, R₂).' },
  { id: 'kcl', skill: 'el.kirchhoff', stem: 'Hva sier Kirchhoffs strømlov?', correct: 'Summen av strømmene inn i en node er lik summen av strømmene ut.', wrong: ['Summen av spenningene rundt en sløyfe er null.', 'Strømmen er lik i alle grener av en krets.', 'Strømmen deler seg likt mellom parallelle grener.'], why: 'Ladning hoper seg ikke opp i en node. KVL gjelder spenninger rundt en sløyfe.' },
  { id: 'kortslutning', skill: 'el.serieparallell', stem: 'En motstand kortsluttes med en ledning i parallell. Hva skjer med strømmen gjennom motstanden?', correct: 'Den blir null, fordi spenningen over motstanden blir null.', wrong: ['Den dobles.', 'Den er uendret.', 'Den halveres.'], why: 'En ideell ledning har ingen spenning over seg. Parallelt betyr samme spenning, så motstanden får 0 V og dermed 0 A.' },
  { id: 'deling-storst', skill: 'el.deling', stem: 'Tre motstander står i serie over en kilde. Hvilken får størst spenning over seg?', correct: 'Den største motstanden.', wrong: ['Den minste motstanden.', 'Den som står nærmest plusspolen.', 'Alle får like stor spenning.'], why: 'Samme strøm går gjennom alle. v = R·i, så størst R gir størst spenning.' },
  { id: 'strom-deling', skill: 'el.deling', stem: 'To motstander står i parallell. Hvilken får størst strøm?', correct: 'Den minste motstanden.', wrong: ['Den største motstanden.', 'Begge får like stor strøm.', 'Det avhenger av hvilken som står først.'], why: 'Samme spenning over begge. i = v/R, så minst motstand gir størst strøm.' },
];

const motstand: FamilyKB = {
  id: 'el-motstand',
  domain: 'elektro',
  name: 'Ohms lov, Kirchhoff og motstandsnettverk',
  shortName: 'Motstandsnettverk',
  topic: 'Elektriske kretser',
  subtopics: ['Ohms lov', 'Kirchhoffs lover', 'Serie og parallell', 'Spennings- og strømdeling'],
  description: 'Totalmotstand, Ohms lov, Kirchhoffs lover og spennings- og strømdeling i resistive kretser.',
  skills: ['el.ohm', 'el.kirchhoff', 'el.serieparallell', 'el.deling'],
  formulas: [
    { id: 'f-ohm', tex: 'v = R\\,i', name: 'Ohms lov', kind: 'modellantakelse', kindWhy: 'Gjelder lineære motstander (ohmske komponenter), ikke alle komponenter.', symbols: [{ sym: 'v', meaning: 'Spenning over motstanden', unit: 'V' }, { sym: 'R', meaning: 'Motstand', unit: 'Ω' }, { sym: 'i', meaning: 'Strøm gjennom motstanden', unit: 'A' }], conditions: ['Strømmen går inn i «+»-terminalen (passiv fortegnskonvensjon).'], whatIf: ['Dobbel motstand ved samme spenning gir halv strøm.'] },
    { id: 'f-parallell', tex: 'R_1\\parallel R_2 = \\frac{R_1 R_2}{R_1 + R_2}', name: 'To motstander i parallell', kind: 'avledet sammenheng', kindWhy: 'Følger av KCL og Ohms lov: samme spenning, strømmene summeres.', symbols: [{ sym: 'R_1, R_2', meaning: 'Motstandene', unit: 'Ω' }], conditions: ['Begge motstandene har samme to noder.'], whatIf: ['To like motstander i parallell gir halvparten.'], calc: { inputs: [{ sym: 'a', label: 'R₁ (Ω)', min: 1, max: 1000, step: 1, value: 100 }, { sym: 'b', label: 'R₂ (Ω)', min: 1, max: 1000, step: 1, value: 300 }], compute: (v) => [{ label: 'Serie', value: eng(v.a + v.b, 'Ω', 4) }, { label: 'Parallell', value: eng((v.a * v.b) / (v.a + v.b), 'Ω', 4) }] } },
    { id: 'f-spenningsdeling', tex: 'v_2 = V\\,\\frac{R_2}{R_1 + R_2}', name: 'Spenningsdeling', kind: 'avledet sammenheng', kindWhy: 'Følger av at samme strøm går gjennom begge motstandene.', symbols: [{ sym: 'V', meaning: 'Spenning over hele seriekoblingen', unit: 'V' }], conditions: ['Ingen strøm går ut av midtpunktet (ubelastet deler).'], whatIf: ['En last over R₂ senker v₂.'], calc: { inputs: [{ sym: 'V', label: 'V (V)', min: 1, max: 50, step: 1, value: 12 }, { sym: 'a', label: 'R₁ (kΩ)', min: 0.1, max: 100, step: 0.1, value: 4.7 }, { sym: 'b', label: 'R₂ (kΩ)', min: 0.1, max: 100, step: 0.1, value: 10 }], compute: (v) => [{ label: 'v₂', value: eng((v.V * v.b) / (v.a + v.b), 'V', 4) }, { label: 'Strøm', value: eng(v.V / ((v.a + v.b) * 1000), 'A', 3) }] } },
    { id: 'f-stromdeling', tex: 'i_1 = i\\,\\frac{R_2}{R_1 + R_2}', name: 'Strømdeling (to grener)', kind: 'avledet sammenheng', kindWhy: 'Følger av samme spenning over begge grenene.', symbols: [{ sym: 'i', meaning: 'Strøm inn i parallellkoblingen', unit: 'A' }], conditions: ['Legg merke til at det er den andre motstanden i telleren.'], whatIf: [] },
    { id: 'f-kirchhoff', tex: '\\sum i_{\\text{inn}} = \\sum i_{\\text{ut}},\\quad \\sum_{\\text{sløyfe}} v = 0', name: 'Kirchhoffs lover', kind: 'identitet', kindWhy: 'Bevaring av ladning (KCL) og energi (KVL).', symbols: [], conditions: ['Gjelder alle kretser med samlede komponenter.'], whatIf: [] },
  ],
  intents: [
    { id: 'el.rt', label: 'Totalmotstand', match: [/totalmotstand|ekvivalent(e)? motstand|sett fra kilden|seriekob|parallellkob/i, /\bR_?(T|ab)\b/], skills: ['el.serieparallell'], taskType: ['beregning'], assignment: 'Finne ekvivalent motstand ved å slå sammen serie- og parallellkoblinger steg for steg.', interpretation: ['Start innerst: slå sammen det som står i parallell eller serie, og tegn gjerne kretsen på nytt.', 'Parallell: produkt over sum. Serie: sum.'], prerequisites: ['Brøkregning'], misconceptions: ['Legger sammen parallelle motstander', 'Blander hvilke motstander som deler noder'], variation: ['Stige-nettverk', 'Motstand sett fra to terminaler'], estMinutes: 6 },
    { id: 'el.deling', label: 'Spennings- og strømdeling', match: [/spenningsdel|strømdel|spenningsfall|last/i], skills: ['el.deling'], taskType: ['beregning'], assignment: 'Bruke spenningsdeling (serie) eller strømdeling (parallell) for å finne en spenning eller strøm.', interpretation: ['Spenningsdeling krever at samme strøm går gjennom motstandene.', 'Strømdeling: den andre motstanden i telleren.'], prerequisites: ['Serie og parallell'], misconceptions: ['Bruker spenningsdeling når en last trekker strøm'], variation: [], estMinutes: 5 },
    { id: 'el.kirchhoff', label: 'Kirchhoffs lover og Ohms lov', match: [/kirchhoff|KVL|KCL|sløyfe|ohms lov|grenstrøm/i], skills: ['el.kirchhoff', 'el.ohm'], taskType: ['beregning'], assignment: 'Sette opp Kirchhoffs lover og Ohms lov for å finne ukjente strømmer og spenninger.', interpretation: ['Velg referanseretninger først og hold fortegnene konsekvent.'], prerequisites: [], misconceptions: ['Fortegnsfeil rundt sløyfa'], variation: [], estMinutes: 5 },
  ],
  templates: [tplRt, tplDeler, tplKvl, mcTemplate({ id: 'el-res-mc', level: 1, name: 'Flervalg: resistive kretser', description: 'Serie, parallell og deling.', title: 'Resistive kretser', items: RES_MC })],
  misconceptions: [{ id: 'parallell-sum', label: 'Legger sammen parallelle motstander', explanation: 'Parallelle motstander gir lavere motstand, ikke høyere.' }],
  recognize: keywordRecognizer([[/Tema: (Grunnleggende lover|Resistive)/, 2.5], [/totalmotstand|ekvivalent(e)? motstand/i, 2.5], [/\bR_?T\b/, 1.5], [/seriekob|parallellkob|i serie|i parallell/i, 2], [/spenningsdel|strømdel/i, 2.5], [/motstand(en|ene)?\b/i, 0.8], [/ohms lov|kirchhoff|sløyfe/i, 2], [/\d\s*[kM]?Ω/, 0.8], [/resistive? krets/i, 2]], 2.4, 'resistive kretser (serie, parallell, deling)'),
  explanations: { short: () => ({ text: 'Serie: én strøm, spenningene legges sammen. Parallell: én spenning, strømmene legges sammen.', example: '100 Ω ∥ 300 Ω = 75 Ω.' }), analogy: { text: 'Parallelle grener er flere kasser åpne i butikken: køen går raskere (lavere motstand).', limits: 'Sier ingenting om hvor stor strøm hver gren får.' }, derivationFormulaId: 'f-parallell' },
  solutionStructure: ['Slå sammen motstander', 'Ohms lov', 'Del spenning eller strøm'],
  surfaceFeatures: ['Motstandsverdier, kilder'],
};

// ——— 3. Kretsanalyse: nodespenning, Thevenin/Norton og maksimal effekt ———

const tplNode: TemplateDef = {
  id: 'el-node',
  version: 1,
  level: 2,
  style: 'standard',
  name: 'Nodespenningsmetoden (én ukjent node)',
  description: 'KCL i én node med tre grener.',
  skills: ['el.nodespenning'],
  build: (rng) => {
    for (let k = 0; k < 200; k++) {
      const V1 = r(randInt(rng, 2, 12) * 5);
      const V2 = r(randInt(rng, 0, 6) * 5);
      const R1 = r(eR(rng, 1));
      const R2 = r(eR(rng, 1));
      const R3 = r(eR(rng, 1));
      const g = r(1).div(R1).add(r(1).div(R2)).add(r(1).div(R3));
      const va = V1.div(R1).add(V2.div(R2)).div(g);
      if (!va.isExactDecimal(3)) continue;
      const i3 = va.div(R3);
      const parts: GenPart[] = [
        calcPart({ id: 'a', label: 'a', prompt: 'Sett opp nodelikningen i node a og finn nodespenningen va.', skills: ['el.nodespenning'], symbols: ['va'], targets: [tgt('va', 'Nodespenning', va, 'V', ['nodespenning', 'v'])], solution: [step(`\\frac{v_a - ${n(V1)}}{${n(R1)}} + \\frac{v_a - ${n(V2)}}{${n(R2)}} + \\frac{v_a}{${n(R3)}} = 0`, 'Summen av strømmene ut av noden er null.', 'Hver gren: (nodespenning − spenningen i den andre enden) delt på motstanden.', 'identitet'), step(`v_a = ${engTex(n(va), 'V')}`, `va = ${eng(n(va), 'V')}`, 'Samle va på én side og løs.', 'omforming')], hints: hints('Skriv strømmen ut av node a i hver gren.', `(va − ${n(V1)})/${n(R1)} + …`, 'KCL: strømmene ut av noden summeres til null.') }),
        calcPart({ id: 'b', label: 'b', prompt: 'Hvor stor strøm går gjennom R₃ ned til jord?', skills: ['el.nodespenning', 'el.ohm'], symbols: ['i3'], targets: [tgt('i3', 'Strøm gjennom R3', i3, 'A', ['strøm', 'i'])], solution: [step(`i_3 = \\frac{v_a}{R_3} = ${engTex(n(i3), 'A')}`, `i3 = ${eng(n(i3), 'A')}`, 'Nedre ende av R₃ er jord (0 V).', 'innsetting')], hints: hints('Ohms lov på R₃.', 'i₃ = va/R₃', 'Spenningen over R₃ er nodespenningen.') }),
      ];
      return { title: 'Nodespenningsmetoden', intro: `Node a er koblet til en kilde på ${n(V1)} V gjennom R₁ = ${n(R1)} Ω, til ${n(V2) === 0 ? 'jord' : `en kilde på ${n(V2)} V`} gjennom R₂ = ${n(R2)} Ω, og til jord gjennom R₃ = ${n(R3)} Ω. Kildene har minuspolen mot jord.`, context: 'node', parts, params: { V1: V1.toString(), V2: V2.toString(), R1: R1.toString(), R2: R2.toString(), R3: R3.toString() }, skills: ['el.nodespenning'], structureKey: `el-node|${n(V2) === 0 ? 'jord' : 'kilde'}`, estMinutes: 7 };
    }
    throw new Error('Fant ikke gyldige tall');
  },
};

const tplThevenin: TemplateDef = {
  id: 'el-thevenin',
  version: 1,
  level: 2,
  style: 'standard',
  name: 'Thevenin-ekvivalent og maksimal effekt',
  description: 'Tomgangsspenning, motstand med nullstilte kilder, og tilpasset last.',
  skills: ['el.thevenin', 'el.maksimaleffekt'],
  build: (rng) => {
    for (let k = 0; k < 200; k++) {
      const Vs = r(pick(rng, [10, 12, 20, 24, 30, 36, 48, 60]));
      const R1 = r(eR(rng, 10));
      const R2 = r(eR(rng, 10));
      const R3 = r(eR(rng, 10));
      const vth = Vs.mul(R2).div(R1.add(R2));
      const rth = par(R1, R2).add(R3);
      if (!vth.isExactDecimal(3) || !rth.isExactDecimal(3)) continue;
      const iN = vth.div(rth);
      const pmax = vth.mul(vth).div(rth.mul(r(4)));
      const parts: GenPart[] = [
        calcPart({ id: 'a', label: 'a', prompt: 'Finn Thevenin-spenningen vTh mellom a og b.', skills: ['el.thevenin'], symbols: ['vTh', 'VTh'], targets: [tgt('vTh', 'Thevenin-spenning', vth, 'V', ['thevenin', 'v'])], solution: [step(`v_{Th} = V_s\\frac{R_2}{R_1+R_2} = ${engTex(n(vth), 'V')}`, `vTh = ${eng(n(vth), 'V')}`, 'Tomgang: ingen strøm i R₃, så spenningen mellom a og b er spenningen over R₂.', 'innsetting')], hints: hints('Hva er spenningen over terminalene når ingenting er koblet til?', 'Ingen strøm i R₃ ved tomgang.', 'Thevenin-spenningen er tomgangsspenningen.') }),
        calcPart({ id: 'b', label: 'b', prompt: 'Finn Thevenin-motstanden RTh.', skills: ['el.thevenin'], symbols: ['RTh'], targets: [tgt('RTh', 'Thevenin-motstand', rth, 'Ω', ['motstand', 'R'])], solution: [step(`R_{Th} = R_1\\parallel R_2 + R_3 = ${engTex(n(par(R1, R2)), 'Ω')} + ${engTex(n(R3), 'Ω')} = ${engTex(n(rth), 'Ω')}`, `RTh = ${ohm(rth)}`, 'Nullstill spenningskilden (erstatt med kortslutning) og se inn i terminalene.', 'omforming')], hints: hints('Kortslutt spenningskilden.', 'R₁ og R₂ blir da parallelle.', 'Uavhengige kilder nullstilles: spenningskilde → kortslutning, strømkilde → brudd.') }),
        calcPart({ id: 'c', label: 'c', prompt: 'Hvor stor last RL gir størst effekt i lasten, og hvor stor er denne effekten?', skills: ['el.maksimaleffekt'], symbols: ['RL', 'Pmax'], targets: [tgt('RL', 'Lastmotstand', rth, 'Ω', ['last', 'R']), tgt('Pmax', 'Maksimal effekt', pmax, 'W', ['effekt', 'P'])], solution: [step(`R_L = R_{Th} = ${engTex(n(rth), 'Ω')}`, `RL = ${ohm(rth)}`, 'Maksimal effektoverføring skjer når lasten er lik Thevenin-motstanden.', 'modellantakelse'), step(`P_{max} = \\frac{v_{Th}^2}{4R_{Th}} = ${engTex(n(pmax), 'W')}`, `Pmax = ${eng(n(pmax), 'W')}`, 'Halve Thevenin-spenningen ligger over lasten.', 'innsetting')], hints: hints('Lasten skal være lik noe du allerede har funnet.', 'RL = RTh', 'Da ligger vTh/2 over lasten: P = (vTh/2)²/RTh.') }),
      ];
      return { title: 'Thevenin-ekvivalent', intro: `En kilde på ${n(Vs)} V er koblet i serie med R₁ = ${ohm(R1)}. Over kilden og R₁ står R₂ = ${ohm(R2)} (parallelt over utgangen), og fra toppen av R₂ går R₃ = ${ohm(R3)} ut til terminal a. Terminal b er jord. (Nortonstrømmen blir ${eng(n(iN), 'A', 3)}.)`, context: 'thevenin', parts, params: { Vs: Vs.toString(), R1: R1.toString(), R2: R2.toString(), R3: R3.toString() }, skills: ['el.thevenin', 'el.maksimaleffekt'], structureKey: 'el-thevenin', estMinutes: 9 };
    }
    throw new Error('Fant ikke gyldige tall');
  },
};

const ANALYSE_MC: McItem[] = [
  { id: 'nullstill', skill: 'el.thevenin', stem: 'Hvordan nullstiller du en uavhengig strømkilde når du skal finne Thevenin-motstanden?', correct: 'Den erstattes med et brudd (åpen krets).', wrong: ['Den erstattes med en kortslutning.', 'Den erstattes med en motstand på 1 Ω.', 'Den beholdes som den er.'], why: 'En nullstilt strømkilde gir 0 A uansett spenning, og det er det samme som et brudd. En nullstilt spenningskilde gir 0 V, altså en kortslutning.' },
  { id: 'norton', skill: 'el.thevenin', stem: 'En Thevenin-ekvivalent har vTh = 12 V og RTh = 4 Ω. Hva er Norton-ekvivalenten?', correct: 'iN = 3 A i parallell med 4 Ω.', wrong: ['iN = 48 A i parallell med 4 Ω.', 'iN = 3 A i serie med 4 Ω.', 'iN = 12 A i parallell med 1/4 Ω.'], why: 'Kildetransformasjon: iN = vTh/RTh, og samme motstand står i parallell.' },
  { id: 'nodevalg', skill: 'el.nodespenning', stem: 'Hvor mange nodelikninger trenger du i en krets med 4 noder (jord medregnet) og ingen spenningskilder mellom ikke-jordede noder?', correct: '3', wrong: ['4', '2', '1'], why: 'Én node velges som referanse (jord). De andre får hver sin likning.' },
  { id: 'maks-virkning', skill: 'el.maksimaleffekt', stem: 'Ved maksimal effektoverføring, hvor stor andel av effekten fra Thevenin-kilden havner i lasten?', correct: '50 %', wrong: ['100 %', '25 %', '75 %'], why: 'Samme strøm går gjennom RTh og RL = RTh, så effekten deles likt.' },
];

const kretsanalyse: FamilyKB = {
  id: 'el-kretsanalyse',
  domain: 'elektro',
  name: 'Nodespenning, maskestrøm og Thevenin/Norton',
  shortName: 'Kretsanalyse',
  topic: 'Elektriske kretser',
  subtopics: ['Nodespenningsmetoden', 'Maskestrømmetoden', 'Kildetransformasjon', 'Thevenin og Norton', 'Maksimal effektoverføring'],
  description: 'Systematiske metoder for kretser med flere kilder, og ekvivalenter sett fra to terminaler.',
  skills: ['el.nodespenning', 'el.thevenin', 'el.maksimaleffekt'],
  formulas: [
    { id: 'f-node', tex: '\\sum_k \\frac{v_a - v_k}{R_k} = 0', name: 'Nodelikning', kind: 'avledet sammenheng', kindWhy: 'KCL i noden, med Ohms lov for hver gren.', symbols: [{ sym: 'v_a', meaning: 'Nodespenningen (mot jord)', unit: 'V' }, { sym: 'v_k', meaning: 'Spenningen i andre enden av gren k', unit: 'V' }], conditions: ['Én node er referanse (0 V).'], whatIf: ['En strømkilde inn i noden legges til direkte.'], calc: { inputs: [{ sym: 'V1', label: 'V₁ (V)', min: 0, max: 100, step: 1, value: 50 }, { sym: 'R1', label: 'R₁ (Ω)', min: 1, max: 1000, step: 1, value: 200 }, { sym: 'V2', label: 'V₂ (V)', min: 0, max: 100, step: 1, value: 20 }, { sym: 'R2', label: 'R₂ (Ω)', min: 1, max: 1000, step: 1, value: 200 }, { sym: 'R3', label: 'R₃ til jord (Ω)', min: 1, max: 1000, step: 1, value: 400 }], compute: (v) => { const va = (v.V1 / v.R1 + v.V2 / v.R2) / (1 / v.R1 + 1 / v.R2 + 1 / v.R3); return [{ label: 'va', value: eng(va, 'V', 4) }, { label: 'i gjennom R₃', value: eng(va / v.R3, 'A', 3) }]; } } },
    { id: 'f-thevenin', tex: 'v_{Th} = v_{ab,\\text{tomgang}},\\quad R_{Th} = \\frac{v_{Th}}{i_{kortslutning}}', name: 'Thevenin-ekvivalent', kind: 'identitet', kindWhy: 'Enhver lineær krets sett fra to terminaler kan erstattes med en spenningskilde i serie med en motstand.', symbols: [{ sym: 'v_{Th}', meaning: 'Tomgangsspenning', unit: 'V' }, { sym: 'R_{Th}', meaning: 'Motstand sett inn i terminalene med nullstilte kilder', unit: 'Ω' }], conditions: ['Lineær krets.'], whatIf: ['iN = vTh/RTh gir Norton-ekvivalenten.'] },
    { id: 'f-maxeffekt', tex: 'R_L = R_{Th} \\Rightarrow P_{max} = \\frac{v_{Th}^2}{4R_{Th}}', name: 'Maksimal effektoverføring', kind: 'avledet sammenheng', kindWhy: 'Deriver P(RL) og sett lik null.', symbols: [], conditions: ['RTh er gitt og RL kan velges.'], whatIf: ['Virkningsgraden er da bare 50 %.'], calc: { inputs: [{ sym: 'v', label: 'vTh (V)', min: 1, max: 100, step: 1, value: 12 }, { sym: 'R', label: 'RTh (Ω)', min: 1, max: 1000, step: 1, value: 50 }, { sym: 'L', label: 'RL (Ω)', min: 1, max: 1000, step: 1, value: 50 }], compute: (v) => [{ label: 'Effekt i lasten', value: eng((v.v * v.v * v.L) / ((v.R + v.L) * (v.R + v.L)), 'W', 3) }, { label: 'Maksimal mulig', value: eng((v.v * v.v) / (4 * v.R), 'W', 3) }] } },
  ],
  intents: [
    { id: 'el.thevenin', specific: true, label: 'Thevenin og Norton', match: [/th[eé]venin|norton|kildetransformasjon/i], skills: ['el.thevenin'], taskType: ['beregning', 'tegning'], assignment: 'Finne Thevenin- eller Norton-ekvivalenten sett fra to terminaler, og tegne den.', interpretation: ['vTh er tomgangsspenningen.', 'RTh: nullstill uavhengige kilder og se inn i terminalene (eller vTh/iN).'], prerequisites: ['Serie og parallell', 'Nodespenning'], misconceptions: ['Nullstiller strømkilder som kortslutning'], variation: [], estMinutes: 9 },
    { id: 'el.maxeffekt', specific: true, label: 'Maksimal effektoverføring', match: [/maksimal effekt|effektoverføring|tilpasset last/i], skills: ['el.maksimaleffekt'], taskType: ['beregning'], assignment: 'Velge lastmotstand for maksimal effekt og beregne effekten.', interpretation: ['RL = RTh gir Pmax = vTh²/(4RTh).'], prerequisites: ['Thevenin'], misconceptions: [], variation: [], estMinutes: 5 },
    { id: 'el.maske', label: 'Maskestrømmetoden', match: [/maskestrøm|maskelikning|maskeligning|maske/i], skills: ['el.kirchhoff'], taskType: ['beregning'], assignment: 'Sette opp maskelikninger (KVL) og løse for maskestrømmene.', interpretation: ['Én maskestrøm per maske. Motstander som deler to masker får differansen av strømmene.'], prerequisites: ['Likningssett'], misconceptions: ['Glemmer at felles gren har to maskestrømmer'], variation: [], estMinutes: 8 },
    { id: 'el.node', label: 'Nodespenningsmetoden', match: [/nodespenning|nodelikning|nodeligning|node(n)? [a-e]\b/i], skills: ['el.nodespenning'], taskType: ['beregning'], assignment: 'Sette opp nodelikninger (KCL) og løse for nodespenningene.', interpretation: ['Velg referansenode, skriv strømmen ut av noden i hver gren, og løs likningssettet.'], prerequisites: ['Likningssett'], misconceptions: ['Fortegnsfeil i grenstrømmene'], variation: [], estMinutes: 8 },
  ],
  templates: [tplNode, tplThevenin, mcTemplate({ id: 'el-analyse-mc', level: 1, name: 'Flervalg: kretsanalyse', description: 'Nullstilling av kilder, Norton, antall likninger.', title: 'Kretsanalyse', items: ANALYSE_MC })],
  misconceptions: [{ id: 'nullstill-feil', label: 'Feil nullstilling av kilder', explanation: 'Spenningskilde → kortslutning, strømkilde → brudd.' }],
  recognize: keywordRecognizer([[/Tema: Kretsanalyse/, 2.5], [/nodespenning|nodelikning|nodeligning/i, 3], [/maskestrøm|maskelikning|maskeligning/i, 3], [/th[eé]venin|norton/i, 3], [/kildetransformasjon/i, 3], [/effektoverføring|maksimal effekt/i, 2], [/terminal(ene)? a og b|mellom a og b/i, 1]], 2.5, 'kretsanalyse (node, maske, Thevenin)'),
  explanations: { short: () => ({ text: 'Nodespenning: KCL i hver node. Thevenin: tomgangsspenning og motstand med nullstilte kilder.', example: 'vTh = 3 V og RTh = 120 Ω betyr at kretsen oppfører seg som en 3 V-kilde med 120 Ω i serie.' }), analogy: { text: 'Thevenin er en «svart boks»: utenfra ser du bare én kilde og én motstand.', limits: 'Gjelder bare lineære kretser og bare det som skjer ved terminalene.' }, derivationFormulaId: 'f-thevenin' },
  solutionStructure: ['Velg metode', 'Sett opp likninger', 'Løs', 'Kontroller'],
  surfaceFeatures: ['Kilder, noder, terminaler'],
};

// ——— 4. Operasjonsforsterker ———

function opampTpl(kind: 'inv' | 'ikke'): TemplateDef {
  return {
    id: kind === 'inv' ? 'el-opamp-inv' : 'el-opamp-ikkeinv',
    version: 1,
    level: kind === 'inv' ? 1 : 2,
    style: 'standard',
    name: kind === 'inv' ? 'Inverterende forsterker' : 'Ikke-inverterende forsterker',
    description: kind === 'inv' ? 'vo = −(Rf/Rs)·vs, og metning.' : 'vo = (1 + Rf/Rs)·vs, og metning.',
    skills: ['el.opamp'],
    build: (rng) => {
      const Rs = eR(rng, 1000);
      const gain = pick(rng, [2, 3, 4, 5, 8, 10]);
      const Rf = Rs * (kind === 'inv' ? gain : gain - 1);
      const G = kind === 'inv' ? -gain : gain;
      const vcc = pick(rng, [10, 12, 15]);
      const vs = r(randInt(rng, 2, 30) * 100).div(r(1000));
      const vo = vs.mul(r(G));
      const sat = Math.abs(n(vo)) >= vcc;
      const vs2 = r(vcc).div(r(Math.abs(G)));
      const parts: GenPart[] = [
        calcPart({ id: 'a', label: 'a', prompt: 'Hva er spenningsforsterkningen G = vo/vs?', skills: ['el.opamp'], symbols: ['G'], targets: [tgt('G', 'Forsterkning', G, '', ['forsterkning'])], solution: [step(kind === 'inv' ? `G = -\\frac{R_f}{R_s} = -\\frac{${Rf}}{${Rs}} = ${G}` : `G = 1 + \\frac{R_f}{R_s} = 1 + \\frac{${Rf}}{${Rs}} = ${G}`, `G = ${G}`, kind === 'inv' ? 'Ideell opamp: vn = vp = 0, og strømmen gjennom Rs går videre gjennom Rf.' : 'Ideell opamp: vn = vp = vs, og Rs og Rf danner en spenningsdeler fra vo.', 'identitet')], hints: hints('Bruk reglene for ideell opamp.', kind === 'inv' ? 'vn = vp = 0' : 'vn = vp = vs', 'Ingen strøm inn i inngangene.') }),
        calcPart({ id: 'b', label: 'b', prompt: `Hva blir vo når vs = ${fmtNum(n(vs))} V?`, skills: ['el.opamp'], symbols: ['vo'], targets: [tgt('vo', 'Utgangsspenning', sat ? (n(vo) > 0 ? vcc : -vcc) : vo, 'V', ['utgangsspenning', 'v'])], solution: [step(`v_o = G\\,v_s = ${G}\\cdot ${fmtNum(n(vs)).replace(',', '{,}')}\\,\\mathrm{V} = ${engTex(n(vo), 'V')}`, sat ? `Utregnet ${eng(n(vo), 'V')}, men utgangen kan ikke gå forbi forsyningen: vo = ${n(vo) > 0 ? '' : '−'}${vcc} V (metning).` : `vo = ${eng(n(vo), 'V')}`, sat ? `Forsyningen er ±${vcc} V. Da metter forsterkeren.` : `Innenfor ±${vcc} V, så forsterkeren arbeider lineært.`, 'innsetting')], hints: hints('Gang med forsterkningen, og sjekk mot forsyningsspenningen.', `vo = G · vs`, 'Utgangen kan ikke bli større enn forsyningen.') }),
        calcPart({ id: 'c', label: 'c', prompt: 'Hvor stor kan |vs| høyst være før forsterkeren går i metning?', skills: ['el.opamp'], symbols: ['vs'], targets: [tgt('vs', 'Største inngangsspenning', vs2, 'V', ['inngang', 'v'])], solution: [step(`|v_s| = \\frac{V_{cc}}{|G|} = \\frac{${vcc}}{${Math.abs(G)}} = ${engTex(n(vs2), 'V')}`, `|vs| = ${eng(n(vs2), 'V')}`, 'Grensen nås når |G·vs| = Vcc.', 'omforming')], hints: hints('Når er |vo| lik forsyningen?', '|G · vs| = Vcc', 'Løs for vs.') }),
      ];
      return { title: kind === 'inv' ? 'Inverterende forsterker' : 'Ikke-inverterende forsterker', intro: `En ideell operasjonsforsterker er koblet som ${kind === 'inv' ? 'inverterende' : 'ikke-inverterende'} forsterker med Rs = ${ohm(Rs)} og Rf = ${ohm(Rf)}. Forsyningen er ±${vcc} V.`, context: kind, parts, params: { Rs: String(Rs), Rf: String(Rf), vcc: String(vcc), vs: vs.toString() }, skills: ['el.opamp'], structureKey: `el-opamp-${kind}|${sat ? 'metning' : 'lineær'}`, estMinutes: 6 };
    },
  };
}

const tplSum: TemplateDef = {
  id: 'el-opamp-sum',
  version: 1,
  level: 2,
  style: 'standard',
  name: 'Summerende forsterker',
  description: 'vo = −Rf(va/Ra + vb/Rb).',
  skills: ['el.opamp'],
  build: (rng) => {
    const Rf = eR(rng, 1000);
    const Ra = pick(rng, [Rf, Rf / 2, Rf * 2]);
    const Rb = pick(rng, [Rf, Rf / 2]);
    const va = r(randInt(rng, 1, 15) * 100).div(r(1000));
    const vb = r(randInt(rng, -10, 10) * 100).div(r(1000));
    const vo = r(-Rf).mul(va.div(r(Ra)).add(vb.div(r(Rb))));
    const parts: GenPart[] = [
      calcPart({ id: 'a', label: 'a', prompt: 'Finn utgangsspenningen vo (anta lineær drift).', skills: ['el.opamp'], symbols: ['vo'], targets: [tgt('vo', 'Utgangsspenning', vo, 'V', ['utgangsspenning', 'v'])], solution: [step(`v_o = -R_f\\left(\\frac{v_a}{R_a} + \\frac{v_b}{R_b}\\right) = ${engTex(n(vo), 'V')}`, `vo = ${eng(n(vo), 'V')}`, 'vn = 0, så strømmene fra hver inngang summeres og går gjennom Rf.', 'identitet')], hints: hints('Strømmene inn mot inverterende inngang summeres.', 'vn = vp = 0', 'Hver inngang bidrar med −(Rf/Rk)·vk.') }),
    ];
    return { title: 'Summerende forsterker', intro: `En inverterende summerer har Rf = ${ohm(Rf)}, Ra = ${ohm(Ra)} og Rb = ${ohm(Rb)}. Inngangsspenningene er va = ${fmtNum(n(va))} V og vb = ${fmtNum(n(vb))} V.`, context: 'sum', parts, params: { Rf: String(Rf), Ra: String(Ra), Rb: String(Rb) }, skills: ['el.opamp'], structureKey: 'el-opamp-sum', estMinutes: 5 };
  },
};

const OPAMP_MC: McItem[] = [
  { id: 'regler', skill: 'el.opamp', stem: 'Hvilke to regler bruker vi for en ideell operasjonsforsterker med negativ tilbakekobling?', correct: 'Ingen strøm går inn i inngangene, og spenningen er lik på de to inngangene (vn = vp).', wrong: ['Utgangsstrømmen er null, og vo = vp.', 'Inngangsstrømmene er like store, og vo = 0.', 'Spenningen over Rf er alltid lik vs.'], why: 'Ideell opamp: uendelig inngangsmotstand (ingen inngangsstrøm) og uendelig forsterkning som med negativ tilbakekobling tvinger vn = vp.' },
  { id: 'folger', skill: 'el.opamp', stem: 'Hva er poenget med en spenningsfølger (G = 1)?', correct: 'Den gir samme spenning ut, men kan levere strøm til en last uten å belaste kilden.', wrong: ['Den dobler spenningen.', 'Den snur fortegnet på spenningen.', 'Den gjør ingenting og kan fjernes uten at noe endres.'], why: 'Inngangen trekker ingen strøm, så kilden belastes ikke. Utgangen kan drive en last.' },
  { id: 'metning', skill: 'el.opamp', stem: 'En inverterende forsterker med G = −10 og forsyning ±12 V får vs = 2 V. Hva blir vo?', correct: '−12 V (metning)', wrong: ['−20 V', '20 V', '12 V'], why: 'Lineært ville gitt −20 V, men utgangen kan ikke gå forbi forsyningen.' },
];

const opamp: FamilyKB = {
  id: 'el-opamp',
  domain: 'elektro',
  name: 'Operasjonsforsterkere',
  shortName: 'Opamp',
  topic: 'Elektriske kretser',
  subtopics: ['Ideell opamp', 'Inverterende og ikke-inverterende', 'Summerer og differanseforsterker', 'Metning'],
  description: 'Analyse av kretser med ideell operasjonsforsterker og negativ tilbakekobling.',
  skills: ['el.opamp'],
  formulas: [
    { id: 'f-opamp-inv', tex: 'v_o = -\\frac{R_f}{R_s}\\,v_s', name: 'Inverterende forsterker', kind: 'avledet sammenheng', kindWhy: 'Følger av vn = vp = 0 og ingen inngangsstrøm.', symbols: [{ sym: 'R_f', meaning: 'Tilbakekoblingsmotstand', unit: 'Ω' }, { sym: 'R_s', meaning: 'Inngangsmotstand', unit: 'Ω' }], conditions: ['Lineær drift: |vo| mindre enn forsyningen.'], whatIf: ['Dobbel Rf gir dobbel forsterkning.'], calc: { inputs: [{ sym: 'Rf', label: 'Rf (kΩ)', min: 1, max: 100, step: 1, value: 50 }, { sym: 'Rs', label: 'Rs (kΩ)', min: 1, max: 100, step: 1, value: 10 }, { sym: 'vs', label: 'vs (V)', min: -5, max: 5, step: 0.1, value: 1 }, { sym: 'Vcc', label: 'Forsyning ±V', min: 5, max: 20, step: 1, value: 12 }], compute: (v) => { const vo = (-v.Rf / v.Rs) * v.vs; const c = Math.max(-v.Vcc, Math.min(v.Vcc, vo)); return [{ label: 'Forsterkning', value: fmtNum(-v.Rf / v.Rs, 3) }, { label: 'vo', value: `${eng(c, 'V', 3)}${c !== vo ? ' (metning)' : ''}` }]; } } },
    { id: 'f-opamp-ikke', tex: 'v_o = \\left(1 + \\frac{R_f}{R_s}\\right) v_s', name: 'Ikke-inverterende forsterker', kind: 'avledet sammenheng', kindWhy: 'vn = vp = vs, og Rf, Rs er en spenningsdeler fra vo.', symbols: [], conditions: ['Lineær drift.'], whatIf: ['Rf = 0 (eller Rs uendelig) gir spenningsfølger.'] },
    { id: 'f-opamp-sum', tex: 'v_o = -R_f\\sum_k \\frac{v_k}{R_k}', name: 'Summerende forsterker', kind: 'avledet sammenheng', kindWhy: 'KCL i den inverterende inngangen, som ligger på 0 V.', symbols: [], conditions: ['Lineær drift.'], whatIf: [] },
  ],
  intents: [
    { id: 'el.opamp', label: 'Operasjonsforsterker', match: [/operasjonsforsterker|op-?amp|inverterende|spenningsfølger|differanseforsterker|summer(ende|er)/i], skills: ['el.opamp'], taskType: ['beregning'], assignment: 'Finne spenninger og strømmer i en krets med ideell operasjonsforsterker.', interpretation: ['Bruk de to reglene: ingen strøm inn i inngangene, og vn = vp ved negativ tilbakekobling.', 'Sett opp KCL i inverterende inngang, og sjekk metning mot forsyningen.'], prerequisites: ['Nodespenning', 'Spenningsdeling'], misconceptions: ['Glemmer metning', 'Tror det går strøm inn i inngangen'], variation: ['Flere opamper i kaskade', 'Last på utgangen'], estMinutes: 8 },
  ],
  templates: [opampTpl('inv'), opampTpl('ikke'), tplSum, mcTemplate({ id: 'el-opamp-mc', level: 1, name: 'Flervalg: opamp', description: 'Regler og metning.', title: 'Operasjonsforsterker', items: OPAMP_MC })],
  misconceptions: [{ id: 'metning', label: 'Glemmer metning', explanation: 'Utgangen kan ikke gå forbi forsyningsspenningen.' }],
  recognize: keywordRecognizer([[/operasjonsforsterker|op-?amp/i, 3.5], [/\bR_?f\b|\bR f\b/, 1.5], [/\bv_?[np]\b/, 1], [/inverterende|spenningsfølger|differanseforsterker/i, 2], [/tilbakekob/i, 1.5], [/v_?n\s*=\s*v_?p|vn = vp/i, 2]], 2.5, 'operasjonsforsterker'),
  explanations: { short: () => ({ text: 'Ideell opamp: ingen inngangsstrøm og vn = vp. Resten er KCL og Ohms lov.', example: 'Rf = 40 kΩ, Rs = 10 kΩ inverterende: G = −4.' }), analogy: { text: 'Opampen er en vippe som justerer utgangen til de to inngangene er i balanse.', limits: 'Bare med negativ tilbakekobling og innenfor forsyningen.' }, derivationFormulaId: 'f-opamp-inv' },
  solutionStructure: ['Regler for ideell opamp', 'KCL i inngangen', 'Løs for vo', 'Sjekk metning'],
  surfaceFeatures: ['Motstandsverdier, forsyning'],
};

// ——— 5. Kondensator, spole og førsteordens kretser ———

const tplRc: TemplateDef = {
  id: 'el-rc',
  version: 1,
  level: 2,
  style: 'standard',
  name: 'RC-krets: startverdi, sluttverdi og tidskonstant',
  description: 'vC(t) = Vf + (V0 − Vf)e^(−t/τ) med τ = RC.',
  skills: ['el.transient'],
  build: (rng) => {
    const R = eR(rng, 1000);
    const Cu = pick(rng, [0.1, 0.22, 0.47, 1, 2.2, 4.7, 10]);
    const C = Cu * 1e-6;
    const tau = R * C;
    const Vs = pick(rng, [5, 9, 12, 15, 24]);
    const V0 = pick(rng, [0, 0, 2, 3]);
    const k = pick(rng, [0.5, 1, 2, 3]);
    const t1 = k * tau;
    const v1 = Vs + (V0 - Vs) * Math.exp(-k);
    const parts: GenPart[] = [
      calcPart({ id: 'a', label: 'a', prompt: 'Hva er tidskonstanten τ?', skills: ['el.transient'], symbols: ['τ'], targets: [tgt('τ', 'Tidskonstant', tau, 's', ['tidskonstant', 'τ'])], solution: [step(`\\tau = RC = ${engTex(R, 'Ω')}\\cdot ${engTex(C, 'F')} = ${engTex(tau, 's')}`, `τ = ${eng(tau, 's')}`, 'For RC-kretser er τ = RC, med R sett fra kondensatoren.', 'definisjon')], hints: hints('RC-krets.', 'τ = R · C', 'Ω · F = s.') }),
      calcPart({ id: 'b', label: 'b', prompt: `Hva er kondensatorspenningen ved t = ${eng(t1, 's')}?`, skills: ['el.transient'], symbols: ['vC', 'v'], targets: [tgt('vC', 'Kondensatorspenning', v1, 'V', ['spenning', 'v'])], solution: [step(`v_C(t) = V_f + (V_0 - V_f)e^{-t/\\tau} = ${Vs} + (${V0} - ${Vs})e^{-${fmtNum(k)}}`, 'Generelt uttrykk for førsteordens respons.', 'Sluttverdien er kildespenningen fordi kondensatoren til slutt ikke leder strøm.', 'modellantakelse'), step(`v_C = ${engTex(v1, 'V')}`, `vC = ${eng(v1, 'V')}`, `t/τ = ${fmtNum(k)}.`, 'innsetting')], hints: hints('Finn V0, Vf og τ først.', 'vC(t) = Vf + (V0 − Vf)e^(−t/τ)', 'Etter omtrent 5τ er kretsen i ny likevekt.') }),
      mcPart(rng, { id: 'dc', skill: 'el.transient', stem: 'Hvordan oppfører kondensatoren seg etter svært lang tid med likespenning?', correct: 'Som et brudd: ingen strøm går gjennom den.', wrong: ['Som en kortslutning.', 'Som en motstand på R ohm.', 'Den lader seg ut igjen.'], why: 'i = C dv/dt, og når spenningen er konstant, er strømmen null.' }, 'c', 'c'),
    ];
    return { title: 'Opplading av kondensator', intro: `En kondensator på ${eng(C, 'F', 3)} har spenningen ${V0} V ved t = 0. Da kobles den via R = ${ohm(R)} til en likespenning på ${Vs} V.`, context: 'rc', parts, params: { R: String(R), C: String(C), Vs: String(Vs), V0: String(V0) }, skills: ['el.transient'], structureKey: `el-rc|${V0 === 0 ? '0' : 'v0'}`, estMinutes: 7 };
  },
};

const tplRl: TemplateDef = {
  id: 'el-rl',
  version: 1,
  level: 2,
  style: 'standard',
  name: 'RL-krets: strøm i spolen',
  description: 'iL(t) = If + (I0 − If)e^(−t/τ) med τ = L/R.',
  skills: ['el.transient'],
  build: (rng) => {
    const R = eR(rng, pick(rng, [1, 10]));
    const Lm = pick(rng, [5, 10, 20, 50, 100, 200]);
    const L = Lm * 1e-3;
    const tau = L / R;
    const Vs = pick(rng, [6, 12, 24, 48]);
    const If = Vs / R;
    const k = pick(rng, [1, 2, 3]);
    const i1 = If * (1 - Math.exp(-k));
    const parts: GenPart[] = [
      calcPart({ id: 'a', label: 'a', prompt: 'Finn tidskonstanten og sluttstrømmen i spolen.', skills: ['el.transient'], symbols: ['τ', 'If'], targets: [tgt('τ', 'Tidskonstant', tau, 's', ['tidskonstant', 'τ']), tgt('If', 'Sluttstrøm', If, 'A', ['sluttstrøm', 'i'])], solution: [step(`\\tau = \\frac{L}{R} = ${engTex(tau, 's')}`, `τ = ${eng(tau, 's')}`, 'For RL-kretser er τ = L/R.', 'definisjon'), step(`I_f = \\frac{V_s}{R} = ${engTex(If, 'A')}`, `If = ${eng(If, 'A')}`, 'Etter lang tid oppfører spolen seg som en kortslutning.', 'modellantakelse')], hints: hints('RL-krets: τ = L/R.', 'Spolen er kortslutning ved likestrøm etter lang tid.', 'H/Ω = s.') }),
      calcPart({ id: 'b', label: 'b', prompt: `Hva er strømmen ved t = ${eng(k * tau, 's')}? Strømmen var null før bryteren ble lukket.`, skills: ['el.transient'], symbols: ['iL', 'i'], targets: [tgt('iL', 'Strøm i spolen', i1, 'A', ['strøm', 'i'])], solution: [step(`i_L = I_f\\left(1 - e^{-t/\\tau}\\right) = ${engTex(If, 'A')}\\left(1 - e^{-${k}}\\right) = ${engTex(i1, 'A')}`, `iL = ${eng(i1, 'A')}`, 'Strømmen i en spole kan ikke endre seg momentant, så I0 = 0.', 'innsetting')], hints: hints('Start i null, gå mot If.', 'iL(t) = If(1 − e^(−t/τ))', `t/τ = ${k}.`) }),
    ];
    return { title: 'Strøm i en RL-krets', intro: `En spole på ${Lm} mH og en motstand på ${ohm(R)} kobles i serie til en likespenning på ${Vs} V ved t = 0.`, context: 'rl', parts, params: { R: String(R), L: String(L), Vs: String(Vs) }, skills: ['el.transient'], structureKey: 'el-rl', estMinutes: 6 };
  },
};

const tplKondEnergi: TemplateDef = {
  id: 'el-kond-energi',
  version: 1,
  level: 1,
  style: 'standard',
  name: 'Kondensatorer i serie og parallell, og energi',
  description: 'Ceq og w = ½CV².',
  skills: ['el.kondspole'],
  build: (rng) => {
    const C1 = pick(rng, [2, 3, 4, 6, 10, 12]);
    const C2 = pick(rng, [2, 3, 4, 6, 12, 20]);
    const V = pick(rng, [5, 10, 12, 20, 50]);
    const cs = r(C1 * C2).div(r(C1 + C2));
    const csF = n(cs) * 1e-6;
    const w = 0.5 * csF * V * V;
    const parts: GenPart[] = [
      calcPart({ id: 'a', label: 'a', prompt: 'Hva er den ekvivalente kapasitansen når de står i serie?', skills: ['el.kondspole'], symbols: ['Ceq', 'C'], targets: [tgt('Ceq', 'Ekvivalent kapasitans', csF, 'F', ['kapasitans', 'C'])], solution: [step(`C_{eq} = \\frac{C_1C_2}{C_1+C_2} = ${engTex(csF, 'F')}`, `Ceq = ${eng(csF, 'F')}`, 'Kondensatorer i serie kombineres som motstander i parallell.', 'identitet')], hints: hints('Motsatt av motstander.', 'Serie: 1/C = 1/C₁ + 1/C₂', 'Parallell: C = C₁ + C₂.') }),
      calcPart({ id: 'b', label: 'b', prompt: `Seriekoblingen lades opp til ${V} V. Hvor mye energi er lagret?`, skills: ['el.kondspole'], symbols: ['w', 'W'], targets: [tgt('w', 'Energi', w, 'J', ['energi'])], solution: [step(`w = \\tfrac12 C_{eq} V^2 = ${engTex(w, 'J')}`, `w = ${eng(w, 'J')}`, 'Energi lagret i det elektriske feltet.', 'definisjon')], hints: hints('w = ½CV²', 'Bruk Ceq og hele spenningen.', 'Energien øker med kvadratet av spenningen.') }),
    ];
    return { title: 'Kondensatorer og energi', intro: `To kondensatorer, C₁ = ${C1} µF og C₂ = ${C2} µF, kobles i serie.`, context: 'kond', parts, params: { C1: String(C1), C2: String(C2), V: String(V) }, skills: ['el.kondspole'], structureKey: 'el-kond', estMinutes: 4 };
  },
};

const TRANS_MC: McItem[] = [
  { id: 'kontinuitet', skill: 'el.transient', stem: 'Hvilken størrelse kan ikke endre seg momentant når en bryter åpnes eller lukkes?', correct: 'Spenningen over en kondensator og strømmen gjennom en spole.', wrong: ['Strømmen gjennom en kondensator og spenningen over en spole.', 'Strømmen gjennom en motstand.', 'Ingen av dem; alt kan endre seg momentant.'], why: 'Energien ½Cv² og ½Li² kan ikke hoppe, så vC og iL er kontinuerlige.' },
  { id: 'fem-tau', skill: 'el.transient', stem: 'Omtrent hvor lang tid tar det før en førsteordens krets er i ny likevekt?', correct: 'Rundt 5τ', wrong: ['Nøyaktig τ', '1/τ', 'Uendelig lang tid, så den kommer aldri fram'], why: 'Etter 5τ gjenstår e^(−5) ≈ 0,7 % av endringen.' },
  { id: 'spole-dc', skill: 'el.kondspole', stem: 'Hvordan oppfører en ideell spole seg i en likestrømskrets etter lang tid?', correct: 'Som en kortslutning.', wrong: ['Som et brudd.', 'Som en motstand på L ohm.', 'Den lagrer ingen energi.'], why: 'v = L di/dt, og konstant strøm gir null spenning.' },
  { id: 'tau-r', skill: 'el.transient', stem: 'Hvilken motstand bruker du i τ = RC når kretsen har flere motstander?', correct: 'Thevenin-motstanden sett fra kondensatorens terminaler etter bryterhendelsen.', wrong: ['Summen av alle motstandene i kretsen.', 'Den minste motstanden.', 'Motstanden i serie med kilden.'], why: 'τ bestemmes av kretsen kondensatoren ser når kildene er nullstilt.' },
];

const transient: FamilyKB = {
  id: 'el-transient',
  domain: 'elektro',
  name: 'Kondensator, spole og førsteordens RC- og RL-kretser',
  shortName: 'RC og RL',
  topic: 'Elektriske kretser',
  subtopics: ['Kondensator og spole', 'Tidskonstant', 'Start- og sluttverdi', 'Trinnrespons'],
  description: 'Hvordan spenning og strøm endrer seg etter en bryterhendelse i kretser med én kondensator eller spole.',
  skills: ['el.kondspole', 'el.transient'],
  formulas: [
    { id: 'f-trinn', tex: 'x(t) = x_f + (x_0 - x_f)\\,e^{-t/\\tau}', name: 'Førsteordens respons', kind: 'avledet sammenheng', kindWhy: 'Løsningen av en førsteordens lineær differensiallikning med konstant kilde.', symbols: [{ sym: 'x_0', meaning: 'Startverdi (vC eller iL rett etter t = 0)', unit: 'V eller A' }, { sym: 'x_f', meaning: 'Sluttverdi etter lang tid', unit: 'V eller A' }, { sym: '\\tau', meaning: 'Tidskonstant: RC eller L/R', unit: 's' }], conditions: ['Én energilagrende komponent og konstante kilder etter bryterhendelsen.'], whatIf: ['Etter 1τ er 63 % av endringen gjort, etter 5τ over 99 %.'], calc: { inputs: [{ sym: 'x0', label: 'Startverdi', min: -20, max: 50, step: 1, value: 0 }, { sym: 'xf', label: 'Sluttverdi', min: -20, max: 100, step: 1, value: 60 }, { sym: 'tau', label: 'τ (ms)', min: 0.1, max: 50, step: 0.1, value: 2 }, { sym: 't', label: 't (ms)', min: 0, max: 100, step: 0.1, value: 2 }], compute: (v) => [{ label: 'x(t)', value: fmtNum(v.xf + (v.x0 - v.xf) * Math.exp(-v.t / v.tau), 4) }, { label: 't/τ', value: fmtNum(v.t / v.tau, 3) }] } },
    { id: 'f-tau', tex: '\\tau_{RC} = R_{Th}C,\\quad \\tau_{RL} = \\frac{L}{R_{Th}}', name: 'Tidskonstant', kind: 'definisjon', kindWhy: 'Kommer fra differensiallikningen for kretsen.', symbols: [{ sym: 'R_{Th}', meaning: 'Motstanden komponenten ser (kilder nullstilt)', unit: 'Ω' }], conditions: [], whatIf: ['Større R gjør RC-kretser tregere, men RL-kretser raskere.'] },
    { id: 'f-energi-lc', tex: 'w_C = \\tfrac12 C v^2,\\quad w_L = \\tfrac12 L i^2', name: 'Lagret energi', kind: 'avledet sammenheng', kindWhy: 'Integralet av effekten mens komponenten lades.', symbols: [], conditions: [], whatIf: [] },
  ],
  intents: [
    { id: 'el.transient', specific: true, label: 'Førsteordens RC/RL-krets', match: [/tidskonstant|bryter(en)?\b.*(åpne|lukke)|t\s*=\s*0|v_?C\s*\(t\)|i_?L\s*\(t\)|startspenning|sluttspenning|oppladning|utlading|utladning/i], skills: ['el.transient'], taskType: ['beregning', 'tegning'], assignment: 'Finne startverdi, sluttverdi og tidskonstant, sette opp x(t) og skissere forløpet.', interpretation: ['Tegn ekvivalentkretsen før (t < 0) og lenge etter (t → ∞): C er brudd og L kortslutning ved likestrøm.', 'τ = RC eller L/R med motstanden komponenten ser etter bryterhendelsen.'], prerequisites: ['Thevenin', 'Spenningsdeling'], misconceptions: ['Bruker feil motstand i τ', 'Lar vC hoppe ved t = 0'], variation: ['Oppladning', 'Utladning', 'Bryter som åpnes'], estMinutes: 10 },
    { id: 'el.kondspole', label: 'Kondensator og spole', match: [/kondensator|spole|kapasitans|induktans|\bµF\b|\bmH\b/i], skills: ['el.kondspole'], taskType: ['beregning'], assignment: 'Regne med kapasitans og induktans: kombinasjoner, i–v-sammenhenger og lagret energi.', interpretation: ['iC = C dv/dt og vL = L di/dt.', 'Kondensatorer i serie kombineres som motstander i parallell.'], prerequisites: [], misconceptions: ['Kombinerer kondensatorer som motstander'], variation: [], estMinutes: 5 },
  ],
  templates: [tplRc, tplRl, tplKondEnergi, mcTemplate({ id: 'el-trans-mc', level: 1, name: 'Flervalg: RC og RL', description: 'Kontinuitet og likevekt.', title: 'Kondensator og spole', items: TRANS_MC })],
  misconceptions: [{ id: 'hopp', label: 'Lar vC eller iL hoppe', explanation: 'Energien kan ikke endre seg momentant.' }],
  recognize: keywordRecognizer([[/Tema: (Kondensator|Førsteordens)/, 2.5], [/tidskonstant/i, 3], [/kondensator|spole/i, 1.5], [/bryter(en)?/i, 1.2], [/t\s*=\s*0|t ≥ 0|t > 0/i, 1], [/v_?C\s*\(t\)|i_?L\s*\(t\)|vC|iL/i, 1.5], [/RC-krets|RL-krets|førsteordens/i, 3], [/kapasitans|induktans|µF|mH\b|nF\b/i, 1]], 2.5, 'kondensator, spole og førsteordens kretser'),
  explanations: { short: () => ({ text: 'Førsteordens kretser går eksponentielt fra startverdi mot sluttverdi med tidskonstanten τ.', example: 'τ = 2 ms: etter 10 ms er kretsen praktisk talt i likevekt.' }), analogy: { text: 'Som en bøtte med hull som fylles: raskt i starten, saktere jo nærmere den er full.', limits: 'Analogien forklarer ikke hvorfor τ = RC.' }, derivationFormulaId: 'f-trinn' },
  solutionStructure: ['Krets før bryterhendelsen', 'Krets lenge etter', 'Tidskonstant', 'Sett inn i x(t)'],
  surfaceFeatures: ['Brytere, kondensatorer, spoler'],
};

// ——— 6. Vekselstrøm: visere, impedans og effekt ———

const tplImpedans: TemplateDef = {
  id: 'el-impedans',
  version: 1,
  level: 2,
  style: 'standard',
  name: 'Impedans og strøm i en RL- eller RC-krets',
  description: 'X = ωL eller 1/(ωC), |Z| = √(R² + X²), vinkel og strøm.',
  skills: ['el.visere'],
  build: (rng) => {
    const kind = rng() < 0.5 ? 'L' : 'C';
    const w = pick(rng, [100, 500, 1000, 2000, 5000]);
    const R = eR(rng, pick(rng, [1, 10]));
    const L = pick(rng, [10, 20, 50, 100, 200]) * 1e-3;
    const C = pick(rng, [1, 2, 5, 10, 20, 50]) * 1e-6;
    const X = kind === 'L' ? w * L : 1 / (w * C);
    const Z = Math.sqrt(R * R + X * X);
    const th = ((kind === 'L' ? 1 : -1) * Math.atan(X / R) * 180) / Math.PI;
    const Vm = pick(rng, [5, 10, 12, 20, 50]);
    const Im = Vm / Z;
    const parts: GenPart[] = [
      calcPart({ id: 'a', label: 'a', prompt: kind === 'L' ? 'Finn reaktansen XL.' : 'Finn reaktansen XC (som positiv størrelse).', skills: ['el.visere'], symbols: kind === 'L' ? ['XL', 'X'] : ['XC', 'X'], targets: [tgt(kind === 'L' ? 'XL' : 'XC', 'Reaktans', X, 'Ω', ['reaktans', 'X'])], solution: [step(kind === 'L' ? `X_L = \\omega L = ${w}\\cdot ${engTex(L, 'H')} = ${engTex(X, 'Ω')}` : `X_C = \\frac{1}{\\omega C} = \\frac{1}{${w}\\cdot ${engTex(C, 'F')}} = ${engTex(X, 'Ω')}`, `${kind === 'L' ? 'XL' : 'XC'} = ${eng(X, 'Ω')}`, kind === 'L' ? 'Spolens impedans er jωL.' : 'Kondensatorens impedans er −j/(ωC).', 'definisjon')], hints: hints('Bruk ω, ikke f.', kind === 'L' ? 'XL = ωL' : 'XC = 1/(ωC)', 'Reaktansen avhenger av frekvensen.') }),
      calcPart({ id: 'b', label: 'b', prompt: 'Finn størrelsen |Z| og vinkelen θ til impedansen Z = R + jX.', skills: ['el.visere'], symbols: ['Z', 'θ'], targets: [tgt('Z', 'Impedans', Z, 'Ω', ['impedans', '|Z|']), tgt('θ', 'Vinkel', th, '°', ['vinkel', 'θ', 'fase'])], solution: [step(`|Z| = \\sqrt{R^2 + X^2} = ${engTex(Z, 'Ω')}`, `|Z| = ${eng(Z, 'Ω')}`, 'Pytagoras i det komplekse planet.', 'identitet'), step(`\\theta = \\arctan\\frac{${kind === 'L' ? '' : '-'}X}{R} = ${fmtNum(th, 4)}^\\circ`, `θ = ${fmtNum(th, 4)}°`, kind === 'L' ? 'Induktiv krets: positiv vinkel.' : 'Kapasitiv krets: negativ vinkel.', 'identitet')], hints: hints('Z = R + jX.', '|Z| = √(R² + X²)', 'Vinkelen er arctan(X/R) med fortegn.') }),
      calcPart({ id: 'c', label: 'c', prompt: `Kilden er v(t) = ${Vm} cos(${w}t) V. Hva er amplituden til strømmen?`, skills: ['el.visere'], symbols: ['Im', 'I'], targets: [tgt('Im', 'Strømamplitude', Im, 'A', ['strøm', 'I'])], solution: [step(`I_m = \\frac{V_m}{|Z|} = ${engTex(Im, 'A')}`, `Im = ${eng(Im, 'A')}`, 'Ohms lov for visere: I = V/Z, og størrelsene deles.', 'innsetting')], hints: hints('Ohms lov med impedans.', 'Im = Vm/|Z|', 'Vinkelen til strømmen er −θ i forhold til spenningen.') }),
    ];
    return { title: 'Impedans', intro: kind === 'L' ? `En motstand R = ${ohm(R)} står i serie med en spole L = ${eng(L, 'H', 3)}. Vinkelfrekvensen er ω = ${w} rad/s.` : `En motstand R = ${ohm(R)} står i serie med en kondensator C = ${eng(C, 'F', 3)}. Vinkelfrekvensen er ω = ${w} rad/s.`, context: `imp-${kind}`, parts, params: { R: String(R), w: String(w), kind }, skills: ['el.visere'], structureKey: `el-imp|${kind}`, estMinutes: 8 };
  },
};

const tplAcEffekt: TemplateDef = {
  id: 'el-aceffekt',
  version: 1,
  level: 2,
  style: 'standard',
  name: 'Aktiv, reaktiv og tilsynelatende effekt',
  description: 'P = VI cos φ, Q = VI sin φ, S = VI med effektivverdier.',
  skills: ['el.aceffekt'],
  build: (rng) => {
    const Vrms = pick(rng, [120, 230, 400]);
    const Irms = pick(rng, [2, 2.5, 4, 5, 8, 10]);
    const pf = pick(rng, [0.6, 0.7, 0.8, 0.85, 0.9, 0.95]);
    const S = Vrms * Irms;
    const P = S * pf;
    const Q = S * Math.sqrt(1 - pf * pf);
    const parts: GenPart[] = [
      calcPart({ id: 'a', label: 'a', prompt: 'Finn tilsynelatende effekt S og aktiv effekt P.', skills: ['el.aceffekt'], symbols: ['S', 'P'], targets: [tgt('S', 'Tilsynelatende effekt', S, 'VA', ['tilsynelatende']), tgt('P', 'Aktiv effekt', P, 'W', ['aktiv', 'effekt'])], solution: [step(`S = V_{rms}I_{rms} = ${engTex(S, 'VA')}`, `S = ${eng(S, 'VA')}`, 'Effektivverdiene ganges.', 'definisjon'), step(`P = S\\cos\\varphi = ${engTex(P, 'W')}`, `P = ${eng(P, 'W')}`, 'Effektfaktoren er cos φ.', 'definisjon')], hints: hints('S = V·I (effektivverdier).', `P = S · ${fmtNum(pf)}`, 'Bare den aktive effekten gjør nyttig arbeid.') }),
      calcPart({ id: 'b', label: 'b', prompt: 'Finn reaktiv effekt Q.', skills: ['el.aceffekt'], symbols: ['Q'], targets: [tgt('Q', 'Reaktiv effekt', Q, 'var', ['reaktiv'])], solution: [step(`Q = \\sqrt{S^2 - P^2} = ${engTex(Q, 'var')}`, `Q = ${eng(Q, 'var')}`, 'Effekttrekanten: S² = P² + Q².', 'identitet')], hints: hints('Effekttrekanten.', 'Q = √(S² − P²)', 'Eller Q = S sin φ.') }),
    ];
    return { title: 'Effekt i vekselstrømskretser', intro: `En last på ${Vrms} V (effektivverdi) trekker ${fmtNum(Irms)} A (effektivverdi). Effektfaktoren er ${fmtNum(pf)} induktiv.`, context: 'aceffekt', parts, params: { V: String(Vrms), I: String(Irms), pf: String(pf) }, skills: ['el.aceffekt'], structureKey: 'el-aceffekt', estMinutes: 5 };
  },
};

const AC_MC: McItem[] = [
  { id: 'faseforskyvning-c', skill: 'el.visere', stem: 'I en ren kondensator, hvordan ligger strømmen i forhold til spenningen?', correct: 'Strømmen ligger 90° foran spenningen.', wrong: ['Strømmen ligger 90° bak spenningen.', 'De er i fase.', 'De er 180° forskjøvet.'], why: 'i = C dv/dt: strømmen er størst når spenningen endrer seg raskest.' },
  { id: 'rms', skill: 'el.aceffekt', stem: 'En sinusspenning har amplitude 325 V. Hva er effektivverdien?', correct: 'Omtrent 230 V', wrong: ['325 V', '162,5 V', '460 V'], why: 'Vrms = Vm/√2 for en sinus.' },
  { id: 'omega-f', skill: 'el.visere', stem: 'v(t) = 10 cos(2000πt) V. Hva er frekvensen f?', correct: '1000 Hz', wrong: ['2000 Hz', '2000π Hz', '318 Hz'], why: 'ω = 2πf, så f = 2000π/(2π) = 1000 Hz.' },
  { id: 'resonans', skill: 'el.visere', stem: 'I en seriekobling av R, L og C: når er impedansen rent resistiv?', correct: 'Når ωL = 1/(ωC).', wrong: ['Når R = ωL.', 'Når ω = 0.', 'Aldri, med både L og C.'], why: 'Da opphever reaktansene hverandre, og Z = R (resonans).' },
  { id: 'trefase', skill: 'el.trefase', stem: 'I et symmetrisk trefasesystem i stjerne er fasespenningen 230 V. Hva er linjespenningen?', correct: 'Omtrent 400 V', wrong: ['230 V', '690 V', '133 V'], why: 'Linjespenningen er √3 ganger fasespenningen i stjernekobling.' },
];

const ac: FamilyKB = {
  id: 'el-ac',
  domain: 'elektro',
  name: 'Vekselstrøm: visere, impedans og effekt',
  shortName: 'Vekselstrøm',
  topic: 'Elektriske kretser',
  subtopics: ['Sinussignaler og visere', 'Impedans og reaktans', 'Stasjonær analyse', 'Aktiv, reaktiv og tilsynelatende effekt', 'Trefase'],
  description: 'Stasjonær analyse av vekselstrømskretser med visere og impedans, og effektberegning.',
  skills: ['el.visere', 'el.aceffekt', 'el.trefase'],
  formulas: [
    { id: 'f-impedans', tex: 'Z_R = R,\\quad Z_L = j\\omega L,\\quad Z_C = \\frac{1}{j\\omega C}', name: 'Impedans', kind: 'definisjon', kindWhy: 'Forholdet mellom spennings- og strømviser for hver komponent.', symbols: [{ sym: '\\omega', meaning: 'Vinkelfrekvens (2πf)', unit: 'rad/s' }], conditions: ['Stasjonær sinus.'], whatIf: ['Høy frekvens: spolen sperrer, kondensatoren leder.'], calc: { inputs: [{ sym: 'f', label: 'f (Hz)', min: 1, max: 10000, step: 1, value: 50 }, { sym: 'L', label: 'L (mH)', min: 0, max: 1000, step: 1, value: 100 }, { sym: 'C', label: 'C (µF)', min: 0.1, max: 1000, step: 0.1, value: 10 }, { sym: 'R', label: 'R (Ω)', min: 0, max: 1000, step: 1, value: 50 }], compute: (v) => { const w = 2 * Math.PI * v.f; const XL = w * v.L * 1e-3; const XC = 1 / (w * v.C * 1e-6); const X = XL - XC; return [{ label: 'XL', value: eng(XL, 'Ω', 3) }, { label: 'XC', value: eng(XC, 'Ω', 3) }, { label: '|Z| (serie R-L-C)', value: eng(Math.sqrt(v.R * v.R + X * X), 'Ω', 3) }, { label: 'Vinkel', value: `${fmtNum((Math.atan2(X, v.R) * 180) / Math.PI, 3)}°` }]; } } },
    { id: 'f-aceffekt', tex: 'S = V_{rms}I_{rms},\\quad P = S\\cos\\varphi,\\quad Q = S\\sin\\varphi', name: 'Effekt ved vekselstrøm', kind: 'definisjon', kindWhy: 'Aktiv effekt er middelverdien av p(t); den reaktive pendler.', symbols: [{ sym: '\\varphi', meaning: 'Vinkelen mellom spenning og strøm', unit: '°' }], conditions: ['Effektivverdier (rms).'], whatIf: ['Effektfaktor 1 betyr ren resistiv last.'] },
    { id: 'f-rms', tex: 'V_{rms} = \\frac{V_m}{\\sqrt2}', name: 'Effektivverdi for sinus', kind: 'avledet sammenheng', kindWhy: 'Kvadratisk middelverdi over en periode.', symbols: [], conditions: ['Bare for rene sinussignaler.'], whatIf: [] },
  ],
  intents: [
    { id: 'el.trefase', specific: true, label: 'Trefase', match: [/trefase|linjespenning|fasespenning|stjernekob|trekantkob|Y-kob|Δ-kob/i], skills: ['el.trefase'], taskType: ['beregning'], assignment: 'Regne med symmetriske trefasesystemer i stjerne eller trekant.', interpretation: ['Stjerne: VL = √3·Vfase. Trekant: IL = √3·Ifase. P = √3·VL·IL·cos φ.'], prerequisites: ['Visere'], misconceptions: [], variation: [], estMinutes: 6 },
    { id: 'el.aceffekt', label: 'Effekt i vekselstrømskretser', match: [/aktiv effekt|reaktiv|tilsynelatende|effektfaktor|cos\s*φ|\bVA\b|\bvar\b|effekttrekant/i], skills: ['el.aceffekt'], taskType: ['beregning'], assignment: 'Beregne aktiv, reaktiv og tilsynelatende effekt og effektfaktor.', interpretation: ['S = V·I* med effektivverdier; P er realdelen og Q imaginærdelen.'], prerequisites: ['Visere'], misconceptions: ['Bruker amplituder i stedet for effektivverdier'], variation: [], estMinutes: 6 },
    { id: 'el.impedans', label: 'Visere og impedans', match: [/impedans|reaktans|jω|j\d|viser(e|form|en)?\b|fasor|cos\s*\(\s*\d+t|stasjonær|tidsform/i], skills: ['el.visere'], taskType: ['beregning'], assignment: 'Transformere til viserdomenet, regne med impedanser og transformere tilbake til tidsfunksjon.', interpretation: ['Skriv kilden som viser, bytt komponenter med impedanser, løs som en resistiv krets med komplekse tall, og skriv svaret som tidsfunksjon.'], prerequisites: ['Komplekse tall', 'Serie og parallell'], misconceptions: ['Bruker f i stedet for ω', 'Legger sammen størrelser i stedet for komplekse tall'], variation: [], estMinutes: 10 },
  ],
  templates: [tplImpedans, tplAcEffekt, mcTemplate({ id: 'el-ac-mc', level: 1, name: 'Flervalg: vekselstrøm', description: 'Fase, rms, resonans.', title: 'Vekselstrøm', items: AC_MC })],
  misconceptions: [{ id: 'f-omega', label: 'Blander f og ω', explanation: 'ω = 2πf.' }],
  recognize: keywordRecognizer([[/Tema: (Vekselspenning|Effektberegning|Trefase)/, 2.5], [/impedans|reaktans/i, 2.5], [/viser(e|form|en)?\b|fasor/i, 2], [/vekselspenning|vekselstrøm|\bAC\b|sinus/i, 1.5], [/cos\s*\(\s*\d+\s*t/i, 2], [/jω|j\s*\d+\s*Ω/i, 2], [/aktiv effekt|reaktiv|tilsynelatende|effektfaktor/i, 2.5], [/trefase|linjespenning|fasespenning/i, 3]], 2.5, 'vekselstrøm (visere, impedans, effekt)'),
  explanations: { short: () => ({ text: 'Med visere blir L og C til impedanser, og vekselstrømskretser regnes som resistive kretser med komplekse tall.', example: 'ω = 100 rad/s og L = 5 H gir ZL = j500 Ω.' }), analogy: { text: 'En viser er et roterende pilbilde: lengden er amplituden og vinkelen fasen.', limits: 'Gjelder bare stasjonær sinus med én frekvens.' }, derivationFormulaId: 'f-impedans' },
  solutionStructure: ['Viser for kilden', 'Impedanser', 'Løs i viserdomenet', 'Tilbake til tidsfunksjon'],
  surfaceFeatures: ['Frekvens, komponentverdier'],
};

// ——— 7. Filtre av første orden og Bode-diagram ———

const tplFilter: TemplateDef = {
  id: 'el-filter',
  version: 1,
  level: 2,
  style: 'standard',
  name: 'Førsteordens RC-filter med last',
  description: 'Forsterkning ved ω → 0 og ω → ∞, knekkfrekvens og dB.',
  skills: ['el.filter', 'el.bode'],
  build: (rng) => {
    for (let k = 0; k < 100; k++) {
      const hp = rng() < 0.5;
      const R1 = eR(rng, 1);
      const R2 = eR(rng, pick(rng, [1, 10]));
      const Cu = pick(rng, [1, 2.2, 4.7, 10, 22, 47]);
      const C = Cu * 1e-6;
      // Lavpass: R1 i serie, C og R2 i parallell over utgangen. Høypass: C i serie, R1 i serie med R2, utgang over R2.
      const Amax = R2 / (R1 + R2);
      const RT = hp ? R1 + R2 : (R1 * R2) / (R1 + R2);
      const wc = 1 / (RT * C);
      const AdB = 20 * Math.log10(Amax);
      if (AdB < -20) continue;
      const parts: GenPart[] = [
        mcPart(rng, { id: 'type', skill: 'el.filter', stem: 'Er kretsen et lavpass- eller høypassfilter?', correct: hp ? 'Høypass: kondensatoren sperrer ved lav frekvens og leder ved høy.' : 'Lavpass: kondensatoren kortslutter utgangen ved høy frekvens.', wrong: [hp ? 'Lavpass: kondensatoren kortslutter utgangen ved høy frekvens.' : 'Høypass: kondensatoren sperrer ved lav frekvens og leder ved høy.', 'Båndpass, fordi det er både motstand og kondensator.', 'Det kan ikke avgjøres uten knekkfrekvensen.'], why: 'Tegn kretsen for ω → 0 (C brudd) og ω → ∞ (C kortslutning), og se hvor utgangen er størst.' }, 'a', 'a'),
        calcPart({ id: 'b', label: 'b', prompt: 'Finn maksimal forsterkning Amax og Amax i dB.', skills: ['el.filter'], symbols: ['Amax', 'AdB'], targets: [tgt('Amax', 'Maksimal forsterkning', Amax, '', ['forsterkning', 'A']), tgt('AdB', 'Maksimal forsterkning i dB', AdB, 'dB', ['db', 'desibel'], 0.01)], solution: [step(`A_{max} = \\frac{R_2}{R_1 + R_2} = ${fmtNum(Amax, 4).replace(',', '{,}')}`, `Amax = ${fmtNum(Amax, 4)}`, hp ? 'Ved høy frekvens er kondensatoren en kortslutning, og R₁ og R₂ er en spenningsdeler.' : 'Ved lav frekvens er kondensatoren et brudd, og R₁ og R₂ er en spenningsdeler.', 'modellantakelse'), step(`A_{max,dB} = 20\\log_{10}(${fmtNum(Amax, 4).replace(',', '{,}')}) = ${fmtNum(AdB, 3).replace(',', '{,}').replace('−', '-')}\\,\\mathrm{dB}`, `Amax,dB = ${fmtNum(AdB, 3)} dB`, 'Spenningsforsterkning i dB er 20 log₁₀.', 'definisjon')], hints: hints('Se på kretsen i den frekvensen der utgangen er størst.', 'C: brudd ved ω → 0, kortslutning ved ω → ∞.', 'dB = 20 log₁₀ |A|.') }),
        calcPart({ id: 'c', label: 'c', prompt: 'Finn knekkfrekvensen ωc.', skills: ['el.filter'], symbols: ['ωc'], targets: [tgt('ωc', 'Knekkfrekvens', wc, 'rad/s', ['knekkfrekvens', 'ωc', 'omega'])], solution: [step(`R_T = ${hp ? 'R_1 + R_2' : 'R_1\\parallel R_2'} = ${engTex(RT, 'Ω')}`, `RT = ${ohm(RT)}`, 'Motstanden kondensatoren ser når kilden er kortsluttet.', 'identitet'), step(`\\omega_c = \\frac{1}{R_T C} = ${engTex(wc, 'rad/s')}`, `ωc = ${fmtNum(wc, 4)} rad/s`, 'For førsteordens filtre er ωc = 1/τ.', 'definisjon')], hints: hints('ωc = 1/τ = 1/(RT·C).', 'Hvilken motstand ser kondensatoren?', 'Kortslutt kilden og se inn fra kondensatoren.') }),
      ];
      return { title: hp ? 'Høypassfilter' : 'Lavpassfilter', intro: hp ? `En kondensator C = ${eng(C, 'F', 3)} står i serie med R₁ = ${ohm(R1)} og R₂ = ${ohm(R2)}. Utgangen vo tas over R₂.` : `Inngangen vi går gjennom R₁ = ${ohm(R1)} til utgangen. Over utgangen står R₂ = ${ohm(R2)} og C = ${eng(C, 'F', 3)} i parallell.`, context: hp ? 'hp' : 'lp', parts, params: { R1: String(R1), R2: String(R2), C: String(C), hp: String(hp) }, skills: ['el.filter', 'el.bode'], structureKey: `el-filter|${hp ? 'hp' : 'lp'}`, estMinutes: 9 };
    }
    throw new Error('Fant ikke gyldige tall');
  },
};

const FILTER_MC: McItem[] = [
  { id: 'asymptote', skill: 'el.bode', stem: 'Hvor bratt faller asymptoten til et førsteordens lavpassfilter over knekkfrekvensen?', correct: '−20 dB per dekade', wrong: ['−40 dB per dekade', '−3 dB per dekade', '−6 dB per dekade'], why: 'Over ωc er |A| ≈ ωc/ω: ti ganger høyere frekvens gir ti ganger lavere forsterkning, altså −20 dB.' },
  { id: 'tre-db', skill: 'el.bode', stem: 'Hva er forsterkningen ved knekkfrekvensen, sammenliknet med maksimal forsterkning?', correct: '3 dB lavere (faktor 1/√2).', wrong: ['Lik maksimal forsterkning.', 'Halvparten (−6 dB).', '20 dB lavere.'], why: '|A(jωc)| = Amax/√2, som er −3 dB.' },
  { id: 'spole-filter', skill: 'el.filter', stem: 'En spole står i serie mellom inngang og utgang, og en motstand står over utgangen. Hva slags filter er det?', correct: 'Lavpass', wrong: ['Høypass', 'Båndstopp', 'Allpass'], why: 'Spolen er kortslutning ved lav frekvens og brudd ved høy frekvens.' },
];

const filter: FamilyKB = {
  id: 'el-filter',
  domain: 'elektro',
  name: 'Filtre av første orden og Bode-diagram',
  shortName: 'Filtre og Bode',
  topic: 'Elektriske kretser',
  subtopics: ['Lavpass og høypass', 'Knekkfrekvens', 'Desibel', 'Asymptoter'],
  description: 'Passive og aktive førsteordens filtre: maksimal forsterkning, knekkfrekvens og Bode-plott.',
  skills: ['el.filter', 'el.bode'],
  formulas: [
    { id: 'f-knekk', tex: '\\omega_c = \\frac{1}{\\tau} = \\frac{1}{R_T C}\\ \\text{eller}\\ \\frac{R_T}{L}', name: 'Knekkfrekvens', kind: 'avledet sammenheng', kindWhy: 'Frekvensen der |A| har falt til Amax/√2.', symbols: [{ sym: 'R_T', meaning: 'Motstanden komponenten ser', unit: 'Ω' }], conditions: ['Førsteordens filter.'], whatIf: ['fc = ωc/(2π).'], calc: { inputs: [{ sym: 'R', label: 'RT (Ω)', min: 1, max: 100000, step: 1, value: 1000 }, { sym: 'C', label: 'C (µF)', min: 0.001, max: 1000, step: 0.001, value: 1 }], compute: (v) => { const wc = 1 / (v.R * v.C * 1e-6); return [{ label: 'ωc', value: `${fmtNum(wc, 4)} rad/s` }, { label: 'fc', value: eng(wc / (2 * Math.PI), 'Hz', 4) }]; } } },
    { id: 'f-db', tex: 'A_{dB} = 20\\log_{10}|A|', name: 'Forsterkning i desibel', kind: 'definisjon', kindWhy: 'Logaritmisk skala for spenningsforhold.', symbols: [], conditions: [], whatIf: ['|A| = 0,5 gir −6 dB; |A| = 0,1 gir −20 dB.'], calc: { inputs: [{ sym: 'A', label: '|A|', min: 0.001, max: 100, step: 0.001, value: 0.5 }], compute: (v) => [{ label: 'dB', value: `${fmtNum(20 * Math.log10(v.A), 4)} dB` }] } },
  ],
  intents: [
    { id: 'el.filter', specific: true, label: 'Førsteordens filter og Bode', match: [/filter|lavpass|høypass|knekkfrekvens|grensefrekvens|bode|dekade|\bdB\b/i], skills: ['el.filter', 'el.bode'], taskType: ['beregning', 'tegning'], assignment: 'Finne maksimal forsterkning, filtertype og knekkfrekvens, og tegne asymptoter og Bode-plott.', interpretation: ['Undersøk kretsen ved ω → 0 og ω → ∞ med ekvivalenter for C og L.', 'ωc = 1/τ med motstanden komponenten ser.', 'Asymptote: flat ved Amax, og ±20 dB/dekade fra ωc. Kurven går 3 dB under i knekkpunktet.'], prerequisites: ['Spenningsdeling', 'Tidskonstant'], misconceptions: ['Bruker feil motstand i ωc', 'Blander ω og f'], variation: ['Last over utgangen', 'Aktivt filter med opamp'], estMinutes: 10 },
  ],
  templates: [tplFilter, mcTemplate({ id: 'el-filter-mc', level: 1, name: 'Flervalg: filtre', description: 'Asymptoter og −3 dB.', title: 'Filtre', items: FILTER_MC })],
  misconceptions: [{ id: 'feil-rt', label: 'Feil motstand i knekkfrekvensen', explanation: 'Bruk motstanden kondensatoren eller spolen ser når kilden er nullstilt.' }],
  recognize: keywordRecognizer([[/filter/i, 2], [/lavpass|høypass/i, 3], [/knekkfrekvens|grensefrekvens/i, 3], [/bode/i, 3], [/\bdB\b|desibel/i, 1.5], [/forsterkning/i, 1], [/asymptot/i, 2]], 2.5, 'filtre og Bode-diagram'),
  explanations: { short: () => ({ text: 'Et førsteordens filter har én knekkfrekvens ωc = 1/τ. Under eller over den faller forsterkningen med 20 dB per dekade.', example: 'Amax = 0,67 er −3,5 dB.' }), analogy: { text: 'Kondensatoren er en dør som er lukket for likestrøm og åpen for høy frekvens.', limits: 'Døra åpner gradvis, ikke brått, rundt ωc.' }, derivationFormulaId: 'f-knekk' },
  solutionStructure: ['ω → 0 og ω → ∞', 'Amax og type', 'ωc', 'Asymptoter og skisse'],
  surfaceFeatures: ['Komponentverdier'],
};

// ——— Forklaringer (for kortsvar) ———

const EL_EXPLAIN: ExplainItem[] = [
  { id: 'thevenin-hvorfor', skills: ['el.thevenin'], prompt: 'Forklar hva en Thevenin-ekvivalent er, og hvordan du finner de to størrelsene.', rubric: [['Enhver lineær krets sett fra to terminaler kan erstattes med en spenningskilde i serie med en motstand.', true], ['vTh er tomgangsspenningen mellom terminalene.', true], ['RTh finnes ved å nullstille uavhengige kilder (spenningskilde → kortslutning, strømkilde → brudd), eller som vTh/iN.', true]], model: 'Sett fra to terminaler oppfører en lineær krets seg som én spenningskilde i serie med én motstand. Spenningskilden er tomgangsspenningen mellom terminalene. Motstanden finner du ved å nullstille de uavhengige kildene og regne ut motstanden sett inn i terminalene, eller ved å dele tomgangsspenningen på kortslutningsstrømmen.', hints: { small: 'To størrelser.', firstStep: 'Hva måler du uten last?', why: 'Thevenin forenkler analysen av lasten.' } },
  { id: 'rc-forklar', skills: ['el.transient'], prompt: 'Forklar hvorfor spenningen over en kondensator ikke kan endre seg momentant, og hva det betyr når en bryter lukkes.', rubric: [['Energien ½Cv² kan ikke endre seg momentant (det ville krevd uendelig effekt), eller i = C dv/dt ville blitt uendelig.', true], ['Derfor er vC(0⁺) = vC(0⁻): startverdien finnes fra kretsen før bryterhendelsen.', true]], model: 'Strømmen i en kondensator er i = C dv/dt. Et sprang i spenningen ville krevd uendelig strøm, og energien ½Cv² ville endret seg på null tid. Derfor er spenningen rett etter bryterhendelsen lik spenningen rett før. Startverdien finnes fra kretsen slik den var før bryteren ble betjent.', hints: { small: 'Tenk på i = C dv/dt.', firstStep: 'Hva skjer med i hvis v hopper?', why: 'Kontinuitet gir startverdien.' } },
];


export const ELEKTRO_FAMILIES: FamilyKB[] = [
  grunnlag,
  motstand,
  { ...kretsanalyse, templates: [...kretsanalyse.templates, explainTemplate({ id: 'el-forklar', level: 3, name: 'Forklar som på eksamen', description: 'Thevenin og kontinuitet.', title: 'Forklar', items: EL_EXPLAIN })] },
  opamp,
  transient,
  ac,
  filter,
];
