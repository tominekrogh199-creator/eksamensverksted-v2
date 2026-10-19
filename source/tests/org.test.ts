// Organisasjonsatferd og ledelse: kunnskapsbasen, gjenkjenning av spørsmål,
// essay-segmentering, flashcard-repetisjon og fargekodene i Lær.
// Alle tekster her er skrevet for testen; ingen er hentet fra eksamensfilene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORG_TOPICS, ORG_MODELS, ORG_MODEL_MAP, ORG_CONCEPT_MAP, ORG_FAMILIES, modelParts } from '../src/families/org';
import { FAMILIES } from '../src/families';
import { SKILL_MAP } from '../src/families/skills';
import { analyzeSubtaskRules, detectDomains } from '../src/analysis/rules';
import { segmentEssay, looksLikeEssay, essaySetSimilarity } from '../src/analysis/segment-essay';
import { generateOne } from '../src/generator/generate';
import { nextState, BOX_DAYS } from '../src/learning/flash';
import { splitMarks } from '../src/ui/components/LessonText';

test('kunnskapsbase: temaer, begreper og modeller henger sammen', () => {
  const ids = new Set<string>();
  for (const t of ORG_TOPICS) {
    assert.ok(!ids.has(t.id), `dobbel id ${t.id}`);
    ids.add(t.id);
    assert.ok(t.intents.length >= 1, `${t.id} mangler spørsmålstyper`);
    assert.ok(t.concepts.length >= 4, `${t.id} har for få begreper`);
    assert.ok(t.structure.length >= 3, `${t.id} mangler svarstruktur`);
    for (const m of t.models) assert.ok(ORG_MODEL_MAP[m], `${t.id} viser til ukjent modell ${m}`);
    for (const it of t.intents) {
      assert.ok(it.keyPoints.length >= 3, `${it.id} har for få nøkkelpunkter`);
      assert.ok(it.outline.length >= 4, `${it.id} har for kort svarskisse`);
    }
    for (const c of t.concepts) {
      assert.ok(c.definition.length > 20 && c.example.length > 20, `${c.id} mangler definisjon eller eksempel`);
      for (const x of c.confuse ?? []) assert.ok(ORG_CONCEPT_MAP[x], `${c.id} forveksles med ukjent ${x}`);
      // Eksempelet brukes i «Eksempel → hvilket begrep?» og skal ikke avsløre svaret.
      assert.ok(!c.example.toLowerCase().includes(c.term.toLowerCase()), `eksempelet for ${c.id} nevner begrepet`);
    }
  }
  for (const m of ORG_MODELS) {
    assert.ok(ORG_TOPICS.some((t) => t.id === m.topic), `${m.id} har ukjent tema`);
    assert.ok(modelParts(m).length >= 2, `${m.id} har for få deler`);
    if (m.kind === 'matrise') {
      assert.ok(m.axes, `${m.id} mangler akser`);
      assert.deepEqual(m.parts.map((p) => p.group).sort(), ['bl', 'br', 'tl', 'tr'], `${m.id} må ha fire kvadranter`);
    }
    if (['kolonner', 'tospor', 'kjede'].includes(m.kind)) for (const p of m.parts) assert.ok(m.groups?.some((g) => g.id === p.group), `${m.id}/${p.id} hører ikke til en gruppe`);
  }
  for (const f of ORG_FAMILIES) for (const k of f.skills) assert.ok(SKILL_MAP[k], `ferdigheten ${k} mangler i registeret`);
});

test('maler: alle ORG-maler gir gyldige oppgaver, flervalg med nøyaktig ett riktig svar', () => {
  for (const f of ORG_FAMILIES)
    for (const t of f.templates)
      for (let seed = 1; seed <= 15; seed++) {
        const g = generateOne('c', f.id, t, seed * 7919);
        assert.equal(g.validation.status, 'gyldig', `${t.id} seed ${seed}`);
        for (const p of g.parts)
          if (p.kind === 'flervalg') {
            assert.equal(p.choices!.filter((c) => c.correct).length, 1, `${t.id}: ett riktig`);
            assert.equal(new Set(p.choices!.map((c) => c.text)).size, p.choices!.length, `${t.id}: ulike alternativer`);
          }
      }
});

const ask = (text: string, domains = ['org']) => analyzeSubtaskRules({ domains, intro: '', priorText: '', text, format: 'langsvar', label: '1', subtaskCount: 1, figurePages: [], extraction: 'tekstlag', source: { docId: 'x', docVersion: 1, pdfPage: 1 } });

test('gjenkjenning: egne formuleringer havner i riktig tema og spørsmålstype', () => {
  const cases: [string, string, string?][] = [
    ['Forklar hva jobbengasjement er, og hvilke forhold på arbeidsplassen som kan øke det.', 'org-engasjement'],
    ['Hvordan bør en bedrift jobbe for å forebygge utbrenthet blant de ansatte?', 'org-stress', 'org-stress.utbrenthet'],
    ['Gjør rede for Scheins nivåer og vis hvordan kulturen i en bedrift kommer til uttrykk.', 'org-kultur'],
    ['Hva kjennetegner transformasjonsledelse, og hvilken effekt har den på medarbeiderne?', 'org-transformasjon'],
    ['Beskriv de kognitive strategiene i selvledelse og hvordan du kan bruke dem når du studerer.', 'org-selvledelse', 'org-selvledelse.kognitiv'],
    ['Drøft hvorfor det fortsatt er få kvinner i toppledelsen.', 'org-kjonn'],
    ['Hva menes med mobbing på arbeidsplassen, og hva kan ledelsen gjøre for å hindre det?', 'org-mobbing'],
    ['Hva menes med destruktiv ledelse, og hvor vanlig er det?', 'org-destruktiv', 'org-destruktiv.utbredelse'],
  ];
  for (const [q, fam, intent] of cases) {
    const r = ask(q);
    assert.equal(r.analysis.familyKbId, fam, q);
    if (intent) assert.equal(r.analysis.intentId, intent, q);
  }
  assert.deepEqual(detectDomains(cases.map((c) => c[0])), ['org']);
});

