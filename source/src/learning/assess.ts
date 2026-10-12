// Vurdering av elevforsøk. Metode og svar vurderes hver for seg. Uleselige
// eller tvetydige linjer gir «uavklart», aldri en matematikkfeil.

import type { GenPart, PartAttempt, PartAssessment, CheckpointDetect, GeneratedTask } from '../domain/types';
import { nowIso } from '../domain/types';
import { checkWorkBest, findFirstDeviation, checkAnswers, LineCheck, CompiledContext, solveStatementIn } from '../math/check';
import { toRF } from '../math/poly';
import { varsIn } from '../math/parse';
import { statementPlain } from '../math/latex';
import { Rat } from '../math/rational';
import { assessExplanationAi } from '../ai/prompts';
import { aiAvailable } from '../ai/client';
import { eng } from '../families/el-common';

export interface EffectiveLines {
  texts: string[];
  sources: ('typed' | 'image')[];
  uncertain: Set<number>;
}

export function effectiveLines(pa: PartAttempt): EffectiveLines {
  const texts: string[] = [];
  const sources: ('typed' | 'image')[] = [];
  const uncertain = new Set<number>();
  pa.lines.forEach((l, i) => {
    const confirmed = pa.confirmedReadings[i];
    texts.push(confirmed ?? l.text);
    sources.push(l.source);
    if (l.source === 'image' && l.certain === false && confirmed === undefined) uncertain.add(i);
  });
  return { texts, sources, uncertain };
}

function detectCheckpoint(det: CheckpointDetect, checks: LineCheck[], cc: CompiledContext): boolean | null {
  const ok = checks.flatMap((c) => c.statements.filter((s) => s.status === 'ok' || s.status === 'avrundet'));
  switch (det.type) {
    case 'oppsett':
      return ok.some((s) => {
        if (s.statement.sides.length < 2) return false;
        const isAnswer = s.statement.sides.length === 2 && ((s.statement.sides[0].t === 'var' && varsIn(s.statement.sides[1]).size === 0) || (s.statement.sides[1].t === 'var' && varsIn(s.statement.sides[0]).size === 0));
        if (isAnswer) return false;
        const sol = solveStatementIn(s.statement, cc, det.v);
        if (sol && sol.kind === 'roots') return true;
        // Qd = Qs uten innsatte uttrykk teller også som oppsett.
        const vs = new Set(s.statement.sides.flatMap((x) => [...varsIn(x)]));
        return vs.has('Qd') && vs.has('Qs');
      });
    case 'isolasjonsform': {
      const k = Rat.parse(det.k);
      const m = Rat.parse(det.m);
      return ok.some((s) => {
        if (s.statement.sides.length !== 2) return false;
        try {
          const L = toRF(s.statement.sides[0], cc.env);
          const Rr = toRF(s.statement.sides[1], cc.env);
          for (const [c, x] of [
            [L, Rr],
            [Rr, L],
          ]) {
            if (c.isConst() && c.constValue().eq(k) && x.den.isConst()) {
              const co = x.num.univariateCoeffs(det.v);
              if (co.length === 2 && co[0].isZero() && co[1].div(x.den.constValue()).eq(m)) return true;
            }
          }
        } catch {
          return false;
        }
        return false;
      });
    }
    case 'isolering':
      return ok.some((s) => s.statement.sides.some((x, i) => x.t === 'var' && x.name === det.v && s.statement.sides.slice(i + 1).some((y) => varsIn(y).size === 0)) || (s.statement.sides.length >= 2 && s.statement.sides[s.statement.sides.length - 1].t === 'var' && (s.statement.sides[s.statement.sides.length - 1] as { name: string }).name === det.v));
    case 'verdi': {
      const v = Rat.parse(det.value);
      return ok.some((s) =>
        s.statement.sides.some((x) => {
          if (varsIn(x).size) return false;
          try {
            const r = toRF(x, cc.env);
            return r.isConst() && (r.constValue().eq(v) || (det.symbols.length === 0 && r.constValue().mul(Rat.of(100)).eq(v.mul(Rat.of(100)))));
          } catch {
            return false;
          }
        }),
      );
    }
    case 'kontroll': {
      const v = Rat.parse(det.value);
      let count = 0;
      for (const s of ok) {
        const hit = s.statement.sides.some((x) => {
          if (x.t === 'num' || varsIn(x).size) return false;
          try {
            const r = toRF(x, cc.env);
            return r.isConst() && r.constValue().eq(v);
          } catch {
            return false;
          }
        });
        const symHit = s.statement.sides.length >= 2 && s.statement.sides[0].t === 'var' && ['Qd', 'Qs'].includes((s.statement.sides[0] as { name: string }).name);
        if (hit || symHit) count++;
      }
      return count >= det.count;
    }
    case 'forklaring':
      return null;
  }
}

