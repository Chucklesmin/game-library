import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadPacks() {
  const source = fs.readFileSync(new URL("../src/lib/packs.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const sandboxModule = { exports: {} };
  vm.runInNewContext(output, { module: sandboxModule, exports: sandboxModule.exports });
  return sandboxModule.exports.PACKS;
}

test("every Wavelength question has a unique id, two usable sides, and its pack tag", () => {
  const packs = loadPacks();
  const ids = new Set();
  assert.equal(packs.length, 11);
  assert.ok(packs.some((pack) => pack.id === "naughty" && pack.name === "Naughty & Nice"));
  for (const pack of packs) {
    assert.ok(pack.spectra.length >= 20, pack.id + " needs enough questions for the selector");
    for (const question of pack.spectra) {
      assert.ok(question.left.trim() && question.right.trim(), question.id + " needs both sides");
      assert.notEqual(question.left.trim().toLowerCase(), question.right.trim().toLowerCase(), question.id + " cannot repeat a side");
      assert.deepEqual(Array.from(question.tags), [pack.id], question.id + " must belong to its selected pack");
      assert.ok(!ids.has(question.id), question.id + " must be unique");
      ids.add(question.id);
    }
  }
  assert.equal(ids.size, 472);
  assert.equal(packs.find((pack) => pack.id === "naughty").spectra.length, 178);
});

test("the database seed matches the selectable packs and writes pack tags", () => {
  const packs = loadPacks();
  const migration = fs.readFileSync(new URL("../supabase/migrations/20260920024648_wavelength_game_setup_packs_and_previews.sql", import.meta.url), "utf8");
  const seeded = new Map([...migration.matchAll(/\('([^']+)',\$\$([^$]+)\$\$\)/g)].map((match) => [match[1], match[2].split("~")]));
  assert.equal(seeded.size, packs.length);
  for (const pack of packs.filter((pack) => pack.id !== "naughty")) assert.deepEqual(seeded.get(pack.id), Array.from(pack.spectra, (question) => question.left + "|" + question.right), pack.id + " seed must match its selector");
  assert.match(migration, /insert into public\.wavelength_question_tags/);
});

