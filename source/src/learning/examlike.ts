// Eksamensnære oppgaver: nye oppgaver i samme format, på samme nivå og fra de
// samme temaene som studentens egne tidligere eksamener.
//
// Når AI er tilgjengelig, skriver AI en ny oppgave etter mønster av 1–3
// originalspørsmål fra samme tema (med sensorveiledningen). Svaret valideres:
// riktig struktur, ingen ordrett kopiering fra eksamenene, og for flervalg en
// uavhengig kontroll av at nøyaktig ett alternativ er riktig.
// Temaene velges etter hvor ofte de kommer på eksamen (nyere sett teller mer)
// og hvor studenten har slitt.

import type { GeneratedTask, GenPart, SubTask, SourceDoc, SessionRec, Evidence, Course, ExamSim } from '../domain/types';
import { newId, nowIso } from '../domain/types';
import { store } from '../state/store';
import { getFamily, familyShort, domainOf } from '../families';
import { elMath, dec } from '../families/el-common';
import { originalPool } from './originals';
import { skillName } from '../families/skills';
import { aiJson, aiAvailable, asData, DATA_RULE, V } from '../ai/client';

export type ExamLikeFormat = 'flervalg' | 'kortsvar' | 'langsvar' | 'regne';
const FORMATS: ExamLikeFormat[] = ['flervalg', 'kortsvar', 'langsvar', 'regne'];

const LETTERS = 'ABCD';

function docYear(d: SourceDoc | undefined): number {
  return d?.meta.year ?? 0;
}

/** Hvor ofte hvert tema (familie) kommer på eksamenene dine, vektet mot nyere sett og mot det du sliter med. */
export function examTopicWeights(): { kbId: string; weight: number; count: number }[] {
  const pool = originalPool();
  const fromColl = new Set(pool.samling.map((s) => s.id));
  const subs = [...pool.flervalg, ...pool.kortsvar, ...pool.langsvar, ...pool.oppgave, ...pool.samling];
  const years = subs.map((s) => docYear(store.get<SourceDoc>('doc', s.docId))).filter(Boolean);
  const newest = years.length ? Math.max(...years) : 0;
  const m = new Map<string, { weight: number; count: number }>();
  for (const s of subs) {
    const k = s.analysis.familyKbId;
    if (!k || !getFamily(k)) continue;
    const y = docYear(store.get<SourceDoc>('doc', s.docId));
    // Oppgaver fra eksamenssett teller mer enn oppgaver fra en oppgavesamling.
    const w = fromColl.has(s.id) ? 0.4 : 1 + (newest && y && newest - y <= 1 ? 0.5 : 0) + (s.format === 'langsvar' ? 0.3 : 0);
    const cur = m.get(k) ?? { weight: 0, count: 0 };
    m.set(k, { weight: cur.weight + w, count: cur.count + 1 });
  }
  // Tema der studenten nylig har svart feil, får mer vekt.
  const recent = store.evidence().filter((e: Evidence) => !e.voided && Date.now() - Date.parse(e.at) < 30 * 864e5);
  for (const [k, v] of m) {
    const bad = recent.filter((e) => e.familyKbId === k && (e.outcome === 'ikke-riktig' || e.outcome === 'delvis')).length;
    const good = recent.filter((e) => e.familyKbId === k && e.outcome === 'selvstendig-riktig').length;
    m.set(k, { ...v, weight: v.weight * (1 + Math.min(0.6, bad * 0.2)) * (good >= 3 && !bad ? 0.7 : 1) });
  }
  return [...m.entries()].map(([kbId, v]) => ({ kbId, ...v })).sort((a, b) => b.weight - a.weight);
}

/** Andelen av hvert format på eksamenene dine (f.eks. 10 flervalg, 3 kortsvar, 5 langsvar). */
export function examFormatMix(): Record<ExamLikeFormat, number> {
  const n = { flervalg: formatPool('flervalg').length, kortsvar: formatPool('kortsvar').length, langsvar: formatPool('langsvar').length, regne: formatPool('regne').length };
  const sum = n.flervalg + n.kortsvar + n.langsvar + n.regne || 1;
  return { flervalg: n.flervalg / sum, kortsvar: n.kortsvar / sum, langsvar: n.langsvar / sum, regne: n.regne / sum };
}

/** Spørsmålene som kan brukes som mønster for et format. Regneoppgaver må ha tekst og løsningsforslag. */
export function formatPool(format: ExamLikeFormat): SubTask[] {
  const pool = originalPool();
  if (format !== 'regne') return pool[format];
  const usable = (s: SubTask) => (s.text ?? '').trim().length >= 12 && !!s.guide?.text && s.guide.text.trim().length >= 12;
  return [...pool.oppgave.filter(usable), ...pool.samling.filter(usable)];
}

/** Kan appen lage eksamensnære oppgaver i dette faget? (Krever AI og eksempler med tekst og veiledning.) */
export function canMakeExamLike(): boolean {
  if (!aiAvailable()) return false;
  return FORMATS.reduce((n, f) => n + formatPool(f).length, 0) >= 3;
}

function pickWeighted<T extends { weight: number }>(list: T[], exclude: Set<string>, key: (t: T) => string): T | undefined {
  const cand = list.filter((t) => !exclude.has(key(t)));
  const pool = cand.length ? cand : list;
  const sum = pool.reduce((a, t) => a + t.weight, 0);
  let r = Math.random() * sum;
  for (const t of pool) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return pool[0];
}

function pickFormat(kbId: string): ExamLikeFormat {
  const byFam = (f: ExamLikeFormat) => formatPool(f).filter((s) => s.analysis.familyKbId === kbId).length;
  const mix = examFormatMix();
  // Bare formater som faktisk finnes i dette faget.
  const w: [ExamLikeFormat, number][] = FORMATS.filter((f) => mix[f] > 0).map((f) => [f, (byFam(f) + 0.3) * (mix[f] + 0.1)]);
  const sum = w.reduce((a, [, x]) => a + x, 0);
  let r = Math.random() * sum;
  for (const [f, x] of w) {
    r -= x;
    if (r <= 0) return f;
  }
  return w[0]?.[0] ?? 'kortsvar';
}

function hasFormat(kbId: string, format: ExamLikeFormat): boolean {
  return formatPool(format).some((s) => s.analysis.familyKbId === kbId);
}

