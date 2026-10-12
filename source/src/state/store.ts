// Global tilstand: alle entiteter i minnet, skrevet til valgt lagring med en
// kø som samler raske endringer til én skriving per dokument.

import { useSyncExternalStore } from 'react';
import type { Entity, EntityKind, Course, SourceDoc, PageRec, SubTask, Family, GeneratedTask, Attempt, Evidence, SessionRec, ExamSim, SettingsRec } from '../domain/types';
import { entityKey, nowIso } from '../domain/types';
import type { Backend } from '../storage/backend';
import type { Platform } from '../storage/platform';
import { outbox } from '../storage/outbox';

export type Route =
  | { name: 'velkommen' }
  | { name: 'start' }
  | { name: 'arkiv'; docId?: string }
  | { name: 'kart'; tab?: 'familier' | 'nummer' | 'pensum' | 'prioritet'; familyKey?: string; position?: number }
  | { name: 'tren'; attemptId?: string; sessionId?: string; setup?: { families?: string[]; level?: number | 'blandet'; style?: string; count?: number; minutes?: number; mode?: string } }
  | { name: 'formel'; formulaId?: string }
  | { name: 'utvikling'; skillId?: string }
  | { name: 'eksamen'; examId?: string }
  | { name: 'innstillinger' }
  | { name: 'status' }
  | { name: 'ommeg' }
  | { name: 'laer'; kbId: string; part?: 'leksjon' | 'quiz' }
  | { name: 'konkurranse'; chapter: string };

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'ok' | 'feil';
}

export interface SourceView {
  docId: string;
  page: number;
  highlight?: [number, number, number, number][];
  quote?: string;
  label?: string;
}

export type AiStatus = 'ukjent' | 'tilgjengelig' | 'ikke-tilgjengelig' | 'avslått' | 'feil';

interface UiState {
  ready: boolean;
  loadingNote: string;
  route: Route;
  activeCourseId?: string;
  toasts: Toast[];
  source?: SourceView;
  aiStatus: AiStatus;
  aiNote?: string;
  storageKind: Backend['kind'] | 'ukjent';
  storageNote: string;
  writeError?: string;
  loadError?: string;
  loadErrorLocal?: boolean;
  busy: Record<string, string>;
  reducedMotion: boolean;
}

interface PendingWrite {
  op: 'put' | 'del';
  e: Entity;
  seq: number;
  tries: number;
  nextAt: number;
  shrunk?: boolean;
}

export interface SaveState {
  pending: number;
  failed: number;
  state: 'lagret' | 'lagrer' | 'venter' | 'feil' | 'frakoblet';
  lastSavedAt?: number;
  message?: string;
}

/** Brukerens eget arbeid skrives før store mengder fra dokumentanalysen. */
const PRIORITY: Record<string, number> = { attempt: 0, evidence: 0, session: 0, settings: 0, profile: 0, game: 0, course: 1, gen: 1, exam: 1, lesson: 1, family: 2, doc: 2, subtask: 3, page: 3 };
const MAX_PARALLEL = 3;
const MIN_GAP_MS = 110;

function signature(e: Entity): string {
  const { updatedAt: _u, ...rest } = e as Entity & { updatedAt?: string };
  void _u;
  return JSON.stringify(rest);
}

class Store {
  entities = new Map<string, Entity>();
  version = 0;
  ui: UiState = {
    ready: false,
    loadingNote: 'Starter …',
    route: { name: 'start' },
    toasts: [],
    aiStatus: 'ukjent',
    storageKind: 'ukjent',
    storageNote: '',
    busy: {},
    reducedMotion: typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  };
  backend: Backend | null = null;
  platform: Platform | null = null;
  private listeners = new Set<() => void>();
  private pending = new Map<string, PendingWrite>();
  private inflight = new Map<string, PendingWrite>();
  /** Innholdet (uten updatedAt) slik det sist ble lest fra eller bekreftet av lagringen. */
  private lastWritten = new Map<string, string>();
  private failedWrites = new Map<string, string>();
  private pumpTimer: ReturnType<typeof setTimeout> | null = null;
  private pumpAt = 0;
  private pauseUntil = 0;
  private pauseLevel = 0;
  private lastStart = 0;
  private seqBase = Date.now() * 1000;
  private seq = 0;
  private cache = new Map<string, { v: number; val: unknown }>();
  private toastId = 0;
  private saveListeners = new Set<() => void>();
  save: SaveState = { pending: 0, failed: 0, state: 'lagret' };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;

