/* vr-room/layout-store.js
 *
 * Pure data layer for the VR room layout system. No three.js, no DOM, no
 * Firebase imports — importable by the 3D room page, the future 2D top-down
 * editor, and plain node tests.
 *
 * The room is a grid of cubes (0.5 m). Every placed item owns a set of cubes;
 * two items may share a column of floor cells but never the same cube.
 * ("Share a column, never the same cube.")
 */

export const CELL = 0.5;                 // meters per cube edge
export const ROOM_CELLS = { x: 28, y: 8, z: 20 }; // 14 m x 4 m x 10 m room
export const ROT_SNAP_DEG = 45;          // build-mode rotation increment
export const SCHEMA_VERSION = 1;
export const UNDO_DEPTH = 25;
export const PLAYER_RADIUS_M = 0.3;      // capsule radius for locomotion
export const PLAYER_HEIGHT_CELLS = 4;    // cubes the standing avatar occupies

/* ------------------------------------------------------------------ */
/* coordinates: cell <-> world (meters, room centered on origin)       */
/* ------------------------------------------------------------------ */

export function cellToWorld(cell) {
  return {
    x: (cell.x + 0.5) * CELL - (ROOM_CELLS.x * CELL) / 2,
    y: cell.y * CELL,
    z: (cell.z + 0.5) * CELL - (ROOM_CELLS.z * CELL) / 2,
  };
}

export function worldToCell(p) {
  const cx = Math.floor(p.x / CELL + ROOM_CELLS.x / 2);
  const cz = Math.floor(p.z / CELL + ROOM_CELLS.z / 2);
  return {
    x: Math.max(0, Math.min(ROOM_CELLS.x - 1, cx)),
    y: Math.max(0, Math.min(ROOM_CELLS.y - 1, Math.floor(p.y / CELL))),
    z: Math.max(0, Math.min(ROOM_CELLS.z - 1, cz)),
  };
}

/* ------------------------------------------------------------------ */
/* item registry: every placeable thing declares its volume in cubes   */
/* ------------------------------------------------------------------ */
// footprint: cubes on the floor (x by z) at rotY = 0
// heightCells: cubes of vertical extent above cell.y
// surfaceY: visual top surface in meters (for attachments: where children sit)
// wall: for wall-mounted items, which wall orients them

export const WALLS = {
  back:  { fixed: 'z', fixedCell: 0, yawDeg: 0 },
  front: { fixed: 'z', fixedCell: ROOM_CELLS.z - 1, yawDeg: 180 },
  left:  { fixed: 'x', fixedCell: 0, yawDeg: 90 },
  right: { fixed: 'x', fixedCell: ROOM_CELLS.x - 1, yawDeg: -90 },
};