/** 1–3 originalspørsmål som mønster: samme tema og format først, ellers samme format. */
function examples(kbId: string, format: ExamLikeFormat): SubTask[] {
  const pool = formatPool(format);
  const same = pool.filter((s) => s.analysis.familyKbId === kbId);
  const rest = pool.filter((s) => s.analysis.familyKbId !== kbId);
  const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);
  const withGuide = (a: SubTask[]) => [...a].sort((x, y) => Number(!!y.guide?.text) - Number(!!x.guide?.text));
  // Eksamensoppgaver før oppgavesamling, og oppgaver med avlest sluttsvar først.
  const colls = new Set(originalPool().samling.map((s) => s.id));
  const rank = (a: SubTask[]) => [...a].sort((x, y) => Number(colls.has(x.id)) - Number(colls.has(y.id)) || Number(!!y.answerKeys?.length) - Number(!!x.answerKeys?.length));
  const first = format === 'regne' ? rank(shuffle(same)) : withGuide(shuffle(same));
  return [...first.slice(0, 3), ...shuffle(rest).slice(0, Math.max(0, 2 - same.length))].slice(0, 3);
}

function exampleText(st: SubTask, i: number): string {
  const doc = store.get<SourceDoc>('doc', st.docId);
  const lines = [`Eksempel ${i + 1} (${doc?.meta.docType === 'oppgavesamling' ? 'oppgavesamlingen' : doc?.meta.setLabel ?? 'tidligere eksamen'}, ${st.format}):`];
  if (st.intro) lines.push(`Innledning: ${st.intro.slice(0, 1200)}`);
  lines.push(`Spørsmål: ${st.text.slice(0, 1500)}`);
  if (st.choices?.length) st.choices.forEach((c) => lines.push(`  ${c.letter}) ${c.text}${c.correct ? '   [riktig]' : ''}`));
  if (st.guide?.text) lines.push(`${st.format === 'oppgave' ? 'Løsningsforslag' : 'Sensorveiledning'}: ${st.guide.text.slice(0, 1800)}`);
  if (st.answerKeys?.length) lines.push(`Sluttsvar i løsningsforslaget: ${st.answerKeys.map((k) => k.display).join('; ')}`);
  return asData(`EKSEMPEL-${i + 1}`, lines.join('\n'), 5000);
}

// ——— Kontroll av at oppgaven ikke er kopiert ———

