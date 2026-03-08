const API = 'https://wishlistwatcher.com';
const app = document.getElementById('app');
const logoutBtn = document.getElementById('logoutBtn');

async function apiCall(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
}

const getToken = () => new Promise(r => chrome.storage.local.get('ww_token', d => r(d.ww_token || null)));
const setToken = t => new Promise(r => chrome.storage.local.set({ ww_token: t }, r));
const clearToken = () => new Promise(r => chrome.storage.local.remove('ww_token', r));
const getPendingUrl = () => new Promise(r => chrome.storage.local.get('pendingUrl', d => {
  chrome.storage.local.remove('pendingUrl');
  r(d.pendingUrl || null);
}));
const getCurrentTabUrl = () => new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, t => r(t[0]?.url || '')));

function renderLogin(errorMsg = '') {
  logoutBtn.style.display = 'none';
  app.innerHTML = `
    <div class="login-title">Sign in to track prices</div>
    <div class="login-sub">Use your WishlistWatcher account</div>
    ${errorMsg ? `<div class="msg msg-error">${errorMsg}</div>` : ''}
    <div class="field">
      <label>Email</label>
      <input type="email" id="email" placeholder="you@email.com" autocomplete="email">
    </div>
    <div class="field">
      <label>Password</label>
      <input type="password" id="password" placeholder="••••••••" autocomplete="current-password">
    </div>
    <button class="btn btn-amber" id="loginBtn">Sign in</button>
    <div class="view-dashboard" style="margin-top:12px">
      No account? <a href="https://wishlistwatcher.com/dashboard.html" target="_blank">Sign up free</a>
    </div>
  `;
  const emailEl = document.getElementById('email');
  const passEl  = document.getElementById('password');
  const loginBt = document.getElementById('loginBtn');
  async function doLogin() {
    const email = emailEl.value.trim();
    const pass  = passEl.value;
    if (!email || !pass) return;
    loginBt.disabled = true; loginBt.textContent = 'Signing in…';
    try {
      const data = await apiCall('POST', '/api/auth/login', { email, password: pass });
      await setToken(data.token || data.access_token);
      renderTrack();
    } catch(e) { renderLogin(e.message); }
  }
  loginBt.addEventListener('click', doLogin);
  passEl.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  emailEl.addEventListener('keydown', e => { if (e.key === 'Enter') passEl.focus(); });
}

