import * as THREE from "three";
import {
  disposeAudio,
  isMuted,
  sfxDry,
  sfxHurt,
  sfxKill,
  sfxMelee,
  sfxPickup,
  sfxReload,
  sfxShot,
  sfxSpit,
  sfxStep,
  sfxWet,
  toggleMute,
  unlockAudio,
} from "./audio";
import { circleTexture, createMaps } from "./textures";

export type Pad = {
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  fire: boolean;
  firePulse: boolean;
  jumpEdge: boolean;
  reloadEdge: boolean;
};

export type Shell = {
  health: HTMLElement;
  hpBar: HTMLElement;
  ammo: HTMLElement;
  reserve: HTMLElement;
  wave: HTMLElement;
  kills: HTMLElement;
  feed: HTMLElement;
  announce: HTMLElement;
  menu: HTMLElement;
  pause: HTMLElement;
  end: HTMLElement;
  endTitle: HTMLElement;
  endText: HTMLElement;
  best: HTMLElement;
  hud: HTMLElement;
  vig: HTMLElement;
  cross: HTMLElement;
  blood: HTMLCanvasElement;
  touch: HTMLElement;
  mute: HTMLElement;
  chrome: HTMLElement;
};

export type GameApi = {
  start: () => void;
  resume: () => void;
  pause: () => void;
  retry: () => void;
  toggleSound: () => void;
  dispose: () => void;
};

type Status = "menu" | "play" | "pause" | "dead" | "win";
type AABB = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
type Kind = "rusher" | "spitter" | "brute";

type Node = { x: number; y: number; z: number; px: number; py: number; pz: number; r: number };
type Constraint = { a: number; b: number; len: number; broken: boolean };
type Bone = { mesh: THREE.Mesh; a: number; b: number; radius: number };

type Enemy = {
  kind: Kind;
  hp: number;
  maxHp: number;
  speed: number;
  scale: number;
  melee: number;
  ranged: boolean;
  radius: number;
  x: number;
  y: number;
  z: number;
  vy: number;
  yaw: number;
  phase: number;
  attackCd: number;
  stun: number;
  hurt: number;
  bleed: number;
  see: boolean;
  seeT: number;
  strafe: number;
  moveAmt: number;
  dead: boolean;
  settled: boolean;
  deadFor: number;
  removed: boolean;
  headGone: boolean;
  nodes: Node[];
  constraints: Constraint[];
  bones: Bone[];
  headPivot: THREE.Group;
  torso: THREE.Mesh;
  pelvisMesh: THREE.Mesh;
  handL: THREE.Mesh;
  handR: THREE.Mesh;
  bar: THREE.Mesh;
  barFill: THREE.Mesh;
  skin: THREE.MeshStandardMaterial;
  cloth: THREE.MeshStandardMaterial;
  meshes: THREE.Object3D[];
};

const PELVIS = 0;
const CHEST = 1;
const HEAD = 2;
const HAND_L = 3;
const HAND_R = 4;
const KNEE_L = 5;
const KNEE_R = 6;
const FOOT_L = 7;
const FOOT_R = 8;

const STEP = 1 / 60;
const MAG = 6;
const SAVE_KEY = "viscera-best-v1";
const PMAX = 1400;
const DMAX = 150;

const KIND: Record<Kind, { hp: number; speed: number; scale: number; melee: number; ranged: boolean; skin: number; cloth: number }> = {
  rusher: { hp: 86, speed: 3.15, scale: 1, melee: 14, ranged: false, skin: 0xc48b78, cloth: 0x2a2422 },
  spitter: { hp: 64, speed: 2.55, scale: 1.02, melee: 10, ranged: true, skin: 0xd8b6a6, cloth: 0x3d181c },
  brute: { hp: 190, speed: 2.05, scale: 1.34, melee: 26, ranged: false, skin: 0x8d3a36, cloth: 0x221614 },
};

const NAMES: Record<Kind, string> = {
  rusher: "Poseído",
  spitter: "Hemófago",
  brute: "Carnicero",
};

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      getPos: () => { x: number; y: number; z: number };
      setKeys: (codes: string[]) => void;
    };
  }
}

const _up = new THREE.Vector3(0, 1, 0);
const _z = new THREE.Vector3(0, 0, 1);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _col = new THREE.Color();
const _dummy = new THREE.Object3D();

