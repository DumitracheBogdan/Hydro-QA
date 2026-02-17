"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Shape = { type: "circle" | "rect" | "arrow" | "step"; x: number; y: number; w?: number; h?: number; text?: string; stepNumber?: number };

export function ImageAnnotator({ evidenceId }: { evidenceId: string }) {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [tool, setTool] = useState<Shape["type"]>("circle");
  const [stepCounter, setStepCounter] = useState(1);
  const ref = useRef<HTMLDivElement>(null);

  function place(e: React.MouseEvent) {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    if (tool === "step") {
      const text = prompt("Step label") || "";
      setShapes((s) => [...s, { type: tool, x, y, stepNumber: stepCounter, text }]);
      setStepCounter((n) => n + 1);
    } else {
      setShapes((s) => [...s, { type: tool, x, y, w: 60, h: 40 }]);
    }
  }

  async function save() {
    await fetch("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidenceId, shapes })
    });
    alert("Annotation saved");
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {(["circle", "rect", "arrow", "step"] as const).map((t) => (
          <Button key={t} variant={tool === t ? "default" : "outline"} size="sm" onClick={() => setTool(t)}>{t}</Button>
        ))}
        <Button size="sm" onClick={save}>Save annotation</Button>
      </div>
      <div ref={ref} onClick={place} className="relative h-64 rounded border bg-white">
        {shapes.map((s, idx) => (
          <div key={idx} className="absolute text-xs" style={{ left: s.x, top: s.y }}>
            {s.type === "step" ? `#${s.stepNumber} ${s.text ?? ""}` : s.type}
          </div>
        ))}
      </div>
    </div>
  );
}