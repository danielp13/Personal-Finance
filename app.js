// ============================================================
// COMPASS — app.js
// ============================================================

const STORAGE_KEY = 'compass_finance_v1';
const CATEGORY_COLORS = {
  'Housing': '#E8A33D',
  'Utilities': '#7C8FE8',
  'Subscriptions': '#45D0C4',
  'Insurance': '#E1595A',
  'Transport': '#C58BE0',
  'Food & Groceries': '#63C58C',
  'Health & Fitness': '#E0C158',
  'Other': '#8B95A5'
};

let state = null;

function defaultState() {
  const today = new Date().toISOString().slice(0,10);
  return {
    investPct: 20,
    income: [],
    expenses: [],
    networth: [],
    homeLoan: { amount: 0, termYears: 30, startDate: today, fixedYears: 0, fixedRate: 0, euribor: 0, spread: 0 },
    autoLoan: { amount: 0, rate: 0, termYears: 5, startDate: today }
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultState(), parsed);
  } catch (e) {
    console.error('Failed to load state', e);
    return defaultState();
  }
}

function saveState(opts = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!opts.skipCloud) scheduleCloudSync();
}

// ---------- Cloud backup (GitHub Gist) ----------
const CLOUD_KEY = 'compass_cloud_v1';
const GIST_FILENAME = 'compass-finance-backup.json';
let cloudSyncTimer = null;

