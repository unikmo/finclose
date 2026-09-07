# FinClose Controlled Pilot Upload Operator Checklist v1

Effective date: 2026-09-07
Scope: controlled PILOT only
Status: TEMPLATE — OPERATOR ADOPTION REQUIRED

This checklist operationalizes `CONTROLLED_PILOT_UPLOAD_PROCEDURE_V1.md`. It does not replace automated malware scanning and does not authorize unrestricted production uploads.

## A. Operator readiness

- [ ] I have read `CONTROLLED_PILOT_UPLOAD_PROCEDURE_V1.md` in full.
- [ ] I understand `MANUAL_REVIEW` is a controlled-pilot exception, not a malware-scanning substitute.
- [ ] The review workstation is current and patched.
- [ ] Endpoint protection is active and current.
- [ ] The reviewer uses a non-privileged workstation account for document inspection.
- [ ] Macros, scripts, external content and embedded active content are not enabled during review.
- [ ] The pilot volume is low enough that every uploaded file can be reviewed individually.
- [ ] Only trusted pilot customers and known financial-source files will be admitted.

Reviewer/workstation notes: _____________________________________________

## B. Per-file review record

Complete this section for every quarantined pilot artifact.

- Organization ID: ___________________________________
- Company ID: ________________________________________
- Deployment ID: _____________________________________
- Artifact kind / ID: _________________________________
- Filename: ___________________________________________
- Declared file type: _________________________________
- Size: _______________________________________________
- SHA-256 fingerprint: _________________________________
- Customer/source identified: `YES` / `NO`
- Customer expected this specific file: `YES` / `NO`
- Source provenance category:
  - [ ] direct system export
  - [ ] direct statement/document from known financial/tax/payroll provider
  - [ ] customer-prepared file from own records
  - [ ] other — must reject unless separately approved
- Downloaded only through the FinClose ADMIN review route: `YES` / `NO`
- File opened without enabling active content: `YES` / `NO`
- Content consistent with declared financial source: `YES` / `NO`
- Unexpected execution/download/credential request observed: `YES` / `NO`
- Security/provenance uncertainty remains: `YES` / `NO`

### Decision rule

Choose `CLEAN` only if every required provenance/content check is satisfactory and no security anomaly remains. If uncertain, choose `REJECTED`.

Decision: `CLEAN` / `REJECTED`
Review note: ___________________________________________________________
Reviewer user ID: ______________________________________________________
Review timestamp: ______________________________________________________

## C. Decision verification

After submitting the review decision:

- [ ] The persisted decision matches the intended decision.
- [ ] A `CLEAN` artifact transitioned to `RECEIVED` only after review.
- [ ] A `REJECTED` artifact did not become operational.
- [ ] No quarantined artifact unlocked onboarding/source-completeness before clearance.
- [ ] The decision is immutable through a second conflicting review attempt.
- [ ] The audit evidence includes reviewer ID, timestamp, decision, note and upload fingerprint.
- [ ] Any Storage metadata synchronization failure is separately audited and did not erase the authoritative decision.

## D. Stop conditions

Pause new real-data uploads immediately if any of the following occurs:

- suspicious or unexplained file behavior;
- provenance cannot be established;
- review workstation protection is unavailable;
- review route tenant/deployment scoping appears incorrect;
- a quarantined file reaches operational processing before clearance;
- conflicting review attempts can overwrite one another;
- review volume exceeds the operator's capacity to inspect every file;
- any suspected credential/token exposure occurs.

Incident/reference: ____________________________________________________

## E. Operator adoption attestation

Mandatory readiness checks complete: `YES` / `NO`
Suitable review workstation/process confirmed: `YES` / `NO`
Operator accepts responsibility for following the procedure: `YES` / `NO`
Overall adoption result: `PASS` / `FAIL`

Operator name: __________________________  Date: ________________________

### Release flag rule

Only an overall `PASS` on the adoption section permits `FINCLOSE_MANUAL_UPLOAD_PROCEDURE_APPROVED=YES`. The runtime upload mode must remain `BLOCK` until the controlled pilot is otherwise ready to use `MANUAL_REVIEW`. `FINCLOSE_PRODUCTION_RELEASE_GATE` remains blocked; production still requires verified `SCANNER` mode.
