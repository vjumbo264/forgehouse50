import assert from 'assert';

function getLuminance(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  const a = [r, g, b].map(v => {
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrast(hex1, hex2) {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

console.log("=== Testing Item 3: Navigation & Surface Contrast Checks ===");

const checks = [
  // Nav selected pill
  { name: "Light Nav Selected Label & Icon (#FFFFFF on #2E6B4F)", fg: "#FFFFFF", bg: "#2E6B4F", min: 4.5 },
  { name: "Dark Nav Selected Label & Icon (#003820 on #8CD8AC)", fg: "#003820", bg: "#8CD8AC", min: 4.5 },

  // Nav unselected icon
  { name: "Light Nav Unselected Icon (#414942 on #E6EFE9)", fg: "#414942", bg: "#E6EFE9", min: 4.5 },
  { name: "Dark Nav Unselected Icon (#C1C9C0 on #192420)", fg: "#C1C9C0", bg: "#192420", min: 4.5 },

  // Desktop Header Nav
  { name: "Light Desktop Nav Selected (#2E6B4F on #D3EEDF)", fg: "#2E6B4F", bg: "#D3EEDF", min: 4.5 },
  { name: "Dark Desktop Nav Selected (#8CD8AC on #145235)", fg: "#8CD8AC", bg: "#145235", min: 4.5 },

  // Main Surfaces
  { name: "Light Card Text Primary (#191C1A on #FFFFFF)", fg: "#191C1A", bg: "#FFFFFF", min: 4.5 },
  { name: "Light Card Text Secondary (#414942 on #FFFFFF)", fg: "#414942", bg: "#FFFFFF", min: 4.5 },
  { name: "Dark Card Text Primary (#E1E3DF on #191C1A)", fg: "#E1E3DF", bg: "#191C1A", min: 4.5 },
  { name: "Dark Card Text Secondary (#C1C9C0 on #191C1A)", fg: "#C1C9C0", bg: "#191C1A", min: 4.5 },

  // Primary Action Buttons
  { name: "Light Primary Button (#FFFFFF on #2E6B4F)", fg: "#FFFFFF", bg: "#2E6B4F", min: 4.5 },
  { name: "Dark Primary Button (#003820 on #8CD8AC)", fg: "#003820", bg: "#8CD8AC", min: 4.5 },

  // Category & Podium Chips
  { name: "Light Gold Badge (#785D15 on #F6ECD2)", fg: "#785D15", bg: "#F6ECD2", min: 4.5 },
  { name: "Dark Gold Badge (#EBBF8A on #3A3016)", fg: "#EBBF8A", bg: "#3A3016", min: 4.5 },
  { name: "Light Silver Badge (#5F6B76 on #E8ECEF)", fg: "#5F6B76", bg: "#E8ECEF", min: 4.5 },
  { name: "Dark Silver Badge (#E8ECEF on #2C3238)", fg: "#E8ECEF", bg: "#2C3238", min: 4.5 }
];

for (const c of checks) {
  const ratio = getContrast(c.fg, c.bg);
  console.log(`- ${c.name}: ratio = ${ratio.toFixed(2)}:1 (required >= ${c.min}:1)`);
  assert(ratio >= c.min, `Contrast failure: ${c.name} ratio ${ratio.toFixed(2)} is under ${c.min}`);
}

console.log("\nALL CONTRAST CHECKS PASSED (>= 4.5:1)!");
