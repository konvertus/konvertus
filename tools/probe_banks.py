#!/usr/bin/env python3
"""Проверяет, что отвечает каждый источник курсов из GitHub Actions (или с твоего компьютера).

Печатает код ответа, тип и первые символы, а для Т-Банка все категории курсов.
По этому выводу пишутся fetcher'ы в update_banks.py. Ничего не сохраняет.
"""
import json
import sys
import urllib.request

sys.path.insert(0, __import__("os").path.dirname(__file__))
from update_banks import ssl_context  # noqa: E402

CANDIDATES = {
    "tbank-api": "https://api.tbank.ru/v1/currency_rates?from=USD&to=RUB",
    "tbank-api-old": "https://api.tinkoff.ru/v1/currency_rates?from=USD&to=RUB",
    "tbank-page": "https://www.tbank.ru/about/exchange-rates/",
    "sber": "https://www.sberbank.ru/ru/quotes/currencies",
    "alfa": "https://alfabank.ru/currency/",
    "vtb": "https://www.vtb.ru/personal/platezhi-i-perevody/obmen-valjuty/",
    "gpb": "https://www.gazprombank.ru/personal/currency-rates/",
}


def main() -> None:
    for name, url in CANDIDATES.items():
        print(f"\n=== {name}: {url}")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json,text/html"})
        try:
            with urllib.request.urlopen(req, timeout=20, context=ssl_context()) as r:
                body = r.read(400000).decode("utf-8", "replace")
                print("HTTP", r.status, r.headers.get("Content-Type"), len(body), "байт")
        except Exception as e:  # noqa: BLE001
            print("ОШИБКА:", e)
            continue
        if name.startswith("tbank-api"):
            try:
                rates = json.loads(body).get("payload", {}).get("rates", [])
                for it in rates:
                    print(" ", it.get("category"), it.get("buy"), it.get("sell"))
            except ValueError:
                print(body[:300])
        else:
            print("есть USD:", "USD" in body, "| есть JSON-данные:", "application/json" in body or '"rate' in body.lower())
            print(body[:200].replace("\n", " "))


if __name__ == "__main__":
    main()
