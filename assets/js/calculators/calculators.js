// Интерфейс финансовых калькуляторов: ипотека, вклады, маткапитал.
// Формулы лежат в finance-math.js. Страница задаёт калькулятор атрибутом data-calc на секции.
(() => {
    const EN = document.documentElement.lang === "en";
    const t = (ru, en) => (EN ? en : ru);
    const F = window.KonvertusFinance;
    const root = document.querySelector("[data-calc]");
    if (!root || !F) return;
    const kind = root.dataset.calc;

    const LOCALE = EN ? "en-US" : "ru-RU";
    const nf0 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
    const nf2 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const nfIn = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
    const money = (x, digits = 0) => (digits ? nf2 : nf0).format(Math.round(x * 100) / 100) + "\u00a0₽";
    const pct = (x) => new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(x) + "%";
    const term = (months) => {
        const y = Math.floor(months / 12);
        const m = months % 12;
        const parts = [];
        if (y) parts.push(y + "\u00a0" + t(y % 10 === 1 && y % 100 !== 11 ? "год" : y % 10 >= 2 && y % 10 <= 4 && (y % 100 < 12 || y % 100 > 14) ? "года" : "лет", y === 1 ? "year" : "years"));
        if (m) parts.push(m + "\u00a0" + t("мес.", "mo."));
        return parts.join(" ") || "0";
    };

    // ---------- сборка элементов ----------
    function h(tag, props = {}, ...kids) {
        const node = document.createElement(tag);
        for (const [k, v] of Object.entries(props)) {
            if (v === undefined || v === null || v === false) continue;
            if (k === "class") node.className = v;
            else if (k === "text") node.textContent = v;
            else node.setAttribute(k, v === true ? "" : v);
        }
        for (const kid of kids.flat()) if (kid) node.append(kid.nodeType ? kid : document.createTextNode(kid));
        return node;
    }

    const state = {};

    function field({ id, label, value, unit, hint, inputmode = "decimal" }) {
        const input = h("input", { id, type: "text", inputmode, autocomplete: "off", value: nfIn.format(value) });
        input.dataset.raw = String(value);
        // отрицательных значений в калькуляторах не бывает: оставляем только цифры и разделитель
        input.addEventListener("input", () => {
            const clean = input.value.replace(/[^\d.,\s\u00a0]/g, "");
            if (clean !== input.value) input.value = clean;
        });
        input.addEventListener("blur", () => {
            const v = read(id);
            if (!Number.isNaN(v)) input.value = nfIn.format(v);
        });
        const wrap = h("div", { class: "calc-input" }, input, unit ? h("span", { class: "calc-unit", text: unit }) : null);
        return h("div", { class: "calc-field" }, h("label", { for: id, text: label }), wrap, hint ? h("small", { id: id + "-hint", class: "calc-hint", text: hint }) : null);
    }

    function select({ id, label, options, value }) {
        const sel = h("select", { id, class: "calc-select" }, options.map(([v, text]) => h("option", { value: v, selected: v === value, text })));
        return h("div", { class: "calc-field" }, h("label", { for: id, text: label }), sel);
    }

    function segmented({ id, label, options, value }) {
        const box = h("div", { class: "calc-seg", role: "radiogroup", "aria-label": label, id });
        for (const [v, text] of options) {
            const b = h("button", { type: "button", role: "radio", "aria-checked": String(v === value), text });
            b.dataset.value = v;
            b.addEventListener("click", () => {
                box.dataset.value = v;
                box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
                run();
            });
            box.append(b);
        }
        box.dataset.value = value;
        return h("div", { class: "calc-field" }, h("span", { class: "calc-label", text: label }), box);
    }

    function check({ id, label, checked }) {
        const input = h("input", { id, type: "checkbox", checked });
        return h("label", { class: "calc-check", for: id }, input, h("span", { text: label }));
    }

    function read(id) {
        const el = document.getElementById(id);
        if (!el) return NaN;
        const raw = el.value.replace(/[\s\u00a0]/g, "").replace(",", ".");
        return raw === "" ? NaN : Number(raw);
    }
    const seg = (id) => document.getElementById(id).dataset.value;

    // ---------- результаты ----------
    const out = h("div", { class: "calc-out", "aria-live": "polite" });
    const scheduleBody = h("tbody");
    let scheduleRows = [];
    let scheduleCols = [];
    const details = h("details", { class: "calc-schedule" }, h("summary", { text: t("График платежей", "Payment schedule") }), h("div", { class: "calc-table-wrap" }, h("table", { class: "calc-table" }, h("thead"), scheduleBody)));
    let scheduleDirty = true;

    function stat(label, value, cls = "") {
        return h("div", { class: "calc-stat " + cls }, h("span", { class: "calc-stat-label", text: label }), h("strong", { class: "calc-stat-value", text: value }));
    }

    function bar(a, b, labelA, labelB) {
        const total = a + b;
        const share = total > 0 ? Math.round((a / total) * 1000) / 10 : 0;
        return h("div", { class: "calc-share" },
            h("div", { class: "calc-bar", role: "img", "aria-label": `${labelA} ${share}%, ${labelB} ${Math.round((100 - share) * 10) / 10}%` }, h("span", { style: `width:${share}%` })),
            h("div", { class: "calc-legend" }, h("span", { class: "dot dot-a" }), h("span", { text: `${labelA}: ${pct(share)}` }), h("span", { class: "dot dot-b" }), h("span", { text: `${labelB}: ${pct(100 - share)}` })));
    }

    function showError(text) {
        out.replaceChildren(h("p", { class: "calc-error", role: "alert", text }));
        scheduleRows = [];
        scheduleDirty = true;
        details.hidden = true;
    }

    function setSchedule(cols, rows) {
        scheduleCols = cols;
        scheduleRows = rows;
        scheduleDirty = true;
        details.hidden = rows.length === 0;
        if (details.open) renderSchedule();
    }

    function renderSchedule() {
        if (!scheduleDirty) return;
        const thead = details.querySelector("thead");
        thead.replaceChildren(h("tr", {}, scheduleCols.map((c) => h("th", { text: c }))));
        const frag = document.createDocumentFragment();
        for (const row of scheduleRows) frag.append(h("tr", {}, row.map((c) => h("td", { text: c }))));
        scheduleBody.replaceChildren(frag);
        scheduleDirty = false;
    }
    details.addEventListener("toggle", () => details.open && renderSchedule());

    // ---------- ипотека ----------
    function mortgageForm() {
        return [
            field({ id: "price", label: t("Стоимость жилья", "Property price"), value: 6000000, unit: "₽" }),
            field({ id: "down", label: t("Первоначальный взнос", "Down payment"), value: 1200000, unit: "₽", hint: " " }),
            field({ id: "cap", label: t("Маткапитал в первоначальный взнос", "Maternity capital as down payment"), value: 0, unit: "₽", hint: t("Необязательно. Размер маткапитала — на странице «Маткапитал и ипотека».", "Optional. See the “Maternity capital” page for the amount.") }),
            field({ id: "years", label: t("Срок кредита", "Loan term"), value: 20, unit: t("лет", "years") }),
            field({ id: "rate", label: t("Процентная ставка", "Interest rate"), value: 14, unit: t("% годовых", "% per year") }),
            segmented({ id: "type", label: t("Тип платежей", "Payment type"), value: "annuity", options: [["annuity", t("Аннуитетные", "Annuity")], ["diff", t("Дифференцированные", "Diminishing")]] })
        ];
    }

    function runMortgage() {
        const price = read("price");
        const down = read("down");
        const cap = read("cap") || 0;
        const years = read("years");
        const rate = read("rate");
        const hint = document.getElementById("down-hint");
        if (hint) hint.textContent = price > 0 && down >= 0 ? t(`Это ${pct((down / price) * 100)} от стоимости`, `${pct((down / price) * 100)} of the price`) : " ";
        if (!(price > 0)) return showError(t("Введите стоимость жилья.", "Enter the property price."));
        if (!(down >= 0) || !(cap >= 0)) return showError(t("Первоначальный взнос указан неверно.", "The down payment is not valid."));
        if (!(years > 0) || years > 50) return showError(t("Срок кредита — от 1 до 50 лет.", "The loan term must be between 1 and 50 years."));
        if (!(rate >= 0) || rate > 100) return showError(t("Ставка должна быть от 0 до 100% годовых.", "The rate must be between 0 and 100% per year."));
        const loan = price - down - cap;
        if (loan <= 0) return showError(t("Первоначальный взнос покрывает всю стоимость: кредит не нужен.", "The down payment covers the whole price: no loan is needed."));
        const months = Math.round(years * 12);
        const type = seg("type");
        const r = F.mortgage({ loan, rate, months, type });
        const stats = [];
        if (type === "diff") {
            stats.push(stat(t("Первый платёж", "First payment"), money(r.firstPayment, 2), "main"), stat(t("Последний платёж", "Last payment"), money(r.lastPayment, 2)));
        } else {
            stats.push(stat(t("Ежемесячный платёж", "Monthly payment"), money(r.firstPayment, 2), "main"));
        }
        stats.push(
            stat(t("Сумма кредита", "Loan amount"), money(loan)),
            stat(t("Всего выплатите", "Total paid"), money(r.totalPaid)),
            stat(t("Переплата по процентам", "Interest overpayment"), money(r.overpayment), "accent"),
            stat(t("Переплата от суммы кредита", "Overpayment vs. loan"), pct((r.overpayment / loan) * 100))
        );
        out.replaceChildren(h("div", { class: "calc-stats" }, stats), bar(loan, r.overpayment, t("Основной долг", "Principal"), t("Проценты", "Interest")));
        setSchedule(
            [t("№", "#"), t("Платёж", "Payment"), t("Основной долг", "Principal"), t("Проценты", "Interest"), t("Остаток", "Balance")],
            r.rows.map((x) => [x.n, money(x.payment, 2), money(x.principal, 2), money(x.interest, 2), money(x.balance, 2)])
        );
    }

    // ---------- вклад ----------
    function depositForm() {
        return [
            field({ id: "amount", label: t("Сумма вклада", "Deposit amount"), value: 500000, unit: "₽" }),
            field({ id: "months", label: t("Срок", "Term"), value: 12, unit: t("мес.", "months") }),
            field({ id: "rate", label: t("Процентная ставка", "Interest rate"), value: 15, unit: t("% годовых", "% per year") }),
            select({ id: "cap", label: t("Выплата процентов", "Interest payout"), value: "monthly", options: [["monthly", t("Капитализация каждый месяц", "Compounded monthly")], ["quarterly", t("Капитализация раз в квартал", "Compounded quarterly")], ["yearly", t("Капитализация раз в год", "Compounded yearly")], ["none", t("В конце срока, без капитализации", "At the end, no compounding")]] }),
            field({ id: "topup", label: t("Ежемесячное пополнение", "Monthly top-up"), value: 0, unit: "₽", hint: t("Вносится со 2-го месяца.", "Added from the 2nd month.") }),
            check({ id: "tax", label: t("Учесть налог на проценты (НДФЛ 13%)", "Include tax on interest (13%)"), checked: true }),
            field({ id: "taxfree", label: t("Необлагаемый доход за год", "Tax-free interest per year"), value: 160000, unit: "₽", hint: t("1 млн ₽ × ключевая ставка на 1 января. В 2026 году — 160 000 ₽.", "1 million ₽ × the key rate on 1 January. In 2026 it is 160,000 ₽.") })
        ];
    }

    function runDeposit() {
        const amount = read("amount");
        const months = read("months");
        const rate = read("rate");
        const topup = read("topup") || 0;
        const tax = document.getElementById("tax").checked;
        const taxfree = read("taxfree");
        document.getElementById("taxfree").disabled = !tax;
        if (!(amount > 0)) return showError(t("Введите сумму вклада.", "Enter the deposit amount."));
        if (!(months >= 1) || months > 120) return showError(t("Срок — от 1 до 120 месяцев.", "The term must be between 1 and 120 months."));
        if (!(rate >= 0) || rate > 100) return showError(t("Ставка должна быть от 0 до 100% годовых.", "The rate must be between 0 and 100% per year."));
        if (!(topup >= 0)) return showError(t("Пополнение указано неверно.", "The top-up is not valid."));
        const r = F.deposit({ amount, rate, months: Math.round(months), topUp: topup, capitalization: document.getElementById("cap").value, taxFree: tax ? (taxfree >= 0 ? taxfree : 0) : null });
        const stats = [
            stat(t("Итоговая сумма", "Final amount"), money(tax ? r.payoutAfterTax : r.payout, 2), "main"),
            stat(t("Доход по процентам", "Interest earned"), money(r.interest, 2), "accent"),
            stat(t("Вложено всего", "Total invested"), money(r.invested))
        ];
        if (tax) stats.push(stat(t("Налог", "Tax"), money(r.tax, 2)), stat(t("Доход после налога", "Income after tax"), money(r.interest - r.tax, 2)));
        if (r.effective !== null) stats.push(stat(t("Эффективная ставка", "Effective annual rate"), pct(r.effective)));
        out.replaceChildren(h("div", { class: "calc-stats" }, stats), bar(r.invested, r.interest, t("Вложено", "Invested"), t("Проценты", "Interest")));
        setSchedule(
            [t("Месяц", "Month"), t("Пополнение", "Top-up"), t("Проценты", "Interest"), t("Сумма на вкладе", "Balance")],
            r.rows.map((x) => [x.n, x.topUp ? money(x.topUp) : "—", money(x.interest, 2), money(x.balance, 2)])
        );
    }

    // ---------- маткапитал ----------
    const CAPITAL = { first: 728921.9, "second-new": 963243.17, "second-after": 234321.27 };

    function maternityForm() {
        const mode = h("div", { id: "mode-groups" });
        return [
            select({ id: "scenario", label: t("Размер маткапитала (с 1 февраля 2026)", "Maternity capital (from 1 February 2026)"), value: "first", options: [["first", t("На первого ребёнка — 728 921,90 ₽", "First child — 728,921.90 ₽")], ["second-new", t("На второго, если на первого не получали — 963 243,17 ₽", "Second child, no capital for the first — 963,243.17 ₽")], ["second-after", t("На второго, если на первого получали — 234 321,27 ₽", "Second child, capital for the first was received — 234,321.27 ₽")], ["custom", t("Своя сумма (остаток на сертификате)", "Custom amount (balance on the certificate)")]] }),
            field({ id: "capital", label: t("Сумма маткапитала", "Capital amount"), value: CAPITAL.first, unit: "₽" }),
            segmented({ id: "use", label: t("Как использовать", "How to use it"), value: "prepay", options: [["prepay", t("Досрочное погашение", "Early repayment")], ["down", t("Первоначальный взнос", "Down payment")]] }),
            h("div", { id: "use-prepay" },
                field({ id: "loan", label: t("Сумма ипотеки на старте", "Mortgage amount at the start"), value: 3000000, unit: "₽" }),
                field({ id: "month", label: t("Направить маткапитал через", "Apply the capital after"), value: 12, unit: t("мес.", "months") }),
                segmented({ id: "effect", label: t("После погашения", "After repayment"), value: "term", options: [["term", t("Уменьшить срок", "Shorten the term")], ["payment", t("Уменьшить платёж", "Lower the payment")]] })),
            h("div", { id: "use-down", hidden: true },
                field({ id: "price", label: t("Стоимость жилья", "Property price"), value: 6000000, unit: "₽" }),
                field({ id: "own", label: t("Свои деньги на взнос", "Your own down payment"), value: 600000, unit: "₽" })),
            field({ id: "years", label: t("Срок кредита", "Loan term"), value: 20, unit: t("лет", "years") }),
            field({ id: "rate", label: t("Процентная ставка", "Interest rate"), value: 14, unit: t("% годовых", "% per year") }),
            mode
        ];
    }

    function runMaternity() {
        const scenario = document.getElementById("scenario").value;
        const capitalInput = document.getElementById("capital");
        if (scenario !== "custom" && document.activeElement !== capitalInput && Number(capitalInput.dataset.scenario) !== 1) { /* значение подставлено при смене сценария */ }
        const use = seg("use");
        document.getElementById("use-prepay").hidden = use !== "prepay";
        document.getElementById("use-down").hidden = use !== "down";
        const capital = read("capital");
        const years = read("years");
        const rate = read("rate");
        if (!(capital > 0)) return showError(t("Введите сумму маткапитала.", "Enter the capital amount."));
        if (!(years > 0) || years > 50) return showError(t("Срок кредита — от 1 до 50 лет.", "The loan term must be between 1 and 50 years."));
        if (!(rate >= 0) || rate > 100) return showError(t("Ставка должна быть от 0 до 100% годовых.", "The rate must be between 0 and 100% per year."));
        const months = Math.round(years * 12);
        let without;
        let withCap;
        let loanWithout;
        let loanWith;
        if (use === "prepay") {
            const loan = read("loan");
            const month = Math.round(read("month"));
            if (!(loan > 0)) return showError(t("Введите сумму ипотеки.", "Enter the mortgage amount."));
            if (!(month >= 1) || month >= months) return showError(t("Месяц погашения должен быть меньше срока кредита.", "The repayment month must be before the end of the loan."));
            loanWithout = loanWith = loan;
            without = F.mortgage({ loan, rate, months });
            withCap = F.mortgage({ loan, rate, months, prepay: { month, amount: capital, mode: seg("effect") } });
        } else {
            const price = read("price");
            const own = read("own") || 0;
            if (!(price > 0)) return showError(t("Введите стоимость жилья.", "Enter the property price."));
            if (!(own >= 0)) return showError(t("Свои деньги указаны неверно.", "Your own money is not valid."));
            loanWithout = price - own;
            loanWith = price - own - capital;
            if (loanWithout <= 0) return showError(t("Своих денег хватает на всё жильё: маткапитал для ипотеки не нужен.", "Your own money covers the price: no mortgage needed."));
            without = F.mortgage({ loan: loanWithout, rate, months });
            if (loanWith <= 0) {
                out.replaceChildren(h("div", { class: "calc-stats" }, stat(t("Экономия на переплате", "Interest saved"), money(without.overpayment), "main"), stat(t("Кредит не нужен", "No loan needed"), t("Маткапитал и свои деньги покрывают всю стоимость", "Capital and your money cover the price"))));
                return setSchedule([], []);
            }
            withCap = F.mortgage({ loan: loanWith, rate, months });
        }
        const saved = without.overpayment - withCap.overpayment;
        const col = (title, r, loan) => h("div", { class: "calc-col" }, h("h3", { text: title }),
            stat(t("Сумма кредита", "Loan"), money(loan)),
            stat(t("Платёж в начале", "Payment at the start"), money(r.firstPayment, 2)),
            stat(t("Срок", "Term"), term(r.months)),
            stat(t("Переплата", "Overpayment"), money(r.overpayment)));
        const lines = [stat(t("Экономия на переплате", "Interest saved"), money(saved), "main")];
        if (withCap.months < without.months) lines.push(stat(t("Срок короче на", "Term shorter by"), term(without.months - withCap.months)));
        const payDiff = without.firstPayment - Math.max(withCap.rows[withCap.rows.length - 1].payment, withCap.rows[Math.min(withCap.rows.length - 1, use === "prepay" ? Math.round(read("month")) : 0)].payment);
        if (use === "down" || seg("effect") === "payment") lines.push(stat(t("Платёж ниже на", "Payment lower by"), money(without.firstPayment - (use === "down" ? withCap.firstPayment : withCap.rows[Math.min(withCap.rows.length - 1, Math.round(read("month")))].payment), 2)));
        void payDiff;
        out.replaceChildren(h("div", { class: "calc-compare" }, col(t("Без маткапитала", "Without the capital"), without, loanWithout), col(t("С маткапиталом", "With the capital"), withCap, loanWith)), h("div", { class: "calc-stats" }, lines));
        setSchedule(
            [t("№", "#"), t("Платёж", "Payment"), t("Досрочно", "Extra"), t("Проценты", "Interest"), t("Остаток", "Balance")],
            withCap.rows.map((x) => [x.n, money(x.payment, 2), x.extra ? money(x.extra, 2) : "—", money(x.interest, 2), money(x.balance, 2)])
        );
    }

    // ---------- запуск ----------
    const CONFIG = { mortgage: [mortgageForm, runMortgage], deposit: [depositForm, runDeposit], maternity: [maternityForm, runMaternity] };
    const cfg = CONFIG[kind];
    if (!cfg) return;
    const [build, compute] = cfg;
    const box = h("div", { class: "calc-box" }, build());
    root.append(h("div", { class: "calc-layout" }, box, h("div", { class: "calc-side" }, out, details)));

    let used = false;
    function run() {
        compute();
    }
    box.addEventListener("input", (e) => {
        if (kind === "maternity" && e.target.id === "capital") document.getElementById("scenario").value = "custom";
        run();
        if (!used) {
            used = true;
            document.dispatchEvent(new CustomEvent("konvertus:use", { detail: { kind: "calculator", name: kind } }));
        }
    });
    box.addEventListener("change", (e) => {
        if (kind === "maternity" && e.target.id === "scenario" && CAPITAL[e.target.value]) {
            const input = document.getElementById("capital");
            input.value = nfIn.format(CAPITAL[e.target.value]);
        }
        run();
    });
    run();
})();
