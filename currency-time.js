// Валюты во времени: сколько стоила бы сегодняшняя сумма в прошлом.
// Данные: готовый файл data/history.json (его раз в день обновляет tools/update_history.py),
// свежий курс дополнительно берётся у cbr-xml-daily.ru. Без библиотек.
const TIME_HISTORY_URL = document.currentScript
    ? new URL("data/history.json", document.currentScript.src).href
    : null;
const TIME_INFLATION_URL = document.currentScript
    ? new URL("data/inflation.json", document.currentScript.src).href
    : null;
const TIME_ICON_BASE = document.currentScript
    ? new URL("icons/", document.currentScript.src).href
    : "icons/";

document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("input");
    const output = document.getElementById("output");
    const selectTop = document.getElementById("select-top");
    const selectBottom = document.getElementById("select-bottom");
    const swap = document.getElementById("swap");
    const dateInput = document.getElementById("past-date");
    if (!input || !output || !selectTop || !selectBottom || !dateInput) return;

    const EN = document.documentElement.lang === "en";
    const t = (ru, en) => (EN ? en : ru);
    const NUM_LOCALE = EN ? "en-US" : "ru-RU";
    const API_URL = "https://www.cbr-xml-daily.ru/daily_json.js";
    const DAY = 86400000;
    const NS = "http://www.w3.org/2000/svg";

    const ICONS = {
        RUB: "ruble.png",
        USD: "dollar.png",
        EUR: "euro.png",
        CNY: "yuan.png",
        JPY: "yuan.png",
        GBP: "pound.png",
        CHF: "franc.png",
        TRY: "lira.png",
        KZT: "tenge.png",
        BYN: "belarusian-ruble.png",
        AED: "dirham.png"
    };

    const iconsBox = document.getElementById("currency-icons");
    const copy = document.getElementById("copy");
    const noteEl = document.getElementById("past-note");
    const statusEl = document.getElementById("time-status");
    const resultSection = document.getElementById("time-result");
    const verdictEl = document.getElementById("time-verdict");
    const statsEl = document.getElementById("time-stats");
    const box = document.getElementById("chart-box");
    const svg = document.getElementById("chart-svg");
    const tip = document.getElementById("chart-tip");
    const presetBtns = [...document.querySelectorAll(".range-btn[data-days]")];

    // ---------- данные ----------
    let codes = [];
    let table = {};
    let dates = []; // отсортированные даты ISO
    let latestIso = null;
    const firstCache = {};

    // даты считаем в UTC, чтобы не ловить сдвиги часовых поясов
    const toISO = (ms) => new Date(ms).toISOString().slice(0, 10);
    const toMs = (iso) => Date.parse(iso + "T00:00:00Z");
    const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toMs(s));

    const dateFmt = (opts) => new Intl.DateTimeFormat(NUM_LOCALE, { timeZone: "UTC", ...opts });
    const fmtLongBase = dateFmt({ day: "numeric", month: "long", year: "numeric" });
    // в русской дате убираем « г.» в конце: иначе в конце фразы получается «г..»
    const fmtLong = { format: (ms) => fmtLongBase.format(ms).replace(/\s?г\.$/, "") };
    const fmtDayMonth = dateFmt({ day: "numeric", month: "short" });
    const fmtMonthYear = dateFmt({ month: "short", year: "numeric" });
    const longDate = (iso) => fmtLong.format(toMs(iso));

    // индекс последней даты, которая не позже iso (или -1)
    function lastIndexUpTo(iso) {
        let lo = 0;
        let hi = dates.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (dates[mid] <= iso) lo = mid + 1;
            else hi = mid;
        }
        return lo - 1;
    }

    // рублей за 1 единицу валюты на дату (ЦБ не публикует курс в выходные: берём последний опубликованный)
    function rateAt(code, iso) {
        if (code === "RUB") return { rate: 1, date: iso };
        const ci = codes.indexOf(code);
        if (ci < 0) return null;
        const i = lastIndexUpTo(iso);
        if (i < 0) return null;
        const v = table[dates[i]][ci];
        return v == null ? null : { rate: v, date: dates[i] };
    }

    // с какой даты есть курс этой валюты
    function firstDateOf(code) {
        if (code === "RUB") return dates[0];
        if (code in firstCache) return firstCache[code];
        const ci = codes.indexOf(code);
        let found = null;
        if (ci >= 0) {
            for (const d of dates) {
                if (table[d][ci] != null) {
                    found = d;
                    break;
                }
            }
        }
        firstCache[code] = found;
        return found;
    }

    function minDate() {
        const a = firstDateOf(selectTop.value);
        const b = firstDateOf(selectBottom.value);
        if (!a || !b) return dates[0];
        return a > b ? a : b;
    }

    async function loadHistory() {
        if (!TIME_HISTORY_URL) throw new Error("no url");
        const response = await fetch(TIME_HISTORY_URL, { cache: "no-cache" });
        if (!response.ok) throw new Error("HTTP " + response.status);
        const data = await response.json();
        if (!data || !data.rates || !Array.isArray(data.codes)) throw new Error("bad format");
        codes = data.codes;
        table = data.rates;
        dates = Object.keys(table).sort();
        if (!dates.length) throw new Error("empty");
        latestIso = dates[dates.length - 1];
    }

    // самый свежий курс; если сайт не достучался до ЦБ, остаётся то, что в history.json
    async function loadLive() {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        try {
            const response = await fetch(API_URL, { cache: "no-store", signal: controller.signal });
            if (!response.ok) return false;
            const data = await response.json();
            if (!data || !data.Valute || !data.Date) return false;
            const iso = String(data.Date).slice(0, 10);
            if (!isIso(iso) || iso < latestIso) return false;
            const row = codes.map((code) => {
                const v = data.Valute[code];
                return v && v.Nominal ? v.Value / v.Nominal : null;
            });
            if (table[iso] && JSON.stringify(table[iso]) === JSON.stringify(row)) return false;
            if (!table[iso]) dates.push(iso);
            table[iso] = row;
            latestIso = iso;
            return true;
        } catch {
            return false;
        } finally {
            clearTimeout(timer);
        }
    }

    // ---------- инфляция (необязательно: если файла нет, карточка просто не показывается) ----------
    let cpi = null; // { regions: {RU: "RUB", ...}, series: {RU: {"2025-10": индекс, ...}} }

    async function loadInflation() {
        try {
            if (!TIME_INFLATION_URL) return;
            const response = await fetch(TIME_INFLATION_URL, { cache: "no-cache" });
            if (!response.ok) return;
            const data = await response.json();
            if (data && data.regions && data.series) cpi = data;
        } catch {
            cpi = null;
        }
    }

    // индекс цен для валюты на месяц даты; если свежих данных ещё нет, берём последний известный месяц
    function cpiAt(code, iso) {
        if (!cpi) return null;
        const region = Object.keys(cpi.regions).find((r) => cpi.regions[r] === code);
        const series = region && cpi.series[region];
        if (!series) return null;
        const months = Object.keys(series).sort();
        if (!months.length) return null;
        const month = iso.slice(0, 7);
        if (month < months[0]) return null;
        let pick = months[months.length - 1];
        for (let i = months.length - 1; i >= 0; i--) {
            if (months[i] <= month) {
                pick = months[i];
                break;
            }
        }
        return { value: series[pick], month: pick };
    }

    // ---------- числа ----------
    function fmtMoney(v) {
        const abs = Math.abs(v);
        return v.toLocaleString(NUM_LOCALE, {
            minimumFractionDigits: 2,
            maximumFractionDigits: abs >= 1 ? 2 : 6
        });
    }

    function fmtRate(v) {
        const abs = Math.abs(v);
        return v.toLocaleString(NUM_LOCALE, {
            minimumFractionDigits: 2,
            maximumFractionDigits: abs >= 1000 ? 2 : abs >= 1 ? 4 : 6
        });
    }

    function fmtPercent(p) {
        const s = Math.abs(p).toLocaleString(NUM_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return `${p > 0 ? "+" : p < 0 ? "−" : ""}${s}%`;
    }

    function readAmount() {
        const raw = String(input.value).trim().replace(/\s/g, "").replace(",", ".");
        if (raw === "") return NaN;
        const v = Number(raw);
        return Number.isFinite(v) ? v : NaN;
    }

    // «1 USD = 81,05 RUB»: показываем так, чтобы число было не меньше единицы
    function rateText(fromRate, toRate, from, to) {
        const r = fromRate / toRate;
        return r >= 1
            ? `1 ${from} = ${fmtRate(r)} ${to}`
            : `1 ${to} = ${fmtRate(1 / r)} ${from}`;
    }

    // ---------- значки валют ----------
    function badge(code) {
        const el = document.createElement("span");
        el.className = "currency-badge";
        if (ICONS[code]) {
            const img = new Image();
            img.src = TIME_ICON_BASE + ICONS[code];
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

    // ---------- расчёт ----------
    let current = null; // последний расчёт: нужен графику и обратному вводу

    function setStatus(text, isError = false) {
        statusEl.textContent = text;
        statusEl.classList.toggle("error", isError);
        statusEl.hidden = !text;
    }

    function clearResult(message, isError = false) {
        current = null;
        output.value = "";
        resultSection.hidden = true;
        noteEl.textContent = "";
        setStatus(message || "", isError);
    }

    function calculate(keepOutput = false) {
        if (!keepOutput) output.classList.remove("is-invalid");
        if (!dates.length) return;

        const from = selectTop.value;
        const to = selectBottom.value;
        const pastIso = dateInput.value;

        if (!isIso(pastIso)) {
            clearResult(t("Выберите дату в прошлом.", "Pick a date in the past."));
            return;
        }
        const min = minDate();
        if (pastIso < min) {
            clearResult(
                t(`Для этой пары курсы есть только с ${longDate(min)}.`, `Rates for this pair are only available from ${longDate(min)}.`),
                true
            );
            return;
        }
        if (pastIso > latestIso) {
            clearResult(t(`Курсы есть только до ${longDate(latestIso)}.`, `Rates are only available up to ${longDate(latestIso)}.`), true);
            return;
        }

        const amount = readAmount();
        if (!Number.isFinite(amount) || amount === 0) {
            clearResult("");
            return;
        }

        const fromNow = rateAt(from, latestIso);
        const toNow = rateAt(to, latestIso);
        const fromPast = rateAt(from, pastIso);
        const toPast = rateAt(to, pastIso);
        if (!fromNow || !toNow || !fromPast || !toPast) {
            clearResult(t("Нет курса на эту дату.", "No rate for this date."), true);
            return;
        }

        const nowValue = (amount * fromNow.rate) / toNow.rate;
        const pastValue = (amount * fromPast.rate) / toPast.rate;
        const ratio = nowValue / pastValue;

        current = { amount, from, to, pastIso, fromNow, toNow, fromPast, toPast, nowValue, pastValue, ratio };

        if (!keepOutput) output.value = Number(pastValue.toFixed(Math.abs(pastValue) >= 1 ? 2 : 6));
        noteEl.textContent = t(`Столько это было бы ${longDate(pastIso)}:`, `This is what it would have been on ${longDate(pastIso)}:`);
        setStatus("");
        renderResult();
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

    function renderResult() {
        const c = current;
        if (!c) return;
        const { amount, from, to, pastIso, fromNow, toNow, fromPast, toPast, nowValue, pastValue, ratio } = c;
        const percent = (ratio - 1) * 100;
        const dir = Math.abs(percent) < 0.005 ? "" : percent > 0 ? "up" : "down";
        const diff = nowValue - pastValue;

        resultSection.hidden = false;

        // что произошло
        if (from === to) {
            verdictEl.textContent = t("Выберите две разные валюты: иначе сумма не меняется.", "Pick two different currencies, otherwise the amount stays the same.");
        } else if (dir === "") {
            verdictEl.textContent = t(
                `Курс ${from} к ${to} почти не изменился с ${longDate(pastIso)}.`,
                `The ${from} to ${to} rate has barely changed since ${longDate(pastIso)}.`
            );
        } else {
            const abs = Math.abs(percent).toLocaleString(NUM_LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
            verdictEl.textContent = percent < 0
                ? t(
                    `Курс ${from} к ${to} снизился на ${abs}%: сегодня за ${fmtMoney(amount)} ${from} дают на ${abs}% меньше ${to}, чем ${longDate(pastIso)}.`,
                    `The ${from} to ${to} rate fell by ${abs}%: today ${fmtMoney(amount)} ${from} buys ${abs}% less ${to} than on ${longDate(pastIso)}.`
                )
                : t(
                    `Курс ${from} к ${to} вырос на ${abs}%: сегодня за ${fmtMoney(amount)} ${from} дают на ${abs}% больше ${to}, чем ${longDate(pastIso)}.`,
                    `The ${from} to ${to} rate rose by ${abs}%: today ${fmtMoney(amount)} ${from} buys ${abs}% more ${to} than on ${longDate(pastIso)}.`
                );
        }

        // курс на выходной день равен последнему опубликованному: скажем об этом
        const usedDate = from !== "RUB" ? fromPast.date : toPast.date;
        const pastSub = rateText(fromPast.rate, toPast.rate, from, to)
            + (usedDate !== pastIso ? t(` · курс ЦБ на ${longDate(usedDate)}`, ` · CBR rate of ${longDate(usedDate)}`) : "");

        statsEl.replaceChildren(
            stat(t("Сейчас", "Now"), `${fmtMoney(nowValue)} ${to}`, `${rateText(fromNow.rate, toNow.rate, from, to)} · ${longDate(latestIso)}`),
            stat(longDate(pastIso), `${fmtMoney(pastValue)} ${to}`, pastSub),
            stat(
                t("Изменение", "Change"),
                fmtPercent(percent),
                `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${fmtMoney(Math.abs(diff))} ${to}`,
                dir
            ),
            stat(
                t(`Сегодняшние ${fmtMoney(nowValue)} ${to} тогда стоили`, `Today’s ${fmtMoney(nowValue)} ${to} then cost`),
                `${fmtMoney(amount * ratio)} ${from}`,
                t(`сегодня: ${fmtMoney(amount)} ${from}`, `today: ${fmtMoney(amount)} ${from}`)
            )
        );

        // реальное изменение: курс с поправкой на то, насколько подорожали товары в обеих странах
        const cards = [];
        const aNow = cpiAt(from, latestIso);
        const aPast = cpiAt(from, pastIso);
        const bNow = cpiAt(to, latestIso);
        const bPast = cpiAt(to, pastIso);
        if (from !== to && aNow && aPast && bNow && bPast) {
            const fA = aNow.value / aPast.value;
            const fB = bNow.value / bPast.value;
            const real = ((ratio * fA) / fB - 1) * 100;
            const realDir = Math.abs(real) < 0.005 ? "" : real > 0 ? "up" : "down";
            const pct = (f) => fmtPercent((f - 1) * 100);
            const lag = [aNow.month, bNow.month].sort()[0];
            // индекс рубля строится по годовой инфляции ЦБ, поэтому он приблизительный
            const isApprox = (cpi.approx || []).some((r) => [from, to].includes(cpi.regions[r]));
            cards.push(stat(
                t("С учётом инфляции", "Inflation-adjusted"),
                fmtPercent(real),
                t(`цены: ${from} ${pct(fA)}, ${to} ${pct(fB)}`, `prices: ${from} ${pct(fA)}, ${to} ${pct(fB)}`)
                    + (lag < latestIso.slice(0, 7) ? t(` · данные до ${lag}`, ` · data up to ${lag}`) : "")
                    + (isApprox ? t(" · для рубля приближённо", " · approximate for the ruble") : ""),
                realDir
            ));
        }
        if (cards.length) statsEl.append(...cards);

        renderChart();
    }

    // ---------- график ----------
    function seriesFor(c) {
        const start = Math.max(0, lastIndexUpTo(c.pastIso));
        const out = [];
        for (let i = start; i < dates.length; i++) {
            const a = rateAt(c.from, dates[i]);
            const b = rateAt(c.to, dates[i]);
            if (!a || !b) continue;
            out.push({ ms: toMs(dates[i]), iso: dates[i], v: (c.amount * a.rate) / b.rate });
        }
        return out;
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

    function decimalsFor(step) {
        for (let d = 0; d < 8; d++) {
            const k = step * Math.pow(10, d);
            if (Math.abs(k - Math.round(k)) < 1e-6) return d;
        }
        return 8;
    }

    function el(name, attrs = {}, text) {
        const node = document.createElementNS(NS, name);
        for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function hideTip() {
        tip.hidden = true;
    }

    function renderChart() {
        const c = current;
        if (!c) return;
        const series = seriesFor(c);
        if (series.length < 2) {
            svg.replaceChildren();
            box.hidden = true;
            return;
        }
        box.hidden = false;

        const W = Math.max(280, Math.round(box.clientWidth) || 640);
        const H = W < 520 ? 250 : 340;
        const m = { l: W < 420 ? 62 : 78, r: 18, t: 18, b: 32 };

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

        const labelFmt = spanMs / DAY <= 45 ? fmtDayMonth : fmtMonthYear;
        const count = W < 520 ? 3 : 5;
        for (let i = 0; i < count; i++) {
            const ms = first.ms + (spanMs * i) / (count - 1);
            const anchor = i === 0 ? "start" : i === count - 1 ? "end" : "middle";
            svg.append(el("text", { class: "chart-axis", x: sx(ms), y: H - 8, "text-anchor": anchor }, labelFmt.format(ms)));
        }

        const pts = series.map((p) => [sx(p.ms), sy(p.v)]);
        const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
        const baseY = H - m.b;
        svg.append(
            el("path", { class: "chart-area", d: `${line} L${pts[pts.length - 1][0].toFixed(1)} ${baseY} L${pts[0][0].toFixed(1)} ${baseY} Z` }),
            el("path", { class: "chart-line", d: line })
        );

        // две отметки: «тогда» и «сейчас»
        for (const [x, y] of [pts[0], pts[pts.length - 1]]) {
            svg.append(el("circle", { class: "chart-point", r: 5, cx: x, cy: y }));
        }

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
            strong.textContent = `${fmtMoney(p.v)} ${c.to}`;
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
        overlay.addEventListener("pointerleave", (e) => {
            if (e.pointerType !== "touch") hideTip();
        });
        overlay.addEventListener("pointercancel", hideTip);

        const percent = (c.ratio - 1) * 100;
        svg.setAttribute("aria-label", t(
            `График: ${fmtMoney(c.amount)} ${c.from} в ${c.to} с ${fmtLong.format(first.ms)} по ${fmtLong.format(last.ms)}, изменение ${fmtPercent(percent)}`,
            `Chart: ${fmtMoney(c.amount)} ${c.from} in ${c.to} from ${fmtLong.format(first.ms)} to ${fmtLong.format(last.ms)}, change ${fmtPercent(percent)}`
        ));
    }

    // ---------- управление ----------
    function syncPresets() {
        const base = latestIso ? toMs(latestIso) : null;
        for (const btn of presetBtns) {
            const on = base !== null && dateFor(Number(btn.dataset.days)) === dateInput.value;
            btn.setAttribute("aria-pressed", String(on));
        }
    }

    // дата «N дней назад», но не раньше первой доступной для выбранной пары
    function dateFor(days) {
        const iso = toISO(toMs(latestIso) - days * DAY);
        const min = minDate();
        return iso < min ? min : iso;
    }

    function applyLimits() {
        const min = minDate();
        dateInput.min = min;
        dateInput.max = latestIso;
        if (isIso(dateInput.value) && dateInput.value < min) dateInput.value = min;
    }

    function update() {
        renderIcons();
        if (dates.length) applyLimits();
        syncPresets();
        calculate();
    }

    function parseTyped(text) {
        const raw = text.trim().replace(/\s/g, "").replace(",", ".");
        if (raw === "") return { empty: true };
        if (/^[-+]?\.?$|^[-+]?\d*\.?\d*e[-+]?$/i.test(raw)) return { partial: true };
        const value = Number(raw);
        return Number.isFinite(value) ? { value } : { invalid: true };
    }

    input.addEventListener("input", () => calculate());
    selectTop.addEventListener("change", update);
    selectBottom.addEventListener("change", update);
    dateInput.addEventListener("input", () => {
        syncPresets();
        calculate();
    });
    dateInput.addEventListener("change", () => {
        syncPresets();
        calculate();
    });

    swap?.addEventListener("click", () => {
        [selectTop.value, selectBottom.value] = [selectBottom.value, selectTop.value];
        update();
    });

    for (const btn of presetBtns) {
        btn.addEventListener("click", () => {
            if (!latestIso) return;
            dateInput.value = dateFor(Number(btn.dataset.days));
            syncPresets();
            calculate();
        });
    }

    // можно ввести сумму в прошлом, и поле «сейчас» пересчитается
    output.addEventListener("focus", () => {
        if (output.value && Number.isNaN(Number(String(output.value).replace(",", ".")))) output.select();
    });

    output.addEventListener("input", () => {
        const p = parseTyped(output.value);
        output.classList.toggle("is-invalid", !!p.invalid);
        if (p.empty) input.value = "";
        if (p.value === undefined || !current) return;
        const k = current.pastValue / current.amount; // сколько «тогда» стоит единица суммы
        if (!k) return;
        input.value = Number((p.value / k).toFixed(2));
        calculate(true); // пересчитываем остальное, но поле, в которое вводят, не трогаем
    });

    copy?.addEventListener("click", async () => {
        if (!output.value || Number.isNaN(Number(String(output.value).replace(",", ".")))) return;
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

    document.addEventListener("pointerdown", (e) => {
        if (!box.contains(e.target)) hideTip();
    });

    let frame = 0;
    let lastWidth = 0;
    if ("ResizeObserver" in window) {
        new ResizeObserver(() => {
            const w = Math.round(box.clientWidth);
            if (!current || w === lastWidth) return;
            lastWidth = w;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(renderChart);
        }).observe(box);
    }

    // ---------- старт ----------
    renderIcons();
    setStatus(t("Загружаем историю курсов…", "Loading rate history…"));

    Promise.all([loadHistory(), loadInflation()])
        .then(() => {
            if (!isIso(dateInput.value)) dateInput.value = dateFor(365);
            update();
            // свежий курс подгружаем отдельно, чтобы страница не ждала ЦБ
            loadLive().then((changed) => {
                if (changed) update();
            });
        })
        .catch(() => {
            setStatus(
                t("Не удалось загрузить историю курсов. Проверьте интернет и обновите страницу.",
                    "Couldn’t load the rate history. Check your connection and reload the page."),
                true
            );
        });
});
