// DOCX leses med mammoth (lastes ved behov fra appens egne filer).

declare global {
  interface Window {
    mammoth?: { extractRawText: (o: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string; messages: unknown[] }> };
  }
}

let loading: Promise<void> | null = null;

export function loadMammoth(src = 'vendor/mammoth.browser.min.js'): Promise<void> {
  if (typeof window !== 'undefined' && window.mammoth) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => (window.mammoth ? resolve() : reject(new Error('DOCX-leseren lastet ikke riktig')));
    s.onerror = () => {
      loading = null;
      reject(new Error('Fant ikke DOCX-leseren'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export async function extractDocx(bytes: Uint8Array): Promise<{ text: string; paragraphs: string[] }> {
  await loadMammoth();
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const r = await window.mammoth!.extractRawText({ arrayBuffer: buf });
  const paragraphs = r.value.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  return { text: paragraphs.join('\n'), paragraphs };
}
