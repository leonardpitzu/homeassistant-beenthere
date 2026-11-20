# BeenThere for Home Assistant

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)

A travel map for [Home Assistant](https://www.home-assistant.io/): mark the countries and regions you have been to, keep a map for everyone in the household, and see where you have been together.

> Personal fork of [tampie85/ha-beenthere](https://github.com/tampie85/ha-beenthere), rewritten to run fully offline, follow the Home Assistant theme and use the whole screen. Your data from upstream carries over. See [Differences from upstream](#differences-from-upstream).

## Features

### Travel map

- World map or one continent at a time. Continent views show the surrounding countries for context.
- The map fills the space it is given without distortion: when the world can't fill the box (a tall phone screen, a desktop window) it zooms in and you drag to pan.
- Zoom with the buttons, the mouse wheel, a double click or a pinch.
- Search countries and regions by name. Places too small to draw (Vatican, Monaco, ...) can still be found and marked.
- Click a place, then **Mark visited**. The list beside (or, on a phone, below) the map shows where you have been; on a phone it collapses to give the map the room.

### Travellers and groups

- One map per traveller.
- Groups combine their members' visits without touching them. Pick a place to see who has been there, or switch between visited by **Any** or **All** members.

### Regions

Track states, provinces and nations instead of whole countries in:

- 🇦🇺 Australia
- 🇨🇦 Canada
- 🇩🇪 Germany
- 🇬🇧 United Kingdom
- 🇺🇸 United States

A visited region counts its country as visited. Turning regional detail off for a country keeps the recorded regions.

### Sidebar page and dashboard card

Use it from its own sidebar page, as a card on any dashboard, or both. The sidebar entry can be switched off.

### Fully local

Maps, the country catalogue and the code ship with the integration and are cached by the browser. BeenThere makes no requests outside your Home Assistant, needs no account and stores everything in Home Assistant.

## Installation

### HACS (recommended)

1. In HACS, add `https://github.com/leonardpitzu/homeassistant-beenthere` as a **custom repository** with category **Integration**.
2. Search for **BeenThere** and download it.
3. Restart Home Assistant.

### Manual

1. Copy `custom_components/beenthere` into your Home Assistant `custom_components` directory.
2. Restart Home Assistant.

### Moving over from upstream

Remove the upstream repository in HACS but keep the integration entry under **Settings → Devices & Services**, then install this one. The domain and the storage are the same, so travellers, groups and visits are kept. If you added `/beenthere/beenthere-card.js` as a dashboard resource by hand, remove it: the card registers itself.

## Configuration

Add the integration from **Settings → Devices & Services → Add Integration → BeenThere**. There is nothing to fill in.

| Option (**Configure**) | Description |
|---|---|
| Show in sidebar | Adds the **BeenThere** page to the sidebar (default on). Off: use it only as a dashboard card. To hide it just for yourself instead, long-press the sidebar title |

Travellers, groups and regional detail are managed in the map's settings (the ⚙️ button). Administrators can change everything; other users can look but not edit.

## Dashboard

The card needs no resource and no options:

```yaml
type: custom:beenthere-card
```

### Full screen

Put it alone in a view of type **Panel**: it fills the view like the sidebar page.

```yaml
views:
  - title: Travels
    path: travels
    type: panel
    cards:
      - type: custom:beenthere-card
```

### Sections dashboard

The card fills its grid cell; resize the cell to taste. In a masonry view it keeps a 16:10 box.

### Colours

The card follows your theme: visited places use the primary colour, the selected place the accent colour. Override them in a theme with:

| Variable | Default |
|---|---|
| `--beenthere-visited-color` | `--primary-color` |
| `--beenthere-selected-color` | `--accent-color` |
| `--beenthere-land-color` | text colour at 13% over the card background |
| `--beenthere-sea-color` | visited colour at 5% over the card background |

## Differences from upstream

| Change | Why |
|---|---|
| World map bundled, flags drawn by the system emoji font | Upstream fetched a 3.2 MB map from GitHub on every page load and each flag from flagcdn.com, so nothing worked offline |
| Theme colours | Upstream hard-coded its own dark palette (61 fixed colours); the card now follows the Home Assistant theme in light and dark |
| Map fills the screen without distortion | The map was a fixed 2:1 box and the visited list on a phone was squeezed into the same shape |
| Collapsible visited list on narrow screens | Gives the map the room on a phone |
| Card fills Panel views and grid cells, settings on the card, sidebar entry optional | The map can live on a dashboard instead of the sidebar |
| Live updates for non-admin users | Upstream subscribed to a custom event, which Home Assistant only allows administrators to do |
| Card registered automatically | The registration code existed upstream but was never called |
| Long browser caching with a content hash in the URL | Files are downloaded again only when they change |
| Frontend 104 KB → 40 KB, backend 22 KB → 12 KB | Shapes are built once per continent and only recoloured on change; one event handler instead of re-binding dozens per render |
| One malformed stored visit no longer drops a traveller | Stored data is cleaned entry by entry |

## Credits

Original integration by [Tamara Williams (@tampie85)](https://github.com/tampie85/ha-beenthere). Map data: [Natural Earth](https://www.naturalearthdata.com/), public domain; see `custom_components/beenthere/frontend/maps/SOURCES.txt`.

## License

[MIT](LICENSE), inherited from upstream.
