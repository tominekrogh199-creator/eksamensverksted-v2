// Deler et dokument i oppgaver og deloppgaver og bevarer felles innledning,
// figurer, poeng og avhengigheter. Alle linjer beholder sidehenvisningen.

export interface PageInput {
  pdfPage: number;
  text: string;
  hasFigure?: boolean;
  printedPage?: string;
  lines?: { t: string; b: [number, number, number, number] }[];
}

export interface SegLine {
  page: number;
  text: string;
  box?: [number, number, number, number];
}

export interface SegSubtask {
  taskNo: number;
  sub: string;
  label: string;
  lines: SegLine[];
  text: string;
  pages: number[];
  points?: number;
  pointsQuote?: string;
  dependsOn: string[];
  figurePages: number[];
}

export interface SegTask {
  taskNo: number;
  header: string;
  headerPage: number;
  intro: string;
  introLines: SegLine[];
  points?: number;
  weightPct?: number;
  quote?: string;
  subtasks: SegSubtask[];
  figurePages: number[];
}

export interface Segmentation {
  tasks: SegTask[];
  preamble: SegLine[];
  pageUse: Record<number, 'oppgaver' | 'forside' | 'tom' | 'annet'>;
  notes: string[];
}

const TASK_RE = /^\s*(?:[Oo]ppgave|OPPGAVE|Oppg\.|Spørsmål|SPØRSMÅL|Task|TASK|Problem|PROBLEM|Question|QUESTION)\s+(\d{1,2}|I{1,3}|IV|V|VI{1,3}|IX|X)(?=\s*$|\s*[(:.–-]|\s+fortsetter|\s+\()\s*(.*)$/;
const SUB_RE = /^\s*(?:\(([a-l])\)|([a-l])\))\s*(.*)$/;
// «1a) …» eller «1 a) …»: oppgave og deloppgave på samme linje.
const NUMSUB_RE = /^\s*(\d{1,2})\s?([a-l])\)\s*(.*)$/;
const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
const taskNo = (s: string) => (/^\d+$/.test(s) ? parseInt(s, 10) : ROMAN[s] ?? NaN);
const NOISE_RE = /^(DEMO – syntetisk.*|Side \d+( av \d+)?|\d{1,3})$/;

function parsePoints(s: string): { points?: number; weightPct?: number; quote?: string } {
  const p = /\(?\s*(\d+(?:[.,]\d+)?)\s*(?:poeng|p\.|points)\s*\)?/i.exec(s);
  if (p) return { points: parseFloat(p[1].replace(',', '.')), quote: p[0].trim() };
  const w = /(?:vekt|teller)\s*(\d+(?:[.,]\d+)?)\s*%/i.exec(s);
  if (w) return { weightPct: parseFloat(w[1].replace(',', '.')), quote: w[0].trim() };
  return {};
}

