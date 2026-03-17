/* ── State ── */
let assets = [];
let snapshots = [];
let dividends = [];
let exchangeRates = { USD_CNY: 7.25, HKD_CNY: 0.93, SGD_CNY: 5.40 };
let allocationChart, splitChart, trendChart, targetChart, calendarChart;
let simAllocationChart, simSplitChart;
let simValues = {};

const TARGET_ALLOCATION = {
  'domestic-dividend': 0.35,
  'domestic-index': 0.25,
  'domestic-fixed': 0.12,
  'overseas-sg': 0.15,
  'overseas-hk': 0.13,
};

const CATEGORY_LABELS = {
  'domestic-dividend': 'Domestic Dividend Stocks',
  'domestic-index': 'Domestic Index ETF',
  'domestic-fixed': 'Domestic Fixed Income',
  'overseas-sg': 'Singapore',
  'overseas-hk': 'Hong Kong',
  'overseas-us': 'US',
};

const CATEGORY_COLORS = {
  'domestic-dividend': '#6c8cff',
  'domestic-index': '#4ecb71',
  'domestic-fixed': '#ffc145',
  'overseas-sg': '#ff8c5c',
  'overseas-hk': '#c47cff',
  'overseas-us': '#5ce0ff',
};

/* ── Storage Layer ── */
const STORE = {
  get(key) { try { return JSON.parse(localStorage.getItem('fund-' + key)); } catch { return null; } },
  set(key, val) { localStorage.setItem('fund-' + key, JSON.stringify(val)); },
  remove(key) { localStorage.removeItem('fund-' + key); },
};

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function saveAssets() {
  STORE.set('portfolio', assets);
  syncToGitHub('data/portfolio.json', assets);
}
function saveDividends() {
  STORE.set('dividends', dividends);
  syncToGitHub('data/dividends.json', dividends);
}
function saveSnapshots() {
  STORE.set('snapshots', snapshots);
  syncToGitHub('data/snapshots.json', snapshots);
}

/* ── GitHub Sync ── */
async function syncToGitHub(filePath, data) {
  const token = STORE.get('github-token');
  const repo = STORE.get('github-repo');
  if (!token || !repo) return;
  try {
    const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' };
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, { headers });
    const file = await res.json();
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2) + '\n')));
    await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
      method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Update ${filePath.split('/').pop()}`, content, sha: file.sha }),
    });
  } catch (e) { console.warn('GitHub sync failed:', e); }
}

function hasGitHubConfig() {
  return !!(STORE.get('github-token') && STORE.get('github-repo'));
}

/* ── Helpers ── */
function fmtNum(n, decimals = 0) {
  if (n == null || isNaN(n)) return '--';
  return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtMoney(n) {
  if (n == null) return '--';
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(2) + 'w';
  return fmtNum(n, 2);
}

function rateFor(currency) {
  switch (currency) {
    case 'CNY': return 1;
    case 'USD': return exchangeRates.USD_CNY || 7.25;
    case 'HKD': return exchangeRates.HKD_CNY || 0.93;
    case 'SGD': return exchangeRates.SGD_CNY || 5.40;
    default: return 1;
  }
}

function toRMB(value, currency) {
  return value * rateFor(currency);
}

/* ── Data Loading ── */
async function loadAll() {
  // Try localStorage first (has latest user edits)
  const stored = STORE.get('portfolio');
  if (stored) {
    assets = stored;
    dividends = STORE.get('dividends') || [];
    snapshots = STORE.get('snapshots') || [];
    const rates = STORE.get('rates');
    if (rates) exchangeRates = rates;
  } else {
    // First visit: load from static JSON files
    [assets, snapshots, dividends] = await Promise.all([
      fetch('data/portfolio.json').then(r => r.json()),
      fetch('data/snapshots.json').then(r => r.json()).catch(() => []),
      fetch('data/dividends.json').then(r => r.json()).catch(() => []),
    ]);
    STORE.set('portfolio', assets);
    STORE.set('dividends', dividends);
    STORE.set('snapshots', snapshots);
  }
  renderAll();
}

// Pull fresh data from repo (overwrites localStorage)
async function refreshFromSource() {
  try {
    const token = STORE.get('github-token');
    const repo = STORE.get('github-repo');

    if (token && repo) {
      // Fetch from GitHub API (works for private repos)
      const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3.raw' };
      const [a, s, d] = await Promise.all([
        fetch(`https://api.github.com/repos/${repo}/contents/data/portfolio.json`, { headers }).then(r => r.json()),
        fetch(`https://api.github.com/repos/${repo}/contents/data/snapshots.json`, { headers }).then(r => r.json()).catch(() => []),
        fetch(`https://api.github.com/repos/${repo}/contents/data/dividends.json`, { headers }).then(r => r.json()).catch(() => []),
      ]);
      assets = a; snapshots = s; dividends = d;
    } else {
      // Fetch from static files (GitHub Pages)
      [assets, snapshots, dividends] = await Promise.all([
        fetch('data/portfolio.json').then(r => r.json()),
        fetch('data/snapshots.json').then(r => r.json()).catch(() => []),
        fetch('data/dividends.json').then(r => r.json()).catch(() => []),
      ]);
    }
    STORE.set('portfolio', assets);
    STORE.set('dividends', dividends);
    STORE.set('snapshots', snapshots);
    renderAll();
    return true;
  } catch (e) {
    console.error('Refresh failed:', e);
    return false;
  }
}

