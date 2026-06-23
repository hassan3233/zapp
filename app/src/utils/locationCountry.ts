import { requireOptionalNativeModule } from "expo-modules-core";
import { detectDeviceRegion } from "../i18n/i18n";
import { countryByCode, defaultCountry, type Country } from "../data/countries";

// expo-cellular / expo-location are optional: a build may not include them, and
// importing their JS throws if the native side is missing. So we first ask
// expo-modules-core whether the native module exists (returns null, no throw),
// and only require the package when it's actually present — otherwise we fall
// back to the device region.

// 1) SIM / mobile-network country — no permission prompt, like WhatsApp.
async function simCountry(): Promise<string | null> {
  if (!requireOptionalNativeModule("ExpoCellular")) return null;
  try {
    const Cellular = require("expo-cellular");
    if (typeof Cellular.getIsoCountryCodeAsync === "function") {
      const iso = await Cellular.getIsoCountryCodeAsync();
      if (iso) return String(iso).toUpperCase();
    }
    if (Cellular.isoCountryCode) return String(Cellular.isoCountryCode).toUpperCase();
  } catch {
    /* ignore */
  }
  return null;
}

// 2) GPS physical location → reverse-geocode to a country (asks permission).
async function gpsCountry(): Promise<string | null> {
  if (!requireOptionalNativeModule("ExpoLocation")) return null;
  try {
    const Location = require("expo-location");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    let pos = await Location.getLastKnownPositionAsync().catch(() => null);
    if (!pos) {
      pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy?.Low ?? 1,
      }).catch(() => null);
    }
    if (!pos) return null;
    const places = await Location.reverseGeocodeAsync({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    });
    const iso = places?.[0]?.isoCountryCode;
    return iso ? String(iso).toUpperCase() : null;
  } catch {
    /* ignore */
  }
  return null;
}

// Resolve the best country for the phone screen:
// SIM/network → GPS → device region → United States.
export async function detectCountry(): Promise<Country> {
  const sim = await simCountry();
  if (sim && countryByCode(sim)) return countryByCode(sim)!;

  const gps = await gpsCountry();
  if (gps && countryByCode(gps)) return countryByCode(gps)!;

  return defaultCountry(detectDeviceRegion());
}
