/* jshint esversion: 9 */
import 'https://unpkg.com/maplibre-gl/dist/maplibre-gl.js';
import '../../dist/h3j_h3t.js';

const lib = globalThis.maplibregl;

const map = new lib.Map({
  "container": 'map',
  "style": 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  "center": [-3.703622869000082, 40.41711423898472],
  "zoom": 5,
  "pitch": 0,
  "minZoom": 0,
  "maxZoom": 15,
  "antialias": true
});

map.on('load', e => {
  map.addH3TSource(
    'inat-source', 
    {
      "sourcelayer": 'inat-layer',
      "tiles": ['clickhouse://scrap-vh.gbif-dev.org:8123/?param_z={z}&param_x={x}&param_y={y}&user=tim&default_format=json&param_buffer=1000&param_h3_field=h3_'], // zoom added at end dynamically
      "minzoom": 0,
      "maxzoom": 16,
      "attribution": "iNaturalist",
      "sql" : `
        WITH
          bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,
          bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,
          tile_size * {x:UInt16} AS tile_x_begin,
          tile_size * ({x:UInt16} + 1) AS tile_x_end,
          tile_size * {y:UInt16} AS tile_y_begin,
          tile_size * ({y:UInt16} + 1) AS tile_y_end,
          mercator_x >= tile_x_begin AND mercator_x < tile_x_end
          AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,
          bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,
          bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,
          h3ToString({h3_field:Identifier}) AS h3,
          occcount
        SELECT h3, sum(occcount) AS total 
        FROM inat_h3
        WHERE in_tile AND decimallongitude BETWEEN -170 AND 170
        GROUP BY h3 ORDER BY h3

      `
    }
  );

  map.addLayer({
    "id": 'inat-layer',
    "type": 'fill',
    "source": 'inat-source',
    "source-layer": 'inat-layer',
    "paint": {
        "fill-color": {
        "property": "total",
        "stops": [
          [1,"#fdc7b7"],
          [10,"#fe9699"],
          [100,"#f16580"],
          [1000,"#d9316c"],
          [10000,"#a71f65"],
          [100000,"#760e5d"]
        ]
        },
      "fill-opacity": 1,    }        
  });

});