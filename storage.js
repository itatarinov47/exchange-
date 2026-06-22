const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const RATES_FILE = path.join(DATA_DIR, 'rates.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const MEETING_FILE = path.join(DATA_DIR, 'meeting-points.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

const DEFAULT_CONFIG = {
  autoUpdateEnabled: true,
  spreadPercent: 1.5,
};

function ensureConfigFile() {
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
  }
}

function ensureOrdersFile() {
  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, '[]', 'utf8');
  }
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function getRates() {
  return readJSON(RATES_FILE);
}

function setRate(code, buy, sell) {
  const data = getRates();
  const entry = data.rates.find(r => r.code === code.toUpperCase());
  if (!entry) return null;
  entry.buy = buy;
  entry.sell = sell;
  data.updatedAt = new Date().toISOString();
  writeJSON(RATES_FILE, data);
  return entry;
}

function setRatesBulk(updates) {
  const data = getRates();
  for (const u of updates) {
    const entry = data.rates.find(r => r.code === u.code.toUpperCase());
    if (entry) {
      entry.buy = u.buy;
      entry.sell = u.sell;
    }
  }
  data.updatedAt = new Date().toISOString();
  writeJSON(RATES_FILE, data);
  return data;
}

function getConfig() {
  ensureConfigFile();
  return { ...DEFAULT_CONFIG, ...readJSON(CONFIG_FILE) };
}

function setConfig(partial) {
  const current = getConfig();
  const updated = { ...current, ...partial };
  writeJSON(CONFIG_FILE, updated);
  return updated;
}

function getMeetingPoints() {
  return readJSON(MEETING_FILE);
}

function getOrders() {
  ensureOrdersFile();
  return readJSON(ORDERS_FILE);
}

function saveOrder(order) {
  ensureOrdersFile();
  const orders = getOrders();
  orders.unshift(order);
  writeJSON(ORDERS_FILE, orders);
  return order;
}

function getOrder(id) {
  return getOrders().find(o => o.id === id);
}

function updateOrderStatus(id, status) {
  const orders = getOrders();
  const order = orders.find(o => o.id === id);
  if (!order) return null;
  order.status = status;
  order.updatedAt = new Date().toISOString();
  writeJSON(ORDERS_FILE, orders);
  return order;
}

module.exports = {
  getRates,
  setRate,
  setRatesBulk,
  getConfig,
  setConfig,
  getMeetingPoints,
  getOrders,
  saveOrder,
  getOrder,
  updateOrderStatus,
};


