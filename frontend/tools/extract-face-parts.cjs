/**
 * Extract facial features from head2.glb as separate wireframe models.
 *
 * Each face part is extracted by spatial bounding box from the front-facing
 * triangles of the head mesh, then saved as an individual .glb file.
 *
 * Usage: node tools/extract-face-parts.js
 */

const fs = require('fs');
const path = require('path');

// ─── Parse GLB ───────────────────────────────────────────────
function parseGLB(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 12;
  let gltf = null;
  let binChunkOffset = 0;
  while (offset < buf.length) {
    const chunkLen = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const data = buf.slice(offset + 8, offset + 8 + chunkLen);
    if (chunkType === 0x4E4F534A) gltf = JSON.parse(data.toString());
    if (chunkType === 0x004E4942) { binChunkOffset = offset + 8; break; }
    offset += 8 + chunkLen;
  }
  return { buf, gltf, binChunkOffset };
}

const { buf, gltf, binChunkOffset } = parseGLB(
  path.join(__dirname, '..', 'public', 'models', 'head2.glb')
);

// Read vertex positions
const bvPos = gltf.bufferViews[0];
const posData = buf.slice(binChunkOffset + bvPos.byteOffset, binChunkOffset + bvPos.byteOffset + bvPos.byteLength);
const verts = [];
for (let i = 0; i < 11099; i++) {
  verts.push({
    x: posData.readFloatLE(i * 12),
    y: posData.readFloatLE(i * 12 + 4),
    z: posData.readFloatLE(i * 12 + 8),
  });
}

// Read normals
const bvNorm = gltf.bufferViews[1];
const normData = buf.slice(binChunkOffset + bvNorm.byteOffset, binChunkOffset + bvNorm.byteOffset + bvNorm.byteLength);
const norms = [];
for (let i = 0; i < 11099; i++) {
  norms.push({
    x: normData.readFloatLE(i * 12),
    y: normData.readFloatLE(i * 12 + 4),
    z: normData.readFloatLE(i * 12 + 8),
  });
}

// Read indices
const bvIdx = gltf.bufferViews[4];
const idxData = buf.slice(binChunkOffset + bvIdx.byteOffset, binChunkOffset + bvIdx.byteOffset + bvIdx.byteLength);
const indices = [];
for (let i = 0; i < 79875; i++) indices.push(idxData.readUInt16LE(i * 2));

// ─── Define facial feature regions ───────────────────────────
// Each region: { name, xMin, xMax, yMin, yMax, zMin?, zMax? }
// Coordinates based on spatial analysis of head2.glb
const REGIONS = [
  { name: 'left-eye',     xMin: -0.22, xMax: -0.06, yMin: 6.18, yMax: 6.35 },
  { name: 'right-eye',    xMin:  0.03, xMax:  0.18, yMin: 6.18, yMax: 6.35 },
  { name: 'nose',         xMin: -0.08, xMax:  0.08, yMin: 6.02, yMax: 6.28, zMin: 0.05 },
  { name: 'mouth',        xMin: -0.12, xMax:  0.10, yMin: 5.88, yMax: 6.05 },
  { name: 'jaw',          xMin: -0.28, xMax:  0.25, yMin: 5.72, yMax: 5.90 },
  { name: 'brow',         xMin: -0.22, xMax:  0.20, yMin: 6.30, yMax: 6.48 },
  { name: 'left-cheek',   xMin: -0.32, xMax: -0.15, yMin: 6.00, yMax: 6.20 },
  { name: 'right-cheek',  xMin:  0.10, xMax:  0.24, yMin: 6.00, yMax: 6.20 },
  { name: 'upper-face',   xMin: -0.30, xMax:  0.25, yMin: 6.15, yMax: 6.55 },
  { name: 'lower-face',   xMin: -0.30, xMax:  0.25, yMin: 5.70, yMax: 6.15 },
  { name: 'left-half',    xMin: -0.35, xMax: -0.02, yMin: 5.70, yMax: 6.55 },
  { name: 'right-half',   xMin:  0.02, xMax:  0.30, yMin: 5.70, yMax: 6.55 },
  // Panda mask — wider vertical coverage, trimmed at the sides
  { name: 'left-eye-panda',   xMin: -0.18, xMax: -0.02, yMin: 6.08, yMax: 6.42 },
  { name: 'right-eye-panda',  xMin:  0.02, xMax:  0.18, yMin: 6.08, yMax: 6.42 },
];

