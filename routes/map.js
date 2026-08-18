const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const asyncHandler = require('../lib/asyncHandler');

router.get('/', asyncHandler(async (req, res) => {
  const { rows: events } = await pool.query(
    `SELECT e.slug, e.title, e.date_start, c.name AS club_name, c.lat, c.lng, c.region
     FROM events e JOIN clubs c ON c.id = e.club_id
     WHERE e.date_start >= CURRENT_DATE AND e.status != 'cancelled'
       AND c.lat IS NOT NULL AND c.lng IS NOT NULL
     ORDER BY e.date_start ASC`
  );

  const { rows: missingCount } = await pool.query(
    `SELECT COUNT(*) FROM events e JOIN clubs c ON c.id = e.club_id
     WHERE e.date_start >= CURRENT_DATE AND e.status != 'cancelled'
       AND (c.lat IS NULL OR c.lng IS NULL)`
  );

  res.render('map', { events, missingCount: missingCount[0].count });
}));

module.exports = router;
