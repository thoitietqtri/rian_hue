// public/chart-inline.js
(() => {
  // ====== CSS gọn (tiêm vào <head>) ======
  const css = `
  .wl-wrap{margin-top:12px;border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#fff}
  .wl-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
  .wl-btn{padding:6px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;font-size:13px;cursor:pointer}
  .wl-btn[disabled]{opacity:.5;cursor:not-allowed}
  .wl-btn.active{background:#2563eb;color:#fff;border-color:#2563eb}
  .wl-msg{font-size:12px;color:#64748b}
  .wl-svg{width:100%;height:320px;display:block}
  .wl-axis text{font-size:11px;fill:#334155}
  .wl-grid{stroke:#e2e8f0;stroke-dasharray:3 3}
  .wl-line{fill:none;stroke:#0ea5e9;stroke-width:2}
  .wl-dot{fill:#0ea5e9}
  .wl-tip{position:absolute;pointer-events:none;background:#111827;color:#fff;padding:6px 8px;border-radius:6px;font-size:12px;transform:translate(-50%,-120%);white-space:nowrap}
  .wl-rel{position:relative}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // ====== Helpers ======
  const norm = s => (s||'').toString()
    .normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/\s+/g,' ').trim().toLowerCase();

  function parseTime(s) {
    if (!s) return NaN;
    s = String(s).trim();
    // 1) 2025-08-28 07:00[:00]
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(s)) return new Date(s.replace(' ','T')).getTime();
    // 2) 28/08/2025 07:00[:00]
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const [ , dd, mm, yy, HH, MM, SS='00'] = m;
      return new Date(`${yy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T${HH}:${MM}:${SS}`).getTime();
    }
    // 3) ISO
    const t = Date.parse(s); return isNaN(t) ? NaN : t;
  }

  function pickMainTable() {
    // Nếu anh muốn chỉ định cụ thể, gán trước window.WL_TABLE_SELECTOR = '#ketqua' trong index.html
    const sel = window.WL_TABLE_SELECTOR;
    if (sel) {
      const el = document.querySelector(sel);
      if (el) return el;
      console.warn('[WL] Không tìm thấy', sel, '→ dùng heuristic.');
    }
    const tables = Array.from(document.querySelectorAll('table'));
    if (!tables.length) return null;
    // chọn bảng có nhiều ô nhất
    return tables.sort((a,b) =>
      (a.rows.length*(a.rows[0]?.cells.length||0)) <
      (b.rows.length*(b.rows[0]?.cells.length||0)) ? 1 : -1
    )[0];
  }

  function parseTable(tbl) {
    const thead = tbl.tHead;
    const headRow = thead?.rows?.[thead.rows.length-1] || null;
    let headers = [];
    if (headRow) headers = Array.from(headRow.cells).map(th=>th.textContent.trim());
    else if (tbl.rows.length) headers = Array.from(tbl.rows[0].cells).map(th=>th.textContent.trim());

    // tìm cột thời gian
    let timeCol = headers.findIndex(h => norm(h).includes('thoi gian') || norm(h)==='time');
    if (timeCol < 0) {
      const sample = tbl.rows[1]?.cells?.length ?? 0;
      for (let c=0;c<sample;c++) {
        const txt = tbl.rows[1].cells[c]?.textContent?.trim();
        if (!txt) continue;
        if (!Number.isNaN(parseTime(txt))) { timeCol=c; break; }
      }
    }
    if (timeCol < 0) throw new Error('Không tìm thấy cột thời gian.');

    // danh sách cột trạm (mọi cột số khác cột thời gian)
    const bodies = tbl.tBodies?.length ? [tbl.tBodies[0]] : [tbl];
    const rows = Array.from(bodies[0].rows).slice(headRow?0:1);

    const isNumericCol = (colIdx) => {
      let cnt=0, total=0;
      for (const r of rows) {
        const raw = (r.cells[colIdx]?.textContent||'').trim().replace(',','.');
        if (raw==='') continue;
        total++;
        if (!isNaN(+raw)) cnt++;
        if (total>=6) break;
      }
      return cnt>=3;
    };

    const candidates = headers.map((h,i)=>i).filter(i=>i!==timeCol && isNumericCol(i));
    const stationCols = candidates.map(i => ({ name: headers[i] || ('Cột '+(i+1)), idx: i }));

    const series = stationCols.map(sc => {
      const arr = [];
      for (const tr of rows) {
        const tStr = (tr.cells[timeCol]?.textContent||'').trim();
        const t = parseTime(tStr);
        const vStr = (tr.cells[sc.idx]?.textContent||'').trim().replace(',','.');
        const v = Number(vStr);
        if (!isNaN(t) && Number.isFinite(v)) arr.push({t, y:v});
      }
      return { name: sc.name, data: arr.sort((a,b)=>a.t-b.t) };
    }).filter(s => s.data.length >= 2);

    return { series, headers, timeCol };
  }

  // ====== Chart (SVG) ======
  function renderChart(container, series, initName) {
    container.innerHTML = '';
    const wrap = document.createElement('div'); wrap.className = 'wl-wrap wl-rel';
    const toolbar = document.createElement('div'); toolbar.className = 'wl-toolbar';
    const msg = document.createElement('div'); msg.className = 'wl-msg';
    msg.textContent = 'Chọn trạm để xem đồ thị. Dữ liệu lấy trực tiếp từ bảng.';
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.classList.add('wl-svg');
    wrap.appendChild(toolbar); wrap.appendChild(msg); wrap.appendChild(svg); container.appendChild(wrap);

    const tip = document.createElement('div'); tip.className='wl-tip'; tip.style.display='none'; wrap.appendChild(tip);

    const names = series.map(s=>s.name);
    let selected = initName && names.includes(initName) ? initName : (names[0]||null);

    names.forEach(n=>{
      const b = document.createElement('button');
      b.textContent = n; b.className = 'wl-btn'+(n===selected?' active':'');
      b.onclick = () => { selected=n; update(); toolbar.querySelectorAll('.wl-btn').forEach(x=>x.classList.toggle('active', x.textContent===n)); };
      toolbar.appendChild(b);
    });

    function update(){
      const sObj = series.find(s=>s.name===selected);
      if(!sObj){ svg.innerHTML=''; return; }
      const data = sObj.data;
      const W = svg.clientWidth || svg.parentNode.clientWidth || 800;
      const H = svg.clientHeight || 320;
      const m = {l:48,r:16,t:12,b:26};

      const minX = data[0].t, maxX = data[data.length-1].t;
      let minY = Math.min(...data.map(d=>d.y));
      let maxY = Math.max(...data.map(d=>d.y)); if (minY===maxY) maxY=minY+1;

      const sx = x => m.l + (x-minX)/(maxX-minX)*(W-m.l-m.r);
      const sy = y => H-m.b - (y-minY)/(maxY-minY)*(H-m.t-m.b);

      // grid
      const yTicks = 5, xTicks = Math.min(6, data.length);
      const yStep=(maxY-minY)/yTicks, xStep=(maxX-minX)/xTicks;
      let g = '';
      for(let i=0;i<=yTicks;i++){ const y=sy(minY+i*yStep); g += `<line class="wl-grid" x1="${m.l}" y1="${y}" x2="${W-m.r}" y2="${y}"/>`; }
      for(let i=0;i<=xTicks;i++){ const x=sx(minX+i*xStep); g += `<line class="wl-grid" x1="${x}" y1="${m.t}" x2="${x}" y2="${H-m.b}"/>`; }

      // path
      let d=`M ${sx(data[0].t)} ${sy(data[0].y)}`; for(let i=1;i<data.length;i++) d+=` L ${sx(data[i].t)} ${sy(data[i].y)}`;

      // ticks text
      let tx='', ty='';
      for(let i=0;i<=xTicks;i++){
        const xV=minX+i*xStep, x=sx(xV); const dt=new Date(xV);
        const lab=(String(dt.getHours()).padStart(2,'0'))+':'+(String(dt.getMinutes()).padStart(2,'0'));
        tx+=`<text x="${x}" y="${H-6}" text-anchor="middle">${lab}</text>`;
      }
      for(let i=0;i<=yTicks;i++){ const yV=minY+i*yStep, y=sy(yV); ty+=`<text x="${m.l-6}" y="${y+4}" text-anchor="end">${yV.toFixed(2)}</text>`; }

      svg.innerHTML = `<g class="wl-axis">${g}</g><path class="wl-line" d="${d}"/><g class="wl-axis">${tx}${ty}</g>`;

      // hover tooltip
      const overlay = document.createElementNS('http://www.w3.org/2000/svg','rect');
      overlay.setAttribute('x', m.l); overlay.setAttribute('y', m.t);
      overlay.setAttribute('width', W-m.l-m.r); overlay.setAttribute('height', H-m.t-m.b); overlay.setAttribute('fill','transparent');
      svg.appendChild(overlay);
      const dot = document.createElementNS('http://www.w3.org/2000/svg','circle'); dot.setAttribute('r',3.5); dot.setAttribute('class','wl-dot'); svg.appendChild(dot);

      overlay.addEventListener('mousemove', (ev)=>{
        const bbox = svg.getBoundingClientRect(), mx = ev.clientX - bbox.left;
        const xVal = minX + (mx-m.l)/(W-m.l-m.r)*(maxX-minX);
        let lo=0, hi=data.length-1; while(hi-lo>1){ const mid=(lo+hi)>>1; (data[mid].t<xVal? lo=mid: hi=mid); }
        const p = (xVal - data[lo].t) < (data[hi].t - xVal) ? data[lo] : data[hi];
        const cx = sx(p.t), cy = sy(p.y);
        dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
        tip.style.display='block'; tip.style.left = (cx)+'px'; tip.style.top=(cy)+'px';
        tip.textContent = `${selected}: ${p.y} (${new Date(p.t).toLocaleString('vi-VN')})`;
      });
      overlay.addEventListener('mouseleave', ()=>{ tip.style.display='none'; });
    }
    update();
  }

  // ====== Mount dưới bảng ======
  function mountUnderTable(tbl) {
    const mount = document.createElement('div');
    tbl.parentNode.insertAdjacentElement('afterend', mount);

    const doRender = () => {
      try {
        const { series } = parseTable(tbl);
        if (!series.length) {
          mount.innerHTML = '<div class="wl-wrap"><div class="wl-msg">Không tìm thấy cột số để vẽ đồ thị.</div></div>';
          return;
        }
        // nếu có select multiple (danh sách trạm), ưu tiên trạm đầu tiên được chọn
        let initName = null;
        const sel = document.querySelector('select[multiple]');
        if (sel) {
          const names = Array.from(sel.selectedOptions || sel.options).map(o=>o.textContent.trim());
          initName = names.find(n => series.some(s=>norm(s.name)===norm(n))) || null;
        }
        renderChart(mount, series, initName);
      } catch (err) {
        console.warn('[WL] parse/render error:', err);
        mount.innerHTML = '<div class="wl-wrap"><div class="wl-msg">Không thể phân tích cấu trúc bảng.</div></div>';
      }
    };

    doRender();
    // Theo dõi khi bảng thay đổi (nhấn "Lấy dữ liệu")
    const target = tbl.tBodies[0] || tbl;
    const obs = new MutationObserver(() => doRender());
    obs.observe(target, { childList:true, subtree:true, characterData:true });
  }

  function init() {
    const tbl = pickMainTable();
    if (!tbl) { console.warn('[WL] Không tìm thấy bảng nào.'); return; }
    mountUnderTable(tbl);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);
})();
