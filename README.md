# GNOME Notches

A GNOME Shell 50 extension that turns the top bar into **MacBook-style notches** hanging from the top edge of the screen, and the dock into a **bigger notch** glued to the screen edge it sits on.

- **Two islands** (default): Activities / workspaces, Places and the clock on the left; tray icons and the system menu (Wi-Fi, volume, …) on the right; the center stays empty.
- **Three islands**: like two islands, but the clock keeps its own notch in the middle.
- **Single notch**: everything in one notch in the middle.
- **Dock** (Ubuntu Dock / Dash to Dock): rounded only on the side facing the screen, at the bottom, top, left or right.

Goals: simple, efficient, stable. No dependencies, no timers, no polling.

## Requirements

- GNOME Shell 50 (tested on 50.1, Ubuntu, Wayland)
- Optional: Ubuntu Dock or Dash to Dock, with **"extend to edge" off** (`extend-height=false`), otherwise the dock stays a full bar
- Disable other extensions that restyle the panel or the dock (e.g. Open Bar), as they conflict

## Settings

Open them from the Extensions app, or with:

```bash
gnome-extensions prefs gnome-notches@xshys
```

| Setting | Default |
|---|---|
| Notch color (with transparency, shared by top bar and dock) | black |
| Top bar layout: two islands / three islands / single notch | two islands |
| Top bar corner radius | 14 px |
| Gap between the side notches and the screen edges | 12 px |
| Notch-style dock on/off | on |
| Dock corner radius | 24 px |

Changes apply immediately.

## Install from source

```bash
git clone https://github.com/xshys/GNOME-Notches.git
```

```bash
cd GNOME-Notches && glib-compile-schemas schemas/ && ln -sfn "$PWD" ~/.local/share/gnome-shell/extensions/gnome-notches@xshys
```

On Wayland, log out and back in (GNOME only discovers new extensions at login), then:

```bash
gnome-extensions enable gnome-notches@xshys
```

## How it works

```
metadata.json   uuid, shell version, settings schema
extension.js    generated stylesheet + panel layout
prefs.js        preferences window (Adwaita)
schemas/        GSettings schema
test/           headless test (isolated GNOME Shell + screenshots)
```

**Style the containers, not the buttons.** The GNOME panel has three boxes (`#panelLeft`, `#panelCenter`, `#panelRight`), each sized to its content. The notch background and radius go on the boxes, so each side is one island that grows and shrinks when apps add tray icons. Extensions that style every button instead produce one island per icon.

- **Style**: `extension.js` builds a single stylesheet from the settings (`buildCss()`), writes it to `~/.cache/gnome-notches@xshys/notches.css` and loads it into the St theme. On any settings change it unloads it, rewrites it and loads it again. GNOME keeps custom stylesheets across theme reloads (e.g. switching light/dark).
- **Layout**: the only JS logic. *Two islands* moves the clock to the end of the left box. *Single notch* moves every item into the center box around the clock, and forwards items that other extensions add to the side boxes later. Every move is recorded and undone in reverse order, so `disable()` (also called by GNOME on every screen lock) restores the original panel exactly.
- **Dock**: CSS only, on `#dashtodockContainer .dash-background`. The dock adds its position (`top/right/bottom/left`) as a style class, which picks the corners to round. The `#uiGroup` prefix only raises specificity above the dock's own rules.

## Testing

```bash
test/run.sh BOTTOM LEFT RIGHT BOTTOM:layout=three-islands BOTTOM:layout=single-notch
```

Each case starts an isolated headless GNOME Shell: the user's session and settings are not touched. A case is `DOCK_POSITION[:key=value...]`, with keys from the schema.

- **Automatic checks**: no JS errors; the clock is in the right box; `disable()`/`enable()` cycles restore the panel exactly; live layout changes apply and revert.
- **Screenshots** in `test/out/`: desktop, calendar menu and preferences window for each case. Appearance is not checked automatically, so look at them.
- Prints `PASS`/`FAIL` (exit code 0/1).

## Known limitations

- No concave corners (the outward curve where a MacBook notch meets the screen edge): St CSS cannot draw them.
- Not tested with multiple monitors. Dock tested at the bottom, left and right; not at the top.
- With the dock in "extend to edge" mode the notch shape is lost.
- The notches stay visible in the overview and on the lock screen.
- With *two islands*, items other extensions put in the center box float there without a notch: use *three islands*.

## License

GPL-2.0-or-later.
