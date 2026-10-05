const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const asyncHandler = require('../lib/asyncHandler');
const { getForecastForDate } = require('../lib/weather');
const { SITE_URL, countyByName } = require('../lib/site');
const { courseFigures } = require('../lib/courses');

router.get('/', asyncHandler(async (req, res) => {
  const nineOnly = req.query.holes === '9';
  const { rows: clubs } = await pool.query(
    `SELECT c.id, c.name, c.slug, c.region, c.county, c.course_image_url, c.holes,
            (SELECT COUNT(*) FROM club_courses cc WHERE cc.club_id = c.id)::int + 1 AS course_count,
            COUNT(e.id) FILTER (WHERE e.date_start >= CURRENT_DATE) AS upcoming_count
     FROM clubs c
     LEFT JOIN events e ON e.club_id = c.id
     WHERE c.archived_at IS NULL ${nineOnly ? 'AND c.holes = 9' : ''}
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

  res.render('clubs/index', { grouped, nineOnly, total: clubs.length });
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
    `SELECT id, name, slug, address, region, county, holes, lat, lng, website, contact_email, opens_url, juniors_url,
            junior_membership_contact, logo_url, description, course_image_url,
            facebook_url, instagram_url, x_url, scorecard, par, yardage, archived_at, archived_reason, main_course_name,
            (logo_image IS NOT NULL) AS has_logo_image,
            (course_photo_image IS NOT NULL) AS has_course_photo_image
     FROM clubs WHERE slug = $1`,
    [req.params.slug]
  );

  if (!clubRows.length) return res.status(404).render('404');
  const club = clubRows[0];

  // Images: uploaded files win over URLs (e.g. a logo accepted from enrichment)
  club.logo_src = club.has_logo_image ? `/clubs/${club.id}/logo-image` : (club.logo_url || null);
  club.banner_src = club.has_course_photo_image ? `/clubs/${club.id}/course-photo-image` : (club.course_image_url || null);

  // Course at a glance: the main course's figures live on the club record
  Object.assign(club, courseFigures(club));

  // Additional courses at the venue (a second 18, an academy, a par-3)
  const { rows: extraCourses } = await pool.query(
    `SELECT id, name, slug, holes, par, yardage, scorecard, description
     FROM club_courses WHERE club_id = $1 ORDER BY sort_order, name`,
    [club.id]
  );
  club.courses = extraCourses.length
    ? [
        { name: club.main_course_name || 'Main course', main: true, url: '#scorecard', ...courseFigures(club) },
        ...extraCourses.map(cc => ({ name: cc.name, url: `/clubs/${club.slug}/${cc.slug}`, description: cc.description, ...courseFigures(cc) }))
      ]
    : [];

  const placeQuery = club.lat != null ? `${club.lat},${club.lng}` : (club.address ? `${club.name}, ${club.address}` : null);
  club.directions_url = placeQuery
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(club.address ? club.name + ', ' + club.address : placeQuery)}`
    : null;
  club.map_embed_url = placeQuery
    ? `https://www.google.com/maps?q=${encodeURIComponent(club.address ? club.name + ', ' + club.address : placeQuery)}&output=embed`
    : null;
  club.nearby_hotels_url = club.address ? `https://www.google.com/maps/search/hotels+near+${encodeURIComponent(club.address)}` : null;
  club.nearby_things_url = club.address ? `https://www.google.com/maps/search/things+to+do+near+${encodeURIComponent(club.address)}` : null;

  const [{ rows: events }, { rows: pastEvents }, { rows: nearbyClubs }] = await Promise.all([
    pool.query(
      `SELECT e.slug, e.title, e.date_start, e.entry_fee, e.status, e.age_category, o.name AS organiser_name
       FROM events e LEFT JOIN organisers o ON o.id = e.organiser_id
       WHERE e.club_id = $1 AND e.date_start >= CURRENT_DATE
       ORDER BY e.date_start ASC`,
      [club.id]
    ),
    pool.query(
      `SELECT slug, title, date_start FROM events
       WHERE club_id = $1 AND date_start < CURRENT_DATE AND date_start >= CURRENT_DATE - INTERVAL '2 years'
       ORDER BY date_start DESC LIMIT 6`,
      [club.id]
    ),
    club.lat != null
      ? pool.query(
          `SELECT c.name, c.slug, c.region,
                  ROUND((3958.8 * 2 * ASIN(SQRT(
                    POWER(SIN(RADIANS(c.lat - $1) / 2), 2) +
                    COS(RADIANS($1)) * COS(RADIANS(c.lat)) * POWER(SIN(RADIANS(c.lng - $2) / 2), 2)
                  )))::numeric, 1) AS miles,
                  (SELECT COUNT(*) FROM events e WHERE e.club_id = c.id AND e.date_start >= CURRENT_DATE)::int AS upcoming
           FROM clubs c
           WHERE c.id <> $3 AND c.lat IS NOT NULL AND c.archived_at IS NULL
           ORDER BY miles ASC LIMIT 6`,
          [club.lat, club.lng, club.id]
        )
      : Promise.resolve({ rows: [] })
  ]);

  // Today's conditions at the course (Open-Meteo; null on any failure)
  let weather = null;
  if (club.lat != null && !club.archived_at) {
    try { weather = await getForecastForDate(club.lat, club.lng, new Date().toISOString().slice(0, 10)); } catch (e) { weather = null; }
  }

  // Structured data so search engines can show the club as a place
  const sameAs = [club.website, club.facebook_url, club.instagram_url, club.x_url].filter(Boolean);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'GolfCourse',
    name: club.name,
    url: `${SITE_URL}/clubs/${club.slug}`
  };
  if (club.description) ld.description = club.description;
  if (club.address) ld.address = { '@type': 'PostalAddress', streetAddress: club.address, addressRegion: club.county || `${club.region} Wales`, addressCountry: 'GB' };
  if (club.lat != null) ld.geo = { '@type': 'GeoCoordinates', latitude: Number(club.lat), longitude: Number(club.lng) };
  if (club.contact_email) ld.email = club.contact_email;
  if (sameAs.length) ld.sameAs = sameAs;
  if (club.logo_src && /^https?:/.test(club.logo_src)) ld.logo = club.logo_src;
  const jsonLd = JSON.stringify(ld).replace(/</g, '\\u003c');

  const metaParts = [`${club.name} — golf club in ${club.county ? club.county + ', ' : ''}${club.region} Wales`];
  if (club.holes) metaParts.push(`${club.holes} holes${club.par ? ', par ' + club.par : ''}${club.yardage ? ', ' + club.yardage + ' yards' : ''}`);
  if (events.length) metaParts.push(`${events.length} upcoming junior event${events.length === 1 ? '' : 's'}`);
  const has = [];
  if (club.address) has.push('address and map');
  if (club.website || club.contact_email) has.push('contact details');
  if (club.holes) has.push('course scorecard');
  const clip = (t, n) => t.length <= n ? t : t.slice(0, t.lastIndexOf(' ', n - 1)).replace(/[,.;:\s]+$/, '') + '…';
  const pageDescription = club.description
    ? clip(club.description, 155)
    : metaParts.join('. ') + '.' + (has.length ? ' ' + has.join(', ').replace(/^./, c => c.toUpperCase()) + '.' : '');

  const county = club.county ? countyByName(club.county) : null;
  res.render('clubs/show', { club, events, pastEvents, nearbyClubs, weather, jsonLd, pageDescription, countySlug: county ? county.slug : null });
}));

