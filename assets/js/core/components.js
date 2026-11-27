// Общие части страниц (шапка и подвал) лежат в assets/components/ и подключаются сюда.
// В странице остаётся только метка: <header data-component="header" data-root="../../"></header>
//   data-root   — путь от страницы до корня языковой папки (ru/ или en/), подставляется вместо {root}
//   data-switch — (только footer) ссылка на эту же страницу на другом языке, подставляется вместо {switch}
// Файл читается синхронно, чтобы шапка уже была на месте, когда запустятся menu.js, search.js и остальные.
(function () {
    const script = document.currentScript;
    if (!script) return;
    const base = script.src.replace(/js\/core\/components\.js.*$/, "components/");
    const lang = document.documentElement.lang === "en" ? "en" : "ru";

    document.querySelectorAll("[data-component]:not([data-loaded])").forEach((el) => {
        const name = el.getAttribute("data-component");
        try {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", base + name + "." + lang + ".html", false);
            xhr.send();
            if (xhr.status !== 200 && xhr.status !== 0) throw new Error("HTTP " + xhr.status);
            el.innerHTML = xhr.responseText
                .split("{root}").join(el.getAttribute("data-root") || "")
                .split("{switch}").join(el.getAttribute("data-switch") || "");
            el.setAttribute("data-loaded", "1");
        } catch (e) {
            console.error("Не удалось загрузить компонент " + name, e);
        }
    });

    initChartCache();

    // Быстрые графики: настройка хранится на устройстве, по умолчанию включена.
    // Выключено — график грузится как раньше (без сохранённой копии и без предзагрузки).
    function initChartCache() {
        const box = document.querySelector("[data-chart-cache]");
        if (!box || box.hasAttribute("data-ready")) return;
        box.setAttribute("data-ready", "1");

        const PREF = "konvertus-chart-fast";
        const DATA = ["konvertus-snapshot-v1", "konvertus-history-v1"];
        const toggle = box.querySelector("[data-chart-cache-toggle]");
        const clear = box.querySelector("[data-chart-cache-clear]");
        const status = box.querySelector("[data-chart-cache-status]");
        const en = lang === "en";

        const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
        const size = () => DATA.reduce((sum, k) => sum + (read(k) || "").length, 0);
        const refresh = () => {
            toggle.checked = read(PREF) !== "off";
            const kb = Math.round(size() / 1024);
            status.textContent = kb > 0
                ? (en ? "Saved: " + kb + " KB" : "Сохранено: " + kb + " КБ")
                : (en ? "No saved data" : "Нет сохранённых данных");
            clear.disabled = kb === 0;
        };

        toggle.addEventListener("change", () => {
            try { localStorage.setItem(PREF, toggle.checked ? "on" : "off"); } catch (e) { /* ничего */ }
            refresh();
        });
        clear.addEventListener("click", () => {
            DATA.forEach((k) => { try { localStorage.removeItem(k); } catch (e) { /* ничего */ } });
            refresh();
        });
        refresh();
    }
})();
