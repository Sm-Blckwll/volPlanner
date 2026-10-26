/*
 * Volunteer Plan 2027 — application logic
 *
 * Responsibilities:
 *   1. Initialise theme, task presets and the FullCalendar instance.
 *   2. Create, edit, delete and display tasks.
 *   3. Import/export the task list as JSON.
 *   4. Export the schedule as a PDF.
 *
 * Third-party libraries (FullCalendar, jsPDF, AutoTable, Lucide, and Leaflet with MapLibre GL
 * for the parking and meeting-point map) are loaded by index.html. locations.js (shared with the portal)
 * holds each site's carpark (where volunteers park) and any default meeting point. All UI actions are wired from this file; the HTML
 * contains no inline JavaScript event handlers.
 */

'use strict';

// ---------------------------------------------------------------------------
// Application data and state
// ---------------------------------------------------------------------------

/** Reusable task templates shown in the task editor. */
const taskPresets = [
    {
        title: 'Scrub removal',
        desc: 'Manage vegetation by cutting out small trees and scrub to provide varied age structure and open glades.',
        diff: 'Moderate',
        equip: ['Sturdy boots', 'Waterproofs', 'Packed lunch']
    },
    {
        title: 'Path work',
        desc: 'Repairing and surfacing paths to improve presentation and safety for visitors.',
        diff: 'Moderate',
        equip: ['Sturdy boots', 'Waterproofs']
    },
    {
        title: 'Bracken bash',
        desc: 'Clear areas of bracken to increase the diversity of wildflowers and micro habitats available for insects.',
        diff: 'Moderate',
        equip: ['Sturdy boots', 'Waterproofs', 'Packed lunch']
    },
    {
        title: 'Hedge laying',
        desc: 'Traditional hedge laying to improve field boundaries and habitats.',
        diff: 'Strenuous',
        equip: ['Sturdy boots', 'Waterproofs', 'Packed lunch']
    },
    {
        title: 'Orchard Pruning',
        desc: 'Winter/Summer pruning of fruit trees to help the orchard flourish.',
        diff: 'Easy',
        equip: ['Wellies', 'Waterproofs']
    },
    {
        title: 'Beach clean',
        desc: 'Cleaning up waste off beaches to protect the marine environment. All waste recycled where possible.',
        diff: 'Strenuous',
        equip: ['Sturdy boots', 'Waterproofs', 'Packed lunch']
    },
    {
        title: 'Tree planting',
        desc: 'Planting new native trees to create woodland pasture and improve site for wildlife.',
        diff: 'Moderate',
        equip: ['Sturdy boots', 'Waterproofs', 'Packed lunch']
    },
    {
        title: 'Pond clearance',
        desc: 'Clear vegetation from around ponds to improve the site for wildlife.',
        diff: 'Moderate',
        equip: ['Wellies', 'Waterproofs', 'Packed lunch']
    },
    {
        title: 'Wildlife Survey',
        desc: 'Surveying wildlife and recording species across the site.',
        diff: 'Easy',
        equip: ['Sturdy boots', 'Waterproofs', 'Packed lunch']
    },
    {
        title: 'Hay making',
        desc: 'Cutting hay meadows and spreading green hay.',
        diff: 'Moderate',
        equip: ['Scythe', 'Sturdy boots', 'Waterproofs', 'Packed lunch']
    }
];

/** The app opens on the start of the 2027 planning year. */
const DEFAULT_START_DATE = '2027-01-01';

/**
 * Suggested sites and equipment shown as chips in the task editor.
 * Site names must match locations.js (carparks and default meeting points) and existing tasks exactly.
 */
const LOCATIONS = [
    'Brownsham', 'Peppercombe', 'East Titchberry', 'Dunsland', 'Bucks Mills', 'Abbotsham',
    'Burrough Farm', 'Kipling Tors', 'Brixton Barton', 'Welcombe'
];
// Clothing and footwear first, then food and drink, then kit. Anything saved that is not listed here
// (for example an older task with 'Scythe') still loads, shows on the task and is kept in the "Other equipment" field.
const EQUIPMENT = [
    'Sturdy boots', 'Wellies', 'Waterproofs', 'Long trousers', 'Sun hat',
    'Packed lunch', 'Bowl and utensils', 'Mug', 'Cake', 'Binoculars'
];

let calendar;
let confirmCallback = null;
let customLocation = false;

// Initialise only after all of the page's elements have been parsed.
document.addEventListener('DOMContentLoaded', initialiseApp);

/** Set up the app in dependency order. */
function initialiseApp() {
    initTheme();
    buildChoiceChips();
    buildPresetsUI();
    initCalendar();
    bindUIEvents();
    bindDialogEvents();
    bindDirectoryEvents();
    resetForm();
    updateBottomList();
    lucide.createIcons();

    // Keep FullCalendar's dimensions correct after a window resize.
    window.addEventListener('resize', () => {
        if (calendar) calendar.updateSize();
    });

    // Escape closes, and Tab stays inside, the topmost open modal.
    document.addEventListener('keydown', (event) => {
        const modal = [dialogModal(), taskModal()].find((element) => !element.hidden);
        if (!modal) return;
        if (event.key === 'Escape') {
            if (modal === dialogModal()) closeDialog();
            else closeModal();
        } else if (event.key === 'Tab') {
            trapFocus(event, modal);
        }
    });
}

const taskModal = () => document.getElementById('task-modal');
const dialogModal = () => document.getElementById('dialog-modal');

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/** Escape user/imported content before inserting it into a HTML string. */
function escapeHTML(value) {
    const replacements = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return String(value ?? '').replace(/[&<>"']/g, (character) => replacements[character]);
}

/** Labels used for a dropped pin that has no name (same defaults as locations.js). */
const DEFAULT_MEETING_LABEL = (window.VOL_MEETING && window.VOL_MEETING.DEFAULT_LABEL) || 'Meeting point';
const DEFAULT_PARKING_LABEL = (window.VOL_MEETING && window.VOL_MEETING.DEFAULT_PARKING_LABEL) || 'Parking';

/** Validate a stored meeting point { label, lat, lon }; returns a clean copy or null. */
function cleanMeeting(raw) {
    return window.VOL_MEETING ? window.VOL_MEETING.clean(raw) : null;
}

/** Validate a stored parking point { label, lat, lon }; returns a clean copy or null. */
function cleanParking(raw) {
    return window.VOL_MEETING ? window.VOL_MEETING.cleanParking(raw) : null;
}

/** Build a local Date from YYYY-MM-DD without UTC/time-zone date shifts. */
function parseLocalDate(dateString) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString ?? ''));
    if (!match) return null;

    const [, yearText, monthText, dayText] = match;
    const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText), 12);
    // Date constructors normalise impossible values, so compare fields back.
    if (
        date.getFullYear() !== Number(yearText) ||
        date.getMonth() !== Number(monthText) - 1 ||
        date.getDate() !== Number(dayText)
    ) {
        return null;
    }
    return date;
}

/** Format a YYYY-MM-DD value in the user's locale without shifting the day. */
function formatDateString(dateString, options) {
    const date = parseLocalDate(dateString);
    return date ? date.toLocaleDateString('en-GB', options) : 'Invalid date';
}

