/*
 * 微電網建置效益試算 — 計算引擎
 * 依「2026新微電網建置效益試算_V3.xlsx」公式逐格重現（刻意保留原檔邏輯，不做修正）。
 * 括號內的儲存格位址為原 Excel 對應位置，方便日後對照與修改。
 * Excel 錯誤值（#N/A、#DIV/0!）以 NaN 表示，並在畫面上顯示為 #N/A。
 */
(function (root) {
  'use strict';
  const YEARS = 20;
  const EPS = 1e-9;

  /* ---------- Excel 函數 ---------- */
  function roundUp(x, n) { n = n || 0; const f = Math.pow(10, n); const v = Math.abs(x) * f; return Math.sign(x) * Math.ceil(v - EPS * Math.max(1, v)) / f; }
  function roundDown(x, n) { n = n || 0; const f = Math.pow(10, n); const v = Math.abs(x) * f; return Math.sign(x) * Math.floor(v + EPS * Math.max(1, v)) / f; }
  function xround(x, n) { n = n || 0; const f = Math.pow(10, n); const v = Math.abs(x) * f; return Math.sign(x) * Math.round(v + EPS * Math.max(1, v)) / f; }
  function ceilingMath(x, sig) { return Math.ceil(x / sig - EPS) * sig; }
  function quotient(a, b) { return Math.trunc(a / b); }
  function sum(arr) { return arr.reduce((s, v) => s + v, 0); }
  function avg(arr) { return arr.length ? sum(arr) / arr.length : NaN; }
  function minPositive(arr) { const p = arr.filter(v => v > 0); return p.length ? Math.min.apply(null, p) : 0; }
  function num(v) { if (v === null || v === undefined || v === '') return 0; const n = Number(v); return isNaN(n) ? 0 : n; }

  /* Excel TEXT() 的簡化版，支援本檔用到的格式 */
  function text(value, pattern) {
    if (typeof value !== 'number' || !isFinite(value)) return '#N/A';
    let first = -1, last = -1;
    for (let i = 0; i < pattern.length; i++) { if (pattern[i] === '#' || pattern[i] === '0') { if (first < 0) first = i; last = i; } }
    if (first < 0) return pattern;
    const prefix = pattern.slice(0, first), suffix = pattern.slice(last + 1);
    let spec = pattern.slice(first, last + 1);
    let v = value;
    if ((prefix + suffix).indexOf('%') >= 0) v = v * 100;
    const comma = spec.indexOf(',') >= 0; spec = spec.replace(/,/g, '');
    const dot = spec.indexOf('.');
    const intSpec = dot >= 0 ? spec.slice(0, dot) : spec;
    const decSpec = dot >= 0 ? spec.slice(dot + 1) : '';
    const reqDec = (decSpec.match(/0/g) || []).length, maxDec = decSpec.length;
    const neg = v < 0; v = Math.abs(v);
    let s = xround(v, maxDec).toFixed(maxDec);
    let [ip, dp] = s.split('.'); dp = dp || '';
    while (dp.length > reqDec && dp.endsWith('0')) dp = dp.slice(0, -1);
    const minInt = (intSpec.match(/0/g) || []).length;
    if (ip === '0' && minInt === 0) ip = '';
    if (comma && ip) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    let out = ip + (dp ? '.' + dp : '');
    if (out === '' && neg) return prefix + suffix;
    return (neg && out !== '' ? '-' : '') + prefix + out + suffix;
  }

  /* ---------- 名稱 / 查表 ---------- */
  const panelLabel = p => p.brand + ' ' + p.watt + 'W' + (p.vpc ? ' (VPC)' : '');
  const inverterLabel = p => p.brand + ' ' + p.kw + 'kW';
  const chargerLabel = p => p.brand + ' ' + p.kw + 'kW';
  const emsLabel = e => e.brand + '-' + e.plan;
  const bankLabel = b => b.bank + '(' + text(b.rate, '#0.00%') + ')';
  const SITE_OK = '自有廠房，屋頂合法';
  const FIRE_OK = '符合儲能系統消防安全管理指引';
  const NONE = '不建置';

  function payFactor(rate, years) { const r = rate / 12, n = years * 12; if (r === 0) return 0; const p = Math.pow(1 + r, n); return p * r / (p - 1); }
  function cumInterest(rate, years, pv) { const r = rate / 12, n = years * 12; if (r === 0) return 0; const pmt = pv * payFactor(rate, years); let bal = pv, it = 0; for (let i = 0; i < n; i++) { const int = bal * r; it += int; bal -= (pmt - int); } return it; }

  function defaultCase() {
    return {
      caseName: '', salesName: '', employeeId: '',
      profit: 0.1, fx: 31,
      pvEnabled: true, customer: '宏于電機股份有限公司', city: '新北市', address: '新北市樹林區武林街2-3號',
      site: SITE_OK, tariff: '高中以下(含)高壓二段式', usageMode: '自發自用，餘電躉售', contract: 950,
      panel: '元晶 490W (VPC)', inverter: '士林 125kW', pollution: '自然',
      pvMethods: [{ unit: '安裝面積(坪)', value: 0 }, { unit: '安裝片數', value: 954 }, { unit: '安裝面積(m²)', value: 0 }],
      splitLoad: 0.781, splitEss: 0.065, splitSell: 0.154,
      essEnabled: true, fire: FIRE_OK, ess: '台達電 (125kW/261kWh)', essQty: 1, ems: '智電-光儲充',
      ben1: { midContract: 0, satContract: 0, offContract: 0, summer: [1095, 0, 320, 1066], nonSummer: [0, 0, 0, 0], coef: 0.8 },
      evEnabled: true, slow: '士林 7kW', slowQty: 2, fast: '士林 30kW', fastQty: 2,
      substation: false, transformerState: '10年內/狀況良好', hvNameplate: '包含CNS 15156/IEC 62271/IAC/LSC2B', hvState: '正常(無異音/無鏽蝕)',
      lvState: '正常', lvSpare: '有', roomW: 400, roomD: 300, doorW: 180, substationCost: 500000,
      generator: false, gasLine: '無',
      cloud: true, cloudNeed: '新設需求', cloudPlace: '戶外/屋頂', cloudFloor: '', cloudReason: '取代人工抄表', cloudPackage: '標準',
      bank: '玉山銀行(2.39%)', insurance: 0.01, mgmtFee: 0.01, greenShare: 0.1, fitEsc: 0, tariffEsc: 0.03,
      extraCerts: 0
    };
  }

  const OPTIONS = {
    site: [SITE_OK, '租賃廠房、屋頂不合法'],
    units: ['安裝片數', '安裝面積(m²)', '安裝面積(坪)'],
    fire: [FIRE_OK, '不符合儲能系統消防安全管理指引'],
    transformerState: ['10年內/狀況良好', '15年以上/高損耗(建議更換)', '不清楚(需儀器檢測)'],
    hvNameplate: ['包含CNS 15156/IEC 62271/IAC/LSC2B', '包含CNS 15156/IEC 62271', '包含CNS 3990/金屬閉鎖式', '無上述字樣，但製造年份早於2013年', '銘牌模糊，無法辨識'],
    hvState: ['正常(無異音/無鏽蝕)', '輕微老化(斷路器跳脫次數高)', '嚴重裂化(有放電聲/嚴重鏽蝕)'],
    lvState: ['正常', '過熱(需銅排整頓)', '老舊(需全站汰換)'],
    yesNo: ['有', '無'],
    cloudNeed: ['新設需求', '汰換需求'],
    cloudPlace: ['戶外/屋頂', '地下室/室內'],
    cloudReason: ['取代人工抄表', '即時監控', '合規 ISO 50001', '其他']
  };

  /* ================= 主計算 ================= */
  function compute(inp, D) {
    const R = { warnings: [] };
    const profit = num(inp.profit), fx = num(inp.fx);
    const site = inp.site === SITE_OK;
    const P = D.params || {};

    /* ---- 太陽能板 (太陽能板清單 B6:P8) ---- */
    const panel = D.panels.find(p => panelLabel(p) === inp.panel);
    if (!panel) R.warnings.push('找不到太陽能板：' + inp.panel);
    const pnl = panel || { brand: '', watt: NaN, lengthMm: NaN, widthMm: NaN, firstLoss: NaN, linearLoss: NaN, model: '' };
    const bp = D.panelBrandPrices.find(b => b.brand === pnl.brand);
    const panelUnitPrice = bp ? num(pnl.vpc ? bp.vpcUsdPerW : bp.nonVpcUsdPerW) * pnl.watt * fx : NaN; // 太陽能板清單!L
    const area = pnl.lengthMm * pnl.widthMm;
    const methods = D.installMethods.map((m, i) => {
      const mi = (inp.pvMethods && inp.pvMethods[i]) || { unit: '', value: 0 };
      const val = num(mi.value);
      let J, K;
      if (mi.unit === '安裝片數') { J = roundUp(val * area * 1e-6, 10); K = val; }
      else if (mi.unit === '安裝面積(m²)') { J = val; K = roundUp(J / (area * 1e-6), 0); }
      else if (mi.unit === '安裝面積(坪)') { J = 3.30579 * val; K = 3.30579 * val; }
      else { J = NaN; K = NaN; }
      const L = K * pnl.watt / 1000;
      const costPerKwp = (num(m.baseCostPerKwp) + 0) * (1 + profit);
      return { name: m.name, unit: mi.unit, value: val, area: J, pieces: K, kwp: L, costPerKwp, cost: L * costPerKwp };
    });
    const pvOn = !!inp.pvEnabled;
    const J5 = pvOn ? sum(methods.map(m => m.area)) : 0;
    const K5 = pvOn ? sum(methods.map(m => m.pieces)) : 0;
    const L5 = pvOn ? sum(methods.map(m => m.kwp)) : 0;
    const N5 = pvOn ? sum(methods.map(m => m.cost)) : 0;

    const wx = D.weather.find(w => w.city === inp.city);
    const F7 = site ? (wx ? num(wx.kwhPerKwp) : NaN) : 0;
    methods.forEach(m => { m.yearKwh = F7 * m.kwp; m.co2 = m.yearKwh * D.carbonFactor; });
    const O5 = pvOn ? sum(methods.map(m => m.yearKwh)) : 0;
    const P5 = pvOn ? sum(methods.map(m => m.co2)) : 0;

    const inv = D.inverters.find(v => inverterLabel(v) === inp.inverter);
    const invKw = inv ? inv.kw : NaN;
    const invPrice = inv ? inv.cost * (1 + profit) : NaN;

    const F6 = site ? N5 : 0;
    const F8 = site ? L5 : 0;
    const F9 = site ? (roundDown(F8 / invKw, 0) * invKw * 1.16 < F8 ? roundUp(F8 / invKw, 0) : roundDown(F8 / invKw, 0)) : 0;
    const F10 = site ? F7 * F8 : 0;
    const F18 = J5;

    /* ---- 躉購費率 (電費計算表!O1) — 依原檔以第一列設置方式容量(太陽能板清單!L6)判斷級距 ---- */
    const capL6 = methods[0].kwp;
    const tiers = D.fit.tiers;
    const cand = tiers.filter(t => t.min <= capL6 && t.max > capL6).map(t => t.max);
    const minMax = cand.length ? Math.min.apply(null, cand) : 0;
    const tier = tiers.find(t => t.max === minMax);
    let regionBonus = 0;
    const rb = D.fit.regionBonus || [];
    if (rb[0] && rb[0].cities.indexOf(inp.city) >= 0) regionBonus = rb[0].rate;
    else if (rb[1] && rb[1].cities.indexOf(inp.city) >= 0) regionBonus = rb[1].rate;
    const isVpc = String(inp.panel || '').toUpperCase().indexOf('VPC') >= 0;
    const O1 = tier ? tier.rate * (1 + regionBonus) + (isVpc ? tier.vpcBonus : 0) : NaN;

    /* ---- 電價 (電費計算表 B28:B33) ---- */
    const tr = D.tariffs.find(t => t.name === inp.tariff) || { peak: NaN, mid: NaN, off: NaN };
    const etr = D.essTariffs.find(t => t.name === inp.tariff) || { peak: NaN, mid: NaN, off: NaN };
    const B28r = tr.peak, B29r = tr.mid, B30r = tr.off, B31r = etr.peak, B32r = tr.mid, B33r = etr.off;
    const um = D.usageModes.find(u => u.name === inp.usageMode) || { sell: [NaN, NaN, NaN], self: [NaN, NaN, NaN], ess: [NaN, NaN] };
    const tax = D.taxRate, cert = D.certPricePerKwh;

    const dy = D.days;
    const Q6 = dy.summerWork + dy.nonSummerWork + dy.summerSat + dy.nonSummerSat + dy.summerSun + dy.nonSummerSun;
    const Q4 = dy.summerSat + dy.nonSummerSat, Q5 = dy.summerSun + dy.nonSummerSun, WORK = dy.summerWork + dy.nonSummerWork;

    /* ---- 儲能 (儲能系統清單 A4:K4, R8, T8) ---- */
    const essName = inp.ess;
    const essItem = essName === NONE ? { name: NONE, model: '', kw: 0, kwh: 0, warranty: 0, cost: 0 } : D.essList.find(e => e.name === essName);
    const qty = num(inp.essQty);
    const ems = D.emsList.find(e => emsLabel(e) === inp.ems);
    const emsBrand = ems ? D.emsWarranty.find(w => w.brand === ems.brand) : null;
    const R8 = ems && emsBrand ? ems.software * emsBrand.ratio : NaN;                  // EMS 保固費(元/年)
    const T8 = ems ? roundUp(ems.software + ems.build + (ems.software + ems.build) * profit, -4) : NaN; // EMS 建置費
    const e = essItem || { kw: NaN, kwh: NaN, warranty: NaN, cost: NaN, model: '' };
    const C4 = e.kw * qty, D4 = e.kwh * qty, E4 = e.warranty * qty;
    const G4 = essName === NONE ? 0 : ceilingMath(e.cost * (1 + profit), 10000);
    const H4 = (isFinite(T8) && essName !== NONE) ? T8 : 0;
    const I4 = 0;
    const K4 = inp.essEnabled ? (G4 + H4 + I4) * qty : 0;
    const essCond = inp.fire === FIRE_OK && essName !== NONE;
    const F31 = essCond ? K4 : 0;

    /* ---- 效益一：控制超約 ---- */
    const b1 = inp.ben1 || {};
    const B13 = num(inp.contract), B14 = B13 + num(b1.midContract), B15 = B14 + num(b1.satContract), B16c = B15 + num(b1.offContract);
    const B8 = B13 * 1.1, B9 = B14 * 1.1, B10 = B15 * 1.1, B11 = B16c * 1.1;
    function fee(d, base, thr, rate) { rate = num(rate); d = num(d); if (d - base <= 0) return 0; if (d <= thr) return (d - base) * rate * 2; return (d - thr) * rate * 3 + (thr - base) * rate * 2; }
    const t1 = D.ben1.tables.find(t => t.tariff === inp.tariff);
    let E15 = NaN, E30 = NaN;
    if (t1) {
      const dS = b1.summer || [0, 0, 0, 0], dN = b1.nonSummer || [0, 0, 0, 0], rS = t1.summer, rN = t1.nonSummer;
      let rows;
      if (t1.variant === 'hv2') rows = [fee(dS[0], B13, B8, rS[0]), 0, fee(dS[2], B15, B10, rS[2]), fee(dS[3], B16c, B11, rS[3])];
      else if (t1.variant === 'school2') rows = [fee(dS[0], B13, B8, rS[0]), 0, fee(dS[2], B13, B8, rS[2]), fee(dS[3], B13, B8, rS[3])];
      else rows = [fee(dS[0], B13, B8, rS[0]), fee(dS[1], B14, B9, rS[1]), fee(dS[2], B15, B10, rS[2]), fee(dS[3], B16c, B11, rS[3])];
      E15 = sum(rows);
      E30 = sum([0, 1, 2, 3].map(k => fee(dN[k], B13, B8, rN[k])));
      R.ben1Rows = { summer: rows, nonSummer: [0, 1, 2, 3].map(k => fee(dN[k], B13, B8, rN[k])) };
    }
    const ben1B18 = (E15 + E30) / ((E15 >= 0 ? 1 : 0) + (E30 >= 0 ? 1 : 0)) * num(b1.coef) * 12 * 1e-4; // 單位：萬元（原檔如此）

    /* ---- 效益二：削峰填谷電價差 ---- */
    const year = (D.params && D.params.ben2Year) ? D.params.ben2Year : new Date().getFullYear(); // 原檔 =YEAR(TODAY())
    const B4mwh = D4 * 1e-3;
    function spread(arr) { const v = (arr || []).filter(x => x !== null && x !== undefined && x !== ''); if (!v.length) return 0; return Math.max.apply(null, v) - Math.min.apply(null, v); }
    const ben2Groups = D.ben2.groups.map(g => {
      const pr = D.ben2.prices.find(p => num(p.year) === year && p.tariff === g.tariff);
      const Y = pr ? spread(pr.summer) : NaN, Z = pr ? spread(pr.nonSummer) : NaN;
      const K = B4mwh * 1000 * Y * g.summerCycles * g.summerDays;
      const L = B4mwh * 1000 * Z * g.nonSummerCycles * g.nonSummerDays;
      return { tariff: g.tariff, spreadSummer: Y, spreadNon: Z, summer: K, non: L, total: (K + L) * D.ben2.coef };
    });
    const g2 = ben2Groups.find(g => g.tariff === inp.tariff);
    const ben2D39 = g2 ? g2.total : NaN;

    /* ---- 效益三：需量反應 + 即時備轉 ---- */
    const B3mw = C4 * 1e-3, C3mwh = D4 * 1e-3;
    const A2 = C3mwh >= D.ben3.minMwh ? 1 : 0;
    const D3 = avg(D.ben3.settlement.map(s => num(s.price)));
    const G3 = (B3mw * D3 * 24 * 365 + B3mw * D.ben3.perfFee * 12) * A2;
    const G22 = C3mwh * 1000 * D.ben3.drUnitPrice * D.ben3.drDays * D.ben3.drCoef;
    const G24 = G3 + G22;

    const essAll = essCond && inp.essEnabled;
    const F34 = essAll ? ben1B18 : 0, F35 = essAll ? ben2D39 : 0, F36 = essAll ? G24 : 0;

    /* ---- 充電樁 (充電樁清單 F7) ---- */
    function charger(list, name) { if (name === NONE) return { brand: '無', kw: 0, model: '', price: 0 }; const c = list.find(x => chargerLabel(x) === name); return c ? Object.assign({}, c, { price: num(c.quote) * (1 + profit) }) : { brand: '', price: NaN }; }
    const cs = charger(D.chargersSlow, inp.slow), cf = charger(D.chargersFast, inp.fast);
    const slowQty = num(inp.slowQty), fastQty = num(inp.fastQty);
    const D7 = cs.price * slowQty, D8 = cf.price * fastQty;
    let S7;
    if (cs.brand === cf.brand) S7 = cs.brand; else if (cs.brand === '無' && cf.brand !== '無') S7 = cf.brand; else if (cs.brand !== '無' && cf.brand === '無') S7 = cs.brand; else S7 = '無';
    const mg = D.chargerMgmt.find(m => m.brand === S7);
    const B7ev = mg ? num(mg.quote) * (1 + profit) : 0;
    const B8ev = (D7 + D8) > 0 ? D.other.evEpcPerGroup * roundUp((slowQty + fastQty) / D.other.evEpcGroupSize, 0) : 0;
    const F41 = ((D7 + D8) === 0 || !inp.evEnabled) ? 0 : D7 + D8 + B7ev + B8ev;

    /* ---- 其他 ---- */
    const F56 = num(inp.substationCost);
    const F65 = inp.generator ? (inp.gasLine === '有' ? D.other.genGas : (inp.gasLine === '無' ? D.other.genDiesel : NaN)) : 0;
    const pkg = D.cloudPackages.find(c => c.name === inp.cloudPackage);
    const F69 = inp.cloud ? (pkg ? pkg.cost * (1 + profit) : NaN) : 0;
    const pol = D.pollution.find(p => p.name === inp.pollution);
    const times = pol ? pol.times : NaN;
    const ct = D.cleaning.tiers;
    let mult = ct[ct.length - 1].mult;
    for (const t of ct) { if (t.maxKwp !== null && t.maxKwp !== undefined && t.maxKwp !== '' && L5 <= t.maxKwp) { mult = t.mult; break; } }
    const N30 = L5 * mult * D.cleaning.pricePerKwp * times;
    const D79 = N30 / times;
    const cloudSub = num(D.cloudSubscription);

    /* ---- 總成本評估 ---- */
    const B16 = F6, B19 = F8, B60 = F31, B79 = F41;
    const B88 = inp.substation ? F56 : 0, B89 = inp.generator ? F65 : 0, B93 = F69;
    const B99 = B16 + B60 + B79 + B88 + B89 + B93;
    const B97 = B99, B98 = 0;
    const bank = inp.bank === '無' ? null : D.banks.find(b => bankLabel(b) === inp.bank);
    if (inp.bank !== '無' && !bank) R.warnings.push('找不到銀行方案：' + inp.bank);
    const bankYears = bank ? bank.years : 0, bankRate = bank ? bank.rate : 0, bankRatio = bank ? bank.ratio : 0;
    const B103 = bankRatio, B105 = bankRate;
    const F76 = (1 - bankRatio) * B99;            // 總投入本金
    const B104 = F76;
    const B106 = B103 === 0 ? B104 : B99 - B104; // 銀行借款總額
    const M3 = bank ? B106 * payFactor(bankRate, bankYears) * 12 : 0;  // 每年應繳本息
    const M4 = bank ? cumInterest(bankRate, bankYears, B106) : 0;
    const green = num(inp.greenShare), ins = num(inp.insurance), mgmt = num(inp.mgmtFee);
    const B51 = num(inp.extraCerts);
    const splitLoad = num(inp.splitLoad), splitEss = num(inp.splitEss), splitSell = num(inp.splitSell);

    const Y = [];
    let deg = 1 - pnl.firstLoss;
    let D16 = 0, D17 = 0, D18 = 0;
    for (let i = 0; i < YEARS; i++) {
      const y = { year: i + 1 };
      if (i > 0) deg = deg - pnl.linearLoss;
      y.fit = O1 * Math.pow(1 + num(inp.fitEsc), i);
      y.peak = B28r * Math.pow(1 + num(inp.tariffEsc), i);
      y.mid = B29r * Math.pow(1 + num(inp.tariffEsc), i);
      y.off = B30r * Math.pow(1 + num(inp.tariffEsc), i);
      y.essPeak = B31r * Math.pow(1 + num(inp.tariffEsc), i);
      y.essMid = B32r * Math.pow(1 + num(inp.tariffEsc), i);
      y.essOff = B33r * Math.pow(1 + num(inp.tariffEsc), i);
      y.deg = deg;
      y.kwhPerKwp = F7 * deg;                       // 22
      y.gen = B19 * y.kwhPerKwp;                    // 23
      y.genWork = y.gen * WORK / Q6;                // 24
      if (i === 0) {
        D16 = isFinite(y.genWork / y.gen) ? y.genWork / y.gen : 0;
        D17 = isFinite((y.gen * Q4 / Q6) / y.gen) ? (y.gen * Q4 / Q6) / y.gen : 0;
        D18 = isFinite((y.gen * Q5 / Q6) / y.gen) ? (y.gen * Q5 / Q6) / y.gen : 0;
      }
      y.useWork = y.gen * D16 * splitLoad;          // 25
      y.sellWork = y.gen * D16 * splitSell;         // 26
      y.r27 = y.fit * um.sell[0] * y.genWork;
      y.r28 = um.self[0] * y.peak * (y.useWork >= y.genWork ? y.genWork : y.useWork);
      y.r29 = um.self[0] * y.sellWork * y.fit;
      y.genSat = y.gen * Q4 / Q6;                   // 30
      y.useSat = y.gen * D17 * splitLoad;           // 31
      y.sellSat = y.gen * D17 * splitSell;          // 32
      y.r33 = y.fit * um.sell[1] * y.genSat;
      y.r34 = y.useSat >= y.genSat ? y.mid * um.self[1] * y.genSat : y.mid * um.self[1] * y.useSat;
      y.r35 = um.self[1] * y.sellSat * y.fit;
      y.genSun = y.gen * Q5 / Q6;                   // 36
      y.useSun = y.gen * D18 * splitLoad;           // 37
      y.sellSun = y.gen * D18 * splitSell;          // 38
      y.r39 = y.fit * um.sell[2] * y.genSun;
      y.r40 = y.useSun >= y.genSun ? y.off * um.self[2] * y.genSun : y.off * um.self[2] * y.useSun;
      y.r41 = um.self[2] * y.sellSun * y.fit;
      y.r42 = tax * (y.r27 + y.r29 + y.r33 + y.r35 + y.r39 + y.r41);
      y.selfSave = y.r28 + y.r34 + y.r40;
      y.surplusSell = y.r29 + y.r35 + y.r41;
      y.r43 = y.selfSave * (1 - green) + y.surplusSell - y.r42;   // 資方獲得綠電售價
      y.r44 = y.selfSave * green;                                  // 企業節省電費(套利)
      y.r45 = y.r27 + y.r28 + y.r29 + y.r33 + y.r34 + y.r35 + y.r39 + y.r40 + y.r41 - y.r42;
      y.r47 = um.self[0] * (y.genWork > y.useWork ? y.useWork : y.genWork);
      y.r48 = um.self[1] * (y.genSat > y.useSat ? y.useSat : y.genSat);
      y.r49 = um.self[2] * (y.genSun > y.useSun ? y.useSun : y.genSun);
      y.r50 = y.gen * splitEss;
      y.certs = quotient(y.r47 + y.r48 + y.r49 + y.r50, 1000) + B51;   // 51
      y.r52 = cert * 1000 * y.certs;
      y.r53 = tax * y.r52;
      y.r54 = y.r43 + y.r52 - y.r53;
      y.r55 = y.r45 + y.r52 - y.r53;                // 太陽能(PV)套利金額
      const essFlag = essName !== NONE ? 1 : 0;
      y.r69 = F34 * essFlag; y.r70 = F35 * essFlag; y.r71 = F36 * essFlag;
      y.r72 = (y.r70 + y.r71) * (1 - green);
      y.r73 = y.r69 * green;
      y.r74 = y.r69 + y.r70 + y.r71;                // 儲能套利
      y.r92 = -R8; y.r93 = -cloudSub; y.r94 = -N30;
      y.r95 = -(B16 + B60 + B79 + B88 + B89) * ins;
      y.r96 = -(y.r55 + y.r74) * mgmt;
      y.costs = y.r92 + y.r93 + y.r94 + y.r95 + y.r96;
      y.r100 = y.r54 + y.r74 + y.costs;              // 資方綜合收益
      y.r101 = y.r55 + y.r74 + y.costs;              // 套利總額
      y.r109 = (i + 1) <= bankYears ? M3 : 0;
      Y.push(y);
    }
    const C106 = B105 === 0 ? B106 : sum(Y.map(y => y.r109)) + B104;  // 應繳總額
    let cum = 0, prev112 = -C106;
    Y.forEach(y => {
      cum += y.r101; y.r102 = cum;
      y.r112 = y.r101 + prev112;
      const den = (y.r112 <= 0 ? 0 : y.r101) / 365;
      y.r110 = den === 0 ? NaN : xround(Math.abs(prev112) / den, 0) / 365;
      y.r113 = y.r101 - y.r109;
      y.r114 = -C106 + y.r102;
      prev112 = y.r112;
    });
    const avgY = (key, from, to) => avg(Y.slice(from - 1, to).map(y => y[key]));
    const Z = key => avgY(key, 1, 15);

    // 回本年限 (B115)
    let B115 = '#N/A';
    { const mp = minPositive(Y.map(y => y.r112)); if (mp > 0) { const idx = Y.findIndex(y => y.r112 === mp); B115 = text(Y[idx].year + Y[idx].r110 - 1, '##0.00'); } }
    // 開始還款後套利年 (B116~B118)
    const idx116 = Y.findIndex(y => y.r113 > 0);
    const B116 = idx116 >= 0 ? Y.findIndex(y => y.r113 === Y[idx116].r113) + 1 : '#N/A';
    const B117 = idx116 >= 0 ? Y[B116 - 1].r113 : NaN;
    const B118 = '第' + B116 + '年' + '開始，' + '還款後套利 ' + text(B117, '$#,##0') + '元' + '，並每年提升';

    /* ---- 方案 A：企業低利融資 / 零出資 (總成本評估 H124:W144) ---- */
    const tA = [{ year: 0, I: C106, J: 0, K: 0, L: 0, M: 0, N: 0, O: 0, P: B98, Q: 0, R: 0, S: 0, T: B97, U: 0, V: 0, W: 0 }];
    { let O = 0, Rc = 0, V = 0; Y.forEach(y => { O += y.r101; const Q = y.r44 + y.r73; Rc += Q; V += y.r100; tA.push({ year: y.year, I: (C106 - y.r102 <= 0 ? 0 : C106 - y.r102), J: y.r102, K: y.r109, L: y.r101, M: y.r101 - y.r109, N: y.r114, O, P: B98, Q, R: Rc, S: Rc > B98 ? y.year : 0, T: B97, U: y.r100, V, W: V > B97 ? y.year : 0 }); }); }
    const S123 = minPositive(tA.map(r => r.S));
    const W123 = minPositive(tA.map(r => r.W));
    const R145 = avg(tA.slice(1).map(r => r.Q));
    const V146 = avg(tA.slice(1).map(r => r.U));

    /* ---- 方案 B：彈性回購 (H155:Q175) / 方案 C：XaaS (R155:W175) ---- */
    const K152 = (P.buybackAvgYears !== undefined) ? P.buybackAvgYears : 2;
    const N152 = (P.buybackRatio !== undefined) ? P.buybackRatio : 0.8;
    const M153 = (P.buybackYear !== undefined) ? P.buybackYear : 5;
    const S152 = (P.xaasDownYears !== undefined) ? P.xaasDownYears : 2;
    const P177 = avg(Y.slice(0, 5).map(y => y.r100));             // 資方回購前平均年獲利(1-5年)
    const M155 = B97;
    const J153 = K152 * P177 + M155 * N152;                          // 回購費用
    const V152 = B104 / S152;
    const tB = [{ year: 0, I: 0, J: 0, K: 0, L: 0, M: M155, N: 0, O: 0, P: 0, Q: 0, R: C106, S: 0, T: 0, U: 0, V: 0, W: 0 }];
    { let K = 0, Pc = 0, V = 0; Y.forEach(y => {
      const yr = y.year;
      const I = 0 + (yr > M153 ? J153 : 0);
      const N = y.r100;
      const J = y.r44 + y.r73 + (yr > M153 ? N : 0);
      K += J;
      const L = (yr >= 1 && yr <= 5) ? 0 : (K > I ? yr : 0);       // 原檔第1~5年此欄空白
      const O = yr <= 5 ? y.r100 : (yr === 6 ? J153 : 0);         // 原檔第6年為回購費用，之後空白
      Pc += O;
      const Q = Pc > M155 ? yr : 0;
      const S = yr <= S152 ? V152 : ((Y[yr - S152 - 1] || {}).r109);
      const T = y.r101; V += T;
      tB.push({ year: yr, I, J, K, L, M: M155, N, O, P: Pc, Q, R: C106, S, T, U: T - S, V, W: V > C106 ? yr : 0 });
    }); }
    const L154 = minPositive(tB.map(r => r.L)) - M153;
    const Q154 = minPositive(tB.map(r => r.Q));
    const W154 = minPositive(tB.map(r => r.W));
    const K176 = avg(tB.slice(1, 6).map(r => r.J));
    const K178 = avg(tB.slice(6, 21).map(r => r.J));
    const T177 = avg(tB.slice(1, 11).map(r => r.T));

    /* ---- 用戶狀態評估 F 欄結果 ---- */
    const F11 = site ? O1 * Z('gen') : 0;
    const F12 = site ? Z('r28') + Z('r34') + Z('r40') : 0;
    const F13 = site ? (Z('r27') + Z('r33') + Z('r39') + Z('r29') + Z('r35') + Z('r41')) - Z('r42') : 0;
    const F14 = site ? Z('r74') : 0;
    const F15 = site ? Z('r52') - Z('r53') : 0;
    const F16 = site ? Z('r101') : 0;
    const F17 = site ? text(P5 / 1000, '#,##0.0') : 0;
    const F75 = C106, F77 = M3 / 12, F78 = B115;

    /* ---- 價格細目 ---- */
    const certElec = (F6 > 0 || F31 > 0 || F41 > 0) ? D.other.certElecRate * (B16 + B60) : 0;
    const certStruct = F6 > 0 ? D.other.certStructRate * (B16 + B60) : 0;
    const E4p = panelUnitPrice * K5, E5p = invPrice * F9, E6p = (E4p + E5p) * D.other.pvLaborRatio, E7p = certElec + certStruct, E8p = roundUp(0, -4);
    const E9p = B16 - (E4p + E5p + E6p + E7p + E8p);
    const maint10 = (N30 + num(D.other.panelMaintPerYear)) * D.other.maintYears;   // 其他費用!K16
    const breakdown = {
      pv: [
        { item: '太陽能板 ' + inp.panel + ' ' + pnl.lengthMm + 'x' + pnl.widthMm, unit: panelUnitPrice, qty: K5, uom: 'PCS', total: E4p },
        { item: 'Inverter ' + inp.inverter, unit: invPrice, qty: F9, uom: '台', total: E5p },
        { item: '太陽能板工料費用', unit: E6p, qty: 1, uom: '式', total: E6p },
        { item: '電機\\結構簽證(含送審、台電報竣)', unit: E7p, qty: 1, uom: '式', total: E7p },
        { item: '配電盤工程費用', unit: E8p, qty: 1, uom: '式', total: E8p },
        { item: '鋼構\\五金零料\\施工費用', unit: E9p, qty: 1, uom: '式', total: E9p }],
      ess: [
        { item: essName, unit: G4, qty: qty, uom: '座', total: G4 * qty },
        { item: 'EMS ' + inp.ems, unit: H4, qty: 1, uom: '式', total: H4 },
        { item: '工料費', unit: I4, qty: 1, uom: '式', total: I4 }],
      ev: [
        { item: inp.slow, unit: cs.price, qty: slowQty, uom: '座', total: D7 },
        { item: inp.fast, unit: cf.price, qty: fastQty, uom: '座', total: D8 },
        { item: '充電樁管理系統', unit: B7ev, qty: 1, uom: '式', total: B7ev },
        { item: '充電樁EPC工程', unit: B8ev, qty: 1, uom: '式', total: B8ev }],
      extra: [
        { item: '電力雲系統建置', unit: F69, qty: 1, uom: '式', total: F69 },
        { item: '軟硬體維運費用(含太陽能板清洗)', unit: maint10, qty: 1, uom: '式', total: maint10 }],
      recycleFee: D.other.recyclePerKw * F8
    };
    ['pv', 'ess', 'ev', 'extra'].forEach(k => breakdown[k + 'Sum'] = sum(breakdown[k].map(r => r.total)));
    breakdown.total = breakdown.pvSum + breakdown.essSum + breakdown.evSum + breakdown.extraSum;

    /* ---- 文字 ---- */
    const NL = '\n';
    const emsW = D.emsWarranty.find(w => String(inp.ems || '').indexOf(w.brand) >= 0);
    const txt = {};
    txt.pvSpec = '客戶名稱：' + inp.customer + NL + '設置地點：' + inp.city + inp.address + NL + '設置面積：' + text(F18, '#,##0') + '平方公尺' + NL +
      '設置方法：' + NL + methods.map(m => m.pieces !== 0 ? m.name + ' ' + Number(m.kwp.toPrecision(15)) + 'kWp' + NL : '').join('') +
      '模組規格：' + NL + pnl.model + '（發電量：' + pnl.watt + 'Wp ） ' + NL + (inv ? inv.model : '#N/A') + text(F9, ' ( #台 )') + NL +
      '預計鋪設 ' + text(K5, '#,##0') + '片，總容量達到 ' + text(F8, '#,##0.00') + ' kWp。' + NL + NL + NL + '預期發電量：' + NL + text(F10, '#,##0') + '度/年' + NL + text(F10 / 365, '##0.00') + '度/日';
    txt.pvIncome = '依據台電' + D.weatherYear + '年收購電量估算' + NL + inp.usageMode + NL + '年發電量 ' + text(F10, '#,##0') + ' 度' + NL + '全額躉售收益 ' + text(F11, '$#,##0') + '元。' + NL +
      '(自用\\躉售\\販售綠電憑證)收益 ' + text(F16, '$#,##0') + '元。' + NL + '抵碳效益每年 ' + (typeof F17 === 'string' ? F17 : text(F17, '#,##0.0')) + '公噸。' + NL + NL +
      '總建置成本： ' + text(F75, '$#,##0') + ' 元。\n回本年限 ' + F78 + '年。\n成本包含:\n電機\\結構技師簽證、資料送審、台電報竣、太陽光電模組回收費(能源署)。';
    const A22 = F34 > 0 ? '控制超約節省約 NTD ' + text(ben1B18 / 1e4, '#,###') + ' 萬' + NL : '';
    const C40 = F35 > 0 ? '時間電價套利約 NTD ' + text(ben2D39 / 1e4, '#,###') + ' 萬' + NL : '';
    const A26b3 = F36 > 0 ? '需量反應+即時備轉收益約 NTD ' + text(G24 / 1e4, '#,###') + ' 萬' : '';
    txt.essBenefit = inp.essEnabled ? A22 + C40 + A26b3 : '';
    txt.essService = inp.essEnabled ? '﹥能源管理服務,年產生之效益約為 NTD ' + text((xround(F34, -4) + xround(F35, -4) + xround(F36, -4)) / 1e4, '#,###') + ' 萬' : '';
    txt.essQuote = inp.essEnabled ? ' ∥ 儲能專案報價 NTD ' + text(F31 / 1e4, '#,###') + ' 萬(不含電機/消防技師簽證、台電圖審)' : '';
    txt.warranty = (inp.essEnabled ? '電力雲能源管理系統，建置費 ' + text(F69, '$#,##0') + '元，訂閱費 ' + text(cloudSub, '$#,##0') + '元/年' + NL : '') +
      ((F18 === 0 || !pvOn) ? '' : '太陽能板清洗費用 ' + text(D79, '$#,##0') + '元/次，每年 ' + times + '次，共' + (times * D.other.maintYears) + '次' + NL) +
      ((F18 > 0 || pvOn) ? ' ∥ 太陽光電保固 ' + D.other.maintYears + '年，包含配電盤每年檢修 1次、太陽能板清洗每年 ' + times + '次' + NL : '') +
      ((F31 > 0 || inp.essEnabled) ? ' ∥ 儲能保固 ' + E4 + '年，5年後依廠商評估收取保固\\維運\\更換費用' + NL : '') +
      ((F31 > 0 || inp.essEnabled) ? ' ∥ 能源管理系統(EMS)保固 ' + (emsW ? emsW.years : '#N/A') + '年，10年後重新簽訂保固合約' : '');
    const bankTitle = '銀行融資(' + bankYears + '年)';
    const lineFor = (yr) => { const r = tA[yr]; const d = (r.M <= 0 ? '，需再支付' : '，收入') + text(Math.abs(r.M), '$#,##0') + '元'; return '第' + yr + '年' + '起套利' + text(r.L, '$#,##0') + d; };
    txt.planLoan = bankTitle + NL + [1, 5, 10, 11, 15].map(lineFor).join(NL) + NL + NL + B118 + NL;
    txt.planZeroCorp = '平均年獲利 ' + text(R145, '$#,##0元') + NL + NL + '企業獲得穩定2小時的備援電力、自發自用套利10%優惠、雲端即時監控用電情況與報告。' + NL;
    txt.planZeroInv = '資方' + '總投入資金 ' + text(B97, '$#,##0元') + NL + '平均年獲利 ' + text(V146, '$#,##0元') + NL + '在第' + W123 + '年開始正向獲利' + NL + NL + '資方獲得企業自發自用90%套利收益，儲能參與需量反應\\即時備轉收益、變電站深度節能收益' + NL;
    txt.planBuyCorp = '前' + M153 + '年，平均年獲利 ' + text(K176, '$#,##0元') + NL + '第' + (M153 + 1) + '年，回購費用 ' + text(J153, '$#,##0') + '元' + NL + '平均年獲利 ' + text(K178, '$#,##0元') + NL + '在第' + L154 + '年開始正向獲利' + NL + NL + '前' + M153 + '年，企業獲得穩定2小時的備援電力、自發自用套利10%優惠、雲端即時監控用電情況與報告。' + NL + '第' + (M153 + 1) + '年開始享有所有微電網系統套利與效益。' + NL;
    txt.planBuyInv = '資方' + '總投入資金 ' + text(M155, '$#,##0元') + NL + '企業回購前平均年獲利 ' + text(P177, '$#,##0元') + NL + '企業回購後獲得' + K152 + '年的預期，達成' + Q154 + '年回本，無須負擔後續方案任何費用，可規劃投資新標的。' + NL + NL + '前' + M153 + '年，企業自發自用90%套利收益，儲能參與需量反應\\即時備轉收益、變電站深度節能收益' + NL;
    txt.planXaas = '企業頭期款由宏于代為出資，分' + S152 + '年進行繳款' + NL + '平均年獲利 ' + text(T177, '$#,##0元') + NL + '在第' + W154 + '年開始正向獲利' + NL + '建置元年企業享有所有微電網系統套利與效益。' + NL;

    /* ---- 輸出 ---- */
    Object.assign(R, {
      panel: pnl, panelUnitPrice, methods, inverter: inv, invPrice, ess: e, ems, emsBrand,
      fitRate: O1, fitTier: tier, regionBonus, rates: { peak: B28r, mid: B29r, off: B30r, essPeak: B31r, essMid: B32r, essOff: B33r },
      pv: { area: J5, pieces: K5, kwp: L5, cost: N5, yearKwh: O5, co2Kg: P5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, F16, F17, F18,
        costPerKwp: B16 / B19, steelPerKwp: E9p / F8, pvPerKwp: (E4p + E5p + E6p + E7p) / F8 },
      essCalc: { C4, D4, E4, G4, H4, K4, F31, R8, T8, F34, F35, F36, costPerKwh: qty === 0 ? 0 : B60 * (1 + profit) / D4 },
      ben1: { B8, B13, E15, E30, B18: ben1B18 }, ben2: { year, groups: ben2Groups, D39: ben2D39 }, ben3: { A2, D3, G3, G22, G24 },
      ev: { slow: cs, fast: cf, D7, D8, mgmtBrand: S7, B7: B7ev, B8: B8ev, F41 },
      other: { F56, F65, F69, N30, D79, times, cloudSub },
      totals: { B16, B60, B79, B88, B89, B93, B99, B97, F75, F76, F77, F78, B104, B106, C106, M3, M4, bankYears, bankRate, bankRatio, B115, B116, B117 },
      years: Y, tableA: tA, tableB: tB,
      planA: { S123, W123, R145, V146, F142: R145, F146: Z('r43'), F147: Z('r52') - Z('r53'), F148: Z('r70'), F149: Z('r71'), F152: B97, F153: W123 },
      planB: { J153, K152, N152, M153, P177, K176, K178, L154, Q154, F176: K176, F178: avgY('r45', 6, 15), F179: avgY('r52', 6, 15) - avgY('r53', 6, 15),
        F180: avgY('r70', 6, 15), F181: avgY('r71', 6, 15), F184: J153, F185: L154, F189: avgY('r43', 1, 5), F190: avgY('r52', 1, 5) - avgY('r53', 1, 5),
        F191: avgY('r70', 1, 5), F192: avgY('r71', 1, 5), F195: J153, F197: M155, F198: Q154 },
      planC: { S152, V152, T177, W154, F225: C106, F226: V152 / 12, F227: (tB[3] || {}).S / 12, F228: W154 },
      breakdown, text: txt
    });
    return R;
  }

  const api = { compute, defaultCase, OPTIONS, text, panelLabel, inverterLabel, chargerLabel, emsLabel, bankLabel, NONE, SITE_OK, FIRE_OK, roundUp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MGEngine = api;
})(this);
