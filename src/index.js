/* jshint esversion: 9 */

const lib = globalThis.maplibregl;
const utils = {
  tovt: require('geojson-vt'),
  topbf: require('vt-pbf'),
  h3: require('h3-js'),
};
const defaults = {
  "geometry_type": 'Polygon',
  "timeout": 0,
  "debug": false,
  "promoteId": false,
  "https": true
};
// json to geojson
const j2g = (js, o) => {
  if (!js.data) {
    debugger;
  }
  const fs = js.data.map(j => {
    let props = {"total": parseInt(j.total)}; 
    const feature = {
      "properties": props,
      "geometry": {
        "type": o.geometry_type,
        "coordinates": o.generate(j.h3)
      }
    };
    if (!!!o.promoteID) feature.id = parseInt(j.h3, 16);
    return feature;
  });
  return { "type": 'FeatureCollection', "features": fs };
};
const h3jparser = (tile, options) => {
  return new Promise((resolve, reject) => {
    resolve(j2g(tile, options));
  });
};
const gjclean = gj => {
  // https://github.com/maplibre/maplibre-gl-js/blob/4b753d23dde82af45c61cd76c0530face1346721/src/style-spec/types.js#L122
  const valid = ['type', 'data', 'maxzoom', 'attribution', 'buffer', 'filter', 'tolerance', 'cluster', 'clusterRadius', 'clusterMaxZoom', 'clusterMinPoints', 'clusterProperties', 'lineMetrics', 'generateId', 'promoteId'];
  return filterObject(gj, (k, v) => valid.includes(k));
};
const vtclean = vt => {
  // https://github.com/maplibre/maplibre-gl-js/blob/4b753d23dde82af45c61cd76c0530face1346721/src/style-spec/types.js#L83
  const valid = ['type', 'url', 'tiles', 'bounds', 'scheme', 'minzoom', 'maxzoom', 'attribution', 'promoteId', 'volatile'];
  return filterObject(vt, (k, v) => valid.includes(k));
};
const filterObject = (obj, callback) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([key, val]) => callback(key, val))
  );
};

const cached_tiles = {};
let query_sequence_num = 0;


/*

  Custom vector tiles source

*/
const h3tsource = function (name, options) {
  const o = Object.assign({}, defaults, options, { "type": 'vector', "format": 'pbf' });
  o.generate = h3id => (o.geometry_type === 'Polygon') ? [utils.h3.h3ToGeoBoundary(h3id, true)] : utils.h3.h3ToGeo(h3id).reverse();
  if (!!o.promoteId) o.promoteId = 'h3id';
  lib.addProtocol('clickhouse', async (params, abortController) => {
    const u = `http://${params.url.split('://')[1]}`;

    // hack: fixed for format below
    let paramString = u.split('?')[1];
    let params_arr = paramString.split('&');
    const zxy = {
      z: parseInt(params_arr[0].split('=')[1]),
      x: parseInt(params_arr[1].split('=')[1]),
      y: parseInt(params_arr[2].split('=')[1])
    };

    const sql = options.sql; 
    const key = `${sql}-${zxy.z}-${zxy.x}-${zxy.y}`;
    const z = Math.max(zxy.z+2, 5);
    const url = u.concat("", z) // Hack: set the field at the end
    const buffer = await fetch(url, { method: 'POST', body: sql, signal: abortController.signal })
      .then(r => {
        if (r.ok) {
          let json = r.json();
          return json;
        } else {
          throw new Error(r.statusText);
        }
      })
      .then(js => h3jparser(js, o))
      .then(g => {

        const vt = utils.tovt(g);
        const f = vt.getTile(zxy.z, zxy.x, zxy.y);
        const fo = {};
        fo[o.sourcelayer] = f;
        const
          p = utils.topbf.fromGeojsonVt(
            fo,
            { "version": 2 }
          );
        if (!!o.debug) console.log(`${zxy}: ${g.features.length} features, ${(performance.now() - t).toFixed(0)} ms`);
        return p;
      })
      .catch(e => {
        //if (e.name === 'AbortError') e.message = `Timeout: Tile .../${zxy.join('/')}.h3t is taking too long to fetch`;
        console.log(e);
      });
    return { data: buffer }
  });
  this.addSource(name, vtclean(o));
};
lib.Map.prototype.addH3TSource = h3tsource;
