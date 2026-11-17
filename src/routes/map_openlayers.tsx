import { useEffect, useMemo, useRef, useState } from "react";
import { Select, SelectItem, Spinner } from "@heroui/react";
import { useMatch, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { FeatureLike } from "ol/Feature";
import type { Extent } from "ol/extent";
import { isEmpty } from "ol/extent";
import { MultiPolygon, Point, Polygon } from "ol/geom";
import OlMap from "ol/Map";
import View from "ol/View";
import VectorLayer from "ol/layer/Vector";
import { transformExtent } from "ol/proj";
import VectorSource from "ol/source/Vector";
import { Fill, Stroke, Style, Text } from "ol/style";
import type { Photo } from "../models/gallery";
import {
  groupRegionPhotos, loadMapPhotos, loadRegions, mapCountries, mapCountryUrl,
  parseMapCountry, regionCountry, type MapCountry, type RegionFeature,
} from "../utils/galleryMapData";
import PrefecturePage from "./prefecture";
import "./map.css";

const lightHeat = ['#e2e2e2', '#fee3e8', '#f6b9c5', '#ea8da4', '#d96988'];
const darkHeat = ['#303034', '#542e40', '#783950', '#a74d6c', '#cc6788'];

function largestPolygon(geometry: Polygon | MultiPolygon) {
  if (geometry instanceof Polygon) return geometry;
  return geometry.getPolygons().reduce((largest, polygon) =>
    polygon.getArea() > largest.getArea() ? polygon : largest);
}

function regionStyles(feature: RegionFeature, count: number, max: number) {
  const geometry = feature.getGeometry()!;
  const polygon = largestPolygon(geometry);
  const center = polygon.getInteriorPoint().getCoordinates().slice(0, 2);
  const index = count ? Math.ceil(4 * Math.log1p(count) / Math.log1p(max)) : 0;
  const hovered = geometry.clone();
  hovered.scale(1.055, 1.055, center);

  const shape = (dark: boolean, lifted: boolean) => new Style({
    geometry: lifted ? hovered : geometry,
    fill: new Fill({ color: (dark ? darkHeat : lightHeat)[index] }),
    stroke: new Stroke({ color: dark ? '#17171a' : '#fff', width: 1 }),
    zIndex: lifted ? 3 : 0,
  });
  const label = (dark: boolean, lifted: boolean) => new Style({
    geometry: new Point(center),
    text: new Text({
      text: feature.get('name'),
      font: '500 13px system-ui, sans-serif',
      padding: [2, 1, 2, 1],
      fill: new Fill({ color: dark ? '#f4f4f5' : '#27272a' }),
      stroke: new Stroke({ color: dark ? '#17171acc' : '#ffffffcc', width: 2 }),
    }),
    zIndex: lifted ? 4 : 1,
  });
  const shadow = hovered.clone();
  // Draw a soft edge between the raised region and its neighbours.
  const shadows = [13, 9, 5].map(width => new Style({
    geometry: shadow,
    stroke: new Stroke({ color: 'rgba(24, 14, 20, 0.09)', width, lineJoin: 'round' }),
    zIndex: 2,
  }));
  return {
    light: [shape(false, false), label(false, false)],
    dark: [shape(true, false), label(true, false)],
    hoverLight: [...shadows, shape(false, true), label(false, true)],
    hoverDark: [...shadows, shape(true, true), label(true, true)],
  };
}

function useMapRegions(country: MapCountry) {
  const [loaded, setLoaded] = useState<Partial<Record<MapCountry, RegionFeature[]>>>({});
  const [failed, setFailed] = useState<MapCountry>();
  const regions = loaded[country];
  useEffect(() => {
    if (regions) return;
    const controller = new AbortController();
    setFailed(undefined);
    loadRegions(country, controller.signal)
      .then(features => setLoaded(current => ({ ...current, [country]: features })))
      .catch(() => { if (!controller.signal.aborted) setFailed(country); });
    return () => controller.abort();
  }, [country, regions]);
  return { regions, boundariesFailed: failed === country };
}

export default function MapPage() {
  const regionRoute = useMatch('/map/prefecture/:prefectureId');
  const cityRoute = useMatch('/map/prefecture/:prefectureId/city/:cityId');
  const prefectureId = cityRoute?.params.prefectureId ?? regionRoute?.params.prefectureId;
  const cityId = cityRoute?.params.cityId;
  const navigate = useNavigate();
  const [query] = useSearchParams();
  const country = prefectureId ? regionCountry(prefectureId) : parseMapCountry(query.get('country'));
  const { t } = useTranslation();
  const target = useRef<HTMLDivElement>(null);
  const map = useRef<OlMap | null>(null);
  const layer = useRef<VectorLayer<VectorSource<RegionFeature>> | null>(null);
  const hovered = useRef<FeatureLike>(undefined);
  const overview = useRef<{ country: MapCountry; center: number[]; resolution: number }>(undefined);
  const camera = useRef<{ country: MapCountry; regionId?: string }>(undefined);
  const [photos, setPhotos] = useState<Photo[]>();
  const [photosFailed, setPhotosFailed] = useState(false);
  const { regions, boundariesFailed } = useMapRegions(country);
  const groups = useMemo(() => regions && photos ? groupRegionPhotos(country, regions, photos) : new Map<string, Photo[]>(),
    [country, photos, regions]);
  const selected = regions?.find(feature => String(feature.getId()) === prefectureId);
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const openRegion = useRef<(id: string) => void>(() => {});
  openRegion.current = id => navigate(`/map/prefecture/${id}`);

  useEffect(() => {
    const controller = new AbortController();
    loadMapPhotos(controller.signal)
      .then(setPhotos)
      .catch(() => { if (!controller.signal.aborted) setPhotosFailed(true); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    const vectorLayer = new VectorLayer({ source: new VectorSource<RegionFeature>(), declutter: true });
    const instance = new OlMap({
      target: element,
      layers: [vectorLayer],
      view: new View({ center: [0, 0], zoom: 3, minZoom: 2, maxZoom: 12 }),
      controls: [],
    });
    map.current = instance;
    layer.current = vectorLayer;

    function setHover(feature?: FeatureLike) {
      if (hovered.current === feature) return;
      hovered.current = feature;
      element!.style.cursor = feature ? 'pointer' : '';
      vectorLayer.changed();
    }

    const clearHover = () => setHover();
    element.addEventListener('pointerleave', clearHover);
    instance.on('pointermove', event => {
      setHover(event.dragging ? undefined :
        instance.forEachFeatureAtPixel(event.pixel, feature => feature));
    });
    instance.on('singleclick', event => {
      const feature = instance.forEachFeatureAtPixel(event.pixel, candidate => candidate);
      if (feature?.getId() == null) return;
      setHover();
      openRegion.current(String(feature.getId()));
    });

    return () => {
      element.removeEventListener('pointerleave', clearHover);
      instance.dispose();
      map.current = null;
      layer.current = null;
      camera.current = undefined;
      overview.current = undefined;
      hovered.current = undefined;
    };
  }, []);

  useEffect(() => {
    const source = layer.current?.getSource();
    if (!source) return;
    hovered.current = undefined;
    if (target.current) target.current.style.cursor = '';
    source.clear(true);
    if (regions) source.addFeatures(regions);
  }, [regions]);

  useEffect(() => {
    const vectorLayer = layer.current;
    if (!vectorLayer || !regions) return;
    const max = Math.max(1, ...Array.from(groups.values(), photos => photos.length));
    const styles = new Map(regions.map(feature => [
      feature, regionStyles(feature, groups.get(String(feature.getId()))?.length ?? 0, max),
    ]));
    const root = document.documentElement;
    vectorLayer.setStyle(feature => {
      const style = styles.get(feature as RegionFeature);
      if (!style) return;
      const dark = root.classList.contains('dark');
      if (feature === hovered.current) return dark ? style.hoverDark : style.hoverLight;
      return dark ? style.dark : style.light;
    });
    const observer = new MutationObserver(() => vectorLayer.changed());
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [groups, regions]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const view = instance.getView();
    const previous = camera.current;
    const duration = reducedMotion ? 0 : 600;
    const countryExtent = transformExtent([...mapCountries[country].extent], 'EPSG:4326', 'EPSG:3857');
    const fit = (extent: Extent, maxZoom: number, animation: number) => {
      const compact = window.innerWidth < 768;
      view.fit(extent, {
        padding: compact ? [132, 24, 40, 24] : [96, 80, 46, 80],
        maxZoom,
        duration: animation,
      });
    };

    if (previous?.country !== country) {
      view.cancelAnimations();
      overview.current = undefined;
      fit(countryExtent, 6.3, 0);
      camera.current = { country };
    }

    if (selected && previous?.regionId !== prefectureId) {
      view.cancelAnimations();
      const center = view.getCenter();
      const resolution = view.getResolution();
      if (center && resolution && !overview.current) overview.current = { country, center, resolution };
      const geometry = selected.getGeometry();
      if (geometry) {
        const extent = largestPolygon(geometry).getExtent();
        if (!isEmpty(extent)) fit(extent, Math.min(10, (view.getZoom() ?? 4) + 2.1), duration);
      }
      camera.current = { country, regionId: prefectureId };
    } else if (!prefectureId && previous?.regionId && previous.country === country) {
      view.cancelAnimations();
      const saved = overview.current;
      if (saved?.country === country) view.animate({ center: saved.center, resolution: saved.resolution, duration });
      else fit(countryExtent, 6.3, duration);
      overview.current = undefined;
      camera.current = { country };
    }
  }, [country, prefectureId, selected, reducedMotion]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [prefectureId, cityId]);

  const status = boundariesFailed ? 'map.boundary_error' : photosFailed ? 'map.photo_error' : undefined;
  return (
    <>
      <div
        className={`gallery-map-canvas${prefectureId ? ' gallery-map-canvas-dimmed' : ''}`}
        ref={target}
        tabIndex={prefectureId ? -1 : 0}
        role="region"
        aria-label={t('sidebar.map')}
        aria-hidden={prefectureId ? true : undefined}
      />
      {!prefectureId && (
        <div className="gallery-map-controls">
          <Select
            label={t('map.countries')}
            disallowEmptySelection
            selectedKeys={[country]}
            onChange={event => {
              if (event.target.value) navigate(mapCountryUrl(parseMapCountry(event.target.value)));
            }}
          >
            {Object.entries(mapCountries).map(([code, option]) =>
              <SelectItem key={code}>{option.label}</SelectItem>)}
          </Select>
          {regions && (
            <select
              className="gallery-map-keyboard-regions"
              aria-label={t('map.select_region')}
              value=""
              onChange={event => openRegion.current(event.target.value)}
            >
              <option value="" disabled>{t('map.select_region')}</option>
              {regions.map(region => <option key={region.getId()} value={region.getId()}>{region.get('name')}</option>)}
            </select>
          )}
          {status && <p className="gallery-map-status" role="status">{t(status)}</p>}
        </div>
      )}
      {!regions && !boundariesFailed && <Spinner className="gallery-map-loading" aria-label={t('map.loading')}/>}
      {prefectureId && (
        <PrefecturePage country={country} regionId={prefectureId} cityId={cityId}
          name={selected?.get('name')} photos={photos ? groups.get(prefectureId) ?? [] : undefined}
          error={status ?? (regions && !selected ? 'map.region_error' : undefined)}
        />
      )}
    </>
  );
}