function renderAll() {
  renderDashboard();
  renderAssets();
  renderSnapshots();
  renderDividends();
  renderCalendar();
}

/* ── Dashboard ── */
function renderDashboard() {
  let totalRMB = 0;
  let annualDiv = 0;
  const byCat = {};
  let domestic = 0, overseas = 0;

  for (const a of assets) {
    const rmb = toRMB(a.currentValue, a.currency);
    totalRMB += rmb;
    annualDiv += a.currentValue * (a.estimatedDividendYield || 0) * rateFor(a.currency);
    byCat[a.category] = (byCat[a.category] || 0) + rmb;
    if (a.category.startsWith('overseas')) overseas += rmb;
    else domestic += rmb;
  }

  const monthlyCF = annualDiv / 12;

  document.getElementById('totalValue').textContent = fmtMoney(totalRMB);
  document.getElementById('monthlyCF').textContent = fmtMoney(monthlyCF);
  document.getElementById('targetPct').textContent = (monthlyCF / 15000 * 100).toFixed(0) + '%';
  document.getElementById('annualDiv').textContent = fmtMoney(annualDiv);

  // Allocation pie
  const catLabels = Object.keys(byCat).map(k => CATEGORY_LABELS[k] || k);
  const catValues = Object.values(byCat);
  const catColors = Object.keys(byCat).map(k => CATEGORY_COLORS[k] || '#888');

  if (allocationChart) allocationChart.destroy();
  allocationChart = new Chart(document.getElementById('allocationChart'), {
    type: 'doughnut',
    data: { labels: catLabels, datasets: [{ data: catValues, backgroundColor: catColors, borderWidth: 0 }] },
    options: {
      plugins: {
        legend: { position: 'right', labels: { color: '#8b8fa3', font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmtMoney(ctx.raw)} RMB` } },
      },
    },
  });

  // Split pie
  if (splitChart) splitChart.destroy();
  splitChart = new Chart(document.getElementById('splitChart'), {
    type: 'doughnut',
    data: {
      labels: ['Domestic', 'Overseas'],
      datasets: [{ data: [domestic, overseas], backgroundColor: ['#6c8cff', '#ff8c5c'], borderWidth: 0 }],
    },
    options: {
      plugins: {
        legend: { position: 'right', labels: { color: '#8b8fa3', font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmtMoney(ctx.raw)} RMB (${(ctx.raw / totalRMB * 100).toFixed(1)}%)` } },
      },
    },
  });

  renderTargetVsActual(totalRMB, byCat);
}

