#!/usr/bin/env python3
"""Генерирует страницы конвертеров для всех пар единиц каждой категории (ru и en)
и блок поискового индекса. Шаблоном служат готовые страницы из EXISTING.
Запуск из корня проекта: python3 tools/generate_pairs.py
Страницы из EXISTING написаны вручную и не перезаписываются."""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
rd = lambda p: p.read_text(encoding="utf8")
wr = lambda p, s: p.write_text(s, encoding="utf8", newline="")

# dir: папка категории; tmpl: страница-шаблон; units: slug единиц в порядке списка на странице;
# existing: готовые страницы {имя: (единица1, единица2)}; noun: (ru, en) для описания
CATS = {
 "length": dict(tmpl="meters-feet", units="kilometers meters decimeters centimeters millimeters micrometers nanometers miles nautical-miles yards feet inches".split(),
                existing={"meters-feet": ("meters", "feet"), "miles-km": ("miles", "kilometers"), "inches-cm": ("inches", "centimeters")}, noun=("длины", "length")),
 "area": dict(tmpl="sqm-sqft", units="square-kilometers hectares ares square-meters square-decimeters square-centimeters square-millimeters square-miles acres square-yards square-feet square-inches".split(),
              existing={"sqm-sqft": ("square-meters", "square-feet"), "hectares-acres": ("hectares", "acres"), "sotki-sqm": ("ares", "square-meters")}, noun=("площади", "area")),
 "volume": dict(tmpl="liters-gallons", units="cubic-meters liters milliliters cubic-centimeters gallons quarts pints cups fluid-ounces tablespoons teaspoons imperial-gallons imperial-pints".split(),
                existing={"liters-gallons": ("liters", "gallons"), "ml-cups": ("milliliters", "cups"), "liters-ml": ("liters", "milliliters")}, noun=("объёма", "volume")),
 "mass": dict(tmpl="kg-pounds", units="tonnes quintals kilograms grams milligrams micrograms carats ounces pounds stones poods".split(),
              existing={"kg-pounds": ("kilograms", "pounds"), "grams-ounces": ("grams", "ounces")}, noun=("веса", "weight")),
 "temperature": dict(tmpl="celsius-fahrenheit", units="celsius fahrenheit kelvin rankine reaumur".split(),
                     existing={"celsius-fahrenheit": ("celsius", "fahrenheit"), "celsius-kelvin": ("celsius", "kelvin")}, noun=("температуры", "temperature")),
 "speed": dict(tmpl="kmh-ms", units="kmh ms mph knots fts kms cms mach".split(),
               existing={"kmh-ms": ("kmh", "ms"), "kmh-knots": ("kmh", "knots")}, noun=("скорости", "speed")),
 "currency": dict(tmpl="rub-usd", units="rub usd eur cny gbp chf jpy try kzt byn aed uah".split(),
                  existing={"rub-usd": ("rub", "usd"), "eur-rub": ("eur", "rub")}, noun=("валюты", "currency")),
 "data": dict(tmpl="mb-gb", units="bits bytes kilobytes megabytes gigabytes terabytes petabytes kibibytes mebibytes gibibytes tebibytes kilobits megabits gigabits".split(),
              existing={"mb-gb": ("megabytes", "gigabytes"), "mbit-mb": ("megabits", "megabytes")}, noun=("данных", "data")),
 "numbers": dict(tmpl="bin-dec", units="bin oct dec hex".split(),
                 existing={"bin-dec": ("bin", "dec"), "dec-hex": ("dec", "hex")}, noun=("систем счисления", "number systems")),
}
LANGS = (("ru", "ru/converters"), ("en", "en/converters"))

def units_of(cat, lang_dir):
    s = rd(ROOT / lang_dir / cat / (CATS[cat]["tmpl"] + ".html"))
    blk = re.search(r'<select id="select-top"[^>]*>(.*?)</select>', s, re.S).group(1)
    out = []
    for attrs, label in re.findall(r"<option([^>]*)>([^<]*)</option>", blk):
        out.append(dict(value=re.search(r'value="([^"]*)"', attrs).group(1),
                        short=(re.search(r'data-short="([^"]*)"', attrs) or [None, ""])[1], label=label))
    return out

