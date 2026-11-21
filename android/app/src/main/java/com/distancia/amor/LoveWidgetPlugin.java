package com.distancia.amor;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.UUID;

@CapacitorPlugin(name = "LoveWidget")
public class LoveWidgetPlugin extends Plugin {

    public static String resolveDeviceId(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(
                LoveWidgetProvider.PREFS_NAME,
                Context.MODE_PRIVATE
        );
        String saved = prefs.getString("deviceId", "");
        if (saved != null && !saved.isEmpty()) {
            return saved;
        }
        String androidId = Settings.Secure.getString(
                context.getContentResolver(),
                Settings.Secure.ANDROID_ID
        );
        String resolved = (androidId != null && !androidId.isEmpty())
                ? "and-" + androidId
                : "and-" + UUID.randomUUID().toString().substring(0, 12);
        prefs.edit().putString("deviceId", resolved).apply();
        return resolved;
    }

    @PluginMethod
    public void getDeviceId(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("deviceId", resolveDeviceId(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void syncConfig(PluginCall call) {
        Context context = getContext();
        String deviceId = call.getString("deviceId", resolveDeviceId(context));
        String senderName = call.getString("senderName", "Tu Amor");
        String serverUrl = call.getString("serverUrl", LoveWidgetProvider.DEFAULT_SERVER_URL);
        String targetType = call.getString("targetType", "user");
        String targetId = call.getString("targetId", "");
        String targetLabel = call.getString("targetLabel", "Tu Pareja");
        String targetDistance = call.getString("targetDistance", "En vivo");

        SharedPreferences prefs = context.getSharedPreferences(
                LoveWidgetProvider.PREFS_NAME,
                Context.MODE_PRIVATE
        );
        prefs.edit()
                .putString("deviceId", deviceId)
                .putString("senderName", senderName)
                .putString("serverUrl", serverUrl)
                .putString("targetType", targetType)
                .putString("targetId", targetId)
                .putString("targetLabel", targetLabel)
                .putString("targetDistance", targetDistance)
                .apply();

        Intent serviceIntent = new Intent(context, LoveNotificationService.class);
        serviceIntent.setAction(LoveNotificationService.ACTION_REFRESH);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }

        call.resolve();
    }
}