export const ITEMS = {
  // Pedestal pieces get the idle turntable (0.45 rad/s, pauses while grabbed)
  // unless the item sets `turntable: false` — for pieces meant to stay still.
  'pedestal-beacon': {
    kind: 'pedestal', label: 'Beacon', plaque: 'Beacon',
    asset: 'vr-assets/beacon.glb', assetKind: 'glb',
    footprint: { x: 2, z: 2 }, heightCells: 4, surfaceY: 1.0,
    modelHeight: 0.85, modelYawDeg: 0,
  },
  'pedestal-corgi': {
    kind: 'pedestal', label: 'Corgi', plaque: 'Corgi',
    asset: 'vr-assets/corgi.glb', assetKind: 'glb',
    footprint: { x: 2, z: 2 }, heightCells: 3, surfaceY: 1.0,
    modelHeight: 0.5, modelYawDeg: 0,
  },
  'pedestal-woman': {
    kind: 'pedestal', label: 'Woman', plaque: 'Woman',
    asset: 'vr-assets/woman.glb', assetKind: 'glb',
    footprint: { x: 2, z: 2 }, heightCells: 5, surfaceY: 1.0,
    modelHeight: 1.05, modelYawDeg: 180,
  },
  'pedestal-firstdraft': {
    kind: 'pedestal', label: 'First Draft', plaque: 'First Draft',
    asset: 'vr-assets/firstdraft.glb', assetKind: 'glb',
    footprint: { x: 2, z: 2 }, heightCells: 4, surfaceY: 1.0,
    modelHeight: 0.7, modelYawDeg: 0,
  },
  'cat-table': {
    kind: 'glb', label: 'Cat table', plaque: 'the cat — please pet',
    asset: null, assetKind: 'procedural', // built in code: wooden table
    footprint: { x: 3, z: 2 }, heightCells: 2, surfaceY: 0.755,
  },
  'cat': {
    kind: 'cat', label: 'The cat',
    asset: null, assetKind: 'procedural', // built in code: sleeping orange cat
    footprint: { x: 1, z: 1 }, heightCells: 1,
    attach: 'cat-table', // sits on the table's surface
    interactions: [{ type: 'pet' }],
  },
  'sofa': {
    kind: 'glb', label: 'Emerald sofa',
    asset: 'vr-assets/sofa.glb', assetKind: 'glb',
    footprint: { x: 4, z: 2 }, heightCells: 2, surfaceY: 0.45,
    modelScale: 0.33,
    interactions: [{ type: 'sit', eyeHeight: 1.15 }],
  },
  'print-nightdesk': {
    kind: 'glb', label: 'Night Desk', plaque: 'Night Desk',
    asset: 'vr-assets/nightdesk.jpg', assetKind: 'print',
    wall: 'back', footprint: { x: 3, z: 1 }, heightCells: 2,
    printSize: { w: 1.5, h: 1.0 },
  },
  'print-eyesclosed': {
    kind: 'glb', label: 'Eyes Closed', plaque: 'Eyes Closed',
    asset: 'vr-assets/eyesclosed.jpg', assetKind: 'print',
    wall: 'back', footprint: { x: 3, z: 1 }, heightCells: 3,
    printSize: { w: 1.1, h: 1.4 },
  },
  'wall-murmuration': {
    kind: 'glb', label: 'Murmuration (self-portrait)', plaque: 'Murmuration (self-portrait) — Jessika, 2026',
    asset: 'vr-assets/murmuration.html', assetKind: 'html',
    wall: 'back', footprint: { x: 4, z: 1 }, heightCells: 3,
    printSize: { w: 2.0, h: 1.25 },
  },
};

/* ------------------------------------------------------------------ */
/* occupancy: which cubes each placement owns                          */
/* ------------------------------------------------------------------ */

// Axis-aligned footprint (in cells) of a w-by-d rectangle rotated by rotY.
export function rotatedFootprint(fx, fz, rotYDeg) {
  const r = (rotYDeg * Math.PI) / 180;
  const w = fx * CELL, d = fz * CELL;
  const aw = Math.abs(w * Math.cos(r)) + Math.abs(d * Math.sin(r));
  const ad = Math.abs(w * Math.sin(r)) + Math.abs(d * Math.cos(r));
  return {
    x: Math.max(1, Math.ceil(aw / CELL - 1e-6)),
    z: Math.max(1, Math.ceil(ad / CELL - 1e-6)),
  };
}

// placement.cell is the MINIMUM-corner cube of the (rotated) footprint.
export function occupiedCubes(itemId, placement) {
  const item = ITEMS[itemId];
  if (!item) return [];
  const fp = rotatedFootprint(item.footprint.x, item.footprint.z, placement.rotY || 0);
  const cubes = [];
  for (let dx = 0; dx < fp.x; dx++)
    for (let dz = 0; dz < fp.z; dz++)
      for (let dy = 0; dy < item.heightCells; dy++)
        cubes.push([placement.cell.x + dx, placement.cell.y + dy, placement.cell.z + dz]);
  return cubes;
}

export const cubeKey = (cx, cy, cz) => cx + ',' + cy + ',' + cz;

// World position (meters) of a placement's footprint center. The renderer
// puts the item's group here; cell stays the canonical stored form.
export function footprintCenterWorld(itemId, placement) {
  const item = ITEMS[itemId];
  const fp = rotatedFootprint(item.footprint.x, item.footprint.z, placement.rotY || 0);
  return {
    x: (placement.cell.x + fp.x / 2) * CELL - (ROOM_CELLS.x * CELL) / 2,
    y: placement.cell.y * CELL,
    z: (placement.cell.z + fp.z / 2) * CELL - (ROOM_CELLS.z * CELL) / 2,
  };
}

