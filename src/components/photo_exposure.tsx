import { CardFooter } from "@heroui/react";
import { Metadata } from "../models/gallery.ts";
import { formatExposureTime } from "../utils/photoExposure.ts";

export default function PhotoExposure({ metadata, className }: { metadata: Metadata; className?: string }) {
  // 新上传照片可没有 EXIF，只显示确实存在的曝光参数。
  const shutter = metadata.exposure_time_rat ||
    (metadata.exposure_time != null && metadata.exposure_time > 0
      ? formatExposureTime(metadata.exposure_time) : null);
  const values = [
    metadata.photographic_sensitivity != null ? `ISO ${metadata.photographic_sensitivity}` : null,
    metadata.f_number != null ? `ƒ${metadata.f_number}` : null,
    shutter ? `${shutter} s` : null,
    metadata.focal_length != null ? `${metadata.focal_length} mm` : null,
  ].filter((value): value is string => value !== null);
  if (!values.length) return null;
  return <CardFooter className={className ?? "py-2 flex justify-around text-default-500"}>
    {values.map((value, index) => <span key={value} className="contents">
      {index > 0 && <code className="text-small text-default-300 font-extralight">|</code>}
      <code className="text-small">{value}</code>
    </span>)}
  </CardFooter>;
}
