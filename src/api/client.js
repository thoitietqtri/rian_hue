// src/api/client.js

// Chuẩn hoá định dạng thời gian "YYYY-MM-DD HH:mm:ss"
export function fmt(dt) {
  // dt có thể là Date hoặc string "YYYY-MM-DD HH:mm:ss"
  if (dt instanceof Date) {
    const pad = n => String(n).padStart(2, '0')
    const y = dt.getFullYear()
    const m = pad(dt.getMonth() + 1)
    const d = pad(dt.getDate())
    const H = pad(dt.getHours())
    const M = pad(dt.getMinutes())
    const S = pad(dt.getSeconds())
    return `${y}-${m}-${d} ${H}:${M}:${S}`
  }
  return dt // nếu anh đã truyền string đúng format
}

// Tạo URL cho solieu.php (dùng URLSearchParams để encode 1 lần, không double-encode)
export function buildSolieuUrl({
  matram, ten_table, sophut = 60, tinhtong = 0, thoigianbd, thoigiankt
}) {
  const params = new URLSearchParams({
    matram: String(matram ?? '').trim(),
    ten_table: String(ten_table ?? '').trim(),
    sophut: String(sophut),
    tinhtong: String(tinhtong),
    // Có thể để thêm dấu nháy nếu API yêu cầu: `'${fmt(thoigianbd)}'`
    thoigianbd: fmt(thoigianbd),
    thoigiankt: fmt(thoigiankt),
  })
  return `/api/API_TTB/JSON/solieu.php?${params.toString()}`
}

// Gọi API và trả JSON
export async function fetchSolieu(opts) {
  const url = buildSolieuUrl(opts)
  console.log('[DEBUG] fetch URL =', url)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
