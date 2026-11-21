// Расчёт вклада (без DOM). Проценты начисляются помесячно, капитализация — по выбранному периоду.
// Пополнение вносится в конце каждого месяца, кроме последнего: взнос в конце месяца m работает (срок − m) месяцев.
// Например, у вклада на год взнос в конце 4-го месяца работает 8 месяцев (с 5-го по 12-й).
(function (root) {
    const TAX_LIMIT = 160000;   // необлагаемые проценты за 2026 год: 1 млн × ключевая ставка 16%
    const TAX_RATE = 0.13;
    const EVERY = { end: Infinity, monthly: 1, quarterly: 3, yearly: 12 };

    function deposit({ amount, months, rate, cap, topup, tax, taxRate = TAX_RATE * 100 }) {
        if (!(amount > 0)) return { error: "amount" };
        if (!(months >= 1) || months > 600) return { error: "months" };
        if (!(rate >= 0) || rate > 100) return { error: "rate" };
        if (tax && (!(taxRate >= 0) || taxRate > 100)) return { error: "taxrate" };
        const taxShare = taxRate / 100;
        const every = EVERY[cap] || Infinity;
        topup = topup > 0 ? topup : 0;
        const r = rate / 1200;
        let bal = amount, pending = 0, contributed = amount, chunk = 0, taxTotal = 0;
        // график по месяцам: проценты, капитализация, пополнение и сумма на счёте (с учётом начисленных процентов)
        const schedule = [{ m: 0, topup: amount, works: months, interest: 0, credited: 0, balance: amount }];
        for (let m = 1; m <= months; m++) {
            const i = bal * r;
            pending += i;
            chunk += i;
            let credited = 0;
            if (m % every === 0) { credited = pending; bal += pending; pending = 0; }
            if (m % 12 === 0 || m === months) {   // упрощённо: лимит считается по каждым 12 месяцам вклада
                if (tax) taxTotal += Math.max(0, chunk - TAX_LIMIT) * taxShare;
                chunk = 0;
            }
            let added = 0;
            if (m < months && topup > 0) { added = topup; bal += topup; contributed += topup; }
            schedule.push({ m, topup: added, works: added ? months - m : 0, interest: i, credited, balance: bal + pending });
        }
        const final = bal + pending;
        const interest = final - contributed;
        const result = { final, interest, contributed, tax: taxTotal, net: final - taxTotal, netInterest: interest - taxTotal, schedule };
        if (topup === 0) result.effective = (Math.pow(result.net / amount, 12 / months) - 1) * 100;
        return result;
    }

    const api = { deposit, TAX_LIMIT, TAX_RATE };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    root.KonvertusDeposit = api;
})(typeof window !== "undefined" ? window : globalThis);
