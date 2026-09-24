import type { StyleSpecification } from 'maplibre-gl';

/**
 * Fully offline basemap from bundled, Survey of India–compliant GeoJSON:
 *  water = background, land = SoI national outline (DataMeet, CC BY 4.0),
 *  states + districts = udit-001/india-maps-data (includes J&K and Ladakh as per SoI).
 * Optional online imagery has no political boundaries drawn in it, so it cannot conflict with the SoI lines.
 */
export const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    outline: { type: 'geojson', data: '/geo/india-outline.geojson' },
    states: { type: 'geojson', data: '/geo/india-states.geojson' },
    districts: { type: 'geojson', data: '/geo/india-districts.geojson' },
    imagery: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Imagery © Esri' },
  },
  layers: [
    { id: 'water', type: 'background', paint: { 'background-color': '#040913' } },
    { id: 'imagery', type: 'raster', source: 'imagery', layout: { visibility: 'none' }, paint: { 'raster-brightness-max': 0.55, 'raster-saturation': -0.4 } },
    { id: 'land', type: 'fill', source: 'outline', paint: { 'fill-color': '#0d1729', 'fill-opacity': 0.96 } },
    { id: 'districts-line', type: 'line', source: 'districts', minzoom: 5.5, paint: { 'line-color': '#223049', 'line-width': 0.5 } },
    { id: 'states-line', type: 'line', source: 'states', paint: { 'line-color': '#3f4f6e', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 8, 1.2] } },
    { id: 'outline-line', type: 'line', source: 'outline', paint: { 'line-color': '#8394b8', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 8, 1.8] } },
  ],
};
