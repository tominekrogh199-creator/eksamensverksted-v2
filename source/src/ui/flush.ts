// Ulagrede endringer i åpne skrivefelt (Workspace lagrer etter en kort pause).
// Før noe leveres «utenfra» (prøven leveres når tiden er ute), tømmes de her.

const hooks = new Set<() => void>();

export function onFlush(f: () => void): () => void {
  hooks.add(f);
  return () => {
    hooks.delete(f);
  };
}

export function flushAll() {
  for (const f of hooks) {
    try {
      f();
    } catch {
      /* et felt som ikke kan lagres, skal ikke stoppe resten */
    }
  }
}
