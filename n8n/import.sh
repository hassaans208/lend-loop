#!/usr/bin/env sh
# Imports the exported workflows into the running n8n container and activates
# them. CLI import keeps the workflow ids from the JSON, so the Error Workflow
# link (settings.errorWorkflow = "lendloopErrorWf1") works without manual edits.
#
# Usage: ./n8n/import.sh   (after `docker compose up -d`)
set -eu

docker compose exec -T n8n n8n import:workflow --separate --input=/workflows
# The Error Workflow is triggered by n8n itself and does not need activating.
docker compose exec -T n8n n8n update:workflow --id=lendloopNotify01 --active=true
docker compose exec -T n8n n8n update:workflow --id=lendloopOverdue1 --active=true
docker compose restart n8n

echo "Imported. Now create the 'LendLoop SMTP' credential in the n8n UI (see README) and open each workflow once to confirm it is linked."
