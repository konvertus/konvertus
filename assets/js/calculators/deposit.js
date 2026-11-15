// Калькулятор вкладов: проценты, капитализация, пополнение, налог.
document.addEventListener("DOMContentLoaded", () => {
    const { t, parse, money, percent, bind } = window.KonvertusCalc;
    const { deposit, TAX_LIMIT } = window.KonvertusDeposit;
    const box = document.getElementById("calc");
    const out = document.getElementById("result");
    const $ = (id) => document.getElementById(id);
    if (!box || !out) return;

    const ERRORS = {
        amount: t("Укажите сумму вклада.", "Enter the deposit amount."),
        months: t("Срок — от 1 месяца до 50 лет.", "The term must be between 1 month and 50 years."),
        rate: t("Ставка — от 0 до 100% годовых.", "The rate must be between 0 and 100% per year."),
    };
    const stat = (label, value, accent) =>
        `<div class="calc-stat${accent ? " is-accent" : ""}"><span>${label}</span><strong>${value}</strong></div>`;

    function calc() {
        const term = parse($("term").value);
        const months = $("unit").value === "years" ? term * 12 : term;
        const tax = $("tax").checked;
        const r = deposit({
            amount: parse($("amount").value), months: Math.round(months), rate: parse($("rate").value),
            cap: $("cap").value, topup: parse($("topup").value) || 0, tax,
        });
        if (r.error) { out.innerHTML = `<p class="calc-error">${ERRORS[r.error]}</p>`; return; }

        let html = stat(t(tax ? "Итого на руках (после налога)" : "Итого на счёте", tax ? "Total after tax" : "Total balance"), money(r.net), true)
            + stat(t("Начисленные проценты", "Interest earned"), money(r.interest), true)
            + stat(t("Внесено всего", "Total deposited"), money(r.contributed));
        if (tax) {
            html += stat(t("Налог (НДФЛ 13%)", "Income tax (13%)"), money(r.tax))
                + stat(t("Проценты после налога", "Interest after tax"), money(r.netInterest));
        }
        if (r.effective !== undefined) html += stat(t("Эффективная ставка", "Effective rate"), percent(r.effective) + t(" годовых", " per year"));
        const note = tax
            ? `<p class="calc-note">${t(
                `Налог посчитан упрощённо: с процентов сверх ${money(TAX_LIMIT)} в год (1 млн ₽ × ключевая ставка 16% на 2026 год), ставка 13%, и считаем, что это ваш единственный вклад.`,
                `Tax is simplified: 13% on interest above ${money(TAX_LIMIT)} per year (the 2026 allowance), assuming this is your only deposit.`)}</p>`
            : "";
        out.innerHTML = `<div class="calc-stats">${html}</div>${note}`;
    }

    bind(box, calc);
    calc();
});
