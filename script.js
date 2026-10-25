/*
 * Volunteer Plan 2027 — application logic
 *
 * Responsibilities:
 *   1. Initialise theme, task presets and the FullCalendar instance.
 *   2. Create, edit, delete and display tasks.
 *   3. Import/export the task list as JSON.
 *   4. Export the schedule as a PDF.
 *
 * Third-party libraries (FullCalendar, jsPDF, AutoTable and Lucide)
 * are loaded by index.html. All UI actions are wired from this file; the HTML
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

/** Suggested sites and equipment shown as chips in the task editor. */
const LOCATIONS = ['Brownsham', 'Peppercombe', 'East Titchberry', 'Dunsland', 'Explorer Days'];
const EQUIPMENT = ['Sturdy boots', 'Waterproofs', 'Packed lunch', 'Wellies', 'Cake', 'Scythe'];

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
    if (String(difficulty).includes('Strenuous')) return 'strenuous';
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
                : 'Moderate'
        }
    };
}

// ---------------------------------------------------------------------------
// Theme handling
// ---------------------------------------------------------------------------

/** Apply the saved theme, or follow the browser preference on first visit. */
function initTheme() {
    let savedTheme = null;
    try {
        savedTheme = localStorage.getItem('theme');
    } catch (error) {
        // Some browser privacy settings disable storage; the app still works.
    }

    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle(
        'dark',
        savedTheme === 'dark' || (savedTheme === null && prefersDark)
    );
    updateThemeIcon();
}

/** Switch between light and dark mode (with a brief colour cross-fade) and persist the choice. */
function toggleDarkMode() {
    const root = document.documentElement;
    root.classList.add('theme-fade');
    window.clearTimeout(toggleDarkMode.timer);
    toggleDarkMode.timer = window.setTimeout(() => root.classList.remove('theme-fade'), 400);

    const isDark = root.classList.toggle('dark');
    try {
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch (error) {
        // Theme switching remains available for this page even without storage.
    }
    updateThemeIcon();
}

/** Update the theme button icon and label to match the current mode. */
function updateThemeIcon() {
    const button = document.getElementById('theme-toggle-btn');
    if (!button) return;

    const isDark = document.documentElement.classList.contains('dark');
    button.innerHTML = `<i data-lucide="${isDark ? 'sun' : 'moon'}"></i>`;
    button.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    lucide.createIcons();
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
    const difficulty = event.extendedProps.difficulty || 'Moderate';
    const description = event.extendedProps.description || 'No description provided.';
    const equipment = String(event.extendedProps.equipment || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    const equipmentMarkup = equipment.map((item) => `<span class="equipment-chip">${escapeHTML(item)}</span>`).join('');

    return `
        <article class="task-card">
            <div class="task-date"><i data-lucide="calendar" aria-hidden="true"></i><span>${escapeHTML(dateText)}</span></div>
            <div class="task-card-main">
                <h4>${escapeHTML(event.title)}</h4>
                <p class="task-card-description">${escapeHTML(description)}</p>
                <div class="task-card-meta"><span class="difficulty-badge badge-${difficultyClass(difficulty)}">${escapeHTML(difficulty)}</span>${equipmentMarkup}</div>
            </div>
            <div class="task-card-actions">
                <button type="button" class="button button-sm" data-edit-event-id="${escapeHTML(event.id)}" aria-label="Edit ${escapeHTML(event.title)}">
                    <i data-lucide="pencil" aria-hidden="true"></i>Edit
                </button>
            </div>
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
    const events = calendar.getEvents().map((event) => ({
        id: event.id,
        title: event.title,
        start: event.startStr.split('T')[0],
        allDay: true,
        extendedProps: {
            location: event.extendedProps.location || '',
            description: event.extendedProps.description || '',
            equipment: event.extendedProps.equipment || '',
            difficulty: event.extendedProps.difficulty || 'Moderate'
        }
    }));

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
}

/** Choose one of the suggested sites. */
function setLocation(location) {
    document.getElementById('task-location').value = location;
    customLocation = false;
    setFieldError('location', false);
    syncLocationUI();
}

/** Switch to a custom location and focus its text field. */
function chooseOtherLocation() {
    const input = document.getElementById('task-location');
    if (LOCATIONS.includes(input.value.trim())) input.value = '';
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
    } else {
        calendar.addEvent({
            id: createTaskId(),
            title,
            start: dateString,
            allDay: true,
            extendedProps: { location, description, equipment, difficulty }
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
