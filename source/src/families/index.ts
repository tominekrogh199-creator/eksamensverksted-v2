import { likevekt } from './likevekt';
import { avgift } from './avgift';
import { prosent } from './prosent';
import { kostnad } from './kostnad';
import { wsps, disiplin } from './sok-arbeid';
import { arbeidFritid, alternativkostnad, markedKvalitativ, teknologi, prinsipalAgent, kapitalisme } from './sok-mikro';
import { makro, konjunktur } from './sok-makro';
import type { FamilyKB, TemplateDef, FormulaDef } from './common';

export const FAMILIES: FamilyKB[] = [likevekt, avgift, prosent, kostnad, wsps, disiplin, arbeidFritid, markedKvalitativ, alternativkostnad, teknologi, prinsipalAgent, makro, konjunktur, kapitalisme, ...ELEKTRO_FAMILIES, ...DIGITAL_FAMILIES];

import { ELEKTRO_FAMILIES } from './el-kretser';
import { DIGITAL_FAMILIES } from './el-digital';

export const FAMILY_MAP: Record<string, FamilyKB> = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));

export function getFamily(id: string | undefined): FamilyKB | undefined {
  return id ? FAMILY_MAP[id] : undefined;
}

export function findTemplate(id: string): { family: FamilyKB; template: TemplateDef } | undefined {
  for (const f of FAMILIES) {
    const t = f.templates.find((x) => x.id === id);
    if (t) return { family: f, template: t };
  }
  return undefined;
}

export function allFormulas(): { family: FamilyKB; formula: FormulaDef }[] {
  return FAMILIES.flatMap((f) => f.formulas.map((formula) => ({ family: f, formula })));
}

/** Hvilke familier som bygger på hverandre. Avgift er en endret forutsetning av likevekt. */
export const RELATED: Record<string, string[]> = {
  'likevekt-lineaer': ['likevekt-avgift'],
  'likevekt-avgift': ['likevekt-lineaer'],
  'prosent-endring': [],
  'kostnad-lineaer': [],
  'ws-ps': ['arbeidsdisiplin'],
  arbeidsdisiplin: ['ws-ps'],
  'fritid-konsum': ['alternativkostnad'],
  'marked-frikonkurranse': ['likevekt-lineaer', 'likevekt-avgift'],
  alternativkostnad: ['fritid-konsum'],
  'teknologi-isokost': [],
  'prinsipal-agent': ['arbeidsdisiplin'],
  'bnp-inflasjon': ['konjunktur-konsum'],
  'konjunktur-konsum': ['bnp-inflasjon'],
  kapitalisme: [],
  'el-grunnlag': ['el-motstand'],
  'el-motstand': ['el-grunnlag', 'el-kretsanalyse'],
  'el-kretsanalyse': ['el-motstand', 'el-opamp'],
  'el-opamp': ['el-kretsanalyse', 'el-filter'],
  'el-transient': ['el-kretsanalyse', 'el-filter'],
  'el-ac': ['el-filter'],
  'el-filter': ['el-transient', 'el-ac'],
  'dig-tall': ['dig-sekvensiell'],
  'dig-logikk': ['dig-sekvensiell'],
  'dig-sekvensiell': ['dig-logikk', 'dig-tall'],
};

export function domainOf(f: FamilyKB | undefined): 'økonomi' | 'elektro' | 'digital' {
  return f?.domain ?? 'økonomi';
}

/** Familiene som hører til fagområdene i settene (alle når ingenting er analysert ennå). */
export function familiesFor(presentIds: Iterable<string | undefined>): FamilyKB[] {
  const domains = new Set([...presentIds].filter((id): id is string => !!id && !!getFamily(id)).map((id) => domainOf(getFamily(id))));
  if (!domains.size) return FAMILIES;
  return FAMILIES.filter((f) => domains.has(domainOf(f)));
}

export type { FamilyKB, TemplateDef, FormulaDef };

/** Familiens korte forklaring. Noen forklaringer bruker oppgavens tall; mangler de, brukes en generell tekst. */
export function familyShort(f: FamilyKB | undefined, params: Record<string, string> = {}): { text: string; example: string } {
  if (!f) return { text: '', example: '' };
  for (const p of [params, {}]) {
    try {
      const r = f.explanations.short(p);
      if (r?.text) return r;
    } catch {
      /* prøver neste */
    }
  }
  return { text: f.description, example: '' };
}
