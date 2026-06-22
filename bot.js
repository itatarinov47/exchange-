const { Bot, InlineKeyboard, Keyboard } = require('grammy');
const storage = require('./storage');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = String(process.env.ADMIN_CHAT_ID || '');
const WEBAPP_URL = process.env.WEBAPP_URL;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не задан в .env');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

function isAdmin(ctx) {
  return String(ctx.from?.id) === ADMIN_CHAT_ID;
}

// /start — приветствие + кнопка открытия мини-аппа
bot.command('start', async (ctx) => {
  const keyboard = new Keyboard()
    .webApp('💱 Открыть обменник', WEBAPP_URL)
    .resized();

  await ctx.reply(
    'Добро пожаловать в обменник Нячанга! 🌊\n\n' +
    'Здесь вы можете узнать актуальный курс, рассчитать сумму и оставить заявку ' +
    'на обмен валюты со встречей или доставкой.\n\n' +
    'Нажмите кнопку ниже, чтобы открыть обменник 👇',
    { reply_markup: keyboard }
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    'Команды:\n' +
    '/start — открыть обменник\n' +
    (isAdmin(ctx)
      ? '\nКоманды администратора:\n' +
        '/rates — текущие курсы\n' +
        '/setrate USD 25300 25650 — задать курс покупки/продажи\n' +
        '/pending — список заявок в ожидании\n'
      : '')
  );
});

// ---- Админ: просмотр курсов ----
bot.command('rates', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const data = storage.getRates();
  const lines = data.rates.map(
    r => `${r.code} — покупка ${r.buy.toLocaleString('ru-RU')} / продажа ${r.sell.toLocaleString('ru-RU')} ${data.base}`
  );
  await ctx.reply('Текущие курсы:\n\n' + lines.join('\n'));
});

// ---- Админ: установка курса ----
bot.command('setrate', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const parts = ctx.message.text.trim().split(/\s+/).slice(1);
  if (parts.length !== 3) {
    return ctx.reply('Формат: /setrate КОД КУРС_ПОКУПКИ КУРС_ПРОДАЖИ\nНапример: /setrate USD 25300 25650');
  }
  const [code, buyStr, sellStr] = parts;
  const buy = Number(buyStr);
  const sell = Number(sellStr);
  if (Number.isNaN(buy) || Number.isNaN(sell)) {
    return ctx.reply('Курсы должны быть числами.');
  }
  const updated = storage.setRate(code, buy, sell);
  if (!updated) {
    return ctx.reply(`Валюта ${code.toUpperCase()} не найдена в списке.`);
  }
  await ctx.reply(`Курс обновлён: ${updated.code} — покупка ${buy}, продажа ${sell}`);
});

// ---- Админ: заявки в ожидании ----
bot.command('pending', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const orders = storage.getOrders().filter(o => o.status === 'pending');
  if (orders.length === 0) return ctx.reply('Нет заявок в ожидании.');
  for (const o of orders) {
    await ctx.reply(formatOrderText(o), { reply_markup: buildOrderKeyboard(o.id) });
  }
});

function formatOrderText(order) {
  const deliveryLine = order.delivery.type === 'meeting'
    ? `Встреча: ${order.delivery.pointName}, время: ${order.delivery.time}`
    : `Доставка: ${order.delivery.address}, время: ${order.delivery.time}`;

  return (
    `🔔 Заявка #${order.id}\n\n` +
    `Отдаёт: ${order.amountFrom} ${order.fromCurrency}\n` +
    `Получает: ${order.amountTo.toLocaleString('ru-RU')} ${order.toCurrency}\n` +
    `Курс: ${order.rate}\n\n` +
    `${deliveryLine}\n` +
    `Телефон: ${order.phone}\n` +
    (order.comment ? `Комментарий: ${order.comment}\n` : '') +
    `\nКлиент: ${order.user.firstName || ''} ${order.user.username ? '@' + order.user.username : ''}\n` +
    `Статус: ${statusLabel(order.status)}`
  );
}

function statusLabel(status) {
  return { pending: '⏳ ожидает', confirmed: '✅ подтверждена', rejected: '❌ отклонена' }[status] || status;
}

function buildOrderKeyboard(orderId) {
  return new InlineKeyboard()
    .text('✅ Подтвердить', `confirm:${orderId}`)
    .text('❌ Отклонить', `reject:${orderId}`);
}

// ---- Обработка кнопок подтверждения/отклонения ----
bot.on('callback_query:data', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCallbackQuery({ text: 'Только администратор может это делать.' });

  const [action, orderId] = ctx.callbackQuery.data.split(':');
  const order = storage.getOrder(orderId);
  if (!order) return ctx.answerCallbackQuery({ text: 'Заявка не найдена.' });

  if (order.status !== 'pending') {
    return ctx.answerCallbackQuery({ text: 'Заявка уже обработана.' });
  }

  const newStatus = action === 'confirm' ? 'confirmed' : 'rejected';
  storage.updateOrderStatus(orderId, newStatus);

  await ctx.editMessageText(formatOrderText({ ...order, status: newStatus }));
  await ctx.answerCallbackQuery({ text: newStatus === 'confirmed' ? 'Подтверждено' : 'Отклонено' });

  // Уведомляем клиента
  try {
    if (newStatus === 'confirmed') {
      const deliveryLine = order.delivery.type === 'meeting'
        ? `Встретимся: ${order.delivery.pointName}, ${order.delivery.time}`
        : `Курьер привезёт по адресу: ${order.delivery.address}, ${order.delivery.time}`;
      await bot.api.sendMessage(
        order.user.id,
        `✅ Ваша заявка #${order.id} подтверждена!\n\n${deliveryLine}\n\nС вами свяжутся для уточнения деталей.`
      );
    } else {
      await bot.api.sendMessage(
        order.user.id,
        `❌ Заявка #${order.id} отклонена. Пожалуйста, свяжитесь с нами или оформите новую заявку.`
      );
    }
  } catch (e) {
    console.error('Не удалось отправить сообщение клиенту:', e.message);
  }
});

// Отправка новой заявки администратору (вызывается из server.js)
async function notifyAdminNewOrder(order) {
  if (!ADMIN_CHAT_ID) {
    console.warn('ADMIN_CHAT_ID не задан — заявка не отправлена администратору.');
    return;
  }
  await bot.api.sendMessage(ADMIN_CHAT_ID, formatOrderText(order), {
    reply_markup: buildOrderKeyboard(order.id),
  });
}

// Обработка ошибок бота: не даём упасть всему процессу,
// например при временном конфликте getUpdates (409) при перезапуске.
bot.catch((err) => {
  console.error('⚠️ Ошибка в работе бота (процесс продолжает работать):', err.message);
});

module.exports = { bot, notifyAdminNewOrder };

