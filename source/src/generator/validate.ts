// Uavhengig validering av genererte oppgaver. Generatoren regner fasit med
// lukkede formler; her regnes den ut på nytt med den symbolske motoren fra
// teksten eleven faktisk får se. En ny formulering fra en språkmodell er
// aldri en fasit: tall og uttrykk må stemme med parameterne.

import type { GeneratedTask, GenPart } from '../domain/types';
import { compileContext, checkWork, checkAnswers } from '../math/check';
import { toRF, solveUnivariate } from '../math/poly';
import { parseExpr } from '../math/parse';
import { Rat } from '../math/rational';
import { getFamily } from '../families';
import { eng } from '../families/el-common';

export interface ValidationCheck {
  name: string;
  ok: boolean;
  detail: string;
  severity?: 'feil' | 'advarsel';
}

const NONNEG = ['P', 'Q', 'Qd', 'Qs', 'Pk', 'Pp', 'TC', 'AC', 'MC', 'FC', 'V0', 'V1', 'TR'];

function fmtValue(v: Rat): string {
  if (v.isExactDecimal(4)) {
    // Tre desimaler etter komma kan leses som tusenskille; skriv da med fire.
    const t = v.toNo(4).replace(/[\s\u00a0]/g, '').replace('\u2212', '-');
    return /,\d{3}$/.test(t) ? `${t}0` : t;
  }
  return v.round(2).toNo(2).replace(/[\s\u00a0]/g, '').replace('\u2212', '-');
}

