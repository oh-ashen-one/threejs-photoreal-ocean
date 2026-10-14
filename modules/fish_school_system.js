// ============================================================================
// MODULAR 3D VERTEBRATE FISH GEOMETRY, IRIDESCENT SHADERS & SCHOOLING SYSTEM
// Target: Three.js WebGL2 on Apple Silicon Metal
// CRITICAL METAL RULES:
//   1. Every smoothstep(edge0, edge1, x) MUST have edge0 < edge1 strictly.
//   2. Every pow(x, y) MUST have x > 0.0 strictly (use fishSqr(x) for squaring!).
// ============================================================================

function createFishGeometry(
  THREE,
  length = 0.48,
  height = 0.052,
  thickness = 0.024,
  tailFlare = 0.72
) {
  const segsX = 36;
  const segsR = 18;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segsX; i++) {
    const u = i / segsX; // 0.0 = pointed snout tip, 1.0 = tips of deeply forked lunate tail fin
    const z = (0.5 - u) * length;

    let ry = 0.0;
    let rx = 0.0;

    // 1. Sleek Hydrodynamic Fusiform Body (u in 0.0 .. 0.75) tapering to a narrow caudal peduncle
    if (u < 0.75) {
      let bodyEnv = 0.0;
      if (u < 0.27) {
        const tHead = Math.max(1e-4, u / 0.27);
        bodyEnv = Math.sin(Math.pow(tHead, 0.72) * (Math.PI * 0.5));
      } else {
        const tRear = Math.max(1e-4, (u - 0.27) / 0.48);
        bodyEnv = Math.cos(Math.pow(tRear, 0.88) * (Math.PI * 0.5));
      }
      const safeEnv = Math.max(1e-4, bodyEnv);
      ry = height * (0.11 + 0.89 * safeEnv);
      rx = thickness * (0.10 + 0.90 * Math.pow(safeEnv, 0.85));
    } else {
      // 2. Narrow Caudal Peduncle flaring into a Deeply Forked Crescent / Lunate Tail Fin (u in 0.75 .. 1.0)
      const tailT = Math.max(1e-4, (u - 0.75) / 0.25);
      ry = height * (0.11 + tailFlare * Math.pow(tailT, 1.08));
      rx = thickness * 0.10 * (1.0 - 0.86 * tailT);
    }

    for (let j = 0; j <= segsR; j++) {
      const v = j / segsR;
      const theta = v * Math.PI * 2.0;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      let px = sinT * rx;
      let py = cosT * ry;
      let pz = z;

      // Swept-back Dorsal Fin Ridge (u in 0.28 .. 0.58, top spine cosT > 0.78)
      if (u > 0.28 && u < 0.58 && cosT > 0.78) {
        const finEnv = Math.sin(((u - 0.28) / 0.30) * Math.PI);
        const ridge = Math.pow(Math.max(1e-4, (cosT - 0.78) / 0.22), 1.35);
        py += height * 0.36 * finEnv * ridge;
        px *= 1.0 - 0.88 * ridge;
        pz -= length * 0.052 * ridge * ((u - 0.28) / 0.30);
      }

      // Sleek Ventral / Anal Fin Ridge (u in 0.52 .. 0.70, bottom spine cosT < -0.80)
      if (u > 0.52 && u < 0.70 && cosT < -0.80) {
        const finEnv = Math.sin(((u - 0.52) / 0.18) * Math.PI);
        const ridge = Math.pow(Math.max(1e-4, (-cosT - 0.80) / 0.20), 1.4);
        py -= height * 0.22 * finEnv * ridge;
        px *= 1.0 - 0.85 * ridge;
        pz -= length * 0.035 * ridge;
      }

      // Subtle Pectoral Fin Hydrofoils on flanks (u in 0.20 .. 0.34)
      if (u > 0.20 && u < 0.34 && Math.abs(sinT) > 0.72 && cosT < 0.05 && cosT > -0.55) {
        const pecEnv = Math.sin(((u - 0.20) / 0.14) * Math.PI);
        const pecWing = Math.pow(Math.max(1e-4, (Math.abs(sinT) - 0.72) / 0.28), 1.3);
        px += Math.sign(sinT) * thickness * 0.52 * pecEnv * pecWing;
        py -= height * 0.08 * pecEnv * pecWing;
        pz -= length * 0.03 * pecWing;
      }

      // Deeply Forked Crescent / Lunate Caudal Fin Carve (u > 0.75)
      if (u > 0.75) {
        const tailT = Math.max(1e-4, (u - 0.75) / 0.25);
        const cArg = cosT * 2.5;
        const centerNotch = Math.exp(-(cArg * cArg));
        const lobeTips = Math.pow(Math.max(1e-4, Math.abs(cosT)), 1.55);

        pz += length * 0.168 * Math.pow(tailT, 0.95) * centerNotch;
        pz -= length * 0.078 * Math.pow(tailT, 1.25) * lobeTips;
        px *= 1.0 - 0.78 * tailT * centerNotch;
      }

      positions.push(px, py, pz);

      const nx = sinT / Math.max(rx, 0.004);
      const ny = cosT / Math.max(ry, 0.004);
      const nz = 0.12 * (0.38 - u);
      const nLen = Math.hypot(nx, ny, nz) || 1.0;
      normals.push(nx / nLen, ny / nLen, nz / nLen);
      uvs.push(u, v);
    }
  }

  for (let i = 0; i < segsX; i++) {
    for (let j = 0; j < segsR; j++) {
      const a = i * (segsR + 1) + j;
      const b = a + segsR + 1;
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setIndex(indices);
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

const fishVertexShader = /* glsl */ `
  attribute vec4 aFishData;
  attribute vec3 aFishColor1;
  attribute vec3 aFishColor2;

  uniform float uTime;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vLocalNormal;
  varying vec2 vUv;
  varying vec3 vColor1;
  varying vec3 vColor2;
  varying float vSpecies;

  void main() {
    vUv = uv;
    vColor1 = aFishColor1;
    vColor2 = aFishColor2;
    vSpecies = aFishData.z;
    vLocalNormal = normal;

    float phase = aFishData.x;
    float speed = aFishData.y;
    vec3 pos = position;
    vec3 norm = normal;

    // Carangiform swimming kinematics: minimal head sway, strong caudal peduncle & lunate tail thrust
    float u = max(1e-4, uv.x);
    float waveArg = uTime * speed * 8.8 + phase - u * 4.8;
    float amp = 0.0035 + 0.044 * pow(u, 2.2);
    float lateral = sin(waveArg) * amp;
    float yawDeriv = cos(waveArg) * amp * 4.8;

    pos.x += lateral;
    norm.x -= yawDeriv * norm.z;
    norm = normalize(norm);

    vec4 worldPosition = instanceMatrix * vec4(pos, 1.0);
    vWorldPos = worldPosition.xyz;
    vWorldNormal = normalize(mat3(instanceMatrix) * norm);

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fishFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uTwilight;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vLocalNormal;
  varying vec2 vUv;
  varying vec3 vColor1;
  varying vec3 vColor2;
  varying float vSpecies;

  float fishSqr(float x) {
    return x * x;
  }

  float fishSafePow(float x, float p) {
    return pow(max(1e-4, x), p);
  }

  // Live RGB chromatic caustic projection across fish dorsal backs
  vec3 evalFishCausticsRGB(vec3 worldPos, float time) {
    vec2 p = worldPos.xz * 2.6 + vec2(worldPos.y * 0.45);
    vec2 disp = vec2(0.055, 0.042);

    float cR1 = 1.0 - abs(sin((p.x + disp.x) * 2.2 + time * 2.0 + cos((p.y + disp.y) * 1.9 - time * 1.6)));
    float cR2 = 1.0 - abs(cos((p.x - p.y + disp.x) * 1.8 - time * 1.7));
    float r = fishSafePow(clamp(cR1 * 0.55 + cR2 * 0.45, 0.0, 1.0), 4.8);

    float cG1 = 1.0 - abs(sin(p.x * 2.2 + time * 2.0 + cos(p.y * 1.9 - time * 1.6)));
    float cG2 = 1.0 - abs(cos((p.x - p.y) * 1.8 - time * 1.7));
    float g = fishSafePow(clamp(cG1 * 0.55 + cG2 * 0.45, 0.0, 1.0), 4.8);

    float cB1 = 1.0 - abs(sin((p.x - disp.x) * 2.2 + time * 2.0 + cos((p.y - disp.y) * 1.9 - time * 1.6)));
    float cB2 = 1.0 - abs(cos((p.x - p.y - disp.x) * 1.8 - time * 1.7));
    float b = fishSafePow(clamp(cB1 * 0.55 + cB2 * 0.45, 0.0, 1.0), 4.8);

    return vec3(r * 1.15, g * 1.08, b * 1.25);
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(vec3(0.05, 0.90, -0.42));

    float u = vUv.x;
    float v = vUv.y;

    // Diamond fish-scale micro-relief & thin-film interference iridescence
    float scaleBodyMask = smoothstep(0.14, 0.24, u) * (1.0 - smoothstep(0.68, 0.76, u));
    vec2 scaleUV = vec2(u * 48.0, v * 20.0);
    float scaleRow = floor(scaleUV.y);
    scaleUV.x += mod(scaleRow, 2.0) * 0.5;
    vec2 scaleCell = fract(scaleUV) - 0.5;
    float scaleOverlap = clamp(1.0 - dot(scaleCell, scaleCell) * 2.6, 0.0, 1.0) * scaleBodyMask;

    // Perturb normal slightly with diamond scale micro-facets
    N = normalize(N + vec3(scaleCell.x * 0.07, scaleCell.y * 0.07, 0.0) * scaleBodyMask);

    float NdotL = max(0.0, dot(N, L));
    float NdotV = max(0.0, dot(N, V));
    vec3 H = normalize(L + V);

    // Focused wet biological specular + scale glint
    float specSharp = fishSafePow(max(0.0, dot(N, H)), 125.0) * (0.70 + 0.50 * scaleOverlap);
    float specBroad = fishSafePow(max(0.0, dot(N, H)), 28.0) * 0.30;

    // Thin-film scale micro-iridescence (aquamarine-cyan / cobalt / champagne-gold sheen on lit flanks)
    float iridPhase = NdotV * 5.8 + u * 2.2 + scaleOverlap * 0.65;
    vec3 iridSheen = 0.5 + 0.5 * cos(iridPhase + vec3(0.0, 1.35, 2.45));
    iridSheen = mix(vec3(0.18, 0.58, 0.74), iridSheen, 0.55) * (0.35 + 0.65 * scaleOverlap);

    // Fin mask & gill operculum contour
    float isTailFin = smoothstep(0.75, 0.83, u);
    float isDorsalFin = smoothstep(0.28, 0.34, u) * (1.0 - smoothstep(0.54, 0.60, u)) * smoothstep(0.76, 0.92, vLocalNormal.y);
    float finMask = clamp(isTailFin + isDorsalFin, 0.0, 1.0);
    float finRays = 0.55 + 0.45 * sin(v * 88.0 + u * 24.0);
    float gillShadow = exp(-fishSqr((u - 0.21) * 24.0)) * smoothstep(-0.35, 0.45, vLocalNormal.y) * 0.55;

    // Crisp overhead rim backlight from Snell's Window (matches ref_v2_hyperreal_underwater_snell.jpg!)
    float topRim = fishSafePow(clamp(1.0 - NdotV, 0.0, 1.0), 3.4) * smoothstep(0.05, 0.68, N.y);
    float bellyBounce = smoothstep(0.15, 0.85, -N.y) * 0.14;

    // Live RGB caustic ribbons dancing across dorsal backs
    vec3 caustRGB = evalFishCausticsRGB(vWorldPos, uTime) * smoothstep(0.05, 0.68, N.y);

    vec3 litColor = vec3(0.0);

    if (vSpecies < 0.5) {
      // ----------------------------------------------------------------------
      // SPECIES 0: 320 High-Contrast Countershaded Silver-Blue Pelagic Fusiliers
      // Matches ref_v2_hyperreal_underwater_snell.jpg:
      // Deep Prussian-indigo dorsal & shadow silhouette, bright metallic silver-cyan
      // lateral flash where angled toward light, and crisp cyan-silver top rim!
      // ----------------------------------------------------------------------
      vec3 shadowSilhouette = vec3(0.003, 0.022, 0.044);
      vec3 dorsalCobalt     = vec3(0.006, 0.045, 0.086);
      vec3 metallicFlank    = vec3(0.16, 0.42, 0.54);
      vec3 silverBelly      = vec3(0.06, 0.20, 0.28);

      float dorsalMask = smoothstep(0.10, 0.55, vLocalNormal.y);
      float bellyMask  = 1.0 - smoothstep(-0.55, -0.08, vLocalNormal.y);
      float flankFlash = exp(-fishSqr((vLocalNormal.y - 0.04) * 3.2)) * smoothstep(0.10, 0.72, NdotV);

      vec3 baseBody = mix(silverBelly, dorsalCobalt, dorsalMask);
      baseBody = mix(baseBody, metallicFlank, flankFlash * (0.45 + 0.55 * NdotL));

      // Iridescent cyan-gold lateral line along mid-body
      float latLine = exp(-fishSqr((vLocalNormal.y - 0.06) * 5.2))
                    * smoothstep(0.10, 0.24, u)
                    * (1.0 - smoothstep(0.66, 0.82, u));
      vec3 latCol = mix(vec3(0.22, 0.64, 0.78), vec3(0.68, 0.62, 0.34), 0.35);
      baseBody = mix(baseBody, latCol, latLine * 0.48);
      baseBody *= 1.0 - gillShadow;

      // High-contrast underwater directional shading so fish have dark 3D bellies/silhouettes
      vec3 bodyShaded = mix(shadowSilhouette, baseBody, 0.18 + 0.82 * NdotL + bellyBounce)
                      + iridSheen * (flankFlash * 0.28 + specBroad * 0.55);

      // Dark-edged translucent forked lunate tail fin
      vec3 finCol = mix(vec3(0.008, 0.055, 0.095), vec3(0.28, 0.64, 0.76), topRim * 0.85 + NdotL * 0.35) * finRays;
      bodyShaded = mix(bodyShaded, finCol, finMask * 0.78);

      litColor = bodyShaded
               + vec3(0.48, 0.86, 0.96) * topRim * 0.82
               + vec3(0.85, 0.96, 1.0) * specSharp * 0.95
               + caustRGB * 0.36;
    } else {
      // ----------------------------------------------------------------------
      // SPECIES 1: 95 Sleek Tropical Reef Fish (Anthias, Chromis & Fusiliers)
      // Deeply countershaded so they blend naturally into the lower reef water column!
      // ----------------------------------------------------------------------
      float bodyGrad = smoothstep(0.22, 0.72, u + 0.12 * sin(vLocalNormal.y * 4.2));
      float dorsalShade = smoothstep(0.22, 0.75, vLocalNormal.y) * 0.58;

      vec3 rawReef = mix(vColor1, vColor2, bodyGrad);
      vec3 reefBody = mix(rawReef, vec3(0.02, 0.18, 0.28), 0.46) * (1.0 - max(gillShadow, dorsalShade));

      vec3 ambientWater = vec3(0.004, 0.032, 0.058);
      vec3 shaded = mix(ambientWater, reefBody, 0.16 + 0.78 * NdotL + bellyBounce)
                  + iridSheen * 0.18 * NdotL;

      vec3 reefFinCol = mix(vec3(0.01, 0.06, 0.10), vColor2 * 0.65 + vec3(0.15, 0.45, 0.55), topRim * 0.75 + 0.25) * finRays;
      shaded = mix(shaded, reefFinCol, finMask * 0.72);

      litColor = shaded
               + vec3(0.42, 0.80, 0.90) * topRim * 0.55
               + vec3(0.85, 0.92, 0.88) * specSharp * 0.65
               + caustRGB * 0.30;
    }

    // Crisp vertebrate eye with dark pupil & subtle metallic iris ring
    float eyeDist = length(vec2((u - 0.105) * 4.8, abs(vLocalNormal.y - 0.08) * 1.15));
    if (eyeDist < 0.050 && abs(vLocalNormal.x) > 0.35) {
      vec3 irisCol = vec3(0.48, 0.46, 0.34);
      vec3 pupilCol = vec3(0.002, 0.005, 0.010);
      float pupilMask = smoothstep(0.025, 0.032, eyeDist);
      litColor = mix(pupilCol, irisCol, pupilMask);
    }

    gl_FragColor = vec4(litColor, 1.0);
  }
`;

export function createFishSchoolSystem(scene, THREE) {
  const PELAGIC_COUNT = 320;
  const REEF_COUNT = 95;
  const totalFishCount = PELAGIC_COUNT + REEF_COUNT;

  const fishShaderUniforms = {
    uTime: { value: 0.0 },
    uTwilight: { value: 0.48 },
  };

  const fishMaterial = new THREE.ShaderMaterial({
    uniforms: fishShaderUniforms,
    vertexShader: fishVertexShader,
    fragmentShader: fishFragmentShader,
    side: THREE.DoubleSide,
  });

  // Both pelagic fusiliers (320) and tropical reef fish (95) use sleek, tapered fusiform
  // vertebrate proportions with narrow caudal peduncles and deeply forked crescent tails!
  const pelagicGeom = createFishGeometry(THREE, 0.50, 0.052, 0.025, 0.74);
  const reefGeom = createFishGeometry(THREE, 0.38, 0.048, 0.022, 0.68);

  let seed = 1337;
  function nextRand() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  function attachInstancedAttributes(geom, count, speciesId, paletteFn) {
    const fishData = new Float32Array(count * 4);
    const col1 = new Float32Array(count * 3);
    const col2 = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      fishData[i * 4 + 0] = nextRand() * Math.PI * 2.0; // swimming phase
      fishData[i * 4 + 1] = 1.0 + nextRand() * 0.35;     // swimming frequency
      fishData[i * 4 + 2] = speciesId;                   // 0 = pelagic, 1 = reef
      fishData[i * 4 + 3] = 0.68 + nextRand() * 0.32;    // individual scale

      const [c1, c2] = paletteFn(i);
      col1[i * 3 + 0] = c1[0];
      col1[i * 3 + 1] = c1[1];
      col1[i * 3 + 2] = c1[2];
      col2[i * 3 + 0] = c2[0];
      col2[i * 3 + 1] = c2[1];
      col2[i * 3 + 2] = c2[2];
    }

    geom.setAttribute('aFishData', new THREE.InstancedBufferAttribute(fishData, 4));
    geom.setAttribute('aFishColor1', new THREE.InstancedBufferAttribute(col1, 3));
    geom.setAttribute('aFishColor2', new THREE.InstancedBufferAttribute(col2, 3));
    return fishData;
  }

  const pelagicData = attachInstancedAttributes(pelagicGeom, PELAGIC_COUNT, 0.0, () => [
    [0.010, 0.06, 0.12],
    [0.32, 0.64, 0.78],
  ]);

  const pelagicMesh = new THREE.InstancedMesh(pelagicGeom, fishMaterial, PELAGIC_COUNT);
  pelagicMesh.frustumCulled = false;
  scene.add(pelagicMesh);

  // Arrange the 320 pelagic fusiliers into the dense, sweeping S-curve stream seen in
  // ref_v2_hyperreal_underwater_snell.jpg: sweeping from the right mid-foreground across
  // the sunlit bubble plume into the left mid-water!
  const pelagicState = Array.from({ length: PELAGIC_COUNT }, (_, i) => {
    const frac = i / PELAGIC_COUNT;
    return {
      baseS: frac * 17.0 - 8.5 + (nextRand() - 0.5) * 0.45,
      radialR: Math.pow(Math.max(1e-4, nextRand()), 0.74) * 1.28,
      radialAngle: nextRand() * Math.PI * 2.0,
      speed: 0.90 + (nextRand() - 0.5) * 0.14,
      scale: pelagicData[i * 4 + 3],
      bobPhase: nextRand() * Math.PI * 2.0,
    };
  });

  const reefPalettes = [
    [[0.04, 0.36, 0.54], [0.58, 0.68, 0.24]], // Blue-green chromis / yellowtail fusilier
    [[0.56, 0.22, 0.06], [0.72, 0.52, 0.12]], // Deep-water anthias
    [[0.05, 0.42, 0.52], [0.38, 0.72, 0.76]], // Blue-streak fusilier
    [[0.26, 0.08, 0.38], [0.64, 0.48, 0.14]], // Royal gramma / gold-tail reef fish
  ];

  const reefData = attachInstancedAttributes(
    reefGeom,
    REEF_COUNT,
    1.0,
    (i) => reefPalettes[i % reefPalettes.length]
  );

  const reefMesh = new THREE.InstancedMesh(reefGeom, fishMaterial, REEF_COUNT);
  reefMesh.frustumCulled = false;
  scene.add(reefMesh);

  // Position the 95 reef fish as a cohesive lower-stream escort school (avoiding isolated bottom-edge stragglers)
  const reefState = Array.from({ length: REEF_COUNT }, (_, i) => ({
    cx: (nextRand() - 0.38) * 7.2,
    cz: -19.2 - nextRand() * 5.2,
    cy: -2.42 - nextRand() * 0.48,
    rx: 0.75 + nextRand() * 1.35,
    rz: 0.45 + nextRand() * 0.95,
    phase: nextRand() * Math.PI * 2.0,
    omega: (0.28 + nextRand() * 0.24) * (nextRand() < 0.75 ? 1 : -1),
    scale: reefData[i * 4 + 3],
  }));

  const dummyObj = new THREE.Object3D();
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const vDir1 = new THREE.Vector3();
  const vDir2 = new THREE.Vector3();
  const targetPos = new THREE.Vector3();

  // Evaluate 3D S-curve schooling stream (right-foreground -> center sunbeams -> left mid-water)
  function evalPelagicStream(s, time, outVec) {
    const x = -s * 0.66 + 0.65 + Math.sin(s * 0.36 - time * 0.38) * 0.82;
    const y = -2.12 + Math.sin(s * 0.30 + 0.35) * 0.22 + Math.cos(s * 0.45 - time * 0.42) * 0.14;
    const z = -20.6 - s * 0.22 + Math.cos(s * 0.34 + time * 0.32) * 1.05;
    outVec.set(x, y, z);
    return outVec;
  }

  function update(t = 0.0, twilight = 0.48) {
    fishShaderUniforms.uTime.value = t;
    fishShaderUniforms.uTwilight.value = twilight;

    const streamLen = 17.0;

    for (let i = 0; i < PELAGIC_COUNT; i++) {
      const st = pelagicState[i];
      let s = ((st.baseS + t * st.speed) % streamLen + streamLen) % streamLen - streamLen * 0.5;

      evalPelagicStream(s, t, p0);
      evalPelagicStream(s + 0.32, t, p1);
      evalPelagicStream(s + 0.64, t, p2);

      const streamEnvelope = 0.62 + 0.42 * Math.cos(s * 0.18);
      const rEff = st.radialR * streamEnvelope;

      const ang = st.radialAngle + t * 0.18;
      const offX = Math.cos(ang) * rEff * 1.12;
      const offY = Math.sin(ang) * rEff * 0.32 + Math.sin(t * 1.6 + st.bobPhase) * 0.035;
      const offZ = Math.sin(ang * 2.0) * rEff * 0.58;

      const fx = p0.x + offX;
      const fy = Math.max(-2.95, Math.min(-1.05, p0.y + offY));
      const fz = p0.z + offZ;

      const tx = p1.x + offX;
      const ty = Math.max(-2.95, Math.min(-1.05, p1.y + offY));
      const tz = p1.z + offZ;

      dummyObj.position.set(fx, fy, fz);
      targetPos.set(tx, ty, tz);
      dummyObj.lookAt(targetPos);

      // Compute natural banking roll angle from horizontal turn rate along the S-curve
      vDir1.subVectors(p1, p0).normalize();
      vDir2.subVectors(p2, p1).normalize();
      const yawTurnRate = vDir1.x * vDir2.z - vDir1.z * vDir2.x;
      const bankRoll = Math.max(-0.38, Math.min(0.38, yawTurnRate * 4.2 + Math.sin(t * 2.2 + st.bobPhase) * 0.05));
      dummyObj.rotateZ(bankRoll);

      dummyObj.scale.setScalar(st.scale);
      dummyObj.updateMatrix();
      pelagicMesh.setMatrixAt(i, dummyObj.matrix);
    }
    pelagicMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < REEF_COUNT; i++) {
      const st = reefState[i];
      const a0 = st.phase + t * st.omega;
      const a1 = a0 + 0.09 * Math.sign(st.omega);

      const x0 = st.cx + Math.cos(a0) * st.rx;
      const z0 = st.cz + Math.sin(a0) * st.rz;
      const y0 = st.cy + Math.sin(t * 1.15 + st.phase) * 0.07;

      const x1 = st.cx + Math.cos(a1) * st.rx;
      const z1 = st.cz + Math.sin(a1) * st.rz;
      const y1 = st.cy + Math.sin((t + 0.09) * 1.15 + st.phase) * 0.07;

      dummyObj.position.set(x0, y0, z0);
      targetPos.set(x1, y1, z1);
      dummyObj.lookAt(targetPos);

      const reefBank = -0.16 * Math.sign(st.omega) * Math.sin(a0);
      dummyObj.rotateZ(reefBank);

      dummyObj.scale.setScalar(st.scale);
      dummyObj.updateMatrix();
      reefMesh.setMatrixAt(i, dummyObj.matrix);
    }
    reefMesh.instanceMatrix.needsUpdate = true;
  }

  update(0.0, 0.48);

  return {
    update,
    totalFishCount,
    pelagicMesh,
    reefMesh,
    fishMaterial,
  };
}