/** Kjente misoppfatninger som kan leses ut av svaret. */
function detectMisconception(task: GeneratedTask | undefined, part: GenPart, answers: ReturnType<typeof checkAnswers>): PartAssessment['misconception'] | undefined {
  const sol = part.math?.solution ?? {};
  for (const a of answers) {
    if (a.verdict !== 'feil' || !a.given) continue;
    const g = a.given;
    if (a.target.percent && sol.V0 && sol.V1) {
      const V0 = Rat.parse(sol.V0);
      const V1 = Rat.parse(sol.V1);
      const wrongBase = V1.sub(V0).div(V1).mul(Rat.of(100)).abs();
      if (g.abs().sub(wrongBase).abs().cmp(Rat.of(1, 2)) <= 0) return { id: 'feil-grunnlag', label: 'Delte på den nye verdien', detail: `Svaret ditt tilsvarer endringen delt på ${V1.toNo()}. Prosentvis endring skal deles på startverdien ${V0.toNo()}.` };
      if (g.abs().eq(V1.sub(V0).abs())) return { id: 'absolutt', label: 'Svarte med endringen i tall, ikke i prosent', detail: `${V1.sub(V0).abs().toNo()} er endringen i ${task?.context ? 'kroner eller enheter' : 'tall'}. Oppgaven spør om endringen i prosent av startverdien.` };
    }
    if (a.target.symbol === 'P' && sol.Q && g.eq(Rat.parse(sol.Q))) return { id: 'bytter-p-q', label: 'Byttet om pris og kvantum', detail: 'Tallet du oppga som pris, er likevektskvantumet.' };
    if (a.target.symbol === 'Q' && sol.P && g.eq(Rat.parse(sol.P))) return { id: 'bytter-p-q', label: 'Byttet om pris og kvantum', detail: 'Tallet du oppga som kvantum, er likevektsprisen.' };
    if (task?.templateId === 'pst-to-endringer' && task.params.p1 && task.params.p2 && g.eq(Rat.parse(task.params.p1).sub(Rat.parse(task.params.p2)))) return { id: 'legger-sammen', label: 'La sammen prosentene', detail: 'Den andre endringen regnes av en ny verdi, så prosentene kan ikke bare legges sammen.' };
    if (task?.templateId === 'pst-baklengs' && sol.V1 && task.params.pct) {
      const V1 = Rat.parse(sol.V1);
      const p = Rat.parse(task.params.pct).div(Rat.of(100));
      if (g.eq(V1.mul(Rat.ONE.sub(p))) || g.eq(V1.mul(Rat.ONE.add(p)))) return { id: 'feil-grunnlag', label: 'Regnet prosenten av den nye verdien', detail: 'Prosenten er regnet av startverdien. Del på vekstfaktoren i stedet for å trekke fra prosenten av den nye verdien.' };
    }
  }
  return undefined;
}

const DEV_TEXT: Record<string, string> = {
  'ganget-i-stedet-for-delt': 'ganget i stedet for å dele',
  'delt-feil-vei': 'delt feil vei',
  'fortegnsfeil-flytting': 'fortegnsfeil da et ledd byttet side',
  'regnefeil-konstant': 'regnefeil i konstantleddet',
  'regnefeil-koeffisient': 'regnefeil når leddene med den ukjente ble slått sammen',
  regnefeil: 'regnefeil',
  'feil-fortegn-svar': 'feil fortegn i svaret',
  'ugyldig-omforming': 'en omforming som endrer løsningen',
  'feil-oppsett': 'et oppsett som ikke stemmer med oppgaven',
};