function validatePart(task: GeneratedTask, part: GenPart): ValidationCheck[] {
  const out: ValidationCheck[] = [];
  const P = `Del ${part.label}`;
  if (!part.prompt.trim()) out.push({ name: `${P}: oppgavetekst`, ok: false, detail: 'Mangler oppgavetekst', severity: 'feil' });
  if (part.kind === 'forklaring' && (!part.rubric || part.rubric.length === 0)) out.push({ name: `${P}: vurderingsramme`, ok: false, detail: 'Forklaringsoppgaver må ha en synlig vurderingsramme', severity: 'feil' });
  if (part.kind === 'flervalg') {
    const n = part.choices?.filter((c) => c.correct).length ?? 0;
    out.push({ name: `${P}: entydig flervalg`, ok: n === 1, detail: n === 1 ? 'Nøyaktig ett riktig alternativ' : `${n} riktige alternativer`, severity: 'feil' });
  }
  if (part.graph) {
    const keys = ['a', 'b', 'c', 'd'].filter((k) => k in part.graph!.params && k in task.params);
    const same = keys.every((k) => Rat.parse(part.graph!.params[k]).eq(Rat.parse(task.params[k])));
    out.push({ name: `${P}: graf og tekst bruker samme parametere`, ok: same, detail: same ? 'Figuren tegnes fra de samme uttrykkene som teksten' : 'Figur og tekst har ulike tall', severity: 'feil' });
    if (part.graph.qMax && part.graph.pMax && part.graph.type === 'likevekt') {
      const a = Rat.parse(part.graph.params.a), b = Rat.parse(part.graph.params.b), c = Rat.parse(part.graph.params.c), d = Rat.parse(part.graph.params.d);
      const P = a.sub(c).div(b.add(d)).toNumber();
      const Q = a.sub(b.mul(a.sub(c).div(b.add(d)))).toNumber();
      const inside = P > 0 && P < part.graph.pMax && Q > 0 && Q < part.graph.qMax;
      out.push({ name: `${P}: likevekten er synlig i figuren`, ok: inside, detail: inside ? 'Skjæringspunktet ligger innenfor aksene' : 'Skjæringspunktet er utenfor figuren', severity: 'feil' });
    }
  }
  if (!part.math || !part.targets?.length) return out;
  let cc;
  try {
    cc = compileContext(part.math);
    out.push({ name: `${P}: uttrykk kan leses`, ok: true, detail: 'Alle definisjoner er gyldige uttrykk' });
  } catch (e) {
    out.push({ name: `${P}: uttrykk kan leses`, ok: false, detail: String(e), severity: 'feil' });
    return out;
  }
  // Definisjoner evaluert i løsningen skal gi løsningsverdiene.
  for (const [sym, rf] of Object.entries(cc.env.defs ?? {})) {
    const expected = cc.sol[sym];
    if (!expected) continue;
    try {
      const got = rf.evaluate(cc.sol);
      out.push({ name: `${P}: ${sym} stemmer i løsningen`, ok: got.eq(expected), detail: `${sym} = ${got.toNo()} (forventet ${expected.toNo()})`, severity: 'feil' });
    } catch (e) {
      out.push({ name: `${P}: ${sym} stemmer i løsningen`, ok: false, detail: String(e), severity: 'feil' });
    }
  }
  // Likevekt: løs Qd = Qs symbolsk og sammenlikn med fasit.
  const defs = cc.env.defs ?? {};
  if (defs.Qd && defs.Qs && cc.sol.Qd && cc.sol.Qs && cc.sol.Qd.eq(cc.sol.Qs)) {
    const diff = defs.Qd.sub(defs.Qs);
    const v = part.math.unknown;
    const others: Record<string, Rat> = {};
    for (const x of diff.vars()) if (x !== v && cc.sol[x]) others[x] = cc.sol[x];
    const reduced = Object.keys(others).length ? diff.substitute(Object.fromEntries(Object.entries(others).map(([k, r]) => [k, toRF(parseExpr(r.toString()))]))) : diff;
    const res = solveUnivariate(reduced, v);
    const ok = res.kind === 'roots' && res.roots.length === 1 && res.roots[0].eq(cc.sol[v]);
    out.push({ name: `${P}: entydig løsning`, ok, detail: res.kind === 'roots' ? `Qd = Qs gir ${v} = ${res.roots.map((r) => r.toNo()).join(', ')}` : `Løsning: ${res.kind}`, severity: 'feil' });
  }
  // Domene: priser og kvanta kan ikke være negative.
  for (const s of NONNEG) {
    const v = cc.sol[s];
    if (v && v.sign() < 0) out.push({ name: `${P}: domene`, ok: false, detail: `${s} = ${v.toNo()} er negativ`, severity: 'feil' });
  }
  // Mål skal samsvare med løsningen der symbolet finnes der.
  for (const t of part.targets) {
    const tv = Rat.parse(t.value);
    const sv = cc.sol[t.symbol];
    if (sv && !t.percent) out.push({ name: `${P}: fasit for ${t.label}`, ok: sv.eq(tv), detail: `Fasit ${tv.toNo()} vs løsning ${sv.toNo()}`, severity: 'feil' });
    if (!tv.isExactDecimal(2) && t.minDecimals === undefined && !t.tolerance) out.push({ name: `${P}: avrunding`, ok: false, detail: `${t.label} har uendelig desimalutvikling uten avrundingsregel`, severity: 'advarsel' });
  }
  // Selvkontroll: et riktig svar skal godtas, et feil svar skal avvises.
  try {
    const si = part.math.units === 'si';
    const fmt = (t: (typeof part.targets)[number], v: Rat) => (si ? eng(v.toNumber(), t.unit ?? '', 4).replace('−', '-') : `${fmtValue(v)}${t.percent ? ' %' : ''}`);
    const good = part.targets.map((t) => `${t.symbol} = ${fmt(t, Rat.parse(t.value))}`);
    const gc = checkWork(good, cc);
    const ga = checkAnswers(gc, part.targets, cc);
    const allGood = ga.every((a) => a.verdict === 'riktig' || a.verdict === 'riktig-avrundet');
    out.push({ name: `${P}: riktig svar godtas`, ok: allGood, detail: ga.map((a) => `${a.target.label}: ${a.verdict}`).join(', '), severity: 'feil' });
    const bad = part.targets.map((t) => {
      const v = Rat.parse(t.value);
      const off = t.tolerance ? Rat.parse(t.tolerance).mul(Rat.of(3)).add(Rat.of(1)) : Rat.of(7);
      const wrongV = si ? v.add(Rat.fromNumber(Math.max(Math.abs(v.toNumber()) * 0.2, Number(t.tolerance ?? '0') * 3 + 1e-9))) : v.add(off);
      return `${t.symbol} = ${si ? fmt(t, wrongV) : fmtValue(wrongV) + (t.percent ? ' %' : '')}`;
    });
    const ba = checkAnswers(checkWork(bad, cc), part.targets, cc);
    out.push({ name: `${P}: feil svar avvises`, ok: ba.every((a) => a.verdict === 'feil'), detail: ba.map((a) => `${a.target.label}: ${a.verdict}`).join(', '), severity: 'feil' });
  } catch (e) {
    out.push({ name: `${P}: selvkontroll`, ok: false, detail: String(e), severity: 'feil' });
  }
  // Løsningssteg skal inneholde fasitverdiene.
  const solText = part.solution.map((s) => s.tex + ' ' + s.text + ' ' + s.why).join(' ');
  for (const t of part.targets) {
    const tv = Rat.parse(t.value);
    const forms = [tv.toLatex(), tv.toNo(), tv.abs().toLatex(), tv.abs().toNo(), tv.round(2).toNo()].map((x) => x.replace(/ /g, '\\,'));
    if (part.math.units === 'si') for (const sig of [2, 3, 4, 5]) forms.push(eng(tv.toNumber(), t.unit ?? '', sig).split(' ')[0]);
    const found = forms.some((f) => solText.includes(f)) || forms.some((f) => solText.replace(/\\,/g, '').includes(f.replace(/\\,/g, '')));
    out.push({ name: `${P}: løsningen viser ${t.label}`, ok: found, detail: found ? 'Verdien finnes i løsningsstegene' : 'Fant ikke verdien i løsningsstegene', severity: 'advarsel' });
  }
  return out;
}

