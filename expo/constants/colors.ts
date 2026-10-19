/**
 * anything.md theme — "ink & amber" editor aesthetic.
 * Dark is the signature look; light mirrors it for system-appearance mode.
 */
const accentDark = "#E8A33D";
const accentLight = "#B26A12";

export const darkTheme = {
  bg: "#0C0F14",
  bgElevated: "#12161D",
  card: "#161B23",
  cardPressed: "#1C222C",
  border: "#242C38",
  borderStrong: "#333D4D",
  text: "#EDEAE2",
  textSecondary: "#9AA3B2",
  textMuted: "#5D6675",
  accent: accentDark,
  accentSoft: "#2A2113",
  accentBorder: "#4A3A1B",
  onAccent: "#14100A",
  green: "#7BC47F",
  greenSoft: "#12251A",
  greenBorder: "#1E3A28",
  red: "#E06C5F",
  redSoft: "#2A1512",
  redBorder: "#4A2620",
  blue: "#6FA8DC",
  blueSoft: "#131E2A",
  purple: "#B08BD9",
  purpleSoft: "#1E1628",
  codeBg: "#0A0D11",
  codeText: "#C9D4E3",
  tabBar: "#0E1218",
  scrim: "rgba(8, 10, 14, 0.82)",
} as const;

export type Theme = { [K in keyof typeof darkTheme]: string };

export const lightTheme: Theme = {
  bg: "#F6F4EE",
  bgElevated: "#FFFFFF",
  card: "#FFFFFF",
  cardPressed: "#ECEAE2",
  border: "#E3DFD4",
  borderStrong: "#CEC9BB",
  text: "#1A1D23",
  textSecondary: "#5A6472",
  textMuted: "#8A93A2",
  accent: accentLight,
  accentSoft: "#FBF1DE",
  accentBorder: "#E9D3A5",
  onAccent: "#14100A",
  green: "#2E7D46",
  greenSoft: "#E4F2E7",
  greenBorder: "#BFE0C6",
  red: "#C43D2E",
  redSoft: "#FBE7E4",
  redBorder: "#F1C9C2",
  blue: "#2F6DB0",
  blueSoft: "#E5EEF8",
  purple: "#7A4FB0",
  purpleSoft: "#F0E9F8",
  codeBg: "#F0EEE6",
  codeText: "#3A4250",
  tabBar: "#FFFFFF",
  scrim: "rgba(8, 10, 14, 0.55)",
};

/** Default/static palette (dark). Prefer `useTheme()` in components. */
export const theme = darkTheme;

export default {
  light: {
    text: darkTheme.text,
    background: darkTheme.bg,
    tint: darkTheme.accent,
    tabIconDefault: darkTheme.textMuted,
    tabIconSelected: darkTheme.accent,
  },
};
