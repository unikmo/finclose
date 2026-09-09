#!/usr/bin/env bash
set -euo pipefail

STAGE="${1:-}"
SOURCE_SHA="${2:-}"
POLICY_FILE="ops/vercel-release-policy.json"

if [[ ! "$SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]]; then
  echo "invalid release source SHA" >&2
  exit 2
fi
if ! jq -e --arg stage "$STAGE" '.stages[$stage] != null' "$POLICY_FILE" >/dev/null; then
  echo "unsupported release stage: $STAGE" >&2
  exit 2
fi

PRODUCTION_URL=$(jq -r '.project.production_url' "$POLICY_FILE")
EXPECTED_VERSION=$(node -p "require('./package.json').version")
EXPECTED_MODE=$(jq -r --arg stage "$STAGE" '.stages[$stage].runtime_mode' "$POLICY_FILE")
EXPECTED_UPLOAD_MODE=$(jq -r --arg stage "$STAGE" '.stages[$stage].upload_quarantine_mode' "$POLICY_FILE")
HEALTH_URL="${PRODUCTION_URL}/api/health?deep=1"
BODY=$(mktemp)
trap 'rm -f "$BODY"' EXIT

MATCHED=0
for attempt in $(seq 1 18); do
  if curl --silent --show-error --fail --max-time 20 "$HEALTH_URL" -o "$BODY"; then
    VERSION=$(jq -r '.version // ""' "$BODY")
    MODE=$(jq -r '.runtime.mode // ""' "$BODY")
    DEPLOYED_SHA=$(jq -r '.release_source.sha // ""' "$BODY")
    if [[ "$VERSION" == "$EXPECTED_VERSION" && "$MODE" == "$EXPECTED_MODE" && "$DEPLOYED_SHA" == "$SOURCE_SHA" ]]; then
      MATCHED=1
      break
    fi
  fi
  echo "waiting for canonical FinClose runtime ($attempt/18)..."
  sleep 5
done

if [[ "$MATCHED" != "1" ]]; then
  echo "canonical FinClose runtime did not converge to expected version/mode/source" >&2
  jq '{version, release_source, runtime: .runtime.mode}' "$BODY" >&2 2>/dev/null || true
  exit 1
fi

jq -e '.release_source.ready == true' "$BODY" >/dev/null
jq -e '.runtime.production_release_gate_approved == false' "$BODY" >/dev/null
jq -e --arg expected "$EXPECTED_UPLOAD_MODE" '.runtime.upload_quarantine_mode == $expected' "$BODY" >/dev/null

case "$STAGE" in
  LAB_SAFE)
    jq -e '
      .runtime.real_data_mode == false and
      .runtime.release_gate_approved == false and
      .runtime.pilot_release_gate_approved == false and
      .runtime.upload_quarantine_mode == "BLOCK"
    ' "$BODY" >/dev/null
    ;;
  CERTIFY_LAB)
    jq -e '
      .runtime.real_data_mode == false and
      .runtime.release_gate_approved == false and
      .runtime.pilot_release_gate_approved == false and
      .runtime.upload_quarantine_mode == "MANUAL_REVIEW"
    ' "$BODY" >/dev/null
    ;;
  PILOT)
    jq -e --arg sha "$SOURCE_SHA" '
      .runtime.real_data_mode == true and
      .runtime.release_gate_approved == true and
      .runtime.pilot_release_gate_approved == true and
      .runtime.production_release_gate_approved == false and
      .runtime.real_data_allowed_by_config == true and
      .runtime.upload_quarantine_mode == "MANUAL_REVIEW" and
      .real_data_release_evidence.ready == true and
      .real_data_release_evidence.code == "PILOT_CERTIFICATION_VERIFIED" and
      .real_data_release_evidence.release_source_sha == $sha and
      .pilot_certification.release_source_sha == $sha and
      .pilot_certification.release_ready == true and
      .pilot_certification.activation_allowed == true and
      .ok == true
    ' "$BODY" >/dev/null
    ;;
  *)
    echo "unexpected stage" >&2
    exit 2
    ;;
esac

echo "verified FinClose ${STAGE} at ${PRODUCTION_URL}: version=${EXPECTED_VERSION} source=${SOURCE_SHA}"
