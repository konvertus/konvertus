// Страница «Обмен»: сравнение курсов покупки и продажи валюты в разных банках.
// Курсы банков берутся из data/banks.json, курс ЦБ для сравнения из data/history.json.
// адрес страницы с ?demo показывает демонстрационные данные (data/banks.demo.json), чтобы посмотреть, как всё выглядит
const EXCHANGE_BANKS_URL = document.currentScript
    ? new URL(new URLSearchParams(location.search).has("demo") ? "data/banks.demo.json" : "data/banks.json", document.currentScript.src).href
    : null;
const EXCHANGE_CBR_URL = document.currentScript ? new URL("data/history.json", document.currentScript.src).href : null;

document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("exchange");
    if (!root) return;

    const EN = document.documentElement.lang === "en";
    const t = (ru, en) => (EN ? en : ru);
    const LOCALE = EN ? "en-US" : "ru-RU";

    const NAMES = {
        USD: ["Доллар США", "US dollar"],
        EUR: ["Евро", "Euro"],
        CNY: ["Юань", "Yuan"],
        GBP: ["Фунт стерлингов", "Pound sterling"],
        CHF: ["Швейцарский франк", "Swiss franc"],
        JPY: ["Иена", "Yen"],
        TRY: ["Турецкая лира", "Turkish lira"],
        KZT: ["Тенге", "Tenge"],
        BYN: ["Белорусский рубль", "Belarusian ruble"],
        AED: ["Дирхам ОАЭ", "UAE dirham"]
    };

    const demoEl = document.getElementById("ex-demo");
    const modeBox = document.getElementById("ex-mode");
    const chipsBox = document.getElementById("ex-currencies");
    const amountInput = document.getElementById("ex-amount");
    const amountCode = document.getElementById("ex-amount-code");
    const statsEl = document.getElementById("ex-stats");
    const table = document.getElementById("ex-table");
    const lastHeader = document.getElementById("ex-total-head");
    const statusEl = document.getElementById("ex-status");
    const tbody = table.querySelector("tbody");

    const state = { mode: "buy", code: null, amount: 1000 };
    let banks = [];
    let cbr = null; // { date, rates: { USD: 80.5, ... } }

    // ---------- форматирование ----------
    const num = (v, min, max) => v.toLocaleString(LOCALE, { minimumFractionDigits: min, maximumFractionDigits: max });
    const rate = (v) => num(v, 2, v < 10 ? 4 : 2);
    const money = (v) => `${num(v, 2, 2)} ₽`;
    const percent = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(v), 1, 1)}%`;
    const valid = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
    const bankName = (b) => (EN && b.name_en ? b.name_en : b.name);

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    // ---------- данные ----------
    function rowsFor(code) {
        const side = state.mode === "buy" ? "sell" : "buy"; // покупаем мы, значит банк продаёт
        const rows = banks
            .map((bank) => ({ bank, buy: bank.rates?.[code]?.buy, sell: bank.rates?.[code]?.sell }))
            .filter((r) => valid(r[side]));
        // купить выгоднее по меньшему курсу продажи, продать по большему курсу покупки
        rows.sort((a, b) => (state.mode === "buy" ? a.sell - b.sell : b.buy - a.buy));
        return { rows, side };
    }

    function render() {
        if (!state.code) return;
        const { rows, side } = rowsFor(state.code);
        const amount = state.amount;
        const hasAmount = Number.isFinite(amount) && amount > 0;
        const buying = state.mode === "buy";

        tbody.replaceChildren();
        statsEl.replaceChildren();
        amountCode.textContent = state.code;
        lastHeader.textContent = buying ? t("Вы заплатите", "You pay") : t("Вы получите", "You get");

        if (!rows.length) {
            const tr = el("tr");
            const td = el("td", "exchange-empty", t("Для этой валюты нет данных.", "No data for this currency."));
            td.colSpan = 5;
            tr.append(td);
            tbody.append(tr);
            return;
        }

        const best = rows[0][side];
        const worst = rows[rows.length - 1][side];

        rows.forEach((row, i) => {
            const tr = el("tr");
            if (i === 0) tr.classList.add("is-best");

            const nameCell = el("td");
            nameCell.dataset.label = t("Банк", "Bank");
            const url = row.bank.urls?.[state.code] || row.bank.url;
            if (typeof url === "string" && /^https?:\/\//i.test(url)) {
                const a = el("a", "exchange-bank", bankName(row.bank));
                a.href = url;
                a.target = "_blank";
                a.rel = "noopener noreferrer";
                nameCell.append(a);
            } else {
                nameCell.append(el("span", "exchange-bank", bankName(row.bank)));
            }
            if (i === 0) nameCell.append(el("span", "exchange-best", t("Лучший курс", "Best rate")));

            const buyCell = el("td", state.mode === "sell" ? "is-active" : "", valid(row.buy) ? rate(row.buy) : "—");
            buyCell.dataset.label = t("Банк покупает", "Bank buys");
            const sellCell = el("td", buying ? "is-active" : "", valid(row.sell) ? rate(row.sell) : "—");
            sellCell.dataset.label = t("Банк продаёт", "Bank sells");

            const spreadValue = valid(row.buy) && valid(row.sell) ? ((row.sell - row.buy) / row.buy) * 100 : null;
            const spreadCell = el("td", "", spreadValue === null ? "—" : `${num(spreadValue, 1, 1)}%`);
            spreadCell.dataset.label = t("Спред", "Spread");

            const totalCell = el("td", "exchange-total", hasAmount ? money(amount * row[side]) : "—");
            totalCell.dataset.label = buying ? t("Вы заплатите", "You pay") : t("Вы получите", "You get");

            tr.append(nameCell, buyCell, sellCell, spreadCell, totalCell);
            tbody.append(tr);
        });

        // итоги над таблицей
        const top = rows[0];
        const cards = [
            stat(
                t("Лучшее предложение", "Best offer"),
                `${rate(best)} ₽`,
                `${bankName(top.bank)} · ${buying ? t("продажа", "sell") : t("покупка", "buy")} 1 ${state.code}`
            )
        ];
        if (hasAmount && rows.length > 1) {
            const saved = Math.abs(worst - best) * amount;
            cards.push(
                stat(
                    buying ? t("Экономия", "You save") : t("Выигрыш", "You gain"),
                    money(saved),
                    t(`по сравнению с самым невыгодным банком из ${rows.length}`, `compared with the least favorable of ${rows.length} banks`)
                )
            );
        }
        const reference = cbr?.rates?.[state.code];
        if (valid(reference)) {
            const diff = (best / reference - 1) * 100;
            cards.push(
                stat(
                    t("Курс ЦБ РФ", "Bank of Russia rate"),
                    `${rate(reference)} ₽`,
                    t(`лучший курс банков ${percent(diff)} к ЦБ`, `best bank rate ${percent(diff)} vs CBR`)
                )
            );
        }
        statsEl.append(...cards);
    }

    function stat(label, value, sub) {
        const card = el("div", "chart-stat");
        card.append(el("div", "chart-stat-label", label), el("div", "chart-stat-value", value), el("div", "chart-stat-sub", sub));
        return card;
    }

    // ---------- управление ----------
    function setMode(mode) {
        state.mode = mode;
        for (const btn of modeBox.querySelectorAll(".range-btn")) btn.setAttribute("aria-pressed", String(btn.dataset.mode === mode));
        render();
    }

    function setCurrency(code) {
        state.code = code;
        for (const btn of chipsBox.querySelectorAll(".range-btn")) btn.setAttribute("aria-pressed", String(btn.dataset.code === code));
        render();
    }

    modeBox.addEventListener("click", (e) => {
        const btn = e.target.closest(".range-btn");
        if (btn) setMode(btn.dataset.mode);
    });
    chipsBox.addEventListener("click", (e) => {
        const btn = e.target.closest(".range-btn");
        if (btn) setCurrency(btn.dataset.code);
    });

    // в сумме можно вводить только число
    amountInput.addEventListener("input", () => {
        let cleaned = "";
        let hasSeparator = false;
        for (const ch of amountInput.value) {
            if (ch >= "0" && ch <= "9") cleaned += ch;
            else if ((ch === "." || ch === ",") && !hasSeparator) {
                cleaned += EN ? "." : ",";
                hasSeparator = true;
            }
        }
        if (cleaned !== amountInput.value) amountInput.value = cleaned;
        state.amount = parseFloat(cleaned.replace(",", "."));
        render();
    });

    // ---------- загрузка ----------
    async function load() {
        statusEl.textContent = t("Загружаем курсы банков…", "Loading bank rates…");
        try {
            const response = await fetch(EXCHANGE_BANKS_URL, { cache: "no-cache" });
            if (!response.ok) throw new Error("HTTP " + response.status);
            const data = await response.json();
            banks = Array.isArray(data.banks) ? data.banks : [];
            if (!banks.length) throw new Error("empty");

            // файл есть, но курсы в нём ещё не заполнены
            if (!banks.some((b) => Object.keys(b.rates || {}).length)) {
                root.classList.add("is-empty");
                statusEl.textContent = t("Курсы банков пока не добавлены. Они появятся здесь, как только файл с курсами будет заполнен.", "Bank rates have not been added yet. They will appear here once the rates file is filled in.");
                return;
            }

            const codes = Array.isArray(data.currencies) && data.currencies.length
                ? data.currencies
                : [...new Set(banks.flatMap((b) => Object.keys(b.rates || {})))];

            for (const code of codes) {
                const btn = el("button", "range-btn", code);
                btn.type = "button";
                btn.dataset.code = code;
                btn.setAttribute("aria-pressed", "false");
                if (NAMES[code]) btn.title = NAMES[code][EN ? 1 : 0];
                chipsBox.append(btn);
            }

            demoEl.hidden = !data.demo;
            const when = data.updated ? new Date(data.updated) : null;
            statusEl.textContent = when && !isNaN(when)
                ? t(`Курсы обновлены: ${when.toLocaleString(LOCALE, { dateStyle: "long", timeStyle: "short" })}. `, `Rates updated: ${when.toLocaleString(LOCALE, { dateStyle: "long", timeStyle: "short" })}. `) +
                  t("Курсы ориентировочные: перед обменом уточните их в банке.", "Rates are indicative: please check them with the bank before exchanging.")
                : t("Курсы ориентировочные: перед обменом уточните их в банке.", "Rates are indicative: please check them with the bank before exchanging.");

            setCurrency(codes[0]);
            loadReference();
        } catch {
            statusEl.textContent = t("Не удалось загрузить курсы банков. Попробуйте обновить страницу позже.", "Couldn’t load bank rates. Please try again later.");
            statusEl.classList.add("error");
        }
    }

    // курс ЦБ из истории (если файл есть): нужен только для сравнения
    async function loadReference() {
        try {
            const response = await fetch(EXCHANGE_CBR_URL, { cache: "no-cache" });
            if (!response.ok) return;
            const data = await response.json();
            const date = Object.keys(data.rates).sort().pop();
            const rates = {};
            data.codes.forEach((code, i) => {
                const v = data.rates[date][i];
                if (valid(v)) rates[code] = v;
            });
            cbr = { date, rates };
            render();
        } catch {
            // без курса ЦБ страница работает так же, просто без этой карточки
        }
    }

    state.amount = parseFloat(amountInput.value);
    load();
});
