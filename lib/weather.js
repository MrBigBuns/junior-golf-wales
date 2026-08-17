// Fetch a day's forecast from Open-Meteo (free, no API key required).
// Only useful within roughly the next 16 days — returns null outside that
// window or if anything goes wrong, so callers can fall back gracefully.
async function getForecastForDate(lat, lng, dateStr) {
  if (lat == null || lng == null || !dateStr) return null;

  const eventDate = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntil = Math.round((eventDate - today) / (1000 * 60 * 60 * 24));

  if (daysUntil < 0 || daysUntil > 15) return null;

  const formattedDate = eventDate.toISOString().slice(0, 10);

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max` +
      `&timezone=Europe%2FLondon&start_date=${formattedDate}&end_date=${formattedDate}`;
    const res = await fetch(url);
    if (!res.ok) {
      const errText = await res.text();
      console.error(`Open-Meteo request failed (${res.status}): ${errText.slice(0, 300)}`);
      return null;
    }
    const data = await res.json();
    if (!data.daily || !data.daily.time || !data.daily.time.length) {
      console.error('Open-Meteo response missing expected daily data:', JSON.stringify(data).slice(0, 300));
      return null;
    }

    return {
      maxTemp: Math.round(data.daily.temperature_2m_max[0]),
      minTemp: Math.round(data.daily.temperature_2m_min[0]),
      rainChance: Math.round(data.daily.precipitation_probability_max[0]),
      windSpeed: Math.round(data.daily.wind_speed_10m_max[0])
    };
  } catch (e) {
    console.error('Open-Meteo fetch threw:', e.message);
    return null;
  }
}

module.exports = { getForecastForDate };
