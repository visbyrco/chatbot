import { tool } from "ai";
import { z } from "zod";

async function geocodeCity(
  city: string
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return null;
    }

    const [result] = data.results;
    return {
      latitude: result.latitude,
      longitude: result.longitude,
    };
  } catch {
    return null;
  }
}

export const getWeather = tool({
  description:
    "Get the current weather at a location. You can provide either coordinates or a city name.",
  execute: async (input) => {
    let latitude: number;
    let longitude: number;

    if (typeof input.city === "string" && input.city.trim().length > 0) {
      const trimmedCity = input.city.trim();
      const coords = await geocodeCity(trimmedCity);
      if (!coords) {
        return {
          error: `Could not find coordinates for "${trimmedCity}". Please check the city name.`,
        };
      }
      ({ latitude, longitude } = coords);
    } else if (input.latitude !== undefined && input.longitude !== undefined) {
      const { latitude: inputLatitude, longitude: inputLongitude } = input;
      latitude = inputLatitude;
      longitude = inputLongitude;
    } else {
      return {
        error:
          "Please provide either a city name or both latitude and longitude coordinates.",
      };
    }

    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) {
      return { error: `Weather API error: ${response.status}` };
    }

    const weatherData = await response.json();

    if ("city" in input) {
      weatherData.cityName = input.city;
    }

    return weatherData;
  },
  inputSchema: z.object({
    city: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .describe("City name (e.g., 'San Francisco', 'New York', 'London')")
      .optional(),
    latitude: z
      .number()
      .finite()
      .min(-90)
      .max(90)
      .describe(
        "Latitude in decimal degrees (e.g., 37.7749). Required when no city name is provided."
      )
      .optional(),
    longitude: z
      .number()
      .finite()
      .min(-180)
      .max(180)
      .describe(
        "Longitude in decimal degrees (e.g., -122.4194). Required when no city name is provided."
      )
      .optional(),
  }),
});
