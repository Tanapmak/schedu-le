# Schedu-le v2

Scheduling for live-commerce MCs and PDs: rooms × time board, leave requests, hours vs KPI and live results.
v2 is a rewrite for Google Cloud (Cloud Run + Cloud SQL Postgres + BigQuery). The v1 app is still on `main`.

## Layout

| Path | What |
|---|---|
| `api/` | Express 5 + TypeScript API. Also serves the built web app in production. |
| `web/` | React 19 + Vite front end. |
| `db/migrations/` | SQL migrations, applied in file-name order and recorded in `schema_migrations`. |
| `db/seed/` | Reference data (rooms, rules). `db/seed/dev/` holds sample people for local use only. |

Double-booking rules live in the database as exclusion constraints: one room cannot have two live sessions at once,
one person cannot work two overlapping sessions, and one person cannot have two overlapping pending/approved leave requests.

## Run locally

Needs Node 20+ and Postgres 16.

```sh
docker compose up -d                      # Postgres on :5432 (user/password app/app)
export DATABASE_URL=postgres://app:app@localhost:5432/schedule
npm install
npm run migrate
npm run seed -- --dev                     # reference data, sample people and a sample schedule around today
npm run dev                               # API on :8080, web on :5173
```

On Cloud Run the API connects through the Cloud SQL socket instead: set `DB_SOCKET`, `DB_NAME`, `DB_USER` and `DB_PASSWORD`.

## Sign-in and roles

Each person signs in with their Google account. `people.email` links the account to a person, and `people.app_role` sets what they can do:

| Role | Can |
|---|---|
| `admin` | Add, change, cancel and publish sessions. Sees drafts. |
| `mc`, `pd`, `viewer` | See the published schedule; their own sessions are marked. File leave and swap requests, see their own hours, record results for their own sessions. |

`AUTH_MODE` picks how the API learns who is calling:

- `iap` (default when `NODE_ENV=production`): Cloud Run sits behind IAP. The API checks IAP's signed header
  (`x-goog-iap-jwt-assertion`) against `IAP_AUDIENCE`, which is `/projects/<project number>/locations/<region>/services/<service>`.
  The app refuses to start without it.
- `dev` (default otherwise): no Google sign-in. The web app shows a "view as" switcher listing everyone with an email,
  so each role can be tried locally. Without a choice, the first admin is used.

A Google account that is not in `people` (or is archived) gets a "not on the team list" page.

## Features beyond the board

| Page | What |
|---|---|
| My schedule | Upcoming sessions, hours this month vs KPI, request leave or a swap, my requests. |
| Leave | Admin: approve leave and swaps, set team off days (they block the schedule), see all leave. |
| Hours | Hours per person per month. Only `full_time` staff are compared with KPI. Admin downloads the payroll Excel here. |
| Live results | PD pastes or photographs the live dashboard; Claude reads the numbers; the PD checks and confirms. |

Rules: leave is limited to `leave_quota_per_day` people per position per day (pending + approved); urgent leave may go
over with a reason. Approving re-checks the quota and warns about sessions the person would miss. A swap hands a session to
someone or trades two sessions; approving re-runs the session rules.

Screenshot reading needs `ANTHROPIC_API_KEY` (model `claude-opus-5-5`, override with `RESULTS_MODEL`). Without it the
Live results page still works with typed-in numbers. On Cloud Run, keep the key in Secret Manager:

```sh
printf '%s' 'sk-ant-...' | gcloud secrets create anthropic-api-key --data-file=- --replication-policy=user-managed --locations=asia-southeast1
gcloud secrets add-iam-policy-binding anthropic-api-key \
  --member=serviceAccount:schedu-le-app@schedu-le.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
gcloud run services update schedu-le --region=asia-southeast1 --update-secrets=ANTHROPIC_API_KEY=anthropic-api-key:latest
```

Cloud Build deploys with `--update-secrets`, so the key stays across deploys.

The payroll workbook (`/api/export/payroll?month=YYYY-MM`) has three sheets: Summary (hours, KPI, GMV per person),
Sessions (every counted line) and Freelance (each freelancer's lives with totals). It holds no pay rates; guests are left out.

## Checks

```sh
npm run typecheck
TEST_DATABASE_URL=postgres://app:app@localhost:5432/schedule_test npm test   # schema tests reset that database
npm run build
```

Schema tests are skipped when `TEST_DATABASE_URL` is not set. Point it at a throwaway database: the tests drop and recreate its `public` schema.

## Deploy

`Dockerfile` builds one image that runs `node api/dist/index.js` on port 8080. The first deploy to Cloud Run is done by hand
(setup guide, step 6). After that a Cloud Build trigger on pushes to `v2` runs `cloudbuild.yaml`:

1. typecheck and unit tests
2. build and push the image to Artifact Registry (`cloud-run-source-deploy`, created by the first deploy)
3. run the migrations as the Cloud Run job `schedu-le-migrate`, with the app's service account and database access
4. deploy the new image to the `schedu-le` service; IAP and other service settings carry over

The service needs `IAP_AUDIENCE=/projects/<project number>/locations/asia-southeast1/services/schedu-le` (see "Sign-in and roles").
