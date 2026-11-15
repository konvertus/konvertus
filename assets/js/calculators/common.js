// Общие функции калькуляторов: разбор и форматирование чисел, поля ввода без минуса.
(function (root) {
    const EN = typeof document !== "undefined" && document.documentElement.lang === "en";
    const LOCALE = EN ? "en-US" : "ru-RU";
    const t = (ru, en) => (EN ? en : ru);
    const NBSP = "\u00a0";

    // "8 000 000,5" → 8000000.5; пустая или некорректная строка → NaN. Минус не принимается
    function parse(value) {
        const s = String(value).replace(/[\s\u00a0]/g, "").replace(",", ".");
        if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return NaN;
        return Number(s);
    }

    // оставляет цифры, пробелы и один десятичный разделитель (всё остальное, в том числе минус, убирается)
    function clean(value) {
        let out = "";
        let hasSep = false;
        for (const ch of String(value)) {
            if ((ch >= "0" && ch <= "9") || /\s/.test(ch)) out += ch;
            else if ((ch === "." || ch === ",") && !hasSep) { out += ch; hasSep = true; }
        }
        return out;
    }

    // 8000000 → "8 000 000"
    function group(value) {
        const m = String(value).replace(/\s/g, "").match(/^(\d*)([.,]?)(\d*)$/);
        if (!m) return value;
        const int = m[1].replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
        return int + m[2] + m[3];
    }

    const money = (v) => Math.round(v).toLocaleString(LOCALE, { maximumFractionDigits: 0 }) + NBSP + "₽";
    const num = (v, d = 2) => v.toLocaleString(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: d });
    const percent = (v, d = 2) => num(v, d) + NBSP + "%";

    function months(n) {
        const y = Math.floor(n / 12);
        const m = n % 12;
        const parts = [];
        if (y) parts.push(EN ? `${y} ${y === 1 ? "year" : "years"}` : `${y} ${plural(y, "год", "года", "лет")}`);
        if (m) parts.push(EN ? `${m} ${m === 1 ? "month" : "months"}` : `${m} ${plural(m, "месяц", "месяца", "месяцев")}`);
        return parts.join(" ") || (EN ? "0 months" : "0 месяцев");
    }
    function plural(n, one, few, many) {
        const a = Math.abs(n) % 100;
        const b = a % 10;
        if (a > 10 && a < 20) return many;
        if (b > 1 && b < 5) return few;
        return b === 1 ? one : many;
    }

    // подключает поля: фильтр ввода, форматирование при выходе из поля и пересчёт
    function bind(box, onChange) {
        box.querySelectorAll("input[data-num]").forEach((input) => {
            input.addEventListener("input", () => {
                const cleaned = clean(input.value);
                if (cleaned !== input.value) input.value = cleaned;
                onChange();
            });
            input.addEventListener("blur", () => { input.value = group(clean(input.value)); });
            input.value = group(clean(input.value));
        });
        box.querySelectorAll("select, input[type=checkbox]").forEach((el) => el.addEventListener("change", onChange));
    }

    const api = { EN, t, parse, clean, group, money, num, percent, months, plural, bind, NBSP };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    root.KonvertusCalc = api;
})(typeof window !== "undefined" ? window : globalThis);