/* ── Assets Tab ── */
function renderAssets() {
  const container = document.getElementById('assetsContainer');
  const grouped = {};
  for (const a of assets) {
    (grouped[a.category] = grouped[a.category] || []).push(a);
  }

  let html = '';
  for (const [cat, items] of Object.entries(grouped)) {
    const catTotal = items.reduce((s, a) => s + toRMB(a.currentValue, a.currency), 0);
    const catDiv = items.reduce((s, a) => s + toRMB(a.currentValue * (a.estimatedDividendYield || 0), a.currency), 0);
    html += `<div class="category-group">
      <div class="category-title">${CATEGORY_LABELS[cat] || cat} — ${fmtMoney(catTotal)} RMB <span style="color:var(--green);margin-left:1rem">annual div: ${fmtMoney(catDiv)} RMB</span></div>
      <table class="data-table"><thead><tr>
        <th>Name</th><th>Ticker</th><th>Shares</th><th>Cost</th><th>Price</th>
        <th>Value</th><th>Value (RMB)</th><th>P/L</th><th>Div Yield</th><th>Annual Div</th><th>Updated</th><th></th>
      </tr></thead><tbody>`;

    for (const a of items) {
      const valueRMB = toRMB(a.currentValue, a.currency);
      const costTotal = (a.shares || 0) * (a.costPrice || 0);
      const pl = costTotal > 0 ? ((a.currentValue - costTotal) / costTotal * 100) : 0;
      const plClass = pl >= 0 ? 'positive' : 'negative';

      html += `<tr>
        <td>${a.name}</td>
        <td>${a.ticker || '--'}</td>
        <td>${a.shares ? fmtNum(a.shares) : '--'}</td>
        <td>${a.costPrice ? fmtNum(a.costPrice, 2) : '--'}</td>
        <td>${a.currentPrice ? fmtNum(a.currentPrice, 2) : '--'}</td>
        <td>${fmtNum(a.currentValue, 0)} ${a.currency}</td>
        <td>${fmtMoney(valueRMB)}</td>
        <td class="${plClass}">${costTotal > 0 ? (pl >= 0 ? '+' : '') + pl.toFixed(2) + '%' : '--'}</td>
        <td>${a.estimatedDividendYield ? (a.estimatedDividendYield * 100).toFixed(1) + '%' : '--'}</td>
        <td>${a.estimatedDividendYield ? fmtNum(a.currentValue * a.estimatedDividendYield, 0) + ' ' + a.currency : '--'}</td>
        <td>${a.lastUpdated || '--'}</td>
        <td>
          <button class="btn" onclick="editAsset('${a.id}')" style="font-size:0.75rem;padding:0.2rem 0.5rem">Edit</button>
          <button class="btn btn-danger" onclick="removeAsset('${a.id}')">Del</button>
        </td>
      </tr>`;
    }
    html += '</tbody></table></div>';
  }
  container.innerHTML = html || '<p style="color:var(--text-muted)">No assets yet.</p>';
}

