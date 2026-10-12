// Tester for eksamensformatet med Del 1–3 og for opprydding i OCR-tekst.
// Alt innhold her er oppdiktet testtekst, ikke tekst fra ekte eksamener.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentBi, looksLikeBi, type BiPageInput } from '../src/analysis/segment-bi';
import { cleanOptionArtifacts, type OcrLine } from '../src/ingest/ocr';
import { guessMeta } from '../src/ingest/meta';
import { rubricFromGuide } from '../src/learning/originals';

type L = { t: string; b: [number, number, number, number]; bold?: boolean; mark?: 'valgt' | 'ikke-valgt' };
let y = 0;
const ln = (t: string, x = 0.1, extra: Partial<L> = {}): L => {
  y += 0.02;
  return { t, b: [x, y, 0.6, 0.012], ...extra };
};
const page = (pdfPage: number, lines: L[]): BiPageInput => ({ pdfPage, text: lines.map((l) => l.t).join('\n'), lines });

test('Word-format: spørsmål, uthevet fasit, kortsvar og Del 3 med veiledning', () => {
  y = 0;
  const p1 = [
    ln('DEL 1 – FLERVALG'),
    ln('Del 1 består av 2 flervalgspørsmål. Riktig svar gir ett poeng, og det gis ikke minuspoeng.'),
    ln('Spørsmål 1'),
    ln('Hva skjer med likevektsprisen når etterspørselen øker?'),
    ln('A. Den faller', 0.12),
    ln('B. Den stiger', 0.12, { bold: true }),
    ln('C. Den er uendret', 0.12),
    ln('D. Det kan vi ikke vite', 0.12),
    ln('Spørsmål 2'),
    ln('Hva er en alternativkostnad?'),
    ln('A. Prisen du betaler', 0.12),
    ln('B. Summen av alle kostnader', 0.12),
    ln('C. Verdien av det beste alternativet du gir opp', 0.12, { bold: true }),
    ln('D. En kostnad som ikke kan unngås', 0.12),
  ];
  y = 0;
  const p2 = [
    ln('DEL 2 – KORTSVAR'),
    ln('Spørsmål 1:'),
    ln('Forklar kort hva en indifferenskurve viser.'),
    ln('Løsningskommentar:'),
    ln('Kurven viser kombinasjoner av to goder som gir samme nytte.'),
    ln('DEL 3 – LANGSVAR'),
    ln('Anta at en bedrift produserer en vare i et marked med frikonkurranse.'),
    ln('a) Forklar hva det betyr at bedriften er pristaker.'),
    ln('Svar: Bedriften kan ikke påvirke prisen og tar markedsprisen for gitt.'),
    ln('b) Hva skjer med tilbudet hvis marginalkostnaden øker?'),
    ln('Svar: Tilbudskurven skifter oppover.'),
  ];
  const pages = [page(1, p1), page(2, p2)];
  assert.ok(looksLikeBi(pages));
  const seg = segmentBi(pages);
  const labels = seg.items.map((i) => i.label);
  assert.deepEqual(labels, ['1.1', '1.2', '2.1', '3a', '3b']);
  const q1 = seg.items[0];
  assert.equal(q1.format, 'flervalg');
  assert.equal(q1.choices.length, 4);
  assert.equal(q1.choices.find((c) => c.correct)?.letter, 'B');
  assert.match(q1.answerBasis ?? '', /Uthevet/);
  assert.equal(seg.items[1].choices.find((c) => c.correct)?.letter, 'C');
  const k = seg.items[2];
  assert.equal(k.format, 'kortsvar');
  assert.match(k.stem, /indifferenskurve/);
  assert.match(k.guide, /samme nytte/);
  assert.doesNotMatch(k.stem, /samme nytte/, 'veiledningen skal ikke lekke inn i oppgaveteksten');
  const a = seg.items[3];
  assert.equal(a.format, 'langsvar');
  assert.match(a.intro, /frikonkurranse/);
  assert.match(a.guide, /markedsprisen/);
});

