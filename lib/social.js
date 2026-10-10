// Data and wording for the social media cards: which events fall in a week or
// month, the text on each card, and ready-to-paste captions. The cards
// themselves are HTML and CSS (views/admin/cards, public/css/cards.css) and
// are saved as PNG in the browser.

const { SITE_URL } = require('./site');

const SIZES = {
  square: { w: 1080, h: 1080, label: 'Square', px: '1080 x 1080', use: 'Facebook and Instagram' },
  portrait: { w: 1080, h: 1350, label: 'Portrait', px: '1080 x 1350', use: 'Instagram and Facebook feeds' },
  landscape: { w: 1200, h: 630, label: 'Landscape', px: '1200 x 630', use: 'X and link previews' }
};
// Most events on one round-up card; longer lists run over several cards
const ROWS = { square: 4, portrait: 6, landscape: 4 };
// Height the list has to fill, in the CSS's own units (see cards.css)
const LIST_SPACE = { square: 520, portrait: 730, landscape: 540 };
// Landscape rows are narrower, so they never run at full size
const K_MAX = { square: 1, portrait: 1, landscape: 0.8 };

// Cards and captions always carry the public address, even before SITE_URL
// is switched over in Render.
const PUBLIC_URL = process.env.SITE_URL ? SITE_URL : 'https://walesjuniorgolf.co.uk';
const PUBLIC_HOST = new URL(PUBLIC_URL).host;
const HASHTAGS = '#JuniorGolf #WelshGolf #GolfWales #JuniorGolfWales';
const REGIONS = ['North', 'Mid', 'South'];
const TAGS = { new: 'New event', open: 'Entries open', closing: 'Entries closing soon', soon: 'Coming up', none: '' };

// ---------- dates (plain YYYY-MM-DD strings, UK calendar) ----------
const iso = d => d.toISOString().slice(0, 10);
const parse = s => new Date(s + 'T00:00:00Z');
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(parse(s));
function londonToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function addDays(s, n) { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
function weekStart(s) { const dow = (parse(s).getUTCDay() + 6) % 7; return addDays(s, -dow); } // Monday
function monthStart(s) { return s.slice(0, 7) + '-01'; }
function monthEnd(s) { const d = parse(monthStart(s)); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return iso(d); }
function addMonths(s, n) { const d = parse(monthStart(s)); d.setUTCMonth(d.getUTCMonth() + n); return iso(d); }
const f = (s, opts) => parse(s).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts }).replace(/,/g, '');
// pg hands DATE columns back as local-midnight Date objects
const fd = (d, opts) => new Date(d).toLocaleDateString('en-GB', opts).replace(/,/g, '');

