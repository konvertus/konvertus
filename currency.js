const ICON_BASE = new URL("icons/", document.currentScript.src).href;

document.addEventListener("DOMContentLoaded", () => {
    const EN = document.documentElement.lang === "en";
    const t = (ru, en) => (EN ? en : ru);
    const NUM_LOCALE = EN ? "en-US" : "ru-RU";
    const TIME_LOCALE = EN ? "en-GB" : "ru-RU";
    const API_URL = "https://www.cbr-xml-daily.ru/daily_json.js";
    const CACHE_KEY = "konvertus-rates";

    // валюты для табло
    const BOARD = [
        ["USD", "Доллар США", "US Dollar"],
        ["EUR", "Евро", "Euro"],
        ["CNY", "Китайский юань", "Chinese Yuan"],
        ["GBP", "Фунт стерлингов", "Pound Sterling"],
        ["CHF", "Швейцарский франк", "Swiss Franc"],
        ["JPY", "Японская иена", "Japanese Yen"],
        ["TRY", "Турецкая лира", "Turkish Lira"],
        ["KZT", "Казахстанский тенге", "Kazakhstani Tenge"]
    ];

    const ICONS = { RUB: "ruble.png", USD: "dollar.png", EUR: "euro.png" };
    const iconsBox = document.getElementById("currency-icons");

    const title = document.getElementById("title");
    const input = document.getElementById("input");
    const output = document.getElementById("output");
    const selectTop = document.getElementById("select-top");
    const selectBottom = document.getElementById("select-bottom");
    const swap = document.getElementById("swap");
    const refresh = document.getElementById("refresh");
    const status = document.getElementById("rates-status");
    const board = document.getElementById("rates-board");

    let rates = null;

    function buildRates(data) {
        const result = { RUB: { rub: 1, prev: 1, nominal: 1, value: 1 } };
        for (const [code, v] of Object.entries(data.Valute)) {
            result[code] = {
                rub: v.Value / v.Nominal,
                prev: v.Previous / v.Nominal,
                nominal: v.Nominal,
                value: v.Value
            };
        }
        return result;
    }

    function calculate() {
        const val = parseFloat(input.value);
        if (isNaN(val) || !rates) {
            output.value = "";
            return;
        }

        const from = rates[selectTop.value];
        const to = rates[selectBottom.value];
        if (!from || !to) {
            output.value = t("Нет курса", "No rate");
            return;
        }

        const result = (val * from.rub) / to.rub;
        output.value = Number(result.toFixed(Math.abs(result) >= 1 ? 2 : 6));
    }

    function capitalize(s) {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function badge(code) {
        const el = document.createElement("span");
        el.className = "currency-badge";
        if (ICONS[code]) {
            const img = new Image();
            img.src = ICON_BASE + ICONS[code];
            img.alt = "";
            img.width = 24;
            img.height = 24;
            el.append(img);
        } else {
            el.classList.add("text");
            el.textContent = code;
        }
        return el;
    }

    function renderIcons() {
        if (!iconsBox) return;
        const arrow = document.createElement("span");
        arrow.className = "currency-arrow";
        arrow.textContent = "→";
        iconsBox.replaceChildren(badge(selectTop.value), arrow, badge(selectBottom.value));
    }

    function update() {
        if (title) {
            const first = selectTop.options[selectTop.selectedIndex].dataset.short;
            const second = selectBottom.options[selectBottom.selectedIndex].dataset.short;
            title.textContent = `${capitalize(first)} ${t("в", "to")} ${second}`;
        }
        renderIcons();
        calculate();
    }

    function renderBoard() {
        board.textContent = "";
        for (const [code, nameRu, nameEn] of BOARD) {
            const name = EN ? nameEn : nameRu;
            const r = rates[code];
            if (!r) continue;

            const diff = r.prev ? ((r.rub - r.prev) / r.prev) * 100 : 0;
            const dir = Math.abs(diff) < 0.005 ? "" : diff > 0 ? "up" : "down";
            const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "•";

            const card = document.createElement("div");
            card.className = "rate-card";

            const codeEl = document.createElement("div");
            codeEl.className = "rate-code";
            codeEl.textContent = code;

            const nameEl = document.createElement("div");
            nameEl.className = "rate-name";
            nameEl.textContent = r.nominal > 1 ? `${name} (${t("за", "per")} ${r.nominal})` : name;

            const valueEl = document.createElement("div");
            valueEl.className = "rate-value";
            valueEl.textContent = r.value.toLocaleString(NUM_LOCALE, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4
            }) + " ₽";

            const changeEl = document.createElement("div");
            changeEl.className = "rate-change " + dir;
            changeEl.textContent = `${arrow} ${diff > 0 ? "+" : ""}${EN ? diff.toFixed(2) : diff.toFixed(2).replace(".", ",")}%`;

            card.append(codeEl, nameEl, valueEl, changeEl);
            board.append(card);
        }
    }

    function setStatus(text, isError = false) {
        status.textContent = text;
        status.classList.toggle("error", isError);
    }

    function formatDate(iso) {
        return EN
            ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric" })
            : new Date(iso).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" });
    }

    function apply(data, stale) {
        rates = buildRates(data);
        renderBoard();
        calculate();

        let text = t(`Курс ЦБ РФ на ${formatDate(data.Date)}`, `Central Bank of Russia rates for ${formatDate(data.Date)}`);
        if (stale) {
            text += t(" · нет связи с сервером, показан сохранённый курс", " · offline, showing saved rates");
        } else {
            text += t(" · проверено в ", " · checked at ") + new Date().toLocaleTimeString(TIME_LOCALE, { hour: "2-digit", minute: "2-digit" });
        }
        setStatus(text);
    }

    function readCache() {
        try {
            return JSON.parse(localStorage.getItem(CACHE_KEY));
        } catch {
            return null;
        }
    }

    function writeCache(data) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {
        }
    }

    async function load() {
        refresh.disabled = true;
        refresh.classList.add("loading");
        if (!rates) setStatus(t("Загружаем курс…", "Loading rates…"));

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);

        try {
            const response = await fetch(API_URL, { cache: "no-store", signal: controller.signal });
            if (!response.ok) throw new Error("HTTP " + response.status);
            const data = await response.json();
            if (!data.Valute) throw new Error("Неожиданный ответ");

            writeCache(data);
            apply(data, false);
        } catch {
            const cached = readCache();
            if (cached && cached.Valute) {
                apply(cached, true);
            } else {
                setStatus(t("Не удалось загрузить курс. Проверьте интернет и нажмите «Обновить курс».", "Couldn’t load the rates. Check your connection and press “Refresh rates”."), true);
            }
        } finally {
            clearTimeout(timer);
            refresh.disabled = false;
            refresh.classList.remove("loading");
        }
    }

    input?.addEventListener("input", calculate);
    selectTop?.addEventListener("change", update);
    selectBottom?.addEventListener("change", update);
    refresh?.addEventListener("click", load);

    swap?.addEventListener("click", () => {
        [selectTop.value, selectBottom.value] = [selectBottom.value, selectTop.value];
        update();
    });

    const copy = document.getElementById("copy");

    copy?.addEventListener("click", async () => {
        if (!output.value || isNaN(Number(output.value))) return;

        try {
            await navigator.clipboard.writeText(output.value);
        } catch {
            output.select();
            document.execCommand("copy");
        }

        const icon = copy.querySelector("span");
        icon.textContent = "check";
        setTimeout(() => (icon.textContent = "content_copy"), 1500);
    });

    update();
    load();
});