def first(u, cat):  return (u["short"][:1].upper() + u["short"][1:]) if cat in ("speed", "currency") and u["short"] else u["label"]
def second(u, cat): return u["short"].lower() if u["short"] else (u["label"] if cat == "temperature" else u["label"].lower())

def join(items, ru):
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + (" и " if ru else " and ") + items[-1]

def texts(cat, lang, a, b, U, ia, ib):
    ru = lang == "ru"; h1 = f"{first(a, cat)} {'в' if ru else 'to'} {second(b, cat)}"
    rest = [u for i, u in enumerate(U) if i not in (ia, ib)]
    low = [u["label"] if cat == "temperature" else u["label"].lower() for u in rest]
    noun = CATS[cat]["noun"][0 if ru else 1]
    if cat == "speed":
        title = f"{h1} — конвертер скорости онлайн | Конвертус" if ru else f"{h1} — online speed converter | Konvertus"
        desc = (f"Конвертер скорости онлайн: {h1} и обратно. Поддерживаются {', '.join(low[:4])} и другие единицы." if ru
                else f"Online speed converter: {h1} and back. {', '.join(low[:4])} and other units are supported too.")
    elif cat == "currency":
        title = f"{h1} — курс ЦБ РФ и график | Конвертус" if ru else f"{h1} — CBR rate and chart | Konvertus"
        desc = (f"Конвертер «{h1}» по официальному курсу ЦБ РФ с графиком динамики за неделю, месяц, 3 месяца, год или свой период. Доступны ещё {len(U) - 2} валют." if ru
                else f"Convert “{h1}” at the official Bank of Russia rate, with a rate chart for a week, month, 3 months, a year or a custom period. {len(U) - 2} more currencies available.")
    else:
        title = f"{h1} — конвертер онлайн | Конвертус" if ru else f"{h1} — online converter | Konvertus"
        if cat == "temperature":
            desc = (f"Конвертер «{h1}» онлайн: перевод в обе стороны. Также {join(low, True)}. Мгновенный расчёт температуры без рекламы." if ru
                    else f"Online converter “{h1}” that works both ways. Also {join(low, False)}. Instant temperature calculation, no ads.")
        elif cat == "numbers":
            desc = (f"Конвертер «{h1}» онлайн и обратно. Также {join(low, True)} системы; большие числа считаются без потери точности." if ru
                    else f"Online converter “{h1}” and back. {join(low, False).capitalize()} are supported too; large numbers are calculated without losing precision.")
        else:
            desc = (f"Конвертер «{h1}» онлайн: быстрый перевод в обе стороны. Также {', '.join(low[:6])} и другие единицы {noun}. Мгновенный результат, без рекламы." if ru
                    else f"Online converter “{h1}” that works both ways. Also {', '.join(low[:6])} and other {noun} units. Instant result, no ads.")
    return h1, title, desc

def set_selected(html, sel_id, value):
    def blk(m):
        def opt(o):
            attrs = re.sub(r"\s+selected\b", "", o.group(1))
            return "<option" + attrs + (" selected" if re.search(r'value="%s"' % re.escape(value), attrs) else "") + ">"
        return re.sub(r"<option([^>]*)>", opt, m.group(0))
    return re.sub(r'<select id="%s"[^>]*>.*?</select>' % sel_id, blk, html, flags=re.S)

def make_page(tpl, cat, lang, ldir, name, a, b, U, ia, ib):
    h1, title, desc = texts(cat, lang, a, b, U, ia, ib)
    old = CATS[cat]["tmpl"] + ".html"; new = name + ".html"
    s = tpl
    s = re.sub(r"<title>.*?</title>", lambda m: f"<title>{title}</title>", s, flags=re.S)
    s = re.sub(r'(<meta name="description"\s+content=")[^"]*(")', lambda m: m.group(1) + desc + m.group(2), s, flags=re.S)
    s = re.sub(r'(<link rel="(?:canonical|alternate)"[^>]*href=")([^"]*?)' + re.escape(old) + '"', lambda m: m.group(1) + m.group(2) + new + '"', s)
    s = re.sub(r'(<a href="[^"]*?)' + re.escape(old) + r'(" hreflang="(?:en|ru)" lang="(?:en|ru)">)', lambda m: m.group(1) + new + m.group(2), s)
    s = re.sub(r'(<h1 id="title">).*?(</h1>)', lambda m: m.group(1) + h1 + m.group(2), s)
    s = set_selected(s, "select-top", a["value"]); s = set_selected(s, "select-bottom", b["value"])
    return s, h1

