// BeenThere – travel map card. Also rendered full-height inside the BeenThere panel.
const BASE = new URL('.', import.meta.url);
const VERSION = new URL(import.meta.url).search; // ?v=<hash of frontend files>, set by the integration
const asset = path => new URL(path + VERSION, BASE).href;

// Fetched once per page load and shared by every card/panel instance; the browser
// caches the files themselves until the integration ships new ones (new ?v=).
const fetched = new Map();
const load = path => {
  if (!fetched.has(path)) {
    fetched.set(path, fetch(asset(path)).then(r => {
      if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
      return r.json();
    }).catch(e => { fetched.delete(path); throw e; }));
  }
  return fetched.get(path);
};

// [west, south, east, north] in degrees; east may exceed 180 to wrap across the antimeridian.
const VIEWS = {
  World: [-180, -58, 180, 84],
  Africa: [-26, -36, 60, 38],
  Antarctica: [-180, -90, 180, -60],
  Asia: [25, -12, 190, 78],
  Europe: [-25, 34, 50, 72],
  'North America': [-170, 6, -12, 84],
  Oceania: [110, -48, 200, 5],
  'South America': [-92, -56, -34, 13],
};
const CONTINENTS = Object.keys(VIEWS).slice(1);
const MAX_ZOOM = 12;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const flag = code => /^[A-Z]{2}$/.test(code ?? '')
  ? String.fromCodePoint(...[...code].map(c => 0x1f1a5 + c.charCodeAt(0))) : '🏳️';
const store = {
  get: key => { try { return localStorage.getItem(`beenthere.${key}`); } catch { return null; } },
  set: (key, value) => { try { localStorage.setItem(`beenthere.${key}`, value); } catch { /* private mode */ } },
};
const icon = (name, extra = '') => `<ha-icon icon="mdi:${name}" ${extra}></ha-icon>`;

class BeenThereCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.data = null;
    this.view = store.get('view') || '';
    this.continent = VIEWS[store.get('continent')] ? store.get('continent') : 'World';
    this.mode = 'any';
    this.selected = null;
    this.expanded = new Set();
    this.settingsOpen = false;
    this.zoom = 1;
    this.listCollapsed = store.get('list') === 'collapsed';
    this.regional = {};
  }

  // ---------- Lovelace / panel plumbing ----------
  setConfig(config) { this.config = config || {}; }
  getCardSize() { return 8; }
  getGridOptions() { return {columns: 12, min_columns: 6, rows: 8}; }
  static getStubConfig() { return {}; }

  set hass(hass) {
    const wasAdmin = this.canEdit();
    this._hass = hass;
    if (!this.shadowRoot.firstChild) this.build();
    this.subscribe();
    if (wasAdmin !== this.canEdit()) this.update();
  }
  get hass() { return this._hass; }
  canEdit() { return this._hass?.user?.is_admin === true; }

  connectedCallback() { this.subscribe(); }
  disconnectedCallback() {
    this._unsub?.then(unsub => unsub()).catch(() => {});
    this._unsub = null;
  }
  subscribe() {
    if (this._unsub || !this.isConnected || !this._hass) return;
    // The websocket library re-subscribes on reconnect, so this survives HA restarts.
    this._unsub = this._hass.connection.subscribeMessage(data => {
      this.data = data;
      this.update();
    }, {type: 'beenthere/subscribe'});
    this._unsub.catch(e => { this._unsub = null; this.fail(e); });
  }

  async change(action, args = {}) {
    if (this.busy) return false;
    this.busy = true; this.error = '';
    this.update();
    try {
      this.data = await this._hass.callWS({type: 'beenthere/change', action, ...args});
      return true;
    } catch (e) {
      this.error = e.message || String(e);
      return false;
    } finally {
      this.busy = false;
      this.update();
    }
  }
  fail(e) { console.error('BeenThere:', e); this.error = e.message || String(e); this.update(); }

  // ---------- derived state ----------
  get travellers() { return this.data?.travellers || {}; }
  get groups() { return this.data?.groups || {}; }
  members() {
    const [kind, id] = this.view.split(':');
    if (kind === 't' && this.travellers[id]) return [id];
    if (kind === 'g' && this.groups[id]) return this.groups[id].members;
    return Object.keys(this.travellers);
  }
  traveller() {
    const [kind, id] = this.view.split(':');
    return kind === 't' && this.travellers[id] ? id : null;
  }
  // Location codes recorded for the current view ("all" = only those every member has).
  explicit() {
    const sets = this.members().map(id => new Set(this.travellers[id]?.countries || []));
    if (this.mode === 'all' && sets.length > 1) return new Set([...sets[0]].filter(c => sets.every(s => s.has(c))));
    return new Set(sets.flatMap(s => [...s]));
  }
  // A region visit implies its country.
  effective(explicit) { return new Set([...explicit].map(c => c.split('-')[0])); }
  detailOn(country) { return (this.data?.map_settings?.subdivision_countries || []).includes(country); }
  regionsOf(country) { return Object.entries(this.catalogue?.subdivisions?.[country] || {}); }
  nameOf(code) {
    const [country, region] = code.split('-');
    return region ? this.catalogue?.subdivisions?.[country]?.[code] : this.countryNames?.get(code);
  }
  continentOf(code) { return this.countryContinent?.get(code); }
  inContinent(code) {
    if (this.continent === 'World') return true;
    return this.continentOf(code) === this.continent || (code === 'RU' && this.continent === 'Asia');
  }

  // ---------- one-time DOM ----------
  build() {
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <ha-card class="root">
        <section class="settings" hidden></section>
        <section class="main">
          <div class="bar">
            <div class="search">${icon('magnify')}<input id="q" type="search" placeholder="Search countries & regions" autocomplete="off" aria-label="Search places"><ul id="suggest" role="listbox" hidden></ul></div>
            <select id="view" aria-label="Traveller or group"></select>
            <div class="seg" id="mode" role="group" aria-label="Visited by" hidden><button data-mode="any" title="Visited by anyone selected">Any</button><button data-mode="all" title="Visited by everyone selected">All</button></div>
            <select id="continent" aria-label="Continent">${['World', ...CONTINENTS].map(c => `<option value="${c}">${c === 'World' ? 'World' : c}</option>`).join('')}</select>
          </div>
          <div class="body">
            <div class="map">
              <svg id="svg" preserveAspectRatio="xMidYMid meet" tabindex="0" aria-label="Map"><g id="shapes"></g></svg>
              <div class="zoom"><button data-zoom="in" title="Zoom in">${icon('plus')}</button><button data-zoom="out" title="Zoom out">${icon('minus')}</button><button data-zoom="reset" title="Reset view">${icon('fit-to-screen-outline')}</button></div>
              <p class="loading">Loading map…</p>
              <div id="result"></div>
            </div>
            <aside class="side"><button class="side-head" data-act="toggle-list"><span id="count"></span>${icon('chevron-down')}</button><ul id="list"></ul></aside>
          </div>
          <p id="error" class="error" hidden></p>
        </section>
        <dialog id="dialog"></dialog>
      </ha-card>`;
    const $ = this.$ = sel => this.shadowRoot.querySelector(sel);
    this.shadowRoot.addEventListener('click', e => this.onClick(e));
    $('#view').onchange = e => { this.view = e.target.value; store.set('view', this.view); this.update(); };
    $('#continent').onchange = e => this.setContinent(e.target.value);
    $('#q').oninput = () => { this.searchIndex = 0; this.suggest(); };
    $('#q').onfocus = () => this.suggest();
    $('#q').onblur = () => setTimeout(() => { $('#suggest').hidden = true; }, 150);
    $('#q').onkeydown = e => this.onSearchKey(e);
    this.bindMap($('#svg'));
    new ResizeObserver(() => this.applyView()).observe($('.map'));
    Promise.all([load('geography.json'), load('maps/world.geojson')]).then(([catalogue, world]) => {
      this.catalogue = catalogue;
      this.countryNames = new Map();
      this.countryContinent = new Map();
      for (const [continent, countries] of Object.entries(catalogue.countries)) {
        for (const [code, name] of Object.entries(countries)) {
          this.countryNames.set(code, name);
          this.countryContinent.set(code, continent);
        }
      }
      this.world = world.features;
      this.update();
    }).catch(e => this.fail(e));
  }

  // ---------- rendering ----------
  update() {
    if (!this.$) return;
    const $ = this.$;
    const ready = !!(this.world && this.data);
    this.toggleAttribute('panel', !!this.panel);
    $('.settings').hidden = !(this.settingsOpen && this.canEdit());
    $('.main').hidden = !$('.settings').hidden;
    $('#error').hidden = !this.error;
    $('#error').textContent = this.error || '';
    $('.loading').hidden = !!this.world;
    if (!ready) return;

    // controls
    const opts = [['', 'All travellers'],
      ...Object.entries(this.travellers).map(([id, t]) => [`t:${id}`, t.name]),
      ...Object.entries(this.groups).map(([id, g]) => [`g:${id}`, `${g.name} (group)`])];
    if (!opts.some(([v]) => v === this.view)) this.view = '';
    $('#view').innerHTML = opts.map(([v, n]) => `<option value="${esc(v)}" ${v === this.view ? 'selected' : ''}>${esc(n)}</option>`).join('');
    $('#continent').value = this.continent;
    const group = this.members().length > 1;
    $('#mode').hidden = !group;
    if (!group) this.mode = 'any';
    $('#mode').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === this.mode));
    $('.body').classList.toggle('collapsed', this.listCollapsed);
    $('.side-head ha-icon').setAttribute('icon', `mdi:chevron-${this.listCollapsed ? 'up' : 'down'}`);

    const explicit = this.explicit();
    const effective = this.effective(explicit);
    this.drawShapes();
    for (const path of $('#shapes').children) {
      const code = path.dataset.code;
      if (!code) continue;
      const region = code.includes('-');
      path.classList.toggle('visited', region ? explicit.has(code) : effective.has(code));
      path.classList.toggle('selected', code === this.selected);
    }
    this.renderResult(explicit, effective);
    this.renderList(explicit, effective);
    if (this.settingsOpen && this.canEdit()) this.renderSettings();
  }

  // Path strings depend only on the continent (projection) and which regional maps are shown.
  drawShapes() {
    const detail = (this.catalogue.subdivision_countries || [])
      .filter(c => this.detailOn(c) && this.inContinent(c));
    detail.forEach(c => this.loadRegional(c));
    const shown = detail.filter(c => this.regional[c]);
    const key = `${this.continent}|${shown}`;
    if (this._shapesKey === key) return;
    this._shapesKey = key;
    const [w, s, e, n] = VIEWS[this.continent];
    const center = (w + e) / 2;
    const kx = this.continent === 'World' ? 1 : Math.cos((s + n) / 2 * Math.PI / 180);
    const path = geometry => {
      const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
      return polys.map(poly => {
        // Shift whole polygons (not points) across the seam so nothing smears across the map.
        const mean = poly[0].reduce((sum, p) => sum + p[0], 0) / poly[0].length;
        const shift = mean < center - 180 ? 360 : mean > center + 180 ? -360 : 0;
        return poly.map(ring => 'M' + ring.map(([x, y]) => `${((x + shift) * kx).toFixed(2)},${(-y).toFixed(2)}`).join('L') + 'Z').join('');
      }).join('');
    };
    const shape = (code, name, geometry, cls) =>
      `<path class="${cls}" ${code ? `data-code="${code}"` : ''} d="${path(geometry)}">${name ? `<title>${esc(name)}</title>` : ''}</path>`;
    this.$('#shapes').innerHTML =
      this.world.map(f => shape(f.id, f.properties.name, f.geometry,
        `land${f.id ? '' : ' none'}${shown.includes(f.id) ? ' detailed' : ''}`)).join('') +
      shown.flatMap(c => this.regional[c].features.map(f =>
        shape(f.properties.id, f.properties.name, f.geometry, 'land region'))).join('');
    // The continent's frame, and the whole world around it (the limit for padding and panning).
    const south = Math.min(s, -58), north = Math.max(n, 84);
    this.frame = {x: w * kx, y: -n, w: (e - w) * kx, h: n - s};
    this.extent = {x: (center - 180) * kx, y: -north, w: 360 * kx, h: north - south};
    this.home();
  }

  loadRegional(code) {
    if (this.regional[code] || this._loading?.has(code)) return;
    (this._loading ||= new Set()).add(code);
    load(`maps/${code}.geojson`)
      .then(map => { this.regional[code] = map; this.update(); })
      .catch(e => this.fail(e))
      .finally(() => this._loading.delete(code));
  }

  renderResult(explicit, effective) {
    const box = this.$('#result');
    const code = this.selected;
    if (!code) { box.innerHTML = ''; return; }
    const country = code.split('-')[0];
    const region = code !== country;
    const traveller = this.traveller();
    const isExplicit = explicit.has(code);
    const visited = region ? isExplicit : effective.has(code);
    let status;
    if (traveller) {
      status = isExplicit ? 'Visited' : visited ? 'Visited (via regions)' : 'Not visited';
    } else {
      const who = this.members().filter(id => {
        const own = this.travellers[id].countries;
        return own.includes(code) || (!region && own.some(c => c.split('-')[0] === code));
      }).map(id => this.travellers[id].name);
      status = who.length ? `Visited by ${who.join(', ')}` : 'Nobody has been here yet';
    }
    const regions = !region && this.detailOn(code) ? this.regionsOf(code) : [];
    const regionInfo = regions.length ? ` · ${regions.filter(([r]) => explicit.has(r)).length}/${regions.length} regions` : '';
    const canToggle = traveller && this.canEdit() && (isExplicit || !visited);
    box.innerHTML = `<div class="result">
      <span class="flag">${flag(country)}</span>
      <div class="info"><strong>${region ? `${esc(this.nameOf(country))} › ` : ''}${esc(this.nameOf(code) || code)}</strong>
        <small>${esc(status)}${regionInfo}</small></div>
      ${canToggle ? `<button class="primary${isExplicit ? ' outline' : ''}" data-act="toggle-visit" ${this.busy ? 'disabled' : ''}>${icon(isExplicit ? 'close' : 'check')}${isExplicit ? 'Unmark' : 'Mark visited'}</button>` : ''}
      <button class="icon" data-act="deselect" title="Close">${icon('close')}</button></div>`;
  }

  renderList(explicit, effective) {
    const traveller = this.traveller();
    const countries = [...effective].filter(c => this.countryNames.has(c) && this.inContinent(c))
      .map(c => [c, this.nameOf(c)]).sort((a, b) => a[1].localeCompare(b[1]));
    const total = [...this.countryNames.keys()].filter(c => this.inContinent(c)).length;
    this.$('#count').textContent = `Visited · ${countries.length} of ${total}`;
    this.$('#list').innerHTML = countries.map(([code, name]) => {
      const regions = this.detailOn(code) ? this.regionsOf(code).filter(([r]) => explicit.has(r)) : [];
      const open = regions.length && this.expanded.has(code);
      const removable = traveller && this.canEdit() && explicit.has(code);
      return `<li class="${code === this.selected || code === this.selected?.split('-')[0] ? 'current' : ''}">
        <div class="row"><button class="link" data-select="${code}"><span class="flag">${flag(code)}</span>${esc(name)}</button>
        ${regions.length ? `<button class="icon small" data-expand="${code}" title="${regions.length} regions">${regions.length}${icon(open ? 'chevron-up' : 'chevron-down')}</button>` : ''}
        ${removable ? `<button class="icon small" data-remove="${code}" title="Remove country visit" ${this.busy ? 'disabled' : ''}>${icon('close')}</button>` : ''}</div>
        ${open ? `<ul>${regions.map(([r, n]) => `<li class="${r === this.selected ? 'current' : ''}"><button class="link" data-select="${r}">${esc(n)}</button></li>`).join('')}</ul>` : ''}
      </li>`;
    }).join('') || `<li class="empty">${Object.keys(this.travellers).length ? 'Nothing here yet. Pick a place on the map.' : 'Add a traveller in Settings to start.'}</li>`;
  }

  renderSettings() {
    const disabled = this.busy ? 'disabled' : '';
    const item = (kind, id, name, sub = '') => `<li><span>${esc(name)}${sub ? `<small>${sub}</small>` : ''}</span>
      <button class="icon" data-edit="${kind}:${id}" title="Edit" ${disabled}>${icon('pencil')}</button>
      <button class="icon" data-delete="${kind}:${id}" title="Delete" ${disabled}>${icon('delete')}</button></li>`;
    const detail = (this.catalogue.subdivision_countries || []).map(c => [c, this.nameOf(c)])
      .sort((a, b) => a[1].localeCompare(b[1]));
    this.$('.settings').innerHTML = `
      <div class="panel-grid">
        <div class="block"><h3>Travellers</h3><ul class="items">${Object.entries(this.travellers).map(([id, t]) => item('t', id, t.name, `${t.countries.length} places`)).join('') || '<li class="empty">No travellers yet.</li>'}</ul>
          <button class="primary" data-edit="t:" ${disabled}>${icon('plus')}Add traveller</button></div>
        <div class="block"><h3>Groups</h3><p class="hint">A group map combines its members' visits.</p><ul class="items">${Object.entries(this.groups).map(([id, g]) => item('g', id, g.name, `${g.members.length} members`)).join('') || '<li class="empty">No groups yet.</li>'}</ul>
          <button class="primary" data-edit="g:" ${disabled} ${Object.keys(this.travellers).length ? '' : 'hidden'}>${icon('plus')}Add group</button></div>
        <div class="block"><h3>Regional detail</h3><p class="hint">Track states / regions in these countries. Turning it off keeps recorded regions.</p>
          ${detail.map(([c, n]) => `<label class="check"><input type="checkbox" data-detail="${c}" ${this.detailOn(c) ? 'checked' : ''} ${disabled}><span class="flag">${flag(c)}</span>${esc(n)}</label>`).join('')}</div>
      </div>
      <p class="error" ${this.error ? '' : 'hidden'}>${esc(this.error)}</p>`;
    this.$('.settings').querySelectorAll('[data-detail]').forEach(box =>
      box.onchange = () => this.change('set_map_detail', {country: box.dataset.detail, enabled: box.checked}));
  }

  openDialog(kind, id) {
    const record = (kind === 't' ? this.travellers : this.groups)[id];
    const dialog = this.$('#dialog');
    const what = kind === 't' ? 'traveller' : 'group';
    dialog.innerHTML = `<form method="dialog">
      <h3>${record ? 'Edit' : 'Add'} ${what}</h3>
      <label>Name<input name="name" required maxlength="80" value="${esc(record?.name)}" autofocus></label>
      ${kind === 'g' ? `<fieldset><legend>Members</legend>${Object.entries(this.travellers).map(([tid, t]) =>
        `<label class="check"><input type="checkbox" name="members" value="${esc(tid)}" ${record?.members.includes(tid) ? 'checked' : ''}>${esc(t.name)}</label>`).join('')}</fieldset>` : ''}
      <p class="error" hidden></p>
      <div class="actions"><button type="button" value="cancel">Cancel</button><button class="primary" value="save">Save</button></div></form>`;
    const form = dialog.querySelector('form');
    form.querySelector('[value=cancel]').onclick = () => dialog.close();
    form.onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const ok = await this.change(kind === 't' ? 'save_traveller' : 'save_group', {
        ...(id ? {target_id: id} : {}),
        name: fd.get('name'),
        ...(kind === 'g' ? {members: fd.getAll('members')} : {}),
      });
      if (ok) dialog.close();
      else Object.assign(form.querySelector('.error'), {hidden: false, textContent: this.error});
    };
    dialog.showModal();
  }

  // ---------- interaction ----------
  onClick(e) {
    const el = e.target.closest('button, [data-code]');
    if (!el) return;
    const d = el.dataset;
    if (d.code) { if (!this.dragged) this.select(d.code); return; }
    if (d.mode) { this.mode = d.mode; this.update(); }
    else if (d.zoom) d.zoom === 'reset' ? this.home() : this.setZoom(this.zoom * (d.zoom === 'in' ? 2 : 0.5));
    else if (d.select) this.select(d.select);
    else if (d.expand) { this.expanded.has(d.expand) ? this.expanded.delete(d.expand) : this.expanded.add(d.expand); this.update(); }
    else if (d.remove) {
      if (confirm(`Remove the visit to ${this.nameOf(d.remove)}? Recorded regions are kept.`)) {
        this.change('set_visit', {target_id: this.traveller(), location: d.remove, visited: false});
      }
    } else if (d.edit) { const [k, id] = d.edit.split(':'); this.openDialog(k, id); }
    else if (d.delete) {
      const [k, id] = d.delete.split(':');
      const name = (k === 't' ? this.travellers : this.groups)[id]?.name;
      const msg = k === 't' ? `Delete ${name} and all their visits?` : `Delete group ${name}? Members keep their visits.`;
      if (confirm(msg)) this.change(k === 't' ? 'delete_traveller' : 'delete_group', {target_id: id});
    } else if (d.act === 'deselect') { this.selected = null; this.update(); }
    else if (d.act === 'toggle-list') {
      this.listCollapsed = !this.listCollapsed;
      store.set('list', this.listCollapsed ? 'collapsed' : 'open');
      this.update();
    }
    else if (d.act === 'toggle-visit') {
      this.change('set_visit', {target_id: this.traveller(), location: this.selected, visited: !this.explicit().has(this.selected)});
    }
  }

  select(code) {
    const country = code.split('-')[0];
    if (!this.inContinent(country)) this.setContinent('World', false);
    this.selected = code;
    if (code !== country) this.expanded.add(country);
    this.update();
  }

  setContinent(continent, render = true) {
    this.continent = continent;
    store.set('continent', continent);
    if (render) this.update();
  }

  toggleSettings() {
    if (!this.canEdit()) return;
    this.settingsOpen = !this.settingsOpen;
    this.error = '';
    this.update();
    this.dispatchEvent(new CustomEvent('beenthere-settings', {bubbles: true, composed: true}));
  }

  // ---------- search ----------
  places() {
    const key = JSON.stringify(this.data?.map_settings);
    if (this._places?.key === key) return this._places.list;
    const list = [...this.countryNames].map(([code, name]) => ({code, name, meta: this.continentOf(code)}));
    for (const c of this.catalogue.subdivision_countries) {
      if (this.detailOn(c)) list.push(...this.regionsOf(c).map(([code, name]) => ({code, name, meta: this.nameOf(c)})));
    }
    this._places = {key, list};
    return list;
  }
  suggest() {
    const q = this.$('#q').value.trim().toLocaleLowerCase();
    const ul = this.$('#suggest');
    if (!q || !this.catalogue) { ul.hidden = true; return; }
    const rank = p => { const n = p.name.toLocaleLowerCase(); return n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : 9; };
    this.matches = this.places().map(p => [rank(p), p]).filter(([r]) => r < 9)
      .sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, 8).map(([, p]) => p);
    this.searchIndex = Math.min(this.searchIndex || 0, Math.max(0, this.matches.length - 1));
    ul.innerHTML = this.matches.map((p, i) => `<li role="option" data-i="${i}" aria-selected="${i === this.searchIndex}">
      <span class="flag">${flag(p.code.split('-')[0])}</span><span>${esc(p.name)}<small>${esc(p.meta)}</small></span></li>`).join('')
      || '<li class="empty">No matches</li>';
    ul.onmousedown = e => e.preventDefault();
    ul.onclick = e => { const li = e.target.closest('[data-i]'); if (li) this.pick(+li.dataset.i); };
    ul.hidden = false;
  }
  onSearchKey(e) {
    const n = this.matches?.length || 0;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (n) this.searchIndex = (this.searchIndex + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      this.suggest();
    } else if (e.key === 'Enter' && n) { e.preventDefault(); this.pick(this.searchIndex); }
    else if (e.key === 'Escape') this.$('#suggest').hidden = true;
  }
  pick(i) {
    const place = this.matches[i];
    this.$('#q').value = '';
    this.$('#suggest').hidden = true;
    this.$('#q').blur();
    this.select(place.code);
  }

  // ---------- zoom & pan ----------
  home() {
    if (!this.frame) return;
    this.zoom = 1;
    this.cx = this.frame.x + this.frame.w / 2;
    this.cy = this.frame.y + this.frame.h / 2;
    this.applyView();
  }
  // Fit the frame to the map box without distortion: a roomier box shows the surrounding
  // geography; a box the world can't fill (e.g. tall) is filled by zooming in, pannable.
  applyView() {
    const svg = this.$('#svg'), f = this.frame, ext = this.extent;
    if (!f || !svg.clientWidth || !svg.clientHeight) return;
    const r = svg.clientWidth / svg.clientHeight;
    let w = f.w, h = f.h;
    if (w / h > r) h = w / r; else w = h * r;
    if (h > ext.h) { h = ext.h; w = h * r; }
    if (w > ext.w) { w = ext.w; h = w / r; }
    w /= this.zoom; h /= this.zoom;
    const clamp = (c, size, lo, span) => size >= span ? lo + span / 2 : Math.max(lo + size / 2, Math.min(lo + span - size / 2, c));
    this.cx = clamp(this.cx, w, ext.x, ext.w);
    this.cy = clamp(this.cy, h, ext.y, ext.h);
    this.viewWidth = w;
    svg.setAttribute('viewBox', `${this.cx - w / 2} ${this.cy - h / 2} ${w} ${h}`);
    svg.classList.toggle('pannable', w < ext.w - 0.01 || h < ext.h - 0.01);
    svg.classList.toggle('zoomed', this.zoom > 1);
  }
  // Zoom keeping the map point under `at` (client coords) in place.
  setZoom(zoom, at = null) {
    const svg = this.$('#svg');
    const toMap = p => new DOMPoint(p.x, p.y).matrixTransform(svg.getScreenCTM().inverse());
    const before = at && toMap(at);
    this.zoom = Math.max(1, Math.min(MAX_ZOOM, zoom));
    this.applyView();
    if (before) {
      const after = toMap(at);
      this.cx += before.x - after.x; this.cy += before.y - after.y;
      this.applyView();
    }
  }
  bindMap(svg) {
    const pointers = new Map();
    let last = null;
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      this.setZoom(this.zoom * Math.exp(-e.deltaY * (e.deltaMode ? 16 : 1) * 0.002), {x: e.clientX, y: e.clientY});
    }, {passive: false});
    svg.ondblclick = e => this.setZoom(this.zoom * 2, {x: e.clientX, y: e.clientY});
    svg.onpointerdown = e => {
      pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
      if (pointers.size === 1) { this.dragged = false; last = null; }
    };
    svg.onpointermove = e => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
      const pts = [...pointers.values()];
      if (pts.length === 2) { // pinch
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const mid = {x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2};
        if (last) this.setZoom(this.zoom * dist / last, mid);
        last = dist; this.dragged = true;
      } else if (svg.classList.contains('pannable') && (this.dragged || Math.hypot(e.clientX - prev.x, e.clientY - prev.y) > 3)) {
        if (!this.dragged) svg.setPointerCapture(e.pointerId);
        this.dragged = true;
        const scale = this.viewWidth / svg.clientWidth;
        this.cx -= (e.clientX - prev.x) * scale;
        this.cy -= (e.clientY - prev.y) * scale;
        this.applyView();
      }
    };
    const end = e => { pointers.delete(e.pointerId); if (pointers.size < 2) last = null; };
    svg.onpointerup = svg.onpointercancel = end;
  }
}

const STYLE = `
:host {
  --bt-text: var(--primary-text-color);
  --bt-muted: var(--secondary-text-color);
  --bt-line: var(--divider-color, rgba(127,127,127,.25));
  --bt-bg: var(--ha-card-background, var(--card-background-color, #fff));
  --bt-accent: var(--beenthere-visited-color, var(--primary-color));
  --bt-selected: var(--beenthere-selected-color, var(--accent-color, #ff9800));
  --bt-land: var(--beenthere-land-color, color-mix(in srgb, var(--bt-text) 13%, var(--bt-bg)));
  --bt-sea: var(--beenthere-sea-color, color-mix(in srgb, var(--bt-accent) 5%, var(--bt-bg)));
  --bt-radius: var(--ha-card-border-radius, 12px);
  display: block; container-type: inline-size; color: var(--bt-text);
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.root { padding: 16px; display: flex; flex-direction: column; }
:host([panel]) { height: 100%; }
:host([panel]) .root { height: 100%; background: none; border: 0; box-shadow: none; border-radius: 0; padding: 16px 24px 24px; }
.main { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.settings { flex: 1; min-height: 0; overflow: auto; }
h3 { margin: 0 0 8px; font-size: 1rem; font-weight: 500; }
small { display: block; color: var(--bt-muted); font-size: .8rem; }
.flag { font-size: 1.2em; line-height: 1; width: 1.4em; text-align: center; flex: none; }
.error { color: var(--error-color, #db4437); margin: 8px 0 0; }
.empty, .hint { color: var(--bt-muted); font-size: .875rem; }
.hint { margin: -4px 0 8px; }

button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; border-radius: 8px; }
button:disabled { opacity: .5; cursor: default; }
button.primary { background: var(--bt-accent); color: var(--text-primary-color, #fff); padding: 8px 14px; font-weight: 500; }
button.primary.outline { background: none; color: var(--bt-accent); box-shadow: inset 0 0 0 1px var(--bt-accent); }
button.icon { width: 36px; height: 36px; justify-content: center; color: var(--bt-muted); flex: none; }
button.icon:hover, button.link:hover { background: color-mix(in srgb, var(--bt-text) 8%, transparent); }
button.small { width: auto; min-width: 32px; height: 32px; padding: 0 6px; gap: 0; font-size: .8rem; }
ha-icon { --mdc-icon-size: 20px; }
button:focus-visible, input:focus-visible, select:focus-visible, svg:focus-visible { outline: 2px solid var(--bt-accent); outline-offset: 1px; }
input, select { font: inherit; color: var(--bt-text); background: var(--bt-bg); border: 1px solid var(--bt-line); border-radius: 8px; padding: 0 10px; height: 40px; min-width: 0; }

.bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.search { position: relative; flex: 1 1 220px; display: flex; align-items: center; }
.search > ha-icon { position: absolute; left: 10px; color: var(--bt-muted); pointer-events: none; }
.search input { width: 100%; padding-left: 38px; }
#suggest { position: absolute; z-index: 5; top: 44px; left: 0; right: 0; margin: 0; padding: 4px 0; list-style: none; background: var(--bt-bg); border: 1px solid var(--bt-line); border-radius: 8px; box-shadow: var(--ha-card-box-shadow, 0 4px 12px rgba(0,0,0,.2)); max-height: 320px; overflow: auto; }
#suggest li { display: flex; gap: 10px; align-items: center; padding: 6px 12px; cursor: pointer; }
#suggest li[aria-selected=true], #suggest li:hover { background: color-mix(in srgb, var(--bt-accent) 12%, transparent); }
.seg { display: flex; border: 1px solid var(--bt-line); border-radius: 8px; overflow: hidden; height: 40px; }
.seg button { border-radius: 0; padding: 0 14px; color: var(--bt-muted); }
.seg button.on { background: var(--bt-accent); color: var(--text-primary-color, #fff); }

#result { position: absolute; left: 8px; right: 8px; bottom: 8px; z-index: 2; pointer-events: none; }
.result { pointer-events: auto; display: flex; align-items: center; gap: 12px; max-width: 560px; padding: 8px 8px 8px 12px; border-radius: 8px; background: color-mix(in srgb, var(--bt-selected) 10%, var(--bt-bg)); border-left: 3px solid var(--bt-selected); box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0,0,0,.25)); }
.result .flag { font-size: 1.6em; }
.result .info { flex: 1; min-width: 0; }
.result strong { font-weight: 500; }

.body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 260px; grid-template-rows: minmax(0, 1fr); gap: 12px; margin-top: 12px; }
/* Card on a dashboard: a fixed box. Panel: fill the screen. The view is fitted to whatever box results. */
.map { position: relative; aspect-ratio: 16 / 10; max-height: 70vh; width: 100%; border-radius: 8px; background: var(--bt-sea); overflow: hidden; }
:host([panel]) .map { aspect-ratio: auto; max-height: none; height: 100%; min-height: 240px; }
svg { display: block; width: 100%; height: 100%; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
svg.pannable { cursor: grab; }
svg.zoomed, :host([panel]) svg { touch-action: none; }
.land { fill: var(--bt-land); stroke: var(--bt-sea); stroke-width: .6px; vector-effect: non-scaling-stroke; cursor: pointer; transition: fill .15s; }
.land:hover { fill: color-mix(in srgb, var(--bt-accent) 35%, var(--bt-land)); }
.land.none { cursor: default; pointer-events: none; }
.land.visited { fill: var(--bt-accent); }
.land.detailed { pointer-events: none; }
.land.detailed.visited { fill: color-mix(in srgb, var(--bt-accent) 30%, var(--bt-land)); }
.land.region { stroke: var(--bt-bg); stroke-width: .4px; }
.land.selected { fill: var(--bt-selected); }
.zoom { position: absolute; top: 8px; right: 8px; display: flex; flex-direction: column; background: var(--bt-bg); border-radius: 8px; box-shadow: var(--ha-card-box-shadow, 0 1px 4px rgba(0,0,0,.2)); }
.zoom button { width: 36px; height: 36px; justify-content: center; border-radius: 0; }
.loading { position: absolute; inset: 0; margin: 0; display: grid; place-items: center; color: var(--bt-muted); }

.side { contain: size; overflow: auto; display: flex; flex-direction: column; border: 1px solid var(--bt-line); border-radius: 8px; padding: 0 0 4px; }
.side-head { flex: none; justify-content: space-between; padding: 12px; color: var(--bt-muted); font-size: .875rem; font-weight: 500; border-radius: 0; pointer-events: none; position: sticky; top: 0; background: var(--bt-bg); z-index: 1; }
.side-head ha-icon { display: none; }
#list, #list ul { list-style: none; margin: 0; padding: 0; }
#list ul { padding-left: 36px; }
#list li.current > .row, #list ul li.current { background: color-mix(in srgb, var(--bt-selected) 12%, transparent); }
.row { display: flex; align-items: center; padding-right: 4px; }
button.link { flex: 1; min-width: 0; text-align: left; padding: 6px 12px; gap: 10px; border-radius: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; }
#list .empty { padding: 8px 12px; }

.panel-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; align-items: start; }
.block { border: 1px solid var(--bt-line); border-radius: 8px; padding: 16px; }
.items { list-style: none; margin: 0 0 12px; padding: 0; }
.items li { display: flex; align-items: center; gap: 4px; padding: 4px 0; border-bottom: 1px solid var(--bt-line); }
.items li > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.check { display: flex; align-items: center; gap: 10px; padding: 6px 0; cursor: pointer; }
.check input { width: 18px; height: 18px; accent-color: var(--bt-accent); }

dialog { border: 0; border-radius: var(--bt-radius); padding: 24px; width: min(420px, calc(100vw - 32px)); background: var(--bt-bg); color: var(--bt-text); box-shadow: 0 8px 32px rgba(0,0,0,.3); }
dialog::backdrop { background: rgba(0,0,0,.4); }
dialog form { display: flex; flex-direction: column; gap: 12px; }
dialog label:not(.check) { display: flex; flex-direction: column; gap: 6px; font-size: .875rem; color: var(--bt-muted); }
fieldset { border: 1px solid var(--bt-line); border-radius: 8px; max-height: 40vh; overflow: auto; }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
.actions button:not(.primary) { padding: 8px 14px; }

@container (width < 700px) {
  .root, :host([panel]) .root { padding: 12px; }
  .body { display: flex; flex-direction: column; gap: 8px; }
  .side { contain: none; flex: none; }
  :host([panel]) .side { max-height: 45%; }
  .side-head { pointer-events: auto; }
  .side-head ha-icon { display: inline-flex; }
  .body.collapsed #list { display: none; }
  #view, #continent { flex: 1 1 140px; }
  .map { aspect-ratio: 1; max-height: none; margin: 0 -12px; width: calc(100% + 24px); border-radius: 0; }
  :host([panel]) .map { aspect-ratio: auto; height: auto; flex: 1 1 0; min-height: 200px; }
  .result button.primary { padding: 8px 10px; }
}
`;

customElements.get('beenthere-card') || customElements.define('beenthere-card', BeenThereCard);
window.customCards ||= [];
if (!window.customCards.some(c => c.type === 'beenthere-card')) {
  window.customCards.push({type: 'beenthere-card', name: 'BeenThere', description: 'Map of the places you have been.'});
}
