document.addEventListener("DOMContentLoaded", () => {
    const title = document.getElementById("title");
    const input = document.getElementById("input");
    const output = document.getElementById("output");
    const selectTop = document.getElementById("select-top");
    const selectBottom = document.getElementById("select-bottom");
    const swap = document.getElementById("swap");

    function calculate() {
        const val = parseFloat(input.value);
        if (isNaN(val)) {
            output.value = "";
            return;
        }

        const from = Number(selectTop.value);
        const to = Number(selectBottom.value);

        // Расчет и округление без лишних преобразований
        const result = (val * from) / to;
        output.value = Number(result.toFixed(8)); // Автоматически убирает лишние нули в конце
    }

    function update() {
        if (title) {
            const first = selectTop.options[selectTop.selectedIndex].textContent;
            const second = selectBottom.options[selectBottom.selectedIndex].textContent;
            title.textContent = `${first} в ${second.toLowerCase()}`;
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
        if (!output.value) return;

        try {
            await navigator.clipboard.writeText(output.value);
        } catch {
            // запасной вариант, если страница открыта без https/localhost
            output.select();
            document.execCommand("copy");
        }

        const icon = copy.querySelector("span");
        icon.textContent = "check";
        setTimeout(() => (icon.textContent = "content_copy"), 1500);
    });
    
    // Инициализация стартового заголовка при загрузке
    update();
});