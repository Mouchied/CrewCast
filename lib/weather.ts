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
