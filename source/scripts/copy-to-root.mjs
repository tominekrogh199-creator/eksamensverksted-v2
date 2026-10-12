// Kopierer det ferdige bygget (dist/) til mappen over, slik at start-skriptene der kjører nyeste versjon.
// dist/local.html blir index.html (frittstående side); dist/index.html er artefaktversjonen for claude.ai.
import { cpSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const out = join(root, '..');
copyFileSync(join(dist, 'app.js'), join(out, 'app.js'));
copyFileSync(join(dist, 'local.html'), join(out, 'index.html'));
cpSync(join(dist, 'vendor'), join(out, 'vendor'), { recursive: true });
cpSync(join(dist, 'demo'), join(out, 'demo'), { recursive: true });
console.log('Kopiert dist/ til', out);