test('gjenkjenning: samfunnsøkonomi og elektro trekkes ikke over i organisasjonsfaget', () => {
  const sok = ['Finn likevektspris og -kvantum når etterspørselen er Qd = 120 − 2P og tilbudet Qs = 3P.', 'Forklar hvorfor arbeidsgiver betaler en lønn over reservasjonslønnen i arbeidsdisiplinmodellen.', 'Beregn multiplikatoren når den marginale konsumtilbøyeligheten er 0,8.'];
  assert.deepEqual(detectDomains(sok), ['økonomi']);
  const el = ['Finn Thevenin-ekvivalenten sett fra klemmene a–b.', 'Bestem tidskonstanten for RC-kretsen og skriv opp v(t).'];
  assert.deepEqual(detectDomains(el), ['elektro']);
  assert.ok(FAMILIES.some((f) => f.domain === 'org'));
});

const page = (lines: string[]) => [{ pdfPage: 1, text: lines.join('\n') }];

test('essay-segmentering: veiledning med pensum per spørsmål og generelle kriterier', () => {
  const guide = page([
    'Sensorveiledning, testemne',
    'Kriteriene som benyttes i vurderingen:',
    '1. I hvilken grad begrepene er forklart i tråd med pensum.',
    '2. I hvilken grad svaret er strukturert og',
    'sammenhengende.',
    'I tillegg kommer rettskriving og ryddighet.',
    'Relevant pensum til hver av oppgavene:',
    '1. Hva er et godt team, og hva kan lederen gjøre i hver fase av utviklingen?',
    'Relevant pensum: Bok A kap. 3.',
    '2. Hva menes med indre motivasjon? EMS kap. 7 (særlig s. 10-12).',
    '3. Forklar hva tillit er, og hvorfor den er viktig i en organisasjon. Relevant',
    'pensum: Bok A kap. 8.',
  ]);
  assert.ok(looksLikeEssay(guide));
  const s = segmentEssay(guide);
  assert.equal(s.kind, 'veiledning');
  assert.equal(s.items.length, 3);
  assert.match(s.items[0].text, /godt team/);
  assert.doesNotMatch(s.items[0].text, /pensum/i);
  assert.match(s.items[0].guide, /kap\. 3/);
  assert.match(s.items[1].guide, /EMS kap\. 7/, 'henvisning rett etter spørsmålstegnet');
  assert.match(s.items[2].guide, /pensum: Bok A kap\. 8/);
  assert.ok(s.criteria.length >= 2);
  assert.match(s.criteria[1].text, /strukturert og sammenhengende/);
});

test('essay-segmentering: eksamensoppgave, tid, hjelpemidler og nynorsk', () => {
  const exam = segmentEssay(page(['Eksamen i testemne', 'Tre timer til rådighet. Tillatte hjelpemidler: Ingen', 'Alle oppgavene teller likt.', 'Besvar følgende oppgaver:', '1. Hva menes med lederstil?', '2. Hva er stress, og hvordan kan det forebygges?']));
  assert.equal(exam.kind, 'eksamen');
  assert.equal(exam.items.length, 2);
  assert.equal(exam.minutes, 180);
  assert.equal(exam.equalWeight, true);
  assert.equal(exam.language, 'nb');
  const nn = segmentEssay(page(['Svar på følgande oppgåver:', '1. Kva meiner ein med leiarstil?', '2. Kva er stress, og korleis kan det førebyggjast?']));
  assert.equal(nn.language, 'nn');
  assert.ok(essaySetSimilarity(exam.items.map((i) => i.text), exam.items.map((i) => i.text)) > 0.99);
  assert.ok(essaySetSimilarity(exam.items.map((i) => i.text), ['Hva er kreativitet?', 'Hva er byråkrati?']) < 0.3);
});

test('flashcards: Leitner-bokser', () => {
  const now = new Date('2026-03-02T10:00:00Z');
  const day = (n: number) => new Date(now.getTime() + n * 864e5).toISOString().slice(0, 10);
  const a = nextState(undefined, 'kunne', now);
  assert.equal(a.b, 3, 'nytt kort du kan: rett til boks 3');
  assert.equal(a.d, day(BOX_DAYS[3]));
  const b = nextState(a, 'kunne', now);
  assert.equal(b.b, 4);
  assert.equal(b.r, 2);
  const c = nextState(b, 'ikke', now);
  assert.equal(c.b, 1, 'kunne ikke: tilbake til boks 1');
  assert.equal(c.d, day(0), 'kommer igjen i dag');
  assert.equal(c.w, 1);
  const d = nextState(c, 'nesten', now);
  assert.equal(d.b, 2);
  assert.equal(d.d, day(1), 'nesten: i morgen');
  let e = d;
  for (let i = 0; i < 10; i++) e = nextState(e, 'kunne', now);
  assert.equal(e.b, 6, 'høyeste boks');
});

test('fargekoder i Lær: hele teksten beholdes', () => {
  assert.deepEqual(splitMarks('Før {{1:På eksamen}} etter'), [
    { hl: 0, s: 'Før ' },
    { hl: 1, s: 'På eksamen' },
    { hl: 0, s: ' etter' },
  ]);
  assert.deepEqual(splitMarks('{{3:$x^{2}$}}'), [{ hl: 3, s: '$x^{2}$' }]);
  assert.deepEqual(splitMarks('{{5:ikke en kode}}'), [{ hl: 0, s: '{{5:ikke en kode}}' }]);
});
