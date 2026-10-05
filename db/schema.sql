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

-- Removed clubs are archived, not deleted: hidden from public lists, portal
-- sign-up and enrichment, but kept so past events still resolve and the
-- club-list script doesn't re-add them. Restorable from admin.
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS archived_reason TEXT;

-- Golf county (Glamorgan, Gwent, Dyfed, Powys, Gwynedd, Clwyd) for county
-- pages and filters. Known clubs are filled in below; only empty values are
-- set, so edits made in admin are never overwritten.
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS county TEXT;
CREATE INDEX IF NOT EXISTS idx_clubs_county ON clubs(county);

UPDATE clubs c SET county = m.county
FROM (VALUES
  ('tenby-golf-club','Dyfed'),('trefloyne-golf-club','Dyfed'),('south-pembrokeshire-golf-club','Dyfed'),
  ('haverfordwest-golf-club','Dyfed'),('milford-haven-golf-club','Dyfed'),('st-davids-city-golf-club','Dyfed'),
  ('newport-links-golf-club','Dyfed'),('cardigan-golf-club','Dyfed'),('ashburnham-golf-club','Dyfed'),
  ('machynys-peninsula-golf-club','Dyfed'),('carmarthen-golf-club','Dyfed'),('derllys-court-golf-club','Dyfed'),
  ('garnant-park-golf-club','Dyfed'),('glynhir-golf-club','Dyfed'),('glyn-abbey-golf-club','Dyfed'),
  ('penrhos-park-golf-club','Dyfed'),
  ('pennard-golf-club','Glamorgan'),('langland-bay-golf-club','Glamorgan'),('clyne-golf-club','Glamorgan'),
  ('fairwood-park-golf-club','Glamorgan'),('gower-golf-club','Glamorgan'),('morriston-golf-club','Glamorgan'),
  ('pontardulais-golf-club','Glamorgan'),('mond-valley-golf-club','Glamorgan'),('neath-golf-club','Glamorgan'),
  ('swansea-bay-golf-club','Glamorgan'),('lakeside-margam-golf-club','Glamorgan'),('glynneath-golf-club','Glamorgan'),
  ('pontardawe-golf-club','Glamorgan'),('royal-porthcawl-golf-club','Glamorgan'),('pyle-and-kenfig-golf-club','Glamorgan'),
  ('southerndown-golf-club','Glamorgan'),('grove-golf-club','Glamorgan'),('maesteg-golf-club','Glamorgan'),
  ('coed-y-mwstwr-golf-club','Glamorgan'),('llantrisant-and-pontyclun-golf-club','Glamorgan'),
  ('pontypridd-golf-club','Glamorgan'),('rhondda-golf-club','Glamorgan'),('aberdare-golf-club','Glamorgan'),
  ('mountain-ash-golf-club','Glamorgan'),('morlais-castle-golf-club','Glamorgan'),('cardiff-golf-club','Glamorgan'),
  ('whitchurch-golf-club','Glamorgan'),('radyr-golf-club','Glamorgan'),('llanishen-golf-club','Glamorgan'),
  ('creigiau-golf-club','Glamorgan'),('st-mellons-golf-club','Glamorgan'),('peterstone-lakes-golf-club','Glamorgan'),
  ('vale-resort','Glamorgan'),('cottrell-park-golf-club','Glamorgan'),('wenvoe-castle-golf-club','Glamorgan'),
  ('dinas-powis-golf-club','Glamorgan'),('glamorganshire-golf-club','Glamorgan'),('brynhill-golf-club','Glamorgan'),
  ('st-andrews-major-golf-club','Glamorgan'),('st-athan-golf-club','Glamorgan'),('caerphilly-golf-club','Glamorgan'),
  ('ridgeway-golf-club','Glamorgan'),('virginia-park-golf-club','Glamorgan'),('bargoed-golf-club','Glamorgan'),
  ('bryn-meadows-golf-club','Gwent'),('blackwood-golf-club','Gwent'),('pontypool-golf-club','Gwent'),
  ('pontnewydd-golf-club','Gwent'),('greenmeadow-golf-club','Gwent'),('west-monmouthshire-golf-club','Gwent'),
  ('celtic-manor-resort','Gwent'),('newport-golf-club','Gwent'),('llanwern-golf-club','Gwent'),
  ('parc-golf-club','Gwent'),('tredegar-park-golf-club','Gwent'),('st-pierre-golf-and-country-club','Gwent'),
  ('dewstow-golf-club','Gwent'),('monmouth-golf-club','Gwent'),('monmouthshire-golf-club','Gwent'),
  ('rolls-of-monmouth-golf-club','Gwent'),('raglan-parc-golf-club','Gwent'),('wernddu-golf-club','Gwent'),
  ('woodlake-park-golf-club','Gwent'),('alice-springs-golf-club','Gwent'),
  ('builth-wells-golf-club','Powys'),
  ('conwy-golf-club','Gwynedd'),('llandudno-maesdu-golf-club','Gwynedd'),('royal-st-david-s-golf-club','Gwynedd'),
  ('caernarfon-golf-club','Gwynedd'),
  ('abergele-golf-club','Clwyd'),('st-melyd-golf-club','Clwyd'),('vale-of-llangollen-golf-club','Clwyd'),
  ('wrexham-golf-club','Clwyd'),('padeswood-and-buckley-golf-club','Clwyd')
) AS m(slug, county)
WHERE c.slug = m.slug AND c.county IS NULL;

