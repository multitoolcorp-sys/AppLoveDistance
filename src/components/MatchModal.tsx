import { useState } from 'react';
import { Check, HeartHandshake, Users, X } from 'lucide-react';
import {
  Coords,
  DevicePresence,
  formatDistance,
  haversineKm,
  MatchGroup,
  MatchPendingState,
  SelectedTarget,
} from '../utils/distance';

interface MatchModalProps {
  open: boolean;
  myDeviceId: string;
  myCoords: Coords | null;
  devices: DevicePresence[];
  matches: string[];
  pending: MatchPendingState;
  groups: MatchGroup[];
  selectedTarget: SelectedTarget | null;
  onClose: () => void;
  onRequestMatch: (targetId: string) => void;
  onRespondMatch: (fromId: string, accept: boolean) => void;
  onCreateGroup: (name: string, memberIds: string[]) => void;
  onSelectTarget: (target: SelectedTarget) => void;
}

export function MatchModal({
  open,
  myDeviceId,
  myCoords,
  devices,
  matches,
  pending,
  groups,
  selectedTarget,
  onClose,
  onRequestMatch,
  onRespondMatch,
  onCreateGroup,
  onSelectTarget,
}: MatchModalProps) {
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState<string[]>([]);

  if (!open) return null;

  const others = devices.filter((d) => d.deviceId !== myDeviceId);

  const getDistanceLabel = (device?: DevicePresence | null): string => {
    if (!myCoords || !device?.coords) return 'GPS pendiente';
    return formatDistance(haversineKm(myCoords, device.coords));
  };

  const toggleMember = (id: string) => {
    setGroupMembers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (groupMembers.length < 1) return;
    onCreateGroup(groupName.trim() || 'Grupo de Amor', groupMembers);
    setGroupName('');
    setGroupMembers([]);
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Conexiones y Match"
    >
      <div className="modal-sheet">
        <div className="modal-sheet__header">
          <div className="modal-sheet__title">
            <HeartHandshake size={18} />
            <span>Conexiones y Match</span>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Cerrar conexiones"
          >
            <X size={20} />
          </button>
        </div>

        <div className="device-id-pill">
          Tu ID de teléfono: <strong>{myDeviceId}</strong>
        </div>

        <div className="match-section">
          <h3 className="match-section__title">
            Conectados en la red ({others.length})
          </h3>

          {others.length === 0 ? (
            <p className="history-empty">
              No hay otros dispositivos conectados todavía.
            </p>
          ) : (
            <ul className="match-list">
              {others.map((dev) => {
                const isMatched = matches.includes(dev.deviceId);
                const isIncoming = pending.incoming.includes(dev.deviceId);
                const isOutgoing = pending.outgoing.includes(dev.deviceId);
                const isSelected =
                  selectedTarget?.type === 'user' &&
                  selectedTarget.id === dev.deviceId;

                return (
                  <li key={dev.deviceId} className="match-item">
                    <div className="match-item__info">
                      <strong>{dev.alias}</strong>
                      <small>
                        {dev.deviceId.slice(0, 12)} · {getDistanceLabel(dev)}
                      </small>
                    </div>

                    <div className="match-item__actions">
                      {isMatched ? (
                        <button
                          type="button"
                          className={`match-btn ${
                            isSelected ? 'match-btn--active' : 'match-btn--ok'
                          }`}
                          onClick={() => {
                            onSelectTarget({ type: 'user', id: dev.deviceId });
                            onClose();
                          }}
                        >
                          <Check size={14} />
                          <span>{isSelected ? 'Activo' : 'Elegir'}</span>
                        </button>
                      ) : isIncoming ? (
                        <>
                          <button
                            type="button"
                            className="match-btn match-btn--accept"
                            onClick={() => onRespondMatch(dev.deviceId, true)}
                          >
                            Aceptar
                          </button>
                          <button
                            type="button"
                            className="match-btn match-btn--reject"
                            onClick={() => onRespondMatch(dev.deviceId, false)}
                          >
                            No
                          </button>
                        </>
                      ) : isOutgoing ? (
                        <span className="match-pending">Esperando...</span>
                      ) : (
                        <button
                          type="button"
                          className="match-btn"
                          onClick={() => onRequestMatch(dev.deviceId)}
                        >
                          Match 💖
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Match Groups */}
        <div className="match-section">
          <h3 className="match-section__title">
            <Users size={14} /> Match Groups ({groups.length})
          </h3>

          {groups.length > 0 && (
            <ul className="match-list">
              {groups.map((grp) => {
                const isSelected =
                  selectedTarget?.type === 'group' &&
                  selectedTarget.id === grp.id;
                const memberDistances = grp.memberIds
                  .filter((id) => id !== myDeviceId)
                  .map((id) => {
                    const dev = devices.find((d) => d.deviceId === id);
                    return `${dev?.alias ?? id.slice(0, 6)}: ${getDistanceLabel(
                      dev
                    )}`;
                  })
                  .join(' · ');

                return (
                  <li key={grp.id} className="match-item">
                    <div className="match-item__info">
                      <strong>{grp.name}</strong>
                      <small>{memberDistances || 'Sin miembros en línea'}</small>
                    </div>
                    <button
                      type="button"
                      className={`match-btn ${
                        isSelected ? 'match-btn--active' : 'match-btn--ok'
                      }`}
                      onClick={() => {
                        onSelectTarget({ type: 'group', id: grp.id });
                        onClose();
                      }}
                    >
                      {isSelected ? 'Activo' : 'Elegir'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {matches.length >= 1 && (
            <form onSubmit={handleCreateGroup} className="group-form">
              <input
                type="text"
                maxLength={28}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Nombre del Match Group (ej. Familia)"
              />
              <div className="group-chips">
                {matches.map((mId) => {
                  const dev = devices.find((d) => d.deviceId === mId);
                  const checked = groupMembers.includes(mId);
                  return (
                    <button
                      key={mId}
                      type="button"
                      className={`chip ${checked ? 'chip--selected' : ''}`}
                      onClick={() => toggleMember(mId)}
                    >
                      {dev?.alias ?? mId.slice(0, 8)}
                    </button>
                  );
                })}
              </div>
              <button
                type="submit"
                className="gps-btn"
                disabled={groupMembers.length === 0}
              >
                Crear Match Group
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
