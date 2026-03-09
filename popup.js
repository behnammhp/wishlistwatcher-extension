function affiliateUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname.includes('amazon.')) {
      u.searchParams.set('tag', 'wishlistwat0b-20');
      return u.toString();
    }
  } catch(e) {}
  return url;
}

const API = 'https://wishlistwatcher.com';
const app = document.getElementById('app');
const logoutBtn = document.getElementById('logoutBtn');

async function apiCall(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
}

const getToken = () => new Promise(r => chrome.storage.local.get('ww_token', d => r(d.ww_token || null)));
const setToken = t => new Promise(r => chrome.storage.local.set({ ww_token: t }, r));
const clearToken = () => new Promise(r => chrome.storage.local.remove('ww_token', r));
const getPendingUrl = () => new Promise(r => chrome.storage.local.get('pendingUrl', d => { chrome.storage.local.remove('pendingUrl'); r(d.pendingUrl || null); }));
const getCurrentTabUrl = () => new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, t => r(t[0] && t[0].url || '')));

function renderLogin(errorMsg) {
  errorMsg = errorMsg || '';
  logoutBtn.style.display = 'none';
  app.innerHTML =
    '<div class="login-title">Sign in to track prices</div>' +
    '<div class="login-sub">Use your WishlistWatcher account</div>' +
    (errorMsg ? '<div class="msg msg-error">' + errorMsg + '</div>' : '') +
    '<div class="field"><label>Email</label><input type="email" id="email" placeholder="you@email.com" autocomplete="email"></div>' +
    '<div class="field"><label>Password</label><input type="password" id="password" placeholder="••••••••" autocomplete="current-password"></div>' +
    '<button class="btn btn-amber" id="loginBtn">Sign in</button>' +
    '<div class="view-dashboard" style="margin-top:12px">No account? <a href="https://wishlistwatcher.com/dashboard.html" target="_blank">Sign up free</a></div>';

  async function doLogin() {
    var email = document.getElementById('email').value.trim();
    var pass = document.getElementById('password').value;
    if (!email || !pass) return;
    var btn = document.getElementById('loginBtn');
    btn.disabled = true; btn.textContent = 'Signing in...';
    try {
      var data = await apiCall('POST', '/api/auth/login', { email: email, password: pass });
      await setToken(data.token || data.access_token);
      renderTrack();
    } catch(e) { renderLogin(e.message); }
  }
  document.getElementById('loginBtn').addEventListener('click', doLogin);
  document.getElementById('password').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
  document.getElementById('email').addEventListener('keydown', function(e) { if (e.key === 'Enter') document.getElementById('password').focus(); });
}

async function renderReport(reportUrl) {
  logoutBtn.style.display = 'block';
  var short = reportUrl.length > 50 ? reportUrl.slice(0, 50) + '...' : reportUrl;
  app.innerHTML =
    '<div style="margin-bottom:12px"><button id="backBtn" style="background:none;border:none;color:var(--muted);cursor:pointer;font-family:Outfit,sans-serif;font-size:12px;padding:0">← Back</button></div>' +
    '<div class="login-title" style="font-size:15px;margin-bottom:4px">Report an issue</div>' +
    '<div class="login-sub" style="margin-bottom:12px">' + short + '</div>' +
    '<div class="field"><label>Issue type</label>' +
    '<select id="reasonSel" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-family:Outfit,sans-serif;font-size:13px;padding:8px 10px;outline:none">' +
    '<option value="wrong_price">Wrong price</option>' +
    '<option value="broken_link">Broken / unsupported link</option>' +
    '<option value="price_not_found">Price not found</option>' +
    '<option value="other">Other</option>' +
    '</select></div>' +
    '<div class="field"><label>Details (optional)</label>' +
    '<textarea id="reportMsg" placeholder="e.g. Shows $5 but actual price is $34.95" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-family:Outfit,sans-serif;font-size:13px;padding:8px 10px;outline:none;resize:none;height:70px"></textarea></div>' +
    '<div id="reportStatus"></div>' +
    '<button class="btn btn-amber" id="submitReport">Send report</button>';

  document.getElementById('backBtn').addEventListener('click', function() { renderTrack(); });
  document.getElementById('submitReport').addEventListener('click', async function() {
    var token = await getToken();
    var reason = document.getElementById('reasonSel').value;
    var message = document.getElementById('reportMsg').value.trim();
    var btn = document.getElementById('submitReport');
    btn.disabled = true; btn.textContent = 'Sending...';
    try {
      await apiCall('POST', '/api/reports', { url: reportUrl, reason: reason, message: message }, token);
      document.getElementById('reportStatus').innerHTML = '<div class="msg msg-success">Report sent! We will look into it.</div>';
      btn.style.display = 'none';
      setTimeout(function() { renderTrack(); }, 2000);
    } catch(e) {
      document.getElementById('reportStatus').innerHTML = '<div class="msg msg-error">' + e.message + '</div>';
      btn.disabled = false; btn.textContent = 'Send report';
    }
  });
}

