import * as THREE from './three.module.js';
import { SKY_ATMOSPHERE_GLSL } from './modules/sky_atmosphere_glsl.js?v=24';
import { OCEAN_SURFACE_GLSL } from './modules/ocean_surface_glsl.js?v=24';
import { UNDERWATER_GLSL } from './modules/underwater_glsl.js?v=24';
import { createFishSchoolSystem } from './modules/fish_school_system.js?v=24';

// ============================================================================
// 1. RENDERER & CAMERA INITIALIZATION
// ============================================================================
const container = document.getElementById('canvas-container');
const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance',
});
const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
renderer.setPixelRatio(dpr);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.autoClear = false;
container.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(
  54,
  window.innerWidth / window.innerHeight,
  0.1,
  1200
);

// ============================================================================
// 2. 3D INSTANCED VERTEBRATE FISH SCHOOLS (415 3D FISH: 320 PELAGIC + 95 REEF)
// ============================================================================
const fishScene = new THREE.Scene();
const fishSystem = createFishSchoolSystem(fishScene, THREE);

const fishBadge = document.getElementById('fish-count');
if (fishBadge) {
  fishBadge.textContent = `${fishSystem.totalFishCount} Instanced 3D`;
}

// ============================================================================
// 3. OFF-SCREEN RENDER TARGET FOR COMPOSITING 3D FISH INTO UNDERWATER OPTICS
// ============================================================================
function createFishRenderTarget(w, h) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  });
  rt.depthTexture = new THREE.DepthTexture(w, h);
  rt.depthTexture.format = THREE.DepthFormat;
  rt.depthTexture.type = THREE.UnsignedIntType;
  return rt;
}

let fishRT = createFishRenderTarget(
  Math.floor(window.innerWidth * dpr),
  Math.floor(window.innerHeight * dpr)
);

// ============================================================================
// 4. FULL-SCREEN UNIFIED RAYMARCHED OCEAN, VOLUMETRIC SKY & UNDERWATER SHADER
// ============================================================================
const quadScene = new THREE.Scene();
const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const oceanUniforms = {
  uTime: { value: 0 },
  uResolution: {
    value: new THREE.Vector2(window.innerWidth * dpr, window.innerHeight * dpr),
  },
  uCamPos: { value: new THREE.Vector3() },
  uCamMatrixWorld: { value: new THREE.Matrix4() },
  uCamProjMatrixInv: { value: new THREE.Matrix4() },
  uTimeOfDay: { value: 0.48 }, // 0.0 = High Sun, 0.48 = Golden Sunset Twilight, 1.0 = Deep Starry Night
  uWaveScale: { value: 1.0 },
  uFishColorTex: { value: fishRT.texture },
  uFishDepthTex: { value: fishRT.depthTexture },
  uNear: { value: camera.near },
  uFar: { value: camera.far },
};

const oceanVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const oceanFragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec3 uCamPos;
  uniform mat4 uCamMatrixWorld;
  uniform mat4 uCamProjMatrixInv;
  uniform float uTimeOfDay;
  uniform float uWaveScale;
  uniform sampler2D uFishColorTex;
  uniform sampler2D uFishDepthTex;
  uniform float uNear;
  uniform float uFar;

  float linearizeDepth(float d) {
    float z = d * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
  }

  ${SKY_ATMOSPHERE_GLSL}
  ${OCEAN_SURFACE_GLSL}
  ${UNDERWATER_GLSL}

  void main() {
    vec2 ndc = vUv * 2.0 - 1.0;
    vec4 viewRay = uCamProjMatrixInv * vec4(ndc, -1.0, 1.0);
    viewRay.xyz /= viewRay.w;
    vec3 rd = normalize((uCamMatrixWorld * vec4(viewRay.xyz, 0.0)).xyz);
    vec3 ro = uCamPos;

    // Map uTimeOfDay (0.0=Day, 0.48=Golden Twilight, 1.0=Starry Night)
    float twilight = clamp(uTimeOfDay / 0.50, 0.0, 1.0);
    float nightFactor = smoothstep(0.55, 0.98, uTimeOfDay);

    vec3 sunDir, sunCol;
    vec3 skyBg = evalSkyAndClouds(rd, uTime, twilight, sunDir, sunCol);

    if (nightFactor > 0.001) {
      vec3 nightSky = vec3(0.004, 0.014, 0.042) + evalStarfield(rd, uTime) * 1.45;
      skyBg = mix(skyBg, nightSky, nightFactor * 0.72);
      sunCol = mix(sunCol, vec3(0.55, 0.72, 1.05), nightFactor * 0.82);
    }

    vec3 nearWorldPos = ro + rd * 0.25;
    float camCF, camFC, camBF;
    float camWaveH = evalOceanWave(nearWorldPos.xz, uTime, uWaveScale, false, camCF, camFC, camBF);

    bool isUnderwater = (nearWorldPos.y < camWaveH);
    float meniscusDist = abs(nearWorldPos.y - camWaveH);

    vec3 finalColor = vec3(0.0);

    if (!isUnderwater) {
      finalColor = shadeAboveWater(ro, rd, uTime, twilight, uWaveScale, sunDir, sunCol, skyBg);
      if (nightFactor > 0.001) {
        finalColor *= mix(vec3(1.0), vec3(0.45, 0.62, 0.92), nightFactor * 0.65);
      }
    } else {
      vec3 baseUnderwater = shadeUnderwater(ro, rd, uTime, twilight, uWaveScale, sunDir, sunCol);

      // Composite 415 3D instanced fish schools (fishRT) with underwater Beer-Lambert fog & volumetric scatter
      float rawFishD = texture2D(uFishDepthTex, vUv).r;
      if (rawFishD < 0.9999) {
        float fishDist = linearizeDepth(rawFishD);
        // Check against seafloor intersection if looking downward
        float maxVisDist = 62.0;
        if (rd.y < -0.01) {
          maxVisDist = max(1.5, (-3.68 - ro.y) / rd.y + 0.6);
        }
        if (fishDist < maxVisDist) {
          vec3 fishCol = texture2D(uFishColorTex, vUv).rgb;
          float fishVis = exp(-max(0.0, fishDist - 2.2) * 0.048);
          vec3 waterScatter = vec3(0.008, 0.175, 0.255);
          baseUnderwater = mix(waterScatter, fishCol, fishVis);
        }
      }

      finalColor = baseUnderwater;
    }

    // Air-water meniscus line when camera is right at the waterline
    if (meniscusDist < 0.015) {
      float mLine = exp(-pow(meniscusDist / 0.0045, 2.0));
      finalColor = mix(finalColor, vec3(0.75, 0.96, 1.0) + sunCol * 0.28, mLine * 0.72);
    }

    // ACES Filmic Tone Mapping + Cinema Vignette
    vec3 x = finalColor * 1.04;
    vec3 mapped = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
    mapped = pow(mapped, vec3(1.0 / 2.2));

    float vig = 1.0 - dot(vUv - 0.5, vUv - 0.5) * 0.24;
    gl_FragColor = vec4(mapped * vig, 1.0);
  }
