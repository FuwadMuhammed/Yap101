#!/usr/bin/env bash
# BUG-01 on a real-AI server: N simultaneous requests from one fresh guest (same IP, no cookie yet).
B=${1:-http://localhost:3125}; N=${2:-4}; IP=192.0.2.150
body='{"mode":"polish","title":"Introduce yourself","draft":"so um i make cooking videos for students on a budget","seconds":15}'
for i in $(seq 1 $N); do curl -s -o /dev/null -w "req$i %{http_code} %{time_total}s\n" -X POST "$B/api/script" -H 'content-type: application/json' -H "x-real-ip: $IP" -d "$body" & done; wait
echo "then a 5th, sequential: $(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/script" -H 'content-type: application/json' -H "x-real-ip: $IP" -d "$body")"
