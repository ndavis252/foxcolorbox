// popup.js
// Originally by John Taylor (https://github.com/jftuga/foxcolorbox)

/*
This script is instantiated twice:
1) in manifest.json, background -> scripts
2) in popup.html, script tag

Because of this, try/catch must be used in a few places to ignore exceptions
because the caller is from background scripts; not by the user clicking on the extension icon (which is used by popup.html)
*/

console.log("In windowtint popup.js");

// Tailwind 200-level palette — evenly spread hues, soft pastels
var all_colors = [
    { name: "Rose",       color: "#fecdd3" },
    { name: "Peach",      color: "#fed7aa" },
    { name: "Butter",     color: "#fde68a" },
    { name: "Lime",       color: "#d9f99d" },
    { name: "Sage",       color: "#bbf7d0" },
    { name: "Mint",       color: "#99f6e4" },
    { name: "Sky",        color: "#bae6fd" },
    { name: "Periwinkle", color: "#c7d2fe" },
    { name: "Lavender",   color: "#ddd6fe" },
    { name: "Lilac",      color: "#e9d5ff" },
    { name: "Blush",      color: "#fbcfe8" },
    { name: "Fog",        color: "#e2e8f0" },
];

// Tailwind 700-level palette — same hue order as above, deep and saturated
var dark_colors = [
    { name: "Crimson",  color: "#be123c" },
    { name: "Rust",     color: "#c2410c" },
    { name: "Gold",     color: "#a16207" },
    { name: "Fern",     color: "#4d7c0f" },
    { name: "Pine",     color: "#15803d" },
    { name: "Teal",     color: "#0f766e" },
    { name: "Ocean",    color: "#0369a1" },
    { name: "Cobalt",   color: "#4338ca" },
    { name: "Plum",     color: "#6d28d9" },
    { name: "Grape",    color: "#7e22ce" },
    { name: "Berry",    color: "#be185d" },
    { name: "Slate",    color: "#334155" },
];

function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
        const k = (n + h / 30) % 12;
        return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)))
            .toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

// returns '#000' or '#fff' based on perceived brightness; works in popup and background contexts
function getTextColor(hex) {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = hex;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return (0.299 * r + 0.587 * g + 0.114 * b) > 128 ? '#000' : '#fff';
    } catch (e) {
        // fallback for background context where canvas is unavailable
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) > 128 ? '#000' : '#fff';
    }
}

// an array of TimedColor objects
var all_timed_colors = [];

// each color has an associated time that it was last used
class TimedColor {
    constructor(color) {
        this.color = color;
        let now = new Date();
        this.last_access = now.toISOString();
    }
}

// keep a history of what time the last color was used and then select the LRU color
function getOldestColorTheme() {
    const color = all_timed_colors[0].color;
    const textColor = getTextColor(color);
    console.log("NEW WINDOW  : ", all_timed_colors[0], 0);
    const theme = { colors: { frame: color, tab_background_text: textColor } };
    let now = new Date();
    all_timed_colors[0].last_access = now.toISOString();
    all_timed_colors.sort((a, b) => {
        return a.last_access > b.last_access;
    });
    return theme;
}

// module-scope slider/preview references, assigned on popup load
var hueSlider = null, satSlider = null, litSlider = null, colorPreview = null;

function updatePreview() {
    if (!hueSlider || !colorPreview) return;
    colorPreview.style.background = hslToHex(+hueSlider.value, +satSlider.value, +litSlider.value);
}

// adds a colored button to the given element; clicking applies the theme and snaps the HSL sliders
function appendButton(elementId, name, color) {
    var b = document.createElement("button");
    b.innerText = name;
    b.style.background = color;
    b.style.color = getTextColor(color);
    b.style.width = "100px";
    b.style.display = "block";
    b.style.marginBottom = "2px";

    try {
        document.getElementById(elementId).appendChild(b);
    } catch (error) {
        // ignore b/c called from background scripts; not by clicking on the extension icon
        return;
    }

    b.onclick = async function () {
        const textColor = getTextColor(color);
        const theme = { colors: { frame: color, tab_background_text: textColor } };
        var i = 0;
        // since the button list is small, just iterate over all objects instead of using a hash table
        for (const timed_color of all_timed_colors) {
            if (timed_color.color === color) {
                let now = new Date();
                all_timed_colors[i].last_access = now.toISOString();
                console.log("BUTTON CLICK: ", all_timed_colors[i], i);
                break;
            }
            i += 1;
        };
        all_timed_colors.sort((a, b) => {
            return a.last_access < b.last_access;
        });

        let current_window = await browser.windows.getLastFocused();
        browser.theme.update(current_window.id, theme);
        browser.sessions.setWindowValue(current_window.id, "color", color);
        browser.sessions.setWindowValue(current_window.id, "textColor", textColor);

        // snap HSL sliders to match the selected preset
        if (hueSlider) {
            const [h, s, l] = hexToHsl(color);
            hueSlider.value = h;
            satSlider.value = s;
            litSlider.value = l;
            updatePreview();
        }
    }
}