`;

const oceanQuad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    uniforms: oceanUniforms,
    vertexShader: oceanVertexShader,
    fragmentShader: oceanFragmentShader,
    depthWrite: false,
    depthTest: false,
  })
);
quadScene.add(oceanQuad);

// ============================================================================
// 5. CAMERA PRESETS, SMOOTH DIVE / SURFACE TRANSITION & INTERACTIVE CONTROLS
// ============================================================================
const PRESETS = {
  shore: {
    pos: new THREE.Vector3(0.0, 1.24, 6.35),
    yaw: 0.0,
    pitch: 0.025,
    label: 'Beach Shoreline',
  },
  snell: {
    pos: new THREE.Vector3(0.0, -2.15, -14.2),
    yaw: 0.0,
    pitch: 0.19,
    label: "Underwater (Snell's Window)",
  },
  split: {
    pos: new THREE.Vector3(0.0, 0.11, -1.6),
    yaw: 0.0,
    pitch: 0.02,
    label: 'Surf Zone Waterline',
  },
  reef: {
    pos: new THREE.Vector3(0.0, -2.55, -15.2),
    yaw: 0.0,
    pitch: 0.06,
    label: 'Deep Reef & School',
  },
};

const camState = {
  pos: PRESETS.shore.pos.clone(),
  yaw: PRESETS.shore.yaw,
  pitch: PRESETS.shore.pitch,
  targetPos: PRESETS.shore.pos.clone(),
  targetYaw: PRESETS.shore.yaw,
  targetPitch: PRESETS.shore.pitch,
  activePreset: 'shore',
  isDragging: false,
  lastX: 0,
  lastY: 0,
  keys: {},
};

const depthReadout = document.getElementById('depth-readout');
const diveBtn = document.getElementById('btn-dive-toggle');

function setCameraPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  camState.activePreset = name;
  camState.targetPos.copy(p.pos);
  camState.targetYaw = p.yaw;
  camState.targetPitch = p.pitch;

  document.querySelectorAll('.cam-preset').forEach((btn) => btn.classList.remove('active'));
  const activeBtn = document.getElementById('preset-' + name);
  if (activeBtn) activeBtn.classList.add('active');

  if (name === 'snell' || name === 'reef') {
    diveBtn.innerHTML = '🏖 Surface to Beach Shoreline';
  } else {
    diveBtn.innerHTML = '🤿 Dive Underwater & Look Up';
  }
}

function toggleDiveMode() {
  if (camState.pos.y < -0.3) {
    setCameraPreset('shore');
  } else {
    setCameraPreset('snell');
  }
}

function updateTimeOfDay(val) {
  const v = parseFloat(val);
  oceanUniforms.uTimeOfDay.value = v;
  const label = document.getElementById('tod-label');
  if (v < 0.25) label.textContent = '☀️ Day';
  else if (v < 0.72) label.textContent = '🌅 Twilight';
  else label.textContent = '🌌 Starry Night';
}

function updateWaveScale(val) {
  oceanUniforms.uWaveScale.value = parseFloat(val);
}

function toggleRefDrawer() {
  document.getElementById('ref-drawer').classList.toggle('open');
}

function toggleUI() {
  document.body.classList.toggle('ui-hidden');
}

window.setCameraPreset = setCameraPreset;
window.toggleDiveMode = toggleDiveMode;
window.updateTimeOfDay = updateTimeOfDay;
window.updateWaveScale = updateWaveScale;
window.toggleRefDrawer = toggleRefDrawer;
window.toggleUI = toggleUI;

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('preset') && PRESETS[urlParams.get('preset')]) {
  const pName = urlParams.get('preset');
  setCameraPreset(pName);
  camState.pos.copy(PRESETS[pName].pos);
  camState.yaw = PRESETS[pName].yaw;
  camState.pitch = PRESETS[pName].pitch;
}
if (urlParams.get('pitch') !== null) {
  const customPitch = parseFloat(urlParams.get('pitch'));
  if (!Number.isNaN(customPitch)) {
    camState.pitch = customPitch;
    camState.targetPitch = customPitch;
  }
}
if (urlParams.get('tod') !== null) {
  const tod = parseFloat(urlParams.get('tod'));
  document.getElementById('tod-slider').value = tod;
  updateTimeOfDay(tod);
}
if (urlParams.get('clean') === '1' || urlParams.get('hideui') === '1') {
  document.body.classList.add('ui-hidden');
}

container.addEventListener('pointerdown', (e) => {
  camState.isDragging = true;
  camState.lastX = e.clientX;
  camState.lastY = e.clientY;
});

window.addEventListener('pointermove', (e) => {
  if (!camState.isDragging) return;
  const dx = e.clientX - camState.lastX;
  const dy = e.clientY - camState.lastY;
  camState.lastX = e.clientX;
  camState.lastY = e.clientY;

  camState.targetYaw -= dx * 0.0032;
  camState.targetPitch = Math.max(-1.25, Math.min(1.42, camState.targetPitch - dy * 0.0032));
});

window.addEventListener('pointerup', () => {
  camState.isDragging = false;
});

window.addEventListener(
  'wheel',
  (e) => {
    const deltaY = -e.deltaY * 0.0035;
    camState.targetPos.y = Math.max(-3.6, Math.min(6.0, camState.targetPos.y + deltaY));
    if (camState.targetPos.y < -0.5 && camState.targetPos.z > -4.0) {
      camState.targetPos.z = Math.min(camState.targetPos.z, -12.0);
    }
  },
  { passive: true }
);

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  camState.keys[k] = true;
  if (k === ' ') {
    e.preventDefault();
    toggleDiveMode();
  } else if (k === 'h') {
    toggleUI();
  }
});

window.addEventListener('keyup', (e) => {
  camState.keys[e.key.toLowerCase()] = false;
});

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  const curDpr = renderer.getPixelRatio();
  oceanUniforms.uResolution.value.set(w * curDpr, h * curDpr);
  fishRT.dispose();
  fishRT = createFishRenderTarget(Math.floor(w * curDpr), Math.floor(h * curDpr));
  oceanUniforms.uFishColorTex.value = fishRT.texture;
  oceanUniforms.uFishDepthTex.value = fishRT.depthTexture;
});

// ============================================================================
// 6. MAIN ANIMATION LOOP
// ============================================================================
let prevTime = performance.now() * 0.001;
const euler = new THREE.Euler(0, 0, 0, 'YXZ');

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now() * 0.001;
  const dt = Math.min(0.05, now - prevTime);
  prevTime = now;

  const moveSpeed = 5.5 * dt;
  const forward = new THREE.Vector3(-Math.sin(camState.yaw), 0, -Math.cos(camState.yaw));
  const right = new THREE.Vector3(Math.cos(camState.yaw), 0, -Math.sin(camState.yaw));

  if (camState.keys['w'] || camState.keys['arrowup']) camState.targetPos.addScaledVector(forward, moveSpeed);
  if (camState.keys['s'] || camState.keys['arrowdown']) camState.targetPos.addScaledVector(forward, -moveSpeed);
  if (camState.keys['d'] || camState.keys['arrowright']) camState.targetPos.addScaledVector(right, moveSpeed);
  if (camState.keys['a'] || camState.keys['arrowleft']) camState.targetPos.addScaledVector(right, -moveSpeed);
  if (camState.keys['e']) camState.targetPos.y = Math.min(8.0, camState.targetPos.y + moveSpeed * 0.7);
  if (camState.keys['q'] || camState.keys['c']) camState.targetPos.y = Math.max(-3.6, camState.targetPos.y - moveSpeed * 0.7);

  const damp = 1.0 - Math.exp(-5.2 * dt);
  camState.pos.lerp(camState.targetPos, damp);
  camState.yaw += (camState.targetYaw - camState.yaw) * damp;
  camState.pitch += (camState.targetPitch - camState.pitch) * damp;

  const floatBob =
    camState.pos.y < 0.0 ? Math.sin(now * 1.35) * 0.03 : Math.sin(now * 0.85) * 0.008;

  camera.position.set(camState.pos.x, camState.pos.y + floatBob, camState.pos.z);
  euler.set(camState.pitch, camState.yaw, 0, 'YXZ');
  camera.quaternion.setFromEuler(euler);
  camera.updateMatrixWorld();

  if (depthReadout) {
    const yVal = camera.position.y;
    const sign = yVal >= 0 ? '+' : '';
    const stateTag = yVal >= 0.05 ? 'Above Water' : 'Underwater';
    depthReadout.textContent = `${sign}${yVal.toFixed(2)} m (${stateTag})`;
  }

  fishSystem.update(now, clamp01(oceanUniforms.uTimeOfDay.value / 0.5));
  renderer.setRenderTarget(fishRT);
  renderer.setClearColor(0x000000, 0.0);
  renderer.clear(true, true, false);
  renderer.render(fishScene, camera);

  renderer.setRenderTarget(null);
  oceanUniforms.uTime.value = now;
  oceanUniforms.uCamPos.value.copy(camera.position);
  oceanUniforms.uCamMatrixWorld.value.copy(camera.matrixWorld);
  oceanUniforms.uCamProjMatrixInv.value.copy(camera.projectionMatrixInverse);
  renderer.render(quadScene, quadCamera);
}

function clamp01(x) {
  return Math.max(0.0, Math.min(1.0, x));
}

animate();
