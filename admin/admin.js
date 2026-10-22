(function () {
  'use strict';

  var CFG = window.MEBEL_CONFIG || {};
  var SKEY = 'mebel-admin-session';
  var session = null;
  var products = [];
  var news = [];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function photoSrc(u) {
    u = String(u || '');
    return (/^(https?:)?\/\/|^data:/i.test(u)) ? u : '../' + u.replace(/^\.?\//, '');
  }
  function sb() { return String(CFG.supabaseUrl || '').replace(/\/+$/, ''); }
  function configured() { return !!(CFG.supabaseUrl && CFG.supabaseAnonKey); }

  var toastTimer = null;
  function toast(msg, isErr) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 3200);
  }

  function loadSession() {
    try { session = JSON.parse(localStorage.getItem(SKEY)); } catch (e) { session = null; }
  }
  function saveSession() { try { localStorage.setItem(SKEY, JSON.stringify(session)); } catch (e) {} }
  function clearSession() { try { localStorage.removeItem(SKEY); } catch (e) {} session = null; }

  function authReq(path, body) {
    return fetch(sb() + path, {
      method: 'POST',
      headers: { 'apikey': CFG.supabaseAnonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) { throw new Error(j.error_description || j.msg || ('Ошибка ' + r.status)); }
        return j;
      });
    });
  }

  function login(email, pass) {
    return authReq('/auth/v1/token?grant_type=password', { email: email, password: pass }).then(function (j) {
      session = {
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        email: (j.user && j.user.email) || email,
        expires_at: Date.now() + (j.expires_in || 3600) * 1000
      };
      saveSession();
    });
  }
  function refresh() {
    if (!session || !session.refresh_token) { return Promise.reject(new Error('нет сессии')); }
    return authReq('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token }).then(function (j) {
      session.access_token = j.access_token;
      session.refresh_token = j.refresh_token || session.refresh_token;
      session.expires_at = Date.now() + (j.expires_in || 3600) * 1000;
      saveSession();
    });
  }
  function ensureToken() {
    return (session && Date.now() < (session.expires_at || 0) - 60000) ? Promise.resolve() : refresh();
  }

  function api(table, method, body, query) {
    return ensureToken().then(function () {
      var url = sb() + '/rest/v1/' + table + (query || '');
      return fetch(url, {
        method: method || 'GET',
        headers: {
          'apikey': CFG.supabaseAnonKey,
          'Authorization': 'Bearer ' + session.access_token,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: body ? JSON.stringify(body) : undefined
      }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) { throw new Error((j && j.message) || ('Ошибка ' + r.status)); }
          return j;
        });
      });
    });
  }

  function uploadFile(file) {
    return ensureToken().then(function () {
      var m = file.name.match(/\.([a-z0-9]+)$/i);
      var ext = m ? m[1].toLowerCase() : 'jpg';
      var rnd = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).slice(2));
      var path = 'uploads/' + rnd + '.' + ext;
      return fetch(sb() + '/storage/v1/object/media/' + path, {
        method: 'POST',
        headers: {
          'apikey': CFG.supabaseAnonKey,
          'Authorization': 'Bearer ' + session.access_token,
          'Content-Type': file.type || 'application/octet-stream',
          'x-upsert': 'true'
        },
        body: file
      }).then(function (r) {
        if (!r.ok) {
          return r.text().then(function (t) { throw new Error('Фото не загрузилось: ' + t.slice(0, 120)); });
        }
        return sb() + '/storage/v1/object/public/media/' + path;
      });
    });
  }

  function showLogin() { $('loginView').hidden = false; $('appView').hidden = true; }
  function showApp() {
    $('loginView').hidden = true;
    $('appView').hidden = false;
    $('userEmail').textContent = (session && session.email) || '';
    loadProducts(); loadNews();
  }

  function loadProducts() {
    $('productList').innerHTML = '<p class="empty">Загрузка…</p>';
    api('products', 'GET', null, '?select=*&order=sort.asc.nullslast,created_at.asc').then(function (rows) {
      products = rows || [];
      renderProducts();
    }).catch(function (e) {
      $('productList').innerHTML = '<p class="empty">Ошибка загрузки: ' + esc(e.message) + '</p>';
    });
  }
  function renderProducts() {
    if (!products.length) {
      $('productList').innerHTML = '<p class="empty">Товаров пока нет. Нажмите «Добавить товар».</p>';
      return;
    }
    $('productList').innerHTML = products.map(function (p, i) {
      var ph = (p.photos && p.photos[0]) ? '<img class="thumb" src="' + esc(photoSrc(p.photos[0])) + '" alt="">' : '<div class="thumb"></div>';
      return '<div class="card"><div class="row">' + ph +
        '<div class="grow"><p class="t-title">' + esc(p.title) + (p.is_hidden ? ' <span class="badge warn">скрыт</span>' : '') + '</p>' +
        '<p class="t-meta">Цена: <b>' + esc(p.price || '—') + ' ₽</b> · Категория: ' + esc(p.category || '—') + ' · Фото: ' + ((p.photos || []).length) + '</p></div></div>' +
        '<div class="actions">' +
        '<button class="btn btn-ghost btn-sm" data-act="up" data-id="' + p.id + '"' + (i === 0 ? ' disabled' : '') + '>↑ выше</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="down" data-id="' + p.id + '"' + (i === products.length - 1 ? ' disabled' : '') + '>↓ ниже</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="edit" data-id="' + p.id + '">Изменить</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="hide" data-id="' + p.id + '">' + (p.is_hidden ? 'Показать' : 'Скрыть') + '</button>' +
        '<button class="btn btn-danger btn-sm" data-act="del" data-id="' + p.id + '">Удалить</button>' +
        '</div></div>';
    }).join('');
  }

  function patch(table, id, body) { return api(table, 'PATCH', body, '?id=eq.' + encodeURIComponent(id)); }

  $('productList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b || b.disabled) { return; }
    var id = b.getAttribute('data-id');
    var i = products.findIndex(function (p) { return p.id === id; });
    if (i < 0) { return; }
    var p = products[i];
    var act = b.getAttribute('data-act');
    if (act === 'edit') { openProductModal(p); return; }
    if (act === 'hide') {
      b.disabled = true;
      patch('products', id, { is_hidden: !p.is_hidden })
        .then(function () { p.is_hidden = !p.is_hidden; renderProducts(); toast(p.is_hidden ? 'Товар скрыт с сайта' : 'Товар виден на сайте'); })
        .catch(function (er) { b.disabled = false; toast(er.message, true); });
      return;
    }
    if (act === 'del') {
      if (!confirm('Удалить товар «' + p.title + '»? Действие необратимо.')) { return; }
      b.disabled = true;
      api('products', 'DELETE', null, '?id=eq.' + encodeURIComponent(id))
        .then(function () { products.splice(i, 1); renderProducts(); toast('Товар удалён'); })
        .catch(function (er) { b.disabled = false; toast(er.message, true); });
      return;
    }
    if (act === 'up' || act === 'down') {
      var dir = act === 'up' ? -1 : 1;
      var j = i + dir;
      if (j < 0 || j >= products.length) { return; }
      var other = products[j];
      b.disabled = true;
      patch('products', p.id, { sort: j })
        .then(function () { return patch('products', other.id, { sort: i }); })
        .then(function () { loadProducts(); toast('Порядок обновлён'); })
        .catch(function (er) { b.disabled = false; toast(er.message, true); });
    }
  });

  var modalCtx = null;
  function openModal(title, html) {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = html;
    $('modalErr').textContent = '';
    var mb = $('modalBack');
    mb.hidden = false;
    mb.style.display = 'flex';
  }
  function closeModal() { var mb = $('modalBack'); mb.hidden = true; mb.style.display = 'none'; modalCtx = null; }

  var CATS = ['Мебель', 'Инструменты', 'Расходники'];

  function openProductModal(item) {
    modalCtx = { type: 'product', item: item || null, photos: item && item.photos ? item.photos.slice() : [] };
    var opts = CATS.map(function (c) {
      return '<option' + (item && item.category === c ? ' selected' : '') + '>' + c + '</option>';
    }).join('');
    openModal(item ? 'Изменить товар' : 'Новый товар',
      '<div class="f-grid">' +
      '<div class="full"><label>Название *</label><input id="fTitle" value="' + esc(item ? item.title : '') + '"></div>' +
      '<div><label>Цена (например: 1 500)</label><input id="fPrice" value="' + esc(item ? item.price || '' : '') + '"></div>' +
      '<div><label>Категория</label><select id="fCat">' + opts + '</select></div>' +
      '<div class="full"><label>Описание</label><textarea id="fDesc">' + esc(item ? item.description || '' : '') + '</textarea></div>' +
      '<div class="full"><label>Ссылка на товар в VK (необязательно)</label><input id="fUrl" value="' + esc(item ? item.url || '' : '') + '"></div>' +
      '<div class="full"><label>Фотографии</label><div class="photos" id="fPhotos"></div>' +
      '<div class="upl"><input type="file" id="fFile" accept="image/*" multiple><span class="t-meta">можно выбрать несколько сразу</span></div></div>' +
      '</div>');
    renderPhotos();
    $('fFile').addEventListener('change', onFiles);
  }

  function renderPhotos() {
    var box = $('fPhotos');
    if (!modalCtx || !modalCtx.photos.length) {
      box.innerHTML = '<span class="t-meta">фото пока нет</span>';
      return;
    }
    box.innerHTML = modalCtx.photos.map(function (u, i) {
      return '<div class="ph"><img src="' + esc(photoSrc(u)) + '" alt=""><button type="button" data-i="' + i + '" title="Убрать фото">✕</button></div>';
    }).join('');
  }

  function onFiles(e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    if (!files.length || !modalCtx) { return; }
    var btn = $('modalSave');
    btn.disabled = true;
    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () { return uploadFile(f); }).then(function (url) { modalCtx.photos.push(url); renderPhotos(); });
    });
    chain.then(function () { toast('Фото загружены: ' + files.length); })
      .catch(function (er) { toast(er.message, true); })
      .then(function () { btn.disabled = false; });
  }

  function openNewsModal(item) {
    modalCtx = { type: 'news', item: item || null, image: item ? (item.image_url || '') : '' };
    var today = new Date().toISOString().slice(0, 10);
    var d = item && item.published_at ? String(item.published_at).slice(0, 10) : today;
    openModal(item ? 'Изменить новость' : 'Новая новость',
      '<div class="f-grid">' +
      '<div class="full"><label>Заголовок *</label><input id="nTitle" value="' + esc(item ? item.title : '') + '"></div>' +
      '<div><label>Дата</label><input id="nDate" type="date" value="' + esc(d) + '"></div>' +
      '<div><label>Публикация</label><select id="nPub"><option value="true"' + (!item || item.is_published ? ' selected' : '') + '>Опубликована</option><option value="false"' + (item && !item.is_published ? ' selected' : '') + '>Черновик</option></select></div>' +
      '<div class="full"><label>Текст новости</label><textarea id="nBody" style="min-height:150px">' + esc(item ? item.body || '' : '') + '</textarea></div>' +
      '<div class="full"><label>Фото (необязательно)</label><div class="photos" id="nPhotos"></div>' +
      '<div class="upl"><input type="file" id="nFile" accept="image/*"><span class="t-meta">одно фото к новости</span></div></div>' +
      '</div>');
    renderNewsPhoto();
    $('nFile').addEventListener('change', function (e) {
      var f = (e.target.files || [])[0];
      e.target.value = '';
      if (!f) { return; }
      uploadFile(f).then(function (url) { modalCtx.image = url; renderNewsPhoto(); toast('Фото загружено'); })
        .catch(function (er) { toast(er.message, true); });
    });
  }
  function renderNewsPhoto() {
    var box = $('nPhotos');
    box.innerHTML = modalCtx.image
      ? '<div class="ph"><img src="' + esc(photoSrc(modalCtx.image)) + '" alt=""><button type="button" id="nDelPh" title="Убрать фото">✕</button></div>'
      : '<span class="t-meta">без фото</span>';
    var del = $('nDelPh');
    if (del) { del.addEventListener('click', function () { modalCtx.image = ''; renderNewsPhoto(); }); }
  }

  function loadNews() {
    $('newsList').innerHTML = '<p class="empty">Загрузка…</p>';
    api('news', 'GET', null, '?select=*&order=published_at.desc').then(function (rows) {
      news = rows || [];
      renderNews();
    }).catch(function (e) {
      $('newsList').innerHTML = '<p class="empty">Ошибка загрузки: ' + esc(e.message) + '</p>';
    });
  }
  function renderNews() {
    if (!news.length) {
      $('newsList').innerHTML = '<p class="empty">Новостей пока нет. Нажмите «Добавить новость».</p>';
      return;
    }
    $('newsList').innerHTML = news.map(function (n) {
      var ph = n.image_url ? '<img class="thumb" style="width:110px;height:62px" src="' + esc(photoSrc(n.image_url)) + '" alt="">' : '<div class="thumb" style="width:110px;height:62px"></div>';
      return '<div class="card"><div class="row">' + ph +
        '<div class="grow"><p class="t-title">' + esc(n.title) + (n.is_published ? ' <span class="badge ok">опубликована</span>' : ' <span class="badge warn">черновик</span>') + '</p>' +
        '<p class="t-meta">' + esc(String(n.published_at || '').slice(0, 10)) + '</p></div></div>' +
        '<div class="actions">' +
        '<button class="btn btn-ghost btn-sm" data-act="edit" data-id="' + n.id + '">Изменить</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="pub" data-id="' + n.id + '">' + (n.is_published ? 'В черновики' : 'Опубликовать') + '</button>' +
        '<button class="btn btn-danger btn-sm" data-act="del" data-id="' + n.id + '">Удалить</button>' +
        '</div></div>';
    }).join('');
  }

  $('newsList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b || b.disabled) { return; }
    var id = b.getAttribute('data-id');
    var i = news.findIndex(function (n) { return n.id === id; });
    if (i < 0) { return; }
    var n = news[i];
    var act = b.getAttribute('data-act');
    if (act === 'edit') { openNewsModal(n); return; }
    if (act === 'pub') {
      b.disabled = true;
      patch('news', id, { is_published: !n.is_published })
        .then(function () { n.is_published = !n.is_published; renderNews(); toast(n.is_published ? 'Новость на сайте' : 'Новость убрана в черновики'); })
        .catch(function (er) { b.disabled = false; toast(er.message, true); });
      return;
    }
    if (act === 'del') {
      if (!confirm('Удалить новость «' + n.title + '»?')) { return; }
      b.disabled = true;
      api('news', 'DELETE', null, '?id=eq.' + encodeURIComponent(id))
        .then(function () { news.splice(i, 1); renderNews(); toast('Новость удалена'); })
        .catch(function (er) { b.disabled = false; toast(er.message, true); });
    }
  });

  $('btnAddProduct').addEventListener('click', function () { openProductModal(null); });
  $('btnAddNews').addEventListener('click', function () { openNewsModal(null); });
  $('modalCancel').addEventListener('click', closeModal);

  $('modalSave').addEventListener('click', function () {
    if (!modalCtx) { return; }
    var btn = this;
    btn.disabled = true;
    var done = function () { btn.disabled = false; closeModal(); toast('Сохранено — уже на сайте'); };
    var fail = function (er) { btn.disabled = false; $('modalErr').textContent = er.message; };

    if (modalCtx.type === 'product') {
      var title = $('fTitle').value.trim();
      if (!title) { btn.disabled = false; $('modalErr').textContent = 'Укажите название товара.'; return; }
      var body = {
        title: title,
        price: $('fPrice').value.trim(),
        description: $('fDesc').value.trim(),
        category: $('fCat').value,
        url: $('fUrl').value.trim(),
        photos: modalCtx.photos
      };
      if (modalCtx.item) {
        patch('products', modalCtx.item.id, body).then(done).catch(fail);
      } else {
        body.sort = products.length;
        body.is_hidden = false;
        api('products', 'POST', body).then(done).catch(fail);
      }
    } else {
      var nTitle = $('nTitle').value.trim();
      if (!nTitle) { btn.disabled = false; $('modalErr').textContent = 'Укажите заголовок новости.'; return; }
      var nbody = {
        title: nTitle,
        body: $('nBody').value.trim(),
        image_url: modalCtx.image || null,
        published_at: new Date($('nDate').value || Date.now()).toISOString(),
        is_published: $('nPub').value === 'true'
      };
      if (modalCtx.item) {
        patch('news', modalCtx.item.id, nbody).then(done).catch(fail);
      } else {
        api('news', 'POST', nbody).then(done).catch(fail);
      }
    }
  });

  $('tabProducts').addEventListener('click', function () {
    $('tabProducts').setAttribute('aria-selected', 'true');
    $('tabNews').setAttribute('aria-selected', 'false');
    $('secProducts').hidden = false;
    $('secNews').hidden = true;
  });
  $('tabNews').addEventListener('click', function () {
    $('tabNews').setAttribute('aria-selected', 'true');
    $('tabProducts').setAttribute('aria-selected', 'false');
    $('secNews').hidden = false;
    $('secProducts').hidden = true;
  });

  function doLogin() {
    var errEl = $('loginErr');
    errEl.textContent = '';
    if (!configured()) {
      errEl.textContent = 'Админка ещё не настроена: нужно вписать URL и ключ Supabase в js/config.js (см. инструкцию).';
      return;
    }
    var btn = $('btnLogin');
    btn.disabled = true;
    login($('inEmail').value.trim(), $('inPass').value)
      .then(showApp)
      .catch(function (er) { errEl.textContent = er.message; })
      .then(function () { btn.disabled = false; $('inPass').value = ''; });
  }
  $('btnLogin').addEventListener('click', doLogin);
  $('inPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') { doLogin(); } });

  $('btnLogout').addEventListener('click', function () {
    fetch(sb() + '/auth/v1/logout', {
      method: 'POST',
      headers: { 'apikey': CFG.supabaseAnonKey, 'Authorization': 'Bearer ' + (session ? session.access_token : ''), 'Content-Type': 'application/json' },
      body: '{}'
    }).catch(function () {}).then(function () {
      clearSession();
      showLogin();
    });
  });

  $('modalBack').style.display = 'none';
  loadSession();
  if (session && configured()) {
    refresh().then(showApp).catch(function () { clearSession(); showLogin(); });
  } else {
    showLogin();
    if (!configured()) {
      $('loginErr').textContent = 'Админка ещё не настроена: впишите Supabase URL и anon key в js/config.js (см. инструкцию).';
    }
  }
})();