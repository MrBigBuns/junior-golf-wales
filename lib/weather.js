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

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max` +
      `&timezone=Europe%2FLondon&start_date=${dateStr}&end_date=${dateStr}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.daily || !data.daily.time || !data.daily.time.length) return null;

    return {
      maxTemp: Math.round(data.daily.temperature_2m_max[0]),
      minTemp: Math.round(data.daily.temperature_2m_min[0]),
      rainChance: Math.round(data.daily.precipitation_probability_max[0]),
      windSpeed: Math.round(data.daily.windspeed_10m_max[0])
    };
  } catch (e) {
    return null;
  }
}

module.exports = { getForecastForDate };
