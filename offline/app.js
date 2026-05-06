/*
*vybral jsem si local storage protoze trva I po vypnuti browseru
*a je colkove lepsi nez session storage
*/

const API = 'https://crm.skch.cz/ajax0/procedure.php';
const QUEUE_KEY = 'kaficko_queue';
const TODAY_KEY = 'kaficko_today';
const USER_KEY  = 'kaficko_user';

const state = {
  users: [],
  types: [],
  selectedUser: null,
  counts: {},
};

const userListEl  = document.getElementById('user-list');
const drinkListEl = document.getElementById('drink-list');
const submitBtn   = document.getElementById('btn-submit');
const toast       = document.getElementById('toast');
const summaryBtn  = document.getElementById('btn-summary');
const summaryEl   = document.getElementById('daily-summary');
const offlineBanner = document.getElementById('offline-banner');

function isOnline() { return navigator.onLine; }

function updateOfflineBanner() {
  offlineBanner.hidden = isOnline();
}

window.addEventListener('online',  () => {
  updateOfflineBanner();
  showToast('Jste zpět online. Odesílám uložená data…', 'success');
  retryQueue();
});
window.addEventListener('offline', () => {
  updateOfflineBanner();
  showToast('Jste offline. Data budou uložena a odeslána po připojení.', 'error');
});

function getQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; }
  catch { return []; }
}

function saveQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function addToQueue(payload) {
  const queue = getQueue();
  queue.push(payload);
  saveQueue(queue);
}

async function retryQueue() {
  const queue = getQueue();
  if (!queue.length) return;

  const failed = [];
  for (const payload of queue) {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'saveDrinks', ...payload }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      failed.push(payload);
    }
  }

  saveQueue(failed);
  if (failed.length === 0) {
    showToast('Všechna offline data byla úspěšně odeslána!', 'success');
  } else {
    showToast(`${failed.length} záznam(ů) se nepodařilo odeslat.`, 'error');
  }
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10); // "2026-05-06"
}

function getTodaySummary() {
  try {
    const raw = JSON.parse(localStorage.getItem(TODAY_KEY)) || {};
    // Reset if it's a new day
    if (raw.date !== getTodayKey()) return { date: getTodayKey(), drinks: {} };
    return raw;
  } catch {
    return { date: getTodayKey(), drinks: {} };
  }
}

function addToTodaySummary(drinks) {
  const summary = getTodaySummary();
  drinks.forEach(({ type, value }) => {
    if (value > 0) {
      summary.drinks[type] = (summary.drinks[type] || 0) + value;
    }
  });
  localStorage.setItem(TODAY_KEY, JSON.stringify(summary));
}

function api(cmd, extraParams = {}) {
  const url = new URL(API);
  url.searchParams.set('cmd', cmd);
  Object.entries(extraParams).forEach(([k, v]) => url.searchParams.set(k, v));
  return fetch(url).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}

function getCookie(name) {
  return document.cookie.split('; ').reduce((acc, c) => {
    const [k, v] = c.split('=');
    return k === name ? decodeURIComponent(v) : acc;
  }, null);
}

