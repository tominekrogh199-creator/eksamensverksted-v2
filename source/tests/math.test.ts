import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rat } from '../src/math/rational';
import { parseLine } from '../src/math/parse';
import { compileContext, checkWork, findFirstDeviation, checkAnswers, equivalentExpr } from '../src/math/check';
import { toTex } from '../src/math/latex';

const eqCtx = compileContext({
  symbols: ['Qd', 'Qs'],
  defs: { Qd: '120 - 2P', Qs: '20 + 3P' },
  param: 'P',
  unknown: 'P',
  solution: { P: '20', Q: '80', Qd: '80', Qs: '80' },
});

test('rasjonale tall og norsk formatering', () => {
  assert.equal(Rat.parseDecimal('2,5').toString(), '5/2');
  assert.equal(Rat.of(1, 3).toNo(2), '0,33');
  assert.equal(Rat.parseDecimal('1234567').toNo(), '1 234 567');
  assert.equal(Rat.of(-5, 2).toNo(), '−2,5');
  assert.equal(Rat.of(2, 3).round(1).toString(), '7/10');
});

test('parser tåler norsk skrivemåte', () => {
  const r = parseLine('120 − 2P = 20 + 3P → 100 = 5P → P = 500');
  assert.equal(r.ok, true);
  assert.equal(r.statements.length, 3);
  const r2 = parseLine('P = 2,5 og Q = 7,5');
  assert.equal(r2.statements.length, 2);
  const r3 = parseLine('Svar: P = 20');
  assert.equal(r3.statements[0].kind, 'eq');
  const r4 = parseLine('Likevekt betyr at Qd = Qs', { symbols: ['Qd', 'Qs'] });
  assert.ok(r4.statements.some((s) => s.kind === 'text'));
  assert.ok(r4.statements.some((s) => s.kind === 'eq'));
});

test('tvetydige tall avklares i stedet for å tolkes i stillhet', () => {
  // «1 200» er den vanlige norske skrivemåten for 1200: leses som ett tall, men eleven kan velge «to tall».
  const r = parseLine('TC = 1 200 + 30Q');
  assert.equal(r.unresolved.length, 0);
  assert.equal(r.ambiguities[0]?.chosen, 'thousands');
  const r2 = parseLine('TC = 1 200 + 30Q', { resolutions: { 'space:1 200': 'split' } });
  assert.equal(r2.ambiguities[0]?.chosen, 'split');
  // Komma med tre sifre kan være desimal eller tusenskille: det må fortsatt avklares.
  const r3 = parseLine('x = 1,200');
  assert.equal(r3.unresolved.length, 1);
  const r4 = parseLine('x = 0,125');
  assert.equal(r4.unresolved.length, 0);
});

test('demoforsøket: riktig modell og omforming til siste steg, feil ved isolering', () => {
  const checks = checkWork(['120 − 2P = 20 + 3P', '100 = 5P', 'P = 500'], eqCtx);
  assert.deepEqual(checks.map((c) => c.status), ['ok', 'ok', 'avvik']);
  const dev = findFirstDeviation(checks, eqCtx)!;
  assert.equal(dev.lineIndex, 2);
  assert.equal(dev.lastGoodLine, 1);
  assert.equal(dev.kind, 'ganget-i-stedet-for-delt');
});

test('samme forsøk på én linje med piler', () => {
  const checks = checkWork(['120 − 2P = 20 + 3P → 100 = 5P → P = 500'], eqCtx);
  const dev = findFirstDeviation(checks, eqCtx)!;
  assert.equal(dev.statementIndex, 2);
  assert.equal(dev.kind, 'ganget-i-stedet-for-delt');
});

test('usikker avlesning fra bilde blir ikke en matematikkfeil', () => {
  const checks = checkWork(['120 − 2P = 20 + 3P', '100 = 5P', 'P = 500'], eqCtx, { sources: ['image', 'image', 'image'], uncertainLines: new Set([2]) });
  const dev = findFirstDeviation(checks, eqCtx)!;
  assert.equal(dev.needsReadingConfirmation, true);
  const ans = checkAnswers(checks, [{ symbol: 'P', label: 'Likevektspris', value: '20' }], eqCtx);
  assert.equal(ans[0].verdict, 'uavklart');
});

test('fortegnsfeil ved flytting oppdages', () => {
  const checks = checkWork(['120 − 2P = 20 + 3P', '120 − 20 = 3P − 2P', 'P = 100'], eqCtx);
  const dev = findFirstDeviation(checks, eqCtx)!;
  assert.equal(dev.lineIndex, 1);
  assert.equal(dev.kind, 'fortegnsfeil-flytting');
});

test('regnefeil i konstant', () => {
  const checks = checkWork(['120 − 2P = 20 + 3P', '110 = 5P', 'P = 22'], eqCtx);
  const dev = findFirstDeviation(checks, eqCtx)!;
  assert.equal(dev.lineIndex, 1);
  assert.equal(dev.kind, 'regnefeil-konstant');
});

test('riktig løsning med alternativ metode og kontroll', () => {
  const checks = checkWork(['Qd = Qs', '5P = 100', 'P = 100/5 = 20', 'Q = Qd(20) = 120 − 2·20 = 80', 'Qs(20) = 20 + 3·20 = 80'], eqCtx);
  assert.ok(checks.every((c) => c.status === 'ok'), JSON.stringify(checks.map((c) => [c.raw, c.status, c.error])));
  const ans = checkAnswers(checks, [
    { symbol: 'P', label: 'Pris', value: '20' },
    { symbol: 'Q', label: 'Kvantum', value: '80' },
  ], eqCtx);
  assert.deepEqual(ans.map((a) => a.verdict), ['riktig', 'riktig']);
});

