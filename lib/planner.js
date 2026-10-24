// The tournament planner: reads the form, finds the events, works out the
// calendar month and the distances. Nothing about the visitor is stored; the
// postcode is only looked up (postcodes.io) to measure distances and the
// answer is kept in memory for a few minutes.

const { entryStatus } = require('./entryStatus');
const { eligibility } = require('./eligibility');
const { geocodeByPostcode } = require('./geocode');

const DAY = 86400000;
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

function londonToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now);
}

function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s)); }
function addDays(iso, n) { return new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10); }
function addMonths(iso, n) {
  const d = new Date(Date.parse(iso));
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

// A full postcode (SA31 1AA) or just the first half (SA31)
async function geocodePlace(text) {
  const raw = String(text || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!raw || raw.length > 12) return null;
  const hit = cache.get(raw);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  let value = null;
  try {
    if (/^[A-Z]{1,2}[0-9][A-Z0-9]?$/.test(raw)) {
      const res = await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(raw)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.result) value = { lat: data.result.latitude, lng: data.result.longitude };
      }
    } else if (/^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/.test(raw)) {
      value = await geocodeByPostcode(raw);
    }
  } catch (e) { value = null; }

  cache.set(raw, { at: Date.now(), value });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return value;
}

function miles(a, b) {
  const R = 3958.8;
  const rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// What the form says, with sensible defaults: from today, three months ahead
function readQuery(q, today = londonToday()) {
  const from = isDate(q.from) && q.from >= today ? q.from : today;
  let to = isDate(q.to) ? q.to : addMonths(from, 3);
  if (to < from) to = from;
  if (Date.parse(to) - Date.parse(from) > 800 * DAY) to = addDays(from, 800);

  const ageN = parseInt(q.age, 10);
  const hcpN = parseFloat(String(q.hcp || '').replace(',', '.'));
  return {
    from, to,
    age: Number.isFinite(ageN) && ageN >= 3 && ageN <= 25 ? ageN : null,
    hcp: Number.isFinite(hcpN) && hcpN >= -10 && hcpN <= 60 ? hcpN : null,
    pc: String(q.pc || '').trim().slice(0, 12),
    weekends: q.weekends === '1',
    within: [30, 60, 100].includes(parseInt(q.within, 10)) ? parseInt(q.within, 10) : null,
    month: /^\d{4}-\d{2}$/.test(q.m || '') ? q.m + '-01' : null,
    plan: String(q.plan || '').split(',').map(n => parseInt(n, 10)).filter(n => n > 0).slice(0, 30)
  };
}

// Entry fee as plain text for the plan panel
function feeText(e) {
  const tiers = Array.isArray(e.entry_fee_tiers) ? e.entry_fee_tiers : [];
  if (tiers.length) return tiers.map(t => `£${Number(t.amount)} ${String(t.label || '').toLowerCase()}`.trim()).join(', ');
  if (e.entry_fee != null && Number(e.entry_fee) > 0) return `£${Number(e.entry_fee)}`;
  return null;
}

// Build everything the page needs. rowsAll are every upcoming event with its
// club; the page picks the ones inside the dates.
async function buildPlanner(pool, query) {
  const today = londonToday();
  const q = readQuery(query, today);
  const origin = q.pc ? await geocodePlace(q.pc) : null;

  const { rows } = await pool.query(
    `SELECT e.id, e.slug, e.title, e.date_start, e.age_category, e.hcp_index_limit,
            e.entry_fee, e.entry_fee_tiers, e.entry_deadline, e.registration_opens,
            e.entries_not_open, e.entries_closed, e.status,
            c.id AS club_id, c.name AS club_name, c.slug AS club_slug, c.county, c.region,
            c.lat, c.lng
     FROM events e JOIN clubs c ON c.id = e.club_id
     WHERE e.date_start >= $1::date AND e.status != 'cancelled'
     ORDER BY e.date_start ASC, e.title ASC
     LIMIT 600`,
    [today]
  );

  const all = rows.map(e => {
    const date = new Date(e.date_start).toISOString().slice(0, 10);
    const hasPlace = e.lat != null && e.lng != null;
    const dist = origin && hasPlace ? Math.round(miles(origin, { lat: Number(e.lat), lng: Number(e.lng) })) : null;
    const entry = entryStatus(e);
    return {
      id: e.id, slug: e.slug, title: e.title, date,
      day: new Date(date + 'T00:00:00Z').getUTCDay(),
      clubName: e.club_name, county: e.county, region: e.region,
      lat: hasPlace ? Number(e.lat) : null, lng: hasPlace ? Number(e.lng) : null,
      dist, entry, fee: feeText(e),
      ageCategory: e.age_category, hcpLimit: e.hcp_index_limit,
      elig: eligibility(e, { age: q.age, hcp: q.hcp })
    };
  });

  const inRange = all.filter(e => e.date >= q.from && e.date <= q.to
    && (!q.weekends || e.day === 0 || e.day === 6)
    && (!q.within || (e.dist != null && e.dist <= q.within)));
  inRange.forEach((e, i) => { e.num = i + 1; });
  const byId = new Map(inRange.map(e => [e.id, e]));
  const allById = new Map(all.map(e => [e.id, e]));

  const counts = { ok: 0, check: 0, no: 0 };
  inRange.forEach(e => { if (counts[e.elig.level] != null) counts[e.elig.level] += 1; });

  // Calendar month: the one asked for, else the first with an event, else the start month
  const monthStart = q.month || (inRange[0] ? inRange[0].date.slice(0, 8) + '01' : q.from.slice(0, 8) + '01');
  const mFirst = new Date(Date.parse(monthStart));
  const gridStart = (() => {
    const dow = (mFirst.getUTCDay() + 6) % 7; // Monday first
    return Date.parse(monthStart) - dow * DAY;
  })();
  const monthEnd = addMonths(monthStart, 1);
  const weeks = Math.ceil(((Date.parse(monthEnd) - gridStart) / DAY) / 7);
  const byDate = new Map();
  all.forEach(e => { if (!byDate.has(e.date)) byDate.set(e.date, []); byDate.get(e.date).push(e); });
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const iso = new Date(gridStart + i * DAY).toISOString().slice(0, 10);
    const thisMonth = iso.slice(0, 7) === monthStart.slice(0, 7);
    cells.push({
      iso, n: Number(iso.slice(8)), thisMonth,
      inRange: iso >= q.from && iso <= q.to,
      events: (byDate.get(iso) || []).map(e => ({
        id: e.id, slug: e.slug, clubName: e.clubName,
        num: byId.has(e.id) ? byId.get(e.id).num : null
      }))
    });
  }

  const monthLabel = new Date(Date.parse(monthStart)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return {
    q, today, origin, events: inRange, counts,
    plan: q.plan.filter(id => allById.has(id)),
    // what the page's script needs: the events in the dates, and any planned ones outside them
    clientEvents: [...inRange, ...q.plan.filter(id => allById.has(id) && !byId.has(id)).map(id => allById.get(id))],
    calendar: { cells, monthLabel, monthKey: monthStart.slice(0, 7), prev: addMonths(monthStart, -1).slice(0, 7), next: addMonths(monthStart, 1).slice(0, 7) },
    pcFailed: !!q.pc && !origin
  };
}

module.exports = { buildPlanner, readQuery, geocodePlace, miles, feeText, londonToday };
