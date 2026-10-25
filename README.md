# Volunteer Plan 2027 — Refactored Source

This is a cleaned-up version of the original single-file volunteer calendar. The app is still a client-side page; there is no server or database.

## Files

- `index.html` — page structure and third-party library links.
- `styles.css` — global scrollbar styling and FullCalendar-specific theme overrides.
- `script.js` — calendar setup, task editor, theme, JSON import/export and PDF export.
- `tailwind-config.js` — custom Tailwind CDN theme settings.
- `nt-font.js` — embedded font data used to keep the custom typeface available to jsPDF.

## Run it

Keep the files in the same folder and open `index.html` in a browser. The app loads Tailwind, FullCalendar, jsPDF, jsPDF-AutoTable, Lucide and the Inter font from CDNs, so an internet connection is required for those dependencies.

Tasks live in the page's current session. Use **Save** to download a JSON backup and **Load** to restore one after reopening the page. The selected light/dark theme is remembered by the browser when local storage is available.

## PDF cover

The PDF export **requires** `page_1.jpg` alongside `index.html` as its first page. If the image is missing, unreadable, or cannot be embedded, export stops and displays an error; no fallback cover is generated.

## Refactoring notes

- Application CSS and JavaScript are now external files; inline event handlers have been replaced with event listeners.
- Rendering escapes task content and imported JSON is checked before it is added to the calendar.
- The editor's equipment and difficulty controls support keyboard interaction.
- Date validation avoids invalid dates and common date-only time-zone shifts.
- The confirmation dialog clears callbacks after use, and JSON export uses a Blob download.
