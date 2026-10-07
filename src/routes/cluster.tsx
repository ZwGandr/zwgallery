import { useContext, useEffect, useRef, useState } from "react";
import { Country, PhotoClusterItem, Response } from "../models/gallery.ts";
import axios from "axios";
import { Card } from "@heroui/react";
import useDarkMode from "use-dark-mode";
import MapBox, { Marker } from "react-map-gl";
import { MapTokenContext } from "../contexts/map_token.tsx";
import { BASE_API2 } from "../constants/api.ts";
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

function FallbackClusterMap({ country, items }: { country: Country; items: PhotoClusterItem[] }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!element.current) return;
    const markers = items.filter(item => item.coordinate).map(item => {
      const feature = new Feature(new Point(fromLonLat([
        item.coordinate!.longitude, item.coordinate!.latitude,
      ])));
      feature.set("photoId", item.id);
      feature.setStyle(new Style({ image: new Circle({ radius: 9,
        fill: new Fill({ color: "#e43d43" }), stroke: new Stroke({ color: "white", width: 2 }) }) }));
      return feature;
    });
    const map = new Map({ target: element.current,
      layers: [new TileLayer({ source: new OSM() }),
        new VectorLayer({ source: new VectorSource({ features: markers }) })],
      view: new View({ center: fromLonLat(country.center), zoom: country.zoom[0] }),
    });
    map.on("click", event => {
      const feature = map.forEachFeatureAtPixel(event.pixel, candidate => candidate);
      if (feature) window.location.href = `/photo/${feature.get("photoId")}`;
    });
    map.on("pointermove", event => {
      if (element.current) element.current.style.cursor = map.hasFeatureAtPixel(event.pixel) ? "pointer" : "";
    });
    return () => map.setTarget(undefined);
  }, [country, items]);
  return <div ref={element} className="h-full w-full"/>;
}

export default function ClusterPage() {
  const darkmode = useDarkMode();
  const [items, setItems] = useState<PhotoClusterItem[]>([]);
  const [country, setCountry] = useState<Country>();
  const token = useContext(MapTokenContext)?.token?.token;

  useEffect(() => {
    axios.get<Response<Country[]>>(`${BASE_API2}/geo/countries`).then(({ data }) => setCountry(data.payload[0]));
  }, []);

  useEffect(() => {
    if (!country) return;
    axios.get<Response<PhotoClusterItem[]>>(`${BASE_API2}/photos/cluster`, {
      params: { country_id: country.id },
    }).then(({ data }) => setItems(data.payload));
  }, [country]);

  if (!country) return null;
  return <div className="relative h-[calc(100dvh-4rem)]">
    {token ? <MapBox mapboxAccessToken={token}
      initialViewState={{ longitude: country.center[0], latitude: country.center[1], zoom: country.zoom[0] }}
      mapStyle={darkmode.value ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12"}>
      {items.filter(item => item.coordinate).map(item => <Marker key={item.id}
        longitude={item.coordinate!.longitude} latitude={item.coordinate!.latitude}>
        <a href={`/photo/${item.id}`} aria-label={`Photo ${item.id}`}>
          <Card radius="sm" className="border-none"><img className="h-[56px] w-[56px] object-cover"
            src={item.thumb_file.url} alt=""/></Card>
        </a>
      </Marker>)}
    </MapBox> : <FallbackClusterMap country={country} items={items}/>}
  </div>;
}
