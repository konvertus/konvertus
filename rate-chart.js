// График курса для пары валют из конвертера.
// Данные: архив ЦБ РФ на cbr-xml-daily.ru (по одному файлу на день), без библиотек.
document.addEventListener("DOMContentLoaded", () => {
    const section = document.getElementById("rate-chart");
    const selectTop = document.getElementById("select-top");
    const selectBottom = document.getElementById("select-bottom");
    if (!section || !selectTop || !selectBottom) return;

    const EN = document.documentElement.lang === "en";
    const t = (ru, en) => (EN ? en : ru);
    const NUM_LOCALE = EN ? "en-US" : "ru-RU";

    const BASE = "https://www.cbr-xml-daily.ru/";
    const LATEST_URL = BASE + "daily_json.js";
    const HISTORY_KEY = "konvertus-history-v1";
    const RATES_CACHE_KEY = "konvertus-rates"; // кэш из currency.js
    const CODES = ["USD", "EUR", "CNY", "GBP", "CHF", "JPY", "TRY", "KZT", "BYN", "AED"];
    const MAX_POINTS = 48;       // не больше стольких дат на график
    const PARALLEL = 6;          // одновременных запросов
    const MAX_CUSTOM_DAYS = 5 * 366;
    const MIN_DATE = "2000-01-01";
    const DAY = 86400000;
    const NS = "http://www.w3.org/2000/svg";

    const pairEl = document.getElementById("chart-pair");
    const statusEl = document.getElementById("chart-status");
    const statsEl = document.getElementById("chart-stats");
    const box = document.getElementById("chart-box");
    const svg = document.getElementById("chart-svg");
    const tip = document.getElementById("chart-tip");
    const customBox = document.getElementById("range-custom");
    const fromInput = document.getElementById("range-from");
    const toInput = document.getElementById("range-to");
    const applyBtn = document.getElementById("range-apply");
    const rangeBtns = [...section.querySelectorAll(".range-btn")];

    // ---------- даты (всё в UTC, чтобы не ловить сдвиги часовых поясов) ----------
    const toISO = (ms) => new Date(ms).toISOString().slice(0, 10);
    const toMs = (iso) => Date.parse(iso + "T00:00:00Z");

    // ЦБ не публикует курсы в выходные: сдвигаем дату на пятницу
    function weekdayBack(ms) {
        const wd = new Date(ms).getUTCDay();
        if (wd === 6) return ms - DAY;
        if (wd === 0) return ms - 2 * DAY;
        return ms;
    }

    const dateFmt = (opts) => new Intl.DateTimeFormat(NUM_LOCALE, { timeZone: "UTC", ...opts });
    const fmtLong = dateFmt({ day: "numeric", month: "long", year: "numeric" });
    const fmtDayMonth = dateFmt({ day: "numeric", month: "short" });
    const fmtMonthYear = dateFmt({ month: "short", year: "numeric" });

    // ---------- числа ----------
    function fmt(v) {
        const abs = Math.abs(v);
        const max = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
        return v.toLocaleString(NUM_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: max });
    }

    function fmtPercent(p) {
        const s = Math.abs(p).toLocaleString(NUM_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return `${p > 0 ? "+" : p < 0 ? "−" : ""}${s}%`;
    }

    function niceStep(raw) {
        const pow = Math.pow(10, Math.floor(Math.log10(raw)));
        const n = raw / pow;
        return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
    }

    function niceTicks(lo, hi, count) {
        const step = niceStep((hi - lo) / count);
        const ticks = [];
        for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) ticks.push(v);
        return { ticks, step };
    }

    // сколько знаков после запятой нужно, чтобы шаг сетки (0.25, 2.5, 5...) писался без округления
    function decimalsFor(step) {
        for (let d = 0; d < 8; d++) {
            const k = step * Math.pow(10, d);
            if (Math.abs(k - Math.round(k)) < 1e-6) return d;
        }
        return 8;
    }

    // ---------- хранилище истории (даты в прошлом не меняются, кэш вечный) ----------
    let history = {};
    try {
        history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || {};
    } catch {
        history = {};
    }

    function saveHistory() {
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        } catch {
            // хранилище переполнено или запрещено — график всё равно работает
        }
    }

    // из ответа ЦБ берём только нужное: рублей за 1 единицу валюты
    function pack(data) {
        const r = { RUB: 1 };
        for (const code of CODES) {
            const v = data.Valute && data.Valute[code];
            if (v && v.Nominal) r[code] = Number((v.Value / v.Nominal).toPrecision(8));
        }
        return { d: String(data.Date).slice(0, 10), r };
    }

    async function fetchDay(iso, signal) {
        if (iso in history) return history[iso];
        const [y, m, d] = iso.split("-");
        const response = await fetch(`${BASE}archive/${y}/${m}/${d}/daily_json.js`, { signal });
        if (response.status === 404) {
            history[iso] = 0; // в этот день курса нет (праздник)
            return 0;
        }
        if (!response.ok) throw new Error("HTTP " + response.status);
        const data = await response.json();
        if (!data.Valute) throw new Error("Unexpected response");
        history[iso] = pack(data);
        return history[iso];
    }

    // последняя доступная дата курса (ЦБ публикует курс на следующий рабочий день заранее)
    let latest = null;
    async function getLatest(signal) {
        if (latest) return latest;
        try {
            const response = await fetch(LATEST_URL, { signal });
            if (!response.ok) throw new Error("HTTP " + response.status);
            const data = await response.json();
            if (!data.Valute) throw new Error("Unexpected response");
            const entry = pack(data);
            history[entry.d] = entry;
            latest = entry.d;
        } catch (e) {
            if (e.name === "AbortError") throw e;
            try {
                const cached = JSON.parse(localStorage.getItem(RATES_CACHE_KEY));
                if (cached && cached.Date) latest = String(cached.Date).slice(0, 10);
            } catch {
                // нет кэша
            }
            if (!latest) latest = toISO(weekdayBack(Date.now()));
        }
        toInput.max = fromInput.max = latest;
        return latest;
    }

    // ---------- какие даты нужно загрузить ----------
    function planDates(startIso, endIso) {
        const start = toMs(startIso);
        const end = toMs(endIso);
        const days = Math.round((end - start) / DAY);
        const step = Math.max(1, Math.ceil(days / MAX_POINTS));
        const set = new Set();
        for (let ms = start; ms < end; ms += step * DAY) set.add(toISO(weekdayBack(ms)));
        set.add(endIso);
        return { dates: [...set].sort(), step };
    }

    async function loadAll(dates, signal, onProgress) {
        let next = 0;
        let done = 0;
        let failed = 0;
        const worker = async () => {
            while (next < dates.length) {
                const iso = dates[next++];
                try {
                    await fetchDay(iso, signal);
                } catch (e) {
                    if (e.name === "AbortError") throw e;
                    failed++;
                }
                onProgress(++done, dates.length);
            }
        };
        await Promise.all(Array.from({ length: Math.min(PARALLEL, dates.length) }, worker));
        saveHistory();
        return failed;
    }

    function buildSeries(dates, from, to) {
        const byDate = new Map();
        for (const iso of dates) {
            const e = history[iso];
            if (!e) continue;
            const a = e.r[from];
            const b = e.r[to];
            if (!a || !b) continue;
            byDate.set(e.d, a / b);
        }
        return [...byDate]
            .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
            .map(([d, v]) => ({ d, ms: toMs(d), v }));
    }

    // ---------- состояние ----------
    let range = "30";
    let runId = 0;
    let controller = null;
    let current = null; // { series, from, to }

    function setStatus(text, isError = false) {
        statusEl.textContent = text;
        statusEl.classList.toggle("error", isError);
    }

    function hideTip() {
        tip.hidden = true;
        for (const node of svg.querySelectorAll(".chart-cursor, .chart-point")) node.setAttribute("visibility", "hidden");
    }

    function clearChart() {
        svg.replaceChildren();
        statsEl.replaceChildren();
        tip.hidden = true;
        current = null;
    }

    function resolveRange(latestIso) {
        if (range !== "custom") {
            return { start: toISO(toMs(latestIso) - Number(range) * DAY), end: latestIso };
        }
        const from = fromInput.value;
        let to = toInput.value;
        if (!from || !to) return { error: t("Укажите обе даты.", "Please pick both dates.") };
        if (from >= to) return { error: t("Начальная дата должна быть раньше конечной.", "The start date must be earlier than the end date.") };
        if (to > latestIso) to = latestIso;
        else to = toISO(weekdayBack(toMs(to)));
        if (from >= to) return { error: t("За выбранные даты нет курсов ЦБ.", "There are no Bank of Russia rates for these dates.") };
        if ((toMs(to) - toMs(from)) / DAY > MAX_CUSTOM_DAYS) {
            return { error: t("Выберите период не длиннее 5 лет.", "Please choose a period of 5 years or less.") };
        }
        return { start: from, end: to };
    }

    async function run() {
        const id = ++runId;
        if (controller) controller.abort();
        controller = new AbortController();
        const { signal } = controller;

        const from = selectTop.value;
        const to = selectBottom.value;
        pairEl.textContent = `${from} → ${to}`;

        if (from === to) {
            clearChart();
            box.classList.remove("loading");
            setStatus(t("Выберите две разные валюты, чтобы увидеть график.", "Pick two different currencies to see the chart."));
            return;
        }

        box.classList.add("loading");
        setStatus(t("Загружаем данные…", "Loading data…"));

        try {
            const latestIso = await getLatest(signal);
            if (id !== runId) return;

            const r = resolveRange(latestIso);
            if (r.error) {
                box.classList.remove("loading");
                clearChart();
                setStatus(r.error, true);
                return;
            }

            const { dates, step } = planDates(r.start, r.end);
            const failed = await loadAll(dates, signal, (done, total) => {
                if (id === runId && total > 6) setStatus(t(`Загружаем данные… ${done} из ${total}`, `Loading data… ${done} of ${total}`));
            });
            if (id !== runId) return;

            const series = buildSeries(dates, from, to);
            box.classList.remove("loading");

            if (series.length < 2) {
                clearChart();
                setStatus(
                    failed
                        ? t("Не удалось загрузить данные. Проверьте интернет и нажмите на период ещё раз.", "Couldn’t load the data. Check your connection and press the period again.")
                        : t("Для этой пары нет данных за выбранный период.", "There is no data for this pair in the chosen period."),
                    true
                );
                return;
            }

            current = { series, from, to };
            render();

            const notes = [t("Источник: ЦБ РФ.", "Source: Bank of Russia.")];
            if (step > 1) notes.push(t("Для быстрой загрузки показаны выборочные даты.", "Selected dates are shown to keep loading fast."));
            if (failed) notes.push(t("Часть дат загрузить не удалось.", "Some dates couldn’t be loaded."));
            setStatus(notes.join(" "));
        } catch (e) {
            if (e.name === "AbortError") return;
            box.classList.remove("loading");
            clearChart();
            setStatus(t("Не удалось построить график. Попробуйте ещё раз.", "Couldn’t build the chart. Please try again."), true);
        }
    }

    // ---------- рисование ----------
    function el(name, attrs = {}, text) {
        const node = document.createElementNS(NS, name);
        for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function render() {
        if (!current) return;
        const { series, from, to } = current;

        const W = Math.max(280, Math.round(box.clientWidth));
        const H = W < 520 ? 250 : 340;
        const m = { l: W < 420 ? 54 : 66, r: 18, t: 18, b: 32 };

        svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
        svg.setAttribute("width", W);
        svg.setAttribute("height", H);
        svg.replaceChildren();

        const first = series[0];
        const last = series[series.length - 1];
        const values = series.map((p) => p.v);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const pad = max === min ? Math.abs(min) * 0.02 || 1 : (max - min) * 0.14;
        const lo = min - pad;
        const hi = max + pad;

        const spanMs = last.ms - first.ms;
        const sx = (ms) => m.l + (spanMs ? (ms - first.ms) / spanMs : 0) * (W - m.l - m.r);
        const sy = (v) => m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b);

        // горизонтальная сетка и подписи значений
        const { ticks, step } = niceTicks(lo, hi, H < 300 ? 4 : 5);
        const decimals = decimalsFor(step);
        for (const v of ticks) {
            const y = sy(v);
            svg.append(
                el("line", { class: "chart-grid", x1: m.l, x2: W - m.r, y1: y, y2: y }),
                el("text", { class: "chart-axis", x: m.l - 8, y: y + 4, "text-anchor": "end" },
                    v.toLocaleString(NUM_LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }))
            );
        }

        // подписи дат
        const spanDays = spanMs / DAY;
        const labelFmt = spanDays <= 45 ? fmtDayMonth : fmtMonthYear;
        const count = W < 520 ? 3 : 5;
        for (let i = 0; i < count; i++) {
            const ms = first.ms + (spanMs * i) / (count - 1);
            const anchor = i === 0 ? "start" : i === count - 1 ? "end" : "middle";
            svg.append(el("text", { class: "chart-axis", x: sx(ms), y: H - 8, "text-anchor": anchor }, labelFmt.format(ms)));
        }

        // линия и область под ней
        const pts = series.map((p) => [sx(p.ms), sy(p.v)]);
        const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
        const baseY = H - m.b;
        svg.append(
            el("path", { class: "chart-area", d: `${line} L${pts[pts.length - 1][0].toFixed(1)} ${baseY} L${pts[0][0].toFixed(1)} ${baseY} Z` }),
            el("path", { class: "chart-line", d: line })
        );
        if (series.length <= 40) {
            for (const [x, y] of pts) svg.append(el("circle", { class: "chart-dot", cx: x, cy: y, r: 3 }));
        }

        // наведение
        const cursor = el("line", { class: "chart-cursor", y1: m.t, y2: baseY, x1: 0, x2: 0, visibility: "hidden" });
        const marker = el("circle", { class: "chart-point", r: 6, cx: 0, cy: 0, visibility: "hidden" });
        const overlay = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" });
        svg.append(cursor, marker, overlay);

        function show(clientX) {
            const rect = svg.getBoundingClientRect();
            const x = clientX - rect.left;
            let best = 0;
            let bestDist = Infinity;
            for (let i = 0; i < pts.length; i++) {
                const dist = Math.abs(pts[i][0] - x);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = i;
                }
            }
            const [px, py] = pts[best];
            cursor.setAttribute("x1", px);
            cursor.setAttribute("x2", px);
            cursor.setAttribute("visibility", "visible");
            marker.setAttribute("cx", px);
            marker.setAttribute("cy", py);
            marker.setAttribute("visibility", "visible");

            const p = series[best];
            const strong = document.createElement("strong");
            strong.textContent = `1 ${from} = ${fmt(p.v)} ${to}`;
            const date = document.createElement("span");
            date.textContent = fmtLong.format(p.ms);
            tip.replaceChildren(strong, date);
            tip.hidden = false;
            const half = tip.offsetWidth / 2;
            tip.style.left = Math.min(Math.max(px, half + 4), W - half - 4) + "px";
            tip.style.top = Math.max(4, py - tip.offsetHeight - 14) + "px";
        }

        overlay.addEventListener("pointermove", (e) => show(e.clientX));
        overlay.addEventListener("pointerdown", (e) => show(e.clientX));
        // на тач-экране подсказка остаётся после касания, мышь — убирает при уходе курсора
        overlay.addEventListener("pointerleave", (e) => {
            if (e.pointerType !== "touch") hideTip();
        });
        overlay.addEventListener("pointercancel", hideTip);

        // сводка
        const change = last.v - first.v;
        const percent = first.v ? (change / first.v) * 100 : 0;
        const minP = series[values.indexOf(min)];
        const maxP = series[values.indexOf(max)];
        const dir = Math.abs(percent) < 0.005 ? "" : percent > 0 ? "up" : "down";

        statsEl.replaceChildren(
            stat(t("Сейчас", "Latest"), `${fmt(last.v)} ${to}`, `1 ${from} · ${fmtLong.format(last.ms)}`),
            stat(t("Изменение за период", "Change over period"), fmtPercent(percent), `${change > 0 ? "+" : change < 0 ? "−" : ""}${fmt(Math.abs(change))} ${to}`, dir),
            stat(t("Минимум", "Lowest"), `${fmt(min)} ${to}`, fmtLong.format(minP.ms)),
            stat(t("Максимум", "Highest"), `${fmt(max)} ${to}`, fmtLong.format(maxP.ms))
        );

        pairEl.textContent = `1 ${from} = ${fmt(last.v)} ${to}`;
        svg.setAttribute("aria-label", t(
            `График курса ${from} к ${to}: с ${fmtLong.format(first.ms)} по ${fmtLong.format(last.ms)}, изменение ${fmtPercent(percent)}`,
            `Exchange rate chart ${from} to ${to}: ${fmtLong.format(first.ms)} – ${fmtLong.format(last.ms)}, change ${fmtPercent(percent)}`
        ));
    }

    function stat(label, value, sub, dir = "") {
        const card = document.createElement("div");
        card.className = "chart-stat";
        const l = document.createElement("div");
        l.className = "chart-stat-label";
        l.textContent = label;
        const v = document.createElement("div");
        v.className = "chart-stat-value " + dir;
        v.textContent = value;
        const s = document.createElement("div");
        s.className = "chart-stat-sub";
        s.textContent = sub;
        card.append(l, v, s);
        return card;
    }

    // ---------- управление ----------
    function setRange(value) {
        range = value;
        for (const btn of rangeBtns) btn.setAttribute("aria-pressed", String(btn.dataset.range === value));
        customBox.hidden = value !== "custom";
    }

    async function prefillCustom() {
        if (fromInput.value && toInput.value) return;
        try {
            const latestIso = await getLatest();
            toInput.value = latestIso;
            fromInput.value = toISO(toMs(latestIso) - 30 * DAY);
        } catch {
            const today = toISO(Date.now());
            toInput.value = today;
            fromInput.value = toISO(Date.now() - 30 * DAY);
        }
    }

    for (const btn of rangeBtns) {
        btn.addEventListener("click", async () => {
            setRange(btn.dataset.range);
            if (btn.dataset.range === "custom") await prefillCustom();
            run();
        });
    }

    applyBtn.addEventListener("click", run);
    for (const input of [fromInput, toInput]) {
        input.min = MIN_DATE;
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") run();
        });
    }

    document.addEventListener("pointerdown", (e) => {
        if (!box.contains(e.target)) hideTip();
    });

    let timer = null;
    document.addEventListener("konvertus:pair", () => {
        clearTimeout(timer);
        timer = setTimeout(run, 150);
    });

    let frame = 0;
    let lastWidth = 0;
    if ("ResizeObserver" in window) {
        new ResizeObserver(() => {
            const w = Math.round(box.clientWidth);
            if (!current || w === lastWidth) return;
            lastWidth = w;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(render);
        }).observe(box);
    } else {
        window.addEventListener("resize", () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(render);
        });
    }

    setRange("30");
    run();
});
