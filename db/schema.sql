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

-- Additions for richer event detail pages (registration window, course info)
ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_opens DATE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS course_image_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS yardage INTEGER;
ALTER TABLE events ADD COLUMN IF NOT EXISTS par INTEGER;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS course_image_url TEXT;
