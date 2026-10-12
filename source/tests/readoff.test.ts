// Avlesning: når svaret bare skal leses av uttrykket eller figuren, skal appen
// ikke kreve mellomregning («Metoden er ikke vist») eller nedgradere mestringen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAMILIES } from '../src/families';
import { generateOne } from '../src/generator/generate';
import { assessMathPart, isReadOffPart } from '../src/learning/assess';
import type { PartAttempt } from '../src/domain/types';

const attempt = (partId: string, lines: string[]): PartAttempt => ({ partId, lines: lines.map((text) => ({ text, source: 'typed' }) as never), resolutions: {}, explanation: '', images: [], confirmedReadings: {}, submitted: true });

function taskFor(templateId: string, seed = 4242) {
  const fam = FAMILIES.find((f) => f.templates.some((t) => t.id === templateId))!;
  return generateOne('c1', fam.id, fam.templates.find((t) => t.id === templateId)!, seed);
}

test('faste og variable kostnader lest av uttrykket: riktig uten krav om mellomregning', () => {
  const task = taskFor('kost-grunn');
  const a = task.parts.find((p) => p.id === 'a')!;
  assert.equal(isReadOffPart(a), true);
  const s = a.math!.solution;
  const r = assessMathPart(a, attempt('a', [`FC = ${s.FC}`, `c = ${s.MC}`]), task);
  assert.equal(r.answer.verdict, 'riktig');
  assert.equal(r.method.verdict, 'riktig');
  assert.doesNotMatch(r.feedback, /mellomregning|metoden/i);
  assert.match(r.feedback, /Svaret er riktig/);
});

test('feil avlesning: sier at svaret er feil og peker på uttrykket, ikke på «skriv utregningen»', () => {
  const task = taskFor('kost-grunn');
  const a = task.parts.find((p) => p.id === 'a')!;
  const s = a.math!.solution;
  const r = assessMathPart(a, attempt('a', [`FC = ${Number(s.FC) + 7}`, `c = ${Number(s.MC) + 3}`]), task);
  assert.equal(r.answer.verdict, 'feil');
  assert.match(r.feedback, /Sluttsvaret stemmer ikke/);
  assert.doesNotMatch(r.feedback, /utregningen linje for linje|mellomregning/i);
  assert.match(r.feedback, /Se en gang til/);
});

test('likevekt lest av figuren: riktig avlesning teller som selvstendig riktig metode', () => {
  const task = taskFor('lik-graf-les');
  const a = task.parts.find((p) => p.id === 'a')!;
  assert.equal(isReadOffPart(a), true);
  const s = a.math!.solution;
  const r = assessMathPart(a, attempt('a', [`P = ${s.P}`, `Q = ${s.Q}`]), task);
  assert.equal(r.answer.verdict, 'riktig');
  assert.equal(r.method.verdict, 'riktig');
  assert.doesNotMatch(r.feedback, /mellomregning/i);
});

test('vanlige regneoppgaver krever fortsatt mellomregning', () => {
  const task = taskFor('kost-grunn');
  const b = task.parts.find((p) => p.id === 'b')!;
  assert.equal(isReadOffPart(b), false);
  const s = b.math!.solution;
  const ac = (Number(s.FC) + Number(s.MC) * Number(s.Q)) / Number(s.Q);
  const r = assessMathPart(b, attempt('b', [`AC = ${String(Math.round(ac * 100) / 100).replace('.', ',')}`]), task);
  assert.equal(r.method.verdict, 'ikke-vist');
  assert.match(r.feedback, /uten mellomregning/);
});
