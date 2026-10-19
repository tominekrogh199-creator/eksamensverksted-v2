// Behandlingskjeden for opplastede filer. Hvert trinn lagrer status, slik at
// en avbrutt analyse fortsetter der den slapp neste gang appen åpnes.

import { findEmbeddedInstructions, instructionNote, INSTRUCTION_NOTE_PREFIX } from './injection';
import type { SourceDoc, PageRec, SubTask, StageName, StageState, Course, Family, SubtaskAnalysis, PageStatus } from '../domain/types';
import { newId, nowIso, STAGE_ORDER, isExamSet } from '../domain/types';

/** Øk når behandlingskjeden forbedres; eldre dokumenter analyseres da på nytt automatisk. */
export const PIPELINE_VERSION = 4;
import { store } from '../state/store';
import { blobs } from '../storage/backend';
import { sha256Hex, textSimilarity } from '../ingest/fingerprint';
import { extractPdf, renderPdfPage, renderPdfCanvas } from '../ingest/pdf';
import { ocrCanvas, ocrAvailable, refineFigureBoxes } from '../ingest/ocr';
import { segmentBi, looksLikeBi } from './segment-bi';
import { segmentOppg, looksLikeOppg, type OSegmentation } from './segment-oppg';
import { segmentEssay, looksLikeEssay, essaySetSimilarity, type EssaySegmentation } from './segment-essay';
import { officialFromGuide } from './guide';
import { extractDocx } from '../ingest/docx';
import { guessMeta, isDemoDocument } from '../ingest/meta';
import { segmentDocument, segmentGuide } from './segment';
import { detectDomains, analyzeSubtaskRules } from './rules';
import { scoreGuideLink, chooseLink, officialCriteria, findConflicts, explainConflict } from './guide';
import { deriveRuleFamilies } from './compare';
import { aiAvailable, aiImagesAvailable } from '../ai/client';
import { readPageImage, segmentWithAi, analyzeSubtasksAi, clusterFamiliesAi } from '../ai/prompts';
import { getFamily } from '../families';

export interface IncomingFile {
  name: string;
  type: string;
  bytes: Uint8Array;
  demo?: boolean;
}

function freshStages(): Record<StageName, StageState> {
  const s = {} as Record<StageName, StageState>;
  for (const n of STAGE_ORDER) s[n] = { status: 'venter' };
  return s;
}

function mimeOf(name: string, type: string): string {
  const n = name.toLowerCase();
  if (type) return type;
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

export function acceptedFile(name: string, type: string): { ok: boolean; why?: string } {
  const m = mimeOf(name, type);
  if (m === 'application/pdf' || m.startsWith('image/jpeg') || m.startsWith('image/png') || m.startsWith('image/webp') || m.includes('wordprocessingml')) return { ok: true };
  if (/\.(doc|odt|pages)$/i.test(name)) return { ok: false, why: 'Eldre Word-filer (.doc), .odt og .pages kan ikke leses. Lagre som PDF eller DOCX og last opp på nytt.' };
  if (/\.(heic|heif)$/i.test(name)) return { ok: false, why: 'HEIC-bilder støttes ikke av nettleseren. Velg JPG i kameraet, eller eksporter bildet som JPG.' };
  return { ok: false, why: 'Filtypen støttes ikke. Bruk PDF, JPG, PNG eller DOCX.' };
}

function patchDoc(id: string, patch: Partial<SourceDoc>): SourceDoc {
  const d = store.get<SourceDoc>('doc', id);
  // Dokumentet kan være slettet mens analysen pågikk: da lagres ingenting.
  if (!d) return { ...(patch as SourceDoc) };
  return store.upsert({ ...d, ...patch });
}

function setStage(id: string, stage: StageName, st: Partial<StageState>) {
  const d = store.get<SourceDoc>('doc', id);
  if (!d) return;
  const prev = d.stages[stage];
  // Framdrift innenfor samme trinn («side 3 av 9») vises på skjermen, men lagres
  // ikke for hver side. Det sparer hundrevis av skrivinger ved store dokumenter.
  const progressOnly = !!prev && (st.status === undefined || st.status === prev.status) && prev.status === 'pågår';
  store.upsert({ ...d, stages: { ...d.stages, [stage]: { ...prev, ...st, updatedAt: nowIso() } } }, { localOnly: progressOnly });
}

// ——— Opprett fag ———

export function createCourse(name: string, demo = false): Course {
  const now = nowIso();
  const c: Course = {
    id: newId('fag'),
    kind: 'course',
    courseId: '',
    createdAt: now,
    updatedAt: now,
    demo,
    name: name.trim(),
    examInfo: {},
    settings: { cloudOriginals: false },
  };
  c.courseId = c.id;
  store.upsert(c);
  const s = store.settings();
  store.upsert(s ? { ...s, activeCourseId: c.id, onboarded: true } : { id: 'innstillinger', kind: 'settings', courseId: '', createdAt: now, updatedAt: now, activeCourseId: c.id, onboarded: true });
  store.setUi({ activeCourseId: c.id });
  return c;
}

// ——— Opplasting ———

export async function ingestFiles(files: IncomingFile[], courseId: string, opts: { startQueue?: boolean } = {}): Promise<SourceDoc[]> {
  const created: SourceDoc[] = [];
  const course = store.get<Course>('course', courseId);
  for (const f of files) {
    const mime = mimeOf(f.name, f.type);
    const fp = await sha256Hex(f.bytes);
    const existing = store.docs(courseId).find((d) => d.fingerprint === fp && d.status !== 'duplikat');
    const id = newId('dok');
    const now = nowIso();
    const base: SourceDoc = {
      id,
      kind: 'doc',
      courseId,
      createdAt: now,
      updatedAt: now,
      demo: f.demo,
      fileName: f.name,
      mime,
      size: f.bytes.length,
      fingerprint: fp,
      version: 1,
      lineageId: id,
      sourceFormat: 'ukjent',
      meta: { term: 'ukjent', examType: 'ukjent', docType: 'annet', confirmed: false, comparable: true, suggestions: [] },
      pageCount: 0,
      status: 'behandles',
      storage: { local: false },
      stages: freshStages(),
      errors: [],
    };
    if (existing) {
      const dup: SourceDoc = {
        ...base,
        status: 'duplikat',
        duplicateOf: existing.id,
        meta: { ...existing.meta },
        pageCount: existing.pageCount,
        sourceFormat: existing.sourceFormat,
        stages: Object.fromEntries(STAGE_ORDER.map((s) => [s, { status: 'hoppet-over', note: 'Duplikat' }])) as Record<StageName, StageState>,
        notes: [`Identisk innhold som «${existing.fileName}» (samme fingeravtrykk). Den telles ikke som et nytt eksamenssett.`],
      };
      dup.stages.registrering = { status: 'ferdig', note: 'Duplikat fanget', updatedAt: now };
      store.upsert(dup);
      created.push(dup);
      continue;
    }
    const blob = new Blob([f.bytes as BlobPart], { type: mime });
    const localOk = await blobs.putLocal(id, blob);
    base.storage = { local: localOk, localKey: id } as SourceDoc['storage'] & { localKey: string };
    if (course?.settings.cloudOriginals && store.platform) {
      const up = await blobs.uploadCloud(store.platform, blob, mime);
      if (up.assetId) base.storage.assetId = up.assetId;
      else if (up.error) base.errors.push(up.error);
    }
    base.stages.registrering = { status: 'ferdig', note: `Fingeravtrykk ${fp.slice(0, 10)}…`, updatedAt: now };
    store.upsert(base);
    created.push(base);
  }
  if (opts.startQueue !== false) void processQueue();
  return created;
}

function blobRef(d: SourceDoc) {
  return { localKey: (d.storage as { localKey?: string }).localKey ?? d.id, assetId: d.storage.assetId };
}

export async function docBytes(d: SourceDoc): Promise<Uint8Array | null> {
  const b = await blobs.get(blobRef(d));
  if (!b) return null;
  return new Uint8Array(await b.arrayBuffer());
}

// ——— Kø ———

let running = false;
let rerun = false;

export function needsWork(d: SourceDoc): boolean {
  if (d.status === 'duplikat' || d.status === 'erstattet') return false;
  return STAGE_ORDER.some((s) => d.stages[s].status === 'venter' || d.stages[s].status === 'pågår');
}

export async function processQueue(): Promise<void> {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    do {
      rerun = false;
      const cid = store.ui.activeCourseId;
      const docs = store.list<SourceDoc>('doc').filter(needsWork).sort((a, b) => (a.courseId === cid ? -1 : 1) - (b.courseId === cid ? -1 : 1) || a.createdAt.localeCompare(b.createdAt));
      // Eksamener før veiledninger, så koblingen har noe å koble mot.
      docs.sort((a, b) => (isExamSet(a) ? 0 : 1) - (isExamSet(b) ? 0 : 1));
      for (const d of docs) {
        try {
          await runDoc(d.id);
        } catch (e) {
          const cur = store.get<SourceDoc>('doc', d.id);
          // Et trinn som allerede ber om hjelp (f.eks. originalfilen mangler på denne enheten) er ikke en feil.
          if (cur && !STAGE_ORDER.some((s) => cur.stages[s].status === 'pågår') && STAGE_ORDER.some((s) => cur.stages[s].status === 'trenger-hjelp')) {
            patchDoc(d.id, { status: 'trenger-hjelp' });
          } else if (cur) {
            const stage = STAGE_ORDER.find((s) => cur.stages[s].status === 'pågår') ?? 'sidelesing';
            setStage(d.id, stage, { status: 'feil', note: e instanceof Error ? e.message : String(e) });
            patchDoc(d.id, { status: 'feil', errors: [...cur.errors, e instanceof Error ? e.message : String(e)] });
          }
        }
      }
      const courses = new Set(docs.map((d) => d.courseId));
      for (const c of courses) {
        relinkGuides(c);
        await refreshFamilies(c);
      }
    } while (rerun);
  } finally {
    running = false;
    store.setBusy('pipeline', null);
  }
}

// ——— Ett dokument ———

