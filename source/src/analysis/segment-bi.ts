// Segmentering av eksamens- og sensorveiledningsformatet ved BI (og liknende):
// «Del 1» flervalg, «Del 2» kortsvar, «Del 3» lengre oppgave med delspørsmål.
// Spørsmålene står ofte i samme dokument som veiledningen («Svar:»,
// «Løsningskommentar:», «Sensorveiledning:»). Oppgaveteksten og
// veiledningsteksten holdes adskilt: oppgaveteksten er det som spørres om,
// veiledningen gir offisielle kriterier.
//
// Riktig svar i flervalg leses fra kilden på én av tre måter, og måten lagres:
// uthevet (fet skrift) alternativ, markering i Wiseflow-utskrift, eller en
// fasitliste («Spørsmål 3: B.»).

export interface BiLine {
  page: number;
  text: string;
  box?: [number, number, number, number];
  bold?: boolean;
  mark?: 'valgt' | 'ikke-valgt';
}

export interface BiPageInput {
  pdfPage: number;
  text: string;
  lines?: { t: string; b: [number, number, number, number]; bold?: boolean; mark?: 'valgt' | 'ikke-valgt' }[];
  figureBoxes?: [number, number, number, number][];
  hasFigure?: boolean;
}

export interface BiChoice {
  letter: string;
  text: string;
  correct?: boolean;
  bold?: boolean;
  mark?: 'valgt' | 'ikke-valgt';
  x?: number;
}

export interface BiItem {
  part: number;
  no: string; // «3» eller «a»
  label: string; // «1.3», «2.1», «3a»
  display: string; // «Del 1 · spørsmål 3»
  format: 'flervalg' | 'kortsvar' | 'langsvar';
  intro: string; // felles innledning (Del 3)
  introLines: BiLine[];
  stem: string;
  stemLines: BiLine[];
  choices: BiChoice[];
  answerBasis?: string;
  answerLetter?: string;
  guide: string;
  guideLines: BiLine[];
  pages: number[];
  figures: { page: number; box: [number, number, number, number]; inGuide?: boolean }[];
  guideStart?: { page: number; y: number };
  points?: number;
  pointsQuote?: string;
  stemMissing: boolean;
}

export interface BiSegmentation {
  items: BiItem[];
  hasGuide: boolean;
  hasStems: boolean;
  notes: string[];
  gradeScaleMax?: number;
  shuffledOptions: boolean;
}

const PART_RE = /^(?:Fasit\s*[–-]\s*)?(?:DEL|Del)\s*([1-4])\b\s*(?:[–:.-]\s*(.{0,60}))?$/;
const QUESTION_RE = /^Spørsmål\s*(\d{1,2})\s*[:.)]?\s*(.*)$/;
const GUIDE_RE = /^(Svar|Løsningskommentar|Sensorveiledning|Løsningsforslag|Kommentar til sensor|Kommentar)\b\s*:?\s*(.*)$/;
const SUB_RE = /^\(?([a-hA-H])[).]\s+(.+)$/;
const OPT_RE = /^\(?([a-dA-D])[).]?\s+(.+)$/;
const STOP_RE = /^(Karakterskala|KARAKTERSKALA|Karakt\w{0,3}skala|Følgende karakterskala)/;
const SKIP_START = /^Generell kommentar til sensur/i;
const INSTRUCTION_RE =
  /(består av (?:\d+|en|flere|ti)|skal besvares|ordgrense|grense på \d+ ord|skrivefelt|hvor mange ord|ikke teknisk mulig|ikke minuspoeng|poeng for riktig|avkrysningsspørsmål med|flervalgsspørsmål, der|svaralternativene i tilfeldig|^Fasit\s*:?$|^Merk\s*:|Hele eksamen besvares|Eksamen består av|nødvendigvis må skrive|nødvendig å skrive en lang|legg vekt på å begrunne|ingen øvre grense)/i;

