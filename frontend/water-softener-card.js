/**
 * water-softener-card  v1.2
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

  static getConfigElement() {
    return document.createElement('water-softener-card-editor');
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
    const manualPending = attrs.manual_completion_pending === true;
    const entryId = attrs.entry_id || '';
    this._entryId = entryId;
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
    // viewBox: 0 0 185 265  — Tanque: x=10, y=22, w=130, h=200, rx=8
    const TX = 10, TY = 22, TW = 130, TH = 200;
    const CX = TX + TW / 2;  // 75

    // Geometría: tubo central de resina + zona sal en la base
    const saltH   = 44;                   // zona sal: base ~22% del tanque
    const saltY   = TY + TH - saltH;     // y=178 — inicio zona sal
    const CTUBE_W = 36;                   // ancho del tubo central con resina
    const CTUBE_X = CX - CTUBE_W / 2;   // x=57

    // Porcentaje centrado en el tanque
    const textY = TY + TH / 2 + 8;

    // Ola sutil en la superficie superior (tanque siempre lleno)
    const waveAmp = 5;
    const waveY   = TY + 12;
    // La ola rellena hacia ARRIBA (V${TY}): crea el efecto de superficie
    const makePath = (yOff) => {
      const y = waveY + yOff;
      const ya = y - waveAmp, yb = y + waveAmp;
      return `M-200 ${y} Q-162 ${ya} -125 ${y} Q-87 ${yb} -50 ${y} Q-12 ${ya} 25 ${y} Q62 ${yb} 100 ${y} Q137 ${ya} 175 ${y} Q212 ${yb} 250 ${y} Q287 ${ya} 325 ${y} Q362 ${yb} 400 ${y} V${TY} H-200 Z`;
    };

    // Bolitas de resina generadas inline con JS (sin <pattern> para evitar bugs de clip)
    let resinDots = '';
    const dotR = 2.0, dotSX = 7, dotSY = 7;
    for (let row = 0, dy = TY + 6; dy < saltY - 4; dy += dotSY, row++) {
      const xOff = (row % 2) * (dotSX / 2);
      for (let dx = CTUBE_X + 4; dx < CTUBE_X + CTUBE_W - 3; dx += dotSX) {
        const cx = dx + xOff;
        if (cx > CTUBE_X + 2 && cx < CTUBE_X + CTUBE_W - 2) {
          resinDots += `<circle cx="${cx.toFixed(1)}" cy="${dy}" r="${dotR}" fill="${waterLight}" fill-opacity="0.7"/>`;
        }
      }
    }

    // Bolas de sal generadas inline con JS (sin <pattern>)
    const ballR = 9;
    const saltRows = [
      { y: saltY + saltH - ballR - 1,     xs: [19, 40, 61, 82, 103, 124], r: ballR },
      { y: saltY + saltH - ballR * 2 - 4, xs: [30, 51, 72, 93, 114],      r: ballR },
      { y: saltY + 7,                      xs: [44, 64, 84, 104],          r: 6 },
    ];
    let saltBalls = '';
    saltRows.forEach(({ y, xs, r }) => {
      xs.forEach(cx => {
        saltBalls += `<circle cx="${cx}" cy="${y}" r="${r}" fill="white" fill-opacity="0.88" stroke="#ccc" stroke-width="0.5"/>`;
      });
    });

    const tankSVG = `
      <svg class="tank-svg" viewBox="0 0 185 265" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <!-- Clip al contorno del tanque — en el padre estático, nunca en el animado -->
          <clipPath id="${uid}-clip">
            <rect x="${TX}" y="${TY}" width="${TW}" height="${TH}" rx="8"/>
          </clipPath>
          <!-- Gradiente de agua (color según estado de capacidad) -->
          <linearGradient id="${uid}-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${waterLight}" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="${waterColor}"/>
          </linearGradient>
        </defs>

        <!-- Fondo neutro -->
        <rect x="${TX}" y="${TY}" width="${TW}" height="${TH}" rx="8"
              fill="${waterColor}" fill-opacity="0.06" stroke="${waterColor}44" stroke-width="2"/>

        <!-- ░░ INTERIOR — todo recortado al contorno del tanque ░░ -->
        <g clip-path="url(#${uid}-clip)">

          <!-- Fondo: agua llena todo el tanque -->
          <rect x="${TX}" y="${TY}" width="${TW}" height="${TH}" fill="url(#${uid}-grad)"/>

          <!-- Tubo central de resina: overlay oscuro sobre el agua -->
          <rect x="${CTUBE_X}" y="${TY}" width="${CTUBE_W}" height="${TH}"
                fill="rgba(0,0,0,0.22)"/>
          <line x1="${CTUBE_X}"            y1="${TY}" x2="${CTUBE_X}"            y2="${TY + TH}"
                stroke="white" stroke-width="0.8" stroke-opacity="0.3"/>
          <line x1="${CTUBE_X + CTUBE_W}" y1="${TY}" x2="${CTUBE_X + CTUBE_W}" y2="${TY + TH}"
                stroke="white" stroke-width="0.8" stroke-opacity="0.3"/>

          <!-- Bolitas de resina (círculos inline) -->
          ${resinDots}

          <!-- Separador zona sal -->
          <line x1="${TX}" y1="${saltY}" x2="${TX + TW}" y2="${saltY}"
                stroke="white" stroke-width="1" stroke-opacity="0.4" stroke-dasharray="4 3"/>

          <!-- Fondo zona sal (ligeramente más oscuro) -->
          <rect x="${TX}" y="${saltY}" width="${TW}" height="${saltH}"
                fill="rgba(0,0,0,0.18)"/>

          <!-- Bolas de sal blancas (círculos inline) -->
          ${saltBalls}

          <!-- Ola en la superficie superior (animada dentro del clip estático) -->
          <g class="wave1">
            <path d="${makePath(0)}" fill="${waterColor}" opacity="0.65"/>
          </g>
          <g class="wave2">
            <path d="${makePath(waveAmp * 0.6)}" fill="${waterLight}" opacity="0.35"/>
          </g>

        </g>

        <!-- Porcentaje centrado -->
        <text x="${CX}" y="${textY}"
              text-anchor="middle" dominant-baseline="middle"
              font-size="28" font-weight="700" fill="white"
              font-family="var(--paper-font-headline_-_font-family,Roboto,sans-serif)"
              style="text-shadow:0 1px 6px rgba(0,0,0,0.55)">
          ${Math.round(pct)}%
        </text>

        <!-- Contorno del tanque (encima de todo) -->
        <rect x="${TX}" y="${TY}" width="${TW}" height="${TH}" rx="8"
              fill="none" stroke="${waterColor}" stroke-width="2.5"/>

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
        <rect x="${TX + 18}" y="${TY + TH + 20}" width="18" height="22" rx="3"
              fill="${waterColor}" opacity="0.3"/>
        <rect x="${TX + TW - 36}" y="${TY + TH + 20}" width="18" height="22" rx="3"
              fill="${waterColor}" opacity="0.3"/>

        <!-- Válvula lateral -->
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
      statusChip = `<span class="chip chip-crit">Regeneraci&oacute;n en Breve</span>`;
    } else if (pct < 25) {
      statusChip = `<span class="chip chip-warn">Regeneraci&oacute;n Pr&oacute;xima</span>`;
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
        regenMsg = 'Regeneraci&oacute;n en Breve';
        regenClass = 'regen-urgent';
      } else if (daysRound === 1) {
        regenMsg = 'Regeneraci&oacute;n Pr&oacute;xima: <strong>ma&ntilde;ana</strong>';
        regenClass = 'regen-soon';
      } else {
        regenMsg = `Regeneraci&oacute;n Pr&oacute;xima: <strong>en ${daysRound} d&iacute;as</strong>`;
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

        /* Botón completado manual (sensor único) */
        .btn-complete {
          display: block;
          width: calc(100% - 32px);
          margin: 10px 16px 4px;
          padding: 12px;
          background: #1e88e5;
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.5px;
          cursor: pointer;
          text-transform: uppercase;
          animation: pulse-btn 1.8s ease-in-out infinite;
        }
        .btn-complete:hover { background: #1565c0; }
        @keyframes pulse-btn {
          0%,100% { box-shadow: 0 0 0 0 rgba(30,136,229,0.5); }
          50%      { box-shadow: 0 0 0 8px rgba(30,136,229,0); }
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

        <!-- Botón completado manual (solo sensor único, cuando pending) -->
        ${manualPending ? `<button class="btn-complete" id="${uid}-btn-complete">&#9989; Regeneración Completada</button>` : ''}

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
    if (manualPending) this._bindEvents();
  }

  _bindEvents() {
    const btn = this.shadowRoot.getElementById(`${this._uid}-btn-complete`);
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!confirm('¿Confirmas que la regeneración ha finalizado?\nEsto restablecerá la capacidad del descalcificador.')) return;
      this._hass.callService('water_softener', 'complete_regeneration', { entry_id: this._entryId });
    });
  }

  getCardSize() { return 5; }
}

