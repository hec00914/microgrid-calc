/* 清單管理（元器件、電價、參數） */
(function () {
  'use strict';
  const T = 'text', N = 'number', B = 'bool', P = 'percent', RO = 'readonly', TA = 'textarea';
  /* 每張清單：path = data 內位置；cols = [欄位, 標題, 型別]；fixed = 不可新增/刪除列 */
  const LISTS = [
    { group: '光電', id: 'panels', title: '太陽能板', path: 'panels', hint: '品名會自動組成「廠牌 瓦數W (VPC)」。板材單價依「太陽能板品牌單價」計算。',
      cols: [['brand', '廠牌', T], ['watt', '瓦數(W)', N], ['vpc', 'VPC認證', B], ['model', '型號', T], ['lengthMm', '長(mm)', N], ['widthMm', '寬(mm)', N], ['heightMm', '高(mm)', N], ['firstLoss', '首年損耗', P], ['linearLoss', '線性損耗/年', P], ['note', '備註', T]],
      blank: { brand: '', watt: 0, vpc: false, model: '', lengthMm: 0, widthMm: 0, heightMm: 0, firstLoss: 0.01, linearLoss: 0.004, note: '' } },
    { group: '光電', id: 'panelBrandPrices', title: '太陽能板品牌單價', path: 'panelBrandPrices', hint: '單價 = USD/W × 瓦數 × 匯率（僅用於價格細目拆帳）。',
      cols: [['brand', '廠牌', T], ['vpcUsdPerW', '有VPC (USD/W)', N], ['nonVpcUsdPerW', '無VPC (USD/W)', N], ['source', '來源', T]], blank: { brand: '', vpcUsdPerW: null, nonVpcUsdPerW: null, source: '' } },
    { group: '光電', id: 'installMethods', title: '設置方式建置單價', path: 'installMethods', fixed: true, hint: '建置費用(元/kWp) = 基準單價 × (1 + 利潤)。三種設置方式固定。',
      cols: [['name', '設置方式', RO], ['costRef', '對應原檔屋頂形式', RO], ['baseCostPerKwp', '基準建置單價(元/kWp，未含利潤)', N]] },
    { group: '光電', id: 'inverters', title: '逆變器', path: 'inverters', hint: '品名會自動組成「廠牌 功率kW」。售價 = 成本 × (1 + 利潤)。',
      cols: [['brand', '廠牌', T], ['kw', '功率(kW)', N], ['model', '型號', T], ['cost', '成本(元)', N], ['warranty', '保固(年)', N], ['source', '來源', T], ['note', '備註', T]], blank: { brand: '', kw: 0, model: '', cost: 0, warranty: 5, source: '', note: '' } },
    { group: '光電', id: 'pollution', title: '汙染程度與清洗次數', path: 'pollution', cols: [['name', '汙染程度', T], ['times', '每年清洗次數', N], ['desc', '描述', T]], blank: { name: '', times: 1, desc: '' } },
    { group: '光電', id: 'cleaningTiers', title: '清洗報價倍率', path: 'cleaning.tiers', hint: '依建置容量由上往下比對「容量上限」，最後一列留空代表以上全部。',
      cols: [['maxKwp', '容量上限(kWp)', N], ['mult', '倍率', N]], blank: { maxKwp: null, mult: 1 } },
    { group: '儲能', id: 'essList', title: '儲能系統', path: 'essList', hint: '售價 = 成本 × (1 + 利潤)，無條件進位到萬元。',
      cols: [['name', '品名（下拉顯示名稱）', T], ['model', '型號', T], ['kw', '輸出功率(kW)', N], ['kwh', '容量(kWh)', N], ['warranty', '保固(年)', N], ['cost', '建置成本(元/座)', N], ['project', '專案價', B], ['source', '來源', T], ['note', '備註', T]],
      blank: { name: '', model: '', kw: 0, kwh: 0, warranty: 5, cost: 0, project: false, source: '', note: '' } },
    { group: '儲能', id: 'emsList', title: 'EMS 方案', path: 'emsList', hint: '建置費 = (軟體費+建置費用) × (1+利潤)，進位到萬元；保固費 = 軟體費 × 品牌保固比例。',
      cols: [['brand', '廠牌', T], ['plan', '方案', T], ['software', '軟體費(元)', N], ['build', '建置費用(元)', N]], blank: { brand: '', plan: '', software: 0, build: 0 } },
    { group: '儲能', id: 'emsWarranty', title: 'EMS 品牌保固', path: 'emsWarranty', cols: [['brand', '廠牌', T], ['years', '保固年數', N], ['ratio', '每年保固費比例', P], ['note', '說明', T]], blank: { brand: '', years: 0, ratio: 0, note: '' } },
    { group: '充電樁', id: 'chargersSlow', title: '充電樁（慢充）', path: 'chargersSlow', cols: [['brand', '廠牌', T], ['kw', '功率(kW)', N], ['model', '型號', T], ['amps', '電流(A)', N], ['quote', '廠商報價(元/座)', N], ['source', '來源', T], ['note', '備註', T]], blank: { brand: '', kw: 0, model: '', amps: null, quote: 0, source: '', note: '' } },
    { group: '充電樁', id: 'chargersFast', title: '充電樁（快充）', path: 'chargersFast', cols: [['brand', '廠牌', T], ['kw', '功率(kW)', N], ['model', '型號', T], ['amps', '電流(A)', N], ['quote', '廠商報價(元/組)', N], ['source', '來源', T], ['note', '備註', T]], blank: { brand: '', kw: 0, model: '', amps: null, quote: 0, source: '', note: '' } },
    { group: '充電樁', id: 'chargerMgmt', title: '充電樁管理系統', path: 'chargerMgmt', hint: '依慢充/快充廠牌自動帶入；兩者廠牌不同時為「無」。', cols: [['brand', '品牌', T], ['mode', '商品模式', T], ['quote', '廠商報價(元)', N], ['years', '使用年限', N], ['source', '來源', T]], blank: { brand: '', mode: '買斷', quote: 0, years: null, source: '' } },
    { group: '電力雲/融資', id: 'cloudPackages', title: '電力雲套餐', path: 'cloudPackages', cols: [['name', '套餐', T], ['content', '套餐內容', T], ['cost', '成本(元)', N]], blank: { name: '', content: '', cost: 0 } },
    { group: '電力雲/融資', id: 'banks', title: '銀行融資方案', path: 'banks', hint: '下拉名稱會顯示為「銀行(利率)」。每年應付本息依本息平均攤還計算。',
      cols: [['bank', '銀行', T], ['years', '年限', N], ['rate', '年利率', P], ['ratio', '貸款比例', P]], blank: { bank: '', years: 10, rate: 0.025, ratio: 0.8 } },
    { group: '電價', id: 'weather', title: '縣市每 kWp 發電度數', path: 'weather', cols: [['city', '縣市', T], ['kwhPerKwp', '每kWp年發電度數', N]], blank: { city: '', kwhPerKwp: 0 } },
    { group: '電價', id: 'tariffs', title: '廠區用電電價', path: 'tariffs', hint: '原檔由各電費表計算的平均單價（電費計算表 A3:D10）。', cols: [['name', '台電計價方式', T], ['peak', '尖峰(元/度)', N], ['mid', '半尖峰(元/度)', N], ['off', '離峰(元/度)', N]], blank: { name: '', peak: 0, mid: 0, off: 0 } },
    { group: '電價', id: 'essTariffs', title: '儲能放電電價', path: 'essTariffs', hint: '電費計算表 A14:D21；「自發自用節省」標籤引用此表尖峰價。', cols: [['name', '台電計價方式', T], ['peak', '尖峰', N], ['mid', '半尖峰', N], ['off', '離峰', N]], blank: { name: '', peak: 0, mid: 0, off: 0 } },
    { group: '電價', id: 'usageModes', title: '電力利用方式', path: 'usageModes', hint: '1 = 計入、0 = 不計入。',
      cols: [['name', '利用方式', T], ['sell.0', '工作日躉售', N], ['sell.1', '週六躉售', N], ['sell.2', '週日躉售', N], ['self.0', '工作日自用', N], ['self.1', '週六自用', N], ['self.2', '週日自用', N], ['ess.0', '儲能工作日', N], ['ess.1', '儲能週六', N]],
      blank: { name: '', sell: [0, 0, 0], self: [1, 1, 1], ess: [1, 1] } },
    { group: '電價', id: 'fitTiers', title: '躉購費率級距', path: 'fit.tiers', hint: '原檔以「最小的上限 > 容量」那一列為級距（容量取第一列設置方式）。',
      cols: [['min', '下限(kWp)', N], ['max', '上限(kWp)', N], ['rate', '躉購費率(元/度)', N], ['vpcBonus', '高效能模組加成(元/度)', N]], blank: { min: 0, max: 0, rate: 0, vpcBonus: 0 } },
    { group: '電價', id: 'fitRegion', title: '躉購地區加成', path: 'fit.regionBonus', hint: '縣市以「、」分隔。依序比對，符合第一組就套用。', cols: [['rate', '加成比例', P], ['cities', '適用縣市', 'list']], blank: { rate: 0, cities: [] } },
    { group: '儲能效益', id: 'ben1', title: '效益一：契約基本費', path: 'ben1.tables', fixed: true, hint: '超約費用以基本費 2 倍（10% 以內）、3 倍（超過 10%）計。',
      cols: [['tariff', '計價方式', RO], ['summer.0', '夏月經常', N], ['summer.1', '夏月半尖峰', N], ['summer.2', '夏月週六半尖峰', N], ['summer.3', '夏月離峰', N], ['nonSummer.0', '非夏月經常', N], ['nonSummer.1', '非夏月半尖峰', N], ['nonSummer.2', '非夏月週六半尖峰', N], ['nonSummer.3', '非夏月離峰', N]] },
    { group: '儲能效益', id: 'ben2prices', title: '效益二：時間電價', path: 'ben2.prices', hint: '依「年份＋計價方式」查表（年份預設為今年）。新年度請新增列，否則效益二會變成 #N/A 或 0。',
      cols: [['year', '年份', N], ['tariff', '計價方式', T], ['summer.0', '夏月尖峰', N], ['summer.1', '夏月半尖峰', N], ['summer.2', '夏月離峰', N], ['nonSummer.0', '非夏月尖峰', N], ['nonSummer.1', '非夏月半尖峰', N], ['nonSummer.2', '非夏月週六半尖峰', N], ['nonSummer.3', '非夏月離峰', N]],
      blank: { year: new Date().getFullYear(), tariff: '', summer: [null, null, null], nonSummer: [null, null, null, null] } },
    { group: '儲能效益', id: 'ben2groups', title: '效益二：充放電次數與天數', path: 'ben2.groups', cols: [['tariff', '計價方式', T], ['summerCycles', '夏季次數/日', N], ['nonSummerCycles', '非夏季次數/日', N], ['summerDays', '夏季天數', N], ['nonSummerDays', '非夏季天數', N]], blank: { tariff: '', summerCycles: 1, nonSummerCycles: 1, summerDays: 89, nonSummerDays: 109 } },
    { group: '儲能效益', id: 'ben3settle', title: '效益三：容量結清價格', path: 'ben3.settlement', cols: [['month', '月份', T], ['price', '結清價格', N]], blank: { month: '', price: 0 } },
    { group: '其他', id: 'notes', title: '說明文字', path: 'notes', cols: [['title', '標題', T], ['text', '內容', TA]], blank: { title: '', text: '' } }
  ];
  const PARAMS = [
    ['一般', [['weatherYear', '台電統計發電度數年度(民國)', N], ['fit.year', '躉購費率年度(民國)', N], ['taxRate', '營所稅(躉售、憑證交易)', P], ['certPricePerKwh', '綠電憑證每度預估(元)', N], ['carbonFactor', '電力排碳係數(kg CO2e/kWh)', N], ['cloudSubscription', '電力雲訂閱費(元/年)', N]]],
    ['日數（電費表_二段式）', [['days.summerWork', '夏季工作天', N], ['days.nonSummerWork', '非夏季工作天', N], ['days.summerSat', '夏季週六天', N], ['days.nonSummerSat', '非夏季週六天', N], ['days.summerSun', '夏季週日及離峰日', N], ['days.nonSummerSun', '非夏季週日及離峰日', N]]],
    ['其他費用', [['other.certElecRate', '電機技師簽證費(比例)', P], ['other.certStructRate', '結構技師簽證費(比例)', P], ['other.pvLaborRatio', '太陽能安裝工料費(比例)', P], ['other.recyclePerKw', '太陽能模組回收費(元/kW)', N], ['other.evEpcPerGroup', '充電樁EPC(元/組)', N], ['other.evEpcGroupSize', '充電樁EPC每組座數', N], ['other.panelMaintPerYear', '配電盤維護費用(元/年)', N], ['other.maintYears', '維護(保固)年限', N], ['other.genGas', '備用發電機(天然氣)', N], ['other.genDiesel', '備用發電機(柴油)', N], ['cleaning.pricePerKwp', '太陽能板清洗定價(元/kWp/次)', N]]],
    ['儲能效益', [['ben2.coef', '效益二 電價調整係數', N], ['params.ben2Year', '效益二 查表年份（空白=今年）', N], ['ben3.minMwh', '效益三 即時備轉最低容量(MWh)', N], ['ben3.perfFee', '效益三 即時備轉效能費用', N], ['ben3.drUnitPrice', '效益三 每度折讓單價', N], ['ben3.drDays', '效益三 執行天數', N], ['ben3.drCoef', '效益三 預估係數', N]]],
    ['商模參數', [['params.buybackAvgYears', '彈性回購：資方平均獲利年數', N], ['params.buybackRatio', '彈性回購：資方投入金額比例', P], ['params.xaasDownYears', 'XaaS：頭期款分期年數', N]]]
  ];

  let A = null;
  function render() {
    A = window.MGApp; const { S, h, $ } = A;
    const host = $('#page-admin'); host.innerHTML = '';
    const groups = [];
    LISTS.forEach(l => { if (groups.indexOf(l.group) < 0) groups.push(l.group); });
    const nav = h('div', { class: 'admin-nav card' },
      h('div', { class: 'admin-actions' },
        h('button', { class: 'btn', onclick: downloadEnc }, '下載加密資料檔 data.enc.json'),
        h('button', { class: 'btn ghost', onclick: loadFile }, '載入資料檔'),
        h('button', { class: 'btn ghost', onclick: changePw }, '變更密碼'),
        h('button', { class: 'btn ghost danger', disabled: !S.localModified, onclick: async () => { if (confirm('捨棄本機修改，恢復為網站發佈版本？')) { if (await A.resetData()) render(); } } }, '捨棄本機修改'),
        h('button', { class: 'linkbtn', onclick: () => { if (confirm('下載「未加密」的 data.json？\n這個檔案含全部成本資料，只能自己備份，絕對不要上傳到 GitHub。')) A.download('data.json(未加密_勿上傳).json', JSON.stringify(S.data, null, 1)); } }, '匯出未加密備份（勿上傳）')),
      h('p', { class: 'muted' }, S.localModified ? '目前清單已在本機修改（只有這台電腦看得到）。確認無誤後按「下載加密資料檔」，再上傳到 GitHub 取代 data.enc.json，所有人重新整理後即生效。' : '目前使用網站發佈版本。修改後會自動加密暫存在本機。'),
      groups.map(g => h('div', { class: 'admin-group' }, h('div', { class: 'ag-title' }, g), LISTS.filter(l => l.group === g).map(l => h('button', { class: 'admin-link' + (S.adminTab === l.id ? ' on' : ''), onclick: () => { S.adminTab = l.id; render(); } }, l.title)))),
      h('div', { class: 'admin-group' }, h('div', { class: 'ag-title' }, '參數'), h('button', { class: 'admin-link' + (S.adminTab === 'params' ? ' on' : ''), onclick: () => { S.adminTab = 'params'; render(); } }, '試算參數')));
    const main = h('div', { class: 'admin-main' });
    if (S.adminTab === 'params') main.appendChild(paramsEditor()); else main.appendChild(listEditor(LISTS.find(l => l.id === S.adminTab) || LISTS[0]));
    host.appendChild(h('div', { class: 'admin' }, nav, main));
  }

  async function downloadEnc() {
    const { S } = A;
    S.data.meta = Object.assign({}, S.data.meta, { version: new Date().toISOString().slice(0, 10) });
    const env = await A.Store.exportEnvelope(S.data);
    A.download('data.enc.json', JSON.stringify(env));
    A.toast('已下載 data.enc.json，請上傳到 GitHub 取代舊檔', 'ok');
  }
  async function loadFile() {
    const { S } = A;
    const f = await A.pickFile('.json'); if (!f) return;
    let d;
    try { d = JSON.parse(await f.text()); } catch (e) { A.toast('檔案格式不正確', 'bad'); return; }
    if (window.MGCrypto.isEnvelope(d)) {
      try { d = await A.Store.decryptImported(d); }
      catch (e) { const pw = prompt('這個加密檔使用不同密碼，請輸入該檔的密碼：'); if (!pw) return; try { d = await A.Store.decryptImported(d, pw); } catch (e2) { A.toast('密碼錯誤，無法載入', 'bad'); return; } }
    }
    if (!d.panels || !d.tariffs) { A.toast('檔案內容不是試算清單', 'bad'); return; }
    S.data = d; await A.dataChanged(); A.refreshForm(); render(); A.toast('已載入清單', 'ok');
  }
  function changePw() {
    const { h } = A;
    const p1 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: '新密碼（至少 8 碼）' });
    const p2 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: '再輸入一次' });
    const msg = h('div', { class: 'lock-msg' });
    const close = () => dlg.remove();
    const ok = h('button', { class: 'btn', onclick: async () => {
      if (p1.value.length < 8) { msg.textContent = '密碼至少 8 碼'; return; }
      if (p1.value !== p2.value) { msg.textContent = '兩次輸入不一致'; return; }
      ok.disabled = true; ok.textContent = '加密中…';
      const env = await A.Store.changePassword(p1.value, A.S.data);
      A.download('data.enc.json', JSON.stringify(env));
      A.S.localModified = true; await A.dataChanged();
      close(); render();
      alert('密碼已變更，並已下載新的 data.enc.json。\n\n接下來：\n1. 到 GitHub 上傳這個 data.enc.json（取代舊檔）\n2. 把新密碼告訴業務\n\n上傳前，其他人仍使用舊密碼。');
    } }, '變更並下載');
    const dlg = h('div', { class: 'modal' }, h('div', { class: 'modal-box' }, h('h3', null, '變更密碼'),
      h('p', { class: 'muted' }, '會用新密碼重新加密所有清單資料，並下載新的 data.enc.json。'), p1, p2, msg,
      h('div', { class: 'btns', style: 'justify-content:flex-end' }, h('button', { class: 'btn ghost', onclick: close }, '取消'), ok)));
    document.body.appendChild(dlg); p1.focus();
  }

  function changed() { A.dataChanged(); A.refreshForm(); const btn = document.querySelector('.admin-actions .danger'); if (btn) btn.disabled = false; }

  function cellInput(row, c) {
    const { h, getPath, setPath } = A;
    const [k, , t] = c; const v = getPath(row, k);
    const set = val => { setPath(row, k, val); changed(); };
    if (t === RO) return h('span', { class: 'ro' }, v);
    if (t === B) return h('input', { type: 'checkbox', checked: !!v, onchange: e => set(e.target.checked) });
    if (t === P) return h('input', { type: 'number', step: '0.01', value: v === null || v === undefined ? '' : +(v * 100).toFixed(6), oninput: e => set(e.target.value === '' ? null : Number(e.target.value) / 100), title: '%' });
    if (t === N) return h('input', { type: 'number', step: 'any', value: v === null || v === undefined ? '' : v, oninput: e => set(e.target.value === '' ? null : Number(e.target.value)) });
    if (t === 'list') return h('input', { type: 'text', value: (v || []).join('、'), oninput: e => set(e.target.value.split(/[、,，]/).map(x => x.trim()).filter(Boolean)) });
    if (t === TA) return h('textarea', { rows: 3, oninput: e => set(e.target.value) }, v || '');
    return h('input', { type: 'text', value: v === null || v === undefined ? '' : v, oninput: e => set(e.target.value) });
  }

  function listEditor(L) {
    const { S, h, getPath, clone } = A;
    const rows = getPath(S.data, L.path) || [];
    const tbl = h('table', { class: 'grid edit' },
      h('thead', null, h('tr', null, h('th', null, '#'), L.cols.map(c => h('th', { class: c[2] === P ? 'pc' : '' }, c[1] + (c[2] === P ? ' (%)' : ''))), L.fixed ? null : h('th', null, ''))),
      h('tbody', null, rows.map((r, i) => h('tr', null, h('td', { class: 'idx' }, i + 1), L.cols.map(c => h('td', null, cellInput(r, c))),
        L.fixed ? null : h('td', { class: 'acts' },
          h('button', { class: 'icon', title: '上移', disabled: i === 0, onclick: () => { rows.splice(i - 1, 0, rows.splice(i, 1)[0]); changed(); render(); } }, '↑'),
          h('button', { class: 'icon', title: '複製此列', onclick: () => { rows.splice(i + 1, 0, clone(r)); changed(); render(); } }, '⎘'),
          h('button', { class: 'icon danger', title: '刪除', onclick: () => { if (confirm('刪除第 ' + (i + 1) + ' 列？')) { rows.splice(i, 1); changed(); render(); } } }, '✕'))))));
    return h('div', { class: 'card' },
      h('div', { class: 'row-between' }, h('h2', null, L.title), L.fixed ? null : h('button', { class: 'btn sm', onclick: () => { rows.push(clone(L.blank)); changed(); render(); setTimeout(() => { const t = document.querySelector('.admin-main tbody tr:last-child input'); if (t) t.focus(); }, 30); } }, '＋ 新增一列')),
      L.hint ? h('p', { class: 'muted' }, L.hint) : null,
      h('div', { class: 'tscroll' }, tbl),
      h('p', { class: 'muted small' }, '提示：已被案件使用的品項若改名或刪除，開啟舊案件時該欄位會標示紅色，需重新選擇。'));
  }

  function paramsEditor() {
    const { S, h } = A;
    return h('div', { class: 'card' }, h('h2', null, '試算參數'),
      PARAMS.map(([title, fields]) => h('div', { class: 'pgroup' }, h('h4', null, title), h('div', { class: 'pfields' }, fields.map(f => h('label', { class: 'field' }, h('span', { class: 'lbl' }, f[1] + (f[2] === P ? ' (%)' : '')), h('span', { class: 'ctl' }, cellInput(S.data, f))))))));
  }

  window.MGAdmin = { render };
})();
