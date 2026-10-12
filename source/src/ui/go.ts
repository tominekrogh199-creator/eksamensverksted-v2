// Start en økt og gå rett til første oppgave (brukes fra flere skjermer).
import { store } from '../state/store';
import { planSession, planOriginalSession, startAttempt } from '../learning/actions';
import type { SubTask, Attempt } from '../domain/types';
import { originalTask } from '../learning/originals';

export function startSessionAndGo(opts: Parameters<typeof planSession>[0]) {
  const { session, tasks, note } = planSession(opts);
  if (!tasks.length) {
    store.toast(note ?? 'Fant ingen oppgaver for dette valget.', 'info');
    return;
  }
  if (note) store.toast(note, 'info');
  const att = startAttempt(tasks[0], opts.type === 'nivå' ? 'diagnose' : 'læring', session.id);
  store.navigate({ name: 'tren', attemptId: att.id, sessionId: session.id });
}

export function startOriginalsAndGo(opts: Parameters<typeof planOriginalSession>[0]) {
  const { session, tasks, note } = planOriginalSession(opts);
  if (!tasks.length) {
    store.toast(note ?? 'Fant ingen spørsmål å øve på.', 'info');
    return;
  }
  if (note) store.toast(note, 'info');
  const att = startAttempt(tasks[0], 'læring', session.id);
  store.navigate({ name: 'tren', attemptId: att.id, sessionId: session.id });
}


/** Øv på ett bestemt eksamensspørsmål (fra kartet eller analysen). */
export function practiceSubtask(st: SubTask) {
  const t = originalTask(st);
  if (!t) {
    store.toast('Dette spørsmålet har ikke nok tekst, fasit eller løsning til å øves på i appen. Se originalen i stedet.', 'info');
    return;
  }
  // Et uferdig forsøk på samme spørsmål fortsettes i stedet for å starte på nytt.
  const open = store.attempts().find((a: Attempt) => a.taskRef.id === t.id && a.status === 'pågår' && a.mode === 'læring');
  if (!open) store.upsert(t);
  const att = open ?? startAttempt(t, 'læring');
  store.navigate({ name: 'tren', attemptId: att.id });
}
