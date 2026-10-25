import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cards Against Humanity | Signal Party",
  description: "A quick-fire party card game for Signal Party.",
};

export default function CardsAgainstHumanityLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