async function runDoc(id: string) {
  let d = store.get<SourceDoc>('doc', id)!;
  store.setBusy('pipeline', `Behandler ${d.fileName}`);
  // Dokumentet kan slettes mens et trinn venter (lesing, AI). Da stopper vi, og ryddingen tar restene.
  const gone = () => !store.get<SourceDoc>('doc', id);
  if (d.stages.sidelesing.status !== 'ferdig') await stageRead(id);
  if (gone()) return removeOrphans(id);
  d = store.get<SourceDoc>('doc', id)!;
  if (d.stages.bildelesing.status === 'venter' || d.stages.bildelesing.status === 'pågår') await stageVisual(id);
  if (gone()) return removeOrphans(id);
  d = store.get<SourceDoc>('doc', id)!;
  applyMetaGuess(id);
  d = store.get<SourceDoc>('doc', id)!;
  if (d.stages.segmentering.status === 'venter' || d.stages.segmentering.status === 'pågår') await stageSegment(id);
  if (gone()) return removeOrphans(id);
  d = store.get<SourceDoc>('doc', id)!;
  if (d.status === 'duplikat') return;
  if (d.stages.analyse.status === 'venter' || d.stages.analyse.status === 'pågår') await stageAnalyze(id);
  if (gone()) return removeOrphans(id);
  d = store.get<SourceDoc>('doc', id)!;
  if (d.stages.kobling.status === 'venter' || d.stages.kobling.status === 'pågår') {
    setStage(id, 'kobling', { status: 'pågår' });
    if (d.selfContained) setStage(id, 'kobling', { status: 'hoppet-over', note: 'Oppgavene og sensorveiledningen står i samme dokument. Kriteriene er koblet direkte til hvert spørsmål.' });
    else if (d.meta.docType === 'sensorveiledning' || d.meta.docType === 'losningsforslag') linkGuide(id);
    else setStage(id, 'kobling', { status: 'hoppet-over', note: 'Gjelder bare veiledninger og løsningsforslag' });
  }
  stageCoverage(id);
}

/** Sider og deloppgaver som ble lagret etter at dokumentet ble slettet. */
function removeOrphans(id: string) {
  for (const p of store.list<PageRec>('page').filter((x) => x.docId === id)) store.remove(p);
  for (const s of store.list<SubTask>('subtask').filter((x) => x.docId === id)) store.remove(s);
}

async function stageRead(id: string) {
  const d = store.get<SourceDoc>('doc', id)!;
  setStage(id, 'sidelesing', { status: 'pågår', note: 'Leser sider …' });
  const bytes = await docBytes(d);
  if (!bytes) {
    setStage(id, 'sidelesing', { status: 'trenger-hjelp', note: 'Originalfilen finnes ikke på denne enheten. Åpne appen på enheten der filen ble lastet opp, eller last den opp på nytt.' });
    throw new Error('Originalfilen mangler på denne enheten');
  }
  const now = nowIso();
  const mk = (n: number, text: string, extra: Partial<PageRec>): PageRec => ({
    id: `${id}-v${d.version}-p${n}`,
    kind: 'page',
    courseId: d.courseId,
    createdAt: now,
    updatedAt: now,
    demo: d.demo,
    docId: id,
    docVersion: d.version,
    pdfPage: n,
    text,
    textSource: 'tekstlag',
    hasFigure: false,
    status: 'lest',
    taskRefs: [],
    ...extra,
  });
  let pages: PageRec[] = [];
  let format: SourceDoc['sourceFormat'] = 'ukjent';
  let demo = d.demo;
  if (d.mime === 'application/pdf') {
    const pdf = await extractPdf(bytes, (n, total) => setStage(id, 'sidelesing', { status: 'pågår', progress: { done: n, total } }));
    pages = pdf.pages.map((p) =>
      mk(p.pdfPage, p.text, {
        textSource: p.hasTextLayer ? 'tekstlag' : 'ingen',
        hasFigure: p.hasFigure,
        figureBoxes: p.figureBoxes,
        printedPage: p.printedPage,
        lines: p.lines.map((l) => (l.bold ? { t: l.t, b: l.b, bold: true } : { t: l.t, b: l.b })),
        width: p.width,
        height: p.height,
        status: !p.hasTextLayer ? 'trenger-ai-lesing' : p.hasFigure ? 'trenger-visuell-kontroll' : 'lest',
        statusNote: p.garbled
          ? 'Tekstlaget er kodet med en skrift som ikke kan leses direkte (vanlig i Wiseflow-utskrifter). Siden leses fra bildet.'
          : !p.hasTextLayer
            ? 'Siden har ikke tekstlag (skannet eller bilde). Den leses fra bildet.'
            : p.hasFigure
              ? 'Siden har figur. Figuren vises som utsnitt fra originalen ved oppgaven.'
              : undefined,
      }),
    );
    const withText = pdf.pages.filter((p) => p.hasTextLayer).length;
    format = withText === pdf.pages.length ? 'pdf-tekst' : withText === 0 ? 'pdf-skann' : 'pdf-blandet';
    demo = demo || isDemoDocument(pdf.pages.map((p) => p.text).join('\n'), pdf.info);
  } else if (d.mime.includes('wordprocessingml')) {
    const r = await extractDocx(bytes);
    pages = [mk(1, r.text, { textSource: 'docx', statusNote: 'DOCX har ingen faste sider. Hele dokumentet vises som én side, og henvisninger peker til avsnitt.', lines: r.paragraphs.map((t, i) => ({ t, b: [0.05, i / Math.max(1, r.paragraphs.length), 0.9, 1 / Math.max(1, r.paragraphs.length)] as [number, number, number, number] })) })];
    format = 'docx';
    demo = demo || isDemoDocument(r.text);
  } else if (d.mime.startsWith('image/')) {
    pages = [mk(1, '', { textSource: 'ingen', status: 'trenger-ai-lesing', statusNote: 'Bilde: teksten må leses av AI eller skrives inn.' })];
    format = 'bilde';
  }
  // Fjern sider fra tidligere kjøring av samme versjon.
  for (const old of store.pages(id)) if (old.docVersion === d.version && !pages.some((p) => p.id === old.id)) store.remove(old);
  store.upsertMany(pages);
  patchDoc(id, { pageCount: pages.length, sourceFormat: format, demo, pipelineVersion: PIPELINE_VERSION });
  setStage(id, 'sidelesing', { status: 'ferdig', note: `${pages.length} ${pages.length === 1 ? 'side' : 'sider'} lest`, progress: { done: pages.length, total: pages.length } });
  flagInstructions(id);
  // Samme innhold i en annen fil?
  const txt = pages.map((p) => p.text).join('\n');
  if (txt.length > 200) {
    for (const o of store.docs(d.courseId)) {
      if (o.id === id || o.status === 'duplikat' || o.supersededBy) continue;
      const ot = store.pages(o.id).map((p) => p.text).join('\n');
      const sim = textSimilarity(txt, ot);
      if (sim > 0.85) {
        patchDoc(id, { similarTo: { docId: o.id, similarity: sim }, notes: [...(store.get<SourceDoc>('doc', id)!.notes ?? []), `Innholdet ligner svært på «${o.fileName}» (${Math.round(sim * 100)} % like ordsekvenser). Velg om dette er et duplikat, en alternativ versjon eller et eget sett.`] });
        break;
      }
    }
  }
}

function flagInstructions(id: string) {
  const d = store.get<SourceDoc>('doc', id);
  if (!d) return;
  const notes: string[] = [];
  for (const p of store.pages(id).filter((x) => x.docVersion === d.version)) for (const f of findEmbeddedInstructions(p.text)) notes.push(instructionNote(p.pdfPage, f.excerpt));
  const kept = (d.notes ?? []).filter((n) => !n.startsWith(INSTRUCTION_NOTE_PREFIX));
  if (notes.length || kept.length !== (d.notes ?? []).length) patchDoc(id, { notes: [...kept, ...notes] });
}

async function imageCanvas(bytes: Uint8Array, mime: string): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('Bildet kunne ikke åpnes'));
      img.src = url;
    });
    const scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Nesten hvit side (under 0,05 % mørke punkter i full oppløsning): ingenting å lese. */
function isBlankCanvas(c: HTMLCanvasElement): boolean {
  try {
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    const stride = 4 * 2;
    let dark = 0;
    let n = 0;
    for (let row = 0; row < c.height; row += 2) {
      const base = row * c.width * 4;
      for (let i = base; i < base + c.width * 4; i += stride) {
        n++;
        if (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11 < 160) dark++;
      }
    }
    return n > 0 && dark / n < 0.0005;
  } catch {
    return false;
  }
}

