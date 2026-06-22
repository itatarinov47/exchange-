const storage = require('./storage');

// Источник курсов для обычных (фиатных) валют.
const RATES_API_URL = 'https://open.er-api.com/v6/latest/USD';

// Источник курсов для криптовалют — отдаёт цену прямо в VND, без кросс-расчёта.
const CRYPTO_API_URL = (ids) => `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=vnd`;

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

async function fetchCryptoRates(coingeckoIds) {
  if (coingeckoIds.length === 0) return {};
  const res = await fetch(CRYPTO_API_URL(coingeckoIds.join(',')));
  if (!res.ok) {
    throw new Error(`Источник криптокурсов ответил с ошибкой: ${res.status}`);
  }
  return res.json();
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

  const cryptoEntries = ratesData.rates.filter(r => r.coingeckoId);
  const fiatEntries = ratesData.rates.filter(r => !r.coingeckoId);

  const [ratesUSD, cryptoRates] = await Promise.all([
    fiatEntries.length > 0 ? fetchMidRates() : Promise.resolve(null),
    fetchCryptoRates(cryptoEntries.map(e => e.coingeckoId)),
  ]);

  const spread = config.spreadPercent / 100;
  const updates = [];

  for (const entry of fiatEntries) {
    const mid = vndPerUnit(ratesUSD, entry.code);
    if (!mid) continue;
    updates.push({
      code: entry.code,
      buy: roundRate(mid * (1 - spread)),
      sell: roundRate(mid * (1 + spread)),
    });
  }

  for (const entry of cryptoEntries) {
    const mid = cryptoRates?.[entry.coingeckoId]?.vnd;
    if (!mid) continue;
    updates.push({
      code: entry.code,
      buy: roundRate(mid * (1 - spread)),
      sell: roundRate(mid * (1 + spread)),
    });
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
