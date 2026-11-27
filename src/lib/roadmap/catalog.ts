// Public catalog metadata. Game rules and prompt packs stay on the server.
import type { GameInfo } from "./contract";

type CatalogGame = Omit<GameInfo, "instructions"> & { referenceName?: string };

export const roadmapCatalog: CatalogGame[] = [
  { slug: "caption-clash", referenceName: "Quiplash", title: "Caption Clash", description: "Write a punchline, then vote for the answer that gets the biggest laugh.", minimumPlayers: 3, maximumPlayers: 10 },
  { slug: "crowd-call", title: "Crowd Call", description: "Read the room first. Then cast your own vote and see how close you called it.", minimumPlayers: 3, maximumPlayers: 12 },
  { slug: "sketch-relay", referenceName: "skribbl.io", title: "Sketch Relay", description: "Draw the secret scene in 55 seconds while everyone else races to guess it.", minimumPlayers: 3, maximumPlayers: 8 },
  { slug: "imposter", referenceName: "The Chameleon", title: "Imposter", description: "Give one clue, compare stories, and catch the player missing the secret word.", minimumPlayers: 4, maximumPlayers: 10 },
  { slug: "alibi", referenceName: "Mafia", title: "Alibi", description: "Compare suspicious alibis and find the player working from the wrong briefing.", minimumPlayers: 4, maximumPlayers: 10 },
  { slug: "secret-thread", title: "Secret Thread", description: "Trade private clues and find the word that connects them.", minimumPlayers: 3, maximumPlayers: 8 },
  { slug: "pitch-panic", title: "Pitch Panic", description: "Build an absurd product with your team, pitch it to the room, and vote on everyone else’s ideas.", minimumPlayers: 4, maximumPlayers: 12 },
  { slug: "fact-or-fiction", title: "Fact or Fiction", description: "Decide what’s true, then bet how sure you are before the room reveals the answer.", minimumPlayers: 2, maximumPlayers: 10 },
  { slug: "cipher-pair", referenceName: "Keep Talking and Nobody Explodes", title: "Cipher Pair", description: "Combine two private keys to decode a phrase before time runs out.", minimumPlayers: 2, maximumPlayers: 2 },
  { slug: "switchboard", referenceName: "Keep Talking and Nobody Explodes", title: "Switchboard", description: "Talk your partner through two hidden circuit routes, then swap controls.", minimumPlayers: 2, maximumPlayers: 2 },
  { slug: "double-bluff", title: "Double Bluff", description: "Inspect one parcel, play a claim card, and decide when your opponent is bluffing.", minimumPlayers: 2, maximumPlayers: 2 },
  { slug: "casefile", title: "Casefile", description: "Compare private clues with a partner to solve three mysteries before your leads run out.", minimumPlayers: 2, maximumPlayers: 2 },
  { slug: "counterpoint", title: "Counterpoint", description: "Make a case, answer your opponent, and predict which judging lens they used.", minimumPlayers: 2, maximumPlayers: 2 },
  { slug: "sync-or-swim", title: "Sync or Swim", description: "Lock your choices in silence and see how long you can stay in sync.", minimumPlayers: 2, maximumPlayers: 2 },
];
