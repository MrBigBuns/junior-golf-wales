-- Junior Golf Wales — core schema

CREATE TABLE IF NOT EXISTS clubs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  address TEXT,
  region TEXT CHECK (region IN ('North', 'Mid', 'South')),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  website TEXT,
  contact_email TEXT,
  junior_membership_contact TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organisers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  website TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  club_id INTEGER REFERENCES clubs(id),
  organiser_id INTEGER REFERENCES organisers(id),
  date_start DATE NOT NULL,
  date_end DATE,
  start_time TIME,
  age_category TEXT,
  age_cutoff_date DATE,
  gender TEXT CHECK (gender IN ('boys', 'girls', 'mixed')),
  format TEXT,
  holes INTEGER,
  junior_tees_note TEXT,
  entry_fee NUMERIC(6,2),
  entry_deadline DATE,
  accompanying_adult_required BOOLEAN DEFAULT false,
  organiser_contact TEXT,
  hcp_allowance_info TEXT,
  catering TEXT,
  prizes TEXT,
  meta_description TEXT,
  og_image_url TEXT,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,
  raw_data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  linked_event_id INTEGER REFERENCES events(id),
  submitted_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_date_start ON events(date_start);
CREATE INDEX IF NOT EXISTS idx_events_club_id ON events(club_id);
CREATE INDEX IF NOT EXISTS idx_clubs_region ON clubs(region);

CREATE TABLE IF NOT EXISTS event_updates (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_updates_event_id ON event_updates(event_id, created_at DESC);

-- Additions for richer event detail pages (registration window, course info)
ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_opens DATE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS course_image_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS yardage INTEGER;
ALTER TABLE events ADD COLUMN IF NOT EXISTS par INTEGER;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS course_image_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS scorecard JSONB;
ALTER TABLE events ADD COLUMN IF NOT EXISTS entry_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS entry_email TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS entry_phone TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS entry_fee_tiers JSONB;
ALTER TABLE events ADD COLUMN IF NOT EXISTS hcp_index_limit TEXT;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_gender_check;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS facebook_url TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS x_url TEXT;

CREATE TABLE IF NOT EXISTS club_users (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_club_users_email ON club_users(email);

CREATE TABLE IF NOT EXISTS event_forms (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Entry form',
  description TEXT,
  fields JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_form_submissions (
  id SERIAL PRIMARY KEY,
  event_form_id INTEGER NOT NULL REFERENCES event_forms(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_form_submissions_form ON event_form_submissions(event_form_id, submitted_at DESC);

-- Uploaded images stored directly in Postgres (small scale, avoids needing
-- a separate cloud storage service). If both an uploaded image and a URL
-- are set, the uploaded image takes priority — see views/admin/club-form.
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS logo_image BYTEA;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS logo_image_type TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS course_photo_image BYTEA;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS course_photo_image_type TEXT;

-- Scorecards live on the club (one card per course); an event's own
-- scorecard/yardage/par are optional overrides (e.g. a short course or a
-- different course at a multi-course venue). The event page falls back to
-- the club's values when the event has none.
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS scorecard JSONB;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS yardage INTEGER;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS par INTEGER;

-- One-off move (idempotent): copy the most recently updated event scorecard
-- up to its club where the club has none, then clear event values that just
-- duplicate the club's so they don't count as overrides.
UPDATE clubs c
   SET scorecard = src.scorecard,
       yardage   = COALESCE(c.yardage, src.yardage),
       par       = COALESCE(c.par, src.par)
  FROM (
    SELECT DISTINCT ON (club_id) club_id, scorecard, yardage, par
      FROM events
     WHERE scorecard IS NOT NULL AND jsonb_typeof(scorecard) = 'array'
     ORDER BY club_id, updated_at DESC
  ) src
 WHERE c.id = src.club_id
   AND (c.scorecard IS NULL OR jsonb_typeof(c.scorecard) <> 'array');

UPDATE events e SET scorecard = NULL FROM clubs c
 WHERE c.id = e.club_id AND e.scorecard IS NOT NULL
   AND (jsonb_typeof(e.scorecard) <> 'array' OR e.scorecard = c.scorecard);
UPDATE events e SET yardage = NULL FROM clubs c
 WHERE c.id = e.club_id AND e.yardage IS NOT NULL AND e.yardage = c.yardage;
UPDATE events e SET par = NULL FROM clubs c
 WHERE c.id = e.club_id AND e.par IS NOT NULL AND e.par = c.par;

-- Proposed club details gathered by scripts/enrich-clubs.js. Nothing here is
-- live until accepted field-by-field at /admin/club-suggestions.
CREATE TABLE IF NOT EXISTS club_suggestions (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  sources JSONB,
  warnings JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_club_suggestions_status ON club_suggestions(status, created_at);
