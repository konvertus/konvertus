document.addEventListener("DOMContentLoaded", () => {
    const title = document.getElementById("title");
    const input = document.getElementById("input");
    const output = document.getElementById("output");
    const selectTop = document.getElementById("select-top");
    const selectBottom = document.getElementById("select-bottom");
    const swap = document.getElementById("swap");

    const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
    const MAX_LENGTH = 200;
    let valid = false; // можно ли копировать то, что сейчас в поле результата

    // Строка -> BigInt. BigInt не теряет точность на больших числах.
    function parse(text, base) {
        let s = text.trim().replace(/[\s_]/g, "").toLowerCase();
        let negative = false;
        if (s.startsWith("-")) {
            negative = true;
            s = s.slice(1);
        }
        if (!s) return null;

        if (/[.,]/.test(s)) throw new Error("Только целые числа");

        const b = BigInt(base);
        let value = 0n;
        for (const ch of s) {
            const d = DIGITS.indexOf(ch);
            if (d === -1 || d >= base) {
                throw new Error(`Недопустимая цифра: ${ch.toUpperCase()}`);
            }
            value = value * b + BigInt(d);
        }
        return negative ? -value : value;
    }

    function show(text, ok) {
        output.value = text;
        valid = ok;
    }

    function calculate() {
        const text = input.value;
        if (!text.trim()) return show("", false);
        if (text.length > MAX_LENGTH) return show("Слишком длинное число", false);

        try {
            const value = parse(text, Number(selectTop.value));
            if (value === null) return show("", false);
            show(value.toString(Number(selectBottom.value)).toUpperCase(), true);
        } catch (e) {
            show(e.message, false);
        }
    }

    function update() {
        if (title) {
            const first = selectTop.options[selectTop.selectedIndex].textContent;
            const second = selectBottom.options[selectBottom.selectedIndex].dataset.short;
            title.textContent = `${first} в ${second}`;
        }
        calculate();
    }

    input?.addEventListener("input", calculate);
    selectTop?.addEventListener("change", update);
    selectBottom?.addEventListener("change", update);

    swap?.addEventListener("click", () => {
        [selectTop.value, selectBottom.value] = [selectBottom.value, selectTop.value];
        update();
    });

    const copy = document.getElementById("copy");

    copy?.addEventListener("click", async () => {
        if (!valid || !output.value) return;

        try {
            await navigator.clipboard.writeText(output.value);
        } catch {
            output.select();
            document.execCommand("copy");
        }

        const icon = copy.querySelector("span");
        icon.textContent = "check";
        setTimeout(() => (icon.textContent = "content_copy"), 1500);
    });

    update();
});
