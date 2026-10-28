#!/usr/bin/env python3
"""Собирает индексы потребительских цен (ИПЦ) по месяцам в data/inflation.json.

Страница «Валюты во времени» (currency-time.js) использует файл, чтобы показать
изменение курса с поправкой на инфляцию. Скрипт запускается раз в месяц
(.github/workflows/update-inflation.yml), но его можно запустить и вручную:

    python3 tools/update_inflation.py

Для каждой страны/региона источники перебираются по порядку: если первый не ответил
или вернул мусор, берётся следующий. Старые данные никогда не затираются: новые месяцы
дописываются, совпавшие обновляются.

Формат файла:
    {
      "updated": "2026-10-28",
      "regions": {"RU": "RUB", "US": "USD", "EA": "EUR"},
      "series": { "US": {"2021-10": 276.589, ...}, ... },   # индекс, база у каждой страны своя
      "sources": { "US": "BLS CUUR0000SA0", ... }
    }
Важно только отношение индексов, поэтому разные базы у стран не мешают.

Россия: Росстат не даёт стабильного машинного файла с помесячным ИПЦ, поэтому индекс строится по годовой
инфляции Банка России (cbr.ru/hd_base/infl): индекс месяца = индекс того же месяца год назад × (1 + г/г).
Первый год ряда заполняется ровным ростом, так что для рубля результат приближённый (порядка ±0,5 п.п.);
такие регионы перечислены в поле "approx", и страница это показывает.

Код возврата: 0 — всё в порядке, 1 — у какого-то региона нет данных или они устарели
(тогда workflow покажет красный статус и придёт письмо от GitHub).
"""
import csv
import datetime as dt
import io
import json
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "inflation.json"

YEARS = 6                  # сколько лет хранить (история курсов — 5 лет, плюс запас)
STALE_MONTHS = 4           # данные старше — повод для тревоги (Росстат/BLS публикуют с лагом 1–2 месяца)
RETRIES = 3
TIMEOUT = 30

# валюта страницы -> регион ИПЦ
REGIONS = {"RU": "RUB", "US": "USD", "EA": "EUR"}


# ---------- загрузка ----------

def get(url: str, data: bytes = None, headers: dict = None) -> bytes:
    last = None
    for attempt in range(RETRIES):
        try:
            h = {"User-Agent": "konvertus-inflation-updater"}
            h.update(headers or {})
            request = urllib.request.Request(url, data=data, headers=h)
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"не удалось загрузить {url}: {last}")


# ---------- разбор ответов (отдельные функции, чтобы их можно было проверить без сети) ----------

def parse_fred_csv(text: str) -> dict:
    """FRED: CSV «дата,значение», пропуски — точка или пустая строка."""
    rows = csv.reader(io.StringIO(text))
    next(rows, None)  # заголовок
    result = {}
    for row in rows:
        if len(row) < 2:
            continue
        date, value = row[0].strip(), row[1].strip()
        if len(date) < 7 or value in ("", "."):
            continue
        try:
            result[date[:7]] = float(value)
        except ValueError:
            continue
    return result


def parse_bls(payload: dict) -> dict:
    """BLS API: Results.series[0].data = [{year, period: 'M01', value}, ...]."""
    if payload.get("status") != "REQUEST_SUCCEEDED":
        raise ValueError("BLS: " + ("; ".join(payload.get("message", [])) or "запрос не выполнен"))
    result = {}
    for item in payload["Results"]["series"][0]["data"]:
        period = item.get("period", "")
        if not (period.startswith("M") and period != "M13"):
            continue
        try:
            result[f"{item['year']}-{int(period[1:]):02d}"] = float(item["value"])
        except (ValueError, KeyError):
            continue
    return result


def parse_eurostat(payload: dict) -> dict:
    """Eurostat JSON-stat: время — единственное измерение с size > 1."""
    ids = payload["id"]
    sizes = payload["size"]
    if [s for i, s in zip(ids, sizes) if s > 1 and i != "time"]:
        raise ValueError("Eurostat: в ответе остались лишние измерения")
    index = payload["dimension"]["time"]["category"]["index"]
    values = payload["value"]
    result = {}
    for month, position in index.items():
        v = values.get(str(position)) if isinstance(values, dict) else (values[position] if position < len(values) else None)
        if v is not None:
            result[month[:7]] = float(v)
    return result


def parse_cbr_infl(html: str) -> dict:
    """Банк России: таблица «Дата (ММ.ГГГГ), ключевая ставка, инфляция г/г, цель» -> {месяц: % г/г}."""
    import re
    result = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S | re.I):
        cells = [re.sub(r"<[^>]+>", "", c).replace("&nbsp;", " ").strip()
                 for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S | re.I)]
        if len(cells) < 3 or not re.fullmatch(r"\d{2}\.\d{4}", cells[0]):
            continue
        try:
            result[f"{cells[0][3:]}-{cells[0][:2]}"] = float(cells[2].replace(",", ".").replace(" ", ""))
        except ValueError:
            continue
    return result


def yoy_to_index(yoy: dict) -> dict:
    """Строит индекс цен из годовой инфляции: I(m) = I(m − 12) × (1 + г/г).
    Первые 12 месяцев — ровный рост с темпом первого г/г (точнее данных нет)."""
    months = sorted(yoy)
    if len(months) < 24:
        raise ValueError(f"для расчёта нужно хотя бы 24 месяца, есть {len(months)}")
    for a, b in zip(months, months[1:]):
        if months_between(a, b) != 1:
            raise ValueError(f"в ряду пропущен месяц между {a} и {b}")
    g = (1 + yoy[months[0]] / 100) ** (1 / 12)
    index = {}
    for k, m in enumerate(months):
        index[m] = 100 * g ** k if k < 12 else index[months[k - 12]] * (1 + yoy[m] / 100)
    return {m: round(v, 4) for m, v in index.items()}


