import React, { useMemo, useState } from "react";
import StationChart from "./components/StationChart.jsx";

/* ================= Helpers ================= */
async function safeFetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return await res.json();
}

// format yyyy-MM-dd HH:mm (server nhận khoảng cách encode thành %20)
function ymdHM(d) {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const HH = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${yyyy}-${MM}-${dd} ${HH}:${mm}:00`;
}

/* =========== Danh sách trạm mẫu (bổ sung nếu cần) =========== */
const STATIONS = [
  { code: "556100", name: "Thủy Văn TĐ Lệ Thủy" },
  { code: "555800", name: "Thủy Văn TĐ Đông Hà" },
  { code: "555300", name: "Thủy Văn TĐ Đồng Tâm" },
  { code: "555900", name: "Thủy Văn TĐ Hiền Lương" },
  { code: "555700", name: "Thủy Văn TĐ Cửa Việt" },
  { code: "555600", name: "Thủy Văn TĐ Gia Vòng" },
  { code: "555400", name: "Thủy Văn TĐ Dầu Mẫu" },
  { code: "555200", name: "Thủy Văn TĐ Mỹ Chánh" },
];

/* ================= App ================= */
export default function App() {
  // chọn trạm (1 trạm trước, dễ kiểm thử; có thể mở rộng nhiều trạm sau)
  const [matram, setMatram] = useState(STATIONS[0].code);
  const tramSelected = useMemo(
    () => STATIONS.find((s) => s.code === matram),
    [matram]
  );

  // khoảng thời gian
  const now = new Date();
  const defaultEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);
  const defaultStart = new Date(defaultEnd.getTime() - 10 * 60 * 60 * 1000); // mặc định 10 giờ trước

  const [bd, setBd] = useState(ymdHM(defaultStart));
  const [kt, setKt] = useState(ymdHM(defaultEnd));
  const [sophut, setSophut] = useState(60);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // dữ liệu bảng hiển thị
  const [tableRows, setTableRows] = useState([]); // [{ 'Thời gian': 'yyyy-MM-dd HH:mm:ss', '<Tên trạm>': value }, ...]

  async function handleLoad() {
    try {
      setLoading(true);
      setErrorMsg("");

      // API gốc: http://117.2.255.18:2018/API_TTB/XUAT/solieu.php
      const base = "http://117.2.255.18:2018/API_TTB/XUAT/solieu.php";
      const params = new URLSearchParams({
        matram,
        ten_table: "MUCNUOC",
        sophut: String(sophut),
        tinhtong: "0",
        thoigianbd: bd,
        thoigiankt: kt,
      });
      const apiUrl = `${base}?${params.toString()}`;

      // luôn đi qua Netlify proxy để tránh CORS
      const url = `/.netlify/functions/proxy?url=${encodeURIComponent(apiUrl)}`;
      const json = await safeFetchJson(url);

      // Kỳ vọng dữ liệu có dạng mảng bản ghi { thoigian: '2025-08-29 07:00:00', giatri: 1.23 } hoặc tương tự
      // Ta cố gắng nhận nhiều tên trường phổ biến
      const rows = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
      const timeKey =
        ["thoigian", "ThoiGian", "thoi_gian", "TIME", "time"].find((k) => rows[0]?.[k] != null) || "thoigian";
      const valueKey =
        ["giatri", "GiaTri", "mucnuoc", "value", "Val", "MUCNUOC"].find((k) => rows[0]?.[k] != null) || "giatri";

      const name = tramSelected?.name || matram;

      // chuẩn hóa về tableRows: [{ Thời gian, [name]: value }]
      const normalized = rows
        .map((r) => ({
          "Thời gian": String(r[timeKey]).trim(),
          [name]: Number(String(r[valueKey]).replace(",", ".")),
        }))
        .filter((r) => r["Thời gian"] && Number.isFinite(r[name]));

      setTableRows(normalized);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Fetch lỗi");
      setTableRows([]);
    } finally {
      setLoading(false);
    }
  }

  function clearAll() {
    setTableRows([]);
    setErrorMsg("");
  }

  return (
    <div style={{ padding: 12 }}>
      <h2 style={{ textAlign: "center", margin: "8px 0 6px" }}>
        THÔNG TIN MỰC NƯỚC CÁC TRẠM THỦY VĂN TRÊN ĐỊA BÀN TỈNH QUẢNG TRỊ
      </h2>
      <div style={{ textAlign: "center", color: "#6b7280", fontSize: 12, marginBottom: 10 }}>
        Phục vụ công tác phòng chống thiên tai
      </div>

      {/* Bộ lọc + thao tác */}
      <div style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Chọn trạm</div>
          <select
            value={matram}
            onChange={(e) => setMatram(e.target.value)}
            style={{ width: 260, padding: 6 }}
          >
            {STATIONS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Bắt đầu</div>
          <input
            style={{ width: 190, padding: 6 }}
            value={bd}
            onChange={(e) => setBd(e.target.value)}
            title="Định dạng: yyyy-MM-dd HH:mm:00"
          />
        </div>
        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Kết thúc</div>
          <input
            style={{ width: 190, padding: 6 }}
            value={kt}
            onChange={(e) => setKt(e.target.value)}
            title="Định dạng: yyyy-MM-dd HH:mm:00"
          />
        </div>

        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Chu kỳ (phút)</div>
          <input
            type="number"
            min={5}
            step={5}
            value={sophut}
            onChange={(e) => setSophut(Number(e.target.value || 60))}
            style={{ width: 100, padding: 6 }}
          />
        </div>

        <button
          disabled={loading}
          onClick={handleLoad}
          style={{
            padding: "8px 14px",
            border: "1px solid #93c5fd",
            borderRadius: 8,
            background: "#3b82f6",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {loading ? "Đang tải…" : "Lấy dữ liệu"}
        </button>

        <button
          onClick={clearAll}
          style={{
            padding: "8px 12px",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "#f8fafc",
            cursor: "pointer",
          }}
        >
          Xoá kết quả
        </button>
      </div>

      {errorMsg && (
        <div style={{ marginBottom: 10, padding: 8, background: "#fee2e2", borderRadius: 8, color: "#991b1b" }}>
          {errorMsg}
        </div>
      )}

      {/* Kết quả: bảng (trái) + đồ thị (phải) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "480px 1fr",
          gap: 12,
          alignItems: "start",
          minHeight: 360,
        }}
      >
        {/* BẢNG */}
        <div id="bang-ket-qua" style={{ overflow: "auto", maxHeight: 520 }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
              background: "#fff",
              border: "1px solid #e5e7eb",
            }}
          >
            <thead style={{ position: "sticky", top: 0, background: "#f8fafc" }}>
              <tr>
                <th style={thStyle}>thời gian</th>
                <th style={thStyle}>{tramSelected?.name || "Trạm"}</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r, idx) => (
                <tr key={idx}>
                  <td style={tdStyle}>{r["Thời gian"]}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {Number.isFinite(r[tramSelected?.name]) ? r[tramSelected.name].toFixed(2) : ""}
                  </td>
                </tr>
              ))}
              {tableRows.length === 0 && (
                <tr>
                  <td style={tdStyle} colSpan={2}>
                    Chưa có dữ liệu hợp lệ.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ĐỒ THỊ */}
        <div id="chart-ket-qua">
          {tableRows.length > 0 ? (
            <StationChart
              tableRows={tableRows}
              // Khóa thời gian theo nhiều biến thể để bắt chắc cột
              preferTimeKeys={[
                "Thời gian",
                "Thoi gian",
                "ThoiGian",
                "thoigian",
                "time",
                "TIME",
              ]}
            />
          ) : (
            <div style={{ color: "#64748b", fontSize: 12 }}>
              Vui lòng bấm <b>Lấy dữ liệu</b> để hiển thị đồ thị.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= Styles nhỏ ================= */
const thStyle = {
  borderBottom: "1px solid #e5e7eb",
  padding: "6px 8px",
  textAlign: "left",
  position: "sticky",
  top: 0,
  background: "#f8fafc",
  zIndex: 1,
};
const tdStyle = {
  borderBottom: "1px solid #f1f5f9",
  padding: "6px 8px",
};
