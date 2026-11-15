// Расчёт вклада (без DOM). Проценты начисляются помесячно, капитализация — по выбранному периоду.
(function (root) {
    const TAX_LIMIT = 160000;   // необлагаемые проценты за 2026 год: 1 млн × ключевая ставка 16%
    const TAX_RATE = 0.13;
    const EVERY = { end: Infinity, monthly: 1, quarterly: 3, yearly: 12 };

    function deposit({ amount, months, rate, cap, topup, tax }) {
        if (!(amount > 0)) return { error: "amount" };
        if (!(months >= 1) || months > 600) return { error: "months" };
        if (!(rate >= 0) || rate > 100) return { error: "rate" };
        const every = EVERY[cap] || Infinity;
        topup = topup > 0 ? topup : 0;
        const r = rate / 1200;
        let bal = amount, pending = 0, contributed = amount, chunk = 0, taxTotal = 0;
        for (let m = 1; m <= months; m++) {
            const i = bal * r;
            pending += i;
            chunk += i;
            if (m % every === 0) { bal += pending; pending = 0; }
            if (m % 12 === 0 || m === months) {   // упрощённо: лимит считается по каждым 12 месяцам вклада
                if (tax) taxTotal += Math.max(0, chunk - TAX_LIMIT) * TAX_RATE;
                chunk = 0;
            }
            if (m < months && topup > 0) { bal += topup; contributed += topup; }
        }
        const final = bal + pending;
        const interest = final - contributed;
        const result = { final, interest, contributed, tax: taxTotal, net: final - taxTotal, netInterest: interest - taxTotal };
        if (topup === 0) result.effective = (Math.pow(result.net / amount, 12 / months) - 1) * 100;
        return result;
    }

    const api = { deposit, TAX_LIMIT, TAX_RATE };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    root.KonvertusDeposit = api;
})(typeof window !== "undefined" ? window : globalThis);
