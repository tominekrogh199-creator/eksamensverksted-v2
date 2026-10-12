// Eksamensnære oppgaver og tydelig vurdering av sluttsvar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copiedShare, displayValue, validateRegne, validateMc } from '../src/learning/examlike';
import { FAMILIES } from '../src/families';
import { generateOne } from '../src/generator/generate';
import { assessMathPart } from '../src/learning/assess';
import type { PartAttempt } from '../src/domain/types';

test('kopikontroll: ordrett tekst fanges, omskrevet tekst slipper gjennom', () => {
  const src = 'En bedrift produserer to varer og står overfor en lineær etterspørsel etter vare A i et marked med fullkommen konkurranse';
  assert.ok(copiedShare(src, [src]) > 0.9);
  assert.ok(copiedShare('Et firma lager sykler og møter en fallende etterspørselskurve når prisen øker i et konkurranseutsatt marked', [src]) < 0.1);
});

test('tallsvar: prefiks i visningen vinner når verdien mangler prefiks', () => {
  assert.equal(displayValue('RT = 4,7 kΩ'), 4700);
  assert.equal(displayValue('I1 = 2,5 mA'), 0.0025);
  assert.equal(displayValue('U = 12 V'), 12);
  const r = validateRegne({
    topic: 'Spenningsdeling',
    intro: 'En ideell spenningskilde på 12 V er koblet i serie med R1 = 2 kΩ og R2 = 4 kΩ.',
    subs: [{ stem: 'Finn strømmen i kretsen.', answers: [{ symbol: 'I', value: 2, unit: 'A', display: 'I = 2 mA' }], steps: [{ text: 'Ohms lov', tex: 'I = 12/6000' }], criteria: [] }],
  });
  assert.ok(typeof r !== 'string');
  if (typeof r !== 'string') assert.equal(r.subs[0].answers[0].value, 0.002);
});

test('regneoppgave uten løsningssteg eller svar avvises', () => {
  assert.equal(typeof validateRegne({ intro: 'For kort', subs: [] }), 'string');
  const r = validateRegne({ intro: 'En krets med to motstander i serie over en kilde på 10 V.', subs: [{ stem: 'Finn strømmen i kretsen.', answers: [], textAnswer: '', steps: [] }] });
  assert.equal(typeof r, 'string');
});

test('flervalg: må ha fire ulike alternativer og gyldig fasit', () => {
  assert.equal(typeof validateMc({ stem: 'Hva skjer med prisen når tilbudet øker?', options: ['A', 'B', 'C'], correct: 0 }), 'string');
  assert.equal(typeof validateMc({ stem: 'Hva skjer med prisen når tilbudet øker?', options: ['Øker', 'Faller', 'Uendret', 'Uklart'], correct: 4 }), 'string');
  assert.equal(typeof validateMc({ stem: 'Hva skjer med prisen når tilbudet øker?', options: ['Øker', 'Faller', 'Uendret', 'Uklart'], correct: 1, explanations: [] }), 'object');
});

test('vurdering: feil sluttsvar uten mellomregning sier tydelig at svaret er feil', () => {
  const fam = FAMILIES.find((f) => f.templates.some((t) => t.id === 'af-budsjett')) ?? FAMILIES.find((f) => f.templates.some((t) => /budsjett/.test(t.id)));
  assert.ok(fam, 'fant malen');
  const tpl = fam!.templates.find((t) => /budsjett/.test(t.id))!;
  const task = generateOne('c1', fam!.id, tpl, 4242);
  const part = task.parts.find((p) => p.kind === 'beregning' && p.targets?.length)!;
  assert.ok(part, 'malen har en beregningsdel');
  const pa: PartAttempt = { partId: part.id, lines: [{ text: '1529,4kr', source: 'typed' } as never], resolutions: {}, explanation: '', images: [], confirmedReadings: {}, submitted: true };
  const a = assessMathPart(part, pa, task);
  assert.equal(a.answer.verdict, 'feil');
  assert.notEqual(a.method.verdict, 'riktig');
  assert.match(a.feedback, /stemmer ikke/);
  assert.doesNotMatch(a.feedback, /Alle stegene/);
});