export function segmentDocument(pages: PageInput[]): Segmentation {
  const all: SegLine[] = [];
  for (const p of pages) {
    const ls = p.lines?.length ? p.lines.map((l) => ({ page: p.pdfPage, text: l.t, box: l.b })) : p.text.split('\n').map((t) => ({ page: p.pdfPage, text: t }));
    for (const l of ls) {
      const t = l.text.trim();
      if (!t || NOISE_RE.test(t)) continue;
      all.push({ ...l, text: t });
    }
  }
  const tasks: SegTask[] = [];
  const preamble: SegLine[] = [];
  const notes: string[] = [];
  let cur: SegTask | null = null;
  let curSub: SegSubtask | null = null;

  // Reserve for sett uten «Oppgave N»-overskrifter, f.eks. «Besvar følgende oppgaver: 1. … 2. …».
  // Krever en nummerert liste som starter på 1 og går fortløpende, så datoer og tall i teksten ikke treffer.
  const plainNo = (t: string) => /^\s*\(?(\d{1,2})\s*[.)]\s+(?=\S)(?!\d)(.*)$/.exec(t);
  const useNumbered = !all.some((l) => TASK_RE.test(l.text)) && (() => {
    let next = 1;
    for (const l of all) {
      const m = plainNo(l.text);
      if (m && parseInt(m[1], 10) === next && /[A-Za-zÆØÅæøå]{3}/.test(m[2])) next++;
    }
    return next > 1;
  })();
  let expectNo = 1;
  for (const line of all) {
    const ns = NUMSUB_RE.exec(line.text);
    if (ns && !TASK_RE.test(line.text)) {
      const n = parseInt(ns[1], 10);
      let t = tasks.find((x) => x.taskNo === n);
      if (!t && (n === (tasks.length ? tasks[tasks.length - 1].taskNo + 1 : 1))) {
        t = { taskNo: n, header: `Oppgave ${n}`, headerPage: line.page, intro: '', introLines: [], subtasks: [], figurePages: [] };
        tasks.push(t);
      }
      if (t && !t.subtasks.some((x) => x.sub === ns[2])) {
        cur = t;
        curSub = { taskNo: n, sub: ns[2], label: `${n}${ns[2]}`, lines: [{ ...line, text: ns[3] }], text: '', pages: [], dependsOn: [], figurePages: [] };
        t.subtasks.push(curSub);
        continue;
      }
    }
    let tm = TASK_RE.exec(line.text);
    if (!tm && useNumbered) {
      const m = plainNo(line.text);
      if (m && parseInt(m[1], 10) === expectNo && /[A-Za-zÆØÅæøå]{3}/.test(m[2])) {
        expectNo++;
        const n = parseInt(m[1], 10);
        cur = { taskNo: n, header: `Oppgave ${n}`, headerPage: line.page, intro: '', introLines: [{ ...line, text: m[2] }], subtasks: [], figurePages: [] };
        tasks.push(cur);
        curSub = null;
        continue;
      }
    }
    if (tm && !/fortsetter|forts\.|continued/i.test(tm[2]) && !/^[a-h]\)/.test(tm[2])) {
      const n = taskNo(tm[1]);
      const existing = tasks.find((t) => t.taskNo === n);
      if (existing) {
        // Samme oppgavenummer igjen: behandles som fortsettelse, ikke ny oppgave.
        cur = existing;
        curSub = existing.subtasks[existing.subtasks.length - 1] ?? null;
        notes.push(`«${line.text}» på side ${line.page} ble lest som fortsettelse av oppgave ${n}.`);
        continue;
      }
      const pts = parsePoints(tm[2]);
      cur = { taskNo: n, header: line.text, headerPage: line.page, intro: '', introLines: [], ...pts, subtasks: [], figurePages: [] };
      tasks.push(cur);
      curSub = null;
      continue;
    }
    if (tm && /fortsetter|forts\.|continued/i.test(tm[2])) {
      const n = taskNo(tm[1]);
      const existing = tasks.find((t) => t.taskNo === n);
      if (existing) {
        cur = existing;
        curSub = existing.subtasks[existing.subtasks.length - 1] ?? null;
        continue;
      }
    }
    if (!cur) {
      preamble.push(line);
      continue;
    }
    const sm = SUB_RE.exec(line.text);
    // Deloppgaver kommer i rekkefølge; «(i)» i en opplisting eller en gjentatt bokstav er vanlig tekst.
    const nextSub = cur.subtasks.length ? String.fromCharCode(cur.subtasks[cur.subtasks.length - 1].sub.charCodeAt(0) + 1) : 'a';
    if (sm && ((sm[1] ?? sm[2]).toLowerCase() === nextSub || cur.subtasks.some((s) => s.sub === (sm[1] ?? sm[2]).toLowerCase()))) {
      const sub = (sm[1] ?? sm[2]).toLowerCase();
      const existing = cur.subtasks.find((s) => s.sub === sub);
      if (existing) {
        curSub = existing;
        existing.lines.push({ ...line, text: sm[3] });
      } else {
        curSub = { taskNo: cur.taskNo, sub, label: `${cur.taskNo}${sub}`, lines: [{ ...line, text: sm[3] }], text: '', pages: [], dependsOn: [], figurePages: [] };
        cur.subtasks.push(curSub);
      }
      continue;
    }
    if (curSub) curSub.lines.push(line);
    else cur.introLines.push(line);
  }

  const figurePagesSet = new Set(pages.filter((p) => p.hasFigure).map((p) => p.pdfPage));
  for (const t of tasks) {
    t.intro = t.introLines.map((l) => l.text).join('\n');
    const introPages = new Set(t.introLines.map((l) => l.page).concat(t.headerPage));
    t.figurePages = [...introPages].filter((p) => figurePagesSet.has(p));
    if (!t.subtasks.length) {
      // Oppgave uten deloppgaver: hele teksten er én deloppgave.
      t.subtasks.push({ taskNo: t.taskNo, sub: '', label: `${t.taskNo}`, lines: t.introLines, text: t.intro, pages: [...introPages], dependsOn: [], figurePages: t.figurePages });
      t.intro = '';
      t.introLines = [];
    }
    t.subtasks.forEach((s, i) => {
      s.text = s.lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
      s.pages = [...new Set(s.lines.map((l) => l.page))];
      const pts = parsePoints(s.text);
      if (pts.points !== undefined) {
        s.points = pts.points;
        s.pointsQuote = pts.quote;
      }
      const low = s.text.toLowerCase();
      if (/figur|diagram|grafen/.test(low)) s.figurePages = t.figurePages.length ? t.figurePages : [...figurePagesSet].filter((p) => s.pages.includes(p));
      else s.figurePages = s.pages.filter((p) => figurePagesSet.has(p));
      // Avhengigheter: eksplisitte henvisninger til tidligere deloppgaver.
      const refs = [...low.matchAll(/(?:i|fra|svaret i|resultatet i|som i)\s+(?:del)?(?:oppgave\s+)?(\d)?\s*([a-h])\)/g)].map((m) => `${m[1] ?? t.taskNo}${m[2]}`);
      for (const r of refs) if (r !== s.label && !s.dependsOn.includes(r)) s.dependsOn.push(r);
      if (i > 0 && /(deretter|videre|nå|etter dette|samme marked|den nye|forrige)/.test(low) && !s.dependsOn.length) s.dependsOn.push(t.subtasks[i - 1].label);
    });
  }

  const pageUse: Segmentation['pageUse'] = {};
  for (const p of pages) {
    const used = tasks.some((t) => t.headerPage === p.pdfPage || t.introLines.some((l) => l.page === p.pdfPage) || t.subtasks.some((s) => s.pages.includes(p.pdfPage)));
    if (used) pageUse[p.pdfPage] = 'oppgaver';
    else if (!p.text.replace(/\s/g, '').length) pageUse[p.pdfPage] = 'tom';
    else if (preamble.some((l) => l.page === p.pdfPage)) pageUse[p.pdfPage] = 'forside';
    else pageUse[p.pdfPage] = 'annet';
  }
  return { tasks, preamble, pageUse, notes };
}

