const fs = require('fs');
const path = require('path');
const { getExchangeRate } = require('./price-fetcher');

const SNAPSHOTS_PATH = path.join(__dirname, '..', 'data', 'snapshots.json');

function readSnapshots() {
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOTS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function saveSnapshots(snapshots) {
  fs.writeFileSync(SNAPSHOTS_PATH, JSON.stringify(snapshots, null, 2), 'utf8');
}

function createSnapshot(assets, exchangeRates) {
  let domestic = 0;
  let overseas = 0;
  let estimatedAnnualDividend = 0;

  for (const asset of assets) {
    const rate = getExchangeRate(asset.currency, exchangeRates);
    const valueRMB = asset.currentValue * rate;
    const annualDiv = asset.currentValue * (asset.estimatedDividendYield || 0) * rate;

    if (asset.category.startsWith('overseas')) {
      overseas += valueRMB;
    } else {
      domestic += valueRMB;
    }
    estimatedAnnualDividend += annualDiv;
  }

  const totalValueRMB = domestic + overseas;

  const snapshot = {
    date: new Date().toISOString().slice(0, 10),
    totalValueRMB: Math.round(totalValueRMB),
    exchangeRates,
    assets: JSON.parse(JSON.stringify(assets)),
    summary: {
      domestic: Math.round(domestic),
      overseas: Math.round(overseas),
      estimatedAnnualDividend: Math.round(estimatedAnnualDividend),
      estimatedMonthlyCashFlow: Math.round(estimatedAnnualDividend / 12),
    },
  };

  const snapshots = readSnapshots();
  snapshots.push(snapshot);
  saveSnapshots(snapshots);
  return snapshot;
}

function getSnapshots() {
  return readSnapshots();
}

module.exports = { createSnapshot, getSnapshots };