async function renderTrack(successMsg) {
  successMsg = successMsg || '';
  var token = await getToken();
  if (!token) { renderLogin(); return; }
  logoutBtn.style.display = 'block';

  var pendingUrl = await getPendingUrl();
  var tabUrl = await getCurrentTabUrl();
  var url = pendingUrl || tabUrl || '';
  var isHttp = url.indexOf('http://') === 0 || url.indexOf('https://') === 0;
  var safeUrl = isHttp ? url.replace(/"/g, '&quot;') : '';

  app.innerHTML =
    (successMsg ? '<div class="msg msg-success">' + successMsg + '</div>' : '') +
    '<div class="field url-field"><label>Product URL</label>' +
    '<input type="url" id="urlInput" placeholder="https://..." value="' + safeUrl + '"></div>' +
    '<div id="priceArea"></div>' +
    '<div id="actionArea"><button class="btn btn-amber" id="fetchBtn">Fetch price</button></div>' +
    '<div class="footer">' +
    '<a href="#" id="dashLink">Open dashboard →</a>' +
    '<button class="report-btn" id="reportLink">🚩 Report issue</button>' +
    '</div>';

  var priceArea = document.getElementById('priceArea');
  var actionArea = document.getElementById('actionArea');

  async function doFetch() {
    var inputUrl = document.getElementById('urlInput').value.trim();
    if (!inputUrl) return;
    var cleanUrl = inputUrl.indexOf('http') === 0 ? inputUrl : 'https://' + inputUrl;
    priceArea.innerHTML = '<div class="fetching"><div class="spinner"></div> Fetching price...</div>';
    actionArea.innerHTML = '';
    try {
      var data = await apiCall('POST', '/api/items/preview', { url: cleanUrl }, token);
      if (!data.price) throw new Error('Could not fetch price');
      var price = data.price;
      var origPrice = data.original_price;
      var basePrice = (origPrice && origPrice > price) ? origPrice : price;

      var priceHtml;
      if (origPrice && origPrice > price) {
        var pct = Math.round((1 - price / origPrice) * 100);
        priceHtml = '<span class="price-original">$' + origPrice.toFixed(2) + '</span><span class="price-value">$' + price.toFixed(2) + '</span><span class="price-sale-badge">' + pct + '% off</span>';
      } else {
        priceHtml = '<span class="price-value">$' + price.toFixed(2) + '</span>';
      }

      priceArea.innerHTML =
        '<div class="price-row"><div>' +
        '<div class="price-label">Current price</div>' +
        '<div style="display:flex;align-items:baseline;gap:4px;flex-wrap:wrap">' + priceHtml + '</div>' +
        '</div></div>';

      actionArea.innerHTML =
        '<div class="field" style="margin-bottom:6px"><label>Alert me when price drops by</label>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-top:6px">' +
        '<input type="range" id="pctSlider" min="1" max="80" value="10" style="flex:1;accent-color:var(--amber)">' +
        '<span id="pctLabel" style="font-family:DM Mono,monospace;font-size:15px;font-weight:600;color:var(--amber);min-width:36px;text-align:right">10%</span>' +
        '</div>' +
        '<div id="targetDisplay" style="margin-top:6px;font-size:12px;color:var(--muted)">' +
        'Alert when price &le; <strong style="color:var(--text)">$' + (basePrice * 0.9).toFixed(2) + '</strong>' +
        '<span style="color:var(--green)"> (save $' + (basePrice * 0.1).toFixed(2) + ')</span></div></div>' +
        '<div id="warnMsg"></div>' +
        '<button class="btn btn-amber" id="addBtn">Track this item</button>';

      document.getElementById('pctSlider').addEventListener('input', function() {
        var p = parseInt(this.value);
        var target = basePrice * (1 - p / 100);
        document.getElementById('pctLabel').textContent = p + '%';
        document.getElementById('targetDisplay').innerHTML =
          'Alert when price &le; <strong style="color:var(--text)">$' + target.toFixed(2) + '</strong>' +
          '<span style="color:var(--green)"> (save $' + (basePrice - target).toFixed(2) + ')</span>';
        document.getElementById('warnMsg').innerHTML =
          target >= price ? '<div class="msg msg-error" style="margin-top:6px">This item is already cheaper than your target!</div>' : '';
      });

      document.getElementById('addBtn').addEventListener('click', async function() {
        var p = parseInt(document.getElementById('pctSlider').value);
        var target = parseFloat((basePrice * (1 - p / 100)).toFixed(2));
        if (target >= price) {
          document.getElementById('warnMsg').innerHTML = '<div class="msg msg-error" style="margin-top:6px">This item is already cheaper than your target!</div>';
          return;
        }
        var btn = document.getElementById('addBtn');
        btn.disabled = true; btn.textContent = '...';
        try {
          await apiCall('POST', '/api/items', { url: cleanUrl, target_price: target, original_price: origPrice || null, last_price: data.price || null, currency: data.currency || null }, token);
          renderTrack('Tracking! You will be alerted when the price drops.');
        } catch(e) {
          priceArea.innerHTML += '<div class="msg msg-error" style="margin-top:8px">' + e.message + '</div>';
          btn.disabled = false; btn.textContent = 'Track this item';
        }
      });

    } catch(e) {
      priceArea.innerHTML = '<div class="msg msg-error">' + e.message + '</div>';
      actionArea.innerHTML = '<button class="btn btn-amber" id="fetchBtn2">Try again</button>';
      document.getElementById('fetchBtn2').addEventListener('click', doFetch);
    }
  }

  document.getElementById('fetchBtn').addEventListener('click', doFetch);
  document.getElementById('dashLink').addEventListener('click', async function(e) {
    e.preventDefault();
    var t = await getToken();
    chrome.tabs.create({ url: 'https://wishlistwatcher.com/dashboard.html?token=' + encodeURIComponent(t) });
  });
  document.getElementById('reportLink').addEventListener('click', function(e) {
    e.preventDefault();
    var inputUrl = document.getElementById('urlInput') ? document.getElementById('urlInput').value.trim() : url;
    renderReport(inputUrl || url);
  });
  if (isHttp && url) doFetch();
}

logoutBtn.addEventListener('click', async function() { await clearToken(); renderLogin(); });

(async function() {
  try {
    var token = await getToken();
    if (token) {
      try { await apiCall('GET', '/api/auth/me', null, token); renderTrack(); }
      catch(e) { await clearToken(); renderLogin(); }
    } else { renderLogin(); }
  } catch(e) {
    app.innerHTML = '<div class="msg msg-error" style="margin:16px">Error: ' + e.message + '</div>';
  }
})();