function rangeText(start, end) {
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const a = f(start, sameMonth ? { day: 'numeric' } : sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
  return `${a} – ${f(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

// Works out the period from the admin page's query string
function resolvePeriod(q = {}) {
  const today = londonToday();
  const period = q.period === 'month' ? 'month' : 'week';
  const region = REGIONS.includes(q.region) ? q.region : '';
  const where = region ? `${region} Wales` : 'Wales';
  const given = isDate(q.start) ? q.start : (/^\d{4}-\d{2}$/.test(q.start || '') && isDate(q.start + '-01') ? q.start + '-01' : today);

  if (period === 'month') {
    const start = monthStart(given), end = monthEnd(given);
    return {
      period, region, start, end, prev: addMonths(start, -1), next: addMonths(start, 1),
      title: f(start, { month: 'long', year: 'numeric' }),
      subtitle: `Junior golf events across ${where}`,
      phrase: `in ${f(start, { month: 'long' })}`, where
    };
  }
  const start = weekStart(given), end = addDays(start, 6);
  const thisWeek = weekStart(today);
  const title = start === thisWeek ? 'This week' : start === addDays(thisWeek, 7) ? 'Next week' : `Week of ${f(start, { day: 'numeric', month: 'long' })}`;
  return {
    period, region, start, end, prev: addDays(start, -7), next: addDays(start, 7),
    title,
    subtitle: `Junior golf in ${where}, ${rangeText(start, end)}`,
    phrase: start === thisWeek ? 'this week' : start === addDays(thisWeek, 7) ? 'next week' : `in the week of ${f(start, { day: 'numeric', month: 'long' })}`,
    where
  };
}

// ---------- data ----------
async function roundupEvents(pool, p) {
  const params = [p.start, p.end];
  let regionSql = '';
  if (p.region) { params.push(p.region); regionSql = `AND c.region = $3`; }
  const { rows } = await pool.query(
    `SELECT e.id, e.slug, e.title, e.date_start, e.date_end, e.age_category,
            c.name AS club_name, c.county, c.region
     FROM events e JOIN clubs c ON c.id = e.club_id
     WHERE e.date_start BETWEEN $1 AND $2 AND e.status != 'cancelled' ${regionSql}
     ORDER BY e.date_start ASC, e.title ASC`,
    params
  );
  return rows;
}

const CARD_EVENT_SQL =
  `SELECT e.id, e.slug, e.title, e.date_start, e.date_end, e.age_category, e.gender, e.format, e.holes,
          e.entry_fee, e.entry_fee_tiers, e.entry_deadline, e.status, e.created_at, e.updated_at,
          c.id AS club_id, c.name AS club_name, c.county, c.region,
          (c.course_photo_image IS NOT NULL OR c.course_image_url IS NOT NULL) AS has_photo
   FROM events e JOIN clubs c ON c.id = e.club_id`;
async function cardEventById(pool, id) {
  const { rows } = await pool.query(`${CARD_EVENT_SQL} WHERE e.id = $1`, [Number(id) || 0]);
  return rows[0] || null;
}
async function cardEventBySlug(pool, slug) {
  const { rows } = await pool.query(`${CARD_EVENT_SQL} WHERE e.slug = $1`, [slug]);
  return rows[0] || null;
}

// The club's course photo: the uploaded one, else the linked one. Any failure
// (slow site, odd format) just means the card is drawn without a photo.
// The club's course photo for the top of an event card: the uploaded one,
// else the linked one fetched here so the browser gets it from our own
// address (needed for saving the card as a PNG). Null means "use the default".
async function clubPhoto(pool, clubId) {
  const { rows } = await pool.query(
    `SELECT course_photo_image, course_photo_image_type, course_image_url FROM clubs WHERE id = $1`,
    [Number(clubId) || 0]
  );
  const c = rows[0];
  if (!c) return null;
  if (c.course_photo_image) return { data: c.course_photo_image, type: c.course_photo_image_type || 'image/jpeg' };
  const url = c.course_image_url;
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': `WalesJuniorGolf/1.0 (+${PUBLIC_URL})` } });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !/^image\//i.test(type)) return null;
    const data = Buffer.from(await res.arrayBuffer());
    return data.length > 8 * 1024 * 1024 ? null : { data, type };
  } catch (err) {
    return null;
  }
}

// ---------- wording ----------
const money = v => '£' + String(Number(v).toFixed(2)).replace(/\.00$/, '');
function feeText(ev) {
  const tiers = Array.isArray(ev.entry_fee_tiers) ? ev.entry_fee_tiers.map(t => Number(t.amount)).filter(n => n > 0) : [];
  if (tiers.length) return `From ${money(Math.min(...tiers))}`;
  if (ev.entry_fee != null && Number(ev.entry_fee) > 0) return `${money(ev.entry_fee)} entry`;
  return null;
}
function genderText(g) {
  const v = String(g || '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'mixed' || v === 'any gender' || v === 'any') return 'Boys and girls';
  if (v.length > 34) return null;
  return v.charAt(0).toUpperCase() + v.slice(1);
}
function eventDateLine(ev, short) {
  const opts = short ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }
                     : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  if (ev.date_end && fd(ev.date_end) !== fd(ev.date_start)) {
    const month = short ? 'short' : 'long';
    const sameMonth = fd(ev.date_start, { month, year: 'numeric' }) === fd(ev.date_end, { month, year: 'numeric' });
    return `${fd(ev.date_start, sameMonth ? { day: 'numeric' } : { day: 'numeric', month })} – ${fd(ev.date_end, { day: 'numeric', month, year: 'numeric' })}`;
  }
  return fd(ev.date_start, opts);
}
function deadlineText(ev) {
  if (!ev.entry_deadline) return null;
  const d = new Date(ev.entry_deadline);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (d < today) return null;
  return `Enter by ${fd(d, { day: 'numeric', month: 'short' })}`;
}
function eventCardData(ev) {
  // Chips are short labels: long descriptions stay on the event page
  const brief = v => (v && String(v).trim().length <= 34 ? String(v).trim() : null);
  const format = brief(ev.format);
  const holes = ev.holes && !(format && /hole/i.test(format)) ? `${ev.holes} holes` : null;
  return {
    title: ev.title,
    dateLine: eventDateLine(ev),
    clubLine: [ev.club_name, ev.county || (ev.region ? `${ev.region} Wales` : null)].filter(Boolean).join(' · '),
    chips: [brief(ev.age_category), genderText(ev.gender), format, holes, feeText(ev), deadlineText(ev)].filter(Boolean),
    // The table on the event card: icon, label, value
    details: [
      ['age', 'Age Group', brief(ev.age_category)],
      ['field', 'Field', genderText(ev.gender)],
      ['format', 'Format', format],
      ['course', 'Course', ev.holes ? `${ev.holes} holes` : null],
      ['fee', 'Entry Fee', feeText(ev)],
      ['deadline', 'Deadline', deadlineText(ev)]
    ].filter(d => d[2]).map(([icon, label, value]) => ({ icon, label, value }))
  };
}

// ---------- round-up pages ----------
function roundupPages(events, size) {
  return Math.max(1, Math.ceil(events.length / ROWS[size]));
}
// The events for one card, spread evenly (8 events on 6-row cards run 4 + 4),
// plus --k: how far the rows shrink so that many fit.
function roundupPage(events, size, page) {
  const pages = roundupPages(events, size);
  const n = Math.min(Math.max(1, Number(page) || 1), pages);
  const per = Math.ceil(events.length / pages);
  const rows = events.slice((n - 1) * per, n * per).map(e => ({
    weekday: fd(e.date_start, { weekday: 'short' }),
    day: new Date(e.date_start).getDate(),
    name: e.title,
    long: e.title.length > 27,
    meta: [e.club_name, e.county || (e.region ? `${e.region} Wales` : null),
      e.age_category && e.age_category.length <= 14 ? e.age_category : null].filter(Boolean)
  }));
  const need = rows.length * 118 + Math.max(0, rows.length - 1) * 62;
  const k = Math.min(K_MAX[size], LIST_SPACE[size] / need);
  return { rows, page: n, pages, k: Math.round(k * 100) / 100 };
}

// Title size for the event card, so long names still fit on three lines
function titleSize(title) {
  const n = String(title || '').length;
  return n > 70 ? 54 : n > 52 ? 62 : n > 40 ? 70 : 76;
}

// ---------- captions ----------
// X allows 280 characters; a link always counts as 23 whatever its length.
function xLength(text) {
  return text.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length;
}
function roundupCaptions(p, events) {
  const n = events.length;
  const head = `Junior golf in ${p.where} ${p.phrase}: ${n} event${n === 1 ? '' : 's'}`;
  const lines = events.map(e => `${fd(e.date_start, { weekday: 'short', day: 'numeric', month: 'short' })}: ${e.title}, ${e.club_name}`);
  const link = `${PUBLIC_URL}/events`;
  const long = `${head}\n\n${lines.join('\n')}\n\nFull details and how to enter: ${link}\n\n${HASHTAGS}`;

  const tail = `\n\nDetails: ${link}\n#JuniorGolf #WelshGolf`;
  let short = `${head}.`;
  const kept = [];
  for (const line of lines) {
    const rest = n - kept.length - 1;
    const trial = `${head}\n\n${[...kept, line].join('\n')}${rest ? `\n+ ${rest} more` : ''}${tail}`;
    if (xLength(trial) > 280) break;
    kept.push(line);
  }
  if (kept.length) {
    const rest = n - kept.length;
    short = `${head}\n\n${kept.join('\n')}${rest ? `\n+ ${rest} more` : ''}`;
  }
  return { long, short: short + tail };
}
function eventCaptions(ev, tagKey) {
  const lead = { new: 'New event', open: 'Entries now open', closing: 'Entries closing soon', soon: 'Coming up' }[tagKey] || 'Junior golf';
  const d = eventCardData(ev);
  const link = `${PUBLIC_URL}/events/${ev.slug}`;
  const long = [
    `${lead}: ${ev.title} at ${ev.club_name}`,
    d.dateLine,
    d.chips.length ? d.chips.join(' · ') : null,
    '',
    `Details and how to enter: ${link}`,
    '',
    HASHTAGS
  ].filter(l => l !== null).join('\n');

  const tail = `\n${link}\n#JuniorGolf #WelshGolf`;
  let body = `${lead}: ${ev.title} at ${ev.club_name}, ${eventDateLine(ev, true)}.`;
  if (xLength(body + tail) > 280) body = `${lead}: ${ev.title}, ${eventDateLine(ev, true)}.`;
  if (xLength(body + tail) > 280) body = body.slice(0, 280 - xLength(tail) - 1).trimEnd() + '…';
  return { long, short: body + tail };
}

// ---------- event-day "Good luck" card ----------
// Posted on the morning of a competition day: one event gets a photo card,
// several get a list. Events running over several days count on each day.
function resolveDay(q = {}) {
  const today = londonToday();
  const date = isDate(q.day) ? q.day : today;
  return {
    date, today, tomorrow: addDays(today, 1), prev: addDays(date, -1), next: addDays(date, 1),
    dateLine: f(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    isToday: date === today
  };
}

async function dayEvents(pool, date) {
  const { rows } = await pool.query(
    `SELECT e.id, e.slug, e.title, e.date_start, e.date_end, e.start_time, e.age_category,
            c.id AS club_id, c.name AS club_name, c.county, c.region,
            c.instagram_url, c.x_url, c.facebook_url,
            (c.course_photo_image IS NOT NULL OR c.course_image_url IS NOT NULL) AS has_photo
     FROM events e JOIN clubs c ON c.id = e.club_id
     WHERE $1::date BETWEEN e.date_start AND COALESCE(e.date_end, e.date_start)
       AND e.status != 'cancelled'
     ORDER BY (e.date_start = $1::date) DESC, e.start_time ASC NULLS LAST, e.title ASC`,
    [date]
  );
  return rows;
}

// "08:30:00" -> "8:30", only on the event's first day
function startText(ev, date) {
  if (!ev.start_time || fd(ev.date_start) !== f(date)) return null;
  const [h, m] = String(ev.start_time).split(':');
  return `${Number(h)}:${m}`;
}

// Most events on a card (the last row becomes "+ N more" when there are
// more), the room the list has, and the largest row size, per card size
const GOODLUCK_ROWS = { square: 3, portrait: 5, landscape: 3 };
const GOODLUCK_SPACE = { square: 450, portrait: 600, landscape: 470 };
const GOODLUCK_K_MAX = { square: 1, portrait: 1, landscape: 0.75 };

function goodLuckCard(events, size, date) {
  const where = ev => ev.county || (ev.region ? `${ev.region} Wales` : null);
  if (events.length === 1) {
    const ev = events[0];
    const n = ev.title.length;
    return {
      one: true,
      name: ev.title,
      nameClass: n > 60 ? 'xl' : n > 40 ? 'l' : '',
      meta: [ev.club_name, where(ev)].filter(Boolean),
      photoUrl: ev.has_photo ? `/admin/social/photo/${ev.club_id}` : null
    };
  }
  // Too many for the card: keep one row free for "+ N more"
  const max = GOODLUCK_ROWS[size];
  const shown = events.length > max ? events.slice(0, max - 1) : events;
  const more = events.length - shown.length;
  const rows = shown.map(e => ({
    time: startText(e, date),
    name: e.title,
    long: e.title.length > 28,
    meta: [e.club_name, where(e), e.age_category && e.age_category.length <= 14 ? e.age_category : null].filter(Boolean)
  }));
  const need = rows.length * 164 + Math.max(0, rows.length - 1) * 20 + (more ? 50 : 0);
  const k = Math.min(GOODLUCK_K_MAX[size], GOODLUCK_SPACE[size] / need);
  return { one: false, rows, more, anyTime: rows.some(r => r.time), k: Math.round(k * 100) / 100 };
}

// A club's handle from its profile link, for tagging in captions
function handleFrom(url, re) {
  if (!url) return null;
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean)[0] || '';
    return re.test(seg) ? '@' + seg : null;
  } catch (err) { return null; }
}
const igHandle = c => handleFrom(c.instagram_url, /^(?!p$|reel$|explore$)[A-Za-z0-9._]{1,30}$/);
const xHandle = c => handleFrom(c.x_url, /^(?!home$|search$|i$)[A-Za-z0-9_]{1,15}$/);