/** Kontroll av at teksten eleven ser, har samme tall som parameterne. */
function validateText(task: GeneratedTask): ValidationCheck[] {
  const fam = getFamily(task.familyKbId);
  if (!fam) return [];
  const text = [task.intro, ...task.parts.map((p) => p.prompt)].join('\n');
  const rec = fam.recognize(text);
  const keys = Object.keys(task.params).filter((k) => ['a', 'b', 'c', 'd', 'V0', 'V1', 'F', 't'].includes(k));
  if (!rec || !keys.length) return [];
  const mism: string[] = [];
  for (const k of keys) {
    if (rec.params[k] === undefined) continue;
    const a = Rat.parse(task.params[k]);
    const b = Rat.parse(rec.params[k]);
    if (!a.eq(b)) mism.push(`${k}: tekst ${b.toNo()} ≠ parameter ${a.toNo()}`);
  }
  return [{ name: 'Tekst og parametere samsvarer', ok: mism.length === 0, detail: mism.length ? mism.join('; ') : `Leste ${keys.join(', ')} fra oppgaveteksten og fant samme verdier`, severity: 'feil' }];
}

export function validateTask(task: GeneratedTask): { status: GeneratedTask['validation']['status']; checks: ValidationCheck[] } {
  const checks: ValidationCheck[] = [];
  if (!task.parts.length) checks.push({ name: 'Har deloppgaver', ok: false, detail: 'Ingen deloppgaver', severity: 'feil' });
  for (const p of task.parts) checks.push(...validatePart(task, p));
  checks.push(...validateText(task));
  const hardFail = checks.some((c) => !c.ok && c.severity !== 'advarsel');
  const warn = checks.some((c) => !c.ok && c.severity === 'advarsel');
  return { status: hardFail ? 'forkastet' : warn ? 'til-kontroll' : 'gyldig', checks };
}
