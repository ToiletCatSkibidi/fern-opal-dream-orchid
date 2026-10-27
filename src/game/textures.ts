import * as THREE from "three";

function hash(ix: number, iy: number, seed: number) {
  let n = ix * 374761393 + iy * 668265263 + seed * 1440671;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

function vnoise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, seed: number) {
  return (
    vnoise(x, y, seed) * 0.55 +
    vnoise(x * 2.1, y * 2.1, seed + 5) * 0.3 +
    vnoise(x * 4.2, y * 4.2, seed + 11) * 0.15
  );
}

function canvasTex(
  w: number,
  h: number,
  paint: (x: number, y: number, n: number) => [number, number, number],
) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) throw new Error("canvas");
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(x / 18, y / 18, 3);
      const [r, gc, b] = paint(x, y, n);
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gc;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function circleTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (!g) throw new Error("canvas");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.35, "rgba(255,255,255,0.9)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export function createMaps() {
  const concrete = canvasTex(256, 256, (x, y, n) => {
    const panel = (Math.floor(x / 64) + Math.floor(y / 80)) % 2 === 0 ? 8 : -6;
    const seam = x % 64 < 2 || y % 80 < 2 ? -28 : 0;
    const v = 118 + n * 46 + panel + seam;
    return [v * 0.92, v * 0.86, v * 0.8];
  });
  const floor = canvasTex(256, 256, (x, y, n) => {
    const grit = n * 50;
    const stain = vnoise(x / 40, y / 40, 9) > 0.72 ? -30 : 0;
    const v = 132 + grit + stain;
    return [v * 0.95, v * 0.86, v * 0.76];
  });
  const wood = canvasTex(128, 128, (x, y, n) => {
    const stripe = Math.sin(y * 0.45) * 10;
    const v = 150 + n * 30 + stripe;
    return [v * 0.72, v * 0.48, v * 0.28];
  });
  const skin = canvasTex(128, 128, (x, y, n) => {
    const pore = n * 28;
    const bruise = vnoise(x / 22, y / 22, 4) > 0.78 ? 30 : 0;
    const v = 214 + pore;
    return [Math.min(255, v), Math.max(0, v * 0.78 - bruise), Math.max(0, v * 0.7 - bruise * 1.2)];
  });
  return { concrete, floor, wood, skin };
}
