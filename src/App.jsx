import React, { useEffect, useMemo, useState } from "react";
import RainTable from "./components/RainTable.jsx";
import RainChart from "./components/RainChart.jsx";
import { fetchRainByStation } from "./api/client.js";
import { readStationsFromExcel } from "./utils/excelLoader.js";

// Đọc Excel ở thư mục public
const excelUrl = "/thamso_khaithac.xlsx";

// Chuẩn hoá giá trị datetime-local (local timezone) -> "YYYY-MM-DDTHH:mm"
function toLocalInputValue(dt) {
  const s = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString();
  return s.slice(0, 16);
}

export default function App() {
  // Toàn bộ trạm đọc từ Excel
  const [allStations, setAllStations] = useState([]);
  // Danh sách trạm đang chọn để hiển thị
  const [stations, setStations] = useState([]);

  const [start, setStart] = useState(() => {
    const t = new Date();
    t.setHours(t.getHours() - 24, 0, 0, 0); // mặc định 24h gần nhất
    return toLocalInputValue(t);
  });
  const [end, setEnd] = useState(() => toLocalInputValue(new Date()));

  const [loading, setLoading] = useState(false);
  const [seriesByStation, setSeriesByStation] = useState({}); // { [id]: [{time, mm}] }

  // ====== Đọc danh sách trạm từ Excel (public/thamso_khaithac.xlsx) ======
  useEffect(() => {
    (async () => {
      try {
        const rows = await readStationsFromExcel(excelUrl);
        // Chuẩn hoá & lọc các trạm dùng cho MƯA (nếu file có cột tab)
        const list = rows
          .filter((r) => !r.tab || String(r.tab).toUpperCase() === "MUA")
          .map((r) => ({
            id: r.matram || r.id || r.code,
            code: r.matram || r.code || r.id,                 // dùng để gọi API
            name: r.tentram || r.name || r.matram || "Chưa đặt tên",
          }));
        setAllStations(list);
        setStations(list.slice(0, 10)); // mặc định 10 trạm đầu
      } catch (e) {
        console.error("Excel load error:", e);
        alert("Không đọc được danh sách trạm từ thamso_khaithac.xlsx");
      }
    })();
  }, []);

  const canLoad = useMemo(
    () => Boolean(start && end && new Date(start) <= new Date(end) && stations.length > 0),
    [start, end, stations]
  );

  // ====== Tải dữ liệu mưa giờ cho các trạm đã chọn ======
  async function handleLoad() {
    if (!canLoad) return;
    setLoading(true);
    try {
      const entries = await Promise.all(
        stations.map(async (s) => {
          const arr = await fetchRainByStation({
            matram: s.code,
            startLocal: start,
            endLocal: end,
            sophut: 60, // mưa giờ
          });
          return [s.id, arr];
        })
      );
      setSeriesByStation(Object.fromEntries(entries));
    } catch (e) {
      console.error(e);
      alert("Tải dữ liệu thất bại. Kiểm tra API/Excel hoặc kết nối mạng!");
    } finally {
      setLoading(false);
    }
  }

  // Tổng cộng toàn bộ trạm
  const totalAll = useMemo(() => {
    return stations.reduce((sum, s) => {
      const arr = seriesByStation[s.id] || [];
      return sum + arr.reduce((a, b) => a + (Number(b.mm) || 0), 0);
    }, 0);
  }, [stations, seriesByStation]);

  return (
    <div className="container">
      {/* Header: KHÔNG còn khung báo động */}
      <div className="header">
        <h2>Web app lượng mưa (trạm tự động)</h2>
        <div className="total">Tổng cộng tất cả trạm: {totalAll.toFixed(1)} mm</div>
      </div>

      {/* Toolbar chọn thời gian & số trạm */}
      <div className="toolbar">
        <div>
          <label>Từ (giờ UTC+7)</label>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div>
          <label>Đến (giờ UTC+7)</label>
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>

        <div>
          <label>Chọn nhóm trạm</label>
          <select
            onChange={(e) => {
              const v = e.target.value;
              if (v === "all") setStations(allStations);
              else if (v === "first10") setStations(allStations.slice(0, 10));
              else setStations(allStations.slice(0, 5)); // default: 5 trạm đầu
            }}
          >
            <option value="first5">5 trạm đầu</option>
            <option value="first10">10 trạm đầu</option>
            <option value="all">Tất cả</option>
          </select>
        </div>

        <div>
          <label>&nbsp;</label>
          <button disabled={!canLoad || loading} onClick={handleLoad}>
            {loading ? "Đang tải..." : "Tải dữ liệu"}
          </button>
        </div>

        <div /> {/* cột giãn cách */}
      </div>

      {/* Layout giống app mực nước: bảng trái – biểu đồ phải */}
      <div className="layout">
        <div className="card">
          <h3>Bảng mưa giờ</h3>
          <RainTable stations={stations} seriesByStation={seriesByStation} />
        </div>

        <div className="card right-pane">
          <h3>Đồ thị tổng lượng mưa theo trạm</h3>
          <RainChart stations={stations} seriesByStation={seriesByStation} />
        </div>
      </div>
    </div>
  );
}
