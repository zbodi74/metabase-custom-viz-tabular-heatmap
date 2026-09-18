#!/usr/bin/env bash
# Build the plugin and upload it to a Metabase instance.
#
# The first run registers the plugin; later runs replace its bundle in place,
# so the plugin id and any questions already using it keep working. Re-posting
# to the collection endpoint would fail with "A custom visualization with
# identifier ... already exists."
#
#   export METABASE_URL=https://your-metabase
#   export METABASE_API_KEY=mb_...
#   ./scripts/deploy.sh
#
# The API key needs admin rights, and the instance needs custom visualizations
# turned on (Admin -> Settings -> Custom visualizations). Metabase will not let
# you enable them while "Restrict image domains" is off.
set -euo pipefail

: "${METABASE_URL:?set METABASE_URL, e.g. https://your-metabase}"
: "${METABASE_API_KEY:?set METABASE_API_KEY to an admin API key}"

INSTANCE="${METABASE_URL%/}"
PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
IDENTIFIER="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["name"])' \
  "$PROJECT/metabase-plugin.json")"

cd "$PROJECT"
npm run build

BUNDLE="$(ls -t ./*.tgz | head -1)"

PLUGIN_ID="$(curl -sS -m 60 -H "x-api-key: $METABASE_API_KEY" \
  "$INSTANCE/api/ee/custom-viz-plugin" |
  python3 -c 'import json,sys
want = sys.argv[1]
print(next((str(p["id"]) for p in json.load(sys.stdin) if p["identifier"] == want), ""))' \
    "$IDENTIFIER")"

if [ -n "$PLUGIN_ID" ]; then
  echo "Replacing bundle for plugin $PLUGIN_ID ($IDENTIFIER)"
  URL="$INSTANCE/api/ee/custom-viz-plugin/$PLUGIN_ID/bundle"
  METHOD=PUT
else
  echo "Registering new plugin ($IDENTIFIER)"
  URL="$INSTANCE/api/ee/custom-viz-plugin"
  METHOD=POST
fi

curl -sS -m 120 -X "$METHOD" \
  -H "x-api-key: $METABASE_API_KEY" \
  -F "file=@${BUNDLE}" \
  "$URL" |
  python3 -c 'import json,sys
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except ValueError:
    print("FAILED:", raw[:500]); raise SystemExit(1)
print("id", d.get("id"), "|", d.get("status"), "| warnings:", d.get("warnings"), "|", d.get("error_message"))'