/** Return a stable, unique ID for new tasks, including older browsers. */
function createTaskId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return `task_${window.crypto.randomUUID()}`;
    }
    return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Return the difficulty as a CSS modifier: easy, moderate or strenuous. */
function difficultyClass(difficulty) {
    if (String(difficulty).includes('Easy')) return 'easy';
    if (/Strenuous|Hard/i.test(String(difficulty))) return 'strenuous';
    return 'moderate';
}

/** Convert a potentially imported event to the fields the app supports. */
function normaliseImportedEvent(event, index) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
        throw new Error(`Task ${index + 1} is not an object.`);
    }

    const start = String(event.start ?? '');
    if (!parseLocalDate(start)) {
        throw new Error(`Task ${index + 1} has a missing or invalid date.`);
    }

    const title = String(event.title ?? '').trim();
    if (!title) {
        throw new Error(`Task ${index + 1} is missing a title.`);
    }

    const props = event.extendedProps && typeof event.extendedProps === 'object'
        ? event.extendedProps
        : {};

    // The optional parking and meeting points are kept as-is (validated); an invalid one is dropped.
    const parking = cleanParking(props.parking);
    const meeting = cleanMeeting(props.meeting);

    return {
        id: String(event.id || createTaskId()),
        title,
        start,
        allDay: true,
        extendedProps: {
            location: String(props.location ?? '').trim() || 'Unspecified Location',
            description: String(props.description ?? ''),
            equipment: String(props.equipment ?? ''),
            difficulty: ['Easy', 'Moderate', 'Strenuous'].includes(String(props.difficulty))
                ? String(props.difficulty)
                : 'Moderate',
            ...(parking ? { parking } : {}),
            ...(meeting ? { meeting } : {})
        }
    };
}

// ---------------------------------------------------------------------------
// Theme handling
// ---------------------------------------------------------------------------

/** Follow the device's light/dark setting unless the user has picked a theme with the footer link. */
function initTheme() {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const readSaved = () => {
        try { return localStorage.getItem('theme'); } catch (error) { return null; }
    };
    const apply = (isDark) => {
        document.documentElement.classList.toggle('dark', Boolean(isDark));
        updateThemeIcon();
    };
    const saved = readSaved();
    apply(saved ? saved === 'dark' : media?.matches);
    media?.addEventListener?.('change', (event) => {
        if (!readSaved()) {
            fadeThemeChange();
            apply(event.matches);
        }
    });
}

/** Cross-fade colours briefly while the theme switches (CSS: html.theme-fade). */
function fadeThemeChange() {
    const root = document.documentElement;
    root.classList.add('theme-fade');
    window.clearTimeout(fadeThemeChange.timer);
    fadeThemeChange.timer = window.setTimeout(() => root.classList.remove('theme-fade'), 400);
}

/** Switch between light and dark mode and remember the choice. */
function toggleDarkMode() {
    fadeThemeChange();
    const isDark = document.documentElement.classList.toggle('dark');
    try {
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch (error) {
        // Theme switching remains available for this page even without storage.
    }
    updateThemeIcon();
}

/** Keep the footer link's wording in step with the current mode. */
function updateThemeIcon() {
    const button = document.getElementById('theme-toggle-btn');
    if (!button) return;
    const isDark = document.documentElement.classList.contains('dark');
    button.textContent = isDark ? 'Click to toggle light mode' : 'Click to toggle dark mode';
}
// ---------------------------------------------------------------------------
// Modal helpers (shared by the task editor and the alert/confirm dialog)
// ---------------------------------------------------------------------------

const modalOpeners = new Map();

/** Reveal a modal, remember the previously focused element, and move focus inside. */
function showModal(modal, focusTarget, { always = false } = {}) {
    modalOpeners.set(modal.id, document.activeElement);
    modal.hidden = false;

    const panel = modal.querySelector('.modal');
    panel.tabIndex = -1;
    // On touch screens, skip auto-focusing a text field so the keyboard doesn't cover the form.
    const skipField = !always && window.matchMedia('(pointer: coarse)').matches;
    (skipField || !focusTarget ? panel : focusTarget).focus({ preventScroll: true });
}

/** Hide a modal and return focus to whatever opened it. */
function hideModal(modal) {
    modal.hidden = true;
    const opener = modalOpeners.get(modal.id);
    modalOpeners.delete(modal.id);
    if (opener && document.contains(opener) && !opener.closest('[hidden]')) {
        opener.focus({ preventScroll: true });
    }
}

/** Keep Tab / Shift+Tab inside the open modal. */
function trapFocus(event, modal) {
    const panel = modal.querySelector('.modal');
    const focusable = [...panel.querySelectorAll('button, [href], summary, input:not([type="hidden"]), select, textarea')]
        .filter((element) => !element.disabled && element.getClientRects().length > 0);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (!panel.contains(active)) {
        event.preventDefault();
        first.focus();
    } else if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
    }
}

/** Display an alert or a yes/no confirmation in the custom dialog. */
function showDialog(title, message, type = 'alert', callback = null) {
    document.getElementById('dialog-title').textContent = title;
    document.getElementById('dialog-msg').textContent = message;

    const isConfirm = type === 'confirm';
    const cancelButton = document.getElementById('dialog-cancel');
    cancelButton.hidden = !isConfirm;
    confirmCallback = isConfirm && typeof callback === 'function' ? callback : null;

    // Confirmations open on "Cancel" so a stray Enter never deletes anything.
    showModal(dialogModal(), isConfirm ? cancelButton : document.getElementById('dialog-ok'), { always: true });
}

/** Hide the custom dialog and discard any pending confirmation callback. */
function closeDialog() {
    hideModal(dialogModal());
    confirmCallback = null;
}

/** Wire page controls and form widgets without inline event handlers. */
function bindUIEvents() {
    document.getElementById('theme-toggle-btn').addEventListener('click', toggleDarkMode);
    document.querySelector('[data-action="open-json-upload"]').addEventListener('click', () => {
        document.getElementById('json-upload').click();
    });
    document.getElementById('json-upload').addEventListener('change', loadJSON);
    document.querySelector('[data-action="save-json"]').addEventListener('click', saveJSON);
    document.querySelector('[data-action="generate-pdf"]').addEventListener('click', generatePDF);
    document.getElementById('btn-delete').addEventListener('click', requestDeleteTask);

    // The footer's Save button submits the form, so Enter in a text field saves too.
    document.getElementById('task-form').addEventListener('submit', (event) => {
        event.preventDefault();
        saveTask();
    });

    document.querySelectorAll('[data-action="close-modal"]').forEach((button) => {
        button.addEventListener('click', closeModal);
    });

    // Event delegation keeps chip behaviour consistent for every chip.
    document.getElementById('location-chips').addEventListener('click', (event) => {
        const chip = event.target.closest('.chip');
        if (!chip) return;
        if (chip.dataset.location) setLocation(chip.dataset.location);
        else chooseOtherLocation();
    });
    document.getElementById('equipment-chips').addEventListener('click', (event) => {
        const chip = event.target.closest('.chip');
        if (chip) toggleEquipment(chip);
    });
    document.querySelectorAll('.segment').forEach((segment) => {
        segment.addEventListener('click', () => setDifficulty(segment.dataset.diff));
    });

    // Typing clears an inline error; the title also keeps the preset highlight in sync.
    document.getElementById('task-title').addEventListener('input', () => {
        setFieldError('title', false);
        syncPresetState();
    });
    document.getElementById('task-location').addEventListener('input', () => setFieldError('location', false));
    document.getElementById('task-date').addEventListener('input', updateDateDisplay);
    bindMeetingEvents();
}

