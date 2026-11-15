// Расчёт ипотеки (без DOM, чтобы его можно было проверять отдельно).
(function (root) {
    const MAX_MONTHS = 1200;

    // type: "annuity" | "diff"; extra — досрочный платёж каждый месяц (уменьшает срок)
    function run(S, rate, n, type, extra) {
        const r = rate / 1200;
        const annuity = r === 0 ? S / n : (S * r) / (1 - Math.pow(1 + r, -n));
        const body = S / n;
        const rows = [];
        let bal = S, interestTotal = 0, paidTotal = 0;
        for (let m = 1; m <= MAX_MONTHS && bal > 0.005; m++) {
            const interest = bal * r;
            let principal = (type === "annuity" ? annuity - interest : body) + extra;
            if (principal > bal || m === n) principal = Math.min(bal, Math.max(principal, m === n ? bal : 0));
            const payment = principal + interest;
            bal -= principal;
            interestTotal += interest;
            paidTotal += payment;
            rows.push({ m, payment, principal, interest, balance: Math.max(bal, 0) });
        }
        return { rows, interest: interestTotal, paid: paidTotal };
    }

    function mortgage({ price, down, years, rate, type, extra }) {
        if (!(price > 0)) return { error: "price" };
        if (!(down >= 0) || down >= price) return { error: "down" };
        if (!(years > 0) || years > 50) return { error: "years" };
        if (!(rate >= 0) || rate > 100) return { error: "rate" };
        extra = extra > 0 ? extra : 0;
        const S = price - down;
        const n = Math.round(years * 12);
        const base = run(S, rate, n, type, 0);
        const res = extra > 0 ? run(S, rate, n, type, extra) : base;
        return {
            loan: S, n, rows: res.rows, months: res.rows.length,
            first: res.rows[0].payment, last: res.rows[res.rows.length - 1].payment,
            interest: res.interest, paid: res.paid,
            savedInterest: base.interest - res.interest, savedMonths: base.rows.length - res.rows.length,
        };
    }

    // маткапитал: как первоначальный взнос или досрочное погашение через afterMonths месяцев (платёж пересчитывается)
    function maternity({ price, down, years, rate, capital, mode, afterMonths }) {
        const plain = mortgage({ price, down, years, rate, type: "annuity", extra: 0 });
        if (plain.error) return plain;
        if (!(capital > 0)) return { error: "capital" };
        const n = plain.n, r = rate / 1200;
        if (mode === "down") {
            if (down + capital >= price) {
                return { plain, loan: 0, payment: 0, interest: 0, paid: 0, saved: plain.interest, paymentDiff: plain.first, covered: true };
            }
            const w = mortgage({ price, down: down + capital, years, rate, type: "annuity", extra: 0 });
            return { plain, loan: w.loan, payment: w.first, interest: w.interest, paid: w.paid, saved: plain.interest - w.interest, paymentDiff: plain.first - w.first };
        }
        const k = Math.min(Math.max(Math.round(afterMonths), 0), n - 1);
        const annuity = plain.first;
        let bal = plain.loan, interest = 0;
        for (let m = 1; m <= k; m++) { const i = bal * r; interest += i; bal -= annuity - i; }
        bal = Math.max(bal - capital, 0);
        const left = n - k;
        const p2 = bal <= 0 ? 0 : r === 0 ? bal / left : (bal * r) / (1 - Math.pow(1 + r, -left));
        let b = bal;
        for (let m = 1; m <= left && b > 0.005; m++) { const i = b * r; interest += i; b -= p2 - i; }
        return { plain, loan: plain.loan, payment: p2, interest, paid: plain.loan + interest, saved: plain.interest - interest, paymentDiff: annuity - p2, covered: bal <= 0 };
    }

    const api = { run, mortgage, maternity };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    root.KonvertusMortgage = api;
})(typeof window !== "undefined" ? window : globalThis);