export function assessMathPart(part: GenPart, pa: PartAttempt, task?: GeneratedTask): PartAssessment {
  const el = effectiveLines(pa);
  const base: PartAssessment = {
    at: nowIso(),
    method: { verdict: 'uavklart', checkpoints: [] },
    answer: { verdict: 'ikke-relevant', items: [] },
    readingIssues: [],
    feedback: '',
    basis: 'Kontrollert med matematikkmotoren (eksakt brøkregning).',
    uncertain: false,
  };
  if (!part.math || !part.targets?.length) return base;
  const { checks, cc } = checkWorkBest(el.texts, part.math, { resolutions: pa.resolutions, uncertainLines: el.uncertain, sources: el.sources });
  const unresolved = checks.filter((c) => c.status === 'uavklart-inndata');
  const unreadable = checks.filter((c) => c.status === 'kan-ikke-lese');
  if (unresolved.length) {
    return { ...base, uncertain: true, method: { verdict: 'uavklart', checkpoints: [] }, answer: { verdict: 'uavklart', items: [] }, readingIssues: unresolved.map((c) => `Linje ${c.index + 1}: ${c.ambiguities.filter((a) => !a.chosen).map((a) => a.question).join(' ')}`), feedback: 'Før vi vurderer: noen tall kan leses på to måter. Svar på spørsmålene ved linjene, så kontrollerer vi.' };
  }
  const dev = findFirstDeviation(checks, cc);
  const answers = checkAnswers(checks, part.targets, cc);
  const cps = part.methodCheckpoints.map((c) => ({ id: c.id, label: c.label, skill: c.skill, shown: detectCheckpoint(c.detect, checks, cc) }));
  const mathLines = checks.filter((c) => c.statements.some((s) => s.status !== 'tekst')).length;
  // Et steg viser metode bare når det er en likning (to sider). Et løst tall eller uttrykk
  // («18», «1529,4kr») er et svar, ikke en utregning.
  const stepLines = checks.filter((c) => c.statements.some((s) => s.status !== 'tekst' && (s.statement.sides.length >= 2 || (s.statement.label && s.statement.sides[0] && s.statement.sides[0].t !== 'num')))).length;
  // «x = 5», «konsum = 1580» og «Svar: 1580» er bare svar. «konsum = 230·6 + 200» viser oppsettet.
  const plainNumber = (n: (typeof checks)[number]['statements'][number]['statement']['sides'][number]): boolean => n.t === 'num' || ((n.t === 'neg' || n.t === 'pct') && plainNumber(n.a));
  const answerOnly = mathLines > 0 && checks.every((c) => c.statements.every((s) => s.status === 'tekst' || (s.statement.sides.length < 2 && (!s.statement.sides[0] || plainNumber(s.statement.sides[0]))) || (s.statement.sides.length === 2 && s.statement.sides[0].t === 'var' && plainNumber(s.statement.sides[1]))));
  let methodVerdict: PartAssessment['method']['verdict'];
  if (dev?.needsReadingConfirmation) methodVerdict = 'uavklart';
  else if (!mathLines || !stepLines) methodVerdict = 'ikke-vist';
  else if (dev) {
    const reqBefore = cps.filter((c) => c.shown === true).length;
    methodVerdict = reqBefore > 0 || (dev.lastGoodLine !== null && dev.lastGoodLine !== undefined) ? 'delvis' : 'feil';
  } else if (answerOnly) methodVerdict = 'ikke-vist'; // bare et svar («x = 5») viser ingen metode
  else methodVerdict = 'riktig';

  const items = answers.map((a) => ({ label: a.target.label, verdict: a.verdict, given: a.given ? (a.target.percent ? `${a.given.toNo(2)} %` : a.given.toNo(3)) : undefined, expected: Rat.parse(a.target.value).toNo(2) + (a.target.percent ? ' %' : ''), note: a.note }));
  const okN = answers.filter((a) => a.verdict === 'riktig' || a.verdict === 'riktig-avrundet').length;
  let answerVerdict: PartAssessment['answer']['verdict'] = okN === answers.length ? 'riktig' : okN > 0 ? 'delvis' : answers.every((a) => a.verdict === 'mangler') ? 'mangler' : 'feil';
  if (answers.some((a) => a.verdict === 'uavklart')) answerVerdict = 'uavklart';
  const misconception = detectMisconception(task, part, answers);
  const readingIssues = [
    ...unreadable.map((c) => `Linje ${c.index + 1} kunne ikke leses som matematikk: ${c.error ?? ''}`),
    ...checks.filter((c) => c.source === 'image' && c.readingCertain === false).map((c) => `Linje ${c.index + 1} er usikkert avlest fra bildet: «${c.raw}».`),
  ];

  // Konkret tilbakemelding.
  const fb: string[] = [];
  if (dev?.needsReadingConfirmation) {
    fb.push(`Linje ${dev.lineIndex + 1} er utydelig i bildet. Før vi sier noe om matematikken: står det «${checks[dev.lineIndex].raw}», eller noe annet?`);
  } else if (dev) {
    const lastGood = dev.lastGoodStatement ? statementPlain(dev.lastGoodStatement.statement) : null;
    const badText = statementPlain(dev.bad.statement);
    const setup = cps.find((c) => c.id === 'oppsett' && c.shown) ? 'Du valgte riktig modell og satte opp likningen riktig. ' : '';
    const good = lastGood ? `Omformingen fram til «${lastGood}» stemmer. ` : '';
    const where = dev.lastGoodLine === dev.lineIndex ? `steget «${badText}» i linje ${dev.lineIndex + 1}` : `linje ${dev.lineIndex + 1}, «${badText}»`;
    fb.push(`${setup}${good}Første avvik er ${where}: ${DEV_TEXT[dev.kind] ?? 'en omforming som ikke stemmer'}. ${dev.detail}`);
  } else if (methodVerdict === 'riktig') {
    const shown = cps.filter((c) => c.shown).map((c) => c.label.toLowerCase());
    if (answerVerdict !== 'feil') fb.push(part.math.units === 'si' ? 'Regningen i stegene dine henger sammen. Appen kontrollerer regningen, ikke om du har valgt riktig kobling eller metode – sammenlikn med løsningen.' : shown.length ? `Alle stegene stemmer. Du ${shown.slice(0, 3).join(', ')}.` : 'Alle stegene du skrev, stemmer.');
  } else if (methodVerdict === 'ikke-vist') {
    fb.push('Du har skrevet svar uten mellomregning. Det er ikke feil i seg selv, men på eksamen må du ofte vise hvordan du kom fram. Vi kan ikke se om metoden er riktig.');
  }
  // Med SI-enheter vises svaret med prefiks («RT = 6 kΩ»), ellers som før («konsum 1580»).
  const shownValue = (a: (typeof answers)[number]) => (part.math!.units === 'si' && a.given ? `${a.target.label} = ${eng(a.given.toNumber(), a.target.unit ?? '', 4)}` : `${a.target.label.toLowerCase()} ${a.given?.toNo(2)}${a.target.percent ? ' %' : ''}`);
  if (answerVerdict === 'riktig') fb.push(`Svaret er riktig: ${answers.map(shownValue).join(', ')}.`);
  else if (answerVerdict === 'delvis') fb.push(`Noe av svaret er riktig: ${answers.filter((a) => a.verdict.startsWith('riktig')).map((a) => a.target.label.toLowerCase()).join(', ')}. ${answers.filter((a) => a.verdict === 'mangler').length ? `Fant ikke: ${answers.filter((a) => a.verdict === 'mangler').map((a) => a.target.label.toLowerCase()).join(', ')}. Skriv det som «${answers.find((a) => a.verdict === 'mangler')!.target.label.toLowerCase()} = …».` : ''}`);
  else if (answerVerdict === 'mangler') {
    // Aldri interne symbolnavn (x, s0) i teksten: bruk navnet på størrelsen.
    const name = (t: (typeof part.targets)[number]) => (/^(x|y|s\d+|t\d+)$/.test(t.symbol) ? t.label.toLowerCase() : t.symbol);
    fb.push(`Fant ikke svaret. Skriv det på en egen linje, f.eks. «${part.targets.map((t) => `${name(t)} = …`).join('» og «')}».`);
  }
  else if (answerVerdict === 'feil' && dev && !dev.needsReadingConfirmation && methodVerdict === 'delvis') fb.push('Sluttsvaret blir feil på grunn av dette ene steget. Oppsettet ditt er godt.');
  else if (answerVerdict === 'feil') {
    // Tydelig beskjed når sluttsvaret er feil, også når stegene i seg selv henger sammen.
    const wrong = answers.filter((a) => a.verdict === 'feil').map((a) => (part.math!.units === 'si' ? shownValue(a) : `${a.target.label.toLowerCase()} = ${a.given ? (a.target.percent ? `${a.given.toNo(2)} %` : a.given.toNo(3)) : '…'}`));
    fb.push(`Sluttsvaret stemmer ikke (${wrong.join(', ')}).`);
    if (methodVerdict === 'ikke-vist') fb.push('Skriv utregningen linje for linje, så viser appen nøyaktig hvor det går galt.');
    else if (methodVerdict === 'riktig') fb.push('Regningen henger sammen, så feilen ligger trolig i oppsettet: sjekk hva oppgaven spør etter, og om du har brukt riktige tall og riktig sammenheng.');
  }
  if (answerVerdict === 'delvis') {
    const wrong = answers.filter((a) => a.verdict === 'feil').map((a) => a.target.label.toLowerCase());
    if (wrong.length) fb.push(`Stemmer ikke ennå: ${wrong.join(', ')}.`);
  }
  if (misconception) fb.push(misconception.detail);
  const note = answers.find((a) => a.note)?.note;
  if (note && answerVerdict !== 'feil') fb.push(note);

  return {
    ...base,
    method: { verdict: methodVerdict, checkpoints: cps, firstDeviation: dev ? { line: dev.lineIndex, kind: dev.kind, detail: dev.detail, needsReadingConfirmation: dev.needsReadingConfirmation } : undefined, lastGoodLine: dev?.lastGoodLine ?? null },
    answer: { verdict: answerVerdict, items },
    misconception,
    readingIssues,
    feedback: fb.join(' '),
    uncertain: methodVerdict === 'uavklart' || answerVerdict === 'uavklart',
  };
}

