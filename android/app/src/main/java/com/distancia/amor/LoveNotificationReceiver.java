package com.distancia.amor;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

import androidx.core.app.RemoteInput;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;

public class LoveNotificationReceiver extends BroadcastReceiver {

    public static final String ACTION_SEND_LOVE = "com.distancia.amor.NOTIF_SEND_LOVE";
    public static final String ACTION_REPLY_LOVE = "com.distancia.amor.NOTIF_REPLY_LOVE";
    public static final String KEY_TEXT_REPLY = "key_text_reply";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_SEND_LOVE.equals(action)) {
            PendingResult pending = goAsync();
            SharedPreferences prefs = context.getSharedPreferences(LoveWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE);
            String targetType = prefs.getString("targetType", "user");
            String targetId = prefs.getString("targetId", "");
            sendPost(context.getApplicationContext(), targetType, targetId, "Te amo ❤️", -1, pending);
        } else if (ACTION_REPLY_LOVE.equals(action)) {
            Bundle remoteInput = RemoteInput.getResultsFromIntent(intent);
            if (remoteInput == null) return;
            CharSequence replyText = remoteInput.getCharSequence(KEY_TEXT_REPLY);
            if (replyText == null || replyText.toString().trim().isEmpty()) return;

            PendingResult pending = goAsync();
            String targetType = intent.getStringExtra("replyTargetType");
            String targetId = intent.getStringExtra("replyTargetId");
            int notifId = intent.getIntExtra("notifId", -1);
            sendPost(
                    context.getApplicationContext(),
                    targetType != null ? targetType : "user",
                    targetId != null ? targetId : "",
                    replyText.toString().trim(),
                    notifId,
                    pending
            );
        }
    }

    private void sendPost(
            Context context,
            String targetType,
            String targetId,
            String message,
            int notifIdToCancel,
            PendingResult pending
    ) {
        Handler mainHandler = new Handler(Looper.getMainLooper());
        new Thread(() -> {
            boolean ok = false;
            try {
                SharedPreferences prefs = context.getSharedPreferences(LoveWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE);
                String serverUrl = prefs.getString("serverUrl", LoveWidgetProvider.DEFAULT_SERVER_URL);
                if (serverUrl == null || serverUrl.trim().isEmpty()) {
                    serverUrl = LoveWidgetProvider.DEFAULT_SERVER_URL;
                }
                serverUrl = serverUrl.trim().replaceAll("/+$", "");

                String deviceId = prefs.getString("deviceId", LoveWidgetPlugin.resolveDeviceId(context));
                String senderAlias = prefs.getString("senderName", "Tu Amor");
                String timeLabel = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date());

                JSONObject body = new JSONObject();
                body.put("id", "notif-" + System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 6));
                body.put("senderId", deviceId);
                body.put("senderAlias", senderAlias);
                body.put("targetType", targetType);
                body.put("targetId", targetId);
                body.put("message", message);
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
                ok = (code >= 200 && code < 300);
                conn.disconnect();
            } catch (Exception ignored) {
                ok = false;
            }

            final boolean success = ok;
            mainHandler.post(() -> {
                if (notifIdToCancel > 0) {
                    NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) nm.cancel(notifIdToCancel);
                }
                Toast.makeText(
                        context,
                        success ? "Enviado: " + message : "Primero haz Match con alguien o revisa tu red",
                        Toast.LENGTH_SHORT
                ).show();
                pending.finish();
            });
        }).start();
    }
}
