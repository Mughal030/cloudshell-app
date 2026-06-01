#!/bin/bash
# CloudShell 24/7 Keep-Alive Script
# Uses environment variable HF_TOKEN for authentication

HF_TOKEN="${HF_TOKEN:-$1}"
SPACE_ID="mughal03/cloudshell-ide"
URL="https://mughal03-cloudshell-ide.hf.space/api/health"
API_URL="https://huggingface.co/api/spaces/${SPACE_ID}"

while true; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    
    if [ -n "$HF_TOKEN" ]; then
        STATUS=$(curl -s -m 10 -H "Authorization: Bearer ${HF_TOKEN}" "$API_URL" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('runtime',{}).get('stage','unknown'))" 2>/dev/null)
        
        if [ "$STATUS" = "STOPPED" ] || [ "$STATUS" = "SLEEPING" ]; then
            echo "$TIMESTAMP: Space is $STATUS, restarting..."
            curl -s -m 30 -X POST -H "Authorization: Bearer ${HF_TOKEN}" "${API_URL}/restart" 2>/dev/null
            echo "$TIMESTAMP: Restart requested"
        fi
    fi
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "$URL" 2>/dev/null)
    echo "$TIMESTAMP: Ping - Status: $HTTP_CODE"
    
    sleep 300
done
