const https = require('https');

/* ── Helpers ── */
const delay = (ms) => new Promise(r => setTimeout(r, ms));
const FETCH_DELAY = 2000;

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

/* ── Yahoo Finance (primary) ── */
let _yf = null;
async function getYF() {
  if (!_yf) {
    const mod = await import('yahoo-finance2');
    const YahooFinance = mod.default;
    _yf = new YahooFinance();
  }
  return _yf;
}

async function fetchPriceYahoo(ticker) {
  const yahooFinance = await getYF();
  const result = await yahooFinance.quote(ticker);
  return {
    price: result.regularMarketPrice,
    currency: result.currency,
    name: result.shortName || result.longName,
  };
}

/* ── Sina Finance (fallback) ── */
function tickerToSina(ticker) {
  if (ticker.endsWith('.SS')) return 'sh' + ticker.replace('.SS', '');
  if (ticker.endsWith('.SZ')) return 'sz' + ticker.replace('.SZ', '');
  if (ticker.endsWith('.HK')) {
    const code = ticker.replace('.HK', '');
    return 'hk' + code.padStart(5, '0');
  }
  // US stock
  return 'gb_' + ticker.toLowerCase();
}

async function fetchPriceSina(ticker) {
  const sinaCode = tickerToSina(ticker);
  const url = `https://hq.sinajs.cn/list=${sinaCode}`;
  const body = await httpGet(url, { Referer: 'https://finance.sina.com.cn' });

  const match = body.match(/"(.+)"/);
  if (!match || !match[1]) return null;
  const fields = match[1].split(',');

  let price, name;
  if (sinaCode.startsWith('sh') || sinaCode.startsWith('sz')) {
    // A-shares: 0=name, 3=current price
    name = fields[0];
    price = parseFloat(fields[3]);
  } else if (sinaCode.startsWith('hk')) {
    // HK: 1=Chinese name, 6=current price
    name = fields[1];
    price = parseFloat(fields[6]);
  } else if (sinaCode.startsWith('gb_')) {
    // US: 0=name, 1=current price
    name = fields[0];
    price = parseFloat(fields[1]);
  }

  if (!price || isNaN(price)) return null;
  return { price, name };
}

/* ── Price fetch with fallback ── */
async function fetchPrice(ticker) {
  // Try Yahoo first
  try {
    const result = await fetchPriceYahoo(ticker);
    if (result && result.price) {
      console.log(`  [Yahoo] ${ticker}: ${result.price}`);
      return result;
    }
  } catch (err) {
    console.warn(`  [Yahoo] ${ticker} failed: ${err.message}`);
  }

  // Fallback to Sina
  try {
    const result = await fetchPriceSina(ticker);
    if (result && result.price) {
      console.log(`  [Sina]  ${ticker}: ${result.price}`);
      return result;
    }
  } catch (err) {
    console.warn(`  [Sina]  ${ticker} failed: ${err.message}`);
  }

  console.error(`  [FAIL]  ${ticker}: all sources failed`);
  return null;
}

/* ── Exchange Rates ── */
const EXCHANGE_RATE_SYMBOLS = {
  USD_CNY: 'CNY=X',
  HKD_CNY: 'HKDCNY=X',
  SGD_CNY: 'SGDCNY=X',
};

async function fetchRatesYahoo() {
  const yahooFinance = await getYF();
  const rates = {};
  const entries = Object.entries(EXCHANGE_RATE_SYMBOLS);
  for (let i = 0; i < entries.length; i++) {
    const [key, symbol] = entries[i];
    if (i > 0) await delay(FETCH_DELAY);
    const result = await yahooFinance.quote(symbol);
    rates[key] = result.regularMarketPrice;
    console.log(`  [Yahoo] ${key}: ${rates[key]}`);
  }
  return rates;
}

async function fetchRatesFallback() {
  const body = await httpGet('https://open.er-api.com/v6/latest/USD');
  const data = JSON.parse(body);
  const r = data.rates;
  const rates = {
    USD_CNY: r.CNY,
    HKD_CNY: r.CNY / r.HKD,
    SGD_CNY: r.CNY / r.SGD,
  };
  console.log(`  [er-api] USD_CNY: ${rates.USD_CNY}, HKD_CNY: ${rates.HKD_CNY.toFixed(4)}, SGD_CNY: ${rates.SGD_CNY.toFixed(4)}`);
  return rates;
}

async function fetchExchangeRates() {
  console.log('Fetching exchange rates...');
  try {
    return await fetchRatesYahoo();
  } catch (err) {
    console.warn(`  [Yahoo] rates failed: ${err.message}, trying fallback...`);
  }
  try {
    return await fetchRatesFallback();
  } catch (err) {
    console.error(`  [FAIL] rates fallback failed: ${err.message}`);
  }
  console.warn('  Using hardcoded fallback rates');
  return { USD_CNY: 7.25, HKD_CNY: 0.93, SGD_CNY: 5.40 };
}

/* ── Shared ── */
function getExchangeRate(currency, rates) {
  switch (currency) {
    case 'CNY': return 1;
    case 'USD': return rates.USD_CNY || 7.25;
    case 'HKD': return rates.HKD_CNY || 0.93;
    case 'SGD': return rates.SGD_CNY || 5.40;
    default: return 1;
  }
}

async function updateAllPrices(assets) {
  const rates = await fetchExchangeRates();
  const now = new Date().toISOString().slice(0, 10);

  console.log('Fetching asset prices...');
  const updated = [];
  for (const asset of assets) {
    if (asset.isManual) {
      updated.push({ ...asset, lastUpdated: now });
      continue;
    }
    await delay(FETCH_DELAY);
    const result = await fetchPrice(asset.ticker);
    if (!result) {
      updated.push(asset);
      continue;
    }
    const newPrice = result.price;
    const newValue = asset.shares * newPrice;
    updated.push({ ...asset, currentPrice: newPrice, currentValue: newValue, lastUpdated: now });
  }

  return { assets: updated, exchangeRates: rates };
}

module.exports = {
  fetchPrice,
  fetchExchangeRates,
  getExchangeRate,
  updateAllPrices,
};
