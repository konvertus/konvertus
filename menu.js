document.addEventListener("DOMContentLoaded", () => {
    const header = document.querySelector(".header");
    const toggle = document.querySelector(".nav-toggle");
    const panel = document.getElementById("nav-panel");
    const dropdown = document.querySelector(".dropdown");
    const dropbtn = document.querySelector(".dropbtn");
    if (!header || !toggle || !panel) return;

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

    if (dropdown && dropbtn) {
        dropbtn.addEventListener("click", () => dropdown.classList.toggle("open"));
        document.addEventListener("click", (e) => {
            if (!e.target.closest(".dropdown")) dropdown.classList.remove("open");
        });
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            setOpen(false);
            dropdown?.classList.remove("open");
        }
    });

    window.matchMedia("(min-width: 801px)").addEventListener("change", (e) => {
        if (e.matches) setOpen(false);
    });
});