// Tester for oppgavesett med løsning i samme dokument (tekniske fag).
// Alt innhold her er oppdiktet testtekst, ikke tekst fra ekte eksamener.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentOppg, extractAnswerKeys, type OPageInput } from '../src/analysis/segment-oppg';

type L = { t: string; b: [number, number, number, number]; bold?: boolean };
const ln = (t: string, y: number, extra: Partial<L> = {}): L => ({ t, b: [0.1, y, 0.6, 0.016], ...extra });
const page = (pdfPage: number, lines: L[], figureBoxes: [number, number, number, number][] = []): OPageInput => ({ pdfPage, text: lines.map((l) => l.t).join('\n'), lines, figureBoxes });

const pages = [
  page(
    1,
    [ln('Oppgave 1', 0.08, { bold: true }), ln('For kretsen i figur 1 beregn strømmen i.', 0.11), ln('Løsning', 0.35, { bold: true }), ln('i = 12 V / 4 kΩ = 3 mA', 0.4), ln('Strømmen går med klokka i figuren over.', 0.64)],
    [
      [0.5, 0.12, 0.4, 0.18], // figuren i oppgaven
      [0.08, 0.1, 0.3, 0.4], // ramme som går ned i løsningen
      [0.5, 0.42, 0.4, 0.2], // figur i løsningen
    ],
  ),
  page(2, [ln('Oppgave 2', 0.08, { bold: true }), ln('Finn Amax,dB for filteret.', 0.11), ln('Løsning', 0.3, { bold: true }), ln('Amax,dB = 20 log(0,5) = −6,0 dB', 0.34)]),
  page(3, [ln('Oppgave 3', 0.08, { bold: true }), ln('Gjør ferdig kretsen i figur 3.', 0.11), ln('Figur: 3', 0.3), ln('D0 = A', 0.36), ln('D1 = 1', 0.4), ln('D2 = 0', 0.44)]),
  page(4, [ln('Errata (rettelser i læreboka)', 0.07, { bold: true }), ln('Side 12: v = 5 V skal være 6 V', 0.12)]),
];

test('løsningen lekker ikke inn i oppgaveutsnittet', () => {
  const seg = segmentOppg(pages, { solutionsExpected: true });
  const it = seg.items.find((i) => i.label === '1')!;
  const solTop = it.solutionRegions[0].box[1];
  for (const r of it.regions.filter((r) => r.page === 1)) assert.ok(r.box[1] + r.box[3] <= solTop + 1e-9, 'oppgaveutsnittet slutter over løsningen');
  const inTask = it.figures.filter((f) => !f.inGuide);
  assert.ok(inTask.every((f) => f.box[1] + f.box[3] <= solTop + 1e-9), 'figurer i oppgaven er klippet over løsningen');
  assert.ok(it.figures.some((f) => f.inGuide && f.box[1] >= 0.42 - 1e-9), 'figuren i løsningen hører til løsningsdelen');
  assert.deepEqual(it.answerKeys.map((k) => [k.symbol, k.value]), [['i', '0.003']]);
});

test('sluttsvar med dB får samme symbol som parseren bruker', () => {
  const it = segmentOppg(pages, { solutionsExpected: true }).items.find((i) => i.label === '2')!;
  assert.equal(it.answerKeys[0]?.symbol, 'AdB');
  assert.equal(Number(it.answerKeys[0]?.value), -6);
});

test('løsning uten overskrift etter figuren, og errata-side etter siste oppgave', () => {
  const it = segmentOppg(pages, { solutionsExpected: true }).items.find((i) => i.label === '3')!;
  assert.ok(it.solutionRegions.length > 0, 'løsningen etter figurteksten er funnet');
  assert.doesNotMatch(it.stem, /D0 = A/);
  assert.ok(!it.solutionRegions.some((r) => r.page === 4), 'errata-siden er ikke en del av løsningen');
});

test('sluttsvar fra brøker og to spalter: fortsettelse på samme rad eller like under', () => {
  const L = (text: string, x: number, y: number) => ({ text, x, y });
  const keys = extractAnswerKeys([
    L('i a = − a', 0.42, 1.53),
    L('= −6,8 A', 0.53, 1.53),
    L('i c = a', 0.42, 1.58),
    L('b = −9,5 A', 0.49, 1.58), // teller i brøken står på samme rad
    L('i 6 Ω =', 0.43, 1.62),
    L('= 3 A', 0.53, 1.62), // hører til «i 6 Ω», ikke til et eldre symbol
    L('v = vn − iA · 1,45 kΩ', 0.55, 1.7),
    L('Figurtekst i den andre spalten', 0.11, 1.71),
    L('= −2,5 V − 10 mA · 390 Ω', 0.56, 1.73), // uttrykket fortsetter: ikke et svar
    L('= −6,4 V', 0.56, 1.745),
  ]);
  assert.deepEqual(
    keys.map((k) => [k.symbol, k.value]),
    [
      ['ia', '-6.8'],
      ['ic', '-9.5'],
      ['v', '-6.4'],
    ],
  );
});
