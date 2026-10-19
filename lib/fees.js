// Reads the "entry fee" box on the event forms. The column is a number, but
// people type or paste things like "Members £10, Visitors £30" (the wording
// on a submission or a club's own page).
//
//   blank                       no fee
//   10, 12.50, £10              that fee
//   Members £10, Visitors £30   fee tiers; the single fee is the highest,
//                               which is how the event loaders set it
//   £10 per player              the one number in it
//   anything else               { error }, so the form can say so instead of
//                               the save failing with a server error

const AMOUNT = '(\\d{1,4}(?:\\.\\d{1,2})?)';

function tierLabel(raw) {
  const s = String(raw).replace(/^(and|&)\s+/i, '').replace(/\s+/g, ' ').trim();
  if (/^non[- ]?members?$/i.test(s)) return 'Non-member';
  if (/^members?$/i.test(s)) return 'Member';
  if (/^visitors?$/i.test(s)) return 'Visitor';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function parseEntryFee(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return { fee: null, tiers: null };

  const plain = text.match(new RegExp(`^£?\\s*${AMOUNT}$`));
  if (plain) return { fee: plain[1], tiers: null };

  // "Label £amount" pairs, as long as nothing else is left over
  const pairRe = new RegExp(`([A-Za-z][A-Za-z' -]*?)\\s*:?\\s*£\\s*${AMOUNT}`, 'g');
  const pairs = [...text.matchAll(pairRe)];
  const leftover = text.replace(pairRe, '').replace(/\band\b|[\s,;/&|]/gi, '');
  if (pairs.length >= 2 && !leftover) {
    const tiers = pairs.map(p => ({ label: tierLabel(p[1]), amount: Number(p[2]) }));
    return { fee: String(Math.max(...tiers.map(t => t.amount))), tiers };
  }

  // One amount somewhere in the text
  const numbers = text.match(/\d+(?:\.\d+)?/g) || [];
  if (numbers.length === 1 && Number(numbers[0]) < 10000) return { fee: numbers[0], tiers: null };

  return {
    error: `The entry fee "${text.slice(0, 60)}" could not be read. Enter a number such as 10 or 12.50, or fees such as "Members £10, Visitors £30".`
  };
}

module.exports = { parseEntryFee };
