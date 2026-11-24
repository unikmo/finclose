# FinClose Vercel Release Controller — Independent Red Team v1

Date: 2026-09-09
Scope: PR #28, permanent Vercel release automation for controlled PILOT
Review target: `ops-vercel-release-controller`

## Verdict

**CONFIRM FOR MERGE TO LAB AUTOMATION; PILOT REMAINS BLOCKED.**

The controller removes the recurring Vercel-dashboard deployment/environment-control step without weakening the v0.35.2 exact-source certification boundary. It is suitable to merge and test as fail-closed `LAB_SAFE` automation. It does **not** make FinClose PILOT-ready by itself: the P0 evidence registry remains `PENDING`, Firebase Web Auth/live certification is still incomplete, and the Vercel automation credential has not yet been proven present.

## Challenge 1 — Does automation require connecting Vercel to GitHub?

**No.** The release helper targets the already-existing FinClose Vercel project using the canonical `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`. The Vercel Git link is therefore not part of the release dependency chain.

Risk addressed: recurring UI work and configuration drift caused by a manually selected Vercel project.

## Challenge 2 — Could changing a release-state file invalidate exact-source certification?

**The first design could have. It was rejected.**

A mutable `LAB -> PILOT` state commit would create a new Git SHA after certification, contradicting FinClose's source-bound certification rule. The final design separates immutable source from operational stage:

- source remains the exact already-merged main SHA;
- `LAB_SAFE`, `CERTIFY_LAB`, and `PILOT` are fixed operational presets;
- release branches select a stage without changing the source SHA;
- certification and activation therefore use the same source SHA.

## Challenge 3 — Can a release branch falsely turn human evidence flags to YES?

**Not by itself.**

The controller no longer treats branch creation as evidence. `CERTIFY_LAB` and `PILOT` require every mandatory entry in `ops/pilot-release-evidence.json` to be `PASS`. Each PASS record must:

- map to the expected environment flag;
- identify a repository evidence document;
- carry a verification timestamp;
- point to the exact current Git blob of that document;
- differ from the original pending/template blob.

If any record is PENDING/FAIL, unchanged from its template, missing, stale, or blob-mismatched, the deployment helper fails before certification.

This is an auditability control, not a substitute for truthful underlying evidence. Evidence may be marked PASS only after the actual live/human check has occurred.

## Challenge 4 — Could a stale or unreviewed source be activated?

**The controller fails closed.**

For every release source it requires:

- the SHA is contained in `main`;
- a successful `FinClose CI` push run exists for that exact main SHA;
- the SHA is associated with a merged pull request into `main`;
- deterministic tests and the production build are independently rerun in the release job.

For `CERTIFY_LAB` and `PILOT`, the SHA must also equal the current `main` head. The workflow rechecks current `main` immediately before a controlled release and again after certification before PILOT activation, closing the main-advance race window.

## Challenge 5 — The main branch is currently unprotected. Does that bypass release controls?

**Direct pushes do not satisfy the release controller's provenance gate.**

GitHub currently reports `main` as `protected=false`, with no repository rulesets. The connected GitHub integration cannot administer branch protection. This is an administrative hardening gap, but the controller compensates for release execution by refusing any source that is not associated with a merged PR into `main` and a successful exact-SHA main CI run.

Administrative branch/ruleset protection remains recommended as defense in depth. It is not represented as completed.

## Challenge 6 — Could any collaborator create a release ref and activate PILOT?

**No under the current repository ownership model.**

Controlled `release/lab/*`, `release/certify/*`, and `release/pilot/*` create-event runs are accepted only when the event actor equals the repository owner. Automatic main CI events can deploy only `LAB_SAFE`.

## Challenge 7 — Does the certification workflow decrypt all Vercel project secrets?

**No.**

An earlier design would have pulled decrypted Vercel environment variables to recover `FINCLOSE_LAB_TOKEN`. That design was rejected. The final controller generates a random 256-bit-equivalent hexadecimal release token per `CERTIFY_LAB` run, masks it in GitHub Actions, injects it only into the temporary certification deployment, and authenticates the certification POST with a timing-safe comparison.

`LAB_SAFE` and `PILOT` deployments explicitly receive an empty automation token. The existing Lab-token path remains available for its original purpose but is not exposed to the release runner.

## Challenge 8 — Could dependency drift change the deployment tooling between releases?

**Reduced and explicit.**

The release workflow pins:

- `actions/checkout` to the v4.2.2 commit SHA;
- `actions/setup-node` to the v4.4.0 commit SHA;
- Vercel CLI to `59.11.7`, rather than `@latest`.

The release job uses `npm ci`, then reruns tests and the production build. A future Vercel CLI upgrade must therefore be an explicit source change reviewed through the normal PR/CI path.

## Challenge 9 — Can the controller confuse a same-version deployment with the certified source?

**No.**

Health now exposes the non-secret exact release source SHA. Post-deployment verification requires all three to match:

- expected FinClose version;
- expected runtime stage;
- exact expected 40-character source SHA.

PILOT additionally requires the persisted release evidence and certification source SHA to match the same deployment SHA.

## Challenge 10 — What happens if PILOT deployment or live verification fails?

**Automatic fail-closed rollback.**

A failed direct PILOT verification or failed post-certification PILOT activation causes the controller to deploy the same source as `LAB_SAFE` and verify the rollback. `FINCLOSE_PRODUCTION_RELEASE_GATE` is forced `BLOCKED` in every supported stage; the controller has no PRODUCTION stage.

## Challenge 11 — Does merge of this PR prove the automation works against Vercel?

**No. Source correctness is not live deployment proof.**

After merge, the exact main SHA must pass main CI. The resulting `workflow_run` should then execute the new release controller and attempt `LAB_SAFE` against canonical Vercel. The result must be checked live.

Two possible outcomes are acceptable evidence states:

1. `VERCEL_TOKEN` already exists and the controller successfully deploys/verifies exact-source `LAB_SAFE`; or
2. the controller fails explicitly at the credential gate because `VERCEL_TOKEN` is absent. In that case a single credential bootstrap remains required before automation can operate.

No Vercel automation success may be claimed before that post-merge run completes and canonical `/api/health?deep=1` confirms the exact source.

## Remaining release blockers unrelated to recurring Vercel UI work

- `backup_pitr`: PENDING
- `security_review`: PENDING
- `accounting_qa`: PENDING
- `manual_upload_procedure`: PENDING
- `auth_email_delivery`: PENDING
- `upload_operator_checklist`: PENDING
- Firebase Web Auth/live Email-Password certification: not yet proven complete
- protected live Firebase certification: not yet clean for the new source

These remain genuine release evidence tasks. They must not be replaced by environment flags or by the existence of this automation.

## Final Red Team decision

**MERGE APPROVED FOR FAIL-CLOSED LAB AUTOMATION, subject to green PR CI.**

**PILOT approval remains prohibited** until the evidence registry contains only evidence-backed PASS records, exact-source protected certification has zero mandatory FAIL/BLOCKED gates, and the same-source live PILOT activation verification succeeds.
