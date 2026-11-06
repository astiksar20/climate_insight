/**
 * Geographic helpers for India: reference cities (one or more per state/UT),
 * a coarse coastline for distance-to-coast, and region classification used by
 * the synthetic climate model.
 */

export type City = { name: string; state: string; lat: number; lon: number };

export const CITIES: City[] = [
  { name: "Srinagar", state: "Jammu & Kashmir", lat: 34.08, lon: 74.8 },
  { name: "Jammu", state: "Jammu & Kashmir", lat: 32.73, lon: 74.86 },
  { name: "Leh", state: "Ladakh", lat: 34.16, lon: 77.58 },
  { name: "Shimla", state: "Himachal Pradesh", lat: 31.1, lon: 77.17 },
  { name: "Dharamshala", state: "Himachal Pradesh", lat: 32.22, lon: 76.32 },
  { name: "Amritsar", state: "Punjab", lat: 31.63, lon: 74.87 },
  { name: "Ludhiana", state: "Punjab", lat: 30.9, lon: 75.85 },
  { name: "Chandigarh", state: "Chandigarh", lat: 30.73, lon: 76.78 },
  { name: "Dehradun", state: "Uttarakhand", lat: 30.32, lon: 78.03 },
  { name: "Pithoragarh", state: "Uttarakhand", lat: 29.58, lon: 80.22 },
  { name: "Hisar", state: "Haryana", lat: 29.15, lon: 75.72 },
  { name: "New Delhi", state: "Delhi", lat: 28.61, lon: 77.21 },
  { name: "Jaipur", state: "Rajasthan", lat: 26.91, lon: 75.79 },
  { name: "Jaisalmer", state: "Rajasthan", lat: 26.92, lon: 70.91 },
  { name: "Bikaner", state: "Rajasthan", lat: 28.02, lon: 73.31 },
  { name: "Jodhpur", state: "Rajasthan", lat: 26.24, lon: 73.02 },
  { name: "Udaipur", state: "Rajasthan", lat: 24.58, lon: 73.71 },
  { name: "Kota", state: "Rajasthan", lat: 25.18, lon: 75.83 },
  { name: "Agra", state: "Uttar Pradesh", lat: 27.18, lon: 78.01 },
  { name: "Lucknow", state: "Uttar Pradesh", lat: 26.85, lon: 80.95 },
  { name: "Varanasi", state: "Uttar Pradesh", lat: 25.32, lon: 82.97 },
  { name: "Gorakhpur", state: "Uttar Pradesh", lat: 26.76, lon: 83.37 },
  { name: "Jhansi", state: "Uttar Pradesh", lat: 25.45, lon: 78.57 },
  { name: "Patna", state: "Bihar", lat: 25.59, lon: 85.14 },
  { name: "Purnia", state: "Bihar", lat: 25.78, lon: 87.47 },
  { name: "Gangtok", state: "Sikkim", lat: 27.33, lon: 88.61 },
  { name: "Darjeeling", state: "West Bengal", lat: 27.04, lon: 88.26 },
  { name: "Kolkata", state: "West Bengal", lat: 22.57, lon: 88.36 },
  { name: "Guwahati", state: "Assam", lat: 26.14, lon: 91.74 },
  { name: "Dibrugarh", state: "Assam", lat: 27.47, lon: 94.91 },
  { name: "Silchar", state: "Assam", lat: 24.83, lon: 92.78 },
  { name: "Itanagar", state: "Arunachal Pradesh", lat: 27.08, lon: 93.6 },
  { name: "Tawang", state: "Arunachal Pradesh", lat: 27.59, lon: 91.86 },
  { name: "Shillong", state: "Meghalaya", lat: 25.58, lon: 91.89 },
  { name: "Cherrapunji", state: "Meghalaya", lat: 25.27, lon: 91.73 },
  { name: "Kohima", state: "Nagaland", lat: 25.67, lon: 94.11 },
  { name: "Imphal", state: "Manipur", lat: 24.82, lon: 93.94 },
  { name: "Aizawl", state: "Mizoram", lat: 23.73, lon: 92.72 },
  { name: "Agartala", state: "Tripura", lat: 23.83, lon: 91.28 },
  { name: "Ranchi", state: "Jharkhand", lat: 23.34, lon: 85.31 },
  { name: "Dhanbad", state: "Jharkhand", lat: 23.8, lon: 86.43 },
  { name: "Bhubaneswar", state: "Odisha", lat: 20.3, lon: 85.82 },
  { name: "Puri", state: "Odisha", lat: 19.81, lon: 85.83 },
  { name: "Sambalpur", state: "Odisha", lat: 21.47, lon: 83.97 },
  { name: "Raipur", state: "Chhattisgarh", lat: 21.25, lon: 81.63 },
  { name: "Jagdalpur", state: "Chhattisgarh", lat: 19.08, lon: 82.02 },
  { name: "Bhopal", state: "Madhya Pradesh", lat: 23.26, lon: 77.41 },
  { name: "Indore", state: "Madhya Pradesh", lat: 22.72, lon: 75.86 },
  { name: "Jabalpur", state: "Madhya Pradesh", lat: 23.18, lon: 79.99 },
  { name: "Gwalior", state: "Madhya Pradesh", lat: 26.22, lon: 78.18 },
  { name: "Ahmedabad", state: "Gujarat", lat: 23.02, lon: 72.57 },
  { name: "Bhuj", state: "Gujarat", lat: 23.24, lon: 69.67 },
  { name: "Rajkot", state: "Gujarat", lat: 22.3, lon: 70.8 },
  { name: "Surat", state: "Gujarat", lat: 21.17, lon: 72.83 },
  { name: "Daman", state: "Dadra & Nagar Haveli and Daman & Diu", lat: 20.4, lon: 72.83 },
  { name: "Mumbai", state: "Maharashtra", lat: 19.08, lon: 72.88 },
  { name: "Pune", state: "Maharashtra", lat: 18.52, lon: 73.86 },
  { name: "Nagpur", state: "Maharashtra", lat: 21.15, lon: 79.09 },
  { name: "Aurangabad", state: "Maharashtra", lat: 19.88, lon: 75.34 },
  { name: "Ratnagiri", state: "Maharashtra", lat: 16.99, lon: 73.3 },
  { name: "Panaji", state: "Goa", lat: 15.49, lon: 73.83 },
  { name: "Hyderabad", state: "Telangana", lat: 17.39, lon: 78.49 },
  { name: "Warangal", state: "Telangana", lat: 17.97, lon: 79.59 },
  { name: "Visakhapatnam", state: "Andhra Pradesh", lat: 17.69, lon: 83.22 },
  { name: "Vijayawada", state: "Andhra Pradesh", lat: 16.51, lon: 80.65 },
  { name: "Kurnool", state: "Andhra Pradesh", lat: 15.83, lon: 78.04 },
  { name: "Nellore", state: "Andhra Pradesh", lat: 14.44, lon: 79.99 },
  { name: "Bengaluru", state: "Karnataka", lat: 12.97, lon: 77.59 },
  { name: "Mangaluru", state: "Karnataka", lat: 12.91, lon: 74.86 },
  { name: "Hubballi", state: "Karnataka", lat: 15.36, lon: 75.12 },
  { name: "Kalaburagi", state: "Karnataka", lat: 17.33, lon: 76.83 },
  { name: "Chennai", state: "Tamil Nadu", lat: 13.08, lon: 80.27 },
  { name: "Madurai", state: "Tamil Nadu", lat: 9.93, lon: 78.12 },
  { name: "Coimbatore", state: "Tamil Nadu", lat: 11.02, lon: 76.96 },
  { name: "Nagapattinam", state: "Tamil Nadu", lat: 10.77, lon: 79.84 },
  { name: "Puducherry", state: "Puducherry", lat: 11.94, lon: 79.81 },
  { name: "Kochi", state: "Kerala", lat: 9.93, lon: 76.27 },
  { name: "Thiruvananthapuram", state: "Kerala", lat: 8.52, lon: 76.94 },
  { name: "Kozhikode", state: "Kerala", lat: 11.26, lon: 75.78 },
  { name: "Port Blair", state: "Andaman & Nicobar", lat: 11.62, lon: 92.73 },
  { name: "Kavaratti", state: "Lakshadweep", lat: 10.57, lon: 72.64 },
];