export function assessChoice(part: GenPart, pa: PartAttempt): PartAssessment {
  const c = part.choices?.find((x) => x.id === pa.choiceId);
  const right = !!c?.correct;
  return {
    at: nowIso(),
    method: { verdict: 'ikke-vist', checkpoints: [] },
    answer: { verdict: !c ? 'mangler' : right ? 'riktig' : 'feil', items: [{ label: 'Valgt alternativ', verdict: !c ? 'mangler' : right ? 'riktig' : 'feil', given: c?.text }] },
    readingIssues: [],
    feedback: !c ? 'Velg et alternativ.' : `${right ? 'Riktig.' : 'Ikke riktig.'} ${c.why}`,
    basis: part.answerSource ?? 'Fast fasit i oppgavemalen.',
    uncertain: false,
  };
}

export function assessFlawed(part: GenPart, pa: PartAttempt, task?: GeneratedTask): PartAssessment {
  const f = part.flawed!;
  const chosen = pa.flawedLine;
  const lineRight = chosen === f.errorLine;
  const mathA = part.math && part.targets ? assessMathPart(part, pa, task) : undefined;
  const ansOk = mathA?.answer.verdict === 'riktig';
  const fb = [chosen === undefined ? 'Marker linjen med den første feilen.' : lineRight ? `Riktig linje: linje ${f.errorLine + 1}. ${f.correction}` : `Feilen er ikke i linje ${chosen + 1}. Den linjen følger riktig av linjen over. Se etter første linje der løsningen endrer seg.`];
  if (mathA && pa.lines.some((l) => l.text.trim())) fb.push(mathA.feedback);
  return {
    at: nowIso(),
    method: { verdict: lineRight ? 'riktig' : chosen === undefined ? 'ikke-vist' : 'feil', checkpoints: [{ id: 'finn', label: 'Fant linjen med feilen', skill: part.skills[0], shown: lineRight }] },
    answer: mathA ? mathA.answer : { verdict: 'ikke-relevant', items: [] },
    readingIssues: mathA?.readingIssues ?? [],
    feedback: fb.join(' '),
    basis: 'Feilen er satt inn med vilje i malen; riktig løsning er kontrollert med matematikkmotoren.',
    uncertain: false,
    misconception: lineRight && ansOk ? undefined : undefined,
  };
}

