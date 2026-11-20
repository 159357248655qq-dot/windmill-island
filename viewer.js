
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { DRACOLoader } from './vendor/DRACOLoader.js';

const host = document.getElementById('viewer3d');
const statusEl = document.getElementById('viewerStatus');
const barEl = document.getElementById('viewerBar');
const statsEl = document.getElementById('viewerStats');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(host.clientWidth, host.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, host.clientWidth / host.clientHeight, 0.5, 400);
camera.position.set(30, 16, 34);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, -1.5, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 16;
controls.maxDistance = 110;
controls.maxPolarAngle = Math.PI * 0.62;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.55;
controls.update();

// ---- sky dome so the island never floats on a flat colour
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(180, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color('#0a2a63') },
      mid: { value: new THREE.Color('#5aa0e6') },
      bot: { value: new THREE.Color('#ffe4c4') },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: [
      'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;',
      'void main(){',
      '  float h = normalize(vP).y;',
      '  vec3 c = mix(bot, mid, smoothstep(-0.05, 0.30, h));',
      '  c = mix(c, top, smoothstep(0.20, 0.85, h));',
      '  gl_FragColor = vec4(c, 1.0);',
      '}'
    ].join('\n'),
  })
);
scene.add(sky);

// ---- lights: warm key + cool sky fill + rim
const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x4a5a3a, 1.15);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff2dc, 2.9);
key.position.set(26, 34, 18);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1;
key.shadow.camera.far = 140;
const S = 24;
key.shadow.camera.left = -S; key.shadow.camera.right = S;
key.shadow.camera.top = S; key.shadow.camera.bottom = -S;
key.shadow.bias = -0.0008;
key.shadow.normalBias = 0.03;
scene.add(key);

const rim = new THREE.DirectionalLight(0x9fc8ff, 1.35);
rim.position.set(-24, 12, -26);
scene.add(rim);

const bounce = new THREE.DirectionalLight(0xffe0b0, 0.5);
bounce.position.set(-6, -18, 12);
scene.add(bounce);

// ---- load the baked GLB
const draco = new DRACOLoader();
draco.setDecoderPath('./vendor/draco/');
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

let island = null;
let rotor = null;
let clock = new THREE.Clock();
let frames = 0, acc = 0;

function setStatus(t, pct) {
  if (statusEl) statusEl.textContent = t;
  if (barEl && pct != null) barEl.style.width = Math.round(pct * 100) + '%';
}

loader.load(
  'assets/island.glb',
  (gltf) => {
    island = gltf.scene;

    const box = new THREE.Box3().setFromObject(island);
    const c = box.getCenter(new THREE.Vector3());
    island.position.sub(c);
    island.position.y += (box.max.y - box.min.y) * 0.10;
    scene.add(island);

    rotor = island.getObjectByName('Rotor');

    let tris = 0;
    island.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const g = o.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        m.vertexColors = !!g.attributes.color;
        if (m.emissiveIntensity > 1) m.emissiveIntensity = 1;
        if (m.transparent) { m.depthWrite = false; m.side = THREE.DoubleSide; }
        m.envMapIntensity = 0.6;
      }
    });

    if (statsEl) statsEl.textContent = tris.toLocaleString('en-US') + ' 三角面 · ' + island.children.length + ' 顶层节点';
    setStatus('拖动旋转 · 滚轮缩放 · 右键平移', 1);
    if (barEl) barEl.parentElement.style.opacity = '0';
    document.body.classList.add('viewer-ready');
  },
  (e) => {
    if (e.lengthComputable) setStatus('正在加载模型 ' + Math.round(e.loaded / e.total * 100) + '%', e.loaded / e.total);
    else setStatus('正在加载模型…', null);
  },
  (err) => {
    console.error(err);
    setStatus('模型加载失败：' + (err && err.message ? err.message : err), null);
    if (barEl) barEl.style.background = '#e2684f';
  }
);

// ---- resize
const ro = new ResizeObserver(() => {
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});
ro.observe(host);

// ---- ui hooks
const btnRotate = document.getElementById('btnRotate');
const btnReset = document.getElementById('btnReset');
const btnFull = document.getElementById('btnFull');

if (btnRotate) btnRotate.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  btnRotate.dataset.on = controls.autoRotate ? '1' : '0';
  btnRotate.textContent = controls.autoRotate ? '暂停自转' : '自动旋转';
});
if (btnReset) btnReset.addEventListener('click', () => {
  camera.position.set(30, 16, 34);
  controls.target.set(0, -1.5, 0);
  controls.update();
});
if (btnFull) btnFull.addEventListener('click', () => {
  const el = host;
  if (!document.fullscreenElement) el.requestFullscreen && el.requestFullscreen();
  else document.exitFullscreen && document.exitFullscreen();
});

// ---- loop
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (rotor) rotor.rotation.y += dt * 0.55;
  controls.update();
  renderer.render(scene, camera);

  frames++; acc += dt;
  if (acc >= 1.0) {
    const fps = frames / acc;
    if (statsEl && island) {
      statsEl.textContent = statsEl.dataset.base || statsEl.textContent;
    }
    frames = 0; acc = 0;
  }
});
