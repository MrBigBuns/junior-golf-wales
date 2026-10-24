const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const asyncHandler = require('../lib/asyncHandler');
const { buildPlanner } = require('../lib/planner');

// GET /planner — pick dates, say who is playing, see the events that fit
router.get('/', asyncHandler(async (req, res) => {
  const data = await buildPlanner(pool, req.query);
  res.render('planner/index', { ...data, rawQuery: req.query });
}));

// GET /planner/plan.ics?ids=1,2,3 — the planned events as one calendar file
router.get('/plan.ics', asyncHandler(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(n => parseInt(n, 10)).filter(n => n > 0).slice(0, 30);
  if (!ids.length) return res.status(400).send('No events chosen');
  const { rows } = await pool.query(
    `SELECT e.id, e.slug, e.title, e.date_start, e.format, c.name AS club_name, c.address
     FROM events e JOIN clubs c ON c.id = e.club_id
     WHERE e.id = ANY($1::int[]) ORDER BY e.date_start`,
    [ids]
  );
  if (!rows.length) return res.status(404).send('Events not found');

  const escapeIcs = (s) => (s || '').replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const host = require('../lib/site').SITE_URL;
  const events = rows.map(e => {
    const day = new Date(e.date_start).toISOString().slice(0, 10);
    const next = new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10);
    return [
      'BEGIN:VEVENT',
      `UID:${e.slug}@junior-golf-wales.onrender.com`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;VALUE=DATE:${day.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${next.replace(/-/g, '')}`,
      `SUMMARY:${escapeIcs(e.title + ' at ' + e.club_name)}`,
      `LOCATION:${escapeIcs(e.club_name + (e.address ? ', ' + e.address : ''))}`,
      `DESCRIPTION:${escapeIcs([e.format, host + '/events/' + e.slug].filter(Boolean).join(' - '))}`,
      'END:VEVENT'
    ].join('\r\n');
  });
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wales Junior Golf//EN', ...events, 'END:VCALENDAR'].join('\r\n');
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="junior-golf-plan.ics"');
  res.send(ics);
}));

module.exports = router;
