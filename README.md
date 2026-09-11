# SuRakSha Chain

SuRakSha Chain is a full-stack SIH prototype for case documents, physical-file integrity verification, version drift detection, victim redaction, judicial authorization, and a tamper-evident hash-chained audit ledger.

No external Gemini or other AI API key is required. Drift detection is deterministic word-level comparison with explicit numeric-change rules.

## Local Development

Prerequisite: Node.js.

```sh
npm install
npm run dev
```

The development server defaults to `http://localhost:3000`. Local development uses the prototype JWT fallback and the five intentional SIH demo accounts.

## Environment Variables

Copy `.env.example` and provide deployment-specific values. Never commit a real `.env` file.

- `NODE_ENV`: `development` or `production`.
- `PORT`: listening port; platforms may provide this automatically.
- `APP_URL`: public application URL. Production must use HTTPS.
- `JWT_SECRET`: unique random production secret, at least 32 characters.
- `BOOTSTRAP_PASSWORD`: password used to provision the five demo identities when the database is empty.
- `CORS_ORIGINS`: comma-separated explicit browser origins.
- `VITE_API_URL`: frontend build-time URL of the backend, without a trailing slash or `/api` (for example `https://suraksha-api.example.com`). Leave unset when the frontend and backend share one origin.
- `ENABLE_SEED_DATA`: retained for compatibility; no operational demo data is seeded.
- `ENABLE_TAMPER_TESTS`: keep `false` in production.

## Production Deployment

```sh
npm install
npm run build
npm start
```

Production startup rejects missing or insecure JWT configuration, missing bootstrap password, invalid `APP_URL`, wildcard CORS, and invalid ports.

### Netlify frontend plus Node backend

Netlify hosts the React frontend, but it does not run the Express server in `server.ts`. Deploy the backend to a persistent Node host or VM, then configure these values in Netlify site settings before building:

- `VITE_API_URL=https://<your-backend-domain>`
- `NODE_VERSION=22`

Configure the backend with:

- `NODE_ENV=production`
- `APP_URL=https://<your-netlify-site>.netlify.app`
- `CORS_ORIGINS=https://<your-netlify-site>.netlify.app` (add any custom domain as another comma-separated origin)
- `JWT_SECRET` with at least 32 random characters
- `BOOTSTRAP_PASSWORD` for the initial demo accounts
- `ENABLE_TAMPER_TESTS=false`

The repository includes `netlify.toml`, which builds only the client and enables SPA fallback routing. Netlify deploys are not suitable for the API's local SQLite database and `uploads/` evidence storage because serverless filesystems are ephemeral. The backend host must provide persistent writable storage for both paths.

After deploying the backend, verify `https://<your-backend-domain>/api/health` returns `{"ok":true,"service":"suraksha-chain-api"}` before testing login from the Netlify site.

### Recommended one-service deployment

For the simplest fully functional deployment, deploy this repository with `render.yaml` on Render. It runs the Express server and React frontend from the same HTTPS URL, so `VITE_API_URL` is not needed and browser CORS is not a dependency. The blueprint provisions a persistent disk at `/var/data`; set `BOOTSTRAP_PASSWORD`, `APP_URL`, and `CORS_ORIGINS` when Render prompts for synced secrets. Set both URL values to the Render service URL.

The same `Dockerfile` works on any Docker-capable host. Set `DATA_DIR` to a persistent mounted directory and expose the platform-provided `PORT`.

## Persistence and Storage

SQLite is stored in `suraksha.db` and evidence files are stored in `uploads/`, both relative to the process working directory. The deployment platform must provide persistent writable storage for both paths. Containers with ephemeral filesystems, including typical serverless container deployments, are not production-safe for evidence persistence without an external persistent volume or database/object-storage integration.

Evidence files are never served as public static assets; downloads require authenticated API authorization.

## Demo Accounts

The intentional prototype accounts use the password `Demo@123` and are available through the role quick-select UI:

- `admin@suraksha.gov.in`
- `io@suraksha.gov.in`
- `forensic@suraksha.gov.in`
- `prosecutor@suraksha.gov.in`
- `court@suraksha.gov.in`

Operational data is not preloaded.

## Final Demo Dataset

The curated three-case dataset can be created locally once with:

```sh
npm run seed:final
```

The production dataset was seeded once through a temporary protected route, which has now been removed from the deployed application. The persistent marker remains in the database for operational history. The local seed command remains available for disposable local testing only.

## Disposable Test Dataset

To create the fictional evidence fixture explicitly:

```sh
npm run testdata:create
npm run testdata:verify
```

The generator creates five `TEST-DATA-*` cases, real text/CSV/PNG/PDF files under `uploads/`, SHA-256-backed document versions, assignments, a sealed record, a victim-redaction record, and audit events. It never runs during install or application startup. Remove only this fixture namespace with:

```sh
npm run testdata:clean
```

The generated files are deliberately left available for manual workflow testing. The verifier independently checks physical presence, upload-root containment, file signatures, database relationships, and SHA-256 equality.

## Security Notes and Limitations

Document integrity uses SHA-256 comparison. The audit ledger is tamper-evident and hash-chained, not absolutely immutable. Court authorization is a workflow with an attached order file; cryptographic court-signature verification is not implemented. Textual drift analysis supports plain-text formats; semantic PDF/DOCX/OCR analysis is not provided.

# SuRaksha-Chain
