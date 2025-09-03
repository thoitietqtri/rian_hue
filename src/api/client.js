// src/api/client.js

// 'YYYY-MM-DD HH:mm:ss'
export function fmt(dt) {
  if (dt instanceof Date) {
    const pad = n => String(n).padStart(2, '0');
    const y = dt.getFullYear();
    const m = pad(dt.getMonth() + 1);
    const d = pad(dt.getDate());
    const H = pad(dt.getHours());
    const M = pad(dt.getMinutes());
    const S = pad(dt.getSeconds());
    return `${y}-${m}-${d} ${H}:${M}:${S}`;
  }
  // dt already string
  return dt;
}

// Build URL for JSON/solieu.php
export function buildSolieuUrl({ matram, ten_table, sophut = 60, tinhtong = 0, thoigianbd, thoigiankt }) {
  const params = new URLSearchParams({
    matram: String(matram ?? '').trim(),
    ten_table: String(ten_table ?? '').trim(),
    sophut: String(sophut),
    tinhtong: String(tinhtong),
    thoigianbd: `'${fmt(thoigianbd)}'`,
    thoigiankt: `'${fmt(thoigiankt)}'`,
  });
  return `/api/API_TTB/JSON/solieu.php?${params.toString()}`;
}

export async function fetchRainByStation({ matram, startLocal, endLocal, sophut = 60 }) {
  const url = buildSolieuUrl({
    matram,
    ten_table: 'MUA',    // rainfall
    sophut,
    tinhtong: 0,
    thoigianbd: startLocal.replace('T',' ') + ':00',
    thoigiankt: endLocal.replace('T',' ') + ':00',
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  // Normalize to [{time, mm}]
  const arr = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
  // Guess keys
  const timeKey = ['thoigian','time','ThoiGian','thoi_gian','TIME'].find(k => arr[0]?.[k] != null) ?? 'thoigian';
  const valKey = ['giatri','mua','MUA','GiaTri','value','Val'].find(k => arr[0]?.[k] != null) ?? 'giatri';
  return arr.map(r => ({
    time: String(r[timeKey]).slice(0,16).replace('T',' '),
    mm: Number(String(r[valKey]).replace(',','.')) || 0
  }));
}