/* ── Snapshots Tab ── */
function renderSnapshots() {
  const tbody = document.querySelector('#snapshotTable tbody');
  tbody.innerHTML = snapshots.map(s => `<tr>
    <td>${s.date}</td>
    <td>${fmtMoney(s.totalValueRMB)}</td>
    <td>${fmtMoney(s.summary.domestic)}</td>
    <td>${fmtMoney(s.summary.overseas)}</td>
    <td>${fmtMoney(s.summary.estimatedMonthlyCashFlow)}</td>
  </tr>`).join('');

  // Trend chart
  if (trendChart) trendChart.destroy();
  if (snapshots.length > 0) {
    trendChart = new Chart(document.getElementById('trendChart'), {
      type: 'line',
      data: {
        labels: snapshots.map(s => s.date),
        datasets: [{
          label: 'Total Assets (RMB)',
          data: snapshots.map(s => s.totalValueRMB),
          borderColor: '#6c8cff',
          backgroundColor: 'rgba(108,140,255,0.1)',
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#8b8fa3' }, grid: { color: '#2e3144' } },
          y: { ticks: { color: '#8b8fa3', callback: v => fmtMoney(v) }, grid: { color: '#2e3144' } },
        },
      },
    });
  }
}

/* ── Dividends Tab ── */
function renderDividends() {
  const tbody = document.querySelector('#dividendTable tbody');
  tbody.innerHTML = dividends.map(d => `<tr>
    <td>${d.date}</td>
    <td>${d.assetName}</td>
    <td>${fmtNum(d.amount, 2)}</td>
    <td>${d.currency}</td>
    <td>${fmtNum(d.amountRMB, 2)}</td>
    <td>${d.note || ''}</td>
    <td><button class="btn btn-danger" onclick="removeDividend('${d.id}')">Del</button></td>
  </tr>`).join('');

  const totalRMB = dividends.reduce((s, d) => s + (d.amountRMB || 0), 0);
  document.getElementById('totalDividends').textContent = fmtMoney(totalRMB);

  // Calculate months span
  if (dividends.length > 0) {
    const dates = dividends.map(d => new Date(d.date)).sort((a, b) => a - b);
    const months = Math.max(1, (dates[dates.length - 1] - dates[0]) / (30 * 86400000) + 1);
    document.getElementById('avgMonthlyDiv').textContent = fmtMoney(totalRMB / months);
  } else {
    document.getElementById('avgMonthlyDiv').textContent = '--';
  }
}

/* ── Auto RMB Conversion ── */
function autoCalcDivRMB() {
  const currency = document.getElementById('divCurrency').value;
  const amount = parseFloat(document.getElementById('divAmount').value);
  if (!isNaN(amount)) {
    document.getElementById('divAmountRMB').value = (amount * rateFor(currency)).toFixed(2);
  }
}

/* ── Target vs Actual Allocation ── */
function renderTargetVsActual(totalRMB, byCat) {
  const categories = Object.keys(TARGET_ALLOCATION);
  const targetPcts = categories.map(c => TARGET_ALLOCATION[c] * 100);
  const actualPcts = categories.map(c => totalRMB > 0 ? ((byCat[c] || 0) / totalRMB * 100) : 0);
  const labels = categories.map(c => CATEGORY_LABELS[c] || c);

  if (targetChart) targetChart.destroy();
  targetChart = new Chart(document.getElementById('targetChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Target %', data: targetPcts, backgroundColor: 'rgba(108,140,255,0.6)', borderColor: '#6c8cff', borderWidth: 1 },
        { label: 'Actual %', data: actualPcts, backgroundColor: 'rgba(78,203,113,0.6)', borderColor: '#4ecb71', borderWidth: 1 },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#8b8fa3', font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%` } },
      },
      scales: {
        x: { ticks: { color: '#8b8fa3', font: { size: 10 } }, grid: { color: '#2e3144' } },
        y: { ticks: { color: '#8b8fa3', callback: v => v + '%' }, grid: { color: '#2e3144' }, beginAtZero: true },
      },
    },
  });

  // Drift table
  let html = '<table class="data-table"><thead><tr><th>Category</th><th>Target %</th><th>Actual %</th><th>Drift</th><th>Target (RMB)</th><th>Actual (RMB)</th></tr></thead><tbody>';
  categories.forEach((c, i) => {
    const drift = actualPcts[i] - targetPcts[i];
    const highlight = Math.abs(drift) > 5 ? ' style="background:rgba(255,92,92,0.15)"' : '';
    const targetRMB = totalRMB * TARGET_ALLOCATION[c];
    const actualRMB = byCat[c] || 0;
    html += `<tr${highlight}>
      <td>${labels[i]}</td>
      <td>${targetPcts[i].toFixed(1)}%</td>
      <td>${actualPcts[i].toFixed(1)}%</td>
      <td class="${drift >= 0 ? 'positive' : 'negative'}">${drift >= 0 ? '+' : ''}${drift.toFixed(1)}%</td>
      <td>${fmtMoney(targetRMB)}</td>
      <td>${fmtMoney(actualRMB)}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('driftTable').innerHTML = html;
}

/* ── Calendar Tab ── */
function renderCalendar() {
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthData = Array.from({ length: 12 }, () => ({ total: 0, assets: [] }));

  for (const a of assets) {
    const months = a.dividendMonths || [];
    if (months.length === 0 || !a.estimatedDividendYield) continue;
    const annualDiv = a.currentValue * a.estimatedDividendYield;
    const perPayout = annualDiv / months.length;
    const perPayoutRMB = perPayout * rateFor(a.currency);
    for (const m of months) {
      if (m >= 1 && m <= 12) {
        monthData[m - 1].total += perPayoutRMB;
        monthData[m - 1].assets.push({ name: a.name, amount: perPayoutRMB });
      }
    }
  }

  const totals = monthData.map(d => d.total);
  const annualTotal = totals.reduce((s, v) => s + v, 0);
  const activeMonths = totals.filter(v => v > 0).length;

  document.getElementById('calAnnualDiv').textContent = fmtMoney(annualTotal);
  document.getElementById('calMonthlyAvg').textContent = fmtMoney(activeMonths > 0 ? annualTotal / 12 : 0);
  document.getElementById('calActiveMonths').textContent = activeMonths + ' / 12';

  if (calendarChart) calendarChart.destroy();
  calendarChart = new Chart(document.getElementById('calendarChart'), {
    type: 'bar',
    data: {
      labels: monthNames,
      datasets: [{
        label: 'Dividend (RMB)',
        data: totals,
        backgroundColor: 'rgba(78,203,113,0.6)',
        borderColor: '#4ecb71',
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => fmtMoney(ctx.raw) + ' RMB' } },
        annotation: undefined,
      },
      scales: {
        x: { ticks: { color: '#8b8fa3' }, grid: { color: '#2e3144' } },
        y: { ticks: { color: '#8b8fa3', callback: v => fmtMoney(v) }, grid: { color: '#2e3144' }, beginAtZero: true },
      },
    },
    plugins: [{
      id: 'targetLine',
      afterDraw(chart) {
        const yScale = chart.scales.y;
        const xScale = chart.scales.x;
        const y = yScale.getPixelForValue(15000);
        if (y >= yScale.top && y <= yScale.bottom) {
          const ctx = chart.ctx;
          ctx.save();
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = '#ff5c5c';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(xScale.left, y);
          ctx.lineTo(xScale.right, y);
          ctx.stroke();
          ctx.fillStyle = '#ff5c5c';
          ctx.font = '11px sans-serif';
          ctx.fillText('Target: 15,000', xScale.right - 90, y - 6);
          ctx.restore();
        }
      },
    }],
  });

  // Monthly detail table
  const tbody = document.querySelector('#calendarTable tbody');
  tbody.innerHTML = monthData.map((d, i) => {
    const assetList = d.assets.map(a => `${a.name} (${fmtNum(a.amount, 0)})`).join(', ');
    return `<tr>
      <td>${monthNames[i]}</td>
      <td>${assetList || '--'}</td>
      <td>${d.total > 0 ? fmtNum(d.total, 0) : '--'}</td>
    </tr>`;
  }).join('');
}

/* ── Simulator Tab ── */
function initSimulator() {
  simValues = {};
  for (const a of assets) {
    simValues[a.id] = a.currentValue;
  }
  renderSimulator();
}

function updateSimValue(id, value) {
  simValues[id] = value;
  renderSimulator();
}

function renderSimulator() {
  // Current stats
  let curTotal = 0, curDiv = 0, curOverseas = 0;
  for (const a of assets) {
    const rmb = toRMB(a.currentValue, a.currency);
    curTotal += rmb;
    curDiv += a.currentValue * (a.estimatedDividendYield || 0) * rateFor(a.currency);
    if (a.category.startsWith('overseas')) curOverseas += rmb;
  }

  // Simulated stats
  let simTotal = 0, simDiv = 0, simOverseas = 0;
  const simByCat = {};
  let simDomestic = 0, simOverseasTotal = 0;
  for (const a of assets) {
    const val = simValues[a.id] ?? a.currentValue;
    const rmb = toRMB(val, a.currency);
    simTotal += rmb;
    simDiv += val * (a.estimatedDividendYield || 0) * rateFor(a.currency);
    simByCat[a.category] = (simByCat[a.category] || 0) + rmb;
    if (a.category.startsWith('overseas')) { simOverseas += rmb; simOverseasTotal += rmb; }
    else simDomestic += rmb;
  }

  document.getElementById('simCurrentTotal').textContent = fmtMoney(curTotal);
  document.getElementById('simNewTotal').textContent = fmtMoney(simTotal);
  document.getElementById('simCurrentCF').textContent = fmtMoney(curDiv / 12);
  document.getElementById('simNewCF').textContent = fmtMoney(simDiv / 12);
  document.getElementById('simCurrentOverseas').textContent = curTotal > 0 ? (curOverseas / curTotal * 100).toFixed(1) + '%' : '--';
  document.getElementById('simNewOverseas').textContent = simTotal > 0 ? (simOverseas / simTotal * 100).toFixed(1) + '%' : '--';

  // Simulated allocation pie
  const catLabels = Object.keys(simByCat).map(k => CATEGORY_LABELS[k] || k);
  const catValues = Object.values(simByCat);
  const catColors = Object.keys(simByCat).map(k => CATEGORY_COLORS[k] || '#888');

  if (simAllocationChart) simAllocationChart.destroy();
  simAllocationChart = new Chart(document.getElementById('simAllocationChart'), {
    type: 'doughnut',
    data: { labels: catLabels, datasets: [{ data: catValues, backgroundColor: catColors, borderWidth: 0 }] },
    options: {
      plugins: {
        legend: { position: 'right', labels: { color: '#8b8fa3', font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmtMoney(ctx.raw)} RMB` } },
      },
    },
  });

  if (simSplitChart) simSplitChart.destroy();
  simSplitChart = new Chart(document.getElementById('simSplitChart'), {
    type: 'doughnut',
    data: {
      labels: ['Domestic', 'Overseas'],
      datasets: [{ data: [simDomestic, simOverseasTotal], backgroundColor: ['#6c8cff', '#ff8c5c'], borderWidth: 0 }],
    },
    options: {
      plugins: {
        legend: { position: 'right', labels: { color: '#8b8fa3', font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmtMoney(ctx.raw)} RMB (${(ctx.raw / simTotal * 100).toFixed(1)}%)` } },
      },
    },
  });

  // Editable table
  let html = '<table class="data-table"><thead><tr><th>Name</th><th>Category</th><th>Currency</th><th>Current Value</th><th>Simulated Value</th><th>Diff (RMB)</th></tr></thead><tbody>';
  for (const a of assets) {
    const simVal = simValues[a.id] ?? a.currentValue;
    const diffRMB = toRMB(simVal - a.currentValue, a.currency);
    const diffClass = diffRMB >= 0 ? 'positive' : 'negative';
    html += `<tr>
      <td>${a.name}</td>
      <td>${CATEGORY_LABELS[a.category] || a.category}</td>
      <td>${a.currency}</td>
      <td>${fmtNum(a.currentValue, 0)}</td>
      <td><input type="number" value="${simVal}" step="any" style="width:120px;padding:0.3rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.85rem" onchange="updateSimValue('${a.id}', parseFloat(this.value)||0)"></td>
      <td class="${diffClass}">${diffRMB >= 0 ? '+' : ''}${fmtMoney(diffRMB)}</td>
    </tr>`;
  }
  html += '</tbody></table>';
  document.getElementById('simTableContainer').innerHTML = html;
}

/* ── Actions ── */
document.getElementById('btnUpdatePrices').addEventListener('click', async function () {
  const token = STORE.get('github-token');
  const repo = STORE.get('github-repo');
  if (!token || !repo) {
    alert('Please configure GitHub settings first (click Settings button) to enable price updates.');
    return;
  }
  this.classList.add('loading');
  this.textContent = 'Triggering...';
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: 'POST',
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'update-prices' }),
    });
    if (res.ok || res.status === 204) {
      alert('Price update triggered! GitHub Actions will update prices and commit in ~2 min. Click "Refresh from GitHub" afterwards.');
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (e) {
    alert('Failed to trigger update: ' + e.message);
  }
  this.classList.remove('loading');
  this.textContent = 'Update Prices';
});

document.getElementById('btnSnapshot').addEventListener('click', function () {
  let totalRMB = 0, domestic = 0, overseas = 0, annualDiv = 0;
  for (const a of assets) {
    const rmb = toRMB(a.currentValue, a.currency);
    totalRMB += rmb;
    annualDiv += a.currentValue * (a.estimatedDividendYield || 0) * rateFor(a.currency);
    if (a.category.startsWith('overseas')) overseas += rmb;
    else domestic += rmb;
  }
  const snap = {
    id: 'snap-' + Date.now(),
    date: new Date().toISOString().slice(0, 10),
    totalValueRMB: totalRMB,
    summary: { domestic, overseas, estimatedMonthlyCashFlow: annualDiv / 12 },
  };
  snapshots.push(snap);
  saveSnapshots();
  renderSnapshots();
});

/* ── Asset Modal ── */
const assetModal = document.getElementById('assetModal');
const assetForm = document.getElementById('assetForm');

document.getElementById('btnAddAsset').addEventListener('click', () => {
  document.getElementById('assetModalTitle').textContent = 'Add Asset';
  assetForm.reset();
  document.getElementById('assetId').value = '';
  assetModal.classList.add('open');
});

document.getElementById('assetModalCancel').addEventListener('click', () => {
  assetModal.classList.remove('open');
});

window.editAsset = function (id) {
  const a = assets.find(x => x.id === id);
  if (!a) return;
  document.getElementById('assetModalTitle').textContent = 'Edit Asset';
  document.getElementById('assetId').value = a.id;
  document.getElementById('assetName').value = a.name;
  document.getElementById('assetTicker').value = a.ticker || '';
  document.getElementById('assetCategory').value = a.category;
  document.getElementById('assetCurrency').value = a.currency;
  document.getElementById('assetShares').value = a.shares || '';
  document.getElementById('assetCostPrice').value = a.costPrice || '';
  document.getElementById('assetCurrentPrice').value = a.currentPrice || '';
  document.getElementById('assetCurrentValue').value = a.currentValue || '';
  document.getElementById('assetDivYield').value = a.estimatedDividendYield || '';
  document.getElementById('assetDivMonths').value = (a.dividendMonths || []).join(',');
  document.getElementById('assetIsManual').checked = !!a.isManual;
  assetModal.classList.add('open');
};

assetForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('assetId').value;
  const data = {
    name: document.getElementById('assetName').value,
    ticker: document.getElementById('assetTicker').value,
    category: document.getElementById('assetCategory').value,
    currency: document.getElementById('assetCurrency').value,
    shares: parseFloat(document.getElementById('assetShares').value) || 0,
    costPrice: parseFloat(document.getElementById('assetCostPrice').value) || 0,
    currentPrice: parseFloat(document.getElementById('assetCurrentPrice').value) || 0,
    currentValue: parseFloat(document.getElementById('assetCurrentValue').value) || 0,
    estimatedDividendYield: parseFloat(document.getElementById('assetDivYield').value) || 0,
    dividendMonths: document.getElementById('assetDivMonths').value
      .split(',').map(s => parseInt(s.trim())).filter(n => n >= 1 && n <= 12),
    isManual: document.getElementById('assetIsManual').checked,
  };

  if (id) {
    const idx = assets.findIndex(a => a.id === id);
    if (idx >= 0) Object.assign(assets[idx], data);
  } else {
    data.id = 'asset-' + Date.now();
    data.lastUpdated = new Date().toISOString().slice(0, 10);
    assets.push(data);
  }
  saveAssets();
  assetModal.classList.remove('open');
  renderAll();
});

window.removeAsset = function (id) {
  if (!confirm('Delete this asset?')) return;
  assets = assets.filter(a => a.id !== id);
  saveAssets();
  renderAll();
};

/* ── Dividend Modal ── */
const divModal = document.getElementById('dividendModal');
const divForm = document.getElementById('dividendForm');

document.getElementById('btnAddDividend').addEventListener('click', () => {
  divForm.reset();
  const select = document.getElementById('divAsset');
  select.innerHTML = assets.map(a => `<option value="${a.id}" data-currency="${a.currency}">${a.name}</option>`).join('');
  // Auto-set currency from first asset
  if (assets.length > 0) {
    document.getElementById('divCurrency').value = assets[0].currency;
  }
  divModal.classList.add('open');
});

// Auto RMB conversion listeners
document.getElementById('divCurrency').addEventListener('change', autoCalcDivRMB);
document.getElementById('divAmount').addEventListener('input', autoCalcDivRMB);
document.getElementById('divAsset').addEventListener('change', function () {
  const asset = assets.find(a => a.id === this.value);
  if (asset) {
    document.getElementById('divCurrency').value = asset.currency;
    autoCalcDivRMB();
  }
});

document.getElementById('divModalCancel').addEventListener('click', () => {
  divModal.classList.remove('open');
});

divForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const sel = document.getElementById('divAsset');
  const asset = assets.find(a => a.id === sel.value);
  const data = {
    id: 'div-' + Date.now(),
    assetId: sel.value,
    assetName: asset ? asset.name : 'Unknown',
    date: document.getElementById('divDate').value,
    amount: parseFloat(document.getElementById('divAmount').value),
    currency: document.getElementById('divCurrency').value,
    amountRMB: parseFloat(document.getElementById('divAmountRMB').value),
    note: document.getElementById('divNote').value,
  };
  dividends.push(data);
  saveDividends();
  divModal.classList.remove('open');
  renderAll();
});

window.removeDividend = function (id) {
  if (!confirm('Delete this dividend record?')) return;
  dividends = dividends.filter(d => d.id !== id);
  saveDividends();
  renderAll();
};

/* ── Settings Modal ── */
const settingsModal = document.getElementById('settingsModal');

document.getElementById('btnSettings').addEventListener('click', () => {
  document.getElementById('settingsRepo').value = STORE.get('github-repo') || '';
  document.getElementById('settingsToken').value = STORE.get('github-token') || '';
  settingsModal.classList.add('open');
});

document.getElementById('settingsCancel').addEventListener('click', () => {
  settingsModal.classList.remove('open');
});

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const repo = document.getElementById('settingsRepo').value.trim();
  const token = document.getElementById('settingsToken').value.trim();
  if (repo) STORE.set('github-repo', repo); else STORE.remove('github-repo');
  if (token) STORE.set('github-token', token); else STORE.remove('github-token');

  // Handle password
  const removeAuth = document.getElementById('settingsRemoveAuth').checked;
  const newPwd = document.getElementById('settingsPassword').value;
  if (removeAuth) {
    STORE.remove('auth-hash');
    syncToGitHub('data/auth.json', {});
  } else if (newPwd) {
    const hash = await sha256(newPwd);
    STORE.set('auth-hash', hash);
    sessionStorage.setItem('fund-authed', 'true');
    syncToGitHub('data/auth.json', { hash });
  }

  settingsModal.classList.remove('open');
  document.getElementById('settingsPassword').value = '';
  document.getElementById('settingsRemoveAuth').checked = false;
  alert('Settings saved.');
});

document.getElementById('btnRefreshFromSource').addEventListener('click', async function () {
  if (!confirm('This will overwrite local data with the latest from GitHub. Continue?')) return;
  this.textContent = 'Refreshing...';
  const ok = await refreshFromSource();
  this.textContent = 'Refresh Data from GitHub';
  if (ok) alert('Data refreshed from source.');
  else alert('Failed to refresh. Check console for details.');
});

/* ── Simulator Reset ── */
document.getElementById('btnSimReset').addEventListener('click', () => {
  initSimulator();
});

/* ── Tabs ── */
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'simulator') initSimulator();
  });
});

/* ── Auth ── */
async function checkAuth() {
  // Try to load auth hash from deployed file
  let hash = STORE.get('auth-hash');
  if (!hash) {
    try {
      const res = await fetch('data/auth.json');
      if (res.ok) {
        const auth = await res.json();
        if (auth.hash) { hash = auth.hash; STORE.set('auth-hash', hash); }
      }
    } catch {}
  }

  if (!hash || sessionStorage.getItem('fund-authed') === 'true') {
    // No auth or already logged in
    document.getElementById('loginOverlay').style.display = 'none';
    loadAll();
    return;
  }

  // Show login screen
  document.getElementById('loginOverlay').style.display = 'flex';
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pwd = document.getElementById('loginPassword').value;
  const hash = await sha256(pwd);
  const stored = STORE.get('auth-hash');
  if (hash === stored) {
    sessionStorage.setItem('fund-authed', 'true');
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('loginError').style.display = 'none';
    loadAll();
  } else {
    document.getElementById('loginError').style.display = 'block';
  }
});

/* ── Init ── */
checkAuth();
