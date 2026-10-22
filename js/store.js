(function () {
  'use strict';

  var CFG = window.MEBEL_CONFIG || {};

  function sbHeaders(extra) {
    var h = { 'apikey': CFG.supabaseAnonKey };
    if (extra) { for (var k in extra) { h[k] = extra[k]; } }
    return h;
  }

  function cacheGet(key, fallback) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }
  function cacheSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  function sbSelect(table, query) {
    if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) return Promise.reject(new Error('no-config'));
    var url = CFG.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/' + table + (query ? '?' + query : '');
    return fetch(url, { headers: sbHeaders() }).then(function (r) {
      if (!r.ok) { throw new Error('supabase ' + r.status); }
      return r.json();
    });
  }

  function loadProducts() {
    return sbSelect('products', 'select=*&is_hidden=eq.false&order=sort.asc.nullslast')
      .then(function (rows) {
        var mapped = (rows || []).map(function (p) {
          return {
            id: p.id, title: p.title, price: p.price || '',
            description: p.description || '', category: p.category || '',
            url: p.url || '#', photos: p.photos || []
          };
        });
        if (!mapped.length) { throw new Error('empty'); }
        cacheSet('mebel-cache-products', mapped);
        return { items: mapped, live: true };
      })
      .catch(function () {
        var cached = cacheGet('mebel-cache-products', null);
        if (cached && cached.length) { return { items: cached, live: false }; }
        return { items: window.MEBEL_PRODUCTS || [], live: false };
      });
  }

  function firstLine(t) {
    var line = (String(t || '').split('\n').filter(function (s) { return s.trim(); })[0] || '').trim();
    if (line.length > 90) { line = line.slice(0, 88).trim() + '…'; }
    return line;
  }

  function loadNews() {
    var own = sbSelect('news', 'select=*&is_published=eq.true&order=published_at.desc')
      .then(function (rows) {
        return (rows || []).map(function (n) {
          return {
            id: n.id, title: n.title, body: n.body || '', image: n.image_url || '',
            publishedAt: n.published_at || '', source: 'own', link: ''
          };
        });
      })
      .catch(function () {
        return (window.MEBEL_NEWS || []).map(function (n) {
          return { id: n.id, title: n.title, body: n.body || '', image: n.image || '',
            publishedAt: n.publishedAt || '', source: 'own', link: '' };
        });
      });
    return Promise.all([own, loadVkPosts()]).then(function (res) {
      var merged = res[0].concat(res[1]);
      merged.sort(function (a, b) { return String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')); });
      return merged.slice(0, 9);
    });
  }

  function loadVkPosts() {
    if (!CFG.vkServiceToken) { return Promise.resolve([]); }
    var url = 'https://api.vk.com/method/wall.get?owner_id=' + CFG.vkOwnerId +
      '&count=' + (CFG.vkPostsLimit || 6) + '&filter=owner&extended=0&v=5.199&access_token=' + encodeURIComponent(CFG.vkServiceToken);
    return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.response || !j.response.items) { return []; }
      return j.response.items
        .filter(function (it) {
          return it.text && it.attachments && it.attachments.some(function (a) { return a.type === 'photo'; });
        })
        .map(function (it) {
          var ph = '';
          it.attachments.forEach(function (a) {
            if (a.type === 'photo' && !ph) {
              var sizes = (a.photo && a.photo.sizes) || [];
              var best = null;
              sizes.forEach(function (s) { if (s.type === 'y' || s.type === 'x') { if (!best) { best = s; } } });
              if (!best && sizes.length) { best = sizes[sizes.length - 1]; }
              ph = best ? best.url : '';
            }
          });
          var txt = it.text.length > 280 ? it.text.slice(0, 278).replace(/\s+\S*$/, '') + '…' : it.text;
          var d = new Date(it.date * 1000);
          return {
            id: 'vk' + it.id,
            title: firstLine(txt),
            body: txt,
            image: ph,
            publishedAt: d.toISOString(),
            source: 'vk',
            link: 'https://vk.ru/wall' + it.owner_id + '_' + it.id
          };
        });
    })
    .catch(function () { return []; });
  }

  window.MEBEL_STORE = { loadProducts: loadProducts, loadNews: loadNews };
})();