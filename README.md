# 🌍 BeenThere
*Your World. Your Travels. Your Map*

**Keep track of where you've been, and see where everyone else has been too.**

BeenThere is an interactive travel map for Home Assistant. Mark the countries and regions you've visited, create maps for everyone in your household, and see which places you've explored together.

Whether you've visited five countries or fifty, it's a fun way to keep track of your travels.

<p align="center">
  <img
    src="screenshots/hero-world-map.png"
    alt="BeenThere world map showing visited countries"
    width="900"
  >
</p>

[Explore features](#%EF%B8%8F-explore-your-world) · [Get started](#-getting-started) · [User guide](#-how-to-use-beenthere) · [Privacy](#-privacy)

## 🗺️ Explore your world

### 🌍 A map of everywhere you've been

Select a country on the map, mark it as visited, and watch your map gradually fill up.

Explore the whole world or focus on a single continent. Zoom in for a closer look, move around the map, or search for a particular country.

Your visited destinations are listed alongside the map, making it easy to see where you've been.

### 👨‍👩‍👧 Better together

Everyone has their own travel history.

Add travellers for your family, friends, or anyone else you'd like to include. Each person gets their own map.

Create groups to see your combined travels, find out who's visited a particular country, or discover which places you've all been to.

<p align="center">
  <img
    src="screenshots/group-view.png"
    alt="BeenThere world map showing group view"
    width="900"
  >
</p>

### 📍 It's all in the details

Visited Scotland but not England? California but not New York?

Not every trip needs to count as visiting an entire country.

BeenThere lets you track individual states, provinces and regions in supported countries, including:

- 🇬🇧 United Kingdom
- 🇺🇸 United States
- 🇨🇦 Canada
- 🇦🇺 Australia
- 🇩🇪 Germany

Regional tracking is optional. Switch it on when you want more detail, and off when you don't. Your visits are remembered either way.

<p align="center">
  <img
    src="screenshots/regions.png"
    alt="BeenThere world map showing regions"
    width="900"
  >
</p>

### 🏠 Right at home in Home Assistant

BeenThere has its own place in your Home Assistant sidebar.

It's designed for desktop, tablet and mobile, with an interactive map and a straightforward interface.

Your travel history is stored locally in Home Assistant, without needing another account or a cloud service to save your data.

## 🚀 Getting started

### Install with HACS

1. HACS → ⋮ → **Custom repositories** → add `https://github.com/leonardpitzu/homeassistant-beenthere` (type: Integration).
2. Install **BeenThere** and restart Home Assistant.
3. **Settings → Devices & services → Add integration → BeenThere**.

Coming from the upstream `tampie85/ha-beenthere`? Remove it in HACS first (keep the integration entry): the domain and storage are the same, so your travellers and visits carry over.

### Dashboard card

The integration also registers a `custom:beenthere-card` card you can put on any dashboard. Colours follow your Home Assistant theme; override them with the `--beenthere-visited-color`, `--beenthere-selected-color`, `--beenthere-land-color` and `--beenthere-sea-color` theme variables.

### Your first map

Getting started takes just a minute.

1. Open **BeenThere** from the sidebar.
2. Go to **Settings** and add your first traveller.
3. Select your traveller from the map view.
4. Click a country you've visited.
5. Select **Mark visited**.

That's it. Keep going until your map looks familiar!

## 📖 How to use BeenThere

### Travellers

Each traveller has their own map and travel history.

Use **Settings** to add, rename or remove travellers. Switch between travellers from the main map view.

### Groups

Create groups in Settings and choose which travellers belong to them.

Group maps combine everyone's visited destinations without changing their individual histories.

Select a country to see which group members have visited it. You can also filter the map to show places visited by any or all selected travellers.

### Countries and regions

Click a country or use search to find it. Mark it as visited or unvisited whenever you like.

For supported countries, enable regional tracking in Settings to record individual regions.

BeenThere keeps your regional history even when you turn regional tracking off.

### Exploring the map

BeenThere lets you explore your travels in different ways:

- **World view** - See all your visited countries on one map.
- **Continent view** - Select Africa, Asia, Europe, North America, South America or Oceania to focus on that part of the world.
- **Zoom and pan** - Move around the map and take a closer look.
- **Search** - Quickly find a country by name.
- **Visited countries** - Browse your visited destinations in the list alongside the map.

To mark a country as visited, select it on the map or find it using search, then choose **Mark visited**.

### Permissions

Home Assistant administrators can manage travellers, groups, settings and visited destinations.

Other authenticated users can explore the maps in read-only mode.

## 🔒 Privacy

Your travel history belongs to you.

BeenThere stores visits locally in Home Assistant. It doesn't track your location, collect GPS data or require a separate account.

Maps ship with the integration and are cached by your browser: BeenThere makes no requests outside your Home Assistant.

All authenticated Home Assistant users can view the travel histories.

---

## 💬 Questions, ideas or bugs?

BeenThere is an independent project built for Home Assistant.

Found something that doesn't work? Have an idea for a feature?

- [Report a bug](https://github.com/leonardpitzu/homeassistant-beenthere/issues)
- [Suggest an improvement](https://github.com/leonardpitzu/homeassistant-beenthere/issues)
- [View the source code](https://github.com/leonardpitzu/homeassistant-beenthere) · fork of [tampie85/ha-beenthere](https://github.com/tampie85/ha-beenthere)

Contributions and feedback are welcome.


**🌍 BeenThere - Where have you been?**
