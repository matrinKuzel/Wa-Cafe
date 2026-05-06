

const API = 'https://crm.skch.cz/ajax0/procedure.php';


const state = {
  users: [],        // [{ id, name }]
  types: [],        // [{ id, name }] or string list
  selectedUser: null,
  counts: {},       // { typeName: count }
};

const userListEl  = document.getElementById('user-list');
const drinkListEl = document.getElementById('drink-list');
const submitBtn   = document.getElementById('btn-submit');
const toast       = document.getElementById('toast');

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
  toast._timer = setTimeout(() => { toast.className = 'toast hidden'; }, 3200);
}



function renderUsers() {
  userListEl.innerHTML = '';
  if (!state.users.length) {
    userListEl.innerHTML = '<div class="loader" style="color:var(--error)">Nepodařilo se načíst uživatele.</div>';
    return;
  }

  const savedId = getCookie('kaficko_user') || localStorage.getItem('kaficko_user');

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
      setCookie('kaficko_user', u.id);
      localStorage.setItem('kaficko_user', u.id);
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
    const name = typeof t === 'string' ? t : (t.name || t.type || String(t));
    state.counts[name] = state.counts[name] ?? 0;

    const row = document.createElement('div');
    row.className = 'drink-row';

    row.innerHTML = `
      <span class="drink-name">${name}</span>
      <div class="drink-counter">
        <button class="counter-btn minus" aria-label="Méně">−</button>
        <span class="counter-value${state.counts[name] ? ' nonzero' : ''}">${state.counts[name]}</span>
        <button class="counter-btn plus"  aria-label="Více">+</button>
      </div>
    `;

    const valEl   = row.querySelector('.counter-value');
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

function updateSubmitState() {
  submitBtn.disabled = !state.selectedUser;
}

submitBtn.addEventListener('click', async () => {
  if (!state.selectedUser) return;

  const drinks = state.types.map(t => {
    const name = typeof t === 'string' ? t : (t.name || t.type || String(t));
    return { type: name, value: state.counts[name] ?? 0 };
  });

  const payload = {
    user: String(state.selectedUser),
    drinks,
  };

  submitBtn.disabled = true;
  submitBtn.textContent = 'Odesílám…';

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'saveDrinks', ...payload }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    state.types.forEach(t => {
      const name = typeof t === 'string' ? t : (t.name || t.type || String(t));
      state.counts[name] = 0;
    });
    renderDrinks();
    showToast('Nápoje uloženy!', 'success');
  } catch (err) {
    console.error('saveDrinks error:', err);
    showToast('Chyba při odesílání. Zkus to znovu.', 'error');
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.textContent = 'Odeslat';
    submitBtn.disabled = !state.selectedUser;
  }

});

//start
async function init() {
  const [usersResult, typesResult] = await Promise.allSettled([
    api('getPeopleList'),
    api('getTypesList'),
  ]);

  if (usersResult.status === 'fulfilled') {
    const data = usersResult.value;
    if (Array.isArray(data)) {
      state.users = data.map(u =>
        typeof u === 'string' ? { id: u, name: u } : { id: u.id ?? u.userId ?? u.ID, name: u.name ?? u.fullName ?? u.userName ?? String(u.id) }
      );
    } else if (data && typeof data === 'object') {
      const arr = data.users ?? data.data ?? data.people ?? Object.values(data);
      state.users = arr.map(u =>
        typeof u === 'string' ? { id: u, name: u } : { id: u.id ?? u.userId ?? u.ID, name: u.name ?? u.fullName ?? u.userName ?? String(u.id) }
      );
    }
  }

  if (typesResult.status === 'fulfilled') {
    const data = typesResult.value;
    console.log('getTypesList raw response:', data); 

    const arr = Array.isArray(data)
      ? data
      : (data.types ?? data.data ?? data.drinks ?? Object.values(data));

    state.types = arr.map(t => {
      if (typeof t === 'string') return t;
      return t.typ ?? t.name ?? t.type ?? t.nazev ?? t.title ?? t.drink ?? t.label ?? JSON.stringify(t);
    });
  }

  renderUsers();
  renderDrinks();
}

init();
