// Поля конвертера: поворот кнопки «поменять местами» и кнопка «±» на телефоне.
// (Числовая клавиатура включается атрибутом inputmode прямо в разметке страниц.)
document.addEventListener("DOMContentLoaded", () => {
    // стрелки на кнопке каждый раз переворачиваются ещё на 180°: угол только растёт, поэтому
    // вращение идёт в одну сторону, а не откатывается назад
    const swap = document.getElementById("swap");
    let turn = 0;
    swap?.addEventListener("click", () => {
        turn += 180;
        swap.style.setProperty("--turn", turn + "deg");
    });

    // «±» нужен там, где бывают отрицательные числа (температура, системы счисления):
    // на цифровой клавиатуре телефона знака минус нет
    const box = document.querySelector(".converter-box[data-signed]");
    const input = document.getElementById("input");
    const output = document.getElementById("output");
    if (!box || !input || !output) return;

    // если подтянулся старый кэшированный CSS, кнопки не добавляем, чтобы не ломать вёрстку
    if (getComputedStyle(document.documentElement).getPropertyValue("--konvertus-css").trim() !== "8") return;

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
        // не забираем фокус у поля, иначе на телефоне клавиатура закроется
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