test('fortsettelseslinjer som starter med =', () => {
  const checks = checkWork(['P = 100/5', '= 20'], eqCtx);
  assert.deepEqual(checks.map((c) => c.status), ['ok', 'ok']);
  const bad = checkWork(['P = 100/5', '= 25'], eqCtx);
  assert.equal(bad[1].status, 'avvik');
});

test('prosent: grunnlag og avrunding', () => {
  const pc = compileContext({ symbols: ['V0', 'V1'], defs: {}, param: 'x', unknown: 'x', solution: { V0: '80', V1: '92' } });
  const ok = checkWork(['(92 − 80)/80 = 0,15 = 15 %'], pc);
  assert.equal(ok[0].status, 'ok');
  const rounded = checkWork(['12/92 = 0,13'], pc);
  assert.equal(rounded[0].status, 'avrundet');
  const ans = checkAnswers(checkWork(['endring = 15 %'], pc), [{ symbol: 'e', label: 'Endring', value: '15', percent: true }], pc);
  assert.equal(ans[0].verdict, 'riktig');
  const ans2 = checkAnswers(checkWork(['(300-250)/300 = 16,7 %'], pc), [{ symbol: 'e', label: 'Endring', value: '20', percent: true }], pc);
  assert.equal(ans2[0].verdict, 'feil');
  const ans3 = checkAnswers(checkWork(['e = 16,7 %'], pc), [{ symbol: 'e', label: 'Endring', value: '50/3', percent: true, minDecimals: 0 }], pc);
  assert.equal(ans3[0].verdict, 'riktig-avrundet');
});

test('symbolsk likhet er eksakt, ikke numerisk prøving', () => {
  assert.equal(equivalentExpr('(500 + 20Q)/Q', '500/Q + 20'), true);
  assert.equal(equivalentExpr('2(P + 3)', '2P + 6'), true);
  assert.equal(equivalentExpr('(P+1)^2', 'P^2 + 2P + 1'), true);
  assert.equal(equivalentExpr('(P+1)^2', 'P^2 + 1'), false);
  assert.equal(equivalentExpr('sqrt(P^2)', 'P'), null);
});

test('LaTeX med desimalkomma', () => {
  const r = parseLine('Q = 2,5P + 10/Q');
  assert.equal(toTex(r.statements[0].sides[1]), '2{,}5P + \\frac{10}{Q}');
});

test('etiketter med ord knyttes til riktig mål', () => {
  const kc = compileContext({ symbols: ['TC', 'AC', 'MC', 'FC'], defs: { TC: '500 + 20*Q' }, param: 'Q', unknown: 'Q', solution: { Q: '50', TC: '1500', AC: '30', MC: '20', FC: '500' }, answerSymbols: ['v'] });
  const checks = checkWork(['Faste kostnader: 500 kr', 'Variabel kostnad per enhet = 20 kr'], kc);
  const ans = checkAnswers(checks, [
    { symbol: 'FC', label: 'Faste kostnader', value: '500', aliases: ['faste', 'fast'] },
    { symbol: 'v', label: 'Variabel kostnad per enhet', value: '20', aliases: ['variabel', 'per enhet'] },
  ], kc);
  assert.deepEqual(ans.map((a) => a.verdict), ['riktig', 'riktig']);
  const c2 = checkWork(['Konsumentene: 23 − 20 = 3', 'Produsentene: 20 − 18 = 2'], kc);
  const a2 = checkAnswers(c2, [
    { symbol: 'Kons', label: 'Konsumentenes andel', value: '3', aliases: ['konsumentene'] },
    { symbol: 'Prod', label: 'Produsentenes andel', value: '2', aliases: ['produsentene'] },
  ], kc);
  assert.deepEqual(a2.map((a) => a.verdict), ['riktig', 'riktig']);
  const c3 = checkWork(['Likevekt: P = 20'], eqCtx);
  const a3 = checkAnswers(c3, [{ symbol: 'P', label: 'Pris', value: '20' }], eqCtx);
  assert.equal(a3[0].verdict, 'riktig');
});

test('kostnad: F og c godtas som navn på FC og v, og gale tall blir «feil», ikke «mangler»', () => {
  const cc = compileContext({ symbols: ['TC', 'AC', 'MC', 'FC', 'VC', 'TR'], defs: { TC: '1400 + 57*Q' }, param: 'Q', unknown: 'Q', solution: { Q: '100', FC: '1400', MC: '57' }, answerSymbols: ['v'] });
  const targets = [
    { symbol: 'FC', label: 'Faste kostnader', value: '1400', aliases: ['faste'], symbolAliases: ['F', 'FK'] },
    { symbol: 'v', label: 'Variabel kostnad per enhet', value: '57', aliases: ['variabel'], symbolAliases: ['c'] },
  ];
  assert.deepEqual(checkAnswers(checkWork(['F = 1400', 'c = 57'], cc), targets, cc).map((a) => a.verdict), ['riktig', 'riktig']);
  assert.deepEqual(checkAnswers(checkWork(['F = 1500, c = 57'], cc), targets, cc).map((a) => a.verdict), ['feil', 'riktig']);
  assert.deepEqual(checkAnswers(checkWork(['FC = 1400', 'v = 57'], cc), targets, cc).map((a) => a.verdict), ['riktig', 'riktig']);
});
