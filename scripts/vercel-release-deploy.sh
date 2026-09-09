#!/usr/bin/env bash
set -euo pipefail

STAGE="${1:-}"
SOURCE_SHA="${2:-}"
POLICY_FILE="ops/vercel-release-policy.json"

if [[ ! "$SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]]; then
  echo "invalid release source SHA" >&2
  exit 2
fi
if [[ ! -f "$POLICY_FILE" ]]; then
  echo "release policy not found: $POLICY_FILE" >&2
  exit 2
fi
if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "VERCEL_TOKEN is required" >&2
  exit 2
fi

TEAM_ID=$(jq -r '.project.team_id' "$POLICY_FILE")
PROJECT_ID=$(jq -r '.project.project_id' "$POLICY_FILE")
PRODUCTION_URL=$(jq -r '.project.production_url' "$POLICY_FILE")

if ! jq -e --arg stage "$STAGE" '.stages[$stage] != null' "$POLICY_FILE" >/dev/null; then
  echo "unsupported release stage: $STAGE" >&2
  exit 2
fi

runtime_value() {
  jq -r --arg stage "$STAGE" --arg key "$1" '.stages[$stage][$key]' "$POLICY_FILE"
}

RUNTIME_MODE=$(runtime_value runtime_mode)
PILOT_GATE=$(runtime_value pilot_release_gate)
PRODUCTION_GATE=$(runtime_value production_release_gate)
UPLOAD_MODE=$(runtime_value upload_quarantine_mode)
UPLOAD_SCANNER_VERIFIED=$(runtime_value upload_scanner_verified)
BACKUP_PITR_VERIFIED=$(runtime_value backup_pitr_verified)
SECURITY_REVIEW_APPROVED=$(runtime_value security_review_approved)
ACCOUNTING_QA_APPROVED=$(runtime_value accounting_qa_approved)
MANUAL_UPLOAD_PROCEDURE_APPROVED=$(runtime_value manual_upload_procedure_approved)
AUTH_EMAIL_DELIVERY_VERIFIED=$(runtime_value auth_email_delivery_verified)
UPLOAD_OPERATOR_CHECKLIST_VERIFIED=$(runtime_value upload_operator_checklist_verified)

[[ "$PRODUCTION_GATE" == "BLOCKED" ]] || { echo "production release gate must remain BLOCKED" >&2; exit 2; }
[[ "$RUNTIME_MODE" == "LAB" || "$RUNTIME_MODE" == "PILOT" ]] || { echo "controller does not support PRODUCTION runtime" >&2; exit 2; }

export VERCEL_ORG_ID="$TEAM_ID"
export VERCEL_PROJECT_ID="$PROJECT_ID"

npx --yes vercel@latest deploy \
  --prod \
  --yes \
  --token "$VERCEL_TOKEN" \
  --project "$PROJECT_ID" \
  --env "FINCLOSE_RELEASE_SOURCE_SHA=$SOURCE_SHA" \
  --env "FINCLOSE_RUNTIME_MODE=$RUNTIME_MODE" \
  --env "FINCLOSE_PILOT_RELEASE_GATE=$PILOT_GATE" \
  --env "FINCLOSE_PRODUCTION_RELEASE_GATE=$PRODUCTION_GATE" \
  --env "FINCLOSE_UPLOAD_QUARANTINE_MODE=$UPLOAD_MODE" \
  --env "FINCLOSE_UPLOAD_SCANNER_VERIFIED=$UPLOAD_SCANNER_VERIFIED" \
  --env "FINCLOSE_BACKUP_PITR_VERIFIED=$BACKUP_PITR_VERIFIED" \
  --env "FINCLOSE_SECURITY_REVIEW_APPROVED=$SECURITY_REVIEW_APPROVED" \
  --env "FINCLOSE_ACCOUNTING_QA_APPROVED=$ACCOUNTING_QA_APPROVED" \
  --env "FINCLOSE_MANUAL_UPLOAD_PROCEDURE_APPROVED=$MANUAL_UPLOAD_PROCEDURE_APPROVED" \
  --env "FINCLOSE_AUTH_EMAIL_DELIVERY_VERIFIED=$AUTH_EMAIL_DELIVERY_VERIFIED" \
  --env "FINCLOSE_UPLOAD_OPERATOR_CHECKLIST_VERIFIED=$UPLOAD_OPERATOR_CHECKLIST_VERIFIED"

printf '%s\n' "$PRODUCTION_URL"