function setCookie(name, value, days = 30) {
  const d = new Date();
  d.setTime(d.getTime() + days * 864e5);
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/`;
}

function showToast(msg, type = '') {
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = 'toast hidden'; }, 3800);
}

function renderUsers() {
  userListEl.innerHTML = '';
  if (!state.users.length) {
    userListEl.innerHTML = '<div class="loader" style="color:var(--error)">Nepodařilo se načíst uživatele.</div>';
    return;
  }

  const savedId = getCookie(USER_KEY) || localStorage.getItem(USER_KEY);

  state.users.forEach(u => {
    const btn = document.createElement('button');
    btn.className = 'user-btn';
    btn.textContent = u.name;
    btn.dataset.id = u.id;

    if (String(u.id) === String(savedId)) {
      btn.classList.add('selected');
      state.selectedUser = u.id;
    }

    btn.addEventListener('click', () => {
      document.querySelectorAll('.user-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.selectedUser = u.id;
      setCookie(USER_KEY, u.id);
      localStorage.setItem(USER_KEY, u.id);
      updateSubmitState();
    });

    userListEl.appendChild(btn);
  });

  updateSubmitState();
}

function renderDrinks() {
  drinkListEl.innerHTML = '';
  if (!state.types.length) {
    drinkListEl.innerHTML = '<div class="loader" style="color:var(--error)">Nepodařilo se načíst nápoje.</div>';
    return;
  }

  state.types.forEach(t => {
    const name = typeof t === 'string' ? t : (t.typ ?? t.name ?? t.type ?? String(t));
    state.counts[name] = state.counts[name] ?? 0;

    const row = document.createElement('div');
    row.className = 'drink-row';

    row.innerHTML = `
      <span class="drink-name">${name}</span>
      <div class="drink-counter">
        <button class="counter-btn minus" aria-label="Méně">−</button>
        <span class="counter-value${state.counts[name] ? ' nonzero' : ''}">${state.counts[name]}</span>
        <button class="counter-btn plus" aria-label="Více">+</button>
      </div>
    `;

    const valEl    = row.querySelector('.counter-value');
    const minusBtn = row.querySelector('.minus');
    const plusBtn  = row.querySelector('.plus');

    plusBtn.addEventListener('click', () => {
      state.counts[name]++;
      valEl.textContent = state.counts[name];
      valEl.classList.add('nonzero');
    });

    minusBtn.addEventListener('click', () => {
      if (state.counts[name] > 0) state.counts[name]--;
      valEl.textContent = state.counts[name];
      valEl.classList.toggle('nonzero', state.counts[name] > 0);
    });

    drinkListEl.appendChild(row);
  });
}

function renderSummary() {
  const summary = getTodaySummary();
  const entries = Object.entries(summary.drinks);

  if (!entries.length) {
    summaryEl.innerHTML = '<p class="summary-empty">Dnes jsi ještě nic nevypil/a.</p>';
    return;
  }

  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  summaryEl.innerHTML = `
    <ul class="summary-list">
      ${entries.map(([type, count]) => `
        <li class="summary-item">
          <span class="summary-type">${type}</span>
          <span class="summary-count">${count}x</span>
        </li>
      `).join('')}
    </ul>
    <p class="summary-total">Celkem: ${total} nápoj${total === 1 ? '' : total < 5 ? 'e' : 'ů'}</p>
  `;
}

summaryBtn.addEventListener('click', () => {
  const isHidden = summaryEl.hidden;
  summaryEl.hidden = !isHidden;
  if (!isHidden) return;
  renderSummary();
  summaryBtn.textContent = 'Skrýt přehled';
});

function updateSubmitState() {
  submitBtn.disabled = !state.selectedUser;
}

submitBtn.addEventListener('click', async () => {
  if (!state.selectedUser) return;

  const drinks = state.types.map(t => {
    const name = typeof t === 'string' ? t : (t.typ ?? t.name ?? t.type ?? String(t));
    return { type: name, value: state.counts[name] ?? 0 };
  });

  const payload = { user: String(state.selectedUser), drinks };

  submitBtn.disabled = true;
  submitBtn.textContent = 'Odesílám…';
  addToTodaySummary(drinks);

  if (!isOnline()) {
    addToQueue(payload);
    showToast('Offline – data uložena. Odešlou se po připojení.', 'error');
    resetCounts();
  } else {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'saveDrinks', ...payload }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast('Nápoje uloženy!', 'success');
      resetCounts();
    } catch (err) {
      console.error('saveDrinks error:', err);
      addToQueue(payload);
      showToast('Chyba serveru – data uložena lokálně.', 'error');
      resetCounts();
    }
  }

  submitBtn.textContent = 'Odeslat';
  submitBtn.disabled = !state.selectedUser;
});

function resetCounts() {
  state.types.forEach(t => {
    const name = typeof t === 'string' ? t : (t.typ ?? t.name ?? t.type ?? String(t));
    state.counts[name] = 0;
  });
  renderDrinks();
}

//start
async function init() {
  updateOfflineBanner();

  const [usersResult, typesResult] = await Promise.allSettled([
    api('getPeopleList'),
    api('getTypesList'),
  ]);

  if (usersResult.status === 'fulfilled') {
    const data = usersResult.value;
    const arr = Array.isArray(data)
      ? data
      : (data.users ?? data.data ?? data.people ?? Object.values(data));
    state.users = arr.map(u =>
      typeof u === 'string'
        ? { id: u, name: u }
        : { id: u.id ?? u.userId ?? u.ID, name: u.name ?? u.fullName ?? u.userName ?? String(u.id) }
    );
  }

  if (typesResult.status === 'fulfilled') {
    const data = typesResult.value;
    const arr = Array.isArray(data)
      ? data
      : (data.types ?? data.data ?? data.drinks ?? Object.values(data));
    state.types = arr.map(t => {
      if (typeof t === 'string') return t;
      return t.typ ?? t.name ?? t.type ?? t.nazev ?? t.title ?? JSON.stringify(t);
    });
  }

  renderUsers();
  renderDrinks();

  if (isOnline()) retryQueue();

  const queue = getQueue();
  if (queue.length > 0) {
    showToast(`${queue.length} záznam(ů) čeká na odeslání.`, '');
  }
}

init();
