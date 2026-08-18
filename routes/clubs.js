const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.get('/', async (req, res) => {
  const { rows: clubs } = await pool.query(
    `SELECT c.id, c.name, c.slug, c.region, c.course_image_url,
            COUNT(e.id) FILTER (WHERE e.date_start >= CURRENT_DATE) AS upcoming_count
     FROM clubs c
     LEFT JOIN events e ON e.club_id = c.id
     GROUP BY c.id
     ORDER BY c.name ASC`
  );
  res.render('clubs/index', { clubs });
});

router.get('/:slug', async (req, res) => {
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
});

module.exports = router;
