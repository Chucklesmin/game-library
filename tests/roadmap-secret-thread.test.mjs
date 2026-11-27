import assert from "node:assert/strict";
import test from "node:test";
import { game } from "../src/lib/roadmap/games/secret-thread.ts";

const players = Array.from({ length: 8 }, (_, index) => ({ id: `seat-${index}`, name: `Player ${index + 1}` }));
const initialTime = 1700000000000;
const context = (seat = 0, now = initialTime, count = 3) => ({ players: players.slice(0, count), actorId: players[seat].id, hostId: players[0].id, now });
const answer = (state) => state.puzzles[state.round].answer;
const move = (state, ctx, action, values = {}) =>
  game.act(state, ctx, { id: `${action}:${state.roundId}`, values });

test("Secret Thread opens only for 3–8 and each player sees exactly their own two clues", () => {
  assert.throws(() => game.create(context(0, initialTime, 2)), /3 to 8/);
  const oversized = { ...context(0, initialTime, 8), players: [...players, { id: "nine", name: "Nine" }] };
  assert.throws(() => game.create(oversized), /3 to 8/);
  for (const count of [3, 8]) {
    const ctx = context(0, initialTime, count);
    const state = game.create(ctx);
    assert.equal(new Set(state.puzzles.map((puzzle) => puzzle.answer)).size, 5);
    const pairs = state.puzzles[0].pairs;
    for (let seat = 0; seat < count; seat++) {
      const own = game.view(state, context(seat, initialTime, count));
      assert.deepEqual(own.privateCards[0].items, pairs[seat]);
      const json = JSON.stringify(own);
      assert.ok(!json.includes(state.puzzles[0].explanation));
      assert.ok(!json.includes(`"title":"${answer(state)}"`));
      for (const [index, pair] of pairs.entries()) {
        if (index !== seat) for (const clue of pair) assert.ok(!json.includes(clue));
      }
    }
  }
});

test("Secret Thread reload restores private clues, shared strikes and prior team guesses", () => {
  const host = context();
  const guest = context(1);
  const state = game.create(host);
  const after = move(state, guest, "guess", { answer: "Bananas" });
  const reconnected = JSON.parse(JSON.stringify(after));
  const view = game.view(reconnected, guest);
  assert.deepEqual(view, game.view(after, guest));
  assert.deepEqual(view.privateCards, game.view(state, guest).privateCards);
  assert.match(view.cards[0].body, /2 of 3/);
  assert.match(game.view(state, host).cards[0].body, /3 of 3/);
  const guesses = { title: "Previous guesses", items: ["bananas"] };
  assert.deepEqual(view.cards.find(({ title }) => title === guesses.title), guesses);
  assert.deepEqual(game.view(after, host).cards.find(({ title }) => title === guesses.title), guesses);
  assert.ok(!view.privateCards.some(({ items }) => items?.includes("bananas")));
  assert.ok(!view.cards.some(({ title }) => title === answer(state)));
  const revealed = move(after, guest, "guess", { answer: answer(state) });
  assert.deepEqual(game.view(revealed, guest).cards.find(({ title }) => title === guesses.title), guesses);
  const next = move(revealed, host, "next");
  assert.ok(!game.view(next, guest).cards.some(({ title }) => title === guesses.title));
});

test("Secret Thread rejects outsider, stale, unknown, repeated and invalid actions without consuming strikes", () => {
  const host = context();
  const guest = context(1);
  const state = game.create(host);
  assert.throws(() => game.view(state, context(4)), /Join the room/);
  assert.throws(() => move(state, context(4), "guess", { answer: answer(state) }), /Join the room/);
  assert.throws(() => game.act(state, host, { id: "guess:old", values: { answer: answer(state) } }), /from this puzzle/);
  assert.throws(() => move(state, host, "skip"), /from this puzzle/);
  assert.throws(() => move(state, guest, "guess", { answer: "!?" }), /before submitting/);
  assert.throws(() => move(state, guest, "guess", { answer: "a".repeat(61) }), /60 characters/);
  assert.throws(() => move(state, guest, "reveal"), /from this puzzle/);
  const tried = move(state, guest, "guess", { answer: "The Bananas!" });
  assert.throws(() => move(tried, host, "guess", { answer: "bananas" }), /already tried/);
  assert.equal(tried.wrongGuesses.length, 1);
  assert.equal(state.wrongGuesses.length, 0);
  const won = move(tried, guest, "guess", { answer: ` The ${answer(state).toUpperCase()}! ` });
  assert.equal(won.streak, 1);
  assert.throws(() => move(won, guest, "next"), /Only the host/);
  assert.throws(() => move(won, guest, "guess", { answer: answer(state) }), /no longer/);
  const next = move(won, host, "next");
  assert.throws(() => game.act(next, guest, { id: `guess:${state.roundId}`, values: { answer: answer(state) } }), /from this puzzle/);
});