  bump() {
    this.version++;
    this.cache.clear();
    for (const l of this.listeners) l();
  }

  setUi(patch: Partial<UiState>) {
    this.ui = { ...this.ui, ...patch };
    this.bump();
  }

  navigate(route: Route) {
    this.ui = { ...this.ui, route, source: undefined };
    try {
      const top = route.name;
      if (typeof history !== 'undefined') history.replaceState(null, '', '#' + top);
    } catch {
      /* hash er valgfri */
    }
    this.bump();
    if (typeof window !== 'undefined') window.scrollTo?.({ top: 0, behavior: 'instant' as ScrollBehavior });
  }

  toast(text: string, tone: Toast['tone'] = 'info') {
    const id = ++this.toastId;
    this.ui = { ...this.ui, toasts: [...this.ui.toasts, { id, text, tone }] };
    this.bump();
    setTimeout(() => {
      this.ui = { ...this.ui, toasts: this.ui.toasts.filter((t) => t.id !== id) };
      this.bump();
    }, tone === 'feil' ? 7000 : 4200);
  }

  setBusy(key: string, note: string | null) {
    const busy = { ...this.ui.busy };
    if (note) busy[key] = note;
    else delete busy[key];
    this.ui = { ...this.ui, busy };
    this.bump();
  }

  load(list: Entity[]) {
    for (const e of list) {
      const k = entityKey(e);
      this.entities.set(k, e);
      this.lastWritten.set(k, signature(e));
    }
    this.bump();
  }

  /** Slår inn nyere versjoner fra en annen enhet uten å overskrive ulagrede endringer her. */
  mergeRemote(list: Entity[]): number {
    let n = 0;
    for (const e of list) {
      const k = entityKey(e);
      if (this.pending.has(k) || this.inflight.has(k)) continue;
      const cur = this.entities.get(k);
      if (cur && (cur.updatedAt ?? '') >= (e.updatedAt ?? '')) continue;
      this.entities.set(k, e);
      this.lastWritten.set(k, signature(e));
      n++;
    }
    if (n) this.bump();
    return n;
  }

  /** Skrivinger som ikke ble bekreftet forrige gang (utboksen), sendes på nytt hvis de er nyere enn det som ligger lagret. */
  async replayOutbox(): Promise<number> {
    const entries = await outbox.all();
    let n = 0;
    for (const w of entries) {
      const cur = this.entities.get(w.key);
      if (w.op === 'put') {
        if (cur && (cur.updatedAt ?? '') >= (w.e.updatedAt ?? '')) {
          void outbox.remove(w.key, w.seq);
          continue;
        }
        this.entities.set(w.key, w.e);
      } else {
        if (!cur) {
          void outbox.remove(w.key, w.seq);
          continue;
        }
        this.entities.delete(w.key);
      }
      this.pending.set(w.key, { op: w.op, e: w.e, seq: w.seq, tries: 0, nextAt: 0 });
      n++;
    }
    if (n) {
      this.bump();
      this.pump();
    }
    return n;
  }

  get<T extends Entity>(kind: T['kind'], id: string | undefined): T | undefined {
    if (!id) return undefined;
    return this.entities.get(`${kind}:${id}`) as T | undefined;
  }

