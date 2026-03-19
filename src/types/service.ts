export interface ServiceData {
  name: string;
  price: number;
  durationMinutes: number;
  category: string;
  professionals: string[];
}

export interface CategoryData {
  name: string;
  slug: string;
}

export interface ProfessionalData {
  name: string;
  normalizedName: string;
  phone?: string;
}
