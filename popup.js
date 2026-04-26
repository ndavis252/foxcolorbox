// popup.js
// -John Taylor
// 2023-11-14

/*
This script is instantiated twice:
1) in manifest.json, background -> scripts
2) in popup.html, script tag

Because of this, try/catch must be used in a few places to ignore exceptions
because the caller is from background scripts; not by the user clicking on the extension icon (which is used by popup.html)
*/

console.log("In foxcolorbox popup.js");

// Tailwind 200-level palette — evenly spread hues, low saturation
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

// returns '#000' or '#fff' depending on the perceived brightness of a color
function getTextColor(color) {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return (0.299 * r + 0.587 * g + 0.114 * b) > 128 ? '#000' : '#fff';
    } catch (e) {
        return '#000';
    }
}

// an array of TimedColor objects
var all_timed_colors = [];

// each color has an associated time that is was last used
class TimedColor {
    constructor(color) {
        this.color = color;
        let now = new Date();
        this.last_access = now.toISOString();
    }
}

// keep a history of what time the last color was used and then select the LRU color
function getOldestColorTheme() {
    console.log("NEW WINDOW  : ", all_timed_colors[0], 0);
    theme = { colors: { frame: all_timed_colors[0].color, tab_background_text: '#000' } };
    let now = new Date();
    all_timed_colors[0].last_access = now.toISOString();
    all_timed_colors.sort((a, b) => {
        return a.last_access > b.last_access;
    });
    return theme;
}

// adds a new, colored button to the button_list div
function appendButton(elementId, name, color) {
    var b = document.createElement("button");
    b.innerText = name;
    b.style.background = color;
    b.style.width = "100px";

    try {
        document.getElementById(elementId).appendChild(b);
        document.getElementById(elementId).appendChild(document.createElement("br"));
    } catch (error) {
        // ignore b/c called from background scripts; not by clicking on the extension icon
        return;
    }

    b.onclick = async function () {
        theme = { colors: { frame: color, tab_background_text: '#000' } };
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
        // save the chosen color to the window's session so it survives browser restart
        browser.sessions.setWindowValue(current_window.id, "color", color);
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
window.addEventListener("load", async function () { // DOMContentLoaded
    let now = new Date();
    // console.log("starting on:", now.toISOString());
    // console.log("document.readyState: ", document.readyState);

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
        const hueSlider = document.getElementById("hue_slider");
        const satSlider = document.getElementById("sat_slider");
        const litSlider = document.getElementById("lit_slider");
        const preview   = document.getElementById("custom_color_preview");

        function updatePreview() {
            preview.style.background = hslToHex(+hueSlider.value, +satSlider.value, +litSlider.value);
        }
        hueSlider.addEventListener("input", updatePreview);
        satSlider.addEventListener("input", updatePreview);
        litSlider.addEventListener("input", updatePreview);
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

    // populate the all_timed_colors array with a color + the current date/time
    all_colors.forEach(({ color }) => all_timed_colors.push(new TimedColor(color)));

    // build out the vertical list of HTML buttons
    all_colors.forEach(({ name, color }) => appendButton("button_list", name, color));

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
