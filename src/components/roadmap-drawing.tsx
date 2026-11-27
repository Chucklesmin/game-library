"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Stroke } from "@/lib/roadmap/contract";
import styles from "./roadmap-room.module.css";

const palette = [
  ["#211721", "Ink"], ["#be3b44", "Red"], ["#2160b3", "Blue"],
  ["#237b58", "Green"], ["#b66c15", "Ochre"],
];
const clamp = (position: number) => Math.max(0, Math.min(1, position));
type Point = Stroke["points"][number];

export function RoadmapDrawing({ drawing, send, pending }: {
  drawing: { strokes: Stroke[]; strokeAction?: string };
  send: (id: string, data: string) => Promise<boolean>;
  pending: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const draft = useRef<Stroke | null>(null);
  const pointer = useRef<number | null>(null);
  const keyboardPoint = useRef<Point>([.5, .5]);
  const [color, setColor] = useState(palette[0][0]);
  const [width, setWidth] = useState(4);

  function paint() {
    const target = canvas.current;
    const context = target?.getContext("2d");
    if (!target || !context) return;
    context.clearRect(0, 0, target.width, target.height);
    context.lineCap = context.lineJoin = "round";
    for (const stroke of draft.current ? [...drawing.strokes, draft.current] : drawing.strokes) {
      const first = stroke.points[0];
      if (!first) continue;
      context.strokeStyle = context.fillStyle = stroke.color;
      context.lineWidth = stroke.width;
      context.beginPath();
      if (stroke.points.length === 1) {
        context.arc(first[0] * target.width, first[1] * target.height, stroke.width / 2, 0, 2 * Math.PI);
        context.fill();
      } else {
        context.moveTo(first[0] * target.width, first[1] * target.height);
        for (const [x, y] of stroke.points.slice(1)) context.lineTo(x * target.width, y * target.height);
        context.stroke();
      }
    }
  }

  useEffect(() => { paint(); });

  function point(event: PointerEvent<HTMLCanvasElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return [clamp((event.clientX - bounds.left) / bounds.width), clamp((event.clientY - bounds.top) / bounds.height)];
  }

  function append(next: Point) {
    const stroke = draft.current;
    const last = stroke?.points.at(-1);
    if (!stroke || !last) return;
    if (Math.hypot(last[0] - next[0], last[1] - next[1]) >= .003 && stroke.points.length < 150) {
      stroke.points.push(next);
      paint();
    }
  }

  async function commit() {
    const stroke = draft.current;
    if (!stroke || !drawing.strokeAction) return;
    await send(drawing.strokeAction, JSON.stringify(stroke));
    draft.current = null;
    paint();
  }

  function keyboard(event: KeyboardEvent<HTMLCanvasElement>) {
    if (!drawing.strokeAction || pending || pointer.current !== null) return;
    const offsets: Record<string, Point> = { ArrowLeft: [-.025, 0], ArrowRight: [.025, 0], ArrowUp: [0, -.025], ArrowDown: [0, .025] };
    const offset = offsets[event.key];
    if (event.key === " " && !draft.current && drawing.strokes.length < 50) {
      event.preventDefault();
      draft.current = { color, width, points: [keyboardPoint.current] };
      paint();
    } else if (offset) {
      event.preventDefault();
      const current = keyboardPoint.current;
      keyboardPoint.current = [clamp(current[0] + offset[0]), clamp(current[1] + offset[1])];
      append(keyboardPoint.current);
    } else if (event.key === "Enter" && draft.current) {
      event.preventDefault();
      void commit();
    } else if (event.key === "Escape" && draft.current) {
      draft.current = null;
      paint();
    }
  }

  const editable = Boolean(drawing.strokeAction);
  return <div>
    {editable && <div className={styles.drawingTools}>
      <label>Ink<select value={color} onChange={(event) => setColor(event.target.value)}>
        {palette.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select></label>
      <label>Line width<select value={width} onChange={(event) => setWidth(Number(event.target.value))}>
        <option value={2}>Thin</option><option value={4}>Medium</option><option value={7}>Wide</option>
      </select></label>
      <span>{drawing.strokes.length} of 50 strokes</span>
    </div>}
    <canvas ref={canvas} width={640} height={460}
      className={`${styles.drawing} ${editable ? styles.drawingInteractive : ""}`}
      role={editable ? undefined : "img"} tabIndex={editable ? 0 : undefined}
      aria-label={editable ? "Drawing board. Space starts a line, arrow keys draw, Enter sends, Escape cancels." : "The artist’s drawing"}
      onKeyDown={keyboard}
      onPointerDown={(event) => {
        if (!editable || pending || draft.current || drawing.strokes.length >= 50 || event.button !== 0) return;
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        draft.current = { color, width, points: [point(event)] };
        paint();
      }}
      onPointerMove={(event) => { if (pointer.current === event.pointerId) append(point(event)); }}
      onPointerUp={(event) => {
        if (pointer.current !== event.pointerId) return;
        append(point(event));
        pointer.current = null;
        void commit();
      }}
      onPointerCancel={(event) => {
        if (pointer.current !== event.pointerId) return;
        pointer.current = null;
        draft.current = null;
        paint();
      }}
    >Drawing board</canvas>
    {editable && <small>Draw with touch or a mouse. With a keyboard, focus the board, press Space, draw with arrows, and press Enter.</small>}
  </div>;
}
