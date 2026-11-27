import { randomInt, randomUUID } from "node:crypto";
import type { DisplayCard, GameContext, GameControl, GameDefinition, GameView } from "../contract.ts";

const ROUNDS = 3;
const PLAN_TIME = 65_000;
const PITCH_TIME = 35_000;
const VOTE_TIME = 45_000;
const LIMIT = 180;
const PASS = "pass";

const studios = [
  { id: "spark", name: "Spark Studio" },
  { id: "loop", name: "Loop Labs" },
  { id: "bolt", name: "Bolt Works" },
] as const;

const badges = [
  { id: "useful", label: "Most Useful" },
  { id: "disaster", label: "Best Disaster" },
  { id: "buy", label: "Would Buy" },
] as const;

const audiences = [
  "Night-shift bakery crews", "Parents in the school pickup line", "Retired stage magicians",
  "People raising their first houseplant", "Volunteers at a rainy street fair",
  "A bowling league that takes warmups seriously", "Campers packing for their first outing",
  "Apartment neighbors sharing a laundry room", "The first visitors to a new library",
  "Museum guards on the closing shift", "A choir warming up in a stairwell", "Weekend ferry commuters",
];
const features = [
  "Folds into a square the size of a napkin", "Can be operated with one elbow",
  "Translates a gesture into three kinds of chime", "Stores exactly one object upside down",
  "Opens only when two people cooperate", "Tracks time with colored paper flags",
  "Turns into a soft seat when flipped", "Can be peeled into reusable layers",
  "Glows when someone nearby yawns", "Offers a weather forecast in rhyme",
  "Can be worn as a hat or set on a table", "Prints its instructions on a strip of cloth",
];
const flaws = [
  "It has to be fed a crouton every nine minutes", "On Tuesdays it switches left and right",
  "Its manual is hidden inside the object", "Each user has to nominate a successor",
  "It interprets applause as a factory reset", "Its handle won't work in direct sunlight",
  "It plays a farewell jingle before doing anything useful", "It only delivers to the third person in line",
  "It adds a one-minute drumroll to every task", "It borrows a pencil and never gives it back",
  "It gets wider each time you put it away", "It insists on a different name every morning",
];

type TeamId = typeof studios[number]["id"];
type BadgeId = typeof badges[number]["id"];
type Team = { id: TeamId; name: string; members: string[] };
type Pitch = { team: TeamId; draft: string; locked: boolean; presented: boolean };
type Ballot = Record<BadgeId, TeamId | typeof PASS>;
type BadgeResult = {
  leaders: TeamId[];
  support: { team: TeamId; count: number; eligible: number }[];
};
type State = {
  match: string;
  phase: "planning" | "presentation" | "voting" | "reveal" | "complete";
  teams: Team[];
  scores: Partial<Record<TeamId, number>>;
  constraints: string[][];
  round: number;
  turn: number;
  deadline: number | null;
  pitches: Pitch[];
  ballots: Record<string, Ballot>;
  results: Partial<Record<BadgeId, BadgeResult>>;
};

