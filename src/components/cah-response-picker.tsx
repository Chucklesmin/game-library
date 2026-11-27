"use client";

import { useState } from "react";

type Card = { id: string; text: string };

export function CahResponsePicker({ cards, prompt, label, disabled = false, onConfirm }: {
  cards: readonly Card[];
  prompt: string;
  label: string;
  disabled?: boolean;
  onConfirm: (cardId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const blank = /_{2,}/.exec(prompt);
  return <div className="cah-hand" role="group" aria-label={label}>
    {cards.map((card) => {
      const selected = card.id === selectedId;
      return <div className="cah-hand-option" key={card.id}>
        <button type="button" className="caption-answer" disabled={disabled} aria-pressed={selected}
          onClick={() => setSelectedId(selected ? null : card.id)}>{card.text}</button>
        {selected && <div className="cah-card-preview">
          <p role="status">
            <span>Preview</span>
            {blank && prompt.slice(0, blank.index)}<strong>{card.text}</strong>
            {blank && prompt.slice(blank.index + blank[0].length)}
          </p>
          <button className="caption-primary" type="button" disabled={disabled}
            onClick={() => onConfirm(card.id)}>Lock in card</button>
        </div>}
      </div>;
    })}
  </div>;
}
