// One-off: queues the open competitions and junior page links found by a
// manual check of club websites (Oct 2026) as suggestions at
// /admin/club-suggestions. Only fills EMPTY fields: links already saved on a
// club are never replaced. Safe to re-run (skips anything already queued).
//
//   node scripts/add-manual-links.js --dry-run
//   node scripts/add-manual-links.js
require('dotenv').config();
const pool = require('../db/pool');

const DRY_RUN = process.argv.includes('--dry-run');
const slugify = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Booking-system addresses that were built from a club's ID rather than seen
// directly; flagged so they get a quick check before accepting.
const BUILT = /masterscoreboard\.co\.uk\/bookings1\/ClubOpenCompetitions|intelligentgolf\.co\.uk\/competition\.php$|wrexhamgolfclub\.co\.uk\/competition\.php/i;

const LINKS = [
  {
    "name": "Aberdovey Golf Club",
    "opens": "https://www.aberdoveygolf.co.uk/visitors/open-events/",
    "juniors": null,
    "note": "No junior page in the menu"
  },
  {
    "name": "Bala Golf Club",
    "opens": "https://www.masterscoreboard.co.uk/bookings1/ClubOpenCompetitions.php?CWID=5009",
    "juniors": null,
    "note": "Homepage is a language chooser; links are on /home.htm (Masterscoreboard system)"
  },
  {
    "name": "Borth & Ynyslas Golf Club",
    "opens": "https://www.borthgolf.co.uk/opens",
    "juniors": "https://www.borthgolf.co.uk/Page/CustomPage?pageId=11965",
    "note": "ClubV1 / HowDidiDo site; \"Junior Section\" page"
  },
  {
    "name": "Brecon Golf Club",
    "opens": "https://www.brecon-golf-club.co.uk/fixtures",
    "juniors": null,
    "note": "General \"Fixtures\" page; no opens or junior page"
  },
  {
    "name": "Builth Wells Golf Club",
    "opens": "https://www.builthwellsgolf.co.uk/open-golf-events-clone-1739286268126",
    "juniors": null,
    "note": "\"Open Golf Events\" page; homepage mentions a junior section but no page"
  },
  {
    "name": "Cilgwyn Golf Club",
    "opens": "https://www.cilgwyngolfclub.co.uk/competitions-cystadlaethau/fixture-calendar/",
    "juniors": "https://www.cilgwyngolfclub.co.uk/competitions-cystadlaethau/juniors-results/",
    "note": "Fixture calendar; junior link is results only"
  },
  {
    "name": "Cradoc Golf Club",
    "opens": null,
    "juniors": "https://cradoc.co.uk/junior-section/",
    "note": "No opens page in the menu"
  },
  {
    "name": "Lakeside (Garthmyl) Golf Club",
    "opens": "https://lakesidegolfcourse.co.uk/events/",
    "juniors": null,
    "note": "Events page includes junior range events; fixtures are a PDF"
  },
  {
    "name": "Llandrindod Wells Golf Club",
    "opens": "https://www.lwgc.co.uk/come-and-play/open-competitions.html",
    "juniors": "https://www.lwgc.co.uk/come-and-play/fancy-taking-up-golf.html",
    "note": "Site links straight to its BRS opens; \"Fancy taking up Golf?\" is beginners, not junior-specific"
  },
  {
    "name": "Machynlleth Golf Club",
    "opens": "https://machgolfclub.co.uk/club-diary",
    "juniors": null,
    "note": "Club Diary & Events page. Your example (machynllethgolfclub.com/competitions) is a different domain, not linked from this site"
  },
  {
    "name": "Penrhos Park Golf Club",
    "opens": "https://www.penrhospark.com/post/penrhos-golf-club-open-week-2026",
    "juniors": null,
    "note": "Open Week 2026 post; also a What's On page (/whats-on)"
  },
  {
    "name": "Welshpool Golf Club",
    "opens": "https://welshpoolgolfclub.co.uk/opens-and-competitions/",
    "juniors": "https://welshpoolgolfclub.co.uk/sections/",
    "note": "Sections page covers the junior section"
  },
  {
    "name": "Abergele Golf Club",
    "opens": "https://brsgolf.com/abergele/opens_home.php",
    "juniors": null,
    "note": "Site links straight to its BRS opens; Events page at /latest/events/"
  },
  {
    "name": "Abersoch Golf Club",
    "opens": "https://abersochgolf.co.uk/open-competitions/",
    "juniors": null,
    "note": "No junior page in the menu"
  },
  {
    "name": "Anglesey Golf Club",
    "opens": "https://angleseygolfclub.co.uk/open-competitions/",
    "juniors": null,
    "note": "ClubV1 / HowDidiDo site; no junior page in the menu"
  },
  {
    "name": "Baron Hill Golf Club",
    "opens": "https://www.masterscoreboard.co.uk/bookings1/ClubOpenCompetitions.php?CWID=5011",
    "juniors": "https://www.baronhill.co.uk/en/juniors",
    "note": "Masterscoreboard listing built from the club's booking link (CWID 5011); check it"
  },
  {
    "name": "Bull Bay Golf Club",
    "opens": "https://bullbaygc.co.uk/news-2/",
    "juniors": null,
    "note": "News & Events page; news mentions Faldo Futures junior event"
  },
  {
    "name": "Caernarfon Golf Club",
    "opens": "https://visitors.brsgolf.com/caernarfon#/open-competitions",
    "juniors": "https://www.caernarfongolfclub.co.uk/junior-information/",
    "note": "Junior Section menu also has Latest Events (/latest-events/)"
  },
  {
    "name": "Clays Golf Club",
    "opens": "https://clays.intelligentgolf.co.uk/competition.php",
    "juniors": null,
    "note": "IntelligentGolf system; coaching page but no junior page"
  },
  {
    "name": "Conwy Golf Club",
    "opens": "https://www.conwygolfclub.com/visitors/open-competitions/",
    "juniors": "https://www.conwygolfclub.com/join/sections/",
    "note": "Sections page covers juniors; also a New2Golf scheme page"
  },
  {
    "name": "Flint Golf Club",
    "opens": "https://flintgolfclub.co.uk/members-area-2/",
    "juniors": null,
    "note": "Members' \"Fixtures & Results\" only; Masterscoreboard system. No junior page"
  },
  {
    "name": "Hawarden Golf Club",
    "opens": "https://www.brsgolf.com/hawarden/opens_home.php",
    "juniors": null,
    "note": "\"2026 Opens\" button goes straight to BRS; hosting PING Welsh Junior Tour 2026. No junior page"
  },
  {
    "name": "Henllys Golf Club",
    "opens": "https://visitors.brsgolf.com/henllys#/open-competitions",
    "juniors": null,
    "note": "Fixture list is a members' download; homepage shows a 2026 Ladies Open"
  },
  {
    "name": "Holyhead Golf Club",
    "opens": "https://www.howdidido.com/Directory/OpenCompetitions/1818",
    "juniors": null,
    "note": "HowDidiDo open competitions listing; also a Pro-Am 2026 page"
  },
  {
    "name": "Holywell Golf Club",
    "opens": "https://www.holywellgc.co.uk/open-competitions",
    "juniors": "https://www.holywellgc.co.uk/junior-golf",
    "note": "ClubV1 / HowDidiDo site; Club Diary at /club"
  },
  {
    "name": "Llandudno (Maesdu) Golf Club",
    "opens": "https://www.maesdugolfclub.co.uk/visitors/open-competitions/",
    "juniors": "https://www.maesdugolfclub.co.uk/membership/sections/junior/",
    "note": ""
  },
  {
    "name": "Mold Golf Club",
    "opens": "https://moldgolfclub.co.uk/open-competitions/",
    "juniors": null,
    "note": "Also an Events page (/upcoming-events/); no junior page in the menu"
  },
  {
    "name": "Nefyn & District Golf Club",
    "opens": "https://nefyn-golf-club.co.uk/open-competitions/",
    "juniors": null,
    "note": "No junior page in the menu"
  },
  {
    "name": "North Wales Golf Club",
    "opens": "https://www.northwalesgolfclub.org.uk/visitors/open-competitions/",
    "juniors": "https://www.northwalesgolfclub.org.uk/membership/junior-membership/",
    "note": "\"Opens 2026/2027\" page"
  },
  {
    "name": "Old Padeswood Golf Club",
    "opens": "https://www.oldpadeswoodgolfclub.com/visitors/societies/",
    "juniors": null,
    "note": "Open Events page; also Mens Opens and Ladies & Mixed Opens pages. Your example link"
  },
  {
    "name": "Pennant Park Golf Club",
    "opens": "https://wayfindescapes.co.uk/golf/open-golf-events/",
    "juniors": null,
    "note": "Wayfind Escapes (Arden Parks) resort site"
  },
  {
    "name": "Porthmadog Golf Club",
    "opens": "https://brsgolf.com/porthmadog/opens_home.php",
    "juniors": null,
    "note": "Bilingual menu; also Open Competition Results page"
  },
  {
    "name": "Prestatyn Golf Club",
    "opens": "https://prestatyngolfclub.co.uk/open-competitions.html",
    "juniors": null,
    "note": "Club diary & fixtures 2026 is a PDF"
  },
  {
    "name": "Pwllheli Golf Club",
    "opens": "https://www.clwbgolffpwllheli.com/open-competitions",
    "juniors": "https://www.clwbgolffpwllheli.com/junior-fixtures",
    "note": "\"Junior Competitions\" page under Members"
  },
  {
    "name": "Rhos-on-Sea Golf Club",
    "opens": "https://www.rhosgolf.co.uk/members/open-competitions/",
    "juniors": "https://www.rhosgolf.co.uk/?page_id=1648",
    "note": "\"Junior Section & Fixtures\" page; homepage links Open Week 2026 entry on BRS"
  },
  {
    "name": "Rhuddlan Golf Club",
    "opens": "https://www.rhuddlangolfclub.co.uk/golf/open-competitions/",
    "juniors": null,
    "note": "No junior page; Ladies New 2 Golf page"
  },
  {
    "name": "Rhyl Golf Club",
    "opens": "https://www.masterscoreboard.co.uk/bookings1/ClubOpenCompetitions.php?CWID=5121",
    "juniors": null,
    "note": "Masterscoreboard listing built from the club's link (CWID 5121); check it. \"RGC Opens\" link points to Golf Empire. Opens also posted as news"
  },
  {
    "name": "Royal St. David's Golf Club",
    "opens": "https://www.royalstdavids.co.uk/visitors/opens/",
    "juniors": null,
    "note": "IntelligentGolf system; no junior page in the menu"
  },
  {
    "name": "Vale of Llangollen Golf Club",
    "opens": "https://www.vlgc.co.uk/opens/",
    "juniors": "https://www.vlgc.co.uk/juniors-section/",
    "note": "\"Opens\" page currently shows 2026 results; homepage links BRS open booking"
  },
  {
    "name": "Wrexham Golf Club",
    "opens": "https://www.wrexhamgolfclub.co.uk/competition.php",
    "juniors": null,
    "note": "IntelligentGolf site with an Open Competitions menu item; link built from the system's usual address, check it"
  },
  {
    "name": "Ashburnham Golf Club",
    "opens": "https://ashburnhamgolfclub.co.uk/visitors/opens/",
    "juniors": null,
    "note": "Hosting 2026 Clutch Tour event"
  },
  {
    "name": "Bargoed Golf Club",
    "opens": "https://www.bargoedgolfclub.co.uk/whats-on/",
    "juniors": null,
    "note": "What's On page; members' competitions at /membership/competitions/; junior membership mentioned but no page"
  },
  {
    "name": "Blackwood Golf Club",
    "opens": "https://visitors.brsgolf.com/blackwoodwales#/open-competitions",
    "juniors": null,
    "note": "Clubhouse Events page only"
  },
  {
    "name": "Bryn Meadows Golf Club",
    "opens": "https://visitors.brsgolf.com/brynmeadows#/open-competitions",
    "juniors": "https://www.brynmeadows.co.uk/services/first-swing-academy/",
    "note": "Hotel resort site; also a Junior Golf Camp page (/services/childrens-golf-camp/)"
  },
  {
    "name": "Cardiff Golf Club",
    "opens": "https://www.cardiffgolfclub.co.uk/visitors/opens/",
    "juniors": null,
    "note": "IntelligentGolf; listing link built from the system's usual address. New to Golf page under Join"
  },
  {
    "name": "Cardigan Golf Club",
    "opens": "https://www.cardigangolfclub.co.uk/open-competitions",
    "juniors": null,
    "note": "Winter Opens Nov 6 / Jan 28 / Mar 5 on homepage"
  },
  {
    "name": "Carmarthen Golf Club",
    "opens": "https://visitors.brsgolf.com/carmarthen#/open-competitions",
    "juniors": null,
    "note": "New2Golf lessons on homepage; no junior page"
  },
  {
    "name": "Coed-y-Mwstwr Golf Club",
    "opens": "https://visitors.brsgolf.com/coedymwstwr#/open-competitions",
    "juniors": null,
    "note": "\"Competitions\" menu goes to BRS; Event Calendar at /events"
  }
];

