/*
 * Volunteer Plan 2027 — application logic
 *
 * Responsibilities:
 *   1. Initialise theme, task presets and the FullCalendar instance.
 *   2. Create, edit, delete and display tasks.
 *   3. Import/export the task list as JSON.
 *   4. Export the schedule as a PDF.
 *
 * Third-party libraries (Tailwind, FullCalendar, jsPDF, AutoTable and Lucide)
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

/** Class groups used to mark selected and unselected equipment chips. */
const CHIP_ACTIVE = [
    'border-zinc-800', 'bg-zinc-800', 'text-white',
    'dark:border-zinc-200', 'dark:bg-zinc-200', 'dark:text-zinc-900'
];
const CHIP_INACTIVE = [
    'border-zinc-300', 'bg-white', 'text-zinc-600',
    'dark:border-zinc-700', 'dark:bg-zinc-950', 'dark:text-zinc-400'
];

let calendar;
let confirmCallback = null;

// Initialise only after all of the page's elements have been parsed.
document.addEventListener('DOMContentLoaded', initialiseApp);

/** Set up the app in dependency order. */
function initialiseApp() {
    initTheme();
    lucide.createIcons();
    buildPresetsUI();
    initCalendar();
    bindUIEvents();
    bindDialogEvents();
    bindDirectoryEvents();
    resetForm();
    updateBottomList();

    // Keep FullCalendar's dimensions correct after a window resize.
    window.addEventListener('resize', () => {
        if (calendar) calendar.updateSize();
    });

    // Escape closes the topmost modal without confirming any action.
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (!document.getElementById('dialog-modal').classList.contains('hidden')) {
            closeDialog();
        } else if (!document.getElementById('task-modal').classList.contains('hidden')) {
            closeModal();
        }
    });
}

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

