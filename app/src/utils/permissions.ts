import { requireOptionalNativeModule } from "expo-modules-core";

export type PermResult = { contacts: boolean; location: boolean };

// Ask for contacts + location at the OS level. Each native module is optional —
// if a build doesn't include it (e.g. the current dev client) we skip it instead
// of crashing. Gating with requireOptionalNativeModule avoids the dev red box
// that a bare `require()` of a missing native module would trigger.
export async function requestOnboardingPermissions(): Promise<PermResult> {
  const result: PermResult = { contacts: false, location: false };

  if (requireOptionalNativeModule("ExpoContactsNext")) {
    try {
      const Contacts = require("expo-contacts");
      const { status } = await Contacts.requestPermissionsAsync();
      result.contacts = status === "granted";
    } catch {
      /* ignore */
    }
  }

  if (requireOptionalNativeModule("ExpoLocation")) {
    try {
      const Location = require("expo-location");
      const { status } = await Location.requestForegroundPermissionsAsync();
      result.location = status === "granted";
    } catch {
      /* ignore */
    }
  }

  return result;
}