export function startGame(canvas: HTMLCanvasElement, shell: Shell, pad: Pad): GameApi {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = window.matchMedia("(pointer: fine)").matches;
  const shadows = window.matchMedia("(min-width: 800px)").matches;

  const maps = createMaps();
  const circle = circleTexture();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, shadows ? 1.5 : 1.25));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false;
  const aniso = renderer.capabilities.getMaxAnisotropy();
  for (const t of [maps.concrete, maps.floor, maps.wood, maps.skin]) t.anisotropy = aniso;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x120e0c);
  scene.fog = new THREE.FogExp2(0x120e0c, 0.03);

  const camera = new THREE.PerspectiveCamera(78, 1, 0.08, 80);
  const yawObj = new THREE.Group();
  yawObj.add(camera);
  scene.add(yawObj);

  const spot = new THREE.SpotLight(0xfff3e6, 16, 28, 0.58, 0.5, 1.3);
  spot.position.set(0.05, -0.02, 0.05);
  camera.add(spot);
  spot.target.position.set(0, 0, -1);
  camera.add(spot.target);

  scene.add(new THREE.AmbientLight(0x4a3228, 0.42));
  scene.add(new THREE.HemisphereLight(0xffe6d0, 0x1a100e, 0.62));
  const dir = new THREE.DirectionalLight(0xffe2cc, 1.7);
  dir.position.set(10, 22, 8);
  dir.castShadow = shadows;
  dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.near = 1;
  dir.shadow.camera.far = 48;
  dir.shadow.camera.left = -20;
  dir.shadow.camera.right = 20;
  dir.shadow.camera.top = 20;
  dir.shadow.camera.bottom = -20;
  dir.shadow.bias = -0.0004;
  scene.add(dir);
  scene.add(dir.target);
  dir.target.position.set(0, 0, -4);

  const flash = new THREE.PointLight(0xff2a2a, 0, 9, 2);
  scene.add(flash);

  const viewScene = new THREE.Scene();
  const viewCamera = new THREE.PerspectiveCamera(42, 1, 0.05, 8);
  viewScene.add(new THREE.AmbientLight(0xffffff, 0.62));
  const viewKey = new THREE.DirectionalLight(0xfff1e4, 2.4);
  viewKey.position.set(1.2, 1.6, 1);
  viewScene.add(viewKey);
  viewScene.add(new THREE.PointLight(0xff3330, 4, 3, 2));

  const solids: AABB[] = [];
  const floorMat = new THREE.MeshStandardMaterial({ map: maps.floor, color: 0x8a7b70, roughness: 0.92, metalness: 0.02 });
  maps.floor.repeat.set(10, 10);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(48, 48), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x161210, roughness: 0.95 });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(36, 40), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 3.7;
  scene.add(ceil);

  function tileMat(tex: THREE.Texture, rx: number, ry: number, color: number, rough: number) {
    const map = tex.clone();
    map.needsUpdate = true;
    map.repeat.set(rx, ry);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = aniso;
    return new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: 0.04 });
  }

  function addSolid(minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number, mat: THREE.Material, cast = false) {
    solids.push({ minX, maxX, minY, maxY, minZ, maxZ });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ), mat);
    mesh.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    mesh.castShadow = cast && shadows;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  const wallH = 3.7;
  const wallMatW = tileMat(maps.concrete, 1.2, 2.2, 0x6e655f, 0.86);
  const wallMatL = tileMat(maps.concrete, 8, 2.2, 0x6a615b, 0.88);
  addSolid(-15.7, -14.85, 0, wallH, -20.2, 14.2, wallMatL);
  addSolid(14.85, 15.7, 0, wallH, -20.2, 14.2, wallMatL);
  addSolid(-15.7, 15.7, 0, wallH, -20.5, -19.7, wallMatW);
  addSolid(-15.7, 15.7, 0, wallH, 13.85, 14.6, wallMatW);

  const pillarMat = tileMat(maps.concrete, 1, 2, 0x5e564f, 0.8);
  const pillars: Array<[number, number]> = [
    [-8, -4.5],
    [8, -4.5],
    [-8, -12],
    [7.2, -13],
    [0, -7.6],
  ];
  for (const [px, pz] of pillars) {
    addSolid(px - 0.65, px + 0.65, 0, wallH, pz - 0.65, pz + 0.65, pillarMat, true);
  }

  const crateMat = new THREE.MeshStandardMaterial({ map: maps.wood, color: 0xffffff, roughness: 0.78 });
  const crates: Array<[number, number, number, number]> = [
    [4.4, 6.4, 1.05, 0.82],
    [-5.4, 2.6, 1.15, 1.02],
    [9.2, -1.6, 1.35, 1.08],
    [-10.2, -8.6, 1.1, 0.9],
    [2.6, -3.2, 1, 0.7],
    [-3.2, 8.2, 0.85, 0.62],
  ];
  for (const [cx, cz, s, h] of crates) {
    addSolid(cx - s / 2, cx + s / 2, 0, h, cz - s / 2, cz + s / 2, crateMat, true);
  }
  addSolid(6.1, 9.6, 0, 1.05, -7.35, -6.6, pillarMat, true);
  addSolid(-9.6, -6.1, 0, 1.05, -7.35, -6.6, pillarMat, true);
  const altarMat = tileMat(maps.concrete, 2, 1, 0x4a342f, 0.7);
  addSolid(-3.15, 3.15, 0, 0.42, -18.35, -14.7, altarMat, true);

  const poolMat = new THREE.MeshPhysicalMaterial({
    color: 0x6e0c12,
    roughness: 0.16,
    metalness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    emissive: 0x240204,
    emissiveIntensity: 0.35,
  });
  function addPool(x: number, y: number, z: number, r: number) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 22), poolMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    scene.add(m);
  }
  addPool(-1.15, 0.028, 5.35, 1.4);
  addPool(0.2, 0.448, -16.2, 1.65);
  addPool(0.3, 0.026, -12.4, 2.15);

  const metal = new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.86, roughness: 0.34 });
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 14, 8), metal);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(0, 3.32, 5.35);
  scene.add(pipe);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.45, 8), metal);
  spout.position.set(-1.15, 3.05, 5.35);
  scene.add(spout);

  function lamp(x: number, y: number, z: number, color: number, intensity: number, dist: number) {
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a0505, emissive: color, emissiveIntensity: 2.4 }),
    );
    bulb.position.set(x, y, z);
    scene.add(bulb);
    const light = new THREE.PointLight(color, intensity, dist, 2);
    light.position.set(x, y, z);
    scene.add(light);
  }
  lamp(0, 3.2, 6.2, 0xffc9a0, 20, 20);
  lamp(-11.2, 3.15, -1.5, 0xff2a2a, 16, 15);
  lamp(11.2, 3.15, -1.5, 0xff2a2a, 16, 15);
  lamp(0, 3.25, -15.6, 0xffb080, 24, 18);
  lamp(-11, 3.1, -14.5, 0xff1e1e, 12, 13);
  lamp(11, 3.1, -14.5, 0xff1e1e, 12, 13);

  const stripMat = new THREE.MeshStandardMaterial({ color: 0x2a0000, emissive: 0xff2a2a, emissiveIntensity: 1.6, roughness: 0.4 });
  for (const z of [-16, -8, 0, 8]) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.12), stripMat);
    a.position.set(-14.78, 2.3, z);
    scene.add(a);
    const b = a.clone();
    b.position.x = 14.78;
    scene.add(b);
  }

  const gun = new THREE.Group();
  const gunMetal = new THREE.MeshStandardMaterial({ color: 0x2a2e36, metalness: 0.9, roughness: 0.28 });
  const gunDark = new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.75, roughness: 0.4 });
  const gunWood = new THREE.MeshStandardMaterial({ color: 0x6b3e29, roughness: 0.7, metalness: 0.04 });
  const gunRed = new THREE.MeshStandardMaterial({
    color: 0x6a1414,
    emissive: 0x4a0000,
    emissiveIntensity: 0.55,
    roughness: 0.42,
    metalness: 0.25,
  });
  function gunPart(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    gun.add(m);
    return m;
  }
  gunPart(new THREE.BoxGeometry(0.075, 0.12, 0.36), gunWood, 0, -0.02, 0.2);
  gunPart(new THREE.BoxGeometry(0.086, 0.1, 0.3), gunMetal, 0, 0.02, -0.04);
  const b1 = new THREE.CylinderGeometry(0.02, 0.022, 0.64, 8);
  b1.rotateX(-Math.PI / 2);
  gunPart(b1, gunDark, 0, 0.05, -0.42);
  const b2 = new THREE.CylinderGeometry(0.016, 0.018, 0.58, 8);
  b2.rotateX(-Math.PI / 2);
  gunPart(b2, gunDark, 0, 0.012, -0.38);
  const pump = gunPart(new THREE.BoxGeometry(0.074, 0.05, 0.16), gunWood, 0, -0.005, -0.26);
  gunPart(new THREE.BoxGeometry(0.014, 0.034, 0.014), gunRed, 0, 0.09, -0.06);
  gunPart(new THREE.BoxGeometry(0.046, 0.05, 0.04), gunMetal, 0, 0.03, -0.74);
  const flashMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2d2d, transparent: true, opacity: 0.95, depthTest: false }),
  );
  flashMesh.position.set(0, 0.032, -0.78);
  flashMesh.visible = false;
  gun.add(flashMesh);
  gun.position.set(0.22, -0.28, -0.42);
  viewScene.add(gun);

  const geoSphere = new THREE.SphereGeometry(1, 14, 10);
  const geoEye = new THREE.SphereGeometry(1, 8, 6);
  const geoCyl = new THREE.CylinderGeometry(1, 1, 1, 6);
  const geoBox = new THREE.BoxGeometry(1, 1, 1);
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x1a1818, roughness: 0.72, metalness: 0.15 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x1a0608, roughness: 0.5 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a0000, emissive: 0xff1a1a, emissiveIntensity: 1.8, roughness: 0.3 });
  const skinBase = new THREE.MeshStandardMaterial({ map: maps.skin, color: 0xffffff, roughness: 0.58, metalness: 0.02 });
  const clothBase = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.06 });
  const barBg = new THREE.MeshBasicMaterial({ color: 0x1a1210 });
  const barFg = new THREE.MeshBasicMaterial({ color: 0xd6272a });
  const fleshMat = new THREE.MeshStandardMaterial({
    color: 0x7a2422,
    roughness: 0.48,
    metalness: 0.04,
    emissive: 0x1c0000,
    emissiveIntensity: 0.25,
  });
  const blobMat = new THREE.MeshPhysicalMaterial({
    color: 0xb01018,
    roughness: 0.12,
    metalness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    emissive: 0x2a0004,
    emissiveIntensity: 0.45,
  });
  const projMat = new THREE.MeshStandardMaterial({
    color: 0xff2a2a,
    emissive: 0xff1a1a,
    emissiveIntensity: 2,
    roughness: 0.25,
  });

  const pX = new Float32Array(PMAX);
  const pY = new Float32Array(PMAX);
  const pZ = new Float32Array(PMAX);
  const pVX = new Float32Array(PMAX);
  const pVY = new Float32Array(PMAX);
  const pVZ = new Float32Array(PMAX);
  const pLife = new Float32Array(PMAX);
  const pMax = new Float32Array(PMAX);
  const pSize = new Float32Array(PMAX);
  const pKind = new Uint8Array(PMAX);
  const pR = new Float32Array(PMAX);
  const pG = new Float32Array(PMAX);
  const pB = new Float32Array(PMAX);
  let pN = 0;
  const pPos = new Float32Array(PMAX * 3);
  const pCol = new Float32Array(PMAX * 3);
  const pSz = new Float32Array(PMAX);
  const pAl = new Float32Array(PMAX);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute("aColor", new THREE.BufferAttribute(pCol, 3));
  pGeo.setAttribute("aSize", new THREE.BufferAttribute(pSz, 1));
  pGeo.setAttribute("aAlpha", new THREE.BufferAttribute(pAl, 1));
  const pMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: circle },
      uFogColor: { value: new THREE.Color(0x120e0c) },
      uFogDensity: { value: 0.03 },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      attribute vec3 aColor;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vDist;
      void main() {
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = length(mv.xyz);
        gl_PointSize = clamp(aSize * (720.0 / max(0.15, -mv.z)), 1.5, 96.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vDist;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        float a = tex.a * vAlpha;
        if (a < 0.03) discard;
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);
        vec3 col = mix(vColor, uFogColor, clamp(fogFactor, 0.0, 1.0));
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);

  type Decal = {
    active: boolean;
    x: number;
    y: number;
    z: number;
    nx: number;
    ny: number;
    nz: number;
    vol: number;
    age: number;
  };
  const decals: Decal[] = Array.from({ length: DMAX }, () => ({
    active: false,
    x: 0,
    y: 0,
    z: 0,
    nx: 0,
    ny: 1,
    nz: 0,
    vol: 0,
    age: 0,
  }));
  const decalMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.26,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const decalMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 10), decalMat, DMAX);
  decalMesh.frustumCulled = false;
  decalMesh.receiveShadow = true;
  scene.add(decalMesh);
  for (let i = 0; i < DMAX; i++) {
    _dummy.scale.set(0, 0, 0);
    _dummy.updateMatrix();
    decalMesh.setMatrixAt(i, _dummy.matrix);
    decalMesh.setColorAt(i, _col.setRGB(0.5, 0.02, 0.03));
  }
  decalMesh.instanceMatrix.needsUpdate = true;
  if (decalMesh.instanceColor) decalMesh.instanceColor.needsUpdate = true;

  type Blob = {
    mesh: THREE.Mesh;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    vol: number;
    active: boolean;
    stuck: boolean;
    spin: number;
  };
  const blobs: Blob[] = [];
  for (let i = 0; i < 42; i++) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), blobMat);
    mesh.castShadow = shadows;
    mesh.visible = false;
    scene.add(mesh);
    blobs.push({ mesh, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, vol: 0.1, active: false, stuck: false, spin: 0 });
  }
  type Gib = {
    mesh: THREE.Mesh;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    rx: number;
    ry: number;
    active: boolean;
    stuck: boolean;
  };
  const gibs: Gib[] = [];
  for (let i = 0; i < 36; i++) {
    const mesh = new THREE.Mesh(geoBox, fleshMat);
    mesh.castShadow = shadows;
    mesh.visible = false;
    scene.add(mesh);
    gibs.push({ mesh, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, active: false, stuck: false });
  }
  type Proj = { mesh: THREE.Mesh; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; active: boolean };
  const projs: Proj[] = [];
  for (let i = 0; i < 14; i++) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), projMat);
    mesh.visible = false;
    scene.add(mesh);
    projs.push({ mesh, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, active: false });
  }

  const enemies: Enemy[] = [];
  const keys = new Set<string>();
  const player = {
    x: 0,
    y: 0,
    z: 10,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: -0.12,
    grounded: true,
    health: 100,
    iframe: 0,
    bob: 0,
    crouch: 0,
    radius: 0.34,
  };
  let status: Status = "menu";
  let hostile = false;
  let announced = false;
  let ammo = MAG;
  let reserve = 42;
  let cool = 0;
  let reload = 0;
  let fireHeld = false;
  let recoil = 0;
  let recoilPitch = 0;
  let recoilYaw = 0;
  let shake = 0;
  let hurtFlash = 0;
  let kills = 0;
  let wave = 1;
  let waveGap = 0;
  let time = 0;
  let lookX = 0;
  let lookY = 0;
  let stepAcc = 0;
  let mistAcc = 0;
  let flashT = 0;
  let feedT = 0;
  let announceT = 0;
  let hitT = 0;
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let hadLock = false;
  const bloodCtx = shell.blood.getContext("2d");
  const drops: { x: number; y: number; r: number; vy: number; a: number; stretch: number }[] = [];

  function readBest() {
    try {
      return Number(localStorage.getItem(SAVE_KEY) || "0") || 0;
    } catch {
      return 0;
    }
  }
  function score() {
    return kills * 120 + Math.max(0, player.health) * 3;
  }
  function say(msg: string) {
    shell.feed.textContent = msg;
    feedT = 2.1;
  }
  function announce(msg: string) {
    shell.announce.textContent = msg;
    announceT = 2.3;
  }
  function syncPanels() {
    shell.menu.classList.toggle("hidden", status !== "menu");
    shell.pause.classList.toggle("hidden", status !== "pause");
    shell.end.classList.toggle("hidden", status !== "dead" && status !== "win");
    shell.hud.classList.toggle("hidden", status === "menu");
    shell.cross.classList.toggle("hidden", status !== "play");
    shell.touch.classList.toggle("hidden", status !== "play");
    shell.chrome.classList.toggle("hidden", status !== "play");
    gun.visible = status === "play" || status === "pause";
  }
  function syncHud() {
    shell.health.textContent = String(Math.max(0, Math.ceil(player.health)));
    shell.hpBar.style.width = `${Math.max(0, player.health)}%`;
    shell.ammo.textContent = String(ammo);
    shell.reserve.textContent = String(reserve);
    shell.wave.textContent = `${wave} / 3`;
    shell.kills.textContent = String(kills);
    shell.health.classList.toggle("text-primary", player.health <= 30);
    shell.health.classList.toggle("text-fg", player.health > 30);
    shell.ammo.classList.toggle("text-primary", ammo === 0);
    shell.ammo.classList.toggle("text-accent", ammo > 0);
    const low = player.health < 36 ? (36 - player.health) / 70 : 0;
    shell.vig.style.opacity = String(Math.min(0.85, low + hurtFlash));
    shell.cross.classList.toggle("is-hit", hitT > 0);
    shell.feed.style.opacity = feedT > 0 ? "1" : "0";
    shell.announce.style.opacity = String(Math.min(1, announceT));
    shell.mute.textContent = isMuted() ? "Sonido off" : "Sonido on";
  }

  function surfaceBelow(x: number, z: number, y: number) {
    let g = 0;
    for (const b of solids) {
      if (x <= b.minX || x >= b.maxX || z <= b.minZ || z >= b.maxZ) continue;
      if (b.maxY <= y + 0.2) g = Math.max(g, b.maxY);
    }
    return g;
  }
  function groundHeight(x: number, z: number, feetY: number) {
    let g = 0;
    for (const b of solids) {
      if (x <= b.minX || x >= b.maxX || z <= b.minZ || z >= b.maxZ) continue;
      if (b.maxY > feetY + 0.08) continue;
      if (feetY - b.maxY > 0.65) continue;
      g = Math.max(g, b.maxY);
    }
    return g;
  }
  function collideCircle(x: number, z: number, y: number, radius: number, height: number) {
    let stepped = false;
    for (let iter = 0; iter < 3; iter++) {
      for (const b of solids) {
        if (y + height < b.minY + 0.01) continue;
        if (y >= b.maxY - 0.02) continue;
        const overlaps =
          x + radius > b.minX && x - radius < b.maxX && z + radius > b.minZ && z - radius < b.maxZ;
        if (!overlaps) continue;
        if (b.maxY - y <= 0.48 && b.maxY > y) {
          y = b.maxY;
          stepped = true;
          continue;
        }
        const cx = Math.min(Math.max(x, b.minX), b.maxX);
        const cz = Math.min(Math.max(z, b.minZ), b.maxZ);
        let dx = x - cx;
        let dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 < 1e-8) {
          const left = x - b.minX;
          const right = b.maxX - x;
          const back = z - b.minZ;
          const front = b.maxZ - z;
          const m = Math.min(left, right, back, front);
          if (m === left) x = b.minX - radius;
          else if (m === right) x = b.maxX + radius;
          else if (m === back) z = b.minZ - radius;
          else z = b.maxZ + radius;
        } else {
          const d = Math.sqrt(d2);
          const pen = radius - d;
          x += (dx / d) * pen;
          z += (dz / d) * pen;
        }
      }
    }
    return { x, z, y, stepped };
  }
  function pushOut(x: number, y: number, z: number) {
    for (const b of solids) {
      if (x <= b.minX || x >= b.maxX || y <= b.minY || y >= b.maxY || z <= b.minZ || z >= b.maxZ) continue;
      const faces = [
        { d: x - b.minX, nx: -1, ny: 0, nz: 0, ax: b.minX, ay: y, az: z },
        { d: b.maxX - x, nx: 1, ny: 0, nz: 0, ax: b.maxX, ay: y, az: z },
        { d: y - b.minY, nx: 0, ny: -1, nz: 0, ax: x, ay: b.minY, az: z },
        { d: b.maxY - y, nx: 0, ny: 1, nz: 0, ax: x, ay: b.maxY, az: z },
        { d: z - b.minZ, nx: 0, ny: 0, nz: -1, ax: x, ay: y, az: b.minZ },
        { d: b.maxZ - z, nx: 0, ny: 0, nz: 1, ax: x, ay: y, az: b.maxZ },
      ];
      let best = faces[0];
      for (const f of faces) if (f.d < best.d) best = f;
      return {
        x: best.ax + best.nx * 0.02,
        y: best.ay + best.ny * 0.02,
        z: best.az + best.nz * 0.02,
        nx: best.nx,
        ny: best.ny,
        nz: best.nz,
      };
    }
    return null;
  }
  function rayAABB(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: AABB, tmaxCap: number) {
    let tmin = 0;
    let tmax = tmaxCap;
    const o = [ox, oy, oz];
    const d = [dx, dy, dz];
    const mn = [b.minX, b.minY, b.minZ];
    const mx = [b.maxX, b.maxY, b.maxZ];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-8) {
        if (o[i] < mn[i] || o[i] > mx[i]) return null;
      } else {
        let t1 = (mn[i] - o[i]) / d[i];
        let t2 = (mx[i] - o[i]) / d[i];
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return null;
      }
    }
    if (tmax < 0) return null;
    return tmin >= 0 ? tmin : 0;
  }
  function nearestWall(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number) {
    let best: { t: number; nx: number; ny: number; nz: number } | null = null;
    for (const b of solids) {
      const t = rayAABB(ox, oy, oz, dx, dy, dz, b, maxT);
      if (t === null || t <= 0.02) continue;
      if (!best || t < best.t) {
        const hx = ox + dx * t;
        const hy = oy + dy * t;
        const hz = oz + dz * t;
        const faces = [
          { d: Math.abs(hx - b.minX), n: [-1, 0, 0] },
          { d: Math.abs(hx - b.maxX), n: [1, 0, 0] },
          { d: Math.abs(hy - b.minY), n: [0, -1, 0] },
          { d: Math.abs(hy - b.maxY), n: [0, 1, 0] },
          { d: Math.abs(hz - b.minZ), n: [0, 0, -1] },
          { d: Math.abs(hz - b.maxZ), n: [0, 0, 1] },
        ];
        let f = faces[0];
        for (const face of faces) if (face.d < f.d) f = face;
        best = { t, nx: f.n[0], ny: f.n[1], nz: f.n[2] };
      }
    }
    if (dy < -1e-4) {
      const tg = (0 - oy) / dy;
      if (tg > 0.02 && tg < maxT && (!best || tg < best.t)) best = { t: tg, nx: 0, ny: 1, nz: 0 };
    }
    return best;
  }
  function clearLos(x: number, y: number, z: number, tx: number, ty: number, tz: number) {
    const dx = tx - x;
    const dy = ty - y;
    const dz = tz - z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.001) return true;
    const hit = nearestWall(x, y, z, dx / dist, dy / dist, dz / dist, dist);
    return !hit || hit.t > dist - 0.2;
  }

  function killParticle(i: number) {
    const last = pN - 1;
    if (i !== last) {
      pX[i] = pX[last];
      pY[i] = pY[last];
      pZ[i] = pZ[last];
      pVX[i] = pVX[last];
      pVY[i] = pVY[last];
      pVZ[i] = pVZ[last];
      pLife[i] = pLife[last];
      pMax[i] = pMax[last];
      pSize[i] = pSize[last];
      pKind[i] = pKind[last];
      pR[i] = pR[last];
      pG[i] = pG[last];
      pB[i] = pB[last];
    }
    pN = Math.max(0, pN - 1);
  }
  function spawnP(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    kind: number,
    r: number,
    g: number,
    b: number,
  ) {
    if (pN >= PMAX) killParticle(0);
    const i = pN++;
    pX[i] = x;
    pY[i] = y;
    pZ[i] = z;
    pVX[i] = vx;
    pVY[i] = vy;
    pVZ[i] = vz;
    pLife[i] = life;
    pMax[i] = life;
    pSize[i] = size;
    pKind[i] = kind;
    pR[i] = r;
    pG[i] = g;
    pB[i] = b;
  }
  function spray(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    count: number,
    speed: number,
    kind: number,
  ) {
    for (let i = 0; i < count; i++) {
      const rx = nx + (Math.random() - 0.5) * 1.3;
      const ry = ny + (Math.random() - 0.2) * 1.1;
      const rz = nz + (Math.random() - 0.5) * 1.3;
      const len = Math.hypot(rx, ry, rz) || 1;
      const sp = speed * (0.35 + Math.random() * 0.9);
      if (kind === 0) {
        spawnP(x, y, z, (rx / len) * sp, (ry / len) * sp, (rz / len) * sp, 0.16 + Math.random() * 0.22, 0.045 + Math.random() * 0.05, 0, 1, 0.12 + Math.random() * 0.15, 0.08);
      } else {
        const bright = Math.random();
        spawnP(
          x,
          y,
          z,
          (rx / len) * sp,
          (ry / len) * sp + 0.4,
          (rz / len) * sp,
          0.7 + Math.random() * 0.7,
          0.05 + Math.random() * 0.1,
          1,
          0.55 + bright * 0.45,
          0.015 + bright * 0.04,
          0.02,
        );
      }
    }
  }
  function addDecal(x: number, y: number, z: number, nx: number, ny: number, nz: number, vol: number) {
    for (const d of decals) {
      if (!d.active) continue;
      const dx = d.x - x;
      const dy = d.y - y;
      const dz = d.z - z;
      if (dx * dx + dy * dy + dz * dz < 0.22 && d.nx * nx + d.ny * ny + d.nz * nz > 0.75) {
        d.vol = Math.min(3.2, d.vol + vol);
        d.age = Math.min(d.age, 0.4);
        return;
      }
    }
    let slot = decals.find((d) => !d.active);
    if (!slot) {
      slot = decals[0];
      for (const d of decals) if (d.age > slot.age) slot = d;
    }
    slot.active = true;
    slot.x = x + nx * 0.02;
    slot.y = y + ny * 0.02;
    slot.z = z + nz * 0.02;
    slot.nx = nx;
    slot.ny = ny;
    slot.nz = nz;
    slot.vol = vol;
    slot.age = 0;
  }
  function allocBlob() {
    let b = blobs.find((x) => !x.active);
    if (!b) b = blobs.reduce((a, c) => (c.stuck && c.vol < a.vol ? c : a));
    return b;
  }
  function spawnBlobs(x: number, y: number, z: number, nx: number, ny: number, nz: number, count: number, power: number) {
    for (let i = 0; i < count; i++) {
      const b = allocBlob();
      b.active = true;
      b.stuck = false;
      b.mesh.visible = true;
      b.x = x;
      b.y = y;
      b.z = z;
      const sp = power * (0.6 + Math.random());
      const rx = nx + (Math.random() - 0.5) * 1.1;
      const ry = ny + Math.random() * 0.8;
      const rz = nz + (Math.random() - 0.5) * 1.1;
      const len = Math.hypot(rx, ry, rz) || 1;
      b.vx = (rx / len) * sp;
      b.vy = (ry / len) * sp + 1.2;
      b.vz = (rz / len) * sp;
      b.vol = 0.07 + Math.random() * 0.1;
      b.spin = Math.random() * 6;
      b.mesh.scale.setScalar(b.vol);
    }
  }
  function spawnGibs(x: number, y: number, z: number, count: number) {
    for (let i = 0; i < count; i++) {
      let g = gibs.find((item) => !item.active);
      if (!g) g = gibs[i % gibs.length];
      g.active = true;
      g.stuck = false;
      g.mesh.visible = true;
      g.x = x;
      g.y = y;
      g.z = z;
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 4.5;
      g.vx = Math.cos(a) * sp;
      g.vz = Math.sin(a) * sp;
      g.vy = 2 + Math.random() * 4;
      g.rx = Math.random() * 8;
      g.ry = Math.random() * 8;
      g.mesh.scale.set(0.08 + Math.random() * 0.14, 0.05 + Math.random() * 0.1, 0.07 + Math.random() * 0.12);
    }
  }
  function splatter(x: number, y: number, z: number, nx: number, ny: number, nz: number, amount: number) {
    spray(x, y, z, nx, ny, nz, Math.round(16 * amount), 4.5 * amount, 1);
    spawnBlobs(x, y, z, nx, ny, nz, Math.max(2, Math.round(4 * amount)), 3.2 * amount);
    if (amount > 0.8) spawnGibs(x, y, z, Math.round(4 * amount));
  }
  function screenBlood(n: number) {
    const w = shell.blood.width || 400;
    const h = shell.blood.height || 300;
    for (let i = 0; i < n; i++) {
      drops.push({
        x: Math.random() * w,
        y: Math.random() * h * 0.45,
        r: (10 + Math.random() * 28) * (w / 900),
        vy: 12 + Math.random() * 40,
        a: 0.35 + Math.random() * 0.4,
        stretch: 1.1 + Math.random() * 1.4,
      });
    }
    if (drops.length > 36) drops.splice(0, drops.length - 36);
  }

  function localToWorld(ox: number, oy: number, oz: number, yaw: number, lx: number, ly: number, lz: number) {
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    return { x: ox + rx * lx + fx * lz, y: oy + ly, z: oz + rz * lx + fz * lz };
  }
  function makeNode(r: number): Node {
    return { x: 0, y: r, z: 0, px: 0, py: r, pz: 0, r };
  }
  function pose(e: Enemy) {
    const s = e.scale;
    const freq = e.kind === "brute" ? 5.2 : 7.4;
    const swing = Math.sin(time * freq + e.phase);
    const leg = swing * 0.38 * s * e.moveAmt;
    const arm = swing * 0.28 * s * e.moveAmt;
    const breath = Math.sin(time * 2.1 + e.phase) * 0.015 * s;
    const feet = e.y;
    const p = localToWorld(e.x, feet, e.z, e.yaw, 0, 0.9 * s + breath, 0);
    const c = localToWorld(e.x, feet, e.z, e.yaw, 0, 1.34 * s + breath, 0.02 * s);
    const h = localToWorld(e.x, feet, e.z, e.yaw, 0, 1.68 * s + breath, 0.03 * s);
    const hl = localToWorld(e.x, feet, e.z, e.yaw, -0.34 * s, 0.98 * s, arm);
    const hr = localToWorld(e.x, feet, e.z, e.yaw, 0.34 * s, 0.98 * s, -arm);
    const kl = localToWorld(e.x, feet, e.z, e.yaw, -0.14 * s, 0.48 * s, leg * 0.25);
    const kr = localToWorld(e.x, feet, e.z, e.yaw, 0.14 * s, 0.48 * s, -leg * 0.25);
    const fl = localToWorld(e.x, feet, e.z, e.yaw, -0.14 * s, 0.06 * s, -leg);
    const fr = localToWorld(e.x, feet, e.z, e.yaw, 0.14 * s, 0.06 * s, leg);
    const pts = [p, c, h, hl, hr, kl, kr, fl, fr];
    for (let i = 0; i < 9; i++) {
      const n = e.nodes[i];
      n.x = pts[i].x;
      n.y = pts[i].y;
      n.z = pts[i].z;
      n.px = n.x;
      n.py = n.y;
      n.pz = n.z;
    }
  }
  function syncBody(e: Enemy) {
    const s = e.scale;
    const pelvis = e.nodes[PELVIS];
    const chest = e.nodes[CHEST];
    const head = e.nodes[HEAD];
    e.pelvisMesh.position.set(pelvis.x, pelvis.y, pelvis.z);
    _a.set(chest.x - pelvis.x, chest.y - pelvis.y, chest.z - pelvis.z);
    const spineLen = Math.max(0.08, _a.length());
    _a.multiplyScalar(1 / spineLen);
    const fx = -Math.sin(e.yaw);
    const fz = -Math.cos(e.yaw);
    _b.set(fx, 0, fz);
    const dot = _a.dot(_b);
    _b.addScaledVector(_a, -dot);
    if (_b.lengthSq() < 1e-6) _b.set(-_a.z, 0, _a.x);
    _b.normalize();
    _c.crossVectors(_a, _b).normalize();
    _m.makeBasis(_c, _a, _b);
    e.torso.quaternion.setFromRotationMatrix(_m);
    e.torso.position.set((pelvis.x + chest.x) / 2, (pelvis.y + chest.y) / 2, (pelvis.z + chest.z) / 2);
    e.torso.scale.set(0.36 * s, spineLen, 0.22 * s);
    e.headPivot.position.set(head.x, head.y, head.z);
    e.headPivot.lookAt(head.x + fx, head.y, head.z + fz);
    e.headPivot.visible = !e.headGone;
    for (const bone of e.bones) {
      const a = e.nodes[bone.a];
      const b = e.nodes[bone.b];
      _a.set(b.x - a.x, b.y - a.y, b.z - a.z);
      const len = _a.length();
      if (len < 0.02 || (e.headGone && (bone.a === HEAD || bone.b === HEAD))) {
        bone.mesh.visible = false;
        continue;
      }
      bone.mesh.visible = true;
      _a.multiplyScalar(1 / len);
      bone.mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      bone.mesh.quaternion.setFromUnitVectors(_up, _a);
      bone.mesh.scale.set(bone.radius, len, bone.radius);
    }
    e.handL.position.set(e.nodes[HAND_L].x, e.nodes[HAND_L].y, e.nodes[HAND_L].z);
    e.handR.position.set(e.nodes[HAND_R].x, e.nodes[HAND_R].y, e.nodes[HAND_R].z);
    const flashE = e.hurt * 0.85;
    e.skin.emissive.setRGB(0.12 + flashE, 0.03, 0.02);
    e.cloth.emissive.setRGB(flashE * 0.8, 0, 0);
    e.bar.visible = !e.dead && e.hp < e.maxHp;
    if (e.bar.visible) {
      const pct = Math.max(0, e.hp / e.maxHp);
      e.bar.position.set(head.x, head.y + 0.34 * s, head.z);
      camera.getWorldQuaternion(_q);
      e.bar.quaternion.copy(_q);
      e.barFill.scale.x = Math.max(0.04, pct);
      e.barFill.position.x = (pct - 1) * 0.3;
    }
  }
  function bone(e: Enemy, a: number, b: number, radius: number, mat: THREE.Material) {
    const mesh = new THREE.Mesh(geoCyl, mat);
    mesh.castShadow = shadows;
    scene.add(mesh);
    e.meshes.push(mesh);
    e.bones.push({ mesh, a, b, radius });
  }
  function spawnEnemy(kind: Kind, x: number, z: number, y = 0) {
    const spec = KIND[kind];
    const s = spec.scale;
    const skin = skinBase.clone();
    skin.color.setHex(spec.skin);
    skin.emissive.setHex(0x2a0c0a);
    const cloth = clothBase.clone();
    cloth.color.setHex(spec.cloth);
    const e: Enemy = {
      kind,
      hp: spec.hp,
      maxHp: spec.hp,
      speed: spec.speed,
      scale: s,
      melee: spec.melee,
      ranged: spec.ranged,
      radius: 0.36 * s,
      x,
      y,
      z,
      vy: 0,
      yaw: 0,
      phase: Math.random() * Math.PI * 2,
      attackCd: 0.4 + Math.random(),
      stun: 0,
      hurt: 0,
      bleed: 0,
      see: true,
      seeT: Math.random() * 0.3,
      strafe: 0,
      moveAmt: 0,
      dead: false,
      settled: false,
      deadFor: 0,
      removed: false,
      headGone: false,
      nodes: [],
      constraints: [],
      bones: [],
      headPivot: new THREE.Group(),
      torso: new THREE.Mesh(geoBox, cloth),
      pelvisMesh: new THREE.Mesh(geoSphere, cloth),
      handL: new THREE.Mesh(geoSphere, skin),
      handR: new THREE.Mesh(geoSphere, skin),
      bar: new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.07), barBg),
      barFill: new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.045), barFg),
      skin,
      cloth,
      meshes: [],
    };
    const radii = [0.14, 0.16, 0.15, 0.06, 0.06, 0.08, 0.08, 0.06, 0.06];
    for (const r of radii) e.nodes.push(makeNode(r * s));
    const pairs: Array<[number, number]> = [
      [PELVIS, CHEST],
      [CHEST, HEAD],
      [CHEST, HAND_L],
      [CHEST, HAND_R],
      [PELVIS, KNEE_L],
      [KNEE_L, FOOT_L],
      [PELVIS, KNEE_R],
      [KNEE_R, FOOT_R],
    ];
    for (const [a, b] of pairs) e.constraints.push({ a, b, len: 0.3, broken: false });
    e.pelvisMesh.scale.setScalar(0.15 * s);
    e.pelvisMesh.castShadow = shadows;
    e.torso.castShadow = shadows;
    e.handL.scale.setScalar(0.07 * s);
    e.handR.scale.setScalar(0.07 * s);
    const skull = new THREE.Mesh(geoSphere, skin);
    skull.scale.setScalar(0.16 * s);
    skull.castShadow = shadows;
    const eyeL = new THREE.Mesh(geoEye, eyeMat);
    const eyeR = new THREE.Mesh(geoEye, eyeMat);
    eyeL.scale.setScalar(0.03 * s);
    eyeR.scale.setScalar(0.03 * s);
    eyeL.position.set(-0.055 * s, 0.02 * s, 0.14 * s);
    eyeR.position.set(0.055 * s, 0.02 * s, 0.14 * s);
    const mouth = new THREE.Mesh(geoSphere, mouthMat);
    mouth.scale.set(0.05 * s, 0.03 * s, 0.03 * s);
    mouth.position.set(0, -0.055 * s, 0.13 * s);
    e.headPivot.add(skull, eyeL, eyeR, mouth);
    e.bar.add(e.barFill);
    e.barFill.position.z = 0.01;
    e.bar.visible = false;
    scene.add(e.pelvisMesh, e.torso, e.headPivot, e.handL, e.handR, e.bar);
    e.meshes.push(e.pelvisMesh, e.torso, e.headPivot, e.handL, e.handR, e.bar);
    bone(e, CHEST, HAND_L, 0.055 * s, cloth);
    bone(e, CHEST, HAND_R, 0.055 * s, cloth);
    bone(e, PELVIS, KNEE_L, 0.07 * s, cloth);
    bone(e, KNEE_L, FOOT_L, 0.055 * s, bootMat);
    bone(e, PELVIS, KNEE_R, 0.07 * s, cloth);
    bone(e, KNEE_R, FOOT_R, 0.055 * s, bootMat);
    bone(e, CHEST, HEAD, 0.07 * s, skin);
    enemies.push(e);
    while (enemies.filter((en) => en.dead && !en.removed).length > 7) {
      const old = enemies.find((en) => en.dead && en.settled && !en.removed);
      if (!old) break;
      retire(old);
    }
    pose(e);
    syncBody(e);
    return e;
  }
  function retire(e: Enemy) {
    if (e.removed) return;
    e.removed = true;
    for (const m of e.meshes) m.removeFromParent();
    for (const b of e.bones) b.mesh.removeFromParent();
    e.skin.dispose();
    e.cloth.dispose();
  }
  function ragdoll(e: Enemy, ix: number, iy: number, iz: number, head: boolean) {
    e.dead = true;
    e.settled = false;
    e.deadFor = 0;
    e.bar.visible = false;
    pose(e);
    for (const n of e.nodes) {
      n.px = n.x - ix * STEP;
      n.py = n.y - iy * STEP;
      n.pz = n.z - iz * STEP;
    }
    e.nodes[CHEST].px -= ix * STEP;
    e.nodes[HEAD].py -= (1.6 + iy) * STEP;
    if (head) {
      const c = e.constraints.find((c) => (c.a === CHEST && c.b === HEAD) || (c.b === CHEST && c.a === HEAD));
      if (c) c.broken = true;
      e.headGone = true;
      e.nodes[HEAD].px -= ix * STEP * 4;
      e.nodes[HEAD].py -= 5 * STEP;
    } else if (Math.random() < 0.55) {
      const hand = Math.random() < 0.5 ? HAND_L : HAND_R;
      const c = e.constraints.find((c) => (c.a === CHEST && c.b === hand) || (c.b === CHEST && c.a === hand));
      if (c) c.broken = true;
      const n = e.nodes[hand];
      n.px -= ix * STEP * 3;
      n.py -= 2 * STEP;
    }
    for (const c of e.constraints) {
      const a = e.nodes[c.a];
      const b = e.nodes[c.b];
      c.len = Math.max(0.08, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
    }
  }
  function stepRagdoll(e: Enemy, dt: number) {
    if (e.settled) return;
    for (const n of e.nodes) {
      let vx = (n.x - n.px) * 0.985;
      let vy = (n.y - n.py) * 0.985;
      let vz = (n.z - n.pz) * 0.985;
      const sp = Math.hypot(vx, vy, vz);
      if (sp > 0.45) {
        const k = 0.45 / sp;
        vx *= k;
        vy *= k;
        vz *= k;
      }
      n.px = n.x;
      n.py = n.y;
      n.pz = n.z;
      n.x += vx;
      n.y += vy - 16 * dt * dt;
      n.z += vz;
    }
    for (let it = 0; it < 7; it++) {
      for (const c of e.constraints) {
        if (c.broken) continue;
        const a = e.nodes[c.a];
        const b = e.nodes[c.b];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dz = b.z - a.z;
        const dist = Math.hypot(dx, dy, dz) || 0.0001;
        const diff = ((dist - c.len) / dist) * 0.45;
        dx *= diff;
        dy *= diff;
        dz *= diff;
        a.x += dx;
        a.y += dy;
        a.z += dz;
        b.x -= dx;
        b.y -= dy;
        b.z -= dz;
      }
      for (const n of e.nodes) {
        const g = surfaceBelow(n.x, n.z, n.y);
        if (n.y < g + n.r) {
          n.y = g + n.r;
          n.py = n.y - (n.y - n.py) * 0.35;
          n.px = n.x - (n.x - n.px) * 0.55;
          n.pz = n.z - (n.z - n.pz) * 0.55;
        }
        const hit = pushOut(n.x, n.y, n.z);
        if (hit) {
          n.x = hit.x;
          n.y = hit.y;
          n.z = hit.z;
        }
      }
    }
    e.deadFor += dt;
    if (e.deadFor > 3.2) e.settled = true;
  }
  function hurtEnemy(e: Enemy, dmg: number, x: number, y: number, z: number, nx: number, ny: number, nz: number, head: boolean) {
    if (e.dead || e.removed || status !== "play") return;
    e.hp -= dmg;
    e.hurt = 1;
    e.stun = Math.max(e.stun, 0.08);
    splatter(x, y, z, nx, ny, nz, head ? 1 : 0.55);
    sfxWet();
    hitT = 0.09;
    if (e.hp <= 0) {
      kills += 1;
      ragdoll(e, nx * 3.5, 1.8, nz * 3.5, head);
      splatter(x, y, z, nx, 0.6, nz, e.kind === "brute" ? 1.8 : 1.15);
      e.bleed = 1.35;
      say(`${NAMES[e.kind]} deshecho`);
      sfxKill();
      shake += reduced ? 0 : 0.02;
    }
  }
  function hurtPlayer(dmg: number) {
    if (status !== "play" || player.iframe > 0) return;
    player.health = Math.max(0, player.health - dmg);
    player.iframe = 0.42;
    hurtFlash = 0.72;
    shake += reduced ? 0 : 0.035;
    screenBlood(4 + Math.round(dmg / 6));
    sfxHurt();
    if (player.health <= 0) finish(false);
  }
  function finish(win: boolean) {
    status = win ? "win" : "dead";
    fireHeld = false;
    if (document.pointerLockElement) document.exitPointerLock();
    const sc = score();
    const best = Math.max(readBest(), sc);
    try {
      localStorage.setItem(SAVE_KEY, String(best));
    } catch {
      /* ignore quota */
    }
    shell.endTitle.textContent = win ? "EL FOSO CALLA" : "DESANGRADO";
    shell.endText.textContent = win
      ? `Tres oleadas. Puntuación ${sc}. Mejor ${best}.`
      : `La sangre ganó. Puntuación ${sc}. Mejor ${best}.`;
    shell.best.textContent = String(best);
    syncPanels();
    syncHud();
  }
  function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number) {
    const lx = cx - ox;
    const ly = cy - oy;
    const lz = cz - oz;
    const tca = lx * dx + ly * dy + lz * dz;
    if (tca < 0) return null;
    const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
    const r2 = r * r;
    if (d2 > r2) return null;
    const thc = Math.sqrt(r2 - d2);
    const t = tca - thc;
    return t > 0.05 ? t : null;
  }
  function muzzleWorld(out: THREE.Vector3) {
    camera.getWorldQuaternion(_q);
    camera.getWorldPosition(out);
    _a.set(0.22, -0.2, -1.02).applyQuaternion(_q);
    out.add(_a);
  }
  function tryShoot() {
    if (status !== "play" || reload > 0 || cool > 0) return;
    if (ammo <= 0) {
      sfxDry();
      if (reserve > 0) reload = 1.35;
      say(reserve > 0 ? "Recargando" : "Sin cartuchos");
      return;
    }
    ammo -= 1;
    cool = 0.84;
    recoil = 1;
    recoilPitch += 0.032;
    recoilYaw += (Math.random() - 0.5) * 0.012;
    shake += reduced ? 0 : 0.016;
    flashT = 0.045;
    sfxShot();
    unlockAudio();
    camera.getWorldQuaternion(_q);
    camera.getWorldPosition(_b);
    muzzleWorld(_c);
    flash.position.copy(_c);
    spray(_c.x, _c.y, _c.z, -Math.sin(player.yaw), -0.04, -Math.cos(player.yaw), 28, 7.5, 0);
    const speed = Math.hypot(player.vx, player.vz);
    const spread = 0.05 + (speed > 3.2 ? 0.02 : 0) + (player.crouch > 0.5 ? -0.01 : 0);
    for (let i = 0; i < 9; i++) {
      _a.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, -1).normalize().applyQuaternion(_q);
      spawnP(_c.x, _c.y, _c.z, _a.x * 32, _a.y * 32, _a.z * 32, 0.1, 0.055, 0, 1, 0.16, 0.1);
      let enemyT = Infinity;
      let hitE: Enemy | null = null;
      let head = false;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      let rr = 0.2;
      for (const e of enemies) {
        if (e.dead || e.removed) continue;
        const hs = e.nodes[HEAD];
        const cs = e.nodes[CHEST];
        const checks = [
          { n: hs, r: 0.2 * e.scale, head: true },
          { n: cs, r: 0.4 * e.scale, head: false },
        ];
        for (const chk of checks) {
          const t = raySphere(_b.x, _b.y, _b.z, _a.x, _a.y, _a.z, chk.n.x, chk.n.y, chk.n.z, chk.r);
          if (t !== null && t < enemyT) {
            enemyT = t;
            hitE = e;
            head = chk.head;
            cx = chk.n.x;
            cy = chk.n.y;
            cz = chk.n.z;
            rr = chk.r;
          }
        }
      }
      const wall = nearestWall(_b.x, _b.y, _b.z, _a.x, _a.y, _a.z, 40);
      const wallT = wall ? wall.t : Infinity;
      if (hitE && enemyT < wallT) {
        const hx = _b.x + _a.x * enemyT;
        const hy = _b.y + _a.y * enemyT;
        const hz = _b.z + _a.z * enemyT;
        const nx = (hx - cx) / rr;
        const ny = (hy - cy) / rr;
        const nz = (hz - cz) / rr;
        hurtEnemy(hitE, head ? 36 : 16, hx, hy, hz, nx, ny, nz, head);
      } else if (wall) {
        const hx = _b.x + _a.x * wall.t;
        const hy = _b.y + _a.y * wall.t;
        const hz = _b.z + _a.z * wall.t;
        spray(hx, hy, hz, wall.nx, wall.ny, wall.nz, 8, 3.2, 0);
        if (Math.random() < 0.65) {
          spray(hx, hy, hz, wall.nx, wall.ny, wall.nz, 6, 2.4, 1);
          if (Math.random() < 0.5) spawnBlobs(hx, hy, hz, wall.nx, wall.ny, wall.nz, 1, 1.4);
          addDecal(hx, hy, hz, wall.nx, wall.ny, wall.nz, 0.18);
        }
      }
    }
    if (ammo === 0 && reserve > 0) {
      reload = 1.35;
      sfxReload();
    }
  }
  function shootEnemy(e: Enemy) {
    const n = e.nodes[CHEST];
    const tx = player.x - n.x;
    const ty = player.y + 1.15 - n.y;
    const tz = player.z - n.z;
    const len = Math.hypot(tx, ty, tz) || 1;
    const sp = 9.2;
    const jx = (Math.random() - 0.5) * 0.16;
    const jy = (Math.random() - 0.5) * 0.1;
    const slot = projs.find((p) => !p.active);
    if (!slot) return;
    slot.active = true;
    slot.mesh.visible = true;
    slot.x = n.x;
    slot.y = n.y;
    slot.z = n.z;
    slot.vx = (tx / len + jx) * sp;
    slot.vy = (ty / len + jy) * sp;
    slot.vz = (tz / len) * sp;
    slot.life = 2.4;
    slot.mesh.position.set(slot.x, slot.y, slot.z);
    sfxSpit();
  }
  function updateEnemy(e: Enemy, dt: number) {
    if (e.removed) return;
    e.hurt = Math.max(0, e.hurt - dt * 3.5);
    if (e.dead) {
      stepRagdoll(e, dt);
      if (e.bleed > 0) {
        e.bleed -= dt;
        const n = e.headGone ? e.nodes[CHEST] : e.nodes[HEAD];
        if (Math.random() < 0.65) spray(n.x, n.y, n.z, 0, 0.3, 0, 2, 1.6, 1);
        if (Math.random() < 0.25) spawnBlobs(n.x, n.y, n.z, (Math.random() - 0.5) * 0.3, -0.2, (Math.random() - 0.5) * 0.3, 1, 1.1);
      }
      syncBody(e);
      return;
    }
    if (status === "play") {
      e.attackCd = Math.max(0, e.attackCd - dt);
      e.stun = Math.max(0, e.stun - dt);
      const dx = player.x - e.x;
      const dz = player.z - e.z;
      const dist = Math.hypot(dx, dz) || 0.0001;
      let tx = dx / dist;
      let tz = dz / dist;
      const targetYaw = Math.atan2(-dx, -dz);
      const dyaw = Math.atan2(Math.sin(targetYaw - e.yaw), Math.cos(targetYaw - e.yaw));
      e.yaw += dyaw * Math.min(1, dt * 6);
      e.seeT -= dt;
      if (e.seeT <= 0) {
        const c = e.nodes[CHEST];
        e.see = clearLos(c.x, c.y, c.z, player.x, player.y + 1.45, player.z);
        e.seeT = 0.22;
      }
      let move = e.stun > 0 ? 0 : 1;
      if (e.ranged) {
        if (dist < 4.3) {
          tx = -tx;
          tz = -tz;
        } else if (dist < 7.2) move = 0.2;
        if (e.see && dist < 17 && dist > 3.1 && e.attackCd <= 0) {
          shootEnemy(e);
          e.attackCd = 2.2;
        }
      }
      if (dist < e.radius + 0.8) {
        move = 0;
        if (e.attackCd <= 0) {
          hurtPlayer(e.melee);
          e.attackCd = e.kind === "brute" ? 1.15 : 0.82;
          player.vx += (tx * -1) * 5.5;
          player.vz += (tz * -1) * 5.5;
          splatter(player.x, player.y + 1.1, player.z, -tx, 0.4, -tz, 0.45);
          sfxMelee();
        }
      }
      if (Math.abs(e.strafe) > 0.2) {
        const sx = -tz * e.strafe;
        const sz = tx * e.strafe;
        tx += sx;
        tz += sz;
        const l = Math.hypot(tx, tz) || 1;
        tx /= l;
        tz /= l;
      }
      const sp = e.speed * move;
      const prevX = e.x;
      const prevZ = e.z;
      e.x += tx * sp * dt;
      e.z += tz * sp * dt;
      const col = collideCircle(e.x, e.z, e.y, e.radius, 1.55 * e.scale);
      e.x = col.x;
      e.z = col.z;
      if (col.stepped) e.y = col.y;
      e.x = Math.max(-14.2, Math.min(14.2, e.x));
      e.z = Math.max(-19.1, Math.min(13.2, e.z));
      const g = groundHeight(e.x, e.z, e.y);
      if (e.y - g > 0.05) {
        e.vy -= 20 * dt;
        e.y += e.vy * dt;
        if (e.y < g) {
          e.y = g;
          e.vy = 0;
        }
      } else {
        e.y = g;
        e.vy = 0;
      }
      const moved = Math.hypot(e.x - prevX, e.z - prevZ);
      e.moveAmt = dist > 1.4 ? move : 0;
      if (moved < sp * dt * 0.25 && dist > 2.2 && move > 0.5) e.strafe = e.strafe >= 0 ? -1 : 1;
      else e.strafe *= Math.exp(-dt * 2);
      if (e.hp < e.maxHp * 0.72 && Math.random() < dt * 5) {
        const c = e.nodes[CHEST];
        spray(c.x, c.y - 0.1, c.z, 0, -0.4, 0.2, 1, 1.2, 1);
      }
    } else {
      e.moveAmt = 0;
    }
    pose(e);
    syncBody(e);
  }

  type Pickup = { kind: "health" | "ammo"; x: number; z: number; group: THREE.Group; active: boolean; wait: number; base: number };
  const pickups: Pickup[] = [];
  function makePickup(kind: "health" | "ammo", x: number, z: number) {
    const group = new THREE.Group();
    if (kind === "health") {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.24), new THREE.MeshStandardMaterial({ color: 0xe7d7c8, roughness: 0.55 }));
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.04), new THREE.MeshStandardMaterial({ color: 0xd6272a, emissive: 0x6a0000, emissiveIntensity: 0.4 }));
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.04), crossV.material);
      crossV.position.z = 0.13;
      crossH.position.z = 0.13;
      group.add(box, crossV, crossH);
    } else {
      const shellMat = new THREE.MeshStandardMaterial({ color: 0xe7b15a, metalness: 0.7, roughness: 0.3 });
      for (let i = 0; i < 4; i++) {
        const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 6), shellMat);
        sh.rotation.z = Math.PI / 2;
        sh.position.set(0, 0.08, (i - 1.5) * 0.08);
        group.add(sh);
      }
    }
    group.position.set(x, 0.45, z);
    scene.add(group);
    pickups.push({ kind, x, z, group, active: true, wait: 0, base: 0.45 });
  }
  makePickup("health", -8.2, 6.2);
  makePickup("health", 8.4, -10.2);
  makePickup("health", -1.2, -11.2);
  makePickup("ammo", 6.2, 3.6);
  makePickup("ammo", -6.4, -15.2);
  makePickup("ammo", 11.2, -6.2);
  makePickup("ammo", -11.4, 1.4);

  function clearCombat() {
    for (const e of enemies) retire(e);
    enemies.length = 0;
    pN = 0;
    for (const b of blobs) {
      b.active = false;
      b.mesh.visible = false;
    }
    for (const g of gibs) {
      g.active = false;
      g.mesh.visible = false;
    }
    for (const p of projs) {
      p.active = false;
      p.mesh.visible = false;
    }
    for (const d of decals) d.active = false;
    drops.length = 0;
    for (const p of pickups) {
      p.active = true;
      p.wait = 0;
      p.group.visible = true;
    }
  }
  function seedDecals() {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.15;
      addDecal(-1.15 + Math.cos(a) * r, 0.03, 5.35 + Math.sin(a) * r, 0, 1, 0, 0.35 + Math.random() * 0.8);
    }
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.3;
      addDecal(0.2 + Math.cos(a) * r, 0.46, -16.2 + Math.sin(a) * r, 0, 1, 0, 0.4 + Math.random());
    }
  }
  function bootEnemies() {
    spawnEnemy("rusher", -2.3, 0.4);
    spawnEnemy("spitter", 3.5, -2.4);
    spawnEnemy("rusher", -5.6, -6.4);
    spawnEnemy("rusher", 1.4, -9.2);
    const brute = spawnEnemy("brute", 0.25, -16.25, 0.42);
    brute.yaw = 0.4;
    pose(brute);
    ragdoll(brute, 0.6, 0.2, 0.2, false);
    splatter(0.25, 1.3, -16.25, 0.2, 0.5, 0.1, 1.4);
    brute.bleed = 2.4;
  }
  function rollKind(w: number, i: number): Kind {
    if (w === 2) return i % 3 === 0 ? "spitter" : i === 1 ? "brute" : "rusher";
    if (i % 4 === 0) return "brute";
    if (i % 2 === 0) return "spitter";
    return "rusher";
  }
  function spawnFar(kind: Kind) {
    const spots = [
      [-12.2, -16.4],
      [12.2, -16.2],
      [-12.4, -6],
      [12.4, -6],
      [-6, -18.2],
      [6, -18.2],
      [0, -18.4],
      [-13, 1],
      [13, 1],
    ];
    const far = spots.filter((s) => (s[0] - player.x) ** 2 + (s[1] - player.z) ** 2 > 40);
    const pool = far.length ? far : spots;
    const s = pool[Math.floor(Math.random() * pool.length)];
    const spot = collideCircle(s[0] + (Math.random() - 0.5) * 1.4, s[1] + (Math.random() - 0.5) * 1.4, 0, 0.4, 1.6);
    spawnEnemy(kind, spot.x, spot.z, 0);
  }

  seedDecals();
  bootEnemies();
  shell.best.textContent = String(readBest());
  syncPanels();
  syncHud();

  function beginPlay() {
    if (status === "dead" || status === "win") return;
    status = "play";
    hostile = true;
    unlockAudio();
    if (!announced) {
      announce("OLEADA 1");
      announced = true;
    }
    syncPanels();
  }
  function reset() {
    clearCombat();
    player.x = 0;
    player.y = 0;
    player.z = 10;
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    player.yaw = 0;
    player.pitch = -0.12;
    player.health = 100;
    player.iframe = 0;
    player.crouch = 0;
    ammo = MAG;
    reserve = 42;
    cool = 0;
    reload = 0;
    kills = 0;
    wave = 1;
    waveGap = 0;
    hurtFlash = 0;
    announced = false;
    hostile = true;
    status = "play";
    seedDecals();
    bootEnemies();
    announce("OLEADA 1");
    announced = true;
    syncPanels();
    syncHud();
    unlockAudio();
  }

  function simulate(dt: number) {
    time += dt;
    player.iframe = Math.max(0, player.iframe - dt);
    cool = Math.max(0, cool - dt);
    hurtFlash = Math.max(0, hurtFlash - dt * 1.4);
    feedT = Math.max(0, feedT - dt);
    announceT = Math.max(0, announceT - dt);
    hitT = Math.max(0, hitT - dt);
    flashT = Math.max(0, flashT - dt);
    recoil = Math.max(0, recoil - dt * 3.4);
    recoilPitch *= Math.exp(-8 * dt);
    recoilYaw *= Math.exp(-8 * dt);
    shake *= Math.exp(-6.5 * dt);
    const wantCrouch = status === "play" && (keys.has("KeyC") || keys.has("ControlLeft")) && !keys.has("ShiftLeft");
    player.crouch += ((wantCrouch ? 1 : 0) - player.crouch) * Math.min(1, dt * 10);

    if (status === "play") {
      const fx = -Math.sin(player.yaw);
      const fz = -Math.cos(player.yaw);
      const rx = Math.cos(player.yaw);
      const rz = -Math.sin(player.yaw);
      let ix = 0;
      let iz = 0;
      if (keys.has("KeyW")) {
        ix += fx;
        iz += fz;
      }
      if (keys.has("KeyS")) {
        ix -= fx;
        iz -= fz;
      }
      if (keys.has("KeyD")) {
        ix += rx;
        iz += rz;
      }
      if (keys.has("KeyA")) {
        ix -= rx;
        iz -= rz;
      }
      ix += rx * pad.moveX + fx * pad.moveY;
      iz += rz * pad.moveX + fz * pad.moveY;
      const il = Math.hypot(ix, iz);
      if (il > 1) {
        ix /= il;
        iz /= il;
      }
      const sprint = keys.has("ShiftLeft") && player.crouch < 0.3 && (keys.has("KeyW") || pad.moveY > 0.45);
      const height = 1.7 - player.crouch * 0.55;
      const maxSpeed = (sprint ? 7.5 : 5.15) * (1 - player.crouch * 0.42);
      const accel = player.grounded ? 46 : 12;
      if (player.grounded) {
        const sp = Math.hypot(player.vx, player.vz);
        if (sp > 0) {
          const drop = sp * 7.2 * dt;
          const ns = Math.max(0, sp - drop) / sp;
          player.vx *= ns;
          player.vz *= ns;
        }
      }
      if (il > 0.01) {
        const current = player.vx * ix + player.vz * iz;
        let add = maxSpeed - current;
        if (add > 0) {
          let accs = accel * dt * maxSpeed;
          if (accs > add) accs = add;
          player.vx += ix * accs;
          player.vz += iz * accs;
        }
      }
      if (pad.jumpEdge && player.grounded) {
        player.vy = 7.15;
        player.grounded = false;
      }
      pad.jumpEdge = false;
      player.x += player.vx * dt;
      player.z += player.vz * dt;
      const col = collideCircle(player.x, player.z, player.y, player.radius, height);
      player.x = col.x;
      player.z = col.z;
      if (col.stepped) {
        player.y = col.y;
        player.vy = Math.max(0, player.vy);
        player.grounded = true;
      }
      for (const e of enemies) {
        if (e.dead || e.removed) continue;
        const dx = player.x - e.x;
        const dz = player.z - e.z;
        const min = player.radius + e.radius;
        const d = Math.hypot(dx, dz);
        if (d < min && d > 0.0001) {
          player.x += (dx / d) * (min - d);
          player.z += (dz / d) * (min - d);
        }
      }
      player.x = Math.max(-14.35, Math.min(14.35, player.x));
      player.z = Math.max(-19.2, Math.min(13.25, player.z));
      if (!col.stepped) {
        player.vy -= 20 * dt;
        player.y += player.vy * dt;
        const g = groundHeight(player.x, player.z, player.y);
        if (player.vy <= 0 && player.y <= g + 0.04) {
          player.y = g;
          player.vy = 0;
          player.grounded = true;
        } else player.grounded = false;
      }
      if (player.y + height > 3.52) {
        player.y = 3.52 - height;
        if (player.vy > 0) player.vy = 0;
      }
      if (player.grounded) {
        const sp = Math.hypot(player.vx, player.vz);
        player.bob += sp * dt * 1.55;
        if (sp > 1.6) {
          stepAcc += dt;
          const interval = sprint ? 0.32 : 0.46;
          if (stepAcc > interval) {
            stepAcc = 0;
            sfxStep();
            if (Math.random() < 0.45) {
              for (const d of decals) {
                if (!d.active || d.ny < 0.8) continue;
                const dx = d.x - player.x;
                const dz = d.z - player.z;
                if (dx * dx + dz * dz < 0.8) {
                  spray(player.x, 0.08, player.z, 0, 0.8, 0, 3, 1.4, 1);
                  break;
                }
              }
            }
          }
        }
      }
      if (pad.reloadEdge || keys.has("KeyR")) {
        if (reload <= 0 && ammo < MAG && reserve > 0) {
          reload = 1.35;
          sfxReload();
          say("Recargando");
        }
      }
      pad.reloadEdge = false;
      if (reload > 0) {
        reload -= dt;
        if (reload <= 0) {
          const take = Math.min(MAG - ammo, reserve);
          ammo += take;
          reserve -= take;
          reload = 0;
        }
      }
      const wantsShot = fireHeld || pad.fire || pad.firePulse;
      pad.firePulse = false;
      if (wantsShot) tryShoot();
      for (const pk of pickups) {
        if (!pk.active) {
          pk.wait -= dt;
          if (pk.wait <= 0) {
            pk.active = true;
            pk.group.visible = true;
          }
          continue;
        }
        const dx = player.x - pk.x;
        const dz = player.z - pk.z;
        if (dx * dx + dz * dz < 1.35) {
          if (pk.kind === "health" && player.health < 100) {
            player.health = Math.min(100, player.health + 30);
            pk.active = false;
            pk.group.visible = false;
            pk.wait = 14;
            sfxPickup();
            say("Botiquín");
          } else if (pk.kind === "ammo") {
            reserve = Math.min(72, reserve + 8);
            pk.active = false;
            pk.group.visible = false;
            pk.wait = 12;
            sfxPickup();
            say("Cartuchos");
          }
        }
      }
    } else {
      pad.firePulse = false;
      pad.jumpEdge = false;
      pad.reloadEdge = false;
    }

    for (let i = 0; i < enemies.length; i++) updateEnemy(enemies[i], dt);
    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      if (a.dead || a.removed) continue;
      for (let j = i + 1; j < enemies.length; j++) {
        const b = enemies[j];
        if (b.dead || b.removed) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const min = a.radius + b.radius;
        const d = Math.hypot(dx, dz);
        if (d > 0.0001 && d < min) {
          const pen = (min - d) * 0.5;
          a.x -= (dx / d) * pen;
          a.z -= (dz / d) * pen;
          b.x += (dx / d) * pen;
          b.z += (dz / d) * pen;
        }
      }
    }

    if (hostile && status === "play") {
      const alive = enemies.some((e) => !e.dead && !e.removed);
      if (!alive) {
        waveGap += dt;
        if (wave >= 3 && waveGap > 1.3) finish(true);
        else if (wave < 3 && waveGap > 2) {
          wave += 1;
          waveGap = 0;
          announce(`OLEADA ${wave}`);
          const count = wave === 2 ? 6 : 8;
          for (let i = 0; i < count; i++) spawnFar(rollKind(wave, i));
        }
      } else waveGap = 0;
    }

    for (const p of projs) {
      if (!p.active) continue;
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      const nz = p.z + p.vz * dt;
      const dx = player.x - nx;
      const dy = player.y + 1.05 - ny;
      const dz = player.z - nz;
      const sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
      const wall = nearestWall(p.x, p.y, p.z, p.vx / sp, p.vy / sp, p.vz / sp, sp * dt + 0.25);
      if (hitP && status === "play") {
        hurtPlayer(12);
        splatter(nx, ny, nz, 0, 0.4, 0, 0.7);
        p.active = false;
        p.mesh.visible = false;
      } else if (wall && wall.t < sp * dt + 0.2) {
        const hx = p.x + (p.vx / sp) * wall.t;
        const hy = p.y + (p.vy / sp) * wall.t;
        const hz = p.z + (p.vz / sp) * wall.t;
        splatter(hx, hy, hz, wall.nx, wall.ny, wall.nz, 0.55);
        p.active = false;
        p.mesh.visible = false;
      } else {
        p.x = nx;
        p.y = ny;
        p.z = nz;
        p.life -= dt;
        p.mesh.position.set(p.x, p.y, p.z);
        if (Math.random() < 0.85) spawnP(p.x, p.y, p.z, (Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4, 0.35, 0.06, 1, 0.8, 0.05, 0.04);
        if (p.life <= 0) {
          p.active = false;
          p.mesh.visible = false;
        }
      }
    }

    const drips = [
      { x: -1.15, y: 3.15, z: 5.35 },
      { x: 0.15, y: 3.4, z: -16.15 },
    ];
    mistAcc += dt;
    if (mistAcc > 0.55) {
      mistAcc = 0;
      for (const d of drips) {
        spawnBlobs(d.x, d.y, d.z, 0, -1, 0, 1, 0.35);
        spawnP(d.x, d.y, d.z, (Math.random() - 0.5) * 0.15, -0.4, (Math.random() - 0.5) * 0.15, 1.3, 0.07, 1, 0.7, 0.03, 0.03);
        spawnP(d.x + (Math.random() - 0.5), 0.15, d.z + (Math.random() - 0.5), (Math.random() - 0.5) * 0.1, 0.22, (Math.random() - 0.5) * 0.1, 2.2, 0.28, 2, 0.32, 0.03, 0.03);
      }
    }

    for (let i = pN - 1; i >= 0; i--) {
      const kind = pKind[i];
      const drag = kind === 0 ? 0.7 : kind === 2 ? 0.35 : 2.6;
      const damp = Math.exp(-drag * dt);
      pVX[i] *= damp;
      pVY[i] *= damp;
      pVZ[i] *= damp;
      if (kind === 2) pVY[i] += 0.25 * dt;
      else if (kind === 0) pVY[i] -= 3.5 * dt;
      else pVY[i] -= 11 * dt;
      pX[i] += pVX[i] * dt;
      pY[i] += pVY[i] * dt;
      pZ[i] += pVZ[i] * dt;
      pLife[i] -= dt;
      if (kind === 1) {
        const surf = surfaceBelow(pX[i], pZ[i], pY[i]);
        if (pVY[i] < 0 && pY[i] <= surf + 0.03) {
          pY[i] = surf + 0.02;
          const sp = Math.hypot(pVX[i], pVY[i], pVZ[i]);
          if (sp < 1.15) {
            addDecal(pX[i], pY[i], pZ[i], 0, 1, 0, 0.16);
            killParticle(i);
            continue;
          }
          pVY[i] *= -0.12;
          pVX[i] *= 0.35;
          pVZ[i] *= 0.35;
        }
        const hit = pushOut(pX[i], pY[i], pZ[i]);
        if (hit) {
          pX[i] = hit.x;
          pY[i] = hit.y;
          pZ[i] = hit.z;
          const vn = pVX[i] * hit.nx + pVY[i] * hit.ny + pVZ[i] * hit.nz;
          pVX[i] = (pVX[i] - hit.nx * vn) * 0.3;
          pVY[i] = (pVY[i] - hit.ny * vn) * 0.3;
          pVZ[i] = (pVZ[i] - hit.nz * vn) * 0.3;
          if (Math.hypot(pVX[i], pVY[i], pVZ[i]) < 0.9) {
            addDecal(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz, 0.14);
            killParticle(i);
            continue;
          }
        }
      }
      if (pLife[i] <= 0 || pY[i] < -2) killParticle(i);
    }
    for (let i = 0; i < pN; i++) {
      pPos[i * 3] = pX[i];
      pPos[i * 3 + 1] = pY[i];
      pPos[i * 3 + 2] = pZ[i];
      pCol[i * 3] = pR[i];
      pCol[i * 3 + 1] = pG[i];
      pCol[i * 3 + 2] = pB[i];
      pSz[i] = pSize[i];
      pAl[i] = pMax[i] > 0 ? Math.max(0, pLife[i] / pMax[i]) : 0;
    }
    pGeo.setDrawRange(0, pN);
    const posAttr = pGeo.getAttribute("position");
    const colAttr = pGeo.getAttribute("aColor");
    const sizeAttr = pGeo.getAttribute("aSize");
    const alphaAttr = pGeo.getAttribute("aAlpha");
    if (posAttr) posAttr.needsUpdate = true;
    if (colAttr) colAttr.needsUpdate = true;
    if (sizeAttr) sizeAttr.needsUpdate = true;
    if (alphaAttr) alphaAttr.needsUpdate = true;

    for (const b of blobs) {
      if (!b.active) continue;
      if (!b.stuck) {
        b.vy -= 12 * dt;
        b.vx *= Math.exp(-1.6 * dt);
        b.vz *= Math.exp(-1.6 * dt);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        const surf = surfaceBelow(b.x, b.z, b.y);
        let stuck = false;
        let nx = 0;
        let ny = 1;
        let nz = 0;
        if (b.vy < 0 && b.y <= surf + b.vol) {
          b.y = surf + b.vol * 0.28;
          stuck = true;
        }
        const hit = pushOut(b.x, b.y, b.z);
        if (hit && !stuck) {
          b.x = hit.x;
          b.y = hit.y;
          b.z = hit.z;
          if (Math.hypot(b.vx, b.vy, b.vz) < 2.4 || hit.ny < 0.5) {
            stuck = true;
            nx = hit.nx;
            ny = hit.ny;
            nz = hit.nz;
          } else {
            b.vx *= 0.2;
            b.vy *= -0.15;
            b.vz *= 0.2;
          }
        }
        if (stuck) {
          b.stuck = true;
          b.vx = 0;
          b.vy = 0;
          b.vz = 0;
          for (const o of blobs) {
            if (o === b || !o.active || !o.stuck) continue;
            const dx = o.x - b.x;
            const dy = o.y - b.y;
            const dz = o.z - b.z;
            if (dx * dx + dy * dy + dz * dz < 0.08 && o.vol >= b.vol) {
              o.vol = Math.min(0.48, o.vol + b.vol * 0.65);
              b.active = false;
              b.mesh.visible = false;
              break;
            }
          }
          if (!b.active) continue;
          _a.set(nx, ny, nz);
          if (_a.lengthSq() < 0.01) _a.set(0, 1, 0);
          _a.normalize();
          b.mesh.quaternion.setFromUnitVectors(_up, _a);
          const s = 0.12 + Math.sqrt(b.vol) * 0.85;
          b.mesh.scale.set(s, s * 0.28, s);
          b.mesh.position.set(b.x, b.y, b.z);
          addDecal(b.x, b.y, b.z, _a.x, _a.y, _a.z, b.vol * 1.4);
        } else {
          b.mesh.position.set(b.x, b.y, b.z);
          b.mesh.scale.setScalar(b.vol);
          b.mesh.rotateY(b.spin * dt);
        }
      }
    }
    for (const g of gibs) {
      if (!g.active || g.stuck) continue;
      g.vy -= 14 * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.z += g.vz * dt;
      const surf = surfaceBelow(g.x, g.z, g.y);
      if (g.vy < 0 && g.y <= surf + 0.05) {
        g.y = surf + 0.05;
        if (Math.abs(g.vy) < 1.4) g.stuck = true;
        g.vy *= -0.22;
        g.vx *= 0.45;
        g.vz *= 0.45;
      }
      const hit = pushOut(g.x, g.y, g.z);
      if (hit) {
        g.x = hit.x;
        g.y = hit.y;
        g.z = hit.z;
        g.vx *= 0.4;
        g.vz *= 0.4;
      }
      g.mesh.position.set(g.x, g.y, g.z);
      g.mesh.rotation.x += g.rx * dt;
      g.mesh.rotation.y += g.ry * dt;
    }

    for (let i = 0; i < DMAX; i++) {
      const d = decals[i];
      if (!d.active) {
        _dummy.scale.set(0, 0, 0);
        _dummy.position.set(0, -10, 0);
        _dummy.updateMatrix();
        decalMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      d.age += dt;
      const wet = Math.exp(-d.age * 0.45);
      const s = (0.1 + Math.sqrt(d.vol) * 0.38) * (1 + wet * 0.12);
      _a.set(d.nx, d.ny, d.nz);
      if (_a.lengthSq() < 0.001) _a.set(0, 1, 0);
      _dummy.position.set(d.x, d.y, d.z);
      _dummy.quaternion.setFromUnitVectors(_z, _a.normalize());
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();
      decalMesh.setMatrixAt(i, _dummy.matrix);
      _col.setRGB(0.32 + wet * 0.55, 0.015 + wet * 0.03, 0.02);
      decalMesh.setColorAt(i, _col);
    }
    decalMesh.instanceMatrix.needsUpdate = true;
    if (decalMesh.instanceColor) decalMesh.instanceColor.needsUpdate = true;

    for (const pk of pickups) {
      if (!pk.active) continue;
      pk.group.rotation.y += dt * 0.8;
      pk.group.position.y = pk.base + Math.sin(time * 2 + pk.x) * 0.05;
    }
  }

  function drawBlood(dt: number) {
    if (!bloodCtx) return;
    const w = shell.blood.width;
    const h = shell.blood.height;
    bloodCtx.clearRect(0, 0, w, h);
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.vy = Math.min(90, d.vy + 22 * dt);
      d.y += d.vy * dt * (h / 800);
      d.a -= dt * 0.045;
      if (d.a <= 0 || d.y > h + 30) {
        drops.splice(i, 1);
        continue;
      }
      bloodCtx.fillStyle = `rgba(148, 10, 16, ${d.a})`;
      bloodCtx.beginPath();
      bloodCtx.ellipse(d.x, d.y, d.r * 0.72, d.r * d.stretch, 0, 0, Math.PI * 2);
      bloodCtx.fill();
      bloodCtx.fillRect(d.x - 1.5, d.y - d.r * 1.8, 3, d.r * 1.6);
    }
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (w < 2 || h < 2) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    viewCamera.aspect = w / h;
    viewCamera.updateProjectionMatrix();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    shell.blood.width = Math.floor(w * dpr);
    shell.blood.height = Math.floor(h * dpr);
  }
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);
  resize();

  function applyLook() {
    lookX += pad.lookX;
    lookY += pad.lookY;
    pad.lookX = 0;
    pad.lookY = 0;
    if (status === "play") {
      player.yaw -= lookX * 0.00215;
      player.pitch -= lookY * 0.00215;
      const lim = Math.PI / 2 - 0.05;
      if (player.pitch > lim) player.pitch = lim;
      if (player.pitch < -lim) player.pitch = -lim;
    } else if (status === "menu" && !reduced) {
      player.yaw = Math.sin(time * 0.17) * 0.24;
      player.pitch = -0.14 + Math.sin(time * 0.11) * 0.025;
    }
    lookX = 0;
    lookY = 0;
  }

  let frameN = 0;
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt;
    applyLook();
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      simulate(STEP);
      acc -= STEP;
      steps++;
    }
    const height = 1.7 - player.crouch * 0.55;
    const bobY = reduced || status !== "play" ? 0 : Math.sin(player.bob) * 0.03;
    const bobX = reduced || status !== "play" ? 0 : Math.cos(player.bob * 0.5) * 0.018;
    yawObj.position.set(player.x, player.y + height - 0.12 + bobY, player.z);
    yawObj.rotation.y = player.yaw + recoilYaw + (reduced ? 0 : Math.sin(time * 34) * shake);
    camera.rotation.x = player.pitch + recoilPitch + (reduced ? 0 : Math.cos(time * 30) * shake * 0.8);
    camera.rotation.z = reduced ? 0 : Math.sin(time * 28) * shake * 0.45;
    camera.position.set(bobX, 0, 0);
    gun.position.set(0.22 + bobX * 0.8 - recoilYaw * 0.4, -0.28 + bobY * 0.6 - recoil * 0.02, -0.42 + recoil * 0.12);
    gun.rotation.x = recoil * 0.22;
    const pumpZ = reload > 0 ? Math.sin((1.35 - reload) / 1.35 * Math.PI) * 0.09 : 0;
    pump.position.z = -0.26 + pumpZ;
    flashMesh.visible = flashT > 0;
    flash.intensity = flashT > 0 ? 28 : 0;
    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(viewScene, viewCamera);
    drawBlood(dt);
    frameN++;
    if (frameN % 6 === 0) syncHud();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "ArrowDown") e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === "KeyM") {
      unlockAudio();
      const off = toggleMute();
      shell.mute.textContent = off ? "Sonido off" : "Sonido on";
    }
    if (e.code === "KeyR") pad.reloadEdge = true;
    if (e.code === "Space") pad.jumpEdge = true;
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };
  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || status !== "play") return;
    if (document.pointerLockElement === canvas || e.target === canvas) fireHeld = true;
  };
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) fireHeld = false;
  };
  const onMove = (e: MouseEvent) => {
    if (document.pointerLockElement === canvas) {
      lookX += e.movementX;
      lookY += e.movementY;
    }
  };
  const onLock = () => {
    const locked = document.pointerLockElement === canvas;
    if (locked) hadLock = true;
    if (!locked && hadLock && status === "play" && fine) {
      status = "pause";
      fireHeld = false;
      syncPanels();
    }
  };
  const onBlur = () => {
    keys.clear();
    fireHeld = false;
  };
  const onVis = () => {
    if (document.visibilityState === "visible") unlockAudio();
    else keys.clear();
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("mousemove", onMove);
  document.addEventListener("pointerlockchange", onLock);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVis);

  window.__controlsTest = {
    getYaw: () => player.yaw,
    getSpeed: () => Math.hypot(player.vx, player.vz),
    getPos: () => ({ x: player.x, y: player.y, z: player.z }),
    setKeys: (codes: string[]) => {
      keys.clear();
      for (const c of codes) keys.add(c);
      if (status === "menu" || status === "pause") beginPlay();
    },
  };

  return {
    start() {
      beginPlay();
    },
    resume() {
      if (status === "pause" || status === "menu") {
        beginPlay();
      }
    },
    pause() {
      if (status !== "play") return;
      status = "pause";
      fireHeld = false;
      if (document.pointerLockElement) document.exitPointerLock();
      syncPanels();
    },
    retry() {
      reset();
    },
    toggleSound() {
      unlockAudio();
      const off = toggleMute();
      shell.mute.textContent = off ? "Sonido off" : "Sonido on";
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("pointerlockchange", onLock);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
      if (window.__controlsTest) delete window.__controlsTest;
      disposeAudio();
      renderer.dispose();
      pGeo.dispose();
      pMat.dispose();
    },
  };
}
