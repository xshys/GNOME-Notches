import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const LAYOUTS = [
    ['two-islands', 'Two islands'],
    ['three-islands', 'Three islands (clock in the middle)'],
    ['single-notch', 'Single notch'],
];

export default class NotchesPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings; // keep alive with the window

        const spin = (key, title, max) => {
            const row = Adw.SpinRow.new_with_range(0, max, 1);
            row.title = title;
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            return row;
        };

        // Top bar
        const layout = new Adw.ComboRow({
            title: 'Layout',
            model: Gtk.StringList.new(LAYOUTS.map(([, label]) => label)),
            selected: Math.max(0, LAYOUTS.findIndex(([id]) => id === settings.get_string('layout'))),
        });
        layout.connect('notify::selected', () => settings.set_string('layout', LAYOUTS[layout.selected][0]));

        const bar = new Adw.PreferencesGroup({title: 'Top Bar'});
        bar.add(layout);
        bar.add(spin('panel-radius', 'Corner radius', 32));
        bar.add(spin('panel-side-gap', 'Gap from screen edges', 64));

        // Color (shared by top bar and dock)
        const rgba = new Gdk.RGBA();
        rgba.parse(settings.get_string('notch-color'));
        const colorButton = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog({with_alpha: true}),
            rgba,
            valign: Gtk.Align.CENTER,
        });
        colorButton.connect('notify::rgba', () => settings.set_string('notch-color', colorButton.rgba.to_string()));
        const color = new Adw.ActionRow({title: 'Notch color'});
        color.add_suffix(colorButton);
        color.activatable_widget = colorButton;

        const general = new Adw.PreferencesGroup({title: 'Appearance'});
        general.add(color);

        // Dock
        const dockEnabled = new Adw.SwitchRow({
            title: 'Notch-style dock',
            subtitle: 'Ubuntu Dock or Dash to Dock',
        });
        settings.bind('dock-enabled', dockEnabled, 'active', Gio.SettingsBindFlags.DEFAULT);
        const dockRadius = spin('dock-radius', 'Corner radius', 48);
        settings.bind('dock-enabled', dockRadius, 'sensitive', Gio.SettingsBindFlags.GET);

        const dock = new Adw.PreferencesGroup({title: 'Dock'});
        dock.add(dockEnabled);
        dock.add(dockRadius);

        const page = new Adw.PreferencesPage();
        page.add(general);
        page.add(bar);
        page.add(dock);
        window.add(page);
    }
}
