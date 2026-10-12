// Digitalteknikk: tallsystemer og toerkomplement, boolsk algebra og
// Karnaugh-diagram, kombinatoriske kretser, vipper, tilstandsmaskiner og
// enkel Verilog. Svar som er binærmønstre eller uttrykk gis som flervalg med
// én entydig fasit; tall i titallsystemet kontrolleres som tall.

import type { GenPart } from '../domain/types';
import type { FamilyKB, TemplateDef, Rng } from './common';
import { pick, randInt, shuffle } from './common';
import { mcPart, mcTemplate, explainTemplate, keywordRecognizer, type McItem, type ExplainItem } from './verbal';
import { hints, step } from './el-common';

const numCtx = () => ({ symbols: [], defs: {}, param: 'x', unknown: 'x', solution: {}, answerSymbols: ['x'] });
const numTarget = (label: string, value: number, aliases: string[] = []) => ({ symbol: 'x', label, value: String(value), aliases });

function numPart(o: { id: string; label: string; prompt: string; skills: string[]; label2: string; value: number; solution: ReturnType<typeof step>[]; hints: GenPart['hints'] }): GenPart {
  return { id: o.id, label: o.label, prompt: o.prompt, kind: 'beregning', skills: o.skills, math: numCtx(), targets: [numTarget(o.label2, o.value)], solution: o.solution, hints: o.hints, methodCheckpoints: [] };
}

const bin = (v: number, bits: number) => {
  const s = ((v % 2 ** bits) + 2 ** bits) % 2 ** bits;
  return s.toString(2).padStart(bits, '0').replace(/(.{4})(?=.)/g, '$1 ');
};
const hex = (v: number, digits: number) => v.toString(16).toUpperCase().padStart(digits, '0');

// ——— 1. Tallsystemer og toerkomplement ———

const tplToer: TemplateDef = {
  id: 'dig-toer',
  version: 1,
  level: 1,
  style: 'standard',
  name: 'Toerkomplement',
  description: 'Verdien av et binærmønster i toerkomplement, og negative tall som bitmønster.',
  skills: ['dig.toerkomplement', 'dig.tallsystem'],
  build: (rng) => {
    const bits = pick(rng, [8, 8, 12]);
    const v = -randInt(rng, 3, 2 ** (bits - 1) - 1);
    const pattern = bin(v, bits);
    const w = -randInt(rng, 3, 120);
    const right = bin(w, 8);
    const wrong = [bin(-w, 8), bin(~(-w) & 0xff, 8) === right ? bin(-w - 1, 8) : bin(~(-w) & 0xff, 8), bin((w - 1) & 0xff, 8)].filter((x, i, a) => x !== right && a.indexOf(x) === i);
    while (wrong.length < 3) wrong.push(bin((w + wrong.length + 2) & 0xff, 8));
    const parts: GenPart[] = [
      numPart({ id: 'a', label: 'a', prompt: `Hvilket tall i titallsystemet er ${pattern}₂ når det tolkes som ${bits}-bits toerkomplement?`, skills: ['dig.toerkomplement'], label2: 'Verdi', value: v, solution: [step('', `Øverste bit er 1, så tallet er negativt. Inverter alle bitene og legg til 1: ${bin(-v, bits)}₂ = ${-v}.`, 'I toerkomplement er −x lik (ikke x) + 1.', 'definisjon'), step('', `Svaret er ${v}.`, `Alternativt: −2^${bits - 1} + resten av bitene.`, 'innsetting')], hints: hints('Se på den øverste biten.', 'Inverter og legg til 1.', 'Øverste bit har vekt −2^(n−1).') }),
      mcPart(rng, { id: `neg-${w}`, skill: 'dig.toerkomplement', stem: `Hvordan skrives ${w} i 8-bits toerkomplement?`, correct: right, wrong: wrong.slice(0, 3), why: `${-w} = ${bin(-w, 8)}₂. Inverter alle bitene og legg til 1: ${right}.` }, 'b', 'b'),
      numPart({ id: 'c', label: 'c', prompt: `Hva er det minste tallet som kan skrives med ${bits} bit i toerkomplement?`, skills: ['dig.toerkomplement'], label2: 'Minste tall', value: -(2 ** (bits - 1)), solution: [step('', `−2^${bits - 1} = ${-(2 ** (bits - 1))}`, 'Området er fra −2^(n−1) til 2^(n−1) − 1.', 'definisjon')], hints: hints('Det er ett negativt tall mer enn positive.', `−2^(${bits}−1)`, 'Mønsteret er 1 etterfulgt av bare nuller.') }),
    ];
    return { title: 'Toerkomplement', intro: '', context: 'toer', parts, params: { bits: String(bits), v: String(v), w: String(w) }, skills: ['dig.toerkomplement', 'dig.tallsystem'], structureKey: 'dig-toer', estMinutes: 6 };
  },
};