// when a new window is created, such as pressing ctrl-n or dragging a tab to the desktop,
// change the color of the window if the "change color for new windows" checkbox is checked
// also: if extension has not run before, create local storage key: change_new and set to true
// if the window is being restored from a previous session, reapply its saved color instead
async function applyWindowTheme(new_window) {
    console.log("A new window was created:", new_window.id);

    // check if this window has a color saved from a previous session (e.g. after browser restart)
    const saved_color = await browser.sessions.getWindowValue(new_window.id, "color");
    if (saved_color) {
        console.log("Restoring saved session color:", saved_color, "for window:", new_window.id);
        const saved_text_color = await browser.sessions.getWindowValue(new_window.id, "textColor") || '#000';
        browser.theme.update(new_window.id, { colors: { frame: saved_color, tab_background_text: saved_text_color } });
        return;
    }

    // no saved color - this is a brand new window, apply LRU color if change_new is enabled
    x = browser.storage.local.get();
    x.then(async obj => {
        console.log("obj:", obj);
        has_cn_storage_key = false;
        if (obj.hasOwnProperty("change_new") === false) {
            console.log("Adding change_new key to local storage");
            has_cn_storage_key = true;
            browser.storage.local.set({ "change_new": true });
            console.log("[storage save] setting change_new: true");
        }
        if (obj["change_new"] === true || has_cn_storage_key === true) {
            const theme = getOldestColorTheme();
            browser.theme.update(new_window.id, theme);
            // save the auto-assigned color to the session so it is restored on restart
            browser.sessions.setWindowValue(new_window.id, "color", theme.colors.frame);
        }
    });
}

// fired when user clicks the extension's icon
window.addEventListener("load", async function () {
    try {
        reset.addEventListener("click", async function () {
            let current_window = await browser.windows.getCurrent();
            browser.theme.reset(current_window.id);
            // clear the saved session color so default theme is restored on restart too
            browser.sessions.removeWindowValue(current_window.id, "color");
            browser.sessions.removeWindowValue(current_window.id, "textColor");
        });
    } catch (error) {
        // ignore b/c called from background scripts; not by clicking on the extension icon
    }

    try {
        hueSlider    = document.getElementById("hue_slider");
        satSlider    = document.getElementById("sat_slider");
        litSlider    = document.getElementById("lit_slider");
        colorPreview = document.getElementById("custom_color_preview");

        hueSlider.addEventListener("input", updatePreview);
        satSlider.addEventListener("input", updatePreview);
        litSlider.addEventListener("input", updatePreview);

        // initialize sliders to reflect the current window's active theme color
        const currentWindow = await browser.windows.getCurrent();
        const currentTheme = await browser.theme.getCurrent(currentWindow.id);
        if (currentTheme.colors && currentTheme.colors.frame && currentTheme.colors.frame.startsWith('#')) {
            const [h, s, l] = hexToHsl(currentTheme.colors.frame);
            hueSlider.value = h;
            satSlider.value = s;
            litSlider.value = l;
        }
        updatePreview();

        document.getElementById("apply_custom").addEventListener("click", async function () {
            const color = hslToHex(+hueSlider.value, +satSlider.value, +litSlider.value);
            const textColor = getTextColor(color);
            const theme = { colors: { frame: color, tab_background_text: textColor } };
            let current_window = await browser.windows.getLastFocused();
            browser.theme.update(current_window.id, theme);
            browser.sessions.setWindowValue(current_window.id, "color", color);
            browser.sessions.setWindowValue(current_window.id, "textColor", textColor);
        });
    } catch (error) {
        // ignore b/c called from background scripts; not by clicking on the extension icon
    }

    // populate the all_timed_colors array with all preset colors (both palettes)
    [...all_colors, ...dark_colors].forEach(({ color }) => all_timed_colors.push(new TimedColor(color)));

    // build out the two columns of preset buttons
    all_colors.forEach(({ name, color }) => appendButton("button_list_light", name, color));
    dark_colors.forEach(({ name, color }) => appendButton("button_list_dark", name, color));

    // scan all currently open windows and restore any saved session colors
    // this catches session-restored windows that were created before the onCreated listener registered
    const existing_windows = await browser.windows.getAll();
    for (const win of existing_windows) {
        const saved_color = await browser.sessions.getWindowValue(win.id, "color");
        if (saved_color) {
            console.log("Startup: restoring color", saved_color, "for window", win.id);
            const saved_text_color = await browser.sessions.getWindowValue(win.id, "textColor") || '#000';
            browser.theme.update(win.id, { colors: { frame: saved_color, tab_background_text: saved_text_color } });
        }
    }

    try {
        // uncheck the checkbox in the HTML if the storage value for change_new is set to false
        console.log("is checked? ", document.getElementById("change_new").checked);
        x = browser.storage.local.get();
        x.then(obj => {
            console.log("change_new => obj:", obj["change_new"])
            if (obj["change_new"] === false) {
                console.log("unchecking: ", document.getElementById("change_new"));
                document.getElementById("change_new").checked = false;
            }
        });

        // button has either been checked or unchecked
        var change_new_selector = document.getElementById("change_new");
        change_new_selector.addEventListener('change', function () {
            if (this.checked) {
                browser.storage.local.set({ "change_new": true });
                document.getElementById("change_new").checked = true;
                console.log("[storage save] setting change_new: true");
            } else {
                browser.storage.local.set({ "change_new": false })
                document.getElementById("change_new").checked = false;
                console.log("[storage save] setting change_new: false");
            }
        });
    } catch (error) {
        // ignore b/c called from background scripts; not by clicking on extension icon
    }

}); // window.addEventListener

// occurs when a new browser window is created
browser.windows.onCreated.addListener(applyWindowTheme);
