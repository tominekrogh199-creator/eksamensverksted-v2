// Syntetisk demomateriale. Alt her er merket DEMO og sendes gjennom den samme
// opplastings- og analyseflyten som brukerens egne filer.

import type { GeneratedTask, ImageRef } from '../domain/types';
import { newId, nowIso } from '../domain/types';
import { store } from '../state/store';
import { createCourse, ingestFiles } from '../analysis/pipeline';
import { equilibriumBody, CONTEXTS } from '../families/likevekt';
import { validateTask } from '../generator/validate';
import { R } from '../families/common';
import { sha256Hex } from '../ingest/fingerprint';
import HASHES from './hashes.json';

export const DEMO_FILES = [
  { file: 'DEMO_A_eksamen_host2023.pdf', type: 'application/pdf', what: 'Eksamen høst 2023 (ordinær). Poeng per deloppgave.' },
  { file: 'DEMO_A_vurderingsforslag.pdf', type: 'application/pdf', what: 'Vurderingsforslag til DEMO A.' },
  { file: 'DEMO_A_eksamen_host2023_kopi.pdf', type: 'application/pdf', what: 'Eksakt kopi av DEMO A. Skal fanges som duplikat.' },
  { file: 'DEMO_B_eksamen_var2024.pdf', type: 'application/pdf', what: 'Eksamen vår 2024. Forside uten sidenummer, figur, vekt per oppgave, kostnad flyttet til oppgave 1.' },
  { file: 'DEMO_B_sensorveiledning_skannet.pdf', type: 'application/pdf', what: 'Skannet sensorveiledning uten tekstlag. Krever bildelesing eller innskrevet tekst.' },
  { file: 'DEMO_C_konte_host2024.pdf', type: 'application/pdf', what: 'Kontinuasjonseksamen høst 2024. Oppgave 1 tester prosent.' },
  { file: 'DEMO_C_vurderingsforslag.pdf', type: 'application/pdf', what: 'Vurderingsforslag til DEMO C, med én bevisst regnefeil (grunnlagsfeil i 1a).' },
  { file: 'DEMO_emnebeskrivelse.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', what: 'Emnebeskrivelse med læringsutbytte (DOCX). Noen mål dekkes ikke av settene.' },
];

export const DEMO_IMAGE = { file: 'DEMO_elevforsok_likevekt.jpg', type: 'image/jpeg' };

/** Fast avlesning av demobildet, brukt bare når AI-bildelesing ikke er tilgjengelig. Merket som demo-fast. */
export const DEMO_HANDWRITING = {
  steps: [
    { text: 'Qd = Qs', legible: 'sikker' as const, region: { x: 0.12, y: 0.11, w: 0.2, h: 0.1 } },
    { text: '120 − 2P = 20 + 3P', legible: 'sikker' as const, region: { x: 0.13, y: 0.3, w: 0.42, h: 0.1 } },
    { text: '100 = 5P', legible: 'sikker' as const, region: { x: 0.14, y: 0.49, w: 0.2, h: 0.1 } },
    { text: 'P = 500', legible: 'usikker' as const, alternatives: ['P = 50', 'P = 300'], region: { x: 0.13, y: 0.68, w: 0.28, h: 0.13 } },
  ],
  note: 'DEMO: forhåndslagret avlesning av demobildet (ikke lest av AI). Siste linje er utydelig i bildet.',
};

/** Innskrivingen av den skannede DEMO B-veiledningen, for demo uten AI. Merket som manuell demo-tekst. */
export const DEMO_B_GUIDE_TEXT = `DEMO – syntetisk dokument laget for Eksamensverksted. Ikke en ekte eksamen.
Sensorveiledning SØK-DEMO-B · Innføring i samfunnsøkonomi (syntetisk demofag)
Gjelder eksamenssettet SØK-DEMO-B, eksamen vår 2024 (ordinær)
Syntetisk sensorveiledning laget for demonstrasjon.
Oppgave 1a
AC = (800 + 15 · 100)/100 = 23 kr per skjorte.
Oppgave 1b
MC = 15 kr og er konstant. Gjennomsnittskostnaden inkluderer faste kostnader fordelt per enhet og er derfor høyere.
Oppgave 2a
Likevekt ved P = 16 og Q = 42. Avlesningen i figuren skal kontrolleres ved regning: Qd = 90 − 48 = 42 og Qs = 10 + 32 = 42.
Oppgave 2b
Pk = 18 og Pp = 13. Nytt kvantum er Q = 36.
Oppgave 3a
Renten økte med 1,5 prosentpoeng.
Oppgave 3b
Renten økte med 50 %: (4,5 − 3)/3 = 0,5.
Oppgave 3c
Prosentpoeng er differansen mellom to prosenttall. Prosentvis endring er differansen delt på startverdien.`;

