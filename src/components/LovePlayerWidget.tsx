import { Heart, Send } from 'lucide-react';
import { formatDistance } from '../utils/distance';

interface LovePlayerWidgetProps {
  distanciaKm: number;
  sentCount: number;
  onEnviarTeAmo: () => void;
}

export function LovePlayerWidget({
  distanciaKm,
  sentCount,
  onEnviarTeAmo,
}: LovePlayerWidgetProps) {
  return (
    <section className="love-player" aria-label="Mini vista activa">
      <div className="love-player__cover" aria-hidden="true">
        <Heart size={22} fill="#FF85A1" color="#FF85A1" />
      </div>

      <div className="love-player__info">
        <div className="love-player__subtitle">
          <span>Mini Vista Activa 🎧</span>
          {sentCount > 0 && (
            <span className="love-player__counter">· {sentCount} hoy</span>
          )}
        </div>
        <div className="love-player__title">
          {formatDistance(distanciaKm)} entre ustedes
        </div>
        <div className="love-player__bar" aria-hidden="true">
          <span className="love-player__bar-fill" />
        </div>
      </div>

      <button
        type="button"
        className="love-player__send"
        onClick={onEnviarTeAmo}
        aria-label="Enviar Te amo rápido"
        title='Enviar "Te amo" rápido'
      >
        <Send size={18} />
      </button>
    </section>
  );
}
