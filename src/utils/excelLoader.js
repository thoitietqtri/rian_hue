// src/utils/excelLoader.js
import * as XLSX from "xlsx";

// Chuẩn hoá tên cột: bỏ dấu, thường hoá, xoá khoảng trắng/ký tự lạ
function normKey(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_]/g, "");
}

// Tìm hàng tiêu đề: là hàng chứa đủ các cột bắt buộc (sau khi chuẩn hoá)
function findHeaderRow(rows, requiredKeysNorm) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].map(normKey);
    const ok = requiredKeysNorm.every(k => row.includes(k));
    if (ok) return i;
  }
  return -1;
}

/**
 * Đọc một file .xlsx (URL) và trả về mảng object theo hàng dữ liệu.
 * - requiredKeys: các cột bắt buộc (chưa chuẩn hoá, ví dụ: ["matram","tentram","matinh","tab","sophut","tinhtong"])
 * - Nếu không tìm thấy header đúng chuẩn -> dùng hàng 0 làm header (fallback)
 */
export async function readTableFromXlsx(url, requiredKeys = []) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} khi tải ${url}`);
  const buf = await res.arrayBuffer();

  const wb = XLSX.read(buf, { type: "array" });
  // Ưu tiên sheet chứa đủ các cột bắt buộc
  let chosen = wb.Sheets[wb.SheetNames[0]];
  let rows = XLSX.utils.sheet_to_json(chosen, { header: 1, raw: false, defval: "" });

  const reqNorm = requiredKeys.map(normKey);
  let headerIdx = findHeaderRow(rows, reqNorm);
  let sheetName = wb.SheetNames[0];

  if (headerIdx === -1) {
    // thử các sheet khác
    for (const name of wb.SheetNames) {
      const sh = wb.Sheets[name];
      const arr = XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: "" });
      const idx = findHeaderRow(arr, reqNorm);
      if (idx !== -1) {
        chosen = sh; rows = arr; headerIdx = idx; sheetName = name;
        break;
      }
    }
  }

  // nếu vẫn không tìm được tiêu đề -> lấy hàng 0 (fallback)
  if (headerIdx === -1) {
    rows = XLSX.utils.sheet_to_json(chosen, { header: 1, raw: false, defval: "" });
    headerIdx = 0;
  }

  const headerRaw = rows[headerIdx];
  const header = headerRaw.map(normKey);

  const data = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(v => v === "" || v == null)) continue; // bỏ dòng trống
    const obj = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c] || `col_${c}`;
      obj[key] = row[c];
    }
    data.push(obj);
  }

  return { data, sheetName, header: headerRaw };
}

/** Đọc danh sách trạm từ thamso_khaithac.xlsx */
export async function readStations(urlThamSo) {
  const required = ["matram", "tentram", "matinh", "tab", "sophut", "tinhtong"];
  const { data, sheetName } = await readTableFromXlsx(urlThamSo, required);

  // Sau khi chuẩn hoá key, các cột sẽ là: matram, tentram, matinh, tab, sophut, tinhtong
  // Lọc chỉ các hàng có matram hợp lệ
  const stations = data
    .map(r => ({
      matram: r["matram"] ?? r["ma_tram"],
      tentram: r["tentram"] ?? r["ten_tram"],
      matinh: r["matinh"],
      tab: r["tab"],
      sophut: Number(r["sophut"] ?? 60),
      tinhtong: Number(r["tinhtong"] ?? 0)
    }))
    .filter(r => String(r.matram || "").trim() !== "");

  if (stations.length === 0) {
    throw new Error(`Không tìm thấy danh sách trạm trong sheet "${sheetName}". Kiểm tra tên cột: matram, tentram, matinh, tab, sophut, tinhtong`);
  }

  return stations;
}
