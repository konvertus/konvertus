// Ипотечный калькулятор: платёж, переплата, график.
document.addEventListener("DOMContentLoaded", () => {
    const { t, parse, clean, group, money, months, bind, EN } = window.KonvertusCalc;
    const { mortgage } = window.KonvertusMortgage;
    const box = document.getElementById("calc");
    const out = document.getElementById("result");
    const $ = (id) => document.getElementById(id);
    if (!box || !out) return;

    const ERRORS = {
        price: t("Укажите стоимость жилья.", "Enter the property price."),
        down: t("Первоначальный взнос должен быть меньше стоимости жилья.", "The down payment must be less than the property price."),
        years: t("Срок — от 1 месяца до 50 лет.", "The term must be between 1 month and 50 years."),
        rate: t("Ставка — от 0 до 100% годовых.", "The rate must be between 0 and 100% per year."),
    };
    const stat = (label, value, accent) =>
        `<div class="calc-stat${accent ? " is-accent" : ""}"><span>${label}</span><strong>${value}</strong></div>`;

    function calc() {
        const price = parse($("price").value);
        const down = parse($("down").value) || 0;
        $("type-hint").textContent = $("type").value === "diff"
            ? t("Платёж уменьшается каждый месяц: сначала выше, потом ниже. Переплата меньше.", "The payment shrinks every month: higher at first, lower later. You pay less interest.")
            : t("Платёж одинаковый каждый месяц. Удобно планировать бюджет, но переплата больше.", "The payment is the same every month. Easy to budget, but you pay more interest.");
        const r = mortgage({
            price, down, years: parse($("years").value), rate: parse($("rate").value),
            type: $("type").value, extra: parse($("extra").value) || 0,
        });
        if (r.error) { out.innerHTML = `<p class="calc-error">${ERRORS[r.error]}</p>`; return; }

        const diff = $("type").value === "diff";
        const payment = diff ? `${money(r.first)} … ${money(r.last)}` : money(r.first);
        let html = stat(t(diff ? "Платёж в месяц (от … до)" : "Платёж в месяц", diff ? "Monthly payment (first … last)" : "Monthly payment"), payment, true)
            + stat(t("Сумма кредита", "Loan amount"), money(r.loan))
            + stat(t("Переплата по процентам", "Total interest"), money(r.interest), true)
            + stat(t("Всего выплатите", "Total paid"), money(r.paid))
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

    // Первоначальный взнос можно задать в рублях или в процентах: второе поле пересчитывается само.
    // driver — что пользователь менял последним; при смене цены сохраняется именно это значение.
    let driver = "rub";
    const fmtPct = (p) => group(String(Math.round(p * 100) / 100).replace(".", EN ? "." : ","));
    function syncDown(source) {
        if (source !== "price") driver = source;
        const num = (id) => parse(clean($(id).value));
        const price = num("price");
        const from = source === "price" ? driver : source;
        if (from === "rub") {
            const down = num("down");
            $("down-pct").value = price > 0 && down >= 0 ? fmtPct((down / price) * 100) : "";
        } else {
            const pct = num("down-pct");
            $("down").value = price > 0 && pct >= 0 ? group(String(Math.round((price * pct) / 100))) : "";
        }
    }
    // обработчики до bind(): сначала синхронизация полей, потом пересчёт
    $("price").addEventListener("input", () => syncDown("price"));
    $("down").addEventListener("input", () => syncDown("rub"));
    $("down-pct").addEventListener("input", () => syncDown("pct"));

    bind(box, calc);
    syncDown("rub");
    calc();
});
