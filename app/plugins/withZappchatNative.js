const {
  AndroidConfig,
  withAndroidManifest,
  withAndroidStyles,
  withDangerousMod,
  withMainActivity,
  withMainApplication,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Kotlin sources live next to this plugin (plugins/native/*.kt) rather than as
// giant strings in here. `package __PACKAGE__` is rewritten on copy.
const NATIVE_SOURCES = [
  "RestartModule.kt",
  "IncomingCallModule.kt",
  "ZappchatPackage.kt",
];

// ---------------------------------------------------------------------------
// 1. System bars: don't let Android paint a "contrast" scrim behind the
//    transparent status/navigation bars. On Samsung One UI that scrim showed up
//    as a second grey band under the chat composer, so the input bar looked
//    doubled. Needs API 29+, hence tools:targetApi.
// ---------------------------------------------------------------------------
function withoutSystemBarContrast(config) {
  return withAndroidStyles(config, (cfg) => {
    const { assignStylesValue, getAppThemeGroup } = AndroidConfig.Styles;
    for (const name of [
      "android:enforceStatusBarContrast",
      "android:enforceNavigationBarContrast",
    ]) {
      cfg.modResults = assignStylesValue(cfg.modResults, {
        add: true,
        parent: getAppThemeGroup(),
        name,
        value: "false",
        targetApi: "29",
      });
    }
    return cfg;
  });
}

// ---------------------------------------------------------------------------
// 2. Copy Zappchat's native modules in and register them.
//
//    RestartModule   — full process restart, so I18nManager's RTL flag actually
//                      takes effect when switching to Arabic/Farsi/Urdu.
//    IncomingCallModule — full-screen ringing call notification over the lock
//                      screen (the phone used to stay silent when locked).
// ---------------------------------------------------------------------------
function withNativeModules(config) {
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const pkg = AndroidConfig.Package.getPackage(cfg);
      if (!pkg) {
        throw new Error(
          "withZappchatNative: expo.android.package is not set in app.json"
        );
      }
      const destDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        ...pkg.split(".")
      );
      fs.mkdirSync(destDir, { recursive: true });
      for (const file of NATIVE_SOURCES) {
        const src = path.join(__dirname, "native", file);
        const body = fs.readFileSync(src, "utf8").replace(/__PACKAGE__/g, pkg);
        fs.writeFileSync(path.join(destDir, file), body, "utf8");
      }
      return cfg;
    },
  ]);

  config = withMainApplication(config, (cfg) => {
    const contents = cfg.modResults.contents;
    if (contents.includes("add(ZappchatPackage())")) return cfg;

    const anchor = /(PackageList\(this\)\.packages\.apply\s*\{)/;
    if (!anchor.test(contents)) {
      throw new Error(
        "withZappchatNative: could not find PackageList(this).packages.apply { in MainApplication — " +
          "the Expo template changed, update this plugin."
      );
    }
    cfg.modResults.contents = contents.replace(
      anchor,
      "$1\n          add(ZappchatPackage())"
    );
    return cfg;
  });

  return config;
}

// ---------------------------------------------------------------------------
// 3. Let an incoming call's full-screen intent wake the device and draw over
//    the lock screen. Without this a locked phone just buzzes and the call UI
//    sits behind the keyguard where nobody can answer it.
// ---------------------------------------------------------------------------
function withShowWhenLocked(config) {
  return withMainActivity(config, (cfg) => {
    const contents = cfg.modResults.contents;
    if (contents.includes("setShowWhenLocked")) return cfg;

    const anchor = /(super\.onCreate\(null\))/;
    if (!anchor.test(contents)) {
      throw new Error(
        "withZappchatNative: could not find super.onCreate(null) in MainActivity — " +
          "the Expo template changed, update this plugin."
      );
    }
    cfg.modResults.contents = contents.replace(
      anchor,
      `$1
    // Let an incoming call's full-screen intent wake the device and draw over
    // the lock screen.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    }`
    );
    return cfg;
  });
}

// ---------------------------------------------------------------------------
// 4. USE_FULL_SCREEN_INTENT — required to show the ringing call over the lock
//    screen. (On Android 14+ this is only auto-granted to calling apps; without
//    the grant the call still rings, just as a heads-up banner.)
// ---------------------------------------------------------------------------
function withFullScreenIntentPermission(config) {
  return withAndroidManifest(config, (cfg) => {
    AndroidConfig.Permissions.ensurePermissions(cfg.modResults, [
      "android.permission.USE_FULL_SCREEN_INTENT",
    ]);
    return cfg;
  });
}

/**
 * Keeps Zappchat's hand-written Android tweaks reproducible: `expo prebuild`
 * regenerates them, so a fresh clone builds without any manual native edits.
 */
module.exports = function withZappchatNative(config) {
  config = withoutSystemBarContrast(config);
  config = withNativeModules(config);
  config = withShowWhenLocked(config);
  config = withFullScreenIntentPermission(config);
  return config;
};
