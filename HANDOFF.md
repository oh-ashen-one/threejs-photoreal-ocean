# Handoff — Three.js Photoreal Ocean, Volumetric Sky & Underwater World

- **Repository**: `https://github.com/oh-ashen-one/threejs-photoreal-ocean`
- **Branch**: `v2-photoreal-ocean` (also synced with `main` at `629b91b`)
- **Live GitHub Pages**: `https://oh-ashen-one.github.io/threejs-photoreal-ocean/`

## Quick Start (On Laptop or Studio)

```bash
git clone https://github.com/oh-ashen-one/threejs-photoreal-ocean.git
cd threejs-photoreal-ocean
git checkout v2-photoreal-ocean
python3 -m http.server 8900 --bind 127.0.0.1
open http://localhost:8900/
```

## Verified Architecture & Modules

- `index.html` — Self-contained UI, camera presets (`shore`, `snell`, `split`, `reef`), `Twilight` and `Chop` sliders, and AI reference drawer.
- `ocean_app.js` — Three.js WebGL2 full-screen raymarched pipeline + off-screen depth/color render target (`fishRT`) for compositing 415 3D instanced fish into underwater Beer-Lambert scattering. Supports URL params (`?preset=snell&pitch=0.62&tod=0.48&hideui=1`).
- `modules/sky_atmosphere_glsl.js` — 3D perspective-foreshortened Worley-FBM cumulus towers, Beer-Powder + dual-lobe Henyey-Greenstein radiative transfer, astronomical starfield + Milky Way, and two-layer distant coastal headland silhouette on the left horizon.
- `modules/ocean_surface_glsl.js` — Asymmetric right-of-center hollow plunging sea-emerald wave wall, left-of-center diagonal swell ridges, backlit flying spindrift spray, multi-scale curl-warped Voronoi cellular foam (`F2 - F1`), double parabolic swash lobes with 3D capillary meniscus lip, analytical + raymarched far-ocean horizon plane, and wobble-free wet beach sand mirror.
- `modules/underwater_glsl.js` — Continuous 3D wave-refracted sky, clouds, and stars overhead (using `uwGetSmoothRefractNormal` for smooth liquid-glass swell refraction without any hardcoded oval disk), 3D liquid-mercury Total Internal Reflection (TIR) wave underside pockets, 3D current-sculpted sand ripples, chromatic RGB caustics, volumetric god-rays, and rising micro-bubble plumes.
- `modules/fish_school_system.js` — 415 GPU-instanced 3D vertebrate fish (320 pelagic fusiliers + 95 tropical reef fish) with forked lunate caudal tails, curvature-driven banking roll, scale iridescence, and live RGB caustic projection.

## Apple Silicon Metal GLSL Rules (`--use-angle=metal`)

1. Every `smoothstep(edge0, edge1, x)` call across all shader modules **must** strictly satisfy `edge0 < edge1`.
2. Every `pow(x, y)` call **must** have `x > 0.0` strictly (use `uwSqr(x)` or `pow(max(1e-4, x), y)` to prevent `NaN` propagation on Metal).
3. Never call `normalize(v)` on a vector that can be zero at the zenith (e.g. `rd.xz` when `rd = (0, 1, 0)`); use `rd.xz / max(1e-4, length(rd.xz))`.