test("Secret Thread reveals after deadline or three strikes and clears a streak", () => {
  const host = context();
  const guest = context(1);
  let state = game.create(host);
  state = move(state, guest, "guess", { answer: answer(state) });
  state = move(state, host, "next");
  assert.equal(state.streak, 1);
  const atDeadline = context(1, state.deadline);
  assert.equal(game.view(state, atDeadline).controls[0].label, "Reveal the connection");
  assert.throws(() => move(state, atDeadline, "guess", { answer: answer(state) }), /Time is up/);
  state = move(state, atDeadline, "reveal");
  assert.equal(game.view(state, atDeadline).heading, "Time ran out");
  assert.equal(state.streak, 0);
  assert.equal(state.bestStreak, 1);
  state = move(state, context(0, state.deadline), "next");
  for (const guess of ["Banana", "Clock", "Desk"]) state = move(state, atDeadline, "guess", { answer: guess });
  assert.equal(game.view(state, atDeadline).heading, "Out of strikes");
  assert.equal(game.view(state, atDeadline).cards[0].title, answer(state));
  assert.equal(game.view(state, atDeadline).privateCards, undefined);
});

test("Secret Thread plays a five-puzzle cooperative session and reports the goal", () => {
  const host = context();
  const guest = context(2);
  let state = game.create(host);
  for (let round = 0; round < 5; round++) {
    assert.equal(game.view(state, guest).round, `Puzzle ${round + 1} / 5`);
    state = move(state, guest, "guess", { answer: answer(state) });
    assert.equal(game.view(state, guest).cards[0].body, state.puzzles[round].explanation);
    state = move(state, host, "next");
  }
  assert.equal(game.view(state, host).finished, true);
  assert.equal(game.view(state, guest).heading, "The team reached its streak goal");
  assert.equal(state.bestStreak, 5);
  assert.equal(state.solves, 5);
  assert.throws(() => move(state, host, "next"), /no longer/);
});


test("Secret Thread explains only the clues actually dealt after each reveal outcome", () => {
  const host = context();
  const guest = context(1);
  let state = game.create(host);

  for (const result of ["solved", "strikes", "expired"]) {
    const dealt = [0, 1, 2].map((seat) => game.view(state, context(seat)).privateCards[0].items);
    const prefix = (seat) => `${players[seat].name}’s clues`;
    const puzzle = state.puzzles[state.round];
    const clueCards = (view) => view.cards.filter(({ title }) => title.endsWith("’s clues"));

    assert.deepEqual(clueCards(game.view(state, guest)), []);
    if (result === "solved") {
      state = move(state, guest, "guess", { answer: puzzle.answer });
    } else if (result === "strikes") {
      for (const guess of ["Banana", "Clock", "Desk"]) state = move(state, guest, "guess", { answer: guess });
    } else {
      const atDeadline = context(1, state.deadline);
      assert.deepEqual(clueCards(game.view(state, atDeadline)), []);
      state = move(state, atDeadline, "reveal");
    }

    const reloaded = JSON.parse(JSON.stringify(state));
    const reveal = game.view(reloaded, guest);
    assert.deepEqual(reveal.cards, game.view(reloaded, host).cards);
    assert.equal(reveal.privateCards, undefined);
    const shown = clueCards(reveal);
    assert.deepEqual(shown.map(({ title }) => title), dealt.map((_, seat) => prefix(seat)));
    for (const [seat, clues] of dealt.entries()) {
      const { items } = shown[seat];
      assert.equal(items.length, clues.length);
      for (const [index, fragment] of clues.entries()) {
        const clueAndConnection = items[index];
        assert.ok(clueAndConnection.startsWith(`${fragment} — `));
        assert.ok(clueAndConnection.slice(fragment.length + 3).trim());
      }
    }
    for (const fragment of puzzle.pairs.flat()) {
      if (!dealt.flat().includes(fragment)) assert.ok(!JSON.stringify(reveal).includes(fragment));
    }

    state = move(state, host, "next");
    assert.deepEqual(clueCards(game.view(state, guest)), []);
  }
});

test("Secret Thread can explain serialized clues from an existing room", () => {
  const host = context();
  const state = game.create(host);
  state.puzzles[0] = {
    answer: "Bridge",
    explanation: "A bridge can span water, link song sections, support the strings on a violin, or replace missing teeth.",
    pairs: [
      ["A detour ends when a river crossing reopens.", "A song changes direction before returning to its chorus."],
      ["On a violin, four strings rest on a little wooden arch.", "A dentist joins an artificial tooth to its neighbors."],
      ["The captain steers from an elevated room.", "A card partnership bids for a contract."],
    ],
  };
  const reloaded = JSON.parse(JSON.stringify(state));
  const reveal = game.view(move(reloaded, host, "guess", { answer: "Bridge" }), host);
  assert.deepEqual(reveal.cards[2], {
    title: "Player 2’s clues",
    items: [
      "On a violin, four strings rest on a little wooden arch. — A violin bridge holds the strings above the instrument’s body.",
      "A dentist joins an artificial tooth to its neighbors. — A dental bridge holds a replacement tooth between neighboring teeth.",
    ],
  });
});
