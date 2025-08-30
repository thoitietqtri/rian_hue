// src/components/StationChart.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/** Parse nhiều định dạng thời gian thường gặp */
function parseTime(input) {
  if (input == null) return NaN;
  const s = String(input).trim();
  if (!s) return NaN;

  // 1) 2025-08-29 07:00[:ss]
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    return new Date(s.replace(" ", "T")).getTime();
  }
  // 2) 29/08/2025 07:00[:ss]
  let m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (m) {
    const [, dd, mm, yy, HH, MM, SS = "00"] = m;
    return new Date(
      `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${HH}:${MM}:${SS}`
    ).getTime();
  }
  // 3) 29-08-2025 07:00[:ss]
  m = s.match(
    /^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (m) {
    const [, dd, mm, yy, HH, MM, SS = "00"] = m;
    return new Date(
      `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${HH}:${MM}:${SS}`
    ).getTime();
  }
  // 4) ISO / mặc định JS hiểu được
  const t = Date.parse(s);
  return Number.isNaN(t) ? NaN : t;
}

const norm = (s) =>
  (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

<StationChart
  tableRows={tableRows}

function toNumber(v) {
  if (v == null) return NaN;
  const s = String(v).trim().replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * props:
 *  - tableRows: Array<Object>  // chính mảng đang dùng để render bảng
 *  - preferTimeKeys?: string[] // (tuỳ chọn) nếu anh muốn chỉ định key thời gian, ví dụ: ['ThoiGian','Thời gian','time']
 */
export default function StationChart({ tableRows, preferTimeKeys = [] }) {
  const rows = Array.isArray(tableRows) ? tableRows : [];

  // 1) Lấy toàn bộ key xuất hiện trong rows
  const allKeys = useMemo(() => {
    const set = new Set();
    for (const r of rows) Object.keys(r || {}).forEach((k) => set.add(k));
    return Array.from(set);
  }, [rows]);

  // 2) Xác định timeKey
  const timeKey = useMemo(() => {
    if (!rows.length) return null;

    // Ưu tiên các key gợi ý từ ngoài vào
    for (const k of preferTimeKeys) {
      if (allKeys.includes(k)) return k;
    }
    // Ưu tiên một vài tên thường gặp
    const common = [
      "ThoiGian",
      "ThờiGian",
      "Thời gian",
      "Thoi gian",
      "thoigian",
      "time",
      "Time",
      "timestamp",
      "ThoiGianUTC",
    ];
    for (const k of common) {
      if (allKeys.includes(k)) return k;
      // thử phiên bản không dấu/viết thường
      const found = allKeys.find((x) => norm(x) === norm(k));
      if (found) return found;
    }

    // Heuristic: chọn key có số lần parseTime thành công nhiều nhất
    let bestK = null;
    let bestHits = 0;
    for (const k of allKeys) {
      let hits = 0;
      for (let i = 0; i < Math.min(rows.length, 200); i++) {
        const t = parseTime(rows[i]?.[k]);
        if (!Number.isNaN(t)) hits++;
      }
      if (hits > bestHits) {
        bestHits = hits;
        bestK = k;
      }
    }
    // tối thiểu phải parse được >= 3 dòng mới coi là cột thời gian
    return bestHits >= Math.min(3, rows.length) ? bestK : null;
  }, [rows, allKeys, preferTimeKeys]);

  // 3) Chọn các cột trạm (numeric series)
  const stationSeries = useMemo(() => {
    if (!rows.length || !timeKey) return [];
    const keys = allKeys.filter((k) => k !== timeKey);

    // loại các cột meta/không phải trạm
    const candidateKeys = keys.filter(
      (k) => !IGNORE_HEADERS.has(norm(k))
    );

    // chọn cột có >= 2 giá trị số hợp lệ
    const series = [];
    for (const k of candidateKeys) {
      const pts = [];
      for (const r of rows) {
        const t = parseTime(r[timeKey]);
        const y = toNumber(r[k]);
        if (!Number.isNaN(t) && Number.isFinite(y)) {
          pts.push({ t, y });
        }
      }
      if (pts.length >= 2) {
        pts.sort((a, b) => a.t - b.t);
        // loại trùng thời điểm
        const uniq = [];
        for (const p of pts) {
          if (!uniq.length || uniq[uniq.length - 1].t !== p.t) uniq.push(p);
        }
        if (uniq.length >= 2) series.push({ name: k, data: uniq });
      }
    }
    // sắp xếp theo tên
    return series.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [rows, timeKey, allKeys]);

  const [selected, setSelected] = useState(
    stationSeries.length ? stationSeries[0].name : null
  );
  useEffect(() => {
    if (!selected && stationSeries.length) setSelected(stationSeries[0].name);
    if (selected && !stationSeries.find((s) => s.name === selected)) {
      setSelected(stationSeries[0]?.name ?? null);
    }
  }, [stationSeries, selected]);

  // ==== Render ====
  if (!rows.length) {
    return (
      <div style={card}>
        <div style={msg}>Chưa có dữ liệu bảng để vẽ.</div>
      </div>
    );
  }
  if (!timeKey) {
    return (
      <div style={card}>
        <div style={msg}>
          Không xác định được cột thời gian trong dữ liệu (timeKey).
        </div>
        <div style={hint}>
          Gợi ý: Đổi tên cột thời gian thành “Thời gian” hoặc “ThoiGian”.
        </div>
      </div>
    );
  }
  if (!stationSeries.length) {
    return (
      <div style={card}>
        <div style={msg}>
          Không tìm thấy cột số liệu trạm (ít nhất 2 điểm hợp lệ).
        </div>
      </div>
    );
  }

  return (
    <ChartBox
      series={stationSeries}
      selected={selected}
      onSelect={setSelected}
    />
  );
}

/* ================== ChartBox (SVG thuần) ================== */

function ChartBox({ series, selected, onSelect }) {
  const boxRef = useRef(null);
  const [w, setW] = useState(800);

  // Resize observer để responsive theo khung chứa
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width;
      if (width) setW(width);
    });
    ro.observe(el);
    setW(el.clientWidth || 800);
    return () => ro.disconnect();
  }, []);

  const sel = useMemo(
    () => series.find((s) => s.name === selected) || series[0],
    [series, selected]
  );

  const H = 330;
  const m = { l: 48, r: 16, t: 12, b: 26 };
  const W = Math.max(320, w);

  const data = sel.data;
  const minX = data[0].t;
  const maxX = data[data.length - 1].t;
  let minY = Math.min(...data.map((d) => d.y));
  let maxY = Math.max(...data.map((d) => d.y));
  if (minY === maxY) maxY = minY + 1e-6;

  const sx = (x) => m.l + ((x - minX) / (maxX - minX || 1)) * (W - m.l - m.r);
  const sy = (y) => H - m.b - ((y - minY) / (maxY - minY || 1)) * (H - m.t - m.b);

  const xTicks = Math.min(6, Math.max(1, data.length - 1));
  const yTicks = 5;
  const xStep = (maxX - minX) / xTicks;
  const yStep = (maxY - minY) / yTicks;

  let path = `M ${sx(data[0].t)} ${sy(data[0].y)}`;
  for (let i = 1; i < data.length; i++) path += ` L ${sx(data[i].t)} ${sy(data[i].y)}`;

  return (
    <div style={wrap} ref={boxRef}>
      <div style={toolbar}>
        {series.map((s) => (
          <button
            key={s.name}
            onClick={() => onSelect(s.name)}
            style={{
              ...btn,
              ...(s.name === (selected || sel.name) ? btnActive : null),
            }}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div style={msg}>
        Đồ thị quá trình mực nước – nguồn: dữ liệu đang hiển thị trong bảng.
      </div>

      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* Grid */}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const y = sy(minY + i * yStep);
          return <line key={`gy${i}`} x1={m.l} y1={y} x2={W - m.r} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />;
        })}
        {Array.from({ length: xTicks + 1 }).map((_, i) => {
          const x = sx(minX + i * xStep);
          return <line key={`gx${i}`} x1={x} y1={m.t} x2={x} y2={H - m.b} stroke="#e2e8f0" strokeDasharray="3 3" />;
        })}

        {/* Path */}
        <path d={path} fill="none" stroke="#0ea5e9" strokeWidth="2" />

        {/* Axes labels */}
        {Array.from({ length: xTicks + 1 }).map((_, i) => {
          const xV = minX + i * xStep;
          const dt = new Date(xV);
          const lab =
            String(dt.getHours()).padStart(2, "0") +
            ":" +
            String(dt.getMinutes()).padStart(2, "0");
          const x = sx(xV);
          return (
            <text key={`tx${i}`} x={x} y={H - 6} textAnchor="middle" fontSize="11" fill="#334155">
              {lab}
            </text>
          );
        })}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const yV = minY + i * yStep;
          const y = sy(yV);
          return (
            <text key={`ty${i}`} x={m.l - 6} y={y + 4} textAnchor="end" fontSize="11" fill="#334155">
              {yV.toFixed(2)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* ================== styles (inline, không phụ thuộc CSS ngoài) ================== */
const wrap = {
  marginTop: 12,
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 12,
  background: "#fff",
};
const toolbar = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 };
const btn = {
  padding: "6px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#f8fafc",
  fontSize: 13,
  cursor: "pointer",
};
const btnActive = { background: "#2563eb", color: "#fff", borderColor: "#2563eb" };
const msg = { fontSize: 12, color: "#64748b", marginBottom: 8 };
const card = { ...wrap };
const hint = { fontSize: 12, color: "#334155", marginTop: 6 };
