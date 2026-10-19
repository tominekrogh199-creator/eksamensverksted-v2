// Instrukser og utdataformater for dokumentanalyse, bildelesing, vurdering og
// læreren. Hver funksjon returnerer validerte, strukturerte data.

import { aiJson, aiText, asData, DATA_RULE, V, AiResult, AiOpts } from './client';
import { FAMILIES } from '../families';
import { SKILLS } from '../families/skills';
import type { TaskType, CriterionBasis } from '../domain/types';

// ——— 1. Lesing av skannet side eller bilde ———

export interface PageReading {
  legible: 'ja' | 'delvis' | 'nei';
  text: string;
  printedPage?: string;
  figures: string[];
  uncertain: { text: string; reason: string }[];
  isRelevant: boolean;
}

export async function readPageImage(img: Blob, ctx: { fileName: string; pdfPage: number; docTypeHint: string }, opts: AiOpts = {}): Promise<AiResult<PageReading>> {
  const prompt = `${DATA_RULE}

Du leser én side fra et opplastet dokument i appen Eksamensverksted. Filnavn: ${JSON.stringify(ctx.fileName)}. PDF-side: ${ctx.pdfPage}. Antatt dokumenttype: ${ctx.docTypeHint}.
Bildet er vedlagt. Transkriber all tekst på siden ordrett, i leserekkefølge, med linjeskift. Skriv matematiske uttrykk som ren tekst (for eksempel «Qd = 120 − 2P», «TC = 500 + 20Q», brøker som «(a)/(b)»). Behold oppgavenummer og deloppgavebokstaver slik de står («Oppgave 2», «a)»).
Ikke rett opp eller tolk innholdet. Hvis et tegn eller tall er usikkert, skriv det du ser mest sannsynlig og legg det i «uncertain» med begrunnelse. Beskriv figurer, grafer og tabeller kort i «figures» (akser, kurver, verdier som kan leses av).
Svar bare med JSON:
{"legible":"ja|delvis|nei","text":"…","printedPage":"trykt sidenummer hvis det står på siden, ellers null","figures":["…"],"uncertain":[{"text":"…","reason":"…"}],"isRelevant":true}`;
  return aiJson(prompt, (x) => {
    const o = V.obj(x);
    if (!o) return 'ikke et objekt';
    const text = V.str(o.text, 30000);
    if (text === null) return 'mangler text';
    return {
      legible: V.oneOf(o.legible, ['ja', 'delvis', 'nei'] as const, 'delvis'),
      text,
      printedPage: V.str(o.printedPage, 20) ?? undefined,
      figures: V.strs(o.figures, 10, 800),
      uncertain: V.arr(o.uncertain)
        .map((u) => V.obj(u))
        .filter((u): u is Record<string, unknown> => !!u)
        .map((u) => ({ text: V.str(u.text, 200) ?? '', reason: V.str(u.reason, 300) ?? '' }))
        .filter((u) => u.text)
        .slice(0, 20),
      isRelevant: o.isRelevant !== false,
    };
  }, { ...opts, images: [img], tier: opts.tier ?? 'default' });
}

// ——— 2. Segmentering når reglene ikke finner oppgaver ———

export interface AiSegTask {
  taskNo: number;
  sub: string;
  pdfPages: number[];
  intro: string;
  text: string;
  points?: number;
  pointsQuote?: string;
}

