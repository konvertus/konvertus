// Вход через Firebase и личная статистика использования (только с согласием пользователя).
// Работает, когда в firebase-config.js указаны настройки; иначе ничего не делает и ничего не показывает.
(function () {
    "use strict";
    const config = window.KONVERTUS_FIREBASE;
    if (!config || !config.apiKey) return;

    const EN = document.documentElement.lang === "en";
    const t = (ru, en) => (EN ? en : ru);
    const SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
    const SCRIPT = document.currentScript;
    const BASE = SCRIPT ? new URL("../../../", SCRIPT.src) : new URL("./", location.href);
    const PRIVACY = new URL(EN ? "en/privacy.html" : "ru/privacy.html", BASE).href;

    const CATEGORY_NAMES = {
        length: t("Длина", "Length"), mass: t("Масса", "Mass"), temperature: t("Температура", "Temperature"),
        speed: t("Скорость", "Speed"), currency: t("Валюты", "Currencies"), data: t("Данные", "Data"),
        numbers: t("Системы счисления", "Number systems"), area: t("Площадь", "Area"), volume: t("Объём", "Volume"),
        calculators: t("Калькуляторы", "Calculators"),
    };
    const OFFERS = {
        mortgage: { score: (s) => (s.pairs["calculators_mortgage"] || 0) + (s.pairs["calculators_maternity-capital"] || 0),
            links: [["https://www.banki.ru/products/hypothec/", t("Ипотечные кредиты на Банки.ру", "Mortgage loans on Banki.ru")]] },
        deposit: { score: (s) => (s.pairs["calculators_deposit"] || 0) + (s.cats["currency"] || 0),
            links: [["https://www.banki.ru/products/deposits/", t("Вклады и счета на Банки.ру", "Deposits on Banki.ru")]] },
        credit: { score: (s) => (s.pairs["calculators_credit"] || 0),
            links: [["https://www.banki.ru/products/credits/", t("Кредиты на Банки.ру", "Loans on Banki.ru")]] },
    };

    let auth, db, fs, authApi, user = null, profile = null, mode = "in", busy = false, message = "";
    let button, overlay, dialog, lastFocus;

    // ---------- стили и кнопка ----------
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = new URL("assets/css/account.css?v=23", BASE).href;
    document.head.append(css);

    function makeButton() {
        const tools = window.konvertusTools && window.konvertusTools();
        if (!tools) return;
        button = document.createElement("button");
        button.type = "button";
        button.className = "tool-btn account-btn";
        button.setAttribute("aria-label", t("Вход и аккаунт", "Sign in and account"));
        button.innerHTML = '<svg class="tool-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/>'
            + '<path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        button.addEventListener("click", openDialog);
        tools.prepend(button);
    }

    // ---------- окно ----------
    function openDialog() {
        lastFocus = document.activeElement;
        overlay = document.createElement("div");
        overlay.className = "account-overlay";
        overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) closeDialog(); });
        dialog = document.createElement("div");
        dialog.className = "account-dialog";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        overlay.append(dialog);
        document.body.append(overlay);
        document.addEventListener("keydown", onKey);
        message = "";
        render();
        if (user) loadProfile().then(render);   // свежие счётчики
    }

    function closeDialog() {
        if (!overlay) return;
        document.removeEventListener("keydown", onKey);
        overlay.remove();
        overlay = dialog = null;
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function onKey(e) { if (e.key === "Escape") closeDialog(); }

    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    function render() {
        if (!dialog) return;
        const head = `<div class="account-head"><h2>${user ? t("Аккаунт", "Account") : mode === "up" ? t("Регистрация", "Sign up") : t("Вход", "Sign in")}</h2>
            <button type="button" class="account-close" aria-label="${t("Закрыть", "Close")}">×</button></div>`;
        dialog.innerHTML = head + (user ? accountHtml() : formHtml()) + `<p class="account-msg" role="alert">${esc(message)}</p>`;
        dialog.querySelector(".account-close").addEventListener("click", closeDialog);
        if (user) bindAccount(); else bindForm();
    }

    // ---------- форма входа ----------
    function formHtml() {
        const up = mode === "up";
        return `<form class="account-form" novalidate>
            <label><span>Email</span><input type="email" name="email" autocomplete="email" required></label>
            <label><span>${t("Пароль", "Password")}</span><input type="password" name="password" autocomplete="${up ? "new-password" : "current-password"}" minlength="6" required></label>
            <button type="submit" class="account-primary"${busy ? " disabled" : ""}>${up ? t("Создать аккаунт", "Create account") : t("Войти", "Sign in")}</button>
        </form>
        <button type="button" class="account-google"${busy ? " disabled" : ""}>${t("Войти через Google", "Continue with Google")}</button>
        <div class="account-links">
            <button type="button" class="account-link" data-act="switch">${up ? t("Уже есть аккаунт? Войти", "Have an account? Sign in") : t("Нет аккаунта? Зарегистрироваться", "No account? Sign up")}</button>
            ${up ? "" : `<button type="button" class="account-link" data-act="reset">${t("Забыли пароль?", "Forgot password?")}</button>`}
        </div>
        <p class="account-small">${t("Вход нужен только для личной статистики и подборок. Конвертеры работают и без него.", "Signing in is only needed for personal statistics and recommendations. Converters work without it.")}
            <a href="${PRIVACY}">${t("Конфиденциальность", "Privacy")}</a></p>`;
    }

    function bindForm() {
        const form = dialog.querySelector("form");
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = form.email.value.trim();
            const password = form.password.value;
            if (!email || !password) { setMessage(t("Введите email и пароль.", "Enter your email and password.")); return; }
            await run(() => (mode === "up" ? authApi.createUserWithEmailAndPassword(auth, email, password) : authApi.signInWithEmailAndPassword(auth, email, password)));
        });
        dialog.querySelector(".account-google").addEventListener("click", () => run(() => authApi.signInWithPopup(auth, new authApi.GoogleAuthProvider())));
        dialog.querySelector('[data-act="switch"]').addEventListener("click", () => { mode = mode === "up" ? "in" : "up"; message = ""; render(); });
        const reset = dialog.querySelector('[data-act="reset"]');
        if (reset) reset.addEventListener("click", async () => {
            const email = form.email.value.trim();
            if (!email) { setMessage(t("Введите email, на него придёт ссылка для сброса пароля.", "Enter your email to get a reset link.")); return; }
            await run(async () => { await authApi.sendPasswordResetEmail(auth, email); setMessage(t("Письмо отправлено. Проверьте почту.", "Email sent. Check your inbox."), false); });
        });
        form.email.focus();
    }

    // ---------- аккаунт ----------
    function accountHtml() {
        const consent = !!(profile && profile.consent);
        const stats = readStats();
        return `<p class="account-email"></p>
            <label class="account-check"><input type="checkbox" id="account-consent"${consent ? " checked" : ""}>
                <span>${t("Разрешить учитывать, какими конвертерами я пользуюсь, для статистики и персональных подборок.", "Allow counting which converters I use for statistics and personalized recommendations.")}
                <a href="${PRIVACY}">${t("Подробнее", "Details")}</a></span></label>
            <h3>${t("Избранное", "Favorites")}</h3>
            ${listHtml(favs(), t("Нажмите ☆ рядом с заголовком любого конвертера.", "Click ☆ next to any converter's title."))}
            ${consent ? `<h3>${t("Недавние", "Recent")}</h3>${listHtml((profile.recent || []), t("Пока пусто.", "Nothing yet."))}` : ""}
            ${consent ? statsHtml(stats) : `<p class="account-small">${t("Без согласия ничего не считается.", "Nothing is counted without consent.")}</p>`}
            <div class="account-actions">
                ${consent ? `<button type="button" class="account-link" data-act="reset-stats">${t("Сбросить статистику", "Reset statistics")}</button>` : ""}
                <button type="button" class="account-link" data-act="delete">${t("Удалить аккаунт и данные", "Delete account and data")}</button>
                <button type="button" class="account-primary" data-act="out">${t("Выйти", "Sign out")}</button>
            </div>`;
    }

    function readStats() {
        const s = (profile && profile.stats) || {};
        return { cats: s.cats || {}, pairs: s.pairs || {} };
    }

    function statsHtml(stats) {
        const top = Object.entries(stats.cats).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const list = top.length
            ? `<ul class="account-stats">${top.map(([k, n]) => `<li><span>${esc(CATEGORY_NAMES[k] || k)}</span><b>${n}</b></li>`).join("")}</ul>`
            : `<p class="account-small">${t("Пока пусто: пользуйтесь конвертерами, и здесь появится статистика.", "Nothing yet: use the converters and your statistics will appear here.")}</p>`;
        const offers = Object.values(OFFERS).map((o) => ({ s: o.score(stats), links: o.links })).filter((o) => o.s > 0).sort((a, b) => b.s - a.s);
        const recs = offers.length
            ? `<h3>${t("Подборка для вас", "Picked for you")}</h3><ul class="account-offers">${offers.flatMap((o) => o.links).map(([u, n]) => `<li><a href="${u}" target="_blank" rel="noopener noreferrer">${esc(n)}</a></li>`).join("")}</ul>`
            : "";
        return `<h3>${t("Ваша статистика", "Your statistics")}</h3>${list}${recs}`;
    }

    function bindAccount() {
        dialog.querySelector(".account-email").textContent = user.email || user.displayName || "";
        dialog.querySelector("#account-consent").addEventListener("change", async (e) => {
            await run(async () => { await saveProfile({ consent: e.target.checked, consentAt: fs.serverTimestamp() }); });
        });
        dialog.querySelector('[data-act="out"]').addEventListener("click", () => run(() => authApi.signOut(auth)));
        const rs = dialog.querySelector('[data-act="reset-stats"]');
        if (rs) rs.addEventListener("click", () => run(async () => { await fs.updateDoc(userRef(), { stats: fs.deleteField() }); await loadProfile(); render(); }));
        dialog.querySelector('[data-act="delete"]').addEventListener("click", () => {
            if (!confirm(t("Удалить аккаунт и всю сохранённую статистику? Это нельзя отменить.", "Delete your account and all saved statistics? This cannot be undone."))) return;
            run(async () => {
                try { await fs.deleteDoc(userRef()); } catch (e) { /* документа могло не быть */ }
                await authApi.deleteUser(auth.currentUser);
                setMessage(t("Аккаунт и данные удалены.", "Account and data deleted."), false);
            });
        });
    }

    // ---------- избранное и недавние ----------
    const PAGE = (location.pathname.match(/(converters\/[^/]+\/[^/]+|calculators\/[^/]+)\.html$/) || [])[1] || null;
    const pageTitle = () => ((document.getElementById("title") || document.querySelector("h1") || {}).textContent || PAGE).trim();
    const favs = () => (profile && profile.favs) || [];
    const isFav = () => favs().some((f) => f.p === PAGE);
    const pageUrl = (p) => new URL((EN ? "en/" : "ru/") + p + ".html", BASE).href;
    let star;

    function makeStar() {
        const host = PAGE && document.querySelector(".converter-box, .calc-box");
        if (!host) return;
        star = document.createElement("button");
        star.type = "button";
        star.className = "fav-btn";
        star.hidden = true;
        star.addEventListener("click", async () => {
            if (!user) { openDialog(); return; }
            const item = { p: PAGE, n: pageTitle() };
            try {
                await fs.setDoc(userRef(), { favs: isFav() ? favs().filter((f) => f.p !== PAGE) : [...favs(), item].slice(-50) }, { merge: true });
                await loadProfile();
            } catch (e) { console.warn("account:", e); }
            updateStar();
        });
        host.prepend(star);
        updateStar();
    }

    function renderHomeFavs() {
        const wrap = document.getElementById("home-favs");
        if (!wrap) return;
        const list = document.getElementById("home-favs-list");
        const items = user ? favs() : [];
        wrap.hidden = !user;
        document.getElementById("home-favs-empty").hidden = items.length > 0;
        list.innerHTML = items.map((f) => {
            const cat = f.p.startsWith("calculators/") ? "calc" : f.p.split("/")[1];
            return `<a href="${pageUrl(f.p)}" class="card"><span class="cat-icon card-icon cat-${esc(cat)}" aria-hidden="true"></span>${esc(f.n)}</a>`;
        }).join("");
    }

    function updateStar() {
        renderHomeFavs();
        if (!star) return;
        star.hidden = false;
        const on = !!user && isFav();
        star.classList.toggle("is-on", on);
        star.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>`;
        const label = !user ? t("Войдите, чтобы сохранять избранное", "Sign in to save favorites")
            : on ? t("Убрать из избранного", "Remove from favorites") : t("Добавить в избранное", "Add to favorites");
        star.title = label;
        star.setAttribute("aria-label", label);
    }

    function listHtml(items, empty) {
        return items.length
            ? `<ul class="account-offers">${items.map((f) => `<li><a href="${pageUrl(f.p)}">${esc(f.n)}</a></li>`).join("")}</ul>`
            : `<p class="account-small">${empty}</p>`;
    }

    // ---------- данные ----------
    const userRef = () => fs.doc(db, "users", user.uid);

    async function loadProfile() {
        try {
            const snap = await fs.getDoc(userRef());
            profile = snap.exists() ? snap.data() : {};
        } catch (e) { profile = {}; }
    }

    async function saveProfile(patch) {
        await fs.setDoc(userRef(), patch, { merge: true });
        await loadProfile();
        render();
    }

    // ---------- подсчёт использования (только вошедшие и согласившиеся) ----------
    let counted = false;
    function trackUse() {
        if (counted || !user || !profile || !profile.consent) return;
        const m = location.pathname.match(/(?:^|\/)(?:converters\/([^/]+)\/([^/]+)|(calculators)\/([^/]+))\.html$/);
        if (!m) return;
        const cat = m[1] || m[3];
        const page = m[2] || m[4];
        counted = true;
        fs.setDoc(userRef(), {
            stats: { cats: { [cat]: fs.increment(1) }, pairs: { [`${cat}_${page}`]: fs.increment(1) } },
            lastActive: fs.serverTimestamp(),
            recent: [{ p: PAGE, n: pageTitle() }, ...((profile.recent || []).filter((r) => r.p !== PAGE))].slice(0, 8),
        }, { merge: true }).catch(() => { counted = false; });
    }

    let timer = 0;
    document.addEventListener("input", (e) => {
        if (counted || !e.target.closest || !e.target.closest("#input, .calc-box")) return;
        clearTimeout(timer);
        timer = setTimeout(trackUse, 1500);
    }, true);

    // ---------- вспомогательное ----------
    function setMessage(text, isError = true) {
        message = text;
        if (dialog) {
            const el = dialog.querySelector(".account-msg");
            if (el) { el.textContent = text; el.classList.toggle("is-ok", !isError); }
        }
    }

    const ERRORS = {
        "auth/invalid-email": t("Некорректный email.", "Invalid email."),
        "auth/missing-password": t("Введите пароль.", "Enter a password."),
        "auth/invalid-credential": t("Неверный email или пароль.", "Wrong email or password."),
        "auth/wrong-password": t("Неверный email или пароль.", "Wrong email or password."),
        "auth/user-not-found": t("Неверный email или пароль.", "Wrong email or password."),
        "auth/email-already-in-use": t("Этот email уже зарегистрирован. Попробуйте войти.", "This email is already registered. Try signing in."),
        "auth/weak-password": t("Пароль слишком простой: нужно минимум 6 символов.", "The password is too weak: use at least 6 characters."),
        "auth/too-many-requests": t("Слишком много попыток. Подождите немного.", "Too many attempts. Please wait a bit."),
        "auth/network-request-failed": t("Нет соединения с интернетом.", "No internet connection."),
        "auth/popup-closed-by-user": t("Окно входа закрыто.", "The sign-in window was closed."),
        "auth/popup-blocked": t("Браузер заблокировал окно входа. Разрешите всплывающие окна.", "The browser blocked the sign-in window. Allow pop-ups."),
        "auth/unauthorized-domain": t("Этот адрес сайта не добавлен в Firebase (Authentication → Settings → Authorized domains).", "This site address is not added in Firebase (Authentication → Settings → Authorized domains)."),
        "auth/operation-not-allowed": t("Этот способ входа не включён в Firebase.", "This sign-in method is not enabled in Firebase."),
        "auth/requires-recent-login": t("Для удаления войдите заново и повторите.", "Please sign in again and retry the deletion."),
        "permission-denied": t("Нет доступа к данным: проверьте правила Firestore (firestore.rules).", "No access to the data: check the Firestore rules (firestore.rules)."),
    };

    async function run(action) {
        busy = true;
        try {
            await action();
            if (!user) message = "";
        } catch (e) {
            console.warn("account:", e);
            message = ERRORS[e && e.code] || t("Что-то пошло не так. Попробуйте ещё раз.", "Something went wrong. Please try again.");
        }
        busy = false;
        render();
    }

    // ---------- запуск ----------
    async function start() {
        makeButton();
        if (!button) return;
        makeStar();
        const [app, a, f] = await Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js"), import(SDK + "firebase-firestore.js")]);
        const fbApp = app.initializeApp(config);
        authApi = a; fs = f;
        auth = a.getAuth(fbApp);
        db = f.getFirestore(fbApp);
        a.onAuthStateChanged(auth, async (u) => {
            user = u;
            profile = null;
            button.classList.toggle("is-in", !!u);
            if (u) { await loadProfile(); trackUse(); }
            if (u && !message) mode = "in";
            updateStar();
            render();
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => start().catch((e) => console.warn("account:", e)));
    else start().catch((e) => console.warn("account:", e));
})();
