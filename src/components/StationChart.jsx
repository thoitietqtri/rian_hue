// src/components/StationChart.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/* ===== Helpers ===== */
function parseTime(input) {
  if (input == null) return NaN;
  const s = String(input).trim();
  if (!s) return NaN;
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(s))
    return new Date(s.replace(" ", "T")).getTime();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [, dd, mm, yy, HH, MM, SS = "00"] = m;
    return new Date(`${yy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}T${HH}:${MM}:${SS}`).getTime();
  }
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [, dd, mm, yy, HH, MM, SS = "00"] = m;
    return new Date(`${yy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}T${HH}:${MM}:${SS}`).getTime();
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? NaN : t;
}
const norm = (s) => (s ?? "").toString().normalize("NFD").replace(/\p{Diacritic}/gu,"").trim().toLowerCase();
function toNumber(v){ if(v==null) return NaN; const n=parseFloat(String(v).trim().replace(",", ".")); return Number.isFinite(n)?n:NaN; }

/* ===== (A) Build series từ mảng dữ liệu sẵn có ===== */
function buildSeriesFromRows(rows, preferTimeKeys = []) {
  if (!Array.isArray(rows) || rows.length === 0) return { series: [], timeKey: null };

  const allKeys = Array.from(new Set(rows.flatMap(r => Object.keys(r || {}))));
  // chọn timeKey
  let timeKey = preferTimeKeys.find(k => allKeys.includes(k)) || null;
  if (!timeKey) {
    const common = ["Thời gian","Thoi gian","ThoiGian","thoigian","time","Time","timestamp"];
    timeKey = common.find(k => allKeys.includes(k)) ||
      allKeys.reduce((best,k)=>{
        let hits=0; for(const r of rows.slice(0,200)){ if(!Number.isNaN(parseTime(r?.[k]))) hits++; }
        return hits > (best?.hits||0) ? {k,hits} : best;
      }, null)?.k || null;
  }
  if (!timeKey) return { series: [], timeKey: null };

  // cột trạm = các key còn lại có >=2 số hợp lệ
  const candidates = allKeys.filter(k => k !== timeKey);
  const series = [];
  for (const key of candidates) {
    const pts = [];
    for (const r of rows) {
      const t = parseTime(r[timeKey]);
      const y = toNumber(r[key]);
      if (!Number.isNaN(t) && Number.isFinite(y)) pts.push({ t, y });
    }
    if (pts.length >= 2) {
      pts.sort((a,b)=>a.t-b.t);
      const uniq=[]; for(const p of pts){ if(!uniq.length || uniq.at(-1).t!==p.t) uniq.push(p); }
      if (uniq.length >= 2) series.push({ name: key, data: uniq });
    }
  }
  return { series, timeKey };
}

/* ===== (B) Fallback: đọc trực tiếp từ bảng đang hiển thị (giữ nguyên giao diện) ===== */
function pickMainTable() {
  const tables = [...document.querySelectorAll("table")];
  if (!tables.length) return null;
  let best = null, score = 0;
  for (const t of tables) {
    const body = t.tBodies?.[0] || t;
    const rows = [...body.rows].slice(0, 80);
    const cols = rows[0]?.cells?.length || 0;
    if (!rows.length || !cols) continue;
    const hits = new Array(cols).fill(0);
    for (const r of rows) for (let c=0;c<cols;c++) {
      const txt = (r.cells[c]?.textContent||"").trim();
      if (!Number.isNaN(parseTime(txt))) hits[c]++;
    }
    const bestHits = Math.max(...hits);
    const sizeBonus = Math.log1p(rows.length*cols);
    const s = (bestHits >= 3 ? bestHits : 0) + sizeBonus;
    if (s > score) { score = s; best = t; }
  }
  return best;
}

function buildSeriesFromDOM() {
  const tbl = pickMainTable();
  if (!tbl) return { series: [], timeKey: null };
  const thead = tbl.tHead;
  const headRow = thead?.rows?.[thead.rows.length-1] || null;
  const headers = headRow ? [...headRow.cells].map(th=>th.textContent.trim()) :
                   tbl.rows.length ? [...tbl.rows[0].cells].map(th=>th.textContent.trim()) : [];
  const body = tbl.tBodies?.[0] || tbl;
  const allRows = [...body.rows];
  const rows = headRow ? allRows : allRows.slice(1);

  // tìm cột thời gian
  let timeCol = -1;
  {
    const sample = rows.slice(0, 120);
    const cols = sample[0]?.cells?.length || 0;
    const hits = new Array(cols).fill(0);
    for (const r of sample) for (let c=0;c<cols;c++){
      const txt = (r.cells[c]?.textContent||"").trim();
      if (!Number.isNaN(parseTime(txt))) hits[c]++;
    }
    const best = Math.max(...hits);
    timeCol = hits.findIndex(h => h===best && best>=3);
  }
  if (timeCol < 0) return { series: [], timeKey: null };

  // cột trạm = cột số
  const series = [];
  for (let i=0;i<headers.length;i++){
    if (i===timeCol) continue;
    const name = headers[i] || `Cột ${i+1}`;
    const pts=[];
    for (const tr of rows){
      const t = parseTime((tr.cells[timeCol]?.textContent||"").trim());
      const y = toNumber((tr.cells[i]?.textContent||"").trim());
      if (!Number.isNaN(t) && Number.isFinite(y)) pts.push({t,y});
    }
    if (pts.length>=2){ pts.sort((a,b)=>a.t-b.t); series.push({name, data: pts}); }
  }
  return { series, timeKey: "(DOM)" };
}

