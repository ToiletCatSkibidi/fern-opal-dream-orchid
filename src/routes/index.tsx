import { createFileRoute } from "@tanstack/react-router";
import { Crosshair, Heart, RotateCcw, Skull, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { startGame, type GameApi, type Pad, type Shell } from "../game/engine";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bloodRef = useRef<HTMLCanvasElement>(null);
  const healthRef = useRef<HTMLElement>(null);
  const hpBarRef = useRef<HTMLElement>(null);
  const ammoRef = useRef<HTMLElement>(null);
  const reserveRef = useRef<HTMLElement>(null);
  const waveRef = useRef<HTMLElement>(null);
  const killsRef = useRef<HTMLElement>(null);
  const feedRef = useRef<HTMLElement>(null);
  const announceRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const pauseRef = useRef<HTMLElement>(null);
  const endRef = useRef<HTMLElement>(null);
  const endTitleRef = useRef<HTMLElement>(null);
  const endTextRef = useRef<HTMLElement>(null);
  const bestRef = useRef<HTMLElement>(null);
  const hudRef = useRef<HTMLElement>(null);
  const vigRef = useRef<HTMLElement>(null);
  const crossRef = useRef<HTMLElement>(null);
  const touchRef = useRef<HTMLElement>(null);
  const muteRef = useRef<HTMLElement>(null);
  const chromeRef = useRef<HTMLElement>(null);
  const nubRef = useRef<HTMLElement>(null);
  const api = useRef<GameApi | null>(null);
  const pad = useRef<Pad>({
    moveX: 0,
    moveY: 0,
    lookX: 0,
    lookY: 0,
    fire: false,
    firePulse: false,
    jumpEdge: false,
    reloadEdge: false,
  });
  const joy = useRef<{ id: number; x: number; y: number } | null>(null);
  const look = useRef<{ id: number; x: number; y: number; moved: number } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const blood = bloodRef.current;
    const health = healthRef.current;
    const hpBar = hpBarRef.current;
    const ammo = ammoRef.current;
    const reserve = reserveRef.current;
    const wave = waveRef.current;
    const kills = killsRef.current;
    const feed = feedRef.current;
    const announce = announceRef.current;
    const menu = menuRef.current;
    const pause = pauseRef.current;
    const end = endRef.current;
    const endTitle = endTitleRef.current;
    const endText = endTextRef.current;
    const best = bestRef.current;
    const hud = hudRef.current;
    const vig = vigRef.current;
    const cross = crossRef.current;
    const touch = touchRef.current;
    const mute = muteRef.current;
    const chrome = chromeRef.current;
    if (
      !canvas ||
      !blood ||
      !health ||
      !hpBar ||
      !ammo ||
      !reserve ||
      !wave ||
      !kills ||
      !feed ||
      !announce ||
      !menu ||
      !pause ||
      !end ||
      !endTitle ||
      !endText ||
      !best ||
      !hud ||
      !vig ||
      !cross ||
      !touch ||
      !mute ||
      !chrome
    ) {
      return;
    }
    const shell: Shell = {
      health,
      hpBar,
      ammo,
      reserve,
      wave,
      kills,
      feed,
      announce,
      menu,
      pause,
      end,
      endTitle,
      endText,
      best,
      hud,
      vig,
      cross,
      blood,
      touch,
      mute,
      chrome,
    };
    const game = startGame(canvas, shell, pad.current);
    api.current = game;
    setReady(true);
    return () => {
      game.dispose();
      api.current = null;
    };
  }, []);

  function lockPointer() {
    const el = canvasRef.current;
    if (!el || !window.matchMedia("(pointer: fine)").matches) return;
    try {
      const pending = el.requestPointerLock({ unadjustedMovement: true });
      void Promise.resolve(pending).catch(() => {
        el.requestPointerLock();
      });
    } catch {
      el.requestPointerLock();
    }
  }

  function enter() {
    api.current?.start();
    lockPointer();
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg text-fg select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onClick={enter}
        aria-label="Foso"
      />
      <canvas ref={bloodRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <div className="cinema pointer-events-none absolute inset-0" />
      <div ref={vigRef} className="damage-vignette pointer-events-none absolute inset-0" />
      <div ref={crossRef} className="crosshair pointer-events-none absolute top-1/2 left-1/2 hidden" aria-hidden>
        <span className="cu" />
        <span className="cd" />
        <span className="cl" />
        <span className="cr" />
      </div>

      <section
        ref={hudRef}
        className="pointer-events-none absolute inset-x-0 top-0 hidden p-4 md:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-xs tracking-widest text-muted">VIDA</p>
            <p className="flex items-center gap-2">
              <Heart className="size-5 text-primary" aria-hidden />
              <span ref={healthRef} className="font-display text-4xl leading-none text-fg">
                100
              </span>
            </p>
            <div className="mt-2 h-1.5 w-28 bg-border">
              <div ref={hpBarRef} className="h-full w-full bg-primary" />
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-xs tracking-widest text-muted">CARTUCHOS</p>
            <p className="font-display text-4xl leading-none">
              <span ref={ammoRef} className="text-accent">
                6
              </span>
              <span className="text-muted"> / </span>
              <span ref={reserveRef} className="text-fg">
                42
              </span>
            </p>
            <p className="mt-2 font-display text-sm tracking-widest text-muted">
              OLEADA <span ref={waveRef}>1 / 3</span>
              <span className="mx-2 text-border">·</span>
              BAJAS <span ref={killsRef} className="text-fg">0</span>
            </p>
          </div>
        </div>
      </section>

      <p
        ref={announceRef}
        className="pointer-events-none absolute top-24 left-1/2 -translate-x-1/2 font-display text-4xl tracking-widest text-fg opacity-0 md:text-5xl"
      />
      <p
        ref={feedRef}
        className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 font-display text-lg tracking-widest text-primary opacity-0"
      />

      <div
        ref={chromeRef}
        className="pointer-events-none absolute inset-x-0 top-4 z-30 hidden text-center"
      >
        <button
          type="button"
          className="pointer-events-auto bg-surface/80 px-4 py-2 font-display text-sm tracking-widest text-fg"
          onClick={() => api.current?.pause()}
        >
          Pausa
        </button>
      </div>

      <section ref={menuRef} className="absolute inset-0 z-20" onClick={enter}>
        <div className="flex h-full items-center justify-center p-4">
          <div className="panel w-full max-w-md rounded-lg p-6 md:p-8" onClick={(e) => e.stopPropagation()}>
          <p className="font-display text-xs tracking-widest text-primary">FOSO DE CARNE</p>
          <h1 className="mt-2 font-display text-5xl leading-none tracking-widest text-fg md:text-6xl">
            VÍSCERA
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Escopeta, cuerpos que se desploman y sangre que se queda en el suelo. Arena cerrada, tres oleadas.
          </p>
          <ul className="mt-5 grid grid-cols-2 gap-2 text-sm text-fg">
            <li className="border border-border px-3 py-2">WASD mover</li>
            <li className="border border-border px-3 py-2">Ratón apuntar</li>
            <li className="border border-border px-3 py-2">Clic disparar</li>
            <li className="border border-border px-3 py-2">R recargar</li>
            <li className="border border-border px-3 py-2">Shift correr</li>
            <li className="border border-border px-3 py-2">Espacio saltar</li>
          </ul>
          <p className="mt-4 text-sm text-muted">
            Mejor puntuación: <span ref={bestRef} className="text-accent">0</span>
          </p>
          <button
            type="button"
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 bg-primary font-display text-lg tracking-widest text-fg disabled:opacity-60"
            onClick={enter}
            disabled={!ready}
          >
            <Crosshair className="size-5" aria-hidden />
            {ready ? "Entrar al foso" : "Cargando"}
          </button>
          <button
            type="button"
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 border border-border font-display tracking-widest text-muted"
            onClick={() => api.current?.toggleSound()}
          >
            <Volume2 className="size-4" aria-hidden />
            <span ref={muteRef}>Sonido on</span>
          </button>
          </div>
        </div>
      </section>

      <section ref={pauseRef} className="absolute inset-0 z-20 hidden bg-bg/70 p-4">
        <div className="flex h-full items-center justify-center">
          <div className="panel w-full max-w-sm rounded-lg p-6 text-center">
          <h2 className="font-display text-4xl tracking-widest">PAUSA</h2>
          <p className="mt-2 text-sm text-muted">El foso espera.</p>
          <button
            type="button"
            className="mt-5 h-12 w-full bg-primary font-display text-lg tracking-widest text-fg"
            onClick={() => {
              api.current?.resume();
              lockPointer();
            }}
          >
            Seguir
          </button>
          </div>
        </div>
      </section>

      <section ref={endRef} className="absolute inset-0 z-20 hidden bg-bg/75 p-4">
        <div className="flex h-full items-center justify-center">
          <div className="panel w-full max-w-sm rounded-lg p-6 text-center">
          <Skull className="mx-auto size-8 text-primary" aria-hidden />
          <h2 ref={endTitleRef} className="mt-3 font-display text-4xl tracking-widest">
            DESANGRADO
          </h2>
          <p ref={endTextRef} className="mt-3 text-sm leading-relaxed text-muted">
            La sangre ganó.
          </p>
          <button
            type="button"
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 bg-primary font-display text-lg tracking-widest text-fg"
            onClick={() => {
              api.current?.retry();
              lockPointer();
            }}
          >
            <RotateCcw className="size-4" aria-hidden />
            Otra vez
          </button>
          </div>
        </div>
      </section>

      <div ref={touchRef} className="absolute inset-0 z-10 hidden md:hidden">
        <div
          className="absolute top-0 right-0 h-full w-1/2 touch-none"
          onPointerDown={(e) => {
            look.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const st = look.current;
            if (!st || st.id !== e.pointerId) return;
            const dx = e.clientX - st.x;
            const dy = e.clientY - st.y;
            st.x = e.clientX;
            st.y = e.clientY;
            st.moved += Math.abs(dx) + Math.abs(dy);
            pad.current.lookX += dx * 1.6;
            pad.current.lookY += dy * 1.6;
          }}
          onPointerUp={(e) => {
            const st = look.current;
            if (st && st.id === e.pointerId && st.moved < 16) pad.current.firePulse = true;
            look.current = null;
          }}
          onPointerCancel={() => {
            look.current = null;
          }}
        />
        <div
          className="absolute bottom-8 left-6 size-28 touch-none rounded-full border border-border bg-surface/70"
          onPointerDown={(e) => {
            joy.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const st = joy.current;
            if (!st || st.id !== e.pointerId) return;
            const dx = e.clientX - st.x;
            const dy = e.clientY - st.y;
            const len = Math.hypot(dx, dy) || 1;
            const mag = Math.min(1, len / 44);
            pad.current.moveX = (dx / len) * mag;
            pad.current.moveY = (-dy / len) * mag;
            if (nubRef.current) {
              nubRef.current.style.transform = `translate(${(dx / len) * mag * 28}px, ${(dy / len) * mag * 28}px)`;
            }
          }}
          onPointerUp={() => {
            joy.current = null;
            pad.current.moveX = 0;
            pad.current.moveY = 0;
            if (nubRef.current) nubRef.current.style.transform = "translate(0px, 0px)";
          }}
          onPointerCancel={() => {
            joy.current = null;
            pad.current.moveX = 0;
            pad.current.moveY = 0;
          }}
        >
          <span ref={nubRef} className="absolute top-1/2 left-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg/80" />
        </div>
        <button
          type="button"
          className="absolute right-6 bottom-28 h-16 w-20 bg-primary font-display tracking-widest text-fg"
          onPointerDown={() => {
            pad.current.fire = true;
          }}
          onPointerUp={() => {
            pad.current.fire = false;
          }}
          onPointerCancel={() => {
            pad.current.fire = false;
          }}
        >
          FUEGO
        </button>
        <button
          type="button"
          className="absolute right-28 bottom-8 h-12 w-16 border border-border bg-surface font-display text-sm tracking-widest text-fg"
          onPointerDown={() => {
            pad.current.jumpEdge = true;
          }}
        >
          SALTO
        </button>
        <button
          type="button"
          className="absolute right-6 bottom-8 h-12 w-20 border border-border bg-surface font-display text-sm tracking-widest text-fg"
          onPointerDown={() => {
            pad.current.reloadEdge = true;
          }}
        >
          RECARGA
        </button>
      </div>
    </main>
  );
}
