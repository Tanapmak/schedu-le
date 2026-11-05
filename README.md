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
| `admin` (master admin) | Everything `operation` can do, plus the **Team** page: add members, set their role, archive people who left. The app never lets the last active admin be demoted or archived, and an admin cannot demote or archive themselves. |
| `operation` | Run the schedule: add, change, cancel and publish sessions (sees drafts), decide leave and swaps, team off days, results, attendance, hours and the payroll export. |
| `mc`, `pd`, `viewer` | See the published schedule; their own sessions are marked. File leave and swap requests, see their own hours, record results for their own sessions. |

`AUTH_MODE` picks how the API learns who is calling:

- `iap` (default when `NODE_ENV=production`): Cloud Run sits behind IAP. The API checks IAP's signed header
  (`x-goog-iap-jwt-assertion`) against `IAP_AUDIENCE`, which is `/projects/<project number>/locations/<region>/services/<service>`.
  The app refuses to start without it.
- `dev` (default otherwise): no Google sign-in. The web app shows a "view as" switcher listing everyone with an email,
  so each role can be tried locally. Without a choice, the first admin is used.

A Google account that is not in `people` (or is archived) gets a "not on the team list" page.
Adding someone on the Team page puts them on the list; they also need IAP access (one by one, or through a Google Group
that has the "IAP-secured Web App User" role). Team changes are written to `audit_log`.

## Features beyond the board

| Page | What |
|---|---|
| My schedule | Upcoming sessions, hours this month vs KPI, request leave or a swap, my requests. |
| Leave | Admin: approve leave and swaps, set team off days (they block the schedule), see all leave. |
| Hours | Hours per person per month. Only `full_time` staff are compared with KPI. Admin downloads the payroll Excel here. |
| Live results | PD pastes or photographs the live dashboard; Claude reads the numbers; the PD checks and confirms. Readings can be edited (new version, old one kept). |
| Live performance | The month's GMV, GMV/h, by room and by person, every session's result status and forgot-to-record deductions. The team sees only their own sessions. |

Rules: leave is limited to `leave_quota_per_day` people per position per day (pending + approved); urgent leave may go
over with a reason. Approving re-checks the quota and warns about sessions the person would miss. A swap hands a session to
someone or trades two sessions; approving re-runs the session rules.

Screenshot reading needs `ANTHROPIC_API_KEY` (model `claude-haiku-5-5`, override with `RESULTS_MODEL`). Without it the
Live results page still works with typed-in numbers. On Cloud Run, keep the key in Secret Manager:

```sh
printf '%s' 'sk-ant-...' | gcloud secrets create anthropic-api-key --data-file=- --replication-policy=user-managed --locations=asia-southeast1
gcloud secrets add-iam-policy-binding anthropic-api-key \
  --member=serviceAccount:schedu-le-app@schedu-le.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
gcloud run services update schedu-le --region=asia-southeast1 --update-secrets=ANTHROPIC_API_KEY=anthropic-api-key:latest
```

Cloud Build deploys with `--update-secrets`, so the key stays across deploys.

AI scheduling (schedule page → "✨ AI จัดตาราง", admin and operation): the lives (room + time) of a pattern week are
laid onto the chosen dates by weekday, and a solver (`api/src/autoSchedule.ts`) picks the MC and PD for each one. Hard
limits: no clashes, nobody on leave (pending or approved) or on a team off day, monthly hour cap, hours per day. Soft
goals: keep the same crew on a room for a block, share hours towards KPI, full-time staff before interns before cover,
past performance, and wishes. Claude only turns the admin's free text and each person's own preferences (Preferences
page, every role) into rules for the solver; without `ANTHROPIC_API_KEY` the solver still runs on the rules alone. Model
`claude-haiku-5-5`, override with `SCHEDULE_MODEL`. Nothing is saved until the admin adds the plan as drafts.

Past performance compares each live's GMV per hour with the same room's average that month, per person, room and time of
day, over the last 12 months: lives recorded in the app, plus the cleaned history sheet (`live_history_cleaned_v2.csv`),
which an admin loads once from the AI scheduling window ("นำเข้าประวัติไลฟ์ (CSV)"; loading again replaces it).

Live results rules (v2.1, `api/src/results.ts`):
- Session Flag: a reading only continues the session in the same room that ends exactly when this one starts, and only if
  that session has a result. After a gap it is always a new broadcast (the server enforces this even if "Continues" is sent).
- Edits save a new version and keep the old one; if the flag changes, later readings of the broadcast follow, so their
  deltas stay right. MC/PD may edit or remove up to 7 days after the session ends; admin and operation have no limit.
- Results of month M can be back-recorded until the 25th of month M+1 (00:00 Bangkok). After that MC/PD cannot record;
  each session still without a result (or first recorded after the cut-off by an admin) costs its PD 500 THB (never the MC:
  recording is the PD's job).
- The screenshot is stored with each reading (`live_result_images`) so an edit can show it.

The payroll workbook (`/api/export/payroll?month=YYYY-MM`) has four sheets: Summary (hours, KPI, GMV per person, results not
recorded, forgot-to-record deduction), Sessions (every counted line), Freelance (each freelancer's lives with totals) and
Missing results. It holds no pay rates; guests are left out.

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
