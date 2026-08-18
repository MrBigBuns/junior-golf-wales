const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const asyncHandler = require('../lib/asyncHandler');

router.get('/', asyncHandler(async (req, res) => {
  const [eventsCount, clubsCount, toursCount, thisMonthCount, nextUp, regionCounts, ageCategories] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM events WHERE date_start >= CURRENT_DATE AND status != 'cancelled'`),
    pool.query(`SELECT COUNT(*) FROM clubs`),
    pool.query(`SELECT COUNT(*) FROM organisers`),
    pool.query(`SELECT COUNT(*) FROM events WHERE date_start >= CURRENT_DATE AND date_start < (date_trunc('month', CURRENT_DATE) + interval '1 month') AND status != 'cancelled'`),
    pool.query(
      `SELECT e.*, c.name AS club_name, c.region
       FROM events e JOIN clubs c ON c.id = e.club_id
       WHERE e.date_start >= CURRENT_DATE AND e.status != 'cancelled'
       ORDER BY e.date_start ASC LIMIT 3`
    ),
    pool.query(
      `SELECT c.region, COUNT(e.id) AS upcoming_count
       FROM clubs c LEFT JOIN events e ON e.club_id = c.id AND e.date_start >= CURRENT_DATE AND e.status != 'cancelled'
       WHERE c.region IS NOT NULL
       GROUP BY c.region`
    ),
    pool.query(
      `SELECT DISTINCT age_category FROM events
       WHERE age_category IS NOT NULL AND date_start >= CURRENT_DATE
       ORDER BY age_category ASC LIMIT 8`
    )
  ]);

  const regionMap = { North: 0, Mid: 0, South: 0 };
  regionCounts.rows.forEach(r => { regionMap[r.region] = parseInt(r.upcoming_count, 10); });

  res.render('home/index', {
    stats: {
      upcoming: eventsCount.rows[0].count,
      clubs: clubsCount.rows[0].count,
      tours: toursCount.rows[0].count,
      thisMonth: thisMonthCount.rows[0].count
    },
    nextUp: nextUp.rows,
    regionCounts: regionMap,
    ageCategories: ageCategories.rows.map(r => r.age_category)
  });
}));

module.exports = router;
