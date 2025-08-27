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
  return dt; // nếu đã là string đúng định dạng
}

// Tạo URL cho solieu.php (CÓ dấu nháy đơn quanh thời gian)
// URLSearchParams sẽ encode ' thành %27 (chỉ 1 lần, KHÔNG double-encode)
export function buildSolieuUrl({
  matram, ten_table, sophut = 60, tinhtong = 0, thoigianbd, thoigiankt
}) {
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

export async function fetchSolieu(opts) {
  const url = buildSolieuUrl(opts);
  console.log('[DEBUG] fetch URL =', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
