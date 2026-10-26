# Volunteer Plan 2027 — Refactored Source

This is a cleaned-up version of the original single-file volunteer calendar. The app is still a client-side page; there is no server or database.

## Files

- `index.html` — page structure and third-party library links.
- `tokens.css`, `base.css`, `calendar.css` — the shared design system (see Design notes).
- `styles.css` — planner page layout and the task-editor grid.
- `fonts/NationalTrustTT-Regular.woff2` — typeface extracted from `nt-font.js`.
- `header-photo.jpg` — web-sized (1920px wide) copy of `_DSC0363.jpg`, used as the header background. Keep the original `_DSC0363.jpg` as the master; to change the image, resize a new photo to about 1920px wide, save it as `header-photo.jpg`, and adjust the focal point (`center 38%`) in `styles.css`.
- `script.js` — calendar setup (including drag and drop), task editor, theme, JSON import/export and PDF export.
- `locations.js` — the preset sites and each site's default meeting point (`window.VOL_SITES`). An identical copy lives in the volunteer portal; keep the two in step.
- `nt-font.js` — embedded font data used to keep the custom typeface available to jsPDF.

## Run it

Keep the files in the same folder and open `index.html` in a browser. The app loads FullCalendar, jsPDF, jsPDF-AutoTable, Lucide, and Leaflet with MapLibre GL (for the meeting-point map; OpenFreeMap tiles, no key) from CDNs, so an internet connection is required for those dependencies. The typeface is local.

Tasks live in the page's current session. Use **Save** to download a JSON backup and **Load** to restore one after reopening the page. The selected light/dark theme is remembered by the browser when local storage is available.

## PDF cover

The PDF export **requires** `page_1.jpg` alongside `index.html` as its first page. If the image is missing, unreadable, or cannot be embedded, export stops and displays an error; no fallback cover is generated.

## Refactoring notes

- Application CSS and JavaScript are now external files; inline event handlers have been replaced with event listeners.
- Rendering escapes task content and imported JSON is checked before it is added to the calendar.
- The editor's equipment and difficulty controls support keyboard interaction.
- Date validation avoids invalid dates and common date-only time-zone shifts.
- The confirmation dialog clears callbacks after use, and JSON export uses a Blob download.

## Design notes (redesign)

Both apps (this planner and the volunteer portal) share one small design system: `tokens.css` (all variables), `base.css` (type, buttons, fields, chips, modal, cards, motion) and `calendar.css` (FullCalendar theme). These three files are **identical in both folders** — edit one, copy to the other. Each app's own `styles.css` only holds page layout.

**Palette (light / dark)** — all in `tokens.css` (`:root` = light, `html.dark` = dark)

| Role | Light | Dark |
|---|---|---|
| Header / nav | `#ffffff` | `#212121` |
| Page | `#f7f5f5` | `#212121` |
| Cards / surface | `#ffffff` | `#2b2b2b` |
| Dividers | `#dcdcdc` | `#555555` |
| Headings | `#212121` | `#ffffff` |
| Body text | `#212121` | `#e0e0e0` |
| Muted / nav text | `#595959` | `#bdbdbd` |
| Accent (buttons, links) | `#00793e` (white text, AA) | `#4cc38a` (dark text, AA) |
| Hero banner | `#005a30` | `#033d25` |

Difficulty colours (`--easy-*`, `--moderate-*`, `--strenuous-*`) are tinted background + dark text + edge colour, AA in both themes.

**Typeface**: *National Trust TT* (Regular, 400 only) was extracted from the base64 data in `nt-font.js` and saved as `fonts/NationalTrustTT-Regular.woff2`, loaded with `@font-face` in `tokens.css` (`--font-display`, falling back to Georgia / serif). It is used for headings and numerals; body and controls use the system sans stack (`--font-body`) because the font has no bold or italic. `nt-font.js` itself is unchanged and still feeds the PDF export. **Licence caveat:** the font's licence states it is for exclusive use by the National Trust — confirm permission before distributing this app, or swap `--font-display` and the `@font-face` for another font.

**Shape**: one radius, `--radius: 8px`, for cards, inputs, buttons, chips, modals and the calendar. `--radius-sm: 4px` is for badges only; `--radius-full: 50%` is for true circles (dots, the brand mark).

**Spacing and type scale**: `--space-1…12` (4 / 8 / 12 / 16 / 24 / 32 / 48 px), `--control-h: 44px`, `--text-xs…2xl`, shadows `--shadow-1…3`, layers `--z-*`.

**Motion**: `--dur-fast` 120ms, `--dur` 220ms, `--dur-slow` 480ms, `--ease`, `--ease-inout`, `--stagger` 70ms. Used for the page-load stagger (`.reveal`, with `--i` as the order), theme cross-fade (`html.theme-fade`), button/card hover and press, calendar month fade, modal scale + fade, chip/segment selection, animated focus ring and the hero artwork drift. Everything is switched off under `prefers-reduced-motion`.