const tplHex: TemplateDef = {
  id: 'dig-hex',
  version: 1,
  level: 1,
  style: 'standard',
  name: 'Heksadesimalt, binært og desimalt',
  description: 'Konvertering mellom tallsystemer.',
  skills: ['dig.tallsystem'],
  build: (rng) => {
    const v = randInt(rng, 40, 4000);
    const h = hex(v, 3);
    const right = bin(v, 12);
    const swapped = bin(parseInt(h.split('').reverse().join(''), 16), 12);
    const off = bin(v + 16, 12);
    const bcd = h.split('').map((c) => parseInt(c, 16).toString(2).padStart(4, '0')).reverse().join(' ');
    const wrong = [swapped, off, bcd].filter((x, i, a) => x !== right && a.indexOf(x) === i);
    while (wrong.length < 3) wrong.push(bin(v + 1 + wrong.length, 12));
    const parts: GenPart[] = [
      numPart({ id: 'a', label: 'a', prompt: `Hva er ${h}₁₆ i titallsystemet?`, skills: ['dig.tallsystem'], label2: 'Desimal verdi', value: v, solution: [step(`${h.split('').map((c, i) => `${parseInt(c, 16)}\\cdot 16^{${2 - i}}`).join(' + ')} = ${v}`, `${h}₁₆ = ${v}`, 'Hvert siffer ganges med 16 opphøyd i posisjonen (bokstavene A–F er 10–15).', 'definisjon')], hints: hints('Posisjonssystem med grunntall 16.', 'Siste siffer har vekt 1, nest siste 16, så 256.', 'A = 10, …, F = 15.') }),
      mcPart(rng, { id: `hex-${v}`, skill: 'dig.tallsystem', stem: `Hva er ${h}₁₆ i binær form (12 bit)?`, correct: right, wrong: wrong.slice(0, 3), why: 'Hvert heksadesiffer blir nøyaktig fire bit, i samme rekkefølge.' }, 'b', 'b'),
    ];
    return { title: 'Tallsystemer', intro: '', context: 'hex', parts, params: { v: String(v) }, skills: ['dig.tallsystem'], structureKey: 'dig-hex', estMinutes: 4 };
  },
};

const TALL_MC: McItem[] = [
  { id: 'overflyt', skill: 'dig.toerkomplement', stem: 'Du legger sammen to positive 8-bits tall i toerkomplement, og resultatet har 1 som øverste bit. Hva har skjedd?', correct: 'Overflyt: det riktige svaret er større enn 127 og kan ikke vises med 8 bit.', wrong: ['Svaret er negativt, og det er riktig.', 'Mente ut av øverste bit betyr alltid feil.', 'Ingenting; den øverste biten ignoreres.'], why: 'To positive tall kan ikke gi et negativt svar. Da er resultatet utenfor området −128 … 127.' },
  { id: 'mente', skill: 'dig.toerkomplement', stem: 'Du regner 50 − 20 som 50 + (−20) i 8-bits toerkomplement og får en mente ut av øverste bit. Hva gjør du med den?', correct: 'Ser bort fra den; svaret i de 8 bitene er riktig (30).', wrong: ['Legger den til svaret.', 'Svaret er feil og må regnes på nytt med 9 bit.', 'Trekker 1 fra svaret.'], why: 'I toerkomplement forkastes menten ut. Overflyt avgjøres av fortegnene, ikke av menten.' },
  { id: 'bits-for', skill: 'dig.tallsystem', stem: 'Hvor mange bit trengs for å skrive tallene 0 til 200 binært?', correct: '8', wrong: ['7', '9', '200'], why: '2^7 = 128 er for lite, 2^8 = 256 holder.' },
];

