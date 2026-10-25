import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const deck = JSON.parse(readFileSync(new URL('../src/lib/cah-after-hours.json', import.meta.url), 'utf8'));
const normalized = text => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

test('After Hours contains exactly250 original prompts and500 unique playable responses', () => {
  assert.equal(deck.pack.slug, 'after-hours');
  for (const [type, count, prefix, perCategory] of [['prompts', 250, 'ah-p-', 25], ['responses', 500, 'ah-r-', 50]]) {
    const rows = deck[type];
    assert.equal(rows.length, count);
    assert.equal(new Set(rows.map(row => row.id)).size, count);
    assert.equal(new Set(rows.map(row => normalized(row.text))).size, count);
    const categories = new Map();
    rows.forEach((row, index) => {
      assert.equal(row.id, `${prefix}${String(index + 1).padStart(3, '0')}`);
      assert.ok(row.text.trim() && row.text.length <= 180);
      assert.equal((row.text.match(/_{3,}/g) ?? []).length, type === 'prompts' ? 1 : 0);
      categories.set(row.category, (categories.get(row.category) ?? 0) + 1);
    });
    assert.equal(categories.size, 10);
    assert.ok([...categories.values()].every(n => n === perCategory));
  }
});