/** Register modal buttons once, after their elements exist. */
function bindDialogEvents() {
    document.getElementById('dialog-cancel').addEventListener('click', closeDialog);
    document.getElementById('dialog-ok').addEventListener('click', () => {
        // Clear the callback before invoking it to avoid accidental re-use.
        const callback = confirmCallback;
        closeDialog();
        if (callback) callback();
    });
}

// ---------------------------------------------------------------------------
// Chips, presets and calendar
// ---------------------------------------------------------------------------

/** Create a toggle chip button. */
function createChip(label, attributes, small = false) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = small ? 'chip chip-sm' : 'chip';
    chip.textContent = label;
    Object.entries(attributes).forEach(([name, value]) => chip.setAttribute(name, value));
    return chip;
}

/** Build the location and equipment chip groups of the task editor. */
function buildChoiceChips() {
    const locations = document.getElementById('location-chips');
    LOCATIONS.forEach((location) => {
        locations.appendChild(createChip(location, { 'data-location': location, 'aria-pressed': 'false' }));
    });
    locations.appendChild(createChip('Other', { 'data-location-other': '', 'aria-pressed': 'false' }));

    const equipment = document.getElementById('equipment-chips');
    EQUIPMENT.forEach((item) => {
        equipment.appendChild(createChip(item, { 'data-value': item, 'data-selected': 'false', 'aria-pressed': 'false' }));
    });
}

/** Build the quick-preset buttons from the task template data. */
function buildPresetsUI() {
    const container = document.getElementById('presets-container');
    container.replaceChildren();

    taskPresets.forEach((preset, index) => {
        const chip = createChip(preset.title, { 'data-preset': index, 'aria-pressed': 'false' }, true);
        chip.addEventListener('click', () => loadPreset(index));
        container.appendChild(chip);
    });
}