const tall: FamilyKB = {
  id: 'dig-tall',
  domain: 'digital',
  name: 'Tallsystemer og toerkomplement',
  shortName: 'Tallsystemer',
  topic: 'Digitalteknikk',
  subtopics: ['Binært, oktalt og heksadesimalt', 'Toerkomplement', 'Binær addisjon og subtraksjon', 'Overflyt'],
  description: 'Konvertering mellom tallsystemer og regning med negative tall i toerkomplement.',
  skills: ['dig.tallsystem', 'dig.toerkomplement'],
  formulas: [
    { id: 'f-posisjon', tex: 'N = \\sum_i d_i\\, b^i', name: 'Posisjonssystem', kind: 'definisjon', kindWhy: 'Hvert siffer har vekt lik grunntallet opphøyd i posisjonen.', symbols: [{ sym: 'b', meaning: 'Grunntall (2, 8, 10, 16)', unit: '' }, { sym: 'd_i', meaning: 'Siffer i posisjon i', unit: '' }], conditions: [], whatIf: ['Ett heksadesiffer tilsvarer fire bit.'], calc: { inputs: [{ sym: 'x', label: 'Tall (desimalt)', min: 0, max: 4095, step: 1, value: 122 }], compute: (v) => [{ label: 'Binært', value: bin(Math.round(v.x), 12) }, { label: 'Heksadesimalt', value: hex(Math.round(v.x), 3) }, { label: 'Oktalt', value: Math.round(v.x).toString(8) }] } },
    { id: 'f-toer', tex: 'N = -b_{n-1}2^{n-1} + \\sum_{i=0}^{n-2} b_i 2^i', name: 'Toerkomplement', kind: 'definisjon', kindWhy: 'Øverste bit har negativ vekt.', symbols: [{ sym: 'n', meaning: 'Antall bit', unit: '' }], conditions: ['Området er −2^(n−1) til 2^(n−1) − 1.'], whatIf: ['−x = (ikke x) + 1.'], calc: { inputs: [{ sym: 'x', label: 'Tall (desimalt)', min: -2048, max: 2047, step: 1, value: -142 }], compute: (v) => [{ label: '12 bit', value: bin(Math.round(v.x), 12) }, { label: '8 bit', value: Math.round(v.x) >= -128 && Math.round(v.x) <= 127 ? bin(Math.round(v.x), 8) : 'utenfor området' }] } },
  ],
  intents: [
    { id: 'dig.toerkomplement', specific: true, label: 'Toerkomplement', match: [/toerkomplement|2s-?komplement|two'?s complement|negative tall|fortegn/i], skills: ['dig.toerkomplement'], taskType: ['beregning'], assignment: 'Skrive negative tall og regne binært med toerkomplement, med angitt antall bit.', interpretation: ['Negativt tall: skriv absoluttverdien, inverter og legg til 1.', 'Subtraksjon er addisjon av toerkomplementet; mente ut forkastes.'], prerequisites: ['Binære tall'], misconceptions: ['Glemmer å legge til 1', 'Blander mente og overflyt'], variation: [], estMinutes: 6 },
    { id: 'dig.konvertering', label: 'Konvertering mellom tallsystemer', match: [/binær|heksadesimal|oktal|konverter|titallsystem|desimalform|\b\w+16\b|\b[01]{4,}\b/i], skills: ['dig.tallsystem'], taskType: ['beregning'], assignment: 'Konvertere tall mellom titalls-, binær- og heksadesimalsystemet og vise fremgangsmåten.', interpretation: ['Til desimal: sum av siffer ganger vekt.', 'Fra desimal: gjentatt deling på grunntallet og les restene nedenfra.', 'Hex ↔ binært: fire bit per siffer.'], prerequisites: [], misconceptions: ['Leser restene i feil rekkefølge'], variation: [], estMinutes: 5 },
  ],
  templates: [tplHex, tplToer, mcTemplate({ id: 'dig-tall-mc', level: 1, name: 'Flervalg: tallsystemer', description: 'Overflyt og mente.', title: 'Tallsystemer', items: TALL_MC })],
  misconceptions: [{ id: 'pluss-en', label: 'Glemmer +1 i toerkomplement', explanation: 'Å bare invertere gir enerkomplement.' }],
  recognize: keywordRecognizer([[/toerkomplement|2s-?komplement/i, 3], [/binær|heksadesimal|oktal/i, 2.5], [/konverter/i, 1], [/\bbit\b|\d+ bit\b/i, 1.2], [/titallsystem|desimalform/i, 1.5]], 2.5, 'tallsystemer og toerkomplement'),
  explanations: { short: () => ({ text: 'Et binærtall er en sum av toerpotenser. I toerkomplement har øverste bit negativ vekt.', example: '1111 0111 0010 (12 bit) = −142.' }), analogy: { text: 'Toerkomplement er som en kilometerteller som ruller bakover forbi null.', limits: 'Sier ikke hvordan du finner mønsteret raskt (inverter og legg til 1).' }, derivationFormulaId: 'f-toer' },
  solutionStructure: ['Til desimal', 'Til binær', 'Toerkomplement', 'Kontroll'],
  surfaceFeatures: ['Antall bit, grunntall'],
};

// ——— 2. Boolsk algebra, sannhetstabeller og Karnaugh ———

type Cube = number[]; // per variabel: 0, 1 eller 2 (uten betydning)
const VARS = ['x', 'y', 'z', 'w'];

function covers(c: Cube, m: number, nv: number): boolean {
  for (let i = 0; i < nv; i++) {
    const bit = (m >> (nv - 1 - i)) & 1;
    if (c[i] !== 2 && c[i] !== bit) return false;
  }
  return true;
}

function termStr(c: Cube): string {
  const s = c.map((v, i) => (v === 2 ? '' : v === 1 ? VARS[i] : `${VARS[i]}′`)).join('');
  return s || '1';
}

/** Minimal SOP ved å prøve alle kombinasjoner av implikanter (små funksjoner). */
export function minimalSop(ms: number[], nv: number): string {
  if (!ms.length) return '0';
  if (ms.length === 2 ** nv) return '1';
  const set = new Set(ms);
  const cubes: Cube[] = [];
  const total = 3 ** nv;
  for (let k = 0; k < total; k++) {
    const c: Cube = [];
    let t = k;
    for (let i = 0; i < nv; i++) {
      c.push(t % 3);
      t = Math.floor(t / 3);
    }
    let ok = true;
    for (let m = 0; m < 2 ** nv && ok; m++) if (covers(c, m, nv) && !set.has(m)) ok = false;
    if (ok) cubes.push(c);
  }
  // Bare primimplikanter.
  const size = (c: Cube) => c.filter((v) => v === 2).length;
  const primes = cubes.filter((c) => !cubes.some((d) => d !== c && size(d) > size(c) && c.every((v, i) => d[i] === 2 || d[i] === v)));
  let best: Cube[] | null = null;
  const lits = (cs: Cube[]) => cs.reduce((a, c) => a + c.filter((v) => v !== 2).length, 0);
  const n = primes.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const pick: Cube[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) pick.push(primes[i]);
    if (best && (pick.length > best.length || (pick.length === best.length && lits(pick) >= lits(best)))) continue;
    if (ms.every((m) => pick.some((c) => covers(c, m, nv)))) best = pick;
  }
  return best!.map(termStr).sort().join(' + ');
}

function canonical(ms: number[], nv: number): string {
  return ms.map((m) => termStr(Array.from({ length: nv }, (_, i) => (m >> (nv - 1 - i)) & 1))).join(' + ');
}

const tplKmap: TemplateDef = {
  id: 'dig-kmap',
  version: 1,
  level: 2,
  style: 'standard',
  name: 'Sannhetstabell og Karnaugh-diagram',
  description: 'Minimal SOP for en funksjon av tre variabler.',
  skills: ['dig.sannhetstabell', 'dig.karnaugh'],
  build: (rng) => {
    for (let k = 0; k < 200; k++) {
      const count = randInt(rng, 3, 5);
      const ms = shuffle(rng, [0, 1, 2, 3, 4, 5, 6, 7]).slice(0, count).sort((a, b) => a - b);
      const right = minimalSop(ms, 3);
      const canon = canonical(ms, 3);
      if (right === canon || right.split(' + ').length < 2) continue;
      const alt1 = minimalSop(ms.slice(0, -1), 3);
      const flip = ms.includes(0) ? ms.filter((m) => m !== 0) : [...ms, 0].sort();
      const alt2 = minimalSop(flip, 3);
      const alt3 = right.split(' + ').slice(1).join(' + ') || '1';
      const wrong = [canon, alt1, alt2, alt3].filter((x, i, a) => x !== right && a.indexOf(x) === i);
      if (wrong.length < 3) continue;
      const hasMs = (x: number, y: number, z: number) => (ms.includes(x * 4 + y * 2 + z) ? 1 : 0);
      const parts: GenPart[] = [
        numPart({ id: 'a', label: 'a', prompt: 'Hva er F når x = 1, y = 0 og z = 1?', skills: ['dig.sannhetstabell'], label2: 'F(1,0,1)', value: hasMs(1, 0, 1), solution: [step('', `Mintermen for x = 1, y = 0, z = 1 er nummer 5, og F = ${hasMs(1, 0, 1)}.`, 'Mintermnummeret er bitmønsteret xyz lest som et binærtall.', 'definisjon')], hints: hints('Finn mintermnummeret.', 'xyz = 101₂ = 5', 'Er 5 med i listen?') }),
        mcPart(rng, { id: `kmap-${ms.join('')}`, skill: 'dig.karnaugh', stem: 'Hva er et minimalt SOP-uttrykk for F?', correct: right, wrong: wrong.slice(0, 3), why: `Grupper nabominterm i Karnaugh-diagrammet i så store grupper som mulig (1, 2 eller 4 ruter). Uforenklet er F = ${canon}.` }, 'b', 'b'),
      ];
      return { title: 'Karnaugh-diagram', intro: `F(x, y, z) = Σm(${ms.join(', ')}). (x er mest signifikant bit.)`, context: 'kmap', parts, params: { ms: ms.join(',') }, skills: ['dig.sannhetstabell', 'dig.karnaugh'], structureKey: `dig-kmap|${ms.length}`, estMinutes: 7 };
    }
    throw new Error('Fant ingen funksjon');
  },
};

const tplFlertall: TemplateDef = {
  id: 'dig-flertall',
  version: 1,
  level: 2,
  style: 'standard',
  name: 'Flertallsfunksjon',
  description: 'Utgang 1 når minst k av n innganger er 1.',
  skills: ['dig.sannhetstabell', 'dig.karnaugh'],
  build: (rng) => {
    const nv = pick(rng, [3, 4]);
    const k = nv === 3 ? 2 : pick(rng, [3, 4]);
    const ms: number[] = [];
    for (let m = 0; m < 2 ** nv; m++) if (m.toString(2).split('').filter((c) => c === '1').length >= k) ms.push(m);
    const sop = minimalSop(ms, nv);
    const terms = sop.split(' + ').length;
    const parts: GenPart[] = [
      numPart({ id: 'a', label: 'a', prompt: 'Hvor mange rader i sannhetstabellen har F = 1?', skills: ['dig.sannhetstabell'], label2: 'Antall enere', value: ms.length, solution: [step('', `Rader med minst ${k} enere: ${ms.length}.`, 'Tell kombinasjonene med k eller flere enere.', 'innsetting')], hints: hints('Tell rader med nok enere.', `Minst ${k} av ${nv} er 1.`, 'Binomialkoeffisienter hjelper.') }),
      numPart({ id: 'b', label: 'b', prompt: 'Hvor mange produktledd har et minimalt SOP-uttrykk for F?', skills: ['dig.karnaugh'], label2: 'Antall ledd', value: terms, solution: [step('', `F = ${sop}, altså ${terms} ledd`, 'Hvert ledd er en gruppe i Karnaugh-diagrammet.', 'omforming')], hints: hints('Tegn Karnaugh-diagrammet.', 'Finn de største gruppene.', 'Hver primimplikant som trengs gir ett ledd.') }),
    ];
    return { title: 'Flertallsfunksjon', intro: `En krets har ${nv} innganger (${VARS.slice(0, nv).join(', ')}) og gir F = 1 når minst ${k} av inngangene er 1.`, context: 'flertall', parts, params: { nv: String(nv), k: String(k) }, skills: ['dig.sannhetstabell', 'dig.karnaugh'], structureKey: `dig-flertall|${nv}`, estMinutes: 7 };
  },
};

const BOOL_MC: McItem[] = [
  { id: 'absorb', skill: 'dig.boolsk', stem: 'Forenkle F = x + x′y.', correct: 'x + y', wrong: ['x', 'y', 'x′ + y'], why: 'x + x′y = (x + x′)(x + y) = x + y (distributiv lov).' },
  { id: 'nabo', skill: 'dig.boolsk', stem: 'Forenkle F = yz′ + yz.', correct: 'y', wrong: ['z', 'yz', 'y + z'], why: 'y(z′ + z) = y · 1 = y.' },
  { id: 'demorgan', skill: 'dig.boolsk', stem: 'Hva er (xy)′ ifølge De Morgan?', correct: 'x′ + y′', wrong: ['x′y′', 'x + y', '(x + y)′'], why: 'Komplementet av et produkt er summen av komplementene.' },
  { id: 'produkt', skill: 'dig.boolsk', stem: 'Forenkle F = (x + z)(x + z′).', correct: 'x', wrong: ['z', 'x + z', 'xz'], why: '(x + z)(x + z′) = x + zz′ = x.' },
  { id: 'konsensus', skill: 'dig.boolsk', stem: 'Forenkle F = xy + x′z + yz.', correct: 'xy + x′z', wrong: ['xy + yz', 'x + z', 'y + z'], why: 'Konsensusleddet yz er dekket av de to andre (når y = z = 1 er enten xy eller x′z lik 1).' },
  { id: 'xor', skill: 'dig.boolsk', stem: 'Hvilket uttrykk beskriver XOR av a og b?', correct: 'ab′ + a′b', wrong: ['ab + a′b′', 'a + b', 'ab'], why: 'XOR er 1 når nøyaktig én av inngangene er 1.' },
  { id: 'nand-universell', skill: 'dig.nand', stem: 'Hvorfor kan enhver logisk funksjon lages med bare NAND-porter?', correct: 'Fordi NOT, AND og OR alle kan lages av NAND-porter.', wrong: ['Fordi NAND er raskere enn andre porter.', 'Fordi NAND har tre innganger.', 'Det kan man ikke; man trenger også NOR.'], why: 'NOT: NAND med inngangene koblet sammen. AND: NAND etterfulgt av NOT. OR: De Morgan.' },
  { id: 'nand-sop', skill: 'dig.nand', stem: 'Du har F på SOP-form. Hvordan realiserer du den med bare NAND?', correct: 'Bytt både AND-nivået og OR-nivået med NAND-porter (to nivåer NAND–NAND).', wrong: ['Bytt bare OR-porten med NAND.', 'Bytt alle porter med NOR.', 'Inverter alle innganger og bruk AND.'], why: 'NAND–NAND er lik AND–OR ifølge De Morgan: (a′ + b′)′ … gir samme funksjon.' },
  { id: 'mux', skill: 'dig.kombinatorisk', stem: 'En 4-til-1-multiplekser har valgbitene s1s0 = 10. Hvilken inngang sendes til utgangen?', correct: 'D2', wrong: ['D1', 'D0', 'D3'], why: 's1s0 = 10₂ = 2.' },
  { id: 'fulladder', skill: 'dig.kombinatorisk', stem: 'En fulladder får A = 1, B = 1 og mente inn Ci = 1. Hva er S og Co?', correct: 'S = 1, Co = 1', wrong: ['S = 0, Co = 1', 'S = 1, Co = 0', 'S = 0, Co = 0'], why: '1 + 1 + 1 = 3 = 11₂.' },
];

const logikk: FamilyKB = {
  id: 'dig-logikk',
  domain: 'digital',
  name: 'Boolsk algebra, Karnaugh og kombinatoriske kretser',
  shortName: 'Logikk',
  topic: 'Digitalteknikk',
  subtopics: ['Logiske porter', 'Boolsk algebra', 'Sannhetstabell', 'SOP og POS', 'Karnaugh-diagram', 'NAND/NOR', 'Multiplekser og adder'],
  description: 'Fra en beskrivelse eller et kretsskjema til et forenklet logisk uttrykk og en realisering.',
  skills: ['dig.boolsk', 'dig.sannhetstabell', 'dig.karnaugh', 'dig.nand', 'dig.kombinatorisk'],
  formulas: [
    { id: 'f-demorgan', tex: '(xy)^\\prime = x^\\prime + y^\\prime,\\quad (x+y)^\\prime = x^\\prime y^\\prime', name: 'De Morgans lover', kind: 'identitet', kindWhy: 'Gjelder for alle verdier (kan kontrolleres med sannhetstabell).', symbols: [], conditions: [], whatIf: ['Brukes for å gå mellom NAND/NOR og AND/OR.'] },
    { id: 'f-forenkling', tex: 'x + x^\\prime y = x + y,\\quad xy + xy^\\prime = x,\\quad x + xy = x', name: 'Forenklingsregler', kind: 'identitet', kindWhy: 'Følger av de distributive lovene og x + x′ = 1.', symbols: [], conditions: [], whatIf: ['Nabogrupper i Karnaugh-diagrammet er xy + xy′ = x.'] },
  ],
  intents: [
    { id: 'dig.kmap', specific: true, label: 'Sannhetstabell og Karnaugh', match: [/karnaugh|sannhetstabell|minterm|maksterm|\bSOP\b|\bPOS\b|sum-of-product|product-of-sum/i], skills: ['dig.sannhetstabell', 'dig.karnaugh'], taskType: ['beregning', 'tegning'], assignment: 'Lage sannhetstabell fra beskrivelsen, plassere mintermene i Karnaugh-diagram og finne minimalt uttrykk.', interpretation: ['Nummerer mintermene og bruk Gray-kode-rekkefølge (00, 01, 11, 10) i diagrammet.', 'Grupper på 1, 2, 4 eller 8, så store som mulig; kantene henger sammen.'], prerequisites: ['Binære tall'], misconceptions: ['Feil rekkefølge på kolonnene', 'Glemmer at kantene henger sammen'], variation: [], estMinutes: 8 },
    { id: 'dig.nand', label: 'Realisering med NAND/NOR', match: [/\bNAND\b|\bNOR\b|bare (NAND|NOR)/i], skills: ['dig.nand'], taskType: ['tegning'], assignment: 'Realisere et uttrykk med bare NAND- eller NOR-porter og tegne kretsskjemaet.', interpretation: ['SOP → to nivåer NAND. POS → to nivåer NOR.'], prerequisites: ['De Morgan'], misconceptions: [], variation: [], estMinutes: 6 },
    { id: 'dig.komb', label: 'Multiplekser, dekoder og addere', match: [/multiplekser|\bmux\b|dekoder|koder|adder|fulladder|halvadder|mente/i], skills: ['dig.kombinatorisk'], taskType: ['tegning', 'beregning'], assignment: 'Bruke eller fullføre kombinatoriske byggeblokker (mux, dekoder, adder) ut fra en sannhetstabell.', interpretation: ['Med en mux kan en funksjon realiseres ved at valgbitene er noen av variablene og datainngangene er 0, 1 eller den siste variabelen (eller komplementet).'], prerequisites: ['Sannhetstabell'], misconceptions: [], variation: [], estMinutes: 7 },
    { id: 'dig.boolsk', label: 'Boolsk algebra', match: [/boolsk|forenkl|optimaliser|reduser uttrykket|de morgan|uttrykket for utgangen/i], skills: ['dig.boolsk'], taskType: ['beregning'], assignment: 'Skrive opp det logiske uttrykket for en krets og forenkle det med boolsk algebra.', interpretation: ['Skriv uttrykket for hver port fra inngang mot utgang.', 'Bruk faktorisering, x + x′ = 1, absorpsjon og De Morgan.'], prerequisites: [], misconceptions: ['Blander AND og OR ved De Morgan'], variation: [], estMinutes: 6 },
  ],
  templates: [tplKmap, tplFlertall, mcTemplate({ id: 'dig-bool-mc', level: 1, name: 'Flervalg: boolsk algebra', description: 'Forenkling, NAND, mux og adder.', title: 'Logikk', items: BOOL_MC })],
  misconceptions: [{ id: 'gray', label: 'Feil kolonnerekkefølge i Karnaugh', explanation: 'Kolonnene går 00, 01, 11, 10 slik at naboer skiller seg i én bit.' }],
  recognize: keywordRecognizer([[/boolsk/i, 3], [/uttrykk(et)? for utgangen|logisk(e)? uttrykk/i, 2.5], [/karnaugh/i, 3.5], [/sannhetstabell|minterm/i, 3], [/\bSOP\b|\bPOS\b|sum-of-product/i, 2.5], [/\bNAND\b|\bNOR\b|\bXOR\b/, 2], [/logisk(e)? (uttrykk|port|krets)/i, 2], [/multiplekser|\bmux\b|fulladder|halvadder|dekoder/i, 2.5], [/porter?\b/i, 0.6]], 2.5, 'boolsk algebra og kombinatoriske kretser'),
  explanations: { short: () => ({ text: 'Et logisk uttrykk kan forenkles med regler eller Karnaugh-diagram; nabogrupper fjerner én variabel.', example: 'xy + xy′ = x.' }), analogy: { text: 'Karnaugh-diagrammet er et kart der naboer skiller seg i én bit.', limits: 'Praktisk opp til fire–fem variabler.' }, derivationFormulaId: 'f-forenkling' },
  solutionStructure: ['Sannhetstabell', 'Karnaugh-diagram', 'Minimalt uttrykk', 'Realisering'],
  surfaceFeatures: ['Antall innganger, porttyper'],
};

// ——— 3. Vipper, tilstandsmaskiner, tellere og Verilog ———

const tplTeller: TemplateDef = {
  id: 'dig-teller',
  version: 1,
  level: 2,
  style: 'standard',
  name: 'Teller med hoppe-inngang',
  description: 'Neste tilstand og antall vipper.',
  skills: ['dig.tilstand', 'dig.vipper'],
  build: (rng) => {
    const N = pick(rng, [5, 6, 7, 8, 10, 12]);
    const s = randInt(rng, 0, N - 1);
    const x = randInt(rng, 0, 1);
    const next = (s + 1 + x) % N;
    const ff = Math.ceil(Math.log2(N));
    const parts: GenPart[] = [
      numPart({ id: 'a', label: 'a', prompt: 'Hvor mange D-vipper trengs minst?', skills: ['dig.vipper'], label2: 'Antall vipper', value: ff, solution: [step(`\\lceil \\log_2 ${N} \\rceil = ${ff}`, `${ff} vipper`, `Med n vipper får du 2^n tilstander; 2^${ff} = ${2 ** ff} ≥ ${N}.`, 'definisjon')], hints: hints('Hvor mange tilstander kan n bit skille?', '2^n ≥ N', 'Minste n som holder.') }),
      numPart({ id: 'b', label: 'b', prompt: `Telleren står i ${s}, og x = ${x}. Hva er neste tilstand (i titallsystemet)?`, skills: ['dig.tilstand'], label2: 'Neste tilstand', value: next, solution: [step('', `${s} + ${1 + x} = ${s + 1 + x}, og etter ${N - 1} går telleren til 0: neste tilstand er ${next}.`, 'Modulo N: tellingen går rundt.', 'innsetting')], hints: hints('Hvor mange steg går telleren?', `x = ${x} betyr ${1 + x} steg.`, `Etter ${N - 1} kommer 0.`) }),
      mcPart(rng, { id: 'moore', skill: 'dig.tilstand', stem: 'Utgangen skal være tellerens tilstand. Er det en Moore- eller en Mealy-maskin?', correct: 'Moore: utgangen avhenger bare av nåværende tilstand.', wrong: ['Mealy: utgangen avhenger av inngangen x.', 'Ingen av delene, fordi en teller ikke er en tilstandsmaskin.', 'Mealy, fordi det er vipper i kretsen.'], why: 'I en Moore-maskin er utgangen en funksjon av tilstanden alene.' }, 'c', 'c'),
    ];
    return { title: 'Teller', intro: `En synkron teller går gjennom 0, 1, …, ${N - 1} og så tilbake til 0. Den har en inngang x: med x = 0 går den ett steg, med x = 1 hopper den over neste tall (to steg).`, context: 'teller', parts, params: { N: String(N), s: String(s), x: String(x) }, skills: ['dig.tilstand', 'dig.vipper'], structureKey: 'dig-teller', estMinutes: 6 };
  },
};

const SEKV_MC: McItem[] = [
  { id: 'dvippe', skill: 'dig.vipper', stem: 'Hva gjør en positivt flanketrigget D-vippe?', correct: 'Den tar verdien på D ved stigende klokkeflanke og holder den til neste stigende flanke.', wrong: ['Den følger D hele tiden mens klokka er 1.', 'Den inverterer utgangen på hver klokkeflanke.', 'Den tar verdien på D ved synkende flanke.'], why: 'Q(t+1) = D, oppdatert bare på stigende flanke.' },
  { id: 'flanke', skill: 'dig.tilstand', stem: 'En flankedetektor skal gi 1 i én klokkesyklus når et signal går fra 0 til 1. Hvilket uttrykk kan brukes, der Q er signalet forsinket én klokkesyklus i en D-vippe?', correct: 'F = SW · Q′', wrong: ['F = SW · Q', 'F = SW + Q', 'F = SW′ · Q'], why: 'Signalet er 1 nå, men var 0 i forrige syklus.' },
  { id: 'mealy', skill: 'dig.tilstand', stem: 'Hva skiller en Mealy-maskin fra en Moore-maskin?', correct: 'I Mealy avhenger utgangen av både tilstand og inngang; i Moore bare av tilstanden.', wrong: ['Mealy har alltid færre vipper.', 'Moore har ingen klokke.', 'Mealy bruker JK-vipper, Moore D-vipper.'], why: 'Derfor står utgangen på pilene (x/F) i et Mealy-diagram og i tilstandene i et Moore-diagram.' },
  { id: 'verilog-nb', skill: 'dig.verilog', stem: 'Hvorfor bruker man «<=» og ikke «=» for tilstandsregisteret inne i always @(posedge clk)?', correct: 'Ikke-blokkerende tilordning oppdaterer alle registre samtidig på flanken, slik vippene gjør.', wrong: ['«<=» betyr mindre eller lik og sammenlikner verdiene.', 'Det er bare en stilregel; resultatet blir alltid likt.', '«=» er ikke lov i Verilog.'], why: 'Blokkerende «=» kan gi rekkefølgeavhengig oppførsel som ikke svarer til vipper.' },
  { id: 'verilog-assign', skill: 'dig.verilog', stem: 'Utgangen F skal være lik den minst signifikante biten i tilstanden state[1:0]. Hvilken linje er riktig?', correct: 'assign F = state[0];', wrong: ['assign F = state[1];', 'F <= state;', 'always F = state[0];'], why: 'Kontinuerlig tilordning av bit 0.' },
  { id: 'jk', skill: 'dig.vipper', stem: 'Hva skjer med en JK-vippe når J = K = 1 på klokkeflanken?', correct: 'Utgangen skifter (toggler).', wrong: ['Utgangen settes til 1.', 'Utgangen nullstilles.', 'Ingenting skjer.'], why: 'J = K = 1 er «toggle»; J = 1, K = 0 setter; J = 0, K = 1 nullstiller.' },
];

const SEKV_EXPLAIN: ExplainItem[] = [
  { id: 'design-steg', skills: ['dig.tilstand'], prompt: 'Beskriv stegene fra en tekstlig beskrivelse av en teller til en ferdig krets med D-vipper.', rubric: [['Tilstandsdiagram (tilstander og overganger med inngang/utgang).', true], ['Tilstandstabell med nåværende og neste tilstand.', true], ['Karnaugh-diagram for hver D-inngang og for utgangene, og forenklede uttrykk.', true], ['Tegne kretsen med vipper og porter.', false]], model: 'Først lages et tilstandsdiagram med én tilstand per tallverdi og piler for overgangene, merket med inngangen. Så lages en tabell med nåværende tilstand, inngang og neste tilstand, med tilstandene kodet binært. For hver vippe er D lik neste tilstandsbit, og uttrykket finnes med Karnaugh-diagram. Utgangene finnes på samme måte fra nåværende tilstand (Moore). Til slutt tegnes vippene med porter for D-inngangene og utgangene.', hints: { small: 'Diagram, tabell, Karnaugh, krets.', firstStep: 'Hvor mange tilstander trengs?', why: 'Systematisk design unngår feil.' } },
];

const sekvensiell: FamilyKB = {
  id: 'dig-sekvensiell',
  domain: 'digital',
  name: 'Vipper, tilstandsmaskiner og Verilog',
  shortName: 'Tilstandsmaskiner',
  topic: 'Digitalteknikk',
  subtopics: ['D-, JK- og T-vipper', 'Moore og Mealy', 'Tellere', 'Flankedetektor', 'Verilog'],
  description: 'Sekvensiell logikk: fra tilstandsdiagram via tabell og Karnaugh til vipper, og enkel Verilog.',
  skills: ['dig.vipper', 'dig.tilstand', 'dig.verilog'],
  formulas: [
    { id: 'f-vipper', tex: 'n = \\lceil \\log_2 N \\rceil', name: 'Antall vipper', kind: 'avledet sammenheng', kindWhy: 'n bit kan kode 2^n tilstander.', symbols: [{ sym: 'N', meaning: 'Antall tilstander', unit: '' }], conditions: ['Binær koding (ikke one-hot).'], whatIf: ['One-hot bruker N vipper.'], calc: { inputs: [{ sym: 'N', label: 'Antall tilstander', min: 2, max: 64, step: 1, value: 5 }], compute: (v) => [{ label: 'Vipper (binær koding)', value: String(Math.ceil(Math.log2(v.N))) }, { label: 'Ubrukte tilstander', value: String(2 ** Math.ceil(Math.log2(v.N)) - v.N) }] } },
    { id: 'f-dvippe', tex: 'Q(t+1) = D', name: 'D-vippe', kind: 'definisjon', kindWhy: 'Oppførselen til vippen på aktiv klokkeflanke.', symbols: [], conditions: [], whatIf: ['JK: Q(t+1) = JQ′ + K′Q.'] },
  ],
  intents: [
    { id: 'dig.tilstand', specific: true, label: 'Tilstandsmaskin og teller', match: [/tilstandsmaskin|tilstandsdiagram|tilstandstabell|moore|mealy|teller\b|telle(r|n)? (opp|ned|sekvensielt)|transisjon/i], skills: ['dig.tilstand', 'dig.vipper'], taskType: ['tegning', 'beregning'], assignment: 'Designe eller analysere en tilstandsmaskin: diagram, tabell, uttrykk for vippeinngangene og utgangene, og krets.', interpretation: ['Kod tilstandene binært og lag tabell over nåværende → neste tilstand.', 'For D-vipper er D lik neste tilstandsbit; finn uttrykkene med Karnaugh.', 'Moore: utgang fra tilstand. Mealy: fra tilstand og inngang.'], prerequisites: ['Karnaugh', 'Binære tall'], misconceptions: ['Blander nåværende og neste tilstand'], variation: ['Hoppe-inngang', 'Negative tall i toerkomplement'], estMinutes: 12 },
    { id: 'dig.verilog', specific: true, label: 'Verilog', match: [/verilog|\bmodule\b|always\s*@|assign|posedge/i], skills: ['dig.verilog'], taskType: ['forklaring'], assignment: 'Lese, rette og fullføre enkel Verilog for kombinatorisk logikk og tilstandsmaskiner.', interpretation: ['Klokket logikk: always @(posedge clk) med «<=».', 'Kombinatorisk utgang: assign.'], prerequisites: ['Tilstandsmaskin'], misconceptions: ['Blokkerende tilordning i klokket blokk'], variation: [], estMinutes: 6 },
    { id: 'dig.vipper', label: 'Vipper og flankedetektor', match: [/vippe|flip-?flop|klokke|flanke|edge|latch/i], skills: ['dig.vipper'], taskType: ['tegning'], assignment: 'Bruke vipper til å lagre tilstand og lage kretser som reagerer på klokkeflanker.', interpretation: ['En D-vippe forsinker signalet én klokkesyklus; nåverdi og forrige verdi gir flanken.'], prerequisites: [], misconceptions: [], variation: [], estMinutes: 5 },
  ],
  templates: [tplTeller, mcTemplate({ id: 'dig-sekv-mc', level: 1, name: 'Flervalg: vipper og tilstandsmaskiner', description: 'D-vippe, Moore/Mealy, Verilog.', title: 'Sekvensiell logikk', items: SEKV_MC }), explainTemplate({ id: 'dig-sekv-forklar', level: 3, name: 'Forklar designsteg', description: 'Fra beskrivelse til krets.', title: 'Tilstandsmaskin: forklar', items: SEKV_EXPLAIN })],
  misconceptions: [{ id: 'na-neste', label: 'Blander nåværende og neste tilstand', explanation: 'D-inngangen skal være neste tilstand.' }],
  recognize: keywordRecognizer([[/tilstandsmaskin|tilstandsdiagram|tilstandstabell/i, 3.5], [/moore|mealy/i, 3], [/vippe|flip-?flop/i, 2.5], [/verilog|always\s*@|posedge|\bmodule\b/i, 3], [/teller|telle/i, 1.2], [/klokke|flanke|edge/i, 1.5]], 2.5, 'vipper, tilstandsmaskiner og Verilog'),
  explanations: { short: () => ({ text: 'En tilstandsmaskin husker tilstanden i vipper. D-inngangene er neste tilstand, funnet med Karnaugh.', example: 'Fem tilstander krever tre vipper.' }), analogy: { text: 'En tilstandsmaskin er som et brettspill: brikken står på én rute, og terningen (inngangen) bestemmer neste rute.', limits: 'Alt skjer bare på klokkeflanken.' }, derivationFormulaId: 'f-vipper' },
  solutionStructure: ['Tilstandsdiagram', 'Tabell', 'Karnaugh for D', 'Krets'],
  surfaceFeatures: ['Antall tilstander, inngang'],
};

export const DIGITAL_FAMILIES: FamilyKB[] = [tall, logikk, sekvensiell];
export const _test = { minimalSop };
void (null as unknown as Rng);
