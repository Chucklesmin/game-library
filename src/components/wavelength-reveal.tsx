export function WavelengthReveal({ target, guess }: { target: number | null; guess: number | null }) {
  return <dl className="wavelength-reveal" aria-label="Round measurements">
    {target !== null && <div><dt>Target</dt><dd>{target}</dd></div>}
    <div><dt>Locked guess</dt><dd>{guess ?? "None"}</dd></div>
    {guess !== null && target !== null && <div><dt>Distance</dt><dd>{Math.abs(target - guess)}</dd></div>}
  </dl>;
}