// ─── Extract triangles for each region ───────────────────────
function extractRegion(region) {
  const triVertIndices = []; // [i0, i1, i2, i0, i1, i2, ...]
  const usedVertSet = new Set();

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i], i1 = indices[i + 1], i2 = indices[i + 2];
    const v0 = verts[i0], v1 = verts[i1], v2 = verts[i2];
    if (!v0 || !v1 || !v2) continue;

    // Only front-facing triangles
    const nz = (v1.x - v0.x) * (v2.y - v0.y) - (v1.y - v0.y) * (v2.x - v0.x);
    if (nz <= 0) continue;

    const cx = (v0.x + v1.x + v2.x) / 3;
    const cy = (v0.y + v1.y + v2.y) / 3;
    const cz = (v0.z + v1.z + v2.z) / 3;

    if (cx < region.xMin || cx > region.xMax) continue;
    if (cy < region.yMin || cy > region.yMax) continue;
    if (region.zMin !== undefined && cz < region.zMin) continue;
    if (region.zMax !== undefined && cz > region.zMax) continue;

    triVertIndices.push(i0, i1, i2);
    usedVertSet.add(i0);
    usedVertSet.add(i1);
    usedVertSet.add(i2);
  }

  if (triVertIndices.length === 0) return null;

  // Build vertex remapping (compact local indices)
  const vertList = Array.from(usedVertSet);
  const oldToNew = new Map();
  vertList.forEach((old, idx) => oldToNew.set(old, idx));

  // Local position buffer
  const localPos = Buffer.alloc(vertList.length * 12);
  const localNorm = Buffer.alloc(vertList.length * 12);
  for (let i = 0; i < vertList.length; i++) {
    const old = vertList[i];
    localPos.writeFloatLE(verts[old].x, i * 12);
    localPos.writeFloatLE(verts[old].y, i * 12 + 4);
    localPos.writeFloatLE(verts[old].z, i * 12 + 8);
    localNorm.writeFloatLE(norms[old].x, i * 12);
    localNorm.writeFloatLE(norms[old].y, i * 12 + 4);
    localNorm.writeFloatLE(norms[old].z, i * 12 + 8);
  }

  // Local index buffer
  const localIdx = Buffer.alloc(triVertIndices.length * 2);
  for (let i = 0; i < triVertIndices.length; i++) {
    localIdx.writeUInt16LE(oldToNew.get(triVertIndices[i]), i * 2);
  }

  // Compute bounding box for centering
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < vertList.length; i++) {
    const v = verts[vertList[i]];
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;

  // Recenter geometry
  for (let i = 0; i < vertList.length; i++) {
    localPos.writeFloatLE(verts[vertList[i]].x - centerX, i * 12);
    localPos.writeFloatLE(verts[vertList[i]].y - centerY, i * 12 + 4);
    localPos.writeFloatLE(verts[vertList[i]].z - centerZ, i * 12 + 8);
  }

  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;

  return {
    name: region.name,
    vertexCount: vertList.length,
    triangleCount: triVertIndices.length / 3,
    size: `(${sizeX.toFixed(3)}, ${sizeY.toFixed(3)}, ${sizeZ.toFixed(3)})`,
    center: `(${centerX.toFixed(3)}, ${centerY.toFixed(3)}, ${centerZ.toFixed(3)})`,
    localPos,
    localNorm,
    localIdx,
    idxCount: triVertIndices.length,
  };
}

