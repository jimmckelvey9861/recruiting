import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type Zones = { lowRed: number; lowYellow: number; highYellow: number; highRed: number };

type Props = {
  zones: Zones;
  onChange: (z: Zones) => void;
  min?: number;
  max?: number;
};

// Clamp helper
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * A compact multi-handle slider that visualizes 5 zones on a 0..max scale:
 * [0..lowRed]=red | (lowRed..lowYellow)=yellow | (lowYellow..highYellow)=green | (highYellow..highRed)=yellow | (>highRed)=red
 * Users can drag 4 handles (lowRed, lowYellow, highYellow, highRed) or type numeric values.
 */
export default function ZonesController({ zones, onChange, min = 0, max = 200 }: Props) {
  const [local, setLocal] = useState<Zones>(zones);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragKey, setDragKey] = useState<keyof Zones | null>(null);

  useEffect(() => {
    setLocal(zones);
  }, [zones]);

  const ordered = useMemo(() => {
    // Ensure monotonic order locally
    const a = clamp(local.lowRed, min, max);
    const b = clamp(Math.max(local.lowYellow, a), min, max);
    const c = clamp(Math.max(local.highYellow, b), min, max);
    const d = clamp(Math.max(local.highRed, c), min, max);
    return { lowRed: a, lowYellow: b, highYellow: c, highRed: d };
  }, [local, min, max]);

  const pct = useCallback((val: number) => ((clamp(val, min, max) - min) / (max - min)) * 100, [min, max]);
  const fromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return min;
    const rect = el.getBoundingClientRect();
    const t = clamp((clientX - rect.left) / rect.width, 0, 1);
    const value = min + t * (max - min);
    // snap to 1-unit precision
    return Math.round(value);
  }, [min, max]);

  const startDrag = (key: keyof Zones) => (e: React.MouseEvent) => {
    e.preventDefault();
    setDragKey(key);
  };
  const onMove = useCallback((e: MouseEvent) => {
    if (!dragKey) return;
    const raw = fromClientX(e.clientX);
    let next = { ...ordered };
    if (dragKey === "lowRed") {
      next.lowRed = clamp(raw, min, next.lowYellow);
    } else if (dragKey === "lowYellow") {
      next.lowYellow = clamp(raw, next.lowRed, next.highYellow);
    } else if (dragKey === "highYellow") {
      next.highYellow = clamp(raw, next.lowYellow, next.highRed);
    } else if (dragKey === "highRed") {
      next.highRed = clamp(raw, next.highYellow, max);
    }
    setLocal(next);
  }, [dragKey, fromClientX, ordered, min, max]);

  const endDrag = useCallback(() => {
    if (dragKey) {
      setDragKey(null);
      onChange(ordered);
    }
  }, [dragKey, ordered, onChange]);

  useEffect(() => {
    const up = () => endDrag();
    const move = (e: MouseEvent) => onMove(e);
    window.addEventListener("mouseup", up);
    window.addEventListener("mousemove", move);
    return () => {
      window.removeEventListener("mouseup", up);
      window.removeEventListener("mousemove", move);
    };
  }, [onMove, endDrag]);

  const handleInput = (key: keyof Zones) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value || 0);
    setLocal(prev => ({ ...prev, [key]: v }));
  };
  const applyInputs = () => onChange(ordered);

  const SEG_COLORS = {
    red: "#dc2626",
    yellow: "#ca8a04",
    green: "#16a34a",
  };

  const s = ordered;
  const segments = [
    { from: min, to: s.lowRed, color: SEG_COLORS.red, label: "≤" + s.lowRed + "%" },
    { from: s.lowRed, to: s.lowYellow, color: SEG_COLORS.yellow, label: `${s.lowRed}-${s.lowYellow}%` },
    { from: s.lowYellow, to: s.highYellow, color: SEG_COLORS.green, label: `${s.lowYellow}-${s.highYellow}%` },
    { from: s.highYellow, to: s.highRed, color: SEG_COLORS.yellow, label: `${s.highYellow}-${s.highRed}%` },
    { from: s.highRed, to: max, color: SEG_COLORS.red, label: `≥${s.highRed}%` },
  ];

  return (
    <div className="space-y-3">
      {/* Visual slider */}
      <div className="w-full">
        <div
          ref={trackRef}
          className="relative h-8 rounded-full"
          style={{ background: "#e5e7eb" }}
        >
          {/* colored segments */}
          {segments.map((seg, idx) => {
            const left = pct(seg.from);
            const width = Math.max(0, pct(seg.to) - pct(seg.from));
            return (
              <div
                key={idx}
                className="absolute top-1/2 -translate-y-1/2 h-4 rounded-full"
                style={{ left: `${left}%`, width: `${width}%`, background: seg.color, opacity: 0.6 }}
                title={seg.label}
              />
            );
          })}
          {/* handles */}
          {(["lowRed","lowYellow","highYellow","highRed"] as (keyof Zones)[]).map((key) => (
            <div
              key={key}
              onMouseDown={startDrag(key)}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white shadow cursor-ew-resize"
              style={{
                left: `${pct(s[key])}%`,
                background: "#111827"
              }}
              title={`${key}: ${s[key]}%`}
            />
          ))}
          {/* scale ticks */}
          {[min, (min+max)/2, max].map((v,i)=>(
            <div key={i} className="absolute text-[10px] text-gray-500" style={{ left: `${pct(v)}%`, top: "100%", transform: "translate(-50%, 2px)"}}>
              {v}%
            </div>
          ))}
        </div>
      </div>

      {/* Numeric inputs */}
      <div className="grid grid-cols-4 gap-2">
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Red ≤</label>
          <input className="border rounded px-2 py-1 text-sm text-right" type="number" value={s.lowRed} onChange={handleInput("lowRed")} onBlur={applyInputs}/>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Yellow to</label>
          <input className="border rounded px-2 py-1 text-sm text-right" type="number" value={s.lowYellow} onChange={handleInput("lowYellow")} onBlur={applyInputs}/>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Green to</label>
          <input className="border rounded px-2 py-1 text-sm text-right" type="number" value={s.highYellow} onChange={handleInput("highYellow")} onBlur={applyInputs}/>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Yellow to</label>
          <input className="border rounded px-2 py-1 text-sm text-right" type="number" value={s.highRed} onChange={handleInput("highRed")} onBlur={applyInputs}/>
        </div>
      </div>
    </div>
  );
}


