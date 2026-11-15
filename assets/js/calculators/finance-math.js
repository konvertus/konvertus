// Формулы финансовых калькуляторов. Чистые функции без обращения к странице:
// подключаются на страницах калькуляторов и проверяются в Node (tools/test_finance.js).
(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.KonvertusFinance = api;
})(typeof self !== "undefined" ? self : this, function () {
    const EPS = 0.005; // меньше полкопейки считаем нулём

    // аннуитетный платёж: ставка в процентах годовых, срок в месяцах
    function annuityPayment(loan, ratePct, months) {
        if (months <= 0) return 0;
        const r = ratePct / 1200;
        if (r === 0) return loan / months;
        return (loan * r) / (1 - Math.pow(1 + r, -months));
    }

    // График платежей по кредиту.
    // type: "annuity" (равные платежи) или "diff" (равные доли основного долга).
    // prepay (только для annuity): { month, amount, mode } — досрочное погашение в конце месяца month,
    //   mode "term" — платёж прежний, срок короче; "payment" — срок прежний, платёж меньше.
    function mortgage({ loan, rate, months, type = "annuity", prepay = null }) {
        if (!(loan > 0) || !(months > 0) || rate < 0) return null;
        const r = rate / 1200;
        const rows = [];
        let balance = loan;
        let payment = annuityPayment(loan, rate, months);
        const principalFixed = loan / months;
        let totalPaid = 0;
        let totalInterest = 0;
        for (let n = 1; n <= months && balance > EPS; n++) {
            const interest = balance * r;
            let principal;
            let pay;
            if (type === "diff") {
                principal = Math.min(principalFixed, balance);
                pay = principal + interest;
            } else {
                pay = Math.min(payment, balance + interest);
                principal = pay - interest;
            }
            balance = balance - principal;
            if (balance < EPS) balance = 0;
            totalPaid += pay;
            totalInterest += interest;
            const row = { n, payment: pay, principal, interest, extra: 0, balance };
            rows.push(row);
            if (type === "annuity" && prepay && n === prepay.month && balance > EPS && prepay.amount > 0) {
                const extra = Math.min(prepay.amount, balance);
                balance -= extra;
                if (balance < EPS) balance = 0;
                totalPaid += extra;
                row.extra = extra;
                row.balance = balance;
                if (prepay.mode === "payment" && balance > EPS) payment = annuityPayment(balance, rate, months - n);
            }
        }
        return {
            rows,
            loan,
            totalPaid,
            overpayment: totalInterest,
            months: rows.length,
            firstPayment: rows.length ? rows[0].payment : 0,
            lastPayment: rows.length ? rows[rows.length - 1].payment : 0
        };
    }

    // Вклад. capitalization: "none" (проценты в конце срока), "monthly", "quarterly", "yearly".
    // topUp — ежемесячное пополнение (со 2-го месяца).
    // taxFree — необлагаемый доход за год (null — налог не считать), taxRate — ставка в процентах.
    // Налог считается по каждому 12-месячному отрезку вклада отдельно.
    function deposit({ amount, rate, months, topUp = 0, capitalization = "monthly", taxFree = null, taxRate = 13 }) {
        if (!(amount > 0) || !(months > 0) || rate < 0) return null;
        const every = { none: Infinity, monthly: 1, quarterly: 3, yearly: 12 }[capitalization];
        const r = rate / 1200;
        let balance = amount; // сумма, на которую начисляются проценты
        let pending = 0; // начислено, но ещё не присоединено к вкладу
        let invested = amount;
        let interestTotal = 0;
        let yearInterest = 0;
        let tax = 0;
        const rows = [];
        const yearEnd = () => {
            if (taxFree !== null) tax += (Math.max(0, yearInterest - taxFree) * taxRate) / 100;
            yearInterest = 0;
        };
        for (let m = 1; m <= months; m++) {
            let add = 0;
            if (m > 1 && topUp > 0) {
                add = topUp;
                balance += add;
                invested += add;
            }
            const interest = balance * r;
            pending += interest;
            interestTotal += interest;
            yearInterest += interest;
            if (m % every === 0) {
                balance += pending;
                pending = 0;
            }
            rows.push({ n: m, topUp: add, interest, balance: balance + pending });
            if (m % 12 === 0) yearEnd();
        }
        if (months % 12 !== 0) yearEnd();
        const payout = balance + pending;
        const effective = topUp > 0 ? null : (Math.pow(payout / amount, 12 / months) - 1) * 100;
        return { rows, invested, interest: interestTotal, payout, tax, payoutAfterTax: payout - tax, effective };
    }

    return { annuityPayment, mortgage, deposit };
});
