// Тёмная тема. Подключается в <head>, чтобы тема применялась до отрисовки страницы (без «вспышки»).
// Выбор хранится в localStorage; пока человек сам ничего не выбрал, следуем настройке системы.
(() => {
    const KEY = "konvertus-theme";
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const EN = root.lang === "en";

    const stored = () => {
        try {
            return localStorage.getItem(KEY);
        } catch {
            return null;
        }
    };

    function apply(theme) {
        root.dataset.theme = theme;
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#5a6b55" : "#7a8c77");
    }

    apply(stored() || (media.matches ? "dark" : "light"));

    media.addEventListener("change", (e) => {
        if (!stored()) apply(e.matches ? "dark" : "light");
    });

    // общий контейнер кнопок в шапке (поиск и тема); search.js использует его же
    window.konvertusTools = () => {
        const header = document.querySelector(".header");
        if (!header) return null;
        let tools = header.querySelector(".header-tools");
        if (!tools) {
            tools = document.createElement("div");
            tools.className = "header-tools";
            header.append(tools);
            header.classList.add("has-tools");
        }
        return tools;
    };

    document.addEventListener("DOMContentLoaded", () => {
        // если подтянулся старый кэшированный CSS, кнопку не рисуем, чтобы не ломать шапку
        if (getComputedStyle(root).getPropertyValue("--konvertus-css").trim() !== "4") return;
        const tools = window.konvertusTools();
        if (!tools) return;

        const NS = "http://www.w3.org/2000/svg";
        const svg = (cls, paths) => {
            const s = document.createElementNS(NS, "svg");
            s.setAttribute("viewBox", "0 0 24 24");
            s.setAttribute("aria-hidden", "true");
            s.classList.add("tool-svg", cls);
            for (const d of paths) {
                const p = document.createElementNS(NS, "path");
                p.setAttribute("d", d);
                s.append(p);
            }
            return s;
        };

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tool-btn theme-toggle";
        btn.append(
            svg("icon-moon", ["M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"]),
            svg("icon-sun", [
                "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
                "M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"
            ])
        );

        const label = () => {
            const dark = root.dataset.theme === "dark";
            const text = dark ? (EN ? "Switch to light theme" : "Включить светлую тему") : EN ? "Switch to dark theme" : "Включить тёмную тему";
            btn.setAttribute("aria-label", text);
            btn.title = text;
            btn.setAttribute("aria-pressed", String(dark));
        };
        label();

        btn.addEventListener("click", () => {
            // на время переключения плавно меняем цвета
            root.classList.add("theme-anim");
            const next = root.dataset.theme === "dark" ? "light" : "dark";
            apply(next);
            try {
                localStorage.setItem(KEY, next);
            } catch {}
            label();
            setTimeout(() => root.classList.remove("theme-anim"), 450);
        });

        media.addEventListener("change", label);
        tools.append(btn);
    });
})();
