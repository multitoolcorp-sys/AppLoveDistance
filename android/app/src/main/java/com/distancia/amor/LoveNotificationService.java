package com.distancia.amor;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

public class LoveNotificationService extends Service {

    public static final String CHANNEL_PLAYER = "love_player_channel";
    public static final String CHANNEL_MESSAGES = "love_messages_channel";
    public static final int PLAYER_NOTIFICATION_ID = 7001;
    public static final String ACTION_REFRESH = "com.distancia.amor.REFRESH_NOTIFICATION";

    private volatile boolean running = false;
    private Thread sseThread;
    private HttpURLConnection activeConnection;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification playerNotification = buildPlayerNotification(this);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                    PLAYER_NOTIFICATION_ID,
                    playerNotification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            );
        } else {
            startForeground(PLAYER_NOTIFICATION_ID, playerNotification);
        }

        if (!running) {
            running = true;
            startSseLoop();
        } else if (intent != null && ACTION_REFRESH.equals(intent.getAction())) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(PLAYER_NOTIFICATION_ID, playerNotification);
            }
        }

        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        if (activeConnection != null) {
            activeConnection.disconnect();
        }
        if (sseThread != null) {
            sseThread.interrupt();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;

        NotificationChannel playerChannel = new NotificationChannel(
                CHANNEL_PLAYER,
                "Barra rápida Distancia de Amor",
                NotificationManager.IMPORTANCE_LOW
        );
        playerChannel.setDescription("Notificación fija estilo reproductor para enviar Te amo rápido");
        playerChannel.setShowBadge(false);
        nm.createNotificationChannel(playerChannel);

        NotificationChannel msgChannel = new NotificationChannel(
                CHANNEL_MESSAGES,
                "Mensajes de Te amo",
                NotificationManager.IMPORTANCE_HIGH
        );
        msgChannel.setDescription("Notificaciones al recibir un Te amo con opción de responder");
        nm.createNotificationChannel(msgChannel);
    }

    public static Notification buildPlayerNotification(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(LoveWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE);
        String targetLabel = prefs.getString("targetLabel", "Tu Pareja");
        String targetDistance = prefs.getString("targetDistance", "En vivo");

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
                context,
                2001,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent sendIntent = new Intent(context, LoveNotificationReceiver.class);
        sendIntent.setAction(LoveNotificationReceiver.ACTION_SEND_LOVE);
        PendingIntent sendPending = PendingIntent.getBroadcast(
                context,
                2002,
                sendIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(context, CHANNEL_PLAYER)
                .setSmallIcon(android.R.drawable.btn_star_big_on)
                .setContentTitle("💖 " + targetLabel + " · " + targetDistance)
                .setContentText("Pulsa para enviar \"Te amo ❤️\"")
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(openPending)
                .addAction(
                        android.R.drawable.ic_menu_send,
                        "Enviar Te amo ❤️",
                        sendPending
                )
                .build();
    }

    private void startSseLoop() {
        sseThread = new Thread(() -> {
            while (running) {
                try {
                    SharedPreferences prefs = getSharedPreferences(LoveWidgetProvider.PREFS_NAME, MODE_PRIVATE);
                    String serverUrl = prefs.getString("serverUrl", LoveWidgetProvider.DEFAULT_SERVER_URL);
                    if (serverUrl == null || serverUrl.trim().isEmpty()) {
                        serverUrl = LoveWidgetProvider.DEFAULT_SERVER_URL;
                    }
                    serverUrl = serverUrl.trim().replaceAll("/+$", "");

                    String deviceId = prefs.getString("deviceId", LoveWidgetPlugin.resolveDeviceId(this));
                    String alias = prefs.getString("senderName", "Tu Amor");

                    String query = "?deviceId=" + URLEncoder.encode(deviceId, "UTF-8")
                            + "&alias=" + URLEncoder.encode(alias, "UTF-8");
                    URL url = new URL(serverUrl + "/api/events" + query);

                    activeConnection = (HttpURLConnection) url.openConnection();
                    activeConnection.setRequestMethod("GET");
                    activeConnection.setConnectTimeout(15000);
                    activeConnection.setReadTimeout(65000);

                    try (BufferedReader reader = new BufferedReader(
                            new InputStreamReader(activeConnection.getInputStream(), StandardCharsets.UTF_8))) {
                        String line;
                        String currentEvent = "";
                        while (running && (line = reader.readLine()) != null) {
                            if (line.startsWith("event:")) {
                                currentEvent = line.substring(6).trim();
                            } else if (line.startsWith("data:") && "love".equals(currentEvent)) {
                                String jsonStr = line.substring(5).trim();
                                handleLoveEvent(jsonStr, deviceId);
                                currentEvent = "";
                            } else if (line.isEmpty()) {
                                currentEvent = "";
                            }
                        }
                    }
                } catch (Exception ignored) {
                    // Reconnect after pause
                } finally {
                    if (activeConnection != null) {
                        activeConnection.disconnect();
                        activeConnection = null;
                    }
                }

                if (running) {
                    try {
                        Thread.sleep(4000);
                    } catch (InterruptedException ignored) {
                        break;
                    }
                }
            }
        });
        sseThread.start();
    }

    private void handleLoveEvent(String jsonStr, String myDeviceId) {
        try {
            JSONObject obj = new JSONObject(jsonStr);
            String senderId = obj.optString("senderId", "");
            if (senderId.isEmpty() || senderId.equals(myDeviceId)) {
                return;
            }

            String senderAlias = obj.optString("senderAlias", "Tu Amor");
            String message = obj.optString("message", "Te amo ❤️");
            String targetType = obj.optString("targetType", "user");
            String targetId = obj.optString("targetId", "");
            String groupName = obj.optString("groupName", "");

            SharedPreferences prefs = getSharedPreferences(LoveWidgetProvider.PREFS_NAME, MODE_PRIVATE);
            String distance = prefs.getString("targetDistance", "");

            String title = groupName.isEmpty()
                    ? "💖 " + senderAlias + (distance.isEmpty() ? "" : " · " + distance)
                    : "💖 [" + groupName + "] " + senderAlias;

            String replyTargetType = "group".equals(targetType) && !targetId.isEmpty() ? "group" : "user";
            String replyTargetId = "group".equals(replyTargetType) ? targetId : senderId;
            int notifId = (int) (System.currentTimeMillis() % 100000) + 8000;

            RemoteInput remoteInput = new RemoteInput.Builder(LoveNotificationReceiver.KEY_TEXT_REPLY)
                    .setLabel("Responder a " + senderAlias + "...")
                    .build();

            Intent replyIntent = new Intent(this, LoveNotificationReceiver.class);
            replyIntent.setAction(LoveNotificationReceiver.ACTION_REPLY_LOVE);
            replyIntent.putExtra("replyTargetType", replyTargetType);
            replyIntent.putExtra("replyTargetId", replyTargetId);
            replyIntent.putExtra("notifId", notifId);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                flags |= PendingIntent.FLAG_MUTABLE;
            }
            PendingIntent replyPending = PendingIntent.getBroadcast(this, notifId, replyIntent, flags);

            NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
                    android.R.drawable.ic_menu_send,
                    "Responder",
                    replyPending
            ).addRemoteInput(remoteInput).build();

            Intent openIntent = new Intent(this, MainActivity.class);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent openPending = PendingIntent.getActivity(
                    this,
                    notifId + 1,
                    openIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            Notification msgNotif = new NotificationCompat.Builder(this, CHANNEL_MESSAGES)
                    .setSmallIcon(android.R.drawable.btn_star_big_on)
                    .setContentTitle(title)
                    .setContentText(message)
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setContentIntent(openPending)
                    .addAction(replyAction)
                    .build();

            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(notifId, msgNotif);
            }
        } catch (Exception ignored) {
            // Ignore malformed JSON
        }
    }
}
