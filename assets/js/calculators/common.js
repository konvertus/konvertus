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

    // оставляет только цифры и один десятичный разделитель (пробелы и всё остальное, в том числе минус, убираются:
    // пробелы между группами цифр ставит group)
    function clean(value) {
        let out = "";
        let hasSep = false;
        for (const ch of String(value)) {
            if (ch >= "0" && ch <= "9") out += ch;
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

    // подключает поля: маска (группы цифр через пробел, лишние пробелы не вводятся), пересчёт при вводе
    function bind(box, onChange) {
        box.querySelectorAll("input[data-num]").forEach((input) => {
            let previous = "";
            input.addEventListener("input", (e) => {
                let value = input.value;
                let caret = input.selectionStart;

                // Backspace/Delete рядом с пробелом-разделителем: вместе с ним удаляем соседнюю цифру,
                // иначе пробел сразу вернулся бы на место
                if (
                    (e.inputType === "deleteContentBackward" || e.inputType === "deleteContentForward") &&
                    caret != null && value.length < previous.length &&
                    value.replace(/\s/g, "") === previous.replace(/\s/g, "")
                ) {
                    if (e.inputType === "deleteContentBackward" && caret > 0) {
                        value = value.slice(0, caret - 1) + value.slice(caret);
                        caret -= 1;
                    } else if (e.inputType === "deleteContentForward" && caret < value.length) {
                        value = value.slice(0, caret) + value.slice(caret + 1);
                    }
                }

                const formatted = group(clean(value));
                if (formatted !== input.value) {
                    // курсор остаётся после того же числа значащих символов
                    const significant = caret == null ? formatted.length : clean(value.slice(0, caret)).length;
                    let seen = 0, position = 0;
                    while (position < formatted.length && seen < significant) {
                        if (!/\s/.test(formatted[position])) seen++;
                        position++;
                    }
                    input.value = formatted;
                    input.setSelectionRange(position, position);
                }
                previous = input.value;
                onChange();
            });
            input.addEventListener("blur", () => { input.value = group(clean(input.value)); previous = input.value; });
            input.value = group(clean(input.value));
            previous = input.value;
        });
        box.querySelectorAll("select, input[type=checkbox]").forEach((el) => el.addEventListener("change", onChange));
    }

    const api = { EN, t, parse, clean, group, money, num, percent, months, plural, bind, NBSP };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    root.KonvertusCalc = api;
})(typeof window !== "undefined" ? window : globalThis);
