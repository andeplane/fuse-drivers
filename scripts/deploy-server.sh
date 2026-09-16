#!/usr/bin/env bash
# Deploys the party server to Cloud Run, the same shape Fuse Riders uses: static pages on GitHub Pages,
# WebSocket backend in a container. Everything here is configuration, not a secret.
#
#   PROJECT=andershaf-87 scripts/deploy-server.sh
#
# Rooms live in the server's memory and there is no shared store, so the service runs as exactly one
# instance: a second instance would host its own rooms and phones would reach the wrong one.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${PROJECT:?set PROJECT to the Google Cloud project, e.g. PROJECT=andershaf-87}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-fuse-drivers-server}"
# The origin GitHub Pages serves the game from; browsers send it and the server checks it.
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-https://andeplane.github.io}"

echo "Deploying $SERVICE to $REGION in $PROJECT"
gcloud run deploy "$SERVICE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --source . \
  --allow-unauthenticated \
  --port 8790 \
  --cpu 1 \
  --memory 512Mi \
  --min-instances 0 \
  --max-instances 1 \
  --concurrency 80 \
  --timeout 3600 \
  --set-env-vars "NODE_ENV=production,ALLOWED_ORIGINS=$ALLOWED_ORIGINS"

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')"
echo
echo "Server:  $URL"
echo "Health:  $(curl -fsS "$URL/api/health" || echo 'no answer yet, try again in a moment')"
echo
echo "Point the published game at it once:"
echo "  gh variable set VITE_PARTY_ORIGIN --body '$URL'"
echo "  gh workflow run pages.yml"
