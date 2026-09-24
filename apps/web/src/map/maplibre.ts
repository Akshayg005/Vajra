import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// MapLibre 6 loads its tile worker by URL; point it at the bundled copy so dev and production both work offline.
maplibregl.setWorkerUrl(workerUrl);

export { maplibregl };
