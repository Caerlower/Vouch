#!/usr/bin/env bash
# End-to-end curl demo — signed referral tokens
set -euo pipefail

VOUCH="${VOUCH_URL:-http://localhost:4000}"
PAYER="${PAYER:-47YPQTIGQEO7T4Y4RWDYWEKV6RTR2UNBQXBABCXIZBFEQBTJTXCGMBQOWQ}"

pp() { python3 -m json.tool; }

echo "=== 1) Health ==="
curl -sS "$VOUCH/health" | pp

echo "=== 2) Quote — no referral (full price) ==="
curl -sS "$VOUCH/quote" | pp

echo "=== 3) Raw address rejected (not a signed token) ==="
curl -sS "$VOUCH/quote?referral=7ZUECA7HFLZTXENRV24SHLU4AVPUTMTTDUFUBNBD64C73F3UHRTHAIOF6Q" | pp

echo "=== 4) Mint signed referral token (demo) ==="
MINT=$(curl -sS -X POST "$VOUCH/demo/mint-referral" \
  -H 'content-type: application/json' \
  -d '{"sellerId":"acme-default"}')
echo "$MINT" | pp
TOKEN=$(echo "$MINT" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
REF=$(echo "$MINT" | python3 -c "import sys,json; print(json.load(sys.stdin)['referrer'])")

echo "=== 5) Quote — valid signed token (discounted) ==="
curl -sS "$VOUCH/quote?referral=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$TOKEN'''))")" | pp

echo "=== 6) 402 with signed referral ==="
curl -sS "$VOUCH/r/acme-default/resource?referral=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$TOKEN'''))")" | pp

echo "=== 7) Simulate paid call (consumes nonce) ==="
curl -sS -X POST "$VOUCH/demo/simulate-payment" \
  -H 'content-type: application/json' \
  -d "{\"payer\":\"$PAYER\",\"referral\":\"$TOKEN\",\"sellerId\":\"acme-default\"}" | pp

echo "=== 8) Replay same token — should NOT discount ==="
curl -sS "$VOUCH/quote?referral=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$TOKEN'''))")" | pp

echo "=== 9) Stats for referrer $REF ==="
curl -sS "$VOUCH/stats/$REF" | pp

echo "=== 10) Ledger ==="
curl -sS "$VOUCH/ledger" | pp

echo "Done."