test('Wiseflow-utskrift lest med OCR: uten «Del 1»-overskrift, fasit fra markering', () => {
  y = 0;
  const opt = (t: string, mark: 'valgt' | 'ikke-valgt') => ln(t, 0.118, { mark });
  const p1 = [
    ln('Oppgavesettet består av 2 flervalgspørsmål med ett riktig svar hver.', 0.09),
    ln('Hva måler konsumprisindeksen?', 0.09),
    opt('A Prisen på aksjer', 'ikke-valgt'),
    opt('B Prisutviklingen for en kurv av varer og tjenester', 'valgt'),
    opt('C Lønnsveksten', 'ikke-valgt'),
    opt('D Renten', 'ikke-valgt'),
    ln('Hvilken påstand er riktig?', 0.09),
    opt('A Påstand en', 'ikke-valgt'),
    opt('B Påstand to', 'ikke-valgt'),
    opt('C Påstand tre', 'ikke-valgt'),
    opt('D Påstand fire', 'valgt'),
  ];
  y = 0;
  const p2 = [ln('Del 2 – Kortsvarsspørsmål'), ln('Spørsmål 1)'), ln('Forklar hva BNP måler.'), ln('Løsningskommentar:'), ln('Verdien av alt som produseres innenlands.'), ln('Del 3 – Langsvar'), ln('a) Forklar inflasjon.')];
  const seg = segmentBi([page(1, p1), page(2, p2)]);
  const del1 = seg.items.filter((i) => i.part === 1);
  assert.equal(del1.length, 2);
  assert.equal(del1[0].choices.find((c) => c.correct)?.letter, 'B');
  assert.equal(del1[1].choices.find((c) => c.correct)?.letter, 'D');
  assert.match(del1[0].answerBasis ?? '', /Wiseflow/);
  assert.match(del1[1].stem, /Hvilken påstand/);
  assert.ok(seg.items.some((i) => i.label === '2.1'));
});

test('fasitliste uten oppgavetekst: svar knyttes til nummer, oppgaven merkes som manglende', () => {
  y = 0;
  const lines = [ln('Sensorveiledning'), ln('Del 1'), ln('Spørsmål 1: B. Fordi prisen stiger.'), ln('Spørsmål 2: D.'), ln('Del 2'), ln('Spørsmål 1'), ln('Et godt svar forklarer at kurven skifter.')];
  const seg = segmentBi([page(1, lines)]);
  const q1 = seg.items.find((i) => i.label === '1.1')!;
  assert.equal(q1.answerLetter, 'B');
  assert.ok(q1.stemMissing);
  const k = seg.items.find((i) => i.label === '2.1')!;
  assert.equal(k.stem, '', 'svaret skal ikke bli oppgavetekst');
  assert.match(k.guide, /skifter/);
});

test('OCR-rester fra markeringen fjernes: strek, hake og feillest «A»', () => {
  const mk = (t: string, x: number, yy: number): OcrLine => ({ t, b: [x, yy, 0.6, 0.015], conf: 90, lowWords: [] });
  const lines = [mk('| Å Metode (2,4). v', 0.091, 0.1), mk('B Metode (5,1).', 0.118, 0.15), mk('C Umulig å si.', 0.118, 0.2), mk('D Begge.', 0.118, 0.25), mk('i Kurven skifter.', 0.116, 0.4), mk('B Kurven er uendret.', 0.118, 0.45)];
  const hints = cleanOptionArtifacts(lines);
  assert.equal(lines[0].t, 'A Metode (2,4).');
  assert.ok(hints.get(lines[0])?.bar && hints.get(lines[0])?.check);
  assert.equal(lines[4].t, 'A Kurven skifter.');
  assert.equal(hints.has(lines[1]), false);
});

test('metadata: termin, pulje og eksamen I/II fra filnavn og tekst', () => {
  assert.match(guessMeta('H24 Pulje 2 - Sensorveiledning.pdf', 'Sensorveiledning\nDEL 1').setLabel ?? '', /Høst 2024.*pulje 2/);
  assert.match(guessMeta('SOK1000_2025-06-10_kl_09.pdf', 'Svar: B').setLabel ?? '', /Vår 2025/);
  assert.equal(guessMeta('fil.pdf', 'Sensorveiledning\nLøsningskommentar: tekst').docType, 'sensorveiledning');
});

test('vurderingsramme fra veiledningstekst: krav, ekstra og typiske feil', () => {
  const r = rubricFromGuide('Svaret må forklare at kurven skifter. Et godt svar viser dette i en figur. Ekstra pluss for å nevne elastisitet. Unngå å blande skift og bevegelse langs kurven.');
  assert.ok(r.length >= 3);
  assert.ok(r.every((x) => x.basis === 'offisielt'));
  assert.ok(r.some((x) => !x.required));
});

test('feillest «A» foran et markert B-alternativ (streken er med i boksen til B)', () => {
  const mk = (t: string, x: number, yy: number): OcrLine => ({ t, b: [x, yy, 0.6, 0.015], conf: 90, lowWords: [] });
  const lines = [mk('Hva uttrykker begrepet?', 0.09, 0.05), mk('A Første alternativ', 0.116, 0.1), mk('B Andre', 0.118, 0.15), mk('C Tredje', 0.118, 0.2), mk('D Fjerde', 0.118, 0.25), mk('Neste spørsmål?', 0.09, 0.3), mk('iN Et svar her.', 0.116, 0.33), mk('| B Et annet svar.', 0.091, 0.36), mk('C Svar tre.', 0.118, 0.43), mk('D Svar fire.', 0.118, 0.48)];
  cleanOptionArtifacts(lines);
  assert.equal(lines[6].t, 'A Et svar her.');
  assert.equal(lines[7].t, 'B Et annet svar.');
});
