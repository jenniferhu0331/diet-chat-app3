export function buildGoogleMapsLink(name: string, address?: string) {
  const q = encodeURIComponent(address ? `${name} ${address}` : name);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function formatDistance(meters?: number) {
  if (meters == null) return "";
  if (meters < 1000) return `${meters} 公尺`;
  return `${(meters / 1000).toFixed(1)} 公里`;
}

export function estimateHealthTag(name: string, types: string[] = []) {
  const text = `${name} ${types.join(" ")}`.toLowerCase();

  if (
    text.includes("healthy") ||
    text.includes("salad") ||
    text.includes("vegetarian") ||
    text.includes("bento") ||
    text.includes("便當") ||
    text.includes("健康")
  ) {
    return "相對健康";
  }

  if (
    text.includes("fried") ||
    text.includes("鹽酥雞") ||
    text.includes("炸") ||
    text.includes("bbq")
  ) {
    return "可考慮少量";
  }

  return "可再看餐點搭配";
  }