**Calendar**: events are flat cards — surface background, 1px divider border, 8px radius, a small difficulty dot (same colours as the legend), title in the heading font, location in muted text. Every week row has the same fixed height (`--cal-row` in `calendar.css`: 128px desktop, 92px mobile); each day shows one event and the rest collapse into a "+N more" popover (`dayMaxEvents` in the app's JS), so rows never grow when a task is added.

**Task directory**: one task per full-width row — date | title, description, difficulty badge and equipment | action button — stacking to one column on mobile.

**Header photo** (planner only): the header banner is `header-photo.jpg` with a dark-green gradient (from `--hero`) over it so the white title and buttons keep AA contrast in light and dark themes and on mobile. It is a static crop that fades in on load.

**Where to tweak**: change a colour, radius, spacing or motion value in `tokens.css`; shared components in `base.css`; calendar in `calendar.css`.

Accessibility: AA text contrast in both themes, visible animated focus rings, skip link, keyboard-operable chips and segmented control, focus trap and Esc in dialogs, `prefers-reduced-motion` respected.

**Task editor**: one scrollable column of four numbered steps joined by a line — 1 What is the task? (title first, with a collapsed "Use a preset" quick-fill and an optional description), 2 Where is it? (location chips, "Other" reveals a text field), 3 How hard is it? (three-way control), 4 What to bring (optional equipment chips). Required / Optional is labelled on each step, errors are inline, Esc closes, Enter saves, and the footer has a single primary Save button. The same layout is used when editing (Delete appears in the footer). Tailwind is no longer used.

**Drag and drop (month and week views)**: drag a task to another day to reschedule it (FullCalendar `editable`, with `eventDurationEditable: false` so only the date moves). Time of day, all-day status and multi-day length are preserved, because FullCalendar moves the whole `start`/`end` range. The data model is unchanged, so **Save** still writes the same JSON, and the "Tasks by location" list is re-rendered on every drop. A toast reads "Moved to <date>" with an **Undo** button (8 s, paused on hover or focus) that restores the previous dates. On touch screens a **long-press (400 ms)** starts the drag, so normal scrolling and tapping still work (`eventLongPressDelay` / `longPressDelay`). The dragged card is lifted with `--shadow-3` and a slight tilt, and the target day is outlined with `--brand-tint` and `--brand-text`. Row heights stay fixed during and after a drag (`dayMaxEvents` still collapses extra tasks into "+N more", and tasks can be dragged out of that popover). `eventInteractive: true` makes each task focusable, so Enter opens the editor.

**Keyboard alternative**: dragging has no keyboard equivalent, so the task editor shows a visible **date field** under the title (a native `<input type="date">`, same `id="task-date"`, validated as before). Open a task with Enter, change the date and press Save.

## Meeting points

Every preset site (Brownsham, Peppercombe, East Titchberry, Dunsland, Bucks Mills, Abbotsham, Burrough Farm, Kipling Tors, Brixton Barton, Welcombe) has a default meeting point, normally its carpark, defined in `locations.js`. Choosing the site in the task editor is all that is needed: the "Where is it?" step shows "Meeting point: Brownsham carpark" with a quiet **Change** link. (Kipling Tors is the Westward Ho! carpark.)

- **Change** opens a small map. Click it, or drag the pin, to move the meeting point; optionally name the spot ("Gate by the church"; unnamed pins are called "Meeting point"). **Use carpark instead** goes back to the default. Without a mouse, focus the map, pan with the arrow keys and press Enter to put the pin in the centre.
- Other (type any name, e.g. Explorer Days) has no default, so the map is shown already open with "Drop a pin for the meeting point (optional)". An "Other" task with a typed name and no pin is located by the portal from its name.
- Picking a different site resets the meeting point to that site's default. Editing a task restores its saved point.
- The meeting point is saved on the task only when it differs from the default, so most tasks are unchanged:

```json
{
  "id": "task_…",
  "title": "Path work",
  "start": "2027-01-06",
  "allDay": true,
  "extendedProps": {
    "location": "Brownsham",
    "description": "",
    "equipment": "",
    "difficulty": "Moderate",
    "meeting": { "label": "Gate by the church", "lat": 51.0071, "lon": -4.4428 }
  }
}
```

- Old JSON files load as before; `meeting` is kept through Load, Save, drag and drop, and editing. The directory cards show a "Meet at" line for non-default points. The PDF is unchanged.

## Deploying to GitHub Pages

The planner is the manager tool (it edits and exports the schedule) and you may not want it on a public site. Deploy the portal alone if the schedule should be read-only.

If you do publish it, it is static and uses only relative URLs, so it works from a project sub-path such as `https://<user>.github.io/<repo>/`.

1. Upload `index.html`, `tokens.css`, `base.css`, `calendar.css`, `styles.css`, `script.js`, `nt-font.js`, `fonts/` and `header-photo.jpg`.
2. For PDF export also upload `page_1.jpg` (the PDF cover page, read from `./page_1.jpg`). Without it the app shows a "PDF Cover Required" message.
3. **Do not upload `_DSC0363.jpg`** (the 2 MB original). Only the web-sized `header-photo.jpg` is used by the page; keep the original in your own files.
4. In the repository settings, choose **Settings, Pages**, then deploy from a branch and select the folder that holds `index.html`.
5. Names are case-sensitive on GitHub Pages: keep `fonts/NationalTrustTT-Regular.woff2` and `header-photo.jpg` exactly as written.

**Font licence caveat**: *National Trust TT* is a proprietary National Trust typeface. Publishing the `.woff2` (or `nt-font.js`, which embeds the same font as base64) on a public site redistributes it, so confirm you are licensed to serve it publicly before you deploy. If not, delete `fonts/` (and `nt-font.js` for the planner); `--font-display` falls back to Georgia / serif, and the layout does not depend on the font. `nt-font.js` and the `.woff2` are separate copies, so removing one does not affect the other.