export async function segmentWithAi(pages: { pdfPage: number; text: string }[], opts: AiOpts = {}): Promise<AiResult<AiSegTask[]>> {
  const body = pages.map((p) => `--- PDF-side ${p.pdfPage} ---\n${p.text}`).join('\n');
  const prompt = `${DATA_RULE}

Nedenfor er teksten fra et eksamenssett, side for side. Del det i oppgaver og deloppgaver.
Regler: Kopier oppgavetekst ordrett (ikke omskriv). Felles innledning for en oppgave legges i «intro» på hver deloppgave i den oppgaven. Oppgi alle PDF-sider deloppgaven står på. Poeng tas bare med hvis de står i teksten; kopier da nøyaktig ordlyd i «pointsQuote». Oppgaver uten deloppgaver får sub "".
${asData('EKSAMEN', body, 40000)}
Svar bare med JSON: {"tasks":[{"taskNo":1,"sub":"a","pdfPages":[1],"intro":"…","text":"…","points":10,"pointsQuote":"(10 poeng)"}]}`;
  return aiJson(prompt, (x) => {
    const o = V.obj(x);
    const tasks = V.arr(o?.tasks)
      .map((t) => V.obj(t))
      .filter((t): t is Record<string, unknown> => !!t)
      .map((t) => ({
        taskNo: V.num(t.taskNo) ?? 0,
        sub: (V.str(t.sub, 3) ?? '').toLowerCase().replace(/[^a-h]/g, ''),
        pdfPages: V.arr(t.pdfPages).map((p) => V.num(p)).filter((p): p is number => p !== null),
        intro: V.str(t.intro, 3000) ?? '',
        text: V.str(t.text, 4000) ?? '',
        points: V.num(t.points) ?? undefined,
        pointsQuote: V.str(t.pointsQuote, 80) ?? undefined,
      }))
      .filter((t) => t.taskNo > 0 && t.text);
    return tasks.length ? tasks : 'fant ingen oppgaver';
  }, { ...opts, tier: 'default' });
}

// ——— 3. Analyse av deloppgaver ———

export interface AiSubtaskAnalysis {
  label: string;
  assignment: string;
  topics: string[];
  skills: string[];
  taskType: TaskType[];
  formulas: { expr: string; meaning: string; assumptions?: string; why?: string }[];
  prerequisites: string[];
  criteria: { text: string; basis: CriterionBasis }[];
  misconceptions: string[];
  variation: string[];
  familyGuess: { knownFamilyId: string | null; proposedName: string };
  certainty: { level: 'høy' | 'middels' | 'lav'; basis: string; uncertainties: string[] };
  timeMinutes?: number;
}

const TASK_TYPES = ['beregning', 'utledning', 'tolkning', 'tegning', 'sammenlikning', 'drøfting', 'flervalg', 'forklaring'] as const;

