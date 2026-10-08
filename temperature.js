document.addEventListener("DOMContentLoaded", () => {
    const title = document.getElementById("title");
    const input = document.getElementById("input");
    const output = document.getElementById("output");
    const selectTop = document.getElementById("select-top");
    const selectBottom = document.getElementById("select-bottom");
    const swap = document.getElementById("swap");

    // Температуры нельзя просто умножать: у шкал разный ноль.
    // Поэтому всё переводим через Цельсий: из исходной шкалы в °C, потом из °C в нужную.
    const toC = {
        c:  v => v,
        f:  v => (v - 32) * 5 / 9,
        k:  v => v - 273.15,
        r:  v => (v - 491.67) * 5 / 9,
        re: v => v * 5 / 4
    };
    const fromC = {
        c:  v => v,
        f:  v => v * 9 / 5 + 32,
        k:  v => v + 273.15,
        r:  v => (v + 273.15) * 9 / 5,
        re: v => v * 4 / 5
    };

    function calculate() {
        const val = parseFloat(input.value);
        if (isNaN(val)) {
            output.value = "";
            return;
        }

        const celsius = toC[selectTop.value](val);

        // ниже абсолютного нуля температуры не бывает
        if (celsius < -273.15 - 1e-9) {
            output.value = "Ниже абсолютного нуля";
            return;
        }

        const result = fromC[selectBottom.value](celsius);
        output.value = Number(result.toFixed(6));
    }

    function update() {
        if (title) {
            const first = selectTop.options[selectTop.selectedIndex].textContent;
            const second = selectBottom.options[selectBottom.selectedIndex].textContent;
            // названия шкал — имена собственные, поэтому с большой буквы
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
        if (!output.value || isNaN(Number(output.value))) return;

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
