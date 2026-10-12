import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitMarks, plainMarks } from '../src/ui/components/LessonText';

test('fargemarkering beholder første tegn', () => {
  assert.deepEqual(splitMarks('Neste: {{1:Lær}} i «X»'), [
    { hl: 0, s: 'Neste: ' },
    { hl: 1, s: 'Lær' },
    { hl: 0, s: ' i «X»' },
  ]);
});

test('klammer inni markering og plain-tekst', () => {
  assert.deepEqual(splitMarks('{{3:$\\frac{a}{b}$}}'), [{ hl: 3, s: '$\\frac{a}{b}$' }]);
  assert.equal(plainMarks('a {{2:b}} c'), 'a b c');
  assert.equal(plainMarks('uten {{9:x}} slutt'), 'uten {{9:x}} slutt');
});
