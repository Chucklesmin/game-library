import assert from "node:assert/strict";
import test from "node:test";
import { game } from "../src/lib/roadmap/games/casefile.ts";

const players = [
  { id: "host", name: "Drew" },
  { id: "guest", name: "Nico" },
];
const components = ["suspect", "motive", "method"];

function requester(actorId = "host", now = 1000, members = players) {
  return { players: members, actorId, hostId: "host", now };
}

function move(state, values = {}, context = requester()) {
  const [control] = game.view(state, context).controls;
  return game.act(state, context, { id: control.id, values });
}

function caseAt(index) {
  const state = game.create(requester());
  return { ...state, order: [index, ...[0, 1, 2, 3, 4, 5].filter((item) => item !== index).slice(0, 2)] };
}

function choices(state) {
  const [control] = game.view(state, requester()).controls;
  return control.fields.reduce((plans, field) => plans.flatMap((plan) =>
    field.options.map(({ value }) => ({ ...plan, [field.name]: value }))), [{}]);
}

function solve(state, context = requester()) {
  const answer = choices(state).find((candidate) => move(state, candidate, context).outcome === "solved");
  assert.ok(answer);
  return answer;
}

test("Casefile starts with exactly two distinct players and requires a host", () => {
  assert.throws(() => game.create(requester("host", 1000, [])), /exactly two/);
  assert.throws(() => game.create(requester("host", 1000, [players[0]])), /exactly two/);
  assert.throws(() => game.create(requester("host", 1000, [players[0], players[0]])), /exactly two/);
  assert.throws(() => game.create(requester("host", 1000, [...players, { id: "extra", name: "Jo" }])), /exactly two/);
  assert.throws(() => game.create(requester("guest")), /host/);
  const state = game.create(requester());
  assert.equal(new Set(state.order).size, 3);
  assert.equal(game.view(state, requester()).round, "Case 1 of 3");
  assert.equal(game.view(state, requester()).deadline, 121_000);
});

test("All six original cases expose complete complementary packets and one valid solution each", () => {
  const uniqueTitles = new Set();
  for (let index = 0; index < 6; index += 1) {
    const state = caseAt(index);
    const hostView = game.view(state, requester());
    const guestView = game.view(state, requester("guest"));
    uniqueTitles.add(hostView.heading);
    assert.deepEqual(hostView.cards, guestView.cards);
    assert.deepEqual(hostView.privateCards.map(({ title }) => title), ["Witness note", "Timeline note", "Object note"]);
    assert.equal(new Set([hostView, guestView].flatMap((view) => view.privateCards.map(({ body }) => body))).size, 6);
    const possibilities = choices(state);
    assert.equal(possibilities.length, 27);
    const solutions = possibilities.filter((candidate) => move(state, candidate).outcome === "solved");
    assert.equal(solutions.length, 1);
    const revealed = game.view(move(state, solutions[0]), requester());
    assert.equal(revealed.cards[0].items.length, 3);
    for (const [candidate, component] of components.entries()) {
      const field = hostView.controls[0].fields[candidate];
      const answer = field.options.find(({ value }) => value === solutions[0][component]).label;
      assert.equal(revealed.cards[0].items[candidate], `${field.label} · ${answer}`);
      assert.ok(!hostView.cards.some(({ body }) => body === revealed.cards[0].body));
    }
  }
  assert.equal(uniqueTitles.size, 6);
});

test("Requester-only evidence survives reload and answer/other-player projections remain protected", () => {
  const state = caseAt(0);
  const hostView = game.view(state, requester());
  const guestView = game.view(state, requester("guest"));
  const rejoined = game.view(JSON.parse(JSON.stringify(state)), requester("guest"));
  assert.deepEqual(rejoined, guestView);
  for (const clue of guestView.privateCards) assert.ok(!JSON.stringify(hostView).includes(clue.body));
  for (const clue of hostView.privateCards) assert.ok(!JSON.stringify(guestView).includes(clue.body));
  assert.deepEqual(hostView.controls, guestView.controls);
  assert.equal(hostView.cards[0].title, "Case briefing");
  const nextCaseAtSameScene = { ...state, index: 1, order: [1, 0, 2] };
  assert.deepEqual(game.view(nextCaseAtSameScene, requester()).privateCards, guestView.privateCards);
  assert.throws(() => game.view(state, requester("outsider")), /assigned investigators/);
  assert.throws(() => game.act(state, requester("outsider"), { id: hostView.controls[0].id, values: {} }),
    /assigned investigators/);
});

