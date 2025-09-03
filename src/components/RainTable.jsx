import React, { useMemo } from "react";

function mmClass(mm) {
  if (mm < 10) return "mm-black";
  if (mm <= 25) return "mm-green";
  if (mm <= 50) return "mm-purple";
  return "mm-red";
}

export default function RainTable({ stations, seriesByStation }) {
  const times = useMemo(() => {
    const first = stations[0]?.id;
    return first && seriesByStation[first] ? seriesByStation[first].map(d => d.time) : [];
  }, [stations, seriesByStation]);

  const totals = useMemo(() => {
    const res = {};
    stations.forEach(s => {
      const arr = seriesByStation[s.id] || [];
      res[s.id] = arr.reduce((sum, d) => sum + (Number(d.mm) || 0), 0);
    });
    return res;
  }, [stations, seriesByStation]);

  return (
    <div className="table-wrapper">
      <table className="rain-table">
        <thead>
          <tr>
            <th style={{textAlign:'left'}}>Thời điểm</th>
            {stations.map(s => (<th key={s.id}>{s.name}</th>))}
          </tr>
        </thead>
        <tbody>
          {times.map((t, i) => (
            <tr key={t}>
              <td className="time">{t}</td>
              {stations.map(s => {
                const v = seriesByStation[s.id]?.[i]?.mm ?? "";
                return (
                  <td key={s.id + i} className={mmClass(Number(v))}>
                    {v === "" ? "" : Number(v).toFixed(1)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="time"><b>Tổng (mm)</b></td>
            {stations.map(s => (
              <td key={s.id + "_sum"} style={{fontWeight:800, color:"#c1121f"}}>
                {totals[s.id].toFixed(1)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