// ——— Sensorveiledninger ———

export interface GuideItem {
  taskNo: number;
  sub: string;
  label: string;
  page: number;
  lines: SegLine[];
  text: string;
  points?: number;
  pointsQuote?: string;
}

const GUIDE_RE = /^\s*(?:Oppgave|Oppg\.?)\s*(\d{1,2})\s*([a-h])?\)?\s*(?:\(([^)]*)\))?\s*[:.–-]?\s*(.*)$/i;

export function segmentGuide(pages: PageInput[]): { items: GuideItem[]; header: string } {
  const items: GuideItem[] = [];
  let cur: GuideItem | null = null;
  const header: string[] = [];
  for (const p of pages) {
    const ls = p.lines?.length ? p.lines.map((l) => ({ page: p.pdfPage, text: l.t, box: l.b })) : p.text.split('\n').map((t) => ({ page: p.pdfPage, text: t }));
    for (const l of ls) {
      const t = l.text.trim();
      if (!t || NOISE_RE.test(t)) continue;
      const m = GUIDE_RE.exec(t);
      if (m) {
        const taskNo = parseInt(m[1], 10);
        const sub = (m[2] ?? '').toLowerCase();
        const pts = m[3] ? parsePoints(`(${m[3]})`) : {};
        cur = { taskNo, sub, label: `${taskNo}${sub}`, page: p.pdfPage, lines: [], text: '', points: pts.points, pointsQuote: pts.quote };
        items.push(cur);
        if (m[4]) cur.lines.push({ ...l, text: m[4] });
        continue;
      }
      // «3b: …» midt i en linje for kompakte veiledninger.
      const inline = /^\s*(\d{1,2})([a-h])\s*[:)]\s*(.+)$/.exec(t);
      if (inline) {
        cur = { taskNo: parseInt(inline[1], 10), sub: inline[2], label: `${inline[1]}${inline[2]}`, page: p.pdfPage, lines: [{ ...l, text: inline[3] }], text: '' };
        items.push(cur);
        continue;
      }
      if (cur) cur.lines.push({ ...l, text: t });
      else header.push(t);
    }
  }
  for (const it of items) it.text = it.lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
  return { items, header: header.join('\n') };
}

