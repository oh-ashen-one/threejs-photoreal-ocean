export const OCEAN_SURFACE_GLSL = /* glsl */ `
  // ==========================================================================
  // OCEAN SURFACE, WIDE SWEEPING EMERALD PLUNGING WAVE, TURBULENT FROTH LACE,
  // DOUBLE PARABOLIC SWASH LOBES & SILKY WET SAND MIRROR (METAL-SAFE GLSL)
  // ==========================================================================

  float os_hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec2 os_hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }

  float os_noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(os_hash12(i + vec2(0.0, 0.0)), os_hash12(i + vec2(1.0, 0.0)), u.x),
      mix(os_hash12(i + vec2(0.0, 1.0)), os_hash12(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  const mat2 os_m2 = mat2(0.80, -0.60, 0.60, 0.80);

  float os_fbm2D(vec2 p) {
    float f = 0.0;
    f += 0.5000 * os_noise2D(p); p = os_m2 * p * 2.02;
    f += 0.2500 * os_noise2D(p); p = os_m2 * p * 2.03;
    f += 0.1250 * os_noise2D(p); p = os_m2 * p * 2.01;
    f += 0.0625 * os_noise2D(p);
    return f / 0.9375;
  }

  float os_fbm5(vec2 p) {
    float f = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      f += a * os_noise2D(p);
      p = os_m2 * p * 2.03 + vec2(7.1, 3.7);
      a *= 0.5;
    }
    return f / 0.96875;
  }

  float os_billowFBM(vec2 p) {
    float f = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      float n = os_noise2D(p);
      float billow = 1.0 - abs(n * 2.0 - 1.0);
      f += a * pow(max(1e-5, billow), 1.25);
      p = os_m2 * p * 2.05 + vec2(4.2, 8.9);
      a *= 0.5;
    }
    return f / 0.9375;
  }

  // --------------------------------------------------------------------------
  // 2D Cellular Voronoi with Rounded Organic Distance Metric
  // --------------------------------------------------------------------------
  vec2 os_voronoi2D(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float f1 = 8.0;
    float f2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = os_hash22(n + g);
        vec2 r = g - f + (0.12 + 0.76 * o);
        float d = dot(r, r);
        if (d < f1) {
          f2 = f1;
          f1 = d;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
    return sqrt(max(vec2(1e-5), vec2(f1, f2)));
  }

  // --------------------------------------------------------------------------
  // Deeply Curved Parabolic Swash Lobes (z varying between 1.95m and 3.25m)
  // --------------------------------------------------------------------------
  float os_getPrimarySwashLineZ(float x, float time) {
    float surge = sin(time * 0.68) * 0.08 + cos(time * 0.37) * 0.04;
    float leftTongue  = 1.02 * exp(-pow(abs(x + 1.35) / 1.85, 2.0));
    float rightTongue = 0.64 * exp(-pow(abs(x - 2.85) / 1.95, 2.0));
    float centerBay   = -0.26 * exp(-pow(abs(x - 0.85) / 1.25, 2.0));
    float scallop     = sin(x * 1.15 + 0.4) * 0.10
                      + cos(x * 2.35 - 0.7) * 0.05
                      + (os_noise2D(vec2(x * 0.75, time * 0.12)) - 0.5) * 0.09;
    return 2.08 + leftTongue + rightTongue + centerBay + scallop + surge;
  }

  float os_getSecondaryBoreLineZ(float x, float time) {
    float surge2 = sin(time * 0.68 - 0.85) * 0.07;
    float leftLobe2  = 0.76 * exp(-pow(abs(x + 0.65) / 2.10, 2.0));
    float rightLobe2 = 0.50 * exp(-pow(abs(x - 2.35) / 1.80, 2.0));
    float scallop2   = sin(x * 1.45 - 0.5) * 0.11 + cos(x * 2.80 + 1.1) * 0.05;
    return 1.10 + leftLobe2 + rightLobe2 + scallop2 + surge2;
  }

  // --------------------------------------------------------------------------
  // 1. BATHYMETRY: C1-Smooth Nearshore & Wet Beach + Deep Underwater Reef/Sandbar
  // --------------------------------------------------------------------------
  float getBathymetry(vec2 xz) {
    float shoreCurve = 0.85 * exp(-pow(abs(xz.x + 1.35) / 2.10, 2.0))
                     + 0.45 * exp(-pow(abs(xz.x - 2.85) / 2.10, 2.0))
                     + sin(xz.x * 0.28) * 0.15;
    float zRel = xz.y - (2.42 + shoreCurve * 0.45);

    float beachSlope = zRel * 0.080;
    float deepBase   = -3.75;

    float deepMask   = 1.0 - smoothstep(-18.0, -11.5, xz.y);
    float sandWaves  = sin(xz.y * 1.15 + sin(xz.x * 0.65) * 1.2) * 0.12;
    float flankMound = smoothstep(3.0, 5.8, abs(xz.x)) * (os_fbm2D(xz * 0.45) * 0.65);
    float deepFloor  = deepBase + (sandWaves + flankMound) * deepMask;

    float deepBlend  = 1.0 - smoothstep(-14.0, -4.0, zRel);
    return mix(beachSlope, deepFloor, deepBlend);
  }

  // --------------------------------------------------------------------------
  // 2. TURBULENT CURL-WARPED SURF & SWASH FOAM LACE
  // --------------------------------------------------------------------------
  float evalOrganicSwashFoam(vec2 xz, float swashLineZ, float time) {
    float distFromLip = swashLineZ - xz.y;
    if (distFromLip < -0.05) return 0.0;

    float lobePhase = xz.y - swashLineZ * 0.52;
    vec2 flowUV = vec2(xz.x * 2.85, lobePhase * 7.20 - time * 0.55);

    vec2 warp1 = vec2(
      os_fbm2D(flowUV * 0.48 + vec2(1.7, 3.2)) - 0.5,
      os_fbm2D(flowUV * 0.48 + vec2(5.4, 8.1)) - 0.5
    ) * 2.35;
    vec2 warp2 = vec2(
      os_fbm2D((flowUV + warp1) * 1.15 + vec2(8.2, 1.4)) - 0.5,
      os_fbm2D((flowUV + warp1) * 1.15 + vec2(2.9, 6.7)) - 0.5
    ) * 1.15;
    vec2 q = flowUV + warp1 + warp2;

    vec2 v1 = os_voronoi2D(q * vec2(1.15, 1.35));
    float edge1 = v1.y - v1.x + (os_fbm2D(q * 2.8) - 0.5) * 0.14;
    float web1  = 1.0 - smoothstep(0.02, 0.16, max(0.0, edge1));

    vec2 v2 = os_voronoi2D(q * vec2(2.70, 3.10) + vec2(4.1, -time * 0.35));
    float edge2 = v2.y - v2.x;
    float web2  = (1.0 - smoothstep(0.025, 0.22, edge2)) * (1.0 - smoothstep(0.04, 0.38, v1.y - v1.x));

    float frothTurb = os_fbm5(vec2(xz.x * 9.5, xz.y * 18.5 - time * 1.2) + warp1 * 1.5);
    float billowSheet = os_billowFBM(vec2(xz.x * 3.8, lobePhase * 8.5 - time * 0.8) + warp1 * 0.6);

    float streamMask = smoothstep(0.28, 0.68, os_fbm2D(flowUV * 0.55 + warp1 * 0.35));

    float innerBoreZ = os_getSecondaryBoreLineZ(xz.x, time);
    float innerBoreStep = exp(-pow(abs(xz.y - innerBoreZ) / 0.26, 2.0)) * (0.45 + 0.65 * billowSheet);
    float outerSwashLip = exp(-pow(max(0.0, distFromLip) / 0.28, 2.0)) * (0.48 + 0.55 * frothTurb);

    float rawLace = (web1 * 0.68 + web2 * 0.52 + billowSheet * 0.36) * (0.40 + 0.85 * frothTurb) * streamMask;
    float combined = rawLace + innerBoreStep * 0.72 + outerSwashLip * 0.75;

    float insideSwash = 1.0 - smoothstep(-0.015, 0.025, xz.y - swashLineZ);
    return clamp(smoothstep(0.22, 0.72, combined) * insideSwash, 0.0, 1.0);
  }

  float evalOrganicSwashFoam(vec2 xz, float time) {
    float swashLineZ = os_getPrimarySwashLineZ(xz.x, time);
    return evalOrganicSwashFoam(xz, swashLineZ, time);
  }

  // --------------------------------------------------------------------------
  // Turbulent Stretched Sea-Foam Lace Inside the Concave Emerald Barrel
  // Matches ref_v2_hyperreal_wave_shore.jpg:
  // - Central-left hollow pocket (x in [-0.35, +1.45]): rich organic cellular
  //   foam windows stretching up the lower-to-mid concave emerald face
  // - Right-hand hollow wall (x in [+1.25, +4.6]): vertical wispy spray/foam
  //   veins running down the dark translucent emerald-teal wave wall!
  // --------------------------------------------------------------------------
  float os_evalBarrelCellularWeb(vec2 xz, float waveH, float barrelFace, float time) {
    if (barrelFace <= 0.02) return 0.0;

    float pocketXMask = smoothstep(-0.55, -0.05, xz.x) * (1.0 - smoothstep(1.05, 1.85, xz.x));
    float lowerFaceY  = (1.0 - smoothstep(0.28, 0.54, waveH)) * smoothstep(0.02, 0.16, waveH);

    // Vertical frothy veins & spray curtains on the right-hand emerald wall (x > 1.15)
    float rightWallVeins = smoothstep(0.95, 1.65, xz.x)
                         * (1.0 - smoothstep(0.38, 0.64, waveH))
                         * smoothstep(0.48, 0.78, os_fbm5(vec2(xz.x * 6.5, (xz.y + 1.86) * 12.0 - time * 2.0))) * 0.52;

    if (pocketXMask * lowerFaceY <= 0.005 && rightWallVeins <= 0.005) return 0.0;

    vec2 wallUV = vec2(
      xz.x * 5.20 + xz.y * 1.40,
      (xz.y + 1.86) * 8.80 - waveH * 5.40 - time * 1.35
    );
    vec2 warp = vec2(
      os_fbm2D(wallUV * 0.55 + vec2(2.1, 4.7)) - 0.5,
      os_fbm2D(wallUV * 0.55 + vec2(8.3, 1.9)) - 0.5
    ) * 1.85;
    vec2 q = wallUV + warp;

    vec2 vMain = os_voronoi2D(q);
    float eMain = vMain.y - vMain.x + (os_fbm2D(q * 2.4) - 0.5) * 0.12;
    float mainFilaments = 1.0 - smoothstep(0.018, 0.14, max(0.0, eMain));

    vec2 vSub = os_voronoi2D(q * 2.35 + vec2(3.7, 1.4));
    float eSub = vSub.y - vSub.x;
    float subFilaments = (1.0 - smoothstep(0.022, 0.18, eSub)) * (1.0 - smoothstep(0.04, 0.32, vMain.y - vMain.x));

    float frothMod = 0.45 + 0.75 * os_fbm5(q * 3.2);
    float pocketWeb = (mainFilaments * 0.82 + subFilaments * 0.58) * frothMod * pocketXMask * lowerFaceY;

    return clamp((pocketWeb + rightWallVeins) * barrelFace, 0.0, 0.90);
  }

  // --------------------------------------------------------------------------
  // 3. WIDE SWEEPING ASYMMETRIC TROCHOIDAL WAVE PACKET & 8-DIRECTION SPECTRUM
  // --------------------------------------------------------------------------
  float evalOceanWave(
    vec2 xz,
    float time,
    float chopScale,
    bool useHiFreq,
    out float curlFactor,
    out float foamCrest,
    out float barrelFace
  ) {
    float floorY = getBathymetry(xz);
    float waterDepth = max(0.0, -floorY);
    float cs = max(0.2, chopScale);

    // ========================================================================
    // A) WIDE SWEEPING RIGHT-OF-CENTER PLUNGING EMERALD WAVE (x in [-0.85, +6.5], z ~ -1.86)
    // ========================================================================
    float rightPacketMask = smoothstep(-1.25, -0.22, xz.x) * (1.0 - smoothstep(5.8, 8.2, xz.x));

    float crestHeightMod  = 0.90
                          + 0.18 * exp(-pow(abs(xz.x - 0.55) / 1.45, 2.0))
                          + 0.08 * smoothstep(1.2, 3.8, xz.x)
                          + 0.06 * sin(xz.x * 1.05 - 0.2)
                          + (os_noise2D(xz * 0.55 + vec2(0.0, time * 0.15)) - 0.5) * 0.09;

    float pocketCurve = -0.20 * exp(-pow(abs(xz.x - 0.45) / 1.65, 2.0))
                      + 0.14 * smoothstep(1.4, 4.2, xz.x)
                      + sin(xz.x * 0.38 + 0.2) * 0.14
                      + (os_noise2D(xz * 0.65) - 0.5) * 0.10;

    float zBreaker = -1.86 + pocketCurve;
    float dz       = xz.y - zBreaker; // dz > 0 is shoreward front wall, dz < 0 is seaward back slope

    float sigmaFront = 0.44;
    float sigmaBack  = 1.35;
    float asymPitch  = (dz >= 0.0)
      ? exp(-pow(dz / sigmaFront, 2.0))
      : exp(-pow(abs(dz) / sigmaBack, 2.0));

    float concaveLip     = exp(-pow(abs(dz - 0.16) / 0.28, 2.0)) * 0.25;
    float troughDrawdown = -0.18 * exp(-pow(abs(dz - 0.70) / 0.50, 2.0));

    float organicFace = (os_fbm2D(vec2(xz.x * 3.2, xz.y * 4.2 - time * 1.5)) - 0.5) * 0.042 * asymPitch;

    float heroAmp  = 0.74 * rightPacketMask * crestHeightMod * smoothstep(0.02, 0.22, waterDepth) * cs;
    float heroWave = (asymPitch + concaveLip + troughDrawdown + organicFace) * heroAmp;

    // ========================================================================
    // B) LEFT-OF-CENTER DIAGONAL SWELL RIDGES (x in [-6.5, -0.2], z in [-6.0, -1.3])
    // ========================================================================
    float leftOpenMask = 1.0 - smoothstep(-1.10, 0.20, xz.x);

    float diagCoord1 = xz.y + 2.38 - xz.x * 0.32 + sin(xz.x * 0.55) * 0.20;
    float leftSwell1 = exp(-pow(abs(diagCoord1) / 0.75, 2.0)) * 0.34 * leftOpenMask * cs;

    float diagCoord2 = xz.y + 4.55 - xz.x * 0.26 + cos(xz.x * 0.48) * 0.24;
    float leftSwell2 = exp(-pow(abs(diagCoord2) / 0.92, 2.0)) * 0.28 * (1.0 - smoothstep(-0.3, 1.5, xz.x)) * cs;

    float outerPhase = xz.y + 8.0 + sin(xz.x * 0.28) * 0.42;
    float outerSwell = exp(-pow(abs(outerPhase) / 1.40, 2.0)) * 0.26 * smoothstep(-22.0, -5.0, xz.y) * cs;

    // ========================================================================
    // C) TURBULENT SURF-ZONE BORE STEPS AHEAD OF THE WAVE (z in [-0.6, +1.5])
    // ========================================================================
    float boreZ1 = -0.34 + sin(xz.x * 0.52 + 0.4) * 0.26 + (os_noise2D(xz * 0.75) - 0.5) * 0.15;
    float bore1  = exp(-pow(abs(xz.y - boreZ1) / 0.36, 2.0)) * 0.11 * cs;

    float boreZ2 = os_getSecondaryBoreLineZ(xz.x, time);
    float bore2  = exp(-pow(abs(xz.y - boreZ2) / 0.26, 2.0)) * 0.065 * cs;

    // ========================================================================
    // D) 8-DIRECTION JONSWAP / GERSTNER CAPILLARY & WIND-WAVE SPECTRUM
    // ========================================================================
    float chop = 0.0;
    vec2 d0 = vec2( 0.18,  0.98);
    vec2 d1 = vec2(-0.29,  0.96);
    vec2 d2 = vec2( 0.42,  0.91);
    vec2 d3 = vec2(-0.48,  0.88);
    vec2 d4 = vec2( 0.62,  0.78);
    vec2 d5 = vec2(-0.66,  0.75);
    vec2 d6 = vec2( 0.11,  0.99);
    vec2 d7 = vec2(-0.16,  0.99);

    float ph0 = dot(xz, d0) * 1.25 - time * 2.15;
    float ph1 = dot(xz, d1) * 1.78 - time * 2.55;
    float ph2 = dot(xz, d2) * 2.65 - time * 3.10;
    float ph3 = dot(xz, d3) * 3.70 - time * 3.65;

    chop += (sin(ph0) * 0.75 + (0.5 - abs(sin(ph0 * 0.5))) * 0.25) * 0.052;
    chop += (sin(ph1) * 0.75 + (0.5 - abs(sin(ph1 * 0.5))) * 0.25) * 0.036;
    chop += sin(ph2) * 0.022;
    chop += sin(ph3) * 0.014;

    if (useHiFreq) {
      float ph4 = dot(xz, d4) * 5.40 - time * 4.35;
      float ph5 = dot(xz, d5) * 7.80 - time * 5.10;
      float ph6 = dot(xz, d6) * 11.5 - time * 6.20;
      float ph7 = dot(xz, d7) * 16.8 - time * 7.40;

      float shallowDamp = 1.0 - 0.72 * smoothstep(0.2, 2.3, xz.y);
      chop += sin(ph4) * 0.0095 * shallowDamp;
      chop += sin(ph5) * 0.0062 * shallowDamp;
      chop += sin(ph6) * 0.0038 * shallowDamp;
      chop += sin(ph7) * 0.0022 * shallowDamp;
      chop += (os_noise2D(xz * 6.5 + vec2(0.0, -time * 2.0)) - 0.5) * 0.015 * shallowDamp;
    }
    chop *= (0.38 + 0.62 * smoothstep(0.0, 0.22, waterDepth)) * cs;

    // ========================================================================
    // E) DOUBLE PARABOLIC SWASH RUN-UP & RAISED 3D CAPILLARY MENISCUS LIP
    // ========================================================================
    float swashLineZ = os_getPrimarySwashLineZ(xz.x, time);
    float distInsideSwash = swashLineZ - xz.y;
    float swashActive = smoothstep(0.0, 0.42, distInsideSwash);

    float meniscusRidge = exp(-pow(abs(distInsideSwash - 0.028) / 0.042, 2.0)) * 0.016
                        * smoothstep(-0.01, 0.02, distInsideSwash);

    float swashSheet = floorY + max(0.0, distInsideSwash) * 0.062 + meniscusRidge + chop * 0.55 * swashActive;
    float oceanRawH  = heroWave + leftSwell1 + leftSwell2 + outerSwell + bore1 + bore2 + chop;

    float tSwash = smoothstep(0.55, 1.95, xz.y);
    float finalWaveH = mix(oceanRawH, swashSheet, tSwash);

    // ========================================================================
    // F) OUTPUT MASKS: barrelFace, curlFactor, foamCrest
    // Strictly keep the middle-to-upper wave wall (wH in [0.22, 0.48]) OPEN across
    // both the center and right side so the translucent sea-emerald barrel shines through!
    // ========================================================================
    float faceZone   = exp(-pow(abs(dz - 0.18) / 0.38, 2.0));
    float hollowOpen = smoothstep(-0.75, -0.10, xz.x);
    barrelFace = clamp(faceZone * rightPacketMask * hollowOpen * 1.45, 0.0, 1.40);

    float highFreqBreakup = os_fbm5(xz * vec2(8.5, 11.0) - vec2(0.0, time * 2.1));
    float billowBreakup   = os_billowFBM(xz * vec2(3.6, 5.2) - vec2(0.0, time * 1.4));

    // a) Very thin ragged top curling lip ONLY right at the top crest (wH > 0.45, dz ~ -0.03)
    float topCrestOnly = smoothstep(0.42, 0.56, finalWaveH)
                       * exp(-pow(abs(dz + 0.03 + (highFreqBreakup - 0.5) * 0.06) / 0.075, 2.0))
                       * rightPacketMask;

    // b) Center-left pitching nose plume (narrow, at x ~ -0.68)
    float centerLeftNose = exp(-pow(abs(dz - 0.14) / 0.24, 2.0))
                         * exp(-pow(abs(xz.x + 0.68 + (billowBreakup - 0.5) * 0.18) / 0.22, 2.0))
                         * (0.50 + 0.65 * billowBreakup);

    // c) Lower tumbling whitewater apron strictly at the TOE/BASE of the right-hand wave (wH < 0.25 and dz > 0.42)!
    // Never climbs onto the middle/upper right wave face!
    float lowToeHeightMask = 1.0 - smoothstep(0.16, 0.26, finalWaveH);
    float rightToeApron    = exp(-pow(abs(dz - 0.56 + (billowBreakup - 0.5) * 0.16) / 0.24, 2.0))
                           * smoothstep(1.35, 2.25, xz.x)
                           * lowToeHeightMask
                           * rightPacketMask;

    // d) Thin wispy spray veil divider at x ~ 1.38 (semi-transparent so green water still shows through)
    float rightSprayRib = exp(-pow(abs(xz.x - 1.38 + (highFreqBreakup - 0.5) * 0.18) / 0.14, 2.0))
                        * exp(-pow(abs(dz - 0.18) / 0.26, 2.0))
                        * highFreqBreakup * 0.55;

    curlFactor = clamp(topCrestOnly * 0.90 + centerLeftNose * 1.10 + rightToeApron * 1.15 + rightSprayRib, 0.0, 1.35);

    float microDroplets = os_fbm5(xz * vec2(19.0, 26.0) - vec2(0.0, time * 3.2));
    float raggedMod     = 0.36 + 0.42 * billowBreakup + 0.45 * microDroplets;

    float lipFoam      = smoothstep(0.28, 0.68, topCrestOnly * raggedMod);
    float shoulderFoam = smoothstep(0.24, 0.66, (centerLeftNose + rightToeApron + rightSprayRib * 0.75) * raggedMod);
    float leftBoreFoam = smoothstep(0.32, 0.68, exp(-pow(abs(diagCoord1 - 0.12) / 0.30, 2.0)) * leftOpenMask * raggedMod) * 0.82;
    float leftOuterFm  = smoothstep(0.36, 0.72, exp(-pow(abs(diagCoord2 - 0.10) / 0.36, 2.0)) * leftOpenMask * raggedMod) * 0.68;
    float surfBoreFoam = smoothstep(0.30, 0.68, (exp(-pow(abs(xz.y - boreZ1) / 0.25, 2.0)) * 0.76 + exp(-pow(abs(xz.y - boreZ2) / 0.20, 2.0)) * 0.70) * raggedMod);

    foamCrest = clamp(lipFoam + shoulderFoam + leftBoreFoam + leftOuterFm + surfBoreFoam, 0.0, 1.0);

    return finalWaveH;
  }

  // 8-argument overload for backward compatibility
  void evalOceanWave(
    vec2 xz,
    float time,
    bool detail,
    out float waveH,
    out float whitecapPlume,
    out float emeraldWall,
    out float swashZoneMask,
    out float swashLipLine
  ) {
    float curlF, foamC, barrelF;
    waveH = evalOceanWave(xz, time, 1.0, detail, curlF, foamC, barrelF);
    whitecapPlume = foamC;
    emeraldWall   = barrelF;

    float swashLineZ = os_getPrimarySwashLineZ(xz.x, time);
    swashZoneMask = smoothstep(-1.55, -0.15, xz.y)
                  * (1.0 - smoothstep(swashLineZ - 0.12, swashLineZ + 0.01, xz.y));

    float distToLip  = xz.y - (swashLineZ - 0.025);
    float lipPores   = os_fbm5(xz * vec2(10.0, 16.0) + vec2(0.0, -time * 0.4));
    float thinEdge   = exp(-pow(abs(distToLip) * 34.0, 2.0));
    float behindMask = smoothstep(-0.30, 0.0, distToLip) * (1.0 - smoothstep(0.0, 0.035, distToLip));
    swashLipLine = clamp(thinEdge * (0.84 + 0.40 * lipPores) + behindMask * smoothstep(0.34, 0.64, lipPores) * 0.76, 0.0, 1.0);
  }

  // --------------------------------------------------------------------------
  // 4. DISTANCE-FILTERED WAVE NORMALS (Toksvig / LEAN Anti-Aliasing)
  // --------------------------------------------------------------------------
  vec3 getOceanNormal(vec2 xz, float time, float chopScale, float eps, bool useHiFreq) {
    float e = max(0.012, eps);
    float c0, f0, b0, cX, fX, bX, cZ, fZ, bZ;
    float h0 = evalOceanWave(xz, time, chopScale, useHiFreq, c0, f0, b0);
    float hX = evalOceanWave(xz + vec2(e, 0.0), time, chopScale, useHiFreq, cX, fX, bX);
    float hZ = evalOceanWave(xz + vec2(0.0, e), time, chopScale, useHiFreq, cZ, fZ, bZ);

    float distAtten = mix(1.0, 0.55, smoothstep(0.025, 0.28, e));
    return normalize(vec3((h0 - hX) * distAtten, e, (h0 - hZ) * distAtten));
  }

  vec3 getOceanNormal(vec2 xz, float time, float dist) {
    float eps = clamp(0.014 + dist * dist * 0.00026, 0.014, 0.36);
    bool useHiFreq = (dist < 28.0);
    return getOceanNormal(xz, time, 1.0, eps, useHiFreq);
  }

  float os_evalWaveCaustics(vec2 xz, float time) {
    vec2 warp = vec2(
      os_fbm2D(xz * 0.90 + time * 0.20) - 0.5,
      os_fbm2D(xz * 0.90 - time * 0.18 + 5.2) - 0.5
    ) * 1.05;
    vec2 p = xz * 1.45 + warp;
    float c1 = 1.0 - abs(sin(p.x * 2.7 + time * 0.95 + cos(p.y * 2.3 - time * 0.75)));
    float c2 = 1.0 - abs(sin((p.x * 0.7 - p.y * 0.7) * 3.2 - time * 0.85 + sin((p.x + p.y) * 2.2)));
    return clamp(pow(max(1e-5, clamp(c1 * 0.55 + c2 * 0.45, 0.0, 1.0)), 4.2) * 1.65, 0.0, 1.8);
  }

  // --------------------------------------------------------------------------
  // Fast Reflected Sky & Golden Cumulus Cloud Dome Evaluator for Water & Wet Sand
  // --------------------------------------------------------------------------
  vec3 os_evalReflectedSky(vec3 R, float uTime, float uTwilight, vec3 sunDir, vec3 sunCol, vec3 skyBg) {
    float ry = max(R.y, 0.002);
    float mu = max(1e-5, dot(R, sunDir));
    float az = atan(R.x, -R.z);

    float twi = clamp(uTwilight, 0.0, 1.0);
    vec3 zenithCol  = mix(vec3(0.003, 0.018, 0.062), vec3(0.015, 0.11, 0.34), 1.0 - twi);
    vec3 midSkyCol  = mix(vec3(0.008, 0.038, 0.115), vec3(0.08, 0.28, 0.58), 1.0 - twi);
    vec3 sunHoriz   = mix(vec3(0.45, 0.72, 0.95), vec3(1.38, 0.52, 0.11), twi);
    vec3 flankHoriz = mix(vec3(0.14, 0.28, 0.48), vec3(0.11, 0.10, 0.18), twi);

    float sunAzFocus = pow(mu, 6.0);
    vec3 horizBand   = mix(flankHoriz, sunHoriz, sunAzFocus);

    vec3 reflSky = mix(midSkyCol, zenithCol, smoothstep(0.08, 0.38, ry));
    reflSky      = mix(reflSky, horizBand, exp(-ry * 20.0));

    reflSky += sunCol * (pow(mu, 8.0) * exp(-ry * 6.5) * 0.62 + pow(mu, 48.0) * exp(-ry * 9.0) * 0.95);

    if (ry < 0.46) {
      vec2 domeUV = vec2(az * 0.72 + uTime * 0.0035, ry * 1.05);
      float leftMaxY  = clamp(0.18 - (domeUV.x + 0.05) * 0.65, 0.05, 0.45);
      float leftBank  = (1.0 - smoothstep(-0.22, 0.08, domeUV.x)) * (1.0 - smoothstep(leftMaxY - 0.09, leftMaxY + 0.08, domeUV.y));
      float rightMaxY = clamp(0.09 + (domeUV.x - 0.08) * 0.42, 0.05, 0.28);
      float rightBank = smoothstep(0.05, 0.25, domeUV.x) * (1.0 - smoothstep(rightMaxY - 0.06, rightMaxY + 0.07, domeUV.y));
      float lowDeck   = (1.0 - smoothstep(0.008, 0.125, domeUV.y)) * 0.78;

      float baseMask = clamp(max(max(leftBank, rightBank), lowDeck), 0.0, 1.0) * smoothstep(0.002, 0.015, domeUV.y);
      if (baseMask > 0.01) {
        float billow = os_billowFBM(domeUV * 7.2);
        float dens   = smoothstep(0.64 - baseMask * 0.42, 0.86 - baseMask * 0.16, billow) * baseMask;
        vec3 cloudShadow = vec3(0.045, 0.052, 0.105);
        vec3 cloudWarm   = mix(vec3(0.96, 0.38, 0.12), vec3(1.42, 0.84, 0.34), pow(mu, 1.6) * 0.65 + 0.35 * billow);
        vec3 cloudCol    = mix(cloudShadow, cloudWarm, clamp(0.32 + 0.64 * billow + 0.30 * exp(-ry * 9.0), 0.0, 1.0));
        reflSky = mix(reflSky, cloudCol, smoothstep(0.0, 0.32, dens) * 0.94);
      }
    }
    return reflSky;
  }

  // --------------------------------------------------------------------------
  // Backlit Flying Spindrift Spray & Ragged Mist Plumes Erupting off the Crest
  // --------------------------------------------------------------------------
  vec4 os_evalSpindriftSpray(vec3 ro, vec3 rd, float maxT, float uTime, vec3 sunDir, vec3 sunCol) {
    if (abs(rd.z) < 1e-4) return vec4(0.0);
    float tCrest = (-1.86 - ro.z) / rd.z;
    if (tCrest <= 0.2 || tCrest > maxT + 0.45) return vec4(0.0);

    vec3 pCrest = ro + rd * tCrest;
    float xEnv = smoothstep(-1.10, -0.30, pCrest.x) * (1.0 - smoothstep(4.2, 5.8, pCrest.x));
    if (xEnv <= 0.005) return vec4(0.0);

    float pocketCurve = -0.20 * exp(-pow(abs(pCrest.x - 0.45) / 1.65, 2.0))
                      + 0.14 * smoothstep(1.4, 4.2, pCrest.x)
                      + sin(pCrest.x * 0.38 + 0.2) * 0.14;
    float crestY = (0.63 + 0.14 * exp(-pow(abs(pCrest.x - 0.55) / 1.45, 2.0))
                 + 0.05 * sin(pCrest.x * 1.05 - 0.2) - pocketCurve * 0.08);
    float dy = pCrest.y - crestY;

    if (dy < -0.16 || dy > 0.65) return vec4(0.0);

    float vertEnv = smoothstep(-0.15, 0.01, dy) * exp(-max(0.0, dy) * 4.8);

    vec2 sprayUV   = vec2(pCrest.x * 3.8 - dy * 1.4 - uTime * 0.45, dy * 6.2 - uTime * 1.85);
    float wisp1    = os_billowFBM(sprayUV);
    float wisp2    = os_fbm5(sprayUV * 2.8 + vec2(3.7, -uTime * 1.3));
    float fineMist = os_fbm5(vec2(pCrest.x * 18.0, dy * 26.0 - uTime * 3.8));
    float droplets = os_noise2D(vec2(pCrest.x * 42.0, dy * 52.0 - uTime * 5.2));

    float plumeFingers = pow(max(1e-5, clamp(wisp1 * 0.55 + wisp2 * 0.45, 0.0, 1.0)), 1.55);
    float sprayDensity = smoothstep(0.28, 0.72, plumeFingers + vertEnv * 0.26)
                       * (0.55 + 0.45 * fineMist)
                       * (0.65 + 0.35 * smoothstep(0.42, 0.80, droplets))
                       * vertEnv * xEnv;

    float mu = max(1e-5, dot(rd, sunDir));
    vec3 sprayCol = mix(
      vec3(0.80, 0.89, 0.94),
      vec3(1.22, 0.86, 0.58) + sunCol * 0.40,
      0.52 + 0.48 * pow(mu, 1.8)
    );

    return vec4(sprayCol, clamp(sprayDensity * 0.82, 0.0, 0.85));
  }

  // --------------------------------------------------------------------------
  // 5. COMPLETE ABOVE-WATER SHADING & RAYMARCHING
  // --------------------------------------------------------------------------
  vec3 shadeAboveWater(
    vec3 ro,
    vec3 rd,
    float uTime,
    float uTwilight,
    float uChop,
    vec3 sunDir,
    vec3 sunCol,
    vec3 skyBg
  ) {
    bool hitSurface = false;
    vec3 hitPos = ro;
    float tHit = 900.0;

    if (rd.y < 0.065) {
      float tMin = 0.25;
      float tMax = (rd.y < -0.0002) ? min(900.0, (ro.y + 1.8) / -rd.y) : 45.0;
      float t = tMin;
      float prevT = tMin;

      for (int i = 0; i < 80; i++) {
        vec3 p = ro + rd * t;
        float cF, fC, bF;
        float wH = evalOceanWave(p.xz, uTime, uChop, false, cF, fC, bF);
        float fY = getBathymetry(p.xz);
        float surfY = max(wH, fY);
        float diff = p.y - surfY;

        if (diff < 0.0) {
          float lo = prevT;
          float hi = t;
          for (int b = 0; b < 6; b++) {
            float mid = 0.5 * (lo + hi);
            vec3 mp = ro + rd * mid;
            float mcF, mfC, mbF;
            float mwH = evalOceanWave(mp.xz, uTime, uChop, false, mcF, mfC, mbF);
            float mfY = getBathymetry(mp.xz);
            if (mp.y > max(mwH, mfY)) lo = mid;
            else hi = mid;
          }
          tHit = 0.5 * (lo + hi);
          hitPos = ro + rd * tHit;
          hitSurface = true;
          break;
        }
        prevT = t;
        t += max(0.055, diff * 0.46 + t * 0.024);
        if (t > tMax) break;
      }

      // CRITICAL FIX: For near-horizon downward rays (rd.y in [-0.025, -0.0002]) that
      // exceed the raymarch loop range, analytically intersect the distant ocean plane
      // so there is NEVER a flat sky/beige band below the coastal headland!
      if (!hitSurface && rd.y < -0.0002) {
        tHit = min(900.0, max(0.3, (ro.y - 0.02) / -rd.y));
        hitPos = ro + rd * tHit;
        hitSurface = true;
      }
    }

    vec4 spindrift = os_evalSpindriftSpray(ro, rd, tHit, uTime, sunDir, sunCol);

    if (!hitSurface) {
      return mix(skyBg, spindrift.rgb, spindrift.a);
    }

    float curlFactor, foamCrest, barrelFace;
    float wH = evalOceanWave(hitPos.xz, uTime, uChop, true, curlFactor, foamCrest, barrelFace);
    float floorY = getBathymetry(hitPos.xz);
    float swashLineZ = os_getPrimarySwashLineZ(hitPos.xz.x, uTime);

    float distToLip  = hitPos.z - (swashLineZ - 0.025);
    float lipPores   = os_fbm5(hitPos.xz * vec2(11.0, 18.0) + vec2(0.0, -uTime * 0.38));
    float thinEdge   = exp(-pow(abs(distToLip) * 38.0, 2.0));
    float behindMask = smoothstep(-0.30, 0.0, distToLip) * (1.0 - smoothstep(0.0, 0.035, distToLip));
    float swashLipLine = clamp(
      thinEdge * (0.85 + 0.40 * lipPores) + behindMask * smoothstep(0.34, 0.66, lipPores) * 0.76,
      0.0,
      1.0
    );

    bool onExposedWetBeach = (floorY >= wH - 0.002) || (hitPos.z > swashLineZ + 0.015);
    vec3 finalColor = vec3(0.0);

    if (onExposedWetBeach) {
      // ======================================================================
      // CINEMA-GRADE WET BEACH SAND MIRROR
      // - Deep obsidian-umber wet volcanic/coastal sand on the bottom-right
      // - Glowing golden-amber & crimson-gold cloud reflections down the left-center
      // ======================================================================
      float distFromSwash = max(0.0, hitPos.z - swashLineZ);

      float rightDryGrad = smoothstep(0.15, 2.85, hitPos.x) * smoothstep(2.25, 4.10, hitPos.z);
      float wetness = clamp(exp(-distFromSwash * 0.42) * 0.96 - rightDryGrad * 0.44 + 0.12, 0.18, 0.97);

      float grainFilter = 1.0 - smoothstep(1.8, 9.5, tHit);
      vec2 sandUV = hitPos.xz * 32.0;
      float grain = (os_noise2D(sandUV) * 0.55 + os_noise2D(sandUV * 3.4) * 0.45 - 0.5) * grainFilter;

      vec2 pebGrid = hitPos.xz * 14.0;
      vec2 pebId   = floor(pebGrid);
      vec2 pebGv   = fract(pebGrid) - 0.5;
      float pebD   = length(pebGv - (os_hash22(pebId) - 0.5) * 0.65);
      float darkPebble = (1.0 - smoothstep(0.04, 0.12, pebD))
                       * step(0.84, os_hash12(pebId))
                       * smoothstep(2.4, 3.8, hitPos.z)
                       * grainFilter;

      float lipSlopeZ = exp(-pow(abs(distToLip) * 28.0, 2.0)) * 0.085;
      float dampRough = (1.0 - wetness) * 0.028;
      vec3 N_sand = normalize(vec3(
        grain * dampRough,
        1.0,
        0.032 + lipSlopeZ + grain * dampRough
      ));

      vec3 V = -rd;
      vec3 R = reflect(rd, N_sand);
      R.y = max(R.y, 0.018);
      vec3 skyRefl = os_evalReflectedSky(R, uTime, uTwilight, sunDir, sunCol, skyBg);

      // Warm amber-gold boost along the left-center cloud & sun reflection column
      float leftCenterGlow = (1.0 - smoothstep(-0.2, 1.4, hitPos.x)) * exp(-pow(abs(hitPos.x + 0.55) / 1.65, 2.0));
      skyRefl *= mix(vec3(1.0), vec3(1.22, 0.96, 0.76), leftCenterGlow * clamp(uTwilight, 0.0, 1.0));

      // Dark emerald/white wave reflection in the wet sand just ahead of the right-of-center breaker
      float waveReflZone = exp(-pow(abs(hitPos.z - 2.65) / 1.15, 2.0)) * smoothstep(-0.6, 0.8, hitPos.x);
      vec3 waveMirrorTint = mix(vec3(0.008, 0.14, 0.16), vec3(0.22, 0.34, 0.38), smoothstep(1.0, 2.8, hitPos.x));
      skyRefl = mix(skyRefl, waveMirrorTint, waveReflZone * 0.42 * wetness);

      vec3 N_glint = normalize(N_sand + vec3(grain * 0.055, 0.0, (os_noise2D(sandUV * 4.5 + 2.3) - 0.5) * grainFilter * 0.055));
      vec3 H = normalize(sunDir + V);
      float specExp = mix(42.0, 280.0, wetness);
      float specSand = pow(max(1e-5, dot(N_glint, H)), specExp) * wetness * 4.2;

      float lipContactShadow = 1.0 - 0.52 * exp(-pow(abs(distToLip - 0.032) * 44.0, 2.0));
      vec3 baseSand = mix(vec3(0.028, 0.022, 0.020), vec3(0.006, 0.005, 0.005), wetness)
                    * (0.88 + 0.24 * grain) * (1.0 - darkPebble * 0.70) * lipContactShadow;

      float streakNoise = os_fbm5(hitPos.xz * vec2(14.0, 24.0) + vec2(os_fbm2D(hitPos.xz * 3.5) * 1.8, 0.0));
      float swashEdgeStreaks = smoothstep(0.56, 0.82, streakNoise)
                             * exp(-distFromSwash * 9.5)
                             * smoothstep(0.005, 0.045, distFromSwash);

      float rightShadowDamp = 1.0 - 0.36 * smoothstep(0.35, 2.60, hitPos.x);
      float fresnelSand = (0.10 + 0.88 * pow(max(1e-5, 1.0 - max(0.0, dot(N_sand, V))), 2.5)) * wetness * rightShadowDamp;
      vec3 warmAmb = mix(vec3(0.40, 0.60, 0.80), vec3(1.15, 0.48, 0.15), clamp(uTwilight, 0.0, 1.0));
      finalColor = mix(baseSand * (warmAmb * 0.22 + 0.08), skyRefl * 0.88, fresnelSand * 0.88)
                 + sunCol * specSand;

      vec3 frothCol = mix(vec3(0.84, 0.90, 0.96), vec3(1.06, 0.94, 0.82), clamp(uTwilight, 0.0, 1.0) * 0.75);
      float lipSunRim = exp(-pow(abs(distToLip + 0.008) * 55.0, 2.0)) * 0.35;
      finalColor = mix(finalColor, frothCol * 0.85, swashEdgeStreaks * 0.72);
      finalColor = mix(finalColor, frothCol + sunCol * lipSunRim, swashLipLine * 0.96);
    } else {
      // ======================================================================
      // OCEAN WAVES, WIDE EMERALD BARREL, TURBULENT FOAM & DEEP SWELL CONTRAST
      // ======================================================================
      float eps = clamp(0.014 + tHit * tHit * 0.00028, 0.014, 0.42);
      bool useHiFreq = (tHit < 30.0);
      vec3 N = getOceanNormal(hitPos.xz, uTime, uChop, eps, useHiFreq);
      vec3 V = -rd;
      float NdotV = max(0.001, dot(N, V));

      float fresnel = 0.02 + 0.98 * pow(max(1e-5, 1.0 - NdotV), 5.0);

      vec3 R = reflect(rd, N);
      float minReflY = mix(0.008, 0.065, smoothstep(-0.02, 0.16, N.z));
      R.y = max(R.y, minReflY);
      // For far ocean swells (tHit > 12m), tilt reflected ray slightly higher into the dusk sky on forward wave faces so the distant sea has dark slate-blue swell shadows!
      float farTilt = smoothstep(8.0, 55.0, tHit) * clamp(0.35 + N.z * 2.5, 0.0, 1.0) * 0.11;
      vec3 R_ocean = normalize(vec3(R.x, R.y + farTilt, R.z));
      vec3 reflSky = os_evalReflectedSky(R_ocean, uTime, uTwilight, sunDir, sunCol, skyBg);

      // Distance-filtered Toksvig / LEAN specular roughness for liquid golden sun-glitter facets
      float distRoughness = smoothstep(5.0, 75.0, tHit);
      vec3 H = normalize(sunDir + V);
      float NdotH = max(1e-5, dot(N, H));
      float specExpSharp = mix(720.0, 95.0, distRoughness);
      float glitterSharp = pow(NdotH, specExpSharp) * mix(10.5, 2.2, distRoughness);
      float glitterBroad = pow(NdotH, mix(68.0, 24.0, distRoughness)) * 0.65;
      vec3 sunGlitter = sunCol * (glitterSharp + glitterBroad);

      // ======================================================================
      // TRANSLUCENT SEA-EMERALD / AQUAMARINE SUBSURFACE LIGHT TRANSPORT (SSS)
      // Deep photographic jade-emerald in the central backlit pocket (x in [-0.5, +1.4]),
      // transitioning to moody dark oceanic bottle-green/teal across the right wall (x > 1.4)!
      // ======================================================================
      float faceSlope = clamp(N.z * 1.95 + 0.28, 0.0, 1.40);
      float thinCrest = smoothstep(0.06, 0.46, wH);
      float sss = clamp(barrelFace * faceSlope * thinCrest * exp(-tHit * 0.032), 0.0, 1.0);

      float fbmThick = os_fbm2D(hitPos.xz * vec2(1.8, 2.6) + vec2(0.0, -uTime * 0.45));
      float curtainStreaks = os_fbm5(vec2(hitPos.x * 6.5, (hitPos.z + 1.86) * 10.0 - uTime * 1.6));
      float organicThick = smoothstep(0.18, 0.78, fbmThick * 0.50 + curtainStreaks * 0.22 + thinCrest * 0.35);

      float pocketSunGlow = exp(-pow(abs(hitPos.x - 0.15) / 1.35, 2.0));
      vec3 deepOceanTrough = vec3(0.002, 0.022, 0.048);
      vec3 darkEmeraldBase = mix(vec3(0.003, 0.075, 0.095), vec3(0.005, 0.145, 0.160), pocketSunGlow);
      vec3 luminousAqua    = mix(
        vec3(0.008, 0.21, 0.22),
        vec3(0.022, 0.42, 0.36) + sunCol * vec3(0.04, 0.10, 0.04),
        pocketSunGlow
      );
      vec3 seaEmerald = mix(darkEmeraldBase, luminousAqua, organicThick);
      vec3 waterBody  = mix(deepOceanTrough, seaEmerald, sss * 0.96);

      float internalCaust = os_evalWaveCaustics(hitPos.xz * 1.35, uTime * 1.10) * sss;
      waterBody += (vec3(0.03, 0.30, 0.26) + sunCol * 0.08 * pocketSunGlow) * internalCaust * 0.24;

      // Keep surf-zone & distant swell water windows rich dark slate-teal outside the central sun glitter path!
      float sunColumnMask = exp(-pow(abs(hitPos.x + 0.35) / 1.35, 2.0));
      float forwardSlopeMask = clamp(1.0 - N.z * 2.5, 0.0, 1.0);
      float surfZoneDamp = mix(0.68 + 0.32 * sunColumnMask, 0.38 + 0.62 * sunColumnMask, smoothstep(-1.4, 1.8, hitPos.z));
      float openOceanFresnel = fresnel * mix(0.22, 0.78, forwardSlopeMask) * surfZoneDamp;
      float effectiveFresnel = mix(openOceanFresnel, fresnel * 0.30 + 0.02, sss);

      vec3 waterSurface = mix(waterBody, reflSky, clamp(effectiveFresnel, 0.0, 0.84))
                        + sunGlitter * (1.0 - sss * 0.65);

      // ======================================================================
      // 4-LAYER TURBULENT FOAM ARCHITECTURE
      // ======================================================================
      float barrelWeb = os_evalBarrelCellularWeb(hitPos.xz, wH, barrelFace, uTime);

      float swashZoneMask = smoothstep(-1.65, -0.15, hitPos.z)
                          * (1.0 - smoothstep(swashLineZ - 0.10, swashLineZ + 0.02, hitPos.z));
      float organicSwash = evalOrganicSwashFoam(hitPos.xz, swashLineZ, uTime) * swashZoneMask;

      float finePores  = os_fbm5(hitPos.xz * vec2(18.0, 26.0) - vec2(0.0, uTime * 2.4));
      float medBillows = os_billowFBM(hitPos.xz * vec2(6.5, 9.5) - vec2(0.0, uTime * 1.7));
      float rawPlume   = (foamCrest * 0.78 + curlFactor * 0.34) * (0.35 + 0.45 * medBillows + 0.45 * finePores);
      float plumeMask  = smoothstep(0.24, 0.72, rawPlume);

      float totalFoam = clamp(
        plumeMask * 0.94 + barrelWeb * 0.86 + organicSwash * 0.90 + swashLipLine * 0.96,
        0.0,
        0.96
      );

      vec3 foamLitCol    = mix(vec3(0.92, 0.96, 1.0), vec3(1.06, 0.90, 0.76), clamp(uTwilight, 0.0, 1.0));
      vec3 foamShadowCol = mix(vec3(0.055, 0.13, 0.22), seaEmerald * 0.55, sss * 0.60);

      float microBump    = os_fbm5(hitPos.xz * vec2(28.0, 38.0) - vec2(0.0, uTime * 2.8));
      float topBacklight = smoothstep(0.28, 0.66, wH) * curlFactor * 0.36;
      float foamShade    = clamp(
        0.18 + 0.38 * N.y + 0.36 * medBillows + 0.22 * microBump - 0.22 * max(0.0, N.z) + topBacklight,
        0.12,
        1.0
      );
      vec3 foamCol = mix(foamShadowCol, foamLitCol, foamShade);

      foamCol += sunCol * vec3(0.24, 0.13, 0.05) * topBacklight * (0.45 + 0.55 * medBillows);

      finalColor = mix(waterSurface, foamCol, totalFoam);

      // Subtle atmospheric distance mist only near the far horizon
      float horizonFog = 1.0 - exp(-max(0.0, tHit - 45.0) * 0.0010);
      vec3 fogCol = mix(vec3(0.12, 0.22, 0.38), vec3(0.68, 0.36, 0.20), clamp(uTwilight, 0.0, 1.0) * 0.60);
      finalColor = mix(finalColor, fogCol, horizonFog);
    }

    finalColor = mix(finalColor, spindrift.rgb, spindrift.a);
    return finalColor;
  }
`;
