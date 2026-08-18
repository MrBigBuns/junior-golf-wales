const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const asyncHandler = require('../lib/asyncHandler');
const { getForecastForDate } = require('../lib/weather');

// GET /events — filterable list
router.get('/', asyncHandler(async (req, res) => {
  const { region, age, q } = req.query;
  const conditions = ["e.date_start >= CURRENT_DATE", "e.status != 'cancelled'"];
  const params = [];

  if (region) {
    params.push(region);
    conditions.push(`c.region = $${params.length}`);
  }
  if (age) {
    params.push(age);
    conditions.push(`e.age_category = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    conditions.push(`(e.title ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
  }

  const { rows: events } = await pool.query(
    `SELECT e.*, c.name AS club_name, c.slug AS club_slug, c.region
     FROM events e
     JOIN clubs c ON c.id = e.club_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE c.region WHEN 'North' THEN 1 WHEN 'Mid' THEN 2 WHEN 'South' THEN 3 ELSE 4 END,
       e.date_start ASC,
       e.title ASC
     LIMIT 100`,
    params
  );

  const grouped = {};
  events.forEach(e => {
    const key = e.region || 'Other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  });

  res.render('events/index', { grouped, totalCount: events.length, region, age, q });
}));

// GET /events/:slug — detail page
router.get('/:slug', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT e.*, c.name AS club_name, c.slug AS club_slug, c.address, c.region,
            c.website AS club_website, c.course_image_url AS club_course_image_url,
            c.description AS club_description, c.lat AS club_lat, c.lng AS club_lng,
            c.facebook_url AS club_facebook_url, c.instagram_url AS club_instagram_url, c.x_url AS club_x_url,
            o.name AS organiser_name, o.slug AS organiser_slug, o.description AS organiser_description
     FROM events e
     JOIN clubs c ON c.id = e.club_id
     LEFT JOIN organisers o ON o.id = e.organiser_id
     WHERE e.slug = $1`,
    [req.params.slug]
  );

  if (!rows.length) return res.status(404).render('404');

  const event = rows[0];
  event.directions_url = event.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.club_name + ', ' + event.address)}`
    : null;

  event.nearby_hotels_url = event.address
    ? `https://www.google.com/maps/search/hotels+near+${encodeURIComponent(event.address)}`
    : null;
  event.nearby_things_url = event.address
    ? `https://www.google.com/maps/search/things+to+do+near+${encodeURIComponent(event.address)}`
    : null;

  const weather = await getForecastForDate(event.club_lat, event.club_lng, event.date_start);
  const daysUntil = Math.round((new Date(event.date_start) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  event.weather = weather;
  event.weatherPending = !weather && daysUntil >= 0;

  const { rows: otherAtClub } = await pool.query(
    `SELECT slug, title, date_start FROM events
     WHERE club_id = $1 AND slug != $2 AND date_start >= CURRENT_DATE
     ORDER BY date_start ASC LIMIT 4`,
    [event.club_id, event.slug]
  );

  const { rows: updates } = await pool.query(
    `SELECT message, created_at FROM event_updates
     WHERE event_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [event.id]
  );

  res.render('events/show', { event, otherAtClub, updates });
}));

// GET /events/:slug/calendar.ics — downloadable calendar invite
router.get('/:slug/calendar.ics', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT e.title, e.date_start, e.format, e.entry_fee, c.name AS club_name, c.address
     FROM events e JOIN clubs c ON c.id = e.club_id
     WHERE e.slug = $1`,
    [req.params.slug]
  );
  if (!rows.length) return res.status(404).send('Event not found');

  const e = rows[0];
  const dateStr = new Date(e.date_start).toISOString().slice(0, 10).replace(/-/g, '');
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const escapeIcs = (s) => (s || '').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');

  const description = [e.format, e.entry_fee ? `Entry fee: £${e.entry_fee}` : null]
    .filter(Boolean).join(' — ');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Junior Golf Wales//EN',
    'BEGIN:VEVENT',
    `UID:${req.params.slug}@junior-golf-wales.onrender.com`,
    `DTSTAMP:${nowStamp}`,
    `DTSTART;VALUE=DATE:${dateStr}`,
    `SUMMARY:${escapeIcs(e.title + ' at ' + e.club_name)}`,
    `LOCATION:${escapeIcs(e.club_name + (e.address ? ', ' + e.address : ''))}`,
    description ? `DESCRIPTION:${escapeIcs(description)}` : null,
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');

  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${req.params.slug}.ics"`);
  res.send(ics);
}));

module.exports = router;
