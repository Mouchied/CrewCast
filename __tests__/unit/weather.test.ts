/**
 * Unit tests for lib/weather.ts
 *
 * Tests the WMO weather-code mapping and data-shape transformation.
 * `fetch` is mocked so these run fully offline — no network required.
 */

import { fetchWeather, fetchHistoricalWeather } from '../../lib/weather';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeFetchMock(body: unknown, ok = true) {
  return jest.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  });
}

// ─── fetchWeather ─────────────────────────────────────────────────────────────

describe('fetchWeather', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null when the response is not ok', async () => {
    global.fetch = makeFetchMock({}, false);
    const result = await fetchWeather(37.77, -122.42);
    expect(result).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
    const result = await fetchWeather(37.77, -122.42);
    expect(result).toBeNull();
  });

  const wmoConditionCases: Array<[number, string]> = [
    [0, 'Clear'],
    [1, 'Partly cloudy'],
    [3, 'Partly cloudy'],
    [45, 'Foggy'],
    [55, 'Drizzle'],
    [65, 'Rain'],
    [75, 'Snow'],
    [80, 'Rain showers'],
    [85, 'Snow showers'],
    [95, 'Thunderstorm'],
    [99, 'Thunderstorm'],
    [100, 'Unknown'],
  ];

  test.each(wmoConditionCases)(
    'WMO code %i maps to condition %s',
    async (code, expectedCondition) => {
      global.fetch = makeFetchMock({
        current: {
          temperature_2m: 72.4,
          weathercode: code,
          windspeed_10m: 8.6,
          relativehumidity_2m: 55.2,
          precipitation: 0,
        },
      });

      const result = await fetchWeather(37.77, -122.42);
      expect(result).not.toBeNull();
      expect(result!.condition).toBe(expectedCondition);
    }
  );

  it('rounds numeric fields', async () => {
    global.fetch = makeFetchMock({
      current: {
        temperature_2m: 72.6,
        weathercode: 0,
        windspeed_10m: 8.4,
        relativehumidity_2m: 55.9,
        precipitation: 0.12,
      },
    });

    const result = await fetchWeather(37.77, -122.42);
    expect(result).toEqual({
      temp_f: 73,         // Math.round(72.6)
      condition: 'Clear',
      wind_mph: 8,        // Math.round(8.4)
      humidity: 56,       // Math.round(55.9)
      precip_in: 0.12,
    });
  });

  it('defaults precip_in to 0 when field is null', async () => {
    global.fetch = makeFetchMock({
      current: {
        temperature_2m: 60,
        weathercode: 0,
        windspeed_10m: 5,
        relativehumidity_2m: 40,
        precipitation: null,
      },
    });

    const result = await fetchWeather(37.77, -122.42);
    expect(result!.precip_in).toBe(0);
  });
});

// ─── fetchHistoricalWeather ───────────────────────────────────────────────────

describe('fetchHistoricalWeather', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null when the response is not ok', async () => {
    global.fetch = makeFetchMock({}, false);
    const result = await fetchHistoricalWeather(37.77, -122.42, '2026-03-01');
    expect(result).toBeNull();
  });

  it('uses noon humidity (index 12) from hourly array', async () => {
    const hourlyHumidity = new Array(24).fill(0).map((_, i) => i * 3); // noon = index 12 → 36
    global.fetch = makeFetchMock({
      daily: {
        temperature_2m_max: [65.2],
        weathercode: [0],
        windspeed_10m_max: [10.0],
        precipitation_sum: [0.05],
      },
      hourly: { relativehumidity_2m: hourlyHumidity },
    });

    const result = await fetchHistoricalWeather(37.77, -122.42, '2026-03-01');
    expect(result!.humidity).toBe(36); // Math.round(36)
  });

  it('defaults humidity to 0 when hourly data is missing', async () => {
    global.fetch = makeFetchMock({
      daily: {
        temperature_2m_max: [65.2],
        weathercode: [0],
        windspeed_10m_max: [10.0],
        precipitation_sum: [0.0],
      },
    });

    const result = await fetchHistoricalWeather(37.77, -122.42, '2026-03-01');
    expect(result!.humidity).toBe(0);
  });
});
