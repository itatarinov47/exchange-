const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const RATES_FILE = path.join(DATA_DIR, 'rates.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const MEETING_FILE = path.join(DATA_DIR, 'meeting-points.json');

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

// ---- Rates ----
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

// ---- Meeting points ----
function getMeetingPoints() {
  return readJSON(MEETING_FILE);
}

// ---- Orders ----
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
  getMeetingPoints,
  getOrders,
  saveOrder,
  getOrder,
  updateOrderStatus,
};