-- Number of holes on the club's main course (9, 18, 27...). Par and yardage
-- describe one round of the course as built, so a 9-hole course stores its
-- 9-hole figures; the pages show the 18-hole (twice round) equivalent too.
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS holes INTEGER;
-- CASE guarantees the type check runs before the length (WHERE order isn't guaranteed)
UPDATE clubs SET holes = jsonb_array_length(scorecard)
 WHERE holes IS NULL
   AND (CASE WHEN jsonb_typeof(scorecard) = 'array' THEN jsonb_array_length(scorecard) ELSE 0 END) IN (9, 18);

-- Multi-course venues. A club's MAIN course stays on the club record (holes,
-- par, yardage, scorecard; named by main_course_name, e.g. "Twenty Ten"), so
-- single-course clubs need nothing here. Each ADDITIONAL course at the venue
-- (a second 18, a 9-hole academy, a par-3) is a row in club_courses.
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS main_course_name TEXT;

CREATE TABLE IF NOT EXISTS club_courses (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  holes INTEGER,
  par INTEGER,
  yardage INTEGER,
  scorecard JSONB,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_club_courses_club ON club_courses(club_id, sort_order);

-- Which course an event is played on: NULL = the club's main course.
ALTER TABLE events ADD COLUMN IF NOT EXISTS course_id INTEGER REFERENCES club_courses(id) ON DELETE SET NULL;

-- Links to a club's own open competitions page (or its booking system's
-- opens listing, e.g. BRS) and its junior golf page. Found by
-- scripts/find-club-links.js and reviewed at /admin/club-suggestions.
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS opens_url TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS juniors_url TEXT;

-- Weekly watch of clubs' open competitions and junior pages
-- (scripts/watch-club-pages.js). page_watch holds the last-seen relevant
-- lines of each page; page_changes records what was added/removed.
CREATE TABLE IF NOT EXISTS page_watch (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('opens', 'juniors')),
  url TEXT NOT NULL,
  lines JSONB,
  checked_at TIMESTAMPTZ,
  changed_at TIMESTAMPTZ,
  last_error TEXT,
  UNIQUE (club_id, kind)
);

CREATE TABLE IF NOT EXISTS page_changes (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  added JSONB NOT NULL DEFAULT '[]',
  removed JSONB NOT NULL DEFAULT '[]',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_page_changes_unseen ON page_changes(detected_at) WHERE seen_at IS NULL;
