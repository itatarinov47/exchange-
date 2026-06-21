const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const state = {
  ratesData: null,
  meetingPoints: [],
  deliveryType: 'meeting',
  selectedMeetingPoint: null,
};

const els = {
  fromCurrency: document.getElementById('fromCurrency'),
  toCurrency: document.getElementById('toCurrency'),
  amountFrom: document.getElementById('amountFrom'),
  amountTo: document.getElementById('amountTo'),
  swapBtn: document.getElementById('swapBtn'),
  rateNote: document.getElementById('rateNote'),
  tideBuy: document.getElementById('tideBuy'),
  tideSell: document.getElementById('tideSell'),
  tideCurrencyName: document.getElementById('tideCurrencyName'),
  deliverySegmented: document.getElementById('deliverySegmented'),
  meetingFields: document.getElementById('meetingFields'),
  deliveryFields: document.getElementById('deliveryFields'),
  meetingChips: document.getElementById('meetingChips'),
  address: document.getElementById('address'),
  time: document.getElementById('time'),
  phone: document.getElementById('phone'),
  comment: document.getElementById('comment'),
  submitBtn: document.getElementById('submitBtn'),
  statusMsg: document.getElementById('statusMsg'),
};

const BASE = 'VND';

async function init() {
  const [rates, points] = await Promise.all([
    fetch('/api/rates').then(r => r.json()),
    fetch('/api/meeting-points').then(r => r.json()),
  ]);
  state.ratesData = rates;
  state.meetingPoints = points;

  populateCurrencySelects();
  renderMeetingChips();
  updateTide();
  recalculate();

  els.amountFrom.addEventListener('input', recalculate);
  els.fromCurrency.addEventListener('change', onFromChange);
  els.toCurrency.addEventListener('change', recalculate);
  els.swapBtn.addEventListener('click', swapCurrencies);
  els.deliverySegmented.addEventListener('click', onDeliveryTypeClick);
  els.submitBtn.addEventListener('click', submitOrder);
}

function populateCurrencySelects() {
  const codes = [BASE, ...state.ratesData.rates.map(r => r.code)];
  for (const select of [els.fromCurrency, els.toCurrency]) {
    select.innerHTML = codes.map(c => `<option value="${c}">${c}</option>`).join('');
  }
  els.fromCurrency.value = state.ratesData.rates[0].code; // например USD
  els.toCurrency.value = BASE;
}

function onFromChange() {
  updateTide();
  recalculate();
}

function getRateEntry(code) {
  return state.ratesData.rates.find(r => r.code === code);
}

function updateTide() {
  const foreign = els.fromCurrency.value !== BASE ? els.fromCurrency.value : els.toCurrency.value;
  const entry = getRateEntry(foreign);
  if (!entry) return;
  els.tideCurrencyName.textContent = foreign;
  els.tideBuy.textContent = entry.buy.toLocaleString('ru-RU');
  els.tideSell.textContent = entry.sell.toLocaleString('ru-RU');
}

function calc(fromCurrency, toCurrency, amountFrom) {
  const amount = Number(amountFrom) || 0;
  if (fromCurrency === toCurrency) return { amountTo: amount, rate: 1 };

  if (fromCurrency === BASE) {
    const r = getRateEntry(toCurrency);
    if (!r) return null;
    return { amountTo: amount / r.sell, rate: r.sell, label: `1 ${toCurrency} = ${r.sell.toLocaleString('ru-RU')} ${BASE} (курс продажи)` };
  }
  if (toCurrency === BASE) {
    const r = getRateEntry(fromCurrency);
    if (!r) return null;
    return { amountTo: amount * r.buy, rate: r.buy, label: `1 ${fromCurrency} = ${r.buy.toLocaleString('ru-RU')} ${BASE} (курс покупки)` };
  }
  return null; // обмен между двумя иностранными валютами не поддержан в MVP
}