  upsert<T extends Entity>(e: T, opts: { silent?: boolean; localOnly?: boolean } = {}): T {
    // Et element uten type eller id (f.eks. et dokument som ble slettet mens det ble analysert) lagres aldri.
    if (!e || !e.kind || !e.id) return e;
    const next = { ...e, updatedAt: nowIso() } as T;
    const key = entityKey(next);
    this.entities.set(key, next);
    if (!opts.localOnly) this.queue(key, 'put', next);
    if (!opts.silent) this.bump();
    return next;
  }

  upsertMany(list: Entity[]) {
    for (const e of list) this.upsert(e, { silent: true });
    this.bump();
  }

  remove(e: Pick<Entity, 'kind' | 'id'>) {
    const key = entityKey(e);
    const cur = this.entities.get(key);
    this.entities.delete(key);
    if (cur) this.queue(key, 'del', cur);
    this.bump();
  }

  private queue(key: string, op: 'put' | 'del', e: Entity) {
    if (op === 'put' && !this.pending.has(key) && !this.inflight.has(key) && this.lastWritten.get(key) === signature(e)) return;
    const w: PendingWrite = { op, e, seq: this.seqBase + ++this.seq, tries: 0, nextAt: 0 };
    this.pending.set(key, w);
    this.failedWrites.delete(key);
    if (this.backend?.kind === 'sky') void outbox.put({ key, op, e, seq: w.seq, at: Date.now() });
    this.schedule(400);
    this.emitSave();
  }

  private schedule(ms: number) {
    const at = Date.now() + ms;
    if (this.pumpTimer && this.pumpAt <= at) return;
    if (this.pumpTimer) clearTimeout(this.pumpTimer);
    this.pumpAt = at;
    this.pumpTimer = setTimeout(() => {
      this.pumpTimer = null;
      this.pump();
    }, Math.max(0, ms));
  }

  /** Starter skrivinger: høyst tre samtidig, med litt avstand, brukerens arbeid først. */
  private pump(force = false) {
    if (!this.backend || this.save.state === 'frakoblet') return;
    const now = Date.now();
    if (now < this.pauseUntil && !force) {
      this.schedule(this.pauseUntil - now);
      return;
    }
    while (this.inflight.size < MAX_PARALLEL && this.pending.size) {
      const gap = Date.now() - this.lastStart;
      if (gap < MIN_GAP_MS && !force) {
        this.schedule(MIN_GAP_MS - gap);
        break;
      }
      let best: [string, PendingWrite] | null = null;
      let soonest = Infinity;
      for (const [k, w] of this.pending) {
        if (this.inflight.has(k)) continue;
        if (w.nextAt > Date.now() && !force) {
          soonest = Math.min(soonest, w.nextAt);
          continue;
        }
        if (!best || (PRIORITY[w.e.kind] ?? 2) < (PRIORITY[best[1].e.kind] ?? 2) || ((PRIORITY[w.e.kind] ?? 2) === (PRIORITY[best[1].e.kind] ?? 2) && w.seq < best[1].seq)) best = [k, w];
      }
      if (!best) {
        if (soonest < Infinity) this.schedule(soonest - Date.now());
        break;
      }
      this.lastStart = Date.now();
      void this.write(best[0], best[1]);
    }
    this.emitSave();
  }

  private async write(key: string, w: PendingWrite) {
    this.pending.delete(key);
    this.inflight.set(key, w);
    try {
      if (w.op === 'put') await this.backend!.put(w.e);
      else await this.backend!.remove(w.e);
      this.inflight.delete(key);
      if (w.op === 'put') this.lastWritten.set(key, signature(w.e));
      else this.lastWritten.delete(key);
      this.failedWrites.delete(key);
      if (this.backend?.kind === 'sky' && !this.pending.has(key)) void outbox.remove(key, w.seq);
      this.pauseLevel = 0;
      this.save.lastSavedAt = Date.now();
      if (this.ui.writeError && !this.failedWrites.size) this.setUi({ writeError: undefined });
    } catch (err: unknown) {
      this.inflight.delete(key);
      this.onWriteError(key, w, (err as { code?: string })?.code);
    }
    this.pump();
  }

