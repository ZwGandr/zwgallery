import axios from "axios";
import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import { MultiPolygon, Polygon } from "ol/geom";
import { fromLonLat } from "ol/proj";
import { BASE_API2 } from "../constants/api";
import type { Photo, Response } from "../models/gallery";

export const mapCountries = {
  JPN: { label: '日本', names: ['日本', 'Japan', 'JP', 'JPN'], extent: [128, 25, 146, 46] },
  USA: { label: 'United States', names: ['United States', 'United States of America', 'US', 'USA', '美国', '美國'],
    extent: [-164, 19, -65, 68] },
  CHN: { label: '中国', names: ['中国', '中國', 'China', 'CN', 'CHN', '中华人民共和国', '中華人民共和國'],
    extent: [72, 17, 136, 54] },
} as const;

export type MapCountry = keyof typeof mapCountries;
export type RegionFeature = Feature<Polygon | MultiPolygon>;

const boundaryFiles: Record<MapCountry, string> = {
  JPN: '/geojson/JPN.json',
  USA: '/geojson/USA.json',
  CHN: '/geojson/CHN.json',
};

export function parseMapCountry(code: string | null): MapCountry {
  return code === 'USA' || code === 'CHN' ? code : 'JPN';
}

export function regionCountry(regionId: string): MapCountry {
  if (regionId.startsWith('us-')) return 'USA';
  if (regionId.startsWith('cn-')) return 'CHN';
  return 'JPN';
}

export function mapCountryUrl(country: MapCountry) {
  return country === 'JPN' ? '/map' : `/map?country=${country}`;
}

export async function loadRegions(country: MapCountry, signal: AbortSignal) {
  const { data } = await axios.get(boundaryFiles[country], { signal });
  const features = new GeoJSON().readFeatures(data, { featureProjection: 'EPSG:3857' });
  return features.filter((feature): feature is RegionFeature => {
    const geometry = feature.getGeometry();
    return feature.get('name') && (geometry instanceof Polygon || geometry instanceof MultiPolygon);
  });
}

export async function loadMapPhotos(signal: AbortSignal): Promise<Photo[]> {
  const photos: Photo[] = [];
  const seen = new Set<number>();
  const pageSize = 100;
  for (;;) {
    const { data: { payload } } = await axios.get<Response<Photo[]>>(`${BASE_API2}/photos/all`, {
      signal,
      params: { page_size: pageSize, last_id: photos.at(-1)?.id },
    });
    const next = payload.filter(photo => !seen.has(photo.id));
    for (const photo of next) {
      seen.add(photo.id);
      photos.push(photo);
    }
    if (payload.length < pageSize || next.length === 0) return photos;
  }
}

const normalize = (name: string) => name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const regionName = (name: string) => normalize(name).replace(/(壮族自治区|维吾尔自治区|回族自治区|自治区|特别行政区|[省市県縣])$/, '');

export function groupRegionPhotos(country: MapCountry, features: RegionFeature[], photos: Photo[]) {
  const names = new Map<string, RegionFeature>();
  const ids = new Map<string, RegionFeature>();
  for (const feature of features) {
    ids.set(String(feature.getId()), feature);
    const aliases: string[] = feature.get('aliases') ?? [];
    for (const name of [feature.get('name'), ...aliases]) names.set(regionName(name), feature);
  }
  const countryNames = new Set(mapCountries[country].names.map(normalize));
  const groups = new Map<string, Photo[]>();
  for (const photo of photos) {
    const prefecture = photo.metadata?.city?.prefecture;
    const countryCode = prefecture?.country?.code;
    const countryName = prefecture?.country?.name;
    const hasAddress = Boolean(countryCode || countryName);
    if (hasAddress && ![countryCode, countryName].some(value => value && countryNames.has(normalize(value)))) continue;

    let feature = prefecture?.name ? names.get(regionName(prefecture.name)) : undefined;
    if (!feature && country === 'JPN' && prefecture?.id != null) feature = ids.get(String(prefecture.id));
    const point = photo.metadata?.location;
    if (!feature && point && Number.isFinite(point.longitude) && Number.isFinite(point.latitude) &&
        Math.abs(point.longitude) <= 180 && Math.abs(point.latitude) <= 90) {
      const coordinate = fromLonLat([point.longitude, point.latitude]);
      feature = features.find(candidate => candidate.getGeometry()?.intersectsCoordinate(coordinate));
    }
    if (!feature) continue;
    const id = String(feature.getId());
    const group = groups.get(id);
    if (group) group.push(photo);
    else groups.set(id, [photo]);
  }
  return groups;
}
