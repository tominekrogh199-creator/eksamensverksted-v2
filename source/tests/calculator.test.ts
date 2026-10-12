// En vanlig kalkulator regner fra venstre mot høyre og har ett minne.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BasicCalc, planKeys, keysText, evaluate, type CalcKey } from '../src/learning/calculator';

const run = (keys: string) => {
  const c = new BasicCalc();
  const d = c.run(keys.split(' ') as CalcKey[]);
  return d[d.length - 1];
};

test('kalkulator: regner fra venstre mot høyre (ingen gange før pluss)', () => {
  assert.equal(run('2 + 3 × 4 ='), '20');
  assert.equal(run('2 3 0 × 6 + 2 0 0 ='), '1580');
  assert.equal(run('1 0 ÷ 4 ='), '2.5');
});

test('kalkulator: minne, prosent og kvadratrot', () => {
  assert.equal(run('3 × 4 M+ 2 × 5 M+ MRC'), '22');
  assert.equal(run('3 × 4 M+ 2 × 5 M− MRC'), '2');
  const c = new BasicCalc();
  c.run('5 M+ MRC MRC'.split(' ') as CalcKey[]);
  assert.equal(c.memory, 0, 'MRC to ganger tømmer minnet');
  assert.equal(run('2 0 0 × 1 5 %'), '30');
  assert.equal(run('2 0 0 + 1 5 %'), '230');
  assert.equal(run('1 6 √'), '4');
  assert.equal(run('5 × ='), '25');
});

test('tastetrykk: lager riktige taster og kontrollerer dem i simulatoren', () => {
  const cases: [string, number][] = [
    ['230·6 + 200', 1580],
    ['200 + 230·6', 1580],
    ['3·4 + 2·5', 22],
    ['3·4 − 2·5', 2],
    ['(12 − 4)/(2 + 6)', 1],
    ['100/(2 + 3)', 20],
    ['(120 − 20)/(2 + 3)', 20],
    ['4,5^2', 20.25],
    ['√16 + 2', 6],
    ['15% · 200', 30],
    ['(50 − 30)/30 · 100', 66.6666666667],
    ['1/(1/2 + 1/3)', 1.2],
  ];
  for (const [e, v] of cases) {
    const p = planKeys(e);
    assert.ok(p, `fikk ikke taster for ${e}`);
    assert.ok(Math.abs(p!.result - v) < 1e-6, `${e}: ${keysText(p!.keys)} gir ${p!.result}, ventet ${v}`);
    assert.ok(Math.abs((evaluate(e) ?? NaN) - v) < 1e-6);
  }
});

test('tastetrykk: for sammensatt uttrykk gir null i stedet for feil taster', () => {
  assert.equal(planKeys('(1+2)·(3+4) + (5+6)·(7+8)'), null);
  assert.equal(planKeys('2^10'), null);
});
