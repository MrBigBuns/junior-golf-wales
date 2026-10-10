// schema.org structured data (JSON-LD) for an event page, so Google can show
// the event in search results. Built as an object and serialised with
// JSON.stringify, so names with quotes or ampersands can't break it.

const { SITE_URL } = require('./site');

// DATE columns arrive as local-midnight Date objects: format as YYYY-MM-DD
function isoDate(d) {
  if (!d) return null;
  const x = new Date(d);
  if (isNaN(x)) return null;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function eventSchema(event) {
  const url = `${SITE_URL}/events/${event.slug}`;
  const start = isoDate(event.date_start);
  const startTime = event.start_time ? String(event.start_time).slice(0, 5) : null;

  // Picture: the club's course photo, else its logo, else the site logo
  let image = `${SITE_URL}/img/wales-junior-golf-logo.png`;
  if (event.club_has_course_photo) image = `${SITE_URL}/clubs/${event.club_id}/course-photo-image`;
  else if (event.club_course_image_url) image = event.club_course_image_url;
  else if (event.club_has_logo_image) image = `${SITE_URL}/clubs/${event.club_id}/logo-image`;
  else if (event.club_logo_url) image = event.club_logo_url;

  const description = event.meta_description ||
    [event.title, `at ${event.club_name}`, event.age_category, event.format].filter(Boolean).join(', ') + '.';

  const data = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: event.title,
    description,
    url,
    image: [image],
    sport: 'Golf',
    startDate: startTime ? `${start}T${startTime}` : start,
    endDate: isoDate(event.date_end) || start,
    eventStatus: event.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: event.club_name,
      address: {
        '@type': 'PostalAddress',
        streetAddress: event.address || undefined,
        addressRegion: event.club_county || (event.region ? `${event.region} Wales` : undefined),
        addressCountry: 'GB'
      }
    },
    // The organiser: the tour or series if there is one, else the host club
    organizer: event.organiser_name
      ? { '@type': 'Organization', name: event.organiser_name, url: event.organiser_website || `${SITE_URL}/tours/${event.organiser_slug}` }
      : { '@type': 'Organization', name: event.club_name, url: event.club_website || `${SITE_URL}/clubs/${event.club_slug}` },
    // Who takes part in a junior competition: the juniors
    performer: {
      '@type': 'PerformingGroup',
      name: event.age_category && event.age_category.length <= 40 ? `Junior golfers (${event.age_category})` : 'Junior golfers'
    }
  };
  if (event.club_lat != null && event.club_lng != null) {
    data.location.geo = { '@type': 'GeoCoordinates', latitude: event.club_lat, longitude: event.club_lng };
  }

  // Entry: price where known, and where to enter
  const tiers = Array.isArray(event.entry_fee_tiers) ? event.entry_fee_tiers.map(t => Number(t.amount)).filter(n => n >= 0) : [];
  const price = tiers.length ? Math.min(...tiers) : (event.entry_fee != null ? Number(event.entry_fee) : null);
  const entryUrl = event.form_id ? `${url}/register` : (event.entry_url || url);
  const offer = {
    '@type': 'Offer',
    url: entryUrl,
    availability: 'https://schema.org/InStock',
    validFrom: isoDate(event.registration_opens) || undefined
  };
  if (price != null && !isNaN(price)) { offer.price = price.toFixed(2); offer.priceCurrency = 'GBP'; }
  data.offers = offer;

  // JSON.stringify drops undefined; escape "<" so text can never close the script tag
  return JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
}

module.exports = { eventSchema };