export async function analyzeSubtasksAi(input: { course: string; docLabel: string; docType: string; tasks: { label: string; intro: string; text: string; pages: number[]; figureNotes: string[] }[]; officialCriteria?: Record<string, string[]> }, opts: AiOpts = {}): Promise<AiResult<AiSubtaskAnalysis[]>> {
  const fam = FAMILIES.map((f) => `- ${f.id}: ${f.name}`).join('\n');
  const skills = SKILLS.map((s) => `- ${s.id}: ${s.name}`).join('\n');
  const body = input.tasks.map((t) => `### Deloppgave ${t.label} (PDF-side ${t.pages.join(', ')})\nInnledning: ${t.intro || '(ingen)'}\nTekst: ${t.text}${t.figureNotes.length ? `\nFigurer: ${t.figureNotes.join(' | ')}` : ''}${input.officialCriteria?.[t.label] ? `\nOffisielle kriterier fra koblet sensorveiledning: ${input.officialCriteria[t.label].join(' | ')}` : ''}`).join('\n\n');
  const prompt = `${DATA_RULE}

Du analyserer deloppgaver fra eksamenssettet «${input.docLabel}» i faget «${input.course}» for en student som forbereder seg til eksamen. Vær presis og etterprøvbar.
Regler:
- Beskriv observerbar kompetanse: hva studenten faktisk må gjøre og vise.
- «criteria» er «Dette må svaret vise». Bruk basis «oppgavekrav» bare når kravet står uttrykkelig i oppgaveteksten, «faglig-tolkning» når du utleder det faglig, og «uavklart» når materialet ikke gir grunnlag. Ikke gjett sensors intensjon. Offisielle kriterier er allerede registrert separat; ikke gjenta dem.
- Ikke dikt opp poeng, karaktergrenser eller delpoeng.
- «formulas»: relevante uttrykk med symbolbetydning, forutsetninger og hvorfor de passer.
- «skills»: bruk ID-er fra listen når de passer, ellers kort fritekst.
- «familyGuess.knownFamilyId»: en av ID-ene under hvis oppgaven tydelig hører hjemme der, ellers null. «proposedName» skal være presist (f.eks. «Finne og tolke markedslikevekt fra tilbud og etterspørsel», ikke bare «marked»).
- «certainty.level»: høy/middels/lav med konkret begrunnelse og konkrete usikkerheter. Ikke oppgi prosenter.
Kjente oppgavefamilier:
${fam}
Kjente ferdigheter:
${skills}

${asData('DELOPPGAVER', body, 30000)}

Svar bare med JSON: {"subtasks":[{"label":"1a","assignment":"…","topics":["…"],"skills":["lik.betingelse"],"taskType":["beregning"],"formulas":[{"expr":"Qd = Qs","meaning":"…","assumptions":"…","why":"…"}],"prerequisites":["…"],"criteria":[{"text":"…","basis":"oppgavekrav"}],"misconceptions":["…"],"variation":["…"],"familyGuess":{"knownFamilyId":null,"proposedName":"…"},"certainty":{"level":"middels","basis":"…","uncertainties":["…"]},"timeMinutes":8}]}`;
  return aiJson(prompt, (x) => {
    const o = V.obj(x);
    const list = V.arr(o?.subtasks)
      .map((t) => V.obj(t))
      .filter((t): t is Record<string, unknown> => !!t)
      .map((t): AiSubtaskAnalysis => {
        const fg = V.obj(t.familyGuess) ?? {};
        const kid = V.str(fg.knownFamilyId, 40);
        const cert = V.obj(t.certainty) ?? {};
        return {
          label: V.str(t.label, 6) ?? '',
          assignment: V.str(t.assignment, 600) ?? '',
          topics: V.strs(t.topics, 6, 80),
          skills: V.strs(t.skills, 12, 120),
          taskType: V.strs(t.taskType, 5, 30).filter((y): y is TaskType => (TASK_TYPES as readonly string[]).includes(y)),
          formulas: V.arr(t.formulas)
            .map((f) => V.obj(f))
            .filter((f): f is Record<string, unknown> => !!f)
            .map((f) => ({ expr: V.str(f.expr, 200) ?? '', meaning: V.str(f.meaning, 400) ?? '', assumptions: V.str(f.assumptions, 400) ?? undefined, why: V.str(f.why, 400) ?? undefined }))
            .filter((f) => f.expr)
            .slice(0, 6),
          prerequisites: V.strs(t.prerequisites, 8, 160),
          criteria: V.arr(t.criteria)
            .map((c) => V.obj(c))
            .filter((c): c is Record<string, unknown> => !!c)
            .map((c) => ({ text: V.str(c.text, 400) ?? '', basis: V.oneOf(c.basis, ['oppgavekrav', 'faglig-tolkning', 'uavklart'] as const, 'faglig-tolkning') as CriterionBasis }))
            .filter((c) => c.text)
            .slice(0, 8),
          misconceptions: V.strs(t.misconceptions, 6, 240),
          variation: V.strs(t.variation, 6, 240),
          familyGuess: { knownFamilyId: kid && FAMILIES.some((f) => f.id === kid) ? kid : null, proposedName: V.str(fg.proposedName, 160) ?? '' },
          certainty: { level: V.oneOf(cert.level, ['høy', 'middels', 'lav'] as const, 'middels'), basis: V.str(cert.basis, 400) ?? '', uncertainties: V.strs(cert.uncertainties, 6, 240) },
          timeMinutes: V.num(t.timeMinutes) ?? undefined,
        };
      })
      .filter((t) => t.label);
    return list.length ? list : 'ingen deloppgaver i svaret';
  }, { ...opts, tier: opts.tier ?? 'default' });
}

// ——— 4. Oppgavefamilier for ukjente oppgaver ———

export interface AiFamily {
  name: string;
  description: string;
  members: string[];
  commonStructure: string[];
  surfaceOnly: string[];
  differences: { id: string; changes: string[] }[];
  difficultyNote: string;
}

