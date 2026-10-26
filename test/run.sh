#!/bin/bash
# Headless test of GNOME Notches, isolated from the user's session and dconf.
# Usage: test/run.sh [CASE ...]   (default: BOTTOM)
#   CASE = DOCK_POSITION[:key=value...]   keys from the gnome-notches schema
#   e.g.  test/run.sh BOTTOM LEFT BOTTOM:layout=single-notch:panel-radius=4
# Output: test/out/<CASE>-{desktop,menu,prefs}.png and <CASE>-log.txt
set -u
TEST=$(dirname "$(readlink -f "$0")")
PROJECT=$(dirname "$TEST")
OUT=$TEST/out
CHECKS=4   # CHECK lines expected from shot@test per case
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT" "$TMP/share/gnome-shell/modes" "$TMP/share/gnome-shell/extensions" \
         "$TMP/data" "$TMP/config/glib-2.0/settings"

glib-compile-schemas --strict "$PROJECT/schemas" || exit 1

# Session-mode extensions must live in a system data dir, not ~/.local.
ln -s "$PROJECT"        "$TMP/share/gnome-shell/extensions/gnome-notches@xshys"
ln -s "$TEST/shot@test" "$TMP/share/gnome-shell/extensions/shot@test"
echo '{"parentMode":"user","enabledExtensions":["ubuntu-dock@ubuntu.com","ubuntu-appindicators@ubuntu.com","gnome-notches@xshys","shot@test"]}' \
    > "$TMP/share/gnome-shell/modes/notchtest.json"

fail=0
for case in "${@:-BOTTOM}"; do
    IFS=: read -r pos keys <<< "$case:"
    name=$(tr -c 'A-Za-z0-9.\n-' '_' <<< "$case")
    {
        printf "[org/gnome/shell/extensions/dash-to-dock]\ndock-position='%s'\nextend-height=false\ndock-fixed=false\n" "$pos"
        echo "[org/gnome/shell/extensions/gnome-notches]"
        for kv in ${keys//:/ }; do
            k=${kv%%=*} v=${kv#*=}
            [[ $v =~ ^(-?[0-9]+|true|false)$ ]] || v="'$v'"
            echo "$k=$v"
        done
    } > "$TMP/config/glib-2.0/settings/keyfile"

    rm -f "$TMP"/*.png
    NOTCH_TEST_OUT=$TMP XDG_DATA_HOME=$TMP/data XDG_CONFIG_HOME=$TMP/config \
    XDG_DATA_DIRS=$TMP/share:/usr/local/share:/usr/share GSETTINGS_BACKEND=keyfile \
        timeout 22 dbus-run-session -- gnome-shell --headless --wayland \
        --virtual-monitor 1600x900 --mode=notchtest > "$OUT/$name-log.txt" 2>&1
    for f in desktop menu prefs; do
        mv "$TMP/$f.png" "$OUT/$name-$f.png" 2>/dev/null || { echo "$name: missing $f.png"; fail=1; }
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
