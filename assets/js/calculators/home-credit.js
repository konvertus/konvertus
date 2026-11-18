// Мини-кредитный калькулятор на главной: аннуитетный платёж и переплата.
document.addEventListener("DOMContentLoaded", () => {
    const { t, parse, money, bind } = window.KonvertusCalc;
    const { mortgage } = window.KonvertusMortgage;
    const box = document.getElementById("home-credit-box");
    const out = document.getElementById("home-credit-result");
    if (!box || !out) return;
    const $ = (id) => document.getElementById(id);
    const stat = (label, value, accent) =>
        `<div class="calc-stat${accent ? " is-accent" : ""}"><span>${label}</span><strong>${value}</strong></div>`;

    const calc = () => {
        const r = mortgage({
            price: parse($("hc-amount").value), down: 0,
            years: (parse($("hc-months").value) || 0) / 12,
            rate: parse($("hc-rate").value), type: "annuity", extra: 0,
        });
        if (r.error) { out.innerHTML = `<p class="calc-error">${t("Проверьте сумму, срок и ставку.", "Check the amount, term and rate.")}</p>`; return; }
        out.innerHTML = `<div class="calc-stats">`
            + stat(t("Платёж в месяц", "Monthly payment"), money(r.first), true)
            + stat(t("Переплата", "Total interest"), money(r.interest), true)
            + stat(t("Всего выплатите", "Total paid"), money(r.paid))
            + `</div>`;
    };
    bind(box, calc);
    calc();
});
