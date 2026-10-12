// Læreren i arbeidsflaten: hjelpetrinn, hurtigvalg, fritekst og forklaringsmåter.

import { useEffect, useRef, useState } from 'react';
import type { Attempt, GeneratedTask, GenPart, ChatMsg, PartAttempt } from '../../domain/types';
import { nowIso } from '../../domain/types';
import { store } from '../../state/store';
import { recordHelp } from '../../learning/actions';
import { HELP_LEVELS, nextStepHint, understandText, chooseFormula, interpretHint, offlineAnswer, buildTutorContext, tutorRulesFor } from '../../learning/tutor';
import { tutorReply, explainStyleAi, tutorHelpAi } from '../../ai/prompts';
import { aiAvailable } from '../../ai/client';
import { getFamily, familyShort } from '../../families';
import { RichText, Tex } from './Math';
import { Icon } from './Icon';
import { SpeakButton, MicButton } from './Voice';
import { Pill } from './common';

function stepsText(steps: { tex: string; text: string; why: string }[], withWhy: boolean): string {
  return steps.map((s, i) => `${i + 1}. ${s.tex ? `$${s.tex}$ ` : ''}${s.text}${withWhy && s.why ? ` – ${s.why}` : ''}`).join('\n');
}

export function addChat(att: Attempt, msg: Omit<ChatMsg, 'at'>): Attempt {
  const cur = store.get<Attempt>('attempt', att.id) ?? att;
  const chat = [...cur.chat, { ...msg, at: nowIso() }].slice(-80);
  return store.upsert({ ...cur, chat });
}

type QuickKind = 'tekst' | 'formel' | 'videre' | 'tolke' | 'utelukk' | 'begrep' | 'krav' | 'struktur' | 'utkast';

const QUICK_LABEL: Record<QuickKind, string> = {
  tekst: 'Forstå oppgaven',
  formel: 'Velge modell/formel',
  videre: 'Regne videre',
  tolke: 'Tolke svaret',
  utelukk: 'Gå gjennom alternativene',
  begrep: 'Hvilket begrep testes?',
  krav: 'Hva må svaret inneholde?',
  struktur: 'Hvordan bygge svaret',
  utkast: 'Se på utkastet mitt',
};

/** Hurtigvalg som passer deloppgavetypen. */
function quickKinds(part: GenPart, hasDraft: boolean): QuickKind[] {
  if (part.kind === 'flervalg') return ['tekst', 'begrep', 'utelukk'];
  if (part.kind === 'forklaring' && !part.targets?.length) return hasDraft ? ['tekst', 'krav', 'struktur', 'utkast'] : ['tekst', 'krav', 'struktur'];
  if (part.kind === 'graf') return ['tekst', 'formel', 'tolke'];
  return ['tekst', 'formel', 'videre', 'tolke'];
}

const LEVEL_KIND: Record<number, string> = { 1: 'hint', 2: 'første-steg', 3: 'forklaring', 4: 'eksempel', 5: 'løsning' };

