// Geocode an address to {lat, lng}.
//
// Primary method: extract a UK postcode from the address and look it up via
// Postcodes.io — free, no API key, no known issue with cloud-hosting IPs
// (unlike Nominatim below), and precise since it's UK-postcode-specific.
//
// Fallback: OpenStreetMap's Nominatim, full-address search. Kept as a
// fallback only — Nominatim is known to block/rate-limit requests from
// cloud hosting IPs (AWS, Render, etc.), so it's unreliable from this app,
// but worth trying for addresses where no postcode could be extracted.

function extractUkPostcode(address) {
  if (!address) return null;
  const match = address.match(/[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}/i);
  return match ? match[0].toUpperCase() : null;
}

async function geocodeByPostcode(postcode) {
  try {
    const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s+/g, ''))}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.result) return null;
    return { lat: data.result.latitude, lng: data.result.longitude };
  } catch (e) {
    return null;
  }
}

async function geocodeAddress(address) {
  if (!address || !address.trim()) return null;

  const postcode = extractUkPostcode(address);
  if (postcode) {
    const result = await geocodeByPostcode(postcode);
    if (result) return result;
  }

  // Fallback: Nominatim, full address. Unreliable from cloud IPs, but
  // worth a try if postcode lookup wasn't available or failed.
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'JuniorGolfWales/1.0 (https://junior-golf-wales.onrender.com)' }
    });
    if (!res.ok) return null;
    const results = await res.json();
    if (!results.length) return null;
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
  } catch (e) {
    return null;
  }
}

module.exports = { geocodeAddress, geocodeByPostcode, extractUkPostcode };