async function renderTrack(successMsg = '') {
  const token = await getToken();
  if (!token) { renderLogin(); return; }
  logoutBtn.style.display = 'block';

  const pendingUrl = await getPendingUrl();
  const tabUrl     = await getCurrentTabUrl();
  const url        = pendingUrl || tabUrl || '';
  const isHttp     = url.startsWith('http://') || url.startsWith('https://');

  app.innerHTML = `
    ${successMsg ? `<div class="msg msg-success">${successMsg}</div>` : ''}
    <div class="field url-field">
      <label>Product URL</label>
      <input type="url" id="urlInput" placeholder="https://..." value="${isHttp ? url.replace(/"/g,'&quot;') : ''}">
    </div>
    <div id="priceArea"></div>
    <div id="actionArea">
      <button class="btn btn-amber" id="fetchBtn">Fetch price</button>
    </div>
    <div class="view-dashboard">
      <a href="#" id="dashLink">Open full dashboard →</a>
    </div>
  `;

  const priceArea  = document.getElementById('priceArea');
  const actionArea = document.getElementById('actionArea');

  async function doFetch() {
    const inputUrl = document.getElementById('urlInput').value.trim();
    if (!inputUrl) return;
    const cleanUrl = inputUrl.startsWith('http') ? inputUrl : 'https://' + inputUrl;
    priceArea.innerHTML = `<div class="fetching"><div class="spinner"></div> Fetching price…</div>`;
    actionArea.innerHTML = '';
    try {
      const data = await apiCall('POST', '/api/items/preview', { url: cleanUrl }, token);
      if (!data.price) throw new Error('Could not fetch price');
      const price     = data.price;
      const origPrice = data.original_price;
      const basePrice = origPrice && origPrice > price ? origPrice : price;

      let priceHtml = '';
      if (origPrice && origPrice > price) {
        const pct = Math.round((1 - price / origPrice) * 100);
        priceHtml = `<span class="price-original">$${origPrice.toFixed(2)}</span><span class="price-value">$${price.toFixed(2)}</span><span class="price-sale-badge">${pct}% off</span>`;
      } else {
        priceHtml = `<span class="price-value">$${price.toFixed(2)}</span>`;
      }

      priceArea.innerHTML = `
        <div class="price-row">
          <div>
            <div class="price-label">Current price</div>
            <div style="display:flex;align-items:baseline;gap:4px;flex-wrap:wrap">${priceHtml}</div>
          </div>
        </div>
      `;

      // Slider UI
      actionArea.innerHTML = `
        <div class="field" style="margin-bottom:6px">
          <label>Alert me when price drops by</label>
          <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
            <input type="range" id="pctSlider" min="1" max="80" value="10" style="flex:1;accent-color:var(--amber)">
            <span id="pctLabel" style="font-family:'DM Mono',monospace;font-size:15px;font-weight:600;color:var(--amber);min-width:36px;text-align:right">10%</span>
          </div>
          <div id="targetDisplay" style="margin-top:6px;font-size:12px;color:var(--muted)">
            Alert when price ≤ <strong style="color:var(--text)">$${(basePrice*0.9).toFixed(2)}</strong>
            <span style="color:var(--green)"> (save $${(basePrice*0.1).toFixed(2)})</span>
          </div>
        </div>
        <button class="btn btn-amber" id="addBtn">Track this item</button>
      `;

      const slider   = document.getElementById('pctSlider');
      const pctLabel = document.getElementById('pctLabel');
      const targetDi = document.getElementById('targetDisplay');

      slider.addEventListener('input', () => {
        const pct    = parseInt(slider.value);
        const target = basePrice * (1 - pct / 100);
        pctLabel.textContent = pct + '%';
        targetDi.innerHTML = `Alert when price ≤ <strong style="color:var(--text)">$${target.toFixed(2)}</strong> <span style="color:var(--green)">(save $${(basePrice - target).toFixed(2)})</span>`;
      });

      document.getElementById('addBtn').addEventListener('click', async () => {
        const pct    = parseInt(slider.value);
        const target = parseFloat((basePrice * (1 - pct / 100)).toFixed(2));
        const addBtn = document.getElementById('addBtn');
        if (target >= price) {
          priceArea.innerHTML += `<div class="msg msg-error" style="margin-top:8px">⚠️ This item is already cheaper than your target price!</div>`;
          return;
        }
        addBtn.disabled = true; addBtn.textContent = '…';
        try {
          await apiCall('POST', '/api/items', {
            url: cleanUrl,
            target_price: target,
            original_price: origPrice || null
          }, token);
          renderTrack('✓ Tracking! You\'ll be alerted when the price drops.');
        } catch(e) {
          priceArea.innerHTML += `<div class="msg msg-error" style="margin-top:8px">${e.message}</div>`;
          addBtn.disabled = false; addBtn.textContent = 'Track this item';
        }
      });

    } catch(e) {
      priceArea.innerHTML = `<div class="msg msg-error">${e.message}</div>`;
      actionArea.innerHTML = `<button class="btn btn-amber" id="fetchBtn">Try again</button>`;
      document.getElementById('fetchBtn').addEventListener('click', doFetch);
    }
  }

  document.getElementById('fetchBtn').addEventListener('click', doFetch);
  document.getElementById('dashLink').addEventListener('click', async (e) => {
    e.preventDefault();
    const t = await getToken();
    chrome.tabs.create({ url: 'https://wishlistwatcher.com/dashboard.html?token=' + encodeURIComponent(t) });
  });
  if (isHttp && url) doFetch();
}

logoutBtn.addEventListener('click', async () => { await clearToken(); renderLogin(); });

(async () => {
  const token = await getToken();
  if (token) {
    try { await apiCall('GET', '/api/auth/me', null, token); renderTrack(); }
    catch { await clearToken(); renderLogin(); }
  } else { renderLogin(); }
})();
