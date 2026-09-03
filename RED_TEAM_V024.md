# FinClose v0.24 — Independent Red Team

Date: 2026-09-03

## Scope

Architecture under test:

`Vercel Next.js runtime -> Firebase Realtime Database -> Firebase Storage`

## Findings

1. **Suitable for synthetic sequential Lab testing:** durable company state no longer depends on Vercel process memory.
2. **Direct client access remains denied:** browser operations route through Vercel using Firebase Admin credentials; RTDB and Storage client rules are locked.
3. **Stable company identity:** initialized company ID is deterministically the initialization UUID, avoiding duplicate company creation on repeated initialization requests.
4. **Idempotency:** data imports use company ID + SHA-256 fingerprint; repeat uploads return `ALREADY_RECEIVED` after the first successful record.
5. **Known concurrency gap:** duplicate uploads racing before the import record is committed could create an orphan duplicate object in Storage. Acceptable for sequential synthetic Lab testing; BLOCKER for production-grade concurrent ingestion.
6. **Known relational gap:** Realtime Database is not approved for ledger-grade accounting journals, period locks, multi-entity joins or complex reconciliation. A relational database gate remains mandatory before production financial accounting logic.
7. **Authentication gap:** Lab token is a testing control, not customer authentication/tenant authorization. Real confidential accounting data remains prohibited.
8. **Rollback:** v0.23 Firestore code remains available in Git history; v0.24 is isolated in its own PR before merge.

## Verdict

**PASS WITH RISKS — SYNTHETIC LAB ONLY.**

Do not classify v0.24 as production-ready. Required before real financial data: user authentication, tenant authorization, concurrency-safe ingestion, production database decision, security review, independent QA and live post-release verification.
