import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation, type Position } from '@capacitor/geolocation';
import { Heart, HeartHandshake, Settings, User, Wifi } from 'lucide-react';
import { LovePlayerWidget } from './components/LovePlayerWidget';
import { MatchModal } from './components/MatchModal';
import { SettingsModal } from './components/SettingsModal';
import {
  buildApiUrl,
  Coords,
  DevicePresence,
  formatDistance,
  getOrCreateWebDeviceId,
  haversineKm,
  loadLoveLogs,
  loadSettings,
  LoveLogItem,
  LoveSettings,
  MatchGroup,
  MatchPendingState,
  saveLoveLogs,
  saveSettings,
  SelectedTarget,
} from './utils/distance';

interface LoveWidgetBridge {
  getDeviceId(): Promise<{ deviceId: string }>;
  syncConfig(options: {
    deviceId: string;
    senderName: string;
    serverUrl: string;
    targetType: string;
    targetId: string;
    targetLabel: string;
    targetDistance: string;
  }): Promise<void>;
}

const LoveWidget = registerPlugin<LoveWidgetBridge>('LoveWidget');

interface FloatingHeart {
  id: number;
  left: number;
  delay: number;
  size: number;
}

interface NetworkLoveEvent {
  id: string;
  senderId: string;
  senderAlias: string;
  targetType?: 'user' | 'group';
  targetId?: string;
  groupName?: string;
  message: string;
  sentAt: string;
}

