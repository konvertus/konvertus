// Предзагрузка data/history.json для графиков курсов. Отключается переключателем «Быстрые графики» в подвале.
(function () {
    try {
        if (localStorage.getItem("konvertus-chart-fast") === "off") return;
    } catch (e) { /* хранилище недоступно: оставляем предзагрузку включённой */ }
    const script = document.currentScript;
    if (!script) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "fetch";
    link.crossOrigin = "anonymous";
    link.href = new URL("../../../data/history.json", script.src).href;
    document.head.appendChild(link);
})();
