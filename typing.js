// Анимация набора текста: поля «ввод» и «результат» конвертеров и строка поиска по сайту.
// В полях конвертера дополнительно ограничиваются символы.
//
// Настоящий <input> остаётся на месте (курсор, выделение, вставка, клавиатура), но его текст прозрачный.
// Поверх рисуются те же символы по одному, и каждый новый символ выезжает сверху (стили в typing.css).
// Чтобы отключить анимацию, уберите подключение typing.js и typing.css со страницы.
(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const valueProp = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    const setRaw = (field, text) => valueProp.set.call(field, text);

    // десятичный разделитель в числовых полях: запятая на русских страницах, точка на английских
    const DECIMAL = document.documentElement.lang === "en" ? "." : ",";
    const NUMERIC_TEXT = /^-?\d*[.,]?\d*(e[-+]?\d*)?$/i;
    // скрипты конвертера считают с точкой, а человек видит разделитель своего языка
    const toDisplay = (text) => (typeof text === "string" && NUMERIC_TEXT.test(text) ? text.replace(/[.,]/, DECIMAL) : text);
    const toCanonical = (text) => text.replace(",", ".");

    const rules = new Map(); // поле → функция, оставляющая в тексте только допустимые символы
    const layers = new Map(); // поле → слой с анимацией

    // Поле, в которое сейчас вводит пользователь. Пока идёт это событие, скрипт конвертера
    // пересчитывает второе поле, и его новые символы тоже выезжают сверху
    let typingIn = null;

    // ---------- какие символы можно вводить в поля конвертера ----------
    const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

    // число: цифры, один десятичный разделитель (можно набрать и точку, и запятую; остаётся
    // разделитель языка страницы), «-» в начале,
    // в поле ввода ещё экспонента (1e5), как раньше у <input type="number">
    function cleanNumber(text, allowExponent) {
        let out = "";
        let hasSeparator = false;
        let hasExponent = false;
        for (const ch of text) {
            if (ch >= "0" && ch <= "9") {
                out += ch;
            } else if ((ch === "." || ch === ",") && !hasSeparator && !hasExponent) {
                out += DECIMAL;
                hasSeparator = true;
            } else if (ch === "-" && (out === "" || (hasExponent && /e$/i.test(out)))) {
                out += ch;
            } else if (ch === "+" && hasExponent && /e$/i.test(out)) {
                out += ch;
            } else if (allowExponent && (ch === "e" || ch === "E") && !hasExponent && /\d$/.test(out)) {
                out += ch;
                hasExponent = true;
            }
        }
        return out;
    }

    // цифры системы счисления: двоичная только 0 и 1, шестнадцатеричная 0-9 и A-F
    function cleanDigits(text, base) {
        const allowed = DIGITS.slice(0, base);
        let out = "";
        for (const ch of text) {
            const low = ch.toLowerCase();
            if (ch === "-" && out === "") out = "-";
            else if (allowed.includes(low)) out += base > 10 ? low.toUpperCase() : low;
        }
        return out;
    }

    // ---------- слой с анимированными символами ----------
    // options.numeric: значение показывается с разделителем языка страницы;
    // options.canonical: скриптам при чтении отдаётся число с точкой (для поля ввода)
    function createLayer(field, options = {}) {
        const rawGet = () => valueProp.get.call(field);
        const wrap = document.createElement("div");
        wrap.className = "typing-field";
        field.replaceWith(wrap);

        const layer = document.createElement("div");
        layer.className = "typing-layer";
        layer.setAttribute("aria-hidden", "true");
        const clip = document.createElement("div");
        clip.className = "typing-clip";
        const inner = document.createElement("div");
        inner.className = "typing-inner";
        clip.append(inner);
        layer.append(clip);

        wrap.append(field, layer);
        field.classList.add("typing-input");

        let chars = []; // по одному элементу на каждый символ (код-пойнт) текста
        let text = "";

        // шрифт и отступы слоя берём у самого поля, чтобы символы совпали с курсором
        function syncMetrics() {
            const cs = getComputedStyle(field);
            layer.style.fontFamily = cs.fontFamily;
            layer.style.fontSize = cs.fontSize;
            layer.style.fontWeight = cs.fontWeight;
            layer.style.fontStyle = cs.fontStyle;
            layer.style.letterSpacing = cs.letterSpacing;
            // слой лежит внутри рамки поля, текст обрезается по границе внутренних отступов
            const top = parseFloat(cs.borderTopWidth);
            const bottom = parseFloat(cs.borderBottomWidth);
            const left = parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
            const right = parseFloat(cs.borderRightWidth) + parseFloat(cs.paddingRight);
            layer.style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
        }

        // длинное число прокручивается внутри поля: слой должен ехать за ним
        let lastScroll = -1;
        function syncScroll() {
            if (field.scrollLeft === lastScroll) return;
            lastScroll = field.scrollLeft;
            inner.style.transform = `translateX(${-lastScroll}px)`;
        }

        function render(animate) {
            const next = rawGet();
            if (next !== text) {
                // общее начало и конец остаются как есть, анимируются только вставленные символы
                const before = Array.from(text);
                const after = Array.from(next);
                const max = Math.min(before.length, after.length);
                let head = 0;
                while (head < max && before[head] === after[head]) head++;
                let tail = 0;
                while (tail < max - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;

                for (const old of chars.splice(head, before.length - head - tail)) old.remove();

                const added = [];
                for (let i = head; i < after.length - tail; i++) {
                    const span = document.createElement("span");
                    span.className = "typing-char";
                    span.textContent = after[i];
                    if (animate && !reduceMotion.matches) span.classList.add("typing-in");
                    added.push(span);
                }
                const anchor = chars[head];
                if (anchor) anchor.before(...added);
                else inner.append(...added);
                chars.splice(head, 0, ...added);
                text = next;
            }
            syncScroll();
            requestAnimationFrame(syncScroll);
        }

        let frame = 0;
        const follow = () => {
            syncScroll();
            frame = requestAnimationFrame(follow);
        };
        field.addEventListener("focus", () => {
            syncMetrics();
            if (!frame) follow();
        });
        field.addEventListener("blur", () => {
            cancelAnimationFrame(frame);
            frame = 0;
        });
        field.addEventListener("scroll", syncScroll);
        if ("ResizeObserver" in window) new ResizeObserver(syncMetrics).observe(field);

        // значение, которое меняют скрипты: перерисовываем, а анимируем только если в это время
        // пользователь вводит в соседнее поле конвертера (обратный пересчёт)
        Object.defineProperty(field, "value", {
            configurable: true,
            enumerable: true,
            get() {
                const raw = valueProp.get.call(this);
                return options.canonical ? toCanonical(raw) : raw;
            },
            set(v) {
                valueProp.set.call(this, options.numeric ? toDisplay(String(v)) : v);
                render(typingIn !== null && typingIn !== field);
            }
        });

        if (options.numeric) valueProp.set.call(field, toDisplay(rawGet()));
        syncMetrics();
        render(false);
        layers.set(field, { render });
    }

    // Сначала очищаем набранное (до обработчиков конвертера), потом перерисовываем:
    // слушатель на document в фазе перехвата срабатывает раньше слушателей самих полей
    document.addEventListener(
        "input",
        (e) => {
            const field = e.target;
            const layer = layers.get(field);
            if (!layer || e.isComposing) return;
            typingIn = field;

            const rule = rules.get(field);
            if (rule) {
                const value = valueProp.get.call(field);
                const cleaned = rule(value);
                if (cleaned !== value) {
                    const caret = field.selectionStart;
                    const position = caret == null ? cleaned.length : rule(value.slice(0, caret)).length;
                    setRaw(field, cleaned);
                    field.setSelectionRange(position, position);
                }
            }
            layer.render(true);
        },
        true
    );
    // событие дошло до конца (все обработчики отработали)
    document.addEventListener("input", () => {
        typingIn = null;
    });

    // ---------- поля конвертера ----------
    function initConverter() {
        const input = document.getElementById("input");
        const output = document.getElementById("output");
        if (!input || !output) return;

        // странички систем счисления: в результате допустимы только цифры выбранной системы
        const selectBottom = document.getElementById("select-bottom");
        if (document.querySelector('script[src*="numbers.js"]')) {
            rules.set(output, (text) => cleanDigits(text, Number(selectBottom.value)));
        } else {
            // у числовых конвертеров поле ввода раньше было type="number": делаем его текстовым,
            // чтобы видеть и анимировать всё, что набрано (даже незаконченное число вроде «-» или «1.»)
            if (input.type === "number") {
                input.type = "text";
                input.inputMode = "decimal";
            }
            rules.set(input, (text) => cleanNumber(text, true));
            rules.set(output, (text) => cleanNumber(text, false));
        }
        const numeric = !document.querySelector('script[src*="numbers.js"]');
        createLayer(input, { numeric, canonical: numeric });
        createLayer(output, { numeric });
    }

    // ---------- строка поиска по сайту ----------
    function initSearch() {
        const field = document.querySelector(".site-search-field input");
        if (field && !layers.has(field)) createLayer(field);
    }

    document.addEventListener("DOMContentLoaded", () => {
        initConverter();
        // окно поиска создаёт search.js, после того как отработают все обработчики загрузки страницы
        setTimeout(initSearch, 0);
    });
})();