export function inBounds(cx, cy, cz) {
  return cx >= 0 && cy >= 0 && cz >= 0 &&
         cx < ROOM_CELLS.x && cy < ROOM_CELLS.y && cz < ROOM_CELLS.z;
}

// The full occupancy map: cube key -> placement id. Children move with their
// parent, so validation treats a parent+children as one moving unit.
export function buildOccupancy(placements) {
  const occ = new Map();
  for (const [id, p] of placements) {
    for (const [cx, cy, cz] of occupiedCubes(p.item, p)) {
      if (inBounds(cx, cy, cz)) occ.set(cubeKey(cx, cy, cz), id);
    }
  }
  return occ;
}

function movingUnitIds(placements, id) {
  const ids = new Set([id]);
  for (const [pid, p] of placements) if (p.parent === id) ids.add(pid);
  return ids;
}

// Where every member of a parent+children unit lands after the parent moves
// to newCell / newRotY. Children translate with the parent and rotate around
// the parent's center, so attachments (cat on table) never get left behind.
function unitTransforms(placements, id, newCell, newRotY) {
  const moving = placements.get(id);
  const out = new Map();
  const dRot = (newRotY || 0) - (moving.rotY || 0);
  const pItem = ITEMS[moving.item];
  const pFpBefore = rotatedFootprint(pItem.footprint.x, pItem.footprint.z, moving.rotY || 0);
  const pFpAfter = rotatedFootprint(pItem.footprint.x, pItem.footprint.z, newRotY || 0);
  const pcBefore = { x: moving.cell.x + pFpBefore.x / 2, z: moving.cell.z + pFpBefore.z / 2 };
  const pcAfter = { x: newCell.x + pFpAfter.x / 2, z: newCell.z + pFpAfter.z / 2 };
  const rad = (dRot * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  out.set(id, { cell: { ...newCell }, rotY: newRotY || 0 });
  for (const [mid, mp] of placements) {
    if (mp.parent !== id) continue;
    const cItem = ITEMS[mp.item];
    const cFpBefore = rotatedFootprint(cItem.footprint.x, cItem.footprint.z, mp.rotY || 0);
    const cFpAfter = rotatedFootprint(cItem.footprint.x, cItem.footprint.z, (mp.rotY || 0) + dRot);
    const ccBefore = {
      x: mp.cell.x + cFpBefore.x / 2,
      z: mp.cell.z + cFpBefore.z / 2,
    };
    const ox = ccBefore.x - pcBefore.x, oz = ccBefore.z - pcBefore.z;
    const ccAfter = { x: pcAfter.x + ox * cos - oz * sin, z: pcAfter.z + ox * sin + oz * cos };
    out.set(mid, {
      cell: {
        x: Math.round(ccAfter.x - cFpAfter.x / 2),
        y: mp.cell.y + (newCell.y - moving.cell.y),
        z: Math.round(ccAfter.z - cFpAfter.z / 2),
      },
      rotY: (mp.rotY || 0) + dRot,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* validation: the shared save path rejects overlapping cubes         */
/* ------------------------------------------------------------------ */

export function validateMove(placements, id, newCell, newRotY) {
  const moving = placements.get(id);
  if (!moving) return { ok: false, reason: 'unknown item' };
  const item = ITEMS[moving.item];
  const unit = movingUnitIds(placements, id);
  // occupancy of everything NOT moving
  const occ = new Map();
  for (const [pid, p] of placements) {
    if (unit.has(pid)) continue;
    for (const [cx, cy, cz] of occupiedCubes(p.item, p)) {
      if (inBounds(cx, cy, cz)) occ.set(cubeKey(cx, cy, cz), pid);
    }
  }
  // where would the unit land?
  const transforms = unitTransforms(placements, id, newCell, newRotY);
  for (const [mid, t] of transforms) {
    const mp = placements.get(mid);
    const mItem = ITEMS[mp.item];
    const tryCell = { ...t.cell };
    // wall items stay glued to their wall's cube row
    if (mItem.wall) tryCell[WALLS[mItem.wall].fixed] = WALLS[mItem.wall].fixedCell;
    for (const [cx, cy, cz] of occupiedCubes(mp.item, { ...mp, cell: tryCell, rotY: t.rotY })) {
      if (!inBounds(cx, cy, cz)) return { ok: false, reason: 'outside the room' };
      const other = occ.get(cubeKey(cx, cy, cz));
      if (other !== undefined) {
        const otherLabel = ITEMS[placements.get(other).item]?.label || other;
        return { ok: false, reason: 'overlaps ' + otherLabel };
      }
    }
  }
  return { ok: true };
}

// Snap an arbitrary rotation to the build-mode increment.
export function snapRotY(deg) {
  return Math.round(deg / ROT_SNAP_DEG) * ROT_SNAP_DEG;
}

/* ------------------------------------------------------------------ */
/* seed: the current room, snapped to the grid (one-time migration)    */
/* ------------------------------------------------------------------ */

function seedCell(worldX, worldZ, fpX, fpZ, rotY = 0) {
  const fp = rotatedFootprint(fpX, fpZ, rotY);
  return {
    x: Math.round(worldX / CELL + ROOM_CELLS.x / 2 - fp.x / 2),
    y: 0,
    z: Math.round(worldZ / CELL + ROOM_CELLS.z / 2 - fp.z / 2),
  };
}

export function seedLayout() {
  const P = (item, cell, rotY, extra = {}) => ({
    item, cell, rotY, version: SCHEMA_VERSION, ...extra,
  });
  const placements = new Map();
  placements.set('pedestal-beacon',     P('pedestal-beacon',     seedCell(-4.5, -1, 2, 2), 0));
  placements.set('pedestal-corgi',      P('pedestal-corgi',      seedCell(-1.5, -1, 2, 2), 0));
  placements.set('pedestal-woman',      P('pedestal-woman',      seedCell(1.5, -1, 2, 2), 0));
  placements.set('pedestal-firstdraft', P('pedestal-firstdraft', seedCell(4.5, -1, 2, 2), 0));
  placements.set('cat-table',           P('cat-table',           seedCell(3.8, 3.0, 3, 2, -26), -26));
  // the cat rides on the table: same column, cubes above the table top
  const tableCell = placements.get('cat-table').cell;
  placements.set('cat', P('cat', { x: tableCell.x + 1, y: 2, z: tableCell.z }, -29,
    { parent: 'cat-table' }));
  placements.set('sofa', P('sofa', seedCell(-4, 3.9, 4, 2), 180)); // clear of the spawn at (0, 4.2)
  // wall prints live in the wall-adjacent cube row
  placements.set('print-nightdesk',
    P('print-nightdesk', { x: 7, y: 3, z: 0 }, 0, { wall: 'back' }));
  placements.set('print-eyesclosed',
    P('print-eyesclosed', { x: 18, y: 3, z: 0 }, 0, { wall: 'back' }));
  placements.set('wall-murmuration',
    P('wall-murmuration', { x: 12, y: 3, z: 0 }, 0, { wall: 'back' }));
  return placements;
}

/* ------------------------------------------------------------------ */
/* LayoutStore: subscribe / optimistic save / undo, backend-agnostic   */
/* ------------------------------------------------------------------ */
// backend = {
//   load(roomId)      -> Promise<Map<id, doc> | null>  (null = unreachable)
//   subscribe(roomId, cb: Map -> void) -> unsubscribe | null
//   save(roomId, docs: Array<{id, ...fields}>) -> Promise<void>
// }

export class LayoutStore {
  constructor(backend, roomId) {
    this.backend = backend;
    this.roomId = roomId;
    this.placements = new Map();
    this.mode = 'loading'; // loading | live | seed-pending | offline
    this.undoStack = [];
    this.listeners = new Set();
    this._unsub = null;
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) fn(this.placements, this.mode); }

  async start() {
    let remote = null;
    try {
      remote = await this.backend.load(this.roomId);
    } catch (e) {
      console.warn('[layout] backend unreachable, using seed:', e?.message);
    }
    if (remote === null) {
      this.placements = seedLayout();
      this.mode = 'offline';
    } else if (remote.size === 0) {
      this.placements = seedLayout();
      this.mode = 'seed-pending'; // admin can publish the seed to Firestore
    } else {
      this.placements = remote;
      this.mode = 'live';
    }
    try {
      const unsub = this.backend.subscribe(this.roomId, (m) => {
        if (m && m.size > 0) {
          this.placements = m;
          this.mode = 'live';
          this._emit();
        }
      });
      this._unsub = unsub || null;
    } catch (e) {
      console.warn('[layout] subscribe failed:', e?.message);
    }
    this._emit();
    return this.mode;
  }

  stop() { if (this._unsub) this._unsub(); }

  getOccupancy() { return buildOccupancy(this.placements); }

  // The single writer path. Validates, pushes undo, applies optimistically,
  // then persists. Children ride along with their parent.
  async movePlacement(id, newCell, newRotY) {
    const moving = this.placements.get(id);
    if (!moving) return { ok: false, reason: 'unknown item' };
    const v = validateMove(this.placements, id, newCell, newRotY);
    if (!v.ok) return v;
    const unit = movingUnitIds(this.placements, id);
    const transforms = unitTransforms(this.placements, id, newCell, newRotY);
    const prevDocs = [];
    const nextDocs = [];
    for (const mid of unit) {
      const mp = this.placements.get(mid);
      prevDocs.push({ id: mid, doc: { ...mp, cell: { ...mp.cell } } });
      const t = transforms.get(mid);
      const nc = { ...t.cell };
      const item = ITEMS[mp.item];
      if (item.wall) nc[WALLS[item.wall].fixed] = WALLS[item.wall].fixedCell;
      const nd = { ...mp, cell: nc, rotY: t.rotY };
      this.placements.set(mid, nd);
      nextDocs.push({ id: mid, ...nd });
    }
    this.undoStack.push(prevDocs);
    if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
    this._emit();
    if (this.mode === 'live' || this.mode === 'seed-pending') {
      try { await this.backend.save(this.roomId, nextDocs); }
      catch (e) { console.warn('[layout] save failed:', e?.message); }
    }
    return { ok: true };
  }

  async rotatePlacement(id, dirDeg) {
    const p = this.placements.get(id);
    if (!p) return { ok: false, reason: 'unknown item' };
    const item = ITEMS[p.item];
    if (item.wall) return { ok: false, reason: 'wall pieces stay on their wall' };
    // keep the visual center stable while the footprint changes
    const before = rotatedFootprint(item.footprint.x, item.footprint.z, p.rotY || 0);
    const newRot = snapRotY((p.rotY || 0) + dirDeg);
    const after = rotatedFootprint(item.footprint.x, item.footprint.z, newRot);
    const nc = {
      x: p.cell.x + Math.round((before.x - after.x) / 2),
      y: p.cell.y,
      z: p.cell.z + Math.round((before.z - after.z) / 2),
    };
    return this.movePlacement(id, nc, newRot);
  }

  async undo() {
    const prevDocs = this.undoStack.pop();
    if (!prevDocs) return { ok: false, reason: 'nothing to undo' };
    const nextDocs = [];
    for (const { id, doc } of prevDocs) {
      this.placements.set(id, doc);
      nextDocs.push({ id, ...doc });
    }
    this._emit();
    if (this.mode === 'live' || this.mode === 'seed-pending') {
      try { await this.backend.save(this.roomId, nextDocs); }
      catch (e) { console.warn('[layout] undo save failed:', e?.message); }
    }
    return { ok: true };
  }

  // One-time migration: push the baked-in seed into Firestore.
  async publishSeed() {
    if (!this.backend) return { ok: false, reason: 'no backend' };
    try {
      const docs = [];
      for (const [id, p] of seedLayout()) docs.push({ id, ...p });
      await this.backend.save(this.roomId, docs);
      this.mode = 'live';
      this._emit();
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e?.message || 'save failed' };
    }
  }

  undoDepth() { return this.undoStack.length; }

  childOf(id) {
    const kids = [];
    for (const [pid, p] of this.placements) if (p.parent === id) kids.push(pid);
    return kids;
  }
}