export async function clusterFamiliesAi(items: { id: string; setLabel: string; label: string; text: string; assignment: string; skills: string[] }[], opts: AiOpts = {}): Promise<AiResult<AiFamily[]>> {
  const body = items.map((i) => `[${i.id}] ${i.setLabel} oppgave ${i.label}: ${i.text}\nOppdrag: ${i.assignment}\nFerdigheter: ${i.skills.join(', ')}`).join('\n\n');
  const prompt = `${DATA_RULE}

Grupper deloppgavene under i faglige oppgavefamilier: oppgaver som krever beslektet kompetanse og løsningsstruktur, uavhengig av oppgavenummer og kontekst. En deloppgave kan stå alene i sin familie.
For hver familie: et presist navn (f.eks. «Finne og tolke markedslikevekt fra tilbud og etterspørsel», ikke «marked»), hva som faktisk er felles i løsningsstrukturen, hva som bare er overflatelikhet, og hva som er endret per medlem (tall, kontekst, representasjon, ukjent størrelse, forutsetninger, metode, krav til forklaring). «difficultyNote» skal si tydelig at en eventuell forskjell i vanskelighetsgrad er en faglig vurdering hvis ikke materialet dokumenterer den.
${asData('DELOPPGAVER', body, 30000)}
Svar bare med JSON: {"families":[{"name":"…","description":"…","members":["id"],"commonStructure":["…"],"surfaceOnly":["…"],"differences":[{"id":"…","changes":["…"]}],"difficultyNote":"…"}]}`;
  const ids = new Set(items.map((i) => i.id));
  return aiJson(prompt, (x) => {
    const o = V.obj(x);
    const fams = V.arr(o?.families)
      .map((f) => V.obj(f))
      .filter((f): f is Record<string, unknown> => !!f)
      .map((f) => ({
        name: V.str(f.name, 160) ?? '',
        description: V.str(f.description, 600) ?? '',
        members: V.strs(f.members, 50, 80).filter((m) => ids.has(m)),
        commonStructure: V.strs(f.commonStructure, 8, 240),
        surfaceOnly: V.strs(f.surfaceOnly, 8, 240),
        differences: V.arr(f.differences)
          .map((d) => V.obj(d))
          .filter((d): d is Record<string, unknown> => !!d)
          .map((d) => ({ id: V.str(d.id, 80) ?? '', changes: V.strs(d.changes, 8, 240) }))
          .filter((d) => ids.has(d.id)),
        difficultyNote: V.str(f.difficultyNote, 400) ?? '',
      }))
      .filter((f) => f.name && f.members.length);
    return fams.length ? fams : 'ingen familier';
  }, { ...opts, tier: 'default' });
}

// ——— 5. Håndskrift ———

export interface HandwritingReading {
  steps: { text: string; legible: 'sikker' | 'usikker' | 'uleselig'; alternatives: string[]; region?: { x: number; y: number; w: number; h: number } }[];
  note: string;
}

export async function readHandwriting(img: Blob, taskText: string, opts: AiOpts = {}): Promise<AiResult<HandwritingReading>> {
  const prompt = `${DATA_RULE}

Bildet viser en students håndskrevne utregning til denne oppgaven:
${asData('OPPGAVE', taskText, 3000)}
Les av hver linje i utregningen, i rekkefølge, som ren tekst (f.eks. «120 − 2P = 20 + 3P»). IKKE rett feil: skriv det som faktisk står, også når det er matematisk galt. Ikke fyll inn manglende steg.
For hver linje: «legible» er «sikker» bare hvis alle tegn er tydelige; «usikker» hvis minst ett tegn kan leses på flere måter (oppgi alternativer, f.eks. «−2P» og «+2P», eller «500» og «50»); «uleselig» hvis du ikke kan lese linjen. Oppgi omtrentlig område i bildet (x, y, w, h mellom 0 og 1, y fra toppen).
Svar bare med JSON: {"steps":[{"text":"…","legible":"sikker","alternatives":[],"region":{"x":0.1,"y":0.1,"w":0.5,"h":0.08}}],"note":"…"}`;
  return aiJson(prompt, (x) => {
    const o = V.obj(x);
    const steps = V.arr(o?.steps)
      .map((s) => V.obj(s))
      .filter((s): s is Record<string, unknown> => !!s)
      .map((s) => {
        const r = V.obj(s.region);
        const region = r && [r.x, r.y, r.w, r.h].every((v) => V.num(v) !== null) ? { x: V.num(r.x)!, y: V.num(r.y)!, w: V.num(r.w)!, h: V.num(r.h)! } : undefined;
        return { text: V.str(s.text, 300) ?? '', legible: V.oneOf(s.legible, ['sikker', 'usikker', 'uleselig'] as const, 'usikker'), alternatives: V.strs(s.alternatives, 4, 120), region };
      })
      .filter((s) => s.text || s.legible === 'uleselig');
    return steps.length ? { steps, note: V.str(o?.note, 400) ?? '' } : 'ingen linjer';
  }, { ...opts, images: [img], tier: 'default', cache: false });
}

