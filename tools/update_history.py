#!/usr/bin/env python3
"""Собирает историю курсов ЦБ РФ в один файл data/history.json.

Сайт (rate-chart.js) грузит этот файл одним запросом вместо десятков запросов
к архиву ЦБ. Скрипт дописывает только недостающие дни, поэтому после первого
запуска (он собирает ~5 лет) каждое обновление занимает несколько секунд.

    python3 tools/update_history.py

Формат файла:
    {
      "updated": "2026-10-12",
      "codes": ["USD", "EUR", ...],          # порядок значений в строках
      "rates": { "2026-10-09": [81.2, 92.1, ...], ... }   # рублей за 1 единицу валюты
    }
"""
import concurrent.futures
import datetime as dt
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "history.json"

BASE = os.environ.get("CBR_BASE", "https://www.cbr-xml-daily.ru/").rstrip("/") + "/"
CODES = ["USD", "EUR", "CNY", "GBP", "CHF", "JPY", "TRY", "KZT", "BYN", "AED"]
YEARS = 5                      # столько лет хранится (график умеет «свой период» до 5 лет)
KEEP_DAYS = YEARS * 366 + 7
WORKERS = 6
RETRIES = 4


def get_json(url: str):
    """Возвращает dict, либо None для 404 (в этот день курса нет)."""
    for attempt in range(RETRIES):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "konvertus-history-updater"})
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            err = e
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            err = e
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"не удалось загрузить {url}: {err}")


def pack(data: dict):
    """(дата, [рублей за 1 единицу в порядке CODES])"""
    row = []
    for code in CODES:
        v = data.get("Valute", {}).get(code)
        row.append(round(v["Value"] / v["Nominal"], 6) if v and v.get("Nominal") else None)
    return data["Date"][:10], row


def fetch_day(day: dt.date):
    data = get_json(f"{BASE}archive/{day:%Y}/{day:%m}/{day:%d}/daily_json.js")
    return pack(data) if data and data.get("Valute") else None


def main() -> int:
    rates = {}
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding="utf-8"))
            if old.get("codes") == CODES:
                rates = old.get("rates", {})
            else:
                print("Набор валют изменился — пересобираем историю заново.")
        except (json.JSONDecodeError, OSError):
            print("Старый файл повреждён — пересобираем историю заново.")

    today = dt.date.today()
    first = today - dt.timedelta(days=KEEP_DAYS)
    last_known = max(rates) if rates else None
    start = dt.date.fromisoformat(last_known) + dt.timedelta(days=1) if last_known else first
    start = max(start, first)
    end = today + dt.timedelta(days=1)  # ЦБ публикует курс на следующий рабочий день заранее

    days = [start + dt.timedelta(days=i) for i in range((end - start).days + 1)]
    days = [d for d in days if d.weekday() < 5]  # в выходные курсов нет
    print(f"Нужно загрузить дней: {len(days)} ({start} … {end})")

    added = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for result in pool.map(fetch_day, days):
            if result:
                date, row = result
                if rates.get(date) != row:
                    rates[date] = row
                    added += 1

    # свежий курс (может быть на более позднюю дату, чем есть в архиве)
    latest = get_json(BASE + "daily_json.js")
    if latest and latest.get("Valute"):
        date, row = pack(latest)
        if rates.get(date) != row:
            rates[date] = row
            added += 1

    # храним только нужный период
    cutoff = first.isoformat()
    rates = {d: r for d, r in rates.items() if d >= cutoff}

    if not rates:
        print("Не получили ни одного дня — файл не меняем.", file=sys.stderr)
        return 1

    result = {"updated": max(rates), "codes": CODES, "rates": dict(sorted(rates.items()))}
    text = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
    OUT.parent.mkdir(exist_ok=True)
    if OUT.exists() and OUT.read_text(encoding="utf-8") == text:
        print("Изменений нет.")
        return 0
    OUT.write_text(text, encoding="utf-8")
    print(f"Записано: {len(rates)} дней, новых или изменённых: {added}, размер {len(text) // 1024} КБ.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
