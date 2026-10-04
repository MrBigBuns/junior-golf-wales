// Course figures shared by the club page, course pages and event pages:
// holes, par, yardage, tee totals, and how they are displayed (nine-hole
// courses show the 18-hole, twice-round equivalent too).

function slugifyCourse(str) {
  return String(str || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// `c` is any record with holes/par/yardage/scorecard (a club's main course or
// a club_courses row). Returns a new object; the input is not changed.
function courseFigures(c) {
  const card = Array.isArray(c.scorecard) && c.scorecard.length ? c.scorecard : null;
  const out = {
    scorecard: card,
    has_card: !!card,
    holes: c.holes != null ? c.holes : (card ? card.length : null),
    par: c.par != null ? c.par : (card ? card.reduce((t, h) => t + (Number(h.par) || 0), 0) || null : null),
    yardage: c.yardage != null ? c.yardage : null,
    tees: []
  };
  if (card) {
    const totals = {};
    card.forEach(h => Object.entries(h.yards || {}).forEach(([tee, y]) => { totals[tee] = (totals[tee] || 0) + (Number(y) || 0); }));
    out.tees = Object.entries(totals).filter(([, y]) => y > 0).sort((a, b) => b[1] - a[1]).map(([tee, yards]) => ({ tee, yards }));
    if (out.yardage == null && out.tees.length) out.yardage = out.tees[0].yards;
  }

  out.par_display = out.par ? String(out.par) : null;
  out.yardage_display = out.yardage ? `${Number(out.yardage).toLocaleString('en-GB')} yards` : null;
  if (out.holes === 9) {
    // Older records may hold the 18-hole (twice round) figures; infer which.
    if (out.par) {
      out.par_display = out.par > 45
        ? `${out.par} for 18 holes (twice round)`
        : `${out.par} <span class="muted">(${out.par * 2} for 18 holes)</span>`;
    }
    if (out.yardage) {
      const y = Number(out.yardage);
      out.yardage_display = y > 3800
        ? `${y.toLocaleString('en-GB')} yards for 18 holes (twice round)`
        : `${y.toLocaleString('en-GB')} yards <span class="muted">(${(y * 2).toLocaleString('en-GB')} for 18 holes)</span>`;
    }
  }
  // One-line summary for lists: "18 holes · par 71 · 7,493 yds"
  const bits = [];
  if (out.holes) bits.push(`${out.holes} holes`);
  if (out.par) bits.push(`par ${out.par}`);
  if (out.yardage) bits.push(`${Number(out.yardage).toLocaleString('en-GB')} yds`);
  out.summary = bits.join(' · ');
  return out;
}

// "Twenty Ten" -> "the Twenty Ten course"; "The National Course" -> "The National Course"
function coursePhrase(name) {
  if (!name) return null;
  const n = String(name).trim();
  return (/^the\s/i.test(n) ? n : 'the ' + n) + (/\bcourse$/i.test(n) ? '' : ' course');
}

module.exports = { courseFigures, slugifyCourse, coursePhrase };