/** Rough Indian mainland coastline, Kutch → Sundarbans (lat, lon). */
const COAST: [number, number][] = [
  [23.6, 68.3],
  [22.4, 69.0],
  [21.6, 69.6],
  [20.7, 70.9],
  [21.6, 72.2],
  [21.1, 72.7],
  [20.0, 72.8],
  [19.0, 72.8],
  [17.0, 73.3],
  [15.5, 73.8],
  [14.0, 74.5],
  [12.9, 74.8],
  [11.25, 75.75],
  [9.95, 76.25],
  [8.5, 76.9],
  [8.08, 77.55],
  [8.8, 78.15],
  [9.3, 79.1],
  [10.3, 79.85],
  [11.9, 79.85],
  [13.08, 80.29],
  [14.45, 80.1],
  [15.9, 80.9],
  [16.5, 82.2],
  [17.7, 83.3],
  [18.7, 84.4],
  [19.8, 85.8],
  [20.3, 86.7],
  [21.5, 87.2],
  [21.6, 88.2],
  [21.7, 89.0],
];

export const INDIA_BOUNDS: [[number, number], [number, number]] = [
  [6.0, 67.5],
  [37.6, 97.8],
];

export function inIndiaBox(lat: number, lon: number) {
  return lat >= 6 && lat <= 37.6 && lon >= 67.5 && lon <= 97.8;
}

