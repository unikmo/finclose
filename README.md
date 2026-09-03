# FinClose

Canonical repository for the FinClose financial-operations product and Lab.

## Canonical architecture — v0.24 test build

- **Source:** `unikmo/finclose`
- **Hosting/runtime:** Vercel
- **Test database:** Firebase Realtime Database
- **Database URL:** `https://theantibalcony-default-rtdb.europe-west1.firebasedatabase.app/`
- **File storage:** Firebase Cloud Storage
- **Firebase project:** `theantibalcony`
- **Frontend/API:** Next.js
- **Supabase:** not used by v0.24

## Security boundary

The browser never talks directly to Firebase Realtime Database or Storage. Vercel server routes use Firebase Admin credentials. Firebase client rules deny direct reads/writes. Lab API operations require `FINCLOSE_LAB_TOKEN`.

Use synthetic/test financial data only until user authentication, tenant authorization, production database architecture and full security QA are complete.

## Required Vercel environment variables

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_STORAGE_BUCKET`
- `FINCLOSE_LAB_TOKEN`

Optional:

- `FIREBASE_DATABASE_URL` — v0.24 already defaults to the current `theantibalcony` Realtime Database URL.

Do not expose Firebase Admin credentials with `NEXT_PUBLIC_` variables.

## Test acceptance path

1. Vercel `/api/health?deep=1` reports both Realtime Database and Storage reachable.
2. Enter the Lab token in the UI.
3. Request/download a Georgia initialization template or upload the existing synthetic MDA template.
4. Validate and initialize MDA.
5. Reload the site and confirm MDA still exists.
6. Upload a bookkeeping XLSX under MDA.
7. Confirm Georgia/GEL context is retained.
8. Upload the same file again and confirm `ALREADY_RECEIVED`.
9. Confirm an unknown company ID returns 404.

## Production database gate

Firebase Realtime Database is being used for the current deployment test because it is already active in the selected Firebase project and gives durable test persistence. It is **not approved as the final ledger database**. Before real accounting journals/ledger logic are introduced, FinClose must run a relational-storage decision gate. PostgreSQL remains the preferred production candidate for ledger-grade relational data.
