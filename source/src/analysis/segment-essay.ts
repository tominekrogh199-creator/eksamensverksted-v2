// Eksamener med fem likeverdige tekstoppgaver («Besvar følgende oppgaver: 1. … 5.»),
// og sensorveiledninger der hvert spørsmål står med «Relevant pensum: …» etter seg
// (vanlig i organisasjons- og ledelsesfag). Veiledningen inneholder spørsmålene
// ordrett, så den kan stå alene som eksamenssett med offisielle henvisninger.

export interface EssayLine {
  page: number;
  text: string;
  box?: [number, number, number, number];
}

export interface EssayPageInput {
  pdfPage: number;
  text: string;
  lines?: { t: string; b: [number, number, number, number] }[];
}

export interface EssayItem {
  no: number;
  label: string;
  /** Selve spørsmålet. */
  text: string;
  lines: EssayLine[];
  pages: number[];
  /** Veiledningens tekst til spørsmålet (pensumhenvisning og eventuelle forventninger). */
  guide: string;
  guideLines: EssayLine[];
}

export interface EssayCriterion {
  text: string;
  quote: string;
  page: number;
}

export interface EssaySegmentation {
  kind: 'eksamen' | 'veiledning';
  items: EssayItem[];
  /** Generelle vurderingskriterier fra veiledningen (gjelder alle spørsmålene). */
  criteria: EssayCriterion[];
  language: 'nb' | 'nn';
  slot?: number;
  equalWeight: boolean;
  minutes?: number;
  aids?: string;
  /** Pensumlisten slik veiledningen oppgir den. */
  curriculum: string[];
  notes: string[];
}

const EXAM_START = /^(Besvar følgende (?:oppgaver|spørsmål)|Svar på følgande oppgåver|Besvar oppgavene)\s*:?\s*$/i;
const GUIDE_START = /^Relevant pensum(?:stoff)? til (?:hver av |kvar av )?oppg(?:avene|åvene)\s*:?\s*$/i;
const ITEM_RE = /^(\d{1,2})\s*[.)]\s+(.*)$/;
const PENSUM_RE = /\b(?:Mest\s+)?[Rr]elevant\s+pensum(?:stoff)?\b\s*[:.]?/;
// Eldre veiledninger: henvisningen står rett etter spørsmålstegnet («…? EMS kap. 4 (særlig s. 145)»).
const REF_AFTER_Q = /\?\s+(?=(?:EMS|Perspektiver|Organisasjon og [Ll]edelse|Kap\.|Relevant pensum|Mest relevant pensum)\b)/;

function allLines(pages: EssayPageInput[]): EssayLine[] {
  const out: EssayLine[] = [];
  for (const p of pages) {
    if (p.lines?.length) for (const l of p.lines) out.push({ page: p.pdfPage, text: l.t.normalize('NFC').replace(/\s+/g, ' ').trim(), box: l.b });
    else for (const t of p.text.split('\n')) out.push({ page: p.pdfPage, text: t.normalize('NFC').replace(/\s+/g, ' ').trim() });
  }
  return out.filter((l) => l.text);
}

export function looksLikeEssay(pages: EssayPageInput[]): boolean {
  const lines = allLines(pages);
  const start = lines.findIndex((l) => EXAM_START.test(l.text) || GUIDE_START.test(l.text));
  if (start < 0) return false;
  const numbered = lines.slice(start + 1).filter((l) => ITEM_RE.test(l.text)).length;
  return numbered >= 2;
}