async function stageVisual(id: string) {
  const d = store.get<SourceDoc>('doc', id)!;
  const pages = store.pages(id).filter((p) => p.docVersion === d.version);
  const scans = pages.filter((p) => p.status === 'trenger-ai-lesing');
  const figs = pages.filter((p) => p.status === 'trenger-visuell-kontroll');
  if (!scans.length && !figs.length) {
    setStage(id, 'bildelesing', { status: 'hoppet-over', note: 'Ingen sider trengte bildelesing' });
    return;
  }
  const bytes = await docBytes(d);
  const total = scans.length + (aiImagesAvailable() ? figs.length : 0);
  let done = 0;
  let ocrDone = 0;
  let aiDone = 0;
  let failed = 0;
  let blank = 0;
  const notes: string[] = [];
  setStage(id, 'bildelesing', { status: 'pågår', progress: { done: 0, total }, note: scans.length ? 'Leser sider fra bilde …' : 'Tolker figurer …' });
  // 1. Sider uten lesbar tekst: tekstgjenkjenning i nettleseren (ingen AI, ingen kostnad).
  for (const p of scans) {
    let ok = false;
    let canvas: HTMLCanvasElement | null = null;
    try {
      if (bytes && d.mime === 'application/pdf') canvas = await renderPdfCanvas(bytes, p.pdfPage, 1800);
      else if (bytes && d.mime.startsWith('image/')) canvas = await imageCanvas(bytes, d.mime);
    } catch {
      canvas = null;
    }
    if (canvas && isBlankCanvas(canvas)) {
      const cur = store.get<PageRec>('page', p.id)!;
      store.upsert({ ...cur, status: 'irrelevant', textSource: 'ingen', statusNote: 'Tom side (ingen tekst eller figur).' });
      blank++;
      done++;
      setStage(id, 'bildelesing', { status: 'pågår', progress: { done, total } });
      continue;
    }
    if (canvas && ocrAvailable()) {
      try {
        const r = await ocrCanvas(canvas, (st) => setStage(id, 'bildelesing', { status: 'pågår', progress: { done, total }, note: `Side ${p.pdfPage}: ${st}` }));
        const ocrChars = r.text.replace(/\s/g, '').length;
        if (ocrChars > 20 ? r.confidence >= 40 : ocrChars >= 3 && r.confidence >= 60) {
          const cur = store.get<PageRec>('page', p.id)!;
          const low = r.lines.flatMap((l) => l.lowWords).slice(0, 12);
          const keep = (cur.lines ?? []).filter((l) => !r.lines.some((o) => Math.abs(o.b[1] - l.b[1]) < 0.01));
          const lines = [...keep, ...r.lines.map((l) => ({ t: l.t, b: l.b, conf: l.conf, ...(l.mark ? { mark: l.mark } : {}) }))].sort((a, b) => a.b[1] - b.b[1]);
          store.upsert({
            ...cur,
            text: lines.map((l) => l.t).join('\n'),
            textSource: 'ocr',
            ocrConfidence: r.confidence,
            status: 'ocr-lest',
            statusNote: `Lest med tekstgjenkjenning (OCR) i nettleseren, sikkerhet ${r.confidence} %.${low.length ? ' Noen ord er usikre.' : ''}${r.lines.some((l) => l.mark === 'valgt') ? ' Markerte svaralternativer er funnet i bildet.' : ''}`,
            uncertainties: low.map((w) => `«${w}»: usikker lesing`),
            figureBoxes: refineFigureBoxes(cur.figureBoxes ?? [], r.lines),
            lines,
          });
          ok = true;
          ocrDone++;
        }
      } catch (e) {
        notes.push(`Tekstgjenkjenning feilet på side ${p.pdfPage}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // 2. Reserve: AI-lesing av bildet når det er tilgjengelig.
    if (!ok && aiImagesAvailable() && bytes) {
      let img: Blob | null = null;
      try {
        img = canvas ? await new Promise<Blob | null>((res) => canvas!.toBlob((b) => res(b), 'image/jpeg', 0.88)) : d.mime === 'application/pdf' ? (await renderPdfPage(bytes, p.pdfPage, 1400)).blob : new Blob([bytes as BlobPart], { type: d.mime });
      } catch {
        img = null;
      }
      if (img) {
        const r = await readPageImage(img, { fileName: d.fileName, pdfPage: p.pdfPage, docTypeHint: d.meta.docType });
        const cur = store.get<PageRec>('page', p.id)!;
        if (r.ok) {
          store.upsert({
            ...cur,
            text: r.data.text,
            textSource: 'ai-lesing',
            status: r.data.legible === 'nei' ? 'uleselig' : 'ai-lest',
            statusNote: r.data.legible === 'delvis' ? 'Delvis lesbar (AI-lesing). Kontroller usikre steder.' : 'Lest av AI fra bildet.',
            uncertainties: r.data.uncertain.map((u) => `«${u.text}»: ${u.reason}`),
            printedPage: r.data.printedPage ?? cur.printedPage,
            figureNote: r.data.figures.join(' ') || cur.figureNote,
            hasFigure: cur.hasFigure || r.data.figures.length > 0,
            lines: r.data.text.split('\n').map((t, i, arr) => ({ t, b: [0.06, 0.06 + (0.88 * i) / Math.max(1, arr.length), 0.88, 0.88 / Math.max(1, arr.length)] as [number, number, number, number] })),
          });
          ok = true;
          aiDone++;
        } else notes.push(`AI-lesing feilet på side ${p.pdfPage}: ${r.message}`);
      }
    }
    if (!ok) {
      failed++;
      const cur = store.get<PageRec>('page', p.id)!;
      store.upsert({ ...cur, status: 'uleselig', statusNote: `Kunne ikke lese siden automatisk. Skriv inn teksten, eller åpne originalen. ${notes[notes.length - 1] ?? ''}`.trim() });
    }
    done++;
    setStage(id, 'bildelesing', { status: 'pågår', progress: { done, total } });
  }
  // 3. Figurer: AI-beskrivelse når tilgjengelig. Ellers vises figuren som utsnitt ved oppgaven.
  let figDescribed = 0;
  if (aiImagesAvailable() && bytes && d.mime === 'application/pdf') {
    for (const p of figs) {
      const img = (await renderPdfPage(bytes, p.pdfPage, 1400).catch(() => null))?.blob;
      if (!img) continue;
      const r = await readPageImage(img, { fileName: d.fileName, pdfPage: p.pdfPage, docTypeHint: d.meta.docType });
      const cur = store.get<PageRec>('page', p.id)!;
      if (r.ok) {
        store.upsert({ ...cur, status: 'lest', figureNote: r.data.figures.join(' ') || 'Figur lest, ingen detaljer oppgitt.', statusNote: 'Figuren er beskrevet av AI (tolkning). Utsnittet vises ved oppgaven.' });
        figDescribed++;
      } else if (r.code === 'not_granted' || r.code === 'unavailable') break;
      done++;
      setStage(id, 'bildelesing', { status: 'pågår', progress: { done, total } });
    }
  }
  const parts: string[] = [];
  if (ocrDone) parts.push(`${ocrDone} ${ocrDone === 1 ? 'side' : 'sider'} lest med tekstgjenkjenning (OCR) i nettleseren`);
  if (aiDone) parts.push(`${aiDone} lest med AI`);
  if (failed) parts.push(`${failed} kunne ikke leses automatisk`);
  if (blank) parts.push(`${blank} tom${blank === 1 ? '' : 'me'} side${blank === 1 ? '' : 'r'} hoppet over`);
  const figLeft = figs.length - figDescribed;
  if (figDescribed) parts.push(`${figDescribed} figur${figDescribed === 1 ? '' : 'er'} beskrevet av AI`);
  if (figLeft) parts.push(`${figLeft} ${figLeft === 1 ? 'side' : 'sider'} med figur vises som utsnitt fra originalen${aiImagesAvailable() ? '' : ' (tolkning av figurer krever AI)'}`);
  setStage(id, 'bildelesing', { status: failed ? 'trenger-hjelp' : 'ferdig', note: parts.join(' · ') || 'Ferdig', progress: { done: total, total } });
}

function applyMetaGuess(id: string) {
  const d = store.get<SourceDoc>('doc', id)!;
  const text = store.pages(id).filter((p) => p.docVersion === d.version).map((p) => p.text).join('\n');
  if (!text.trim() && d.meta.suggestions.length) return;
  const g = guessMeta(d.fileName, text);
  if (d.meta.confirmed) {
    // Bekreftet av brukeren: behold typen, men gi en mer presis etikett når den gamle bare var et årstall
    // eller er en del av den nye (f.eks. «2024» → «Høst 2024 · pulje 1»).
    const old = d.meta.setLabel ?? '';
    const better = g.setLabel && g.setLabel !== old && (!old || /^\d{4}$/.test(old) || g.setLabel.toLowerCase().includes(old.toLowerCase()));
    if (better) patchDoc(id, { meta: { ...d.meta, setLabel: g.setLabel, year: g.year ?? d.meta.year, term: g.term !== 'ukjent' ? g.term : d.meta.term, examCode: d.meta.examCode && !/^Ø/.test(d.meta.examCode) ? d.meta.examCode : g.examCode } });
    return;
  }
  patchDoc(id, {
    meta: {
      ...d.meta,
      title: g.title,
      year: g.year,
      term: g.term,
      examType: g.examType,
      docType: g.docType,
      examCode: g.examCode,
      setLabel: g.setLabel,
      suggestions: g.suggestions,
      confirmed: false,
    },
    questions: g.questions,
  });
}

function stableSubId(d: SourceDoc, label: string) {
  return `${d.id}-v${d.version}-o${label}`;
}

async function stageSegment(id: string) {
  flagInstructions(id);
  const d = store.get<SourceDoc>('doc', id)!;
  setStage(id, 'segmentering', { status: 'pågår' });
  const pages = store.pages(id).filter((p) => p.docVersion === d.version);
  const input = pages.map((p) => ({ pdfPage: p.pdfPage, text: p.text, hasFigure: p.hasFigure, printedPage: p.printedPage, lines: p.lines }));
  // Fem likeverdige tekstoppgaver («Besvar følgende oppgaver: 1. … 5.»), eller en veiledning med «Relevant pensum» per spørsmål.
  if (['eksamen', 'sensorveiledning'].includes(d.meta.docType) && looksLikeEssay(input)) {
    const es = segmentEssay(input);
    if (es.items.length >= 2) {
      segmentEssayDoc(d, pages, es);
      return;
    }
  }
  if (['eksamen', 'sensorveiledning', 'losningsforslag'].includes(d.meta.docType) && looksLikeBi(input)) {
    const bi = segmentBi(pages.map((p) => ({ pdfPage: p.pdfPage, text: p.text, lines: p.lines, figureBoxes: p.figureBoxes, hasFigure: p.hasFigure })));
    if (bi.items.length >= 2) {
      segmentSelfContained(d, pages, bi);
      return;
    }
  }
  // Oppgaver med løsning i samme dokument («Oppgave N … Løsning») og oppgavesamlinger (P-1.1 …).
  if (['eksamen', 'sensorveiledning', 'losningsforslag', 'oppgavesamling'].includes(d.meta.docType)) {
    const oin = pages.map((p) => ({ pdfPage: p.pdfPage, text: p.text, lines: p.lines, figureBoxes: p.figureBoxes }));
    if (looksLikeOppg(oin)) {
      const o = segmentOppg(oin, { solutionsExpected: d.meta.docType !== 'eksamen' });
      if (o.items.length >= 1) {
        segmentOppgDoc(d, pages, o);
        return;
      }
    }
  }
  if (d.meta.docType === 'oppgavesamling') {
    setStage(id, 'segmentering', { status: 'trenger-hjelp', note: 'Fant ingen nummererte oppgaver (f.eks. «Oppgave 1» eller «P-1.1»).' });
    setStage(id, 'analyse', { status: 'hoppet-over' });
    return;
  }
  if (d.meta.docType === 'sensorveiledning' || d.meta.docType === 'losningsforslag') {
    const g = segmentGuide(input);
    patchDoc(id, { guide: { header: g.header, items: g.items.map((i) => ({ taskNo: i.taskNo, sub: i.sub, label: i.label, page: i.page, text: i.text, points: i.points, pointsQuote: i.pointsQuote, lines: i.lines })) } });
    for (const p of pages) store.upsert({ ...p, taskRefs: g.items.filter((i) => i.page === p.pdfPage || i.lines.some((l) => l.page === p.pdfPage)).map((i) => i.label) });
    setStage(id, 'segmentering', { status: g.items.length ? 'ferdig' : 'trenger-hjelp', note: g.items.length ? `${g.items.length} oppgavehenvisninger funnet` : 'Fant ingen oppgavehenvisninger (f.eks. «Oppgave 1a»).' });
    setStage(id, 'analyse', { status: 'hoppet-over', note: 'Veiledninger analyseres gjennom koblingen til eksamenssettet' });
    return;
  }
  if (d.selfContained) patchDoc(id, { selfContained: false });
  if (d.meta.docType !== 'eksamen') {
    setStage(id, 'segmentering', { status: 'hoppet-over', note: 'Deles ikke i oppgaver (ikke et eksamenssett)' });
    setStage(id, 'analyse', { status: 'hoppet-over' });
    return;
  }
  const seg = segmentDocument(input);
  const equal = /teller likt/i.test(seg.preamble.map((l) => l.text).join(' '));
  let items: { taskNo: number; sub: string; label: string; intro: string; text: string; pages: number[]; points?: number; pointsQuote?: string; taskPoints?: number; taskWeightPct?: number; subtaskCount: number; figurePages: number[]; boxes: { page: number; box: [number, number, number, number] }[]; dependsOn: string[] }[] = [];
  for (const t of seg.tasks)
    for (const s of t.subtasks)
      items.push({
        taskNo: t.taskNo,
        sub: s.sub,
        label: s.label,
        intro: t.intro,
        text: s.text,
        pages: s.pages.length ? s.pages : [t.headerPage],
        points: s.points,
        pointsQuote: s.pointsQuote,
        taskPoints: t.points,
        taskWeightPct: t.weightPct,
        subtaskCount: t.subtasks.length,
        figurePages: s.figurePages,
        boxes: [...t.introLines, ...s.lines].filter((l) => l.box).map((l) => ({ page: l.page, box: l.box! })),
        dependsOn: s.dependsOn,
      });
  let aiSeg = false;
  if (!items.length && aiAvailable()) {
    setStage(id, 'segmentering', { status: 'pågår', note: 'Reglene fant ingen oppgaver. Prøver AI-segmentering …' });
    const r = await segmentWithAi(pages.map((p) => ({ pdfPage: p.pdfPage, text: p.text })));
    if (r.ok) {
      aiSeg = true;
      const byTask = new Map<number, number>();
      for (const t of r.data) byTask.set(t.taskNo, (byTask.get(t.taskNo) ?? 0) + 1);
      items = r.data.map((t) => ({ taskNo: t.taskNo, sub: t.sub, label: `${t.taskNo}${t.sub}`, intro: t.intro, text: t.text, pages: t.pdfPages.length ? t.pdfPages : [1], points: t.points, pointsQuote: t.pointsQuote, subtaskCount: byTask.get(t.taskNo) ?? 1, figurePages: t.pdfPages.filter((n) => pages.find((p) => p.pdfPage === n)?.hasFigure), boxes: [], dependsOn: [] }));
    }
  }
  const now = nowIso();
  const keep = new Set<string>();
  for (const it of items) {
    const sid = stableSubId(d, it.label);
    keep.add(sid);
    const prev = store.get<SubTask>('subtask', sid);
    const userEdited = prev?.textHistory.some((h) => h.by === 'bruker');
    const st: SubTask = {
      id: sid,
      kind: 'subtask',
      courseId: d.courseId,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      demo: d.demo,
      docId: d.id,
      docVersion: d.version,
      taskNo: it.taskNo,
      sub: it.sub,
      label: it.label,
      pages: it.pages,
      printedPages: it.pages.map((n) => pages.find((p) => p.pdfPage === n)?.printedPage ?? ''),
      intro: it.intro,
      text: userEdited ? prev!.text : it.text,
      textVersion: prev?.textVersion ?? 1,
      textHistory: prev?.textHistory ?? [],
      figures: it.figurePages.map((n) => ({ page: n, note: pages.find((p) => p.pdfPage === n)?.figureNote ?? 'Figur på siden' })),
      dependsOn: it.dependsOn,
      analysis: prev?.analysis ?? ({} as SubtaskAnalysis),
      seg: { points: it.points, pointsQuote: it.pointsQuote, taskPoints: it.taskPoints, taskWeightPct: it.taskWeightPct, subtaskCount: it.subtaskCount, lineBoxes: it.boxes },
    };
    store.upsert(st, { silent: true });
  }
  for (const old of store.subtasks(d.courseId)) if (old.docId === id && old.docVersion === d.version && !keep.has(old.id)) store.remove(old);
  for (const p of pages) {
    const refs = items.filter((i) => i.pages.includes(p.pdfPage)).map((i) => stableSubId(d, i.label));
    const use = seg.pageUse[p.pdfPage];
    let status: PageStatus = p.status;
    let statusNote = p.statusNote;
    if (!refs.length && (p.status === 'lest' || p.status === 'ai-lest')) {
      status = 'irrelevant';
      statusNote = use === 'forside' ? 'Forside eller instruksjoner (ingen oppgaver)' : 'Ingen oppgaver funnet på siden';
    }
    store.upsert({ ...p, taskRefs: refs, status, statusNote }, { silent: true });
  }
  store.bump();
  patchDoc(id, { equalSubWeights: equal });
  setStage(id, 'segmentering', {
    status: items.length ? 'ferdig' : 'trenger-hjelp',
    note: items.length ? `${seg.tasks.length || new Set(items.map((i) => i.taskNo)).size} oppgaver, ${items.length} deloppgaver${aiSeg ? ' (AI-segmentert, kontroller mot originalen)' : ''}` : 'Fant ingen oppgaver. Kontroller at teksten er lest, eller merk dokumenttypen.',
  });
}

/**
 * Tekstoppgaver (eksamen) eller veiledning med spørsmålene og pensumhenvisninger.
 * Veiledningen står alene som sett (den har spørsmålene ordrett). Eksamensoppgaven
 * til samme sett regnes som duplikat av veiledningen (se mergeEssaySets).
 */
function segmentEssayDoc(d: SourceDoc, pages: PageRec[], es: EssaySegmentation) {
  const now = nowIso();
  const keep = new Set<string>();
  const isGuide = es.kind === 'veiledning';
  for (const it of es.items) {
    const sid = stableSubId(d, it.label);
    keep.add(sid);
    const prev = store.get<SubTask>('subtask', sid);
    const userEdited = prev?.textHistory.some((h) => h.by === 'bruker');
    const pagesUsed = it.pages.length ? it.pages : [pages[0]?.pdfPage ?? 1];
    const st: SubTask = {
      id: sid,
      kind: 'subtask',
      courseId: d.courseId,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      demo: d.demo,
      docId: d.id,
      docVersion: d.version,
      taskNo: it.no,
      sub: '',
      label: it.label,
      format: 'langsvar',
      pages: pagesUsed,
      printedPages: pagesUsed.map((n) => pages.find((p) => p.pdfPage === n)?.printedPage ?? ''),
      intro: '',
      text: userEdited ? prev!.text : it.text,
      textVersion: prev?.textVersion ?? 1,
      textHistory: prev?.textHistory ?? [],
      figures: [],
      dependsOn: [],
      ...(isGuide && it.guide ? { guide: { text: it.guide, lines: it.guideLines.map((l) => ({ page: l.page, text: l.text, box: l.box })) } } : {}),
      analysis: prev?.analysis ?? ({} as SubtaskAnalysis),
      seg: { subtaskCount: 1, taskWeightPct: es.equalWeight || isGuide ? Math.round(100 / es.items.length) : undefined, lineBoxes: it.lines.filter((l) => l.box).map((l) => ({ page: l.page, box: l.box! })) },
    };
    store.upsert(st, { silent: true });
  }
  for (const old of store.subtasks(d.courseId)) if (old.docId === d.id && old.docVersion === d.version && !keep.has(old.id)) store.remove(old);
  for (const p of pages) {
    const refs = es.items.filter((i) => i.pages.includes(p.pdfPage)).map((i) => stableSubId(d, i.label));
    let status: PageStatus = p.status;
    let statusNote = p.statusNote;
    if (!refs.length && (p.status === 'lest' || p.status === 'ocr-lest' || p.status === 'ai-lest')) {
      status = 'irrelevant';
      statusNote = isGuide ? 'Generelle kriterier og læringsmål (gjelder alle spørsmålene).' : 'Forside eller instruksjoner (ingen oppgaver).';
    }
    store.upsert({ ...p, taskRefs: refs, status, statusNote }, { silent: true });
  }
  store.bump();
  const course = store.get<Course>('course', d.courseId);
  // Eksamensopplysninger (tid og hjelpemidler) fra eksamensoppgaven, når faget ikke har dem.
  if (course && !isGuide && (es.minutes || es.aids) && !course.examInfo.durationMin) {
    store.upsert({ ...course, examInfo: { ...course.examInfo, durationMin: es.minutes ?? course.examInfo.durationMin, aids: course.examInfo.aids ?? es.aids, format: course.examInfo.format ?? `${es.items.length} tekstoppgaver som teller likt` } });
  }
  const notes = [...(store.get<SourceDoc>('doc', d.id)!.notes ?? []).filter((n) => !n.startsWith('Format:')), `Format: ${es.items.length} tekstoppgaver${es.equalWeight || isGuide ? ' som teller likt' : ''}${es.minutes ? `, ${es.minutes / 60} timer` : ''}${es.aids ? `, ${es.aids.toLowerCase()}` : ''}.`];
  patchDoc(d.id, { layout: 'essay', selfContained: isGuide, essayCriteria: isGuide ? es.criteria : undefined, curriculum: es.curriculum.length ? es.curriculum : undefined, language: es.language, notes, equalSubWeights: es.equalWeight || isGuide, guide: undefined, linkedExamDocId: undefined });
  setStage(d.id, 'segmentering', { status: 'ferdig', note: `${es.items.length} ${isGuide ? 'spørsmål med pensumhenvisning' : 'tekstoppgaver'}${isGuide && es.criteria.length ? ` og ${es.criteria.length} generelle vurderingskriterier` : ''}.` });
  setStage(d.id, 'analyse', { status: 'venter' });
  mergeEssaySets(d.courseId);
}

/**
 * Samme sett i flere filer: eksamensoppgaven og veiledningen (som har spørsmålene og
 * pensumhenvisningene), og nynorsk-versjonen. Bare én av dem telles som sett.
 */
export function mergeEssaySets(courseId: string) {
  const docs = store.docs(courseId).filter((x) => x.layout === 'essay' && x.status !== 'duplikat' && !x.supersededBy && x.stages.segmentering.status === 'ferdig');
  const qs = new Map(docs.map((x) => [x.id, store.subtasks(courseId).filter((s) => s.docId === x.id && s.docVersion === x.version).sort((a, b) => a.taskNo - b.taskNo).map((s) => s.text)]));
  const slotOf = (x: SourceDoc) => /slot (\d)/i.exec(x.meta.setLabel ?? '')?.[1];
  const sameTime = (a: SourceDoc, b: SourceDoc) => {
    if (!a.meta.year || !b.meta.year) return true;
    if (a.meta.year !== b.meta.year || a.meta.term !== b.meta.term) return false;
    const sa = slotOf(a);
    const sb = slotOf(b);
    return !sa || !sb || sa === sb;
  };
  const markDup = (dup: SourceDoc, of: SourceDoc, why: string) => {
    store.upsert({ ...dup, status: 'duplikat', duplicateOf: of.id, notes: [...(dup.notes ?? []).filter((n) => !n.startsWith('Samme sett')), `Samme sett som «${of.meta.setLabel ?? of.fileName}»: ${why} Den telles ikke som et eget sett.`], stages: { ...dup.stages, analyse: { status: 'hoppet-over', note: 'Samme sett som et annet dokument' }, kobling: { status: 'hoppet-over', note: 'Samme sett som et annet dokument' }, dekning: { status: 'hoppet-over' } } });
    for (const s of store.subtasks(courseId).filter((x) => x.docId === dup.id)) store.remove(s);
  };
  const canonical = (x: SourceDoc) => (x.selfContained ? 2 : 0) + (x.language === 'nn' ? -1 : 0) + (x.meta.year ? 0.5 : 0);
  for (const a of docs) {
    const cur = store.get<SourceDoc>('doc', a.id)!;
    if (cur.status === 'duplikat') continue;
    for (const b of docs) {
      if (a.id === b.id) continue;
      const bb = store.get<SourceDoc>('doc', b.id)!;
      if (bb.status === 'duplikat' || !sameTime(cur, bb)) continue;
      const qa = qs.get(a.id) ?? [];
      const qb = qs.get(b.id) ?? [];
      const sim = essaySetSimilarity(qa, qb);
      const nynorsk = cur.language !== bb.language && qa.length === qb.length && !!cur.meta.year && !!bb.meta.year && slotOf(cur) === slotOf(bb);
      if (sim < 0.95 && !nynorsk) continue;
      // Behold veiledningen (spørsmål + pensum) foran eksamensoppgaven, og bokmål foran nynorsk.
      const [keepDoc, dropDoc] = canonical(cur) >= canonical(bb) ? [cur, bb] : [bb, cur];
      markDup(dropDoc, keepDoc, nynorsk && sim < 0.95 ? 'nynorsk-versjonen av samme eksamen.' : keepDoc.selfContained ? 'spørsmålene står ordrett i sensorveiledningen, som også har pensumhenvisningene.' : 'de samme spørsmålene.');
      if (dropDoc.id === cur.id) break;
    }
  }
  // Konte-eksamener gjenbruker ofte spørsmål. Ligner teksten mye på et sett fra en annen dato,
  // er det likevel en egen eksamen: avklar det automatisk i stedet for å spørre.
  for (const x of store.docs(courseId)) {
    if (x.layout !== 'essay' || x.status === 'duplikat' || !x.similarTo || x.similarTo.resolved) continue;
    const o = store.get<SourceDoc>('doc', x.similarTo.docId);
    if (!o || o.layout !== 'essay' || !x.meta.year || !o.meta.year || sameTime(x, o)) continue;
    store.upsert({
      ...x,
      similarTo: { ...x.similarTo, resolved: 'eget' },
      notes: [...(x.notes ?? []).filter((n) => !n.startsWith('Innholdet ligner svært')), `Flere spørsmål går igjen fra «${o.meta.setLabel ?? o.fileName}», men dette er en annen eksamen (${x.meta.setLabel ?? ''}). Den telles som eget sett.`],
    });
  }
  store.bump();
}

/** Dokument med både spørsmål og sensorveiledning (BI-format): hvert spørsmål blir en deloppgave med egne offisielle kriterier. */
function segmentSelfContained(d: SourceDoc, pages: PageRec[], bi: ReturnType<typeof segmentBi>) {
  const now = nowIso();
  const keep = new Set<string>();
  const perPart = new Map<number, number>();
  for (const it of bi.items) perPart.set(it.part, (perPart.get(it.part) ?? 0) + 1);
  for (const it of bi.items) {
    const sid = stableSubId(d, it.label);
    keep.add(sid);
    const prev = store.get<SubTask>('subtask', sid);
    const userEdited = prev?.textHistory.some((h) => h.by === 'bruker');
    const stemText = it.stem || (it.format === 'flervalg' ? '' : '');
    const boxes = [...it.introLines, ...it.stemLines].filter((l) => l.box).map((l) => ({ page: l.page, box: l.box! }));
    const pagesUsed = [...new Set([...it.pages, ...it.figures.map((f) => f.page)])].sort((a, b) => a - b);
    const st: SubTask = {
      id: sid,
      kind: 'subtask',
      courseId: d.courseId,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      demo: d.demo,
      docId: d.id,
      docVersion: d.version,
      taskNo: it.part,
      sub: it.no,
      label: it.label,
      part: it.part,
      format: it.format,
      pages: pagesUsed,
      printedPages: pagesUsed.map((n) => pages.find((p) => p.pdfPage === n)?.printedPage ?? ''),
      intro: it.intro,
      text: userEdited ? prev!.text : stemText,
      textVersion: prev?.textVersion ?? 1,
      textHistory: prev?.textHistory ?? [],
      figures: it.figures.map((f) => ({ page: f.page, box: f.box, inGuide: f.inGuide, note: pages.find((p) => p.pdfPage === f.page)?.figureNote ?? (f.inGuide ? 'Figur i sensorveiledningen' : 'Figur i oppgaven') })),
      dependsOn: /\b(i|fra) ([a-e])\)/i.test(it.stem) ? [`${it.part}${/\b(?:i|fra) ([a-e])\)/i.exec(it.stem)![1].toLowerCase()}`] : [],
      choices: it.choices.map((c) => ({ letter: c.letter, text: c.text, correct: c.correct })),
      answerBasis: it.answerBasis,
      guide: { text: it.guide, lines: it.guideLines.map((l) => ({ page: l.page, text: l.text, box: l.box })) },
      stemMissing: it.stemMissing,
      analysis: prev?.analysis ?? ({} as SubtaskAnalysis),
      seg: { points: it.points, pointsQuote: it.pointsQuote, subtaskCount: perPart.get(it.part) ?? 1, lineBoxes: boxes },
    };
    store.upsert(st, { silent: true });
  }
  for (const old of store.subtasks(d.courseId)) if (old.docId === d.id && old.docVersion === d.version && !keep.has(old.id)) store.remove(old);
  for (const p of pages) {
    const refs = bi.items.filter((i) => i.pages.includes(p.pdfPage) || i.figures.some((f) => f.page === p.pdfPage)).map((i) => stableSubId(d, i.label));
    let status: PageStatus = p.status;
    let statusNote = p.statusNote;
    if (!refs.length && (p.status === 'lest' || p.status === 'ai-lest' || p.status === 'ocr-lest' || p.status === 'trenger-visuell-kontroll')) {
      status = 'irrelevant';
      statusNote = 'Ingen spørsmål på siden (forside, instruksjoner eller karakterskala).';
    }
    store.upsert({ ...p, taskRefs: refs, status, statusNote }, { silent: true });
  }
  store.bump();
  const mc = bi.items.filter((i) => i.format === 'flervalg');
  const mcKey = mc.filter((i) => i.choices.some((c) => c.correct) || i.answerLetter).length;
  const missing = bi.items.filter((i) => i.stemMissing).length;
  const notes = [...(store.get<SourceDoc>('doc', d.id)!.notes ?? []).filter((n) => !n.startsWith('Format:')), `Format: ${[...perPart.entries()].map(([p, n]) => `Del ${p}: ${n}`).join(', ')}.${bi.shuffledOptions ? ' Svaralternativene kom i tilfeldig rekkefølge på eksamen.' : ''}`, ...bi.notes];
  patchDoc(d.id, { selfContained: true, notes, guide: undefined, linkedExamDocId: undefined });
  setStage(d.id, 'segmentering', {
    status: 'ferdig',
    note: `${bi.items.length} spørsmål funnet (${[...perPart.entries()].map(([p, n]) => `Del ${p}: ${n}`).join(', ')})${mc.length ? `. Fasit funnet for ${mcKey} av ${mc.length} flervalg` : ''}${missing ? `. ${missing} har bare svar i kilden, ikke oppgavetekst` : ''}.`,
  });
  setStage(d.id, 'analyse', { status: 'venter' });
}

function segmentOppgDoc(d: SourceDoc, pages: PageRec[], o: OSegmentation) {
  const now = nowIso();
  const keep = new Set<string>();
  const collection = d.meta.docType === 'oppgavesamling';
  const perTask = new Map<number, number>();
  for (const it of o.items) perTask.set(it.taskNo, (perTask.get(it.taskNo) ?? 0) + 1);
  for (const it of o.items) {
    const sid = stableSubId(d, it.label);
    keep.add(sid);
    const prev = store.get<SubTask>('subtask', sid);
    const userEdited = prev?.textHistory.some((h) => h.by === 'bruker');
    const pagesUsed = [...new Set([...it.regions.map((r) => r.page), ...it.figures.map((f) => f.page)])].sort((a, b) => a - b);
    const st: SubTask = {
      id: sid,
      kind: 'subtask',
      courseId: d.courseId,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      demo: d.demo,
      docId: d.id,
      docVersion: d.version,
      taskNo: it.taskNo,
      sub: it.sub,
      label: it.label,
      format: 'oppgave',
      pages: pagesUsed.length ? pagesUsed : it.pages,
      printedPages: (pagesUsed.length ? pagesUsed : it.pages).map((n) => pages.find((p) => p.pdfPage === n)?.printedPage ?? ''),
      intro: it.intro,
      text: userEdited ? prev!.text : it.stem,
      textVersion: prev?.textVersion ?? 1,
      textHistory: prev?.textHistory ?? [],
      figures: it.figures.map((f) => ({ page: f.page, box: f.box, inGuide: f.inGuide, note: f.inGuide ? 'Figur i løsningsforslaget' : 'Figur i oppgaven' })),
      dependsOn: /\b(i|fra) ([a-e])\)/i.test(it.stem) ? [`${it.taskNo}${/\b(?:i|fra) ([a-e])\)/i.exec(it.stem)![1].toLowerCase()}`] : [],
      guide: it.guide ? { text: it.guide, lines: it.guideLines.map((l) => ({ page: l.page, text: l.text, box: l.box })) } : undefined,
      regions: it.regions,
      solutionRegions: it.solutionRegions,
      answerKeys: it.answerKeys,
      topicHint: it.topicHint,
      fromCollection: collection,
      stemMissing: !it.stem && !it.regions.length,
      analysis: prev?.analysis ?? ({} as SubtaskAnalysis),
      seg: { subtaskCount: perTask.get(it.taskNo) ?? 1, lineBoxes: it.stemLines.map((l) => ({ page: l.page, box: l.box })) },
    };
    store.upsert(st, { silent: true });
  }
  for (const old of store.subtasks(d.courseId)) if (old.docId === d.id && old.docVersion === d.version && !keep.has(old.id)) store.remove(old);
  for (const p of pages) {
    const refs = o.items.filter((i) => i.pages.includes(p.pdfPage) || i.regions.some((r) => r.page === p.pdfPage) || i.solutionRegions.some((r) => r.page === p.pdfPage)).map((i) => stableSubId(d, i.label));
    let status: PageStatus = p.status;
    let statusNote = p.statusNote;
    if (!refs.length && (p.status === 'lest' || p.status === 'ai-lest' || p.status === 'ocr-lest' || p.status === 'trenger-visuell-kontroll' || p.status === 'trenger-ai-lesing' || p.status === 'uleselig')) {
      status = 'irrelevant';
      statusNote = collection ? 'Ingen oppgaver på siden (forside, emnebeskrivelse eller formelark).' : 'Ingen oppgaver på siden.';
    }
    store.upsert({ ...p, taskRefs: refs, status, statusNote }, { silent: true });
  }
  store.bump();
  const tasks = new Set(o.items.map((i) => i.taskNo)).size;
  const withSol = o.items.filter((i) => i.solutionRegions.length || i.guide).length;
  const keys = o.items.filter((i) => i.answerKeys.length).length;
  const notes = [...(store.get<SourceDoc>('doc', d.id)!.notes ?? []).filter((n) => !n.startsWith('Format:')), `Format: ${collection ? 'oppgavesamling med løsningsdel' : 'oppgaver med løsning etter hver oppgave'}.`, ...o.notes];
  patchDoc(d.id, { selfContained: true, notes, guide: undefined, linkedExamDocId: undefined });
  setStage(d.id, 'segmentering', {
    status: 'ferdig',
    note: collection
      ? `${o.items.length} oppgaver funnet, løsning for ${withSol}${keys ? `, sluttsvar lest for ${keys}` : ''}.`
      : `${tasks} oppgaver, ${o.items.length} deloppgaver. Løsning funnet for ${withSol}${keys ? `, sluttsvar lest for ${keys}` : ''}.`,
  });
  setStage(d.id, 'analyse', { status: 'venter' });
}

function ruleAnalyze(st: SubTask, d: SourceDoc, siblings: SubTask[], domains?: string[]): SubtaskAnalysis {
  // Tidligere deloppgaver er kontekst bare når de hører til samme oppgave (ikke frittstående spørsmål i Del 1–2).
  const prior = st.part && st.part !== 3 ? '' : siblings.filter((s) => s.taskNo === st.taskNo && s.sub.localeCompare(st.sub, 'nb', { numeric: true }) < 0).map((s) => s.text).join('\n');
  const course = store.get<Course>('course', d.courseId);
  const r = analyzeSubtaskRules({
    domains,
    intro: [st.topicHint ? `Tema: ${st.topicHint}.` : '', st.intro ?? ''].filter(Boolean).join(' '),
    priorText: prior,
    text: st.text,
    guideText: st.guide?.text,
    format: st.format,
    choices: st.choices,
    label: st.label,
    points: st.seg.points,
    pointsQuote: st.seg.pointsQuote,
    taskPoints: st.seg.taskPoints,
    taskWeightPct: st.seg.taskWeightPct,
    subtaskCount: st.seg.subtaskCount,
    equalSubWeights: d.equalSubWeights,
    figurePages: st.figures.map((f) => f.page),
    extraction: store.pages(d.id).some((p) => st.pages.includes(p.pdfPage) && p.textSource === 'ai-lesing') ? 'ai-lesing' : store.pages(d.id).some((p) => st.pages.includes(p.pdfPage) && p.textSource === 'manuell') ? 'manuell' : 'tekstlag',
    source: { docId: d.id, docVersion: d.version, pdfPage: st.pages[0], printedPage: st.printedPages?.[0] },
    examMinutes: course?.examInfo.durationMin,
  });
  // Løsningsforslag med formler: sluttsvarene er det sikre grunnlaget, resten vises som utsnitt.
  if (st.format === 'oppgave') {
    const src = { docId: d.id, docVersion: d.version, pdfPage: st.solutionRegions?.[0]?.page ?? st.pages[0], taskLabel: st.label };
    const own = (st.answerKeys ?? []).map((k, i) => ({ id: `lf-${st.id}-${i}`, text: `Svar i løsningsforslaget: ${k.display}`, basis: 'offisielt' as const, source: { ...src, quote: k.display } }));
    if (st.solutionRegions?.length) own.push({ id: `lf-${st.id}-utsnitt`, text: 'Hele løsningsforslaget står i dokumentet og vises som utsnitt av originalen.', basis: 'offisielt' as const, source: { ...src, quote: 'Løsning' } });
    r.analysis.criteria = [...r.analysis.criteria.filter((c) => c.basis !== 'offisielt'), ...own];
    r.analysis.computed = undefined;
  } else if (d.layout === 'essay') {
    // Tekstoppgaver: veiledningens generelle kriterier gjelder alle spørsmålene, pensumhenvisningen dette spørsmålet.
    const src = (page: number, quote: string) => ({ docId: d.id, docVersion: d.version, pdfPage: page, quote: quote.slice(0, 200), taskLabel: st.label });
    const general = (d.essayCriteria ?? []).map((c, i) => ({ id: `ess-${d.id}-${st.label}-${i}`, text: c.text, basis: 'offisielt' as const, source: src(c.page, c.quote) }));
    const own = st.guide?.text ? officialFromGuide(d, st.label, st.guide.lines.length ? st.guide.lines : [{ page: st.pages[0], text: st.guide.text }]) : [];
    r.analysis.criteria = [...r.analysis.criteria.filter((c) => c.basis !== 'offisielt'), ...own, ...general];
    r.analysis.computed = undefined;
    if (own.length || general.length) r.analysis.certainty.basis = `${r.analysis.certainty.basis} Veiledningen gir pensumhenvisning og ${general.length} generelle kriterier.`.trim();
  } else if (st.guide?.text) {
    // Veiledning i samme dokument: offisielle kriterier per spørsmål.
    const own = officialFromGuide(d, st.label, st.guide.lines);
    r.analysis.criteria = [...r.analysis.criteria.filter((c) => c.basis !== 'offisielt'), ...own];
    r.analysis.certainty.basis = `${r.analysis.certainty.basis} Sensorveiledningen står i samme dokument (${own.length} offisielle punkter).`.trim();
  }
  if (st.choices?.some((c) => c.correct)) {
    const c = st.choices.find((x) => x.correct)!;
    r.analysis.criteria.unshift({ id: `fasit-${st.id}`, text: `Riktig alternativ: ${c.letter}) ${c.text}`, basis: 'offisielt', source: { docId: d.id, docVersion: d.version, pdfPage: st.pages[0], quote: st.answerBasis, taskLabel: st.label } });
  }
  // Flervalg har fasit i alternativene; tall i spørsmålet er ikke noe som skal regnes ut.
  if (st.format === 'flervalg') r.analysis.computed = undefined;
  if (st.guide?.text && r.analysis.computed?.answers.length) {
    const gi = { taskNo: st.taskNo, sub: st.sub, label: st.label, page: st.guide.lines[0]?.page ?? st.pages[0], lines: st.guide.lines, text: st.guide.text };
    const { conflicts, agreements } = findConflicts(d, gi as never, { ...st, analysis: r.analysis });
    for (const c of conflicts) c.resolution = explainConflict(c, { ...st, analysis: r.analysis });
    r.analysis.conflicts = conflicts;
    r.analysis.agreements = agreements;
  }
  if (st.part === 1 && st.seg.points === 1) r.analysis.points = { official: 1, officialQuote: st.seg.pointsQuote, officialSource: { docId: d.id, docVersion: d.version, pdfPage: st.pages[0], quote: st.seg.pointsQuote } };
  // Behold offisielle kriterier og konflikter fra koblede veiledninger.
  const prev = st.analysis;
  if (prev?.criteria && !st.guide?.text) r.analysis.criteria = [...r.analysis.criteria, ...prev.criteria.filter((c) => c.basis === 'offisielt' && c.source?.docId !== d.id)];
  if (prev?.conflicts && !st.guide?.text) r.analysis.conflicts = prev.conflicts;
  if (prev?.ai) r.analysis.ai = prev.ai;
  if (prev?.points?.officialSource && prev.points.officialSource.docId !== d.id && r.analysis.points.official === undefined) r.analysis.points = prev.points;
  return r.analysis;
}

async function stageAnalyze(id: string) {
  const d = store.get<SourceDoc>('doc', id)!;
  const sts = store.subtasks(d.courseId).filter((s) => s.docId === id && s.docVersion === d.version).sort((a, b) => a.taskNo - b.taskNo || a.sub.localeCompare(b.sub, 'nb', { numeric: true }));
  setStage(id, 'analyse', { status: 'pågår', progress: { done: 0, total: sts.length }, note: 'Regelbasert analyse …' });
  // Fagområde (økonomi, elektro, digital) avgjøres for hele dokumentet, så enkeltord ikke trekker en oppgave over i feil fag.
  const domains = detectDomains(sts.map((s) => [s.topicHint ? `Tema: ${s.topicHint}.` : '', s.intro ?? '', s.text, s.guide?.text ?? '', (s.choices ?? []).map((c) => c.text).join(' ')].join('\n')));
  for (const st of sts) store.upsert({ ...st, analysis: ruleAnalyze(st, d, sts, domains) }, { silent: true });
  store.bump();
  let analyzer: SourceDoc['analyzer'] = 'regelbasert';
  let note = `${sts.length} deloppgaver analysert regelbasert`;
  // Store oppgavesamlinger: AI bare for oppgavene reglene ikke kjente igjen (sparer kvoten).
  const forAi = sts.length > 30 ? sts.filter((s) => store.get<SubTask>('subtask', s.id)!.analysis.analyzer === 'ingen') : sts;
  if (aiAvailable() && forAi.length) {
    setStage(id, 'analyse', { status: 'pågår', note: 'AI-analyse av deloppgavene …', progress: { done: 0, total: forAi.length } });
    const chunks: SubTask[][] = [];
    for (let i = 0; i < forAi.length; i += 6) chunks.push(forAi.slice(i, i + 6));
    let aiDone = 0;
    let aiFailed = 0;
    const course = store.get<Course>('course', d.courseId);
    for (const ch of chunks) {
      const fresh = ch.map((s) => store.get<SubTask>('subtask', s.id)!);
      const r = await analyzeSubtasksAi({
        course: course?.name ?? 'faget',
        docLabel: d.meta.setLabel ?? d.fileName,
        docType: d.meta.docType,
        tasks: fresh.map((s) => ({ label: s.label, intro: s.intro ?? '', text: s.text, pages: s.pages, figureNotes: s.figures.map((f) => f.note) })),
        officialCriteria: Object.fromEntries(fresh.map((s) => [s.label, s.analysis.criteria.filter((c) => c.basis === 'offisielt').map((c) => c.text)])),
      });
      if (!r.ok) {
        aiFailed += ch.length;
        if (r.code === 'not_granted' || r.code === 'unavailable') break;
        continue;
      }
      for (const a of r.data) {
        const st = fresh.find((s) => s.label === a.label);
        if (!st) continue;
        const cur = store.get<SubTask>('subtask', st.id)!;
        const an = { ...cur.analysis, ai: { ...a, at: nowIso() } };
        if (cur.analysis.analyzer === 'ingen') {
          // Reglene kjente ikke oppgaven: AI-tolkningen blir hovedanalysen, tydelig merket.
          an.analyzer = 'ai';
          an.assignment = { value: a.assignment, status: 'ai-tolkning', basis: 'AI-tolkning av oppgaveteksten' };
          an.topics = { value: a.topics, status: 'ai-tolkning', basis: 'AI-tolkning' };
          an.skills = { value: a.skills, status: 'ai-tolkning', basis: 'AI-tolkning' };
          an.taskType = { value: a.taskType.length ? a.taskType : cur.analysis.taskType.value, status: 'ai-tolkning', basis: 'AI-tolkning' };
          an.formulas = { value: a.formulas, status: 'ai-tolkning', basis: 'AI-tolkning' };
          an.prerequisites = { value: a.prerequisites, status: 'ai-tolkning', basis: 'AI-tolkning' };
          an.misconceptions = { value: a.misconceptions, status: 'ai-tolkning', basis: 'AI-tolkning' };
          an.variation = { value: a.variation, status: 'ai-tolkning', basis: 'AI-tolkning' };
          an.criteria = [...cur.analysis.criteria, ...a.criteria.map((c, i) => ({ id: `ai${i}`, text: c.text, basis: c.basis }))];
          if (a.familyGuess.knownFamilyId) {
            an.familyKbId = a.familyGuess.knownFamilyId;
            an.familyBasis = 'Foreslått av AI. Parametere er ikke lest av regelmotoren, så fasit er ikke kontrollert.';
          }
          an.certainty = { ...a.certainty, level: a.certainty.level === 'høy' ? 'middels' : a.certainty.level, extraction: cur.analysis.certainty.extraction, validation: 'ikke-kontrollert', uncertainties: [...a.certainty.uncertainties, 'Analysen er en AI-tolkning og er ikke matematisk kontrollert.'] };
          if (a.timeMinutes) an.time = { estimate: a.timeMinutes, basis: 'AI-anslag' };
        } else {
          an.analyzer = 'regelbasert+ai';
        }
        store.upsert({ ...cur, analysis: an }, { silent: true });
        aiDone++;
      }
      setStage(id, 'analyse', { status: 'pågår', note: 'AI-analyse av deloppgavene …', progress: { done: aiDone, total: sts.length } });
    }
    store.bump();
    if (aiDone) {
      analyzer = 'regelbasert+ai';
      note = `${sts.length} deloppgaver: regelbasert analyse og AI-tolkning (${aiDone})`;
    }
    if (aiFailed) note += `. AI-analysen feilet for ${aiFailed}.`;
  } else if (sts.length) {
    const unknown = sts.filter((s) => store.get<SubTask>('subtask', s.id)!.analysis.analyzer === 'ingen').length;
    if (unknown) note += `. ${unknown} ble ikke gjenkjent og trenger AI-analyse eller manuell merking.`;
  }
  patchDoc(id, { analyzer });
  setStage(id, 'analyse', { status: 'ferdig', note, progress: { done: sts.length, total: sts.length } });
}

// ——— Kobling av veiledninger ———

function linkGuide(id: string, forcedExamId?: string) {
  const g = store.get<SourceDoc>('doc', id)!;
  const items = g.guide?.items ?? [];
  const guideText = store.pages(id).filter((p) => p.docVersion === g.version).map((p) => p.text).join('\n');
  const exams = store.docs(g.courseId).filter((d) => d.meta.docType === 'eksamen' && !d.selfContained && d.status !== 'duplikat' && !d.supersededBy && d.stages.analyse.status === 'ferdig');
  const subs = store.currentSubtasks(g.courseId);
  const cands = exams.map((e) => scoreGuideLink(g, guideText, items as never, e, store.pages(e.id).map((p) => p.text).join('\n'), subs.filter((s) => s.docId === e.id)));
  let chosenId = forcedExamId;
  let ambiguous = false;
  if (!chosenId) {
    const c = chooseLink(cands);
    chosenId = c.chosen && !c.ambiguous ? c.chosen.examDocId : undefined;
    ambiguous = c.ambiguous;
  }
  // Fjern tidligere bidrag fra denne veiledningen.
  for (const s of subs) {
    const had = s.analysis.criteria?.some((c) => c.source?.docId === id) || s.analysis.conflicts?.some((c) => c.source?.docId === id) || s.analysis.points?.officialSource?.docId === id;
    if (!had) continue;
    const pts = s.analysis.points.officialSource?.docId === id ? { estimate: s.analysis.points.estimate, estimateBasis: s.analysis.points.estimateBasis } : s.analysis.points;
    store.upsert({ ...s, analysis: { ...s.analysis, criteria: s.analysis.criteria.filter((c) => c.source?.docId !== id), conflicts: s.analysis.conflicts.filter((c) => c.source?.docId !== id), agreements: (s.analysis.agreements ?? []).filter((a) => !a.includes(`[${id}]`)), points: pts } }, { silent: true });
  }
  const candList = cands.map((c) => ({ examDocId: c.examDocId, score: Math.round(c.score * 10) / 10, basis: c.basis })).sort((a, b) => b.score - a.score);
  if (!chosenId) {
    patchDoc(id, { linkedExamDocId: undefined, linkBasis: undefined, linkCandidates: candList });
    // Uten eksamenssett: ikke «venter» (da ville dokumentet bli behandlet på nytt ved hver oppstart).
    // Koblingen prøves automatisk igjen når et sett er analysert (relinkGuides).
    setStage(id, 'kobling', { status: exams.length ? 'trenger-hjelp' : 'hoppet-over', note: exams.length ? (ambiguous ? 'Koblingen er usikker. Velg hvilket eksamenssett veiledningen gjelder.' : 'Fant ikke sikkert hvilket sett veiledningen gjelder.') : 'Ingen eksamenssett å koble til ennå. Koblingen skjer automatisk når et sett er analysert.' });
    store.bump();
    return;
  }
  const chosen = cands.find((c) => c.examDocId === chosenId);
  const g2 = patchDoc(id, { linkedExamDocId: chosenId, linkBasis: forcedExamId ? ['Valgt av deg.', ...(chosen?.basis ?? [])] : chosen?.basis, linkConfirmed: !!forcedExamId, linkCandidates: candList });
  let criteria = 0;
  let conflicts = 0;
  for (const it of items) {
    const st = store.currentSubtasks(g.courseId).find((s) => s.docId === chosenId && (s.label === it.label || (!it.sub && s.taskNo === it.taskNo && s.sub === '')));
    if (!st) continue;
    const off = officialCriteria(g2, it as never);
    const { conflicts: cf, agreements } = findConflicts(g2, it as never, st);
    for (const c of cf) c.resolution = explainConflict(c, st);
    criteria += off.length;
    conflicts += cf.length;
    const points = st.analysis.points.official === undefined && it.points !== undefined ? { ...st.analysis.points, official: it.points, officialQuote: it.pointsQuote, officialSource: { docId: g2.id, docVersion: g2.version, pdfPage: it.page, quote: it.pointsQuote } } : st.analysis.points;
    store.upsert({ ...st, analysis: { ...st.analysis, criteria: [...st.analysis.criteria.filter((c) => c.source?.docId !== id), ...off], conflicts: [...st.analysis.conflicts.filter((c) => c.source?.docId !== id), ...cf], agreements: [...(st.analysis.agreements ?? []), ...agreements.map((a) => `${a} [${id}]`)], points } }, { silent: true });
  }
  store.bump();
  const exam = store.get<SourceDoc>('doc', chosenId);
  setStage(id, 'kobling', { status: 'ferdig', note: `Koblet til ${exam?.meta.setLabel ?? exam?.fileName}: ${criteria} offisielle kriterier${conflicts ? `, ${conflicts} konflikt${conflicts === 1 ? '' : 'er'} med matematisk kontroll` : ''}` });
}

export function relinkGuides(courseId: string) {
  for (const g of store.docs(courseId)) {
    if (g.status === 'duplikat' || g.supersededBy) continue;
    if (g.meta.docType !== 'sensorveiledning' && g.meta.docType !== 'losningsforslag') continue;
    if (g.selfContained) continue;
    if (g.stages.segmentering.status !== 'ferdig') continue;
    linkGuide(g.id, g.linkConfirmed ? g.linkedExamDocId : undefined);
    stageCoverage(g.id);
  }
}

export function confirmGuideLink(guideId: string, examId: string) {
  linkGuide(guideId, examId);
  stageCoverage(guideId);
}

// ——— Dekningskontroll ———

function stageCoverage(id: string) {
  const d = store.get<SourceDoc>('doc', id)!;
  // Duplikater (f.eks. eksamensoppgaven når veiledningen har de samme spørsmålene) skal ikke be om hjelp.
  if (d.status === 'duplikat' || d.status === 'erstattet') return;
  const pages = store.pages(id).filter((p) => p.docVersion === d.version);
  const counts: Record<string, number> = {};
  for (const p of pages) counts[p.status] = (counts[p.status] ?? 0) + 1;
  const open = pages.filter((p) => p.status === 'trenger-ai-lesing' || p.status === 'uleselig' || p.status === 'ikke-behandlet').length;
  const ocr = pages.filter((p) => p.status === 'ocr-lest').length;
  const visual = pages.filter((p) => p.status === 'trenger-visuell-kontroll').length;
  const subs = store.currentSubtasks(d.courseId).filter((s) => s.docId === id);
  const lowCert = subs.filter((s) => s.analysis.certainty?.level === 'lav').length;
  const parts = [`${pages.length - open} av ${pages.length} sider lest`];
  if (ocr) parts.push(`${ocr} lest med tekstgjenkjenning`);
  if (visual) parts.push(`${visual} med figur (vises som utsnitt, ikke tolket automatisk)`);
  if (isExamSet(d)) parts.push(`${subs.length} ${d.selfContained ? 'spørsmål' : 'deloppgaver'}${lowCert ? `, ${lowCert} med lav sikkerhet` : ''}`);
  const needsHelp = open > 0 || STAGE_ORDER.some((s) => d.stages[s].status === 'trenger-hjelp' || d.stages[s].status === 'feil') || (isExamSet(d) && !subs.length);
  setStage(id, 'dekning', { status: needsHelp ? 'trenger-hjelp' : 'ferdig', note: parts.join(' · ') });
  patchDoc(id, { status: needsHelp ? 'trenger-hjelp' : 'ferdig' });
}

// ——— Familier ———

let clusterRunning = false;
export async function refreshFamilies(courseId: string) {
  const subs = store.currentSubtasks(courseId).filter((s) => !store.get<SourceDoc>('doc', s.docId)?.reserved);
  const existing = store.families(courseId);
  const course = store.get<Course>('course', courseId);
  const rule = deriveRuleFamilies(courseId, subs, existing, course?.demo);
  for (const f of existing) if (f.basis === 'regelbasert' && !rule.some((r) => r.id === f.id)) store.remove(f);
  store.upsertMany(rule);
  const unknown = subs.filter((s) => !s.analysis.familyKbId && s.analysis.analyzer !== undefined);
  const aiFams = existing.filter((f) => f.basis === 'ai-forslag');
  const covered = new Set(aiFams.flatMap((f) => f.members));
  const todo = unknown.filter((s) => !covered.has(s.id));
  if (!todo.length || !aiAvailable() || clusterRunning) return;
  clusterRunning = true;
  try {
    const all = unknown;
    const docs = new Map(store.docs(courseId).map((d) => [d.id, d]));
    const r = await clusterFamiliesAi(all.map((s) => ({ id: s.id, setLabel: docs.get(s.docId)?.meta.setLabel ?? '', label: s.label, text: s.text.slice(0, 500), assignment: s.analysis.ai?.assignment ?? s.analysis.assignment.value, skills: s.analysis.ai?.skills ?? s.analysis.skills.value })));
    if (!r.ok) return;
    for (const f of aiFams) store.remove(f);
    const now = nowIso();
    const list: Family[] = r.data.map((f) => ({
      id: newId('fam'),
      kind: 'family',
      courseId,
      createdAt: now,
      updatedAt: now,
      demo: course?.demo,
      name: f.name,
      description: f.description,
      basis: 'ai-forslag',
      members: f.members,
      commonStructure: f.commonStructure,
      surfaceOnly: f.surfaceOnly,
      differences: f.differences.map((x) => ({ subtaskId: x.id, changes: x.changes })),
      difficultyNote: f.difficultyNote ? { text: f.difficultyNote, basis: 'faglig-vurdering' } : undefined,
      skills: [],
    }));
    store.upsertMany(list);
  } finally {
    clusterRunning = false;
  }
}

// ——— Rettelser ———

export function editSubtaskText(subId: string, text: string) {
  const st = store.get<SubTask>('subtask', subId);
  if (!st || st.text === text) return;
  const d = store.get<SourceDoc>('doc', st.docId)!;
  const next: SubTask = { ...st, text, textVersion: st.textVersion + 1, textHistory: [...st.textHistory, { text: st.text, at: nowIso(), by: 'bruker' }] };
  const siblings = store.currentSubtasks(st.courseId).filter((s) => s.docId === st.docId).map((s) => (s.id === subId ? next : s));
  next.analysis = ruleAnalyze(next, d, siblings);
  if (next.analysis.ai) next.analysis.ai = { ...next.analysis.ai, certainty: { ...next.analysis.ai.certainty, uncertainties: [...next.analysis.ai.certainty.uncertainties, 'AI-tolkningen gjelder forrige versjon av teksten.'] } };
  store.upsert(next);
  // Genererte oppgaver som bygde på denne deloppgaven, merkes for oppdatering.
  for (const g of store.gens(st.courseId)) if (g.sourceRefs.subtaskIds.includes(subId)) store.upsert({ ...g, validation: { ...g.validation, checks: [...g.validation.checks, { name: 'Kilde endret', ok: true, detail: `Kildeteksten for ${st.label} ble rettet ${new Date().toLocaleDateString('nb-NO')}.` }] } });
  relinkGuides(st.courseId);
  void refreshFamilies(st.courseId);
  store.toast(`Oppgave ${st.label} er rettet og analysert på nytt.`, 'ok');
}

export function setPageText(pageId: string, text: string) {
  const p = store.get<PageRec>('page', pageId);
  if (!p) return;
  store.upsert({ ...p, text, textSource: 'manuell', status: 'manuelt-rettet', statusNote: 'Tekst skrevet inn av deg', lines: text.split('\n').map((t, i, arr) => ({ t, b: [0.06, 0.06 + (0.88 * i) / Math.max(1, arr.length), 0.88, 0.88 / Math.max(1, arr.length)] as [number, number, number, number] })) });
  rerunFrom(p.docId, 'bildelesing');
}

export function rerunFrom(docId: string, stage: StageName) {
  const d = store.get<SourceDoc>('doc', docId);
  if (!d) return;
  const idx = STAGE_ORDER.indexOf(stage);
  const stages = { ...d.stages };
  for (const s of STAGE_ORDER.slice(idx)) stages[s] = { status: 'venter' };
  store.upsert({ ...d, stages, status: 'behandles' });
  void processQueue();
}

export function updateDocMeta(docId: string, patch: Partial<SourceDoc['meta']>, extra: Partial<SourceDoc> = {}) {
  const d = store.get<SourceDoc>('doc', docId);
  if (!d) return;
  const typeChanged = patch.docType && patch.docType !== d.meta.docType;
  store.upsert({ ...d, ...extra, meta: { ...d.meta, ...patch, confirmed: true } });
  if (typeChanged) {
    for (const s of store.subtasks(d.courseId).filter((x) => x.docId === docId)) store.remove(s);
    rerunFrom(docId, 'segmentering');
  } else {
    relinkGuides(d.courseId);
    void refreshFamilies(d.courseId);
  }
}

export function resolveSimilar(docId: string, choice: 'duplikat' | 'alternativ' | 'eget') {
  const d = store.get<SourceDoc>('doc', docId);
  if (!d?.similarTo) return;
  if (choice === 'duplikat') {
    store.upsert({ ...d, status: 'duplikat', duplicateOf: d.similarTo.docId, similarTo: { ...d.similarTo, resolved: choice } });
    for (const s of store.subtasks(d.courseId).filter((x) => x.docId === docId)) store.remove(s);
  } else if (choice === 'alternativ') {
    store.upsert({ ...d, meta: { ...d.meta, comparable: false, comparabilityNote: 'Alternativ versjon av et annet sett. Holdes utenfor tellingen.' }, similarTo: { ...d.similarTo, resolved: choice } });
  } else store.upsert({ ...d, similarTo: { ...d.similarTo, resolved: choice } });
  void refreshFamilies(d.courseId);
}

export async function replaceDocument(docId: string, file: IncomingFile) {
  const old = store.get<SourceDoc>('doc', docId);
  if (!old) return;
  // Køen startes først når versjonsnummeret er satt, ellers kan analysen starte på «versjon 1».
  const [created] = await ingestFiles([file], old.courseId, { startQueue: false });
  if (!created || created.status === 'duplikat') {
    store.toast('Den nye filen er identisk med en eksisterende fil.', 'info');
    return;
  }
  store.upsert({ ...created, version: old.version + 1, lineageId: old.lineageId, previousVersionId: old.id, meta: { ...created.meta, docType: old.meta.docType, year: old.meta.year, term: old.meta.term, examType: old.meta.examType, setLabel: old.meta.setLabel, confirmed: old.meta.confirmed }, reserved: old.reserved });
  if (old.meta.docType === 'sensorveiledning' || old.meta.docType === 'losningsforslag') stripGuideContributions(old.courseId, old.id);
  store.upsert({ ...old, supersededBy: created.id, status: 'erstattet' });
  store.toast(`Ny versjon av «${old.fileName}» behandles. Den gamle versjonen er beholdt for sporbarhet.`, 'ok');
  void processQueue();
}

/** Fjerner kriterier, konflikter og poeng som en veiledning har lagt til på oppgavene i et sett. */
function stripGuideContributions(courseId: string, guideId: string) {
  for (const s of store.subtasks(courseId)) {
    if (s.docId === guideId) continue;
    const had = s.analysis.criteria?.some((c) => c.source?.docId === guideId) || s.analysis.conflicts?.some((c) => c.source?.docId === guideId) || s.analysis.points?.officialSource?.docId === guideId;
    if (!had) continue;
    const pts = s.analysis.points.officialSource?.docId === guideId ? { estimate: s.analysis.points.estimate, estimateBasis: s.analysis.points.estimateBasis } : s.analysis.points;
    store.upsert({ ...s, analysis: { ...s.analysis, criteria: s.analysis.criteria.filter((c) => c.source?.docId !== guideId), conflicts: s.analysis.conflicts.filter((c) => c.source?.docId !== guideId), agreements: (s.analysis.agreements ?? []).filter((a) => !a.includes(`[${guideId}]`)), points: pts } }, { silent: true });
  }
}

export async function deleteDocument(docId: string) {
  const d = store.get<SourceDoc>('doc', docId);
  if (!d) return;
  if (d.meta.docType === 'sensorveiledning' || d.meta.docType === 'losningsforslag') stripGuideContributions(d.courseId, docId);
  for (const p of store.pages(docId)) store.remove(p);
  for (const s of store.subtasks(d.courseId).filter((x) => x.docId === docId)) store.remove(s);
  if (d.status !== 'duplikat' && store.platform) await blobs.remove(store.platform, blobRef(d));
  store.remove(d);
  // Slettes en ny versjon, blir forrige versjon den gjeldende igjen.
  const prev = d.previousVersionId ? store.get<SourceDoc>('doc', d.previousVersionId) : undefined;
  if (prev && prev.supersededBy === d.id) {
    const needsHelp = STAGE_ORDER.some((st) => prev.stages[st].status === 'trenger-hjelp' || prev.stages[st].status === 'feil');
    store.upsert({ ...prev, supersededBy: undefined, status: needsHelp ? 'trenger-hjelp' : 'ferdig' });
    store.toast(`Forrige versjon av «${prev.fileName}» gjelder igjen.`, 'info');
  }
  // Dokumenter som var merket som samme sett som dette, analyseres på nytt (nå er de ikke lenger dekket).
  let requeue = false;
  for (const o of store.docs(d.courseId)) {
    if (o.status !== 'duplikat' || o.duplicateOf !== d.id) continue;
    const stages = { ...o.stages };
    const from = o.stages.sidelesing.status === 'ferdig' ? STAGE_ORDER.indexOf('segmentering') : STAGE_ORDER.indexOf('sidelesing');
    for (const st of STAGE_ORDER.slice(from)) stages[st] = { status: 'venter', note: 'Analyseres på nytt fordi dokumentet det var en kopi av, er slettet' };
    store.upsert({ ...o, status: 'behandles', duplicateOf: undefined, stages });
    requeue = true;
  }
  relinkGuides(d.courseId);
  void refreshFamilies(d.courseId);
  if (requeue) void processQueue();
}

/** Dokumenter behandlet med en eldre versjon av kjeden analyseres på nytt (originalen må finnes på enheten). */
export async function migrateDocs(): Promise<number> {
  let n = 0;
  for (const d of store.list<SourceDoc>('doc')) {
    if (d.status === 'duplikat' || d.status === 'erstattet' || d.supersededBy) continue;
    if ((d.pipelineVersion ?? 1) >= PIPELINE_VERSION) continue;
    // Bare når originalen finnes her; ellers beholdes forrige analyse.
    const has = await blobs.get(blobRef(d)).catch(() => null);
    if (!has) continue;
    const stages = { ...d.stages };
    for (const st of STAGE_ORDER.slice(1)) stages[st] = { status: 'venter', note: 'Analyseres på nytt med forbedret lesing' };
    store.upsert({ ...d, stages, status: 'behandles', pipelineVersion: PIPELINE_VERSION }, { silent: true });
    n++;
  }
  if (n) {
    store.bump();
    void processQueue();
  }
  return n;
}

export async function resumeInterrupted(): Promise<number> {
  const docs = store.list<SourceDoc>('doc');
  let n = 0;
  for (const d of docs) {
    if (!needsWork(d)) continue;
    // Trinn som trenger originalfilen, fortsettes bare på enheten som har den.
    // (Ellers ville en telefon uten filen markere dokumentet som feilet midt i analysen på PC-en.)
    const needsFile = (['sidelesing', 'bildelesing'] as const).some((s) => d.stages[s].status === 'venter' || d.stages[s].status === 'pågår');
    if (needsFile && !(await blobs.get(blobRef(d)).catch(() => null))) continue;
    const stages = { ...d.stages };
    for (const s of STAGE_ORDER) if (stages[s].status === 'pågår') stages[s] = { ...stages[s], status: 'venter', note: 'Fortsetter der analysen stoppet' };
    store.upsert({ ...d, stages }, { silent: true });
    n++;
  }
  if (n) {
    store.bump();
    void processQueue();
  }
  return n;
}

export function familyNameForSubtask(st: SubTask): string | undefined {
  const fam = store.families(st.courseId).find((f) => f.members.includes(st.id));
  return fam?.name ?? getFamily(st.analysis.familyKbId)?.name;
}
