"use client";

import Link from "next/link";
import { useState } from "react";
import { roadmapCatalog } from "@/lib/roadmap/catalog";
import styles from "./roadmap-room.module.css";

type Filter = "all" | "pairs" | "groups";
const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All games" },
  { id: "pairs", label: "Play with two" },
  { id: "groups", label: "Group games" },
];

export function RoadmapCatalog() {
  const [filter, setFilter] = useState<Filter>("all");
  if (process.env.NEXT_PUBLIC_ROADMAP_GAMES_ENABLED !== "true") return null;
  const games = roadmapCatalog.filter((game) => filter === "all" ||
    (filter === "pairs" ? game.minimumPlayers === 2 : game.maximumPlayers > 2));

  return <section aria-labelledby="more-games" className={styles.catalog}>
    <h2 id="more-games">More games</h2>
    <div aria-label="Filter games" className={styles.catalogFilters}>
      {filters.map(({ id, label }) => <button key={id} type="button" onClick={() => setFilter(id)}
        aria-pressed={filter === id}>{label}</button>)}
    </div>
    <div className="game-grid">
      {games.map((game) => <Link href={`/games/${game.slug}`} key={game.slug} className="game-card caption-card-link" data-game-cover={game.slug}>
        <span className="game-cover-mark" aria-hidden="true" />
        <div>
          <h3>{game.referenceName ?? game.title}</h3>
          {game.referenceName && <p className="game-meta">Game Library variant · {game.title}</p>}
          <p>{game.description}</p>
        </div>
        <span className="game-meta">{game.minimumPlayers === game.maximumPlayers ? game.minimumPlayers
          : `${game.minimumPlayers}–${game.maximumPlayers}`} players · Private online room</span>
      </Link>)}
    </div>
  </section>;
}
