import { Coordinate } from "../models/gallery.ts";
import { useContext, useEffect, useRef } from "react";
import { MapTokenContext } from "../contexts/map_token.tsx";
import useDarkMode from "use-dark-mode";
import MapBox, { MapRef, Marker } from "react-map-gl";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { fromLonLat } from "ol/proj";
import { Circle, Fill, Stroke, Style } from "ol/style";

export interface DialogMapProps {
  coordinate: Coordinate
}

export default function DialogMap({ coordinate }: DialogMapProps) {
  const token = useContext(MapTokenContext)?.token?.token;
  const mapRef = useRef<MapRef>(null);
  const fallbackElement = useRef<HTMLDivElement>(null);
  const darkmode = useDarkMode();

  useEffect(() => {
    mapRef.current?.flyTo({ center: [coordinate.longitude, coordinate.latitude], duration: 300 });
  }, [coordinate.latitude, coordinate.longitude]);

  useEffect(() => {
    if (token || !fallbackElement.current) return;
    const point = fromLonLat([coordinate.longitude, coordinate.latitude]);
    const marker = new Feature(new Point(point));
    marker.setStyle(new Style({ image: new Circle({ radius: 7,
      fill: new Fill({ color: "#e43d43" }), stroke: new Stroke({ color: "white", width: 2 }) }) }));
    const map = new Map({
      target: fallbackElement.current,
      layers: [new TileLayer({ source: new OSM() }),
        new VectorLayer({ source: new VectorSource({ features: [marker] }) })],
      view: new View({ center: point, zoom: 12 }),
    });
    return () => map.setTarget(undefined);
  }, [token, coordinate.latitude, coordinate.longitude]);

  if (!token) return <div ref={fallbackElement} className="absolute inset-0 min-h-[160px]"/>;

  return <MapBox
    mapboxAccessToken={token}
    initialViewState={{ longitude: coordinate.longitude, latitude: coordinate.latitude, zoom: 12 }}
    style={{ width: "100%", height: "100%", position: "absolute" }}
    mapStyle={darkmode.value ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12"}
    ref={mapRef}
  >
    <Marker longitude={coordinate.longitude} latitude={coordinate.latitude} color="red"/>
  </MapBox>;
}