  private onWriteError(key: string, w: PendingWrite, code: string | undefined) {
    const newer = this.pending.has(key);
    const retry = (delay: number) => {
      if (newer) return; // en nyere endring av samme element skrives uansett
      this.pending.set(key, { ...w, tries: w.tries + 1, nextAt: Date.now() + delay });
    };
    if (code === 'resource_exhausted') {
      // For mange kall på kort tid: vent litt med alt, og prøv igjen.
      this.pauseLevel = Math.min(this.pauseLevel + 1, 5);
      this.pauseUntil = Date.now() + Math.min(30000, 1500 * 2 ** (this.pauseLevel - 1)) + Math.random() * 500;
      retry(0);
      this.save.message = 'Lagringen er travel. Prøver igjen straks.';
    } else if (code === 'invalid_argument' || code === 'transform_error') {
      // Kan ikke lagres slik det er. Et forsøk med lang samtale forsøkes kortet ned én gang.
      const att = w.e as Entity & { chat?: unknown[] };
      if (!newer && w.e.kind === 'attempt' && Array.isArray(att.chat) && att.chat.length > 20 && !w.shrunk) {
        const e = { ...att, chat: att.chat.slice(-20) } as Entity;
        this.entities.set(key, e);
        this.pending.set(key, { ...w, e, shrunk: true, tries: w.tries + 1, nextAt: Date.now() });
      } else if (!newer) {
        this.failedWrites.set(key, 'Elementet kunne ikke lagres (for stort eller ugyldig).');
        if (this.backend?.kind === 'sky') void outbox.remove(key, w.seq);
      }
    } else if (code === 'quota_exceeded') {
      this.failedWrites.set(key, 'Lagringsplassen er full. Slett gamle dokumenter eller forsøk.');
      if (w.tries < 3) retry(60000);
    } else if (code === 'revoked' || code === 'not_granted' || code === 'capability_disabled' || code === 'capability_removed') {
      retry(0);
      this.save.state = 'frakoblet';
      this.save.message = 'Appen har mistet tilgangen til lagringen. Last inn siden på nytt; endringene dine ligger trygt i nettleseren til da.';
    } else {
      // Nettverk eller midlertidig feil: prøv igjen med økende pause (høyst 30 s).
      retry(Math.min(30000, 1000 * 2 ** Math.min(w.tries, 5)) + Math.random() * 400);
      this.save.message = 'Får ikke kontakt med lagringen. Prøver igjen automatisk.';
    }
    if (this.failedWrites.size) {
      const msg = [...this.failedWrites.values()][0];
      if (this.ui.writeError !== msg) this.setUi({ writeError: msg });
    }
  }

  /** Skriv alt som venter nå (ved lukking, skjult fane eller «Lagre nå»). */
  async flush(): Promise<void> {
    for (const w of this.pending.values()) w.nextAt = 0;
    this.pump(true);
  }

  /** Venter til alt er lagret, eller til tidsfristen går ut. */
  async waitSaved(timeoutMs = 8000): Promise<boolean> {
    const end = Date.now() + timeoutMs;
    await this.flush();
    while (Date.now() < end) {
      if (!this.pending.size && !this.inflight.size) return true;
      await new Promise((r) => setTimeout(r, 120));
    }
    return !this.pending.size && !this.inflight.size;
  }

  hasPendingWrites() {
    return this.pending.size > 0 || this.inflight.size > 0;
  }

  private emitSave() {
    const pending = this.pending.size + this.inflight.size;
    const failed = this.failedWrites.size;
    const retrying = [...this.pending.values()].some((w) => w.tries > 0);
    const state: SaveState['state'] = this.save.state === 'frakoblet' ? 'frakoblet' : failed ? 'feil' : pending ? (retrying ? 'venter' : 'lagrer') : 'lagret';
    const next: SaveState = { pending, failed, state, lastSavedAt: this.save.lastSavedAt, message: state === 'lagret' ? undefined : this.save.message };
    if (next.pending === this.save.pending && next.failed === this.save.failed && next.state === this.save.state && next.message === this.save.message && next.lastSavedAt === this.save.lastSavedAt) return;
    this.save = next;
    for (const l of this.saveListeners) l();
  }