/** Fade the calendar body in when the month or view changes (skipped for reduced motion). */
function animateCalendarView() {
    const harness = document.querySelector('#calendar .fc-view-harness');
    if (!harness || !harness.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    harness.animate(
        [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        { duration: parseFloat(token('--dur-slow')) || 480, easing: token('--ease') || 'ease-out' }
    );
}

/** Create the FullCalendar instance and map its clicks to the task editor. */
function initCalendar() {
    const calendarElement = document.getElementById('calendar');

    calendar = new FullCalendar.Calendar(calendarElement, {
        initialDate: DEFAULT_START_DATE,
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,dayGridWeek'
        },
        buttonText: { today: 'Today', month: 'Month', week: 'Week' },
        height: 'auto',
        dayMaxEvents: 1,
        moreLinkContent: (arg) => (window.matchMedia('(max-width: 640px)').matches ? `+${arg.num}` : `+${arg.num} more`),
        views: { dayGridWeek: { dayMaxEvents: 3 } },
        firstDay: 1,
        selectable: true,

        // Drag a task to another day to reschedule it (long-press on touch screens).
        editable: true,
        eventDurationEditable: false,
        eventLongPressDelay: 400,
        longPressDelay: 400,
        dragRevertDuration: 200,
        eventInteractive: true,

        dateClick(info) {
            openFormForDate(info.dateStr);
        },

        eventClick(info) {
            openFormForEvent(info.event);
        },

        eventDragStart() {
            calendarElement.classList.add('is-dragging');
        },

        eventDragStop() {
            calendarElement.classList.remove('is-dragging');
        },

        eventDrop(info) {
            updateBottomList();
            const oldEvent = info.oldEvent;
            showToast(`Moved to ${formatDateString(info.event.startStr.split('T')[0], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`, {
                label: 'Undo',
                onClick() {
                    const task = calendar.getEventById(info.event.id);
                    if (!task) return;
                    task.setDates(oldEvent.start, oldEvent.end, { allDay: oldEvent.allDay });
                    updateBottomList();
                    showToast('Move undone');
                }
            });
        },

        datesSet: animateCalendarView,

        eventClassNames(argument) {
            return [`event-${difficultyClass(argument.event.extendedProps.difficulty)}`];
        },

        // Use escaped text for imported/user-created titles and locations.
        eventContent(argument) {
            const level = difficultyClass(argument.event.extendedProps.difficulty);
            const title = escapeHTML(argument.event.title);
            const location = escapeHTML(argument.event.extendedProps.location || 'TBD');
            return {
                html: `<div class="fc-event-content event-${level}"><span class="fc-event-title-custom">${title}</span><span class="fc-event-location">${location}</span></div>`
            };
        },

        eventDidMount(info) {
            info.el.setAttribute('aria-label', `${info.event.title}, ${info.event.extendedProps.location || 'location to be confirmed'}, ${info.event.extendedProps.difficulty || 'Moderate'}`);
        }
    });

    calendar.render();
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

let toastTimer = null;

/** Show a short status message, optionally with one action button (e.g. Undo). */
function showToast(message, action = null) {
    const toast = document.getElementById('toast');
    toast.textContent = '';
    const text = document.createElement('span');
    text.textContent = message;
    toast.append(text);

    if (action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'toast-action';
        button.textContent = action.label;
        button.addEventListener('click', () => {
            toast.hidden = true;
            action.onClick();
        });
        toast.append(button);
    }

    toast.hidden = false;
    // Re-trigger the entrance animation when a toast replaces another.
    toast.style.animation = 'none';
    void toast.offsetWidth;
    toast.style.animation = '';
    window.clearTimeout(toastTimer);
    const hide = () => { toastTimer = window.setTimeout(() => { toast.hidden = true; }, action ? 8000 : 3600); };
    hide();
    // Keep an actionable toast open while it is hovered or focused.
    toast.onmouseenter = toast.onfocusin = () => window.clearTimeout(toastTimer);
    toast.onmouseleave = toast.onfocusout = hide;
}

// ---------------------------------------------------------------------------
// Task directory grouped by location
// ---------------------------------------------------------------------------

/** Build the markup for one task card in the directory. */
function taskCardMarkup(event) {
    const dateText = event.start
        ? event.start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
        : 'Date not set';
    const difficulty = String(event.extendedProps.difficulty || '').trim();
    const description = event.extendedProps.description || 'No description provided.';
    const equipment = String(event.extendedProps.equipment || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    const equipmentMarkup = equipment.map((item) => `<span class="equipment-chip">${escapeHTML(item)}</span>`).join('');
    // Quiet lines only when the manager chose a parking or meeting point other than the site's defaults.
    const parking = cleanParking(event.extendedProps.parking);
    const meeting = cleanMeeting(event.extendedProps.meeting);
    const meetingMarkup = [
        parking ? `<p class="task-card-meet"><span class="place-badge place-badge-sm" aria-hidden="true">P</span><span>Park at: ${escapeHTML(parking.label)}</span></p>` : '',
        meeting ? `<p class="task-card-meet"><i data-lucide="map-pin" aria-hidden="true"></i><span>Meet at: ${escapeHTML(meeting.label)}</span></p>` : ''
    ].join('');

    // A thin bar along the bottom edge is a rough guide to difficulty; no difficulty, no bar.
    const difficultyBar = difficulty
        ? `<span class="task-card-bar bar-${difficultyClass(difficulty)}" role="img" aria-label="Difficulty: ${escapeHTML(difficulty)}" title="Difficulty: ${escapeHTML(difficulty)}"></span>`
        : '';

    return `
        <article class="task-card">
            <div class="task-date"><i data-lucide="calendar" aria-hidden="true"></i><span>${escapeHTML(dateText)}</span></div>
            <div class="task-card-main">
                <h4>${escapeHTML(event.title)}</h4>
                <p class="task-card-description">${escapeHTML(description)}</p>
                ${meetingMarkup}
                ${equipmentMarkup ? `<div class="task-card-meta">${equipmentMarkup}</div>` : ''}
            </div>
            <div class="task-card-actions">
                <button type="button" class="button button-sm" data-edit-event-id="${escapeHTML(event.id)}" aria-label="Edit ${escapeHTML(event.title)}">
                    <i data-lucide="pencil" aria-hidden="true"></i>Edit
                </button>
            </div>
            ${difficultyBar}
        </article>`;
}

/** Re-render the directory below the calendar, grouped by location and date. */
function updateBottomList() {
    const container = document.getElementById('grouped-tasks-container');
    const events = calendar.getEvents();

    if (events.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon"><i data-lucide="calendar-plus" aria-hidden="true"></i></span>
                <p>No tasks yet. Select a date on the calendar to add one.</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    // Group events by their location, then sort locations and event dates.
    const groupedTasks = new Map();
    events.forEach((event) => {
        const location = event.extendedProps.location || 'Unspecified Location';
        if (!groupedTasks.has(location)) groupedTasks.set(location, []);
        groupedTasks.get(location).push(event);
    });

    container.innerHTML = [...groupedTasks.keys()].sort((a, b) => a.localeCompare(b)).map((location) => {
        const locationEvents = groupedTasks.get(location).sort((a, b) => a.start - b.start);
        return `
            <section class="location-group">
                <header class="location-group-header">
                    <div class="location-heading"><i data-lucide="map-pin" aria-hidden="true"></i><h3>${escapeHTML(location)}</h3></div>
                    <span class="location-count">${locationEvents.length} ${locationEvents.length === 1 ? 'task' : 'tasks'}</span>
                </header>
                <div class="location-task-list">${locationEvents.map(taskCardMarkup).join('')}</div>
            </section>`;
    }).join('');
    lucide.createIcons();
}

/** Delegate edit clicks from task cards without inline JavaScript attributes. */
function bindDirectoryEvents() {
    const container = document.getElementById('grouped-tasks-container');
    container.addEventListener('click', (event) => {
        const button = event.target.closest('[data-edit-event-id]');
        if (!button || !container.contains(button)) return;
        openFormFromList(button.dataset.editEventId);
    });
}

// ---------------------------------------------------------------------------
// JSON import and export
// ---------------------------------------------------------------------------

/** Download all tasks as a portable JSON file. */
function saveJSON() {
    const events = calendar.getEvents().map((event) => {
        // `parking` and `meeting` are optional: only tasks with a non-default point carry them.
        const parking = cleanParking(event.extendedProps.parking);
        const meeting = cleanMeeting(event.extendedProps.meeting);
        return {
            id: event.id,
            title: event.title,
            start: event.startStr.split('T')[0],
            allDay: true,
            extendedProps: {
                location: event.extendedProps.location || '',
                description: event.extendedProps.description || '',
                equipment: event.extendedProps.equipment || '',
                difficulty: event.extendedProps.difficulty || 'Moderate',
                ...(parking ? { parking } : {}),
                ...(meeting ? { meeting } : {})
            }
        };
    });

    if (events.length === 0) {
        showDialog('Empty Calendar', 'There are no tasks to save.', 'alert');
        return;
    }

    const file = new Blob([JSON.stringify(events, null, 2)], {
        type: 'application/json;charset=utf-8'
    });
    const downloadUrl = URL.createObjectURL(file);
    const downloadLink = document.createElement('a');
    downloadLink.href = downloadUrl;
    downloadLink.download = 'volunteer_plan_2027.json';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}

/** Read, validate and import a JSON task file after user confirmation. */
function loadJSON(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const rawEvents = JSON.parse(String(reader.result ?? ''));
            if (!Array.isArray(rawEvents)) {
                throw new Error('The JSON file must contain an array of tasks.');
            }
            const importedEvents = rawEvents.map(normaliseImportedEvent);

            showDialog(
                'Import Tasks',
                `Found ${importedEvents.length} task${importedEvents.length === 1 ? '' : 's'}. Clear existing tasks before importing?`,
                'confirm',
                () => {
                    calendar.removeAllEvents();
                    importedEvents.forEach((task) => calendar.addEvent(task));
                    updateBottomList();
                    document.getElementById('json-upload').value = '';
                }
            );
        } catch (error) {
            showDialog(
                'Unable to Import Tasks',
                error instanceof SyntaxError
                    ? 'The selected file is not valid JSON.'
                    : (error.message || 'The selected file is not a valid task file.'),
                'alert'
            );
            document.getElementById('json-upload').value = '';
        }
    };
    reader.onerror = () => {
        showDialog('File Read Error', 'The selected file could not be read.', 'alert');
        document.getElementById('json-upload').value = '';
    };
    reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// Task editor and form state
// ---------------------------------------------------------------------------

/** Show the task editor; the title field gets focus first. */
function openModal() {
    taskModal().querySelector('.modal-body').scrollTop = 0;
    showModal(taskModal(), document.getElementById('task-title'));
}

/** Hide the task editor modal. */
function closeModal() {
    hideModal(taskModal());
}

/** Show or clear an inline validation message ('title' or 'location'). */
function setFieldError(field, show) {
    document.getElementById(`err-${field}`).hidden = !show;
    const targets = field === 'title' ? ['task-title'] : ['task-location', 'location-chips'];
    targets.forEach((id) => {
        const element = document.getElementById(id);
        if (show) element.setAttribute('aria-invalid', 'true');
        else element.removeAttribute('aria-invalid');
    });
}

/** Set a chip's selected state, exposed both as a data attribute and to assistive tech. */
function setChipSelected(chip, selected) {
    chip.dataset.selected = String(selected);
    chip.setAttribute('aria-pressed', String(selected));
}

/** Reflect the location value in the chip group and the custom-location field. */
function syncLocationUI() {
    const input = document.getElementById('task-location');
    const value = input.value.trim();
    const isCustom = customLocation || (value !== '' && !LOCATIONS.includes(value));

    document.querySelectorAll('#location-chips .chip').forEach((chip) => {
        const selected = chip.dataset.location ? !isCustom && chip.dataset.location === value : isCustom;
        chip.setAttribute('aria-pressed', String(selected));
    });
    input.hidden = !isCustom;
    updatePlacesUI();
}

/** Choose one of the suggested sites. A different site starts again from its own carpark and default meeting point. */
function setLocation(location) {
    const input = document.getElementById('task-location');
    const unchanged = !customLocation && input.value.trim() === location;
    input.value = location;
    customLocation = false;
    if (!unchanged) resetPlaces();
    setFieldError('location', false);
    syncLocationUI();
}

/** Switch to a custom location and focus its text field. */
function chooseOtherLocation() {
    const input = document.getElementById('task-location');
    if (LOCATIONS.includes(input.value.trim())) input.value = '';
    if (!customLocation) resetPlaces();
    customLocation = true;
    setFieldError('location', false);
    syncLocationUI();
    input.focus();
}

/** Toggle an equipment chip. */
function toggleEquipment(chip) {
    setChipSelected(chip, chip.dataset.selected !== 'true');
}

/** Return selected preset equipment plus any free-text equipment. */
function getSelectedEquipment() {
    const selectedItems = Array.from(
        document.querySelectorAll('#equipment-chips .chip[data-selected="true"]')
    ).map((chip) => chip.dataset.value);

    const customEquipment = document.getElementById('task-equip-custom').value.trim();
    if (customEquipment) selectedItems.push(customEquipment);
    return selectedItems.join(', ');
}

/** Restore equipment chips and put non-preset equipment in the custom field. */
function setEquipmentFromString(equipmentString) {
    const chips = Array.from(document.querySelectorAll('#equipment-chips .chip'));
    chips.forEach((chip) => setChipSelected(chip, false));

    const customItems = [];
    String(equipmentString ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => {
            // Compare against data values rather than interpolating into a selector.
            const chip = chips.find((candidate) => candidate.dataset.value === item);
            if (chip) setChipSelected(chip, true);
            else customItems.push(item);
        });

    document.getElementById('task-equip-custom').value = customItems.join(', ');
}

/** Mark one difficulty segment as selected and update the hidden form value. */
function setDifficulty(level) {
    document.getElementById('task-diff-value').value = level;
    document.querySelectorAll('.segment').forEach((segment) => {
        segment.setAttribute('aria-pressed', String(segment.dataset.diff === level));
    });
}

/** Highlight the preset chip that matches the current title, if any. */
function syncPresetState() {
    const title = document.getElementById('task-title').value.trim();
    document.querySelectorAll('#presets-container .chip').forEach((chip) => {
        chip.setAttribute('aria-pressed', String(taskPresets[Number(chip.dataset.preset)].title === title));
    });
}

/** Populate the task editor using one of the task presets. */
function loadPreset(index) {
    const preset = taskPresets[index];
    if (!preset) return;

    document.getElementById('task-title').value = preset.title;
    document.getElementById('task-desc').value = preset.desc;
    setEquipmentFromString(preset.equip.join(', '));
    setDifficulty(preset.diff);
    setFieldError('title', false);
    syncPresetState();
    document.getElementById('presets-details').open = false;
    document.getElementById('task-title').focus();
}

/** Put the editor in "add" or "edit" mode. */
function setEditorMode(isEditing) {
    document.getElementById('form-title').textContent = isEditing ? 'Edit task' : 'Add task';
    document.getElementById('btn-delete').hidden = !isEditing;
}

/** Show the chosen date in the editor header. */
function showSelectedDate(dateString) {
    document.getElementById('task-date').value = dateString;
    updateDateDisplay();
}

/** Keep the screen-reader date description in step with the date field. */
function updateDateDisplay() {
    const dateString = document.getElementById('task-date').value;
    document.getElementById('selected-date-display').textContent = parseLocalDate(dateString)
        ? formatDateString(dateString, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : '';
}

/** Clear all fields and return the editor to its new-task state. */
function resetForm() {
    document.getElementById('task-id').value = '';
    document.getElementById('task-date').value = '';
    document.getElementById('task-location').value = '';
    document.getElementById('task-title').value = '';
    document.getElementById('task-desc').value = '';
    document.getElementById('selected-date-display').textContent = '';

    customLocation = false;
    resetPlaces();
    setEquipmentFromString('');
    setDifficulty('Moderate');
    setFieldError('title', false);
    setFieldError('location', false);
    syncLocationUI();
    syncPresetState();
    setEditorMode(false);
    document.getElementById('presets-details').open = false;
}

/** Open a blank task form for the date selected in the calendar. */
function openFormForDate(dateString) {
    if (!parseLocalDate(dateString)) {
        showDialog('Invalid Date', 'Please select a valid calendar date.', 'alert');
        return;
    }

    resetForm();
    showSelectedDate(dateString);
    openModal();
}

/** Load a calendar event into the editor for modification or deletion. */
function openFormForEvent(event) {
    resetForm();
    setEditorMode(true);
    document.getElementById('task-id').value = event.id;
    showSelectedDate(event.startStr.split('T')[0]);

    document.getElementById('task-title').value = event.title;
    document.getElementById('task-location').value = event.extendedProps.location || '';
    document.getElementById('task-desc').value = event.extendedProps.description || '';
    setEquipmentFromString(event.extendedProps.equipment || '');
    setDifficulty(event.extendedProps.difficulty || 'Moderate');
    // Restore the saved parking and meeting points (none saved = the site's defaults).
    const savedParking = cleanParking(event.extendedProps.parking);
    if (savedParking) {
        parkingDraft = { lat: savedParking.lat, lon: savedParking.lon };
        parkingName = savedParking.label === DEFAULT_PARKING_LABEL ? '' : savedParking.label;
    }
    const savedMeeting = cleanMeeting(event.extendedProps.meeting);
    if (savedMeeting) {
        meetingDraft = { lat: savedMeeting.lat, lon: savedMeeting.lon };
        meetingName = savedMeeting.label === DEFAULT_MEETING_LABEL ? '' : savedMeeting.label;
    }
    syncLocationUI();
    syncPresetState();
    openModal();
}

/** Open the editor for a task's ID selected from the directory. */
function openFormFromList(eventId) {
    const event = calendar.getEventById(eventId);
    if (event) openFormForEvent(event);
}

/** Validate the form and add a new event or update the selected event. */
function saveTask() {
    const dateString = document.getElementById('task-date').value;
    if (!parseLocalDate(dateString)) {
        showDialog('Validation Error', 'Please select a valid date.', 'alert');
        return;
    }

    const title = document.getElementById('task-title').value.trim();
    const location = document.getElementById('task-location').value.trim();
    const description = document.getElementById('task-desc').value.trim();
    const equipment = getSelectedEquipment();
    const difficulty = document.getElementById('task-diff-value').value || 'Moderate';
    const eventId = document.getElementById('task-id').value;
    // Only non-default points are stored; null leaves the field out of the data.
    const parking = parkingToSave();
    const meeting = meetingToSave();

    // Inline validation: show every problem, then focus the first one.
    setFieldError('title', !title);
    setFieldError('location', !location);
    if (!title || !location) {
        const locationInput = document.getElementById('task-location');
        const firstProblem = !title
            ? document.getElementById('task-title')
            : (locationInput.hidden ? document.querySelector('#location-chips .chip') : locationInput);
        firstProblem.focus();
        return;
    }

    if (eventId) {
        const existingEvent = calendar.getEventById(eventId);
        if (!existingEvent) {
            showDialog('Task Not Found', 'This task no longer exists in the calendar.', 'alert');
            closeModal();
            return;
        }

        existingEvent.setProp('title', title);
        existingEvent.setStart(dateString);
        existingEvent.setExtendedProp('location', location);
        existingEvent.setExtendedProp('description', description);
        existingEvent.setExtendedProp('equipment', equipment);
        existingEvent.setExtendedProp('difficulty', difficulty);
        existingEvent.setExtendedProp('parking', parking);
        existingEvent.setExtendedProp('meeting', meeting);
    } else {
        calendar.addEvent({
            id: createTaskId(),
            title,
            start: dateString,
            allDay: true,
            extendedProps: { location, description, equipment, difficulty, ...(parking ? { parking } : {}), ...(meeting ? { meeting } : {}) }
        });
    }

    updateBottomList();
    closeModal();
}

/** Ask for confirmation before permanently removing a task. */
function requestDeleteTask() {
    showDialog(
        'Confirm Deletion',
        'Are you sure you want to remove this task?',
        'confirm',
        () => {
            const eventId = document.getElementById('task-id').value;
            const event = calendar.getEventById(eventId);
            if (!event) return;

            event.remove();
            updateBottomList();
            closeModal();
        }
    );
}

// ---------------------------------------------------------------------------
// Parking and meeting point
// ---------------------------------------------------------------------------
//
// "Where is it?" is the place volunteers PARK. Each preset site has a carpark in locations.js, so a task needs
// no extra step. The meeting point is separate and defaults to the parking (Peppercombe: the top gate).
// Only a value that differs from its default is stored: extendedProps.parking / extendedProps.meeting = { label, lat, lon }.
// For a custom ('Other') location the manager can drop a parking pin, which is then always stored.
// parkingDraft / meetingDraft hold chosen points (null = use the default); the names hold their labels.

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';
const MAP_ATTRIBUTION = '<a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
// Satellite option for choosing the parking and meeting point: Esri World Imagery raster tiles (free, no API key; attribution required).
const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';
const BASEMAP_STORAGE_KEY = 'planner-place-basemap';
const MAP_START_VIEW = [50.93, -4.35]; // North Devon, used while there is no point to show

let parkingDraft = null;   // { lat, lon } chosen by the manager, or null
let meetingDraft = null;   // { lat, lon } chosen by the manager, or null
let parkingName = '';
let meetingName = '';
let placeMode = null;      // which place the open panel edits: 'parking', 'meeting' or null (closed; custom locations are always open)
let placeMap = null;       // Leaflet map, created the first time the panel is opened
let parkingMarker = null;
let meetingMarker = null;

/** The preset site the form is set to, or null for 'Other' (or nothing chosen yet). */
function activeSite() {
    const value = document.getElementById('task-location').value.trim();
    const places = window.VOL_PLACES || window.VOL_MEETING;
    if (customLocation || !LOCATIONS.includes(value) || !places) return null;
    return places.siteFor(value);
}

/** Has the manager chosen a location yet (a site chip, or 'Other')? */
function hasLocationChoice() {
    return customLocation || document.getElementById('task-location').value.trim() !== '';
}

const sameSpot = (a, b) => Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lon - b.lon) < 1e-6;

/** Which place the panel is editing right now. */
const activeMode = () => placeMode || 'parking';

/** Is the map panel open? Presets open it on request; a custom location always shows it. */
const isPanelOpen = () => (activeSite() ? placeMode !== null : true);

/**
 * Where volunteers park right now: { label, lat, lon, custom } or null (a custom location with no pin yet).
 * A pin left exactly on the carpark with no new name is still just the default.
 */
function currentParking() {
    const site = activeSite();
    const fallback = site ? site.parking : null;
    const name = parkingName.trim();
    if (!parkingDraft) return fallback ? { ...fallback, custom: false } : null;
    if (fallback && sameSpot(parkingDraft, fallback) && (!name || name === fallback.label)) return { ...fallback, custom: false };
    return { label: name || DEFAULT_PARKING_LABEL, lat: parkingDraft.lat, lon: parkingDraft.lon, custom: true };
}

/** The meeting point when none is chosen: the site's own (Peppercombe top gate), else the parking. */
function defaultMeeting() {
    const site = activeSite();
    if (site && site.meeting) return { ...site.meeting };
    const parking = currentParking();
    return parking ? { label: parking.label, lat: parking.lat, lon: parking.lon } : null;
}

/** Where the task meets right now: { label, lat, lon, custom } or null (no pin and no default). */
function currentMeeting() {
    const fallback = defaultMeeting();
    const name = meetingName.trim();
    if (!meetingDraft) return fallback ? { ...fallback, custom: false } : null;
    if (fallback && sameSpot(meetingDraft, fallback) && (!name || name === fallback.label)) return { ...fallback, custom: false };
    return { label: name || DEFAULT_MEETING_LABEL, lat: meetingDraft.lat, lon: meetingDraft.lon, custom: true };
}

/** The value to store: only a non-default point, rounded to ~0.1 m. */
function pointToSave(point) {
    if (!point || !point.custom) return null;
    return { label: point.label, lat: Number(point.lat.toFixed(6)), lon: Number(point.lon.toFixed(6)) };
}
const parkingToSave = () => pointToSave(currentParking());
const meetingToSave = () => pointToSave(currentMeeting());

/** Forget any chosen points and close the panel (new task or new site). */
function resetPlaces() {
    parkingDraft = null;
    meetingDraft = null;
    parkingName = '';
    meetingName = '';
    placeMode = null;
    document.getElementById('meeting-name').value = '';
}

/** Parking marker: a blue, dashed, see-through circle with a P (a fixed 36px, so it never scales with the map). */
function parkingIcon(label) {
    return L.divIcon({
        className: 'map-icon',
        html: `<span class="map-parking" role="img" aria-label="Parking: ${escapeHTML(label)}">P</span>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });
}

/** Meeting marker: the green pin. Its tip is always exactly on its point, so on the parking spot the tip sits at the centre of the P circle. */
function meetingIcon(label) {
    return L.divIcon({
        className: 'map-icon',
        html: `<span class="map-pin-meet" role="img" aria-label="Meeting point: ${escapeHTML(label)}"></span>`,
        iconSize: [36, 36],
        iconAnchor: [18, 43.5]
    });
}

/**
 * Map / Satellite switch. The imagery sits in its own tile pane above the vector map and below the markers, so switching
 * only adds or removes that layer: pins, zoom and centre are never touched. The choice lasts for the browser session.
 */
function addBasemapToggle(map, host) {
    map.createPane('satellite').style.zIndex = 450;
    const imagery = L.tileLayer(SATELLITE_URL, { pane: 'satellite', maxNativeZoom: 19, maxZoom: 22, attribution: SATELLITE_ATTRIBUTION });
    let saved = 'map';
    try { saved = window.sessionStorage.getItem(BASEMAP_STORAGE_KEY) === 'satellite' ? 'satellite' : 'map'; } catch (error) { /* storage blocked: default map */ }

    const Toggle = L.Control.extend({
        options: { position: 'topright' },
        onAdd() {
            const box = L.DomUtil.create('div', 'basemap-toggle');
            box.setAttribute('role', 'group');
            box.setAttribute('aria-label', 'Map style');
            [['map', 'Map'], ['satellite', 'Satellite']].forEach(([value, text]) => {
                const button = L.DomUtil.create('button', 'basemap-btn', box);
                button.type = 'button';
                button.dataset.base = value;
                button.textContent = text;
                button.setAttribute('aria-pressed', 'false');
            });
            L.DomEvent.disableClickPropagation(box);
            L.DomEvent.disableScrollPropagation(box);
            box.addEventListener('click', (event) => {
                const button = event.target.closest('.basemap-btn');
                if (button) apply(button.dataset.base, true);
            });
            return box;
        }
    });
    const control = new Toggle().addTo(map);

    function apply(mode, remember) {
        const satellite = mode === 'satellite';
        if (satellite) imagery.addTo(map); else map.removeLayer(imagery);
        host.classList.toggle('is-satellite', satellite);
        control.getContainer().querySelectorAll('.basemap-btn').forEach((button) => {
            button.setAttribute('aria-pressed', String(button.dataset.base === mode));
        });
        if (remember) {
            try { window.sessionStorage.setItem(BASEMAP_STORAGE_KEY, mode); } catch (error) { /* ignore */ }
        }
    }
    apply(saved, false);
}

/** Create the map the first time it is needed (the panel must already be visible). */
function createPlaceMap() {
    const host = document.getElementById('meeting-map');
    if (!window.L || !window.L.maplibreGL) {
        host.innerHTML = '<div class="map-placeholder">The map could not load. Check your connection; the default parking and meeting point will still be used.</div>';
        return null;
    }
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
        const map = L.map(host, {
            scrollWheelZoom: true, attributionControl: false,
            zoomAnimation: !calm, fadeAnimation: !calm, markerZoomAnimation: !calm, inertia: !calm
        }).setView(MAP_START_VIEW, 10, { animate: false });
        L.maplibreGL({ style: MAP_STYLE_URL, attribution: MAP_ATTRIBUTION }).addTo(map);
        L.control.attribution({ prefix: false }).addTo(map);
        addBasemapToggle(map, host);
        // Click (or tap) anywhere to put the chosen place there.
        map.on('click', (event) => setPlacePoint(activeMode(), event.latlng));
        // Keyboard route: Enter puts the chosen place at the centre of the map.
        host.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && event.target === host) {
                event.preventDefault();
                setPlacePoint(activeMode(), map.getCenter());
            }
        });
        return map;
    } catch (error) {
        console.warn('Map could not start:', error);
        host.innerHTML = '<div class="map-placeholder">The map could not start in this browser. The default parking and meeting point will still be used.</div>';
        return null;
    }
}

/** Redraw both markers; only the place being edited can be moved, so clicks never hit the other one. */
function drawPlaceMarkers() {
    [parkingMarker, meetingMarker].forEach((marker) => { if (marker) marker.remove(); });
    parkingMarker = null;
    meetingMarker = null;
    const parking = currentParking();
    const meeting = currentMeeting();
    const mode = activeMode();
    if (parking) {
        const editable = mode === 'parking';
        parkingMarker = L.marker([parking.lat, parking.lon], {
            icon: parkingIcon(parking.label), interactive: editable, draggable: editable, keyboard: editable,
            title: `Parking: ${parking.label}${editable ? ' (drag to move)' : ''}`
        }).addTo(placeMap);
        if (editable) parkingMarker.on('dragend', () => setPlacePoint('parking', parkingMarker.getLatLng()));
    }
    if (meeting) {
        const editable = mode === 'meeting';
        meetingMarker = L.marker([meeting.lat, meeting.lon], {
            icon: meetingIcon(meeting.label), interactive: editable, draggable: editable, keyboard: editable,
            zIndexOffset: 1000, title: `Meeting point: ${meeting.label}${editable ? ' (drag to move)' : ''}`
        }).addTo(placeMap);
        if (editable) meetingMarker.on('dragend', () => setPlacePoint('meeting', meetingMarker.getLatLng()));
    }
}

/** Show the current points on the map (fitting both when they differ, only when asked, so clicks do not make it jump). */
function showPlacesOnMap(recenter) {
    if (!placeMap) placeMap = createPlaceMap();
    if (!placeMap) return;
    drawPlaceMarkers();
    const points = [currentParking(), currentMeeting()].filter(Boolean);
    const fit = () => {
        if (!placeMap || !recenter) return;
        if (!points.length) {
            placeMap.setView(MAP_START_VIEW, 10, { animate: false });
        } else if (points.length === 2 && !sameSpot(points[0], points[1])) {
            placeMap.fitBounds(L.latLngBounds(points.map((point) => [point.lat, point.lon])), { padding: [56, 56], maxZoom: 16, animate: false });
        } else {
            placeMap.setView([points[0].lat, points[0].lon], 15, { animate: false });
        }
    };
    fit();
    // The dialog animates in and the panel was hidden, so re-measure once it has settled.
    [60, 520].forEach((delay) => window.setTimeout(() => {
        if (!placeMap) return;
        placeMap.invalidateSize();
        fit();
    }, delay));
}

/** The manager clicked the map, dragged a marker or pressed Enter on the map. */
function setPlacePoint(kind, latlng) {
    const point = { lat: latlng.lat, lon: latlng.lng };
    if (kind === 'parking') {
        // A meeting point that was simply following the parking keeps following it.
        const followed = meetingDraft && !currentMeeting().custom;
        parkingDraft = point;
        if (followed) meetingDraft = null;
    } else {
        meetingDraft = point;
    }
    updatePlacesUI({ recenter: false });
}

/** Bring the "Park at" and "Meet at" lines, the panel and the map in step with the current location and points. */
function updatePlacesUI({ recenter = true } = {}) {
    const block = document.getElementById('meeting');
    const chosen = hasLocationChoice();
    block.hidden = !chosen;
    if (!chosen) return;

    const site = activeSite();
    const parking = currentParking();
    const meeting = currentMeeting();
    const mode = activeMode();
    const open = isPanelOpen();

    // Quiet lines: "Park at: Brownsham carpark   Change parking" and "Meet at: Brownsham carpark   Change meeting point"
    document.getElementById('parking-label').textContent = parking
        ? (parking.custom ? (parkingName.trim() || 'Pin dropped on the map') : parking.label)
        : 'Not set yet (optional)';
    const followsParking = Boolean(meeting && !meeting.custom && parking && sameSpot(meeting, parking));
    document.getElementById('meeting-label').textContent = followsParking
        ? document.getElementById('parking-label').textContent
        : (meeting ? (meeting.custom ? (meetingName.trim() || 'Pin dropped on the map') : meeting.label) : 'Same as parking');
    const parkingChange = document.getElementById('parking-change');
    const meetingChange = document.getElementById('meeting-change');
    parkingChange.textContent = parking ? (parking.custom || !site ? 'Move parking' : 'Change parking') : 'Set parking';
    meetingChange.textContent = 'Change meeting point';
    parkingChange.setAttribute('aria-expanded', String(open && mode === 'parking'));
    meetingChange.setAttribute('aria-expanded', String(open && mode === 'meeting'));

    // Panel: which place, a hint, the map, an optional name, and a way back to the default.
    document.getElementById('meeting-panel').hidden = !open;
    document.querySelectorAll('#place-tabs .place-tab').forEach((tab) => {
        tab.setAttribute('aria-pressed', String(tab.dataset.place === mode));
    });
    const point = mode === 'parking' ? parking : meeting;
    const hint = document.getElementById('meeting-hint');
    if (mode === 'parking') {
        hint.textContent = point ? 'Click the map or drag the P to move where volunteers park.' : 'Click the map to drop a pin where volunteers park (optional).';
    } else {
        hint.textContent = point ? 'Click the map or drag the green pin to move the meeting point.' : 'Click the map to drop a pin for the meeting point (optional).';
    }
    document.getElementById('meeting-name-field').hidden = !point;
    const nameInput = document.getElementById('meeting-name');
    const wanted = mode === 'parking' ? parkingName : meetingName;
    if (nameInput.value !== wanted) nameInput.value = wanted;
    nameInput.placeholder = mode === 'parking' ? 'Name the parking (e.g. Layby on the lane)' : 'Name this spot (e.g. Gate by the church)';
    document.querySelector('label[for="meeting-name"]').textContent = mode === 'parking' ? 'Name the parking' : 'Name the meeting point';

    const reset = document.getElementById('meeting-reset');
    const fallback = mode === 'parking' ? (site ? site.parking : null) : defaultMeeting();
    const hasDraft = mode === 'parking' ? Boolean(parkingDraft) : Boolean(meetingDraft);
    reset.textContent = fallback ? `Use ${fallback.label} instead` : 'Remove pin';
    reset.hidden = !hasDraft;

    if (open) showPlacesOnMap(recenter);
}

/** Open (or, for presets, close) the map panel for one of the two places. */
function togglePlacePanel(kind) {
    placeMode = activeSite() && placeMode === kind ? null : kind;
    updatePlacesUI();
    // Bring the freshly opened map into view inside the scrolling dialog.
    if (placeMode) {
        const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.setTimeout(() => document.getElementById('meeting-panel').scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' }), 80);
    }
}

/** Wire the change links, place tabs, name and reset controls once. */
function bindMeetingEvents() {
    document.getElementById('parking-change').addEventListener('click', () => togglePlacePanel('parking'));
    document.getElementById('meeting-change').addEventListener('click', () => togglePlacePanel('meeting'));
    document.querySelectorAll('#place-tabs .place-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            placeMode = tab.dataset.place;
            updatePlacesUI();
        });
    });
    document.getElementById('meeting-reset').addEventListener('click', () => {
        const mode = activeMode();
        if (mode === 'parking') {
            const followed = meetingDraft && !currentMeeting().custom;
            parkingDraft = null;
            parkingName = '';
            if (followed) meetingDraft = null;
        } else {
            meetingDraft = null;
            meetingName = '';
        }
        updatePlacesUI();
        if (activeSite()) document.getElementById(mode === 'parking' ? 'parking-change' : 'meeting-change').focus();
    });
    // Naming the spot keeps the pin where it is (starting from the default if it has not moved).
    document.getElementById('meeting-name').addEventListener('input', (event) => {
        const mode = activeMode();
        const point = mode === 'parking' ? currentParking() : currentMeeting();
        if (!point) return;
        if (mode === 'parking') {
            if (!parkingDraft) parkingDraft = { lat: point.lat, lon: point.lon };
            parkingName = event.target.value;
        } else {
            if (!meetingDraft) meetingDraft = { lat: point.lat, lon: point.lon };
            meetingName = event.target.value;
        }
        updatePlacesUI({ recenter: false });
    });
}
// ---------------------------------------------------------------------------
// PDF export
// ---------------------------------------------------------------------------

/** Load a local image for jsPDF's cover page. */
function loadImage(source) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Unable to load image: ${source}`));
        image.src = source;
    });
}

/**
 * Export the task schedule to a landscape PDF.
 * The required page_1.jpg image must load successfully as the first page.
 * Export is cancelled if the cover is missing or cannot be embedded.
 */
async function generatePDF() {
    const events = calendar.getEvents().sort((first, second) => first.start - second.start);
    if (events.length === 0) {
        showDialog('Export Error', 'The calendar is empty. Please add tasks before downloading the PDF.', 'alert');
        return;
    }

    if (!window.jspdf?.jsPDF) {
        showDialog('PDF Library Missing', 'The PDF library did not load. Check your internet connection and try again.', 'alert');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let fontRegistered = false;

    // jsPDF stores custom font files in its virtual file system before use.
    try {
        if (window.NT_FONT_BASE64) {
            doc.addFileToVFS('NT-Regular.ttf', window.NT_FONT_BASE64);
            doc.addFont('NT-Regular.ttf', 'NT', 'normal');
            doc.setFont('NT', 'normal');
            fontRegistered = true;
        }
    } catch (error) {
        console.warn('Custom PDF font could not be registered; using a built-in font.', error);
    }
    if (!fontRegistered) doc.setFont('helvetica', 'normal');

    // Page 1 is mandatory: never produce a PDF without the supplied cover image.
    try {
        const coverImage = await loadImage('./page_1.jpg');
        doc.addImage(coverImage, 'JPEG', 0, 0, pageWidth, pageHeight);
    } catch (error) {
        console.error('Required PDF cover image could not be loaded or embedded.', error);
        showDialog('PDF Cover Required', 'Cannot export the PDF because page_1.jpg is missing or cannot be read. Place the image next to index.html and try again.', 'alert');
        return;
    }

    // Page 2 onward: a concise schedule table with a running header.
    if (typeof doc.autoTable !== 'function') {
        showDialog('PDF Table Plugin Missing', 'The PDF table plugin did not load. Check your internet connection and try again.', 'alert');
        return;
    }
    doc.addPage('a4', 'landscape');
    const fontName = fontRegistered ? 'NT' : 'helvetica';

    const tableRows = events.map((event) => {
        const dateText = event.start
            ? event.start.toLocaleDateString('en-GB', {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
            })
            : 'Date not set';
        const props = event.extendedProps || {};
        return [
            dateText,
            props.location || 'Unspecified',
            `${event.title}${props.description ? `\n${props.description}` : ''}`,
            props.difficulty || 'Moderate',
            props.equipment || 'None'
        ];
    });

    doc.autoTable({
        startY: 34,
        head: [['Date', 'Location', 'Task Description', 'Difficulty', 'Bring along']],
        body: tableRows,
        theme: 'plain',
        margin: { top: 34, bottom: 20, left: 20, right: 20 },
        styles: {
            font: fontName,
            fontSize: 9.5,
            cellPadding: { top: 6, bottom: 6, left: 0, right: 4 },
            textColor: [51, 65, 85],
            valign: 'top',
            lineColor: [226, 232, 240],
            lineWidth: { bottom: 0.15 }
        },
        headStyles: {
            font: fontName,
            textColor: [11, 28, 48],
            fontSize: 12,
            fontStyle: fontRegistered ? 'normal' : 'bold',
            cellPadding: { top: 0, bottom: 8, left: 0, right: 4 },
            lineWidth: { bottom: 0.5 }
        },
        columnStyles: {
            0: { cellWidth: 38, textColor: [11, 28, 48] },
            1: { cellWidth: 42 },
            2: { cellWidth: 'auto' },
            3: { cellWidth: 30 },
            4: { cellWidth: 55 }
        },
        didDrawPage() {
            doc.setFont(fontName, 'normal');
            doc.setFontSize(11);
            doc.setTextColor(11, 28, 48);
            doc.text('Volunteer Days 2027', 20, 18);
            doc.setFontSize(9);
            doc.text('Bideford Bay & Hartland', 20, 23);
        }
    });

    if (typeof doc.putTotalPages === 'function') {
        doc.putTotalPages('{total_pages_count_string}');
    }
    doc.save('Volunteer_Days_2027_Plan.pdf');
}