function recalculate() {
  const from = els.fromCurrency.value;
  const to = els.toCurrency.value;
  const result = calc(from, to, els.amountFrom.value);

  if (!result) {
    els.amountTo.textContent = '—';
    els.rateNote.textContent = 'Обмен между двумя иностранными валютами пока не поддерживается — выберите донги (VND) одной из сторон.';
    return;
  }

  const decimals = to === BASE ? 0 : 2;
  els.amountTo.textContent = result.amountTo.toLocaleString('ru-RU', { maximumFractionDigits: decimals });
  els.rateNote.textContent = result.label || '';
}

function swapCurrencies() {
  const f = els.fromCurrency.value;
  const t = els.toCurrency.value;
  els.fromCurrency.value = t;
  els.toCurrency.value = f;
  updateTide();
  recalculate();
}

function renderMeetingChips() {
  els.meetingChips.innerHTML = state.meetingPoints.map(p =>
    `<button type="button" class="chip" data-id="${p.id}">${p.name}</button>`
  ).join('');

  els.meetingChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      els.meetingChips.querySelectorAll('.chip').forEach(c => c.classList.remove('is-selected'));
      chip.classList.add('is-selected');
      state.selectedMeetingPoint = state.meetingPoints.find(p => p.id === chip.dataset.id);
    });
  });
}

function onDeliveryTypeClick(e) {
  const btn = e.target.closest('.segmented__btn');
  if (!btn) return;
  state.deliveryType = btn.dataset.type;

  els.deliverySegmented.querySelectorAll('.segmented__btn').forEach(b => b.classList.remove('is-active'));
  btn.classList.add('is-active');

  els.meetingFields.hidden = state.deliveryType !== 'meeting';
  els.deliveryFields.hidden = state.deliveryType !== 'delivery';
}

function setStatus(text, type) {
  els.statusMsg.textContent = text;
  els.statusMsg.className = 'status-msg' + (type ? ' ' + type : '');
}

async function submitOrder() {
  const from = els.fromCurrency.value;
  const to = els.toCurrency.value;
  const amountFrom = Number(els.amountFrom.value);

  if (!amountFrom || amountFrom <= 0) {
    return setStatus('Укажите сумму обмена.', 'error');
  }
  if (!els.phone.value.trim()) {
    return setStatus('Укажите номер телефона для связи.', 'error');
  }
  if (!els.time.value.trim()) {
    return setStatus('Укажите удобное время.', 'error');
  }

  let delivery;
  if (state.deliveryType === 'meeting') {
    if (!state.selectedMeetingPoint) return setStatus('Выберите точку встречи.', 'error');
    delivery = { type: 'meeting', pointName: state.selectedMeetingPoint.name, time: els.time.value.trim() };
  } else {
    if (!els.address.value.trim()) return setStatus('Укажите адрес доставки.', 'error');
    delivery = { type: 'delivery', address: els.address.value.trim(), time: els.time.value.trim() };
  }

  els.submitBtn.disabled = true;
  setStatus('Отправляем заявку…');

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData: tg?.initData || '',
        fromCurrency: from,
        toCurrency: to,
        amountFrom,
        delivery,
        phone: els.phone.value.trim(),
        comment: els.comment.value.trim(),
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setStatus(data.error || 'Не удалось отправить заявку.', 'error');
      els.submitBtn.disabled = false;
      return;
    }

    setStatus(`Заявка #${data.order.id} отправлена! Мы свяжемся с вами для подтверждения.`, 'ok');
    tg?.HapticFeedback?.notificationOccurred?.('success');

    if (tg?.close) {
      setTimeout(() => {
        setStatus('Заявка #' + data.order.id + ' отправлена. Можно закрыть это окно.', 'ok');
      }, 1500);
    }
  } catch (e) {
    setStatus('Ошибка сети. Попробуйте ещё раз.', 'error');
  } finally {
    els.submitBtn.disabled = false;
  }
}

init();