/** Return the CSS classes for a difficulty label. */
function getDifficultyBadgeClasses(difficulty) {
    if (String(difficulty).includes('Easy')) {
        return 'text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/20 dark:border-green-900/50';
    }
    if (String(difficulty).includes('Strenuous')) {
        return 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-900/50';
    }
    return 'text-yellow-700 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-900/20 dark:border-yellow-900/50';
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

/** Switch between light and dark mode and persist the user's preference. */
function toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    try {
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch (error) {
        // Theme switching remains available for this page even without storage.
    }
    updateThemeIcon();
}

/** Update the theme button icon to match the current mode. */
function updateThemeIcon() {
    const button = document.getElementById('theme-toggle-btn');
    if (!button) return;

    const iconName = document.documentElement.classList.contains('dark') ? 'sun' : 'moon';
    button.innerHTML = `<i data-lucide="${iconName}" class="w-4 h-4"></i>`;
    lucide.createIcons();
}

// ---------------------------------------------------------------------------
// Reusable dialog modal
// ---------------------------------------------------------------------------

/** Display an alert or a yes/no confirmation in the custom dialog. */
function showDialog(title, message, type = 'alert', callback = null) {
    document.getElementById('dialog-title').textContent = title;
    document.getElementById('dialog-msg').textContent = message;

    const cancelButton = document.getElementById('dialog-cancel');
    if (type === 'confirm') {
        cancelButton.classList.remove('hidden');
        confirmCallback = typeof callback === 'function' ? callback : null;
    } else {
        cancelButton.classList.add('hidden');
        confirmCallback = null;
    }

    const modal = document.getElementById('dialog-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

/** Hide the custom dialog and discard any pending confirmation callback. */
function closeDialog() {
    const modal = document.getElementById('dialog-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
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
    document.getElementById('btn-save').addEventListener('click', saveTask);
    document.getElementById('btn-delete').addEventListener('click', requestDeleteTask);

    document.querySelectorAll('[data-action="close-modal"]').forEach((button) => {
        button.addEventListener('click', closeModal);
    });

    document.querySelectorAll('[data-location]').forEach((button) => {
        button.addEventListener('click', () => setLocation(button.dataset.location));
    });

    // Event delegation keeps chip behaviour consistent for every chip.
    document.getElementById('equipment-chips').addEventListener('click', (event) => {
        const chip = event.target.closest('.chip');
        if (chip) toggleEquipment(chip);
    });

    // Difficulty cards support mouse, Enter and Space.
    document.querySelectorAll('.diff-card').forEach((card) => {
        card.addEventListener('click', () => setDifficulty(card.dataset.diff, card));
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setDifficulty(card.dataset.diff, card);
            }
        });
    });
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
// Presets and calendar
// ---------------------------------------------------------------------------

/** Build the quick-preset buttons from the task template data. */
function buildPresetsUI() {
    const container = document.getElementById('presets-container');
    container.replaceChildren();

    taskPresets.forEach((preset, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md text-[11px] font-medium hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors shadow-sm';
        button.textContent = preset.title;
        button.addEventListener('click', () => loadPreset(index));
        container.appendChild(button);
    });
}

/** Create the FullCalendar instance and map its clicks to the task editor. */
function initCalendar() {
    const calendarElement = document.getElementById('calendar');

    calendar = new FullCalendar.Calendar(calendarElement, {
        initialDate: DEFAULT_START_DATE,
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next',
            center: 'title',
            right: 'dayGridMonth,dayGridWeek'
        },
        height: '100%',
        firstDay: 1,
        selectable: true,

        dateClick(info) {
            openFormForDate(info.dateStr);
        },

        eventClick(info) {
            openFormForEvent(info.event);
        },

        // Use escaped text for imported/user-created titles and locations.
        eventContent(argument) {
            const difficulty = argument.event.extendedProps.difficulty || 'Moderate';
            let badgeClass = 'event-moderate';
            if (difficulty.includes('Easy')) badgeClass = 'event-easy';
            else if (difficulty.includes('Strenuous')) badgeClass = 'event-strenuous';

            const title = escapeHTML(argument.event.title);
            const location = escapeHTML(argument.event.extendedProps.location || 'TBD');
            return {
                html: `
                    <div class="fc-event-main-frame flex flex-col p-1 w-full overflow-hidden ${badgeClass}">
                        <div class="font-semibold truncate text-[11px] leading-tight">${title}</div>
                        <div class="truncate text-[10px] opacity-90 mt-0.5 flex items-center gap-1">
                            <svg class="w-3 h-3 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                <circle cx="12" cy="10" r="3"></circle>
                            </svg>
                            ${location}
                        </div>
                    </div>`
            };
        }
    });

    calendar.render();
}

// ---------------------------------------------------------------------------
// Task directory grouped by location
// ---------------------------------------------------------------------------

/** Re-render the directory below the calendar, grouped by location and date. */
function updateBottomList() {
    const container = document.getElementById('grouped-tasks-container');
    const events = calendar.getEvents();

    if (events.length === 0) {
        container.innerHTML = `
            <p class="text-zinc-500 dark:text-zinc-400 italic bg-zinc-50 dark:bg-zinc-900 p-6 rounded-lg text-center border border-zinc-200 dark:border-zinc-800">
                No tasks scheduled yet. Click on the calendar to start planning.
            </p>`;
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

    let html = '';
    [...groupedTasks.keys()].sort((a, b) => a.localeCompare(b)).forEach((location) => {
        const locationEvents = groupedTasks.get(location).sort((a, b) => a.start - b.start);

        html += `
            <section class="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden shadow-sm">
                <div class="bg-zinc-50 dark:bg-zinc-900 px-5 py-3 border-b border-zinc-200 dark:border-zinc-700 flex items-center gap-2">
                    <i data-lucide="map-pin" class="w-5 h-5 text-zinc-500 dark:text-zinc-400" aria-hidden="true"></i>
                    <h3 class="font-bold text-lg text-zinc-900 dark:text-zinc-100">${escapeHTML(location)}</h3>
                    <span class="ml-auto bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs py-1 px-2.5 rounded-full font-semibold">
                        ${locationEvents.length} Task${locationEvents.length === 1 ? '' : 's'}
                    </span>
                </div>
                <div class="divide-y divide-zinc-100 dark:divide-zinc-700">`;

        locationEvents.forEach((event) => {
            const dateText = event.start
                ? event.start.toLocaleDateString('en-GB', {
                    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                })
                : 'Date not set';
            const difficulty = event.extendedProps.difficulty || 'Moderate';
            const description = event.extendedProps.description || 'No description provided.';
            const equipmentText = event.extendedProps.equipment || '';
            const equipment = equipmentText
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);

            const equipmentMarkup = equipment.length
                ? equipment.map((item) => `
                    <span class="inline-block px-2.5 py-1 text-xs font-semibold rounded-md border bg-zinc-100 text-zinc-800 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700">
                        ${escapeHTML(item)}
                    </span>`).join('')
                : '<span class="text-xs text-zinc-400 dark:text-zinc-500 italic">None specified</span>';

            html += `
                <div class="p-5 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                    <div class="flex-1 space-y-1">
                        <div class="flex items-center gap-3 flex-wrap">
                            <h4 class="font-semibold text-zinc-900 dark:text-zinc-100">${escapeHTML(event.title)}</h4>
                            <span class="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border ${getDifficultyBadgeClasses(difficulty)}">
                                ${escapeHTML(difficulty)}
                            </span>
                        </div>
                        <div class="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                            <i data-lucide="calendar" class="w-4 h-4" aria-hidden="true"></i>
                            ${escapeHTML(dateText)}
                        </div>
                        <p class="text-sm text-zinc-600 dark:text-zinc-300 mt-2">${escapeHTML(description)}</p>
                    </div>
                    <div class="md:w-1/3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-3 border border-zinc-100 dark:border-zinc-800 self-stretch flex flex-col justify-center">
                        <h5 class="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                            <i data-lucide="backpack" class="w-3.5 h-3.5" aria-hidden="true"></i> Equipment
                        </h5>
                        <div class="flex flex-wrap gap-1.5 mt-1">${equipmentMarkup}</div>
                    </div>
                    <button type="button" data-edit-event-id="${escapeHTML(event.id)}"
                        class="text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 px-3 py-2 rounded-md transition-colors border border-zinc-200 dark:border-zinc-700 self-start md:self-center flex items-center gap-2 font-medium text-sm">
                        <i data-lucide="edit-2" class="w-4 h-4" aria-hidden="true"></i> Edit
                    </button>
                </div>`;
        });

        html += '</div></section>';
    });

    container.innerHTML = html;
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

/** Show the task editor modal. */
function openModal() {
    const modal = document.getElementById('task-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

/** Hide the task editor modal. */
function closeModal() {
    const modal = document.getElementById('task-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

/** Set the location field from one of the suggested site pills. */
function setLocation(location) {
    document.getElementById('task-location').value = location;
}

/** Toggle selected styling on a standard equipment chip. */
function toggleEquipment(element) {
    const isSelected = element.dataset.selected === 'true';
    if (isSelected) {
        element.classList.remove(...CHIP_ACTIVE);
        element.classList.add(...CHIP_INACTIVE);
        element.dataset.selected = 'false';
    } else {
        element.classList.add(...CHIP_ACTIVE);
        element.classList.remove(...CHIP_INACTIVE);
        element.dataset.selected = 'true';
    }
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
    chips.forEach((chip) => {
        chip.classList.remove(...CHIP_ACTIVE);
        chip.classList.add(...CHIP_INACTIVE);
        chip.dataset.selected = 'false';
    });
    document.getElementById('task-equip-custom').value = '';

    const items = String(equipmentString ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    const customItems = [];

    items.forEach((item) => {
        // Compare against data values rather than interpolating into a selector.
        const chip = chips.find((candidate) => candidate.dataset.value === item);
        if (chip) {
            chip.classList.add(...CHIP_ACTIVE);
            chip.classList.remove(...CHIP_INACTIVE);
            chip.dataset.selected = 'true';
        } else {
            customItems.push(item);
        }
    });

    document.getElementById('task-equip-custom').value = customItems.join(', ');
}

/** Mark a difficulty card as selected and update the hidden form value. */
function setDifficulty(level, selectedElement = null) {
    document.getElementById('task-diff-value').value = level;

    const neutralClasses = ['border-zinc-200', 'bg-white', 'dark:border-zinc-700', 'dark:bg-zinc-950'];
    const selectedClasses = [
        'border-green-400', 'bg-green-50', 'dark:bg-green-900/20', 'dark:border-green-700',
        'border-yellow-400', 'bg-yellow-50', 'dark:bg-yellow-900/20', 'dark:border-yellow-700',
        'border-red-400', 'bg-red-50', 'dark:bg-red-900/20', 'dark:border-red-700'
    ];

    document.querySelectorAll('.diff-card').forEach((card) => {
        card.setAttribute('aria-pressed', 'false');
        card.classList.remove(...selectedClasses);
        card.classList.remove('border-zinc-200', 'dark:border-zinc-700');
        card.classList.add(...neutralClasses);
    });

    const card = selectedElement || document.querySelector(`.diff-card[data-diff="${level}"]`);
    if (!card) return;

    card.setAttribute('aria-pressed', 'true');
    card.classList.remove(...neutralClasses);
    if (level === 'Easy') {
        card.classList.add('border-green-400', 'bg-green-50', 'dark:bg-green-900/20', 'dark:border-green-700');
    } else if (level === 'Strenuous') {
        card.classList.add('border-red-400', 'bg-red-50', 'dark:bg-red-900/20', 'dark:border-red-700');
    } else {
        card.classList.add('border-yellow-400', 'bg-yellow-50', 'dark:bg-yellow-900/20', 'dark:border-yellow-700');
    }
}

/** Populate the task editor using one of the task presets. */
function loadPreset(index) {
    const preset = taskPresets[index];
    if (!preset) return;

    document.getElementById('task-title').value = preset.title;
    document.getElementById('task-desc').value = preset.desc;
    setEquipmentFromString(preset.equip.join(', '));
    setDifficulty(preset.diff);
}

/** Clear all fields and return the editor to its new-task state. */
function resetForm() {
    document.getElementById('task-id').value = '';
    document.getElementById('task-date').value = '';
    document.getElementById('task-location').value = '';
    document.getElementById('task-title').value = '';
    document.getElementById('task-desc').value = '';

    setEquipmentFromString('');
    setDifficulty('Moderate');

    document.getElementById('selected-date-display').textContent = '';
    document.getElementById('form-title').innerHTML =
        '<i data-lucide="calendar-plus" class="w-5 h-5 text-zinc-500 dark:text-zinc-400"></i> Add New Task';
    document.getElementById('btn-delete').classList.add('hidden');
    document.getElementById('btn-delete').classList.remove('flex');
    lucide.createIcons();
}

/** Open a blank task form for the date selected in the calendar. */
function openFormForDate(dateString) {
    if (!parseLocalDate(dateString)) {
        showDialog('Invalid Date', 'Please select a valid calendar date.', 'alert');
        return;
    }

    resetForm();
    document.getElementById('task-date').value = dateString;
    document.getElementById('selected-date-display').textContent = formatDateString(dateString, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    openModal();
}

/** Load a calendar event into the editor for modification or deletion. */
function openFormForEvent(event) {
    resetForm();
    document.getElementById('form-title').innerHTML =
        '<i data-lucide="edit-3" class="w-5 h-5 text-zinc-500 dark:text-zinc-400"></i> Edit Scheduled Task';
    lucide.createIcons();

    document.getElementById('btn-delete').classList.remove('hidden');
    document.getElementById('btn-delete').classList.add('flex');
    document.getElementById('task-id').value = event.id;

    const dateString = event.startStr.split('T')[0];
    document.getElementById('task-date').value = dateString;
    document.getElementById('selected-date-display').textContent = formatDateString(dateString, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    document.getElementById('task-title').value = event.title;
    document.getElementById('task-location').value = event.extendedProps.location || '';
    document.getElementById('task-desc').value = event.extendedProps.description || '';
    setEquipmentFromString(event.extendedProps.equipment || '');
    setDifficulty(event.extendedProps.difficulty || 'Moderate');
    openModal();
}

/** Open the editor for a task's ID selected from the directory. */
function openFormFromList(eventId) {
    const event = calendar.getEventById(eventId);
    if (!event) return;

    openFormForEvent(event);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

    if (!title || !location) {
        showDialog('Required Fields', 'Task Title and Location are required.', 'alert');
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
