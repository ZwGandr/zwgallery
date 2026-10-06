import type { Metadata } from "../models/gallery.ts";

type WallTime = { year: number; month: number; day: number; hour: number; minute: number };

function captureWallTime(metadata: Pick<Metadata, "datetime" | "timezone">): WallTime | null {
  const raw = metadata.datetime.trim();
  const offset = /^([+-])(\d{2}):(\d{2})$/.exec(metadata.timezone);
  if (!offset) return null;
  const minutes = (offset[1] === "-" ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3]));

  // 新照片 datetime 自带偏移，是绝对时间；按单独存储的拍摄时区显示。
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const instant = Date.parse(raw);
    if (!Number.isFinite(instant)) return null;
    const wall = new Date(instant + minutes * 60_000);
    return { year: wall.getUTCFullYear(), month: wall.getUTCMonth() + 1,
      day: wall.getUTCDate(), hour: wall.getUTCHours(), minute: wall.getUTCMinutes() };
  }

  // 旧照片（如 #21）是无偏移的拍摄地墙上时间，不能按访客电脑时区再转换。
  const legacy = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::\d{1,2})?$/.exec(raw);
  if (!legacy) return null;
  const [year, month, day, hour, minute] = legacy.slice(1).map(Number);
  const valid = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (valid.getUTCFullYear() !== year || valid.getUTCMonth() !== month - 1 ||
      valid.getUTCDate() !== day || valid.getUTCHours() !== hour || valid.getUTCMinutes() !== minute) return null;
  return { year, month, day, hour, minute };
}

export function formatPhotoCaptureTime(metadata: Pick<Metadata, "datetime" | "timezone">): string {
  const wall = captureWallTime(metadata);
  if (!wall) return metadata.datetime;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)} ${pad(wall.hour)}:${pad(wall.minute)} (GMT${metadata.timezone})`;
}

export function photoCaptureYear(metadata: Pick<Metadata, "datetime" | "timezone">): string {
  return String(captureWallTime(metadata)?.year ?? metadata.datetime.slice(0, 4));
}
