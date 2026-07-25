/**
 * IdleField — the unified WebGL layer for the REPOSO state.
 *
 * Renders:
 *   1. Animated simplex noise field (Perlin-like) with the project palette
 *   2. Wireframe face fragments (composited as sprite overlays)
 *   3. Text fragments (floating, variable blur)
 *   4. Bounding box with corner brackets, driven by face tracking data
 *   5. Repulsion / glitch effects near the box
 *
 * All in a single WebGL render pass via a custom ShaderMaterial.
 */

import * as THREE from 'three';

// ─── Uniforms ─────────────────────────────────────────────────
export type IdleUniforms = Record<string, THREE.IUniform>;

export function createUniforms(): IdleUniforms {
  return {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1080, 1920) },
    uBoxPos: { value: new THREE.Vector2(0.5, 0.5) },
    uBoxSize: { value: 0 },
    uDisturbance: { value: 0 },
  };
}

const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec2  uResolution;
uniform vec2  uBoxPos;
uniform float uBoxSize;
uniform float uDisturbance;

varying vec2 vUv;

// ─── Hash ─────────────────────────────────────────────────────
vec3 hash33(vec3 p) {
  float n = sin(dot(p, vec3(7.0, 157.0, 113.0)));
  return fract(vec3(2097152.0, 262144.0, 32768.0) * n);
}

// ─── 3D Voronoi ───────────────────────────────────────────────
float voronoi(vec3 p) {
  vec3 b, r, g = floor(p);
  p = fract(p);
  float d = 1.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      b = vec3(float(i), float(j), -1.0);
      r = b - p + hash33(g + b);
      d = min(d, dot(r, r));
      b.z = 0.0;
      r = b - p + hash33(g + b);
      d = min(d, dot(r, r));
      b.z = 1.0;
      r = b - p + hash33(g + b);
      d = min(d, dot(r, r));
    }
  }
  return d;
}

// ─── fBm with time dilation for parallax ─────────────────────
float noiseLayers(vec3 p) {
  vec3 t = vec3(0.0, 0.0, p.z + uTime * 0.4);
  const int iter = 5;
  float tot = 0.0, sum = 0.0, amp = 1.0;
  for (int i = 0; i < iter; i++) {
    tot += voronoi(p + t) * amp;
    p *= 2.0;
    t *= 1.5;
    sum += amp;
    amp *= 0.5;
  }
  return tot / sum;
}

// ─── Ethereal dark mirror — deep purple-black, sinister ─────
vec3 palette(float t) {
  vec3 black    = vec3(0.0, 0.0, 0.0);
  vec3 nearBlack= vec3(0.01, 0.01, 0.01);
  vec3 darkGray = vec3(0.02, 0.02, 0.02);
  vec3 dimGray  = vec3(0.04, 0.04, 0.04);
  vec3 midGray  = vec3(0.06, 0.06, 0.06);
  vec3 gray     = vec3(0.08, 0.08, 0.08);
  vec3 lightGray= vec3(0.10, 0.10, 0.10);
  vec3 paleGray = vec3(0.08, 0.08, 0.08);
  vec3 white    = vec3(0.12, 0.12, 0.12);
  vec3 abyss    = vec3(0.0, 0.0, 0.0);

  vec3 col = black;
  col = mix(col, nearBlack, smoothstep(-0.2, -0.05, t));
  col = mix(col, darkGray,  smoothstep(-0.05, 0.06, t));
  col = mix(col, dimGray,   smoothstep(0.06, 0.16, t));
  col = mix(col, midGray,   smoothstep(0.16, 0.28, t));
  col = mix(col, gray,      smoothstep(0.28, 0.40, t));
  col = mix(col, lightGray, smoothstep(0.40, 0.55, t));
  col = mix(col, paleGray,  smoothstep(0.55, 0.68, t));
  col = mix(col, white,     smoothstep(0.68, 0.82, t));
  col = mix(col, abyss,     smoothstep(0.82, 1.0, t));
  return col;
}

// ─── Warm/cool variation — both stay in purple family ────────
vec3 paletteWarm(float t) {
  vec3 col = palette(t);
  col.r *= 1.2;
  col.b *= 0.9;
  return col;
}

vec3 paletteCool(float t) {
  vec3 col = palette(t);
  col.r *= 0.7;
  col.b *= 1.3;
  return col;
}

// ─── Box helpers ──────────────────────────────────────────────
vec2 boxClosestEdge(vec2 p, vec2 centre, vec2 size) {
  return abs(p - centre) - size;
}

