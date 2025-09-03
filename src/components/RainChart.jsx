import React, { useMemo } from "react";

export default function RainChart({ stations, seriesByStation }) {
  const data = useMemo(() => {
    return stations.map(s => {
      const total = (seriesByStation[s.id] || []).reduce((a,b)=>a+(Number(b.mm)||0),0);
      return { name: s.name, total: Number(total.toFixed(1)) };
    });
  }, [stations, seriesByStation]);

  // simple bar chart (SVG) to avoid extra deps
  const width = 360;
  const height = 300;
  const padding = { left: 40, bottom: 90, top: 20, right: 10 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const maxVal = Math.max(1, ...data.map(d => d.total));
  const barW = innerW / (data.length || 1) * 0.7;
  const gap = innerW / (data.length || 1) * 0.3;

  return (
    <div style={{width: "100%", height}}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%">
        {/* axes */}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height-padding.bottom} stroke="#cbd5e1" />
        <line x1={padding.left} y1={height-padding.bottom} x2={width-padding.right} y2={height-padding.bottom} stroke="#cbd5e1" />
        {/* bars */}
        {data.map((d, i) => {
          const x = padding.left + i * (barW + gap) + gap*0.5;
          const h = innerH * (d.total / maxVal);
          const y = height - padding.bottom - h;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={h} fill="#111827" />
              <text x={x + barW/2} y={y - 6} textAnchor="middle" fontSize="11">{d.total}</text>
              <text x={x + barW/2} y={height-padding.bottom + 72} textAnchor="end" transform={`rotate(-45, ${x + barW/2}, ${height-padding.bottom + 72})`} fontSize="11">
                {d.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
