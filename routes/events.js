const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /events — filterable list
router.get('/', async (req, res) => {
  const { region, age } = req.query;
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

  const { rows: events } = await pool.query(
    `SELECT e.*, c.name AS club_name, c.slug AS club_slug, c.region
     FROM events e
     JOIN clubs c ON c.id = e.club_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY e.date_start ASC
     LIMIT 100`,
    params
  );

  res.render('events/index', { events, region, age });
});

// GET /events/:slug — detail page
router.get('/:slug', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT e.*, c.name AS club_name, c.slug AS club_slug, c.address, c.region,
            c.website AS club_website, c.course_image_url AS club_course_image_url,
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

  const { rows: otherAtClub } = await pool.query(
    `SELECT slug, title, date_start FROM events
     WHERE club_id = $1 AND slug != $2 AND date_start >= CURRENT_DATE
     ORDER BY date_start ASC LIMIT 4`,
    [event.club_id, event.slug]
  );

  res.render('events/show', { event, otherAtClub });
});

module.exports = router;
