import { WeatherData } from '../types';

// Open-Meteo: free, no API key required
// WMO weather interpretation codes -> human-readable condition
function wmoToCondition(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 49) return 'Foggy';
  if (code <= 59) return 'Drizzle';
  if (code <= 69) return 'Rain';
  if (code <= 79) return 'Snow';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  if (code <= 99) return 'Thunderstorm';
  return 'Unknown';
}

export async function fetchWeather(
  latitude: number,
  longitude: number
): Promise<WeatherData | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m,precipitation` +
      `&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch` +
      `&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const c = data.current;

    return {
      temp_f: Math.round(c.temperature_2m),
      condition: wmoToCondition(c.weathercode),
      wind_mph: Math.round(c.windspeed_10m),
      humidity: Math.round(c.relativehumidity_2m),
      precip_in: c.precipitation ?? 0,
    };
  } catch {
    return null;
  }
}

export async function fetchHistoricalWeather(
  latitude: number,
  longitude: number,
  date: string, // YYYY-MM-DD
): Promise<WeatherData | null> {
  try {
    const url =
      `https://archive-api.open-meteo.com/v1/archive` +
      `?latitude=${latitude}&longitude=${longitude}` +
      `&start_date=${date}&end_date=${date}` +
      `&daily=temperature_2m_max,weathercode,windspeed_10m_max,precipitation_sum` +
      `&hourly=relativehumidity_2m` +
      `&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch` +
      `&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const daily = data.daily;
    // Use noon humidity as a representative daily value
    const humidity = data.hourly?.relativehumidity_2m?.[12] ?? null;

    return {
      temp_f: Math.round(daily.temperature_2m_max[0]),
      condition: wmoToCondition(daily.weathercode[0]),
      wind_mph: Math.round(daily.windspeed_10m_max[0]),
      humidity: humidity !== null ? Math.round(humidity) : 0,
      precip_in: daily.precipitation_sum[0] ?? 0,
    };
  } catch {
    return null;
  }
}

// Reverse geocode using Open-Meteo's companion geocoder (nominatim fallback)
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<{ city?: string; state?: string; locationName?: string }> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'CrewCast/1.0' },
    });
    if (!res.ok) return {};
    const data = await res.json();
    const addr = data.address ?? {};
    const city = addr.city ?? addr.town ?? addr.village ?? addr.county ?? '';
    const state = addr.state ?? '';
    const locationName = [city, addr.state_code ?? state].filter(Boolean).join(', ');
    return { city, state, locationName };
  } catch {
    return {};
  }
}
