// Ulike eksamensformater: oppdelingen skal finne oppgavene uansett skrivemåte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentDocument } from '../src/analysis/segment';
import { segmentOppg } from '../src/analysis/segment-oppg';

const labels = (text: string) => segmentDocument([{ pdfPage: 1, text }]).tasks.flatMap((t) => t.subtasks.map((s) => s.label));
const oppg = (text: string) => {
  const lines = text.split('\n').map((t, i) => ({ t, b: [0.1, 0.05 + i * 0.03, 0.6, 0.02] as [number, number, number, number] }));
  return segmentOppg([{ pdfPage: 1, text, lines }], { solutionsExpected: false }).items.map((i) => i.label);
};

const FORMATS: [string, string, string[]][] = [
  ['Oppgave N med a) b)', 'Eksamen\nOppgave 1 (20%)\na) Forklar X.\nb) Drøft Y.\nOppgave 2 (80%)\nHva er Z?', ['1a', '1b', '2']],
  ['(a) (b) i parentes', 'Oppgave 1\n(a) Forklar X.\n(b) Drøft Y.', ['1a', '1b']],
  ['1a) på samme linje', 'Sensorveiledning\n1a) Forklar tilbud.\n1b) Forklar etterspørsel.\n2a) Regn ut.', ['1a', '1b', '2a']],
  ['Spørsmål N', 'Spørsmål 1\nHva er inflasjon?\nSpørsmål 2\nHva er BNP?', ['1', '2']],
  ['Question N (English)', 'Question 1 (30 %)\na) Explain A.\nb) Discuss B.\nQuestion 2 (70 %)\nDescribe C.', ['1a', '1b', '2']],
  ['Task / Problem', 'Task 1\nCompute X.\nTask 2\nCompute Y.', ['1', '2']],
  ['Romertall', 'Oppgave I\nForklar A.\nOppgave II\nForklar B.\nOppgave III\nForklar C.', ['1', '2', '3']],
  ['Del A/Del B med oppgaver', 'Del A\nOppgave 1\nForklar A.\nDel B\nOppgave 2\nForklar B.', ['1', '2']],
  ['Nummerert liste 1.', 'Besvar følgende oppgaver:\n1. Hva er tillit?\n2. Hva er byråkrati?', ['1', '2']],
  ['Nummerert liste 1)', 'Svar på alle:\n1) Hva er tillit?\n2) Hva er makt?\n3) Hva er kultur?', ['1', '2', '3']],
  ['Nummerert liste (1)', 'Svar på alle:\n(1) Hva er tillit?\n(2) Hva er makt?', ['1', '2']],
  ['(i) i teksten er ikke deloppgave', 'Oppgave 3\nKriterier: (i) Målet skal nås (ii) lavest kostnad.\na) Kvoter\nb) Avgift', ['3a', '3b']],
  ['Bokstaver forbi h', 'Oppgave 2\na) A\nb) B\nc) C\nd) D\ne) E\nf) F\ng) G\nh) H\ni) I\nj) J', ['2a', '2b', '2c', '2d', '2e', '2f', '2g', '2h', '2i', '2j']],
  ['Topp- og bunntekst, sidetall', 'Side 1 av 2\nOppgave 1\nForklar A.\n1\nSide 2 av 2\nOppgave 2\nForklar B.\n2', ['1', '2']],
];

for (const [name, text, want] of FORMATS) test(`format: ${name}`, () => assert.deepEqual(labels(text), want));

test('datoer og løse tall blir ikke oppgaver', () => {
  assert.deepEqual(labels('Notat\n17. desember 2024 var det eksamen.\n3. mars også.'), []);
});

test('oppgavesett med lang vektingsoverskrift og a)–j) (ECON1210 v2026)', () => {
  const t = 'Oppgave 1 (teller 20%)\na) Forklar.\nb) Drøft.\nOppgave 2 (Oppgaven teller 50%. Hvert delspørsmål teller 5%)\nVi ser på et monopol.\n(a) Tegn.\n(b) Forklar.\n(c) Hvorfor?\n(d) Forklar.\n(e) Forklar.\n(f) Tegn.\n(g) Forklar.\n(h) Forklar.\n(i) Forklar.\n(j) Diskuter.\nOppgave 3 (teller 30%)\na) Forklar.';
  assert.deepEqual(oppg(t), ['1a', '1b', '2a', '2b', '2c', '2d', '2e', '2f', '2g', '2h', '2i', '2j', '3']);
});

test('«Question 1» fra Inspera foran «Problem 1» gir ikke en tom ekstra oppgave', () => {
  const t = 'Question 1\nAttached\nProblem 1 (25%)\na) Why?\nb) Explain.\nProblem 2 (45%)\na) Show.\nb) Prove.';
  assert.deepEqual(oppg(t), ['1a', '1b', '2a', '2b']);
});
