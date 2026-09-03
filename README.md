# FinClose

FinClose is the **canonical GitHub repository** for the FinClose financial-operations product and Lab test client.

## Current architecture

- **Web/test deployment:** Firebase Hosting (project `theantibalcony`, preview channel `finclose-lab`)
- **Persistence/API:** Supabase project currently used for FinClose Lab
- **Frontend:** Next.js static export
- **Current client version:** v0.22.0

## Safety boundary

Use synthetic/test financial data until user authentication and authorization are implemented and verified end-to-end.

## Migration status

The active v0.22 Firebase client and its CI/deployment configuration have moved here from the temporary FinClose branches inside `unikmo/Unikmo`.

Legacy v0.20 runtime payloads remain in the old repository pending a separate integrity-checked migration. The currently running Supabase Edge Function backend is live, but its source has not yet been copied here because the connected Supabase account does not currently permit reading Edge Function source.

## Build

```bash
npm install
npm run build
```

The static Firebase Hosting artifact is generated in `out/`.
