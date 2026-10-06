export const CAMERAS = ["iPhone 16 Pro", "Canon R50V", "Nikon Z7ii", "Nikkormat FTN"] as const;
export const LENSES = ["RF 14-30mm", "Nikkor 24-120mm F4", "Nikkor 50mm F2",
  "Thyporch 35mm F1.4", "TTArtisan 50mm F1.4", "Ynlens 35mm F1.8"] as const;

function cameraBrand(model: string, exifMake?: string): string {
  if (/iphone/i.test(model)) return "Apple";
  if (model.startsWith("Canon")) return "Canon";
  if (model.startsWith("Nikon") || model.startsWith("Nikkormat")) return "Nikon";
  return exifMake?.trim() || "Other";
}

function lensBrand(model: string): string {
  if (model.startsWith("RF ")) return "Canon";
  if (model.startsWith("Nikkor ")) return "Nikon";
  if (model.startsWith("Thyporch ")) return "Thyporch";
  if (model.startsWith("TTArtisan ")) return "TTArtisan";
  if (model.startsWith("Ynlens ")) return "Ynlens";
  return "Other";
}

export function equipmentMetadata(cameraModel: string, lensModel: string, exifMake?: string) {
  const camera = { id: 0, model: cameraModel, general_name: cameraModel,
    manufacture: { id: 0, name: cameraBrand(cameraModel, exifMake) } };
  const lens = lensModel ? { id: 0, model: lensModel,
    manufacture: { id: 0, name: lensBrand(lensModel) } } : undefined;
  return { camera, ...(lens ? { lens } : {}) };
}