export async function fetchDemo(file: string, type: string): Promise<{ name: string; type: string; bytes: Uint8Array; demo: true }> {
  // .docx serveres som base64-tekst (artefaktvisningen serverer ikke Word-filer direkte).
  if (file.endsWith('.docx')) {
    const r = await fetch(`demo/${file}.b64.txt`);
    if (!r.ok) throw new Error(`Fant ikke demofilen ${file}`);
    const bin = atob((await r.text()).trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { name: file, type, bytes, demo: true };
  }
  const r = await fetch(`demo/${file}`);
  if (!r.ok) throw new Error(`Fant ikke demofilen ${file}`);
  return { name: file, type, bytes: new Uint8Array(await r.arrayBuffer()), demo: true };
}

export async function startDemoCourse(): Promise<void> {
  const c = createCourse('Samfunnsøkonomi – DEMO', true);
  store.upsert({ ...c, examInfo: { durationMin: 180, aids: 'Enkel kalkulator', format: 'Skriftlig skoleeksamen, 3 timer (fra DEMO-emnebeskrivelsen)' }, ambition: 'God karakter', timeBudget: '4 timer i uka' });
  store.setBusy('demo', 'Henter demofilene …');
  try {
    const files = await Promise.all(DEMO_FILES.map((f) => fetchDemo(f.file, f.type)));
    await ingestFiles(files, c.id);
    store.toast('Demofilene er lastet opp og behandles nå, akkurat som dine egne filer ville blitt.', 'ok');
  } catch (e) {
    store.toast(e instanceof Error ? e.message : 'Kunne ikke hente demofilene.', 'feil');
  } finally {
    store.setBusy('demo', null);
  }
  store.navigate({ name: 'arkiv' });
}

export function isDemoImageHash(hash: string): boolean {
  return hash === (HASHES as Record<string, string>)['DEMO_elevforsok_likevekt.jpg'];
}

export function isDemoGuideHash(hash: string): boolean {
  return hash === (HASHES as Record<string, string>)['DEMO_B_sensorveiledning_skannet.pdf'];
}

export async function demoImageRef(): Promise<{ ref: ImageRef; blob: Blob; hash: string }> {
  const f = await fetchDemo(DEMO_IMAGE.file, DEMO_IMAGE.type);
  const blob = new Blob([f.bytes as BlobPart], { type: DEMO_IMAGE.type });
  const hash = await sha256Hex(f.bytes);
  return { ref: { id: newId('bilde'), name: DEMO_IMAGE.file, at: nowIso(), demo: true }, blob, hash };
}

/** Demoens kontrollerbare eksempel: Qd = 120 − 2P og Qs = 20 + 3P. */
export function demoEquilibriumTask(courseId: string): GeneratedTask {
  const body = equilibriumBody(R(120), R(2), R(20), R(3), CONTEXTS[2], { withInterp: true });
  const t: GeneratedTask = {
    id: `demo-lik-${courseId}`,
    kind: 'gen',
    courseId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    demo: true,
    familyKbId: 'likevekt-lineaer',
    templateId: 'lik-grunn',
    templateVersion: 2,
    level: 1,
    style: 'standard',
    seed: 0,
    wording: 'mal',
    sourceRefs: { subtaskIds: store.currentSubtasks(courseId).filter((s) => s.analysis.familyKbId === 'likevekt-lineaer').map((s) => s.id) },
    validation: { status: 'til-kontroll', checks: [] },
    ...body,
    title: 'DEMO: Likevekt i markedet for leiesykler',
  };
  t.validation = validateTask(t);
  return t;
}
