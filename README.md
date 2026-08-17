# Junior Golf Wales

Every junior golf event in Wales, in one place. Node/Express/Postgres, deployed
on Render.

## Local setup

```
npm install
cp .env.example .env      # then point DATABASE_URL at your local Postgres
npm run migrate           # creates tables
cp ../wales-junior-golf/events_seed.csv data/events_seed.csv
npm run seed               # loads starter events
npm run dev
```

Visit http://localhost:3000

## Project structure

```
server.js          entry point
routes/             events, clubs, submit-event
views/              EJS templates
public/css/         stylesheet
db/schema.sql       table definitions
db/migrate.js       applies schema.sql
scripts/seed.js     loads data/events_seed.csv
```

## Deploying to Render

1. Push this repo to GitHub
2. In Render, New > Blueprint, point at the repo — render.yaml provisions the
   web service and a free Postgres database automatically
3. After first deploy, run the migration once via Render's shell:
   `npm run migrate`
4. Seed starter data the same way, or use the submission form once live

## Status

v1 scaffold — events, clubs, and submission form are wired up against
Postgres. Not yet built: alerts, distance search, calendar export, sponsored
listings — see ROADMAP.md from the planning phase for the full sequence.

Seed data (data/events_seed.csv) is hand-verified from public listings —
confirm dates/fees before publishing anything live.
