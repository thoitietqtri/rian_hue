
import React, { useMemo, useState } from "react";

/**
 * StationChart – SVG line chart không phụ thuộc thư viện.
 * Props:
 *  - tableRows: [{ time: 'YYYY-MM-DD HH:mm:ss', [stationName]: number|string, ... }]
 *  - defaultStation: string | undefined
 */
export default function StationChart({ tableRows, defaultStation }) {
  // Lấy danh sách trạm từ header của tableRows
  const stationNames = useMemo(() => {
    if (!Array.isArray(tableRows) || tableRows.length === 0) return [];
    return Object.keys(tableRows[0]).filter((k) => k !== "time");
  }, [tableRows]);

  const [selected, setSelected] = useState(
    defaultStation && stationNames.includes(defaultStation)
      ? defaultStation
      : stationNames[0]
  );

  // Chuyển dữ liệu sang {t:number, y:number}
  const series = useMemo(() => {
    if (!selected) return [];
    return (tableRows || [])
      .map((r) => {
        const tStr = String(r.time || "").replace(" ", "T");
        const t = new Date(tStr).getTime();
        let yRaw = r[selected];
        if (typeof yRaw === "string") yRaw = yRaw.replace(",", ".");
        const y = Number(yRaw);
        return Number.isFinite(t) && Number.isFinite(y) ? { t, y } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.t - b.t);
  }, [tableRows, selected]);

  // Tạo path, trục, lưới
  const svg = useMemo(() => {
    const W = 900, H = 320;
    const m = { l: 50, r: 16, t: 16, b: 30 };

    if (!series.length) {
      return { W, H, content: (
        <>
          <text x={W/2} y={H/2} textAnchor="middle" fill="#64748b" fontSize="12">
            Chưa có dữ liệu để vẽ đồ thị.
          </text>
        </>
      ) };
    }

    const minX = series[0].t, maxX = series[series.length - 1].t;
    let minY = Math.min(...series.map(p => p.y));
    let maxY = Math.max(...series.map(p => p.y));
    if (minY === maxY) { maxY = minY + 1; }

    const sx = (x) => m.l + (x - minX) / (maxX - minX || 1) * (W - m.l - m.r);
    const sy = (y) => H - m.b - (y - minY) / (maxY - minY || 1) * (H - m.t - m.b);

    // grid
    const yTicks = 5;
    const xTicks = Math.min(6, series.length);
    const yStep = (maxY - minY) / yTicks;
    const xStep = (maxX - minX) / xTicks;

    const grid = [];
    for (let i = 0; i <= yTicks; i++) {
      const y = sy(minY + i * yStep);
      grid.push(<line key={"gy"+i} x1={m.l} y1={y} x2={W - m.r} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />);
    }
    for (let i = 0; i <= xTicks; i++) {
      const x = sx(minX + i * xStep);
      grid.push(<line key={"gx"+i} x1={x} y1={m.t} x2={x} y2={H - m.b} stroke="#e2e8f0" strokeDasharray="3 3" />);
    }

    // path
    let d = `M ${sx(series[0].t)} ${sy(series[0].y)}`;
    for (let i = 1; i < series.length; i++) {
      d += ` L ${sx(series[i].t)} ${sy(series[i].y)}`;
    }

    // ticks text
    const xt = [];
    for (let i = 0; i <= xTicks; i++) {
      const xv = minX + i * xStep;
      const dt = new Date(xv);
      const lab = String(dt.getHours()).padStart(2,"0") + ":" + String(dt.getMinutes()).padStart(2,"0");
      xt.push(<text key={"tx"+i} x={sx(xv)} y={H-8} textAnchor="middle" fontSize="11" fill="#334155">{lab}</text>);
    }
    const yt = [];
    for (let i = 0; i <= yTicks; i++) {
      const yv = minY + i * yStep;
      yt.push(<text key={"ty"+i} x={m.l-6} y={sy(yv)+4} textAnchor="end" fontSize="11" fill="#334155">{yv.toFixed(2)}</text>);
    }

    return {
      W, H,
      content: (
        <>
          {grid}
          <path d={d} fill="none" stroke="#0ea5e9" strokeWidth="2" />
          {xt}
          {yt}
        </>
      )
    };
  }, [series]);

  if (stationNames.length === 0) return null;

  return (
    <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 14, color: "#334155", marginRight: 6 }}>Chọn trạm:</div>
        {stationNames.map((n) => (
          <button
            key={n}
            onClick={() => setSelected(n)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid " + (selected === n ? "#2563eb" : "#cbd5e1"),
              background: selected === n ? "#2563eb" : "#f8fafc",
              color: selected === n ? "#fff" : "#111827",
              cursor: "pointer",
              fontSize: 13
            }}
          >
            {n}
          </button>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${svg.W} ${svg.H}`}
        width="100%"
        height="320"
        role="img"
        aria-label={`Đồ thị mực nước - ${selected}`}
      >
        {svg.content}
      </svg>
    </div>
  );
}