test("A valid hypothesis burns one lead per wrong component and prevents stale or repeated losses", () => {
  const state = caseAt(0);
  const answer = solve(state);
  const bad = { ...answer, suspect: String((Number(answer.suspect) + 1) % 3), motive: String((Number(answer.motive) + 1) % 3) };
  const [control] = game.view(state, requester()).controls;
  assert.throws(() => move(state, { ...answer, suspect: "" }), /Select a suspect/);
  assert.throws(() => move(state, { ...answer, suspect: "99" }), /Select a suspect/);
  assert.throws(() => move(state, { ...answer, suspect: "-1" }), /Select a suspect/);
  assert.throws(() => move(state, { ...answer, suspect: "0.0" }), /Select a suspect/);
  const after = move(state, bad, requester("guest"));
  assert.equal(state.leads, 4);
  assert.deepEqual(state.guesses, []);
  assert.equal(after.leads, 2);
  const investigation = game.view(after, requester());
  assert.match(investigation.detail, /2 incorrect answers.*2 shared leads remain/);
  const history = investigation.cards.find(({ title }) => title === "Submitted hypotheses");
  const selectedLabels = control.fields.map((field) =>
    `${field.label}: ${field.options.find(({ value }) => value === bad[field.name]).label}`);
  assert.deepEqual(history.items, [`Attempt 1 · ${selectedLabels.join(" · ")}`]);
  assert.deepEqual(game.view(JSON.parse(JSON.stringify(after)), requester("guest")).cards, investigation.cards);
  assert.equal(game.view(state, requester()).cards.some(({ title }) => title === "Submitted hypotheses"), false);
  assert.throws(() => game.act(after, requester(), { id: control.id, values: answer }), /current case and attempt/);
  assert.throws(() => move(after, bad), /already tried that combination/);
  const solvedWithTwoLeads = move(after, answer, requester("guest", state.deadline - 5_000));
  assert.equal(solvedWithTwoLeads.totalScore, 21);
  const exhausted = move(after, { ...bad, method: String((Number(answer.method) + 1) % 3) });
  assert.equal(exhausted.leads, 0);
  assert.equal(exhausted.outcome, "spent");
  assert.equal(exhausted.totalScore, 0);
  const closed = game.view(exhausted, requester("guest"));
  assert.match(closed.detail, /ran out of leads/);
  assert.equal(closed.cards.find(({ title }) => title === "Submitted hypotheses").items.length, 2);
});

test("Deadline changes available controls and closes the case without scoring", () => {
  const state = caseAt(0);
  const answer = solve(state);
  const [submit] = game.view(state, requester()).controls;
  const timed = requester("guest", state.deadline);
  assert.equal(game.view(state, timed).controls[0].label, "Reveal solution");
  assert.throws(() => game.act(state, timed, { id: submit.id, values: answer }), /Time is up/);
  const expired = move(state, {}, timed);
  assert.equal(expired.outcome, "expired");
  assert.equal(expired.totalScore, 0);
  assert.match(game.view(expired, timed).detail, /Time ran out/);
  assert.equal(game.view(expired, timed).privateCards, undefined);
});

test("Two investigators complete a session with timed scoring and a reset lead count per case", () => {
  let state = game.create(requester());
  const seen = new Set();
  let total = 0;
  let now = 10_000;
  for (let index = 0; index < 3; index += 1) {
    const viewBefore = game.view(state, requester("guest", now));
    assert.ok(!seen.has(viewBefore.heading));
    seen.add(viewBefore.heading);
    assert.equal(state.leads, 4);
    const answer = solve(state, requester("guest", now));
    const firstHypothesis = viewBefore.controls[0].id;
    state = move(state, answer, requester("guest", now));
    total += 40 + Math.floor((viewBefore.deadline - now) / 5000);
    assert.equal(state.totalScore, total);
    assert.throws(() => game.act(state, requester(), { id: firstHypothesis, values: answer }), /unavailable/);
    if (index < 2) {
      state = move(state, {}, requester("guest", now + 1000));
      now += 10_000;
    }
  }
  const ending = game.view(state, requester("host", now));
  assert.equal(ending.heading, "Casefile closed");
  assert.equal(ending.finished, true);
  assert.equal(ending.standings.find(({ label }) => label === "Cases solved").score, 3);
  assert.equal(ending.standings.find(({ label }) => label === "Team score").score, total);
  assert.deepEqual(ending.controls, []);
});
