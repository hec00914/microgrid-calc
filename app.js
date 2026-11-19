/* 微電網建置效益試算 — 畫面程式 */
(function () {
  'use strict';
  const E = window.MGEngine, Store = window.MGStore;
  const S = { data: null, siteData: null, dataFrom: '', localModified: false, input: null, result: null, caseMeta: null, dirty: false, resTab: 'overview', adminTab: 'panels' };

  /* ---------- 小工具 ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  function h(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'value') n.value = v; else if (k === 'checked') n.checked = !!v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    kids.flat(Infinity).forEach(c => { if (c === null || c === undefined || c === false) return; n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return n;
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  const isNum = v => typeof v === 'number' && isFinite(v);
  function fmt(v, d) { if (typeof v === 'string') return v; if (!isNum(v)) return '#N/A'; return v.toLocaleString('zh-TW', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  const money = v => (isNum(v) ? (v < 0 ? '-$' : '$') + fmt(Math.abs(v)) : fmt(v));
  const pct = (v, d) => isNum(v) ? (v * 100).toFixed(d === undefined ? 1 : d) + '%' : '#N/A';
  function getPath(o, p) { return p.split('.').reduce((a, k) => (a === null || a === undefined) ? undefined : a[k], o); }
  function setPath(o, p, v) { const ks = p.split('.'); let c = o; for (let i = 0; i < ks.length - 1; i++) { if (c[ks[i]] === undefined || c[ks[i]] === null) c[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; c = c[ks[i]]; } c[ks[ks.length - 1]] = v; }
  function toast(msg, kind) { const t = h('div', { class: 'toast ' + (kind || '') }, msg); $('#toasts').appendChild(t); setTimeout(() => t.classList.add('show'), 10); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600); }
  function download(name, content, type) { const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'application/json' }); const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  async function copyText(t) { try { await navigator.clipboard.writeText(t); } catch (e) { const ta = h('textarea', { style: 'position:fixed;left:-9999px' }); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } toast('已複製到剪貼簿', 'ok'); }
  function pickFile(accept) { return new Promise(res => { const i = h('input', { type: 'file', accept }); i.addEventListener('change', () => res(i.files[0])); i.click(); }); }

  /* ---------- 選項來源 ---------- */
  const opt = {
    city: () => S.data.weather.map(w => w.city),
    tariff: () => S.data.tariffs.map(t => t.name),
    usageMode: () => S.data.usageModes.map(u => u.name),
    panel: () => S.data.panels.map(E.panelLabel),
    inverter: () => S.data.inverters.map(E.inverterLabel),
    pollution: () => S.data.pollution.map(p => p.name),
    ess: () => [E.NONE].concat(S.data.essList.map(e => e.name)),
    ems: () => S.data.emsList.map(E.emsLabel),
    slow: () => [E.NONE].concat(S.data.chargersSlow.map(E.chargerLabel)),
    fast: () => [E.NONE].concat(S.data.chargersFast.map(E.chargerLabel)),
    cloudPackage: () => S.data.cloudPackages.map(c => c.name),
    bank: () => ['無'].concat(S.data.banks.map(E.bankLabel))
  };
  const O = E.OPTIONS;

  /* ---------- 表單定義 ---------- */
  const FORM = [
    { id: 'case', title: '案件資訊', fields: [
      { k: 'caseName', l: '案件名稱', t: 'text', ph: '例：宏于樹林廠 微電網' },
      { k: 'salesName', l: '接單業務', t: 'text', req: 1 },
      { k: 'employeeId', l: '員工編號', t: 'text' }] },
    { id: 'client', title: '客戶與用電資料', fields: [
      { k: 'customer', l: '用戶名稱', t: 'text', req: 1 },
      { k: 'city', l: '用戶所在縣市', t: 'select', o: opt.city, req: 1 },
      { k: 'address', l: '用戶地址', t: 'text', wide: 1 },
      { k: 'site', l: '廠房狀態', t: 'select', o: () => O.site, req: 1 },
      { k: 'tariff', l: '台電計價方式', t: 'select', o: opt.tariff, req: 1 },
      { k: 'usageMode', l: '電力利用方式', t: 'select', o: opt.usageMode, req: 1 },
      { k: 'contract', l: '經常契約容量', t: 'number', u: 'kW', req: 1 }] },
    { id: 'pv', title: '光電系統建置評估', toggle: 'pvEnabled', fields: [
      { k: 'panel', l: '太陽能板選擇', t: 'select', o: opt.panel },
      { k: 'inverter', l: '逆變器選擇', t: 'select', o: opt.inverter },
      { k: 'pollution', l: '汙染程度（清洗頻率）', t: 'select', o: opt.pollution },
      { sub: '設置方式與數量（擇一單位填寫，不設置填 0）' },
      { k: 'pvMethods.0.unit', l: '既有浪板屋頂架設－單位', t: 'select', o: () => O.units },
      { k: 'pvMethods.0.value', l: '數量', t: 'number' },
      { k: 'pvMethods.1.unit', l: '平屋頂高架－單位', t: 'select', o: () => O.units },
      { k: 'pvMethods.1.value', l: '數量', t: 'number' },
      { k: 'pvMethods.2.unit', l: '地面高架－單位', t: 'select', o: () => O.units },
      { k: 'pvMethods.2.value', l: '數量', t: 'number' },
      { sub: '光電應用配置比例（預設為宏于用電模擬結果）' },
      { k: 'splitLoad', l: '光電 → 負載', t: 'percent' },
      { k: 'splitEss', l: '光電 → 儲能', t: 'percent' },
      { k: 'splitSell', l: '光電 → 餘電躉售', t: 'percent' }] },
    { id: 'ess', title: '儲能系統建置評估', toggle: 'essEnabled', fields: [
      { k: 'fire', l: '消防安全狀態', t: 'select', o: () => O.fire, wide: 1 },
      { k: 'ess', l: '儲能系統選擇', t: 'select', o: opt.ess },
      { k: 'essQty', l: '數量', t: 'number', u: '座' },
      { k: 'ems', l: 'EMS 廠商（含建置費）', t: 'select', o: opt.ems },
      { sub: '效益一：電費單資訊（有數值才填寫）' },
      { k: 'ben1.midContract', l: '半尖峰契約容量', t: 'number', u: 'kW' },
      { k: 'ben1.satContract', l: '週六半尖峰契約容量', t: 'number', u: 'kW' },
      { k: 'ben1.offContract', l: '週日及離峰日契約容量', t: 'number', u: 'kW' },
      { k: 'ben1.summer.0', l: '夏月 經常契約最高需量', t: 'number', u: 'kW' },
      { k: 'ben1.summer.1', l: '夏月 半尖峰最高需量', t: 'number', u: 'kW' },
      { k: 'ben1.summer.2', l: '夏月 週六半尖峰最高需量', t: 'number', u: 'kW' },
      { k: 'ben1.summer.3', l: '夏月 離峰最高需量', t: 'number', u: 'kW' },
      { k: 'ben1.nonSummer.0', l: '非夏月 經常契約最高需量', t: 'number', u: 'kW' },
      { k: 'ben1.nonSummer.1', l: '非夏月 半尖峰最高需量', t: 'number', u: 'kW' },
      { k: 'ben1.nonSummer.2', l: '非夏月 週六半尖峰最高需量', t: 'number', u: 'kW' },
      { k: 'ben1.nonSummer.3', l: '非夏月 離峰最高需量', t: 'number', u: 'kW' },
      { k: 'ben1.coef', l: '效益一 預估係數', t: 'number', step: '0.05' }] },
    { id: 'ev', title: '充電樁建置評估', toggle: 'evEnabled', fields: [
      { k: 'slow', l: '充電樁（慢）型號', t: 'select', o: opt.slow },
      { k: 'slowQty', l: '裝設數量', t: 'number', u: '座' },
      { k: 'fast', l: '充電樁（快）型號', t: 'select', o: opt.fast },
      { k: 'fastQty', l: '裝設數量', t: 'number', u: '座' }] },
    { id: 'sub', title: '變電站調查（深度節能）', toggle: 'substation', fields: [
      { k: 'transformerState', l: '變壓器現況', t: 'select', o: () => O.transformerState },
      { k: 'hvNameplate', l: '高壓配電盤－銘牌規格文字', t: 'select', o: () => O.hvNameplate, wide: 1 },
      { k: 'hvState', l: '高壓配電盤－物理現況', t: 'select', o: () => O.hvState },
      { k: 'lvState', l: '低壓配電盤－物理現況', t: 'select', o: () => O.lvState },
      { k: 'lvSpare', l: '低壓配電盤－盤內備用空間', t: 'select', o: () => O.yesNo },
      { k: 'roomW', l: '室內寬度', t: 'number', u: 'cm' },
      { k: 'roomD', l: '室內深度', t: 'number', u: 'cm' },
      { k: 'doorW', l: '門寬', t: 'number', u: 'cm' },
      { k: 'substationCost', l: '費用總和（機電技師評估後填寫）', t: 'number', u: '元', wide: 1 }] },
    { id: 'gen', title: '備用發電機組', toggle: 'generator', fields: [
      { k: 'gasLine', l: '廠區是否具備天然氣管線', t: 'select', o: () => O.yesNo }] },
    { id: 'cloud', title: '電力雲建置', toggle: 'cloud', fields: [
      { k: 'cloudNeed', l: '需求狀態', t: 'select', o: () => O.cloudNeed },
      { k: 'cloudPlace', l: '設置位置', t: 'select', o: () => O.cloudPlace },
      { k: 'cloudFloor', l: '安裝樓層／區域', t: 'text' },
      { k: 'cloudReason', l: '建置原因', t: 'select', o: () => O.cloudReason },
      { k: 'cloudPackage', l: '套餐方案', t: 'select', o: opt.cloudPackage }] },
    { id: 'fin', title: '財務與試算參數', fields: [
      { k: 'bank', l: '銀行融資', t: 'select', o: opt.bank },
      { k: 'profit', l: '利潤', t: 'percent' },
      { k: 'fx', l: '美金匯率 (NTD/USD)', t: 'number', step: '0.1' },
      { k: 'insurance', l: '保險費（建置金額 %/年）', t: 'percent' },
      { k: 'mgmtFee', l: '管理費（套利 %/年）', t: 'percent' },
      { k: 'greenShare', l: '企業綠電優惠比例', t: 'percent' },
      { k: 'fitEsc', l: '躉購漲幅 (%/年)', t: 'percent' },
      { k: 'tariffEsc', l: '電價漲幅 (%/年)', t: 'percent' }] }
  ];

  /* ---------- 表單繪製 ---------- */
  function renderForm() {
    const host = $('#form'); host.innerHTML = '';
    FORM.forEach(sec => {
      const on = sec.toggle ? !!S.input[sec.toggle] : true;
      const body = h('div', { class: 'sec-body' + (on ? '' : ' off') });
      sec.fields.forEach(f => body.appendChild(f.sub ? h('div', { class: 'subhead' }, f.sub) : fieldEl(f, !on)));
      const head = h('div', { class: 'sec-head' },
        h('span', { class: 'sec-title' }, sec.title),
        sec.toggle ? h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: on, onchange: ev => { S.input[sec.toggle] = ev.target.checked; markDirty(); renderForm(); recalc(); } }), h('span', { class: 'slider' }), h('span', { class: 'sw-text' }, on ? '評估' : '不評估')) : null);
      host.appendChild(h('section', { class: 'card sec', id: 'sec-' + sec.id }, head, body));
    });
  }
  function fieldEl(f, disabled) {
    const v = getPath(S.input, f.k);
    let input;
    const change = (val) => { setPath(S.input, f.k, val); markDirty(); recalcSoon(); };
    if (f.t === 'select') {
      const list = f.o();
      const missing = v !== undefined && v !== null && v !== '' && list.indexOf(v) < 0;
      input = h('select', { disabled, onchange: ev => change(ev.target.value), class: missing ? 'bad' : '' },
        (missing ? [h('option', { value: v }, v + '（清單中已不存在）')] : []).concat(list.map(o => h('option', { value: o, selected: o === v }, o))));
      if (missing) input.value = v;
      if (window.MGAdmin.hasQuick(f.k)) {
        const add = h('button', { type: 'button', class: 'qa-btn', title: '新增設備／品項到清單', disabled, onclick: () => window.MGAdmin.quickAdd(f.k, label => { setPath(S.input, f.k, label); markDirty(); renderForm(); recalc(); }) }, '＋新增');
        return h('label', { class: 'field' + (f.wide ? ' wide' : '') }, h('span', { class: 'lbl' }, f.l, f.req ? h('em', null, '*') : null), h('span', { class: 'ctl' }, input, add));
      }
    } else if (f.t === 'percent') {
      input = h('input', { type: 'number', step: '0.1', disabled, value: isNum(v) ? +(v * 100).toFixed(6) : '', oninput: ev => change(ev.target.value === '' ? 0 : Number(ev.target.value) / 100) });
    } else if (f.t === 'number') {
      input = h('input', { type: 'number', step: f.step || 'any', disabled, value: v === undefined || v === null ? '' : v, oninput: ev => change(ev.target.value === '' ? 0 : Number(ev.target.value)) });
    } else {
      input = h('input', { type: 'text', disabled, placeholder: f.ph || '', value: v || '', oninput: ev => change(ev.target.value) });
    }
    const unit = f.t === 'percent' ? '%' : f.u;
    return h('label', { class: 'field' + (f.wide ? ' wide' : '') },
      h('span', { class: 'lbl' }, f.l, f.req ? h('em', null, '*') : null),
      h('span', { class: 'ctl' }, input, unit ? h('span', { class: 'unit' }, unit) : null));
  }

  /* ---------- 計算 ---------- */
  let timer = null;
  function recalcSoon() { clearTimeout(timer); timer = setTimeout(recalc, 250); }
  function recalc() {
    try { S.result = E.compute(S.input, S.data); }
    catch (err) { console.error(err); S.result = null; $('#results').innerHTML = ''; $('#results').appendChild(h('div', { class: 'card err' }, '計算發生錯誤：' + err.message)); return; }
    renderResults();
  }
  function markDirty() { S.dirty = true; updateCaseBar(); }

  /* ---------- 結果 ---------- */
  const RES_TABS = [['overview', '總覽'], ['plans', '四種商模'], ['cash', '20年現金流'], ['cost', '建置明細'], ['ess', '儲能效益'], ['text', '提案文字']];
  function renderResults() {
    const R = S.result, host = $('#results'); host.innerHTML = '';
    if (!R) return;
    const T = R.totals;
    host.appendChild(h('div', { class: 'kpis' },
      kpi('總建置金額（含利潤）', money(T.B99), '元'),
      kpi('預期年度發電量', fmt(R.pv.F10), '度/年'),
      kpi('綜合收益（15年平均）', money(R.pv.F16), '元/年'),
      kpi('預期回本年限（低利融資）', T.F78, '年', true),
      kpi('月繳（' + (T.bankYears || 0) + '年）', money(T.F77), '元'),
      kpi('抵碳效益', R.pv.F17, '公噸/年')));
    const warn = [];
    R.warnings.forEach(w => warn.push(w));
    if (!isNum(R.ben2.D39) && S.input.essEnabled && S.input.ess !== E.NONE) warn.push('效益二：找不到「' + R.ben2.year + '-' + S.input.tariff + '」的時間電價，Excel 會顯示 #N/A。請到「清單管理 → 效益二 時間電價」新增該年度資料。');
    if (!isNum(R.fitRate) && S.input.pvEnabled) warn.push('躉購費率查不到級距（原檔依第一列「既有浪板屋頂架設」容量判斷）。');
    if (warn.length) host.appendChild(h('div', { class: 'card warnbox' }, h('strong', null, '注意'), h('ul', null, warn.map(w => h('li', null, w)))));
    const tabs = h('div', { class: 'tabs res-tabs', role: 'tablist' }, RES_TABS.map(([id, l]) => h('button', { class: 'tab' + (S.resTab === id ? ' on' : ''), role: 'tab', onclick: () => { S.resTab = id; renderResults(); } }, l)));
    host.appendChild(tabs);
    const body = h('div', { class: 'res-body' });
    ({ overview: resOverview, plans: resPlans, cash: resCash, cost: resCost, ess: resEss, text: resText })[S.resTab](body, R);
    host.appendChild(body);
  }
  function kpi(label, value, unit, accent) { return h('div', { class: 'kpi' + (accent ? ' accent' : '') }, h('div', { class: 'kpi-l' }, label), h('div', { class: 'kpi-v' }, value, h('small', null, ' ' + unit))); }
  function kvTable(title, rows) {
    return h('div', { class: 'card' }, h('h3', null, title), h('table', { class: 'kv' }, h('tbody', null, rows.filter(Boolean).map(r => h('tr', { class: r[3] || '' }, h('th', null, r[0]), h('td', null, r[1]), h('td', { class: 'u' }, r[2] || ''))))));
  }

  function resOverview(b, R) {
    const T = R.totals, pv = R.pv;
    b.appendChild(h('div', { class: 'grid2' },
      kvTable('太陽光電建置', [
        ['地區', S.input.city], ['台電' + S.data.weatherYear + '年統計每kWp發電度數', fmt(pv.F7), '度'],
        ['建置數量', fmt(pv.pieces) + ' 片'], ['建置容量', fmt(pv.F8, 2), 'kWp'], ['逆變器數量', fmt(pv.F9), '台'],
        ['預估設置面積', fmt(pv.F18, 1), 'm²'], ['預期年度發電量', fmt(pv.F10), '度/年'],
        ['全額躉售收益（' + E.text(R.fitRate, '##0.0#') + '元/度）', money(pv.F11), '元/年'],
        ['自發自用節省（' + E.text(R.rates.essPeak, '##0.0###') + '元/度）', money(pv.F12), '元/年'],
        ['餘電躉售收益（' + E.text(R.fitRate, '##0.0#') + '元/度）', money(pv.F13), '元/年'],
        ['儲能套利收益', money(pv.F14), '元/年'],
        ['販賣綠電憑證（' + S.data.certPricePerKwh + '元/度）', money(pv.F15), '元/年'],
        ['綜合收益', money(pv.F16), '元/年', 'hl'], ['抵碳效益', pv.F17, '公噸/年']]),
      kvTable('總建置效益評估', [
        ['太陽光電建置成本', money(pv.F6), '元'], ['儲能系統建置成本', money(R.essCalc.F31), '元'], ['充電樁建置成本', money(R.ev.F41), '元'],
        ['電力雲建置費', money(R.other.F69), '元'], S.input.substation ? ['變電站（深度節能）', money(T.B88), '元'] : null,
        S.input.generator ? ['備用發電機組', money(T.B89), '元'] : null,
        ['建置金額合計（含利潤）', money(T.B99), '元', 'hl'],
        [S.input.bank === '無' ? '銀行融資：無' : '銀行融資（' + T.bankYears + '年，利率 ' + pct(T.bankRate, 2) + '）', '', ''],
        ['總投入本金（' + pct(1 - T.bankRatio) + '）', money(T.F76), '元'], ['銀行借款', money(T.B106), '元'],
        ['總建置成本（未稅，含利息）', money(T.F75), '元'], ['月繳', money(T.F77), '元'],
        ['預期回本年限', T.F78, '年', 'hl'], ['單次清洗太陽能板費用', money(R.other.D79), '元']])));
    b.appendChild(cashChart(R));
  }

  /* 累積淨現金流圖（四種商模） */
  function cashChart(R) {
    const yrs = R.years.map(y => y.year);
    const series = [
      { name: '企業低利融資（企業）', color: '#2a78d6', v: R.years.map(y => y.r114) },
      { name: '企業零出資（資方）', color: '#eb6834', v: R.tableA.slice(1).map(r => r.V - r.T) },
      { name: '彈性回購（企業）', color: '#1baf7a', v: R.tableB.slice(1).map(r => r.K - r.I) },
    ];
    const all = series.flatMap(s => s.v).filter(isNum);
    const card = h('div', { class: 'card chart-card' }, h('h3', null, '累積淨現金流（20年）'), h('p', { class: 'muted' }, '各方案累積獲利扣除投入／應繳金額；越過 0 線即為回本。XaaS 的累積數字與低利融資相同（只差在前2年繳款方式），故不另畫。'));
    if (!all.length) { card.appendChild(h('p', null, '無法繪圖（數值含 #N/A）')); return card; }
    const W = 760, H = 300, m = { l: 64, r: 150, t: 12, b: 30 };
    let lo = Math.min(0, ...all), hi = Math.max(0, ...all);
    const step = niceStep((hi - lo) / 5); lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const x = i => m.l + (i) * (W - m.l - m.r) / (yrs.length - 1), yv = v => m.t + (hi - v) * (H - m.t - m.b) / (hi - lo);
    const NS = 'http://www.w3.org/2000/svg';
    const s = (tag, at) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); return e; };
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': '四種商模累積淨現金流折線圖' });
    for (let v = lo; v <= hi + 1e-6; v += step) {
      svg.appendChild(s('line', { x1: m.l, x2: W - m.r, y1: yv(v), y2: yv(v), class: Math.abs(v) < 1e-6 ? 'zero' : 'grid' }));
      const t = s('text', { x: m.l - 8, y: yv(v) + 4, class: 'axis', 'text-anchor': 'end' }); t.textContent = (v / 1e4).toLocaleString('zh-TW') + '萬'; svg.appendChild(t);
    }
    yrs.forEach((yr, i) => { if (yr === 1 || yr % 5 === 0) { const t = s('text', { x: x(i), y: H - 8, class: 'axis', 'text-anchor': 'middle' }); t.textContent = '第' + yr + '年'; svg.appendChild(t); } });
    const ends = [];
    series.forEach(se => {
      const d = se.v.map((v, i) => isNum(v) ? (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + yv(v).toFixed(1) : '').join('');
      svg.appendChild(s('path', { d, fill: 'none', stroke: se.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      const lv = se.v[se.v.length - 1]; if (isNum(lv)) ends.push({ y: yv(lv), se });
    });
    ends.sort((a, b) => a.y - b.y); for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    ends.forEach(e => { const t = s('text', { x: W - m.r + 8, y: e.y + 4, class: 'endlbl' }); t.textContent = e.se.name.replace(/（.*）/, ''); svg.appendChild(t); });
    const cross = s('line', { y1: m.t, y2: H - m.b, class: 'cross', visibility: 'hidden' }); svg.appendChild(cross);
    const dots = series.map(se => { const c = s('circle', { r: 4, fill: se.color, stroke: '#fff', 'stroke-width': 2, visibility: 'hidden' }); svg.appendChild(c); return c; });
    const hit = s('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' }); svg.appendChild(hit);
    const tip = h('div', { class: 'tip', hidden: true });
    const wrap = h('div', { class: 'chart-wrap' }, svg, tip);
    function move(ev) {
      const pt = svg.getBoundingClientRect(); const px = (ev.clientX - pt.left) * W / pt.width;
      const i = Math.max(0, Math.min(yrs.length - 1, Math.round((px - m.l) / ((W - m.l - m.r) / (yrs.length - 1)))));
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
      series.forEach((se, k) => { const v = se.v[i]; if (isNum(v)) { dots[k].setAttribute('cx', x(i)); dots[k].setAttribute('cy', yv(v)); dots[k].setAttribute('visibility', 'visible'); } });
      tip.hidden = false; tip.innerHTML = '';
      tip.appendChild(h('div', { class: 'tip-h' }, '第' + yrs[i] + '年'));
      series.forEach(se => tip.appendChild(h('div', { class: 'tip-r' }, h('i', { style: 'background:' + se.color }), h('span', null, se.name), h('b', null, money(se.v[i])))));
      const left = x(i) * pt.width / W; tip.style.left = (left > pt.width / 2 ? left - tip.offsetWidth - 12 : left + 12) + 'px';
    }
    hit.addEventListener('mousemove', move); hit.addEventListener('mouseleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dots.forEach(d => d.setAttribute('visibility', 'hidden')); });
    card.appendChild(h('div', { class: 'legend' }, series.map(se => h('span', null, h('i', { style: 'background:' + se.color }), se.name))));
    card.appendChild(wrap);
    return card;
  }
  function niceStep(raw) { if (!(raw > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(raw))); const n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

  function planCard(title, tag, blocks, texts) {
    return h('div', { class: 'card plan' }, h('div', { class: 'plan-h' }, h('h3', null, title), tag ? h('span', { class: 'badge' }, tag) : null),
      blocks.map(([sub, rows]) => h('div', null, sub ? h('h4', null, sub) : null, h('table', { class: 'kv' }, h('tbody', null, rows.map(r => h('tr', { class: r[3] || '' }, h('th', null, r[0]), h('td', null, r[1]), h('td', { class: 'u' }, r[2] || ''))))))),
      texts.map(t => textBlock(t[0], t[1])));
  }
  function resPlans(b, R) {
    const T = R.totals, A = R.planA, B = R.planB, C = R.planC;
    b.appendChild(h('div', { class: 'grid2' },
      planCard('企業低利融資方案', '回本 ' + T.F78 + ' 年', [[null, [
        ['銀行融資', S.input.bank === '無' ? '無' : T.bankYears + ' 年', ''], ['利率', pct(T.bankRate, 2), ''],
        ['總建置成本', money(T.F75), '元'], ['總投入本金', money(T.F76), '元'], ['月繳', money(T.F77), '元'], ['預期回本年限', T.F78, '年', 'hl']]]],
        [['方案說明', R.text.planLoan]]),
      planCard('企業零出資方案', '資方回本 ' + A.F153 + ' 年', [
        ['企業獲利', [['企業自發自用 ' + pct(S.input.greenShare, 0) + ' 套利', money(A.F142), '元/年']]],
        ['資方獲利與成本', [['企業自發自用 ' + pct(1 - S.input.greenShare, 0) + ' 套利（企業支付）', money(A.F146), '元/年'], ['綠電憑證販售', money(A.F147), '元/年'],
          ['儲能（電價差）套利', money(A.F148), '元/年'], ['儲能（需量反應＋即時備轉）收益', money(A.F149), '元/年'],
          ['總建置成本', money(A.F152), '元'], ['預期回本年限', A.F153, '年', 'hl']]]],
        [['企業說明', R.text.planZeroCorp], ['資方說明', R.text.planZeroInv]]),
      planCard('企業零出資，彈性回購方案', '企業 ' + B.F185 + ' 年／資方 ' + B.F198 + ' 年', [
        ['企業獲利與成本', [['獲利（1–5年）：企業自發自用10%套利', money(B.F176), '元/年'], ['獲利（6–20年）：自發自用100%套利', money(B.F178), '元/年'],
          ['綠電憑證販售', money(B.F179), '元/年'], ['儲能（電價差）套利', money(B.F180), '元/年'], ['儲能（需量反應＋即時備轉）收益', money(B.F181), '元/年'],
          ['總建置成本（第6年回購）', money(B.F184), '元'], ['預期回本年限', B.F185, '年', 'hl']]],
        ['資方獲利與成本', [['（1–5年）企業自發自用90%套利', money(B.F189), '元/年'], ['綠電憑證販售', money(B.F190), '元/年'], ['儲能（電價差）套利', money(B.F191), '元/年'],
          ['儲能（需量反應＋即時備轉）收益', money(B.F192), '元/年'], ['第6年企業回購（建置費80%＋2年平均收益）', money(B.F195), '元'],
          ['總建置成本', money(B.F197), '元'], ['預期回本年限', B.F198, '年', 'hl']]]],
        [['企業說明', R.text.planBuyCorp], ['資方說明', R.text.planBuyInv]]),
      planCard('企業零頭期款方案（XaaS）', '回本 ' + C.F228 + ' 年', [[null, [
        ['銀行融資', S.input.bank === '無' ? '無' : T.bankYears + ' 年', ''], ['利率', pct(T.bankRate, 2), ''],
        ['總建置成本', money(C.F225), '元'], ['前' + C.S152 + '年月繳', money(C.F226), '元'], ['之後月繳', money(C.F227), '元'], ['預期回本年限', C.F228, '年', 'hl']]]],
        [['方案說明', R.text.planXaas]])));
  }

  const CASH_COLS = [
    ['年度', y => '第' + y.year + '年'], ['發電量(度)', y => fmt(y.gen)], ['自發自用節省', y => money(y.selfSave)], ['躉售/餘電躉售', y => money(y.r27 + y.r33 + y.r39 + y.surplusSell)],
    ['營所稅', y => money(-y.r42)], ['綠電憑證(張)', y => fmt(y.certs)], ['憑證收入(稅後)', y => money(y.r52 - y.r53)], ['光電套利', y => money(y.r55)],
    ['儲能套利', y => money(y.r74)], ['維運/保險/管理', y => money(y.costs)], ['套利總額', y => money(y.r101)], ['應繳本息', y => money(-y.r109)],
    ['年度獲利', y => money(y.r113)], ['累積(扣除應繳總額)', y => money(y.r112)]];
  function resCash(b, R) {
    b.appendChild(h('div', { class: 'card' }, h('h3', null, '20 年逐年現金流（企業低利融資）'),
      h('div', { class: 'tscroll' }, h('table', { class: 'grid' }, h('thead', null, h('tr', null, CASH_COLS.map(c => h('th', null, c[0])))),
        h('tbody', null, R.years.map(y => h('tr', { class: y.r112 > 0 ? 'pos' : '' }, CASH_COLS.map(c => h('td', null, c[1](y))))))))));
    const tb = R.tableB.slice(1);
    b.appendChild(h('div', { class: 'card' }, h('h3', null, '各方案逐年累積'),
      h('div', { class: 'tscroll' }, h('table', { class: 'grid' }, h('thead', null, h('tr', null, ['年度', '零出資：企業累積', '零出資：資方累積', '回購：企業累積', '回購：資方累積', 'XaaS：年繳', 'XaaS：年度獲利', 'XaaS：累積套利'].map(t => h('th', null, t)))),
        h('tbody', null, tb.map((r, i) => { const a = R.tableA[i + 1]; return h('tr', null, h('td', null, '第' + r.year + '年'), h('td', null, money(a.R)), h('td', null, money(a.V)), h('td', null, money(r.K)), h('td', null, money(r.P)), h('td', null, money(r.S)), h('td', null, money(r.U)), h('td', null, money(r.V))); }))))));
  }

  function resCost(b, R) {
    const B = R.breakdown;
    const sec = (title, rows, total) => h('tbody', null, h('tr', { class: 'grp' }, h('td', { colspan: 4 }, title), h('td', null, money(total))),
      rows.map(r => h('tr', null, h('td', null, r.item), h('td', null, money(r.unit)), h('td', null, fmt(r.qty, Number.isInteger(r.qty) ? 0 : 2)), h('td', null, r.uom), h('td', null, money(r.total)))));
    b.appendChild(h('div', { class: 'card' }, h('h3', null, '價格細目（未稅）'),
      h('div', { class: 'tscroll' }, h('table', { class: 'grid cost' }, h('thead', null, h('tr', null, ['項目', '單價(元)', '數量', '單位', '複價(元)'].map(t => h('th', null, t)))),
        sec('太陽光電建置', B.pv, B.pvSum), sec('儲能系統建置', B.ess, B.essSum), sec('充電樁建置', B.ev, B.evSum), sec('額外徵收費用及系統建置（保固10年）', B.extra, B.extraSum),
        h('tfoot', null, h('tr', null, h('td', { colspan: 4 }, '總價（未稅）'), h('td', null, money(B.total))))))));
    b.appendChild(h('div', { class: 'grid2' },
      kvTable('單位成本（含利潤）', [['建置 kWp 成本', money(R.pv.costPerKwp), '元/kWp'], ['鋼構 kWp 成本', money(R.pv.steelPerKwp), '元/kWp'], ['PV kWp 成本', money(R.pv.pvPerKwp), '元/kWp'], ['儲能 kWh 成本', money(R.essCalc.costPerKwh), '元/kWh']]),
      kvTable('其他費用', [['太陽能模組回收費（分10年繳能源署，不列入成本）', money(B.recycleFee), '元'], ['太陽能板清洗', money(R.other.N30), '元/年'], ['EMS 保固費', money(R.essCalc.R8), '元/年'], ['電力雲訂閱費', money(R.other.cloudSub), '元/年']])));
    b.appendChild(kvTable('設置方式明細', R.methods.map(m => [m.name, fmt(m.pieces, 0) + ' 片／' + fmt(m.area, 1) + ' m²／' + fmt(m.kwp, 2) + ' kWp', money(m.cost) + ' 元'])));
  }

  function resEss(b, R) {
    const e = R.essCalc;
    b.appendChild(h('div', { class: 'grid2' },
      kvTable('儲能系統', [['系統', S.input.ess], ['型號', R.ess.model || '—'], ['功率', fmt(e.C4), 'kW'], ['容量', fmt(e.D4), 'kWh'], ['儲能本體（含利潤）', money(e.G4), '元/座'],
        ['EMS 建置費', money(e.H4), '元'], ['儲能總建置費用（含利潤）', money(e.F31), '元', 'hl'], ['建置 kWh 成本', money(e.costPerKwh), '元/kWh']]),
      kvTable('儲能效益', [['超約節約（效益一）', fmt(e.F34, 2), '元/年（原檔單位）'], ['削峰填谷電價差套利（效益二）', money(e.F35), '元/年'], ['需量反應＋即時備轉收益（效益三）', money(e.F36), '元/年'], ['儲能套利收益', money(R.pv.F14), '元/年', 'hl']]),
      kvTable('效益一：控制超約', [['經常契約超約10%門檻', fmt(R.ben1.B8, 1), 'kW'], ['夏月超約費用總計', money(R.ben1.E15), '元'], ['非夏月超約費用總計', money(R.ben1.E30), '元'], ['可節省', fmt(R.ben1.B18, 4), '萬元']]),
      kvTable('效益二：時間電價套利（' + R.ben2.year + '年）', R.ben2.groups.map(g => [g.tariff, '價差 ' + fmt(g.spreadSummer, 2) + ' / ' + fmt(g.spreadNon, 2), money(g.total) + ' 元', g.tariff === S.input.tariff ? 'hl' : ''])),
      kvTable('效益三：需量反應＋即時備轉', [['可參與即時備轉', R.ben3.A2 ? '是（≥1 MWh）' : '否（< 1 MWh）'], ['歷年容量結清價格平均', fmt(R.ben3.D3, 2), '元/MW‧h'], ['即時備轉年收益', money(R.ben3.G3), '元'], ['負載管理措施－日選二時型', money(R.ben3.G22), '元'], ['總獲益', money(R.ben3.G24), '元', 'hl']])));
  }

  function textBlock(title, t) {
    return h('div', { class: 'tblock' }, h('div', { class: 'tblock-h' }, h('span', null, title), h('button', { class: 'btn sm ghost', onclick: () => copyText(t) }, '複製')), h('pre', null, t || '（無內容）'));
  }
  function resText(b, R) {
    const t = R.text;
    const all = [['太陽光電設置說明', t.pvSpec], ['光電收益說明', t.pvIncome], ['儲能效益', t.essBenefit], ['能源管理服務', t.essService], ['儲能專案報價', t.essQuote], ['保固說明', t.warranty],
      ['企業低利融資方案', t.planLoan], ['企業零出資方案－企業', t.planZeroCorp], ['企業零出資方案－資方', t.planZeroInv], ['彈性回購方案－企業', t.planBuyCorp], ['彈性回購方案－資方', t.planBuyInv], ['企業零頭期款方案（XaaS）', t.planXaas]];
    b.appendChild(h('div', { class: 'card' }, h('div', { class: 'row-between' }, h('h3', null, '提案文字'), h('button', { class: 'btn sm', onclick: () => copyText(all.map(a => '【' + a[0] + '】\n' + (a[1] || '')).join('\n\n')) }, '全部複製')),
      h('div', { class: 'tgrid' }, all.map(a => textBlock(a[0], a[1])))));
  }

  /* ---------- 案件列 ---------- */
  function updateCaseBar() {
    const m = S.caseMeta;
    $('#caseState').textContent = (m ? '案件 ' + m.id + '（第' + m.version + '版）' : '新案件（未儲存）') + (S.dirty ? '・有未儲存的修改' : '');
  }
  async function saveCase() {
    if (!S.input.customer) { toast('請先填寫用戶名稱', 'bad'); return; }
    if (!S.input.salesName) { toast('請先填寫接單業務', 'bad'); return; }
    const c = Object.assign({}, S.caseMeta || {}, { input: clone(S.input), summary: summaryOf(S.result), items: clone(window.MGAdmin.collectItems(S.input)) });
    try { const saved = await Store.saveCase(c); S.caseMeta = { id: saved.id, version: saved.version, createdAt: saved.createdAt }; S.dirty = false; updateCaseBar(); toast('已儲存案件 ' + saved.id, 'ok'); }
    catch (e) { toast('儲存失敗：' + e.message, 'bad'); }
  }
  function summaryOf(R) { if (!R) return {}; return { total: R.totals.B99, kwp: R.pv.F8, payback: R.totals.F78, yearly: R.pv.F16 }; }
  function newCase() { if (S.dirty && !confirm('目前的修改尚未儲存，確定要開新案件？')) return; S.input = E.defaultCase(); S.input.customer = ''; S.input.address = ''; S.caseMeta = null; S.dirty = false; showPage('calc'); renderForm(); recalc(); updateCaseBar(); }
  function openCase(c, asCopy) {
    const n = window.MGAdmin.restoreItems(c.items);
    if (n) { window.MGApp.dataChanged(); toast('已從案件帶入 ' + n + ' 筆設備資料到清單', 'ok'); }
    S.input = Object.assign(E.defaultCase(), clone(c.input));
    S.caseMeta = asCopy ? null : { id: c.id, version: c.version, createdAt: c.createdAt };
    if (asCopy) S.input.caseName = (S.input.caseName || '') + '（複本）';
    S.dirty = !!asCopy; showPage('calc'); renderForm(); recalc(); updateCaseBar();
  }

  /* ---------- 案件紀錄頁 ---------- */
  async function renderCases() {
    const host = $('#page-cases'); host.innerHTML = '';
    const list = await Store.listCases();
    const q = (S.caseQuery || '').trim();
    const shown = list.filter(c => !q || JSON.stringify([c.id, c.input.caseName, c.input.customer, c.input.salesName]).indexOf(q) >= 0);
    host.appendChild(h('div', { class: 'card' },
      h('div', { class: 'row-between' }, h('h2', null, '案件紀錄'), h('div', { class: 'btns' },
        h('input', { type: 'search', placeholder: '搜尋客戶／業務／案號', value: q, oninput: ev => { S.caseQuery = ev.target.value; clearTimeout(S.qt); S.qt = setTimeout(renderCases, 200); } }),
        h('button', { class: 'btn ghost', onclick: async () => download('微電網案件紀錄_' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(await Store.listCases(), null, 1)) }, '匯出全部'),
        h('button', { class: 'btn ghost', onclick: async () => { const f = await pickFile('.json'); if (!f) return; try { const n = await Store.importCases(JSON.parse(await f.text())); toast('已匯入，新增 ' + n + ' 筆', 'ok'); renderCases(); } catch (e) { toast('匯入失敗：檔案格式不正確', 'bad'); } } }, '匯入'))),
      h('p', { class: 'muted' }, '案件存在這台電腦的瀏覽器中（GitHub 版本沒有共用資料庫）。換電腦或清除瀏覽資料前，請先「匯出全部」備份。'),
      shown.length ? h('div', { class: 'tscroll' }, h('table', { class: 'grid cases' },
        h('thead', null, h('tr', null, ['案號', '案件名稱', '用戶名稱', '業務', '建置容量', '建置金額', '回本年限', '更新時間', ''].map(t => h('th', null, t)))),
        h('tbody', null, shown.map(c => h('tr', null, h('td', null, c.id, h('small', null, ' v' + (c.version || 1))), h('td', null, c.input.caseName || '—'), h('td', null, c.input.customer), h('td', null, c.input.salesName),
          h('td', null, fmt((c.summary || {}).kwp, 2) + ' kWp'), h('td', null, money((c.summary || {}).total)), h('td', null, (c.summary || {}).payback || '—'),
          h('td', null, new Date(c.updatedAt).toLocaleString('zh-TW', { hour12: false })),
          h('td', { class: 'acts' }, h('button', { class: 'btn sm', onclick: () => openCase(c) }, '開啟'), h('button', { class: 'btn sm ghost', onclick: () => openCase(c, true) }, '複製'),
            h('button', { class: 'btn sm danger', onclick: async () => { if (confirm('確定刪除案件 ' + c.id + '？')) { await Store.deleteCase(c.id); if (S.caseMeta && S.caseMeta.id === c.id) { S.caseMeta = null; updateCaseBar(); } renderCases(); } } }, '刪除')))))))
        : h('p', { class: 'empty' }, list.length ? '沒有符合的案件' : '尚無案件。在「試算」頁填寫後按「儲存案件」。')));
  }

  /* ---------- 匯出 Excel / 列印 ---------- */
  function exportExcel() {
    const R = S.result; if (!R) return;
    if (!window.XLSX) { toast('Excel 元件載入失敗', 'bad'); return; }
    const wb = XLSX.utils.book_new();
    const add = (name, aoa, widths) => { const ws = XLSX.utils.aoa_to_sheet(aoa); if (widths) ws['!cols'] = widths.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); };
    const inRows = [['欄位', '內容']];
    FORM.forEach(sec => { inRows.push(['【' + sec.title + '】' + (sec.toggle ? (S.input[sec.toggle] ? '評估' : '不評估') : ''), '']); sec.fields.forEach(f => { if (f.sub) return; inRows.push([f.l, getPath(S.input, f.k)]); }); });
    add('輸入資料', inRows, [34, 40]);
    const T = R.totals, pv = R.pv, A = R.planA, B = R.planB, C = R.planC;
    add('結果摘要', [['項目', '數值', '單位'],
      ['建置容量', pv.F8, 'kWp'], ['逆變器數量', pv.F9, '台'], ['預期年度發電量', pv.F10, '度/年'], ['躉購費率', R.fitRate, '元/度'],
      ['全額躉售收益', pv.F11, '元/年'], ['自發自用節省', pv.F12, '元/年'], ['餘電躉售收益', pv.F13, '元/年'], ['儲能套利收益', pv.F14, '元/年'], ['販賣綠電憑證', pv.F15, '元/年'], ['綜合收益', pv.F16, '元/年'], ['抵碳效益', pv.F17, '公噸/年'],
      ['太陽光電建置成本', pv.F6, '元'], ['儲能系統建置成本', R.essCalc.F31, '元'], ['充電樁建置成本', R.ev.F41, '元'], ['電力雲建置費', R.other.F69, '元'], ['建置金額合計', T.B99, '元'],
      ['總建置成本(含利息)', T.F75, '元'], ['總投入本金', T.F76, '元'], ['月繳', T.F77, '元'], ['預期回本年限', T.F78, '年'],
      [], ['【企業零出資】企業平均年獲利', A.F142, '元/年'], ['資方總建置成本', A.F152, '元'], ['資方回本年限', A.F153, '年'],
      ['【彈性回購】回購費用', B.F184, '元'], ['企業回本年限', B.F185, '年'], ['資方回本年限', B.F198, '年'],
      ['【XaaS】前2年月繳', C.F226, '元'], ['之後月繳', C.F227, '元'], ['回本年限', C.F228, '年']], [30, 18, 10]);
    add('20年現金流', [CASH_COLS.map(c => c[0])].concat(R.years.map(y => ['第' + y.year + '年', y.gen, y.selfSave, y.r27 + y.r33 + y.r39 + y.surplusSell, -y.r42, y.certs, y.r52 - y.r53, y.r55, y.r74, y.costs, y.r101, -y.r109, y.r113, y.r112])), [8].concat(Array(13).fill(14)));
    const bk = R.breakdown, brows = [['項目', '單價(元)', '數量', '單位', '複價(元)']];
    [['太陽光電建置', bk.pv, bk.pvSum], ['儲能系統建置', bk.ess, bk.essSum], ['充電樁建置', bk.ev, bk.evSum], ['額外徵收費用及系統建置', bk.extra, bk.extraSum]].forEach(([t, rows, s]) => { brows.push([t, '', '', '小計', s]); rows.forEach(r => brows.push([r.item, r.unit, r.qty, r.uom, r.total])); });
    brows.push(['總價(未稅)', '', '', '', bk.total]);
    add('建置明細', brows, [44, 14, 10, 8, 16]);
    const t = R.text;
    add('提案文字', [['段落', '內容'], ['太陽光電設置說明', t.pvSpec], ['光電收益說明', t.pvIncome], ['儲能效益', t.essBenefit + '\n' + t.essService + '\n' + t.essQuote], ['保固說明', t.warranty], ['企業低利融資方案', t.planLoan], ['企業零出資－企業', t.planZeroCorp], ['企業零出資－資方', t.planZeroInv], ['彈性回購－企業', t.planBuyCorp], ['彈性回購－資方', t.planBuyInv], ['XaaS', t.planXaas]], [22, 90]);
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    download((S.input.customer || '試算') + '_微電網效益試算_' + new Date().toISOString().slice(0, 10) + '.xlsx', new Blob([out], { type: 'application/octet-stream' }));
  }
  function printReport() {
    const R = S.result; if (!R) return;
    const host = $('#print'); host.innerHTML = '';
    host.appendChild(h('div', { class: 'p-head' }, h('h1', null, '微電網建置效益試算報告'), h('div', null, (S.input.customer || '') + '　｜　業務：' + (S.input.salesName || '') + '　｜　' + new Date().toLocaleDateString('zh-TW') + (S.caseMeta ? '　｜　案號 ' + S.caseMeta.id : ''))));
    const b = h('div'); resOverview(b, R); host.appendChild(b);
    const p = h('div', { class: 'pbreak' }); resPlans(p, R); host.appendChild(p);
    const c = h('div', { class: 'pbreak' }); resCost(c, R); host.appendChild(c);
    const t = h('div', { class: 'pbreak' }); resText(t, R); host.appendChild(t);
    host.appendChild(h('p', { class: 'muted' }, '此服務建議投資回報評估，為參台電公告之購電基準進行評估，實際發電效率仍因地區氣候及建築地形不同而改變。'));
    setTimeout(() => window.print(), 100);
  }

  /* ---------- 頁面切換 ---------- */
  function showPage(p) {
    $$('.page').forEach(x => x.hidden = x.id !== 'page-' + p);
    $$('.nav button').forEach(b => b.classList.toggle('on', b.dataset.page === p));
    if (p === 'cases') renderCases(); if (p === 'admin') window.MGAdmin.render(); if (p === 'notes') renderNotes();
    window.scrollTo(0, 0);
  }
  function renderNotes() {
    const host = $('#page-notes'); host.innerHTML = '';
    host.appendChild(h('div', { class: 'card' }, h('h2', null, '計算說明與假設'), h('p', { class: 'muted' }, '內容取自原 Excel「說明」工作表，可在「清單管理 → 說明文字」修改。'),
      h('dl', { class: 'notes' }, (S.data.notes || []).map(n => [h('dt', null, n.title), h('dd', null, n.text)]))));
  }
  function updateDataBanner() {
    const bn = $('#dataBanner'); bn.innerHTML = '';
    if (!S.localModified) { bn.hidden = true; return; }
    bn.hidden = false;
    bn.appendChild(h('span', null, S.siteData ? '⚠ 目前使用「本機修改過」的清單與參數，其他業務看不到。要讓所有人生效，請到「清單管理」下載 data.enc.json 並上傳到 GitHub。' : '⚠ 密碼已在本機變更，但網站上的 data.enc.json 還是舊密碼。請把新的 data.enc.json 上傳到 GitHub。'));
    bn.appendChild(h('button', { class: 'btn sm ghost', onclick: () => showPage('admin') }, '前往清單管理'));
  }

  /* ---------- 對外（給 admin.js 用） ---------- */
  window.MGApp = {
    S, h, $, $$, fmt, money, pct, getPath, setPath, toast, download, pickFile, clone, Store,
    async dataChanged() { S.localModified = true; await Store.saveLocalData(S.data); updateDataBanner(); recalc(); },
    async resetData() {
      if (!S.siteData) { toast('網站上的資料檔使用不同密碼，無法還原；請重新登入或先上傳新的 data.enc.json', 'bad'); return false; }
      await Store.clearLocalData(); S.data = clone(S.siteData); S.localModified = false; updateDataBanner(); renderForm(); recalc(); return true;
    },
    refreshForm() { renderForm(); }
  };

  /* ---------- 密碼鎖 ---------- */
  function showLock(msg) {
    const box = $('#lock'); box.hidden = false;
    const pw = $('#lockPw'); pw.value = ''; setTimeout(() => pw.focus(), 50);
    $('#lockMsg').textContent = msg || '';
  }
  async function onUnlock(ev) {
    ev.preventDefault();
    const pw = $('#lockPw').value, btn = $('#lockBtn');
    if (!pw) return;
    btn.disabled = true; btn.textContent = '解鎖中…'; $('#lockMsg').textContent = '';
    try { const r = await Store.unlock(pw, $('#lockRemember').checked); $('#lock').hidden = true; start(r); }
    catch (e) { $('#lockMsg').textContent = '密碼錯誤，請再試一次。'; $('#lockPw').select(); }
    finally { btn.disabled = false; btn.textContent = '解鎖'; }
  }

  /* ---------- 啟動 ---------- */
  function start(r) {
    S.siteData = r.siteData; S.data = clone(r.localData || r.siteData); S.localModified = !!r.localData;
    S.input = E.defaultCase();
    $('#ver').textContent = '資料版本 ' + ((S.data.meta || {}).version || '');
    $('#app').hidden = false;
    updateDataBanner(); renderForm(); recalc(); updateCaseBar(); showPage('calc');
  }
  async function init() {
    $$('.nav button[data-page]').forEach(b => b.addEventListener('click', () => showPage(b.dataset.page)));
    $('#btnNew').addEventListener('click', newCase);
    $('#btnSave').addEventListener('click', saveCase);
    $('#btnExcel').addEventListener('click', exportExcel);
    $('#btnPrint').addEventListener('click', printReport);
    $('#btnReset').addEventListener('click', () => { if (confirm('將所有欄位恢復為預設範例（宏于電機）？')) { S.input = E.defaultCase(); markDirty(); renderForm(); recalc(); } });
    $('#btnLogout').addEventListener('click', () => { if (S.dirty && !confirm('目前的修改尚未儲存，確定要登出？')) return; S.dirty = false; Store.logout(); location.reload(); });
    $('#lockForm').addEventListener('submit', onUnlock);
    window.addEventListener('beforeunload', ev => { if (S.dirty) { ev.preventDefault(); ev.returnValue = ''; } });
    if (!window.crypto || !window.crypto.subtle) { showLock('此瀏覽器不支援加密功能，請改用新版 Chrome／Edge，並以 https 網址開啟。'); $('#lockBtn').disabled = true; return; }
    const info = await Store.loadEnvelopes();
    if (!info.site && !info.local) { showLock('找不到資料檔 data.enc.json，請確認已上傳到網站。'); return; }
    const r = await Store.autoUnlock();
    if (r) start(r); else showLock();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
