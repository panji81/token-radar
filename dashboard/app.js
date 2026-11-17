// Token Radar's dashboard: a static page with no network. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a live-token table, and a detail page for
// every protocol, all behind hash routes: #/ the board, #/live the live table, and
// #/protocol/<slug> one protocol. Filters live in the hash too, so a view is a link.
//
// The page recomputes each row's implied value from the snapshot figures and regenerates its farm
// plan from the same derivation main.ts writes to board.json, so the page and the board agree.

(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;

  var state = { q: '', category: 'all', chain: 'all', preOnly: true, tab: 'board', sort: 'implied', dir: -1, slug: null };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The radar-2 model, recomputed in the page from the same snapshot figures.
  function impliedOf(row, model) {
    var g = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    g = Math.min(model.growth_cap, Math.max(model.growth_floor, g));
    var growthMult = 1 + (g / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (k === 'href') node.setAttribute('href', attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // --- farm plan: the same derivation as lib/model.ts, from category, chain, TVL and age. ---
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasNote(chain) {
    var c = String(chain).toLowerCase();
    if (c === 'ethereum') return '$6 to $12 of gas per transaction';
    if (c === 'solana') return 'about $0.01 of gas per transaction';
    if (['arbitrum', 'optimism', 'base', 'linea', 'blast', 'zksync era', 'scroll', 'mantle', 'mode', 'zora'].indexOf(c) >= 0) return 'under $1 of gas per transaction';
    if (['binance', 'polygon', 'avalanche', 'tron', 'fantom', 'gnosis'].indexOf(c) >= 0) return 'under $0.50 of gas per transaction';
    return 'a few dollars of gas per transaction';
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + ' of USDC on ' + name + ' (' + chain + ') and leave the deposit earning.';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ' and hold the LP receipt.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s highest-TVL vault on " + chain + ' and keep the shares.';
    if (c.indexOf('bridge') >= 0) return 'Move $' + capital + ' of USDC across ' + name + ' to ' + chain + " and put the bridged funds to work in its app.";
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's native asset through " + name + ' and keep the liquid receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('option') >= 0) return 'Post $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and take one position in ' + name + "'s longest-running market.";
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Allocate $' + capital + ' into a ' + name + ' curated vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or hold $' + capital + ' of the stable asset issued through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of ' + name + "'s yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Keep the position open and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasNote(chain);
    return [
      { text: 'Open a fresh wallet that holds only the funds you plan to farm, and store its seed phrase offline on paper.', cost: 'no capital, under $3 of gas for the first transaction', time: '5 minutes' },
      { text: 'Move $' + capital + ' of USDC into the fresh wallet on ' + chain + ", using the chain's own bridge or a central exchange withdrawal.", cost: gas + ', plus the bridge or withdrawal fee', time: '10 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: 'Do one qualifying action each week, such as a deposit, a borrow, a swap or a vote, so the wallet stays active.', cost: gas + ' a week', time: '10 minutes a week' },
      { text: "Open the protocol's own points or rewards page once a week and check that the position is counted.", cost: 'free to check, and never pay anyone to claim', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'When you unwind, withdraw in stages, claim only from the link the protocol itself publishes, and log the wallet, dates and every transaction.', cost: gas + ' per withdrawal', time: '20 minutes' }
    ].map(stepText);
  }

  // --- routes: #/ board, #/live live table, #/protocol/<slug> detail; filters in the query. ---
  function parseHash() {
    var raw = window.location.hash.replace(/^#/, '');
    var parts = raw.split('?');
    var path = parts[0] || '/';
    var q = new URLSearchParams(parts[1] || '');
    state.q = q.get('q') || '';
    state.category = q.get('category') || 'all';
    state.chain = q.get('chain') || 'all';
    state.preOnly = q.get('pre') !== '0';
    state.tab = 'board';
    state.slug = null;
    if (path === '/live') state.tab = 'live';
    else if (path.indexOf('/protocol/') === 0) { state.tab = 'detail'; state.slug = decodeURIComponent(path.slice('/protocol/'.length)); }
  }
  function writeHash() {
    var q = new URLSearchParams();
    if (state.q) q.set('q', state.q);
    if (state.category !== 'all') q.set('category', state.category);
    if (state.chain !== 'all') q.set('chain', state.chain);
    if (!state.preOnly) q.set('pre', '0');
    var qs = q.toString();
    var path = state.tab === 'live' ? '/live' : state.tab === 'detail' && state.slug ? '/protocol/' + encodeURIComponent(state.slug) : '/';
    window.history.replaceState(null, '', '#' + path + (qs ? '?' + qs : ''));
  }
  function go(path) {
    window.location.hash = path;
  }

  function findRow(slug) {
    var r = DATA.rows.filter(function (x) { return x.slug === slug; })[0];
    if (r) return { row: r, live: false };
    var l = DATA.live.filter(function (x) { return x.slug === slug; })[0];
    if (l) return { row: l, live: true };
    return null;
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function hero() {
    return el('section', { class: 'hero' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL that records no token. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, chosen by implied value. An implied value is a model, not a promise — and a protocol that records no token may still have one its record does not carry.' })
      ),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every slug on the list' })),
        el('div', { class: 'stat' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) }), el('small', { text: 'rank 1 is ' + (DATA.rows[0] ? DATA.rows[0].name : 'n/a') })),
        el('div', { class: 'stat' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) }), el('small', { text: 'by implied value, not TVL' })),
        el('div', { class: 'stat' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }), el('small', { text: 'shown at market cap' }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var chain = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chain.addEventListener('change', function () { state.chain = chain.value; writeHash(); render(); });
    var pre = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.preOnly ? 'checked' : null, 'aria-label': 'Pre-token only' }),
      'Pre-token only'
    );
    pre.querySelector('input').addEventListener('change', function (e) { state.preOnly = e.target.checked; writeHash(); render(); });
    var boardTab = el('button', { type: 'button', 'aria-pressed': state.tab === 'board' || state.tab === 'detail' ? 'true' : 'false', text: 'Board', onclick: function () { go('/'); } });
    var liveTab = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { go('/live'); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
      pre,
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), el('div', { class: 'tabs' }, boardTab, liveTab)),
      el('span', { class: 'count', text: state.tab === 'live' ? DATA.live.length + ' live-token protocols' : filteredRows().length + ' rows shown' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function rowCells(r, maxImplied, live) {
    var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
    var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
    return [
      el('td', { class: 'num', text: live ? 'live' : String(r.rank) }),
      el('td', null, el('div', { class: 'name' },
        el('b', { text: r.name }),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
      )),
      el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
      el('td', { class: 'num ' + growthClass, text: growth }),
      el('td', { class: 'num', text: fmtAge(r.age_days) }),
      el('td', null, live
        ? el('span', { class: 'num', text: fmtUsd(r.mcap_usd) })
        : el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / maxImplied) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
      el('td', null, el('span', { class: live ? 'badge live' : 'badge', text: live ? 'already trades' : 'records no token' }))
    ];
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    var liveExtra = state.preOnly ? [] : DATA.live.slice().sort(function (a, b) { return (b.mcap_usd || 0) - (a.mcap_usd || 0); });
    if (list.length === 0 && liveExtra.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.preOnly = true; writeHash(); render(); } })
      ));
    }
    var max = (list[0] && list[0].implied_value_usd) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', {
        'data-selected': state.slug === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { go('/protocol/' + encodeURIComponent(r.slug)); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('/protocol/' + encodeURIComponent(r.slug)); } }
      }, rowCells(r, max, false)));
    });
    liveExtra.forEach(function (r) {
      tbody.appendChild(el('tr', {
        tabindex: '0',
        onclick: function () { go('/protocol/' + encodeURIComponent(r.slug)); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('/protocol/' + encodeURIComponent(r.slug)); } }
      }, rowCells(r, max, true)));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', {
        tabindex: '0',
        onclick: function () { go('/protocol/' + encodeURIComponent(r.slug)); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('/protocol/' + encodeURIComponent(r.slug)); } }
      },
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'badge live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One function of the snapshot figures scores every row. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed — the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Growth is clamped hard because the snapshot holds a seven-day move above 4,000%, and one week of spike must not outrank years of TVL. The early radar takes the strongest pre-token protocols below the watchlist floor by implied value, and the live-token protocols are set aside with their market caps shown.' })
    );
  }

  function detailView() {
    var found = findRow(state.slug);
    if (!found) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol with that slug' }),
        el('p', { text: 'The link names a protocol this snapshot does not carry.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Back to the board', onclick: function () { go('/'); } })
      ));
    }
    var row = found.row;
    var live = found.live;
    var steps = farmSteps(row);
    var head = el('div', null,
      el('a', { class: 'back', href: '#/', text: '< Back to the board', onclick: function (e) { e.preventDefault(); go('/'); } }),
      el('div', { class: 'detail-head' },
        el('div', null,
          el('span', { class: 'brand-name', text: live ? 'Live token — set aside from the ranking' : 'Rank ' + row.rank + ' of ' + DATA.board_size }),
          el('h1', { text: row.name }),
          el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
        ),
        el('span', { class: live ? 'badge live' : 'badge', text: live ? 'already trades' : 'records no token' })
      )
    );
    var tiles = el('div', { class: 'tiles' },
      el('div', { class: 'tile' }, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
      el('div', { class: 'tile' }, el('span', { text: 'Seven-day growth' }), el('b', { text: fmtPct(row.change_7d) })),
      el('div', { class: 'tile' }, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) })),
      el('div', { class: 'tile' }, el('span', { text: 'Growth multiplier' }), el('b', { text: live ? 'n/a' : String(row.growth_multiplier) })),
      el('div', { class: 'tile' }, el('span', { text: 'Maturity multiplier' }), el('b', { text: live ? 'n/a' : String(row.maturity_multiplier) })),
      el('div', { class: 'tile' }, el('span', { text: live ? 'Market cap' : 'Implied value' }), el('b', { text: fmtUsd(live ? row.mcap_usd : row.implied_value_usd) }))
    );
    var body = el('div', { class: 'panel model' });
    if (!live) {
      var recomputed = impliedOf(row, DATA.model);
      body.appendChild(el('h3', { text: 'Implied value' }));
      body.appendChild(el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) }))
      ));
      body.appendChild(el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' }));
    } else {
      body.appendChild(el('h3', { text: 'Market value' }));
      body.appendChild(el('p', { class: 'sub', text: 'This protocol already trades, so its market cap of ' + fmtUsd(row.mcap_usd) + ' is a fact, not a model. It is set aside from the pre-token ranking.' }));
    }
    var plan = el('div', { class: 'panel model' },
      el('h3', { text: live ? 'Position plan' : 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    );
    return el('div', null, head, tiles, body, plan,
      el('p', { class: 'note', text: 'Snapshot ' + DATA.as_of + '. A protocol that records no token may still have one its record does not carry; never pay anyone to claim.' }));
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    if (state.tab === 'detail') {
      shell.appendChild(detailView());
    } else {
      shell.appendChild(hero());
      shell.appendChild(controls());
      shell.appendChild(state.tab === 'live' ? liveTable() : boardTable());
      if (state.tab === 'board') shell.appendChild(modelPanel());
    }
    shell.appendChild(el('p', { class: 'note', text: 'Token Radar, model ' + DATA.model_version + ' on the ' + DATA.as_of + ' snapshot. Implied values are a model, not a price and not a promise.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    window.__radarReady = true;
  }

  parseHash();
  render();
  window.addEventListener('hashchange', function () { parseHash(); render(); });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.tab === 'detail') go('/');
  });
})();