export interface GraphAssessInput {
  a: number;
  b: number;
  c: number;
  d: number;
  qMax: number;
  pMax: number;
}

/** Vurderer tegnede linjer (to punkter per kurve) mot modellens kurver. */
export function assessGraph(part: GenPart, pa: PartAttempt): PartAssessment {
  const g = part.graph!;
  const a = Rat.parse(g.params.a).toNumber();
  const b = Rat.parse(g.params.b).toNumber();
  const c = Rat.parse(g.params.c).toNumber();
  const d = Rat.parse(g.params.d).toNumber();
  const qMax = g.qMax ?? 100;
  const pMax = g.pMax ?? 50;
  const tolP = pMax * 0.05;
  const curveCheck = (name: string, pts: { x: number; y: number }[] | undefined, pOf: (q: number) => number) => {
    if (!pts || pts.length < 2) return { ok: null as boolean | null, note: `${name}: mangler to punkter.` };
    const errs = pts.map((p) => Math.abs(p.y - pOf(p.x)));
    const ok = errs.every((e) => e <= tolP);
    return { ok, note: ok ? `${name}: punktene ligger på kurven.` : `${name}: minst ett punkt ligger ${Math.max(...errs).toFixed(1).replace('.', ',')} fra kurven i prisretning.` };
  };
  const dm = curveCheck('Etterspørsel', pa.graphPoints?.find((x) => x.curve === 'etterspørsel')?.points, (q) => (a - q) / b);
  const sm = curveCheck('Tilbud', pa.graphPoints?.find((x) => x.curve === 'tilbud')?.points, (q) => (q - c) / d);
  const Pst = (a - c) / (b + d);
  const Qst = a - b * Pst;
  const eq = pa.graphPoints?.find((x) => x.curve === 'likevekt')?.points?.[0];
  const eqOk = eq ? Math.abs(eq.x - Qst) <= qMax * 0.05 && Math.abs(eq.y - Pst) <= tolP : null;
  const all = [dm.ok, sm.ok, eqOk];
  const okN = all.filter((x) => x === true).length;
  const verdict = okN === 3 ? 'riktig' : okN > 0 ? 'delvis' : all.every((x) => x === null) ? 'mangler' : 'feil';
  const swapped = dm.ok === false && sm.ok === false && pa.graphPoints?.some((x) => x.points.some((p) => p.x < pMax && p.y > pMax));
  return {
    at: nowIso(),
    method: { verdict: verdict === 'riktig' ? 'riktig' : verdict === 'delvis' ? 'delvis' : verdict === 'mangler' ? 'ikke-vist' : 'feil', checkpoints: [{ id: 'kurver', label: 'Plasserte kurvene riktig', skill: 'lik.graf', shown: dm.ok && sm.ok }] },
    answer: { verdict, items: [{ label: 'Etterspørsel', verdict: String(dm.ok ?? 'mangler') }, { label: 'Tilbud', verdict: String(sm.ok ?? 'mangler') }, { label: 'Likevekt', verdict: String(eqOk ?? 'mangler'), expected: `Q = ${Qst.toFixed(1).replace('.0', '')}, P = ${Pst.toFixed(1).replace('.0', '')}` }] },
    readingIssues: [],
    feedback: [dm.note, sm.note, eq ? (eqOk ? 'Likevekten er riktig markert.' : `Likevekten ligger ved Q = ${fmt(Qst)} og P = ${fmt(Pst)}.`) : 'Marker likevekten der kurvene krysser.', swapped ? 'Sjekk aksene: prisen står på den loddrette aksen.' : ''].filter(Boolean).join(' '),
    basis: `Punktene sammenliknes med kurvene innenfor ±${fmt(tolP)} i prisretning (5 % av aksen).`,
    uncertain: false,
  };
}

