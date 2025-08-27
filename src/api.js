// src/api.js
// === 1) Endpoint proxy qua Netlify (HTTPS, tránh mixed content/CORS) ===
export const API_PROXY = "/.netlify/functions/proxy";

// === 2) Utility: định dạng "YYYY-MM-DD HH:mm:ss" ===
export function fmtDateTime(dt) {
  if (typeof dt === "string") return dt; // đã là chuỗi chuẩn
  const p = (n) => String(n).padStart(2, "0");
  const y = dt.getFullYear();
  const m = p(dt.getMonth() + 1);
  const d = p(dt.getDate());
  const H = p(dt.getHours());
  const M = p(dt.getMinutes());
  const S = p(dt.getSeconds());
  return `${y}-${m}-${d} ${H}:${M}:${S}`;
}

// === 3) fetch có timeout ===
async function fetchWithTimeout(url, options = {}) {
  const { timeout = 20000, ...opts } = options;
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

// === 4) Build query: thêm NHÁY ĐƠN quanh thời gian (server kỳ vọng) ===
function buildQuery({ matram, ten_table, sophut, tinhtong, startDate, endDate }) {
  const bd = fmtDateTime(startDate);
  const kt = fmtDateTime(endDate);
  return new URLSearchParams({
    matram: String(matram || ""),
    ten_table: String(ten_table || ""),
    sophut: String(sophut ?? ""),
    tinhtong: (tinhtong === 1 || tinhtong === true || tinhtong === "1") ? "1" : "0",
    // thêm nháy đơn -> sẽ được encode thành %27...%27
    thoigianbd: `'${bd}'`,
    thoigiankt: `'${kt}'`,
  });
}

// === 5) Hàm chính: gọi API và trả về HTML (table) ===
export async function fetchStationHtml(params, { timeout = 20000 } = {}) {
  const qs = buildQuery(params).toString();
  const url = `${API_PROXY}?${qs}`;

  let resp;
  try {
    resp = await fetchWithTimeout(url, { timeout });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("Hết thời gian chờ (timeout) khi gọi API qua proxy");
    }
    throw new Error(`Không gọi được API (network/proxy): ${err?.message || err}`);
  }

  if (!resp.ok) {
    throw new Error(`Proxy HTTP ${resp.status} – ${resp.statusText || "Lỗi"}`);
  }

  const html = await resp.text();
  if (!html || !html.toLowerCase().includes("<table")) {
    throw new Error("API trả về rỗng hoặc sai định dạng (không thấy <table)");
  }
  return html;
}

// === 6) (Tuỳ chọn) Parse HTML table -> mảng dữ liệu ===
export function parseHtmlTableToRows(html) {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return [];

  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return [];

  let headers = [];
  const ths = rows[0].querySelectorAll("th,td");
  if (ths.length) headers = Array.from(ths).map((el) => el.textContent.trim());

  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = Array.from(rows[i].querySelectorAll("td"));
    if (!cells.length) continue;
    if (headers.length === cells.length) {
      const obj = {};
      cells.forEach((td, idx) => {
        obj[headers[idx] || `col_${idx}`] = td.textContent.trim();
      });
      data.push(obj);
    } else {
      data.push(cells.map((td) => td.textContent.trim()));
    }
  }
  return data;
}
