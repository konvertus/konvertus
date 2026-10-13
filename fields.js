document.addEventListener("DOMContentLoaded", () => {
    const swap = document.getElementById("swap");
    let turn = 0;
    swap?.addEventListener("click", () => {
        turn += 180;
        swap.style.setProperty("--turn", turn + "deg");
    });

    // Смена местами: значки валют сверху перелетают друг к другу, заголовок плавно обновляется.
    // Значения меняет скрипт конвертера. Сами поля выбора анимирует select.js (небольшой «pop»)
    const iconsBox = document.getElementById("currency-icons");
    const title = document.getElementById("title");
    if (swap && (iconsBox || title)) {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        let animations = [];
        let before = null;

        const badgesOf = () => (iconsBox ? [...iconsBox.querySelectorAll(".currency-badge")] : []);

        function fly(el, from, bulgeY, zIndex) {
            const to = el.getBoundingClientRect();
            const dx = from.left - to.left;
            const dy = from.top - to.top;
            el.style.zIndex = zIndex;
            const animation = el.animate(
                [
                    { transform: `translate(${dx}px, ${dy}px)` },
                    { transform: `translate(${dx / 2}px, ${dy / 2 + bulgeY}px)`, offset: 0.5 },
                    { transform: "translate(0, 0)" }
                ],
                { duration: 520, easing: "cubic-bezier(0.4, 0, 0.2, 1)" }
            );
            const clear = () => {
                el.style.zIndex = "";
            };
            animation.onfinish = clear;
            animation.oncancel = clear;
            animations.push(animation);
        }

        // до обработчиков конвертера (они меняют значения) запоминаем, где стояли значки
        document.addEventListener(
            "click",
            (e) => {
                if (!e.target.closest || !e.target.closest("#swap")) return;
                animations.forEach((a) => a.cancel());
                animations = [];
                const [left, right] = badgesOf().map((b) => b.getBoundingClientRect());
                before = { left, right };
                // к этому моменту конвертер уже поменял значения и обновил страницу, но кадр ещё не нарисован
                requestAnimationFrame(() => {
                    const from = before;
                    before = null;
                    if (!from || reduceMotion.matches) return;

                    const [newLeft, newRight] = badgesOf();
                    if (newLeft?.animate && newRight && from.left && from.right) {
                        fly(newLeft, from.right, -12, 2);
                        fly(newRight, from.left, 12, 1);
                    }
                    title?.animate?.(
                        [{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }],
                        { duration: 320, easing: "ease-out" }
                    );
                });
            },
            true
        );
    }

    const box = document.querySelector(".converter-box[data-signed]");
    const input = document.getElementById("input");
    const output = document.getElementById("output");
    if (!box || !input || !output) return;

    if (getComputedStyle(document.documentElement).getPropertyValue("--konvertus-css").trim() !== "11") return;

    const label = document.documentElement.lang === "en" ? "Change sign" : "Сменить знак";

    function flipSign(field) {
        const value = field.value.trim();
        if (!/^[-+]?[\d.,a-f]/i.test(value) || /^[-+]$/.test(value)) return;
        field.value = value.startsWith("-") ? value.slice(1) : "-" + value.replace(/^\+/, "");
        field.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function signButton(field) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "copy-btn sign-btn";
        btn.textContent = "±";
        btn.setAttribute("aria-label", label);
        btn.addEventListener("pointerdown", (e) => e.preventDefault());
        btn.addEventListener("click", () => flipSign(field));
        return btn;
    }

    const row = document.createElement("div");
    row.className = "input-row";
    input.before(row);
    row.append(input, signButton(input));

    const outputRow = output.closest(".output-row");
    outputRow?.insertBefore(signButton(output), outputRow.querySelector(".copy-btn"));
});
