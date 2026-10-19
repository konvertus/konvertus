#!/usr/bin/env python3
"""Собирает курсы покупки и продажи валюты в банках в data/banks.json.

Формат файла тот же, что у tools/banks-editor.html, поэтому exchange.js
ничего менять не нужно:

    python3 tools/update_banks.py

Как это работает:
  * для каждого банка в FETCHERS есть функция, которая возвращает
    {"USD": {"buy": 81.7, "sell": 89.2}, ...}
    (buy — банк покупает валюту у клиента, sell — банк продаёт её клиенту);
  * если банк не ответил или данные выглядят странно, его прошлые курсы
    остаются как были;
  * банки без функции в FETCHERS не трогаются (их можно вносить вручную
    через banks-editor.html).
"""
from __future__ import annotations

import datetime as dt
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
BANKS_FILE = ROOT / "data" / "banks.json"
HISTORY_FILE = ROOT / "data" / "history.json"

CURRENCIES = ["USD", "EUR", "CNY", "GBP"]
MAX_DEVIATION = 0.15   # середина между покупкой и продажей не должна отличаться от курса ЦБ больше чем на 15 %
TIMEOUT = 20
RETRIES = 3
MSK = dt.timezone(dt.timedelta(hours=3))


def get_json(url: str, headers: dict | None = None):
    err = None
    for attempt in range(RETRIES):
        try:
            h = {"User-Agent": "Mozilla/5.0 (compatible; konvertus-bank-rates)", "Accept": "application/json"}
            h.update(headers or {})
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=TIMEOUT) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err = e
            if 400 <= e.code < 500 and e.code != 429:
                break  # сервер отказал: повторять бессмысленно
            time.sleep(1.5 * (attempt + 1))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            err = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"{url}: {err}")


# ---------------------------------------------------------------- банки

def fetch_tbank() -> dict:
    """Т-Банк. Публичный JSON, который использует его страница курсов.

    В ответе несколько «категорий» курса. На странице со скриншота
    («при переводе между своими счетами и оплате услуг») это DebitCardsTransfers.
    Если на сайте покажутся другие числа — посмотри в DevTools → Network
    нужную категорию и поменяй её через переменную TBANK_CATEGORY.
    """
    category = os.environ.get("TBANK_CATEGORY", "DebitCardsTransfers")
    result = {}
    reported = set()

    def report(key: str, message: str) -> None:
        # причину каждого типа показываем один раз, а не по разу на каждую валюту
        if key not in reported:
            reported.add(key)
            print("  " + message)

    for code in CURRENCIES:
        data = None
        for host in ("api.tbank.ru", "api.tinkoff.ru"):
            try:
                data = get_json(f"https://{host}/v1/currency_rates?from={code}&to=RUB")
                break
            except RuntimeError as e:
                report(host, f"{host}: {e}")
        if not isinstance(data, dict):
            continue
        rates = data.get("payload", {}).get("rates", [])
        for item in rates:
            if (item.get("category") == category
                    and item.get("fromCurrency", {}).get("name") == code
                    and item.get("toCurrency", {}).get("name") == "RUB"):
                result[code] = {"buy": item.get("buy"), "sell": item.get("sell")}
                break
        else:
            categories = sorted({str(i.get("category")) for i in rates if isinstance(i, dict)})
            report(
                "category",
                f"ответ получен, но курса {code} в категории {category} в нём нет. "
                f"resultCode: {data.get('resultCode')}; категории в ответе: {', '.join(categories) or 'нет'}"
            )
    return result


# Чтобы добавить банк: напиши fetch_<банк>() по образцу выше
# и впиши его сюда. Ключ — id банка из data/banks.json.
FETCHERS = {
    "tbank": fetch_tbank,
}


# ---------------------------------------------------------------- проверки

def cbr_rates() -> dict:
    """Последний курс ЦБ из data/history.json (рублей за 1 единицу) — для проверки на адекватность."""
    try:
        h = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
        row = h["rates"][max(h["rates"])]
        return {c: v for c, v in zip(h["codes"], row) if v}
    except (OSError, KeyError, ValueError):
        return {}


def clean(rates: dict, cbr: dict, bank_id: str) -> dict:
    out = {}
    for code, r in rates.items():
        buy, sell = r.get("buy"), r.get("sell")
        ok = all(isinstance(v, (int, float)) and v > 0 for v in (buy, sell)) and buy <= sell
        ref = cbr.get(code)
        if ok and ref:
            # сравниваем середину, а не края: у редких валют (фунт) банки ставят очень широкий разброс
            ok = abs((buy + sell) / 2 / ref - 1) <= MAX_DEVIATION
        if ok:
            out[code] = {"buy": round(float(buy), 4), "sell": round(float(sell), 4)}
        else:
            print(f"  {bank_id} {code}: подозрительные данные {r}, пропускаем")
    return out


# ---------------------------------------------------------------- main

def main() -> int:
    data = json.loads(BANKS_FILE.read_text(encoding="utf-8"))
    cbr = cbr_rates()
    changed = False
    attempted = 0
    succeeded = 0

    for bank in data["banks"]:
        fetch = FETCHERS.get(bank["id"])
        if not fetch:
            continue
        attempted += 1
        try:
            fresh = clean(fetch(), cbr, bank["id"])
        except Exception as e:  # один банк не должен ронять остальные
            print(f"{bank['id']}: ошибка — {e}")
            continue
        if not fresh:
            print(f"{bank['id']}: данных нет, оставляем прошлые курсы")
            continue
        succeeded += 1
        merged = {**bank.get("rates", {}), **fresh}
        if merged != bank.get("rates"):
            bank["rates"] = merged
            changed = True
        details = ", ".join("{} {}/{}".format(c, r["buy"], r["sell"]) for c, r in fresh.items())
        print(f"{bank['id']}: {details}")

    if attempted and not succeeded:
        # строка ::warning:: в GitHub Actions превращается в жёлтую отметку в журнале запуска
        print("::warning::Ни один банк не отдал курсы. Курсы на сайте не обновлялись, проверьте адреса в tools/update_banks.py")

    if not changed:
        print("Изменений нет.")
        return 0

    have = {c for b in data["banks"] for c in b.get("rates", {})}
    data["currencies"] = [c for c in CURRENCIES if c in have]
    data["demo"] = False
    data["updated"] = dt.datetime.now(MSK).replace(microsecond=0).isoformat()
    BANKS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Сохранено:", BANKS_FILE.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())