function shingles(t: string, n = 7): Set<string> {
  const w = t.toLowerCase().replace(/[^a-zæøå0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

/** Andelen av den nye teksten som finnes ordrett (7-ordsfølger) i eksemplene. */
export function copiedShare(text: string, sources: string[]): number {
  const a = shingles(text);
  if (!a.size) return 0;
  const b = new Set(sources.flatMap((s) => [...shingles(s)]));
  let hit = 0;
  for (const x of a) if (b.has(x)) hit++;
  return hit / a.size;
}

// ——— Svarformat fra AI ———

interface RawCriterion {
  text: string;
  required: boolean;
}
interface RawMc {
  skills?: string[];
  topic: string;
  stem: string;
  options: string[];
  correct: number;
  explanations: string[];
}
interface RawShort {
  skills?: string[];
  topic: string;
  stem: string;
  wordLimit: number;
  criteria: RawCriterion[];
  modelAnswer: string;
  typicalErrors: string[];
}
interface RawLong {
  skills?: string[];
  topic: string;
  intro: string;
  subs: { stem: string; criteria: RawCriterion[]; modelAnswer: string }[];
}

interface RawAnswer {
  symbol: string;
  label: string;
  value: number;
  unit: string;
  display: string;
}
interface RawRegneSub {
  stem: string;
  answers: RawAnswer[];
  textAnswer: string;
  steps: { text: string; tex: string }[];
  criteria: RawCriterion[];
}
interface RawRegne {
  skills?: string[];
  topic: string;
  intro: string;
  subs: RawRegneSub[];
}

const criteriaOf = (x: unknown): RawCriterion[] =>
  V.arr(x)
    .map((c) => V.obj(c))
    .filter((c): c is Record<string, unknown> => !!c)
    .map((c) => ({ text: V.str(c.text, 400) ?? '', required: c.required !== false }))
    .filter((c) => c.text.trim().length > 5)
    .slice(0, 6);

function formatRules(format: ExamLikeFormat, wordLimit: number): string {
  if (format === 'flervalg')
    return `Format: flervalg som i Del 1. Nøyaktig fire alternativer, og nøyaktig ett er riktig ut fra pensum. De gale alternativene skal være troverdige og bygge på typiske misforståelser (f.eks. skift i kurven vs. bevegelse langs kurven, nominell vs. reell, gjennomsnitt vs. marginal). Spørsmålet kan be om det som er feil hvis eksemplene gjør det. Gi en kort faglig begrunnelse for hvert alternativ.
JSON: {"topic":"tema i 2–5 ord","stem":"spørsmålet","options":["…","…","…","…"],"correct":0,"explanations":["hvorfor A er riktig/feil","…","…","…"]}`;
  if (format === 'kortsvar')
    return `Format: kortsvar som i Del 2. Ett spørsmål som kan besvares godt på høyst ${wordLimit} ord. Gi 3–5 vurderingspunkter i samme stil som sensorveiledningen (marker hvilke som er nødvendige for full uttelling), et modellsvar på 100–${wordLimit} ord slik et toppsvar ser ut, og 1–3 typiske feil.
JSON: {"topic":"…","stem":"…","wordLimit":${wordLimit},"criteria":[{"text":"…","required":true}],"modelAnswer":"…","typicalErrors":["…"]}`;
  if (format === 'regne') return regneRules();
  return `Format: lengre oppgave som i Del 3. En kort innledning/case (3–7 setninger, gjerne med konkrete tall eller en konkret situasjon) og 3–4 delspørsmål som bygger på hverandre slik eksamen gjør (først forklare modell/begrep, så anvende på situasjonen, så drøfte en endring eller et tiltak). For hvert delspørsmål: 2–4 vurderingspunkter i sensorveiledningsstil og et kort modellsvar.
JSON: {"topic":"…","intro":"…","subs":[{"stem":"…","criteria":[{"text":"…","required":true}],"modelAnswer":"…"}]}`;
}

let regneDomain: 'økonomi' | 'elektro' | 'digital' = 'elektro';

function regneRules(): string {
  const what =
    regneDomain === 'digital'
      ? 'Gi alt som trengs i teksten: logiske uttrykk, sannhetstabeller, tilstandsdiagram beskrevet som overgangsliste, tallsystemer osv.'
      : 'Beskriv kretsen fullstendig i tekst, slik at den kan tegnes entydig: alle komponenter med verdier, og hvordan de er koblet (f.eks. «R1 = 2 kΩ i serie med parallellkoblingen av R2 = 3 kΩ og R3 = 6 kΩ, over en ideell spenningskilde på 12 V»). Navngi noder (a, b, …) og referanseretninger når det trengs.';
  return `Format: regneoppgave som i eksamenssettet (løsningsforslaget viser hva som forventes). En kort innledning som beskriver situasjonen, og 1–3 delspørsmål som bygger på hverandre slik eksamen gjør.
${what}
Bruk «pene» tall slik eksamen gjør, slik at svarene kan regnes for hånd. For hvert delspørsmål:
- "answers": tallsvarene som skal sjekkes, hver med symbol (bokstaver og tall, f.eks. RT, I1, U2, Vth, tau), "value" som tall i SI-grunnenhet UTEN prefiks (2,5 mA skrives 0.0025; 4,7 kΩ skrives 4700), "unit" (grunnenheten, f.eks. A, V, Ω, W, s, F, H, Hz) og "display" slik det står i et løsningsforslag (f.eks. "I1 = 2,5 mA").
- Har delspørsmålet ikke et tallsvar (f.eks. et logisk uttrykk, en tabell eller en tegning beskrevet i ord), la "answers" være tom og skriv svaret i "textAnswer".
- "steps": løsningsforslaget steg for steg med mellomregning ("text" forklarer steget, "tex" er regningen i LaTeX).
- "criteria": 2–3 vurderingspunkter slik sensor ville gitt poeng (metode, mellomresultat, sluttsvar med enhet).
JSON: {"topic":"…","intro":"…","subs":[{"stem":"…","answers":[{"symbol":"RT","value":4700,"unit":"Ω","display":"RT = 4,7 kΩ"}],"textAnswer":"","steps":[{"text":"…","tex":"…"}],"criteria":[{"text":"…","required":true}]}]}`;
}

function buildPrompt(course: string, kbId: string, format: ExamLikeFormat, ex: SubTask[], avoid: string[], wordLimit: number): string {
  const fam = getFamily(kbId);
  return `${DATA_RULE}

Du er en erfaren eksamensforfatter i faget «${course}». Lag ÉN ny eksamensoppgave som kunne stått på studentens neste eksamen.
Tema: ${fam?.name ?? kbId}${fam ? ` – ${fam.description}` : ''}.
Krav:
- Samme format, vanskelighetsgrad, stil og pensum som eksemplene fra studentens tidligere eksamener (under). Test de samme ferdighetene som sensor ser etter.
- Ny situasjon, nye tall og ny vinkling. Ikke kopier setninger eller tall fra eksemplene; skriv med egne ord.
- Faglig korrekt etter standard lærebokpensum for faget. Ingen figurer: trengs en figur, beskriv den kort i teksten.
- Norsk bokmål, klart og presist eksamensspråk.
${avoid.length ? `- Ikke lag noe som ligner disse nylig brukte oppgavene: ${avoid.map((a) => `«${a.slice(0, 120)}»`).join('; ')}` : ''}
${fam?.skills.length ? `Ferdighetene i temaet (velg 1–3 som oppgaven faktisk tester, og legg id-ene i "skills" i JSON-svaret): ${fam.skills.map((k) => `${k} = ${skillName(k)}`).join('; ')}.` : ''}
${formatRules(format, wordLimit)}

${ex.map(exampleText).join('\n\n')}

Svar bare med JSON.`;
}

export function validateMc(x: unknown): RawMc | string {
  const o = V.obj(x);
  const stem = V.str(o?.stem, 1500)?.trim() ?? '';
  const options = V.strs(o?.options, 6, 400).map((s) => s.replace(/^[A-Da-d][).]\s*/, '').trim());
  const correct = V.num(o?.correct);
  const explanations = V.strs(o?.explanations, 6, 500);
  if (stem.length < 15) return 'mangler spørsmål';
  if (options.length !== 4 || new Set(options.map((s) => s.toLowerCase())).size !== 4) return 'trenger fire ulike alternativer';
  if (correct === null || correct < 0 || correct > 3 || !Number.isInteger(correct)) return 'ugyldig fasit';
  return { topic: V.str(o?.topic, 80) ?? '', stem, options, correct, explanations, skills: V.strs(o?.skills, 4, 60) };
}

function validateShort(x: unknown): RawShort | string {
  const o = V.obj(x);
  const stem = V.str(o?.stem, 2000)?.trim() ?? '';
  const criteria = criteriaOf(o?.criteria);
  const modelAnswer = V.str(o?.modelAnswer, 3000)?.trim() ?? '';
  if (stem.length < 15) return 'mangler spørsmål';
  if (criteria.length < 2) return 'for få vurderingspunkter';
  if (modelAnswer.length < 60) return 'mangler modellsvar';
  return { topic: V.str(o?.topic, 80) ?? '', stem, wordLimit: Math.min(400, Math.max(80, V.num(o?.wordLimit) ?? 200)), criteria, modelAnswer, typicalErrors: V.strs(o?.typicalErrors, 4, 300), skills: V.strs(o?.skills, 4, 60) };
}

function validateLong(x: unknown): RawLong | string {
  const o = V.obj(x);
  const intro = V.str(o?.intro, 3000)?.trim() ?? '';
  const subs = V.arr(o?.subs)
    .map((s) => V.obj(s))
    .filter((s): s is Record<string, unknown> => !!s)
    .map((s) => ({ stem: V.str(s.stem, 1500)?.trim() ?? '', criteria: criteriaOf(s.criteria), modelAnswer: V.str(s.modelAnswer, 2500)?.trim() ?? '' }))
    .filter((s) => s.stem.length > 10 && s.criteria.length >= 1)
    .slice(0, 5);
  if (intro.length < 40) return 'mangler innledning';
  if (subs.length < 2) return 'for få delspørsmål';
  return { topic: V.str(o?.topic, 80) ?? '', intro, subs };
}

const PREFIX: Record<string, number> = { G: 1e9, M: 1e6, k: 1e3, m: 1e-3, µ: 1e-6, μ: 1e-6, u: 1e-6, n: 1e-9, p: 1e-12 };

/** Tallet i en visning som «I1 = 2,5 mA», i grunnenhet. */
export function displayValue(display: string): number | null {
  const m = /=\s*(-?\d[\d\s]*(?:[.,]\d+)?(?:\s*[·x×*]\s*10\^?\s*\{?(-?\d+)\}?)?)\s*([GMkmµμunp])?\s*(Ω|ohm|VA|var|Hz|V|A|W|F|H|s|S)?(?![A-Za-z])/.exec(display.replace(/−/g, '-'));
  if (!m) return null;
  const base = parseFloat(m[1].replace(/[·x×*].*$/, '').replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(base)) return null;
  const exp = m[2] ? Math.pow(10, Number(m[2])) : 1;
  const pre = m[3] && m[4] ? PREFIX[m[3]] ?? 1 : 1;
  return base * exp * pre;
}

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(Math.abs(b) * 0.02, 1e-12);
const symOk = (x: string) => x.replace(/[^A-Za-z0-9_]/g, '').replace(/^_+/, '');

export function validateRegne(x: unknown): RawRegne | string {
  const o = V.obj(x);
  const intro = V.str(o?.intro, 3000)?.trim() ?? '';
  const subs: RawRegneSub[] = V.arr(o?.subs)
    .map((s) => V.obj(s))
    .filter((s): s is Record<string, unknown> => !!s)
    .map((s) => {
      const answers: RawAnswer[] = V.arr(s.answers)
        .map((a) => V.obj(a))
        .filter((a): a is Record<string, unknown> => !!a)
        .map((a) => {
          const display = V.str(a.display, 120)?.trim() ?? '';
          let value = V.num(a.value);
          // Står det «2,5 mA» i visningen, men 2.5 i verdien, er prefikset glemt: bruk visningen.
          const dv = display ? displayValue(display) : null;
          if (value !== null && dv !== null && !near(value, dv)) value = dv;
          if (value === null) value = dv;
          return { symbol: symOk(V.str(a.symbol, 20) ?? ''), label: display.split('=')[0].trim() || (V.str(a.symbol, 20) ?? ''), value: value ?? NaN, unit: V.str(a.unit, 12)?.trim() ?? '', display };
        })
        .filter((a) => a.symbol && Number.isFinite(a.value))
        .slice(0, 4);
      const steps = V.arr(s.steps)
        .map((st) => V.obj(st))
        .filter((st): st is Record<string, unknown> => !!st)
        .map((st) => ({ text: V.str(st.text, 600)?.trim() ?? '', tex: V.str(st.tex, 400)?.trim() ?? '' }))
        .filter((st) => st.text || st.tex)
        .slice(0, 10);
      return { stem: V.str(s.stem, 1500)?.trim() ?? '', answers, textAnswer: V.str(s.textAnswer, 1500)?.trim() ?? '', steps, criteria: criteriaOf(s.criteria) };
    })
    .filter((s) => s.stem.length > 8 && (s.answers.length || s.textAnswer) && s.steps.length)
    .slice(0, 4);
  if (intro.length < 30) return 'mangler beskrivelse av oppgaven';
  if (!subs.length) return 'mangler delspørsmål med svar og løsning';
  if (new Set(subs.flatMap((s) => s.answers.map((a) => a.symbol))).size !== subs.flatMap((s) => s.answers).length) return 'samme symbol brukt for flere svar';
  return { topic: V.str(o?.topic, 80) ?? '', intro, subs, skills: V.strs(o?.skills, 4, 60) };
}

/** Uavhengig utregning av en regneoppgave: løses uten fasit, og tallsvarene må stemme (±2 %). */
async function verifyRegne(course: string, r: RawRegne): Promise<boolean> {
  const syms = r.subs.map((s, i) => `${'abcd'[i]}) ${s.answers.map((a) => a.symbol).join(', ') || '(tekstsvar)'}`).join('; ');
  const texts = r.subs.map((s, i) => (s.textAnswer ? `${'abcd'[i]}) ${s.textAnswer}` : '')).filter(Boolean);
  const prompt = `${DATA_RULE}
Du er sensor i «${course}». Løs oppgaven nøye på egen hånd, steg for steg i hodet, uten hjelp. Oppgi tallsvarene i SI-grunnenhet uten prefiks (2,5 mA = 0.0025).
${asData('OPPGAVE', `${r.intro}\n${r.subs.map((s, i) => `${'abcd'[i]}) ${s.stem}`).join('\n')}`, 6000)}
Symbolene som skal oppgis: ${syms}.
${texts.length ? `For delspørsmålene med tekstsvar: er dette forslaget faglig riktig? ${asData('FORSLAG', texts.join('\n'), 3000)}` : ''}
Si også fra om oppgaven er uklar eller mangler opplysninger.
Svar bare med JSON: {"answers":[{"symbol":"RT","value":4700}],"textAnswersCorrect":true,"wellPosed":true,"note":"kort"}`;
  const res = await aiJson(prompt, (x) => {
    const o = V.obj(x);
    const answers = V.arr(o?.answers)
      .map((a) => V.obj(a))
      .filter((a): a is Record<string, unknown> => !!a)
      .map((a) => ({ symbol: symOk(V.str(a.symbol, 20) ?? '').toLowerCase().replace(/_/g, ''), value: V.num(a.value) }));
    return { answers, texts: o?.textAnswersCorrect !== false, wellPosed: o?.wellPosed !== false };
  }, { tier: 'complex', cache: false });
  if (!res.ok || !res.data.wellPosed || !res.data.texts) return false;
  for (const a of r.subs.flatMap((s) => s.answers)) {
    const v = res.data.answers.find((x) => x.symbol === a.symbol.toLowerCase().replace(/_/g, ''))?.value;
    if (v === null || v === undefined || !near(v, a.value)) return false;
  }
  return true;
}

/** Uavhengig kontroll av et flervalgsspørsmål: løses uten å vite fasiten. */
async function verifyMc(course: string, mc: RawMc): Promise<boolean> {
  const prompt = `${DATA_RULE}
Du er sensor i «${course}». Løs flervalgsspørsmålet etter standard pensum, uten hjelp. Avgjør også om nøyaktig ett alternativ er riktig.
${asData('SPØRSMÅL', `${mc.stem}\n${mc.options.map((o, i) => `${LETTERS[i]}) ${o}`).join('\n')}`, 4000)}
Svar bare med JSON: {"answer":"A","exactlyOne":true,"note":"kort begrunnelse"}`;
  const r = await aiJson(prompt, (x) => {
    const o = V.obj(x);
    const a = (V.str(o?.answer, 3) ?? '').trim().toUpperCase().charAt(0);
    if (!LETTERS.includes(a) || !a) return 'mangler svar';
    return { answer: LETTERS.indexOf(a), exactlyOne: o?.exactlyOne !== false };
  }, { tier: 'default', cache: false });
  return r.ok && r.data.exactlyOne && r.data.answer === mc.correct;
}

function rubricOf(criteria: RawCriterion[]) {
  const req = criteria.some((c) => c.required) ? criteria : criteria.map((c, i) => ({ ...c, required: i < 2 }));
  return req.map((c, i) => ({ id: `k${i + 1}`, text: c.text, basis: 'faglig-tolkning' as const, required: c.required }));
}

function baseTask(courseId: string, kbId: string, title: string, intro: string, parts: GenPart[], ex: SubTask[], checks: { name: string; ok: boolean; detail: string }[], minutes: number): GeneratedTask {
  const now = nowIso();
  const fam = getFamily(kbId);
  return {
    id: newId('gen'),
    kind: 'gen',
    courseId,
    createdAt: now,
    updatedAt: now,
    familyKbId: kbId,
    templateId: 'ai-eksamen',
    templateVersion: 1,
    level: 3,
    style: 'standard',
    params: {},
    seed: 0,
    title,
    intro,
    context: 'ai-eksamen',
    parts,
    skills: [...new Set(parts.flatMap((p) => p.skills))],
    structureKey: `ai-eksamen|${kbId}|${parts.map((p) => p.kind).join('+')}`,
    sourceRefs: { familyId: store.families().find((f) => f.kbId === kbId)?.id, subtaskIds: ex.map((s) => s.id) },
    validation: { status: 'gyldig', checks },
    wording: 'ai-formulert',
    estMinutes: minutes,
    sourceKind: 'eksamen',
    ...(fam ? {} : {}),
  };
}

export interface ExamLikeResult {
  task?: GeneratedTask;
  error?: string;
}

/** Lager én eksamensnær oppgave. Prøver på nytt (høyst to ganger) hvis kontrollene stopper den. */
export async function generateExamLike(opts: { kbId?: string; format?: ExamLikeFormat; avoid?: string[] } = {}): Promise<ExamLikeResult> {
  if (!aiAvailable()) return { error: 'Eksamensnære oppgaver krever AI, som ikke er tilgjengelig i denne visningen.' };
  const course = store.course();
  if (!course) return { error: 'Velg et fag først.' };
  const weights = examTopicWeights();
  const kbId = opts.kbId ?? pickWeighted(weights, new Set(), (w) => w.kbId)?.kbId;
  if (!kbId) return { error: 'Fant ingen analyserte eksamensoppgaver å bygge på.' };
  const format = opts.format ?? pickFormat(kbId);
  const ex = examples(kbId, format);
  if (!ex.length) return { error: 'Fant ingen eksempler i dette formatet.' };
  const limitM = /(\d{2,4})\s*ord/i.exec(ex.map((e) => `${e.intro ?? ''} ${e.text}`).join(' '));
  const wordLimit = limitM ? Math.min(400, Math.max(80, Number(limitM[1]))) : 200;
  const fam = getFamily(kbId);
  // Ferdighetene oppgaven tester, valgt av AI blant temaets ferdigheter (ellers bare den første).
  let skills = fam?.skills.slice(0, 1) ?? [];
  const pick = (chosen?: string[]) => {
    const ok = (chosen ?? []).filter((k) => fam?.skills.includes(k));
    skills = ok.length ? ok.slice(0, 3) : fam?.skills.slice(0, 1) ?? [];
  };
  const exTexts = ex.flatMap((e) => [e.intro ?? '', e.text, e.guide?.text ?? '', ...(e.choices ?? []).map((c) => c.text)]);
  let lastErr = '';
  regneDomain = domainOf(fam);
  for (let attempt = 0; attempt < 3; attempt++) {
    const prompt = buildPrompt(course.name, kbId, format, ex, opts.avoid ?? [], wordLimit);
    const famName = fam?.shortName ?? 'Eksamensnær oppgave';
    if (format === 'flervalg') {
      const r = await aiJson(prompt, validateMc, { tier: 'complex', cache: false });
      if (!r.ok) {
        lastErr = r.message;
        if (!RETRYABLE.includes(r.code)) break;
        continue;
      }
      const mc = r.data;
      pick(mc.skills);
      const copied = copiedShare(`${mc.stem} ${mc.options.join(' ')}`, exTexts);
      if (copied > 0.2) {
        lastErr = 'for likt en tidligere eksamensoppgave';
        continue;
      }
      if (!(await verifyMc(course.name, mc))) {
        lastErr = 'fasiten ble ikke bekreftet av kontrollen';
        continue;
      }
      // Modellen legger ofte riktig svar først. Stokk alternativene (med forklaringene).
      const order = [0, 1, 2, 3].slice(0, mc.options.length).sort(() => Math.random() - 0.5);
      const fixLast = mc.options.findIndex((o) => /\b(alle|ingen) av (de|alternativene)/i.test(o));
      if (fixLast >= 0) order.splice(order.indexOf(fixLast), 1), order.push(fixLast);
      const shuffled = { ...mc, options: order.map((k) => mc.options[k]), explanations: order.map((k) => (mc.explanations[k] ?? '').replace(/\b(alternativ|svar) [A-D]\b/g, 'dette alternativet')), correct: order.indexOf(mc.correct) };
      Object.assign(mc, shuffled);
      const part: GenPart = {
        id: 'a',
        label: 'a',
        prompt: mc.stem,
        kind: 'flervalg',
        skills,
        answerSource: 'Fasit laget av AI og bekreftet av en uavhengig kontroll. Er du uenig, si fra til læreren.',
        choices: mc.options.map((t, i) => ({ id: LETTERS[i], text: t, correct: i === mc.correct, why: mc.explanations[i] ?? (i === mc.correct ? 'Riktig.' : `Riktig svar er ${LETTERS[mc.correct]}.`) })),
        solution: [{ tex: '', text: `Riktig svar: ${LETTERS[mc.correct]}) ${mc.options[mc.correct]}`, why: mc.explanations[mc.correct] ?? '', kind: 'tolkning' }],
        hints: { small: familyShort(fam).text, firstStep: 'Gå gjennom alternativene ett for ett og stryk dem som blander sammen begreper.', stepExplanation: familyShort(fam).text, workedExample: { intro: '', steps: [] } },
        methodCheckpoints: [],
      };
      return { task: baseTask(course.id, kbId, `Eksamensnær · ${famName} · flervalg`, '', [part], ex, checks(copied, true), 2) };
    }
    if (format === 'kortsvar') {
      const r = await aiJson(prompt, validateShort, { tier: 'complex', cache: false });
      if (!r.ok) {
        lastErr = r.message;
        if (!RETRYABLE.includes(r.code)) break;
        continue;
      }
      const k = r.data;
      pick(k.skills);
      const copied = copiedShare(`${k.stem} ${k.modelAnswer}`, exTexts);
      if (copied > 0.2) {
        lastErr = 'for likt en tidligere eksamensoppgave';
        continue;
      }
      const part: GenPart = {
        id: 'a',
        label: 'a',
        prompt: `${k.stem}\n\n(Høyst ${k.wordLimit} ord.)`,
        kind: 'forklaring',
        skills,
        rubric: rubricOf(k.criteria),
        solution: [{ tex: '', text: 'Modellsvar', why: k.modelAnswer, kind: 'tolkning' }, ...k.typicalErrors.map((t) => ({ tex: '', text: `Typisk feil: ${t}`, why: '', kind: 'tolkning' as const }))],
        hints: { small: familyShort(fam).text, firstStep: k.criteria[0] ? `Start med: ${k.criteria[0].text}` : '', stepExplanation: '', workedExample: { intro: '', steps: [] } },
        methodCheckpoints: [{ id: 'forklaring', label: 'Dekket vurderingspunktene', skill: skills[0] ?? 'ukjent', detect: { type: 'forklaring' }, required: true }],
        modelAnswer: k.modelAnswer,
      };
      return { task: baseTask(course.id, kbId, `Eksamensnær · ${famName} · kortsvar`, '', [part], ex, checks(copied, false), 8) };
    }
    if (format === 'regne') {
      const r = await aiJson(prompt, validateRegne, { tier: 'complex', cache: false });
      if (!r.ok) {
        lastErr = r.message;
        if (!RETRYABLE.includes(r.code)) break;
        continue;
      }
      const R = r.data;
      pick(R.skills);
      const copied = copiedShare(`${R.intro} ${R.subs.map((x) => x.stem).join(' ')}`, exTexts);
      if (copied > 0.2) {
        lastErr = 'for likt en tidligere eksamensoppgave';
        continue;
      }
      if (!(await verifyRegne(course.name, R))) {
        lastErr = 'svarene ble ikke bekreftet av en uavhengig utregning';
        continue;
      }
      const hints = (first: string) => ({ small: fam ? `${fam.shortName}: ${familyShort(fam).text}` : 'Skriv opp det du vet, og hva du skal finne.', firstStep: first || (fam?.solutionStructure.length ? `Typisk fremgang: ${fam.solutionStructure.join(' → ')}.` : ''), stepExplanation: '', workedExample: { intro: '', steps: [] } });
      const parts: GenPart[] = R.subs.map((x, i) => {
        const solution = x.steps.map((st) => ({ tex: st.tex, text: st.text, why: '', kind: 'innsetting' as const }));
        const base = { id: 'abcd'[i], label: 'abcd'[i], prompt: x.stem, skills, solution, hints: hints(''), methodCheckpoints: [] };
        if (x.answers.length)
          return {
            ...base,
            kind: 'beregning' as const,
            answerSource: 'Fasit laget av AI og bekreftet av en uavhengig utregning (±2 %). Er du uenig, si fra til læreren.',
            math: elMath(x.answers.map((a) => a.symbol)),
            targets: x.answers.map((a) => ({ symbol: a.symbol, label: a.label || a.symbol, value: dec(a.value), unit: a.unit || undefined, aliases: [a.symbol.toLowerCase(), a.symbol.replace(/_/g, '')], tolerance: dec(Math.max(Math.abs(a.value) * 0.02, 1e-12)) })),
            modelAnswer: [...x.steps.map((st) => `${st.text}${st.tex ? ` $${st.tex}$` : ''}`), `Svar: ${x.answers.map((a) => a.display || `${a.symbol} = ${a.value} ${a.unit}`).join(', ')}`].join('\n'),
          };
        return {
          ...base,
          kind: 'forklaring' as const,
          math: elMath([]),
          rubric: rubricOf(x.criteria.length ? x.criteria : [{ text: 'Riktig metode med mellomregning', required: true }, { text: `Riktig svar: ${x.textAnswer}`, required: true }]),
          modelAnswer: [...x.steps.map((st) => `${st.text}${st.tex ? ` $${st.tex}$` : ''}`), `Svar: ${x.textAnswer}`].join('\n'),
          methodCheckpoints: [{ id: 'forklaring', label: 'Riktig løsning', skill: skills[0] ?? 'ukjent', detect: { type: 'forklaring' as const }, required: true }],
        };
      });
      const numeric = R.subs.some((x) => x.answers.length);
      return { task: baseTask(course.id, kbId, `Eksamensnær · ${famName} · regneoppgave`, R.intro, parts, ex, regneChecks(copied, numeric), 7 * parts.length) };
    }
    const r = await aiJson(prompt, validateLong, { tier: 'complex', cache: false });
    if (!r.ok) {
      lastErr = r.message;
      if (!RETRYABLE.includes(r.code)) break;
      continue;
    }
    const L = r.data;
    pick(L.skills);
    const copied = copiedShare(`${L.intro} ${L.subs.map((s) => s.stem).join(' ')}`, exTexts);
    if (copied > 0.2) {
      lastErr = 'for likt en tidligere eksamensoppgave';
      continue;
    }
    const parts: GenPart[] = L.subs.map((s, i) => ({
      id: 'abcde'[i],
      label: 'abcde'[i],
      prompt: s.stem,
      kind: 'forklaring',
      skills,
      rubric: rubricOf(s.criteria),
      solution: [{ tex: '', text: 'Modellsvar', why: s.modelAnswer, kind: 'tolkning' }],
      hints: { small: familyShort(fam).text, firstStep: s.criteria[0] ? `Start med: ${s.criteria[0].text}` : '', stepExplanation: '', workedExample: { intro: '', steps: [] } },
      methodCheckpoints: [{ id: 'forklaring', label: 'Dekket vurderingspunktene', skill: skills[0] ?? 'ukjent', detect: { type: 'forklaring' }, required: true }],
      modelAnswer: s.modelAnswer,
    }));
    return { task: baseTask(course.id, kbId, `Eksamensnær · ${famName} · lengre oppgave`, L.intro, parts, ex, checks(copied, false), 6 * parts.length) };
  }
  return { error: `Klarte ikke å lage en god oppgave akkurat nå (${lastErr || 'ukjent feil'}). Prøv igjen.` };
}

function regneChecks(copied: number, numeric: boolean) {
  return [
    { name: 'Bygget på eksamenene dine', ok: true, detail: 'Temaet, typen og nivået er hentet fra oppgaver i eksamenssettene og løsningsforslagene dine.' },
    { name: 'Ikke kopiert', ok: copied <= 0.2, detail: `${Math.round(copied * 100)} % av teksten finnes ordrett i eksemplene (grense 20 %).` },
    { name: 'Fasit kontrollert', ok: true, detail: numeric ? 'Et uavhengig AI-kall regnet oppgaven uten fasit og fikk de samme tallsvarene (innenfor 2 %). Svarene dine sjekkes med matematikkmotoren.' : 'Et uavhengig AI-kall godkjente svaret. Svar uten tall vurderes mot løsningen, ikke av matematikkmotoren.' },
  ];
}

function checks(copied: number, mc: boolean) {
  return [
    { name: 'Bygget på eksamenene dine', ok: true, detail: 'Formatet, temaet og nivået er hentet fra spørsmål i dine tidligere eksamener og sensorveiledninger.' },
    { name: 'Ikke kopiert', ok: copied <= 0.2, detail: `${Math.round(copied * 100)} % av teksten finnes ordrett i eksemplene (grense 20 %).` },
    ...(mc ? [{ name: 'Fasit kontrollert', ok: true, detail: 'Et uavhengig AI-kall løste spørsmålet uten fasit og kom til samme svar, med nøyaktig ett riktig alternativ.' }] : [{ name: 'Vurderingsramme', ok: true, detail: 'Vurderingspunktene og modellsvaret er laget av AI etter mønster av sensorveiledningen. Vurderingen er foreløpig, ikke offisiell.' }]),
  ];
}

// ——— Økter med eksamensnære oppgaver ———

/** Feil der et nytt forsøk kan lykkes (ugyldig svar fra modellen, travelt). */
const RETRYABLE = ['validation', 'invalid_json', 'empty_completion', 'upstream_error', 'rate_limited', 'timeout'];

const generating = new Map<string, Promise<void>>();
const stopped = new Set<string>();
/** Stopper bakgrunnsgenereringen for en økt (studenten forlot den). */
export function stopGeneration(sessionId: string) {
  if (generating.has(sessionId)) stopped.add(sessionId);
}

/** Venter på at en bakgrunnsgenerering for økten er ferdig (brukes når studenten er på siste oppgave). */
export function pendingGeneration(sessionId: string): Promise<void> | undefined {
  return generating.get(sessionId);
}

/**
 * Lager en økt med eksamensnære oppgaver. Den første oppgaven lages før økten
 * starter; resten lages i bakgrunnen og legges til i økten etter hvert.
 */
export async function startExamLikeSession(count: number, onProgress?: (note: string) => void, format?: ExamLikeFormat, kbIds?: string[]): Promise<{ session?: SessionRec; first?: GeneratedTask; error?: string }> {
  const course = store.course() as Course | undefined;
  if (!course) return { error: 'Velg et fag først.' };
  const all = examTopicWeights().filter((w) => !kbIds?.length || kbIds.includes(w.kbId));
  const weights = format ? all.filter((w) => hasFormat(w.kbId, format)).concat(all.filter((w) => !hasFormat(w.kbId, format)).map((w) => ({ ...w, weight: w.weight * 0.2 }))) : all;
  if (!weights.length) return { error: 'Fant ingen analyserte eksamensoppgaver å bygge på.' };
  // Velg temaer etter vekt, uten å gjenta samme tema to ganger på rad.
  const plan: string[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    const w = pickWeighted(weights, used, (x) => x.kbId);
    if (!w) break;
    plan.push(w.kbId);
    used.add(w.kbId);
    if (used.size >= Math.min(weights.length, 4)) used.clear();
  }
  const recent = store
    .gens()
    .filter((g) => g.templateId === 'ai-eksamen')
    .slice(-12)
    .map((g) => g.parts[0]?.prompt ?? g.intro);
  onProgress?.(`Lager oppgave 1 av ${plan.length} …`);
  let first: GeneratedTask | undefined;
  let firstErr = '';
  let i = 0;
  for (; i < plan.length && !first; i++) {
    const r = await generateExamLike({ kbId: plan[i], avoid: recent, format });
    if (r.task) first = r.task;
    else firstErr = r.error ?? '';
  }
  if (!first) return { error: firstErr || 'Klarte ikke å lage oppgaver akkurat nå.' };
  store.upsert(first);
  const now = nowIso();
  const session: SessionRec = {
    id: newId('okt'),
    kind: 'session',
    courseId: course.id,
    createdAt: now,
    updatedAt: now,
    type: 'eksamensnær',
    startedAt: now,
    plan: { taskIds: [first.id], families: [...new Set(plan)], targetCount: plan.length - (i - 1), reason: 'Nye oppgaver i samme format, fra de samme temaene og på samme nivå som eksamenene dine. Temaer som kommer ofte, og temaer du har slitt med, kommer oftere.' },
    currentIndex: 0,
  };
  store.upsert(session);
  // Resten i bakgrunnen.
  const rest = plan.slice(i);
  if (rest.length) {
    const key = `gen-${session.id}`;
    store.setBusy(key, 'Lager flere eksamensnære oppgaver …');
    const p = (async () => {
      const avoid = [...recent, first!.parts[0]?.prompt ?? first!.intro];
      for (const kb of rest) {
        if (stopped.has(session.id)) break;
        const r = await generateExamLike({ kbId: kb, avoid, format });
        if (stopped.has(session.id)) break;
        if (!r.task) continue;
        store.upsert(r.task);
        avoid.push(r.task.parts[0]?.prompt ?? r.task.intro);
        const s = store.get<SessionRec>('session', session.id);
        if (!s || s.endedAt) break;
        store.upsert({ ...s, plan: { ...s.plan, taskIds: [...s.plan.taskIds, r.task.id] } });
      }
    })().finally(() => {
      store.setBusy(key, null);
      generating.delete(session.id);
      stopped.delete(session.id);
      // Planen krymper til det som faktisk ble laget, så telleren ikke lover flere oppgaver.
      const s = store.get<SessionRec>('session', session.id);
      if (s && s.plan.targetCount && s.plan.targetCount > s.plan.taskIds.length) store.upsert({ ...s, plan: { ...s.plan, targetCount: s.plan.taskIds.length } });
    });
    generating.set(session.id, p);
  }
  return { session, first };
}

/** En ny eksamensnær oppgave i samme tema og format som en oppgave studenten nettopp har jobbet med. */
export async function similarExamLike(task: GeneratedTask): Promise<ExamLikeResult> {
  const part = task.parts[0];
  const st = task.templateId === 'original' ? store.get<SubTask>('subtask', task.sourceRefs.subtaskIds[0]) : undefined;
  let format: ExamLikeFormat | undefined;
  if (st) format = st.format === 'flervalg' || st.format === 'kortsvar' || st.format === 'langsvar' ? st.format : st.format === 'oppgave' ? 'regne' : undefined;
  else if (task.title.endsWith('regneoppgave') || task.parts.some((p) => p.kind === 'beregning')) format = 'regne';
  else format = part?.kind === 'flervalg' ? 'flervalg' : task.parts.length > 1 && part?.kind === 'forklaring' ? 'langsvar' : part?.kind === 'forklaring' ? 'kortsvar' : undefined;
  if (!format) return { error: 'Lignende eksamensoppgaver lages for tekst-, flervalgs- og regneoppgaver.' };
  if (!formatPool(format).length) return { error: 'Fant ingen eksamensoppgaver i dette formatet å bygge på.' };
  const r = await generateExamLike({ kbId: task.familyKbId, format, avoid: [part?.prompt ?? task.intro] });
  if (r.task) store.upsert(r.task);
  return r;
}

// ——— Prøveeksamen med nye eksamensnære oppgaver ———

/** Sammensetningen av det nyeste eksamenssettet (antall spørsmål per format). */
export function latestSetMix(): Record<ExamLikeFormat, number> {
  const pool = originalPool();
  const all = [...pool.flervalg, ...pool.kortsvar, ...pool.langsvar, ...pool.oppgave];
  const byDoc = new Map<string, SubTask[]>();
  for (const s of all) byDoc.set(s.docId, [...(byDoc.get(s.docId) ?? []), s]);
  const docs = [...byDoc.keys()].map((id) => store.get<SourceDoc>('doc', id)).filter((d): d is SourceDoc => !!d);
  const latest = docs.sort((a, b) => docYear(b) - docYear(a) || b.createdAt.localeCompare(a.createdAt))[0];
  const subs = latest ? byDoc.get(latest.id) ?? [] : all;
  return {
    flervalg: subs.filter((s) => pool.flervalg.includes(s)).length,
    kortsvar: subs.filter((s) => pool.kortsvar.includes(s)).length,
    // En lengre oppgave består av flere delspørsmål; tell oppgaver, ikke delspørsmål.
    langsvar: new Set(subs.filter((s) => pool.langsvar.includes(s)).map((s) => `${s.part ?? ''}-${s.taskNo ?? s.label.replace(/[a-h]$/, '')}`)).size,
    regne: subs.filter((s) => pool.oppgave.includes(s)).length,
  };
}

/** Planen for en kortere prøve i samme format som det nyeste settet (omtrent halvparten). */
export function examLikePlan(): { format: ExamLikeFormat; count: number }[] {
  const mix = latestSetMix();
  const avail = (f: ExamLikeFormat) => formatPool(f).length > 0;
  const plan: { format: ExamLikeFormat; count: number }[] = [];
  if (mix.flervalg && avail('flervalg')) plan.push({ format: 'flervalg', count: Math.min(6, Math.max(3, Math.ceil(mix.flervalg / 2))) });
  if (mix.kortsvar && avail('kortsvar')) plan.push({ format: 'kortsvar', count: Math.min(2, mix.kortsvar) });
  if (mix.langsvar && avail('langsvar')) plan.push({ format: 'langsvar', count: 1 });
  if (mix.regne && avail('regne')) plan.push({ format: 'regne', count: Math.min(4, Math.max(2, Math.ceil(mix.regne / 3))) });
  if (!plan.length) {
    for (const f of FORMATS) if (avail(f)) plan.push({ format: f, count: f === 'flervalg' ? 4 : f === 'langsvar' ? 1 : 2 });
  }
  return plan;
}

/**
 * Lager en prøveeksamen med nye, eksamensnære oppgaver i samme format som det
 * nyeste settet. Oppgavene lages før prøven starter (to om gangen).
 */
export async function buildExamLike(onProgress: (note: string) => void, minutes?: number): Promise<{ exam?: ExamSim; error?: string }> {
  const course = store.course();
  if (!course) return { error: 'Velg et fag først.' };
  if (!canMakeExamLike()) return { error: 'Eksamensnære oppgaver krever AI og analyserte eksamensspørsmål.' };
  const weights = examTopicWeights();
  const jobs: { format: ExamLikeFormat; kbId?: string }[] = [];
  for (const p of examLikePlan()) {
    const fw = weights.filter((w) => hasFormat(w.kbId, p.format));
    const used = new Set<string>();
    for (let i = 0; i < p.count; i++) {
      const w = pickWeighted(fw.length ? fw : weights, used, (x) => x.kbId);
      if (w) used.add(w.kbId);
      if (used.size >= Math.min(fw.length || weights.length, 4)) used.clear();
      jobs.push({ format: p.format, kbId: w?.kbId });
    }
  }
  const tasks: (GeneratedTask | undefined)[] = new Array(jobs.length);
  const avoid = store
    .gens()
    .filter((g) => g.templateId === 'ai-eksamen')
    .slice(-12)
    .map((g) => g.parts[0]?.prompt ?? g.intro);
  let done = 0;
  let lastErr = '';
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++;
      const r = await generateExamLike({ kbId: jobs[i].kbId, format: jobs[i].format, avoid });
      if (r.task) {
        tasks[i] = r.task;
        avoid.push(r.task.parts[0]?.prompt ?? r.task.intro);
      } else lastErr = r.error ?? lastErr;
      done++;
      onProgress(`Lager prøven … ${done} av ${jobs.length} oppgaver`);
    }
  };
  onProgress(`Lager prøven … 0 av ${jobs.length} oppgaver`);
  await Promise.all([worker(), worker()]);
  const list = tasks.filter((t): t is GeneratedTask => !!t);
  if (list.length < Math.ceil(jobs.length / 2)) return { error: lastErr || 'Klarte ikke å lage nok oppgaver akkurat nå. Prøv igjen om litt.' };
  // Samme rekkefølge som på eksamen: flervalg, kortsvar, lengre oppgave, regneoppgaver.
  const now = nowIso();
  const est = list.reduce((a, t) => a + (t.estMinutes ?? 5), 0);
  const exam: ExamSim = {
    id: newId('prove'),
    kind: 'exam',
    courseId: course.id,
    createdAt: now,
    updatedAt: now,
    source: { type: 'generert', basis: 'Nye eksamensnære oppgaver (AI) i samme format som det nyeste eksamenssettet ditt' },
    basisNote: `${list.length} nye oppgaver laget etter mønster av eksamenene og sensorveiledningene dine, i samme rekkefølge og format som på eksamen. Fasit i flervalg og tallsvar er kontrollert av en uavhengig utregning; tekstsvar vurderes mot en vurderingsramme laget av AI. Poengene er treningsanslag, ikke sensur.`,
    durationMin: minutes ?? Math.max(15, Math.round(est / 5) * 5),
    aids: course.examInfo.aids ?? 'Ikke oppgitt',
    taskIds: list.map((t) => t.id),
    subtaskIds: [],
    status: 'klar',
    attemptIds: [],
  };
  store.upsertMany([...list, exam]);
  return { exam };
}
