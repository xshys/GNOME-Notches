import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Loaded only by test/run.sh. Writes screenshots to $NOTCH_TEST_OUT and logs
// one "CHECK OK <name>" / "CHECK FAIL <name> <detail>" line per check.
const UUID = 'gnome-notches@xshys';
const CLOCK_BOX = {'two-islands': 'panelLeft', 'three-islands': 'panelCenter', 'single-notch': 'panelCenter'};

const panelBoxes = () => [Main.panel._leftBox, Main.panel._centerBox, Main.panel._rightBox];
// Actor identity only (its address): the full string also has the clock text and pseudo classes.
const snapshot = () => JSON.stringify(panelBoxes().map(b => b.get_children().map(a => String(a).match(/0x[0-9a-f]+/)[0])));
const clockBox = () => Main.panel.statusArea.dateMenu.container.get_parent().name;
const check = (name, ok, detail = '') => log(`CHECK ${ok ? 'OK' : 'FAIL'} ${name} ${ok ? '' : detail}`);

export default class {
    enable() {
        const out = GLib.getenv('NOTCH_TEST_OUT');
        const at = (sec, fn) => GLib.timeout_add(0, sec * 1000, () => {
            try {
                fn();
            } catch (e) {
                check('exception', false, e);
            }
            return GLib.SOURCE_REMOVE;
        });
        const ext = () => Main.extensionManager.lookup(UUID).stateObj;
        const settings = () => ext().getSettings();
        let layout, enabled;

        at(6, () => this._shot(`${out}/desktop.png`));
        at(7, () => Main.panel.statusArea.dateMenu.menu.open());
        at(9, () => this._shot(`${out}/menu.png`));

        at(10, () => {
            Main.panel.statusArea.dateMenu.menu.close();
            layout = settings().get_string('layout');
            const [left, , right] = panelBoxes();
            check('layout', clockBox() === CLOCK_BOX[layout] &&
                (layout !== 'single-notch' || left.get_n_children() + right.get_n_children() === 0),
            `clock in ${clockBox()}, left=${left.get_n_children()} right=${right.get_n_children()}`);

            // disable() must restore GNOME's layout exactly, enable() must be repeatable.
            enabled = snapshot();
            ext().disable();
            const original = snapshot();
            ext().enable();
            const enabled2 = snapshot();
            ext().disable();
            const original2 = snapshot();
            ext().enable();
            check('cycle', original === original2 && enabled === enabled2 && enabled === snapshot(),
                `\n  enabled  ${enabled}\n  original ${original}`);
        });

        // Live layout changes through GSettings, then back to the start.
        const others = () => Object.keys(CLOCK_BOX).filter(l => l !== layout);
        at(11, () => settings().set_string('layout', others()[0]));
        at(11.5, () => check('live-switch', clockBox() === CLOCK_BOX[others()[0]], `clock in ${clockBox()}`));
        at(12, () => settings().set_string('layout', others()[1]));
        at(12.5, () => settings().set_string('layout', layout));
        at(13, () => check('live-restore', snapshot() === enabled, `\n  now      ${snapshot()}\n  expected ${enabled}`));

        at(13.5, () => Main.extensionManager.openExtensionPrefs(UUID, '', {}));
        at(19, () => this._shot(`${out}/prefs.png`));
    }

    async _shot(path) {
        const stream = Gio.File.new_for_path(path).replace(null, false, 0, null);
        await new Shell.Screenshot().screenshot(false, stream);
        stream.close(null);
    }

    disable() {}
}
