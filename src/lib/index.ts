export type Restaurant = {
  id: string;
  name: string;
  address?: string;
  openNow?: boolean;
  rating?: number;
  googleMapsLink: string;
  distanceMeters?: number;
  healthTag?: string;
  types?: string[];
};

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};