# ADR-0001 — Firebase-only FinClose data architecture

Status: Accepted
Date: 2026-09-06

## Decision

FinClose will not introduce Supabase or a separate PostgreSQL service. The production data architecture remains inside Firebase:

- Firebase Authentication for customer identity.
- Firebase Realtime Database for workflow/control-plane state.
- Cloud Firestore for authoritative financial ledger/evidence and transactional period-lock state.
- Firebase Cloud Storage for financial documents.

Vercel remains the application/API runtime.

## Rationale

The user explicitly requires the FinClose data stack to stay on Firebase. Cloud Firestore provides server-side transactions and atomic multi-document writes suitable for the controlled-pilot invariants implemented by FinClose. The application compensates for the absence of relational foreign-key constraints with deterministic IDs, server-only writes, tenant/RBAC checks, evidence hashes and transactionally maintained company lock state.

## Consequences

- No Supabase project is required.
- No `FINCLOSE_DATABASE_URL` is required.
- PostgreSQL package dependencies and SQL migrations are removed.
- Firestore must be enabled, secured, backed up and integration-tested before `PILOT` activation.
- High-volume ledger sharding and stronger archival/WORM controls remain future scale/compliance work.
