import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation, type Position } from '@capacitor/geolocation';
import { Heart, Settings, User, Wifi } from 'lucide-react';
import { LovePlayerWidget } from './components/LovePlayerWidget';
import { SettingsModal } from './components/SettingsModal';
import {
  buildApiUrl,
  Coords,
  formatDistance,
  haversineKm,
  loadLoveLogs,
  loadSettings,
  LoveLogItem,
  LoveSettings,
  NetworkLocation,
  saveLoveLogs,
  saveSettings,
} from './utils/distance';

interface FloatingHeart {
  id: number;
  left: number;
  delay: number;
  size: number;
}

interface NetworkLoveEvent {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  sentAt: string;
}

export function App() {
  const [settings, setSettings] = useState<LoveSettings>(() => loadSettings());
  const [logs, setLogs] = useState<LoveLogItem[]>(() => loadLoveLogs());
  const [myCoords, setMyCoords] = useState<Coords | null>(null);
  const [myAccuracy, setMyAccuracy] = useState<number | null>(null);
  const [networkPartner, setNetworkPartner] = useState<NetworkLocation | null>(
    null
  );
  const [gpsStatus, setGpsStatus] = useState<string>(
    'Activa el GPS para calcular la distancia real'
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [hearts, setHearts] = useState<FloatingHeart[]>([]);
  const [networkOnline, setNetworkOnline] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);

  const clientIdRef = useRef<string>(
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  const seenIdsRef = useRef<Set<string>>(new Set());
  const browserWatchIdRef = useRef<number | null>(null);
  const nativeWatchIdRef = useRef<string | null>(null);

  const targetCoords =
    settings.partnerSource === 'network' && networkPartner
      ? networkPartner.coords
      : settings.partnerCoords;

  const distanciaKm =
    settings.mode === 'gps' && myCoords
      ? haversineKm(myCoords, targetCoords)
      : settings.manualDistanceKm;

  const publishLocation = useCallback(
    async (coords: Coords, accuracy?: number) => {
      try {
        await fetch(buildApiUrl(settings.serverUrl, '/api/location'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            senderId: clientIdRef.current,
            senderName: settings.myName || 'Tú',
            coords,
            accuracy,
            updatedAt: new Date().toLocaleTimeString('es-ES', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          }),
        });
      } catch {
        // Ignore network errors when offline
      }
    },
    [settings.myName, settings.serverUrl]
  );

  const applyPosition = useCallback(
    (pos: GeolocationPosition | Position) => {
      const coords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };
      const acc = Math.round(pos.coords.accuracy);
      setMyCoords(coords);
      setMyAccuracy(acc);
      setGpsStatus(
        `GPS activo (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)} · ±${acc} m)`
      );
      void publishLocation(coords, acc);
    },
    [publishLocation]
  );

  const clearGpsWatch = useCallback(async () => {
    if (browserWatchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(browserWatchIdRef.current);
      browserWatchIdRef.current = null;
    }
    if (nativeWatchIdRef.current !== null) {
      try {
        await Geolocation.clearWatch({ id: nativeWatchIdRef.current });
      } catch {
        // Ignore cleanup errors
      }
      nativeWatchIdRef.current = null;
    }
  }, []);

  const startBrowserWatchGps = useCallback(() => {
    if (!('geolocation' in navigator)) return;
    if (browserWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(browserWatchIdRef.current);
    }
    browserWatchIdRef.current = navigator.geolocation.watchPosition(
      applyPosition,
      () => {
        // Keep last known position if a background watch tick fails
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }, [applyPosition]);

  const requestGps = useCallback(async () => {
    // 1. Camino nativo (Android/iOS con Capacitor: sin navegador ni restricción HTTPS)
    if (Capacitor.isNativePlatform()) {
      try {
        setGpsStatus('Solicitando permiso GPS nativo...');
        const perms = await Geolocation.requestPermissions();
        if (
          perms.location !== 'granted' &&
          perms.coarseLocation !== 'granted'
        ) {
          setGpsStatus(
            'Permiso de ubicación denegado en los ajustes del teléfono.'
          );
          return;
        }

        setGpsStatus('Obteniendo señal GPS nativa...');
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
        });
        applyPosition(pos);

        if (nativeWatchIdRef.current !== null) {
          await Geolocation.clearWatch({ id: nativeWatchIdRef.current });
        }
        nativeWatchIdRef.current = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 15000 },
          (position) => {
            if (position) applyPosition(position);
          }
        );
      } catch {
        setGpsStatus('No se pudo obtener el GPS nativo del dispositivo.');
      }
      return;
    }

    // 2. Camino navegador web
    if (!('geolocation' in navigator)) {
      setGpsStatus('Tu navegador no soporta geolocalización.');
      return;
    }

    if (!window.isSecureContext) {
      setGpsStatus(
        'El navegador bloquea el GPS en HTTP de red local. Ábrelo en localhost, HTTPS o compílalo como app móvil.'
      );
      return;
    }

    setGpsStatus('Buscando señal GPS precisa...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyPosition(pos);
        startBrowserWatchGps();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus(
            'Permiso de ubicación denegado. Habilítalo en los ajustes del navegador.'
          );
          return;
        }

        setGpsStatus('Reintentando con ubicación rápida por Wi-Fi/red...');
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            applyPosition(pos);
            startBrowserWatchGps();
          },
          (fallbackErr) => {
            if (fallbackErr.code === fallbackErr.TIMEOUT) {
              setGpsStatus('Tiempo de espera agotado al obtener ubicación.');
            } else {
              setGpsStatus('No se pudo determinar tu ubicación actual.');
            }
          },
          { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }
    );
  }, [applyPosition, startBrowserWatchGps]);

  useEffect(() => {
    if (settings.mode === 'gps') {
      void requestGps();
    } else {
      void clearGpsWatch();
    }

    return () => {
      void clearGpsWatch();
    };
  }, [settings.mode, requestGps, clearGpsWatch]);

  const spawnHearts = useCallback(() => {
    const burstId = Date.now() + Math.random();
    const newHearts: FloatingHeart[] = Array.from({ length: 7 }, (_, i) => ({
      id: burstId + i,
      left: 16 + Math.random() * 68,
      delay: i * 65,
      size: 16 + Math.round(Math.random() * 14),
    }));
    setHearts((prev) => [...prev, ...newHearts]);
    window.setTimeout(() => {
      setHearts((prev) =>
        prev.filter((h) => !newHearts.some((nh) => nh.id === h.id))
      );
    }, 1550);
  }, []);

  const handleIncomingLove = useCallback(
    (payload: NetworkLoveEvent) => {
      if (!payload?.id || seenIdsRef.current.has(payload.id)) return;
      seenIdsRef.current.add(payload.id);

      const isMine = payload.senderId === clientIdRef.current;
      if (isMine) return;

      const label = `${payload.senderName} te envió un "Te amo" ❤️`;
      setToastMessage(label);
      spawnHearts();

      if ('vibrate' in navigator) {
        navigator.vibrate?.([35, 40, 35]);
      }

      setLogs((prev) => {
        const next: LoveLogItem[] = [
          {
            id: payload.id,
            sentAt: payload.sentAt,
            message: `💖 Recibido de ${payload.senderName}`,
          },
          ...prev,
        ].slice(0, 20);
        saveLoveLogs(next);
        return next;
      });
    },
    [spawnHearts]
  );

  // Conexión en tiempo real a la red (SSE + fallback BroadcastChannel)
  useEffect(() => {
    let source: EventSource | null = null;
    let channel: BroadcastChannel | null = null;

    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel('distancia-de-amor');
      channel.onmessage = (ev) => {
        if (ev.data?.type === 'love') {
          handleIncomingLove(ev.data.payload as NetworkLoveEvent);
        }
      };
    }

    const connect = () => {
      source = new EventSource(buildApiUrl(settings.serverUrl, '/api/events'));

      source.onopen = () => {
        setNetworkOnline(true);
      };

      source.addEventListener('presence', (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as {
            onlineCount?: number;
          };
          if (typeof data.onlineCount === 'number') {
            setOnlineCount(Math.max(1, data.onlineCount));
          }
        } catch {
          // Ignore malformed event
        }
      });

      source.addEventListener('love', (ev) => {
        try {
          const payload = JSON.parse(
            (ev as MessageEvent).data
          ) as NetworkLoveEvent;
          handleIncomingLove(payload);
        } catch {
          // Ignore malformed event
        }
      });

      source.addEventListener('location', (ev) => {
        try {
          const payload = JSON.parse(
            (ev as MessageEvent).data
          ) as NetworkLocation;
          if (payload.senderId !== clientIdRef.current) {
            setNetworkPartner(payload);
          }
        } catch {
          // Ignore malformed event
        }
      });

      source.addEventListener('locations_snapshot', (ev) => {
        try {
          const list = JSON.parse(
            (ev as MessageEvent).data
          ) as NetworkLocation[];
          const other = list.find((l) => l.senderId !== clientIdRef.current);
          if (other) {
            setNetworkPartner(other);
          }
        } catch {
          // Ignore malformed event
        }
      });

      source.onerror = () => {
        setNetworkOnline(false);
      };
    };

    connect();

    return () => {
      source?.close();
      channel?.close();
    };
  }, [handleIncomingLove, settings.serverUrl]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleEnviarTeAmo = async () => {
    const now = new Date();
    const timeLabel = now.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const eventId = `${now.getTime()}-${Math.random().toString(16).slice(2)}`;
    seenIdsRef.current.add(eventId);

    const payload: NetworkLoveEvent = {
      id: eventId,
      senderId: clientIdRef.current,
      senderName: settings.myName || 'Tú',
      message: 'Te amo ❤️',
      sentAt: timeLabel,
    };

    const nextLogs: LoveLogItem[] = [
      {
        id: eventId,
        sentAt: timeLabel,
        message: `Enviaste un "Te amo" a la red ❤️`,
      },
      ...logs,
    ].slice(0, 20);

    setLogs(nextLogs);
    saveLoveLogs(nextLogs);
    setToastMessage('¡Enviaste un "Te amo" a toda la red! ❤️');
    spawnHearts();

    if ('vibrate' in navigator) {
      navigator.vibrate?.(35);
    }

    if ('BroadcastChannel' in window) {
      const ch = new BroadcastChannel('distancia-de-amor');
      ch.postMessage({ type: 'love', payload });
      ch.close();
    }

    try {
      await fetch(buildApiUrl(settings.serverUrl, '/api/love'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // Offline / static fallback already handled
    }
  };

  const handleSaveSettings = (next: LoveSettings) => {
    const normalized: LoveSettings = {
      ...next,
      myName: next.myName.trim() || 'Tú',
      partnerName: next.partnerName.trim() || 'Tu Pareja',
      serverUrl: next.serverUrl.trim(),
    };
    setSettings(normalized);
    saveSettings(normalized);
  };

  const handleClearLogs = () => {
    setLogs([]);
    saveLoveLogs([]);
  };

  const partnerLabel =
    settings.mode === 'gps' &&
    settings.partnerSource === 'network' &&
    networkPartner
      ? networkPartner.senderName
      : settings.partnerName;

  return (
    <div className="app-viewport">
      <main className="phone-shell">
        {/* Floating Hearts Burst */}
        <div className="hearts-layer" aria-hidden="true">
          {hearts.map((h) => (
            <span
              key={h.id}
              className="floating-heart"
              style={{
                left: `${h.left}%`,
                animationDelay: `${h.delay}ms`,
                fontSize: `${h.size}px`,
              }}
            >
              ❤️
            </span>
          ))}
        </div>

        {/* Header superior */}
        <header className="top-header">
          <h1 className="top-header__title">Nuestra Conexión 💖</h1>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setSettingsOpen(true)}
            aria-label="Abrir configuración"
            title="Configurar conexión"
          >
            <Settings size={22} />
          </button>
        </header>

        {/* Contenido central */}
        <div className="center-content">
          <section className="distance-card" aria-label="Distancia actual">
            <div className="avatars-row">
              <div className="avatar-item">
                <div className="avatar-circle avatar-circle--blue">
                  <User size={26} color="#5BA8D0" />
                </div>
                <span className="avatar-name">{settings.myName}</span>
              </div>

              <div className="heart-connector" aria-hidden="true">
                <Heart size={28} fill="#FF85A1" color="#FF85A1" />
              </div>

              <div className="avatar-item">
                <div className="avatar-circle avatar-circle--pink">
                  <Heart size={24} color="#FF85A1" />
                </div>
                <span className="avatar-name">{partnerLabel}</span>
              </div>
            </div>

            <p className="distance-label">Están separados por</p>
            <div className="distance-value">{formatDistance(distanciaKm)}</div>

            <div className="live-badge">
              <span
                className={`live-badge__dot ${
                  networkOnline ? '' : 'live-badge__dot--offline'
                }`}
              />
              <Wifi size={12} />
              <span>
                {settings.mode === 'gps' && myCoords
                  ? `GPS ±${myAccuracy ?? 0} m · ${
                      networkOnline ? `${onlineCount} en red` : 'local'
                    }`
                  : networkOnline
                  ? `En red · ${onlineCount} ${
                      onlineCount === 1 ? 'conectado' : 'conectados'
                    }`
                  : 'Ubicación actualizada en vivo'}
              </span>
            </div>

            {settings.mode === 'gps' && !myCoords && (
              <p className="gps-inline-status">{gpsStatus}</p>
            )}
          </section>

          <LovePlayerWidget
            distanciaKm={distanciaKm}
            sentCount={logs.length}
            onEnviarTeAmo={handleEnviarTeAmo}
          />
        </div>

        {/* Botón inferior principal */}
        <footer className="bottom-cta">
          <button
            type="button"
            className="love-btn"
            onClick={handleEnviarTeAmo}
          >
            <Heart size={20} fill="#FFFFFF" color="#FFFFFF" />
            <span>Enviar &quot;Te amo&quot; ❤️</span>
          </button>
        </footer>

        {/* Snackbar flotante */}
        {toastMessage && (
          <div className="love-snackbar" role="status" aria-live="polite">
            <Heart size={18} fill="#FFFFFF" color="#FFFFFF" />
            <span>{toastMessage}</span>
          </div>
        )}

        <SettingsModal
          open={settingsOpen}
          settings={settings}
          logs={logs}
          gpsStatus={gpsStatus}
          networkPartner={networkPartner}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSaveSettings}
          onRequestGps={() => void requestGps()}
          onClearLogs={handleClearLogs}
        />
      </main>
    </div>
  );
}

export default App;
