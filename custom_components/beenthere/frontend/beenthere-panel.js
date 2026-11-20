// Sidebar panel: HA-style toolbar + the card rendered full height.
// Import the card with the same ?v= so panel and dashboards share one module instance.
await import(new URL('beenthere-card.js' + new URL(import.meta.url).search, import.meta.url).href);

class BeenTherePanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'}).innerHTML = `<style>
      :host { display: block; min-height: 100%; background: var(--primary-background-color); }
      .toolbar { display: flex; align-items: center; gap: 4px; height: var(--header-height, 56px); padding: 0 12px 0 4px;
        background: var(--app-header-background-color); color: var(--app-header-text-color, var(--text-primary-color));
        border-bottom: var(--app-header-border-bottom, none); font-size: 20px; position: sticky; top: 0; z-index: 4; }
      .title { flex: 1; margin-left: 20px; }
      ha-menu-button + .title { margin-left: 4px; }
      button { display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 12px; border: 0; border-radius: 20px;
        background: none; color: inherit; font: inherit; font-size: 14px; cursor: pointer; }
      button:hover { background: rgba(127,127,127,.15); }
      @media (max-width: 600px) { button span { display: none; } }
    </style>
    <div class="toolbar"><ha-menu-button></ha-menu-button><div class="title">BeenThere</div>
      <button hidden><ha-icon></ha-icon><span></span></button></div>`;
    this.menu = this.shadowRoot.querySelector('ha-menu-button');
    this.button = this.shadowRoot.querySelector('button');
    this.card = document.createElement('beenthere-card');
    this.card.panel = true;
    this.card.setConfig({});
    this.shadowRoot.append(this.card);
    this.button.onclick = () => this.card.toggleSettings();
    this.card.addEventListener('beenthere-settings', () => this.sync());
    this.sync();
  }
  sync() {
    const open = this.card.settingsOpen;
    this.button.querySelector('ha-icon').setAttribute('icon', open ? 'mdi:map-outline' : 'mdi:cog');
    this.button.querySelector('span').textContent = open ? 'Map' : 'Settings';
  }
  set hass(hass) {
    this.menu.hass = hass;
    this.card.hass = hass;
    this.button.hidden = !hass.user?.is_admin;
  }
  set narrow(narrow) { this.menu.narrow = narrow; }
}

customElements.get('beenthere-panel') || customElements.define('beenthere-panel', BeenTherePanel);
