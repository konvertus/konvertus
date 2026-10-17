#!/usr/bin/env python3
"""Скачивает Montserrat и значки Material Symbols с Google Fonts в папку fonts/
и переключает все HTML-страницы на локальные копии.

Запуск (нужен интернет, один раз):

    python3 tools/self_host_fonts.py

Скрипт можно запускать повторно: уже переключённые страницы он пропускает.
После запуска сайт больше не обращается к серверам Google за шрифтами.
"""
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS_DIR = ROOT / "fonts"
CSS_NAME = "fonts.css"
CSS_VERSION = "1"

# Google отдаёт woff2 только современным браузерам, поэтому представляемся Chrome
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)

# Montserrat без курсива (он на сайте не используется).
# cyrillic — русские буквы, latin — латиница и цифры, latin-ext — в нём находится знак ₽
MONTSERRAT_URL = "https://fonts.googleapis.com/css2?family=Montserrat:wght@100..900&display=swap"
MONTSERRAT_SUBSETS = {"cyrillic", "latin", "latin-ext"}

# Только значки, которые есть на сайте (шрифт получается в несколько КБ)
ICON_NAMES = "check,content_copy,currency_ruble,refresh,sync_alt"
MATERIAL_URL = (
    "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:"
    "opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
    f"&icon_names={ICON_NAMES}"
)

# файлы, которые стоит загружать заранее (preload)
PRELOAD = ["montserrat-cyrillic.woff2", "montserrat-latin.woff2", "material-symbols-outlined.woff2"]

FONT_FACE_RE = re.compile(r"(?:/\*\s*([\w-]+)\s*\*/\s*)?(@font-face\s*\{[^}]*\})", re.S)
URL_RE = re.compile(r"url\((['\"]?)([^)'\"]+)\1\)")
GOOGLE_LINK_RE = re.compile(r"[ \t]*<link\b[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>[ \t]*\n?", re.S)


def http_get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def build_css(css: str, slug: str, keep_subsets, fetch=http_get):
    """Скачивает файлы шрифтов из @font-face и возвращает (css с локальными путями, список файлов)."""
    out = []
    files = []
    for match in FONT_FACE_RE.finditer(css):
        subset, block = match.group(1), match.group(2)
        if keep_subsets and subset not in keep_subsets:
            continue
        name = f"{slug}-{subset}.woff2" if subset else f"{slug}.woff2"
        url = URL_RE.search(block).group(2)
        if url.startswith("//"):
            url = "https:" + url
        FONTS_DIR.mkdir(exist_ok=True)
        (FONTS_DIR / name).write_bytes(fetch(url))
        files.append(name)
        block = URL_RE.sub(f"url({name})", block, count=1)
        out.append(f"/* {subset or slug} */\n{block}")
    # всё, что не @font-face (например, класс .material-symbols-outlined), оставляем как есть
    rest = FONT_FACE_RE.sub("", css).strip()
    if rest:
        out.append(rest)
    return "\n".join(out) + "\n", files


def patch_html(path: pathlib.Path) -> bool:
    text = path.read_text(encoding="utf-8")
    if f"fonts/{CSS_NAME}" in text and "fonts.googleapis.com" not in text:
        return False

    depth = len(path.relative_to(ROOT).parts) - 1
    prefix = "../" * depth

    # убираем все подключения к Google (preconnect, шрифты, значки)
    text = GOOGLE_LINK_RE.sub("", text)
    text = re.sub(r"[ \t]*<!--\s*Значки google\s*-->[ \t]*\n+", "", text)

    lines = [f'<link rel="stylesheet" href="{prefix}fonts/{CSS_NAME}?v={CSS_VERSION}">']
    for name in PRELOAD:
        lines.append(f'<link rel="preload" href="{prefix}fonts/{name}" as="font" type="font/woff2" crossorigin>')

    marker = re.search(r"([ \t]*)<!--\s*Шрифты\s*-->", text)
    if marker:
        indent = marker.group(1)
        block = f"{indent}<!-- Шрифты и значки (свои копии, без запросов к Google) -->\n" + "\n".join(indent + l for l in lines)
        text = text[: marker.start()] + block + text[marker.end():]
    else:
        text = text.replace("</head>", "    " + "\n    ".join(lines) + "\n</head>", 1)

    path.write_text(text, encoding="utf-8")
    return True


def main() -> int:
    print("Скачиваем Montserrat…")
    mont_css, mont_files = build_css(http_get(MONTSERRAT_URL).decode("utf-8"), "montserrat", MONTSERRAT_SUBSETS)
    print("  файлы:", ", ".join(mont_files))
    if not {"montserrat-cyrillic.woff2", "montserrat-latin.woff2"} <= set(mont_files):
        print("Не нашли нужные начертания в ответе Google. Ничего не меняем.")
        return 1

    print("Скачиваем значки Material Symbols…")
    icon_css, icon_files = build_css(http_get(MATERIAL_URL).decode("utf-8"), "material-symbols-outlined", None)
    print("  файлы:", ", ".join(icon_files))
    if "material-symbols-outlined.woff2" not in icon_files:
        print("Не нашли файл значков в ответе Google. Ничего не меняем.")
        return 1

    (FONTS_DIR / CSS_NAME).write_text(mont_css + "\n" + icon_css, encoding="utf-8")

    changed = 0
    for path in sorted(ROOT.rglob("*.html")):
        if ".git" in path.parts:
            continue
        if patch_html(path):
            changed += 1
    total = sum(f.stat().st_size for f in FONTS_DIR.glob("*.woff2"))
    print(f"Готово. Страниц обновлено: {changed}. Размер шрифтов: {total // 1024} КБ.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
