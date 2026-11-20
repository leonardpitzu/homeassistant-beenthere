"""Build the bundled world map from Natural Earth admin-0 map units.

Usage: python scripts/build_world.py ne_50m_admin_0_map_units.geojson

Source: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_map_units.geojson
(public domain, "Made with Natural Earth").

Units sharing a country code are merged into one MultiPolygon, names and
continents come from geography.json, coordinates are rounded to 0.01 degrees.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "custom_components" / "beenthere"
CODE_OVERRIDES = {"NJM": "SJ", "NSV": "SJ"}  # Jan Mayen / Svalbard are SJ in ISO 3166


def ring(points):
    out = []
    for lon, lat in points:
        p = [round(lon, 2), round(lat, 2)]
        if not out or out[-1] != p:
            out.append(p)
    return out if len(out) >= 4 else None


def polygons(geometry):
    polys = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    for poly in polys:
        rings = [r for r in map(ring, poly) if r]
        if rings:
            yield rings


def main(source):
    catalogue = json.loads((ROOT / "geography.json").read_text())
    countries = {code: (name, continent) for continent, items in catalogue["countries"].items()
                 for code, name in items.items()}
    merged, other = {}, []
    for feature in json.loads(Path(source).read_text())["features"]:
        props = feature["properties"]
        code = CODE_OVERRIDES.get(props["GU_A3"], props["ISO_A2_EH"])
        polys = list(polygons(feature["geometry"]))
        if code in countries:
            merged.setdefault(code, []).extend(polys)
        else:
            other.extend(polys)
    features = [
        {"type": "Feature", "id": code,
         "properties": {"name": countries[code][0], "continent": countries[code][1]},
         "geometry": {"type": "MultiPolygon", "coordinates": polys}}
        for code, polys in sorted(merged.items())
    ]
    # Disputed areas without an ISO code: drawn as land, not selectable.
    features.append({"type": "Feature", "id": None, "properties": {},
                     "geometry": {"type": "MultiPolygon", "coordinates": other}})
    out = ROOT / "frontend" / "maps" / "world.geojson"
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")))
    print(f"{out}: {len(features)} features, {out.stat().st_size // 1024} KiB")


if __name__ == "__main__":
    main(sys.argv[1])
