// public/chart-inline.js
(() => {
  /* =============== 0) CSS =============== */
  const css = `
  .wl-wrap{margin-top:12px;border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#fff}
  .wl-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
  .wl-btn{padding:6px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;font-size:13px;cursor:pointer}
  .wl-btn[disabled]{opacity:.5;cursor:not-allowed}
  .wl-btn.active{background:#2563eb;color:#fff;border-color:#2563eb}
  .wl-msg{font-size:12px;color:#64748b}
  .wl-svg{width:100%;height:330px;display:block}
  .wl-axis text{font-size:11px;fill:#334155}
  .wl-grid{stroke:#e2e8f0;stroke-dasharray:3 3}
  .wl-line{fill:none;stroke:#0ea5e9;stroke-width:2}
  .wl-dot{fill:#0ea5e9}
  .wl-tip{position:absolute;pointer-events:none;background:#111827;color:#fff;padding:6px 8px;border-radius:6px;font-size:12px;transform:translate(-50%,-120%);white-space:nowrap}
  .wl-rel{position:relative}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* =============== 1) Helpers =============== */
  const DBG = () => (window.WL_DEBUG === true);
  const log = (...a) => { if (DBG()) console.log('[WL]', ...a); };

  const norm = s => (s||'').toString()
    .normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/\s+/g,' ').trim().toLowerCase();

  function parseTime(s) {
    if (!s) return NaN;
    s = String(s).trim();
    // 1) 2025-08-27 07:00[:00]
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(s)) return new Date(s.replace(' ','T')).getTime();
    // 2) 27/08/2025 07:00[:00]
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) { const [,dd,mm,yy,HH,MM,SS='00']=m; return new Date(`${yy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T${HH}:${MM}:${SS}`).getTime(); }
    // 3) 27-08-2025 07:00[:00]
    m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) { const [,dd,mm,yy,HH,MM,SS='00']=m; return new Date(`${yy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T${HH}:${MM}:${SS}`).getTime(); }
    // 4) ISO
    const t = Date.parse(s);
    return isNaN(t) ? NaN : t;
  }

  // Các tiêu đề KHÔNG coi là trạm
  const IGNORE_HEADERS = new Set([
    'tt','stt','ten song','tên sông','song',
    'ten tram','tên trạm','tram','trạm',
    'ghi chu','ghi chú','i','ii','iii','bd1','bd2','bd3',
    'cap','cap bao dong','cap bao dong (m)','cap bao dong(m)',
    'so tram','số trạm'
  ]);

  /* =============== 2) Chọn đúng bảng thời gian =============== */
  function scoreTable(tbl) {
    const body = tbl.tBodies?.[0] || tbl;
    const rows = Array.from(body.rows).slice(0, 80);
    const cols = rows[0]?.cells?.length || 0;
    if (!rows.length || !cols) return 0;

    // nếu có thead chứa "thời gian/thoi gian" → cộng điểm lớn
    let headHit = 0;
    if (tbl.tHead && tbl.tHead.rows.length) {
      const hd = Array.from(tbl.tHead.rows[tbl.tHead.rows.length-1].cells).map(th=>norm(th.textContent));
      if (hd.some(h => h.includes('thoi gian') || h.includes('thời gian') || h === 'time')) headHit = 10;
    }

    const hits = new Array(cols).fill(0);
    for (const r of rows) {
      for (let c=0;c<cols;c++) {
        const txt = (r.cells[c]?.textContent || '').trim();
        if (!isNaN(parseTime(txt))) hits[c]++;
      }
    }
    const best = Math.max(...hits);
    if (best < 3) return 0;

    const sizeBonus = Math.log1p(rows.length * cols);
    const score = best + sizeBonus + headHit;
    if (DBG()) log('scoreTable=', score, 'hits=', hits);
    return score;
  }

  function pickMainTable() {
    if (window.WL_TABLE_SELECTOR) {
      const el = document.querySelector(window.WL_TABLE_SELECTOR);
      if (el) { log('Using selector', window.WL_TABLE_SELECTOR); return el; }
      console.warn('[WL] Không thấy', window.WL_TABLE_SELECTOR, '→ dò tự động.');
    }
    const tables = Array.from(document.querySelectorAll('table'));
    if (!tables.length) return null;
    let bestTbl = null, bestScore = 0;
    for (const t of tables) {
      const s = scoreTable(t);
      if (s > bestScore) { bestScore = s; bestTbl = t; }
    }
    log('pickMainTable done. bestScore=', bestScore, bestTbl);
    return bestTbl;
  }

  /* =============== 3) Đọc bảng → series theo trạm =============== */
  function parseTable(tbl) {
    const thead = tbl.tHead;
    const headRow = thead?.rows?.[thead.rows.length-1] || null;
    let headers = [];
    if (headRow) headers = Array.from(headRow.cells).map(th=>th.textContent.trim());
    else if (tbl.rows.length) headers = Array.from(tbl.rows[0].cells).map(th=>th.textContent.trim());
    const headersNorm = headers.map(norm);

    const body = tbl.tBodies?.[0] || tbl;
    const allRows = Array.from(body.rows);
    const rows = headRow ? allRows : allRows.slice(1); // nếu không có thead, bỏ dòng đầu làm header

    // --- Tìm cột thời gian ---
    let timeCol = headersNorm.findIndex(h => h.includes('thoi gian') || h.includes('thời gian') || h === 'time');
    if (timeCol < 0) {
      // dựa theo dữ liệu
      const sampleRows = rows.slice(0, 120);
      const cols = (sampleRows[0]?.cells?.length || 0);
      const hits = new Array(cols).fill(0);
      for (const r of sampleRows) {
        for (let c=0;c<cols;c++) {
          const txt = (r.cells[c]?.textContent || '').trim();
          if (!isNaN(parseTime(txt))) hits[c]++;
        }
      }
      const bestHits = Math.max(...hits);
      timeCol = hits.findIndex(h => h === bestHits && bestHits >= 3);
    }
    if (DBG()) log('headers=', headers, 'timeCol=', timeCol);
    if (timeCol < 0) throw new Error('Không tìm thấy cột thời gian.');

    // --- Chọn cột trạm: là cột số & không nằm trong danh sách loại trừ ---
    const isNumericCol = (colIdx) => {
      let cnt=0, total=0;
      for (const r of rows) {
        const raw = (r.cells[colIdx]?.textContent||'').trim().replace(',','.');
        if (raw==='') continue;
        total++;
        if (!isNaN(+raw)) cnt++;
        if (total>=8) break;
      }
      return cnt>=4; // ≥4/8 mẫu là số
    };

    const stationCols = [];
    for (let i=0; i<headers.length; i++) {
      if (i === timeCol) continue;
      const nameNorm = headersNorm[i];
      if (IGNORE_HEADERS.has(nameNorm)) continue;
      if (!isNumericCol(i)) continue;
      stationCols.push({ name: headers[i] || ('Cột '+(i+1)), idx: i });
    }
    if (DBG()) log('stationCols=', stationCols);

    // --- Lấy dữ liệu ---
    const series = stationCols.map(sc => {
      const arr = [];
      for (const tr of rows) {
        const tStr = (tr.cells[timeCol]?.textContent||'').trim();
        const t = parseTime(tStr);
        const vStr = (tr.cells[sc.idx]?.textContent||'').trim().replace(',','.');
        const v = Number(vStr);
        if (!isNaN(t) && Number.isFinite(v)) arr.push({t, y:v});
      }
      const sorted = arr.sort((a,b)=>a.t-b.t);
      const uniq = [];
      for (const p of sorted) {
        if (!uniq.length || uniq[uniq.length-1].t !== p.t) uniq.push(p);
      }
      return { name: sc.name, data: uniq };
    }).filter(s => s.data.length >= 2);

    return { series, headers, timeCol };
  }

  /* =============== 4) Vẽ đồ thị SVG =============== */
  function renderChart(container, series, initName) {
    container.innerHTML = '';

    const wrap = document.createElement('div'); wrap.className = 'wl-wrap wl-rel';
    const toolbar = document.createElement('div'); toolbar.className = 'wl-toolbar';
    const msg = document.createElement('div'); msg.className = 'wl-msg';
    msg.textContent = 'Chọn trạm để xem đồ thị (dữ liệu lấy trực tiếp từ bảng).';
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
      const H = svg.clientHeight || 330;
      const m = {l:48,r:16,t:12,b:26};

      const minX = data[0].t, maxX = data[data.length-1].t;
      let minY = Math.min(...data.map(d=>d.y));
      let maxY = Math.max(...data.map(d=>d.y)); if (minY===maxY) maxY=minY+1;

      const sx = x => m.l + (x-minX)/(maxX-minX)*(W-m.l-m.r);
      const sy = y => H-m.b - (y-minY)/(maxY-minY)*(H-m.t-m.b);

      // grid
      const yTicks = 5, xTicks = Math.min(6, Math.max(1, data.length-1));
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
    let rAF; window.addEventListener('resize', () => { cancelAnimationFrame(rAF); rAF = requestAnimationFrame(update); });
  }

  /* =============== 5) Mount + theo dõi thay đổi =============== */
  function mountUnderTable(tbl) {
    const mount = document.createElement('div');
    tbl.parentNode.insertAdjacentElement('afterend', mount);

    const renderNow = () => {
      try {
        const { series } = parseTable(tbl);
        if (!series.length) {
          mount.innerHTML = '<div class="wl-wrap"><div class="wl-msg">Không tìm thấy dữ liệu thời gian để vẽ đồ thị.</div></div>';
          return;
        }
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

    renderNow();
    const target = tbl.tBodies[0] || tbl;
    const obs = new MutationObserver(() => renderNow());
    obs.observe(target, { childList:true, subtree:true, characterData:true });
  }

  function init() {
  const tryAttach = () => {
    const tbl = pickMainTable();
    if (tbl) { mountUnderTable(tbl); return true; }
    return false;
  };

  // thử gắn ngay
  if (tryAttach()) return;

  // nếu chưa có bảng, theo dõi DOM cho đến khi bảng thời gian xuất hiện rồi gắn
  const obs = new MutationObserver(() => {
    if (tryAttach()) obs.disconnect();
  });
  obs.observe(document.body, { childList: true, subtree: true });
}