/** Spørsmålene etter overskriften, nummerert 1, 2, 3 … (bare neste tall i rekken starter et nytt spørsmål). */
function items(lines: EssayLine[], from: number, isGuide: boolean): EssayItem[] {
  const out: { no: number; lines: EssayLine[] }[] = [];
  let expected = 1;
  for (const l of lines.slice(from)) {
    const m = ITEM_RE.exec(l.text);
    if (m && Number(m[1]) === expected) {
      out.push({ no: expected, lines: [{ ...l, text: m[2].trim() }] });
      expected++;
      continue;
    }
    if (out.length) out[out.length - 1].lines.push(l);
  }
  return out.map((it) => {
    const joined = it.lines.map((l) => l.text).join(' ').replace(/(\p{L})- (\p{L})/gu, '$1-$2').replace(/\s+/g, ' ').trim();
    let text = joined;
    let guide = '';
    const qLines: EssayLine[] = [];
    const gLines: EssayLine[] = [];
    if (isGuide) {
      const m = PENSUM_RE.exec(joined);
      const q = REF_AFTER_Q.exec(joined);
      // Det som kommer først av «Relevant pensum …» og en henvisning rett etter spørsmålstegnet.
      const cut = m && (!q || m.index <= q.index + 1) ? m.index : q ? q.index + 1 : -1;
      if (cut >= 0) {
        text = joined.slice(0, cut).trim();
        guide = joined.slice(cut).trim();
      }
      // Linjene deles på samme sted (for utsnitt og kildevisning).
      let inGuide = false;
      for (const l of it.lines) {
        // «Relevant» kan stå sist på spørsmålslinjen og «pensum: …» først på neste.
        if (!inGuide && (PENSUM_RE.test(l.text) || /^(?:EMS|Perspektiver|Organisasjon og [Ll]edelse|Kap\.|[Pp]ensum(?:stoff)?\s*:)/.test(l.text.trim()) || REF_AFTER_Q.test(l.text))) inGuide = true;
        (inGuide ? gLines : qLines).push(l);
      }
    } else qLines.push(...it.lines);
    return {
      no: it.no,
      label: String(it.no),
      text: text.replace(/\s*Relevant pensumstoff\.?$/i, '').trim(),
      lines: qLines,
      pages: [...new Set(qLines.map((l) => l.page))],
      guide,
      guideLines: gLines,
    };
  });
}

/** Generelle kriterier: den gamle nummererte listen («I hvilken grad …») eller den nye tabellen. */
function criteria(lines: EssayLine[]): EssayCriterion[] {
  const out: EssayCriterion[] = [];
  const startOld = lines.findIndex((l) => /^Kriteriene som benyttes/i.test(l.text));
  if (startOld >= 0) {
    let cur: EssayCriterion | null = null;
    for (const l of lines.slice(startOld + 1)) {
      if (/^I tillegg kommer|^Relevant pensum|^Kunnskapsmål|^I henhold til/i.test(l.text)) break;
      const m = /^(\d)\.\s+(.*)$/.exec(l.text);
      if (m) {
        if (cur) out.push(cur);
        cur = { text: m[2], quote: m[2], page: l.page };
      } else if (cur) {
        cur.text += ` ${l.text}`;
        cur.quote = cur.text;
      }
    }
    if (cur) out.push(cur);
  }
  // Ny tabell: kriteriets navn står i første kolonne, beskrivelsene i de neste.
  const table: [RegExp, string][] = [
    [/^1\.\s*Forståelse av/i, 'Forståelse av oppgaven: svaret treffer det oppgaven faktisk spør om, og alle delene av spørsmålet.'],
    [/^2\.\s*Bruk av/i, 'Bruk av relevante begreper fra pensum: flere fagbegreper fra pensum, tydelig knyttet til oppgavens tema.'],
    [/^3\.\s*Presisjon i bruk/i, 'Presisjon i bruk av begrepene: begrepene er definert tydelig og brukt korrekt, i tråd med pensum.'],
  ];
  for (const [re, text] of table) {
    const l = lines.find((x) => re.test(x.text));
    if (l) out.push({ text, quote: l.text, page: l.page });
  }
  // «I tillegg kommer …»: ryddighet, rettskriving og helhetsvurdering med eksempler.
  const extra = lines.findIndex((l) => /^I tillegg kommer/i.test(l.text));
  if (extra >= 0) {
    const first = lines[extra].text.replace(/^I tillegg kommer\s*:?\s*/i, '').trim();
    if (first.length > 20) out.push({ text: first, quote: first, page: lines[extra].page });
    let cur: EssayCriterion | null = null;
    for (const l of lines.slice(extra + 1, extra + 8)) {
      if (/^(Med tanke på|I henhold til|Kunnskapsmål)/i.test(l.text)) break;
      if (/^-\s+/.test(l.text)) {
        if (cur) out.push(cur);
        cur = { text: l.text.replace(/^-\s+/, ''), quote: l.text.replace(/^-\s+/, ''), page: l.page };
      } else if (cur) {
        cur.text += ` ${l.text}`;
        cur.quote = cur.text;
      } else if (first.length <= 20) break;
    }
    if (cur) out.push(cur);
  }
  return out.map((c) => ({ ...c, text: c.text.replace(/\s+/g, ' ').trim(), quote: c.quote.replace(/\s+/g, ' ').trim() }));
}

