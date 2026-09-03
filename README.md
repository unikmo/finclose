# FinClose

FinClose is the canonical repository for the FinClose financial-operations product and Lab test client.

## Current architecture

- **Web/test deployment:** Firebase Hosting (project `theantibalcony`, preview channel `finclose-lab`)
- **Persistence/API:** Supabase project currently used for FinClose Lab
- **Frontend:** Next.js static export
- **Current client version:** v0.22.0

## Safety boundary

Use synthetic/test financial data until user authentication and authorization are implemented and verified end-to-end.

## Migration status

This repository supersedes the temporary FinClose code that was previously carried inside `unikmo/Unikmo` on FinClose-specific branches. The active v0.22 Firebase client and its CI/deployment configuration are being migrated here first. Legacy v0.20 runtime payloads remain in the old repository until separately verified and migrated.

## Build

```bash
npm install
npm run build
```

The static Firebase Hosting artifact is generated in `out/`.
