/**
 * SphereShader — crystal ball shader with Voronoi noise + Fresnel edge glow.
 *
 * Renders a semi-transparent sphere containing a dark latent space.
 * The Fresnel effect creates a glowing edge that reveals the sphere's volume.
 */

import * as THREE from 'three';

export type SphereUniforms = Record<string, THREE.IUniform>;

export function createSphereUniforms(): SphereUniforms {
  return {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1080, 1920) },
  };
}

const vertexShader = `
varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  vUv = uv;
  vPosition = position;
  vNormal = normalize(normalMatrix * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vWorldPos;

// ─── Hash ─────────────────────────────────────────────────────
vec3 hash33(vec3 p) {
  p = fract(p * vec3(443.8975, 397.2973, 491.1871));
  p += dot(p.zxy, vec3(19.27 + 19.0));
  return fract(vec3(p.x * p.z, p.y * p.x, p.z * p.y));
}

// ─── 3D Voronoi ──────────────────────────────────────────────
float voronoi(vec3 p) {
  vec3 n = floor(p);
  vec3 f = fract(p);
  float md = 8.0;
  for (int k = -1; k <= 1; k++) {
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec3 g = vec3(float(i), float(j), float(k));
        vec3 o = hash33(n + g);
        vec3 r = g + o - f;
        float d = dot(r, r);
        if (d < md) md = d;
      }
    }
  }
  return sqrt(md);
}

// ─── fBm ──────────────────────────────────────────────────────
float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.6;
  float frequency = 1.0;
  for (int i = 0; i < 4; i++) {
    value += amplitude * voronoi(p * frequency);
    frequency *= 2.1;
    amplitude *= 0.5;
  }
  return value;
}

// ─── Palette ──────────────────────────────────────────────────
vec3 palette(float t) {
  // Purple-black gradient
  vec3 c1 = vec3(0.01, 0.005, 0.03);  // near black
  vec3 c2 = vec3(0.05, 0.02, 0.08);   // deep purple-black
  vec3 c3 = vec3(0.12, 0.04, 0.18);   // dark purple
  vec3 c4 = vec3(0.06, 0.03, 0.10);   // very dark
  vec3 c5 = vec3(0.20, 0.06, 0.28);   // muted purple
  vec3 c6 = vec3(0.08, 0.05, 0.12);   // dark
  vec3 c7 = vec3(0.15, 0.05, 0.22);   // medium purple
  vec3 c8 = vec3(0.04, 0.02, 0.06);   // darkest
  vec3 c9 = vec3(0.10, 0.04, 0.15);   // shadow
  vec3 c10 = vec3(0.25, 0.08, 0.20);  // pale violet

  float s = sin(t * 3.14159);
  vec3 col = c1;
  if (t < 0.1) col = mix(c1, c2, t / 0.1);
  else if (t < 0.2) col = mix(c2, c3, (t - 0.1) / 0.1);
  else if (t < 0.3) col = mix(c3, c4, (t - 0.2) / 0.1);
  else if (t < 0.4) col = mix(c4, c5, (t - 0.3) / 0.1);
  else if (t < 0.5) col = mix(c5, c6, (t - 0.4) / 0.1);
  else if (t < 0.6) col = mix(c6, c7, (t - 0.5) / 0.1);
  else if (t < 0.7) col = mix(c7, c8, (t - 0.6) / 0.1);
  else if (t < 0.8) col = mix(c8, c9, (t - 0.7) / 0.1);
  else if (t < 0.9) col = mix(c9, c10, (t - 0.8) / 0.1);
  else col = c10;
  return col;
}

void main() {
  // Use sphere's local position for noise sampling — creates volumetric depth
  vec3 p = vPosition * 2.0 + vec3(0.0, 0.0, uTime * 0.03);
  float noise = fbm(p);

  // Map noise to palette
  vec3 colour = palette(noise);

  // Star specks
  float stars = voronoi(vPosition * 8.0 + vec3(0.0, 0.0, uTime * 0.06));
  float starMask = smoothstep(0.55, 0.7, stars);
  colour += vec3(0.08, 0.03, 0.12) * starMask;

  // Fresnel edge glow — brightens at grazing angles
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = 1.0 - max(dot(vNormal, viewDir), 0.0);
  fresnel = pow(fresnel, 2.5);

  // Edge glow color — ethereal violet
  vec3 glowColor = vec3(0.2, 0.05, 0.35);
  colour += glowColor * fresnel * 0.6;

  // Subtle inner glow pulse
  float pulse = sin(uTime * 0.04 + noise * 15.0) * 0.5 + 0.5;
  colour += vec3(0.03, 0.01, 0.06) * pulse * 0.3;

  // Alpha — more transparent in center, more opaque at edges
  float alpha = 0.55 + fresnel * 0.35;

  // Very subtle scan lines
  float scan = sin(vUv.y * 600.0 + uTime * 0.1) * 0.5 + 0.5;
  colour *= 1.0 - (0.04 * (1.0 - scan));

  gl_FragColor = vec4(colour, alpha);
}
`;

export function createSphereMesh(uniforms: SphereUniforms): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(1, 64, 64);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  return mesh;
}