// ——— 6. Vurdering av forklaringer ———

export interface ExplanationAssessment {
  criteria: { id: string; verdict: 'oppfylt' | 'delvis' | 'ikke-oppfylt' | 'uavklart'; evidence: string; comment: string }[];
  summary: string;
  uncertainty: string;
  /** Hva som allerede er bra. */
  strengths?: string;
  /** 2–3 konkrete forbedringer for full uttelling. */
  improvements?: string[];
}

export async function assessExplanationAi(input: { task: string; prompt: string; rubric: { id: string; text: string; basis: string }[]; answer: string; modelAnswer?: string }, opts: AiOpts = {}): Promise<AiResult<ExplanationAssessment>> {
  const rub = input.rubric.map((r) => `- ${r.id} (${r.basis}): ${r.text}`).join('\n');
  const prompt = `${DATA_RULE}

Vurder en students forklaring mot vurderingsrammen. Dette er en foreløpig AI-vurdering, ikke en offisiell sensur.
Regler: Vurder hvert kriterium for seg. «oppfylt» krever at studenten faktisk sier det (sitér kort i «evidence»). Godta andre formuleringer og andre faglig forsvarlige måter å si det samme på. «delvis» når tanken er der, men ufullstendig. «uavklart» når svaret er tvetydig eller du ikke kan avgjøre det. Ikke straff språkfeil som ikke påvirker innholdet. Ikke gi poeng eller karakter.
Oppgave: ${input.task}
Deloppgave: ${input.prompt}
Vurderingsramme:
${rub}
${input.modelAnswer ? `Eksempel på et godt svar (bare til sammenlikning, andre svar kan være like gode): ${input.modelAnswer}` : ''}
${asData('STUDENTSVAR', input.answer, 5000)}
Skriv som en erfaren sensor som vil hjelpe studenten å få full uttelling neste gang: konkret, faglig og på norsk.
Svar bare med JSON: {"criteria":[{"id":"k1","verdict":"oppfylt","evidence":"kort sitat fra svaret","comment":"hva som mangler eller er upresist"}],"summary":"2–4 setninger: helhetsinntrykk målt mot det sensor ser etter","strengths":"det som allerede er bra (1–2 setninger)","improvements":["konkret forbedring 1","konkret forbedring 2"],"uncertainty":"hva som eventuelt er usikkert i vurderingen"}`;
  const ids = new Set(input.rubric.map((r) => r.id));
  return aiJson(prompt, (x) => {
    const o = V.obj(x);
    const criteria = V.arr(o?.criteria)
      .map((c) => V.obj(c))
      .filter((c): c is Record<string, unknown> => !!c)
      .map((c) => ({ id: V.str(c.id, 20) ?? '', verdict: V.oneOf(c.verdict, ['oppfylt', 'delvis', 'ikke-oppfylt', 'uavklart'] as const, 'uavklart'), evidence: V.str(c.evidence, 400) ?? '', comment: V.str(c.comment, 400) ?? '' }))
      .filter((c) => ids.has(c.id));
    if (!criteria.length) return 'ingen kriterier vurdert';
    return { criteria, summary: V.str(o?.summary, 1200) ?? '', uncertainty: V.str(o?.uncertainty, 400) ?? '', strengths: V.str(o?.strengths, 600) ?? '', improvements: V.strs(o?.improvements, 4, 400) };
  }, { ...opts, tier: 'default', cache: false });
}

// ——— 7. Læreren ———