// A course at a multi-course venue: /clubs/celtic-manor-resort/roman-road
// (registered after the /:id/... image routes so those keep working)
router.get('/:slug/:courseSlug', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT cc.*, c.id AS club_id, c.name AS club_name, c.slug AS club_slug, c.region, c.county,
            c.address, c.lat, c.lng, c.website, c.archived_at, c.main_course_name,
            c.holes AS main_holes, c.par AS main_par, c.yardage AS main_yardage, c.scorecard AS main_scorecard
     FROM club_courses cc JOIN clubs c ON c.id = cc.club_id
     WHERE c.slug = $1 AND cc.slug = $2`,
    [req.params.slug, req.params.courseSlug]
  );
  if (!rows.length) return res.status(404).render('404');
  const r = rows[0];
  const course = { id: r.id, name: r.name, slug: r.slug, description: r.description, ...courseFigures(r) };
  const club = {
    id: r.club_id, name: r.club_name, slug: r.club_slug, region: r.region, county: r.county,
    address: r.address, website: r.website, archived_at: r.archived_at
  };
  club.directions_url = r.address
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(r.club_name + ', ' + r.address)}`
    : null;

  const [{ rows: siblings }, { rows: events }] = await Promise.all([
    pool.query(`SELECT name, slug, holes, par, yardage, scorecard FROM club_courses
                WHERE club_id = $1 AND id <> $2 ORDER BY sort_order, name`, [r.club_id, r.id]),
    pool.query(`SELECT slug, title, date_start, entry_fee, age_category FROM events
                WHERE course_id = $1 AND date_start >= CURRENT_DATE AND status != 'cancelled'
                ORDER BY date_start`, [r.id])
  ]);
  const otherCourses = [
    { name: r.main_course_name || 'Main course', url: `/clubs/${r.club_slug}#scorecard`,
      ...courseFigures({ holes: r.main_holes, par: r.main_par, yardage: r.main_yardage, scorecard: r.main_scorecard }) },
    ...siblings.map(o => ({ name: o.name, url: `/clubs/${r.club_slug}/${o.slug}`, ...courseFigures(o) }))
  ];

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'GolfCourse',
    name: `${course.name} at ${club.name}`,
    url: `${SITE_URL}/clubs/${club.slug}/${course.slug}`,
    containedInPlace: { '@type': 'GolfCourse', name: club.name, url: `${SITE_URL}/clubs/${club.slug}` }
  };
  if (course.description) ld.description = course.description;
  if (r.address) ld.address = { '@type': 'PostalAddress', streetAddress: r.address, addressRegion: r.county || `${r.region} Wales`, addressCountry: 'GB' };
  if (r.lat != null) ld.geo = { '@type': 'GeoCoordinates', latitude: Number(r.lat), longitude: Number(r.lng) };
  const jsonLd = JSON.stringify(ld).replace(/</g, '\\u003c');

  const countyInfo = club.county ? countyByName(club.county) : null;
  const pageDescription = [
    `${course.name} at ${club.name}${club.county ? ', ' + club.county : ''}`,
    course.summary,
    course.has_card ? 'Full hole-by-hole scorecard' : ''
  ].filter(Boolean).join('. ') + '.';

  res.render('clubs/course', { club, course, otherCourses, events, jsonLd, pageDescription, countySlug: countyInfo ? countyInfo.slug : null });
}));

module.exports = router;