def main():
    data, made = [], 0
    for cat, cfg in CATS.items():
        UL = {l: units_of(cat, d) for l, d in LANGS}
        assert len(UL["ru"]) == len(cfg["units"]) == len(UL["en"]), cat
        pos = {s: i for i, s in enumerate(cfg["units"])}
        skip = {tuple(sorted((pos[x], pos[y]))) for x, y in cfg["existing"].values()}
        idx = rd(ROOT / "assets/js/core/search-index.js")
        grp = {}
        for l, d in LANGS:
            m = re.search(r'"l": "%s", "t": "[^"]*", "u": "%s/%s/%s.html", "g": "([^"]*)", "c": "(\w+)"' % (l, d, cat, cfg["tmpl"]), idx)
            grp[l] = m.group(1); c_key = m.group(2)
        tpls = {l: rd(ROOT / d / cat / (cfg["tmpl"] + ".html")) for l, d in LANGS}
        # проверка правил заголовков на готовых страницах
        for name, (x, y) in cfg["existing"].items():
            for l, d in LANGS:
                U = UL[l]; h, _, _ = texts(cat, l, U[pos[x]], U[pos[y]], U, pos[x], pos[y])
                real = re.search(r'<h1 id="title">(.*?)</h1>', rd(ROOT / d / cat / (name + ".html"))).group(1)
                assert h == real, (cat, name, l, h, real)
        rows = [[s] + [None] * 4 for s in cfg["units"]]
        for i, s in enumerate(cfg["units"]):
            rows[i] = [s, first(UL["ru"][i], cat), second(UL["ru"][i], cat), first(UL["en"][i], cat), second(UL["en"][i], cat)]
        for i in range(len(cfg["units"])):
            for j in range(i + 1, len(cfg["units"])):
                if (i, j) in skip: continue
                name = f"{cfg['units'][i]}-{cfg['units'][j]}"
                for l, d in LANGS:
                    U = UL[l]; page, _ = make_page(tpls[l], cat, l, d, name, U[i], U[j], U, i, j)
                    wr(ROOT / d / cat / (name + ".html"), page); made += 1
        data.append({"c": c_key, "d": cat + "/", "g": [grp["ru"], grp["en"]], "x": [f"{cfg['units'][i]}|{cfg['units'][j]}" for i, j in sorted(skip)], "u": rows})
    js = ("// <pairs> блок создаётся tools/generate_pairs.py, вручную не править\n(function () {\n  var D = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) +
          ";\n  D.forEach(function (c) {\n    var skip = {};\n    c.x.forEach(function (k) { skip[k] = 1; });\n    for (var i = 0; i < c.u.length; i++) {\n      for (var j = i + 1; j < c.u.length; j++) {\n"
          "        var a = c.u[i], b = c.u[j];\n        if (skip[a[0] + \"|\" + b[0]]) continue;\n        var u = c.d + a[0] + \"-\" + b[0] + \".html\";\n        var k = (a[0] + \" \" + b[0]).replace(/-/g, \" \");\n"
          "        window.KONVERTUS_SEARCH.push({ l: \"ru\", t: a[1] + \" в \" + b[2], u: \"ru/converters/\" + u, g: c.g[0], c: c.c, k: k });\n"
          "        window.KONVERTUS_SEARCH.push({ l: \"en\", t: a[3] + \" to \" + b[4], u: \"en/converters/\" + u, g: c.g[1], c: c.c, k: k });\n      }\n    }\n  });\n})();\n// </pairs>\n")
    p = ROOT / "assets/js/core/search-index.js"; s = rd(p)
    s = re.sub(r"\n?// <pairs>.*?// </pairs>\n", "", s, flags=re.S).rstrip("\n") + "\n\n" + js
    wr(p, s)
    print("страниц создано:", made)

if __name__ == "__main__":
    main()
