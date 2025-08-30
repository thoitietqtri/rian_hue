import React, { useEffect, useMemo, useRef, useState } from "react";

/* ===== Helpers ===== */
function parseTimeMaybe(s) {
  if (s == null) return NaN;
  const t = String(s).trim();
  if (!t) return NaN;
  // YYYY-MM-DD HH:mm[:ss]
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(t))
    return new Date(t.replace(" ", "T")).getTime();
  // DD/MM/YYYY HH:mm[:ss]
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [, dd, mm, yy, HH, MM, SS = "00"] = m;
    return new Date(
      `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${HH}:${MM}:${SS}`
    ).getTime();
  }
  // DD-MM-YYYY HH:mm[:ss]
  m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [, dd, mm, yy, HH, MM, SS = "00"] = m;
    return new Date(
      `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${HH}:${MM}:${SS}`
    ).getTime();
  }
  const p = Date.parse(t);
  return Number.isNaN(p) ? NaN : p;
}
const toNumber = (v) => {
  if (v == null) return NaN;
  const n = parseFloat(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
const norm = (s) =>
  (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/* ===== Build series từ tableRows – có fallback ===== */
function buildSeriesFlexible(tableRows, preferTimeKeys = []) {
  if (!Array.isArray(tableRows) || tableRows.length === 0)
    return { series: [], xType: "empty", xValues: [], xLabels: [], timeKey: null };

  // 1) tìm timeKey
  const allKeys = Array.from(new Set(tableRows.flatMap((r) => Object.keys(r || {}))));
  let timeKey = preferTimeKeys.find((k) => allKeys.includes(k)) || null;
  if (!timeKey) {
    const common = ["Thời gian", "ThoiGian", "Thoi gian", "thoigian", "time", "TIME"];
    timeKey =
      common.find((k) => allKeys.includes(k)) ||
      allKeys.reduce(
        (best, k) => {
          let ok = 0;
          for (const r of tableRows.slice(0, 200)) if (!Number.isNaN(parseTimeMaybe(r?.[k]))) ok++;
          return ok > best.hits ? { k, hits: ok } : best;
        },
        { k: null, hits: 0 }
      ).k ||
      null;
  }

  // 2) Chuẩn bị trục X
  let xType = "time"; // "time" | "index"
  let xValues = [];   // dùng để tính tọa độ
  let xLabels = [];   // nhãn hiển thị (chuỗi thời gian)
  if (timeKey) {
    const parsed = tableRows.map((r) => parseTimeMaybe(r[timeKey]));
    const ok = parsed.filter((t) => !Number.isNaN(t)).length;
    if (ok >= 2) {
      xType = "time";
      xValues = parsed;                      // có thể chứa NaN, sẽ bỏ khi lấy y
      xLabels = tableRows.map((r) => String(r[timeKey] ?? ""));
    } else {
      xType = "index";
    }
  } else {
    xType = "index";
  }
  if (xType === "index") {
    xValues = tableRows.map((_, i) => i);
    // vẫn giữ nhãn thời gian nếu có cột nào trông giống thời gian
    const guessTime = allKeys.find((k) => /th(ời|oi)\s*gi(an|ờn)|time/i.test(k));
    xLabels = guessTime
      ? tableRows.map((r) => String(r[guessTime] ?? ""))
      : tableRows.map((_, i) => `#${i + 1}`);
  }

  // 3) Các cột trạm = mọi key khác timeKey, có ≥2 giá trị số
  const candKeys = allKeys.filter((k) => k !== timeKey);
  const series = [];
  for (const key of candKeys) {
    const pts = [];
    for (let i = 0; i < tableRows.length; i++) {
      const y = toNumber(tableRows[i][key]);
      const x = xValues[i];
      if (Number.isFinite(y) && !Number.isNaN(x)) pts.push({ x, y, i });
    }
    if (pts.length >= 2) {
      // đảm bảo theo thứ tự x tăng dần
      pts.sort((a, b) => a.x - b.x);
      series.push({ name: key, data: pts });
    }
  }
  return { series, xType, xValues, xLabels, timeKey };
}

/* ===== Chart (SVG) – hỗ trợ xType time/index ===== */
export default function StationChart({ tableRows = [], preferTimeKeys = [] }) {
  const { series, xType, xValues, xLabels } = useMemo(
    () => buildSeriesFlexible(tableRows, preferTimeKeys),
    [tableRows, preferTimeKeys]
  );

  const [selected, setSelected] = useState(null);
  useEffect(() => {
    if (!series.length) return;
    if (!selected || !series.find((s) => s.name === selected)) setSelected(series[0].name);
  }, [series, selected]);

  if (!series.length) {
    return (
      <div style={wrap}>
        <div style={msg}>Không tìm thấy dữ liệu số để vẽ đồ thị.</div>
        <div style={hint}>Yêu cầu tối thiểu: một cột thời gian (hoặc dùng chỉ số dòng) và ≥ 2 giá trị số ở 1 cột trạm.</div>
      </div>
    );
  }

  const sel = series.find((s) => s.name === selected) || series[0];
  return (
    <ChartBox
      series={series}
      selected={sel.name}
      onSelect={setSelected}
      xType={xType}
      xValues={xValues}
      xLabels={xLabels}
    />
  );
}

function ChartBox({ series, selected, onSelect, xType, xValues, xLabels }) {
  const boxRef = useRef(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const ro = new ResizeObserver(es => setW(es[0]?.contentRect?.width || el.clientWidth || 800));
    ro.observe(el); setW(el.clientWidth || 800);
    return () => ro.disconnect();
  }, []);

  const H = 330, m = { l: 48, r: 16, t: 12, b: 28 }, W = Math.max(320, w);
  const sel = useMemo(() => series.find(s => s.name === selected) || series[0], [series, selected]);
  const data = sel.data;

  // domain X
  const minX = Math.min(...data.map(d => d.x));
  const maxX = Math.max(...data.map(d => d.x));
  // domain Y
  let minY = Math.min(...data.map(d => d.y));
  let maxY = Math.max(...data.map(d => d.y));
  if (minY === maxY) maxY = minY + 1e-6;

  const sx = (x) => m.l + ((x - minX) / (maxX - minX || 1)) * (W - m.l - m.r);
  const sy = (y) => H - m.b - ((y - minY) / (maxY - minY || 1)) * (H - m.t - m.b);

  // ticks
  const yTicks = 5;
  const xTicks = Math.min(6, Math.max(1, data.length - 1));
  const yStep = (maxY - minY) / yTicks;
  const xStep = (maxX - minX) / xTicks;

  // path
  let path = `M ${sx(data[0].x)} ${sy(data[0].y)}`;
  for (let i = 1; i < data.length; i++) path += ` L ${sx(data[i].x)} ${sy(data[i].y)}`;

  // format nhãn trục X
  function labelAtX(xv) {
    if (xType === "time") {
      // tìm phần tử gần xV để lấy nhãn gốc
      let lo = 0, hi = xValues.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        xValues[mid] < xv ? (lo = mid) : (hi = mid);
      }
      const idx = Math.abs(xValues[lo] - xv) <= Math.abs(xValues[hi] - xv) ? lo : hi;
      const raw = xLabels[idx] || "";
      // rút gọn HH:mm nếu raw dạng "yyyy-mm-dd HH:mm:ss"
      const m = String(raw).match(/\b(\d{2}):(\d{2})/);
      return m ? `${m[1]}:${m[2]}` : String(raw);
    }
    // index mode: hiện nhãn thưa
    const i = Math.round(xv);
    return xLabels[i] || `#${i + 1}`;
  }

  return (
    <div style={wrap} ref={boxRef}>
      <div style={toolbar}>
        {series.map((s) => (
          <button
            key={s.name}
            onClick={() => onSelect(s.name)}
            style={{ ...btn, ...(s.name === sel.name ? btnActive : null) }}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div style={msg}>
        Đồ thị quá trình mực nước — đọc trực tiếp dữ liệu đang hiển thị.
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

        {/* Axes */}
        {Array.from({ length: xTicks + 1 }).map((_, i) => {
          const xv = minX + i * xStep;
          const x = sx(xv);
          return (
            <text key={`tx${i}`} x={x} y={H - 6} textAnchor="middle" fontSize="11" fill="#334155">
              {labelAtX(xv)}
            </text>
          );
        })}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const yv = minY + i * yStep;
          const y = sy(yv);
          return (
            <text key={`ty${i}`} x={m.l - 6} y={y + 4} textAnchor="end" fontSize="11" fill="#334155">
              {yv.toFixed(2)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* ===== styles ===== */
const wrap = { marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff" };
const toolbar = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 };
const btn = { padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#f8fafc", fontSize: 13, cursor: "pointer" };
const btnActive = { background: "#2563eb", color: "#fff", borderColor: "#2563eb" };
const msg = { fontSize: 12, color: "#64748b", marginBottom: 8 };
const hint = { fontSize: 12, color: "#334155" };
