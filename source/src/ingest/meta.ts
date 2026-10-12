// Forslag til metadata (år, termin, eksamenstype, dokumenttype) med begrunnelse.
// Alt er redigerbare forslag. Filnavn brukes bare som svakt hint.

import type { DocType, ExamType, Term, Basis } from '../domain/types';

export interface MetaGuess {
  title?: string;
  year?: number;
  term: Term;
  examType: ExamType;
  docType: DocType;
  examCode?: string;
  setLabel?: string;
  date?: string;
  suggestions: { field: string; value: string; basis: Basis; why: string }[];
  questions: string[];
}

const first = (s: string, n = 2500) => s.slice(0, n);

export function guessMeta(fileName: string, text: string, info: { title?: string; subject?: string } = {}): MetaGuess {
  const head = first(text);
  const low = head.toLowerCase();
  const fn = fileName.toLowerCase();
  const sug: MetaGuess['suggestions'] = [];
  const questions: string[] = [];

  // Dokumenttype. Veiledningsmarkører søkes i hele teksten, fordi forsiden kan være et bilde.
  const all = text.toLowerCase();
  let docType: DocType = 'annet';
  let why = '';
  const guideMarks = (all.match(/løsningskommentar\s*:|sensorveiledning\s*:|^svar\s*:/gm) ?? []).length;
  // Løsning rett etter hver oppgave («Oppgave 1 … Løsning …»).
  const inlineSolutions = (text.match(/^\s*(?:Løsning|Løsningsforslag|LF)\s*:?\s*$/gim) ?? []).length;
  // Oppgavesamling: mange nummererte øvingsoppgaver (P-1.1, 1.2.3) og en egen løsningsdel.
  const exerciseLabels = new Set(text.match(/(?:^|\n)\s*(?:P|Ø|O|E)-?\d{1,2}\.\d{1,2}\b/g) ?? []).size;
  const examCover = /(eksamen i|eksamensdato|antall oppgaver|tillatte hjelpemidler|antall sider|varighet|eksamenstid)/.test(low);
  if (exerciseLabels >= 8 || /oppgavesamling|regneoppgaver|øvingsoppgaver/.test(low) || /oppgavesamling|øving|tips/.test(fn)) {
    docType = 'oppgavesamling';
    why = exerciseLabels >= 8 ? `Fant ${exerciseLabels} nummererte øvingsoppgaver.` : 'Teksten eller filnavnet tyder på en oppgavesamling med løsninger.';
  } else if (inlineSolutions >= 2 && /oppgave\s+1/.test(all)) {
    docType = 'losningsforslag';
    why = `Hver oppgave følges av «Løsning» (${inlineSolutions} ganger).`;
  } else if (examCover && /sensor|løsning|fasit|lf\b/.test(fn)) {
    docType = 'losningsforslag';
    why = 'Eksamenssett, og filnavnet tyder på at løsningene står i dokumentet. Bekreft typen.';
  } else if (/sensorveiledning|vurderingsforslag|vurderingskriterier|sensorrettledning/.test(low) || guideMarks >= 2) {
    docType = 'sensorveiledning';
    why = guideMarks >= 2 && !/sensorveiledning/.test(low) ? 'Teksten har «Løsningskommentar/Svar» ved spørsmålene.' : 'Teksten inneholder «sensorveiledning/vurderingsforslag».';
  } else if (/løsningsforslag|fasit/.test(low)) {
    docType = 'losningsforslag';
    why = 'Teksten inneholder «løsningsforslag/fasit».';
  } else if (/emnebeskrivelse|læringsutbytte|læringsmål|emneplan/.test(low)) {
    docType = 'fagbeskrivelse';
    why = 'Teksten inneholder «emnebeskrivelse/læringsutbytte».';
  } else if (/min besvarelse|besvarelse av/.test(low) || (/kandidatnummer/.test(low) && !examCover)) {
    docType = 'studentbesvarelse';
    why = 'Teksten ser ut som en besvarelse (kandidatnummer/besvarelse).';
  } else if (/forelesningsnotat|notater|notat fra/.test(low)) {
    docType = 'laerernotat';
    why = 'Teksten inneholder «notat».';
  } else if (examCover || /oppgave\s+1/.test(low) || /eksamen/.test(low) || /spørsmål\s*1\b/.test(low)) {
    docType = 'eksamen';
    why = 'Teksten har nummererte oppgaver eller ordet «eksamen».';
  } else if (/sensor|vurdering|fasit/.test(fn)) {
    docType = 'sensorveiledning';
    why = 'Bare filnavnet tyder på sensorveiledning. Bekreft typen.';
    questions.push('Er dette en sensorveiledning? Filnavnet tyder på det, men teksten sier det ikke.');
  } else if (/eksamen|exam/.test(fn)) {
    docType = 'eksamen';
    why = 'Bare filnavnet tyder på eksamen. Bekreft typen.';
    questions.push('Er dette et eksamenssett? Bare filnavnet tyder på det.');
  } else {
    questions.push('Hva slags dokument er dette? Vi fant ingen sikre kjennetegn.');
    why = 'Ingen sikre kjennetegn i teksten.';
  }
  sug.push({ field: 'docType', value: docType, basis: why.startsWith('Bare filnavnet') || why.startsWith('Ingen') ? 'mangler' : 'regelbasert', why });

  // År og termin: tydelige mønstre først (termin, dato), så svakere.
  let year: number | undefined;
  let term: Term = 'ukjent';
  let yWhy = '';
  let yBasis: Basis = 'avlest';
  const termOf = (w: string): Term => (/høst|autumn|fall/i.test(w) ? 'høst' : /vår|spring/i.test(w) ? 'vår' : /sommer|summer/i.test(w) ? 'sommer' : 'ukjent');
  const monthTerm = (m: number): Term => (m <= 6 ? 'vår' : m <= 8 ? 'sommer' : 'høst');
  const tm = /termin\s*:?\s*(høst|vår|sommer)\s*(20\d{2})/i.exec(head);
  const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
  const tdm = /(?<!\d)(\d{1,2})\.?\s*(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)\s+(20\d{2})/i.exec(head);
  const dm = (tdm ? Object.assign([tdm[0], tdm[1], String(MONTHS.indexOf(tdm[2].toLowerCase()) + 1), tdm[3]], { input: head, index: tdm.index }) as unknown as RegExpExecArray : null) || /(?<!\d)(\d{1,2})\.(\d{1,2})\.(20\d{2})(?!\d)/.exec(head) || /(?<!\d)(\d{1,2})\.(\d{1,2})\.(20\d{2})(?!\d)/.exec(fileName) || /(?<!\d)(20\d{2})-(\d{2})-(\d{2})(?!\d)/.exec(fileName);
  const short = /\b(høst|vår|sommer)\s*[–-]?\s*(\d{2})\b/i.exec(head);
  const fnShort = /(?:^|[^a-z])([hv])(\d{2})(?:[^0-9]|$)/i.exec(fileName);
  const ym = /(?:eksamen|kontinuasjonseksamen|konte|høst|vår|sommer|autumn|spring)\D{0,20}(20\d{2})|(20\d{2})\D{0,10}(?:høst|vår)/i.exec(head);
  let date: string | undefined;
  if (tm) {
    year = Number(tm[2]);
    term = termOf(tm[1]);
    yWhy = `Fant «${tm[0].trim()}» i teksten.`;
  }
  if (dm) {
    const iso = dm[1].length === 4;
    const d = iso ? Number(dm[3]) : Number(dm[1]);
    const m = Number(dm[2]);
    const y = iso ? Number(dm[1]) : Number(dm[3]);
    date = `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
    if (!year) {
      year = y;
      term = monthTerm(m);
      yWhy = `Eksamensdato ${date}.`;
      yBasis = dm.input === head ? 'avlest' : 'regelbasert';
    }
  }
  if (!year && short) {
    year = 2000 + Number(short[2]);
    term = termOf(short[1]);
    yWhy = `Fant «${short[0].trim()}» i teksten.`;
  }
  if (!year && fnShort) {
    year = 2000 + Number(fnShort[2]);
    term = fnShort[1].toLowerCase() === 'h' ? 'høst' : 'vår';
    yWhy = `Filnavnet «${fileName}» tyder på ${term} ${year}.`;
    yBasis = 'regelbasert';
  }
  if (!year && ym) {
    year = parseInt(ym[1] ?? ym[2] ?? ym[0], 10);
    yWhy = `Fant «${ym[0].trim()}» i teksten.`;
  }
  if (!year) {
    const fy = /(20\d{2})/.exec(fn) || /\b(20[0-3]\d)\b/.exec(head);
    if (fy) {
      year = parseInt(fy[1], 10);
      yWhy = 'Fant et årstall, men ikke termin eller dato. Kontroller.';
      yBasis = 'regelbasert';
    }
  }
  if (year) sug.push({ field: 'year', value: String(year), basis: yBasis, why: yWhy });
  if (term === 'ukjent') {
    term = termOf(head) !== 'ukjent' ? termOf(head) : /host|høst/.test(fn) ? 'høst' : /(^|[^a-z])var|vår/.test(fn) ? 'vår' : 'ukjent';
  }
  if (term !== 'ukjent') sug.push({ field: 'term', value: term, basis: yBasis, why: yWhy || 'Fra teksten eller filnavnet.' });

  // Eksamenstype
  let examType: ExamType = 'ukjent';
  if (/kontinuasjon|konte\b|ny\s+eksamen|re-?sit/i.test(head)) examType = 'konte';
  else if (/utsatt eksamen/i.test(head)) examType = 'utsatt';
  else if (/prøveeksamen|øvingseksamen|mock/i.test(head)) examType = 'prøveeksamen';
  else if (/ordinær/i.test(head)) examType = 'ordinær';
  else if (docType === 'eksamen' || docType === 'sensorveiledning') examType = 'ordinær';
  if (examType !== 'ukjent') sug.push({ field: 'examType', value: examType, basis: /ordinær|kontinuasjon|konte|utsatt|prøve/i.test(head) ? 'avlest' : 'regelbasert', why: /ordinær|kontinuasjon|konte|utsatt|prøve/i.test(head) ? 'Står i teksten.' : 'Antatt ordinær fordi ingenting annet er oppgitt.' });

  // Emnekode og sett-etikett. Pulje, klokkeslett og «Eksamen I/II» skiller sett fra samme dag.
  const cm = /\b([A-ZÆØÅ]{2,6}-DEMO-[A-Z])\b/.exec(head) || /(?<![A-Za-zÆØÅæøå])([A-ZÆØÅ]{2,5})[- ]?(\d{3,5}[A-Z]?)\b/.exec(head);
  const examCode = cm ? (cm[2] ? `${cm[1]} ${cm[2]}` : cm[1]) : undefined;
  if (examCode) sug.push({ field: 'examCode', value: examCode, basis: 'avlest', why: `Fant koden ${examCode} i teksten.` });
  const pulje = /pulje\s*(\d)/i.exec(head) || /pulje[\s_-]*(\d)/i.exec(fileName);
  const variant = /[Ee]ksamen\s+(I{1,3}|[1-3])(?![A-Za-zÆØÅæøå])/.exec(head) || /\d{4}_\s*([1-3])_/.exec(fileName);
  const demo = /DEMO[- ]([A-C])\b/.exec(head);
  let setLabel: string | undefined;
  if (demo) setLabel = `DEMO ${demo[1]}`;
  else if (docType === 'oppgavesamling') {
    // En oppgavesamling er ikke et eksamenssett fra en bestemt termin: navngi den etter filen.
    const base = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/^(spoiler|kopi av|copy of)[\s_-]*/i, '').replace(/[_]+/g, ' ').replace(/\s*\(\d+\)\s*$/, '').trim();
    setLabel = base && base.length <= 40 ? base.charAt(0).toUpperCase() + base.slice(1) : 'Oppgavesamling';
  } else if (year) {
    setLabel = `${term !== 'ukjent' ? term[0].toUpperCase() + term.slice(1) + ' ' : ''}${year}${examType === 'konte' ? ' (konte)' : ''}`;
    if (pulje) setLabel += ` · pulje ${pulje[1]}`;
    else if (variant) setLabel += ` · eksamen ${variant[1].replace('1', 'I').replace('2', 'II').replace('3', 'III')}`;
  }
  if (!setLabel && docType !== 'fagbeskrivelse') {
    const base = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').replace(/\s*\(\d+\)\s*$/, '').trim();
    if (base && base.length <= 40) setLabel = base.charAt(0).toUpperCase() + base.slice(1);
  }
  const title = info.title || head.split('\n').find((l) => l.trim().length > 8 && !/^DEMO –/.test(l))?.trim();
  if (!year && (docType === 'eksamen' || docType === 'sensorveiledning')) questions.push('Hvilket år og hvilken termin gjelder dokumentet? Det påvirker sammenlikningen mellom år.');
  return { title, year, term, examType, docType, examCode, setLabel, date, suggestions: sug, questions };
}

export function isDemoDocument(text: string, info: { subject?: string } = {}): boolean {
  return /DEMO – syntetisk/.test(text.slice(0, 400)) || /DEMO – syntetisk/.test(info.subject ?? '');
}