export function segmentEssay(pages: EssayPageInput[]): EssaySegmentation {
  const lines = allLines(pages);
  const full = lines.map((l) => l.text).join('\n');
  const gStart = lines.findIndex((l) => GUIDE_START.test(l.text));
  const eStart = lines.findIndex((l) => EXAM_START.test(l.text));
  const isGuide = gStart >= 0;
  const start = isGuide ? gStart : eStart;
  const its = start >= 0 ? items(lines, start + 1, isGuide) : [];
  const slotM = /\bslot\s*(?:nr\.?\s*)?(\d)\b/i.exec(full);
  const hours = /(tre|fire|to|fem|seks|\d)\s+tim(?:er|ar)\s+til rådighe/i.exec(full);
  const H: Record<string, number> = { to: 2, tre: 3, fire: 4, fem: 5, seks: 6 };
  const aidsM = /Tillatte? hjelpemid(?:ler|del)\s*:\s*([^\n]+)/i.exec(full);
  const curriculum = lines
    .filter((l) => /^[•–-]\s*(?:Einarsen|Martinsen|Pensum er kapitlene)|^\s*Pensum er kapitlene|^(?:Einarsen|Martinsen),/.test(l.text))
    .map((l) => l.text.replace(/^[•–-]\s*/, ''));
  const notes: string[] = [];
  if (its.length) notes.push(`${its.length} ${isGuide ? 'spørsmål med pensumhenvisning' : 'tekstoppgaver'} funnet.`);
  return {
    kind: isGuide ? 'veiledning' : 'eksamen',
    items: its.filter((i) => i.text.length > 8),
    criteria: isGuide ? criteria(lines) : [],
    language: /nynorsk|oppgåver|Svar på følgande|Kva meiner/i.test(full) ? 'nn' : 'nb',
    slot: slotM ? Number(slotM[1]) : undefined,
    equalWeight: /telle likt|tel likt|teller likt/i.test(full),
    minutes: hours ? (H[hours[1].toLowerCase()] ?? Number(hours[1])) * 60 : undefined,
    aids: aidsM ? aidsM[1].trim() : /uten hjelpemidler/i.test(full) ? 'Ingen hjelpemidler' : undefined,
    curriculum,
    notes,
  };
}

/** Likhet mellom to sett med spørsmål (0–1), uavhengig av rekkefølge og bokmål/nynorsk. */
export function essaySetSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\s-]/gu, ' ').split(/\s+/).filter((w) => w.length > 3).map((w) => w.slice(0, 5)));
  const A = a.map(words);
  const B = b.map(words);
  const jac = (x: Set<string>, y: Set<string>) => {
    let i = 0;
    for (const w of x) if (y.has(w)) i++;
    return i / Math.max(1, x.size + y.size - i);
  };
  const best = A.map((x) => Math.max(...B.map((y) => jac(x, y))));
  return best.reduce((s, v) => s + v, 0) / Math.max(A.length, B.length);
}
