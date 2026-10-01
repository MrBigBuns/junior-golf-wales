// Shared scorecard helpers: photo extraction via Claude vision, and
// deriving par/yardage totals from a scorecard array.

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

const PROMPT = `This is a photo of a golf scorecard. Extract every hole you can read into a JSON array, one object per hole, in this exact shape:

[{"hole": 1, "par": 4, "strokeIndex": 13, "yards": {"white": 319, "yellow": 296, "red": 254}}, ...]

Rules:
- "hole" is the hole number (1-18).
- "par" is the par for that hole.
- "strokeIndex" is the stroke index / S.I. for that hole, if shown.
- "yards" should have one key per tee colour actually visible on the card (e.g. white, yellow, red, blue, black) — use lowercase colour names as keys. Only include tees that are actually printed on the card.
- Only include holes you can actually read. If a value is illegible, omit that field for that hole rather than guessing.
- Respond with ONLY the JSON array — no markdown fences, no commentary, no explanation.`;

function isScorecard(value) {
  return Array.isArray(value) && value.length > 0;
}

// Returns { rawText, parsed, parseError }. Throws on API/config errors.
async function extractScorecardFromImage(buffer, mediaType) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set on this server — add it under Render > Environment before using this tool.');
  }

  const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } },
          { type: 'text', text: PROMPT }
        ]
      }]
    })
  });

  if (!apiResponse.ok) {
    const errText = await apiResponse.text();
    throw new Error(`Anthropic API error (${apiResponse.status}): ${errText.slice(0, 300)}`);
  }

  const data = await apiResponse.json();
  const textBlock = (data.content || []).find(b => b.type === 'text');
  const rawText = (textBlock ? textBlock.text.trim() : '')
    .replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');

  try {
    return { rawText, parsed: JSON.parse(rawText), parseError: null };
  } catch (e) {
    return { rawText, parsed: null, parseError: e.message };
  }
}

// Tee colours on a card, longest total first. (Postgres JSONB reorders object
// keys, so key order can't be trusted to mean anything.)
function teesByLength(scorecard) {
  if (!isScorecard(scorecard)) return [];
  const totals = {};
  scorecard.forEach(h => Object.entries(h.yards || {}).forEach(([tee, y]) => {
    totals[tee] = (totals[tee] || 0) + (Number(y) || 0);
  }));
  return Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
}

// Total par, and total yardage from the longest tee.
function deriveTotals(scorecard) {
  if (!isScorecard(scorecard)) return { par: null, yardage: null, tee: null };
  const par = scorecard.reduce((s, h) => s + (Number(h.par) || 0), 0) || null;
  const tee = teesByLength(scorecard)[0] || null;
  const yardage = tee ? scorecard.reduce((s, h) => s + (Number(h.yards && h.yards[tee]) || 0), 0) || null : null;
  return { par, yardage, tee };
}

module.exports = { extractScorecardFromImage, deriveTotals, isScorecard, teesByLength };
