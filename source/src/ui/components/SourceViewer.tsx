// Originalvisning: viser riktig originalside med markering av det påstanden
// bygger på. Skiller PDF-sidenummer fra trykt sidenummer.

import { useEffect, useState } from 'react';
import type { SourceDoc, PageRec } from '../../domain/types';
import { store, useStore } from '../../state/store';
import { docBytes, setPageText } from '../../analysis/pipeline';
import { renderPdfPage } from '../../ingest/pdf';
import { Sheet, Pill, DemoBadge, Notice, Spinner } from './common';
import { Icon } from './Icon';

const cache = new Map<string, string>();

export async function pageImageUrl(doc: SourceDoc, page: number): Promise<string | null> {
  const key = `${doc.id}:${page}`;
  if (cache.has(key)) return cache.get(key)!;
  const bytes = await docBytes(doc);
  if (!bytes) return null;
  let url: string | null = null;
  if (doc.mime === 'application/pdf') {
    const r = await renderPdfPage(bytes, page, 1400);
    url = URL.createObjectURL(r.blob);
  } else if (doc.mime.startsWith('image/')) {
    url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: doc.mime }));
  }
  if (url) cache.set(key, url);
  return url;
}

export function SourceViewer() {
  const view = useStore((s) => s.ui.source);
  if (!view) return null;
  return <SourceViewerInner key={`${view.docId}:${view.page}`} />;
}

