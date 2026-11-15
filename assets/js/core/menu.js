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

    // Выпадающие вкладки («Инструменты», «Финансы»): открыта может быть только одна
    dropdowns.forEach((dropdown) => {
        dropdown.querySelector(".dropbtn")?.addEventListener("click", () => {
            dropdowns.forEach((other) => other !== dropdown && other.classList.remove("open"));
            dropdown.classList.toggle("open");
        });
    });
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".dropdown")) dropdowns.forEach((dropdown) => dropdown.classList.remove("open"));
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
