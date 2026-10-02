require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const homeRouter = require('./routes/home');
const eventsRouter = require('./routes/events');
const clubsRouter = require('./routes/clubs');
const toursRouter = require('./routes/tours');
const submitRouter = require('./routes/submit');
const adminRouter = require('./routes/admin');
const mapRouter = require('./routes/map');
const staticRouter = require('./routes/static');
const portalRouter = require('./routes/portal');
const countiesRouter = require('./routes/counties');
const seoRouter = require('./routes/seo');
const adminAuth = require('./lib/adminAuth');
const { SITE_URL, seasonYear, COUNTIES } = require('./lib/site');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Sessions for the club portal login. Uses the default in-memory store —
// fine for this app's scale, but sessions are lost on every restart/deploy
// (club users will need to log back in). Move to a persistent store
// (e.g. connect-pg-simple) if that becomes annoying.
if (!process.env.SESSION_SECRET) {
  console.warn('WARNING: SESSION_SECRET is not set — using an insecure default. Set it in Render > Environment.');
}
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));

// One public address: once SITE_URL is set, requests arriving on any other
// host (juniorgolf.wales, www., the onrender.com address) get a permanent
// redirect to the same path on the primary domain, so search engines see a
// single site. Local development and requests without a Host are left alone.
if (process.env.SITE_URL) {
  const primaryHost = new URL(SITE_URL).host;
  app.use((req, res, next) => {
    const host = (req.headers.host || '').toLowerCase();
    if (!host || host === primaryHost || host.startsWith('localhost') || host.startsWith('127.0.0.1')) return next();
    res.redirect(301, SITE_URL + req.originalUrl);
  });
}

// Values every page template can use: canonical URL (always the public
// domain, no query string), the season year for titles, and the counties.
app.use((req, res, next) => {
  res.locals.siteUrl = SITE_URL;
  res.locals.canonicalUrl = SITE_URL + (req.path === '/' ? '/' : req.path.replace(/\/+$/, ''));
  res.locals.seasonYear = seasonYear();
  res.locals.counties = COUNTIES;
  next();
});

app.use('/', seoRouter);
app.use('/', homeRouter);
app.use('/county', countiesRouter);
app.use('/events', eventsRouter);
app.use('/clubs', clubsRouter);
app.use('/tours', toursRouter);
app.use('/submit-event', submitRouter);
app.use('/admin', adminAuth, adminRouter);
app.use('/map', mapRouter);
app.use('/club-portal', portalRouter);
app.use('/', staticRouter);

app.use((req, res) => res.status(404).render('404'));

// Catches errors forwarded by asyncHandler-wrapped routes. Without this,
// an error in any single request would crash the whole process (Express 4
// does not auto-catch rejected promises from async handlers).
app.use((err, req, res, next) => {
  console.error('Request error:', err);
  res.status(500).send('Something went wrong loading this page. Please try again.');
});

// Last-resort safety nets: log and keep running rather than crash the whole
// site on an error that somehow wasn't caught above.
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));

app.listen(PORT, () => console.log(`Wales Junior Golf running on port ${PORT}`));