function SourceViewerInner() {
  const view = useStore((s) => s.ui.source)!;
  const doc = useStore((s) => s.get<SourceDoc>('doc', view.docId));
  const pages = useStore((s) => (doc ? s.pages(doc.id).filter((p) => p.docVersion === doc.version) : []));
  const [pageNo, setPageNo] = useState(view.page);
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<'bilde' | 'tekst'>(doc?.mime.includes('wordprocessingml') ? 'tekst' : 'bilde');
  const [editing, setEditing] = useState(false);
  const page: PageRec | undefined = pages.find((p) => p.pdfPage === pageNo);
  const [draft, setDraft] = useState(page?.text ?? '');
  useEffect(() => {
    if (!doc || mode !== 'bilde') return;
    let alive = true;
    setUrl(undefined);
    pageImageUrl(doc, pageNo)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [doc, pageNo, mode]);
  useEffect(() => setDraft(page?.text ?? ''), [page?.text]);
  if (!doc) return null;
  const close = () => store.setUi({ source: undefined });
  const hl = pageNo === view.page ? view.highlight ?? [] : [];
  const quoteBoxes = pageNo === view.page && view.quote && page?.lines ? page.lines.filter((l) => view.quote && l.t.length > 6 && (view.quote.includes(l.t.slice(0, 40)) || l.t.includes(view.quote.slice(0, 40)))).map((l) => l.b) : [];
  const boxes = hl.length ? hl : quoteBoxes;
  return (
    <Sheet
      onClose={close}
      title={
        <div className="stack sm" style={{ gap: 2 }}>
          <div className="row">
            <h3 style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.meta.setLabel ?? doc.fileName}</h3>
            {doc.demo ? <DemoBadge small /> : null}
            {view.label ? <Pill tone="accent">Oppgave {view.label}</Pill> : null}
          </div>
          <span className="xs muted">
            {doc.fileName} · versjon {doc.version} · PDF-side {pageNo} av {doc.pageCount}
            {page?.printedPage && page.printedPage !== String(pageNo) ? ` · trykt side ${page.printedPage}` : ''}
            {page?.printedPage === undefined ? ' · trykt sidenummer ikke funnet' : ''}
          </span>
        </div>
      }
    >
      <div className="row between">
        <div className="row">
          <button className="btn small" disabled={pageNo <= 1} onClick={() => setPageNo(pageNo - 1)}>
            <Icon name="prev" size={16} /> Forrige
          </button>
          <button className="btn small" disabled={pageNo >= doc.pageCount} onClick={() => setPageNo(pageNo + 1)}>
            Neste <Icon name="next" size={16} />
          </button>
        </div>
        <div className="row">
          <div className="tabs" role="tablist" aria-label="Visning">
            <button role="tab" aria-selected={mode === 'bilde'} onClick={() => setMode('bilde')}>
              Original
            </button>
            <button role="tab" aria-selected={mode === 'tekst'} onClick={() => setMode('tekst')}>
              Lest tekst
            </button>
          </div>
          {mode === 'bilde' ? (
            <>
              <button className="icon-btn" aria-label="Zoom ut" onClick={() => setZoom(Math.max(0.6, zoom - 0.2))}>
                <Icon name="zoomOut" />
              </button>
              <button className="icon-btn" aria-label="Zoom inn" onClick={() => setZoom(Math.min(3, zoom + 0.3))}>
                <Icon name="zoomIn" />
              </button>
            </>
          ) : null}
        </div>
      </div>
      {page ? (
        <div className="row">
          <Pill tone={page.status === 'lest' || page.status === 'ai-lest' || page.status === 'ocr-lest' || page.status === 'manuelt-rettet' ? 'teal' : page.status === 'irrelevant' ? 'outline' : 'amber'}>{pageStatusLabel(page.status)}</Pill>
          <Pill>{page.textSource === 'tekstlag' ? 'Tekst fra tekstlaget' : page.textSource === 'ai-lesing' ? 'Tekst lest av AI' : page.textSource === 'manuell' ? 'Tekst skrevet inn av deg' : page.textSource === 'docx' ? 'Tekst fra DOCX' : 'Ingen tekst'}</Pill>
          {page.hasFigure ? <Pill tone="blue">Figur eller tabell</Pill> : null}
        </div>
      ) : null}
      {page?.statusNote ? <p className="small muted">{page.statusNote}</p> : null}
      {page?.figureNote ? (
        <Notice tone="blue" icon="image">
          <span className="small">
            <strong>Figur:</strong> {page.figureNote}
          </span>
        </Notice>
      ) : null}
      {page?.uncertainties?.length ? (
        <Notice tone="amber">
          <strong className="small">Usikre steder i lesingen</strong>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {page.uncertainties.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {mode === 'bilde' ? (
        <div className="zoom-wrap">
          {url === undefined ? (
            <Spinner label="Henter originalsiden …" />
          ) : url === null ? (
            <Notice tone="amber">Originalfilen finnes ikke på denne enheten. Du ser teksten som ble lest. Slå på skylagring av originaler i innstillingene for å se originalen på alle enheter.</Notice>
          ) : (
            <div className="page-view" style={{ width: `${zoom * 100}%`, maxWidth: zoom > 1 ? 'none' : 820 }}>
              <img src={url} alt={`Side ${pageNo} av ${doc.fileName}`} />
              {boxes.map((b, i) => (
                <div key={i} className="hl" style={{ left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${b[2] * 100}%`, height: `${b[3] * 100}%` }} />
              ))}
              {page?.figureBoxes?.map((b, i) => (
                <div key={'f' + i} className="hl fig" style={{ left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${b[2] * 100}%`, height: `${b[3] * 100}%` }} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="card flat">
          {editing ? (
            <div className="stack">
              <label className="label" htmlFor="page-text">
                Tekst for PDF-side {pageNo}
              </label>
              <textarea id="page-text" className="input source-text" style={{ minHeight: 260 }} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div className="row">
                <button
                  className="btn primary"
                  onClick={() => {
                    if (page) setPageText(page.id, draft);
                    setEditing(false);
                    store.toast('Teksten er lagret. Siden analyseres på nytt.', 'ok');
                  }}
                >
                  Lagre og analyser på nytt
                </button>
                <button className="btn ghost" onClick={() => setEditing(false)}>
                  Avbryt
                </button>
              </div>
            </div>
          ) : (
            <div className="stack">
              <div className="source-text">{page?.text || <span className="muted">Ingen tekst er lest fra denne siden ennå.</span>}</div>
              <div>
                <button className="btn small" onClick={() => setEditing(true)}>
                  <Icon name="pencil" size={16} />
                  {page?.text ? 'Rett teksten' : 'Skriv inn teksten'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

export function pageStatusLabel(s: PageRec['status']): string {
  return (
    {
      'ikke-behandlet': 'Ikke behandlet',
      lest: 'Lest',
      'trenger-ai-lesing': 'Trenger bildelesing',
      'trenger-visuell-kontroll': 'Figur (vises som utsnitt)',
      uleselig: 'Uleselig',
      irrelevant: 'Ingen oppgaver',
      'manuelt-rettet': 'Rettet av deg',
      'ai-lest': 'Lest av AI',
      'ocr-lest': 'Lest fra bilde (OCR)',
    } as Record<string, string>
  )[s];
}
