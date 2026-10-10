// Кастомные выпадающие списки вместо стандартных <select>.
// Работает поверх обычного <select>: он остаётся в DOM (скрытый), поэтому converter.js, currency.js,
// temperature.js и numbers.js ничего не замечают: читают select.value и слушают событие "change".

// папка с иконками лежит рядом со скриптом, путь верный и для русской, и для английской версии
const SELECT_ICON_BASE = new URL("icons/", document.currentScript.src).href;

document.addEventListener("DOMContentLoaded", () => {
    const EN = document.documentElement.lang === "en";
    const t = (ru, en) => (EN ? en : ru);
    const NS = "http://www.w3.org/2000/svg";

    // значки валют (те же файлы, что и на табло курсов)
    const CURRENCY_ICONS = {
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

    // на страницах валют есть табло курсов — по нему понимаем, что списки с валютами
    const isCurrencyPage = !!document.getElementById("rates-board");

    const canHover = window.matchMedia("(hover: hover)").matches;
    const instances = [];
    let uid = 0;

    function icon(path, className) {
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        svg.classList.add("cselect-svg", className);
        const p = document.createElementNS(NS, "path");
        p.setAttribute("d", path);
        svg.append(p);
        return svg;
    }

    const chevron = () => icon("M6 9.5l6 6 6-6", "cselect-chevron");
    const check = () => icon("M5 12.5l4.5 4.5L19 7", "cselect-check");
    const magnifier = () => icon("M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4", "cselect-search-icon");

    function currencyBadge(code) {
        const el = document.createElement("span");
        el.className = "currency-badge";
        if (CURRENCY_ICONS[code]) {
            const img = new Image();
            img.src = SELECT_ICON_BASE + CURRENCY_ICONS[code];
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

    function build(select) {
        const id = "cselect-" + ++uid;
        const currency = isCurrencyPage;
        const options = Array.from(select.options);

        const root = document.createElement("div");
        root.className = "cselect" + (currency ? " cselect-currency" : "");

        // кнопка, которую видно в закрытом состоянии
        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "cselect-trigger";
        trigger.setAttribute("aria-haspopup", "listbox");
        trigger.setAttribute("aria-expanded", "false");
        trigger.setAttribute("aria-controls", id + "-list");

        const triggerIcon = document.createElement("span");
        triggerIcon.className = "cselect-trigger-icon";
        const triggerName = document.createElement("span");
        triggerName.className = "cselect-name";
        const triggerCode = document.createElement("span");
        triggerCode.className = "cselect-code";
        if (currency) trigger.append(triggerIcon);
        trigger.append(triggerName);
        if (currency) trigger.append(triggerCode);
        trigger.append(chevron());

        // выпадающая панель (её и анимируем)
        const panel = document.createElement("div");
        panel.className = "cselect-panel";

        let search = null;
        if (currency) {
            const wrap = document.createElement("div");
            wrap.className = "cselect-search";
            search = document.createElement("input");
            search.type = "text";
            search.autocomplete = "off";
            search.spellcheck = false;
            search.placeholder = t("Найти валюту", "Search currency");
            search.setAttribute("aria-label", search.placeholder);
            search.setAttribute("role", "combobox");
            search.setAttribute("aria-controls", id + "-list");
            search.setAttribute("aria-expanded", "false");
            wrap.append(magnifier(), search);
            panel.append(wrap);
        }

        const list = document.createElement("ul");
        list.className = "cselect-list";
        list.id = id + "-list";
        list.setAttribute("role", "listbox");

        const empty = document.createElement("li");
        empty.className = "cselect-empty";
        empty.textContent = t("Ничего не найдено", "Nothing found");
        empty.hidden = true;

        const items = options.map((opt, i) => {
            const li = document.createElement("li");
            li.className = "cselect-option";
            li.id = `${id}-opt-${i}`;
            li.setAttribute("role", "option");
            li.style.setProperty("--i", i);
            li.dataset.value = opt.value;

            if (currency) li.append(currencyBadge(opt.value));

            const name = document.createElement("span");
            name.className = "cselect-name";
            name.textContent = opt.textContent;
            li.append(name);

            if (currency) {
                const code = document.createElement("span");
                code.className = "cselect-code";
                code.textContent = opt.value;
                li.append(code);
            }

            li.append(check());
            list.append(li);
            return li;
        });
        list.append(empty);
        panel.append(list);
        root.append(trigger, panel);

        // прячем настоящий select, но оставляем в DOM
        select.classList.add("cselect-native");
        select.tabIndex = -1;
        select.setAttribute("aria-hidden", "true");
        select.before(root);

        let active = -1;

        const visible = () => items.filter((li) => !li.hidden);

        function setActive(li, scroll = true) {
            items.forEach((el) => el.classList.remove("is-active"));
            const focusEl = search && document.activeElement === search ? search : trigger;
            if (!li) {
                active = -1;
                focusEl.removeAttribute("aria-activedescendant");
                search?.removeAttribute("aria-activedescendant");
                return;
            }
            active = items.indexOf(li);
            li.classList.add("is-active");
            focusEl.setAttribute("aria-activedescendant", li.id);
            if (scroll) li.scrollIntoView({ block: "nearest" });
        }

        // перерисовываем кнопку и отметки по текущему значению select
        function sync() {
            const opt = select.options[select.selectedIndex];
            if (!opt) return;
            triggerName.textContent = opt.textContent;
            if (currency) {
                triggerCode.textContent = opt.value;
                triggerIcon.replaceChildren(currencyBadge(opt.value));
            }
            items.forEach((li, i) => {
                const selected = options[i] === opt;
                li.classList.toggle("is-selected", selected);
                li.setAttribute("aria-selected", String(selected));
            });
        }

        function open() {
            if (root.classList.contains("open")) return;
            instances.forEach((other) => other !== api && other.close());

            if (search) search.value = "";
            filter("");

            // если снизу не хватает места, а сверху больше, открываем вверх
            root.classList.remove("up");
            const rect = trigger.getBoundingClientRect();
            const height = Math.min(panel.scrollHeight, 340);
            const below = window.innerHeight - rect.bottom;
            if (below < height + 16 && rect.top > below) root.classList.add("up");

            root.classList.add("open");
            trigger.setAttribute("aria-expanded", "true");
            search?.setAttribute("aria-expanded", "true");

            const selected = items.find((li) => li.classList.contains("is-selected"));
            setActive(selected || visible()[0], false);
            if (selected) list.scrollTop = Math.max(0, selected.offsetTop - list.clientHeight / 2 + selected.offsetHeight / 2);

            // на телефоне поиск не фокусируем, чтобы не выскакивала клавиатура
            if (search && canHover) setTimeout(() => search.focus({ preventScroll: true }), 0);
        }

        function close(returnFocus = false) {
            if (!root.classList.contains("open")) return;
            root.classList.remove("open");
            trigger.setAttribute("aria-expanded", "false");
            search?.setAttribute("aria-expanded", "false");
            setActive(null);
            if (returnFocus) trigger.focus({ preventScroll: true });
        }

        function choose(li) {
            const changed = select.value !== li.dataset.value;
            select.value = li.dataset.value;
            close(true);
            if (changed) {
                select.dispatchEvent(new Event("change", { bubbles: true }));
            }
        }

        function filter(query) {
            const q = query.trim().toLowerCase();
            let shown = 0;
            items.forEach((li, i) => {
                const text = (options[i].textContent + " " + options[i].value).toLowerCase();
                li.hidden = q !== "" && !text.includes(q);
                if (!li.hidden) shown++;
            });
            empty.hidden = shown > 0;
            const first = visible()[0];
            setActive(first || null, false);
            list.scrollTop = 0;
        }

        function move(step) {
            const v = visible();
            if (!v.length) return;
            const current = v.indexOf(items[active]);
            const next = current === -1 ? (step > 0 ? 0 : v.length - 1) : (current + step + v.length) % v.length;
            setActive(v[next]);
        }

        // быстрый выбор по первой букве (для списков без поиска)
        let buffer = "";
        let bufferTimer;
        function typeahead(char) {
            buffer += char.toLowerCase();
            clearTimeout(bufferTimer);
            bufferTimer = setTimeout(() => (buffer = ""), 700);
            const v = visible();
            const start = Math.max(0, v.indexOf(items[active]) + (buffer.length === 1 ? 1 : 0));
            const ordered = [...v.slice(start), ...v.slice(0, start)];
            const hit = ordered.find((li) => li.textContent.toLowerCase().startsWith(buffer));
            if (hit) setActive(hit);
        }

        trigger.addEventListener("click", () => {
            root.classList.contains("open") ? close() : open();
        });

        search?.addEventListener("input", () => filter(search.value));

        items.forEach((li) => {
            li.addEventListener("click", () => choose(li));
            li.addEventListener("pointermove", () => {
                if (!li.classList.contains("is-active")) setActive(li, false);
            });
        });

        // клавиатура: работает и с кнопки, и из поля поиска
        root.addEventListener("keydown", (e) => {
            const isOpen = root.classList.contains("open");

            switch (e.key) {
                case "ArrowDown":
                case "ArrowUp":
                    e.preventDefault();
                    if (!isOpen) open();
                    else move(e.key === "ArrowDown" ? 1 : -1);
                    break;
                case "Home":
                case "End":
                    if (!isOpen || (search && e.target === search)) return;
                    e.preventDefault();
                    setActive(e.key === "Home" ? visible()[0] : visible().at(-1));
                    break;
                case "Enter":
                    if (isOpen && items[active] && !items[active].hidden) {
                        e.preventDefault();
                        choose(items[active]);
                    }
                    break;
                case " ":
                    if (isOpen && e.target !== search && items[active]) {
                        e.preventDefault();
                        choose(items[active]);
                    }
                    break;
                case "Escape":
                    if (isOpen) {
                        e.preventDefault();
                        e.stopPropagation();
                        close(true);
                    }
                    break;
                case "Tab":
                    close();
                    break;
                default:
                    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.target === trigger) {
                        if (search) {
                            // печать на закрытой кнопке открывает список и сразу ищет
                            e.preventDefault();
                            open();
                            search.value = e.key;
                            filter(e.key);
                            search.focus({ preventScroll: true });
                        } else {
                            e.preventDefault();
                            if (!isOpen) open();
                            typeahead(e.key);
                        }
                    }
            }
        });

        // swap-кнопка в скриптах конвертеров меняет select.value напрямую,
        // поэтому подхватываем присваивание и обновляем вид
        const nativeValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
        Object.defineProperty(select, "value", {
            configurable: true,
            get() {
                return nativeValue.get.call(this);
            },
            set(v) {
                nativeValue.set.call(this, v);
                sync();
                // небольшой «щелчок» на кнопке, чтобы смена была заметна
                trigger.classList.remove("pop");
                void trigger.offsetWidth;
                trigger.classList.add("pop");
            }
        });

        select.addEventListener("change", sync);

        const api = { close };
        instances.push(api);
        sync();
    }

    document.querySelectorAll(".converter-box select").forEach(build);

    // клик или тап вне списка закрывает его
    document.addEventListener("pointerdown", (e) => {
        document.querySelectorAll(".cselect.open").forEach((root) => {
            if (!root.contains(e.target)) root.querySelector(".cselect-trigger").click();
        });
    });
});
