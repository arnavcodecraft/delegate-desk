/**
 * The home page globe, drawn from Natural Earth land data (public domain): land as a field of dots, a soft
 * atmosphere, twinkling stars, gold pings at conference cities and arcs between them. Loaded on demand.
 */
import * as THREE from 'three';
import { feature } from 'topojson-client';
import { geoEquirectangular, geoPath } from 'd3-geo';
import land from 'world-atlas/land-110m.json';

export interface GlobeOptions { reducedMotion: boolean; onReady?: () => void }

// Cities where Model UN conferences gather: [lat, lon].
const CITIES: [number, number][] = [
  [28.61, 77.21], [12.97, 77.59], [19.08, 72.88], [22.57, 88.36], [51.51, -0.13], [40.71, -74.01], [46.2, 6.14],
  [-1.29, 36.82], [1.35, 103.82], [25.2, 55.27], [-23.55, -46.63], [-33.87, 151.21], [35.68, 139.69], [52.52, 13.4],
  [48.86, 2.35], [6.52, 3.38], [30.04, 31.24], [19.43, -99.13], [37.57, 126.98], [41.01, 28.98], [-33.92, 18.42], [43.65, -79.38],
];
const ARCS: [number, number][] = [[0, 4], [1, 8], [2, 9], [4, 5], [6, 15], [0, 6], [7, 16], [10, 17], [12, 18], [3, 11], [9, 19], [5, 21]];

const toVec = (lat: number, lon: number, r: number) => {
  const phi = (90 - lat) * (Math.PI / 180), theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
};

/** An equirectangular land mask, read back as pixels. */
function landMask(w = 1024, h = 512) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const proj = geoEquirectangular().fitSize([w, h], { type: 'Sphere' } as any);
  const path = geoPath(proj, ctx);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff'; ctx.beginPath(); path(feature(land as any, (land as any).objects.land) as any); ctx.fill();
  const data = ctx.getImageData(0, 0, w, h).data;
  return (lat: number, lon: number) => {
    const x = Math.min(w - 1, Math.max(0, Math.floor(((lon + 180) / 360) * w)));
    const y = Math.min(h - 1, Math.max(0, Math.floor(((90 - lat) / 180) * h)));
    return data[(y * w + x) * 4] > 128;
  };
}

