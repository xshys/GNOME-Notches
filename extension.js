import Cogl from 'gi://Cogl';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// Panel boxes that get the notch background, per layout.
const NOTCH_BOXES = {
    'two-islands': ['Left', 'Right'],
    'three-islands': ['Left', 'Center', 'Right'],
    'single-notch': ['Center'],
};

const DOCK_CORNERS = {
    bottom: r => `${r}px ${r}px 0 0`,
    top: r => `0 0 ${r}px ${r}px`,
    left: r => `0 ${r}px ${r}px 0`,
    right: r => `${r}px 0 0 ${r}px`,
};

// Text color readable on the notch: themes with a light panel (Adwaita light)
// use dark text, which would vanish on a black notch. Null if unparsable
// (e.g. color names): the theme's color is kept.
// ponytail: ignores alpha, a very transparent notch shows the wallpaper behind.
function textColor(notchColor) {
    const [ok, c] = Cogl.Color.from_string(notchColor);
    if (!ok)
        return null;
    const luma = 0.299 * c.red + 0.587 * c.green + 0.114 * c.blue;
    return luma > 150 ? 'rgb(34,34,38)' : 'rgb(255,255,255)';
}

function buildCss(settings) {
    const color = settings.get_string('notch-color');
    const r = settings.get_int('panel-radius');
    const gap = settings.get_int('panel-side-gap');
    const boxes = NOTCH_BOXES[settings.get_string('layout')]
        .map(b => `#panel #panel${b}`).join(', ');

    let css = `
#panel { background-color: transparent; }
${boxes} { background-color: ${color}; border-radius: 0 0 ${r}px ${r}px; padding: 0 8px; }
#panel #panelLeft { margin-left: ${gap}px; }
#panel #panelRight { margin-right: ${gap}px; }
`;

    const fg = textColor(color);
    if (fg) {
        // #uiGroup only raises specificity above the theme's #panel rules.
        css += `#uiGroup #panel .panel-button { color: ${fg}; }
#uiGroup #panel .panel-button#panelActivities .workspace-dot { background-color: ${fg}; }
`;
    }

    if (settings.get_boolean('dock-enabled')) {
        // #uiGroup only raises specificity above ubuntu-dock / dash-to-dock rules.
        const dock = '#uiGroup #dashtodockContainer';
        const dr = settings.get_int('dock-radius');
        css += `${dock} #dash .dash-background { background-color: ${color}; border-width: 0; margin: 0; }\n`;
        if (fg)
            css += `${dock} #dash .show-apps .overview-icon { color: ${fg}; }\n`;
        for (const [side, corners] of Object.entries(DOCK_CORNERS))
            css += `${dock}.${side} #dash .dash-background { border-radius: ${corners(dr)}; }\n`;
    }
    return css;
}

export default class NotchesExtension extends Extension {
    enable() {
        this._moved = [];
        this._settings = this.getSettings();
        this._settings.connectObject(
            'changed::layout', () => this._applyLayout(),
            'changed', () => this._loadCss(),
            this);
        this._applyLayout();
        this._loadCss();
    }

    disable() {
        this._settings.disconnectObject(this);
        this._settings = null;
        this._unloadCss();
        this._restoreLayout();
    }

    // ---- Style: one generated stylesheet, reloaded on every settings change ----

    _loadCss() {
        this._unloadCss();
        // Runtime dir, not cache: GNOME re-reads custom stylesheets from disk on
        // every theme reload, so the file must not be removed by cache cleaners.
        const dir = GLib.build_filenamev([GLib.get_user_runtime_dir(), this.uuid]);
        GLib.mkdir_with_parents(dir, 0o755);
        const path = GLib.build_filenamev([dir, 'notches.css']);
        GLib.file_set_contents(path, buildCss(this._settings));
        this._stylesheet = Gio.File.new_for_path(path);
        St.ThemeContext.get_for_stage(global.stage).get_theme().load_stylesheet(this._stylesheet);
    }

    _unloadCss() {
        if (!this._stylesheet)
            return;
        St.ThemeContext.get_for_stage(global.stage).get_theme().unload_stylesheet(this._stylesheet);
        this._stylesheet = null;
    }

    // ---- Layout: move panel items between the left/center/right boxes ----

    _applyLayout() {
        this._restoreLayout();
        const {_leftBox: left, _centerBox: center, _rightBox: right} = Main.panel;
        const clock = Main.panel.statusArea.dateMenu.container;

        switch (this._settings.get_string('layout')) {
        case 'two-islands':
            this._move(clock, left, -1);
            break;
        case 'single-notch': {
            // Everything goes around the clock; items other extensions add
            // to the side boxes later are forwarded too.
            const beforeClock = a => this._move(a, center, center.get_children().indexOf(clock));
            const afterClock = a => this._move(a, center, center.get_children().indexOf(clock) + 1);
            left.get_children().forEach(beforeClock);
            right.get_children().reverse().forEach(afterClock);
            left.connectObject('child-added', (_box, a) => beforeClock(a), this);
            right.connectObject('child-added', (_box, a) => afterClock(a), this);
            break;
        }
        }
    }

    _move(actor, box, index) {
        const origin = actor.get_parent();
        this._moved.push([actor, origin, origin.get_children().indexOf(actor)]);
        origin.remove_child(actor);
        box.insert_child_at_index(actor, index);
    }

    // Undo the moves in reverse order, so every item gets back its exact index.
    _restoreLayout() {
        Main.panel._leftBox.disconnectObject(this);
        Main.panel._rightBox.disconnectObject(this);
        for (const [actor, origin, index] of this._moved.reverse()) {
            const parent = actor.get_parent();
            if (!parent) // destroyed by its owner meanwhile
                continue;
            parent.remove_child(actor);
            origin.insert_child_at_index(actor, index);
        }
        this._moved = [];
    }
}