/** Påstander i en veiledning: «P = 20», «Q = 1200/(50 − 30) = 60 flasker», «16,7 %», «23 kr». */
export function guideClaims(text: string): { symbol?: string; value: number; raw: string; unit?: string; decimals: number }[] {
  const out: { symbol?: string; value: number; raw: string; unit?: string; decimals: number }[] = [];
  const t = text.replace(/[\u2212\u2013]/g, '-');
  const num = (raw: string) => {
    const r = raw.replace(/[ \u00a0]/g, '');
    return { value: parseFloat(r.replace(',', '.')), decimals: (/[.,](\d+)/.exec(r)?.[1].length) ?? 0 };
  };
  // Symbolpåstander: ta siste ledd i en kjede «X = … = tall».
  const clauses = t.split(/[.;:](?:\s|$)|\s+og\s+|,\s+|\n/);
  for (const c of clauses) {
    // Hver «SYM =» starter et nytt segment; innen et segment er det en kjede.
    const heads = [...c.matchAll(/(?:^|[\s(])([A-Za-z]{1,3})\s*=\s*/g)];
    heads.forEach((m, k) => {
      const start = m.index! + m[0].length;
      const end = k + 1 < heads.length ? heads[k + 1].index! : c.length;
      const parts = c.slice(start, end).split('=');
      const last = parts[parts.length - 1].trim();
      const v = /^(-?\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?)\s*(%|kr|[a-zæøå]+)?(?:\s+[a-zæøå ]+)?$/i.exec(last);
      if (!v) return;
      const n = num(v[1]);
      const unit = v[2] && /^(%|kr|kroner|flasker|brød|skjorter|kopper|utleietimer|timer|kg|enheter|stk|prosentpoeng)$/i.test(v[2]) ? v[2] : undefined;
      out.push({ symbol: m[1], value: n.value, raw: `${m[1]} = ${last}`, unit, decimals: n.decimals });
    });
  }
  for (const m of t.matchAll(/(?:=|≈|med|er|på|bærer)\s*(-?\d+(?:[.,]\d+)?)\s*(%|prosentpoeng|kr|flasker|brød|skjorter|kopper|utleietimer|kg|enheter)/g)) {
    const n = num(m[1]);
    out.push({ value: n.value, raw: m[0], unit: m[2], decimals: n.decimals });
  }
  return out;
}
