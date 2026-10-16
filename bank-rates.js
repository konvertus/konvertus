// Simple client-side page to compare bank buy/sell rates.
// Expects a JSON file at /data/banks.json with structure:
// [{ "bank":"Bank A", "country":"RU", "rates": { "USD": {"buy":74.2,"sell":75.0}, ... }, "updated":"2026-10-16T10:00:00Z" }, ...]

document.addEventListener('DOMContentLoaded', () => {
  const currencySelect = document.getElementById('currency');
  const modeSelect = document.getElementById('mode');
  const refreshBtn = document.getElementById('refresh');
  const updatedEl = document.getElementById('updated');
  const tbody = document.getElementById('rates-body');
  const empty = document.getElementById('empty');
  const table = document.getElementById('rates-table');

  let banks = [];
  let currencies = [];
  let sort = { key: 'name', dir: 1 };

  async function loadData() {
    try {
      const res = await fetch('/data/banks.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      banks = await res.json();
    } catch (err) {
      // If fetch fails, keep banks empty
      banks = [];
      console.warn('Could not load banks.json', err);
    }

    collectCurrencies();
    renderControls();
    renderTable();
  }

  function collectCurrencies() {
    const set = new Set();
    for (const b of banks) {
      if (!b.rates) continue;
      for (const c of Object.keys(b.rates)) set.add(c);
    }
    currencies = Array.from(set).sort();
  }

  function renderControls() {
    currencySelect.replaceChildren();
    currencies.forEach(c => currencySelect.append(new Option(c, c)));
    if (!currencySelect.value && currencies[0]) currencySelect.value = currencies[0];

    const latest = banks.reduce((acc, b) => {
      if (!b.updated) return acc;
      const d = new Date(b.updated);
      return acc && acc > d ? acc : d;
    }, null);
    updatedEl.textContent = latest ? 'Latest update: ' + latest.toLocaleString() : '';
  }

  function formatPrice(v) {
    if (v === undefined || v === null) return '—';
    return Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }

  function renderTable() {
    const cur = currencySelect.value;
    tbody.replaceChildren();

    if (!cur || banks.length === 0) {
      table.hidden = true;
      empty.hidden = false;
      return;
    }

    table.hidden = false;
    empty.hidden = true;

    // Build rows data
    const rows = banks.map(b => {
      const r = b.rates && b.rates[cur];
      return {
        bank: b.bank || b.name || '—',
        country: b.country || '',
        buy: r ? r.buy : null,
        sell: r ? r.sell : null,
        updated: b.updated ? new Date(b.updated) : null,
        raw: b
      };
    });

    // Sorting
    rows.sort((a, b) => {
      const k = sort.key;
      let va = a[k];
      let vb = b[k];
      if (k === 'name') { va = a.bank.toLowerCase(); vb = b.bank.toLowerCase(); }
      if (va === null || va === undefined) return 1 * sort.dir;
      if (vb === null || vb === undefined) return -1 * sort.dir;
      if (va < vb) return -1 * sort.dir;
      if (va > vb) return 1 * sort.dir;
      return 0;
    });

    // Highlight best buy/sell
    const buys = rows.filter(r => Number.isFinite(r.buy)).map(r => r.buy);
    const sells = rows.filter(r => Number.isFinite(r.sell)).map(r => r.sell);
    const bestBuy = buys.length ? Math.max(...buys) : null; // best for user selling currency to bank
    const bestSell = sells.length ? Math.min(...sells) : null; // best for user buying currency from bank

    for (const row of rows) {
      const tr = document.createElement('tr');
      const nameTd = document.createElement('td');
      nameTd.textContent = row.bank + (row.country ? ' (' + row.country + ')' : '');
      tr.appendChild(nameTd);

      const buyTd = document.createElement('td');
      buyTd.textContent = formatPrice(row.buy);
      if (bestBuy !== null && row.buy === bestBuy) buyTd.classList.add('best-buy');
      tr.appendChild(buyTd);

      const sellTd = document.createElement('td');
      sellTd.textContent = formatPrice(row.sell);
      if (bestSell !== null && row.sell === bestSell) sellTd.classList.add('best-sell');
      tr.appendChild(sellTd);

      const updTd = document.createElement('td');
      updTd.textContent = row.updated ? row.updated.toLocaleString() : '—';
      tr.appendChild(updTd);

      tbody.appendChild(tr);
    }
  }

  // Click on header to sort
  document.querySelectorAll('#rates-table th').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.sort || 'name';
      if (sort.key === k) sort.dir = -sort.dir; else { sort.key = k; sort.dir = 1; }
      renderTable();
    });
  });

  currencySelect.addEventListener('change', renderTable);
  modeSelect.addEventListener('change', renderTable);
  refreshBtn.addEventListener('click', loadData);

  // Initial load
  loadData();
});
