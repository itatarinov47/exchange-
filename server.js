require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { nanoid } = require('nanoid');

const storage = require('./storage');
const { validateInitData } = require('./telegramAuth');
const { bot, notifyAdminNewOrder } = require('./bot');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BOT_TOKEN = process.env.BOT_TOKEN;
// В режиме разработки (без HTTPS/Telegram) можно отключить строгую проверку подписи
const DEV_MODE = process.env.DEV_MODE === 'true';

// Текущие курсы + точки встречи
app.get('/api/rates', (req, res) => {
  res.json(storage.getRates());
});

app.get('/api/meeting-points', (req, res) => {
  res.json(storage.getMeetingPoints());
});

// Создание заявки на обмен
app.post('/api/orders', (req, res) => {
  const { initData, fromCurrency, toCurrency, amountFrom, delivery, phone, comment } = req.body;

  let telegramUser = null;
  if (!DEV_MODE) {
    const check = validateInitData(initData, BOT_TOKEN);
    if (!check.valid) {
      return res.status(401).json({ error: 'Не удалось подтвердить пользователя Telegram.' });
    }
    telegramUser = check.user;
  } else {
    telegramUser = { id: process.env.ADMIN_CHAT_ID, first_name: 'Тест', username: 'dev' };
  }

  if (!telegramUser?.id) {
    return res.status(401).json({ error: 'Пользователь Telegram не определён.' });
  }

  if (!fromCurrency || !toCurrency || !amountFrom || !delivery?.type || !phone) {
    return res.status(400).json({ error: 'Заполните все обязательные поля.' });
  }

  const ratesData = storage.getRates();
  const { rate, amountTo } = calculateExchange(ratesData, fromCurrency, toCurrency, amountFrom);
  if (rate === null) {
    return res.status(400).json({ error: 'Не удалось рассчитать курс для выбранных валют.' });
  }

  const order = {
    id: nanoid(8),
    createdAt: new Date().toISOString(),
    status: 'pending',
    fromCurrency,
    toCurrency,
    amountFrom: Number(amountFrom),
    amountTo,
    rate,
    delivery, // { type: 'meeting'|'delivery', pointName? , address?, time }
    phone,
    comment: comment || '',
    user: {
      id: telegramUser.id,
      firstName: telegramUser.first_name,
      username: telegramUser.username,
    },
  };

  storage.saveOrder(order);
  notifyAdminNewOrder(order).catch(e => console.error('Ошибка уведомления админа:', e.message));

  res.json({ ok: true, order });
});

// Расчёт суммы обмена. base — валюта, в которой заданы buy/sell (VND).
function calculateExchange(ratesData, fromCurrency, toCurrency, amountFrom) {
  const base = ratesData.base;
  const findRate = (code) => ratesData.rates.find(r => r.code === code);

  let rate = null;
  let amountTo = null;

  if (fromCurrency === base) {
    // Клиент отдаёт донги, получает иностранную валюту -> используем курс "sell" (продажа валюты клиенту)
    const r = findRate(toCurrency);
    if (!r) return { rate: null, amountTo: null };
    rate = r.sell;
    amountTo = Number(amountFrom) / r.sell;
  } else if (toCurrency === base) {
    // Клиент отдаёт иностранную валюту, получает донги -> курс "buy" (покупка валюты у клиента)
    const r = findRate(fromCurrency);
    if (!r) return { rate: null, amountTo: null };
    rate = r.buy;
    amountTo = Number(amountFrom) * r.buy;
  } else {
    return { rate: null, amountTo: null };
  }

  return { rate, amountTo: Math.round(amountTo * 100) / 100 };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});

bot.start();
console.log('✅ Бот запущен (long polling)');
