package __PACKAGE__

import android.content.Intent
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Fully restarts the app process from JS (NativeModules.AppRestart.restart()).
 *
 * Needed for right-to-left languages: React Native's I18nManager only reads the
 * layout-direction (RTL) flag when the native process starts, so forceRTL(true)
 * has no visible effect until the app relaunches. We launch a fresh copy of the
 * launcher task WHILE the app is still in the foreground (so Android allows the
 * activity start — a launch scheduled after the process dies would be blocked as
 * a background start), then kill this process. On relaunch RN reads the persisted
 * RTL flag and mirrors the whole UI. Uses only Android APIs, so it is safe under
 * the new architecture.
 */
class RestartModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "AppRestart"

  @ReactMethod
  fun restart() {
    val ctx = reactApplicationContext
    val launch =
      ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return
    val component = launch.component ?: return
    val activity = ctx.currentActivity
    // Brief delay so any pending SharedPreferences writes (notably I18nManager's
    // RTL flag, written with apply()) flush before we exit — otherwise the app
    // could relaunch in the previous direction. The app is still foreground
    // during this delay, so the activity start below is permitted.
    Handler(Looper.getMainLooper()).postDelayed({
      val restartIntent = Intent.makeRestartActivityTask(component)
      (activity ?: ctx).startActivity(restartIntent)
      Runtime.getRuntime().exit(0)
    }, 150)
  }
}