function shuffle<T>(items: readonly T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function newRound(state: State, round: number, now: number): State {
  return {
    ...state, round, turn: 0, phase: "planning", deadline: now + PLAN_TIME, ballots: {}, results: {},
    pitches: state.teams.map(({ id }) => ({ team: id, draft: "", locked: false, presented: false })),
  };
}

function teamOf(state: State, actorId: string) {
  const team = state.teams.find(({ members }) => members.includes(actorId));
  if (!team) throw new Error("Only room players can take part in Pitch Panic.");
  return team;
}

const displayName = (context: GameContext, id: string) => context.players.find((player) => player.id === id)?.name ?? "Presenter";
const presenter = (team: Team, round: number) => team.members[(round - 1) % team.members.length];
const currentTeam = (state: State) => state.teams[(state.round - 1 + state.turn) % state.teams.length];
const pickPitch = (state: State, id: TeamId) => state.pitches.find(({ team }) => team === id)!;
const pastDeadline = (state: State, now: number) => state.deadline !== null && now >= state.deadline;
const rivals = (state: State, own: TeamId) => state.teams.filter(({ id }) => id !== own && pickPitch(state, id).presented);

function controls(state: State, context: GameContext, team: Team): GameControl[] {
  const expired = pastDeadline(state, context.now);
  const host = context.actorId === context.hostId;
  const ownPitch = pickPitch(state, team.id);
  const make = (verb: string, label: string, fields?: GameControl["fields"]): GameControl => ({
    id: [verb, state.match, state.round, state.turn].join(":"), label,
    ...(fields ? { fields } : {}),
  });
  switch (state.phase) {
    case "planning": {
      if (expired) return [make("present", "Start presentations")];
      const available: GameControl[] = [];
      if (!ownPitch.locked) {
        available.push(make("draft", "Save team draft", [
          { name: "pitch", type: "textarea", label: "Team pitch", maxLength: LIMIT },
        ]));
        if (presenter(team, state.round) === context.actorId) {
          available.push(make("lock", ownPitch.draft ? "Lock team pitch" : "Ready to pitch aloud"));
        }
      }
      if (host && state.pitches.every(({ locked }) => locked)) available.push(make("present", "Start presentations"));
      return available;
    }
    case "presentation": {
      if (expired) return [make("timeout", "End presentation timer")];
      return presenter(currentTeam(state), state.round) === context.actorId
        ? [make("finish", "Finish presentation"), make("skip", "Skip this pitch")] : [];
    }
    case "voting": {
      if (expired) return [make("reveal", "Reveal badges")];
      const available: GameControl[] = [];
      const eligible = rivals(state, team.id);
      if (eligible.length && !Object.hasOwn(state.ballots, context.actorId)) {
        const options = [...eligible.map(({ id: value, name: label }) => ({ value, label })), { value: PASS, label: "Pass" }];
        available.push(make("vote", "Lock badge ballot", badges.map(({ id: name, label }) => ({ name, label, type: "select", options }))));
      }
      if (host && state.teams.every((entry) => !rivals(state, entry.id).length ||
        entry.members.every((id) => Object.hasOwn(state.ballots, id)))) available.push(make("reveal", "Reveal badges"));
      return available;
    }
    case "reveal":
      return host ? [make("next", state.round === ROUNDS ? "See final standings" : "Deal next constraints")] : [];
    case "complete":
      return [];
  }
}

function finishPitch(state: State, now: number, presented: boolean): State {
  const active = currentTeam(state);
  const pitches = state.pitches.map((pitch) => pitch.team === active.id ? { ...pitch, presented } : pitch);
  if (state.turn + 1 === state.teams.length) return { ...state, pitches, phase: "voting", deadline: now + VOTE_TIME };
  return { ...state, pitches, turn: state.turn + 1, deadline: now + PITCH_TIME };
}

function tally(state: State): State {
  const scores = { ...state.scores };
  const rosterSize = state.teams.reduce((sum, { members }) => sum + members.length, 0);
  const pitches = state.teams.filter(({ id }) => pickPitch(state, id).presented);
  const results: State["results"] = {};
  for (const { id } of badges) {
    const support = pitches.map((team) => ({
      team: team.id,
      eligible: rosterSize - team.members.length,
      count: Object.values(state.ballots).filter((ballot) => ballot[id] === team.id).length,
    }));
    const leaders = support.filter((candidate) => candidate.count > 0 &&
      support.every((other) => candidate.count * other.eligible >= other.count * candidate.eligible))
      .map(({ team }) => team);
    for (const team of leaders) scores[team] = (scores[team] ?? 0) + 1;
    results[id] = { support, leaders };
  }
  return { ...state, scores, results, phase: "reveal", deadline: null };
}

function pitchCard(state: State, team: Team): DisplayCard {
  const { draft } = pickPitch(state, team.id);
  const index = (state.round - 1) * state.teams.length + state.teams.indexOf(team);
  return { title: team.name, ...(draft ? { body: draft } : {}), items: state.constraints[index] };
}

export const game: GameDefinition<State> = {
  slug: "pitch-panic",
  title: "Pitch Panic",
  description: "Build an absurd product with your team, pitch it to the room, and vote on everyone else’s ideas.",
  minimumPlayers: 4,
  maximumPlayers: 12,
  instructions: [
    "Use a private team chat or huddle during planning. Turn your audience, feature and fatal flaw into one product idea.",
    "Save a shared team draft or prepare a spoken pitch. Your presenter can lock the draft or mark the team ready to speak.",
    "Your presenter has 35 seconds to speak or show the written pitch on the shared screen.",
    "Privately award three badges to other teams or pass. Each badge compares the share of eligible opposing players who backed a pitch.",
    "A badge win earns one point for each winning team, including ties. Play three rounds with rotating presenters.",
  ],
  create(context) {
    if (context.players.length < 4 || context.players.length > 12) throw new Error("Pitch Panic needs 4–12 players.");
    if (context.actorId !== context.hostId || !context.players.some(({ id }) => id === context.hostId)) {
      throw new Error("Only the host can start Pitch Panic.");
    }
    const count = context.players.length >= 6 ? 3 : 2;
    const teams = studios.slice(0, count).map((team, index) => ({
      ...team, members: context.players.filter((_, joinIndex) => joinIndex % count === index).map(({ id }) => id),
    }));
    const drawAudience = shuffle(audiences);
    const drawFeature = shuffle(features);
    const drawFlaw = shuffle(flaws);
    const constraints = Array.from({ length: count * ROUNDS }, (_, index) => [
      "Audience · " + drawAudience[index], "Feature · " + drawFeature[index], "Fatal flaw · " + drawFlaw[index],
    ]);
    return newRound({
      match: randomUUID(), teams, scores: {}, constraints,
      phase: "planning", round: 0, turn: 0, deadline: null, pitches: [], ballots: {}, results: {},
    }, 1, context.now);
  },
  act(state, context, action) {
    const team = teamOf(state, context.actorId);
    const selected = controls(state, context, team).find(({ id }) => id === action.id);
    if (!selected) throw new Error("That action is unavailable for your team or turn.");
    switch (selected.id.split(":", 1)[0]) {
      case "draft": {
        const draft = action.values.pitch?.trim() ?? "";
        if (!draft || draft.length > LIMIT) throw new Error("Write a pitch of 1–180 characters.");
        return { ...state, pitches: state.pitches.map((pitch) => pitch.team === team.id ? { ...pitch, draft } : pitch) };
      }
      case "lock":
        return { ...state, pitches: state.pitches.map((pitch) => pitch.team === team.id ? { ...pitch, locked: true } : pitch) };
      case "present":
        return { ...state, phase: "presentation", deadline: context.now + PITCH_TIME };
      case "finish":
        return finishPitch(state, context.now, true);
      case "skip":
        return finishPitch(state, context.now, false);
      case "timeout":
        return finishPitch(state, context.now, Boolean(pickPitch(state, currentTeam(state).id).draft));
      case "vote": {
        const eligible = new Set<string>([PASS, ...rivals(state, team.id).map(({ id }) => id)]);
        const ballot = Object.fromEntries(badges.map(({ id }) => [id, action.values[id]])) as Ballot;
        if (!Object.values(ballot).every((id) => eligible.has(id))) {
          throw new Error("Choose another team’s presented pitch or pass for each badge.");
        }
        return { ...state, ballots: { ...state.ballots, [context.actorId]: ballot } };
      }
      case "reveal":
        return tally(state);
      case "next":
        return state.round === ROUNDS ? { ...state, phase: "complete" } : newRound(state, state.round + 1, context.now);
      default:
        throw new Error("Unknown Pitch Panic action.");
    }
  },
  view(state, context) {
    const team = teamOf(state, context.actorId);
    const own = pickPitch(state, team.id);
    const standings = state.teams.map(({ id, name }) => ({ label: name, score: state.scores[id] ?? 0 }))
      .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
    const base: GameView = {
      phase: state.phase,
      heading: "Pitch Panic",
      round: "Round " + state.round + " of " + ROUNDS,
      ...(state.deadline === null ? {} : { deadline: state.deadline }),
      standings,
      controls: controls(state, context, team),
    };
    if (state.phase === "planning") {
      const card = pitchCard(state, team);
      return {
        ...base,
        heading: "Plan your product",
        detail: pastDeadline(state, context.now) ? "Planning time is up. Open the first presentation."
          : "Save a private team draft or take the constraints into a spoken pitch.",
        privateHeading: "Only your team can see this",
        privateCards: [{
          ...card,
          items: [
            ...card.items!,
            "Team · " + team.members.map((id) => displayName(context, id)).join(", "),
            "Presenter · " + displayName(context, presenter(team, state.round)),
            ...(own.locked ? [own.draft ? "Draft locked" : "Ready to pitch aloud"] : []),
          ],
        }],
      };
    }
    if (state.phase === "presentation") {
      const active = currentTeam(state);
      return {
        ...base,
        heading: active.name + " is pitching",
        detail: "Presentation " + (state.turn + 1) + " of " + state.teams.length + " · " +
          displayName(context, presenter(active, state.round)) + " has the floor.",
        cards: [pitchCard(state, active)],
      };
    }
    if (state.phase === "voting") {
      return {
        ...base,
        heading: "Award your badges",
        detail: Object.hasOwn(state.ballots, context.actorId) ? "Your badge ballot is locked."
          : rivals(state, team.id).length ? "Only the badge totals will be revealed." : "You have no rival pitches to rate this round.",
        cards: state.teams.filter(({ id }) => pickPitch(state, id).presented).map((entry) => pitchCard(state, entry)),
      };
    }
    if (state.phase === "reveal") {
      const teamName = (id: TeamId) => state.teams.find((entry) => entry.id === id)!.name;
      return {
        ...base,
        heading: "Badge results",
        detail: "Each badge counts the share of eligible opposing players. Tied leaders share the award.",
        cards: badges.map(({ id, label }) => {
          const result = state.results[id]!;
          return {
            title: label,
            body: result.leaders.length ? result.leaders.map(teamName).join(" and ") : "No award",
            items: result.support.map(({ team, count, eligible }) => teamName(team) + " · " + count + " of " + eligible),
          };
        }),
      };
    }
    const winners = standings.filter(({ score }) => score === standings[0].score).map(({ label }) => label);
    return { ...base, heading: "Pitch Panic complete", detail: winners.join(" and ") +
      (winners.length > 1 ? " share first place." : " wins."), finished: true };
  },
};
