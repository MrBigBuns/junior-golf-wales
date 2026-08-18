const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const asyncHandler = require('../lib/asyncHandler');

router.get('/', asyncHandler(async (req, res) => {
  const { rows: clubs } = await pool.query(
    `SELECT c.id, c.name, c.slug, c.region, c.course_image_url,
            COUNT(e.id) FILTER (WHERE e.date_start >= CURRENT_DATE) AS upcoming_count
     FROM clubs c
     LEFT JOIN events e ON e.club_id = c.id
     GROUP BY c.id
     ORDER BY
       CASE c.region WHEN 'North' THEN 1 WHEN 'Mid' THEN 2 WHEN 'South' THEN 3 ELSE 4 END,
       c.name ASC`
  );

  const grouped = {};
  clubs.forEach(c => {
    const key = c.region || 'Other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  });

  res.render('clubs/index', { grouped });
}));

router.get('/:slug', asyncHandler(async (req, res) => {
  const { rows: clubRows } = await pool.query(
    `SELECT * FROM clubs WHERE slug = $1`,
    [req.params.slug]
  );

  if (!clubRows.length) return res.status(404).render('404');
  const club = clubRows[0];

  const { rows: events } = await pool.query(
    `SELECT slug, title, date_start, entry_fee FROM events
     WHERE club_id = $1 AND date_start >= CURRENT_DATE
     ORDER BY date_start ASC`,
    [club.id]
  );

  res.render('clubs/show', { club, events });
}));

module.exports = router;
