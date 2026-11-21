// Калькулятор вкладов: проценты, капитализация, пополнение, налог.
document.addEventListener("DOMContentLoaded", () => {
    const { t, parse, money, percent, months: monthsText, bind } = window.KonvertusCalc;
    const { deposit, TAX_LIMIT } = window.KonvertusDeposit;
    const box = document.getElementById("calc");
    const out = document.getElementById("result");
    const $ = (id) => document.getElementById(id);
    if (!box || !out) return;

    const ERRORS = {
        amount: t("Укажите сумму вклада.", "Enter the deposit amount."),
        months: t("Срок — от 1 месяца до 50 лет.", "The term must be between 1 month and 50 years."),
        rate: t("Ставка — от 0 до 100% годовых.", "The rate must be between 0 and 100% per year."),
        taxrate: t("Ставка НДФЛ — от 0 до 100%.", "The tax rate must be between 0 and 100%."),
    };
    const CAP_HINTS = {
        end: t("Проценты копятся отдельно и выплачиваются в конце срока. Новые проценты на них не начисляются.",
            "Interest builds up separately and is paid at the end. It does not earn interest itself."),
        monthly: t("Каждый месяц проценты прибавляются к сумме вклада, и следующий месяц считается уже с них.",
            "Each month the interest is added to the deposit, and the next month is calculated on the larger amount."),
        quarterly: t("Раз в три месяца накопленные проценты прибавляются к сумме вклада.",
            "Every three months the accrued interest is added to the deposit."),
        yearly: t("Раз в год накопленные проценты прибавляются к сумме вклада.",
            "Once a year the accrued interest is added to the deposit."),
    };
    const CAP_NAMES = {
        end: t("без капитализации", "without capitalization"),
        monthly: t("ежемесячной капитализации", "monthly capitalization"),
        quarterly: t("ежеквартальной капитализации", "quarterly capitalization"),
        yearly: t("ежегодной капитализации", "yearly capitalization"),
    };
    const stat = (label, value, accent) =>
        `<div class="calc-stat${accent ? " is-accent" : ""}"><span>${label}</span><strong>${value}</strong></div>`;

    function scheduleTable(rows, refill, capitalized) {
        const th = (text) => `<th>${text}</th>`;
        const money = (v) => window.KonvertusCalc.money(v).replace(/\u00a0₽$/, "");   // ₽ указан в заголовках
        const head = "<tr>" + th(t("Мес.", "Mo."))
            + (refill ? th(t("Взнос, ₽", "Top-up, ₽")) + th(t("Работает, мес.", "Works, mo.")) : "")
            + th(t("Проценты, ₽", "Interest, ₽"))
            + (capitalized ? th(t("Капитал., ₽", "Capital., ₽")) : "")
            + th(t("На счёте, ₽", "Balance, ₽")) + "</tr>";
        const dash = "—";
        const body = rows.map((x) => {
            const label = x.m === 0 ? t("Старт", "Start") : x.m;
            const topup = x.m === 0 ? money(x.topup) : x.topup ? money(x.topup) : dash;
            const works = x.topup ? x.works : dash;
            return `<tr${x.topup && x.m > 0 ? ' class="is-topup"' : ""}><td>${label}</td>`
                + (refill ? `<td>${topup}</td><td>${works}</td>` : "")
                + `<td>${x.m === 0 ? dash : money(x.interest)}</td>`
                + (capitalized ? `<td>${x.credited ? money(x.credited) : dash}</td>` : "")
                + `<td>${money(x.balance)}</td></tr>`;
        }).join("");
        return `<div class="calc-table-wrap is-full"><table class="tips-table calc-table is-fit">${head}${body}</table></div>`;
    }

    function topupExample(months) {
        if (months < 2) return t("При сроке в 1 месяц пополнять вклад не получится.", "With a one-month term there is no time to top up.");
        const m = months > 4 ? 4 : 1;
        return t(
            `Взнос вносится в конце месяца. Например, при сроке ${monthsText(months)} взнос в конце ${m}-го месяца работает ${months - m} мес. (с ${m + 1}-го по ${months}-й), а взнос последнего месяца не вносится: ему уже не успеть заработать.`,
            `The top-up is made at the end of the month. For a term of ${monthsText(months)}, a top-up at the end of month ${m} works for ${months - m} months (month ${m + 1} to ${months}); no top-up is made in the last month because it would earn nothing.`);
    }

    function calc() {
        const refill = $("refill").checked;
        $("topup-field").hidden = !refill;
        $("taxrate-field").hidden = !$("tax").checked;
        $("cap-hint").textContent = CAP_HINTS[$("cap").value] || "";

        const term = parse($("term").value);
        const months = Math.round($("unit").value === "years" ? term * 12 : term);
        const tax = $("tax").checked;
        const cap = $("cap").value;
        const base = {
            amount: parse($("amount").value), months, rate: parse($("rate").value),
            topup: refill ? parse($("topup").value) || 0 : 0, tax,
            taxRate: parse($("taxrate").value),
        };
        const r = deposit({ ...base, cap });
        if (r.error) { out.innerHTML = `<p class="calc-error">${ERRORS[r.error]}</p>`; $("cap-example").textContent = ""; return; }

        const rateText = percent(base.taxRate, 2);
        const hasTopups = refill && base.topup > 0 && months > 1;
        let html = stat(t(tax ? "Итого на руках (после налога)" : "Итого на счёте", tax ? "Total after tax" : "Total balance"), money(r.net), true)
            + stat(t("Начисленные проценты", "Interest earned"), money(r.interest), true)
            + stat(t(hasTopups ? "Внесено всего (с пополнениями)" : "Внесено всего", hasTopups ? "Total deposited (with top-ups)" : "Total deposited"), money(r.contributed));
        if (tax) {
            html += stat(t(`Налог (НДФЛ ${rateText})`, `Income tax (${rateText})`), money(r.tax))
                + stat(t("Проценты после налога", "Interest after tax"), money(r.netInterest));
        }
        if (r.effective !== undefined) html += stat(t("Эффективная ставка", "Effective rate"), percent(r.effective) + t(" годовых", " per year"));
        const note = tax
            ? `<p class="calc-note">${t(
                `Налог посчитан упрощённо: с процентов сверх ${money(TAX_LIMIT)} в год (1 млн ₽ × ключевая ставка 16% на 2026 год), ставка ${rateText}, и считаем, что это ваш единственный вклад.`,
                `Tax is simplified: ${rateText} on interest above ${money(TAX_LIMIT)} per year (the 2026 allowance), assuming this is your only deposit.`)}</p>`
            : "";

        const capitalized = cap !== "end";
        const title = hasTopups ? t("Таблица пополнений и начислений", "Top-ups and interest table") : t("График начислений по месяцам", "Monthly interest schedule");
        const table = `<details class="calc-details"${hasTopups ? " open" : ""}><summary>${title}</summary>`
            + (refill ? `<p class="calc-note">${topupExample(months)}</p>` : "")
            + scheduleTable(r.schedule, refill, capitalized) + "</details>";
        out.innerHTML = `<div class="calc-stats">${html}</div>${note}${table}`;

        // пояснение капитализации на примере введённых данных
        const plain = deposit({ ...base, cap: "end" });
        const gain = r.interest - plain.interest;
        $("cap-example").textContent = capitalized
            ? t(`На ваших данных: при ${CAP_NAMES[cap]} проценты за срок составят ${money(r.interest)}, без капитализации — ${money(plain.interest)}. Капитализация даёт ещё ${money(gain)}.`,
                `With your numbers: with ${CAP_NAMES[cap]} the interest is ${money(r.interest)}, without it ${money(plain.interest)}. Capitalization adds ${money(gain)}.`)
            : t(`На ваших данных проценты составят ${money(r.interest)}. Выберите капитализацию, чтобы увидеть, сколько она добавит.`,
                `With your numbers the interest is ${money(r.interest)}. Choose a capitalization period to see how much it would add.`);
    }

    bind(box, calc);
    calc();
});