// ─── Build GLB file ──────────────────────────────────────────
function buildGLB(extracted) {
  const { localPos, localNorm, localIdx, vertexCount, idxCount } = extracted;

  // Stride = 12 bytes for each attribute
  const posSize = vertexCount * 12;
  const normSize = vertexCount * 12;
  const idxSize = idxCount * 2;

  // Align to 4 bytes
  const binSize = posSize + normSize + idxSize;

  // Buffer views
  const bufferViews = [
    { buffer: 0, byteOffset: 0, byteLength: posSize, target: 34962 },  // POSITION
    { buffer: 0, byteOffset: posSize, byteLength: normSize, target: 34962 }, // NORMAL
    { buffer: 0, byteOffset: posSize + normSize, byteLength: idxSize, target: 34963 }, // INDICES
  ];

  // Accessors
  const accessors = [
    { bufferView: 0, byteOffset: 0, componentType: 5126, count: vertexCount, type: 'VEC3', min: [-Infinity, -Infinity, -Infinity], max: [Infinity, Infinity, Infinity] },
    { bufferView: 1, byteOffset: 0, componentType: 5126, count: vertexCount, type: 'VEC3' },
    { bufferView: 2, byteOffset: 0, componentType: 5123, count: idxCount, type: 'SCALAR' },
  ];

  // Compute actual min/max from position data
  let minP = [Infinity, Infinity, Infinity], maxP = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertexCount; i++) {
    const x = localPos.readFloatLE(i * 12);
    const y = localPos.readFloatLE(i * 12 + 4);
    const z = localPos.readFloatLE(i * 12 + 8);
    if (x < minP[0]) minP[0] = x;
    if (y < minP[1]) minP[1] = y;
    if (z < minP[2]) minP[2] = z;
    if (x > maxP[0]) maxP[0] = x;
    if (y > maxP[1]) maxP[1] = y;
    if (z > maxP[2]) maxP[2] = z;
  }
  accessors[0].min = minP;
  accessors[0].max = maxP;

  // GLTF JSON
  const gltfJSON = {
    asset: { version: '2.0', generator: 'espejo-extract' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: 2,
      }],
    }],
    bufferViews,
    accessors,
    buffers: [{ byteLength: binSize }],
  };

  // Binary buffer
  const binBuf = Buffer.alloc(binSize);
  localPos.copy(binBuf, 0);
  localNorm.copy(binBuf, posSize);
  localIdx.copy(binBuf, posSize + normSize);

  // Build final GLB
  const jsonStr = JSON.stringify(gltfJSON);
  const jsonPad = (4 - (jsonStr.length % 4)) % 4;
  const jsonBuf = Buffer.alloc(jsonStr.length + jsonPad);
  jsonBuf.write(jsonStr);
  jsonBuf.fill(0x20, jsonStr.length); // space padding

  const glbSize = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const glb = Buffer.alloc(glbSize);

  let off = 0;
  // Header
  glb.writeUInt32LE(0x46546C67, off); off += 4; // magic 'glTF'
  glb.writeUInt32LE(2, off); off += 4; // version
  glb.writeUInt32LE(glbSize, off); off += 4; // total length

  // JSON chunk
  glb.writeUInt32LE(jsonBuf.length, off); off += 4;
  glb.writeUInt32LE(0x4E4F534A, off); off += 4;
  jsonBuf.copy(glb, off); off += jsonBuf.length;

  // BIN chunk
  glb.writeUInt32LE(binBuf.length, off); off += 4;
  glb.writeUInt32LE(0x004E4942, off); off += 4;
  binBuf.copy(glb, off);

  return glb;
}

// ─── Main ────────────────────────────────────────────────────
console.log('=== Extracting face parts from head2.glb ===\n');

const outputDir = path.join(__dirname, '..', 'public', 'models', 'face-parts');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

for (const region of REGIONS) {
  const extracted = extractRegion(region);
  if (!extracted) {
    console.log(`✗ ${region.name}: no triangles found`);
    continue;
  }

  console.log(`✓ ${region.name}: ${extracted.triangleCount} tris, ${extracted.vertexCount} verts, size=${extracted.size}`);

  const glbBuf = buildGLB(extracted);
  const outPath = path.join(outputDir, `${region.name}.glb`);
  fs.writeFileSync(outPath, glbBuf);
  console.log(`  → saved to face-parts/${region.name}.glb (${(glbBuf.length / 1024).toFixed(1)} KB)`);
}

console.log('\nDone!');
