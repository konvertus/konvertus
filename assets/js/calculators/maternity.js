// Маткапитал на ипотеку: как изменится платёж и переплата.
document.addEventListener("DOMContentLoaded", () => {
    const { t, parse, money, bind } = window.KonvertusCalc;
    const { maternity } = window.KonvertusMortgage;
    const box = document.getElementById("calc");
    const out = document.getElementById("result");
    const $ = (id) => document.getElementById(id);
    if (!box || !out) return;

    const ERRORS = {
        price: t("Укажите стоимость жилья.", "Enter the property price."),
        down: t("Первоначальный взнос должен быть меньше стоимости жилья.", "The down payment must be less than the property price."),
        years: t("Срок — от 1 месяца до 50 лет.", "The term must be between 1 month and 50 years."),
        rate: t("Ставка — от 0 до 100% годовых.", "The rate must be between 0 and 100% per year."),
        capital: t("Укажите сумму маткапитала.", "Enter the capital amount."),
    };
    const stat = (label, value, accent) =>
        `<div class="calc-stat${accent ? " is-accent" : ""}"><span>${label}</span><strong>${value}</strong></div>`;

    function calc() {
        const custom = $("scenario").value === "custom";
        $("custom-row").hidden = !custom;
        $("after-row").hidden = $("mode").value !== "early";
        const capital = custom ? parse($("custom").value) : Number($("scenario").value);
        const r = maternity({
            price: parse($("price").value), down: parse($("down").value) || 0, years: parse($("years").value),
            rate: parse($("rate").value), capital, mode: $("mode").value, afterMonths: parse($("after").value) || 0,
        });
        if (r.error) { out.innerHTML = `<p class="calc-error">${ERRORS[r.error]}</p>`; return; }

        let html = stat(t("Сумма маткапитала", "Capital amount"), money(capital))
            + stat(t("Платёж без маткапитала", "Payment without capital"), money(r.plain.first))
            + stat(t("Платёж с маткапиталом", "Payment with capital"), money(r.payment), true)
            + stat(t("Платёж меньше на", "Payment lower by"), money(r.paymentDiff))
            + stat(t("Переплата без маткапитала", "Interest without capital"), money(r.plain.interest))
            + stat(t("Переплата с маткапиталом", "Interest with capital"), money(r.interest))
            + stat(t("Экономия на процентах", "Interest saved"), money(r.saved), true);
        const covered = r.covered
            ? `<p class="calc-note">${t("Маткапитал полностью закрывает кредит.", "The capital covers the whole loan.")}</p>` : "";
        out.innerHTML = `<div class="calc-stats">${html}</div>${covered}`;
    }

    bind(box, calc);
    calc();
});
