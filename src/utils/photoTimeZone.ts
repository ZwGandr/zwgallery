export type PhotoTimeZone = "America/Detroit" | "Asia/Shanghai" | "Asia/Tokyo";

export const PHOTO_TIME_ZONES: PhotoTimeZone[] = ["America/Detroit", "Asia/Shanghai", "Asia/Tokyo"];

function wallParts(timestamp: number, zone: PhotoTimeZone): number[] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(timestamp);
  return ["year", "month", "day", "hour", "minute"].map(key =>
    Number(parts.find(part => part.type === key)?.value));
}

function offsetMinutes(timestamp: number, zone: PhotoTimeZone): number {
  const [year, month, day, hour, minute] = wallParts(timestamp, zone);
  return (Date.UTC(year, month - 1, day, hour, minute) - timestamp) / 60_000;
}

function offsetText(minutes: number): string {
  const absolute = Math.abs(minutes);
  return `${minutes < 0 ? "-" : "+"}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

export function defaultPhotoTimeZone(): PhotoTimeZone {
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return PHOTO_TIME_ZONES.includes(browserZone as PhotoTimeZone) ? browserZone as PhotoTimeZone : "America/Detroit";
}

export function localDateTimeInZone(zone: PhotoTimeZone): string {
  const [year, month, day, hour, minute] = wallParts(Date.now(), zone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function zoneFromExifOffset(offset: string | undefined): PhotoTimeZone | undefined {
  if (offset === "+08:00") return "Asia/Shanghai";
  if (offset === "+09:00") return "Asia/Tokyo";
  if (offset === "-04:00" || offset === "-05:00") return "America/Detroit";
  return undefined;
}

export function dateTimeWithZone(local: string, zone: PhotoTimeZone): { datetime: string; timezone: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return null;
  const values = match.slice(1).map(Number);
  const [year, month, day, hour, minute] = values;
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(naive);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day ||
      check.getUTCHours() !== hour || check.getUTCMinutes() !== minute) return null;

  // 候选偏移覆盖安娜堡夏令时切换；不存在的当地时间不允许上传。
  const offsets = new Set([-43_200_000, 0, 43_200_000].map(delta => offsetMinutes(naive + delta, zone)));
  const matches = [...offsets].map(offset => ({ offset, instant: naive - offset * 60_000 }))
    .filter(candidate => wallParts(candidate.instant, zone).every((value, index) => value === values[index]))
    .sort((a, b) => a.instant - b.instant);
  if (!matches.length) return null;
  const timezone = offsetText(matches[0].offset);
  return { datetime: `${local}:00${timezone}`, timezone };
}