export function TutorPanel({ att, task, part, onShowBoard, disabled, compact }: { att: Attempt; task: GeneratedTask; part: GenPart; onShowBoard: () => void; disabled?: boolean; compact?: boolean }) {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const msgs = att.chat.filter((m) => !m.partId || m.partId === part.id);
  const used = new Set(att.help.filter((h) => h.partId === part.id).map((h) => h.level));
  const pa = att.parts.find((p) => p.partId === part.id) ?? emptyPart(part.id);
  const fam = getFamily(task.familyKbId);
  const ai = aiAvailable();
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: store.ui.reducedMotion ? 'auto' : 'smooth' });
  }, [msgs.length, streaming]);
  useEffect(() => () => ctl.current?.abort(), []);

  const curAtt = () => store.get<Attempt>('attempt', att.id) ?? att;
  const curPa = () => curAtt().parts.find((p) => p.partId === part.id) ?? pa;
  const ctx = () => buildTutorContext(task, part, curPa(), curAtt(), store.evidence());
  const history = () =>
    curAtt()
      .chat.filter((c) => c.partId === part.id && c.role !== 'system')
      .slice(0, -1)
      .map((c) => ({ role: c.role === 'elev' ? ('user' as const) : ('assistant' as const), content: c.text }));

  /** Kjører en AI-forespørsel med strømming; faller tilbake til den faste teksten. */
  const runAi = async (call: (o: { signal: AbortSignal; onText: (t: string) => void }) => Promise<{ ok: boolean; data?: string; code?: string; message?: string }>, fallback: string) => {
    setBusy(true);
    setStreaming('');
    ctl.current = new AbortController();
    const r = await call({ signal: ctl.current.signal, onText: (t) => setStreaming(t) });
    setBusy(false);
    setStreaming(null);
    if (r.ok && r.data?.trim()) addChat(curAtt(), { role: 'lærer', text: r.data.trim(), basis: 'ai', partId: part.id });
    else if (r.code !== 'cancelled') addChat(curAtt(), { role: 'lærer', text: fallback + (r.message ? `\n\n(AI-læreren svarte ikke: ${r.message})` : ''), basis: 'regelbasert', partId: part.id });
  };

  const ladder = async (level: 1 | 2 | 3 | 4 | 5) => {
    const def = HELP_LEVELS.find((h) => h.level === level)!;
    let a = recordHelp(curAtt(), { level, type: def.type, partId: part.id });
    a = addChat(a, { role: 'elev', text: def.label, partId: part.id });
    const canned = cannedLevel(level, task, part, curPa());
    if (!ai) {
      addChat(a, { role: 'lærer', text: canned, basis: 'regelbasert', partId: part.id });
      return;
    }
    await runAi((o) => tutorHelpAi(LEVEL_KIND[level], ctx(), history(), { ...o, rules: tutorRulesFor(task) }), canned);
  };

  const quick = async (kind: QuickKind) => {
    let a = addChat(curAtt(), { role: 'elev', text: QUICK_LABEL[kind], partId: part.id });
    const level = kind === 'videre' || kind === 'utkast' ? 2 : 1;
    a = recordHelp(a, { level, type: kind === 'videre' ? 'første-steg' : 'hint', partId: part.id });
    const canned = cannedQuick(kind, task, part, curPa());
    if (!ai) {
      addChat(a, { role: 'lærer', text: canned, basis: 'regelbasert', partId: part.id });
      return;
    }
    await runAi((o) => tutorHelpAi(kind, ctx(), history(), { ...o, rules: tutorRulesFor(task) }), canned);
  };

  const explain = async (style: 'kort' | 'analogi' | 'utledning' | 'annerledes') => {
    const labels = { kort: 'Kort forklaring med eksempel', analogi: 'Hverdagslig forklaring', utledning: 'Hvor kommer formelen fra?', annerledes: 'Forklar på en annen måte' };
    let a = addChat(curAtt(), { role: 'elev', text: labels[style], partId: part.id });
    a = recordHelp(a, { level: style === 'utledning' ? 3 : 1, type: 'forklaring', partId: part.id });
    const canned = cannedExplain(style, task, part);
    if (!ai) {
      addChat(a, { role: 'lærer', text: canned, basis: 'regelbasert', partId: part.id });
      return;
    }
    await runAi((o) => explainStyleAi(style, ctx(), { ...o, rules: tutorRulesFor(task) }), canned);
  };

  const send = async (msg: string) => {
    const m = msg.trim();
    if (!m || busy) return;
    setText('');
    let a = addChat(curAtt(), { role: 'elev', text: m, partId: part.id });
    a = recordHelp(a, { level: 0, type: 'chat', partId: part.id, text: m.slice(0, 200) });
    const canned = offlineAnswer(m, task, part);
    if (!ai) {
      addChat(a, { role: 'lærer', text: canned, basis: 'regelbasert', partId: part.id });
      return;
    }
    await runAi((o) => tutorReply(ctx(), history(), m, { ...o, rules: tutorRulesFor(task) }), canned);
  };

  const kinds = quickKinds(part, !!pa.explanation?.trim());
  const levels = HELP_LEVELS.filter((h) => ai || cannedLevel(h.level, task, part, pa).trim().length > 0);

  return (
    <section className="tutor" aria-label="Læreren">
      <div className="tutor-head">
        <span className="avatar" aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <strong>Læreren</strong>
          <div className="xs muted">{ai ? 'AI-lærer med oppgaven, sensorveiledningen og arbeidet ditt som grunnlag' : 'Faste hjelpetrinn (AI er ikke tilgjengelig i denne visningen)'}</div>
        </div>
      </div>
      <div className="chat" ref={chatRef} aria-live="polite" style={compact ? { maxHeight: 300 } : undefined}>
        {!msgs.length ? (
          <div className="msg system">
            Spør om hva som helst i oppgaven, eller velg hva du står fast på. Trinn 1 gir et lite hint; trinn 5 gir hele løsningen. Hjelpen registreres som støtte i utviklingen din, men du blir ikke trukket for den.
          </div>
        ) : null}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role === 'elev' ? 'student' : m.role === 'lærer' ? 'teacher' : 'system'}`}>
            {m.role === 'lærer' ? (
              <div className="who">
                Læreren {m.basis === 'ai' ? <Pill tone="dashed">AI</Pill> : m.basis === 'demo' ? <Pill tone="demo">DEMO</Pill> : null}
              </div>
            ) : null}
            <div style={{ whiteSpace: 'pre-wrap' }}>
              <RichText text={m.text} />
            </div>
            {m.role === 'lærer' ? <SpeakButton text={m.text.replace(/\$([^$]+)\$/g, '$1')} /> : null}
          </div>
        ))}
        {streaming !== null ? (
          <div className="msg teacher">
            <div className="who">Læreren</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{streaming ? <RichText text={streaming} /> : <span className="muted">Tenker …</span>}</div>
          </div>
        ) : null}
      </div>
      <div className="stack" style={{ padding: '0 var(--s4) var(--s3)' }}>
        <div className="ladder" role="group" aria-label="Hjelpetrinn">
          {levels.map((h) => (
            <button key={h.level} className={used.has(h.level) ? 'used' : ''} onClick={() => void ladder(h.level)} disabled={disabled || busy} title={h.level >= 2 ? 'Registreres som støtte' : 'Lite hint'}>
              <span className="lvl">{h.level}</span>
              {h.label}
            </button>
          ))}
        </div>
        <div className="row" role="group" aria-label="Hva står du fast på?">
          <span className="xs muted">Står fast på:</span>
          {kinds.map((k) => (
            <button key={k} className="btn small ghost" onClick={() => void quick(k)} disabled={disabled || busy}>
              {QUICK_LABEL[k]}
            </button>
          ))}
        </div>
        <details className="disclosure">
          <summary className="small">Forklar på en annen måte</summary>
          <div className="row" style={{ paddingTop: 6 }}>
            <button className="btn small" onClick={() => void explain('kort')} disabled={disabled || busy}>
              Kort med eksempel
            </button>
            <button className="btn small" onClick={() => void explain('analogi')} disabled={disabled || busy}>
              Hverdagslig
            </button>
            {part.math || fam?.formulas.length ? (
              <button className="btn small" onClick={() => void explain('utledning')} disabled={disabled || busy}>
                Hvor kommer formelen fra?
              </button>
            ) : null}
            {ai ? (
              <button className="btn small" onClick={() => void explain('annerledes')} disabled={disabled || busy}>
                Helt annen forklaring
              </button>
            ) : null}
            {part.solution.length ? (
              <button
                className="btn small soft"
                onClick={() => {
                  recordHelp(curAtt(), { level: 5, type: 'vis-meg', partId: part.id });
                  onShowBoard();
                }}
                disabled={disabled}
              >
                <Icon name="play" size={14} /> Vis meg (tavle)
              </button>
            ) : null}
          </div>
        </details>
      </div>
      <div className="chat-input">
        <textarea
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Skriv et spørsmål, f.eks. «Hvorfor skifter kurven?» eller «Er dette nok for full uttelling?»"
          aria-label="Skriv til læreren"
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(text);
            }
          }}
        />
        <MicButton onText={(t) => setText((cur) => (cur ? cur + ' ' : '') + t)} />
        {busy ? (
          <button className="btn small" onClick={() => ctl.current?.abort()}>
            Stopp
          </button>
        ) : (
          <button className="btn primary small" onClick={() => void send(text)} disabled={disabled || !text.trim()} aria-label="Send">
            <Icon name="send" size={16} />
          </button>
        )}
      </div>
    </section>
  );
}

function emptyPart(partId: string): PartAttempt {
  return { partId, lines: [], explanation: '', resolutions: {}, confirmedReadings: {}, images: [], submitted: false } as unknown as PartAttempt;
}

/** Faste svar når AI ikke er tilgjengelig. Hvert trinn sier noe nytt (ingen gjentakelser). */
function cannedLevel(level: number, task: GeneratedTask, part: GenPart, pa: PartAttempt): string {
  const h = part.hints;
  const steps = part.solution.filter((x) => x.text || x.tex);
  const hasLines = (pa.lines ?? []).some((l) => l.text.trim());
  if (level === 1) return [h.small, part.kind === 'flervalg' ? 'Les alle alternativene før du velger, og stryk dem som blander sammen begreper.' : ''].filter(Boolean).join('\n\n');
  if (level === 2) {
    const first = steps[0];
    const ex = first ? `\n\nFørste steg: ${first.tex ? `$${first.tex}$ ` : ''}${first.text}${first.why ? `\nHvorfor: ${first.why}` : ''}` : '';
    return `${h.firstStep}${ex}`.trim();
  }
  if (level === 3) {
    const next = hasLines ? nextStepHint(part, pa) : '';
    const second = steps[1];
    const why = h.stepExplanation && h.stepExplanation !== h.firstStep ? h.stepExplanation : '';
    return [next && next !== h.firstStep ? next : '', why, !next && second ? `Neste steg etter det første: ${second.tex ? `$${second.tex}$ ` : ''}${second.text}${second.why ? ` – ${second.why}` : ''}` : ''].filter(Boolean).join('\n\n');
  }
  if (level === 4) {
    const w = h.workedExample;
    if (!w?.steps?.length) return '';
    return `${w.intro}\n${stepsText(w.steps, true)}\n\nPrøv nå selv med tallene i oppgaven.`;
  }
  if (!steps.length && !part.modelAnswer) return '';
  return `Full løsning:\n${stepsText(steps, true)}${part.modelAnswer ? `\n\nModellsvar:\n${part.modelAnswer}` : ''}\n\nNår du har lest løsningen, prøv en ny variant selv. Den viser om du klarer det uten hjelp.`;
}

function cannedQuick(kind: QuickKind, task: GeneratedTask, part: GenPart, pa: PartAttempt): string {
  switch (kind) {
    case 'tekst':
      return understandText(task, part);
    case 'formel':
      return chooseFormula(task, part);
    case 'videre':
      return nextStepHint(part, pa);
    case 'tolke':
      return interpretHint(task, part);
    case 'begrep': {
      const fam = getFamily(task.familyKbId);
      return fam ? `Spørsmålet hører til «${fam.name}». ${familyShort(fam, task.params ?? {}).text}` : part.hints.small;
    }
    case 'utelukk':
      return 'Ta alternativene ett for ett: Stemmer påstanden med modellen fra kurset? Blander den sammen to begreper (f.eks. skift i kurven og bevegelse langs kurven, nominell og reell, gjennomsnitt og marginal)? Stryk dem som ikke holder, og velg blant de som er igjen.';
    case 'krav':
    case 'struktur':
      return part.rubric?.length
        ? `Et godt svar bør få med:\n${part.rubric.map((r) => `- ${r.text}${r.required ? '' : ' (ekstra)'}`).join('\n')}\n\nBygg svaret slik: definer begrepet, vis modellen eller mekanismen, og avslutt med hva det betyr i situasjonen.`
        : 'Bygg svaret slik: definer nøkkelbegrepet, forklar mekanismen eller modellen (gjerne med en figur), og avslutt med en tydelig konklusjon som svarer på spørsmålet.';
    case 'utkast':
      return part.rubric?.length ? `Sjekk utkastet mot punktene:\n${part.rubric.map((r) => `- ${r.text}`).join('\n')}\n\nMangler et punkt, skriv én setning til om det.` : 'Les utkastet høyt: svarer hver setning på spørsmålet? Har du definert begrepene og forklart hvorfor, ikke bare hva?';
  }
}

function cannedExplain(style: 'kort' | 'analogi' | 'utledning' | 'annerledes', task: GeneratedTask, part: GenPart): string {
  const fam = getFamily(task.familyKbId);
  if (style === 'kort' && fam) {
    const s = familyShort(fam, task.params ?? {});
    if (s.text) return `${s.text}${s.example ? `\n\nEksempel: ${s.example}` : ''}`;
  }
  if ((style === 'analogi' || style === 'annerledes') && fam) return `${fam.explanations.analogy.text}\n\nHvor analogien slutter å passe: ${fam.explanations.analogy.limits}`;
  if (style === 'utledning' && fam) {
    const f = fam.formulas.find((x) => x.id === fam.explanations.derivationFormulaId);
    if (f?.derivation) return `$${f.tex}$ er ${f.kind}. ${f.kindWhy}\n${f.derivation.map((d, i) => `${i + 1}. $${d.tex}$ ${d.text}${d.kind ? ` (${d.kind})` : ''}${d.why ? ` – ${d.why}` : ''}`).join('\n')}`;
  }
  return part.hints.stepExplanation || part.hints.small;
}


export function StepList({ steps }: { steps: { tex: string; text: string; why: string }[] }) {
  return (
    <ol className="stack sm" style={{ paddingLeft: 18, margin: 0 }}>
      {steps.map((s, i) => (
        <li key={i}>
          {s.tex ? <Tex tex={s.tex} /> : null} <span className="small">{s.text}</span>
          {s.why ? (
            <details className="disclosure">
              <summary className="xs">Hvorfor?</summary>
              <p className="small muted">{s.why}</p>
            </details>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
