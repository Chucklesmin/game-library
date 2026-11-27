import assert from "node:assert/strict";
import test from "node:test";
import { game } from "../src/lib/roadmap/games/sync-or-swim.ts";

const players = [
  { id: "first", name: "Ari" },
  { id: "second", name: "Em" },
];
const now = Date.UTC(2026, 10, 26);
const context = (actorId = "first", at = now) => ({
  actorId, hostId: "first", players, now: at,
});
const act = (state, actorId, id, values = {}, at = now + 1) =>
  game.act(state, context(actorId, at), { id, values });
const score = (view, name) => view.standings.find(({ label }) => label === name)?.score;

function playChoices(state, round, first, second) {
  const locked = act(state, "first", `choose-${round}`, { choice: first });
  return act(locked, "second", `choose-${round}`, { choice: second });
}

test("only two distinct members can start, see or act in a match", () => {
  for (const roster of [[], players.slice(0, 1), [...players, { id: "extra", name: "Extra" }], [players[0], players[0]]]) {
    assert.throws(() => game.create({ ...context(), players: roster }), /exactly two/);
  }
  const state = game.create(context());
  assert.throws(() => game.view(state, context("guest")), /Only the two players/);
  assert.throws(() => act(state, "guest", "choose-1", { choice: "0" }), /Only the two players/);
});

test("a locked answer is immutable and projects no pre-reveal choice to either player", () => {
  const state = game.create(context());
  const firstView = game.view(state, context());
  const secondBefore = game.view(state, context("second"));
  const answers = firstView.controls[0].fields[0].options;
  assert.ok(answers.length >= 3 && answers.length <= 5);
  assert.equal(new Set(answers.map(({ label }) => label)).size, answers.length);

  for (const choice of ["", " 0 ", "0.0", "1e0", "-1", "4", "999", "other"]) {
    assert.throws(() => act(state, "first", "choose-1", { choice }), /Choose an answer/);
  }

  const locked = act(state, "first", "choose-1", { choice: "0" });
  assert.deepEqual(state.choices, {});
  const rejoined = JSON.parse(JSON.stringify(locked));
  assert.deepEqual(game.view(rejoined, context("second")), secondBefore);
  assert.deepEqual(game.view(rejoined, context()).controls, []);
  assert.equal(game.view(rejoined, context()).cards, undefined);
  assert.equal(game.view(rejoined, context()).privateCards, undefined);
  assert.throws(() => act(rejoined, "first", "choose-1", { choice: "1" }), /already locked/);
  assert.throws(() => act(rejoined, "second", "reveal-1"), /stay private/);

  const revealed = act(rejoined, "second", "choose-1", { choice: "0" });
  for (const id of ["first", "second"]) {
    const view = game.view(revealed, context(id));
    assert.equal(view.heading, "In sync!");
    assert.equal(score(view, "Current streak"), 1);
    assert.deepEqual(view.cards.slice(1, 3).map(({ body }) => body), [answers[0].label, answers[0].label]);
    assert.deepEqual(view.cards.at(-1).items, ["Round 1 · Matched"]);
  }
  assert.throws(() => act(revealed, "second", "choose-1", { choice: "0" }), /no longer available/);
});

test("predictions are optional, one-time, and private until both choices reveal", () => {
  const first = playChoices(game.create(context()), 1, "1", "1");
  const next = act(first, "second", "next-1");
  const partnerView = game.view(next, context("second"));
  assert.equal(partnerView.cards[0].items.length, 4);
  assert.throws(() => act(next, "first", "choose-2", { choice: "1" }), /prediction first/);
  const predicted = act(next, "first", "predict-miss-2");
  assert.deepEqual(game.view(predicted, context("second")), partnerView);
  assert.equal(game.view(predicted, context()).cards, undefined);
  assert.throws(() => act(predicted, "first", "predict-match-2"), /no longer available/);

  const skipped = act(predicted, "second", "predict-skip-2");
  const revealed = playChoices(skipped, 2, "1", "2");
  const view = game.view(revealed, context());
  assert.equal(view.heading, "Different picks");
  assert.equal(score(view, "Current streak"), 0);
  assert.equal(score(view, "Best streak"), 1);
  assert.equal(score(view, "Correct predictions"), 1);
  assert.deepEqual(view.cards[1].items, ["Prediction: Different choices · Correct"]);
  assert.equal(view.cards[2].items, undefined);
  assert.deepEqual(view.cards.at(-1).items, ["Round 1 · Matched", "Round 2 · Different picks"]);

  const third = act(revealed, "second", "next-2");
  assert.throws(() => act(third, "second", "next-2"), /no longer available/);
  assert.throws(() => act(third, "second", "choose-2", { choice: "0" }), /no longer available/);
});

