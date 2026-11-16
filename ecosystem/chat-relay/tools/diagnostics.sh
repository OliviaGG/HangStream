#!/bin/bash
# Word Tycoon Ecosystem - 2-Hour Diagnostics Monitor
# Runs checks every 5 minutes for 2 hours (24 iterations)

REPORT="/c/Chat Relay/tools/diagnostics-report.txt"
LOG="/c/Chat Relay/tools/diagnostics-log.txt"
SERVER="deploy@wordtycoon.live"
ITERATIONS=24
INTERVAL=300

echo "===============================================" > "$REPORT"
echo "  WORD TYCOON ECOSYSTEM DIAGNOSTICS REPORT" >> "$REPORT"
echo "  Started: $(date)" >> "$REPORT"
echo "===============================================" >> "$REPORT"
echo "" >> "$REPORT"

> "$LOG"

ISSUES_FOUND=0
declare -A ISSUE_TRACKER

run_checks() {
  local i=$1
  echo "========== Check #$i / $ITERATIONS  [$(date)] ==========" >> "$LOG"

  # --- PM2 Process Health ---
  echo "  [PM2] Checking processes..." >> "$LOG"
  local pm2_out
  pm2_out=$(ssh $SERVER "pm2 jlist 2>/dev/null")
  if [ $? -ne 0 ]; then
    echo "  CRITICAL: SSH connection failed" >> "$LOG"
    ISSUE_TRACKER["ssh_fail"]=$((${ISSUE_TRACKER["ssh_fail"]:-0} + 1))
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  else
    for proc in mobile-relay mobile-tycoon searchle-mobile discord-bot word500 word1000 betweenly wordle spellingbee squaredle figural pixeletters; do
      local info
      info=$(echo "$pm2_out" | python3 -c "
import json,sys
data=json.load(sys.stdin)
for p in data:
  if p['name']=='$proc':
    print(p['pm2_env']['status']+'|'+str(p['pm2_env'].get('restart_time',0))+'|'+str(p['monit']['memory']//1048576)+'|'+str(p['monit']['cpu']))
    break
else:
  print('NOT_FOUND|0|0|0')
" 2>/dev/null)
      local st=$(echo "$info" | cut -d'|' -f1)
      local restarts=$(echo "$info" | cut -d'|' -f2)
      local mem=$(echo "$info" | cut -d'|' -f3)

      if [ "$st" != "online" ]; then
        echo "  WARNING: $proc status=$st" >> "$LOG"
        ISSUE_TRACKER["${proc}_offline"]=$((${ISSUE_TRACKER["${proc}_offline"]:-0} + 1))
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
      fi

      if [ "${mem:-0}" -gt 500 ] 2>/dev/null; then
        echo "  WARNING: $proc memory=${mem}MB" >> "$LOG"
        ISSUE_TRACKER["${proc}_highmem"]=$((${ISSUE_TRACKER["${proc}_highmem"]:-0} + 1))
      fi

      local prev_key="${proc}_restarts"
      if [ -n "${ISSUE_TRACKER[$prev_key]}" ]; then
        local prev=${ISSUE_TRACKER[$prev_key]}
        if [ "${restarts:-0}" -gt "$prev" ] 2>/dev/null; then
          local delta=$((restarts - prev))
          echo "  WARNING: $proc crashed $delta times (total restarts: $restarts)" >> "$LOG"
          ISSUE_TRACKER["${proc}_crash"]=$((${ISSUE_TRACKER["${proc}_crash"]:-0} + delta))
          ISSUES_FOUND=$((ISSUES_FOUND + delta))
        fi
      fi
      ISSUE_TRACKER[$prev_key]=$restarts
    done
  fi

  # --- HTTP Endpoints ---
  echo "  [HTTP] Checking endpoints..." >> "$LOG"
  local urls="https://wordtycoon.live/|Portal
https://wordtycoon.live/me|Portal-Login
https://wordtycoon.live/api/games/live|Games-API
https://wordtycoon.live/api/word-bank/stats|WordBank-Stats
https://wordtycoon.live/api/word-bank/validate/hello|WordBank-Validate
https://wordtycoon.live/searchle/|Searchle-MP
https://wordtycoon.live/searchle-single/|Searchle-SP
https://wordtycoon.live/wordle/|Wordle
https://wordtycoon.live/betweenly/|Betweenly
https://wordtycoon.live/word500/|Word500
https://wordtycoon.live/word1000/|Word1000
https://wordtycoon.live/spellingbee/|SpellingBee
https://wordtycoon.live/squaredle/|Squaredle
https://wordtycoon.live/figural/|Figural
https://wordtycoon.live/pixeletters/|PixeLetters"

  while IFS='|' read -r url name; do
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null)
    if [ "${code:-0}" -lt 200 ] || [ "${code:-0}" -ge 400 ]; then
      echo "  FAIL: $name HTTP $code ($url)" >> "$LOG"
      ISSUE_TRACKER["${name}_http"]=$((${ISSUE_TRACKER["${name}_http"]:-0} + 1))
      ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
  done <<< "$urls"

  # --- API Response Validation ---
  echo "  [API] Validating responses..." >> "$LOG"
  local game_count
  game_count=$(curl -s --max-time 10 "https://wordtycoon.live/api/games/live" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('games',{})))" 2>/dev/null)
  if [ "${game_count:-0}" -lt 1 ]; then
    echo "  WARNING: Games API returned $game_count games" >> "$LOG"
    ISSUE_TRACKER["games_api_empty"]=$((${ISSUE_TRACKER["games_api_empty"]:-0} + 1))
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  fi

  local wb_total
  wb_total=$(curl -s --max-time 10 "https://wordtycoon.live/api/word-bank/stats" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('totalTargets',0))" 2>/dev/null)
  if [ "${wb_total:-0}" -lt 1000 ]; then
    echo "  WARNING: Word bank has only $wb_total targets" >> "$LOG"
    ISSUE_TRACKER["wordbank_low"]=$((${ISSUE_TRACKER["wordbank_low"]:-0} + 1))
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  fi

  # --- Socket.IO ---
  echo "  [Socket.IO] Checking connectivity..." >> "$LOG"
  local sio
  sio=$(curl -s --max-time 10 "https://wordtycoon.live/socket.io/?EIO=4&transport=polling" 2>/dev/null)
  if ! echo "$sio" | grep -q "sid"; then
    echo "  WARNING: Socket.IO not responding" >> "$LOG"
    ISSUE_TRACKER["socketio_fail"]=$((${ISSUE_TRACKER["socketio_fail"]:-0} + 1))
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  fi

  # --- Server Resources ---
  echo "  [Server] Checking resources..." >> "$LOG"
  local disk_pct
  disk_pct=$(ssh $SERVER "df / --output=pcent | tail -1 | tr -d ' %'" 2>/dev/null)
  if [ "${disk_pct:-0}" -gt 90 ] 2>/dev/null; then
    echo "  CRITICAL: Disk at ${disk_pct}%" >> "$LOG"
    ISSUE_TRACKER["disk_critical"]=$((${ISSUE_TRACKER["disk_critical"]:-0} + 1))
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  elif [ "${disk_pct:-0}" -gt 80 ] 2>/dev/null; then
    echo "  WARNING: Disk at ${disk_pct}%" >> "$LOG"
    ISSUE_TRACKER["disk_warning"]=$((${ISSUE_TRACKER["disk_warning"]:-0} + 1))
  fi

  local mem_info
  mem_info=$(ssh $SERVER "free -m | grep Mem" 2>/dev/null)
  local mem_total=$(echo "$mem_info" | awk '{print $2}')
  local mem_used=$(echo "$mem_info" | awk '{print $3}')
  if [ "${mem_total:-1}" -gt 0 ] 2>/dev/null; then
    local mem_pct=$((mem_used * 100 / mem_total))
    if [ "$mem_pct" -gt 90 ]; then
      echo "  CRITICAL: RAM at ${mem_pct}% (${mem_used}MB/${mem_total}MB)" >> "$LOG"
      ISSUE_TRACKER["ram_critical"]=$((${ISSUE_TRACKER["ram_critical"]:-0} + 1))
      ISSUES_FOUND=$((ISSUES_FOUND + 1))
    elif [ "$mem_pct" -gt 80 ]; then
      echo "  WARNING: RAM at ${mem_pct}%" >> "$LOG"
      ISSUE_TRACKER["ram_warning"]=$((${ISSUE_TRACKER["ram_warning"]:-0} + 1))
    fi
  fi

  local load
  load=$(ssh $SERVER "cat /proc/loadavg | cut -d' ' -f1" 2>/dev/null)
  local ncpu
  ncpu=$(ssh $SERVER "nproc" 2>/dev/null)
  local load_int=$(echo "${load:-0}" | cut -d'.' -f1)
  if [ "${load_int:-0}" -gt "$((${ncpu:-1} * 2))" ] 2>/dev/null; then
    echo "  WARNING: Load=$load (CPUs=$ncpu)" >> "$LOG"
    ISSUE_TRACKER["high_load"]=$((${ISSUE_TRACKER["high_load"]:-0} + 1))
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  fi

  # --- SSL Certificate (check 3 times: start, middle, end) ---
  if [ "$i" -eq 1 ] || [ "$i" -eq 12 ] || [ "$i" -eq 24 ]; then
    echo "  [SSL] Checking certificate..." >> "$LOG"
    local ssl_expiry
    ssl_expiry=$(echo | openssl s_client -servername wordtycoon.live -connect wordtycoon.live:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
    if [ -n "$ssl_expiry" ]; then
      echo "  SSL cert expires: $ssl_expiry" >> "$LOG"
    fi
  fi

  echo "  Check #$i done. Cumulative issues: $ISSUES_FOUND" >> "$LOG"
  echo "" >> "$LOG"
}

# ===== MAIN LOOP =====
echo "Starting 2-hour diagnostics ($ITERATIONS checks, ${INTERVAL}s apart)..." >> "$LOG"
echo "" >> "$LOG"

for i in $(seq 1 $ITERATIONS); do
  run_checks $i
  if [ $i -lt $ITERATIONS ]; then
    sleep $INTERVAL
  fi
done

# ===== BUILD FINAL REPORT =====
echo "" >> "$REPORT"
echo "Completed: $(date)" >> "$REPORT"
echo "Total checks: $ITERATIONS over 2 hours" >> "$REPORT"
echo "" >> "$REPORT"

if [ $ISSUES_FOUND -eq 0 ]; then
  echo "STATUS: ALL CLEAR" >> "$REPORT"
else
  echo "STATUS: $ISSUES_FOUND ISSUES DETECTED" >> "$REPORT"
fi

echo "" >> "$REPORT"
echo "--- ISSUE SUMMARY ---" >> "$REPORT"

has_issues=0
for key in "${!ISSUE_TRACKER[@]}"; do
  if [[ "$key" == *"_restarts" ]]; then continue; fi
  val=${ISSUE_TRACKER[$key]}
  if [ "${val:-0}" -gt 0 ] 2>/dev/null; then
    echo "  [$val x] $key" >> "$REPORT"
    has_issues=1
  fi
done

if [ $has_issues -eq 0 ]; then
  echo "  None - all systems healthy for the full 2 hours." >> "$REPORT"
fi

echo "" >> "$REPORT"
echo "--- FULL LOG ---" >> "$REPORT"
cat "$LOG" >> "$REPORT"
echo "" >> "$REPORT"
echo "=== END OF REPORT ===" >> "$REPORT"

echo "DIAGNOSTICS COMPLETE"
