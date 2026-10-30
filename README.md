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
npm run seed -- --dev                     # reference data + sample people
npm run dev                               # API on :8080, web on :5173
```

On Cloud Run the API connects through the Cloud SQL socket instead: set `DB_SOCKET`, `DB_NAME`, `DB_USER` and `DB_PASSWORD`.

## Sign-in and roles

Each person signs in with their Google account. `people.email` links the account to a person, and `people.app_role` sets what they can do:

| Role | Can |
|---|---|
| `admin` | Add, change, cancel and publish sessions. Sees drafts. |
| `mc`, `pd`, `viewer` | See the published schedule; their own sessions are marked. |

`AUTH_MODE` picks how the API learns who is calling:

- `iap` (default when `NODE_ENV=production`): Cloud Run sits behind IAP. The API checks IAP's signed header
  (`x-goog-iap-jwt-assertion`) against `IAP_AUDIENCE`, which is `/projects/<project number>/locations/<region>/services/<service>`.
  The app refuses to start without it.
- `dev` (default otherwise): no Google sign-in. The web app shows a "view as" switcher listing everyone with an email,
  so each role can be tried locally. Without a choice, the first admin is used.

A Google account that is not in `people` (or is archived) gets a "not on the team list" page.

## Checks

```sh
npm run typecheck
TEST_DATABASE_URL=postgres://app:app@localhost:5432/schedule_test npm test   # schema tests reset that database
npm run build
```

Schema tests are skipped when `TEST_DATABASE_URL` is not set. Point it at a throwaway database: the tests drop and recreate its `public` schema.

## Deploy

`Dockerfile` builds one image that runs `node api/dist/index.js` on port 8080. Deployment to Cloud Run follows the setup guide.
