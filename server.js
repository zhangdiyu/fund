const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const portfolio = require('./lib/portfolio');
const priceFetcher = require('./lib/price-fetcher');
const snapshot = require('./lib/snapshot');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data', express.static(path.join(__dirname, 'data')));

// --- Portfolio ---
app.get('/api/portfolio', (req, res) => {
  res.json(portfolio.getPortfolio());
});

app.post('/api/portfolio/asset', (req, res) => {
  const asset = { id: uuidv4(), ...req.body, lastUpdated: new Date().toISOString().slice(0, 10) };
  portfolio.addAsset(asset);
  res.json(asset);
});

app.put('/api/portfolio/asset/:id', (req, res) => {
  const updated = portfolio.updateAsset(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Asset not found' });
  res.json(updated);
});

app.delete('/api/portfolio/asset/:id', (req, res) => {
  const deleted = portfolio.deleteAsset(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Asset not found' });
  res.json({ success: true });
});

// --- Price Update ---
app.post('/api/update-prices', async (req, res) => {
  try {
    const assets = portfolio.getPortfolio();
    const result = await priceFetcher.updateAllPrices(assets);
    portfolio.savePortfolio(result.assets);
    res.json(result);
  } catch (err) {
    console.error('Price update error:', err);
    res.status(500).json({ error: 'Failed to update prices' });
  }
});

// --- Snapshots ---
app.get('/api/snapshots', (req, res) => {
  res.json(snapshot.getSnapshots());
});

app.post('/api/snapshots', async (req, res) => {
  try {
    const assets = portfolio.getPortfolio();
    const rates = await priceFetcher.fetchExchangeRates();
    const snap = snapshot.createSnapshot(assets, rates);
    res.json(snap);
  } catch (err) {
    console.error('Snapshot error:', err);
    res.status(500).json({ error: 'Failed to create snapshot' });
  }
});

// --- Dividends ---
app.get('/api/dividends', (req, res) => {
  res.json(portfolio.getDividends());
});

app.post('/api/dividends', (req, res) => {
  const record = { id: uuidv4(), ...req.body };
  portfolio.addDividend(record);
  res.json(record);
});

app.delete('/api/dividends/:id', (req, res) => {
  const deleted = portfolio.deleteDividend(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Record not found' });
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Fund tracker running at http://localhost:${PORT}`);
});