export const TUTOR_RULES = tutorRules('faget', 'økonomi');

/** Lærerens grunnregler, tilpasset faget. */
export function tutorRules(courseName: string, domain: string): string {
  const field = domain === 'elektro' ? 'elektriske kretser' : domain === 'digital' ? 'digitalteknikk' : domain === 'org' ? 'organisasjonsatferd og ledelse' : 'samfunnsøkonomi';
  const orgRules =
    domain === 'org'
      ? `
Om faget: eksamen er fem likeverdige essayspørsmål på tre timer uten hjelpemidler. Sensor gir uttelling for begreper definert i samsvar med pensum, relevante teorier og modeller (med navn på forfattere), forskning, gode eksempler, struktur og selvstendig drøfting.
- Bruk eksempler fra en vanlig arbeidsplass (butikk, sykehus, kontor, barnehage, studiehverdagen) for å gjøre teorien konkret.
- Når du forklarer en modell, beskriv delene i en fast rekkefølge, slik studenten kan tegne den.
- Du har ikke lærebøkene. Skriv definisjoner med egne ord, og be studenten sjekke ordlyden mot pensum når det er viktig.`
      : '';
  return `Du er en erfaren og tålmodig faglærer i ${courseName} (${field}) i Eksamensverksted, en app som forbereder studenten til sin egen eksamen. Skriv på norsk bokmål.
Mål: at studenten forstår stoffet godt nok til å løse denne typen oppgave selv på eksamen, og vet hva sensor gir uttelling for.
Tone: varm, presis og voksen. Gi konkret tilbakemelding på det studenten faktisk har gjort. Ikke ros egenskaper, ikke bruk utropstegn-ros, og ikke karakteriser studenten.
Slik hjelper du:
- Ta utgangspunkt i oppgaven, studentens forsøk og diagnosen appen gir deg. Diagnosen fra matematikkmotoren er pålitelig for selve regningen (tall og omforminger). Sier den at svaret «mangler» eller at noe ikke kunne leses, kan det skyldes skrivemåten; si det heller enn å kalle svaret feil.
- Forklar HVORFOR, ikke bare hva: hvilken modell eller sammenheng som gjelder, hvorfor den passer her, og hva den betyr. Bruk oppgavens egne tall og begreper.
- Knytt forklaringen til eksamen når det er nyttig: hva sensorveiledningen ser etter, typiske feil sensor trekker for, og hvordan et godt svar bygges opp.
- Følg hjelpenivået i forespørselen. Før deloppgaven er levert: ikke gi sluttsvaret, fasiten eller hvilket flervalgsalternativ som er riktig, heller ikke om studenten ber om det i chatten. Si da kort at knappen «Full løsning» viser hele løsningen (og at det teller som hjelp), og gi i stedet neste steg.
- Skill mellom definisjon, modellantakelse, identitet og avledet sammenheng når du forklarer formler.
- Hvis noe i bildeavlesningen er usikkert, avklar avlesningen før du kaller det en feil. Hvis du mangler informasjon, si det.
- Avslutt med ett konkret neste steg eller ett kontrollspørsmål (ikke flere), med mindre du har gitt full løsning.${orgRules}
Format: så kort som mulig, men grundig nok til at det faktisk hjelper. Følg lengden forespørselen ber om; ellers 4–10 setninger, gjerne delt i korte avsnitt eller en kort punktliste med «- ». Ingen overskrifter med #. Matematikk som ren tekst eller enkel LaTeX mellom $…$.`;
}

