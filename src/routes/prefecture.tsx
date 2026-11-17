import { Button, Chip, Select, SelectItem, Spinner } from "@heroui/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TbArrowLeft } from "react-icons/tb";
import { Link, useNavigate } from "react-router-dom";
import PhotoMasonry from "../components/photo_masonry";
import type { Photo } from "../models/gallery";
import { mapCountryUrl, type MapCountry } from "../utils/galleryMapData";

interface PrefecturePageProps {
  country: MapCountry;
  regionId: string;
  cityId?: string;
  name?: string;
  photos?: Photo[];
  error?: string;
}

const allCities = '__all__';
const emptyPhotos: Photo[] = [];
const cityKey = (city: NonNullable<Photo['metadata']['city']>) =>
  city.id == null ? city.name.trim() : String(city.id);

export default function PrefecturePage({ country, regionId, cityId, name, photos, error }: PrefecturePageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cities = useMemo(() => {
    const citiesById = new Map<string, { name: string; photos: Photo[] }>();
    for (const photo of photos ?? emptyPhotos) {
      const city = photo.metadata?.city;
      if (!city?.name?.trim()) continue;
      const id = cityKey(city);
      const group = citiesById.get(id);
      if (group) group.photos.push(photo);
      else citiesById.set(id, { name: city.name, photos: [photo] });
    }
    return citiesById;
  }, [photos]);

  const city = cityId ? cities.get(cityId) : undefined;
  const visiblePhotos = city?.photos ?? photos;
  const path = `/map/prefecture/${regionId}`;

  return (
    <section className="gallery-region">
      <Button as={Link} to={mapCountryUrl(country)} size="sm" variant="flat"
        startContent={<TbArrowLeft size={16}/>}>
        {t('map.back')}
      </Button>
      {name && <h1 className="gallery-region-title">{name}</h1>}
      {error ? <p role="status">{t(error)}</p> : !name || !visiblePhotos ? (
        <Spinner aria-label={t('map.loading')}/>
      ) : (
        <>
          {cities.size > 0 && (
            <Select
              className="gallery-region-city"
              label={t('prefecture.city')}
              disallowEmptySelection
              selectedKeys={[city && cityId ? cityId : allCities]}
              onChange={event => {
                const selected = event.target.value;
                if (selected) navigate(selected === allCities ? path : `${path}/city/${encodeURIComponent(selected)}`);
              }}
            >
              <SelectItem key={allCities} endContent={<Chip size="sm">{photos?.length ?? 0}</Chip>}>
                {t('prefecture.all_area', { name })}
              </SelectItem>
              {Array.from(cities, ([id, entry]) => (
                <SelectItem key={id} textValue={entry.name} endContent={<Chip size="sm">{entry.photos.length}</Chip>}>
                  {entry.name}
                </SelectItem>
              ))}
            </Select>
          )}
          {visiblePhotos.length ? <PhotoMasonry key={cityId ?? regionId} preloadedPhotos={visiblePhotos}/> :
            <p className="gallery-region-empty">{t('map.empty')}</p>}
        </>
      )}
    </section>
  );
}