async function run() {
  let queued = 0, skipped = 0, missing = 0;
  for (const item of LINKS) {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.opens_url, c.juniors_url, c.archived_at,
              EXISTS (SELECT 1 FROM club_suggestions s WHERE s.club_id = c.id AND s.status = 'pending'
                      AND (s.data ? 'opens_url' OR s.data ? 'juniors_url')) AS has_pending
       FROM clubs c WHERE c.slug = $1`,
      [slugify(item.name)]
    );
    if (!rows.length) { missing++; console.log(`${item.name}: not found in the database`); continue; }
    const club = rows[0];
    if (club.archived_at) { skipped++; continue; }
    if (club.has_pending) { skipped++; console.log(`${club.name}: already has links waiting for review`); continue; }

    const data = {}, sources = {}, warnings = [];
    if (item.opens && !club.opens_url) { data.opens_url = item.opens; sources.opens_url = 'manual'; }
    if (item.juniors && !club.juniors_url) { data.juniors_url = item.juniors; sources.juniors_url = 'manual'; }
    if (!Object.keys(data).length) { skipped++; continue; }

    if (data.opens_url && BUILT.test(data.opens_url)) warnings.push('Opens link was built from the club\'s booking-system ID; open it to check it lists their competitions.');
    if (item.note) warnings.push(`From the manual check: ${item.note}`);

    console.log(`${club.name}`);
    if (data.opens_url) console.log(`   opens:   ${data.opens_url}`);
    if (data.juniors_url) console.log(`   juniors: ${data.juniors_url}`);
    if (!DRY_RUN) {
      await pool.query(
        `INSERT INTO club_suggestions (club_id, data, sources, warnings) VALUES ($1, $2, $3, $4)`,
        [club.id, JSON.stringify(data), JSON.stringify(sources), JSON.stringify(warnings)]
      );
    }
    queued++;
  }
  console.log(`\n${DRY_RUN ? 'Would queue' : 'Queued'} ${queued} club(s); ${skipped} skipped (already filled or waiting); ${missing} not found.` +
    (queued && !DRY_RUN ? ' Review at /admin/club-suggestions.' : ''));
  await pool.end();
}

run().catch(async err => {
  console.error('Failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
