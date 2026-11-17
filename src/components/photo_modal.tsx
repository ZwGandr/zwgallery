import { Lens, Photo, Response } from "../models/gallery.ts";
import {
  Card, CardBody, CardFooter, CardHeader, Divider, Image, Link,
  Modal, ModalBody, ModalContent, ModalHeader, Skeleton,
} from "@heroui/react";
import { IoCalendarOutline, IoLocationOutline } from "react-icons/io5";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import axios from "axios";
import useMediaQuery from "../hooks/useMediaQuery.tsx";
import ManufactureIcon from "./manufacture_icon.tsx";
import CameraName from "./camera_name.tsx";
import { BASE_API2 } from "../constants/api.ts";
import PhotoExposure from "./photo_exposure.tsx";
import { formatPhotoCaptureTime, photoCaptureYear } from "../utils/photoCaptureTime.ts";

export interface PhotoModalProps {
  photo: Photo;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean, path?: string) => void;
}

function lensDisplayName(lens: Lens): string {
  const brand = lens.manufacture?.name ?? "";
  return !brand || brand === "Other" || lens.model.toLowerCase().startsWith(`${brand.toLowerCase()} `)
    ? lens.model : `${brand} ${lens.model}`;
}

export default function PhotoModal(props: PhotoModalProps) {
  const { t } = useTranslation();
  const isDesktop = useMediaQuery("(min-width: 960px)");
  const [details, setDetails] = useState<Photo>();
  const [loading, setLoading] = useState(true);
  const photoId = props.photo.id;

  useEffect(() => {
    if (!props.isOpen) return;

    const request = new AbortController();
    setLoading(true);
    axios.get<Response<Photo>>(`${BASE_API2}/photos/get`, {
      params: { id: photoId },
      signal: request.signal,
    }).then(({ data }) => {
      if (data.payload) setDetails(data.payload);
    }).catch(() => {
      // The gallery thumbnail remains available when the details request fails.
    }).finally(() => {
      if (!request.signal.aborted) setLoading(false);
    });

    return () => request.abort();
  }, [props.isOpen, photoId]);

  const photo = details?.id === photoId ? details : props.photo;
  const image = photo.medium_file ?? photo.thumb_file;
  const ratio = image.width > 0 && image.height > 0
    ? image.width / image.height : 1;
  const isPortrait = ratio <= 1;
  const sideBySide = isDesktop && isPortrait;

  // Portraits size the dialog to the photo. Landscapes keep the standard dialog width.
  const portraitMaxHeight = sideBySide ? "max(1px, 100dvh - 8rem)" : "max(40dvh, 100dvh - 18rem)";
  const intrinsicWidth = image.width > 0 ? `${image.width}px` : "56rem";
  const portraitWidth = `min(${intrinsicWidth}, calc(${portraitMaxHeight} * ${ratio}))`;
  const modalWidth = sideBySide
    ? `calc(22rem + min(30rem, ${portraitWidth}))`
    : isPortrait ? `max(22rem, ${portraitWidth})` : undefined;
  const { city } = photo.metadata;

  return (
    <Modal
      isOpen={props.isOpen}
      onOpenChange={props.onOpenChange}
      backdrop="blur"
      size="4xl"
      scrollBehavior="inside"
      classNames={{ closeButton: "z-20" }}
    >
      <ModalContent
        className="max-h-[calc(100dvh-0.5rem)] overflow-hidden sm:my-4 sm:max-h-[calc(100dvh-2rem)] min-[960px]:my-16 min-[960px]:max-h-[calc(100dvh-8rem)]"
        style={{ width: modalWidth }}
      >
        <ModalHeader className="sr-only">#{photo.id}</ModalHeader>
        <ModalBody className={sideBySide
          ? "grid min-h-0 grid-cols-[minmax(0,1fr)_22rem] gap-0 p-0 [scrollbar-width:none]"
          : "min-h-0 gap-0 p-0 [scrollbar-width:none]"}>
          <Card
            isFooterBlurred
            radius="lg"
            className="mx-auto min-h-0 w-full self-start border-none"
            style={sideBySide ? undefined : { aspectRatio: ratio, maxHeight: image.height > 0 ? image.height : undefined }}
          >
            <Image
              isBlurred
              draggable={false}
              classNames={{
                wrapper: sideBySide ? undefined : "absolute inset-0 !max-w-none",
                img: "pointer-events-none",
                blurredImg: "pointer-events-none opacity-40",
              }}
              className="block w-full object-contain"
              style={{ height: sideBySide ? "auto" : "100%" }}
              src={image.url}
              width={image.width}
              height={image.height}
              alt={photo.title ?? ""}
            />
            <CardFooter className="absolute bottom-1 right-1 z-10 w-auto overflow-hidden rounded-large border-1 border-white/20 py-1 font-normal shadow-small before:rounded-xl before:bg-white/10">
              <div className="text-tiny text-white/80 md:text-small">
                &copy; {photoCaptureYear(photo.metadata)} {photo.author?.name}
              </div>
            </CardFooter>
          </Card>

          <div className={sideBySide ? "flex min-w-0 flex-col justify-end gap-3 p-6" : "min-w-0 shrink-0 space-y-3 p-4"}>
            <div className={sideBySide ? "space-y-1" : "flex flex-wrap items-center justify-between gap-2"}>
              {city && (
                <div className="flex items-center gap-1 text-default-500">
                  <IoLocationOutline className="shrink-0" size={20}/>
                  <div className="flex flex-wrap gap-x-2 font-bold">
                    <span className="text-foreground">{city.prefecture.country.name}</span>
                    {city.prefecture.id != null ? (
                      <Link
                        color="foreground"
                        className="cursor-pointer"
                        onPress={() => props.onOpenChange(false, `/prefecture/${city.prefecture.id}`)}
                      >
                        {city.prefecture.name}
                      </Link>
                    ) : <span>{city.prefecture.name}</span>}
                    {city.prefecture.id != null && city.id != null ? (
                      <Link
                        color="foreground"
                        className="cursor-pointer"
                        onPress={() => props.onOpenChange(false, `/prefecture/${city.prefecture.id}/city/${city.id}`)}
                      >
                        {city.name}
                      </Link>
                    ) : <span>{city.name}</span>}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-small text-default-500">
                <IoCalendarOutline className="shrink-0" size={18}/>
                {formatPhotoCaptureTime(photo.metadata)}
              </div>
            </div>

            <Card className="overflow-visible">
              <CardHeader className="bg-default-100 py-2 text-small font-semibold">
                {loading ? (
                  <Skeleton className="h-5 w-2/5 rounded-lg"/>
                ) : (
                  <>
                    <ManufactureIcon name={photo.metadata.camera?.manufacture.name}/>
                    <CameraName camera={photo.metadata.camera}/>
                  </>
                )}
              </CardHeader>
              <CardBody className="overflow-y-visible py-2 text-small text-default-500">
                {loading ? (
                  <Skeleton className="h-5 w-4/5 rounded-lg"/>
                ) : (
                  photo.metadata.lens ? lensDisplayName(photo.metadata.lens) : t("unknown_lens")
                )}
              </CardBody>
              <Divider className="bg-default-100"/>
              <PhotoExposure metadata={photo.metadata}/>
            </Card>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
