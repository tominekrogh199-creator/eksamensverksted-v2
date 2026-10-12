// Kostnadsfunksjon: vanlige feil i gjennomsnittskostnad gir en konkret forklaring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAMILIES } from '../src/families';
import { generateOne } from '../src/generator/generate';
import { assessMathPart } from '../src/learning/assess';
import type { PartAttempt } from '../src/domain/types';

const attempt = (partId: string, lines: string[]): PartAttempt => ({ partId, lines: lines.map((text) => ({ text, source: 'typed' }) as never), resolutions: {}, explanation: '', images: [], confirmedReadings: {}, submitted: true });

test('AC-feil: glemte faste, glemte å dele, delte bare F', () => {
  const fam = FAMILIES.find((f) => f.templates.some((t) => t.id === 'kost-grunn'))!;
  const task = generateOne('c1', fam.id, fam.templates.find((t) => t.id === 'kost-grunn')!, 777);
  const b = task.parts.find((p) => p.id === 'b')!;
  const s = b.math!.solution;
  const F = Number(s.FC), c = Number(s.MC), Q = Number(s.Q);
  const no = (x: number) => String(x).replace('.', ',');
  assert.equal(assessMathPart(b, attempt('b', [`AC = ${c}`]), task).misconception?.id, 'glemmer-faste');
  assert.equal(assessMathPart(b, attempt('b', [`AC = ${F + c * Q}`]), task).misconception?.id, 'glemte-dele');
  assert.equal(assessMathPart(b, attempt('b', [`AC = ${no(F / Q + c * Q)}`]), task).misconception?.id, 'delte-bare-faste');
  const ok = assessMathPart(b, attempt('b', [`AC = (${F} + ${c}*${Q})/${Q}`, `AC = ${no(Math.round(((F + c * Q) / Q) * 100) / 100)}`]), task);
  assert.notEqual(ok.answer.verdict, 'feil');
  assert.equal(ok.misconception, undefined);
});
