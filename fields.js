document.addEventListener("DOMContentLoaded", () => {
    const swap = document.getElementById("swap");
    let turn = 0;
    swap?.addEventListener("click", () => {
        turn += 180;
        swap.style.setProperty("--turn", turn + "deg");
    });

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
