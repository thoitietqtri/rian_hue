// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

// Import URL 2 file Excel (Vite sẽ sinh URL đúng cho dev & build)
import thamsoUrl from "./assets/thamso_khaithac.xlsx?url";
import baodongUrl from "./assets/cap_baodong.xlsx?url";

// Tiện ích đọc Excel & gọi API
import { readStations } from "./utils/excelLoader";
import { fetchSolieu } from "./api/client";
import StationChart from "./components/StationChart.jsx";

// ====== TIỆN ÍCH NHỎ ======
const pad2 = (n) => String(n).padStart(2, "0");

/** Đổi giá trị datetime-local -> 'YYYY-MM-DD HH:mm:ss' */
function toSqlDT(localDT) {
  if (!localDT) return "";
  const [d, t] = localDT.split("T");
  const [y, m, day] = d.split("-");
  const [H = "00", M = "00"] = (t || "").split(":");
  return `${y}-${m}-${day} ${H}:${M}:00`;
}

/** Chuẩn hoá dữ liệu trả về từ API thành {time, value} */
// Thay thế HÀM normalizeApiRows bằng bản dưới:
function normalizeApiRows(rows) {
  if (!Array.isArray(rows)) return [];

  // Chuẩn hoá key: bỏ dấu, thường hoá, bỏ khoảng trắng/ký tự lạ
  const normKey = (s) =>
    String(s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

  return rows
    .map((r) => {
      const keys = Object.keys(r);
      const entries = keys.map((k) => [k, normKey(k)]);

      // Ưu tiên các key chứa chuỗi sau
      const timeEntry =
        entries.find(([, n]) => n.includes("thoigian")) || // "thoigian", "thoigian_sl"
        entries.find(([, n]) => n.includes("thogian")) ||  // "thogian_sl" (thiếu i)
        entries.find(([, n]) => n.includes("datetime")) ||
        entries.find(([, n]) => n.includes("time")) ||
        [keys[0], ""]; // fallback

      const valEntry =
        entries.find(([, n]) => n.includes("solieu")) ||
        entries.find(([, n]) => n.includes("mucnuoc")) ||
        entries.find(([, n]) => n.includes("giatri")) ||
        entries.find(([, n]) => n.includes("value")) ||
        [keys.find((k) => k !== timeEntry[0]) || keys[1] || timeEntry[0], ""];

      const kTime = timeEntry[0];
      const kVal = valEntry[0];

      const time = r[kTime];
      let valRaw = r[kVal];
      if (typeof valRaw === "string") valRaw = valRaw.replace(",", ".");
      const value = Number(valRaw);

      return { time, value: Number.isFinite(value) ? value : null };
    })
    .filter((x) => x.time);
}


/** Gộp nhiều series (mỗi series: [{time, value}]) thành bảng */
function buildTable(seriesByStation) {
  const allTimes = new Set();
  for (const s of Object.values(seriesByStation)) {
    s.forEach((row) => allTimes.add(row.time));
  }
  const times = Array.from(allTimes).sort();
  const table = times.map((t) => {
    const row = { time: t };
    for (const [stationName, series] of Object.entries(seriesByStation)) {
      const found = series.find((x) => String(x.time) === String(t));
      row[stationName] = found ? found.value : "";
    }
    return row;
  });
  return table;
}

// ====== APP CHÍNH ======
export default function App() {
  // A) STATE
  const [stations, setStations] = useState([]); // danh sách trạm từ Excel
  const [alerts, setAlerts] = useState([]); // ngưỡng báo động (chưa dùng ở bảng)
  const [selectedMatram, setSelectedMatram] = useState([]); // mảng mã trạm chọn
  const [tenTableOverride, setTenTableOverride] = useState("");
  const [sophut, setSophut] = useState(60);
  const [tinhtong, setTinhtong] = useState(false);
  const [startDT, setStartDT] = useState(""); // input datetime-local
  const [endDT, setEndDT] = useState("");

  const [loadingInit, setLoadingInit] = useState(true); // loading Excel
  const [loadingFetch, setLoadingFetch] = useState(false); // loading API
  const [error, setError] = useState("");

  // Kết quả bảng hiển thị
  const [tableRows, setTableRows] = useState([]);
  const [summary, setSummary] = useState({ countTimes: 0, countStations: 0 });

  // B) NẠP DANH SÁCH TRẠM + NGƯỠNG BÁO ĐỘNG
  useEffect(() => {
    async function loadExcel() {
      try {
        setLoadingInit(true);
        setError("");
        // 1) Nạp danh sách trạm
        const st = await readStations(thamsoUrl);
        setStations(st);

        // 2) Nạp ngưỡng báo động (đọc sheet đầu; demo)
        const r2 = await fetch(baodongUrl);
        if (r2.ok) {
          const buf = await r2.arrayBuffer();
          const wb = XLSX.read(buf, { type: "array" });
          const sh = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(sh, { defval: "" });
          setAlerts(data);
        }

        // 3) Gợi ý mặc định
        const now = new Date();
        const end = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(
          now.getDate()
        )}T${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
        const yest = new Date(now.getTime() - 24 * 3600 * 1000);
        const start = `${yest.getFullYear()}-${pad2(
          yest.getMonth() + 1
        )}-${pad2(yest.getDate())}T00:00`;

        setStartDT(start);
        setEndDT(end);
        setSelectedMatram(st.slice(0, 1).map((x) => String(x.matram || "")));
      } catch (e) {
        console.error("[ERROR] loadExcel:", e);
        setError(
          e?.message ||
            "Không nạp được thamso_khaithac.xlsx / cap_baodong.xlsx"
        );
      } finally {
        setLoadingInit(false);
      }
    }
    loadExcel();
  }, []);

  // C) LẬP MAP mã trạm -> đối tượng trạm
  const stationByCode = useMemo(() => {
    const m = new Map();
    stations.forEach((s) => m.set(String(s.matram || ""), s));
    return m;
  }, [stations]);

  // D) “LẤY DỮ LIỆU”
  async function handleFetch() {
    try {
      setLoadingFetch(true);
      setError("");
      setTableRows([]);

      if (!selectedMatram.length) {
        setError("Hãy chọn ít nhất 1 trạm.");
        return;
      }
      const start = toSqlDT(startDT);
      const end = toSqlDT(endDT);
      if (!start || !end) {
        setError("Chưa chọn thời gian bắt đầu/kết thúc.");
        return;
      }

      // Gọi song song từng trạm
      const tasks = selectedMatram.map(async (code) => {
        const st = stationByCode.get(String(code));
        if (!st) throw new Error(`Không tìm thấy cấu hình trạm ${code}`);

        const ten_table =
          (tenTableOverride || st.tab || "").toString().trim() || "";
        const _sophut = Number(sophut || st.sophut || 60);
        const _tinhtong = tinhtong ? 1 : Number(st.tinhtong || 0);

        const json = await fetchSolieu({
          matram: code,
          ten_table,
          sophut: _sophut,
          tinhtong: _tinhtong,
          thoigianbd: start,
          thoigiankt: end,
        });

        const series = normalizeApiRows(json);
        const stationName = st.tentram || code;
        return { stationName, series };
      });

      const results = await Promise.allSettled(tasks);
      const ok = results
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value);
      const errs = results
        .filter((r) => r.status === "rejected")
        .map((r) => r.reason?.message || String(r.reason));

      if (errs.length) {
        console.warn("[WARN] Một số trạm lỗi:", errs);
      }

      const seriesByStation = {};
      ok.forEach(({ stationName, series }) => {
        seriesByStation[stationName] = series;
      });

      const table = buildTable(seriesByStation);
      setTableRows(table);
      setSummary({
        countTimes: table.length,
        countStations: ok.length,
      });

      if (!table.length) {
        setError(
          "Không có dữ liệu để hiển thị. Hãy kiểm tra lại 'ten_table', khoảng thời gian hoặc API."
        );
      }
    } catch (e) {
      console.error("[ERROR] handleFetch:", e);
      setError(e?.message || "Lỗi khi gọi API");
    } finally {
      setLoadingFetch(false);
    }
  }

  // E) XÓA KẾT QUẢ
  function handleClear() {
    setTableRows([]);
    setSummary({ countTimes: 0, countStations: 0 });
    setError("");
  }

  // F) RENDER
  return (
    <div
      style={{
        fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
        padding: 16,
        maxWidth: 1280,
        margin: "0 auto",
      }}
    >
      <h1 style={{ textAlign: "center", marginBottom: 8 }}>
        THÔNG TIN MỰC NƯỚC CÁC TRẠM THỦY VĂN TRÊN ĐỊA BÀN TỈNH QUẢNG TRỊ
      </h1>
      <p style={{ textAlign: "center", marginTop: 0 }}>
        Phục vụ công tác phòng chống thiên tai
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
        {/* PANEL TRÁI: cấu hình */}
        <div
          style={{
            border: "1px solid #e6e6e6",
            borderRadius: 12,
            padding: 12,
            background: "#fafafa",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Nguồn dữ liệu</h3>
          <p style={{ margin: "6px 0", color: "#555" }}>
            Đã nạp <b>{stations.length}</b> trạm từ{" "}
            <code>thamso_khaithac.xlsx</code>
          </p>

          <div style={{ marginTop: 12 }}>
            <label style={{ fontWeight: 600 }}>Chọn trạm (Giữ Ctrl/Shift):</label>
            <select
              multiple
              size={12}
              value={selectedMatram}
              onChange={(e) =>
                setSelectedMatram(
                  Array.from(e.target.selectedOptions).map((o) => o.value)
                )
              }
              style={{ width: "100%", marginTop: 6 }}
            >
              {stations.map((s) => (
                <option key={String(s.matram)} value={String(s.matram)}>
                  {s.tentram || s.matram}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, marginTop: 12 }}>
            <div>
              <label style={{ fontWeight: 600 }}>Bắt đầu</label>
              <input
                type="datetime-local"
                value={startDT}
                onChange={(e) => setStartDT(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label style={{ fontWeight: 600 }}>Kết thúc</label>
              <input
                type="datetime-local"
                value={endDT}
                onChange={(e) => setEndDT(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label style={{ fontWeight: 600 }}>Chu kỳ (sophut)</label>
              <input
                type="number"
                min={5}
                step={5}
                value={sophut}
                onChange={(e) => setSophut(Number(e.target.value) || 60)}
                style={{ width: 120 }}
              />
            </div>
            <div>
              <label style={{ fontWeight: 600 }}>
                ten_table (để trống dùng theo Excel)
              </label>
              <input
                type="text"
                placeholder="vd: mucnuoc_oday"
                value={tenTableOverride}
                onChange={(e) => setTenTableOverride(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={tinhtong}
                onChange={(e) => setTinhtong(e.target.checked)}
              />
              Tính tổng trong ngày (tinhtong=1)
            </label>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button
              onClick={handleFetch}
              disabled={loadingInit || loadingFetch}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #1976d2",
                background: "#1976d2",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              {loadingFetch ? "Đang lấy dữ liệu…" : "Lấy dữ liệu"}
            </button>
            <button
              onClick={handleClear}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #999",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              Xoá kết quả
            </button>
          </div>

          {error && (
            <p style={{ color: "crimson", marginTop: 12 }}>
              <b>Lỗi:</b> {error}
            </p>
          )}
          {loadingInit && <p>Đang nạp danh sách trạm từ Excel…</p>}
        </div>

        {/* PANEL PHẢI: kết quả */}
        <div
          style={{
            border: "1px solid #e6e6e6",
            borderRadius: 12,
            padding: 12,
            minHeight: 360,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div style={{ color: "#444" }}>
              Hiển thị <b>{summary.countTimes}</b> mốc thời gian —{" "}
              <b>{summary.countStations}</b> trạm.
            </div>
          </div>

          {!tableRows.length ? (
            <p style={{ color: "#777", marginTop: 16 }}>
              Không có dữ liệu để hiển thị.
            </p>
          ) : (
            <div style={{ overflow: "auto", maxHeight: "70vh" }}>
              <table
                style={{
                  borderCollapse: "collapse",
                  width: "100%",
                  minWidth: 720,
                }}
              >
                <thead>
                  <tr>
                    {Object.keys(tableRows[0]).map((col) => (
                      <th
                        key={col}
                        style={{
                          position: "sticky",
                          top: 0,
                          background: "#f5f7ff",
                          textAlign: "left",
                          borderBottom: "1px solid #ddd",
                          padding: "8px 6px",
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r, i) => (
                    <tr key={i}>
                      {Object.keys(tableRows[0]).map((col) => (
                        <td
                          key={col}
                          style={{
                            borderBottom: "1px solid #f0f0f0",
                            padding: "6px 6px",
                          }}
                        >
                          {r[col]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      
      {/* Đồ thị đường quá trình – lấy từ tableRows, không gọi API */}
      {Array.isArray(tableRows) && tableRows.length > 0 && (
        <StationChart tableRows={tableRows} />
      )}

<div style={{ marginTop: 14, color: "#666" }}>
        <small>
          Gợi ý: Nếu “không có dữ liệu”, hãy kiểm tra <b>ten_table</b> đúng với
          Excel, khoảng thời gian, hoặc API. Xem tab <b>Network</b> để thấy URL
          thực tế được gọi.
        </small>
      </div>
    </div>
  );
}