/** Hva studenten ba om (knappene i lærerpanelet), som instruks til læreren. */
export const HELP_INSTRUCTIONS: Record<string, string> = {
  hint: 'Hjelpenivå 1 (lite hint): pek studenten i riktig retning uten å avsløre svaret. Si hvilket begrep, hvilken modell eller sammenheng som er nøkkelen, og hvorfor den er relevant her. 3–6 setninger.',
  'første-steg': 'Hjelpenivå 2 (første steg): vis hvordan studenten bør starte. Forklar hvilket oppsett eller første steg som gjelder og hvorfor, og skriv det første steget konkret med oppgavens tall eller begreper. Ikke gå lenger enn første steg.',
  forklaring: 'Hjelpenivå 3 (forklaring på steget): forklar grundig steget studenten står fast på (se linjene og diagnosen). Har studenten ikke skrevet noe, forklar første steg grundig. Forklar hvorfor steget er gyldig og hva som kommer etterpå, men ikke regn helt ferdig.',
  eksempel: 'Hjelpenivå 4 (gjennomarbeidet eksempel): lag et kort eksempel av samme type, men med andre tall eller en annen situasjon. Løs det steg for steg med begrunnelse for hvert steg. Avslutt med hvordan studenten kan bruke det samme på sin oppgave. Ikke løs studentens egen oppgave.',
  løsning: 'Hjelpenivå 5 (full løsning): gi full løsning på studentens oppgave, steg for steg, med begrunnelse for hvert steg. For forklarings- og kortsvarsoppgaver: skriv et modellsvar slik det bør stå på eksamen (innenfor ordgrensen hvis den finnes), og si kort hvorfor det gir full uttelling. Nevn til slutt de vanligste feilene sensor trekker for.',
  tekst: 'Studenten vil forstå oppgaveteksten: forklar hva det egentlig spørres om, hvilke opplysninger og nøkkelord som er viktige, og hva et svar må inneholde for å svare på oppgaven. Ikke løs oppgaven.',
  formel: 'Studenten vil velge riktig modell eller formel: si hvilken modell, formel eller teori som passer, hvorfor akkurat den passer her, og hva symbolene betyr i denne oppgaven. Ikke regn ut svaret.',
  videre: 'Studenten vil regne videre: se på linjene og diagnosen, forklar hva neste steg er og hvorfor. Hvis et steg er feil, forklar feilen først.',
  tolke: 'Studenten vil tolke svaret: forklar hva resultatet betyr i situasjonen (enhet, rimelighet, økonomisk eller fysisk betydning), og hvordan det bør formuleres i et eksamenssvar.',
  utelukk: 'Flervalg: vis fremgangsmåten for å utelukke alternativer: hvilke kjennetegn i et alternativ som avslører at det blander begreper, snur en sammenheng eller gjelder en annen modell. Gi studenten ett spørsmål å stille til hvert alternativ. Ikke vurder alternativene ett for ett, og ikke si hvilket som er riktig.',
  begrep: 'Flervalg: forklar hvilket begrep eller hvilken modell spørsmålet tester, og hva man må vite om det for å svare. Ikke si hvilket alternativ som er riktig.',
  krav: 'Hva må et svar på denne oppgaven inneholde for full uttelling? Bruk sensorveiledningen og vurderingsrammen hvis de finnes. Gi stikkord og en god rekkefølge for svaret, ikke ferdig tekst.',
  struktur: 'Vis hvordan et godt eksamenssvar på denne oppgaven bør bygges opp (innledning/definisjon, modell eller figur, mekanisme, konklusjon), med stikkord tilpasset oppgaven. Ikke skriv ferdig svar.',
  utkast: 'Gi tilbakemelding på studentens utkast (står i konteksten): hva som allerede er bra, hva som mangler eller er upresist for full uttelling målt mot sensorveiledningen eller vurderingsrammen, og 2–3 konkrete forbedringer. Ikke skriv svaret for studenten.',
};

export async function tutorReply(context: string, history: { role: 'user' | 'assistant'; content: string }[], message: string, opts: AiOpts & { rules?: string } = {}): Promise<AiResult<string>> {
  const turns: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: `${opts.rules ?? TUTOR_RULES}\n\n${DATA_RULE}\n\nKontekst fra appen (oppgave, sensorveiledning, forsøk, diagnose, hjelpenivå):\n${asData('KONTEKST', context, 16000)}\n\nSvar på studentens neste melding.` },
    ...history.slice(-12),
    { role: 'user', content: asData('STUDENT', message, 3000) },
  ];
  // Rollene må veksle og starte/slutte med user; plattformen slår sammen like roller.
  return aiText(turns, { ...opts, tier: opts.tier ?? 'default', cache: false });
}

