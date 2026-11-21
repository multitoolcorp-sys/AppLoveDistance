export interface Coords {
  lat: number;
  lng: number;
}

export interface LoveLogItem {
  id: string;
  sentAt: string;
  message: string;
}

export interface NetworkLocation {
  senderId: string;
  senderName: string;
  coords: Coords;
  accuracy?: number;
  updatedAt: string;
}

export interface LoveSettings {
  myName: string;
  partnerName: string;
  mode: 'manual' | 'gps';
  partnerSource: 'network' | 'preset' | 'custom';
  manualDistanceKm: number;
  partnerCity: string;
  partnerCoords: Coords;
  serverUrl: string;
}

export const PARTNER_CITY_PRESETS: Array<{ label: string; coords: Coords }> = [
  { label: 'Madrid, España', coords: { lat: 40.4168, lng: -3.7038 } },
  { label: 'Ciudad de México', coords: { lat: 19.4326, lng: -99.1332 } },
  { label: 'Buenos Aires, Argentina', coords: { lat: -34.6037, lng: -58.3816 } },
  { label: 'Tokio, Japón', coords: { lat: 35.6762, lng: 139.6503 } },
  { label: 'París, Francia', coords: { lat: 48.8566, lng: 2.3522 } },
  { label: 'Nueva York, EE. UU.', coords: { lat: 40.7128, lng: -74.006 } },
];

export const DEFAULT_SETTINGS: LoveSettings = {
  myName: 'Tú',
  partnerName: 'Tu Pareja',
  mode: 'manual',
  partnerSource: 'network',
  manualDistanceKm: 10450.5,
  partnerCity: 'Tokio, Japón',
  partnerCoords: { lat: 35.6762, lng: 139.6503 },
  serverUrl: '',
};

/**
 * Builds an API URL from an optional base server URL (for Capacitor/native builds).
 */
export function buildApiUrl(serverUrl: string, path: string): string {
  const base = serverUrl.trim().replace(/\/+$/, '');
  return base ? `${base}${path}` : path;
}

const SETTINGS_KEY = 'love_distance_settings_v1';
const LOGS_KEY = 'love_distance_logs_v1';

/**
 * Calculates great-circle distance between two coordinates in kilometers.
 */
export function haversineKm(a: Coords, b: Coords): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Formats distance cleanly: meters below 1 km, kilometers with 1 decimal above.
 */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '0.0 km';
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}

export function loadSettings(): LoveSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: LoveSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadLoveLogs(): LoveLogItem[] {
  try {
    const raw = localStorage.getItem(LOGS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LoveLogItem[];
  } catch {
    return [];
  }
}

export function saveLoveLogs(logs: LoveLogItem[]): void {
  try {
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs.slice(0, 20)));
  } catch {
    // Ignore storage quota errors
  }
}
