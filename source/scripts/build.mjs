// Bygger appen til dist/: app.js (bundlet), index.html (artefaktsiden med innebygd CSS),
// vendor-filer (pdf.js-worker, mammoth) og demofiler.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
if (existsSync(dist)) rmSync(dist, { recursive: true });
mkdirSync(join(dist, 'vendor'), { recursive: true });
mkdirSync(join(dist, 'demo'), { recursive: true });

// Fingeravtrykk for demofiler (brukes til å kjenne igjen demobildet og den skannede veiledningen).
const demoDir = join(root, 'demo', 'out');
const hashes = {};
for (const f of readdirSync(demoDir)) {
  if (f.startsWith('_')) continue;
  const buf = readFileSync(join(demoDir, f));
  hashes[f] = createHash('sha256').update(buf).digest('hex');
  // Artefaktvisningen serverer ikke .docx; slike filer legges ut som base64-tekst.
  if (f.endsWith('.docx')) writeFileSync(join(dist, 'demo', `${f}.b64.txt`), buf.toString('base64'));
  else copyFileSync(join(demoDir, f), join(dist, 'demo', f));
}
writeFileSync(join(root, 'src', 'demo', 'hashes.json'), JSON.stringify(hashes, null, 1));

const res = await build({
  entryPoints: [join(root, 'src', 'main.tsx')],
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'iife',
  target: ['es2020'],
  platform: 'browser',
  outdir: dist,
  entryNames: 'app',
  loader: { '.woff2': 'dataurl', '.woff': 'empty', '.ttf': 'empty' },
  define: { 'process.env.NODE_ENV': '"production"' },
  external: ['canvas', 'path2d-polyfill', 'fs', 'http', 'https', 'url', 'zlib'],
  logLevel: 'warning',
  metafile: true,
});

// Rå kontrolltegn i strenglitteraler skrives om til \xHH-escapes (samme verdi ved kjøring),
// fordi artefaktplattformen ikke tar imot tekstfiler med slike tegn.
function escapeControlBytes(src, dest) {
  const text = readFileSync(src, 'latin1');
  let out = '';
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if ((c < 0x20 && c !== 9 && c !== 10 && c !== 13) || c === 0x7f) {
      let bs = 0;
      for (let j = i - 1; j >= 0 && text[j] === '\\'; j--) bs++;
      if (bs % 2 === 1) throw new Error(`Kontrolltegn etter backslash i ${src} ved ${i}`);
      out += '\\x' + c.toString(16).padStart(2, '0');
      n++;
    } else out += text[i];
  }
  writeFileSync(dest, out, 'latin1');
  return n;
}
escapeControlBytes(join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.js'), join(dist, 'vendor', 'pdf.worker.min.js'));
escapeControlBytes(join(root, 'node_modules/mammoth/mammoth.browser.min.js'), join(dist, 'vendor', 'mammoth.browser.min.js'));
// Tekstgjenkjenning (Tesseract): arbeider, motor og norsk språkmodell legges ut som egne filer.
mkdirSync(join(dist, 'vendor', 'tesseract'), { recursive: true });
{
  const workerSrc = readFileSync(join(root, 'node_modules/tesseract.js/dist/worker.min.js'), 'latin1');
  // Retting av en feil i tesseract.js: språk gitt som {code, data} ble initialisert med data i stedet for kode.
  const bug = 'return"string"==typeof t?t:t.data}))';
  if (!workerSrc.includes(bug)) throw new Error('Fant ikke stedet som skal rettes i tesseract-arbeideren');
  writeFileSync(join(dist, 'vendor', 'tesseract', 'worker.src.tmp'), workerSrc.replace(bug, 'return"string"==typeof t?t:t.code}))'), 'latin1');
  escapeControlBytes(join(dist, 'vendor', 'tesseract', 'worker.src.tmp'), join(dist, 'vendor', 'tesseract', 'worker.min.js'));
  rmSync(join(dist, 'vendor', 'tesseract', 'worker.src.tmp'));
  for (const f of ['tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js']) escapeControlBytes(join(root, 'node_modules/tesseract.js-core', f), join(dist, 'vendor', 'tesseract', f));
  const lang = readFileSync(join(root, 'node_modules/@tesseract.js-data/nor/4.0.0_best_int/nor.traineddata.gz'));
  writeFileSync(join(dist, 'vendor', 'tesseract', 'nor.traineddata.gz.b64.txt'), lang.toString('base64'));
}

const css = readFileSync(join(dist, 'app.css'), 'utf8');
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">';
const body = `<title>Eksamensverksted</title>
${fonts}
<style>
${css}
</style>
<div id="app"></div>
<script src="app.js"></script>
`;
writeFileSync(join(dist, 'index.html'), body);
// Frittstående side for lokal testing (samme innhold med dokumentskall).
writeFileSync(join(dist, 'local.html'), `<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${body}</body></html>`);
const jsKb = Math.round(readFileSync(join(dist, 'app.js')).length / 1024);
const htmlKb = Math.round(readFileSync(join(dist, 'index.html')).length / 1024);
console.log(`Bygget: app.js ${jsKb} KB, index.html ${htmlKb} KB (med CSS og KaTeX-fonter), ${Object.keys(hashes).length} demofiler.`);
if (res.warnings.length) console.log(res.warnings.length, 'advarsler');
