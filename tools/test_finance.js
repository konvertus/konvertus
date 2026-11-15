// Проверка формул калькуляторов: node tools/test_finance.js
const F = require("../assets/js/calculators/finance-math.js");
let failed = 0;
const eq = (name, got, want, tol = 0.01) => {
    const ok = Math.abs(got - want) <= tol;
    if (!ok) failed++;
    console.log((ok ? "ok   " : "FAIL ") + name + ": " + got + (ok ? "" : " (ожидалось " + want + ")"));
};

// 3 000 000 на 20 лет под 12% — платёж 30 000 / (1 − 1,01^−240) = 33 032,58 ₽ (проверено вручную)
const m = F.mortgage({ loan: 3000000, rate: 12, months: 240 });
eq("аннуитет: платёж", m.firstPayment, 33032.58);
eq("аннуитет: платежей", m.months, 240, 0);
eq("аннуитет: переплата = выплачено − долг", m.overpayment, m.totalPaid - 3000000, 0.5);
eq("аннуитет: остаток на конец = 0", m.rows[m.rows.length - 1].balance, 0, 0.01);

// дифференцированные: первый платёж = долг/n + долг*r
const d = F.mortgage({ loan: 1200000, rate: 12, months: 12, type: "diff" });
eq("дифф: первый платёж", d.firstPayment, 100000 + 12000);
eq("дифф: последний платёж", d.lastPayment, 100000 + 1000);
eq("дифф: переплата", d.overpayment, 78000);

// нулевая ставка
const z = F.mortgage({ loan: 120000, rate: 0, months: 12 });
eq("ставка 0: платёж", z.firstPayment, 10000);
eq("ставка 0: переплата", z.overpayment, 0);

// досрочное погашение 500 000 после 12-го месяца: срок короче
const base = F.mortgage({ loan: 3000000, rate: 12, months: 240 });
const t = F.mortgage({ loan: 3000000, rate: 12, months: 240, prepay: { month: 12, amount: 500000, mode: "term" } });
const p = F.mortgage({ loan: 3000000, rate: 12, months: 240, prepay: { month: 12, amount: 500000, mode: "payment" } });
console.log("срок без досрочки/с досрочкой (срок короче)/с досрочкой (платёж меньше):", base.months, t.months, p.months);
if (!(t.months < 240 && p.months === 240 && t.overpayment < base.overpayment && p.overpayment < base.overpayment && t.overpayment < p.overpayment)) { failed++; console.log("FAIL досрочное погашение"); }
eq("досрочка: платёж уменьшился", p.rows[12].payment < p.rows[0].payment ? 1 : 0, 1, 0);
eq("досрочка(term): остаток 0", t.rows[t.rows.length - 1].balance, 0, 0.01);
eq("досрочка(payment): остаток 0", p.rows[p.rows.length - 1].balance, 0, 0.01);
eq("досрочка: выплачено − долг = переплата", t.totalPaid - 3000000, t.overpayment, 0.5);

// вклад: 100 000 на 12 месяцев, 12%, ежемесячная капитализация = 112 682,50
const a = F.deposit({ amount: 100000, rate: 12, months: 12, capitalization: "monthly" });
eq("вклад: капитализация ежемесячно", a.payout, 112682.5);
eq("вклад: эффективная ставка", a.effective, 12.6825, 0.001);
// без капитализации: простые проценты 12 000
const b = F.deposit({ amount: 100000, rate: 12, months: 12, capitalization: "none" });
eq("вклад: без капитализации", b.interest, 12000);
// квартальная
const q = F.deposit({ amount: 100000, rate: 12, months: 12, capitalization: "quarterly" });
eq("вклад: квартальная капитализация", q.payout, 100000 * Math.pow(1.03, 4), 0.01);
// налог: 1 000 000 под 20% на год без капитализации — проценты 200 000, лимит 160 000, налог 13% от 40 000 = 5 200
const x = F.deposit({ amount: 1000000, rate: 20, months: 12, capitalization: "none", taxFree: 160000 });
eq("вклад: налог", x.tax, 5200);
eq("вклад: после налога", x.payoutAfterTax, 1200000 - 5200);
// пополнение 10 000 в месяц, ставка 0 — просто сумма взносов
const y = F.deposit({ amount: 100000, rate: 0, months: 6, topUp: 10000, capitalization: "monthly" });
eq("вклад: пополнения при ставке 0", y.payout, 150000);
eq("вклад: вложено", y.invested, 150000);

console.log(failed ? "\nОШИБОК: " + failed : "\nвсе проверки пройдены");
process.exit(failed ? 1 : 0);
