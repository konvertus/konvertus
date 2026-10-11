// Поиск по всему сайту: кнопка с лупой в шапке, окно поиска по Ctrl/⌘ + K или «/».
// Данные берутся из search-index.js, туда же добавляются новые страницы.
const SEARCH_ROOT = new URL("./", document.currentScript.src).href;

document.addEventListener("DOMContentLoaded", () => {
    const root = document.documentElement;
    const EN = root.lang === "en";
    const t = (ru, en) => (EN ? en : ru);

    // если подтянулся старый кэшированный CSS, поиск не рисуем, чтобы не ломать страницу
    if (getComputedStyle(root).getPropertyValue("--konvertus-css").trim() !== "4") return;

    const DATA = (window.KONVERTUS_SEARCH || []).filter((e) => e.l === (EN ? "en" : "ru"));
    if (!DATA.length) return;

    const NS = "http://www.w3.org/2000/svg";
    const svg = (cls, d) => {
        const s = document.createElementNS(NS, "svg");
        s.setAttribute("viewBox", "0 0 24 24");
        s.setAttribute("aria-hidden", "true");
        s.classList.add("tool-svg", cls);
        const p = document.createElementNS(NS, "path");
        p.setAttribute("d", d);
        s.append(p);
        return s;
    };
    const MAGNIFIER = "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4";
    const ARROW = "M5 12h14M13 6l6 6-6 6";

    // нормализация и грубое «обрезание окончаний»: «рубли» и «рубль» находят друг друга
    const norm = (s) => s.toLowerCase().replaceAll("ё", "е");
    const stem = (w) => (w.length >= 5 ? w.slice(0, -2) : w);
    const startsWord = (text, q) => (" " + text).includes(" " + q);

    const entries = DATA.map((e) => ({ ...e, title: norm(e.t), rest: norm(e.g + " " + (e.k || "")) }));

    function find(query) {
        const qs = norm(query).split(/\s+/).filter(Boolean).map(stem);
        if (!qs.length) return entries.filter((e) => e.p);
        return entries
            .map((e, i) => {
                let score = 0;
                for (const q of qs) {
                    if (startsWord(e.title, q)) score += e.title.startsWith(q) ? 12 : 10;
                    else if (startsWord(e.rest, q)) score += 3;
                    else return null; // нужно совпадение по каждому слову запроса
                }
                return { e, score, i };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score || a.i - b.i)
            .slice(0, 8)
            .map((r) => r.e);
    }

    // разметка окна
    const wrap = document.createElement("div");
    wrap.className = "site-search";
    wrap.innerHTML = `
        <div class="site-search-backdrop"></div>
        <div class="site-search-dialog" role="dialog" aria-modal="true">
            <div class="site-search-field"></div>
            <div class="site-search-results" role="listbox" id="site-search-results"></div>
            <div class="site-search-hint"></div>
        </div>`;
    const dialog = wrap.querySelector(".site-search-dialog");
    const field = wrap.querySelector(".site-search-field");
    const results = wrap.querySelector(".site-search-results");
    const hint = wrap.querySelector(".site-search-hint");
    dialog.setAttribute("aria-label", t("Поиск по сайту", "Site search"));

    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = t("Что конвертируем? Например: футы, usd, гигабайты", "What to convert? Try: feet, usd, gigabytes");
    input.setAttribute("aria-label", t("Поиск по сайту", "Site search"));
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-controls", "site-search-results");
    input.setAttribute("aria-expanded", "true");
    const esc = document.createElement("kbd");
    esc.textContent = "Esc";
    field.append(svg("search-lens", MAGNIFIER), input, esc);

    hint.innerHTML = EN
        ? "<span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>Enter</kbd> open</span>"
        : "<span><kbd>↑</kbd><kbd>↓</kbd> выбор</span><span><kbd>Enter</kbd> открыть</span>";

    document.body.append(wrap);

    let links = [];
    let active = -1;

    function setActive(i, scroll = true) {
        links.forEach((a) => a.classList.remove("is-active"));
        active = i;
        if (i < 0 || !links[i]) {
            input.removeAttribute("aria-activedescendant");
            return;
        }
        links[i].classList.add("is-active");
        input.setAttribute("aria-activedescendant", links[i].id);
        if (scroll) links[i].scrollIntoView({ block: "nearest" });
    }

    function render() {
        const q = input.value.trim();
        const found = find(q);
        results.replaceChildren();
        links = [];

        if (!q) {
            const h = document.createElement("div");
            h.className = "site-search-label";
            h.textContent = t("Популярное", "Popular");
            results.append(h);
        }

        if (!found.length) {
            const none = document.createElement("div");
            none.className = "site-search-empty";
            none.textContent = t("Ничего не найдено. Попробуйте «рубли» или «футы»", "Nothing found. Try “rubles” or “feet”");
            results.append(none);
        }

        found.forEach((e, i) => {
            const a = document.createElement("a");
            a.className = "site-search-item";
            a.id = "site-search-item-" + i;
            a.setAttribute("role", "option");
            a.href = new URL(e.u, SEARCH_ROOT).href;
            a.style.setProperty("--i", i);
            const title = document.createElement("span");
            title.className = "site-search-title";
            title.textContent = e.t;
            const group = document.createElement("span");
            group.className = "site-search-group";
            group.textContent = e.g;
            a.append(title, group, svg("site-search-arrow", ARROW));
            a.addEventListener("pointermove", () => {
                if (active !== i) setActive(i, false);
            });
            results.append(a);
            links.push(a);
        });
        setActive(links.length ? 0 : -1, false);
    }

    let opener = null;

    function open() {
        if (wrap.classList.contains("open")) return;
        opener = document.activeElement;
        input.value = "";
        render();
        wrap.classList.add("open");
        document.body.classList.add("search-lock");
        // небольшая задержка, чтобы фокус не мешал началу анимации
        setTimeout(() => input.focus({ preventScroll: true }), 30);
    }

    function close() {
        if (!wrap.classList.contains("open")) return;
        wrap.classList.remove("open");
        document.body.classList.remove("search-lock");
        input.blur();
        if (opener && opener.focus) opener.focus({ preventScroll: true });
    }

    input.addEventListener("input", render);

    wrap.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!links.length) return;
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((active + step + links.length) % links.length);
        } else if (e.key === "Enter" && links[active]) {
            e.preventDefault();
            links[active].click();
        } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close();
        } else if (e.key === "Tab") {
            e.preventDefault(); // фокус остаётся в окне, выбирать удобнее стрелками
        }
    });

    wrap.querySelector(".site-search-backdrop").addEventListener("click", close);
    // переход на ту же страницу (например, «Контакты») не перезагружает её, поэтому закрываем окно сами
    results.addEventListener("click", (e) => {
        if (e.target.closest("a")) setTimeout(close, 0);
    });

    // кнопка в шапке
    const tools = window.konvertusTools?.();
    if (tools) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tool-btn search-toggle";
        btn.setAttribute("aria-label", t("Поиск по сайту", "Site search"));
        btn.title = t("Поиск (Ctrl+K)", "Search (Ctrl+K)");
        btn.setAttribute("aria-haspopup", "dialog");
        btn.append(svg("icon-search", MAGNIFIER));
        btn.addEventListener("click", open);
        tools.prepend(btn);
    }

    // горячие клавиши: Ctrl/⌘ + K и «/» (когда фокус не в поле ввода)
    document.addEventListener("keydown", (e) => {
        const typing = e.target.closest?.("input, textarea, select, [contenteditable]");
        if ((e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey)) {
            e.preventDefault();
            wrap.classList.contains("open") ? close() : open();
        }
    });
});
