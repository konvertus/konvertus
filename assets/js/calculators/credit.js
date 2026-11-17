// Кредитный калькулятор: платёж, переплата, комиссия, график. Использует то же ядро, что и ипотека.
document.addEventListener("DOMContentLoaded", () => {
    const { t, parse, money, months, bind } = window.KonvertusCalc;
    const { mortgage } = window.KonvertusMortgage;
    const box = document.getElementById("calc");
    const out = document.getElementById("result");
    const $ = (id) => document.getElementById(id);
    if (!box || !out) return;

    const ERRORS = {
        price: t("Укажите сумму кредита.", "Enter the loan amount."),
        years: t("Срок — от 1 месяца до 50 лет (600 месяцев).", "The term must be between 1 and 600 months."),
        rate: t("Ставка — от 0 до 100% годовых.", "The rate must be between 0 and 100% per year."),
        fee: t("Комиссия — от 0 до 100%.", "The fee must be between 0 and 100%."),
    };
    const stat = (label, value, accent) =>
        `<div class="calc-stat${accent ? " is-accent" : ""}"><span>${label}</span><strong>${value}</strong></div>`;

    function calc() {
        const diff = $("type").value === "diff";
        $("type-hint").textContent = diff
            ? t("Платёж уменьшается каждый месяц: сначала выше, потом ниже. Переплата меньше.", "The payment shrinks every month: higher at first, lower later. You pay less interest.")
            : t("Платёж одинаковый каждый месяц. Удобно планировать бюджет, но переплата больше.", "The payment is the same every month. Easy to budget, but you pay more interest.");
        const fee = parse($("fee").value) || 0;
        if (fee < 0 || fee > 100) { out.innerHTML = `<p class="calc-error">${ERRORS.fee}</p>`; return; }
        const r = mortgage({
            price: parse($("amount").value), down: 0, years: (parse($("months").value) || 0) / 12,
            rate: parse($("rate").value), type: $("type").value, extra: parse($("extra").value) || 0,
        });
        if (r.error) { out.innerHTML = `<p class="calc-error">${ERRORS[r.error === "down" ? "price" : r.error]}</p>`; return; }

        const feeSum = (r.loan * fee) / 100;
        const payment = diff ? `${money(r.first)} … ${money(r.last)}` : money(r.first);
        let html = stat(t(diff ? "Платёж в месяц (от … до)" : "Платёж в месяц", diff ? "Monthly payment (first … last)" : "Monthly payment"), payment, true)
            + stat(t("Переплата по процентам", "Total interest"), money(r.interest), true);
        if (feeSum > 0) html += stat(t("Комиссия за выдачу", "Origination fee"), money(feeSum));
        html += stat(t("Всего выплатите", "Total paid"), money(r.paid + feeSum))
            + stat(t("Срок выплат", "Repayment time"), months(r.months));
        if (r.savedMonths > 0 || r.savedInterest > 0.5) {
            html += stat(t("Экономия на процентах", "Interest saved"), money(r.savedInterest))
                + stat(t("Кредит закроется раньше на", "Paid off earlier by"), months(r.savedMonths));
        }
        const head = `<tr><th>${t("Месяц", "Month")}</th><th>${t("Платёж", "Payment")}</th><th>${t("Основной долг", "Principal")}</th><th>${t("Проценты", "Interest")}</th><th>${t("Остаток", "Balance")}</th></tr>`;
        const rows = r.rows.map((x) => `<tr><td>${x.m}</td><td>${money(x.payment)}</td><td>${money(x.principal)}</td><td>${money(x.interest)}</td><td>${money(x.balance)}</td></tr>`).join("");
        out.innerHTML = `<div class="calc-stats">${html}</div>
            <details class="calc-details"><summary>${t("График платежей", "Payment schedule")}</summary>
            <div class="calc-table-wrap"><table class="tips-table calc-table">${head}${rows}</table></div></details>`;
    }

    bind(box, calc);
    calc();
});
