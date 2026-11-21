package com.distancia.amor;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.widget.RemoteViews;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;

public class LoveWidgetProvider extends AppWidgetProvider {

    public static final String ACTION_SEND_LOVE = "com.distancia.amor.ACTION_SEND_LOVE";
    public static final String PREFS_NAME = "love_widget_prefs";
    public static final String DEFAULT_SERVER_URL = "https://applovedistance.onrender.com";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String status = prefs.getString("lastStatus", "Envía un Te amo rápido");

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = buildRemoteViews(context, status);
            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_SEND_LOVE.equals(intent.getAction())) {
            PendingResult pendingResult = goAsync();
            sendLoveInBackground(context.getApplicationContext(), pendingResult);
        }
    }

    private static RemoteViews buildRemoteViews(Context context, String statusText) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.love_widget);
        views.setTextViewText(R.id.widget_status, statusText);

        // Tapping the send button dispatches a background broadcast without opening the app
        Intent sendIntent = new Intent(context, LoveWidgetProvider.class);
        sendIntent.setAction(ACTION_SEND_LOVE);
        PendingIntent sendPendingIntent = PendingIntent.getBroadcast(
                context,
                1001,
                sendIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_send_btn, sendPendingIntent);

        // Tapping the text area opens the full app
        Intent openAppIntent = new Intent(context, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openAppPending = PendingIntent.getActivity(
                context,
                1002,
                openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_info_area, openAppPending);

        return views;
    }

    private static void updateAllWidgets(Context context, String statusText) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, LoveWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        if (ids != null && ids.length > 0) {
            for (int id : ids) {
                manager.updateAppWidget(id, buildRemoteViews(context, statusText));
            }
        }
    }

    private static void sendLoveInBackground(Context context, PendingResult pendingResult) {
        Handler mainHandler = new Handler(Looper.getMainLooper());
        new Thread(() -> {
            boolean success = false;
            String timeLabel = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date());
            try {
                SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                String serverUrl = prefs.getString("serverUrl", DEFAULT_SERVER_URL);
                if (serverUrl == null || serverUrl.trim().isEmpty()) {
                    serverUrl = DEFAULT_SERVER_URL;
                }
                serverUrl = serverUrl.trim().replaceAll("/+$", "");

                String senderName = prefs.getString("senderName", "Tu Amor");
                if (senderName == null || senderName.trim().isEmpty()) {
                    senderName = "Tu Amor";
                }

                JSONObject body = new JSONObject();
                body.put("id", "widget-" + System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 6));
                body.put("senderId", "widget-" + android.os.Build.MODEL);
                body.put("senderName", senderName);
                body.put("message", "Te amo ❤️");
                body.put("sentAt", timeLabel);

                URL url = new URL(serverUrl + "/api/love");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }

                int code = conn.getResponseCode();
                success = (code >= 200 && code < 300);
                conn.disconnect();
            } catch (Exception ignored) {
                success = false;
            }

            final boolean ok = success;
            mainHandler.post(() -> {
                if (ok) {
                    String status = "¡Enviado a las " + timeLabel + "! ❤️";
                    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                            .edit()
                            .putString("lastStatus", status)
                            .apply();
                    updateAllWidgets(context, status);
                    Toast.makeText(context, "¡Enviaste un \"Te amo\" ❤️!", Toast.LENGTH_SHORT).show();
                } else {
                    Toast.makeText(context, "Sin conexión al servidor. Intenta de nuevo.", Toast.LENGTH_SHORT).show();
                }
                pendingResult.finish();
            });
        }).start();
    }
}
