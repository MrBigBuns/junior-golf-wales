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

router.get('/:id/logo-image', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT logo_image, logo_image_type FROM clubs WHERE id = $1`, [req.params.id]);
  if (!rows.length || !rows[0].logo_image) return res.status(404).send('Not found');
  res.set('Content-Type', rows[0].logo_image_type || 'image/jpeg');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(rows[0].logo_image);
}));

router.get('/:id/course-photo-image', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT course_photo_image, course_photo_image_type FROM clubs WHERE id = $1`, [req.params.id]);
  if (!rows.length || !rows[0].course_photo_image) return res.status(404).send('Not found');
  res.set('Content-Type', rows[0].course_photo_image_type || 'image/jpeg');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(rows[0].course_photo_image);
}));

router.get('/:slug', asyncHandler(async (req, res) => {
  const { rows: clubRows } = await pool.query(
    `SELECT id, name, slug, address, region, lat, lng, website, contact_email,
            junior_membership_contact, logo_url, description, course_image_url,
            facebook_url, instagram_url, x_url,
            (logo_image IS NOT NULL) AS has_logo_image,
            (course_photo_image IS NOT NULL) AS has_course_photo_image
     FROM clubs WHERE slug = $1`,
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
