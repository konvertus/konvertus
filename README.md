# Konvertus

[Русская версия](README.ru.md)

A website for quickly converting units of measurement and currencies. No ads, no analytics, no sign-up. All calculations run in your browser.

Final project for a web development course.

**Live demo:** https://konvertus.github.io/konvertus/en/index.html (Russian version: https://konvertus.github.io/konvertus/)

## Features

| Category | Pages | What's inside |
|---|---|---|
| Length | meters to feet, miles to kilometers, inches to centimeters | 12 units: from nanometers to kilometers, miles, nautical miles, yards, feet, inches |
| Weight | kilograms to pounds, grams to ounces | 11 units: metric tons, quintals, carats, ounces, pounds, stones, poods and more |
| Temperature | Celsius to Fahrenheit, Celsius to Kelvin | Celsius, Fahrenheit, Kelvin, Rankine, Réaumur |
| Currencies | rubles to dollars, euros to rubles | 11 currencies at the Bank of Russia rate, a rates board, an "Update rate" button |
| Data | megabytes to gigabytes, megabits to megabytes | bits, bytes, decimal (KB, MB...) and binary (KiB, MiB...) units, megabits as used in internet plans |
| Number systems | binary to decimal, decimal to hexadecimal | binary, octal, decimal, hexadecimal; large numbers without losing precision |

Also included:

- Russian and English versions with a language switcher in the footer;
- mobile-friendly layout: hamburger menu, compact sizes, two-column grids;
- a sticky header that stays on screen while you scroll;
- a button to copy the result and a button to swap the units;
- a tips block on every page ("Quick mental math", or "Where the rate comes from" on currency pages) plus fun facts.

## Tech stack

- HTML5 and CSS3 (flexbox, grid, CSS variables, media queries), no frameworks or build tools
- JavaScript (ES2020), no libraries
- [Montserrat](https://fonts.google.com/specimen/Montserrat) font and [Material Symbols](https://fonts.google.com/icons) icons from Google Fonts
- Currency rates: [cbr-xml-daily.ru](https://www.cbr-xml-daily.ru/), Bank of Russia data in JSON format
- Hosting: GitHub Pages

## Project structure

```
konvertus/
├── index.html            home page (Russian version)
├── about.html            "About" page
├── konvertus.css         all site styles
├── converter.js          length, weight and data converters (ratio-based)
├── temperature.js        temperature (scales with different zero points)
├── currency.js           currencies: fetching the CBR rate, rates board, icons
├── numbers.js            number systems (BigInt)
├── menu.js               mobile menu and the "Tools" dropdown
├── select.js             custom dropdown lists (animation, currency icons and search)
├── theme.js              dark theme (applied in <head>, saved in localStorage) and the toggle button
├── search.js             site-wide search (Ctrl/⌘+K or "/")
├── search-index.js       search index: add every new page here
├── icons/                currency icons (PNG, 128×128, transparent background)
├── converters/           converter pages (Russian version)
│   ├── meters-feet.html, miles-km.html, inches-cm.html
│   ├── kg-pounds.html, grams-ounces.html
│   ├── celsius-fahrenheit.html, celsius-kelvin.html
│   ├── rub-usd.html, eur-rub.html
│   ├── mb-gb.html, mbit-mb.html
│   └── bin-dec.html, dec-hex.html
└── en/                   English version, same structure
    ├── index.html, about.html
    └── converters/
```

Styles, scripts and icons are shared by both language versions. Pages load them through relative paths: from `converters/` that is `../konvertus.css`, from `en/converters/` it is `../../konvertus.css`. If you move folders around, the paths need to be updated.

## Running locally

You can simply open `index.html` in a browser. It is better to start a local server so everything behaves as it does on the hosting:

```bash
git clone https://github.com/konvertus/konvertus.git
cd konvertus
python3 -m http.server 8000
```

The site will then be available at http://localhost:8000. An internet connection is required for currency rates.

## How it works

**Length, weight, data.** Every unit in a list is stored as a number: how many base units it contains (meters, kilograms or bytes). The result is calculated as `value × (base of the source) ÷ (base of the target)`. The coefficients come from official definitions: an inch is exactly 25.4 mm and a pound is exactly 0.45359237 kg.

**Temperature.** The scales have different zero points, so plain multiplication does not work. The value is first converted to degrees Celsius and then to the target scale. Temperatures below absolute zero are rejected.

**Currencies.** The script requests `daily_json.js` from cbr-xml-daily.ru, works out the rate of one unit in rubles (taking into account that the yen and tenge are quoted per 100 units) and converts through the ruble. The last received rate is saved in `localStorage`: if there is no connection, the site shows it with a note.

**Number systems.** The number is parsed into a `BigInt`, so long values keep full precision. Only integers are supported; invalid characters produce a clear message.

## Adding a new converter

For quantities that convert by multiplication (area, volume, speed):

1. Copy any page from `converters/`, for example `kg-pounds.html`, under a new name.
2. Change the heading, the `<title>`, both unit lists (`value` is the number of base units) and the tips and facts blocks. The `selected` attribute sets the default units.
3. Add a link to the "Tools" menu on every page and a card on the home page.
4. Do the same in `en/converters/` with English text.

`converter.js` does not need to be changed.

## Privacy

The site has no ads, counters, analytics or cookies. The numbers you enter are never sent anywhere.

To work, the site contacts two external services: fonts and icons are loaded from Google's servers, and currency rates come from cbr-xml-daily.ru. As with any website, these services can see the visitor's IP address. Konvertus itself does not receive this data.

## Limitations

- Currency rates are for reference only and come from the Bank of Russia. Banks and exchange offices use different rates.
- The menu and footer are duplicated in every HTML file because the site is built without a template engine. When the menu changes, it has to be edited on all pages.
- The "Log in / Sign up" button currently leads to a placeholder.

## Author

A student project. Send suggestions and bug reports through the repository's Issues section.