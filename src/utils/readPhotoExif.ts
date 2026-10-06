export type PhotoExif = {
  takenAt?: string;
  offset?: string;
  cameraMake?: string;
  cameraModel?: string;
  lensModel?: string;
  latitude?: number;
  longitude?: number;
  iso?: number;
  fNumber?: number;
  exposureTime?: number;
  focalLength?: number;
};

function textTag(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim().slice(0, 120) || undefined : undefined;
}

function numberTag(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function localDateTag(value: unknown): string | undefined {
  // EXIF 原始时间没有时区；不让 JS Date 按上传者电脑的时区误转换。
  const match = typeof value === "string" &&
    /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return undefined;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute));
  if (date.getUTCFullYear() !== +year || date.getUTCMonth() !== +month - 1 ||
      date.getUTCDate() !== +day || date.getUTCHours() !== +hour || date.getUTCMinutes() !== +minute) {
    return undefined;
  }
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export async function readPhotoExif(file: File): Promise<PhotoExif> {
  // 读取原图 EXIF 必须早于 Canvas 压缩；全部在浏览器执行，不调用后端。
  const { parse, gps } = await import("exifr");
  const [tags, coordinates] = await Promise.all([
    parse(file, {
      reviveValues: false,
      pick: ["Make", "Model", "LensModel", "DateTimeOriginal", "CreateDate",
        "OffsetTimeOriginal", "OffsetTime", "ISO", "FNumber", "ExposureTime", "FocalLength"],
    }).catch(() => undefined),
    gps(file).catch(() => undefined),
  ]);
  const data = (tags ?? {}) as Record<string, unknown>;
  const latitude = coordinates?.latitude;
  const longitude = coordinates?.longitude;
  const validGps = typeof latitude === "number" && typeof longitude === "number" &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  const offset = textTag(data.OffsetTimeOriginal ?? data.OffsetTime);
  return {
    takenAt: localDateTag(data.DateTimeOriginal ?? data.CreateDate),
    offset: offset && /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : undefined,
    cameraMake: textTag(data.Make),
    cameraModel: textTag(data.Model),
    lensModel: textTag(data.LensModel),
    ...(validGps ? { latitude, longitude } : {}),
    iso: numberTag(data.ISO),
    fNumber: numberTag(data.FNumber),
    exposureTime: numberTag(data.ExposureTime),
    focalLength: numberTag(data.FocalLength),
  };
}