export function mountGlobe(canvas: HTMLCanvasElement, opts: GlobeOptions) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
  camera.position.set(0, 0, 9);

  const R = 2;
  const world = new THREE.Group(); scene.add(world);
  const spin = new THREE.Group(); spin.rotation.z = 0.36; spin.rotation.y = -1.9; world.add(spin);   // India faces the viewer at first

  // Ocean: a dark sphere with a lighter rim.
  const ocean = new THREE.Mesh(new THREE.SphereGeometry(R * 0.995, 96, 96), new THREE.ShaderMaterial({
    uniforms: { uRim: { value: new THREE.Color('#5b8cff') } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: `uniform vec3 uRim; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1. - max(dot(vN, vV), 0.), 2.6); vec3 base = mix(vec3(0.012,0.04,0.12), vec3(0.03,0.09,0.24), vN.y*.5+.5);
      float sun = smoothstep(-0.2, 0.9, dot(vN, normalize(vec3(-0.6,0.35,0.7))));
      gl_FragColor = vec4(base*(0.55+0.6*sun) + uRim*f*0.9, 1.); }`,
  }));
  spin.add(ocean);

  // Land: dots on a Fibonacci sphere, kept where the mask says land.
  const isLand = landMask();
  const N = 42000, pos: number[] = [], shade: number[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i;
    const lat = Math.asin(y) * (180 / Math.PI), lon = ((Math.atan2(Math.sin(th) * r, Math.cos(th) * r) * 180) / Math.PI);
    if (!isLand(lat, lon)) continue;
    const v = toVec(lat, lon, R * 1.002); pos.push(v.x, v.y, v.z); shade.push(0.55 + Math.random() * 0.45);
  }
  const dotsGeo = new THREE.BufferGeometry();
  dotsGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  dotsGeo.setAttribute('shade', new THREE.Float32BufferAttribute(shade, 1));
  const dotsMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uSize: { value: 2.2 * renderer.getPixelRatio() }, uA: { value: new THREE.Color('#9fbcff') }, uB: { value: new THREE.Color('#ffffff') } },
    vertexShader: `attribute float shade; uniform float uSize; varying float vS; varying float vFace;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vec3 n = normalize(normalMatrix*normalize(position)); vFace = dot(n, normalize(-mv.xyz)); vS = shade;
      gl_PointSize = uSize * (9.0 / -mv.z); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uA; uniform vec3 uB; varying float vS; varying float vFace;
      void main(){ if (vFace < 0.02) discard; vec2 p = gl_PointCoord - .5; if (length(p) > .5) discard;
      float sun = smoothstep(-0.1, 0.8, vFace); gl_FragColor = vec4(mix(uA, uB, vS*sun), (0.35 + 0.65*sun) * smoothstep(0.02, 0.25, vFace)); }`,
  });
  spin.add(new THREE.Points(dotsGeo, dotsMat));

  // Atmosphere: a back-facing shell that glows at the edge.
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.18, 64, 64), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uC: { value: new THREE.Color('#3a6cff') } },
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 uC; varying vec3 vN; void main(){ float i = pow(0.7 - dot(vN, vec3(0,0,1.)), 3.6); gl_FragColor = vec4(uC*1.15, 1.) * i; }',
  }));
  world.add(atmo);

  // Conference cities: gold radar pings.
  const cityPos: number[] = [], seeds: number[] = [];
  CITIES.forEach(([la, lo]) => { const v = toVec(la, lo, R * 1.01); cityPos.push(v.x, v.y, v.z); seeds.push(Math.random()); });
  const cityGeo = new THREE.BufferGeometry();
  cityGeo.setAttribute('position', new THREE.Float32BufferAttribute(cityPos, 3));
  cityGeo.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
  const cityMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uSize: { value: 26 * renderer.getPixelRatio() }, uC: { value: new THREE.Color('#ffd27a') } },
    vertexShader: `attribute float seed; uniform float uSize; varying float vSeed; varying float vFace;
      void main(){ vSeed = seed; vec4 mv = modelViewMatrix*vec4(position,1.); vFace = dot(normalize(normalMatrix*normalize(position)), normalize(-mv.xyz));
      gl_PointSize = uSize * (9.0 / -mv.z); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uT; uniform vec3 uC; varying float vSeed; varying float vFace;
      void main(){ if (vFace < 0.1) discard; float d = length(gl_PointCoord - .5) * 2.; if (d > 1.) discard;
      float core = smoothstep(0.28, 0.0, d); float ph = fract(uT*0.45 + vSeed); float ring = smoothstep(0.08, 0., abs(d - ph)) * (1. - ph);
      gl_FragColor = vec4(uC, clamp(core*1.2 + ring, 0., 1.) * smoothstep(0.1, 0.4, vFace)); }`,
  });
  spin.add(new THREE.Points(cityGeo, cityMat));

  // Arcs: delegates travelling between conferences, drawn as a moving dash of light.
  const arcMats: THREE.ShaderMaterial[] = [];
  ARCS.forEach(([a, b], i) => {
    const A = toVec(CITIES[a][0], CITIES[a][1], R * 1.01), B = toVec(CITIES[b][0], CITIES[b][1], R * 1.01);
    const mid = A.clone().add(B).multiplyScalar(0.5); const lift = R * (1.12 + A.distanceTo(B) * 0.12);
    mid.normalize().multiplyScalar(lift);
    const curve = new THREE.QuadraticBezierCurve3(A, mid, B);
    const pts = curve.getPoints(80);
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    g.setAttribute('t', new THREE.Float32BufferAttribute(pts.map((_, k) => k / 80), 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: i * 0.37 }, uC: { value: new THREE.Color(i % 3 === 0 ? '#ffd27a' : '#8fb0ff') } },
      vertexShader: 'attribute float t; varying float vT; void main(){ vT = t; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform float uT; uniform vec3 uC; varying float vT;
        void main(){ float head = fract(uT*0.22); float d = head - vT; float a = d > 0. ? smoothstep(0.35, 0., d) : 0.; gl_FragColor = vec4(uC, a*0.95 + 0.06); }`,
    });
    arcMats.push(m); spin.add(new THREE.Line(g, m));
  });

  // Stars.
  const sPos: number[] = [], sSeed: number[] = [];
  for (let i = 0; i < 1600; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(80 + Math.random() * 40); sPos.push(v.x, v.y, v.z); sSeed.push(Math.random() * 6.28); }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
  starGeo.setAttribute('seed', new THREE.Float32BufferAttribute(sSeed, 1));
  const starMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uPr: { value: renderer.getPixelRatio() } },
    vertexShader: 'attribute float seed; uniform float uT; uniform float uPr; varying float vA; void main(){ vA = 0.45 + 0.55*sin(uT*0.9 + seed); vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = (1.2 + fract(seed)*1.6) * uPr; gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord-.5); if (d > .5) discard; gl_FragColor = vec4(vec3(0.82,0.88,1.), smoothstep(.5, 0., d)*vA); }',
  });
  const stars = new THREE.Points(starGeo, starMat); scene.add(stars);

  // Size, scroll and entrance.
  let w = 0, h = 0, visible = true, raf = 0, last = performance.now(), entry = 0, scrollP = 0, sp = 0;
  const resize = () => {
    const r = canvas.getBoundingClientRect(); w = Math.max(1, r.width); h = Math.max(1, r.height);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 }); io.observe(canvas);
  const onScroll = () => { scrollP = Math.min(1, Math.max(0, window.scrollY / Math.max(1, h))); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible) return;
    entry = Math.min(1, entry + dt / 1.8);
    const e = opts.reducedMotion ? 1 : 1 - Math.pow(1 - entry, 3);
    sp += (scrollP - sp) * Math.min(1, dt * 4);
    // Big and low behind the headline, rising into view; scrolling lifts it and zooms it out a little.
    const narrow = w < 720;
    world.position.y = (narrow ? -2.15 : -3.05) + (1 - e) * -3 + sp * 1.2;
    world.scale.setScalar((narrow ? 1.05 : 1.32) - sp * 0.22);
    if (!opts.reducedMotion) spin.rotation.y += dt * 0.06;
    const t = now / 1000;
    cityMat.uniforms.uT.value = t; starMat.uniforms.uT.value = t;
    arcMats.forEach((m, i) => { m.uniforms.uT.value = t + i * 1.7; });
    stars.rotation.y = t * 0.004;
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);
  opts.onReady?.();

  return () => {
    cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); window.removeEventListener('scroll', onScroll);
    scene.traverse((o: any) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    renderer.dispose();
  };
}
