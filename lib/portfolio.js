const fs = require('fs');
const path = require('path');

const PORTFOLIO_PATH = path.join(__dirname, '..', 'data', 'portfolio.json');
const DIVIDENDS_PATH = path.join(__dirname, '..', 'data', 'dividends.json');

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return [];
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getPortfolio() {
  return readJSON(PORTFOLIO_PATH);
}

function savePortfolio(assets) {
  writeJSON(PORTFOLIO_PATH, assets);
}

function addAsset(asset) {
  const assets = getPortfolio();
  assets.push(asset);
  savePortfolio(assets);
  return asset;
}

function updateAsset(id, updates) {
  const assets = getPortfolio();
  const idx = assets.findIndex(a => a.id === id);
  if (idx === -1) return null;
  assets[idx] = { ...assets[idx], ...updates, id };
  savePortfolio(assets);
  return assets[idx];
}

function deleteAsset(id) {
  const assets = getPortfolio();
  const idx = assets.findIndex(a => a.id === id);
  if (idx === -1) return false;
  assets.splice(idx, 1);
  savePortfolio(assets);
  return true;
}

function getDividends() {
  return readJSON(DIVIDENDS_PATH);
}

function saveDividends(dividends) {
  writeJSON(DIVIDENDS_PATH, dividends);
}

function addDividend(record) {
  const dividends = getDividends();
  dividends.push(record);
  saveDividends(dividends);
  return record;
}

function deleteDividend(id) {
  const dividends = getDividends();
  const idx = dividends.findIndex(d => d.id === id);
  if (idx === -1) return false;
  dividends.splice(idx, 1);
  saveDividends(dividends);
  return true;
}

module.exports = {
  getPortfolio,
  savePortfolio,
  addAsset,
  updateAsset,
  deleteAsset,
  getDividends,
  saveDividends,
  addDividend,
  deleteDividend,
};
