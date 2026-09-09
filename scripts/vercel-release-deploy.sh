#!/usr/bin/env bash
set -euo pipefail

STAGE="${1:-}"
SOURCE_SHA="${2:-}"
POLICY_FILE="ops/vercel-release-policy.json"
EVIDENCE_FILE="ops/pilot-release-evidence.json"
VERCEL_CLI_VERSION="59.11.7"

if [[ ! "$SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]]; then
  echo "invalid release source SHA" >&2
  exit 2
fi
if [[ ! -f "$POLICY_FILE" || ! -f "$EVIDENCE_FILE" ]]; then
  echo "release policy/evidence registry is missing" >&2
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
REQUIRES_EVIDENCE=$(runtime_value requires_pilot_evidence)

[[ "$PRODUCTION_GATE" == "BLOCKED" ]] || { echo "production release gate must remain BLOCKED" >&2; exit 2; }
[[ "$RUNTIME_MODE" == "LAB" || "$RUNTIME_MODE" == "PILOT" ]] || { echo "controller does not support PRODUCTION runtime" >&2; exit 2; }

EVIDENCE_IDS=(
  backup_pitr
  security_review
  accounting_qa
  manual_upload_procedure
  auth_email_delivery
  upload_operator_checklist
)

expected_flag() {
  case "$1" in
    backup_pitr) echo FINCLOSE_BACKUP_PITR_VERIFIED ;;
    security_review) echo FINCLOSE_SECURITY_REVIEW_APPROVED ;;
    accounting_qa) echo FINCLOSE_ACCOUNTING_QA_APPROVED ;;
    manual_upload_procedure) echo FINCLOSE_MANUAL_UPLOAD_PROCEDURE_APPROVED ;;
    auth_email_delivery) echo FINCLOSE_AUTH_EMAIL_DELIVERY_VERIFIED ;;
    upload_operator_checklist) echo FINCLOSE_UPLOAD_OPERATOR_CHECKLIST_VERIFIED ;;
    *) return 1 ;;
  esac
}

validate_evidence_registry() {
  local id expected status flag path template_sha evidence_sha current_sha verified_at
  for id in "${EVIDENCE_IDS[@]}"; do
    expected=$(expected_flag "$id")
    status=$(jq -r --arg id "$id" '.release_evidence[$id].status // ""' "$EVIDENCE_FILE")
    flag=$(jq -r --arg id "$id" '.release_evidence[$id].environment_flag // ""' "$EVIDENCE_FILE")
    path=$(jq -r --arg id "$id" '.release_evidence[$id].source_path // ""' "$EVIDENCE_FILE")
    template_sha=$(jq -r --arg id "$id" '.release_evidence[$id].template_blob_sha // ""' "$EVIDENCE_FILE")
    evidence_sha=$(jq -r --arg id "$id" '.release_evidence[$id].source_blob_sha // ""' "$EVIDENCE_FILE")
    verified_at=$(jq -r --arg id "$id" '.release_evidence[$id].verified_at // ""' "$EVIDENCE_FILE")

    [[ "$flag" == "$expected" ]] || { echo "evidence flag mapping mismatch for $id" >&2; exit 2; }
    [[ "$status" == "PASS" ]] || { echo "pilot evidence is not PASS: $id ($status)" >&2; exit 2; }
    [[ -f "$path" ]] || { echo "pilot evidence source file missing: $path" >&2; exit 2; }
    [[ "$template_sha" =~ ^[a-f0-9]{40}$ && "$evidence_sha" =~ ^[a-f0-9]{40}$ ]] || { echo "invalid evidence blob SHA for $id" >&2; exit 2; }
    [[ "$evidence_sha" != "$template_sha" ]] || { echo "pilot evidence record is still the uncompleted template: $id" >&2; exit 2; }
    [[ "$verified_at" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || { echo "pilot evidence verified_at is missing/invalid: $id" >&2; exit 2; }
    current_sha=$(git hash-object "$path")
    [[ "$current_sha" == "$evidence_sha" ]] || { echo "pilot evidence blob binding mismatch for $id" >&2; exit 2; }
  done
}

if [[ "$REQUIRES_EVIDENCE" == "true" ]]; then
  validate_evidence_registry
  BACKUP_PITR_VERIFIED=YES
  SECURITY_REVIEW_APPROVED=YES
  ACCOUNTING_QA_APPROVED=YES
  MANUAL_UPLOAD_PROCEDURE_APPROVED=YES
  AUTH_EMAIL_DELIVERY_VERIFIED=YES
  UPLOAD_OPERATOR_CHECKLIST_VERIFIED=YES
else
  BACKUP_PITR_VERIFIED=NO
  SECURITY_REVIEW_APPROVED=NO
  ACCOUNTING_QA_APPROVED=NO
  MANUAL_UPLOAD_PROCEDURE_APPROVED=NO
  AUTH_EMAIL_DELIVERY_VERIFIED=NO
  UPLOAD_OPERATOR_CHECKLIST_VERIFIED=NO
fi

export VERCEL_ORG_ID="$TEAM_ID"
export VERCEL_PROJECT_ID="$PROJECT_ID"

npx --yes "vercel@${VERCEL_CLI_VERSION}" deploy \
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