# ---------- источники ----------

def src_fred(series_id: str):
    def run(first_year: int):
        url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + urllib.parse.quote(series_id)
        return parse_fred_csv(get(url).decode("utf-8"))
    return f"FRED {series_id}", run


def src_bls(series_id: str):
    def run(first_year: int):
        body = json.dumps({"seriesid": [series_id], "startyear": str(first_year), "endyear": str(dt.date.today().year)}).encode()
        raw = get("https://api.bls.gov/publicAPI/v2/timeseries/data/", data=body, headers={"Content-Type": "application/json"})
        return parse_bls(json.loads(raw.decode("utf-8")))
    return f"BLS {series_id}", run


def src_eurostat(geo: str, unit: str):
    def run(first_year: int):
        query = urllib.parse.urlencode({
            "format": "JSON", "lang": "EN", "geo": geo, "coicop": "CP00", "unit": unit,
            "sinceTimePeriod": f"{first_year}-01",
        })
        url = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_midx?" + query
        return parse_eurostat(json.loads(get(url).decode("utf-8")))
    return f"Eurostat HICP {geo} {unit}", run


def src_cbr():
    def run(first_year: int):
        # берём с запасом назад: первый год ряда уходит на «разгон» индекса
        today = dt.date.today()
        query = urllib.parse.urlencode({
            "UniDbQuery.Posted": "True",
            "UniDbQuery.From": f"01.01.{first_year}",
            "UniDbQuery.To": today.strftime("%d.%m.%Y"),
        })
        html = get("https://www.cbr.ru/hd_base/infl/?" + query).decode("utf-8", "replace")
        return yoy_to_index(parse_cbr_infl(html))
    run.replace = True   # ряд пересчитывается целиком: частичное слияние дало бы разрыв
    run.approx = True    # индекс приближённый
    return "Банк России, инфляция г/г (пересчёт в индекс)", run


SOURCES = {
    "US": [src_bls("CUUR0000SA0"), src_fred("CPIAUCNS")],
    # с января 2026 Eurostat перешёл на базу 2025=100 (I25); старая серия I15 обрывается в декабре 2025
    "EA": [src_eurostat("EA", "I25"), src_fred("CP0000EZ19M086NEST")],
    "RU": [src_cbr()],
}


# ---------- сборка файла ----------

def months_between(a: str, b: str) -> int:
    return (int(b[:4]) - int(a[:4])) * 12 + int(b[5:7]) - int(a[5:7])


def merge(old: dict, new: dict, first_month: str) -> dict:
    merged = {**old, **new}
    return dict(sorted((m, v) for m, v in merged.items() if m >= first_month))


def main() -> int:
    today = dt.date.today()
    first_year = today.year - YEARS
    first_month = f"{first_year}-{today.month:02d}"
    this_month = today.strftime("%Y-%m")

    data = {"series": {}, "sources": {}}
    if OUT.exists():
        try:
            data = json.loads(OUT.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            print("Старый файл повреждён — собираем заново.")
    series = data.get("series", {})
    sources = data.get("sources", {})
    approx = set(data.get("approx", []))

    problems = []
    for region in REGIONS:
        got = None
        for name, run in SOURCES[region]:
            try:
                fresh = run(first_year)
                if len(fresh) < 12:
                    raise ValueError(f"слишком мало данных ({len(fresh)} точек)")
                got = (name, fresh, run)
                break
            except Exception as e:  # любой сбой источника — пробуем следующий
                print(f"  {region}: {name} не подошёл: {e}", flush=True)
        if got:
            name, fresh, run = got
            # индексы с разной базой (смена источника) и пересчитываемые ряды нельзя смешивать со старыми
            if getattr(run, "replace", False) or sources.get(region) != name:
                series[region] = dict(sorted((m, v) for m, v in fresh.items() if m >= first_month))
            else:
                series[region] = merge(series.get(region, {}), fresh, first_month)
            sources[region] = name
            if getattr(run, "approx", False):
                approx.add(region)
            else:
                approx.discard(region)
            print(f"{region}: {name}, {len(fresh)} точек, последний месяц {max(fresh)}", flush=True)
        else:
            print(f"{region}: ни один источник не ответил, остаются старые данные", file=sys.stderr)

        have = series.get(region)
        if not have:
            problems.append(f"{region}: данных нет")
        elif months_between(max(have), this_month) > STALE_MONTHS:
            problems.append(f"{region}: последний месяц {max(have)} устарел")

    result = {
        "updated": today.isoformat(),
        "regions": REGIONS,
        "series": {r: series[r] for r in REGIONS if r in series},
        "sources": {r: sources[r] for r in REGIONS if r in sources},
        "approx": sorted(approx & set(series)),
    }
    text = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
    OUT.parent.mkdir(exist_ok=True)
    old_text = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
    # дату обновления не считаем изменением: иначе каждый запуск делал бы лишний коммит
    strip = lambda t: t.split('"regions"', 1)[-1]
    if strip(old_text) != strip(text):
        OUT.write_text(text, encoding="utf-8")
        print(f"Файл обновлён ({len(text) // 1024 or 1} КБ).")
    else:
        print("Изменений нет.")

    if problems:
        print("ПРОБЛЕМЫ: " + "; ".join(problems), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
