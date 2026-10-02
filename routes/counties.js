// County landing pages: "junior golf opens in Glamorgan 2027" and similar.
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const asyncHandler = require('../lib/asyncHandler');
const { COUNTIES, countyBySlug } = require('../lib/site');

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.county,
            COUNT(DISTINCT c.id)::int AS clubs,
            COUNT(e.id) FILTER (WHERE e.date_start >= CURRENT_DATE AND e.status != 'cancelled')::int AS upcoming
     FROM clubs c LEFT JOIN events e ON e.club_id = c.id
     WHERE c.archived_at IS NULL AND c.county IS NOT NULL
     GROUP BY c.county`
  );
  const counts = Object.fromEntries(rows.map(r => [r.county, r]));
  res.render('counties/index', { counts });
}));

router.get('/:slug', asyncHandler(async (req, res) => {
  const county = countyBySlug(req.params.slug);
  if (!county) return res.status(404).render('404');

  const [{ rows: events }, { rows: clubs }] = await Promise.all([
    pool.query(
      `SELECT e.slug, e.title, e.date_start, e.entry_fee, e.age_category, e.status,
              c.name AS club_name, c.slug AS club_slug, o.name AS organiser_name
       FROM events e JOIN clubs c ON c.id = e.club_id
       LEFT JOIN organisers o ON o.id = e.organiser_id
       WHERE c.county = $1 AND e.date_start >= CURRENT_DATE AND e.status != 'cancelled'
       ORDER BY e.date_start ASC`,
      [county.name]
    ),
    pool.query(
      `SELECT c.name, c.slug, c.par, c.yardage,
              (c.scorecard IS NOT NULL AND jsonb_typeof(c.scorecard) = 'array') AS has_scorecard,
              (SELECT COUNT(*) FROM events e WHERE e.club_id = c.id AND e.date_start >= CURRENT_DATE AND e.status != 'cancelled')::int AS upcoming
       FROM clubs c
       WHERE c.county = $1 AND c.archived_at IS NULL
       ORDER BY c.name`,
      [county.name]
    )
  ]);

  res.render('counties/show', { county, events, clubs, others: COUNTIES.filter(c => c.slug !== county.slug) });
}));

module.exports = router;
