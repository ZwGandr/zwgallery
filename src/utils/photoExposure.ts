export type ExposureMetadata = {
  photographic_sensitivity: number;
  f_number: number;
  exposure_time: number;
  exposure_time_rat: string;
  focal_length: number;
};

export function formatExposureTime(seconds: number): string {
  if (seconds >= 1) return String(Number(seconds.toFixed(2)));
  const denominator = Math.round(1 / seconds);
  return denominator > 0 && Math.abs(1 / denominator - seconds) / seconds < 0.015
    ? `1/${denominator}` : String(Number(seconds.toPrecision(4)));
}

export function parseExposureFields(isoText: string, apertureText: string,
                                    shutterText: string, focalText: string): ExposureMetadata | null {
  const iso = Number(isoText.trim());
  const aperture = Number(apertureText.trim());
  const focalLength = Number(focalText.trim());
  const shutter = shutterText.trim();
  const fraction = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(shutter);
  const seconds = fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(shutter);
  if (!isoText.trim() || !apertureText.trim() || !shutter || !focalText.trim() ||
      !Number.isInteger(iso) || iso < 1 || iso > 1_024_000 ||
      !Number.isFinite(aperture) || aperture <= 0 || aperture > 128 ||
      !Number.isFinite(seconds) || seconds <= 0 || seconds > 3_600 ||
      !Number.isFinite(focalLength) || focalLength <= 0 || focalLength > 10_000) return null;
  return {
    photographic_sensitivity: iso,
    f_number: aperture,
    exposure_time: seconds,
    exposure_time_rat: fraction ? `${Number(fraction[1])}/${Number(fraction[2])}` : shutter,
    focal_length: focalLength,
  };
}
