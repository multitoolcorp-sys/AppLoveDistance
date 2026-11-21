import { useEffect, useState } from 'react';
import { MapPin, Navigation, Sliders, Trash2, X } from 'lucide-react';
import {
  DevicePresence,
  LoveLogItem,
  LoveSettings,
  PARTNER_CITY_PRESETS,
} from '../utils/distance';

interface SettingsModalProps {
  open: boolean;
  myDeviceId: string;
  settings: LoveSettings;
  logs: LoveLogItem[];
  gpsStatus: string;
  networkPartner: DevicePresence | null;
  onClose: () => void;
  onSave: (next: LoveSettings) => void;
  onRequestGps: () => void;
  onClearLogs: () => void;
}

export function SettingsModal({
  open,
  myDeviceId,
  settings,
  logs,
  gpsStatus,
  networkPartner,
  onClose,
  onSave,
  onRequestGps,
  onClearLogs,
}: SettingsModalProps) {
  const [draft, setDraft] = useState<LoveSettings>(settings);

  useEffect(() => {
    if (open) {
      setDraft(settings);
    }
  }, [open, settings]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(draft);
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Configuración de conexión"
    >
      <div className="modal-sheet">
        <div className="modal-sheet__header">
          <div className="modal-sheet__title">
            <Sliders size={18} />
            <span>Configurar Conexión</span>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Cerrar configuración"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-sheet__form">
          <div className="device-id-pill">
            ID fijo del dispositivo: <strong>{myDeviceId}</strong>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Tu Alias (editable)</span>
              <input
                type="text"
                maxLength={20}
                value={draft.myName}
                onChange={(e) => setDraft({ ...draft, myName: e.target.value })}
                placeholder="Tú"
              />
            </label>
            <label className="field">
              <span>Tu pareja</span>
              <input
                type="text"
                maxLength={20}
                value={draft.partnerName}
                onChange={(e) =>
                  setDraft({ ...draft, partnerName: e.target.value })
                }
                placeholder="Tu Pareja"
              />
            </label>
          </div>

          <div className="field">
            <span>Modo de distancia</span>
            <div className="segmented">
              <button
                type="button"
                className={draft.mode === 'manual' ? 'active' : ''}
                onClick={() => setDraft({ ...draft, mode: 'manual' })}
              >
                Simulada (km)
              </button>
              <button
                type="button"
                className={draft.mode === 'gps' ? 'active' : ''}
                onClick={() => setDraft({ ...draft, mode: 'gps' })}
              >
                GPS Real
              </button>
            </div>
          </div>

          {draft.mode === 'manual' ? (
            <label className="field">
              <span>
                Distancia actual (km): {draft.manualDistanceKm.toFixed(1)} km
              </span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="20050"
                value={draft.manualDistanceKm}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    manualDistanceKm: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </label>
          ) : (
            <div className="field">
              <span>Ubicación de tu pareja</span>
              <div className="segmented segmented--three">
                <button
                  type="button"
                  className={draft.partnerSource === 'network' ? 'active' : ''}
                  onClick={() =>
                    setDraft({ ...draft, partnerSource: 'network' })
                  }
                >
                  En red
                </button>
                <button
                  type="button"
                  className={draft.partnerSource === 'preset' ? 'active' : ''}
                  onClick={() =>
                    setDraft({ ...draft, partnerSource: 'preset' })
                  }
                >
                  Ciudad
                </button>
                <button
                  type="button"
                  className={draft.partnerSource === 'custom' ? 'active' : ''}
                  onClick={() =>
                    setDraft({ ...draft, partnerSource: 'custom' })
                  }
                >
                  Manual
                </button>
              </div>

              {draft.partnerSource === 'network' && (
                <small className="gps-hint">
                  <MapPin size={12} />{' '}
                  {networkPartner?.coords
                    ? `Recibiendo GPS de ${networkPartner.alias} (${networkPartner.coords.lat.toFixed(4)}, ${networkPartner.coords.lng.toFixed(4)})`
                    : 'Esperando a que otro dispositivo en la red active su GPS (usando ciudad de respaldo mientras tanto).'}
                </small>
              )}

              {draft.partnerSource === 'preset' && (
                <select
                  value={draft.partnerCity}
                  onChange={(e) => {
                    const preset = PARTNER_CITY_PRESETS.find(
                      (p) => p.label === e.target.value
                    );
                    if (preset) {
                      setDraft({
                        ...draft,
                        partnerCity: preset.label,
                        partnerCoords: preset.coords,
                      });
                    }
                  }}
                >
                  {PARTNER_CITY_PRESETS.map((city) => (
                    <option key={city.label} value={city.label}>
                      {city.label}
                    </option>
                  ))}
                </select>
              )}

              {draft.partnerSource === 'custom' && (
                <div className="field-row">
                  <label className="field">
                    <span>Latitud</span>
                    <input
                      type="number"
                      step="0.0001"
                      min="-90"
                      max="90"
                      value={draft.partnerCoords.lat}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          partnerCity: 'Coordenadas manuales',
                          partnerCoords: {
                            ...draft.partnerCoords,
                            lat: Number(e.target.value) || 0,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Longitud</span>
                    <input
                      type="number"
                      step="0.0001"
                      min="-180"
                      max="180"
                      value={draft.partnerCoords.lng}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          partnerCity: 'Coordenadas manuales',
                          partnerCoords: {
                            ...draft.partnerCoords,
                            lng: Number(e.target.value) || 0,
                          },
                        })
                      }
                    />
                  </label>
                </div>
              )}

              <button
                type="button"
                className="gps-btn"
                onClick={onRequestGps}
              >
                <Navigation size={15} />
                <span>Actualizar mi GPS ahora</span>
              </button>
              <small className="gps-hint">
                <MapPin size={12} /> {gpsStatus}
              </small>
            </div>
          )}

          <label className="field">
            <span>Servidor de red (opcional para APK móvil)</span>
            <input
              type="url"
              value={draft.serverUrl}
              onChange={(e) =>
                setDraft({ ...draft, serverUrl: e.target.value })
              }
              placeholder="Ej: http://192.168.1.50:3000 o https://tu-app.onrender.com"
            />
            <small className="gps-hint">
              Déjalo vacío si la usas directo desde el navegador.
            </small>
          </label>

          <button type="submit" className="save-btn">
            Guardar cambios
          </button>
        </form>

        <div className="history-section">
          <div className="history-section__header">
            <span>Últimos &quot;Te amo&quot; enviados ({logs.length})</span>
            {logs.length > 0 && (
              <button
                type="button"
                className="clear-btn"
                onClick={onClearLogs}
                title="Limpiar historial"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
          {logs.length === 0 ? (
            <p className="history-empty">
              Aún no enviaste ninguno hoy. ¡Toca el corazón!
            </p>
          ) : (
            <ul className="history-list">
              {logs.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <span>{item.message}</span>
                  <time>{item.sentAt}</time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