/** Svar på en av hjelpeknappene (hjelpetrinn eller «står fast på»). */
export async function tutorHelpAi(kind: string, context: string, history: { role: 'user' | 'assistant'; content: string }[], opts: AiOpts & { rules?: string } = {}): Promise<AiResult<string>> {
  const instr = HELP_INSTRUCTIONS[kind] ?? HELP_INSTRUCTIONS.hint;
  const turns: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: `${opts.rules ?? TUTOR_RULES}\n\n${DATA_RULE}\n\nKontekst fra appen (oppgave, sensorveiledning, forsøk, diagnose, hjelpenivå):\n${asData('KONTEKST', context, 16000)}\n\nTidligere samtale følger. Svar deretter på forespørselen.` },
    ...history.slice(-8),
    { role: 'user', content: `Forespørsel fra studenten (knapp i appen): ${instr}` },
  ];
  return aiText(turns, { ...opts, tier: opts.tier ?? (kind === 'løsning' || kind === 'eksempel' ? 'complex' : 'default'), cache: false });
}

export async function explainStyleAi(style: 'kort' | 'analogi' | 'utledning' | 'annerledes', context: string, opts: AiOpts & { rules?: string } = {}): Promise<AiResult<string>> {
  const instr: Record<string, string> = {
    kort: 'Gi en kort, presis forklaring (4–7 setninger) av hovedpoenget med ett konkret eksempel med andre tall eller en annen situasjon enn i oppgaven.',
    analogi: 'Gi en hverdagslig analogi (4–7 setninger), koble den tydelig til modellen i oppgaven, og si hvor analogien slutter å passe.',
    utledning: 'Vis hvor formelen eller sammenhengen kommer fra, steg for steg, og si for hvert steg om det er en definisjon, en modellantakelse, en identitet eller en omforming.',
    annerledes: 'Forklar samme poeng på en helt annen måte enn standardforklaringen: nye ord, et nytt lite eksempel og gjerne en annen innfallsvinkel (figur i ord, tallforsøk eller motsatt tilfelle).',
  };
  const prompt = `${opts.rules ?? TUTOR_RULES}\n\n${DATA_RULE}\n\n${instr[style]}\nIkke gi fasit på studentens oppgave.\n${asData('KONTEKST', context, 12000)}`;
  // «Forklar på en annen måte» skal gi noe nytt hver gang; de andre kan gjenbrukes en kort stund.
  return aiText(prompt, { ...opts, tier: 'default', cache: style !== 'annerledes' });
}

export async function commentSketchAi(img: Blob, expected: string, opts: AiOpts = {}): Promise<AiResult<string>> {
  const prompt = `${TUTOR_RULES}\n\n${DATA_RULE}\n\nBildet er en students grafskisse. Den skal vise: ${expected}. Beskriv kort hva skissen viser (akser, kurver, skjæringspunkt), hva som stemmer og hva som eventuelt mangler. Hvis noe er uleselig, si det i stedet for å gjette. Høyst 5 setninger.`;
  return aiText(prompt, { ...opts, images: [img], tier: 'default', cache: false });
}

// ——— 8. Læringsutbytte ———

export async function mapOutcomesAi(outcomes: { code: string; text: string }[], opts: AiOpts = {}): Promise<AiResult<Record<string, string[]>>> {
  const fam = FAMILIES.map((f) => `- ${f.id}: ${f.name}`).join('\n');
  const prompt = `${DATA_RULE}\n\nKoble hvert læringsmål til oppgavefamiliene det dekker. Et læringsmål kan dekke null, én eller flere familier. Bare koble når familien faktisk trener målet.\nFamilier:\n${fam}\n${asData('LÆRINGSMÅL', outcomes.map((o) => `${o.code}: ${o.text}`).join('\n'), 6000)}\nSvar bare med JSON: {"map":{"LU1":["likevekt-lineaer"]}}`;
  return aiJson(prompt, (x) => {
    const o = V.obj(V.obj(x)?.map);
    if (!o) return 'mangler map';
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(o)) out[k] = V.strs(v, 6, 40).filter((id) => FAMILIES.some((f) => f.id === id));
    return out;
  }, { ...opts, tier: 'quick' });
}