/** «Svar:», «Løsningskommentar:», «Sensorveiledning: …» – men ikke en tittel som bare er «Sensorveiledning». */
function isGuideMarker(t: string): boolean {
  const m = GUIDE_RE.exec(t);
  if (!m) return false;
  if (/:/.test(t.slice(m[1].length, m[1].length + 3))) return true;
  return m[1] !== 'Kommentar' && m[2].trim().length > 0 && !/^(SØK|\d)/.test(m[2]);
}

export function looksLikeBi(pages: BiPageInput[]): boolean {
  const lines = pages.flatMap((p) => (p.lines?.length ? p.lines.map((l) => l.t) : p.text.split('\n')));
  const q = lines.filter((t) => QUESTION_RE.test(t.trim())).length;
  const parts = lines.filter((t) => PART_RE.test(t.trim()) && t.trim().length < 70 && !/består av/i.test(t)).length;
  return q >= 2 || parts >= 2;
}

function inBox(l: BiLine, boxes: [number, number, number, number][]): boolean {
  if (!l.box) return false;
  const [x, y, w, h] = l.box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return boxes.some(([bx, by, bw, bh]) => cx >= bx && cx <= bx + bw && cy >= by && cy <= by + bh);
}

export function segmentBi(pages: BiPageInput[]): BiSegmentation {
  const all: BiLine[] = [];
  const figuresByPage = new Map<number, [number, number, number, number][]>();
  for (const p of pages) {
    const boxes = p.figureBoxes ?? [];
    figuresByPage.set(p.pdfPage, boxes);
    const ls: BiLine[] = p.lines?.length ? p.lines.map((l) => ({ page: p.pdfPage, text: l.t, box: l.b, bold: l.bold, mark: l.mark })) : p.text.split('\n').map((t) => ({ page: p.pdfPage, text: t }));
    for (const l of ls) {
      const t = l.text.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      if (/^(\d{1,3}|Side \d+( av \d+)?)$/.test(t)) continue;
      // Tekst inne i figurer (akser, tall, navn på kurver) hører til figuren.
      if (inBox(l, boxes) && !QUESTION_RE.test(t) && !PART_RE.test(t) && !GUIDE_RE.test(t) && t.length < 60) continue;
      all.push({ ...l, text: t });
    }
  }

  const items: BiItem[] = [];
  const notes: string[] = [];
  let part = 0;
  let cur: BiItem | null = null;
  let mode: 'stem' | 'guide' | 'option' | 'skip' = 'stem';
  let part3Intro: BiLine[] = [];
  let hasGuideMarker = false;
  let shuffled = false;
  let gradeMax: number | undefined;
  const partHasHeaders: Record<number, boolean> = {};
  // Hendelser i dokumentrekkefølge, brukt til å gi hver figur til riktig oppgave.
  type Ev = { page: number; y: number; kind: 'item' | 'intro3' | 'stop' | 'skip' | 'part'; item?: BiItem };
  const events: Ev[] = [];
  const pos = (l: BiLine) => ({ page: l.page, y: l.box ? l.box[1] : 0 });
  // Finn ut på forhånd om Del 1 har «Spørsmål N»-overskrifter (Word) eller ikke (Wiseflow-utskrift).
  {
    let p = 0;
    for (const l of all) {
      const pm = PART_RE.exec(l.text);
      if (pm && l.text.length < 70 && !/består av/i.test(l.text)) p = Number(pm[1]);
      else if (QUESTION_RE.test(l.text)) partHasHeaders[p] = true;
      if (isGuideMarker(l.text)) hasGuideMarker = true;
    }
  }

  const close = () => {
    if (!cur) return;
    // Et siste alternativ uten bokstav (formateringsfeil i kilden) er allerede lagt til.
    cur.stem = cur.stemLines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
    cur.guide = cur.guideLines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
    items.push(cur);
    cur = null;
  };

  const newItem = (p: number, no: string, first: BiLine): BiItem => {
    const format: BiItem['format'] = p === 1 ? 'flervalg' : p === 3 ? 'langsvar' : 'kortsvar';
    const label = p === 3 || /[a-h]/.test(no) ? `${p}${no}` : `${p}.${no}`;
    const it: BiItem = {
      part: p,
      no,
      label,
      display: p ? `Del ${p} · ${p === 3 ? `${no})` : `spørsmål ${no}`}` : `Spørsmål ${no}`,
      format,
      intro: p === 3 ? part3Intro.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim() : '',
      introLines: p === 3 ? [...part3Intro] : [],
      stem: '',
      stemLines: [],
      choices: [],
      guide: '',
      guideLines: [],
      pages: [first.page],
      figures: [],
      stemMissing: false,
    };
    events.push({ ...pos(first), kind: 'item', item: it });
    return it;
  };

  for (const l of all) {
    const t = l.text;
    if (STOP_RE.test(t)) {
      close();
      events.push({ ...pos(l), kind: 'stop' });
      // Karakterskalaen gir totalt antall poeng (f.eks. «25.0 – 30 A»).
      break;
    }
    if (SKIP_START.test(t)) {
      close();
      events.push({ ...pos(l), kind: 'skip' });
      mode = 'skip';
      continue;
    }
    if (/svaralternativene i tilfeldig rekkefølge/i.test(t)) shuffled = true;
    const pm = PART_RE.exec(t);
    if (pm && t.length < 70 && !/består av/i.test(t)) {
      close();
      part = Number(pm[1]);
      mode = 'stem';
      events.push({ ...pos(l), kind: part === 3 ? 'intro3' : 'part' });
      if (part === 3) part3Intro = [];
      continue;
    }
    if (mode === 'skip') continue;
    // Wiseflow-utskrift uten lesbar «Del 1»-overskrift: flervalgsinstruksen eller et alternativ betyr Del 1.
    if (!part && (/flervalg|avkrysning/i.test(t) || (OPT_RE.test(t) && /^[A-D]\s/.test(t)))) {
      part = 1;
      events.push({ ...pos(l), kind: 'part' });
      if (INSTRUCTION_RE.test(t) || /flervalg/i.test(t)) continue;
    }
    const qm = QUESTION_RE.exec(t);
    if (qm) {
      close();
      if (!part) part = 2;
      cur = newItem(part, qm[1], l);
      mode = 'stem';
      const rest = qm[2].trim();
      // Fasitliste: «Spørsmål 1: B. Gjennomsnittlig produksjon …»
      const key = /^([A-Da-d])[.)]\s+(.+)$/.exec(rest) || /^([A-Da-d])[.)]?$/.exec(rest);
      if (key && part === 1) {
        cur.answerLetter = key[1].toUpperCase();
        cur.answerBasis = 'Oppgitt i fasitlisten i sensorveiledningen';
        if (key[2]) cur.guideLines.push({ ...l, text: `Riktig svar: ${key[1].toUpperCase()}. ${key[2]}` });
        mode = 'guide';
      } else if (rest) cur.stemLines.push({ ...l, text: rest });
      continue;
    }
    const gm = isGuideMarker(t) ? GUIDE_RE.exec(t) : null;
    if (gm && cur) {
      mode = 'guide';
      if (!cur.guideStart) cur.guideStart = pos(l);
      if (gm[2]) cur.guideLines.push({ ...l, text: gm[2] });
      if (!cur.pages.includes(l.page)) cur.pages.push(l.page);
      continue;
    }
    // Delspørsmål i Del 3.
    const sm = SUB_RE.exec(t);
    if (part === 3 && sm && (!cur || mode !== 'guide' || /^[A-Ha-h]\)/.test(t) || l.bold || /^[a-h]\.\s/.test(t))) {
      const letter = sm[1].toLowerCase();
      const expected = cur && cur.part === 3 ? String.fromCharCode(cur.no.charCodeAt(0) + 1) : 'a';
      if (!cur || cur.part !== 3 || letter === expected) {
        close();
        cur = newItem(3, letter, l);
        cur.stemLines.push({ ...l, text: sm[2] });
        mode = 'stem';
        continue;
      }
    }
    // Alternativer i flervalg.
    if (part === 1) {
      const om = OPT_RE.exec(t);
      const wiseflow = !partHasHeaders[1];
      if (om && (cur || wiseflow) && mode !== 'guide') {
        const letter = om[1].toUpperCase();
        if (!cur) {
          close();
          cur = newItem(1, String(items.filter((i) => i.part === 1).length + 1), l);
        }
        const expected = String.fromCharCode(65 + cur.choices.length);
        if (letter === expected) {
          cur.choices.push({ letter, text: om[2], bold: l.bold, mark: l.mark, x: l.box?.[0] });
          mode = 'option';
          if (!cur.pages.includes(l.page)) cur.pages.push(l.page);
          continue;
        }
      }
      if (mode === 'option' && cur) {
        const last = cur.choices[cur.choices.length - 1];
        const indented = l.box && last.x !== undefined ? l.box[0] > last.x + 0.012 : true;
        const outdented = l.box && last.x !== undefined ? l.box[0] < last.x - 0.01 : false;
        if (!wiseflow) {
          if (INSTRUCTION_RE.test(t)) continue;
          if (cur.choices.length === 3 && outdented) {
            // Kilden mangler bokstav på siste alternativ.
            cur.choices.push({ letter: 'D', text: t, bold: l.bold, mark: l.mark, x: l.box?.[0] });
            notes.push(`Spørsmål ${cur.no} i Del 1: siste alternativ mangler bokstav i kilden og er lest som «D».`);
            continue;
          }
          // I Word-formatet starter neste spørsmål alltid med «Spørsmål N»; alt annet fortsetter alternativet.
          last.text += ` ${t}`;
          if (l.bold && !last.bold && cur.choices.length === 4) last.bold = true;
          continue;
        }
        const looksLikeStem = /\?$/.test(t) || !indented;
        if (indented && !looksLikeStem) {
          last.text += ` ${t}`;
          continue;
        }
        if (wiseflow) {
          close();
          cur = newItem(1, String(items.filter((i) => i.part === 1).length + 1), l);
          cur.stemLines.push(l);
          mode = 'stem';
          continue;
        }
      }
      if (!cur && !partHasHeaders[1]) {
        if (INSTRUCTION_RE.test(t) || /^(DEL|Del)\s*1/.test(t)) continue;
        cur = newItem(1, String(items.filter((i) => i.part === 1).length + 1), l);
        cur.stemLines.push(l);
        mode = 'stem';
        continue;
      }
    }
    if (!cur) {
      if (part === 3 && !INSTRUCTION_RE.test(t)) part3Intro.push(l);
      continue;
    }
    if (INSTRUCTION_RE.test(t) && mode !== 'guide') continue;
    if (!cur.pages.includes(l.page)) cur.pages.push(l.page);
    if (mode === 'guide') cur.guideLines.push(l);
    else cur.stemLines.push(l);
  }
  close();

  // Karakterskala: høyeste poeng (typisk 30).
  const scaleLine = all.map((l) => l.text).find((t) => /\b(\d{2})(?:[.,]0+)?\s*(?:A|$)/.test(t) && /^(?:\d+[.,]?\d*\s*[–-]\s*)?(?:25|24)[.,]\d/.test(t));
  if (scaleLine) {
    const m = /[–-]\s*(\d{2})(?:[.,]0+)?\s*A?\s*$/.exec(scaleLine) || /(\d{2})[.,]00\s*A\s*$/.exec(scaleLine);
    if (m) gradeMax = Number(m[1]);
  }

  // Rene fasit-/veiledningsdokumenter uten oppgavetekst: ingen «Svar:»-markører, og teksten under
  // spørsmålene er svar, ikke spørsmål. Da flyttes teksten til veiledningen.
  const docText = all.map((l) => l.text).join('\n');
  const guideDoc = /sensorveiledning|fasit|løsningsforslag/i.test(docText);
  const open = items.filter((i) => i.format !== 'flervalg' && i.stemLines.length);
  const QWORD = /\?|^(forklar|beskriv|drøft|diskuter|bruk|hva|hvilke|hvilken|hvorfor|hvordan|anta|tenk|se for deg|gitt|basert på|i kurset|figuren|vi har|nedenfor|du vurderer)/i;
  const questionLike = open.filter((i) => QWORD.test(i.stemLines[0].text) || /\?/.test(i.stemLines.map((l) => l.text).join(' '))).length;
  const answerOnly = !hasGuideMarker && guideDoc && open.length > 0 && questionLike / open.length < 0.3;
  for (const it of items) {
    if (answerOnly && it.format !== 'flervalg' && it.stemLines.length && !it.guideLines.length) {
      it.guideLines = it.stemLines;
      it.guide = it.stem;
      it.stemLines = [];
      it.stem = '';
    }
    it.stemMissing = !it.stem;
    // Riktig alternativ.
    if (it.format === 'flervalg' && it.choices.length >= 2) {
      const bolds = it.choices.filter((c) => c.bold);
      const marks = it.choices.filter((c) => c.mark === 'valgt');
      if (it.answerLetter && it.choices.some((c) => c.letter === it.answerLetter)) it.choices.forEach((c) => (c.correct = c.letter === it.answerLetter));
      else if (marks.length === 1) {
        it.choices.forEach((c) => (c.correct = c.mark === 'valgt'));
        it.answerBasis = 'Markert som riktig i Wiseflow-utskriften (lest fra bildet)';
      } else if (bolds.length === 1) {
        it.choices.forEach((c) => (c.correct = !!c.bold));
        it.answerBasis = 'Uthevet (fet skrift) i sensorveiledningen';
      }
      if (!it.guideLines.length && it.choices.some((c) => c.correct)) {
        const c = it.choices.find((x) => x.correct)!;
        it.guide = `Riktig svar: ${c.letter}) ${c.text}`;
      }
      it.points = 1;
      it.pointsQuote = 'ett poeng for riktig svar (Del 1)';
    }
    if (it.format === 'flervalg' && it.answerLetter && !it.choices.length) it.stemMissing = true;
  }
  // Figurer: hver figur hører til det siste som startet før den (oppgave, eller felles innledning i Del 3).
  const order = (a: { page: number; y: number }, b: { page: number; y: number }) => a.page - b.page || a.y - b.y;
  const evs = [...events].sort(order);
  for (const [pg, boxes] of figuresByPage)
    for (const b of boxes) {
      const at = { page: pg, y: b[1] + 0.005 };
      let owner: Ev | undefined;
      for (const e of evs) if (order(e, at) <= 0) owner = e;
      if (!owner) continue;
      if (owner.kind === 'item' && owner.item) owner.item.figures.push({ page: pg, box: b, inGuide: !!owner.item.guideStart && order(owner.item.guideStart, at) <= 0 });
      else if (owner.kind === 'intro3') for (const it of items.filter((x) => x.part === 3)) it.figures.push({ page: pg, box: b });
    }
  for (const it of items) {
    it.figures.sort((a, c) => a.page - c.page || a.box[1] - c.box[1]);
    for (const f of it.figures) if (!it.pages.includes(f.page) && it.part !== 3) it.pages.push(f.page);
  }
  const unique: BiItem[] = [];
  for (const it of items) {
    const dup = unique.findIndex((u) => u.label === it.label);
    if (dup >= 0) {
      // Samme nummer to ganger (f.eks. fasitliste og spørsmål): slå sammen.
      const u = unique[dup];
      u.stem = u.stem || it.stem;
      u.guide = [u.guide, it.guide].filter(Boolean).join(' ');
      u.guideLines.push(...it.guideLines);
      if (!u.choices.length) u.choices = it.choices;
      continue;
    }
    unique.push(it);
  }
  return {
    items: unique,
    hasGuide: unique.some((i) => i.guide),
    hasStems: unique.some((i) => i.stem),
    notes,
    gradeScaleMax: gradeMax,
    shuffledOptions: shuffled,
  };
}
