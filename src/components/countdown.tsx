"use client";

import { useEffect, useRef, useState } from "react";

function remaining(deadlineAt: string | null) {
  if (!deadlineAt) return 0;
  return Math.max(0, Date.parse(deadlineAt) - Date.now());
}

function format(milliseconds: number) {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function Countdown({ deadlineAt, onExpired }: { deadlineAt: string | null; onExpired: () => void }) {
  const [milliseconds, setMilliseconds] = useState(() => remaining(deadlineAt));
  const firedFor = useRef<string | null>(null);

  useEffect(() => {
    firedFor.current = null;
    if (!deadlineAt) return;
    const tick = () => {
      const next = remaining(deadlineAt);
      setMilliseconds(next);
      if (next === 0 && firedFor.current !== deadlineAt) {
        firedFor.current = deadlineAt;
        onExpired();
      }
    };
    const interval = window.setInterval(tick, 250);
    tick();
    return () => window.clearInterval(interval);
  }, [deadlineAt, onExpired]);

  if (!deadlineAt) return null;
  const urgent = milliseconds <= 10000;
  return <p className={`countdown${urgent ? " urgent" : ""}`} aria-live="polite" aria-label={`${format(milliseconds)} remaining`}>Time left <strong>{format(milliseconds)}</strong></p>;
}
