// Utsnitt av en figur fra originaldokumentet, gjengitt fra PDF-en på enheten.
// Figuren er alltid originalen: vi tegner den ikke på nytt og tolker den ikke her.

import { useEffect, useState } from 'react';
import type { SourceDoc } from '../../domain/types';
import { store } from '../../state/store';
import { docBytes } from '../../analysis/pipeline';
import { renderPdfCrop } from '../../ingest/pdf';
import { Icon } from './Icon';

const cache = new Map<string, string>();

export function FigureCrop({ docId, page, box, caption }: { docId: string; page: number; box: [number, number, number, number]; caption?: string }) {
  const key = `${docId}:${page}:${box.map((b) => b.toFixed(3)).join(',')}`;
  const [url, setUrl] = useState<string | null>(cache.get(key) ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setZoom(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);
  useEffect(() => {
    if (cache.has(key)) return;
    let alive = true;
    (async () => {
      const d = store.get<SourceDoc>('doc', docId);
      if (!d) return;
      const bytes = await docBytes(d);
      if (!bytes) throw new Error('Originalfilen finnes ikke på denne enheten.');
      if (d.mime !== 'application/pdf') throw new Error('Utsnitt støttes for PDF.');
      const u = await renderPdfCrop(bytes, page, box, 1500);
      cache.set(key, u);
      if (alive) setUrl(u);
    })().catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [key, docId, page, box]);
  return (
    <figure className="figure-crop" style={{ margin: 0 }}>
      {url ? (
        <button type="button" onClick={() => setZoom(true)} title="Klikk for å forstørre" style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'none', cursor: 'zoom-in' }}>
          <img src={url} alt={caption ?? `Figur fra originalen, PDF-side ${page}`} style={{ width: '100%', height: 'auto', borderRadius: 10, border: '1px solid var(--line)', background: '#fff' }} />
        </button>
      ) : err ? (
        <div className="notice small">{err}</div>
      ) : (
        <div className="skeleton" style={{ height: 160, borderRadius: 10 }} aria-label="Henter figuren" />
      )}
      <figcaption className="xs muted row" style={{ gap: 6, marginTop: 4 }}>
        <Icon name="image" size={13} /> {caption ?? 'Figur fra originalen'} · PDF-side {page}
        {url ? (
          <button className="src-link" onClick={() => setZoom(true)}>
            Forstørr
          </button>
        ) : null}
        <button className="src-link" onClick={() => store.setUi({ source: { docId, page } })}>
          Åpne siden
        </button>
      </figcaption>
      {zoom && url ? (
        <div role="dialog" aria-modal="true" aria-label={caption ?? 'Forstørret utsnitt'} onClick={() => setZoom(false)} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(20,16,30,.72)', display: 'grid', placeItems: 'center', padding: 16, cursor: 'zoom-out' }}>
          <img src={url} alt={caption ?? `Figur fra originalen, PDF-side ${page}`} style={{ maxWidth: 'min(1100px, 100%)', maxHeight: '100%', width: '100%', objectFit: 'contain', background: '#fff', borderRadius: 10 }} />
        </div>
      ) : null}
    </figure>
  );
}