customElements.define('water-softener-card', WaterSoftenerCard);

// ─── Editor visual ────────────────────────────────────────────────────────────
class WaterSoftenerCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _wsEntities() {
    if (!this._hass) return [];
    return Object.entries(this._hass.states)
      .filter(([id, st]) =>
        id.startsWith('sensor.') &&
        st.attributes.capacity_L !== undefined &&
        st.attributes.entry_id !== undefined
      )
      .map(([id, st]) => ({
        value: id,
        label: st.attributes.friendly_name || id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  _render() {
    if (!this._config) return;

    const entities = this._wsEntities();

    if (entities.length === 0) {
      this.shadowRoot.innerHTML = `
        <style>
          .notice {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            margin: 8px 0;
            padding: 14px 16px;
            background: rgba(255,152,0,0.10);
            border: 1px solid #fb8c00;
            border-radius: 10px;
            color: var(--primary-text-color);
            font-size: 13.5px;
            line-height: 1.5;
          }
          .notice-icon { font-size: 22px; flex-shrink: 0; margin-top: 1px; }
        </style>
        <div class="notice">
          <span class="notice-icon">⚠️</span>
          <span>No se encontró ningún descalcificador configurado.<br>
          Ve a <strong>Ajustes → Integraciones → Water Softener</strong>
          y crea al menos un dispositivo antes de añadir esta tarjeta.</span>
        </div>
      `;
      return;
    }

    const opts = entities.map(e =>
      `<option value="${e.value}" ${e.value === (this._config.entity || '') ? 'selected' : ''}>${e.label}</option>`
    ).join('');

    this.shadowRoot.innerHTML = `
      <style>
        .form { display: flex; flex-direction: column; gap: 16px; padding: 16px 0; }
        .field { display: flex; flex-direction: column; gap: 4px; }
        label {
          font-size: 12px;
          font-weight: 500;
          color: var(--secondary-text-color);
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        select, input {
          width: 100%;
          box-sizing: border-box;
          height: 48px;
          padding: 0 12px;
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 6px;
          background: var(--card-background-color, white);
          color: var(--primary-text-color);
          font-size: 14px;
          font-family: inherit;
          outline: none;
          cursor: pointer;
          appearance: auto;
        }
        select:focus, input:focus {
          border-color: var(--primary-color, #03a9f4);
        }
        input { cursor: text; }
      </style>
      <div class="form">
        <div class="field">
          <label>Descalcificador</label>
          <select id="entity-select">${opts}</select>
        </div>
        <div class="field">
          <label>Título de la tarjeta (opcional)</label>
          <input id="title-input" type="text" placeholder="Descalcificador"
                 value="${(this._config.title || '').replace(/"/g, '&quot;')}">
        </div>
      </div>
    `;

    this.shadowRoot.getElementById('entity-select').addEventListener('change', (ev) => {
      this._config = { ...this._config, entity: ev.target.value };
      this._fireChanged();
    });

    this.shadowRoot.getElementById('title-input').addEventListener('change', (ev) => {
      const val = ev.target.value.trim();
      const cfg = { ...this._config };
      if (val) cfg.title = val;
      else delete cfg.title;
      this._config = cfg;
      this._fireChanged();
    });
  }

  _fireChanged() {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true,
    }));
  }
}

customElements.define('water-softener-card-editor', WaterSoftenerCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === 'water-softener-card')) {
  window.customCards.push({
    type: 'water-softener-card',
    name: 'Water Softener Card',
    description: 'Tarjeta visual para el Descalcificador: tanque animado, consumo histórico y estimación de regeneración.',
    preview: true,
    documentationURL: 'https://github.com/strecklecsuk/water_softener',
  });
}
