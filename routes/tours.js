const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.get('/:slug', async (req, res) => {
  const { rows: orgRows } = await pool.query(`SELECT * FROM organisers WHERE slug = $1`, [req.params.slug]);
  if (!orgRows.length) return res.status(404).render('404');
  const organiser = orgRows[0];

  const { rows: events } = await pool.query(
    `SELECT e.slug, e.title, e.date_start, c.name AS club_name FROM events e
     JOIN clubs c ON c.id = e.club_id
     WHERE e.organiser_id = $1 AND e.date_start >= CURRENT_DATE
     ORDER BY e.date_start ASC`,
    [organiser.id]
  );

  res.render('tours/show', { organiser, events });
});

module.exports = router;