  subscribeSave = (fn: () => void) => {
    this.saveListeners.add(fn);
    return () => this.saveListeners.delete(fn);
  };
  getSave = () => this.save;

  failedList(): { key: string; message: string }[] {
    return [...this.failedWrites.entries()].map(([key, message]) => ({ key, message }));
  }

  retryFailed() {
    for (const k of this.failedWrites.keys()) {
      const e = this.entities.get(k);
      if (e) this.pending.set(k, { op: 'put', e, seq: this.seqBase + ++this.seq, tries: 0, nextAt: 0 });
    }
    this.failedWrites.clear();
    if (this.save.state === 'frakoblet') this.save.state = 'lagrer';
    this.setUi({ writeError: undefined });
    this.pump(true);
  }

  select<T>(key: string, fn: () => T): T {
    const c = this.cache.get(key);
    if (c && c.v === this.version) return c.val as T;
    const val = fn();
    this.cache.set(key, { v: this.version, val });
    return val;
  }

  list<T extends Entity>(kind: EntityKind, courseId?: string): T[] {
    return this.select(`list:${kind}:${courseId ?? '*'}`, () => {
      const out: T[] = [];
      for (const e of this.entities.values()) if (e.kind === kind && (!courseId || e.courseId === courseId)) out.push(e as T);
      return out;
    });
  }

  // Bekvemme utvalg
  settings(): SettingsRec | undefined {
    return this.list<SettingsRec>('settings')[0];
  }
  courses() {
    return this.list<Course>('course').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  course(): Course | undefined {
    return this.get<Course>('course', this.ui.activeCourseId);
  }
  docs(cid = this.ui.activeCourseId) {
    return this.list<SourceDoc>('doc', cid).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  pages(docId: string) {
    return this.select(`pages:${docId}`, () => this.list<PageRec>('page').filter((p) => p.docId === docId).sort((a, b) => a.pdfPage - b.pdfPage));
  }
  subtasks(cid = this.ui.activeCourseId) {
    return this.list<SubTask>('subtask', cid);
  }
  currentSubtasks(cid = this.ui.activeCourseId) {
    return this.select(`cursub:${cid}`, () => {
      const docs = new Map(this.docs(cid).map((d) => [d.id, d]));
      return this.subtasks(cid)
        .filter((s) => {
          const d = docs.get(s.docId);
          return d && d.version === s.docVersion && !d.supersededBy && d.status !== 'duplikat';
        })
        .sort((a, b) => a.taskNo - b.taskNo || a.sub.localeCompare(b.sub, 'nb', { numeric: true }));
    });
  }
  families(cid = this.ui.activeCourseId) {
    return this.list<Family>('family', cid);
  }
  gens(cid = this.ui.activeCourseId) {
    return this.list<GeneratedTask>('gen', cid);
  }
  attempts(cid = this.ui.activeCourseId) {
    return this.list<Attempt>('attempt', cid).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }
  evidence(cid = this.ui.activeCourseId) {
    return this.list<Evidence>('evidence', cid).sort((a, b) => a.at.localeCompare(b.at));
  }
  sessions(cid = this.ui.activeCourseId) {
    return this.list<SessionRec>('session', cid).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }
  exams(cid = this.ui.activeCourseId) {
    return this.list<ExamSim>('exam', cid).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

export const store = new Store();

export function useStore<T>(fn: (s: Store) => T): T {
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return fn(store);
}

export function useSaveState(): SaveState {
  return useSyncExternalStore(store.subscribeSave, store.getSave, store.getSave);
}

export function useVersion(): number {
  return useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
}

export type { Store };
