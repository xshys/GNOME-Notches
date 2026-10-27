#!/bin/bash
# Headless test of GNOME Notches, isolated from the user's session, dconf and files.
# Usage: [NOTCH_EXT_DIR=DIR] test/run.sh [CASE ...]   (default: BOTTOM)
#   CASE = DOCK_POSITION[:key=value...]
#     key            gnome-notches setting, e.g. layout=single-notch
#     path/key       any other setting, e.g. org/gnome/desktop/interface/color-scheme=prefer-light
#     theme=yaru     Ubuntu's shell theme (default: GNOME's Adwaita)
#     dock=none      no dock extension
#     dock=DIR       another dock extension (e.g. an unpacked Dash to Dock), instead of Ubuntu Dock
#     monitors=N     N virtual monitors (default: 1)
#   e.g.  test/run.sh BOTTOM LEFT:theme=yaru BOTTOM:layout=single-notch:panel-radius=4
# Output: test/out/<CASE>-{desktop,menu,theme,prefs}.png and <CASE>-log.txt
set -u
TEST=$(dirname "$(readlink -f "$0")")
PROJECT=$(dirname "$TEST")
EXT=${NOTCH_EXT_DIR:-$PROJECT}   # NOTCH_EXT_DIR=<unzipped release> tests the packaged zip
OUT=$TEST/out
CHECKS=5   # CHECK lines expected from shot@test per case
TMP=$(mktemp -d)
trap 'rm -rf "$TMP" 2>/dev/null' EXIT
mkdir -p "$OUT" "$TMP/share/gnome-shell/modes" "$TMP/share/gnome-shell/extensions"

glib-compile-schemas --strict "$EXT/schemas" || exit 1   # as GNOME does on install

# Session-mode extensions must live in a system data dir, not ~/.local.
ln -s "$EXT"            "$TMP/share/gnome-shell/extensions/gnome-notches@xshys.github.io"
ln -s "$TEST/shot@test" "$TMP/share/gnome-shell/extensions/shot@test"

fail=0
for case in "${@:-BOTTOM}"; do
    IFS=: read -r pos keys <<< "$case:"
    name=$(sed 's|dock=[^:]*/|dock=|' <<< "$case" | tr -c 'A-Za-z0-9.\n-' '_')  # dock dir -> basename
    # Fresh dir per case: services of the previous case (gvfs FUSE mount) may still be exiting.
    home=$(mktemp -d -p "$TMP" home.XXXX) && mkdir -p -m 700 "$home"/{data/gnome-shell,config/glib-2.0/settings,cache,run} || exit 1
    touch "$home/data/gnome-shell/lock-warning-shown"  # no "Screen Lock disabled" banner (no GDM)

    theme= dock='"ubuntu-dock@ubuntu.com",' monitors=1
    declare -A groups=([org/gnome/shell/extensions/dash-to-dock]="dock-position='$pos'
extend-height=false
dock-fixed=false")
    for kv in ${keys//:/ }; do
        k=${kv%%=*} v=${kv#*=}
        case $k in
            # Yaru theme fields from ubuntu.json. parentMode stays "user": extensions only
            # load when their session-modes (default ["user"]) match the mode or its parent.
            theme) [ "$v" = yaru ] && theme='"stylesheetName":"Yaru/gnome-shell.css","colorScheme":"prefer-light","themeResourceName":"theme/Yaru/gnome-shell-theme.gresource","iconsResourceName":"theme/Yaru/gnome-shell-icons.gresource",'; continue ;;
            dock) if [ "$v" = none ]; then dock=
                  elif [ -d "$v" ]; then ln -sfn "$v" "$TMP/share/gnome-shell/extensions/"; dock="\"$(basename "$v")\","
                  fi; continue ;;
            monitors) monitors=$v; continue ;;
        esac
        [[ $v =~ ^(-?[0-9]+|true|false)$ ]] || v="'$v'"
        group=org/gnome/shell/extensions/gnome-notches
        [[ $k == */* ]] && group=${k%/*} k=${k##*/}
        groups[$group]+="${groups[$group]:+$'\n'}$k=$v"
    done
    for g in "${!groups[@]}"; do printf '[%s]\n%s\n' "$g" "${groups[$g]}"; done \
        > "$home/config/glib-2.0/settings/keyfile"
    unset groups
    echo "{$theme\"parentMode\":\"user\",\"enabledExtensions\":[$dock\"ubuntu-appindicators@ubuntu.com\",\"gnome-notches@xshys.github.io\",\"shot@test\"]}" \
        > "$TMP/share/gnome-shell/modes/notchtest.json"
    vmon=() && for ((i = 0; i < monitors; i++)); do vmon+=(--virtual-monitor 1600x900); done

    NOTCH_TEST_OUT=$home XDG_DATA_HOME=$home/data XDG_CONFIG_HOME=$home/config \
    XDG_CACHE_HOME=$home/cache XDG_RUNTIME_DIR=$home/run \
    XDG_DATA_DIRS=$TMP/share:/usr/local/share:/usr/share GSETTINGS_BACKEND=keyfile \
        timeout 25 dbus-run-session -- gnome-shell --headless --wayland \
        "${vmon[@]}" --mode=notchtest > "$OUT/$name-log.txt" 2>&1
    for f in desktop menu theme prefs; do
        mv "$home/$f.png" "$OUT/$name-$f.png" 2>/dev/null || { echo "$name: missing $f.png"; fail=1; }
    done

    log=$OUT/$name-log.txt
    errors=$(grep -E "JS ERROR|CHECK FAIL|gnome-notches.*(rror|xception)" -A2 "$log")
    ok=$(grep -c "CHECK OK" "$log")
    [ -n "$errors" ] && { echo "$name: errors:"; echo "$errors"; fail=1; }
    [ "$ok" = $CHECKS ] || { echo "$name: $ok/$CHECKS checks passed"; fail=1; }
    echo "$name: done -> $OUT/$name-*.png"
done
[ $fail = 0 ] && echo "PASS" || echo "FAIL"
exit $fail
