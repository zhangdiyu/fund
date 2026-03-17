/* ── State ── */
let assets = [];
let snapshots = [];
let dividends = [];
let exchangeRates = { USD_CNY: 7.25, HKD_CNY: 0.93, SGD_CNY: 5.40 };
let allocationChart, splitChart, trendChart;

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

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return res.json();
}

/* ── Data Loading ── */
async function loadAll() {
  [assets, snapshots, dividends] = await Promise.all([
    api('/api/portfolio'),
    api('/api/snapshots'),
    api('/api/dividends'),
  ]);
  renderAll();
}

function renderAll() {
  renderDashboard();
  renderAssets();
  renderSnapshots();
  renderDividends();
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

/* ── Actions ── */
document.getElementById('btnUpdatePrices').addEventListener('click', async function () {
  this.classList.add('loading');
  this.textContent = 'Updating...';
  try {
    const result = await api('/api/update-prices', { method: 'POST' });
    assets = result.assets;
    exchangeRates = result.exchangeRates;
    document.getElementById('ratesDisplay').innerHTML =
      `<span class="rate-item">USD/CNY: <span>${exchangeRates.USD_CNY?.toFixed(4)}</span></span>` +
      `<span class="rate-item">HKD/CNY: <span>${exchangeRates.HKD_CNY?.toFixed(4)}</span></span>` +
      `<span class="rate-item">SGD/CNY: <span>${exchangeRates.SGD_CNY?.toFixed(4)}</span></span>`;
    renderAll();
  } catch (e) {
    alert('Failed to update prices: ' + e.message);
  }
  this.classList.remove('loading');
  this.textContent = 'Update Prices';
});

document.getElementById('btnSnapshot').addEventListener('click', async function () {
  this.classList.add('loading');
  try {
    const snap = await api('/api/snapshots', { method: 'POST' });
    snapshots.push(snap);
    renderSnapshots();
  } catch (e) {
    alert('Failed to save snapshot: ' + e.message);
  }
  this.classList.remove('loading');
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
  document.getElementById('assetIsManual').checked = !!a.isManual;
  assetModal.classList.add('open');
};

assetForm.addEventListener('submit', async (e) => {
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
    isManual: document.getElementById('assetIsManual').checked,
  };

  if (id) {
    await api(`/api/portfolio/asset/${id}`, { method: 'PUT', body: data });
  } else {
    await api('/api/portfolio/asset', { method: 'POST', body: data });
  }
  assetModal.classList.remove('open');
  assets = await api('/api/portfolio');
  renderAll();
});

window.removeAsset = async function (id) {
  if (!confirm('Delete this asset?')) return;
  await api(`/api/portfolio/asset/${id}`, { method: 'DELETE' });
  assets = await api('/api/portfolio');
  renderAll();
};

/* ── Dividend Modal ── */
const divModal = document.getElementById('dividendModal');
const divForm = document.getElementById('dividendForm');

document.getElementById('btnAddDividend').addEventListener('click', () => {
  divForm.reset();
  const select = document.getElementById('divAsset');
  select.innerHTML = assets.map(a => `<option value="${a.id}" data-currency="${a.currency}">${a.name}</option>`).join('');
  divModal.classList.add('open');
});

document.getElementById('divModalCancel').addEventListener('click', () => {
  divModal.classList.remove('open');
});

divForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const sel = document.getElementById('divAsset');
  const asset = assets.find(a => a.id === sel.value);
  const data = {
    assetId: sel.value,
    assetName: asset ? asset.name : 'Unknown',
    date: document.getElementById('divDate').value,
    amount: parseFloat(document.getElementById('divAmount').value),
    currency: document.getElementById('divCurrency').value,
    amountRMB: parseFloat(document.getElementById('divAmountRMB').value),
    note: document.getElementById('divNote').value,
  };
  await api('/api/dividends', { method: 'POST', body: data });
  divModal.classList.remove('open');
  dividends = await api('/api/dividends');
  renderAll();
});

window.removeDividend = async function (id) {
  if (!confirm('Delete this dividend record?')) return;
  await api(`/api/dividends/${id}`, { method: 'DELETE' });
  dividends = await api('/api/dividends');
  renderAll();
};

/* ── Tabs ── */
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

/* ── Init ── */
loadAll();