function fmt(x: number) {
  return (Math.round(x * 10) / 10).toString().replace('.', ',');
}

/** Forklaringsdeler: AI-vurdering når tilgjengelig, ellers selvvurdering mot vurderingsrammen. */
export async function assessExplanation(task: GeneratedTask | undefined, part: GenPart, pa: PartAttempt, self?: Record<string, boolean>): Promise<PartAssessment> {
  const rubric = part.rubric ?? [];
  const mathPart = part.math && part.targets?.length ? assessMathPart(part, pa, task) : null;
  const base: PartAssessment = mathPart ?? { at: nowIso(), method: { verdict: 'ikke-vist', checkpoints: [] }, answer: { verdict: 'ikke-relevant', items: [] }, readingIssues: [], feedback: '', basis: '', uncertain: false };
  const answer = [pa.explanation, ...pa.lines.map((l) => l.text)].filter((x) => x && x.trim()).join('\n');
  if (!answer.trim()) return { ...base, interpretation: { verdict: 'ikke-vurdert', basis: 'ikke-vurdert', criteria: [] }, feedback: 'Skriv forklaringen din først.' };
  if (part.selfCheck && !self) return { ...base, interpretation: { verdict: 'ikke-vurdert', basis: 'ikke-vurdert', criteria: [] }, feedback: [base.feedback, 'Kryss av mot løsningsforslaget for å fullføre egenkontrollen.'].filter(Boolean).join(' ') };
  if (self) {
    const crit = rubric.map((r) => ({ id: r.id, text: r.text, verdict: self[r.id] ? 'oppfylt' : 'ikke-oppfylt' }));
    const req = rubric.filter((r) => r.required);
    const met = req.filter((r) => self[r.id]).length;
    return {
      ...base,
      interpretation: { verdict: met === req.length ? 'oppfylt' : met ? 'delvis' : 'ikke-oppfylt', basis: 'selvvurdering', criteria: crit, summary: 'Du vurderte selv svaret mot vurderingsrammen. Selvvurdering teller ikke som dokumentert mestring.' },
      feedback: [base.feedback, `Selvvurdering: ${met} av ${req.length} nødvendige punkter.`].filter(Boolean).join(' '),
      basis: [base.basis, 'Forklaringen er selvvurdert.'].filter(Boolean).join(' '),
      uncertain: true,
    };
  }
  if (!aiAvailable()) return { ...base, interpretation: { verdict: 'ikke-vurdert', basis: 'ikke-vurdert', criteria: [] }, feedback: [base.feedback, 'Automatisk vurdering av forklaringer krever AI. Sammenlikn selv med vurderingsrammen.'].filter(Boolean).join(' ') };
  const r = await assessExplanationAi({ task: [task?.intro ?? '', task?.title ?? ''].join('\n'), prompt: part.prompt, rubric: rubric.map((x) => ({ id: x.id, text: x.text, basis: x.basis })), answer, modelAnswer: part.modelAnswer });
  if (!r.ok) return { ...base, interpretation: { verdict: 'uavklart', basis: 'ikke-vurdert', criteria: [], summary: r.message }, feedback: [base.feedback, `Forklaringen kunne ikke vurderes nå: ${r.message}`].filter(Boolean).join(' '), uncertain: true };
  const req = rubric.filter((x) => x.required);
  const v = (id: string) => r.data.criteria.find((c) => c.id === id)?.verdict ?? 'uavklart';
  const reqV = req.map((x) => v(x.id));
  const verdict = reqV.some((x) => x === 'uavklart') ? 'uavklart' : reqV.every((x) => x === 'oppfylt') ? 'oppfylt' : reqV.some((x) => x === 'oppfylt' || x === 'delvis') ? 'delvis' : 'ikke-oppfylt';
  return {
    ...base,
    interpretation: {
      verdict,
      basis: 'ai-vurdering',
      criteria: rubric.map((x) => ({ id: x.id, text: x.text, verdict: v(x.id), evidence: r.data.criteria.find((c) => c.id === x.id)?.evidence, comment: r.data.criteria.find((c) => c.id === x.id)?.comment })),
      summary: r.data.summary + (r.data.uncertainty ? ` Usikkerhet: ${r.data.uncertainty}` : ''),
    },
    feedback: [base.feedback, r.data.summary, r.data.strengths ? `Bra: ${r.data.strengths}` : '', r.data.improvements?.length ? `For full uttelling:\n${r.data.improvements.map((x) => `- ${x}`).join('\n')}` : ''].filter(Boolean).join('\n\n'),
    basis: [base.basis, 'Forklaringen er vurdert av AI mot en synlig vurderingsramme (foreløpig, ikke offisiell).'].filter(Boolean).join(' '),
    uncertain: verdict === 'uavklart',
  };
}