function loadCloudConfig() {
  try { return JSON.parse(localStorage.getItem(CLOUD_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveCloudConfig(cfg) {
  localStorage.setItem(CLOUD_KEY, JSON.stringify(cfg));
}
function updateCloudStatusUI() {
  const cfg = loadCloudConfig();
  const dot = document.getElementById('cloudStatusDot');
  const text = document.getElementById('cloudStatusText');
  if (!dot || !text) return;
  if (cfg.gistId && cfg.lastSynced) {
    dot.style.background = '#45D0C4';
    text.textContent = 'Last synced ' + new Date(cfg.lastSynced).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } else if (cfg.token) {
    dot.style.background = '#E8A33D';
    text.textContent = 'Token saved — tap "Back up now" to connect';
  } else {
    dot.style.background = '#5E6779';
    text.textContent = 'Not connected';
  }
}
function scheduleCloudSync() {
  const cfg = loadCloudConfig();
  if (!cfg.token) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(cloudBackupSilent, 2500);
}
async function githubGistRequest(cfg, method) {
  const body = { description: 'Compass Finance backup — do not rename the file inside', public: false,
    files: { [GIST_FILENAME]: { content: JSON.stringify(state, null, 2) } } };
  const url = cfg.gistId ? `https://api.github.com/gists/${cfg.gistId}` : 'https://api.github.com/gists';
  const res = await fetch(url, {
    method: cfg.gistId ? 'PATCH' : 'POST',
    headers: { 'Authorization': `token ${cfg.token}`, 'Accept': 'application/vnd.github+json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('GitHub API error ' + res.status);
  return res.json();
}
async function cloudBackupSilent() {
  const cfg = loadCloudConfig();
  if (!cfg.token) return;
  try {
    const json = await githubGistRequest(cfg, cfg.gistId ? 'PATCH' : 'POST');
    cfg.gistId = json.id;
    cfg.lastSynced = new Date().toISOString();
    saveCloudConfig(cfg);
    updateCloudStatusUI();
  } catch (e) {
    const dot = document.getElementById('cloudStatusDot');
    const text = document.getElementById('cloudStatusText');
    if (dot) dot.style.background = '#E1595A';
    if (text) text.textContent = 'Auto-sync failed — tap "Back up now" to retry';
  }
}
async function cloudBackupNow() {
  const tokenInput = document.getElementById('cloudToken').value.trim();
  const cfg = loadCloudConfig();
  const token = tokenInput || cfg.token;
  if (!token) { alert('Enter a GitHub personal access token first.'); return; }
  cfg.token = token;
  const btn = document.getElementById('cloudBackupBtn');
  const prevLabel = btn.textContent;
  btn.textContent = 'Backing up…'; btn.disabled = true;
  try {
    const json = await githubGistRequest(cfg);
    cfg.gistId = json.id;
    cfg.lastSynced = new Date().toISOString();
    saveCloudConfig(cfg);
    updateCloudStatusUI();
  } catch (err) {
    alert('Backup failed: ' + err.message + '\n\nCheck your token has gist access and you have an internet connection.');
  } finally {
    btn.textContent = prevLabel; btn.disabled = false;
  }
}
async function cloudRestore() {
  const tokenInput = document.getElementById('cloudToken').value.trim();
  const cfg = loadCloudConfig();
  const token = tokenInput || cfg.token;
  if (!token) { alert('Enter your GitHub personal access token first.'); return; }
  if (!cfg.gistId) { alert('No cloud backup connected on this device yet. Tap "Back up now" first on the device that has your data.'); return; }
  cfg.token = token;
  const btn = document.getElementById('cloudRestoreBtn');
  const prevLabel = btn.textContent;
  btn.textContent = 'Restoring…'; btn.disabled = true;
  try {
    const res = await fetch(`https://api.github.com/gists/${cfg.gistId}`, {
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github+json' }
    });
    if (!res.ok) throw new Error('GitHub API error ' + res.status);
    const json = await res.json();
    const file = json.files[GIST_FILENAME];
    if (!file) throw new Error('Backup file not found in that gist');
    const parsed = JSON.parse(file.content);
    state = Object.assign(defaultState(), parsed);
    saveState({ skipCloud: true });
    cfg.lastSynced = new Date().toISOString();
    saveCloudConfig(cfg);
    updateCloudStatusUI();
    closeSheets();
    renderAll();
  } catch (err) {
    alert('Restore failed: ' + err.message);
  } finally {
    btn.textContent = prevLabel; btn.disabled = false;
  }
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ---------- Formatting ----------
function fmt(v) {
  const n = Number(v) || 0;
  const neg = n < -0.004;
  const abs = Math.abs(n);
  const s = abs.toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (neg ? '-' : '') + '€' + s;
}
function fmtPct(v, digits = 0) {
  return (Number(v) || 0).toFixed(digits) + '%';
}
function monthLabel(mk) {
  const d = new Date(mk + '-01T00:00:00');
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}
function monthShort(d) {
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}
function dateLong(d) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function currentMonthKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// ---------- Loan math ----------
function pmt(rateMonthly, nper, pv) {
  if (nper <= 0) return 0;
  if (Math.abs(rateMonthly) < 1e-12) return pv / nper;
  return pv * rateMonthly / (1 - Math.pow(1 + rateMonthly, -nper));
}
function round2(v) { return Math.round(v * 100) / 100; }
function addMonths(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d;
}
function monthsBetween(startDateStr, target) {
  const s = new Date(startDateStr + 'T00:00:00');
  return (target.getFullYear() - s.getFullYear()) * 12 + (target.getMonth() - s.getMonth());
}

function amortizeSimple(principal, annualRatePct, termYears, startDateStr) {
  const n = Math.max(0, Math.round(termYears * 12));
  const r = (annualRatePct / 100) / 12;
  const payment = principal > 0 ? pmt(r, n, principal) : 0;
  let bal = principal;
  const rows = [];
  for (let i = 1; i <= n; i++) {
    const interest = round2(bal * r);
    const principalPaid = payment - interest;
    const end = round2(bal - principalPaid);
    rows.push({ n: i, date: addMonths(startDateStr, i), begin: bal, payment, interest, principal: principalPaid, end, rate: annualRatePct });
    bal = end;
  }
  return { rows, payment, n, totalN: n };
}

function amortizeMixed(principal, termYears, fixedYears, fixedRatePct, euriborPct, spreadPct, startDateStr) {
  const n = Math.max(0, Math.round(termYears * 12));
  const fixedN = Math.max(0, Math.min(n, Math.round(fixedYears * 12)));
  const fixedR = (fixedRatePct / 100) / 12;
  const varRatePct = euriborPct + spreadPct;
  const varR = (varRatePct / 100) / 12;
  const fixedPayment = principal > 0 ? pmt(fixedR, n, principal) : 0;
  let bal = principal;
  const rows = [];
  for (let i = 1; i <= fixedN; i++) {
    const interest = round2(bal * fixedR);
    const principalPaid = fixedPayment - interest;
    const end = round2(bal - principalPaid);
    rows.push({ n: i, date: addMonths(startDateStr, i), begin: bal, payment: fixedPayment, interest, principal: principalPaid, end, rate: fixedRatePct });
    bal = end;
  }
  const balAtReset = bal;
  const remainingN = n - fixedN;
  const varPayment = (remainingN > 0 && balAtReset > 0) ? pmt(varR, remainingN, balAtReset) : 0;
  for (let i = fixedN + 1; i <= n; i++) {
    const interest = round2(bal * varR);
    const principalPaid = varPayment - interest;
    const end = round2(bal - principalPaid);
    rows.push({ n: i, date: addMonths(startDateStr, i), begin: bal, payment: varPayment, interest, principal: principalPaid, end, rate: varRatePct });
    bal = end;
  }
  return {
    rows, fixedPayment, varPayment, balAtReset, n, fixedN,
    resetDate: addMonths(startDateStr, fixedN), varRatePct, totalN: n
  };
}

function balanceAsOf(principal, rows, targetDate) {
  if (!rows.length) return principal;
  if (targetDate < rows[0].date) return principal;
  let bal = 0;
  for (const row of rows) {
    if (row.date <= targetDate) bal = row.end; else break;
  }
  return bal;
}

function getHomeLoanResult() {
  const hl = state.homeLoan;
  return amortizeMixed(hl.amount, hl.termYears, hl.fixedYears, hl.fixedRate, hl.euribor, hl.spread, hl.startDate);
}
function getAutoLoanResult() {
  const al = state.autoLoan;
  return amortizeSimple(al.amount, al.rate, al.termYears, al.startDate);
}

// ============================================================
// RENDER: DASHBOARD
// ============================================================
function latestByMonth(list) {
  if (!list.length) return null;
  return [...list].sort((a, b) => a.month.localeCompare(b.month))[list.length - 1];
}

function computeExpenseTotal() {
  return state.expenses.filter(e => e.active).reduce((sum, e) => {
    const amt = Number(e.amount) || 0;
    if (e.frequency === 'Monthly') return sum + amt;
    if (e.frequency === 'Yearly') return sum + amt / 12;
    if (e.frequency === 'Weekly') return sum + amt * 52 / 12;
    return sum + amt;
  }, 0);
}

function renderDashboard() {
  const latestIncome = latestByMonth(state.income);
  const netIncome = latestIncome ? Number(latestIncome.amount) : 0;
  const investAmt = netIncome * (state.investPct / 100);
  const expTotal = computeExpenseTotal();
  const cashflow = netIncome - investAmt - expTotal;

  document.getElementById('kpiIncome').textContent = fmt(netIncome);
  document.getElementById('kpiInvest').textContent = fmt(investAmt);
  document.getElementById('kpiExpenses').textContent = fmt(expTotal);
  const cfEl = document.getElementById('kpiCashflow');
  cfEl.textContent = fmt(cashflow);
  cfEl.parentElement.classList.toggle('neg', cashflow < 0);
  cfEl.parentElement.classList.toggle('pos', cashflow >= 0);

  const savingsRate = netIncome > 0 ? (investAmt / netIncome) * 100 : 0;
  document.getElementById('dashSavingsRate').textContent = fmtPct(savingsRate, 1);
  document.getElementById('dashSavingsDetail').textContent = latestIncome
    ? `${monthLabel(latestIncome.month)} · target ${state.investPct}%`
    : 'Add a monthly income entry to begin';
  drawDial(document.getElementById('savingsDial'), savingsRate);

  // Net worth
  const nwSorted = [...state.networth].sort((a, b) => a.month.localeCompare(b.month));
  const latestNW = nwSorted[nwSorted.length - 1];
  const nwValue = latestNW ? computeNetWorthFor(latestNW) : null;
  document.getElementById('dashNetWorth').textContent = nwValue ? fmt(nwValue.netWorth) : '€0';
  document.getElementById('dashNetWorthSub').textContent = latestNW
    ? `As of ${monthLabel(latestNW.month)}`
    : 'Add a snapshot in Net Worth';

  // Loans
  const home = getHomeLoanResult();
  const auto = getAutoLoanResult();
  const today = new Date();
  const homeBal = balanceAsOf(state.homeLoan.amount, home.rows, today);
  const autoBal = balanceAsOf(state.autoLoan.amount, auto.rows, today);
  document.getElementById('dashHomeLoanBalance').textContent = fmt(homeBal);
  document.getElementById('dashAutoLoanBalance').textContent = fmt(autoBal);
  document.getElementById('dashHomeLoanSub').textContent = state.homeLoan.amount > 0
    ? `${fmt(today <= home.resetDate ? home.fixedPayment : home.varPayment)}/mo`
    : 'Not set up yet';
  document.getElementById('dashAutoLoanSub').textContent = state.autoLoan.amount > 0
    ? `${fmt(auto.payment)}/mo`
    : 'Not set up yet';

  // Trend chart
  const points = nwSorted.map(e => ({ label: monthShort(new Date(e.month + '-01T00:00:00')), value: computeNetWorthFor(e).netWorth }));
  drawLineChart(document.getElementById('dashTrendChart'), points, { color: '#45D0C4' });
}

function computeNetWorthFor(entry) {
  const targetDate = new Date(entry.month + '-01T00:00:00');
  const home = getHomeLoanResult();
  const auto = getAutoLoanResult();
  const homeIdx = monthsBetween(state.homeLoan.startDate, targetDate);
  const autoIdx = monthsBetween(state.autoLoan.startDate, targetDate);
  const homeBal = homeIdx <= 0 ? state.homeLoan.amount : (home.rows[Math.min(homeIdx, home.rows.length) - 1]?.end ?? 0);
  const autoBal = autoIdx <= 0 ? state.autoLoan.amount : (auto.rows[Math.min(autoIdx, auto.rows.length) - 1]?.end ?? 0);
  const assets = (Number(entry.cash) || 0) + (Number(entry.investments) || 0) + (Number(entry.home) || 0) +
    (Number(entry.vehicle) || 0) + (Number(entry.otherAssets) || 0);
  const liabilities = homeBal + autoBal + (Number(entry.otherLiab) || 0);
  return { assets, liabilities, netWorth: assets - liabilities, homeBal, autoBal };
}

// ============================================================
// RENDER: INCOME
// ============================================================
function renderIncome() {
  document.getElementById('investSlider').value = state.investPct;
  document.getElementById('investPctLabel').textContent = state.investPct + '%';

  const list = document.getElementById('incomeList');
  const sorted = [...state.income].sort((a, b) => b.month.localeCompare(a.month));
  if (!sorted.length) {
    list.innerHTML = emptyState('💶', 'No income yet', 'Tap + to add your first month');
    return;
  }
  list.innerHTML = sorted.map(item => {
    const investAmt = Number(item.amount) * (state.investPct / 100);
    return `<div class="row" data-open-income="${item.id}">
      <div class="r-main">
        <div class="r-title">${monthLabel(item.month)}</div>
        <div class="r-sub">Invest ${fmt(investAmt)} · Remaining ${fmt(item.amount - investAmt)}</div>
      </div>
      <div class="r-value num">${fmt(item.amount)}</div>
    </div>`;
  }).join('');
}

// ============================================================
// RENDER: EXPENSES
// ============================================================
function renderExpenses() {
  const total = computeExpenseTotal();
  document.getElementById('expTotal').textContent = fmt(total);
  const activeCount = state.expenses.filter(e => e.active).length;
  document.getElementById('expActiveCount').textContent = `${activeCount} active item${activeCount === 1 ? '' : 's'}`;

  // category totals
  const byCat = {};
  state.expenses.filter(e => e.active).forEach(e => {
    const amt = Number(e.amount) || 0;
    const monthly = e.frequency === 'Monthly' ? amt : e.frequency === 'Yearly' ? amt / 12 : e.frequency === 'Weekly' ? amt * 52 / 12 : amt;
    byCat[e.category] = (byCat[e.category] || 0) + monthly;
  });
  const segments = Object.keys(byCat).map(cat => ({ label: cat, value: byCat[cat], color: CATEGORY_COLORS[cat] || '#8B95A5' }))
    .sort((a, b) => b.value - a.value);
  drawDonut(document.getElementById('expDonut'), segments);
  const legend = document.getElementById('expLegend');
  legend.innerHTML = segments.map(s => `<div class="legend-item"><span class="dot" style="background:${s.color}"></span>${s.label} · ${fmt(s.value)}</div>`).join('') ||
    `<div class="legend-item muted">No active expenses yet</div>`;

  const list = document.getElementById('expList');
  if (!state.expenses.length) {
    list.innerHTML = emptyState('🧾', 'No expenses yet', 'Tap + to add a bill or subscription');
    return;
  }
  const sorted = [...state.expenses].sort((a, b) => (a.category || '').localeCompare(b.category || ''));
  list.innerHTML = sorted.map(e => {
    const amt = Number(e.amount) || 0;
    const monthly = e.frequency === 'Monthly' ? amt : e.frequency === 'Yearly' ? amt / 12 : e.frequency === 'Weekly' ? amt * 52 / 12 : amt;
    return `<div class="row" data-open-expense="${e.id}" style="opacity:${e.active ? 1 : 0.45}">
      <div class="r-main">
        <div class="r-title"><span class="dot" style="background:${CATEGORY_COLORS[e.category] || '#8B95A5'}"></span>${e.name || '(unnamed)'}</div>
        <div class="r-sub">${e.category} · ${e.frequency}</div>
      </div>
      <div class="r-value num">${fmt(monthly)}</div>
    </div>`;
  }).join('');
}

// ============================================================
// RENDER: NET WORTH
// ============================================================
function renderNetWorth() {
  const sorted = [...state.networth].sort((a, b) => b.month.localeCompare(a.month));
  const latest = sorted[0];
  if (latest) {
    const r = computeNetWorthFor(latest);
    document.getElementById('nwLatest').textContent = fmt(r.netWorth);
    document.getElementById('nwLatestSub').textContent = `Assets ${fmt(r.assets)} · Liabilities ${fmt(r.liabilities)}`;
  } else {
    document.getElementById('nwLatest').textContent = '€0';
    document.getElementById('nwLatestSub').textContent = 'Add your first snapshot';
  }

  const chronological = [...state.networth].sort((a, b) => a.month.localeCompare(b.month));
  const points = chronological.map(e => ({ label: monthShort(new Date(e.month + '-01T00:00:00')), value: computeNetWorthFor(e).netWorth }));
  drawLineChart(document.getElementById('nwChart'), points, { color: '#E8A33D' });

  const list = document.getElementById('nwList');
  if (!sorted.length) {
    list.innerHTML = emptyState('📈', 'No snapshots yet', 'Tap + to record this month');
    return;
  }
  list.innerHTML = sorted.map(item => {
    const r = computeNetWorthFor(item);
    return `<div class="row" data-open-networth="${item.id}">
      <div class="r-main">
        <div class="r-title">${monthLabel(item.month)}</div>
        <div class="r-sub">Assets ${fmt(r.assets)} · Liabilities ${fmt(r.liabilities)}</div>
      </div>
      <div class="r-value num">${fmt(r.netWorth)}</div>
    </div>`;
  }).join('');
}

// ============================================================
// RENDER: LOANS
// ============================================================
let activeLoanTab = 'home';

function renderLoans() {
  renderHomeLoan();
  renderAutoLoan();
}

function renderHomeLoan() {
  const hl = state.homeLoan;
  const result = getHomeLoanResult();
  const today = new Date();
  const bal = balanceAsOf(hl.amount, result.rows, today);
  const isFixed = today <= result.resetDate;
  const currentPayment = hl.amount > 0 ? (isFixed ? result.fixedPayment : result.varPayment) : 0;
  const currentRate = isFixed ? hl.fixedRate : result.varRatePct;

  document.getElementById('homeBalance').textContent = fmt(bal);
  document.getElementById('homeBalanceSub').textContent = hl.amount > 0
    ? (bal <= 0.5 ? 'Paid off' : `of ${fmt(hl.amount)} original`)
    : 'Tap Edit to set up your mortgage';
  document.getElementById('homePayment').textContent = fmt(currentPayment);
  document.getElementById('homeRate').textContent = fmtPct(currentRate, 2);
  document.getElementById('homePayoff').textContent = result.rows.length ? dateLong(result.rows[result.rows.length - 1].date) : '—';
  document.getElementById('homeInterest').textContent = fmt(result.rows.reduce((s, r) => s + r.interest, 0));
  document.getElementById('homeFixedInfo').textContent = `${hl.fixedYears} yr${hl.fixedYears === 1 ? '' : 's'} at ${fmtPct(hl.fixedRate, 2)} · ${fmt(result.fixedPayment)}/mo`;
  document.getElementById('homeVarInfo').textContent = `Euribor ${fmtPct(hl.euribor, 2)} + Spread ${fmtPct(hl.spread, 2)} = ${fmtPct(result.varRatePct, 2)} · ${fmt(result.varPayment)}/mo from ${dateLong(result.resetDate)}`;

  const step = Math.max(1, Math.floor(result.rows.length / 60));
  drawLineChart(document.getElementById('homeChart'), result.rows.filter((r, i) => i % step === 0).map(r => ({ label: monthShort(r.date), value: r.end })), { color: '#E8A33D' });
  document.getElementById('homeSchedule').innerHTML = result.rows.length ? scheduleAccordionHTML(result.rows) : emptyState('🏠', 'Set up your mortgage', 'Tap Edit above to get started');
}

function renderAutoLoan() {
  const al = state.autoLoan;
  const result = getAutoLoanResult();
  const today = new Date();
  const bal = balanceAsOf(al.amount, result.rows, today);

  document.getElementById('autoBalance').textContent = fmt(bal);
  document.getElementById('autoBalanceSub').textContent = al.amount > 0
    ? (bal <= 0.5 ? 'Paid off' : `of ${fmt(al.amount)} original`)
    : 'Tap Edit to set up your loan';
  document.getElementById('autoPayment').textContent = fmt(result.payment);
  document.getElementById('autoRate').textContent = fmtPct(al.rate, 2);
  document.getElementById('autoPayoff').textContent = result.rows.length ? dateLong(result.rows[result.rows.length - 1].date) : '—';
  document.getElementById('autoInterest').textContent = fmt(result.rows.reduce((s, r) => s + r.interest, 0));

  drawLineChart(document.getElementById('autoChart'), result.rows.map(r => ({ label: monthShort(r.date), value: r.end })), { color: '#7C8FE8' });
  document.getElementById('autoSchedule').innerHTML = result.rows.length ? scheduleAccordionHTML(result.rows) : emptyState('🚗', 'Set up your auto loan', 'Tap Edit above to get started');
}

function scheduleAccordionHTML(rows) {
  const years = {};
  const order = [];
  rows.forEach(r => {
    const y = r.date.getFullYear();
    if (!years[y]) { years[y] = []; order.push(y); }
    years[y].push(r);
  });
  return order.map((y, idx) => {
    const yr = years[y];
    const endBal = yr[yr.length - 1].end;
    return `<div class="acc-item${idx === 0 ? ' open' : ''}">
      <div class="acc-head" data-toggle-acc>
        <div><strong>${y}</strong> <span class="muted" style="font-size:12px;">· ${fmt(endBal)} remaining</span></div>
        <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
      </div>
      <div class="acc-body">
        <div class="acc-row head"><span>Month</span><span>Payment</span><span>Interest</span><span>Balance</span></div>
        ${yr.map(r => `<div class="acc-row"><span>${monthShort(r.date)}</span><span>${fmt(r.payment)}</span><span>${fmt(r.interest)}</span><span>${fmt(r.end)}</span></div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function emptyState(icon, title, sub) {
  return `<div class="empty"><div class="e-icon">${icon}</div><div class="e-title">${title}</div><div class="e-sub">${sub}</div></div>`;
}

// ============================================================
// CHARTS
// ============================================================
function drawLineChart(svg, points, opts = {}) {
  const color = opts.color || '#45D0C4';
  const W = 340, H = 160, padL = 8, padR = 8, padT = 16, padB = 22;
  if (!points.length) {
    svg.innerHTML = `<text x="${W/2}" y="${H/2}" text-anchor="middle" font-size="12" fill="#5E6779">Not enough data yet</text>`;
    return;
  }
  const vals = points.map(p => p.value);
  let min = Math.min(...vals, 0), max = Math.max(...vals, 0);
  if (min === max) { max = min + 1; }
  const spanX = W - padL - padR, spanY = H - padT - padB;
  const x = i => padL + (points.length === 1 ? spanX / 2 : spanX * i / (points.length - 1));
  const y = v => padT + spanY * (1 - (v - min) / (max - min));
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = d + ` L${x(points.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const zeroY = y(0).toFixed(1);
  let labelIdxs = points.length > 1 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : [0];
  labelIdxs = [...new Set(labelIdxs)];
  svg.innerHTML = `
    <line x1="${padL}" y1="${zeroY}" x2="${W - padR}" y2="${zeroY}" stroke="#2A323D" stroke-width="1" stroke-dasharray="2,3"/>
    <path d="${area}" fill="${color}22"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${x(points.length - 1).toFixed(1)}" cy="${y(points[points.length - 1].value).toFixed(1)}" r="3.5" fill="${color}"/>
    ${labelIdxs.map(i => `<text x="${x(i).toFixed(1)}" y="${H - 6}" font-size="9" fill="#5E6779" text-anchor="${i === 0 ? 'start' : (i === points.length - 1 ? 'end' : 'middle')}">${points[i].label}</text>`).join('')}
  `;
}

function drawDonut(svg, segments) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const cx = 100, cy = 100, r = 70, strokeW = 26;
  if (total <= 0) {
    svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#232C39" stroke-width="${strokeW}"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" font-size="13" fill="#5E6779">€0</text>`;
    return;
  }
  let angle = -90, paths = '';
  segments.forEach(seg => {
    if (seg.value <= 0) return;
    const frac = seg.value / total;
    const sweep = frac * 360;
    const large = sweep > 180 ? 1 : 0;
    const startRad = angle * Math.PI / 180, endRad = (angle + sweep) * Math.PI / 180;
    const x1 = cx + r * Math.cos(startRad), y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad), y2 = cy + r * Math.sin(endRad);
    paths += `<path d="M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}" fill="none" stroke="${seg.color}" stroke-width="${strokeW}" stroke-linecap="butt"/>`;
    angle += sweep;
  });
  svg.innerHTML = paths +
    `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="19" fill="#ECEFF3" font-weight="700" font-family="ui-monospace,monospace">${fmt(total)}</text>
     <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="10" fill="#8B95A5">per month</text>`;
}

function drawDial(svg, pct) {
  const cx = 70, cy = 80, r = 56, maxPct = 50;
  const clamped = Math.max(0, Math.min(pct, maxPct));
  const angleFor = p => 180 - (p / maxPct) * 180;
  const pt = (angleDeg, radius) => {
    const a = angleDeg * Math.PI / 180;
    return [cx + radius * Math.cos(a), cy - radius * Math.sin(a)];
  };
  const [bx1, by1] = pt(180, r), [bx2, by2] = pt(0, r);
  const bgPath = `M${bx1.toFixed(1)},${by1.toFixed(1)} A${r},${r} 0 1 1 ${bx2.toFixed(1)},${by2.toFixed(1)}`;
  const endAngle = angleFor(clamped);
  const [fx2, fy2] = pt(endAngle, r);
  const largeArc = (180 - endAngle) > 180 ? 1 : 0;
  const fgPath = `M${bx1.toFixed(1)},${by1.toFixed(1)} A${r},${r} 0 ${largeArc} 1 ${fx2.toFixed(1)},${fy2.toFixed(1)}`;
  const [nx, ny] = pt(endAngle, r - 16);
  let ticks = '';
  for (let t = 0; t <= maxPct; t += 10) {
    const [tx1, ty1] = pt(angleFor(t), r + 6);
    const [tx2, ty2] = pt(angleFor(t), r + 11);
    ticks += `<line x1="${tx1.toFixed(1)}" y1="${ty1.toFixed(1)}" x2="${tx2.toFixed(1)}" y2="${ty2.toFixed(1)}" stroke="#3A4451" stroke-width="1.5"/>`;
  }
  svg.innerHTML = `
    ${ticks}
    <path d="${bgPath}" stroke="#232C39" stroke-width="11" fill="none" stroke-linecap="round"/>
    <path d="${fgPath}" stroke="#E8A33D" stroke-width="11" fill="none" stroke-linecap="round"/>
    <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#ECEFF3" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="4" fill="#ECEFF3"/>
  `;
}

// ============================================================
// NAVIGATION
// ============================================================
const SCREEN_TITLES = {
  dashboard: 'Dashboard', income: 'Income', expenses: 'Expenses', networth: 'Net Worth', loans: 'Loans'
};
const FAB_VISIBLE_ON = new Set(['income', 'expenses', 'networth']);

function renderAll() {
  renderDashboard();
  renderIncome();
  renderExpenses();
  renderNetWorth();
  renderLoans();
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.getElementById('topTitle').textContent = SCREEN_TITLES[name];
  document.getElementById('fabAdd').style.display = FAB_VISIBLE_ON.has(name) ? 'flex' : 'none';
  renderAll();
}

// ============================================================
// SHEETS (modals)
// ============================================================
function openSheet(id) {
  document.getElementById('sheetBackdrop').classList.add('open');
  document.getElementById(id).classList.add('open');
}
function closeSheets() {
  document.getElementById('sheetBackdrop').classList.remove('open');
  document.querySelectorAll('.sheet').forEach(s => s.classList.remove('open'));
}

function openIncomeSheet(item) {
  document.getElementById('incId').value = item ? item.id : '';
  document.getElementById('incMonth').value = item ? item.month : currentMonthKey();
  document.getElementById('incAmount').value = item ? item.amount : '';
  document.getElementById('incDeleteBtn').style.display = item ? 'inline-flex' : 'none';
  openSheet('sheetIncome');
}
function openExpenseSheet(item) {
  document.getElementById('expId').value = item ? item.id : '';
  document.getElementById('expCategory').value = item ? item.category : 'Housing';
  document.getElementById('expName').value = item ? item.name : '';
  document.getElementById('expAmount').value = item ? item.amount : '';
  document.getElementById('expFrequency').value = item ? item.frequency : 'Monthly';
  document.getElementById('expActiveToggle').classList.toggle('on', item ? item.active : true);
  document.getElementById('expDeleteBtn').style.display = item ? 'inline-flex' : 'none';
  openSheet('sheetExpense');
}
function openNetworthSheet(item) {
  document.getElementById('nwId').value = item ? item.id : '';
  document.getElementById('nwMonth').value = item ? item.month : currentMonthKey();
  document.getElementById('nwCash').value = item ? item.cash : '';
  document.getElementById('nwInvestments').value = item ? item.investments : '';
  document.getElementById('nwHome').value = item ? item.home : '';
  document.getElementById('nwVehicle').value = item ? item.vehicle : '';
  document.getElementById('nwOtherAssets').value = item ? item.otherAssets : '';
  document.getElementById('nwOtherLiab').value = item ? item.otherLiab : '';
  document.getElementById('nwDeleteBtn').style.display = item ? 'inline-flex' : 'none';
  openSheet('sheetNetworth');
}
function openHomeLoanSheet() {
  const hl = state.homeLoan;
  document.getElementById('hlAmount').value = hl.amount;
  document.getElementById('hlTerm').value = hl.termYears;
  document.getElementById('hlStart').value = hl.startDate;
  document.getElementById('hlFixedYears').value = hl.fixedYears;
  document.getElementById('hlFixedRate').value = hl.fixedRate;
  document.getElementById('hlEuribor').value = hl.euribor;
  document.getElementById('hlSpread').value = hl.spread;
  openSheet('sheetHomeLoan');
}
function openAutoLoanSheet() {
  const al = state.autoLoan;
  document.getElementById('alAmount').value = al.amount;
  document.getElementById('alRate').value = al.rate;
  document.getElementById('alTerm').value = al.termYears;
  document.getElementById('alStart').value = al.startDate;
  openSheet('sheetAutoLoan');
}

// ============================================================
// INIT & EVENTS
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  state = loadState();

  setTimeout(() => {
    const splash = document.getElementById('splash');
    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), 300);
  }, 400);

  showScreen('dashboard');

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => showScreen(tab.dataset.tab));
  });

  document.getElementById('fabAdd').addEventListener('click', () => {
    const active = document.querySelector('.screen.active').id.replace('screen-', '');
    if (active === 'income') openIncomeSheet(null);
    else if (active === 'expenses') openExpenseSheet(null);
    else if (active === 'networth') openNetworthSheet(null);
  });

  document.getElementById('sheetBackdrop').addEventListener('click', closeSheets);

  document.getElementById('incomeList').addEventListener('click', e => {
    const row = e.target.closest('[data-open-income]');
    if (row) openIncomeSheet(state.income.find(i => i.id === row.dataset.openIncome));
  });
  document.getElementById('expList').addEventListener('click', e => {
    const row = e.target.closest('[data-open-expense]');
    if (row) openExpenseSheet(state.expenses.find(i => i.id === row.dataset.openExpense));
  });
  document.getElementById('nwList').addEventListener('click', e => {
    const row = e.target.closest('[data-open-networth]');
    if (row) openNetworthSheet(state.networth.find(i => i.id === row.dataset.openNetworth));
  });

  document.getElementById('screen-loans').addEventListener('click', e => {
    const head = e.target.closest('[data-toggle-acc]');
    if (head) head.parentElement.classList.toggle('open');
  });

  document.getElementById('investSlider').addEventListener('input', e => {
    state.investPct = Number(e.target.value);
    document.getElementById('investPctLabel').textContent = state.investPct + '%';
  });
  document.getElementById('investSlider').addEventListener('change', () => {
    saveState();
    renderAll();
  });

  document.getElementById('incSaveBtn').addEventListener('click', () => {
    const id = document.getElementById('incId').value;
    const month = document.getElementById('incMonth').value || currentMonthKey();
    const amount = Number(document.getElementById('incAmount').value) || 0;
    if (id) {
      const item = state.income.find(i => i.id === id);
      item.month = month; item.amount = amount;
    } else {
      const existing = state.income.find(i => i.month === month);
      if (existing) { existing.amount = amount; }
      else state.income.push({ id: uid(), month, amount });
    }
    saveState(); closeSheets(); renderAll();
  });
  document.getElementById('incDeleteBtn').addEventListener('click', () => {
    const id = document.getElementById('incId').value;
    state.income = state.income.filter(i => i.id !== id);
    saveState(); closeSheets(); renderAll();
  });

  document.getElementById('expActiveToggle').addEventListener('click', e => {
    e.currentTarget.classList.toggle('on');
  });
  document.getElementById('expSaveBtn').addEventListener('click', () => {
    const id = document.getElementById('expId').value;
    const data = {
      category: document.getElementById('expCategory').value,
      name: document.getElementById('expName').value.trim(),
      amount: Number(document.getElementById('expAmount').value) || 0,
      frequency: document.getElementById('expFrequency').value,
      active: document.getElementById('expActiveToggle').classList.contains('on')
    };
    if (id) Object.assign(state.expenses.find(i => i.id === id), data);
    else state.expenses.push({ id: uid(), ...data });
    saveState(); closeSheets(); renderAll();
  });
  document.getElementById('expDeleteBtn').addEventListener('click', () => {
    const id = document.getElementById('expId').value;
    state.expenses = state.expenses.filter(i => i.id !== id);
    saveState(); closeSheets(); renderAll();
  });

  document.getElementById('nwSaveBtn').addEventListener('click', () => {
    const id = document.getElementById('nwId').value;
    const month = document.getElementById('nwMonth').value || currentMonthKey();
    const data = {
      month,
      cash: Number(document.getElementById('nwCash').value) || 0,
      investments: Number(document.getElementById('nwInvestments').value) || 0,
      home: Number(document.getElementById('nwHome').value) || 0,
      vehicle: Number(document.getElementById('nwVehicle').value) || 0,
      otherAssets: Number(document.getElementById('nwOtherAssets').value) || 0,
      otherLiab: Number(document.getElementById('nwOtherLiab').value) || 0
    };
    if (id) Object.assign(state.networth.find(i => i.id === id), data);
    else {
      const existing = state.networth.find(i => i.month === month);
      if (existing) Object.assign(existing, data);
      else state.networth.push({ id: uid(), ...data });
    }
    saveState(); closeSheets(); renderAll();
  });
  document.getElementById('nwDeleteBtn').addEventListener('click', () => {
    const id = document.getElementById('nwId').value;
    state.networth = state.networth.filter(i => i.id !== id);
    saveState(); closeSheets(); renderAll();
  });

  document.getElementById('loanSegment').addEventListener('click', e => {
    const btn = e.target.closest('button[data-loan]');
    if (!btn) return;
    activeLoanTab = btn.dataset.loan;
    document.querySelectorAll('#loanSegment button').forEach(b => b.classList.toggle('active', b === btn));
    document.getElementById('loanHomeView').style.display = activeLoanTab === 'home' ? 'block' : 'none';
    document.getElementById('loanAutoView').style.display = activeLoanTab === 'auto' ? 'block' : 'none';
  });

  document.getElementById('editHomeLoanBtn').addEventListener('click', openHomeLoanSheet);
  document.getElementById('editAutoLoanBtn').addEventListener('click', openAutoLoanSheet);

  document.getElementById('hlSaveBtn').addEventListener('click', () => {
    state.homeLoan = {
      amount: Number(document.getElementById('hlAmount').value) || 0,
      termYears: Number(document.getElementById('hlTerm').value) || 0,
      startDate: document.getElementById('hlStart').value || new Date().toISOString().slice(0, 10),
      fixedYears: Number(document.getElementById('hlFixedYears').value) || 0,
      fixedRate: Number(document.getElementById('hlFixedRate').value) || 0,
      euribor: Number(document.getElementById('hlEuribor').value) || 0,
      spread: Number(document.getElementById('hlSpread').value) || 0
    };
    saveState(); closeSheets(); renderAll();
  });
  document.getElementById('alSaveBtn').addEventListener('click', () => {
    state.autoLoan = {
      amount: Number(document.getElementById('alAmount').value) || 0,
      rate: Number(document.getElementById('alRate').value) || 0,
      termYears: Number(document.getElementById('alTerm').value) || 0,
      startDate: document.getElementById('alStart').value || new Date().toISOString().slice(0, 10)
    };
    saveState(); closeSheets(); renderAll();
  });

  document.getElementById('menuBtn').addEventListener('click', () => {
    const cfg = loadCloudConfig();
    document.getElementById('cloudToken').value = cfg.token || '';
    updateCloudStatusUI();
    openSheet('sheetSettings');
  });
  document.getElementById('cloudBackupBtn').addEventListener('click', cloudBackupNow);
  document.getElementById('cloudRestoreBtn').addEventListener('click', cloudRestore);
  document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `compass-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        state = Object.assign(defaultState(), parsed);
        saveState(); closeSheets(); renderAll();
      } catch (err) {
        alert('That file could not be read as a Compass backup.');
      }
    };
    reader.readAsText(file);
  });
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (confirm('This will permanently erase all data on this device. Continue?')) {
      state = defaultState();
      saveState(); closeSheets(); renderAll();
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
});
