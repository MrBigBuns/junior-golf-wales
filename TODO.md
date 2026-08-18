# TODO — Event registration forms (clubs host via us)

Idea: let clubs create/host their event entry forms through Junior Golf Wales
instead of cobbling together a Google Form each season. Possible ~£10/year
per club. NOT STARTED — scoping only so far.

## Before building anything registration-related

- [x] Add authentication to /admin — done: HTTP Basic Auth via ADMIN_USER /
      ADMIN_PASSWORD env vars (lib/adminAuth.js). Still worth reviewing
      before real personal data is collected — Basic Auth is fine for a
      single admin, less so for multiple staff or an audit trail.
- [ ] Write a short privacy policy: what's collected, why, how long it's
      kept, who to contact. Link it from any entry form.
- [ ] Check ICO registration requirement (UK data controller) — small fee,
      check exemptions.
- [ ] Review UK GDPR + ICO Children's Code (Age Appropriate Design Code) —
      applies since this is a service likely used by under-18s.

## Data minimization

- [ ] Decide actual field list per entry — do we need full DOB, or does an
      age-band / "born after X" checkbox cover eligibility with less
      sensitive data stored?
- [ ] Don't collect anything the club doesn't need to run the competition.

## Retention

- [ ] Build a scheduled purge job — entries auto-delete N days after the
      event date (proposed: 30 days). Not a manual step.
- [ ] Give the club a one-time CSV export of entrants before purge, if
      they want a record for their own files.
- [ ] Document the retention period in the privacy policy.

## Build scope (once the above is in place)

- [ ] v1: structured entry form per event (name, email, home club,
      handicap/category) — entries land in DB, club gets CSV export. No
      payments yet.
- [ ] v2 (separate, later): payment collection via Stripe — treat as its
      own project given refunds/disputes/reconciliation complexity.
- [ ] Pricing: maybe free for basic forms, paid tier once payment
      collection is added — decide later, don't lock in now.
