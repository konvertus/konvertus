// Заставка: стрелки крутятся, буквы KONVERTUS появляются по одной,
// затем логотип «перелетает» в шапку. Показывается один раз за сессию.
(function () {
    const root = document.documentElement;
    const KEY = "konvertus-intro";
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

    let seen = false;
    try { seen = sessionStorage.getItem(KEY) === "1"; } catch (e) { /* ничего */ }
    if (seen || reduce) return;

    root.classList.add("intro-on", "intro-hold");

    const finish = (overlay) => {
        root.classList.remove("intro-on", "intro-hold");
        if (overlay) overlay.remove();
    };

    // страховка: что бы ни случилось, сайт не останется скрытым
    const failsafe = setTimeout(() => finish(document.querySelector(".intro")), 5000);

    document.addEventListener("DOMContentLoaded", async () => {
        try { sessionStorage.setItem(KEY, "1"); } catch (e) { /* ничего */ }

<<<<<<< HEAD
        const target = document.querySelector(".header .logo");
        const label = target && target.querySelector("span:last-child");
        const word = (label && label.textContent.trim()) || "KONVERTUS";

=======
>>>>>>> 2f81f56454f39689ea1d231d5f8f7f4ff54cac87
        // ждём шрифты сайта, чтобы заставка выглядела так же, как шапка (но не дольше секунды)
        try {
            await Promise.race([
                Promise.all([
<<<<<<< HEAD
                    document.fonts.load("800 56px Montserrat", word),
=======
                    document.fonts.load("800 56px Montserrat", "KONVERTUS"),
>>>>>>> 2f81f56454f39689ea1d231d5f8f7f4ff54cac87
                    document.fonts.load("600 24px 'Material Symbols Outlined'", "sync_alt")
                ]),
                new Promise((r) => setTimeout(r, 1000))
            ]);
        } catch (e) { /* ничего */ }

<<<<<<< HEAD
=======
        const word = "KONVERTUS";
>>>>>>> 2f81f56454f39689ea1d231d5f8f7f4ff54cac87
        const overlay = document.createElement("div");
        overlay.className = "intro";
        overlay.setAttribute("aria-hidden", "true");
        overlay.innerHTML =
            '<div class="intro-logo">' +
            '<span class="material-symbols-outlined arrows_symbol intro-arrows">sync_alt</span>' +
            '<span>' + [...word].map((ch, i) =>
                '<span class="intro-letter" style="animation-delay:' + (0.35 + i * 0.06) + 's">' + ch + '</span>').join("") +
            '</span></div>';
        root.appendChild(overlay);

        const logo = overlay.querySelector(".intro-logo");
        const lettersDone = 0.35 + word.length * 0.06 + 0.45;
        await new Promise((r) => setTimeout(r, (lettersDone + 0.25) * 1000));

<<<<<<< HEAD
=======
        const target = document.querySelector(".header .logo");
>>>>>>> 2f81f56454f39689ea1d231d5f8f7f4ff54cac87
        if (!target || !logo.animate) { clearTimeout(failsafe); finish(overlay); return; }

        const a = logo.getBoundingClientRect();
        const b = target.getBoundingClientRect();
        const dx = b.left - a.left, dy = b.top - a.top, s = b.width / a.width;

        root.classList.remove("intro-on"); // сайт становится видимым под заставкой
        const opts = { duration: 650, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" };
<<<<<<< HEAD
        // зелёная заставка сжимается до полосы шапки, открывая страницу под собой
        const rest = Math.max(0, window.innerHeight - Math.round(target.closest(".header").getBoundingClientRect().bottom));
        overlay.animate([{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(0 0 " + rest + "px 0)" }], opts);
=======
        overlay.animate([{ backgroundColor: getComputedStyle(overlay).backgroundColor }, { backgroundColor: "rgba(0,0,0,0)" }], opts);
>>>>>>> 2f81f56454f39689ea1d231d5f8f7f4ff54cac87
        const fly = logo.animate([
            { transform: "translate(0,0) scale(1)" },
            { transform: "translate(" + dx + "px," + dy + "px) scale(" + s + ")" }
        ], opts);
        fly.onfinish = () => { clearTimeout(failsafe); finish(overlay); };
    });
})();