export function haversineKm(a: number, b: number, c: number, d: number) {
  const R = 6371,
    r = Math.PI / 180;
  const dLat = (c - a) * r,
    dLon = (d - b) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function coastDistanceKm(lat: number, lon: number): number {
  // Islands are coastal by definition.
  if ((lon > 91.5 && lat < 14.5) || (lon < 74 && lat < 12.5 && lon < 73.8)) return 2;
  let best = Infinity;
  for (let i = 0; i < COAST.length - 1; i++) {
    const [a1, b1] = COAST[i],
      [a2, b2] = COAST[i + 1];
    for (let t = 0; t <= 1; t += 0.1) {
      const d = haversineKm(lat, lon, a1 + (a2 - a1) * t, b1 + (b2 - b1) * t);
      if (d < best) best = d;
    }
  }
  return Math.round(best);
}

export function nearestCity(lat: number, lon: number): City & { km: number } {
  let best = CITIES[0],
    bd = Infinity;
  for (const c of CITIES) {
    const d = haversineKm(lat, lon, c.lat, c.lon);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return { ...best, km: Math.round(bd) };
}

export type Region =
  | "ladakh"
  | "kashmir"
  | "himalaya"
  | "thar"
  | "northwest-plains"
  | "gangetic"
  | "northeast"
  | "central"
  | "deccan"
  | "westcoast"
  | "eastcoast"
  | "tamilnadu"
  | "south-interior"
  | "islands";

export function regionOf(lat: number, lon: number): Region {
  if ((lon > 91.5 && lat < 14.5) || (lon < 73.8 && lat < 12.5)) return "islands";
  if (lat > 32.5 && lon > 75.6) return "ladakh";
  if (lat > 32.3) return "kashmir";
  if (lat > 29.3 && lon > 75.8 && lon < 81.2 && lat > 29.3 + (lon - 75.8) * -0.05)
    return "himalaya";
  if (lat > 26.6 && lon > 85.5 && lon < 89.8 && lat > 26.6 + (88 - lon) * 0.05) return "himalaya";
  if (lon > 89.6 && lat > 21.8) return "northeast";
  if (lon < 75.2 && lat > 24 && lat < 30.5) return "thar";
  if (lat > 28 && lon < 77.8) return "northwest-plains";
  if (lat > 23.2 && lon >= 75.2) return "gangetic";
  if (lat > 21.6 && lon > 86.2) return "gangetic"; // Bengal delta
  if (coastDistanceKm(lat, lon) < 70 && lon < 77.6 && lat < 21.5) return "westcoast";
  if (lat < 14 && lon > 77.8) return "tamilnadu";
  if (coastDistanceKm(lat, lon) < 80 && lon > 79.5) return "eastcoast";
  if (lat < 15.5) return "south-interior";
  if (lat > 20.5) return "central";
  return "deccan";
}

export const REGION_LABEL: Record<Region, string> = {
  ladakh: "Trans-Himalayan cold desert",
  kashmir: "Western Himalaya / Kashmir valley",
  himalaya: "Himalayan hills",
  thar: "Thar desert / arid north-west",
  "northwest-plains": "North-western plains",
  gangetic: "Indo-Gangetic plain",
  northeast: "North-east hills & Brahmaputra valley",
  central: "Central Indian highlands",
  deccan: "Deccan plateau",
  westcoast: "West coast & Western Ghats",
  eastcoast: "East coast",
  tamilnadu: "Coromandel / Tamil Nadu",
  "south-interior": "Southern interior plateau",
  islands: "Island territory",
};

/** Elevation estimate (m) when the elevation service is unreachable. */
export function syntheticElevation(lat: number, lon: number): number {
  const r = regionOf(lat, lon);
  switch (r) {
    case "ladakh":
      return 3500;
    case "kashmir":
      return lat > 33.5 ? 1700 : 600;
    case "himalaya":
      return 1600;
    case "northeast":
      return lon > 91.2 && lat < 26.0 ? 1000 : 120;
    case "thar":
      return 230;
    case "northwest-plains":
      return 220;
    case "gangetic":
      return lon > 86 ? 30 : 120;
    case "central":
      return 480;
    case "deccan":
      return 560;
    case "south-interior":
      return 750;
    case "westcoast":
      return coastDistanceKm(lat, lon) < 25 ? 15 : 650;
    case "eastcoast":
      return 20;
    case "tamilnadu":
      return 80;
    case "islands":
      return 10;
  }
}
