#!/usr/bin/env node

/**
 * Standalone price update script for GitHub Actions.
 * Reads portfolio.json, fetches latest prices, writes back.
 */

const fs = require('fs');
const path = require('path');
const { updateAllPrices } = require('../lib/price-fetcher');

const DATA_DIR = path.join(__dirname, '..', 'data');

async function main() {
  const portfolioPath = path.join(DATA_DIR, 'portfolio.json');
  const assets = JSON.parse(fs.readFileSync(portfolioPath, 'utf8'));

  console.log(`Updating prices for ${assets.length} assets...`);
  const { assets: updated, exchangeRates } = await updateAllPrices(assets);

  fs.writeFileSync(portfolioPath, JSON.stringify(updated, null, 2) + '\n');
  console.log('Portfolio updated.');
  console.log('Exchange rates:', JSON.stringify(exchangeRates, null, 2));

  // Also save a snapshot automatically
  let totalRMB = 0, domestic = 0, overseas = 0, annualDiv = 0;
  for (const a of updated) {
    const rate = rateFor(a.currency, exchangeRates);
    const rmb = a.currentValue * rate;
    totalRMB += rmb;
    annualDiv += a.currentValue * (a.estimatedDividendYield || 0) * rate;
    if (a.category.startsWith('overseas')) overseas += rmb;
    else domestic += rmb;
  }

  const snapshotsPath = path.join(DATA_DIR, 'snapshots.json');
  let snapshots = [];
  try { snapshots = JSON.parse(fs.readFileSync(snapshotsPath, 'utf8')); } catch {}

  const today = new Date().toISOString().slice(0, 10);
  // Don't duplicate if already snapped today
  if (!snapshots.some(s => s.date === today)) {
    snapshots.push({
      id: 'snap-' + Date.now(),
      date: today,
      totalValueRMB: totalRMB,
      summary: { domestic, overseas, estimatedMonthlyCashFlow: annualDiv / 12 },
    });
    fs.writeFileSync(snapshotsPath, JSON.stringify(snapshots, null, 2) + '\n');
    console.log(`Snapshot saved for ${today}. Total: ${(totalRMB / 10000).toFixed(2)}w RMB`);
  }
}

function rateFor(currency, rates) {
  switch (currency) {
    case 'CNY': return 1;
    case 'USD': return rates.USD_CNY || 7.25;
    case 'HKD': return rates.HKD_CNY || 0.93;
    case 'SGD': return rates.SGD_CNY || 5.40;
    default: return 1;
  }
}

main().catch(e => {
  console.error('Update failed:', e);
  process.exit(1);
});
