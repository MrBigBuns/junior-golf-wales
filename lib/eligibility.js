// Can this player enter this event? A guide read from the free text on the
// event (age category, handicap limit), not a ruling: the card always says to
// check with the club when the text isn't clear.
//
// Age category wordings seen so far:
//   "Under 18 on 1 January 2027"        strictly under 18
//   "Under 8 to Under 18 age groups"    anyone up to, but not including, 18
//   "Juniors 18 & under"                up to and including 18
//   "Juniors", "Juniors (all ages)"     no age given
//
// Handicap limit wordings:
//   "28.0 (boys) 36.0 (girls)"          a limit for each
//   "54.0"                              one limit for both

function parseAgeLimit(text) {
  const s = String(text || '').toLowerCase();
  if (!s.trim()) return { max: null };
  // "18 & under", "18 and under", "18 or under": up to and including
  const upTo = s.match(/(\d{1,2})\s*(?:&|and|or)\s*under/);
  if (upTo) return { max: Number(upTo[1]) };
  // "Under 18 ..." (the last "under N" wins: "Under 8 to Under 18 age groups")
  const unders = [...s.matchAll(/under\s*(\d{1,2})/g)];
  if (unders.length) return { max: Number(unders[unders.length - 1][1]) - 1 };
  return { max: null };
}

function parseHandicapLimit(text) {
  const s = String(text || '');
  if (!s.trim()) return { boys: null, girls: null };
  const boys = s.match(/(\d{1,2}(?:\.\d)?)\s*\(?\s*(?:boys?|male)/i);
  const girls = s.match(/(\d{1,2}(?:\.\d)?)\s*\(?\s*(?:girls?|female|ladies)/i);
  if (boys || girls) {
    const b = boys ? Number(boys[1]) : null;
    const g = girls ? Number(girls[1]) : null;
    return { boys: b != null ? b : g, girls: g != null ? g : b };
  }
  const one = s.match(/(\d{1,2}(?:\.\d)?)/);
  return one ? { boys: Number(one[1]), girls: Number(one[1]) } : { boys: null, girls: null };
}

// player: { age: number|null, hcp: number|null }
// Returns { level: 'ok' | 'check' | 'no' | 'unknown', label, detail }
//   ok       fits what the event says
//   check    something isn't stated, or the limit differs for boys and girls
//   no       too old, or over the handicap limit for both
//   unknown  no age or handicap given, so nothing to check
function eligibility(event, player) {
  const { age, hcp } = player;
  if (age == null && hcp == null) return { level: 'unknown', label: '', detail: '' };

  const ageLimit = parseAgeLimit(event.age_category);
  const hcpLimit = parseHandicapLimit(event.hcp_index_limit);
  const hcpText = hcpLimit.boys == null ? ''
    : (hcpLimit.boys === hcpLimit.girls ? `handicap limit ${hcpLimit.boys.toFixed(1)}`
      : `handicap limit ${hcpLimit.boys.toFixed(1)} boys, ${hcpLimit.girls.toFixed(1)} girls`);

  if (age != null && ageLimit.max != null && age > ageLimit.max) {
    return { level: 'no', label: 'Too old for this event', detail: event.age_category || '' };
  }
  if (hcp != null && hcpLimit.boys != null && hcp > Math.max(hcpLimit.boys, hcpLimit.girls)) {
    return { level: 'no', label: 'Over the handicap limit', detail: hcpText };
  }

  const gaps = [];
  if (age != null && ageLimit.max == null) gaps.push('Age group not listed');
  if (hcp != null && hcpLimit.boys == null) gaps.push('Handicap limit not listed');
  if (gaps.length) return { level: 'check', label: gaps[0], detail: gaps.length > 1 ? gaps.join(' and ') + ', so check with the club' : 'Check with the club' };

  if (hcp != null && hcpLimit.boys !== hcpLimit.girls && hcp > Math.min(hcpLimit.boys, hcpLimit.girls)) {
    return { level: 'check', label: 'Handicap limit differs', detail: hcpText };
  }
  return { level: 'ok', label: 'You can enter', detail: [event.age_category, hcpText].filter(Boolean).join(' · ') };
}

module.exports = { parseAgeLimit, parseHandicapLimit, eligibility };
