// ============================================================================
// MODULAR UNDERWATER OPTICS, CHROMATIC CAUSTICS, 3D SAND RIPPLES & SNELL'S WINDOW
// Target: Three.js WebGL2 on Apple Silicon Metal
// CRITICAL METAL RULES:
//   1. Every smoothstep(edge0, edge1, x) MUST have edge0 < edge1 strictly.
//   2. Every pow(x, y) MUST have x > 0.0 strictly (use uwSqr(x) for squaring!).
// ============================================================================

export const UNDERWATER_GLSL = /* glsl */ `
  // --------------------------------------------------------------------------
  // Metal-Safe Math & Self-Contained Underwater Noise / Voronoi Helpers
  // --------------------------------------------------------------------------
  float uwSqr(float x) {
    return x * x;
  }

  float uwSafePow(float x, float p) {
    return pow(max(1e-4, x), p);
  }

  float uwHash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec2 uwHash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }

  float uwNoise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(uwHash12(i + vec2(0.0, 0.0)), uwHash12(i + vec2(1.0, 0.0)), u.x),
      mix(uwHash12(i + vec2(0.0, 1.0)), uwHash12(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  const mat2 uwRot2 = mat2(0.80, -0.60, 0.60, 0.80);

  float uwFbm2D(vec2 p) {
    float f = 0.0;
    f += 0.5000 * uwNoise2D(p); p = uwRot2 * p * 2.02;
    f += 0.2500 * uwNoise2D(p); p = uwRot2 * p * 2.03;
    f += 0.1250 * uwNoise2D(p); p = uwRot2 * p * 2.01;
    f += 0.0625 * uwNoise2D(p);
    return f / 0.9375;
  }

  float uwFbm5(vec2 p) {
    float f = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      f += a * uwNoise2D(p);
      p = uwRot2 * p * 2.03 + vec2(5.3, 2.9);
      a *= 0.5;
    }
    return f / 0.96875;
  }

  // Cellular Voronoi edge distance (F2 - F1) for razor-sharp polygonal caustic filaments
  vec2 uwVoronoiEdge(vec2 x, float time) {
    vec2 n = floor(x);
    vec2 f = fract(x);
    float d1 = 8.0;
    float d2 = 8.0;

    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = uwHash22(n + g);
        o = 0.5 + 0.42 * sin(time * 1.05 + 6.2831853 * o);
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) {
          d2 = d;
        }
      }
    }
    return vec2(sqrt(max(0.0, d1)), sqrt(max(0.0, d2)));
  }

  // Razor-sharp single-wavelength caustic filament network (75%+ dark background, thin bright cusps)
  float uwCausticMono(vec2 xz, float time) {
    vec2 warp = vec2(
      uwFbm2D(xz * 0.65 + vec2(time * 0.14, -time * 0.10)) - 0.5,
      uwFbm2D(xz * 0.65 + vec2(-time * 0.12, time * 0.15) + 4.7) - 0.5
    ) * 0.55;
    vec2 p = xz * 0.88 + warp;

    // Primary & secondary Voronoi polygonal caustic cells with tight filament width
    vec2 vA = uwVoronoiEdge(p * 0.86, time);
    vec2 vB = uwVoronoiEdge(uwRot2 * p * 1.48 + vec2(2.3, 5.1), time * 1.10);

    float edgeA = exp(-max(0.0, vA.y - vA.x) * 24.0);
    float cuspA = exp(-vA.x * 3.8) * edgeA;
    float edgeB = exp(-max(0.0, vB.y - vB.x) * 27.0);

    // Sharp wave-interference caustic ridges
    float w1 = 1.0 - abs(sin(p.x * 2.45 + time * 0.85 + cos(p.y * 2.05 - time * 0.68)));
    float w2 = 1.0 - abs(sin((p.x * 0.72 - p.y * 0.69) * 2.95 - time * 0.78 + sin((p.x + p.y) * 1.85)));
    float waveFocus = uwSafePow(clamp(w1 * 0.54 + w2 * 0.46, 0.0, 1.0), 8.5);

    float net = edgeA * 0.88 + cuspA * 0.95 + edgeB * 0.42 + (edgeA * edgeB) * 1.65 + waveFocus * 0.55;
    return clamp(uwSafePow(net, 2.15), 0.0, 2.2);
  }

  // --------------------------------------------------------------------------
  // 1. CHROMATIC CAUSTICS WITH RGB PRISM DISPERSION
  // Matches ref_v2_hyperreal_underwater_snell.jpg: thin golden-white caustic filaments
  // with vivid red/amber & cyan/cobalt prism edges over dark shadowed sand ripples!
  // --------------------------------------------------------------------------
  vec3 evalChromaticCaustics(vec2 xz, float time) {
    vec2 waveGrad = vec2(
      cos(xz.x * 1.35 + xz.y * 0.85 - time * 0.70),
      sin(xz.y * 1.55 - xz.x * 0.75 - time * 0.60)
    );
    vec2 dispDir = normalize(vec2(0.58, 0.81) + waveGrad * 0.42) * 0.072;

    float cR = uwCausticMono(xz + dispDir * 1.25, time);
    float cG = uwCausticMono(xz, time);
    float cB = uwCausticMono(xz - dispDir * 1.25, time);

    float core = min(cR, min(cG, cB));
    float warmFringe = max(0.0, cR - cG * 0.55);
    float coolFringe = max(0.0, cB - cG * 0.55);
    float goldMid    = max(0.0, cG - core * 0.45);

    vec3 col = vec3(0.0);
    col += vec3(1.18, 1.02, 0.76) * core * 1.12;
    col += vec3(1.42, 0.44, 0.04) * warmFringe * 1.18;
    col += vec3(0.04, 0.60, 1.48) * coolFringe * 1.18;
    col += vec3(0.96, 0.86, 0.34) * goldMid * 0.58;

    return max(vec3(0.0), col);
  }

  // --------------------------------------------------------------------------
  // 2. 3D CURRENT-SCULPTED SAND RIPPLES & CORAL/ROCK REEF OUTCROPPING
  // Sharp, sinuous 3D sand ridges (~0.08m amplitude) running across the seabed
  // like ref_v2_hyperreal_underwater_snell.jpg + flanking/mid-distance reef!
  // --------------------------------------------------------------------------
  float getUnderwaterSandHeight(vec2 xz) {
    float baseFloor = -3.68 + 0.07 * sin(xz.x * 0.14) + 0.05 * cos(xz.y * 0.12);

    // Sinuous meandering current-sculpted sand ripples marching from foreground into mid-ground
    float sinuosity = sin(xz.y * 1.35 + sin(xz.x * 1.10) * 0.90) * 0.68
                    + (uwFbm2D(xz * 0.46 + vec2(1.7, 3.1)) - 0.5) * 1.35;

    // Primary sharp asymmetric sand ridges (sharp crest, wide rounded trough)
    float phase1 = xz.x * 4.85 + xz.y * 1.15 + sinuosity * 2.25;
    float asymWave1 = sin(phase1 + 0.36 * cos(phase1));
    float ridge1 = uwSafePow(clamp(0.5 + 0.5 * asymWave1, 0.0, 1.0), 2.35);

    // Secondary braided / bifurcating ripple train creating natural Y-junctions
    float phase2 = xz.x * 3.55 - xz.y * 2.25 + sin(xz.y * 1.65 - xz.x * 0.85) * 1.40
                 + (uwFbm2D(xz * 0.72 + vec2(6.2, 2.4)) - 0.5) * 1.15;
    float asymWave2 = sin(phase2 + 0.28 * sin(phase2));
    float ridge2 = uwSafePow(clamp(0.5 + 0.5 * asymWave2, 0.0, 1.0), 2.55);

    float microRipple = sin(xz.x * 15.0 + xz.y * 9.5 + ridge1 * 2.8) * 0.004;
    float sandRipples = ridge1 * 0.072 + ridge2 * 0.034 + microRipple;

    // Subtle mid-ground & flank coral/rock reef outcropping (smoothly blended so it never creates a jagged ridge)
    float flankDist = abs(xz.x) - 6.4;
    float midReefZ  = 1.0 - smoothstep(-32.0, -23.5, xz.y);
    float reefNoise = uwFbm2D(xz * 0.50 + vec2(2.4, 5.8));
    float reefMask  = smoothstep(-0.6, 2.2, flankDist + reefNoise * 2.0 + midReefZ * 1.4)
                    * (1.0 - smoothstep(-21.5, -18.0, xz.y));
    float reefCrag  = (uwFbm5(xz * 1.65) * 0.60 + reefNoise * 0.40) * 0.48 * reefMask;

    return baseFloor + sandRipples * (1.0 - reefMask * 0.65) + reefCrag;
  }

  vec3 getUnderwaterSandNormal(vec2 xz) {
    float eps = 0.022;
    float h0 = getUnderwaterSandHeight(xz);
    float hX = getUnderwaterSandHeight(xz + vec2(eps, 0.0));
    float hZ = getUnderwaterSandHeight(xz + vec2(0.0, eps));

    float gX = uwNoise2D(xz * 44.0) - 0.5;
    float gZ = uwNoise2D(xz * 44.0 + vec2(17.3, 9.1)) - 0.5;

    vec3 n = vec3(h0 - hX + gX * 0.0016, eps, h0 - hZ + gZ * 0.0016);
    return normalize(n);
  }

  // --------------------------------------------------------------------------
  // 3. SEAFLOOR SHADING WITH HIGH-CONTRAST 3D RIPPLE SHADOWS & CHROMATIC CAUSTICS
  // --------------------------------------------------------------------------
  vec3 shadeSeafloor(vec3 hitPos, vec3 rd, float dist, float time, vec3 sunDir, vec3 sunCol, float twilight) {
    vec3 N = getUnderwaterSandNormal(hitPos.xz);
    vec3 V = -rd;

    vec3 uwLightDir = normalize(vec3(sunDir.x * 0.75, max(0.68, sunDir.y * 0.75 + 0.62), sunDir.z * 0.75));
    float NdotL = clamp(dot(N, uwLightDir), 0.0, 1.0);

    // High-contrast 3D sand ridge crest vs leeward trough shadow
    float slopeLight = smoothstep(-0.26, 0.34, N.x * 0.82 + N.z * 0.42);
    float crestHeight = clamp((hitPos.y + 3.68) / 0.095, 0.0, 1.0);

    float grainCoarse = uwNoise2D(hitPos.xz * 28.0);
    float grainFine   = uwNoise2D(hitPos.xz * 96.0);
    float pebbleSpec  = step(0.88, uwNoise2D(hitPos.xz * 14.0)) * 0.35;
    float sandGrain   = (0.78 + 0.22 * (grainCoarse * 0.6 + grainFine * 0.4)) * (1.0 - pebbleSpec);

    // Rich, dark shadowed troughs + muted olive-slate-grey sunlit sand slopes
    vec3 troughShadowCol = vec3(0.006, 0.026, 0.042);
    vec3 midSlopeCol     = vec3(0.026, 0.080, 0.102);
    vec3 litCrestCol     = vec3(0.070, 0.142, 0.155);

    vec3 sandBase = mix(troughShadowCol, midSlopeCol, slopeLight);
    sandBase = mix(sandBase, litCrestCol, clamp(NdotL * 0.55 + crestHeight * 0.45, 0.0, 1.0));
    sandBase *= sandGrain;

    float flankDist = abs(hitPos.x) - 6.4;
    float midReefZ  = 1.0 - smoothstep(-32.0, -23.5, hitPos.z);
    float reefNoise = uwFbm2D(hitPos.xz * 0.50 + vec2(2.4, 5.8));
    float reefMask  = smoothstep(-0.6, 2.2, flankDist + reefNoise * 2.0 + midReefZ * 1.4)
                    * (1.0 - smoothstep(-21.5, -18.0, hitPos.z));

    vec3 darkReefCol = mix(vec3(0.002, 0.012, 0.022), vec3(0.010, 0.042, 0.062), uwFbm2D(hitPos.xz * 3.8))
                     * (0.35 + 0.65 * NdotL);
    vec3 albedo = mix(sandBase, darkReefCol, reefMask);

    // Project razor-sharp chromatic RGB caustics with 3D normal parallax across the sand ripples
    vec2 caustUV = hitPos.xz * 1.06 + N.xz * 0.22;
    vec3 chromCaust = evalChromaticCaustics(caustUV, time);

    // Fade caustics cleanly before the mid-ground horizon so distant ripples never look noisy
    float caustDistAtten = (1.0 - smoothstep(8.5, 16.5, dist)) * (1.0 - reefMask * 0.92);
    float rippleCatch = (0.30 + 0.70 * slopeLight) * (0.45 + 0.55 * N.y);

    vec3 H = normalize(uwLightDir + V);
    float microGlint = uwSafePow(max(0.0, dot(N, H)), 48.0) * smoothstep(0.68, 0.98, grainFine) * 0.65;

    vec3 causticLight = chromCaust * rippleCatch * caustDistAtten * (0.88 + microGlint);
    vec3 litFloor = albedo + causticLight;

    // Deep Prussian-teal underwater distance attenuation (darker on flanks, luminous in center)
    float flankVignette = exp(-uwSqr(hitPos.x * 0.12));
    vec3 deepScatter = mix(vec3(0.001, 0.024, 0.044), vec3(0.005, 0.105, 0.155), flankVignette * exp(-dist * 0.045));

    return mix(deepScatter, litFloor, exp(-dist * 0.046));
  }

  // --------------------------------------------------------------------------
  // Overhead 3D Multi-Swell Wave Ceiling for Looking Up Underwater
  // --------------------------------------------------------------------------
  float uwEvalCeilingWave(vec2 xz, float time, float chop) {
    float cScale = max(0.35, chop);
    // Primary rolling ocean swells overhead
    float swell1 = sin(xz.y * 1.35 + xz.x * 0.28 - time * 1.95) * 0.145;
    float swell2 = cos(xz.x * 1.55 - xz.y * 0.95 - time * 1.65) * 0.085;

    // Medium wind-chop waves & organic FBM ripples
    float med1 = sin(xz.y * 3.8 - time * 2.3 + sin(xz.x * 2.4) * 1.15) * 0.048;
    float med2 = cos(xz.x * 3.5 + xz.y * 2.4 - time * 1.9) * 0.036;
    float med3 = sin((xz.x * 0.85 - xz.y * 1.35) * 5.8 + time * 2.6) * 0.022;
    float med4 = (uwFbm2D(xz * 2.4 - vec2(0.0, time * 1.05)) - 0.5) * 0.052;

    return (swell1 + swell2 + med1 + med2 + med3 + med4) * cScale;
  }

  vec3 uwGetCeilingNormal(vec2 xz, float time, float chop) {
    float eps = 0.042;
    float h0 = uwEvalCeilingWave(xz, time, chop);
    float hX = uwEvalCeilingWave(xz + vec2(eps, 0.0), time, chop);
    float hZ = uwEvalCeilingWave(xz + vec2(0.0, eps), time, chop);
    return normalize(vec3(h0 - hX, eps, h0 - hZ));
  }

  // Smooth long-wave swell normal for liquid-lens sky refraction (prevents noisy FBM contour islands in clouds)
  vec3 uwGetSmoothRefractNormal(vec2 xz, float time, float chop) {
    float cScale = max(0.35, chop);
    float eps = 0.08;
    float s0 = (sin(xz.y * 1.35 + xz.x * 0.28 - time * 1.95) * 0.145
              + cos(xz.x * 1.55 - xz.y * 0.95 - time * 1.65) * 0.085
              + sin(xz.y * 3.2 - time * 2.1) * 0.032) * cScale;
    float sX = (sin(xz.y * 1.35 + (xz.x + eps) * 0.28 - time * 1.95) * 0.145
              + cos((xz.x + eps) * 1.55 - xz.y * 0.95 - time * 1.65) * 0.085
              + sin(xz.y * 3.2 - time * 2.1) * 0.032) * cScale;
    float sZ = (sin((xz.y + eps) * 1.35 + xz.x * 0.28 - time * 1.95) * 0.145
              + cos(xz.x * 1.55 - (xz.y + eps) * 0.95 - time * 1.65) * 0.085
              + sin((xz.y + eps) * 3.2 - time * 2.1) * 0.032) * cScale;
    return normalize(vec3(s0 - sX, eps, s0 - sZ));
  }

  // --------------------------------------------------------------------------
  // 4. COMPLETE UNDERWATER SCENE SHADER:
  //    - Continuous 3D wave-refracted sky, clouds & stars overhead (NO fake oval disk!)
  //    - Physical Fresnel transition along 3D wave facets between refracted sky & TIR
  //    - Deep peripheral abyssal-teal vignette on left/right flanks
  //    - Raymarched 3D rippled seafloor with thin chromatic RGB caustics
  //    - 3D Caustic-Modulated Volumetric God-Ray Shafts & Rising Bubble Plume
  // --------------------------------------------------------------------------
  vec3 shadeUnderwater(vec3 ro, vec3 rd, float uTime, float uTwilight, float uChop, vec3 sunDir, vec3 sunCol) {
    // Deep cinematic Prussian-teal underwater volume with strong peripheral vignette on flanks
    float flankVig = exp(-uwSqr(rd.x * 1.35));
    float centerGlow = flankVig * smoothstep(-0.35, 0.45, rd.y);
    vec3 abyssalFlank = vec3(0.001, 0.020, 0.038);
    vec3 midWaterTeal = vec3(0.003, 0.088, 0.135);
    vec3 upperCyan    = vec3(0.012, 0.225, 0.295);

    vec3 uWaterBg = mix(abyssalFlank, midWaterTeal, clamp(rd.y * 0.70 + 0.38, 0.0, 1.0) * flankVig);
    uWaterBg = mix(uWaterBg, upperCyan, centerGlow * 0.62);

    vec3 baseUnderwater = uWaterBg;
    float sceneDist = 65.0;

    // Refracted solar direction inside the water column (Snell's law bends low sun upward)
    vec3 refractedSunDir = normalize(vec3(sunDir.x * 0.52, 0.58, -0.81));

    // ========================================================================
    // A. OVERHEAD WATER CEILING: CONTINUOUS 3D WAVE-REFRACTED SKY & TIR FACETS
    //    (Zero artificial oval cutout, zero Mars planet circle!)
    // ========================================================================
    if (rd.y > 0.008) {
      float tSurf = max(0.25, (0.05 - ro.y) / rd.y);
      vec3 surfHit = ro + rd * tSurf;
      sceneDist = tSurf;

      vec2 relXZ  = (surfHit.xz - ro.xz) / (1.0 + tSurf * 0.042);
      vec2 waveUV = ro.xz + relXZ;
      vec3 N_surf = uwGetCeilingNormal(waveUV * 1.12, uTime, uChop);
      vec3 N_refract = uwGetSmoothRefractNormal(waveUV * 0.95, uTime, uChop);

      // 1) TRUE LIQUID-GLASS SKY REFRACTION OVERHEAD:
      // Smooth gravity-swell refraction bends the above-water sky, volumetric clouds,
      // and starfield across the undulating water ceiling without posterized noise islands.
      vec3 skyRay = normalize(vec3(
        rd.x * 0.85 + N_refract.x * 0.28,
        max(0.095, rd.y * 0.72 + N_refract.z * 0.14 + 0.02),
        rd.z * 0.85 + N_refract.z * 0.28
      ));

      vec3 dummySunDir, dummySunCol;
      vec3 rawSkyCol = evalSkyAndClouds(skyRay, uTime, uTwilight, dummySunDir, dummySunCol);
      rawSkyCol += evalStarfield(skyRay, uTime) * smoothstep(0.28, 0.90, uTwilight) * 1.35;

      // Preserve rich golden-coral cloud rims & deep twilight indigo while tinting through marine water
      vec3 waterFilteredSky = rawSkyCol * vec3(0.72, 0.90, 0.98);

      // Add shimmering caustic ripple filaments across the undulating ceiling
      float tirCaust = uwCausticMono(waveUV * 0.85 + N_surf.xz * 0.36, uTime * 0.85);
      waterFilteredSky += vec3(0.22, 0.74, 0.86) * tirCaust * 0.28;

      // 2) 3D LIQUID-MERCURY TOTAL INTERNAL REFLECTION (TIR) WAVE UNDERSIDES:
      vec3 N_under = normalize(vec3(-N_surf.x * 2.55, -N_surf.y, -N_surf.z * 2.55));
      vec3 V_under = -rd;

      float facetSlope = clamp(0.44 + N_surf.z * 2.85 + N_surf.x * 1.35, 0.0, 1.0);
      vec3 deepCrestPocket = vec3(0.001, 0.016, 0.032);
      vec3 midTealFacet    = vec3(0.006, 0.165, 0.235);
      vec3 brightAquaFacet = mix(vec3(0.022, 0.38, 0.46), vec3(0.20, 0.74, 0.82), clamp(tirCaust * 0.80, 0.0, 1.0));

      vec3 tirCeiling = mix(deepCrestPocket, midTealFacet, smoothstep(0.18, 0.56, facetSlope));
      tirCeiling = mix(tirCeiling, brightAquaFacet, smoothstep(0.52, 0.86, facetSlope));

      // Warm golden-aqua sunlight transmitted through steep wave crests facing the sun
      vec2 horizRd = rd.xz / max(1e-4, length(rd.xz));
      float sunAlign = clamp(dot(horizRd, sunDir.xz), 0.0, 1.0);
      float sunFacet = smoothstep(0.52, 0.88, facetSlope) * smoothstep(0.05, 0.45, rd.y) * (0.35 + 0.65 * sunAlign);
      vec3 warmWaveGlow = mix(vec3(0.25, 0.72, 0.78), sunCol * vec3(0.82, 0.78, 0.70), 0.55);
      tirCeiling = mix(tirCeiling, warmWaveGlow, sunFacet * 0.55);

      // Glossy silver-cyan specular ridge glints on the 3D wave undersides
      vec3 L_up = normalize(vec3(0.0, -0.80, 0.60));
      float ridgeSpec = uwSafePow(max(0.0, dot(N_under, normalize(L_up + V_under))), 38.0) * (0.35 + 0.65 * tirCaust);
      tirCeiling += vec3(0.42, 0.82, 0.88) * ridgeSpec * 0.68;

      // 3) WAVE-FACETED FRESNEL BLEND BETWEEN REFRACTED SKY & 3D TIR WAVE POCKETS:
      // Even when looking straight up, the steep wave backs retain 3D turquoise TIR pockets
      // while the flatter wave windows transmit the golden clouds, twilight sky, and stars!
      float waveWindow = smoothstep(0.22, 0.76, facetSlope);
      float elevWindow = smoothstep(0.08, 0.34, rd.y);
      float skyTrans   = elevWindow * (0.32 + 0.56 * waveWindow);

      vec3 combinedCeiling = mix(tirCeiling, waterFilteredSky, skyTrans);

      // Deepen peripheral left/right horizon edges into rich underwater teal fog
      float periphVignette = mix(0.36, 1.0, exp(-uwSqr(rd.x * 1.05)));
      combinedCeiling *= periphVignette;

      float ceilingVis = exp(-max(0.0, tSurf - 2.2) * 0.048);
      baseUnderwater = mix(uWaterBg, combinedCeiling, ceilingVis);
    }

    // ========================================================================
    // B. RAYMARCHED 3D CURRENT-SCULPTED SAND RIPPLES & CORAL REEF SEAFLOOR
    // ========================================================================
    if (rd.y < 0.015) {
      float t = 0.35;
      float prevT = 0.35;
      float tFloor = 65.0;
      bool hitFloor = false;

      for (int i = 0; i < 32; i++) {
        vec3 p = ro + rd * t;
        float hSand = getUnderwaterSandHeight(p.xz);
        float diff = p.y - hSand;
        if (diff < 0.0) {
          float lo = prevT;
          float hi = t;
          for (int b = 0; b < 6; b++) {
            float mid = 0.5 * (lo + hi);
            vec3 mp = ro + rd * mid;
            if (mp.y > getUnderwaterSandHeight(mp.xz)) lo = mid;
            else hi = mid;
          }
          tFloor = 0.5 * (lo + hi);
          hitFloor = true;
          break;
        }
        prevT = t;
        t += max(0.14, diff * 0.58 + t * 0.015);
        if (t > 62.0) break;
      }

      if (hitFloor) {
        sceneDist = tFloor;
        vec3 floorPos = ro + rd * tFloor;
        baseUnderwater = shadeSeafloor(floorPos, rd, tFloor, uTime, sunDir, sunCol, uTwilight);
      }
    }

    // ========================================================================
    // C. 3D CAUSTIC-MODULATED VOLUMETRIC GOD-RAY SHAFTS & TURBULENT BUBBLE PLUME
    // ========================================================================
    vec3 refractedSun = normalize(vec3(0.05, 0.84, -0.54));
    float maxMarch = min(sceneDist, 25.0);

    float accumGodRays = 0.0;
    float accumPlume   = 0.0;

    for (int s = 0; s < 10; s++) {
      float fi = (float(s) + 0.5) / 10.0;
      float tSample = mix(1.2, maxMarch, fi * fi);
      vec3 pos = ro + rd * tSample;

      float depthBelowSurf = max(0.0, -pos.y);
      vec2 surfProjXZ = pos.xz + refractedSun.xz * (depthBelowSurf / max(0.25, refractedSun.y));

      vec2 coneDelta = (surfProjXZ - (ro.xz + vec2(0.0, -4.2))) * vec2(0.22, 0.26);
      float inSnellCone = exp(-dot(coneDelta, coneDelta) * 1.45) * exp(-depthBelowSurf * 0.24);

      if (inSnellCone > 0.01) {
        float cShaft1 = 1.0 - abs(sin(surfProjXZ.x * 3.8 + uTime * 0.85 + cos(surfProjXZ.y * 3.2 - uTime * 0.65)));
        float cShaft2 = 1.0 - abs(sin((surfProjXZ.x * 0.8 - surfProjXZ.y * 0.6) * 6.4 - uTime * 1.1));
        float shaftCaust = uwSafePow(clamp(cShaft1 * 0.58 + cShaft2 * 0.42, 0.0, 1.0), 3.8);
        accumGodRays += shaftCaust * inSnellCone * (1.0 - fi * 0.35);
      }

      // 3D Turbulent Rising Micro-Bubble Plume right beneath the breaking wave (center-right mid-water)
      vec3 plumeCenter = ro + vec3(0.95, -0.82, -7.8);
      vec3 dPlume = (pos - plumeCenter) / vec3(2.15, 1.35, 2.65);
      float plumeEnv = exp(-dot(dPlume, dPlume) * 1.65) * smoothstep(-2.35, -0.15, pos.y);
      if (plumeEnv > 0.01) {
        vec2 bUV = pos.xz * 3.8 + vec2(pos.y * 2.4, -uTime * 1.45);
        float turb = uwFbm5(bUV);
        float micro = uwNoise2D(pos.xy * 18.0 - vec2(0.0, uTime * 3.2));
        float bubbleDens = smoothstep(0.38, 0.78, turb * 0.72 + micro * 0.28) * plumeEnv;
        accumPlume += bubbleDens;
      }
    }

    accumGodRays /= 10.0;
    accumPlume   /= 10.0;

    // Volumetric sunbeams stream downward through the water column (rd.y < 0.34)
    // and fade smoothly into the overhead wave ceiling without any pinch point!
    vec3 beamOrigin = normalize(vec3(0.0, 0.46, -0.888));
    vec3 beamUp     = normalize(vec3(0.0, 0.888, 0.46));
    vec2 winRay     = vec2(rd.x, dot(rd, beamUp));
    float rBeam     = length(winRay);
    float angBeam   = atan(winRay.y, winRay.x);
    float angDiff   = abs(angBeam + 1.5707963) / 0.90;
    float downwardFan = (1.0 - smoothstep(-0.06, 0.04, winRay.y))
                      * (1.0 - smoothstep(0.22, 0.38, rd.y))
                      * exp(-uwSqr(angDiff) * 1.55);
    float radialFade  = smoothstep(0.14, 0.28, rBeam) * exp(-max(0.0, rBeam - 0.22) * 2.4);

    float rayS1 = 0.5 + 0.5 * sin(angBeam * 26.0 + uTime * 0.4 + sin(angBeam * 12.0));
    float rayS2 = 0.5 + 0.5 * sin(angBeam * 58.0 - uTime * 0.55 + cos(angBeam * 20.0));
    float radialBeams = uwSafePow(clamp(rayS1 * 0.55 + rayS2 * 0.45, 0.0, 1.0), 3.1) * downwardFan * radialFade;

    vec3 godRayColor = mix(vec3(0.24, 0.72, 0.82), vec3(0.75, 0.88, 0.86), 0.35);
    baseUnderwater += godRayColor * (accumGodRays * 0.62 + radialBeams * 0.28);

    // Shimmering turbulent bubble plume & aerated micro-bubble curtain in the upper-right sunbeams
    vec3 plumeColor = mix(vec3(0.32, 0.72, 0.82), vec3(0.88, 0.96, 0.98), clamp(accumPlume * 1.6, 0.0, 1.0));
    baseUnderwater = mix(baseUnderwater, plumeColor, clamp(accumPlume * 1.15, 0.0, 0.68));

    // ========================================================================
    // D. CRISP MULTI-LAYER RISING MICRO-BUBBLES & SUNLIT MARINE SNOW
    // ========================================================================
    vec2 viewDirUV = vec2(atan(rd.x, -rd.z), rd.y);
    for (int layer = 0; layer < 3; layer++) {
      float fl = float(layer);
      float scale = 28.0 + fl * 20.0;
      vec2 bGrid = viewDirUV * scale + vec2(fl * 13.7 + sin(uTime * 0.3 + fl) * 0.4, -uTime * (0.28 + fl * 0.12));
      vec2 bId = floor(bGrid);
      vec2 bGv = fract(bGrid) - 0.5;
      vec2 bOff = (uwHash22(bId) - 0.5) * 0.68;
      float bDist = length(bGv - bOff);
      float bProb = uwHash12(bId + 31.4);

      float plumeProx = exp(-uwSqr((rd.x - 0.10) * 2.6) - uwSqr((rd.y - 0.02) * 3.4));
      float thresh = mix(0.91, 0.64, plumeProx);

      if (bProb > thresh && bDist < 0.10) {
        float specRing = (1.0 - smoothstep(0.0, 0.075, bDist)) * (0.45 + 0.55 * smoothstep(0.015, 0.06, bDist));
        vec3 bCol = mix(vec3(0.48, 0.86, 0.94), vec3(0.95, 0.96, 0.92), bProb);
        baseUnderwater += bCol * specRing * (0.22 + 0.42 * plumeProx) * (1.0 - fl * 0.24);
      }
    }

    return baseUnderwater;
  }
`;
