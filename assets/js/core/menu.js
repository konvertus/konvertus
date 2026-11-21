document.addEventListener("DOMContentLoaded", () => {
    const header = document.querySelector(".header");
    const toggle = document.querySelector(".nav-toggle");
    const panel = document.getElementById("nav-panel");
    const dropdowns = document.querySelectorAll(".dropdown");
    if (!header || !toggle || !panel) return;

    // Мобильное меню (гамбургер)
    function setOpen(open) {
        header.classList.toggle("nav-open", open);
        toggle.setAttribute("aria-expanded", String(open));
        document.body.classList.toggle("nav-lock", open);
    }

    toggle.addEventListener("click", () => {
        setOpen(!header.classList.contains("nav-open"));
    });

    panel.addEventListener("click", (e) => {
        if (e.target.closest("a")) setOpen(false);
    });

    // Выпадающие вкладки («Инструменты», «Финансы»): открыта может быть только одна.
    // На компьютере вкладка открывается при наведении и остаётся открытой, пока курсор в пределах шапки
    // (логотип, поиск, кнопки, сама панель). Закрывается, только когда курсор уходит ниже, на страницу.
    const desktop = window.matchMedia("(min-width: 801px) and (hover: hover)");
    const closeAll = () => dropdowns.forEach((dropdown) => dropdown.classList.remove("open"));

    dropdowns.forEach((dropdown) => {
        dropdown.addEventListener("mouseenter", () => {
            if (!desktop.matches) return;
            dropdowns.forEach((other) => other !== dropdown && other.classList.remove("open"));
            dropdown.classList.add("open");
        });
        dropdown.querySelector(".dropbtn")?.addEventListener("click", (e) => {
            // мышью на компьютере управляет наведение; клавиатура (detail 0) и телефон переключают по нажатию
            if (desktop.matches && e.detail > 0) return;
            dropdowns.forEach((other) => other !== dropdown && other.classList.remove("open"));
            dropdown.classList.toggle("open");
        });
    });
    // выпадающая панель лежит внутри шапки, поэтому mouseleave срабатывает только при выходе из шапки и панели
    header.addEventListener("mouseleave", () => {
        if (desktop.matches) closeAll();
    });
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".header")) closeAll();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            setOpen(false);
            dropdowns.forEach((dropdown) => dropdown.classList.remove("open"));
        }
    });

    window.matchMedia("(min-width: 801px)").addEventListener("change", (e) => {
        if (e.matches) setOpen(false);
    });
});
