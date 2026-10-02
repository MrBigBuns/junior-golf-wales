// Site-wide settings used for SEO: the public URL, the "season" year shown in
// titles, and the golf counties used for county pages and filters.

const SITE_NAME = 'Wales Junior Golf';

// Set SITE_URL in Render > Environment when the custom domain goes live:
// https://walesjuniorgolf.co.uk (no trailing slash). Other domains pointed at
// the service (juniorgolf.wales, the onrender address) then redirect to it.
const SITE_URL = (process.env.SITE_URL || 'https://junior-golf-wales.onrender.com').replace(/\/+$/, '');

// Searches include the year ("junior golf opens 2027"). From October the
// coming season is what people are planning for, so titles move on a year.
function seasonYear(now = new Date()) {
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}

// The counties Welsh golf commonly uses (preserved counties, with the three
// Glamorgans as one). `areas` lists the modern areas each covers, for page
// copy and so people searching by either name find the right page.
const COUNTIES = [
  { slug: 'glamorgan', name: 'Glamorgan', region: 'South',
    areas: ['Cardiff', 'Swansea', 'Vale of Glamorgan', 'Bridgend', 'Neath Port Talbot', 'Rhondda Cynon Taf', 'Merthyr Tydfil', 'Caerphilly'] },
  { slug: 'gwent', name: 'Gwent', region: 'South',
    areas: ['Newport', 'Monmouthshire', 'Torfaen', 'Blaenau Gwent', 'Caerphilly'] },
  { slug: 'dyfed', name: 'Dyfed', region: 'South',
    areas: ['Carmarthenshire', 'Pembrokeshire', 'Ceredigion'] },
  { slug: 'powys', name: 'Powys', region: 'Mid',
    areas: ['Brecknockshire', 'Radnorshire', 'Montgomeryshire'] },
  { slug: 'gwynedd', name: 'Gwynedd', region: 'North',
    areas: ['Gwynedd', 'Anglesey', 'Conwy'] },
  { slug: 'clwyd', name: 'Clwyd', region: 'North',
    areas: ['Denbighshire', 'Flintshire', 'Wrexham', 'Conwy'] }
];
const COUNTY_NAMES = COUNTIES.map(c => c.name);
const countyBySlug = slug => COUNTIES.find(c => c.slug === slug) || null;
const countyByName = name => COUNTIES.find(c => c.name === name) || null;

module.exports = { SITE_NAME, SITE_URL, seasonYear, COUNTIES, COUNTY_NAMES, countyBySlug, countyByName };