// ─── Main ─────────────────────────────────────────────────────
void main() {
  vec2 aspect = uResolution / min(uResolution.x, uResolution.y);
  vec2 uv = (vUv - 0.5) * aspect;

  // ── Camera drift — almost frozen, deep suspension ──
  uv += vec2(sin(uTime * 0.001) * 0.013, cos(uTime * 0.00085) * 0.01);

  // ── Construct ray direction ──
  vec3 rd = normalize(vec3(uv.x, uv.y, 3.14159 / 8.0));

  // ── Rotation so slow it's nearly imperceptible ──
  float cs = cos(uTime * 0.00065);
  float si = sin(uTime * 0.00065);
  rd.xy = rd.xy * mat2(cs, -si, si, cs);

  // ── Sample Voronoi noise field ──
  float c = noiseLayers(rd * 2.0);

  // ── Add subtle dust noise ──
  c = max(c + dot(hash33(rd) * 2.0 - 1.0, vec3(0.015)), 0.0);

  // ── Contrast — visible but subtle ──
  c = pow(c, 1.4) * 1.8;

  vec3 colour = palette(c);
  colour = pow(colour, vec3(0.9));
  colour *= 1.3; // brighter overall

  // ── Embedded particles / star specks ──
  vec3 starP = rd * 6.0 + vec3(0.0, 0.0, uTime * 0.075);
  float star = pow(max(0.0, voronoi(starP + 20.0) - 0.82) * 8.0, 2.5);
  colour += vec3(0.6, 0.6, 0.6) * star * 1.0;

  // ── Floating dust motes ──
  vec3 dustP = rd * 12.0 + vec3(uTime * 0.02, uTime * 0.015, uTime * 0.01);
  float dust = pow(max(0.0, voronoi(dustP) - 0.85) * 10.0, 2.0);
  colour += vec3(0.4, 0.4, 0.4) * dust * 0.6;

  // ── Strong depth gradient — darker above, lighter below ──
  float vertGrad = vUv.y;
  colour *= mix(0.3, 1.0, vertGrad);

  // ── Edge vignette — dark rim ──
  float edgeDist = length(uv) / length(aspect * 0.5);
  float vig = 1.0 - pow(edgeDist, 2.5) * 0.85;
  colour *= vig;

  // ── Light shafts / volumetric rays ──
  vec3 rayP = rd * 3.0 + vec3(0.0, uTime * 0.008, 0.0);
  float rays = voronoi(rayP + 50.0);
  float rayMask = smoothstep(0.25, 0.55, rays) * 0.12;
  colour += vec3(0.2, 0.2, 0.2) * rayMask;

  // ── Slow chromatic drift ──
  float drift = sin(uTime * 0.01 + c * 10.0) * 0.04;
  colour += vec3(drift * 0.5, 0.0, -drift * 0.5);

  // ── Depth fog — visible haze in the distance ──
  float fogDepth = length(rd);
  float fog = smoothstep(0.3, 1.5, fogDepth) * 0.25;
  colour += vec3(0.03, 0.008, 0.08) * fog;

  // ── Breathing glow — a slow pulse over the whole field ──
  float breathGlow = 0.5 + 0.5 * sin(uTime * 0.02);
  colour += vec3(0.02, 0.02, 0.02) * breathGlow * 0.5;

  // ── Box disturbance & corner brackets ──
  vec2 boxC = (uBoxPos - 0.5) * aspect;
  float boxS = uBoxSize * aspect.x;
  if (uBoxSize > 0.0) {
    vec2 dEdge = boxClosestEdge(uv, boxC, vec2(boxS * 0.5));
    float dBox = max(dEdge.x, dEdge.y);
    float nearBox = 1.0 - smoothstep(0.0, 0.4, dBox);

    // ── Corner brackets ──
    float bx = dEdge.x;
    float by = dEdge.y;
    float bracketLen = boxS * 0.15;
    float thick = 0.002;

    float bracket = 0.0;
    if (abs(by) < bracketLen && bx < 0.0 && abs(bx) < thick) bracket = 1.0;
    if (abs(bx) < bracketLen && by < 0.0 && abs(by) < thick) bracket = 1.0;
    if (abs(by) < bracketLen && bx > 0.0 && abs(bx) < thick) bracket = 1.0;
    if (abs(bx) < bracketLen && by < 0.0 && abs(by) < thick) bracket = 1.0;
    if (abs(by) < bracketLen && bx < 0.0 && abs(bx) < thick) bracket = 1.0;
    if (abs(bx) < bracketLen && by > 0.0 && abs(by) < thick) bracket = 1.0;
    if (abs(by) < bracketLen && bx > 0.0 && abs(bx) < thick) bracket = 1.0;
    if (abs(bx) < bracketLen && by > 0.0 && abs(by) < thick) bracket = 1.0;

    vec3 bracketCol = mix(vec3(0.0, 0.8, 0.8), vec3(0.55, 0.1, 0.55), step(0.5, sin(uTime * 0.5)));
    colour = mix(colour, bracketCol * 1.5, bracket * 0.8);
  }

  // ── Scan lines ──
  float scan = sin(vUv.x * 200.0 + uTime * 0.5) * 0.04 + 0.96;
  colour *= scan;

  // ── Grain ──
  float grain = hash33(vec3(vUv * 500.0, uTime * 0.02)).x * 0.03;
  colour += grain;

  // ── Vignette — crushes edges to black ──
  colour *= vig;

  gl_FragColor = vec4(colour, 1.0);
}
`;

export function createIdleFieldMesh(uniforms: IdleUniforms): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 0;
  return mesh;
}