function goodLuckCaptions(day, events) {
  // Always "today": the post goes out on the morning of the event
  const when = 'today';
  let long, head, link;
  if (events.length === 1) {
    const ev = events[0];
    const tag = igHandle(ev);
    link = `${PUBLIC_URL}/events/${ev.slug}`;
    head = `Good luck to every junior teeing it up in the ${ev.title} at ${ev.club_name} ${when}. Pob lwc!`;
    long = `${head}${tag ? `\n\n${tag}` : ''}\n\nEvent details: ${link}\n\n${HASHTAGS}`;
  } else {
    link = `${PUBLIC_URL}/events`;
    head = `Good luck to every junior playing in ${events.length} events across Wales ${when}. Pob lwc!`;
    const lines = events.map(e => {
      const t = startText(e, day.date);
      const tag = igHandle(e);
      return `${t ? t + ' ' : ''}${e.title}, ${e.club_name}${tag ? ' ' + tag : ''}`;
    });
    long = `${head}\n\n${lines.join('\n')}\n\nAll the details: ${link}\n\n${HASHTAGS}`;
  }

  // X: name each club by its X handle where we have one, and stay under 280
  const tail = `\n\n${link}\n#JuniorGolf #WelshGolf`;
  const xLines = events.map(e => `${e.title}, ${xHandle(e) || e.club_name}`);
  const kept = [];
  for (const line of xLines) {
    const rest = events.length - kept.length - 1;
    const trial = `${head}\n\n${[...kept, line].join('\n')}${rest ? `\n+ ${rest} more` : ''}${tail}`;
    if (xLength(trial) > 280) break;
    kept.push(line);
  }
  const rest = events.length - kept.length;
  let short = kept.length ? `${head}\n\n${kept.join('\n')}${rest ? `\n+ ${rest} more` : ''}` : head;
  if (xLength(short + tail) > 280) short = short.slice(0, 280 - xLength(tail) - 1).trimEnd() + '…';
  return { long, short: short + tail };
}

module.exports = {
  SIZES, ROWS, TAGS, REGIONS, PUBLIC_URL, PUBLIC_HOST,
  londonToday, resolvePeriod, roundupEvents, roundupPages, roundupPage, roundupCaptions,
  cardEventById, cardEventBySlug, clubPhoto, eventCaptions, eventCardData, titleSize, rangeText,
  resolveDay, dayEvents, goodLuckCard, goodLuckCaptions
};
