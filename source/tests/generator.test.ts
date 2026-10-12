import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAMILIES } from '../src/families';
import { generateOne, generateTasks } from '../src/generator/generate';

test('alle maler gir validerte oppgaver over mange frø', () => {
  const failures: string[] = [];
  let n = 0;
  for (const f of FAMILIES) {
    for (const t of f.templates) {
      for (let seed = 1; seed <= 40; seed++) {
        let task;
        try {
          task = generateOne('c1', f.id, t, seed * 7919);
        } catch (e) {
          failures.push(`${t.id}#${seed}: kastet ${e}`);
          continue;
        }
        n++;
        if (task.validation.status !== 'gyldig') {
          const bad = task.validation.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`);
          failures.push(`${t.id}#${seed} ${task.validation.status}: ${bad.join(' | ')}`);
        }
      }
    }
  }
  if (failures.length) console.log(failures.slice(0, 25).join('\n'), `\n… ${failures.length} av ${n}`);
  assert.ok(failures.length / n < 0.02, `${failures.length} av ${n} feilet`);
});

test('generering gir variasjon uten nesten-duplikater', () => {
  const r = generateTasks({ courseId: 'c1', families: ['likevekt-lineaer', 'prosent-endring', 'kostnad-lineaer'], count: 8, level: 'blandet', seed: 42 });
  assert.equal(r.tasks.length, 8);
  const keys = new Set(r.tasks.map((t) => t.templateId + JSON.stringify(t.params)));
  assert.equal(keys.size, 8);
});
