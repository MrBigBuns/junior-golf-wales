const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.get('/', async (req, res) => {
  const [eventsCount, clubsCount, toursCount, thisMonthCount, nextUp] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM events WHERE date_start >= CURRENT_DATE AND status != 'cancelled'`),
    pool.query(`SELECT COUNT(*) FROM clubs`),
    pool.query(`SELECT COUNT(*) FROM organisers`),
    pool.query(`SELECT COUNT(*) FROM events WHERE date_start >= CURRENT_DATE AND date_start < (date_trunc('month', CURRENT_DATE) + interval '1 month') AND status != 'cancelled'`),
    pool.query(
      `SELECT e.*, c.name AS club_name, c.region
       FROM events e JOIN clubs c ON c.id = e.club_id
       WHERE e.date_start >= CURRENT_DATE AND e.status != 'cancelled'
       ORDER BY e.date_start ASC LIMIT 3`
    )
  ]);

  res.render('home/index', {
    stats: {
      upcoming: eventsCount.rows[0].count,
      clubs: clubsCount.rows[0].count,
      tours: toursCount.rows[0].count,
      thisMonth: thisMonthCount.rows[0].count
    },
    nextUp: nextUp.rows
  });
});

module.exports = router;