/* ===== Component ===== */
export default function StationChart({ tableRows = [], preferTimeKeys = [] }) {
  const [series, setSeries] = useState([]);
  const containerRef = useRef(null);

  // ưu tiên dữ liệu props; nếu không có thì fallback DOM
  useEffect(() => {
    if (Array.isArray(tableRows) && tableRows.length > 0) {
      const { series } = buildSeriesFromRows(tableRows, preferTimeKeys);
      setSeries(series);
      return;
    }
    const renderFromDom = () => {
      const { series } = buildSeriesFromDOM();
      setSeries(series);
    };
    renderFromDom();
    const obs = new MutationObserver(() => renderFromDom());
    obs.observe(document.body, { childList:true, subtree:true, characterData:true });
    return () => obs.disconnect();
  }, [tableRows, preferTimeKeys]);

  const [selected, setSelected] = useState(null);
  useEffect(() => {
    if (!series.length) return;
    if (!selected || !series.find(s=>s.name===selected)) setSelected(series[0].name);
  }, [series, selected]);

  if (!series.length) {
    return (
      <div style={wrap} ref={containerRef}>
        <div style={msg}>Không tìm thấy dữ liệu thời gian để vẽ đồ thị.</div>
      </div>
    );
  }

  const sel = series.find(s=>s.name===selected) || series[0];
  return (
    <ChartBox
      series={series}
      selected={sel.name}
      onSelect={setSelected}
    />
  );
}

/* ===== SVG Chart ===== */
function ChartBox({ series, selected, onSelect }) {
  const boxRef = useRef(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const ro = new ResizeObserver(es => setW(es[0]?.contentRect?.width || el.clientWidth || 800));
    ro.observe(el); setW(el.clientWidth || 800);
    return () => ro.disconnect();
  }, []);

  const H = 330, m = {l:48,r:16,t:12,b:26}, W = Math.max(320, w);
  const sel = useMemo(()=>series.find(s=>s.name===selected) || series[0],[series,selected]);
  const data = sel.data;

  const minX = data[0].t, maxX = data[data.length-1].t;
  let minY = Math.min(...data.map(d=>d.y)), maxY = Math.max(...data.map(d=>d.y));
  if (minY===maxY) maxY=minY+1e-6;

  const sx = x => m.l + ((x-minX)/(maxX-minX||1))*(W-m.l-m.r);
  const sy = y => H-m.b - ((y-minY)/(maxY-minY||1))*(H-m.t-m.b);

  const xTicks = Math.min(6, Math.max(1, data.length-1));
  const yTicks = 5, xStep=(maxX-minX)/(xTicks||1), yStep=(maxY-minY)/yTicks;

  let path = `M ${sx(data[0].t)} ${sy(data[0].y)}`;
  for (let i=1;i<data.length;i++) path += ` L ${sx(data[i].t)} ${sy(data[i].y)}`;

  return (
    <div style={wrap} ref={boxRef}>
      <div style={toolbar}>
        {series.map(s => (
          <button
            key={s.name}
            onClick={()=>onSelect(s.name)}
            style={{...btn, ...(s.name===sel.name ? btnActive : null)}}
          >{s.name}</button>
        ))}
      </div>
      <div style={msg}>Đồ thị quá trình mực nước – dữ liệu từ bảng đang hiển thị.</div>

      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{display:"block"}}>
        {Array.from({length:yTicks+1}).map((_,i)=> {
          const y = sy(minY+i*yStep);
          return <line key={`gy${i}`} x1={m.l} y1={y} x2={W-m.r} y2={y} stroke="#e2e8f0" strokeDasharray="3 3"/>;
        })}
        {Array.from({length:xTicks+1}).map((_,i)=> {
          const x = sx(minX+i*xStep);
          return <line key={`gx${i}`} x1={x} y1={m.t} x2={x} y2={H-m.b} stroke="#e2e8f0" strokeDasharray="3 3"/>;
        })}
        <path d={path} fill="none" stroke="#0ea5e9" strokeWidth="2"/>

        {Array.from({length:xTicks+1}).map((_,i)=>{
          const xV=minX+i*xStep, x=sx(xV), dt=new Date(xV);
          const lab = `${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`;
          return <text key={`tx${i}`} x={x} y={H-6} textAnchor="middle" fontSize="11" fill="#334155">{lab}</text>;
        })}
        {Array.from({length:yTicks+1}).map((_,i)=>{
          const yV=minY+i*yStep, y=sy(yV);
          return <text key={`ty${i}`} x={m.l-6} y={y+4} textAnchor="end" fontSize="11" fill="#334155">{yV.toFixed(2)}</text>;
        })}
      </svg>
    </div>
  );
}

/* ===== styles ===== */
const wrap = { marginTop:12, border:"1px solid #e5e7eb", borderRadius:10, padding:12, background:"#fff" };
const toolbar = { display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:8 };
const btn = { padding:"6px 10px", border:"1px solid #cbd5e1", borderRadius:8, background:"#f8fafc", fontSize:13, cursor:"pointer" };
const btnActive = { background:"#2563eb", color:"#fff", borderColor:"#2563eb" };
const msg = { fontSize:12, color:"#64748b", marginBottom:8 };
