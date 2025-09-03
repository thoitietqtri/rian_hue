import React, { useEffect, useMemo, useState } from "react";
import RainTable from "./components/RainTable.jsx";
import RainChart from "./components/RainChart.jsx";
import { fetchRainByStation } from "./api/client.js";
import { readStationsFromExcel } from "./utils/excelLoader.js";

// load Excel from public
const excelUrl = "/thamso_khaithac.xlsx";

function toLocalInputValue(dt) {
  const s = new Date(dt.getTime() - dt.getTimezoneOffset()*60000).toISOString();
  return s.slice(0,16);
}

export default function App() {
  const [allStations, setAllStations] = useState([]);
  const [stations, setStations] = useState([]);
  const [start, setStart] = useState(() => {
    const t = new Date(); t.setHours(t.getHours()-24,0,0,0);
    return toLocalInputValue(t);
  });
  const [end, setEnd] = useState(() => toLocalInputValue(new Date()));
  const [loading, setLoading] = useState(false);
  const [seriesByStation, setSeriesByStation] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const list = await readStationsFromExcel(excelUrl);
        // Lọc các dòng có tab=MUA nếu có cột 'tab'
        const filtered = list.filter(s => !s.tab || String(s.tab).toUpperCase() === 'MUA');
        const mapped = filtered.map(s => ({
          id: s.matram || s.id || s.code,
          code: s.matram || s.code || s.id,
          name: s.tentram || s.name || s.matram
        }));
        setAllStations(mapped);
        setStations(mapped.slice(0, 10));
      } catch (e) {
        console.error('Excel load error', e);
        alert('Không đọc được thamso_khaithac.xlsx');
      }
    })();
  }, []);

  const canLoad = useMemo(() => start && end && new Date(start) <= new Date(end) && stations.length>0, [start,end,stations]);

  async function handleLoad() {
    if (!canLoad) return;
    setLoading(true);
    try {
      const entries = await Promise.all(stations.map(async s => {
        const arr = await fetchRainByStation({ matram: s.code, startLocal: start, endLocal: end, sophut: 60 });
        return [s.id, arr];
      }));
      setSeriesByStation(Object.fromEntries(entries));
    } catch (e) {
      console.error(e);
      alert('Tải dữ liệu thất bại. Kiểm tra API hoặc dữ liệu Excel.');
    } finally {
      setLoading(false);
    }
  }

  const totalAll = useMemo(() => {
    return stations.reduce((sum, s) => {
      const arr = seriesByStation[s.id] || [];
      return sum + arr.reduce((a,b)=>a+(Number(b.mm)||0),0);
    }, 0);
  }, [stations, seriesByStation]);

  return (
    <div className="container">
      <div className="header">
        <h2>Web app lượng mưa (trạm tự động)</h2>
        <div className="total">Tổng cộng tất cả trạm: {totalAll.toFixed(1)} mm</div>
      </div>

      <div className="toolbar">
        <div>
          <label>Từ (giờ UTC+7)</label>
          <input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} />
        </div>
        <div>
          <label>Đến (giờ UTC+7)</label>
          <input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} />
        </div>
        <div>
          <label>Chọn nhóm trạm</label>
          <select onChange={e=>{
            const v = e.target.value;
            if (v==='all') setStations(allStations);
            else if (v==='first10') setStations(allStations.slice(0,10));
            else setStations(allStations.slice(0,5));
          }}>
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
        <div />
      </div>

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
