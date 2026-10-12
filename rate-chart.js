// График курса для пары валют из конвертера.
// Данные: готовый файл data/history.json (его раз в день обновляет tools/update_history.py);
// если файла нет, то архив ЦБ РФ на cbr-xml-daily.ru (по одному файлу на день). Без библиотек.
const RATE_HISTORY_URL = document.currentScript
    ? new URL("data/history.json", document.currentScript.src).href
    : null;

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
    const PARALLEL = 10;         // одновременных запросов
    const DENSE_DAYS = 14;       // для периодов не длиннее: точка на каждый календарный день
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

    // дни из data/history.json в localStorage не дублируем: файл и так кэшируется браузером
    const snapKeys = new Set();

    function saveHistory() {
        try {
            const own = {};
            for (const [k, v] of Object.entries(history)) if (!snapKeys.has(k)) own[k] = v;
            localStorage.setItem(HISTORY_KEY, JSON.stringify(own));
        } catch {
            // хранилище переполнено или запрещено — график всё равно работает
        }
    }

    // готовая история одним файлом: { first, last } либо null, если файла нет или он не загрузился.
    // Дни из файла подмешиваются в history; даты внутри его диапазона, которых в файле нет
    // (выходные, праздники), помечаются как «курса не было», и по ним не делается ни одного запроса
    let snap = null;
    let snapJob = null;
    function loadSnapshot() {
        if (!snapJob) {
            snapJob = (async () => {
                if (!RATE_HISTORY_URL) return null;
                try {
                    const response = await fetch(RATE_HISTORY_URL, { cache: "no-cache" });
                    if (!response.ok) throw new Error("HTTP " + response.status);
                    const data = await response.json();
                    const index = CODES.map((c) => data.codes.indexOf(c));
                    const dates = Object.keys(data.rates).sort();
                    if (dates.length < 2) return null;

                    for (const date of dates) {
                        const row = data.rates[date];
                        const r = { RUB: 1 };
                        CODES.forEach((c, i) => {
                            const v = index[i] >= 0 ? row[index[i]] : null;
                            if (v) r[c] = v;
                        });
                        if (history[date] === undefined || history[date] === 0) history[date] = { d: date, r };
                        snapKeys.add(date);
                    }
                    const first = dates[0];
                    const last = dates[dates.length - 1];
                    for (let ms = toMs(first); ms <= toMs(last); ms += DAY) {
                        const iso = toISO(ms);
                        if (history[iso] === undefined) {
                            history[iso] = 0;
                            snapKeys.add(iso);
                        }
                    }
                    return { first, last };
                } catch {
                    return null; // нет файла: работаем через архив ЦБ, как раньше
                }
            })();
        }
        return snapJob;
    }

    // последняя дата из курса, который уже скачал currency.js (понадобится как подсказка до ответа сервера)
    function cachedLatest() {
        try {
            const cached = JSON.parse(localStorage.getItem(RATES_CACHE_KEY));
            return cached && cached.Date ? String(cached.Date).slice(0, 10) : null;
        } catch {
            return null;
        }
    }

    // рублей за 1 единицу валюты из одного набора значений ЦБ (Value или Previous)
    function packRates(data, field) {
        const r = { RUB: 1 };
        let any = false;
        for (const code of CODES) {
            const v = data.Valute && data.Valute[code];
            if (v && v.Nominal && v[field]) {
                r[code] = Number((v[field] / v.Nominal).toPrecision(8));
                any = true;
            }
        }
        return any ? r : null;
    }

    // в каждом файле ЦБ есть курс на дату файла и предыдущий курс (с его датой PreviousDate):
    // сохраняем оба, так один запрос даёт сразу две настоящие точки графика
    function remember(data) {
        const r = packRates(data, "Value");
        if (!r) throw new Error("Unexpected response");
        const entry = { d: String(data.Date).slice(0, 10), r };
        const prevDate = data.PreviousDate && String(data.PreviousDate).slice(0, 10);
        const prevRates = prevDate && packRates(data, "Previous");
        if (prevRates && prevDate < entry.d) {
            entry.p = prevDate;
            if (history[prevDate] === undefined) history[prevDate] = { d: prevDate, r: prevRates };
        }
        return entry;
    }

    // даты, в которые курс точно не публиковался (между предыдущей и текущей датой файла ЦБ):
    // такие дни не запрашиваем, чтобы не тратить запросы на заведомые 404
    function nonPublished() {
        const out = new Set();
        for (const e of Object.values(history)) {
            if (!e || !e.p) continue;
            for (let ms = toMs(e.p) + DAY; ms < toMs(e.d); ms += DAY) out.add(toISO(ms));
        }
        return out;
    }

    // запросы не отменяем: даже если человек уже переключил период, скачанное попадёт в кэш и пригодится.
    // Одинаковые запросы из разных запусков объединяются
    const inflight = new Map();

    function fetchDay(iso) {
        if (iso in history) return Promise.resolve(history[iso]);
        if (inflight.has(iso)) return inflight.get(iso);
        const [y, m, d] = iso.split("-");
        const job = (async () => {
            const response = await fetch(`${BASE}archive/${y}/${m}/${d}/daily_json.js`);
            if (response.status === 404) {
                // курса на эту дату нет (выходной, праздник); сегодняшний день не запоминаем: файл ещё может появиться
                if (iso < toISO(Date.now())) history[iso] = 0;
                return 0;
            }
            if (!response.ok) throw new Error("HTTP " + response.status);
            const data = await response.json();
            if (!data.Valute) throw new Error("Unexpected response");
            history[iso] = remember(data);
            return history[iso];
        })().finally(() => inflight.delete(iso));
        inflight.set(iso, job);
        return job;
    }

    // последняя доступная дата курса (ЦБ публикует курс на следующий рабочий день заранее)
    let latest = null;
    let latestJob = null;
    function getLatest() {
        if (latest) return Promise.resolve(latest);
        if (!latestJob) {
            latestJob = (async () => {
                try {
                    // currency.js уже запросил тот же файл: ждём его ответ, а не качаем второй раз
                    let data = null;
                    try {
                        data = await window.konvertusLatestPromise;
                    } catch {
                        data = null;
                    }
                    if (!data || !data.Valute) {
                        const response = await fetch(LATEST_URL);
                        if (!response.ok) throw new Error("HTTP " + response.status);
                        data = await response.json();
                    }
                    if (!data.Valute) throw new Error("Unexpected response");
                    const entry = remember(data);
                    history[entry.d] = entry;
                    saveHistory();
                    latest = entry.d;
                } catch {
                    latest = cachedLatest() || toISO(weekdayBack(Date.now()));
                }
                toInput.max = fromInput.max = latest;
                return latest;
            })().finally(() => {
                latestJob = null;
            });
        }
        return latestJob;
    }

    // ---------- какие даты нужно загрузить ----------
    function makePlan(startIso, endIso) {
        const start = toMs(startIso);
        const end = toMs(endIso);
        const days = Math.round((end - start) / DAY);
        const step = Math.max(1, Math.ceil(days / MAX_POINTS));
        const skip = nonPublished();
        const set = new Set();
        const add = (ms) => {
            const iso = toISO(weekdayBack(ms));
            if (iso in history || !skip.has(iso)) set.add(iso);
        };
        // готовая история: каждый день из файла и небольшой «хвост» после него (несколько дней, на которые
        // файл мог отстать от свежего курса). Остальное, например период длиннее файла, грузим выборочно
        const snapFrom = snap ? toMs(snap.first) : Infinity;
        const snapTo = snap ? toMs(snap.last) + 15 * DAY : -Infinity;
        for (let ms = start; ms < end; ms += (ms >= snapFrom && ms < snapTo ? 1 : step) * DAY) add(ms);
        add(end);
        // dense: точка на каждый календарный день (только для коротких периодов)
        return {
            start: startIso,
            end: endIso,
            dates: [...set].sort(),
            step: snap && start >= snapFrom ? 1 : step,
            dense: days <= DENSE_DAYS,
        };
    }

    async function loadAll(dates, id, onProgress) {
        let next = 0;
        let done = 0;
        let failed = 0;
        const worker = async () => {
            while (next < dates.length && id === runId) {
                const iso = dates[next++];
                try {
                    await fetchDay(iso);
                } catch {
                    failed++;
                }
                onProgress(++done, dates.length);
            }
        };
        await Promise.all(Array.from({ length: Math.min(PARALLEL, dates.length) }, worker));
        saveHistory();
        return failed;
    }

    function buildSeries(plan, from, to) {
        // всё, что известно за период: загруженные даты, их «предыдущие» значения и последняя дата
        const found = new Map();
        const add = (e) => {
            if (e && !found.has(e.d)) found.set(e.d, e);
        };
        for (const iso of plan.dates) {
            const e = history[iso];
            add(e);
            if (e && plan.step === 1 && e.p) add(history[e.p]);
        }
        add(history[plan.end]);

        const low = toISO(weekdayBack(toMs(plan.start)));
        const points = [];
        for (const e of found.values()) {
            const a = e.r[from];
            const b = e.r[to];
            if (!a || !b || e.d > plan.end) continue;
            if (!plan.dense && e.d < low) continue;
            points.push({ d: e.d, ms: toMs(e.d), v: a / b });
        }
        points.sort((x, y) => x.ms - y.ms);
        if (!plan.dense || !points.length) return points;

        // короткий период: точка на каждый день. В выходные и праздники новый курс не публикуется,
        // действует последний установленный, поэтому такие дни повторяют предыдущее значение
        const filled = [];
        const endMs = toMs(plan.end);
        let i = 0;
        for (let ms = Math.max(toMs(plan.start), points[0].ms); ms <= endMs; ms += DAY) {
            while (i + 1 < points.length && points[i + 1].ms <= ms) i++;
            const p = points[i];
            filled.push(p.ms === ms ? p : { d: toISO(ms), ms, v: p.v, carried: true });
        }
        return filled;
    }

    // ---------- состояние ----------
    let range = "30";
    let runId = 0;
    let started = false;
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

    // собирает график из того, что есть в кэше; false, если рисовать нечего
    function present(plan, from, to, failed, quiet) {
        const series = buildSeries(plan, from, to);
        if (series.length < 2) {
            if (quiet) return false;
            box.classList.remove("loading");
            clearChart();
            setStatus(
                failed
                    ? t("Не удалось загрузить данные. Проверьте интернет и нажмите на период ещё раз.", "Couldn’t load the data. Check your connection and press the period again.")
                    : t("Для этой пары нет данных за выбранный период.", "There is no data for this pair in the chosen period."),
                true
            );
            return false;
        }

        box.classList.remove("loading");
        current = { series, from, to };
        render();

        const notes = [t("Источник: ЦБ РФ.", "Source: Bank of Russia.")];
        if (plan.step > 1) notes.push(t("Для быстрой загрузки показаны выборочные даты.", "Selected dates are shown to keep loading fast."));
        if (series.some((p) => p.carried)) notes.push(t("В выходные и праздники действует прежний курс.", "On weekends and holidays the previous rate stays in effect."));
        if (failed) notes.push(t("Часть дат загрузить не удалось.", "Some dates couldn’t be loaded."));
        setStatus(notes.join(" "));
        return true;
    }

    function presetPlan(endIso) {
        return makePlan(toISO(toMs(endIso) - Number(range) * DAY), endIso);
    }

    async function run() {
        started = true;
        const id = ++runId;

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
        const progress = (done, total) => {
            if (id === runId && total > 6 && box.classList.contains("loading")) setStatus(t(`Загружаем данные… ${done} из ${total}`, `Loading data… ${done} of ${total}`));
        };

        try {
            let plan;
            let failed = 0;

            snap = await loadSnapshot();
            if (id !== runId) return;

            if (range === "custom") {
                const latestIso = await getLatest();
                if (id !== runId) return;

                const r = resolveRange(latestIso);
                if (r.error) {
                    box.classList.remove("loading");
                    clearChart();
                    setStatus(r.error, true);
                    return;
                }
                plan = makePlan(r.start, r.end);
                failed = await loadAll(plan.dates, id, progress);
            } else {
                // не ждём ответа о последней дате: начинаем грузить сразу по подсказке (кэш или сегодняшняя дата).
                // Когда придёт точная дата, догружаем недостающее, обычно ничего
                const hint = latest || cachedLatest() || toISO(weekdayBack(Date.now()));
                const first = presetPlan(hint);

                // если всё нужное уже сохранено, график появляется мгновенно, пока идёт проверка новой даты
                if (first.dates.every((d) => d in history)) present(first, from, to, 0, true);

                let latestIso;
                [failed, latestIso] = await Promise.all([loadAll(first.dates, id, progress), getLatest()]);
                if (id !== runId) return;

                plan = latestIso === hint ? first : presetPlan(latestIso);
                const missing = plan.dates.filter((d) => !(d in history));
                if (missing.length) failed += await loadAll(missing, id, progress);
            }
            if (id !== runId) return;

            present(plan, from, to, failed, false);
        } catch {
            if (id !== runId) return;
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
            pts.forEach(([x, y], i) => svg.append(el("circle", { class: "chart-dot" + (series[i].carried ? " carried" : ""), cx: x, cy: y, r: 3 })));
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
            const nodes = [strong, date];
            if (p.carried) {
                const note = document.createElement("span");
                note.textContent = t(" · новый курс не публиковался", " · no new rate published");
                date.append(note);
            }
            tip.replaceChildren(...nodes);
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
        if (!started) return; // график ещё не запускался: возьмёт актуальную пару при старте
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
    box.classList.add("loading");

    // график ниже конвертера: пока его не видно, ничего не качаем, чтобы страница открывалась быстрее
    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries.some((e) => e.isIntersecting)) return;
                observer.disconnect();
                run();
            },
            { rootMargin: "500px 0px" }
        );
        observer.observe(section);
    } else {
        run();
    }
});
