// robots.txt and sitemap.xml so search engines find every public page.
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const asyncHandler = require('../lib/asyncHandler');
const { SITE_URL, COUNTIES } = require('../lib/site');

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    ['User-agent: *', 'Disallow: /admin', 'Disallow: /club-portal', 'Allow: /', '', `Sitemap: ${SITE_URL}/sitemap.xml`, ''].join('\n')
  );
});

router.get('/sitemap.xml', asyncHandler(async (req, res) => {
  const [{ rows: events }, { rows: clubs }, { rows: tours }, { rows: courses }] = await Promise.all([
    pool.query(`SELECT slug, updated_at, date_start FROM events
                WHERE date_start >= CURRENT_DATE - INTERVAL '1 year' ORDER BY date_start`),
    pool.query(`SELECT slug FROM clubs WHERE archived_at IS NULL ORDER BY name`),
    pool.query(`SELECT slug FROM organisers ORDER BY name`),
    pool.query(`SELECT c.slug AS club_slug, cc.slug FROM club_courses cc JOIN clubs c ON c.id = cc.club_id
                WHERE c.archived_at IS NULL ORDER BY c.name, cc.sort_order`)
  ]);

  const day = d => (d ? new Date(d) : new Date()).toISOString().slice(0, 10);
  const urls = [
    { loc: '/', priority: '1.0', changefreq: 'daily' },
    { loc: '/events', priority: '0.9', changefreq: 'daily' },
    { loc: '/clubs', priority: '0.8', changefreq: 'weekly' },
    { loc: '/county', priority: '0.8', changefreq: 'weekly' },
    { loc: '/map', priority: '0.6', changefreq: 'weekly' },
    { loc: '/about', priority: '0.3', changefreq: 'monthly' },
    ...COUNTIES.map(c => ({ loc: `/county/${c.slug}`, priority: '0.8', changefreq: 'weekly' })),
    ...tours.map(t => ({ loc: `/tours/${t.slug}`, priority: '0.7', changefreq: 'weekly' })),
    ...clubs.map(c => ({ loc: `/clubs/${c.slug}`, priority: '0.6', changefreq: 'monthly' })),
    ...courses.map(c => ({ loc: `/clubs/${c.club_slug}/${c.slug}`, priority: '0.5', changefreq: 'monthly' })),
    ...events.map(e => ({ loc: `/events/${e.slug}`, lastmod: day(e.updated_at),
      priority: new Date(e.date_start) >= new Date() ? '0.8' : '0.3', changefreq: 'weekly' }))
  ];

  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const body = urls.map(u =>
    `  <url><loc>${esc(SITE_URL + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}` +
    `<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
  ).join('\n');

  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
  );
}));

module.exports = router;
