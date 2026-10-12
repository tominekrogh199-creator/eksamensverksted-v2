// Innholdsfingeravtrykk (SHA-256) for å fange duplikater før de telles som nye eksamener.

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = (globalThis.crypto as Crypto | undefined)?.subtle;
  if (subtle) {
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const h = await subtle.digest('SHA-256', buf);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Reserve uten WebCrypto: FNV-1a 64 bit (merket, ikke kryptografisk).
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0xcbf29ce4 >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 16777619) >>> 0;
    h2 = Math.imul(h2 ^ bytes[(i * 7) % bytes.length], 16777619) >>> 0;
  }
  return 'fnv-' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + bytes.length.toString(16);
}

/** Enkel tekstlikhet (Jaccard på ordtrigrammer) for å finne samme innhold i ulike filer. */
export function textSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const w = s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    const g = new Set<string>();
    for (let i = 0; i + 2 < w.length; i++) g.add(w[i] + ' ' + w[i + 1] + ' ' + w[i + 2]);
    return g;
  };
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