export function App() {
  const [myDeviceId, setMyDeviceId] = useState<string>(() =>
    getOrCreateWebDeviceId()
  );
  const [settings, setSettings] = useState<LoveSettings>(() => loadSettings());
  const [logs, setLogs] = useState<LoveLogItem[]>(() => loadLoveLogs());
  const [myCoords, setMyCoords] = useState<Coords | null>(null);
  const [myAccuracy, setMyAccuracy] = useState<number | null>(null);

  const [devices, setDevices] = useState<DevicePresence[]>([]);
  const [matches, setMatches] = useState<string[]>([]);
  const [pending, setPending] = useState<MatchPendingState>({
    incoming: [],
    outgoing: [],
  });
  const [groups, setGroups] = useState<MatchGroup[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<SelectedTarget | null>(
    null
  );

  const [gpsStatus, setGpsStatus] = useState<string>(
    'Activa el GPS para calcular la distancia real'
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [hearts, setHearts] = useState<FloatingHeart[]>([]);
  const [networkOnline, setNetworkOnline] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);

  const seenIdsRef = useRef<Set<string>>(new Set());
  const browserWatchIdRef = useRef<number | null>(null);
  const nativeWatchIdRef = useRef<string | null>(null);

  // Obtener ID fijo del teléfono en Android nativo
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      void LoveWidget.getDeviceId()
        .then((res) => {
          if (res?.deviceId) {
            setMyDeviceId(res.deviceId);
          }
        })
        .catch(() => {
          // Keep web fallback ID
        });
    }
  }, []);

  // Auto-seleccionar el primer match o grupo disponible si no hay uno activo
  useEffect(() => {
    setSelectedTarget((prev) => {
      if (prev?.type === 'user' && matches.includes(prev.id)) return prev;
      if (prev?.type === 'group' && groups.some((g) => g.id === prev.id)) {
        return prev;
      }
      if (matches.length > 0) return { type: 'user', id: matches[0] };
      if (groups.length > 0) return { type: 'group', id: groups[0].id };
      return null;
    });
  }, [matches, groups]);

  const activeUserDevice = useMemo(() => {
    if (selectedTarget?.type === 'user') {
      return devices.find((d) => d.deviceId === selectedTarget.id) ?? null;
    }
    const firstOther = devices.find(
      (d) => d.deviceId !== myDeviceId && d.coords !== null
    );
    return firstOther ?? null;
  }, [devices, myDeviceId, selectedTarget]);

  const activeGroup = useMemo(() => {
    if (selectedTarget?.type !== 'group') return null;
    return groups.find((g) => g.id === selectedTarget.id) ?? null;
  }, [groups, selectedTarget]);

  const targetCoords =
    settings.partnerSource === 'network' && activeUserDevice?.coords
      ? activeUserDevice.coords
      : settings.partnerCoords;

  const distanciaKm =
    settings.mode === 'gps' && myCoords
      ? haversineKm(myCoords, targetCoords)
      : settings.manualDistanceKm;

  const formattedDistance = formatDistance(distanciaKm);

  const partnerLabel = activeGroup
    ? activeGroup.name
    : activeUserDevice
    ? activeUserDevice.alias
    : settings.partnerName;

  // Distancias individuales cuando hay un Match Group seleccionado
  const groupMemberDistances = useMemo(() => {
    if (!activeGroup) return [];
    return activeGroup.memberIds
      .filter((id) => id !== myDeviceId)
      .map((id) => {
        const dev = devices.find((d) => d.deviceId === id);
        const dist =
          myCoords && dev?.coords
            ? formatDistance(haversineKm(myCoords, dev.coords))
            : 'GPS pendiente';
        return {
          id,
          alias: dev?.alias ?? id.slice(0, 8),
          dist,
        };
      });
  }, [activeGroup, devices, myCoords, myDeviceId]);

  // Sincronizar configuración, match activo y distancia con la notificación estilo Lark Player
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      void LoveWidget.syncConfig({
        deviceId: myDeviceId,
        senderName: settings.myName || 'Tu Amor',
        serverUrl: settings.serverUrl || 'https://applovedistance.onrender.com',
        targetType: selectedTarget?.type ?? 'user',
        targetId: selectedTarget?.id ?? '',
        targetLabel: partnerLabel,
        targetDistance: formattedDistance,
      }).catch(() => {
        // Ignore if plugin is unavailable
      });
    }
  }, [
    myDeviceId,
    settings.myName,
    settings.serverUrl,
    selectedTarget,
    partnerLabel,
    formattedDistance,
  ]);

  const publishLocation = useCallback(
    async (coords: Coords, accuracy?: number) => {
      try {
        await fetch(buildApiUrl(settings.serverUrl, '/api/location'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId: myDeviceId,
            alias: settings.myName || 'Tú',
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
    [myDeviceId, settings.myName, settings.serverUrl]
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
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }, [applyPosition]);

  const requestGps = useCallback(async () => {
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

    if (!('geolocation' in navigator)) {
      setGpsStatus('Tu navegador no soporta geolocalización.');
      return;
    }

    if (!window.isSecureContext) {
      setGpsStatus(
        'El navegador bloquea el GPS en HTTP de red local. Ábrelo en localhost, HTTPS o APK.'
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

      if (payload.senderId === myDeviceId) return;

      const prefix = payload.groupName
        ? `[${payload.groupName}] ${payload.senderAlias}`
        : payload.senderAlias;
      const label = `${prefix}: "${payload.message}"`;
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
            message: `💖 ${prefix}: ${payload.message}`,
          },
          ...prev,
        ].slice(0, 20);
        saveLoveLogs(next);
        return next;
      });
    },
    [myDeviceId, spawnHearts]
  );

  // Conexión en tiempo real a la red (SSE)
  useEffect(() => {
    const params = new URLSearchParams({
      deviceId: myDeviceId,
      alias: settings.myName || 'Tú',
    });
    const sseUrl = buildApiUrl(
      settings.serverUrl,
      `/api/events?${params.toString()}`
    );
    const source = new EventSource(sseUrl);

    source.onopen = () => {
      setNetworkOnline(true);
    };

    source.addEventListener('presence_list', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as {
          onlineCount?: number;
          devices?: DevicePresence[];
        };
        if (typeof data.onlineCount === 'number') {
          setOnlineCount(Math.max(1, data.onlineCount));
        }
        if (Array.isArray(data.devices)) {
          setDevices(data.devices);
        }
      } catch {
        // Ignore malformed event
      }
    });

    source.addEventListener('match_state', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as {
          matches?: string[];
          pending?: MatchPendingState;
          groups?: MatchGroup[];
        };
        if (Array.isArray(data.matches)) setMatches(data.matches);
        if (data.pending) setPending(data.pending);
        if (Array.isArray(data.groups)) setGroups(data.groups);
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

    source.onerror = () => {
      setNetworkOnline(false);
    };

    return () => {
      source.close();
    };
  }, [handleIncomingLove, myDeviceId, settings.myName, settings.serverUrl]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleRequestMatch = async (targetId: string) => {
    try {
      await fetch(buildApiUrl(settings.serverUrl, '/api/match/request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromId: myDeviceId, toId: targetId }),
      });
      setToastMessage('Solicitud de Match enviada 💖');
    } catch {
      setToastMessage('No se pudo enviar la solicitud.');
    }
  };

  const handleRespondMatch = async (fromId: string, accept: boolean) => {
    try {
      await fetch(buildApiUrl(settings.serverUrl, '/api/match/respond'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromId, toId: myDeviceId, accept }),
      });
      setToastMessage(accept ? '¡Nuevo Match activado! 💖' : 'Solicitud rechazada');
    } catch {
      setToastMessage('Error al responder Match.');
    }
  };

  const handleCreateGroup = async (name: string, memberIds: string[]) => {
    try {
      const res = await fetch(
        buildApiUrl(settings.serverUrl, '/api/group/create'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, ownerId: myDeviceId, memberIds }),
        }
      );
      const data = (await res.json()) as { ok?: boolean; group?: MatchGroup };
      if (data.ok && data.group) {
        setSelectedTarget({ type: 'group', id: data.group.id });
        setToastMessage(`Match Group "${data.group.name}" creado 💖`);
      }
    } catch {
      setToastMessage('No se pudo crear el grupo.');
    }
  };

  const handleEnviarTeAmo = async () => {
    if (!selectedTarget) {
      setMatchOpen(true);
      setToastMessage('Primero haz Match con alguien para enviar ❤️');
      return;
    }

    const now = new Date();
    const timeLabel = now.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const eventId = `${now.getTime()}-${Math.random().toString(16).slice(2)}`;
    seenIdsRef.current.add(eventId);

    const payload = {
      id: eventId,
      senderId: myDeviceId,
      senderAlias: settings.myName || 'Tú',
      targetType: selectedTarget.type,
      targetId: selectedTarget.id,
      message: 'Te amo ❤️',
      sentAt: timeLabel,
    };

    try {
      const res = await fetch(buildApiUrl(settings.serverUrl, '/api/love'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setToastMessage('Necesitas tener Match activo para enviar.');
        return;
      }

      const nextLogs: LoveLogItem[] = [
        {
          id: eventId,
          sentAt: timeLabel,
          message: `Enviaste "Te amo" a ${partnerLabel} ❤️`,
        },
        ...logs,
      ].slice(0, 20);

      setLogs(nextLogs);
      saveLoveLogs(nextLogs);
      setToastMessage(`¡Enviaste "Te amo" a ${partnerLabel}! ❤️`);
      spawnHearts();

      if ('vibrate' in navigator) {
        navigator.vibrate?.(35);
      }
    } catch {
      setToastMessage('Sin conexión al servidor.');
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

    void fetch(buildApiUrl(normalized.serverUrl, '/api/profile'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: myDeviceId,
        alias: normalized.myName,
      }),
    }).catch(() => {});
  };

  const handleClearLogs = () => {
    setLogs([]);
    saveLoveLogs([]);
  };

  const totalTargets = matches.length + groups.length;

  return (
    <div className="app-viewport">
      <main className="phone-shell">
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
          <div className="header-actions">
            <button
              type="button"
              className="icon-btn icon-btn--badge"
              onClick={() => setMatchOpen(true)}
              aria-label="Conexiones y Match"
              title="Conexiones y Match"
            >
              <HeartHandshake size={20} />
              {pending.incoming.length > 0 && (
                <span className="notif-dot">{pending.incoming.length}</span>
              )}
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setSettingsOpen(true)}
              aria-label="Abrir configuración"
              title="Configurar conexión"
            >
              <Settings size={20} />
            </button>
          </div>
        </header>

        {/* Selector rápido si hay más de 1 match o grupo */}
        {totalTargets > 1 && (
          <div className="target-strip" aria-label="Elegir destinatario">
            {matches.map((id) => {
              const dev = devices.find((d) => d.deviceId === id);
              const isSel =
                selectedTarget?.type === 'user' && selectedTarget.id === id;
              const dist =
                myCoords && dev?.coords
                  ? formatDistance(haversineKm(myCoords, dev.coords))
                  : '';
              return (
                <button
                  key={id}
                  type="button"
                  className={`target-chip ${isSel ? 'target-chip--active' : ''}`}
                  onClick={() => setSelectedTarget({ type: 'user', id })}
                >
                  <span>{dev?.alias ?? id.slice(0, 6)}</span>
                  {dist && <small>· {dist}</small>}
                </button>
              );
            })}
            {groups.map((grp) => {
              const isSel =
                selectedTarget?.type === 'group' &&
                selectedTarget.id === grp.id;
              return (
                <button
                  key={grp.id}
                  type="button"
                  className={`target-chip ${isSel ? 'target-chip--active' : ''}`}
                  onClick={() =>
                    setSelectedTarget({ type: 'group', id: grp.id })
                  }
                >
                  <span>👥 {grp.name}</span>
                </button>
              );
            })}
          </div>
        )}

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

            {activeGroup ? (
              <>
                <p className="distance-label">Distancias del Match Group</p>
                <div className="group-distances">
                  {groupMemberDistances.map((m) => (
                    <div key={m.id} className="group-dist-row">
                      <span>{m.alias}</span>
                      <strong>{m.dist}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="distance-label">Están separados por</p>
                <div className="distance-value">{formattedDistance}</div>
              </>
            )}

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
                    } · ${matches.length} match`
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

        {toastMessage && (
          <div className="love-snackbar" role="status" aria-live="polite">
            <Heart size={18} fill="#FFFFFF" color="#FFFFFF" />
            <span>{toastMessage}</span>
          </div>
        )}

        <MatchModal
          open={matchOpen}
          myDeviceId={myDeviceId}
          myCoords={myCoords}
          devices={devices}
          matches={matches}
          pending={pending}
          groups={groups}
          selectedTarget={selectedTarget}
          onClose={() => setMatchOpen(false)}
          onRequestMatch={(id) => void handleRequestMatch(id)}
          onRespondMatch={(fromId, accept) =>
            void handleRespondMatch(fromId, accept)
          }
          onCreateGroup={(name, ids) => void handleCreateGroup(name, ids)}
          onSelectTarget={(t) => setSelectedTarget(t)}
        />

        <SettingsModal
          open={settingsOpen}
          myDeviceId={myDeviceId}
          settings={settings}
          logs={logs}
          gpsStatus={gpsStatus}
          networkPartner={activeUserDevice}
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
