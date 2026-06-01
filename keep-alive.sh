#!/bin/bash
# CloudShell 24/7 Keep-Alive Script
# 1. Pings the HF Space to keep it active
# 2. If the space is sleeping/stopped, restarts it via HF API
# 3. Runs every 5 minutes

HF_TOKEN="${HF_TOKEN}"
SPACE_ID="mughal03/cloudshell-ide"
URL="https://mughal03-cloudshell-ide.hf.space/api/health"
API_URL="https://huggingface.co/api/spaces/${SPACE_ID}"

while true; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    
    # First, check if the space is running
    STATUS=$(curl -s -m 10 -H "Authorization: Bearer ${HF_TOKEN}" "$API_URL" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('runtime',{}).get('stage','unknown'))" 2>/dev/null)
    
    if [ "$STATUS" = "RUNNING" ]; then
        # Space is running, just ping it
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "$URL" 2>/dev/null)
        echo "$TIMESTAMP: Ping OK - Status: $HTTP_CODE"
    elif [ "$STATUS" = "STOPPED" ] || [ "$STATUS" = "SLEEPING" ]; then
        # Space is stopped/sleeping, restart it
        echo "$TIMESTAMP: Space is $STATUS, restarting..."
        curl -s -m 30 -X POST -H "Authorization: Bearer ${HF_TOKEN}" "${API_URL}/restart" 2>/dev/null
        echo "$TIMESTAMP: Restart requested"
    else
        # Unknown status, try ping anyway
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "$URL" 2>/dev/null)
        echo "$TIMESTAMP: Status=$STATUS, Ping=$HTTP_CODE"
    fi
    
    sleep 300  # 5 minutes
done