test("either player can resolve a deadline, late choices are rejected, and missing picks void predictions", () => {
  const first = playChoices(game.create(context()), 1, "1", "1");
  const second = act(first, "first", "next-1");
  const predicted = act(second, "first", "predict-miss-2");
  const locked = act(predicted, "first", "choose-2", { choice: "0" });
  const { deadline } = game.view(locked, context());
  assert.equal(deadline, now + 45_001);
  assert.deepEqual(game.view(locked, context("second", deadline)).controls, [
    { id: "reveal-2", label: "Reveal choices" },
  ]);
  assert.throws(() => act(locked, "second", "predict-match-2", {}, deadline), /Time is up/);
  assert.throws(() => act(locked, "second", "reveal-2", {}, deadline - 1), /stay private/);

  const expired = act(locked, "second", "reveal-2", {}, deadline);
  const view = game.view(expired, context("second", deadline));
  assert.equal(view.heading, "Time ran out");
  assert.deepEqual(view.cards.at(-1).items, ["Round 1 · Matched", "Round 2 · Timed out"]);
  assert.equal(view.cards[2].body, "No choice");
  assert.deepEqual(view.cards[1].items, ["Prediction: Different choices · Void"]);
  assert.equal(score(view, "Current streak"), 0);
  assert.equal(score(view, "Correct predictions"), 0);
  assert.throws(() => act(expired, "second", "reveal-2", {}, deadline), /no longer available/);
});

test("a restored legacy room keeps only outcomes still available from its current round", () => {
  const first = playChoices(game.create(context()), 1, "1", "1");
  let second = act(first, "first", "next-1");
  second = act(second, "first", "predict-skip-2");
  second = act(second, "second", "predict-skip-2");
  const oldReveal = JSON.parse(JSON.stringify(playChoices(second, 2, "1", "2")));
  delete oldReveal.history;
  const restored = game.view(oldReveal, context()).cards.at(-1);
  assert.deepEqual(restored.items, ["Round 2 · Different picks"]);
  assert.match(restored.body, /Earlier round results were not recorded/);

  const third = act(oldReveal, "first", "next-2");
  assert.equal(game.view(third, context()).cards, undefined);
  const final = game.view(playChoices(third, 3, "1", "1"), context("second"));
  assert.deepEqual(final.cards.at(-1).items, ["Round 2 · Different picks", "Round 3 · Matched"]);
});

test("a six-prompt cooperative session reaches its best-streak goal, then closes", () => {
  let state = game.create(context());
  const prompts = new Set();
  for (let round = 1; round <= 6; round++) {
    prompts.add(game.view(state, context()).heading);
    if (round === 2 || round === 5) {
      state = act(state, "first", `predict-match-${round}`);
      state = act(state, "second", `predict-miss-${round}`);
    }
    state = playChoices(state, round, "1", round === 4 ? "0" : "1");
    if (round < 6) state = act(state, "second", `next-${round}`);
  }
  const final = game.view(state, context());
  assert.equal(prompts.size, 6);
  assert.equal(final.finished, true);
  assert.equal(final.heading, "Streak goal reached!");
  assert.equal(score(final, "Current streak"), 2);
  assert.equal(score(final, "Best streak"), 3);
  assert.equal(score(final, "Matching rounds"), 5);
  assert.equal(score(final, "Correct predictions"), 2);
  assert.deepEqual(final.cards.at(-1).items, [
    "Round 1 · Matched", "Round 2 · Matched", "Round 3 · Matched",
    "Round 4 · Different picks", "Round 5 · Matched", "Round 6 · Matched",
  ]);
  assert.deepEqual(final.controls, []);
  assert.throws(() => act(state, "first", "next-6"), /no longer available/);
});
