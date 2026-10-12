// Lær: leksjoner fra AI valideres, og tall regnes ut av appen selv.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLesson } from '../src/learning/lesson';
import { getFamily } from '../src/families';
import { colorTex } from '../src/ui/components/LessonText';

test('leksjon: kalkulatorkort får tastetrykk fra appen, ugyldige kort fjernes', () => {
  const fam = getFamily('fritid-konsum')!;
  const r = validateLesson(
    {
      cards: [
        { type: 'intro', title: 'Fritid og konsum', body: 'Kommer på {{1:7 av 8}} eksamener.' },
        { type: 'formula', title: 'Budsjettlinjen', tex: 'c = w(24 - t) + Y', parts: [{ tex: 'c', meaning: 'konsum' }], whenToUse: 'timelønn og fritid', formulaId: 'finnes-ikke' },
        { type: 'calculator', task: 'Regn ut konsumet', expression: '230·(24 − 18) + 200', keys: ['9', '9'], result: '999' },
        { type: 'calculator', task: 'Ugyldig', expression: '230 ·· (' },
        { type: 'check', question: 'Hva er helningen?', options: ['Y', 'w', 't', 'c'], correct: 7, why: '' },
        { type: 'check', question: 'Hva er helningen?', options: ['Y', 'w', 't', 'c'], correct: 1, why: 'Timelønnen.' },
        { type: 'worked', title: 'Eksempel', problem: 'Timelønn 230 …', steps: [{ text: '24 − 18 = 6' }], answer: '1580' },
        { type: 'mnemonic', title: 'Husk', body: 'Tid er penger.' },
        { type: 'ukjent', body: 'x' },
      ],
      quiz: [{ question: 'Hva skjer når lønnen øker?', options: ['A', 'B', 'C', 'D'], correct: 1, why: '' }],
    },
    fam,
    'enkel',
  );
  assert.ok(typeof r !== 'string', String(r));
  if (typeof r === 'string') return;
  const calc = r.cards.filter((c) => c.type === 'calculator');
  assert.equal(calc.length, 1, 'bare det gyldige kalkulatorkortet');
  const c = calc[0] as Extract<(typeof r.cards)[number], { type: 'calculator' }>;
  assert.equal(c.result, '1580', 'svaret er regnet ut av appen, ikke tatt fra AI');
  assert.notDeepEqual(c.keys, ['9', '9']);
  assert.equal(r.cards.filter((x) => x.type === 'check').length, 1, 'kontrollspørsmål med ugyldig fasit fjernes');
  const f = r.cards.find((x) => x.type === 'formula') as Extract<(typeof r.cards)[number], { type: 'formula' }>;
  assert.equal(f.formulaId, undefined, 'ukjent formel-id fjernes');
  assert.equal(r.quiz.length, 1);
});

test('leksjon: for få kort avvises', () => {
  assert.equal(typeof validateLesson({ cards: [{ type: 'intro', title: 'x', body: 'y' }], quiz: [] }, getFamily('fritid-konsum')!, 'enkel'), 'string');
});

test('fargede formler: hver del farges, kommandoer og tekst røres ikke', () => {
  const t = colorTex('\\text{c er} c = w \\cdot (24 - t) + Y', [{ tex: 'c' }, { tex: 'w' }, { tex: 't' }]);
  assert.match(t, /\\text\{c er\}/);
  assert.match(t, /\\cdot/);
  assert.equal((t.match(/\\textcolor/g) ?? []).length, 3);
});

test('signalord viser hele ord, ikke regex-rester', async () => {
  const { signalWords } = await import('../src/learning/lesson');
  assert.deepEqual(signalWords([/nullpunkt|gå i null|break.?even|dekke kostnadene/i]), ['nullpunkt', 'gå i null', 'break-even', 'dekke kostnadene']);
  assert.deepEqual(signalWords([/forklar|hvorfor.*likevekt|tolk\w*/i]), ['forklar']);
  assert.deepEqual(signalWords([/skift|forskyv|flytte[sr]? (?:opp|ned)/i]), ['skift', 'forskyvning']);
});
