precision highp float;

uniform float uTime;
uniform vec2  uResolution;
uniform vec2  uBoxPos;       // bounding box centre (normalized 0-1)
uniform float uBoxSize;      // box size (normalized)
uniform float uDisturbance;  // decays after movement spike

varying vec2 vUv;

// ─── Simplex-like noise helpers (GLSL) ────────────────────────

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0);
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute( permute( permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * 7.0 * (1.0 / 49.0));

  vec4 x_ = floor(j * 7.0);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

// ─── Palette ──────────────────────────────────────────────────
// Deep black, indigo violet, cyan, magenta, amber accent

vec3 palette(float t) {
  vec3 black  = vec3(0.02, 0.01, 0.04);
  vec3 indigo = vec3(0.20, 0.05, 0.35);
  vec3 cyan   = vec3(0.05, 0.70, 0.75);
  vec3 magenta= vec3(0.60, 0.10, 0.55);
  vec3 amber  = vec3(1.00, 0.60, 0.05);

  // Mix based on noise value
  vec3 col = mix(black, indigo, smoothstep(-0.3, 0.1, t));
  col = mix(col, cyan, smoothstep(0.1, 0.4, t));
  col = mix(col, magenta, smoothstep(0.4, 0.7, t));
  return col;
}

// ─── Box helpers ──────────────────────────────────────────────

float boxDistance(vec2 p, vec2 centre, vec2 size) {
  vec2 d = abs(p - centre) - size;
  return max(d.x, d.y);
}

vec2 boxClosestEdge(vec2 p, vec2 centre, vec2 size) {
  vec2 d = abs(p - centre) - size;
  return d;
}

// ─── RGB split / glitch ──────────────────────────────────────

vec2 glitchOffset(float intensity, float seed) {
  float angle = snoise(vec3(seed, 0.0, uTime * 2.0)) * 6.283;
  return vec2(cos(angle), sin(angle)) * intensity * 0.01;
}

// ─── Main ─────────────────────────────────────────────────────

void main() {
  vec2 aspect = uResolution / min(uResolution.x, uResolution.y);
  vec2 uv = (vUv - 0.5) * aspect;
  vec2 boxC = (uBoxPos - 0.5) * aspect;
  float boxS = uBoxSize * aspect.x;

  // ── Noise field (3 layers of simplex at different scales) ──
  float n1 = snoise(vec3(uv * 1.5, uTime * 0.08));
  float n2 = snoise(vec3(uv * 3.0 + 1.0, uTime * 0.12));
  float n3 = snoise(vec3(uv * 6.0 + 2.0, uTime * 0.18));

  float noiseVal = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;

  // ── Disturbance near box ──
  float dBox = boxDistance(uv, boxC, vec2(boxS * 0.5));
  float nearBox = 1.0 - smoothstep(0.0, 0.4, dBox);

  // Warp UVs near box (repulsion-like distortion)
  vec2 dirToBox = uv - boxC;
  float warp = nearBox * 0.15 * uDisturbance;
  vec2 warpedUv = uv + dirToBox * warp;
  float noiseWarped = snoise(vec3(warpedUv * 1.5, uTime * 0.08));

  // Blend warped noise near box
  float finalNoise = mix(noiseVal, noiseWarped, nearBox * 0.6);

  // ── Vertical scan lines (subtle) ──
  float scan = sin(uv.x * 200.0 + uTime * 0.5) * 0.03 + 0.97;

  // ── Base colour from palette ──
  vec3 colour = palette(finalNoise * 0.8 + 0.2) * scan;

  // ── Glitch / RGB split near disturbance ──
  float glitchIntensity = nearBox * uDisturbance * 0.6;
  glitchIntensity += (1.0 - smoothstep(0.0, 0.3, abs(finalNoise - 0.3))) * 0.2 * uDisturbance;

  if (glitchIntensity > 0.01) {
    vec2 rOff = glitchOffset(glitchIntensity, 3.7);
    vec2 bOff = glitchOffset(glitchIntensity, 7.1);
    vec2 gOff = glitchOffset(glitchIntensity, 5.3);

    vec3 r = palette(snoise(vec3(uv + rOff * 0.5, uTime * 0.08)) * 0.8 + 0.2);
    vec3 g = palette(snoise(vec3(uv + gOff * 0.5, uTime * 0.08)) * 0.8 + 0.2);
    vec3 b = palette(snoise(vec3(uv + bOff * 0.5, uTime * 0.08)) * 0.8 + 0.2);

    colour = vec3(r.r, g.g, b.b);
  }

  // ── Dim interior of tracked face region ──
  if (uBoxSize > 0.0) {
    vec2 hf = vec2(boxS * 0.5);
    vec2 rel = uv - boxC;
    vec2 edge = abs(rel) - hf;
    if (edge.x < 0.0 && edge.y < 0.0) colour *= 0.7;
  }

  // ── Subtle analog grain ──
  float grain = snoise(vec3(vUv * 500.0, uTime * 0.02)) * 0.04;
  colour += grain;

  // ── Vignette ──
  float vig = 1.0 - 0.4 * length((vUv - 0.5) * 1.2);
  colour *= vig;

  gl_FragColor = vec4(colour, 1.0);
}
