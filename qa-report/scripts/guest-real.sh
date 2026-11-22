#!/usr/bin/env bash
# J3 guest allowance against a real-AI server. A curl cookie jar plays the browser.
# Usage: bash qa-report/scripts/guest-real.sh http://localhost:3125
B=${1:-http://localhost:3125}; J=$(mktemp); IP=192.0.2.77
body='{"mode":"polish","title":"Introduce yourself","draft":"um hi im sam and i make fitness videos for busy moms","seconds":15}'
post() { curl -s -o /tmp/qa-body -w "%{http_code} %{time_total}s" -X POST "$B/api/script" -H 'content-type: application/json' "$@" -d "$body"; echo " $(head -c 90 /tmp/qa-body)"; }
echo "G1 1st (fresh guest):        $(post -H "x-real-ip: $IP" -c $J -b $J)"
echo "G2 2nd:                      $(post -H "x-real-ip: $IP" -c $J -b $J)"
echo "G3 3rd:                      $(post -H "x-real-ip: $IP" -c $J -b $J)"
echo "G4 4th (expect 429):         $(post -H "x-real-ip: $IP" -c $J -b $J)"
echo "G5 'app restart' same jar:   $(post -H "x-real-ip: $IP" -c $J -b $J)"
echo "G6 cookie cleared, same IP:  $(post -H "x-real-ip: $IP")"
echo "G7 jar kept, new IP:         $(post -H "x-real-ip: 192.0.2.78" -b $J)"
echo "G8 no cookie, spoofed IP:    $(post -H "x-real-ip: 192.0.2.99")"
echo "cookie in jar: $(grep -o 'yap101-scripts.*' $J | awk '{print $1, $2}' | cut -c1-40)…"
