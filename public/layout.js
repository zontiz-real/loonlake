// Where the roads and roadside places sit. Shared by the world builder (which keeps trees off them) and the maps.

// Route 61 runs north-south along the east edge of the play area
export const HIGHWAY = { x: 57, w: 8, z0: -74, z1: 74 };
// gravel road from the highway west to camp
export const CAMP_ROAD = { z: 43.5, x0: 13, x1: 57, w: 3.8 };
// Loon Gas & Go: the store faces east, pumps under the canopy, the lot opens onto the highway
export const GAS = {
  lot: { x0: 30.5, x1: 53, z0: 14, z1: 41 },
  store: { x: 36, z: 27, w: 6, d: 12, h: 3.6 },
  canopy: { x: 45, z: 27, w: 8.8, d: 10.8 },
  sign: { x: 50.8, z: 39.4 },
  pumps: [[43.4, 24.5], [46.6, 24.5], [43.4, 29.5], [46.6, 29.5]],
};
// footpath from camp around the west side of the lake to the towers
export const TRAIL = [[-22, 47], [-33, 45], [-43, 37], [-49, 24], [-51, 8], [-50, -10], [-47, -22]];
export const WATER_TOWER = { x: -46, z: -27 };
export const RADIO_TOWER = { x: -53, z: 26 };

const segDist = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
};

// true if (x, z) is on a road, the gas station lot, the trail or a tower, plus `pad` metres: nothing grows there
export function keepClear(x, z, pad = 0) {
  if (Math.abs(x - HIGHWAY.x) < HIGHWAY.w / 2 + 1.2 + pad && z > HIGHWAY.z0 && z < HIGHWAY.z1) return true;
  const c = CAMP_ROAD;
  if (x > c.x0 - 1 - pad && x < c.x1 && Math.abs(z - c.z) < c.w / 2 + 1.4 + pad) return true;
  const g = GAS.lot;
  if (x > g.x0 - pad && x < g.x1 + pad && z > g.z0 - pad && z < g.z1 + pad) return true;
  for (let i = 0; i < TRAIL.length - 1; i++) {
    if (segDist(x, z, TRAIL[i][0], TRAIL[i][1], TRAIL[i + 1][0], TRAIL[i + 1][1]) < 1.6 + pad) return true;
  }
  if (Math.hypot(x - WATER_TOWER.x, z - WATER_TOWER.z) < 7 + pad) return true;
  if (Math.hypot(x - RADIO_TOWER.x, z - RADIO_TOWER.z) < 7 + pad) return true;
  return false;
}
