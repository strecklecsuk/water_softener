/**
 * water-softener-card  v1.1
 * Custom Lovelace card for the Water Softener Manager integration.
 * Instala el recurso desde: Ajustes → Paneles → Recursos → /water_softener/water-softener-card.js
 */
class WaterSoftenerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._uid = 'wsc_' + Math.random().toString(36).substr(2, 9);
    this._lastKey = null;
  }

  static getStubConfig() {
    return { entity: 'sensor.softener_remaining' };
  }

  setConfig(config) {
    if (!config.entity) throw new Error('Debes definir "entity" (ej: sensor.softener_remaining)');
    this._config = config;
    this.shadowRoot.innerHTML = `<ha-card><div style="padding:20px;color:var(--primary-text-color)">Cargando...</div></ha-card>`;
  }

  set hass(hass) {
    this._hass = hass;
    const st = hass.states[this._config.entity];
    const key = st ? `${st.state}|${JSON.stringify(st.attributes)}` : 'missing';
    if (key === this._lastKey) return;
    this._lastKey = key;
    this._render();
  }

  _render() {
    const hass = this._hass;
    const cfg = this._config;
    const uid = this._uid;

    const stateObj = hass.states[cfg.entity];
    if (!stateObj) {
      this.shadowRoot.innerHTML = `<ha-card><div style="padding:20px;color:var(--error-color)">Entidad no encontrada: ${cfg.entity}</div></ha-card>`;
      return;
    }

    const remaining = parseFloat(stateObj.state) || 0;
    const attrs = stateObj.attributes || {};
    const capacity = attrs.capacity_L || 4500;
    const pct = Math.min(Math.max((remaining / capacity) * 100, 0), 100);
    const isRegen = attrs.regenerating === true;
    const avgDaily = attrs.avg_daily_consumption_L;
    const daysUntil = attrs.days_until_regen;
    const nextRegenDate = attrs.next_regen_estimate;
    const lastRegen = attrs.last_regeneration;

    // --- Colores según estado ---
    let waterColor, waterLight, bgGrad;
    if (isRegen) {
      waterColor = '#43a047'; waterLight = '#a5d6a7';
      bgGrad = 'linear-gradient(145deg,#1b5e20 0%,#2e7d32 100%)';
    } else if (pct < 10) {
      waterColor = '#e53935'; waterLight = '#ef9a9a';
      bgGrad = 'linear-gradient(145deg,#b71c1c 0%,#c62828 100%)';
    } else if (pct < 25) {
      waterColor = '#fb8c00'; waterLight = '#ffcc80';
      bgGrad = 'linear-gradient(145deg,#e65100 0%,#ef6c00 100%)';
    } else {
      waterColor = '#1e88e5'; waterLight = '#90caf9';
      bgGrad = 'linear-gradient(145deg,#0d47a1 0%,#1565c0 100%)';
    }

    // --- SVG del tanque ---
    // viewBox: 0 0 185 265
    // Tanque: x=10, y=22, w=130, h=200, rx=8
    const TX = 10, TY = 22, TW = 130, TH = 200;
    const fillH = Math.max((pct / 100) * TH, 0);
    const fillTop = TY + TH - fillH;
    const waveY = fillTop;

    // Nivel de texto: centrado en el tanque
    const textY = TY + TH / 2 + 10;
    const textColor = pct > 45 ? 'white' : waterColor;

    // Ticks de medición (lado derecho del tanque)
    const tickX1 = TX + TW + 2;
    const tickX2 = TX + TW + 12;
    const textX = TX + TW + 15;
    const ticks = [
      { pct: 0.25, label: '75%' },
      { pct: 0.50, label: '50%' },
      { pct: 0.75, label: '25%' },
    ].map(t => {
      const y = TY + t.pct * TH;
      return `
        <line x1="${tickX1}" y1="${y}" x2="${tickX2}" y2="${y}" stroke="${waterColor}99" stroke-width="1.5"/>
        <text x="${textX}" y="${y + 4}" font-size="8.5" fill="${waterColor}bb" font-family="sans-serif">${t.label}</text>`;
    }).join('');

    // Camino de la ola
    const waveAmp = Math.max(3, Math.min(10, pct / 8));
    const makePath = (yOff, opac) => {
      const y = waveY + yOff;
      const ya = y - waveAmp, yb = y + waveAmp;
      return `M-200 ${y} Q-162 ${ya} -125 ${y} Q-87 ${yb} -50 ${y} Q-12 ${ya} 25 ${y} Q62 ${yb} 100 ${y} Q137 ${ya} 175 ${y} Q212 ${yb} 250 ${y} Q287 ${ya} 325 ${y} Q362 ${yb} 400 ${y} V${TY + TH} H-200 Z`;
    };

    const tankSVG = `
      <svg class="tank-svg" viewBox="0 0 185 265" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id="${uid}-clip">
            <rect x="${TX}" y="${fillTop}" width="${TW}" height="${fillH}"/>
          </clipPath>
          <linearGradient id="${uid}-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${waterLight}" stop-opacity="0.9"/>
            <stop offset="100%" stop-color="${waterColor}"/>
          </linearGradient>
          <linearGradient id="${uid}-tank-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${waterColor}" stop-opacity="0.06"/>
            <stop offset="100%" stop-color="${waterColor}" stop-opacity="0.02"/>
          </linearGradient>
        </defs>

        <!-- Tanque fondo -->
        <rect x="${TX}" y="${TY}" width="${TW}" height="${TH}" rx="8"
              fill="url(#${uid}-tank-bg)" stroke="${waterColor}44" stroke-width="2"/>

        <!-- Agua (relleno sólido bajo la ola) -->
        <rect clip-path="url(#${uid}-clip)"
              x="${TX}" y="${TY}" width="${TW}" height="${TH}" rx="8"
              fill="url(#${uid}-grad)"/>

        <!-- Ola principal -->
        <g clip-path="url(#${uid}-clip)" class="wave1">
          <path d="${makePath(0, 0.9)}" fill="${waterColor}" opacity="0.9"/>
        </g>

        <!-- Ola secundaria (profundidad) -->
        <g clip-path="url(#${uid}-clip)" class="wave2">
          <path d="${makePath(waveAmp * 0.6, 0.45)}" fill="${waterLight}" opacity="0.45"/>
        </g>

        <!-- Porcentaje centrado -->
        <text x="${TX + TW / 2}" y="${textY}"
              text-anchor="middle" dominant-baseline="middle"
              font-size="30" font-weight="700" fill="${textColor}"
              font-family="var(--paper-font-headline_-_font-family,Roboto,sans-serif)"
              style="text-shadow:0 1px 4px rgba(0,0,0,0.3)">
          ${Math.round(pct)}%
        </text>

        <!-- Contorno del tanque (encima) -->
        <rect x="${TX}" y="${TY}" width="${TW}" height="${TH}" rx="8"
              fill="none" stroke="${waterColor}" stroke-width="2.5"/>

        <!-- Ticks de medición -->
        ${ticks}

        <!-- Tapa superior -->
        <rect x="${TX + 10}" y="${TY - 14}" width="${TW - 20}" height="15" rx="4"
              fill="${waterColor}" opacity="0.85"/>
        <rect x="${TX + 35}" y="${TY - 22}" width="${TW - 70}" height="10" rx="3"
              fill="${waterColor}" opacity="0.7"/>

        <!-- Base / pie -->
        <rect x="${TX + 20}" y="${TY + TH}" width="${TW - 40}" height="10" rx="3"
              fill="${waterColor}" opacity="0.5"/>
        <rect x="${TX + 45}" y="${TY + TH + 8}" width="${TW - 90}" height="14" rx="3"
              fill="${waterColor}" opacity="0.35"/>
        <!-- Pies -->
        <rect x="${TX + 18}" y="${TY + TH + 20}" width="18" height="22" rx="3"
              fill="${waterColor}" opacity="0.3"/>
        <rect x="${TX + TW - 36}" y="${TY + TH + 20}" width="18" height="22" rx="3"
              fill="${waterColor}" opacity="0.3"/>

        <!-- Válvula lateral (detalle decorativo) -->
        <circle cx="${TX - 8}" cy="${TY + TH * 0.65}" r="5"
                fill="${waterColor}" opacity="0.6" stroke="white" stroke-width="1"/>
        <line x1="${TX - 8}" y1="${TY + TH * 0.65 - 5}"
              x2="${TX - 8}" y2="${TY + TH * 0.65 + 5}"
              stroke="white" stroke-width="1.5"/>
      </svg>`;

    // --- Texto de estado ---
    let statusChip = '';
    if (isRegen) {
      statusChip = `<span class="chip chip-regen">Regenerando</span>`;
    } else if (pct < 10) {
      statusChip = `<span class="chip chip-crit">Nivel cr&iacute;tico</span>`;
    } else if (pct < 25) {
      statusChip = `<span class="chip chip-warn">Nivel bajo</span>`;
    }

    // --- Bloque de próxima regeneración ---
    let regenBlock = '';
    if (isRegen) {
      regenBlock = `
        <div class="regen-box regen-active">
          <span class="regen-icon">&#9851;</span>
          <div>
            <div class="regen-title">Regeneraci&oacute;n en curso</div>
            <div class="regen-sub">El sistema se resetear&aacute; al terminar</div>
          </div>
        </div>`;
    } else if (daysUntil !== undefined && daysUntil !== null) {
      const days = daysUntil;
      const daysRound = Math.ceil(days);
      let dateLabel = '';
      if (nextRegenDate) {
        try {
          // nextRegenDate es ISO "YYYY-MM-DD" → parsear como local
          const parts = nextRegenDate.split('-');
          const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
          dateLabel = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        } catch (e) { dateLabel = nextRegenDate; }
      }
      let regenMsg, regenClass;
      if (days <= 0) {
        regenMsg = 'Regeneraci&oacute;n necesaria ahora';
        regenClass = 'regen-urgent';
      } else if (daysRound === 1) {
        regenMsg = 'Pr&oacute;xima regeneraci&oacute;n: <strong>ma&ntilde;ana</strong>';
        regenClass = 'regen-soon';
      } else {
        regenMsg = `Pr&oacute;xima regeneraci&oacute;n: <strong>en ${daysRound} d&iacute;as</strong>`;
        regenClass = daysRound <= 3 ? 'regen-soon' : '';
      }
      regenBlock = `
        <div class="regen-box ${regenClass}">
          <span class="regen-icon">&#9854;</span>
          <div>
            <div class="regen-title">${regenMsg}</div>
            ${dateLabel ? `<div class="regen-sub">${dateLabel}</div>` : ''}
          </div>
        </div>`;
    } else {
      regenBlock = `
        <div class="regen-box regen-unknown">
          <span class="regen-icon">&#128202;</span>
          <div>
            <div class="regen-title">Acumulando datos de consumo...</div>
            <div class="regen-sub">La estimaci&oacute;n aparecer&aacute; despu&eacute;s del primer d&iacute;a completo</div>
          </div>
        </div>`;
    }

    // --- Última regeneración ---
    let lastRegenLabel = '';
    if (lastRegen) {
      try {
        const d = new Date(lastRegen);
        lastRegenLabel = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
      } catch (e) { lastRegenLabel = lastRegen; }
    }

    const title = cfg.title || 'Descalcificador';

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          overflow: hidden;
          border-radius: 16px;
          background: var(--ha-card-background, var(--card-background-color, white));
        }

        /* Cabecera con degradado */
        .card-header {
          background: ${bgGrad};
          padding: 16px 18px 12px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .header-icon { font-size: 26px; }
        .header-title {
          font-size: 17px;
          font-weight: 700;
          color: white;
          flex: 1;
          text-shadow: 0 1px 3px rgba(0,0,0,0.4);
        }
        .chip {
          font-size: 11px;
          font-weight: 700;
          padding: 3px 9px;
          border-radius: 12px;
          letter-spacing: 0.4px;
          text-transform: uppercase;
        }
        .chip-regen { background: rgba(255,255,255,0.2); color: white; }
        .chip-warn  { background: #ff6f00; color: white; }
        .chip-crit  { background: #b71c1c; color: white; animation: blink 1.2s ease-in-out infinite; }

        @keyframes blink {
          0%,100% { opacity: 1; } 50% { opacity: 0.5; }
        }

        /* Fila de litros totales / restantes */
        .liters-row {
          display: flex;
          gap: 10px;
          padding: 14px 16px 0;
        }
        .liter-box {
          flex: 1;
          background: var(--secondary-background-color);
          border-radius: 12px;
          padding: 10px 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .liter-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: var(--secondary-text-color);
        }
        .liter-value {
          font-size: 22px;
          font-weight: 800;
          color: ${waterColor};
          line-height: 1.1;
        }
        .liter-unit {
          font-size: 11px;
          color: var(--secondary-text-color);
        }

        /* Contenedor del tanque SVG */
        .tank-wrap {
          display: flex;
          justify-content: center;
          padding: 10px 0 4px;
        }
        .tank-svg {
          width: 175px;
          height: auto;
          filter: drop-shadow(0 6px 14px rgba(0,0,0,0.18));
        }

        @keyframes wave-fwd-${uid} {
          from { transform: translateX(0); }
          to   { transform: translateX(200px); }
        }
        @keyframes wave-bck-${uid} {
          from { transform: translateX(-200px); }
          to   { transform: translateX(0); }
        }
        .wave1 { animation: wave-fwd-${uid} 3.2s linear infinite; }
        .wave2 { animation: wave-bck-${uid} 4.8s linear infinite; }

        /* Bloque de regeneración */
        .regen-box {
          margin: 10px 16px 4px;
          border-radius: 12px;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          background: var(--secondary-background-color);
        }
        .regen-active  { background: rgba(56,142,60,0.12); border: 1px solid #43a047; }
        .regen-urgent  { background: rgba(229,57,53,0.12);  border: 1px solid #e53935; }
        .regen-soon    { background: rgba(251,140,0,0.10);  border: 1px solid #fb8c00; }
        .regen-unknown { opacity: 0.65; }
        .regen-icon { font-size: 22px; flex-shrink: 0; }
        .regen-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--primary-text-color);
          line-height: 1.3;
        }
        .regen-sub {
          font-size: 11px;
          color: var(--secondary-text-color);
          margin-top: 2px;
        }

        /* Fila de estadísticas inferiores */
        .stats-bottom {
          display: flex;
          gap: 8px;
          padding: 10px 16px 16px;
          flex-wrap: wrap;
        }
        .stat-pill {
          flex: 1;
          min-width: 110px;
          background: var(--secondary-background-color);
          border-radius: 10px;
          padding: 8px 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 6px;
        }
        .stat-pill-label {
          font-size: 11px;
          color: var(--secondary-text-color);
        }
        .stat-pill-value {
          font-size: 13px;
          font-weight: 700;
          color: var(--primary-text-color);
          text-align: right;
        }
      </style>

      <ha-card>
        <!-- Cabecera -->
        <div class="card-header">
          <span class="header-icon">&#128167;</span>
          <span class="header-title">${title}</span>
          ${statusChip}
        </div>

        <!-- Litros totales y restantes -->
        <div class="liters-row">
          <div class="liter-box">
            <span class="liter-label">Capacidad total</span>
            <span class="liter-value">${Math.round(capacity).toLocaleString('es-ES')}</span>
            <span class="liter-unit">litros</span>
          </div>
          <div class="liter-box">
            <span class="liter-label">Litros restantes</span>
            <span class="liter-value">${Math.round(remaining).toLocaleString('es-ES')}</span>
            <span class="liter-unit">litros</span>
          </div>
        </div>

        <!-- Tanque animado con porcentaje -->
        <div class="tank-wrap">
          ${tankSVG}
        </div>

        <!-- Estimación próxima regeneración -->
        ${regenBlock}

        <!-- Stats inferiores -->
        <div class="stats-bottom">
          ${avgDaily != null ? `
          <div class="stat-pill">
            <span class="stat-pill-label">&#128200; Consumo medio</span>
            <span class="stat-pill-value">${Math.round(avgDaily)} L/d&iacute;a</span>
          </div>` : ''}
          ${lastRegenLabel ? `
          <div class="stat-pill">
            <span class="stat-pill-label">&#9851; &Uacute;lt. regeneraci&oacute;n</span>
            <span class="stat-pill-value">${lastRegenLabel}</span>
          </div>` : ''}
        </div>
      </ha-card>`;
  }

  getCardSize() { return 5; }
}

customElements.define('water-softener-card', WaterSoftenerCard);

window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === 'water-softener-card')) {
  window.customCards.push({
    type: 'water-softener-card',
    name: 'Water Softener Card',
    description: 'Tarjeta visual para el Descalcificador: tanque animado, consumo histórico y estimación de regeneración.',
    preview: true,
    documentationURL: 'https://github.com/TU_USUARIO/water_softener',
  });
}
