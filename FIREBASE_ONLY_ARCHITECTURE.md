# FinClose Firebase-only production architecture

Canonical decision: production data services remain on Firebase. Supabase/PostgreSQL is not part of FinClose.

- Vercel: application and server API runtime.
- Firebase Authentication: customer identity and server session cookies.
- Cloud Firestore: authoritative financial ledger, close approvals, immutable evidence, period locks and production audit trail.
- Firebase Realtime Database: workflow/control-plane state while legacy engines are migrated progressively to Firestore.
- Firebase Cloud Storage: private financial source documents and historical uploads.

Cloud Firestore is selected for the authoritative ledger because production writes can be protected by server-side transactions and deterministic idempotency keys. Direct browser access to Firestore and Storage remains denied; the Vercel server uses the Firebase Admin SDK.

Production modes remain LAB, PILOT and PRODUCTION. Real-data modes require managed Firebase Authentication, tenant ownership, Firestore ledger health, Storage health and the remaining security/release gates. No Supabase credentials or PostgreSQL connection string are required.
