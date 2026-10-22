(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  var THEME_KEY = 'mebel-theme';
  var themes = ['dark', 'light', 'warm'];

  function setTheme(t) {
    if (themes.indexOf(t) < 0) { t = 'dark'; }
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    var btns = document.querySelectorAll('[data-set-theme]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', String(btns[i].getAttribute('data-set-theme') === t));
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) { meta.setAttribute('content', t === 'dark' ? '#101216' : (t === 'light' ? '#f4f6fa' : '#f6efe3')); }
  }
  var themeBtns = document.querySelectorAll('[data-set-theme]');
  for (var i = 0; i < themeBtns.length; i++) {
    themeBtns[i].addEventListener('click', function () { setTheme(this.getAttribute('data-set-theme')); });
  }
  var saved = 'dark';
  try { saved = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) {}
  setTheme(saved);

  var revealObserver = null;
  if ('IntersectionObserver' in window) {
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-visible'); revealObserver.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
  }
  function observeReveal(root) {
    var els = (root || document).querySelectorAll('.reveal:not(.is-visible)');
    for (var i = 0; i < els.length; i++) {
      if (revealObserver) { revealObserver.observe(els[i]); }
      else { els[i].classList.add('is-visible'); }
    }
  }

  var works = window.MEBEL_WORKS || [];

  var slides = document.getElementById('heroSlides');
  var slideEls = [];
  if (slides && works.length) {
    var pick = works.filter(function (w, idx) { return idx % 3 === 0; }).slice(0, 5);
    if (!pick.length) { pick = works.slice(0, 1); }
    pick.forEach(function (w, idx) {
      var d = document.createElement('div');
      d.className = 'hero-slide' + (idx === 0 ? ' active' : '');
      d.style.backgroundImage = 'url("' + w.photo + '")';
      slides.appendChild(d);
      slideEls.push(d);
    });
    var cur = 0;
    setInterval(function () {
      slideEls[cur].classList.remove('active');
      cur = (cur + 1) % slideEls.length;
      slideEls[cur].classList.add('active');
    }, 5500);
  }

  var grid = document.getElementById('worksGrid');
  grid.innerHTML = works.map(function (w, idx) {
    return '<figure class="work-card reveal" data-i="' + idx + '" tabindex="0" role="button" aria-label="' + esc(w.title) + '">' +
      '<img loading="lazy" src="' + esc(w.photo) + '" alt="' + esc(w.title) + '">' +
      '<div class="work-zoom">+</div>' +
      '<figcaption class="work-cap">' + esc(w.title) + '</figcaption>' +
      '</figure>';
  }).join('');

  var lb = document.getElementById('lightbox');
  var lbImg = document.getElementById('lbImg');
  var lbTitle = document.getElementById('lbTitle');
  var lbText = document.getElementById('lbText');
  var lbCount = document.getElementById('lbCount');
  var lbCur = 0;

  function lbShow(n) {
    lbCur = ((n % works.length) + works.length) % works.length;
    var w = works[lbCur];
    lbImg.style.opacity = '0';
    setTimeout(function () {
      lbImg.src = w.photo;
      lbImg.alt = w.title;
      lbImg.style.opacity = '1';
    }, 120);
    lbTitle.textContent = w.title;
    lbText.textContent = w.text;
    lbCount.textContent = (lbCur + 1) + ' / ' + works.length;
  }
  function lbOpen(n) {
    lbShow(n);
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function lbClose() {
    lb.hidden = true;
    document.body.style.overflow = '';
  }
  grid.addEventListener('click', function (e) {
    var c = e.target.closest('.work-card');
    if (c) { lbOpen(+c.getAttribute('data-i')); }
  });
  grid.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') { return; }
    var c = e.target.closest('.work-card');
    if (c) { e.preventDefault(); lbOpen(+c.getAttribute('data-i')); }
  });
  document.getElementById('lbClose').addEventListener('click', lbClose);
  document.getElementById('lbPrev').addEventListener('click', function () { lbShow(lbCur - 1); });
  document.getElementById('lbNext').addEventListener('click', function () { lbShow(lbCur + 1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) { lbClose(); } });
  document.addEventListener('keydown', function (e) {
    if (lb.hidden) { return; }
    if (e.key === 'Escape') { lbClose(); }
    if (e.key === 'ArrowLeft') { lbShow(lbCur - 1); }
    if (e.key === 'ArrowRight') { lbShow(lbCur + 1); }
  });
  var tX = null;
  lb.addEventListener('touchstart', function (e) { tX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', function (e) {
    if (tX === null) { return; }
    var dx = e.changedTouches[0].clientX - tX;
    if (Math.abs(dx) > 45) { lbShow(dx < 0 ? lbCur + 1 : lbCur - 1); }
    tX = null;
  }, { passive: true });

  var CATS = ['Все', 'Мебель', 'Инструменты', 'Расходники'];
  var products = [];
  var activeCat = 'Все';
  var chipsBox = document.getElementById('productChips');
  var pGrid = document.getElementById('productsGrid');

  function skeleton(n) {
    var h = '';
    for (var i = 0; i < n; i++) {
      h += '<div class="sk-card"><div class="sk-img"></div><div class="sk-line"></div><div class="sk-line short"></div></div>';
    }
    return h;
  }

  function renderChips() {
    chipsBox.innerHTML = CATS.map(function (c) {
      return '<button type="button" class="chip" data-cat="' + esc(c) + '" aria-pressed="' + (c === activeCat) + '">' + esc(c) + '</button>';
    }).join('');
  }
  chipsBox.addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b) { return; }
    activeCat = b.getAttribute('data-cat');
    renderChips();
    renderProducts();
  });

  function renderProducts() {
    var list = activeCat === 'Все' ? products : products.filter(function (p) { return p.category === activeCat; });
    if (!list.length) {
      pGrid.innerHTML = '<p class="sub">Пока пусто — загляните позже или напишите нам в VK.</p>';
      return;
    }
    pGrid.innerHTML = list.map(function (p) {
      var count = (p.photos && p.photos.length) ? p.photos.length : 0;
      var img = count
        ? '<img loading="lazy" src="' + esc(p.photos[0]) + '" alt="' + esc(p.title) + '">'
        : '<div class="product-ph">Виртуоз</div>';
      var badge = count > 1 ? '<div class="p-count">+' + (count - 1) + ' фото</div>' : '';
      var cat = p.category ? '<div class="p-cat">' + esc(p.category) + '</div>' : '';
      var desc = p.description ? '<p class="p-desc">' + esc(p.description) + '</p>' : '';
      return '<article class="product-card reveal">' +
        '<div class="p-img">' + img + cat + badge + '</div>' +
        '<div class="p-body">' +
        '<h3 class="p-title">' + esc(p.title) + '</h3>' + desc +
        '<div class="p-foot">' +
        '<span class="p-price">' + esc(p.price) + ' ₽</span>' +
        '<a class="p-link" href="' + esc(p.url) + '" target="_blank" rel="noopener">Заказать в VK</a>' +
        '</div></div></article>';
    }).join('');
    observeReveal(pGrid);
  }

  renderChips();
  pGrid.innerHTML = skeleton(8);
  window.MEBEL_STORE.loadProducts().then(function (res) {
    products = res.items;
    var present = CATS.filter(function (c) {
      return c === 'Все' || products.some(function (p) { return p.category === c; });
    });
    CATS.length = 0;
    CATS.push.apply(CATS, present);
    if (CATS.indexOf(activeCat) < 0) { activeCat = 'Все'; }
    renderChips();
    renderProducts();
  });

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return ''; }
  }

  var nGrid = document.getElementById('newsGrid');
  function renderNews(items) {
    if (!items.length) {
      nGrid.innerHTML = '<p class="sub">Скоро здесь появятся новости мастерской.</p>';
      return;
    }
    nGrid.innerHTML = items.map(function (n) {
      var img = n.image ? '<img class="n-img" loading="lazy" src="' + esc(n.image) + '" alt="">' : '';
      var badge = n.source === 'vk' ? 'VK' : 'Мастерская';
      var link = n.link
        ? '<a class="n-link" href="' + esc(n.link) + '" target="_blank" rel="noopener">Читать в VK →</a>'
        : '<button type="button" class="n-link n-more" data-open="1">Читать полностью</button>';
      var date = n.publishedAt ? String(n.publishedAt).slice(0, 10) : '';
      return '<article class="news-card reveal">' + img +
        '<div class="n-body">' +
        '<div class="n-meta"><span class="n-badge">' + badge + '</span><span class="n-date">' + esc(fmtDate(date)) + '</span></div>' +
        '<h3 class="n-title">' + esc(n.title) + '</h3>' +
        '<p class="n-text">' + esc(n.body) + '</p>' + link +
        '</div></article>';
    }).join('');
    observeReveal(nGrid);
  }
  nGrid.addEventListener('click', function (e) {
    var b = e.target.closest('.n-more');
    if (!b) { return; }
    var card = b.closest('.news-card');
    var txt = card.querySelector('.n-text');
    var open = txt.classList.toggle('open');
    b.textContent = open ? 'Свернуть' : 'Читать полностью';
  });
  var styleFix = document.createElement('style');
  styleFix.textContent = '.n-text.open{-webkit-line-clamp:999!important;display:block}';
  document.head.appendChild(styleFix);
  nGrid.innerHTML = skeleton(3);
  window.MEBEL_STORE.loadNews().then(renderNews);

  observeReveal(document);
  var y = document.getElementById('year');
  if (y) { y.textContent = new Date().getFullYear(); }
})();