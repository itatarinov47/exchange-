const storage = require('./storage');

// Бесплатный открытый источник курсов (без ключа, без регистрации).
// Возвращает курсы относительно USD для множества валют, включая VND.
const RATES_API_URL = 'https://open.er-api.com/v6/latest/USD';

// Округление: для крупных значений (>100) — до целого, иначе до 1 знака после запятой.
function roundRate(value) {
  return value > 100 ? Math.round(value) : Math.round(value * 10) / 10;
}

async function fetchMidRates() {
  const res = await fetch(RATES_API_URL);
  if (!res.ok) {
    throw new Error(`Источник курсов ответил с ошибкой: ${res.status}`);
  }
  const data = await res.json();
  if (!data?.rates?.VND) {
    throw new Error('В ответе источника курсов нет данных по VND.');
  }
  return data.rates;
}

function vndPerUnit(ratesUSD, code) {
  if (code === 'USD') return ratesUSD.VND;
  const rateToUsd = ratesUSD[code];
  if (!rateToUsd) return null;
  return ratesUSD.VND / rateToUsd;
}

async function updateRatesNow() {
  const config = storage.getConfig();
  const ratesData = storage.getRates();
  const ratesUSD = await fetchMidRates();

  const spread = config.spreadPercent / 100;
  const updates = [];

  for (const entry of ratesData.rates) {
    const mid = vndPerUnit(ratesUSD, entry.code);
    if (!mid) continue;
    const buy = roundRate(mid * (1 - spread));
    const sell = roundRate(mid * (1 + spread));
    updates.push({ code: entry.code, buy, sell });
  }

  storage.setRatesBulk(updates);
  return updates;
}

function startAutoUpdate(intervalMs, onLog) {
  const log = onLog || console.log;

  const runIfEnabled = async () => {
    const config = storage.getConfig();
    if (!config.autoUpdateEnabled) return;
    try {
      const updates = await updateRatesNow();
      log(`✅ Курсы автообновлены (${updates.length} валют, спред ${config.spreadPercent}%).`);
    } catch (e) {
      log(`⚠️ Не удалось автообновить курсы: ${e.message}`);
    }
  };

  setTimeout(runIfEnabled, 5000);
  setInterval(runIfEnabled, intervalMs);
}

module.exports = { updateRatesNow, startAutoUpdate };
