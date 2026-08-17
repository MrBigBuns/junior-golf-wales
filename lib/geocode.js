// Geocode an address to {lat, lng} using OpenStreetMap's Nominatim.
// Free, no API key — but rate-limited to ~1 request/sec and requires an
// identifying User-Agent per Nominatim's usage policy. Only called on
// admin save (low volume), never on a public page load.
async function geocodeAddress(address) {
  if (!address || !address.trim()) return null;

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

module.exports = { geocodeAddress };
