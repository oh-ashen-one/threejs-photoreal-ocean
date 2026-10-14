// ============================================================================
// SKY, ATMOSPHERE, VOLUMETRIC WORLEY-FBM CUMULUS & DISTANT HEADLAND MODULE
// Target: Three.js WebGL2 on Apple Silicon Metal (--use-angle=metal)
// CRITICAL METAL RULE: Every smoothstep(edge0, edge1, x) strictly satisfies edge0 < edge1.
// ============================================================================

export const SKY_ATMOSPHERE_GLSL = /* glsl */ `
  // --------------------------------------------------------------------------
  // 1. NOISE, HASH, VORONOI / WORLEY & BILLOW FBM HELPERS
  // --------------------------------------------------------------------------
  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }

  float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  const mat2 skyRotM2 = mat2(0.80, -0.60, 0.60, 0.80);

  float fbm2D(vec2 p) {
    float f = 0.0;
    f += 0.5000 * noise2D(p); p = skyRotM2 * p * 2.02 + vec2(3.1, 1.7);
    f += 0.2500 * noise2D(p); p = skyRotM2 * p * 2.03 + vec2(5.4, 2.3);
    f += 0.1250 * noise2D(p); p = skyRotM2 * p * 2.01 + vec2(1.9, 6.2);
    f += 0.0625 * noise2D(p);
    return f / 0.9375;
  }

  // Returns vec2(F1, F2) cellular distances for crisp Worley cauliflower puffs
  vec2 voronoi2D(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float f1 = 8.0;
    float f2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash22(n + g);
        vec2 r = g + (0.15 + 0.70 * o) - f;
        float d = dot(r, r);
        if (d < f1) {
          f2 = f1;
          f1 = d;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
    return sqrt(vec2(f1, f2));
  }

  // Billowy cauliflower cumulus noise combining inverted Worley cellular domes withridged billows
  float billowFBM(vec2 p) {
    float f = 0.0;
    float a = 0.52;
    vec2 q = p;
    for (int i = 0; i < 4; i++) {
      float n = noise2D(q);
      float billow = 1.0 - abs(n * 2.0 - 1.0);
      float worleyPuff = 1.0 - clamp(voronoi2D(q * 0.62).x, 0.0, 1.0);
      float layerVal = mix(pow(billow, 1.18), worleyPuff * worleyPuff, 0.46);
      f += a * layerVal;
      q = skyRotM2 * q * 2.05 + vec2(4.2, 8.9);
      a *= 0.48;
    }
    return clamp(f / 0.94, 0.0, 1.0);
  }

  // --------------------------------------------------------------------------
  // 2. PINPOINT ASTRONOMICAL STARFIELD & SUBTLE TWILIGHT MILKY WAY
  // --------------------------------------------------------------------------
  vec3 evalStarfield(vec3 rd, float time) {
    if (rd.y <= 0.04) return vec3(0.0);

    vec2 skyUV = vec2(atan(rd.x, -rd.z), asin(clamp(rd.y, 0.0, 1.0)));

    // Subtle galactic dust band in upper-right twilight sky (never purple noise streaks)
    float mwAxis  = (skyUV.x - 0.14) * 0.78 + (skyUV.y - 0.42) * 1.22;
    float mwAlong = (skyUV.x - 0.14) * 1.22 - (skyUV.y - 0.42) * 0.78;
    float mwBand  = exp(-mwAxis * mwAxis * 16.0) * smoothstep(0.16, 0.36, rd.y);

    float mwCloud = fbm2D(vec2(mwAlong * 3.2, mwAxis * 5.8) + vec2(1.4, 2.8));
    float mwRift  = smoothstep(0.30, 0.68, fbm2D(vec2(mwAlong * 6.0, mwAxis * 12.0) - vec2(2.1, 0.9)));
    vec3 milkyWay = mix(vec3(0.06, 0.13, 0.28), vec3(0.24, 0.22, 0.36), mwCloud)
                  * mwBand * mwCloud * (0.30 + 0.70 * mwRift) * 0.38;

    vec3 stars = vec3(0.0);
    for (int layer = 0; layer < 3; layer++) {
      float scale = (layer == 0) ? 145.0 : ((layer == 1) ? 265.0 : 450.0);
      vec2 grid = skyUV * scale + float(layer) * 41.7;
      vec2 id = floor(grid);
      vec2 gv = fract(grid) - 0.5;
      vec2 randOffset = (hash22(id) - 0.5) * 0.66;
      float d = length(gv - randOffset);

      float prob = hash21(id + vec2(23.1, 17.4));
      float thresh = mix(0.928, 0.785, mwBand * 0.80);
      if (prob > thresh && d < 0.13) {
        float mag = pow((prob - thresh) / max(1.0 - thresh, 0.001), 1.50);
        float twinkle = 0.80 + 0.20 * sin(time * (2.2 + prob * 4.5) + prob * 91.2);
        // Strictly edge0 < edge1 for Metal GLSL
        float core = (1.0 - smoothstep(0.0, 0.055, d)) * (1.0 - smoothstep(0.0, 0.115, d));
        float point = core * mag * twinkle;

        float temp = fract(prob * 43.7);
        vec3 sCol = mix(vec3(0.70, 0.85, 1.0), vec3(1.0, 0.88, 0.68), temp);
        stars += sCol * point * (layer == 0 ? 3.1 : (layer == 1 ? 1.7 : 0.95));
      }
    }

    float horizonFade = smoothstep(0.09, 0.26, rd.y);
    return (milkyWay + stars) * horizonFade;
  }

  // --------------------------------------------------------------------------
  // 3. PERSPECTIVE-FORESHORTENED WORLEY-FBM CUMULUS DENSITY FIELD
  // --------------------------------------------------------------------------
  vec2 projectCloudUV(vec3 rd, float time, out float elevNorm) {
    float yClamped = max(rd.y, 0.001);
    float az = atan(rd.x, -rd.z);
    // Perspective-foreshortened elevation blended with planar ray projection
    float perspY = pow(yClamped, 0.68);
    float planarDist = 1.0 / (yClamped + 0.095);
    elevNorm = perspY;

    // Horizontal coordinate foreshortens gently toward the horizon so cloud banks recede in 3D depth
    float u = az * mix(0.76, 1.08, smoothstep(0.001, 0.35, yClamped)) + rd.x * planarDist * 0.032;
    float v = perspY * 1.12 - planarDist * 0.014;
    return vec2(u + time * 0.0028, v);
  }

  float sampleCumulusDensity(vec3 rd, float time, out float cloudBaseAlt, out float towerTopAlt) {
    float y = max(rd.y, 0.001);
    if (y > 0.56) {
      cloudBaseAlt = 0.02;
      towerTopAlt = 0.30;
      return 0.0;
    }

    float az = atan(rd.x, -rd.z);
    float elevNorm;
    vec2 p = projectCloudUV(rd, time, elevNorm);

    // Curl-like domain warp so clouds billow into cauliflower turrets instead of diagonal streaks
    vec2 warp = vec2(
      fbm2D(p * 3.8 + vec2(1.2, 3.4)) - 0.5,
      fbm2D(p * 3.8 + vec2(6.7, 2.1)) - 0.5
    ) * 0.095;
    vec2 q = p + warp;

    // 1) Left & Center-Left Towering Cumulus Congestus Bank (matches ref_v2_hyperreal_wave_shore.jpg)
    // Dramatic cauliflower turret rising near az ~ -0.11 (above-left of sun) + massive bank on far left
    float turretCenter = exp(-pow((az + 0.115) / 0.115, 2.0)) * 0.21;
    float leftMass     = (1.0 - smoothstep(-0.32, 0.02, az)) * 0.28;
    float rightDeck    = smoothstep(-0.02, 0.28, az) * (1.0 - smoothstep(0.45, 0.82, az)) * 0.13;

    // Stratocumulus horizon band extending all the way down to rd.y = 0.001 to eliminate artificial yellow bar
    float horizonBand  = (1.0 - smoothstep(0.002, 0.078, y)) * 0.82;

    // Mid-right broken altocumulus puffs (as seen in ref_v2_hyperreal_wave_shore.jpg upper-right)
    float midRightBand = exp(-pow((y - 0.135) / 0.052, 2.0)) * smoothstep(-0.08, 0.18, az) * (1.0 - smoothstep(0.48, 0.78, az)) * 0.65;

    towerTopAlt = clamp(0.068 + leftMass + turretCenter + rightDeck, 0.065, 0.44);
    cloudBaseAlt = mix(0.002, 0.018, smoothstep(-0.55, 0.35, az));

    // Vertical convective tower profile: flat-ish dark convective base down to horizon, billowing rounded top
    float bottomEnter = smoothstep(0.0005, 0.0065, y);
    float topExit     = 1.0 - smoothstep(towerTopAlt * 0.58, towerTopAlt + 0.065, y);
    float towerMask   = bottomEnter * topExit * smoothstep(-0.88, -0.58, az);
    // Keep left bank full all the way to the left edge of frame
    float leftEdgeFull = 1.0 - smoothstep(-0.62, -0.22, az);
    towerMask = max(towerMask, bottomEnter * (1.0 - smoothstep(0.24, 0.44, y)) * leftEdgeFull);

    float macroEnv = clamp(max(towerMask * 0.95, max(horizonBand, midRightBand)), 0.0, 1.0);
    if (macroEnv <= 0.005) return 0.0;

    // Multi-scale Worley cellular cauliflower domes + billow FBM
    vec2 vor1 = voronoi2D(q * 5.2 + vec2(0.8, 1.5));
    vec2 vor2 = voronoi2D(q * 11.4 - vec2(2.3, 0.9));
    float cellPuff1 = 1.0 - clamp(vor1.x * 0.95, 0.0, 1.0);
    float cellPuff2 = 1.0 - clamp(vor2.x * 1.05, 0.0, 1.0);
    float worleyTurrets = cellPuff1 * 0.62 + cellPuff2 * 0.38;

    float billow1 = billowFBM(q * 6.4);
    float billow2 = billowFBM(q * 14.8 + vec2(3.7, 1.9));
    float erosiveFBM = fbm2D(q * 26.0);

    float cloudSignal = worleyTurrets * 0.46 + billow1 * 0.32 + billow2 * 0.14 + erosiveFBM * 0.08;

    // Carve realistic sky gaps around the central-left cumulus turret and right cloud deck
    float gapCarve = smoothstep(0.32, 0.74, fbm2D(q * 3.1 + vec2(4.1, 0.7)));
    float sunGap   = exp(-pow((az + 0.18) / 0.065, 2.0)) * exp(-pow((y - 0.085) / 0.045, 2.0)) * 0.26;
    macroEnv = clamp(macroEnv * (0.68 + 0.32 * gapCarve) - sunGap, 0.0, 1.0);

    float threshLo = clamp(0.60 - macroEnv * 0.42, 0.12, 0.68);
    float threshHi = max(threshLo + 0.08, clamp(0.84 - macroEnv * 0.22, 0.28, 0.92));
    float dens = smoothstep(threshLo, threshHi, cloudSignal) * macroEnv;

    // Ensure low horizon stratocumulus silhouettes occlude the raw horizon line (save a small sun cleft)
    float sunCleft = 1.0 - 0.55 * exp(-pow((az - 0.02) / 0.09, 2.0));
    float lowHorizonSilhouette = (1.0 - smoothstep(0.001, 0.026, y))
                               * smoothstep(0.28, 0.64, billow1 * 0.7 + cellPuff1 * 0.3)
                               * sunCleft * 0.78;

    return clamp(max(dens, lowHorizonSilhouette), 0.0, 1.0);
  }

  // Dual-Lobe Henyey-Greenstein Phase Function (Forward silver-lining peak + backscatter glory)
  float hgPhase(float cosTheta, float g) {
    float g2 = g * g;
    float denom = max(1.0 + g2 - 2.0 * g * cosTheta, 0.001);
    return (1.0 - g2) / (4.0 * 3.14159265 * pow(denom, 1.5));
  }

  float dualLobeHG(float cosTheta) {
    return mix(hgPhase(cosTheta, -0.30), hgPhase(cosTheta, 0.76), 0.72);
  }

  // --------------------------------------------------------------------------
  // 4. VOLUMETRIC CLOUD EVALUATION (Beer-Powder + Dual-Lobe HG + Convective Base)
  // --------------------------------------------------------------------------
  vec4 cumulusField(vec3 rd, float time, vec3 sunDir, float twilight) {
    if (rd.y <= 0.0005 || rd.y >= 0.55) return vec4(0.0);

    float baseAlt, topAlt;
    float dens = sampleCumulusDensity(rd, time, baseAlt, topAlt);
    if (dens <= 0.003) return vec4(0.0);

    float y = max(rd.y, 0.001);
    float mu = dot(rd, sunDir);

    // 4-step volumetric raymarch toward sunDir for crisp 3D turret self-shadowing
    vec3 stepDir = normalize(sunDir - rd * 0.35);
    stepDir.y = max(stepDir.y, 0.04);
    float bDummy, tDummy;
    float d1 = sampleCumulusDensity(normalize(rd + stepDir * 0.014), time, bDummy, tDummy);
    float d2 = sampleCumulusDensity(normalize(rd + stepDir * 0.032), time, bDummy, tDummy);
    float d3 = sampleCumulusDensity(normalize(rd + stepDir * 0.058), time, bDummy, tDummy);
    float d4 = sampleCumulusDensity(normalize(rd + stepDir * 0.095), time, bDummy, tDummy);
    float opticalDepth = (d1 * 0.34 + d2 * 0.28 + d3 * 0.22 + d4 * 0.16) * 3.85;

    // Nubis Beer-Powder Law: thin cloud edges facing the sun glow with crisp golden-amber translucency
    float beer = exp(-opticalDepth - dens * 0.85);
    float powder = 1.0 - exp(-dens * 4.2);
    float beerPowder = beer * mix(1.0, powder * 1.65, 0.65);

    // Dual-Lobe Henyey-Greenstein forward scattering near the sun
    float phase = clamp(dualLobeHG(mu) * 0.42, 0.0, 2.8);
    float silverEdge = exp(-opticalDepth * 0.68) * (1.0 - smoothstep(0.18, 0.82, dens))
                     * (0.35 + 1.85 * pow(max(0.0, mu), 4.0));

    // Vertical gradient inside the cloud tower: dark charcoal-indigo convective bellies vs lit cauliflower tops
    float heightFrac = clamp((y - baseAlt) / max(topAlt - baseAlt, 0.04), 0.0, 1.0);
    float dDown = sampleCumulusDensity(normalize(vec3(rd.x, max(0.001, rd.y - 0.010), rd.z)), time, bDummy, tDummy);
    float bottomRim = clamp((dens - dDown) * 3.2, 0.0, 1.0);

    float elevNorm;
    vec2 cloudUV = projectCloudUV(rd, time, elevNorm);
    float microPuff = billowFBM(cloudUV * 19.5 + vec2(time * 0.015, 0.0));

    // Twilight palette: deep charcoal-slate-indigo bellies contrasted with molten amber-coral-gold rims
    vec3 twiCoreShadow = mix(vec3(0.035, 0.038, 0.068), vec3(0.078, 0.072, 0.125), heightFrac)
                       * (0.76 + 0.34 * microPuff);
    vec3 twiLitDiff    = mix(vec3(0.72, 0.30, 0.18), vec3(1.42, 0.72, 0.28), clamp(beerPowder * 1.35 + heightFrac * 0.25, 0.0, 1.0));
    vec3 twiRimGold    = vec3(1.65, 0.82, 0.26) * (silverEdge + beer * phase * 0.55);
    vec3 twiUnderGlow  = vec3(0.95, 0.38, 0.14) * bottomRim * exp(-y * 10.5) * (0.35 + 0.65 * pow(max(0.0, mu), 2.0));

    // Daylight & Night blends based on twilight parameter (1.0 = golden twilight, 0.0 = day/night)
    vec3 coreShadow = mix(vec3(0.28, 0.36, 0.48), twiCoreShadow, twilight);
    vec3 litDiff    = mix(vec3(1.05, 1.02, 0.98), twiLitDiff,    twilight);
    vec3 rimGold    = mix(vec3(1.25, 1.20, 1.12) * silverEdge, twiRimGold, twilight);

    float directWeight = clamp(beerPowder * (0.75 + 0.55 * microPuff) * (0.55 + 0.65 * pow(max(0.0, mu), 1.5)), 0.0, 1.0);
    vec3 cloudRGB = mix(coreShadow, litDiff, directWeight) + rimGold * 0.82 + twiUnderGlow * twilight;

    // Warm atmospheric perspective mist blending on distant low-elevation clouds near the horizon
    float distHaze = exp(-y * 19.0);
    vec3 horizonMistCol = mix(vec3(0.42, 0.24, 0.22), vec3(1.25, 0.56, 0.18), pow(max(0.0, mu), 2.4));
    cloudRGB = mix(cloudRGB, horizonMistCol, distHaze * 0.42);

    float alpha = smoothstep(0.0, 0.26, dens) * smoothstep(0.0005, 0.0045, y);
    return vec4(cloudRGB, clamp(alpha * 0.98, 0.0, 0.98));
  }

  // --------------------------------------------------------------------------
  // 5. DISTANT COASTAL HEADLAND / SEA-CLIFF SILHOUETTE ON LEFT HORIZON
  // Matches ref_v2_hyperreal_wave_shore.jpg: 2-layer atmospheric promontory + sea-stacks
  // --------------------------------------------------------------------------
  vec4 evalCoastalHeadland(vec3 rd, vec3 sunDir, vec3 horizonCol, vec3 midSkyCol) {
    float y = rd.y;
    if (y < -0.002 || y > 0.056) return vec4(0.0);

    float az = atan(rd.x, -rd.z);
    if (az > -0.20 || az < -0.95) return vec4(0.0);

    // Layer 1 (Further, misty headland ridge extending out to az ~ -0.245):
    // Gently sloping coastal tableland that drops steeply into the sea at its eastern tip
    float farTipDrop = 1.0 - smoothstep(-0.295, -0.242, az);
    float farSlope   = clamp(0.022 - (az + 0.42) * 0.028, 0.006, 0.032);
    float farRidgeNoise = (fbm2D(vec2(az * 24.0, 1.7)) - 0.5) * 0.0035;
    float farHeight  = (farSlope + farRidgeNoise) * farTipDrop;

    // Tiny sea-stack rock islets just off the tip of the far headland (az in -0.245 .. -0.220)
    float stack1 = exp(-pow((az + 0.236) / 0.0045, 2.0)) * 0.0042;
    float stack2 = exp(-pow((az + 0.225) / 0.0032, 2.0)) * 0.0026;
    farHeight = max(farHeight, stack1 + stack2);

    float farMask = (1.0 - smoothstep(farHeight - 0.0012, farHeight + 0.0008, y))
                  * smoothstep(-0.001, 0.0015, y);

    // Layer 2 (Closer, taller dark craggy sea-cliff promontory on far left, az < -0.355):
    float nearTipDrop = 1.0 - smoothstep(-0.415, -0.355, az);
    float nearStep    = 0.036 + 0.010 * (1.0 - smoothstep(-0.56, -0.46, az));
    float cragDetail  = (fbm2D(vec2(az * 38.0, 4.3)) - 0.5) * 0.0048
                      + (noise2D(vec2(az * 95.0, 2.1)) - 0.5) * 0.0018;
    float nearHeight  = max(0.0, (nearStep + cragDetail) * nearTipDrop);

    // Low foreground rocky reef boulders at the base of the near cliff (y < 0.007, az < -0.32)
    float baseBoulders = (1.0 - smoothstep(-0.37, -0.315, az))
                       * max(0.0, sin(az * 160.0) * 0.0035 + 0.0030);
    nearHeight = max(nearHeight, baseBoulders);

    float nearMask = (1.0 - smoothstep(nearHeight - 0.0010, nearHeight + 0.0007, y))
                   * smoothstep(-0.001, 0.0015, y);

    float totalMask = clamp(max(farMask, nearMask), 0.0, 1.0);
    if (totalMask <= 0.001) return vec4(0.0);

    // Aerial perspective & golden surf-mist between the two cliff layers
    float mu = max(0.0, dot(rd, sunDir));
    vec3 goldenHaze = mix(midSkyCol * 1.2 + vec3(0.24, 0.12, 0.09), horizonCol, 0.62 + 0.30 * pow(mu, 2.0));

    // Further headland is veiled in warm golden-violet coastal haze
    vec3 farCliffCol = mix(vec3(0.095, 0.062, 0.065), goldenHaze * 0.52, 0.58);
    // Mist rising from breaking waves at the base of the far headland
    float surfMistGlow = exp(-max(0.0, y - 0.001) * 190.0) * smoothstep(-0.44, -0.26, az) * (1.0 - smoothstep(-0.26, -0.22, az));
    farCliffCol += goldenHaze * surfMistGlow * 0.35;

    // Closer promontory is deep charcoal-umber rock with subtle warm sunset rim along its top edge
    float rockStrata = fbm2D(vec2(az * 65.0, y * 240.0));
    vec3 nearCliffCol = vec3(0.028, 0.020, 0.020) * (0.75 + 0.45 * rockStrata);
    float topRim = exp(-max(0.0, nearHeight - y) * 650.0) * nearTipDrop;
    nearCliffCol += horizonCol * topRim * 0.16;

    vec3 cliffRGB = mix(farCliffCol, nearCliffCol, nearMask);
    return vec4(cliffRGB, totalMask);
  }

  // --------------------------------------------------------------------------
  // 6. COMPLETE BRUNETON-STYLE ATMOSPHERE, MIE SOLAR CORONA, CLOUDS & CLIFFS
  // --------------------------------------------------------------------------
  vec3 evalSkyAndClouds(vec3 rd, float time, float twilight, out vec3 sunDir, out vec3 sunCol) {
    // Low golden-hour sun slightly left of center (matches ref_v2_hyperreal_wave_shore.jpg)
    float sunElev = mix(0.28, 0.029, clamp(twilight, 0.0, 1.0));
    sunDir = normalize(vec3(-0.085, sunElev, -1.0));

    vec3 dayZenith = vec3(0.02, 0.16, 0.48);
    vec3 dayMid    = vec3(0.12, 0.38, 0.74);
    vec3 dayHoriz  = vec3(0.55, 0.82, 0.98);
    vec3 daySun    = vec3(1.50, 1.35, 1.10);

    // Rich twilight Prussian-sapphire zenith, dusty rose-violet mid-sky, molten amber-gold horizon
    vec3 twiZenith = vec3(0.010, 0.036, 0.098);
    vec3 twiMid    = vec3(0.055, 0.095, 0.215);
    vec3 twiHoriz  = vec3(1.32, 0.50, 0.12);
    vec3 twiSun    = vec3(2.15, 1.02, 0.30);

    float tw = clamp(twilight, 0.0, 1.0);
    vec3 zenithCol  = mix(dayZenith, twiZenith, tw);
    vec3 midSkyCol  = mix(dayMid,    twiMid,    tw);
    vec3 horizonCol = mix(dayHoriz,  twiHoriz,  tw);
    sunCol          = mix(daySun,    twiSun,    tw);

    float y = max(rd.y, 0.001);
    float mu = dot(rd, sunDir);

    // Smooth Rayleigh + Mie vertical & azimuthal atmospheric scattering gradient
    float sunAzFocus = 0.20 + 0.80 * pow(max(0.0, mu), 2.6);
    vec3 flankHoriz  = mix(midSkyCol * 1.45 + vec3(0.24, 0.11, 0.14), horizonCol, sunAzFocus);

    // Dual-scale exponential horizon glow (avoids any hard neon-yellow horizontal bar)
    float horizGlowBroad = exp(-y * 9.5);
    float horizGlowTight = exp(-y * 28.0) * (0.35 + 0.65 * pow(max(0.0, mu), 2.0));
    vec3 sky = mix(midSkyCol, zenithCol, smoothstep(0.08, 0.42, y));
    sky = mix(sky, flankHoriz, clamp(horizGlowBroad * 0.72 + horizGlowTight * 0.38, 0.0, 1.0));

    // Pinpoint astronomical stars & subtle Milky Way in upper twilight sky
    float starVis = smoothstep(0.25, 0.85, tw);
    sky += evalStarfield(rd, time) * starVis;

    // Smooth atmospheric Mie sun glare + soft solar corona (pre-cloud background)
    float mieWide   = pow(max(0.0, mu), 6.0)  * exp(-y * 5.5);
    float mieMedium = pow(max(0.0, mu), 36.0) * exp(-y * 8.0);
    float solarCore = smoothstep(0.9982, 0.99985, mu);
    sky += sunCol * (mieWide * 0.52 + mieMedium * 0.85 + solarCore * 2.35);

    // Volumetric Worley-FBM Cumulus Towers & Horizon Stratocumulus Deck
    vec4 clouds = cumulusField(rd, time, sunDir, tw);
    if (clouds.a > 0.001) {
      sky = mix(sky, clouds.rgb, clouds.a);

      // Soft forward-scattered solar corona bleed over thin cloud edges near the sun
      float coronaBleed = pow(max(0.0, mu), 28.0) * exp(-y * 9.0) * (1.0 - clouds.a * 0.72);
      sky += sunCol * coronaBleed * 0.42;
    }

    // Distant 2-layer coastal headland & sea-cliffs on the left horizon (az in [-0.85, -0.22])
    vec4 cliff = evalCoastalHeadland(rd, sunDir, horizonCol, midSkyCol);
    if (cliff.a > 0.001) {
      sky = mix(sky, cliff.rgb, cliff.a);
    }

    return sky;
  }
`;
