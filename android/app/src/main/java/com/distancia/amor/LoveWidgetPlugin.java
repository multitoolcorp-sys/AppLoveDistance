package com.distancia.amor;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LoveWidget")
public class LoveWidgetPlugin extends Plugin {

    @PluginMethod
    public void syncConfig(PluginCall call) {
        String senderName = call.getString("senderName", "Tu Amor");
        String serverUrl = call.getString("serverUrl", LoveWidgetProvider.DEFAULT_SERVER_URL);

        SharedPreferences prefs = getContext().getSharedPreferences(
                LoveWidgetProvider.PREFS_NAME,
                Context.MODE_PRIVATE
        );
        prefs.edit()
                .putString("senderName", senderName)
                .putString("serverUrl", serverUrl)
                .apply();

        call.resolve();
    }
}
