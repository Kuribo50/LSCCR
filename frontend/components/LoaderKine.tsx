'use client'

// Loader animado con temática de kinesiología: una figura estilo pictograma
// (blanca con borde azul) hace ejercicios, estiramientos, flexiones y trote,
// dentro de un círculo que gira. Se dibuja en SVG y se anima con rAF.

import { useEffect, useRef, useState } from 'react'

type Pose = Record<string, number>
type Step = [string, number, number]

const BLUE = '#2fa3dc'
const FILL = '#ffffff'
const FAR = '#e6f3fa'
const OL = 2.8
const LEGW = 9.5
const ARMW = 7.4
const TORSOW = 19
const Ln = { torso: 46, neck: 6.5, head: 10.5, ua: 22, fa: 20, th: 28, sh: 27 }
const NS = 'http://www.w3.org/2000/svg'

// Ángulos: 0 = hacia abajo, positivo = hacia la derecha de la pantalla.
const legsStand = { thL: -5, shL: -2, thR: 5, shR: 2 }
const legsWide = { thL: -13, shL: -11, thR: 13, shR: 11 }
const P: Record<string, Pose> = {
  rest: { t: 180, uaL: -10, faL: 150, uaR: 10, faR: 210, ...legsStand },
  pull: { t: 180, uaL: -88, faL: -92, uaR: 88, faR: 92, ...legsStand },
  over: { t: 180, uaL: 200, faL: 192, uaR: 160, faR: 168, ...legsWide },
  sideR: { t: 162, uaL: 158, faL: 142, uaR: 132, faR: 116, ...legsWide },
  sideL: { t: 198, uaL: 228, faL: 244, uaR: 202, faR: 218, ...legsWide },
  squat: { t: 182, uaL: -25, faL: 172, uaR: 25, faR: 188, thL: -42, shL: 16, thR: 42, shR: -16 },
  press: { t: 180, uaL: 192, faL: 184, uaR: 168, faR: 176, thL: -9, shL: -6, thR: 9, shR: 6 },
  quadR: { backR: 1, t: 180, uaL: -70, faL: -82, uaR: 6, faR: 4, thL: -3, shL: -1, thR: 6, shR: 170 },
  crossR: { t: 180, uaL: 22, faL: 182, uaR: -80, faR: -90, ...legsStand },
  triR: { backR: 1, t: 182, uaL: 160, faL: 100, uaR: 172, faR: -16, ...legsStand },
  lungeR: { t: 166, uaL: -14, faL: 18, uaR: 30, faR: -4, thL: -49, shL: -48, thR: 72, shR: -4 },
  free: { t: 180, uaL: -8, faL: -4, uaR: 8, faR: 4, ...legsStand },
  // De perfil, mirando a la derecha.
  standSide: { side: 1, backL: 1, t: 180, uaL: -3, faL: 4, uaR: 3, faR: 8, thL: -2, shL: -2, thR: 2, shR: 2 },
  crouch: { side: 1, backL: 1, t: 105, uaL: 8, faL: 6, uaR: 12, faR: 10, thL: 72, shL: -16, thR: 76, shR: -14 },
  plankTop: { side: 1, backL: 1, t: 116, uaL: 0, faL: 0, uaR: 2, faR: 2, thL: -64, shL: -64, thR: -64, shR: -64 },
  plankDown: { side: 1, backL: 1, t: 98, uaL: -70, faL: 74, uaR: -68, faR: 76, thL: -82, shL: -82, thR: -82, shR: -82 },
  standRun: { side: 1, backL: 1, t: 178, uaL: -3, faL: 4, uaR: 3, faR: 8, thL: -2, shL: -2, thR: 2, shR: 2 },
}
const mirror = (p: Pose): Pose => ({
  ...p, backL: p.backR || 0, backR: p.backL || 0, t: 360 - p.t,
  uaL: -p.uaR, faL: -p.faR, uaR: -p.uaL, faR: -p.faL, thL: -p.thR, shL: -p.shR, thR: -p.thL, shR: -p.shL,
})
for (const k of ['quadR', 'crossR', 'triR', 'lungeR']) P[k.slice(0, -1) + 'L'] = mirror(P[k])
for (const k in P) { const p = P[k]; p.backL ||= 0; p.backR ||= 0; p.side ||= 0 }

function runPose(ph: number): Pose {
  const leg = (a: number) => {
    const th = 36 * Math.sin(a)
    const flex = 18 + 82 * Math.pow(Math.max(0, Math.cos(a)), 1.4)
    return [th, th - flex]
  }
  const [thR, shR] = leg(ph)
  const [thL, shL] = leg(ph + Math.PI)
  const uaR = -34 * Math.sin(ph), uaL = 34 * Math.sin(ph)
  return { side: 1, backL: 1, backR: 0, t: 170, uaL, faL: uaL + 92, uaR, faR: uaR + 92, thL, shL, thR, shR }
}

const S = 260, H = 1100
// Factor de velocidad de toda la rutina (menor = más rápido).
const VEL = 0.6
const SEQ_BASE: Step[] = [
  ['pull', 850, S], ['rest', 850, S], ['pull', 850, S], ['rest', 850, S], ['over', 1000, S], ['sideR', 1000, S], ['over', 850, S], ['sideL', 1000, S], ['over', 850, S],
  ['squat', 1000, S], ['press', 850, S], ['squat', 850, S], ['press', 850, S],
  ['free', 950, 300], ['quadR', 950, H], ['free', 750, 200], ['quadL', 950, H], ['free', 750, 200],
  ['crossR', 900, H], ['free', 700, 200], ['crossL', 900, H], ['free', 700, 200],
  ['triR', 950, H], ['free', 700, 200], ['triL', 950, H], ['free', 700, 200],
  ['lungeR', 1000, H], ['free', 800, 200], ['lungeL', 1000, H], ['free', 800, 200],
  ['standSide', 900, 250], ['crouch', 900, 200], ['plankTop', 800, 300],
  ['plankDown', 750, 150], ['plankTop', 750, 150], ['plankDown', 750, 150], ['plankTop', 750, 150], ['plankDown', 750, 150], ['plankTop', 750, 250],
  ['crouch', 850, 200], ['standSide', 850, 150], ['standRun', 300, 0], ['RUN', 4200, 0], ['standRun', 700, 150], ['rest', 1000, S],
]
const SEQ: Step[] = SEQ_BASE.map(([pose, ms, hold]) => [pose, ms * VEL, hold * VEL])
// Inicios de bloque, para empezar en un ejercicio al azar sin cortar a la mitad.
const STARTS = [0, 9, 13, 18, 22, 26, 30]
const ANGK = ['t', 'uaL', 'faL', 'uaR', 'faR', 'thL', 'shL', 'thR', 'shR']
const KEYS = [...ANGK, 'side']

const d = (a: number): [number, number] => { const r = (a * Math.PI) / 180; return [Math.sin(r), Math.cos(r)] }
const add = (p: number[], v: number[], k: number): [number, number] => [p[0] + v[0] * k, p[1] + v[1] * k]
const dAng = (a: number, b: number) => (((b - a) % 360) + 540) % 360 - 180
const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x)

function buildFigure(root: SVGGElement) {
  root.replaceChildren()
  const mk = (tag: string, attrs: Record<string, string | number>, parent: Element) => {
    const e = document.createElementNS(NS, tag)
    for (const k in attrs) e.setAttribute(k, String(attrs[k]))
    parent.appendChild(e)
    return e
  }
  const layer = () => mk('g', {}, root)
  const L = {
    armBackL: layer(), armBackR: layer(), legL: layer(), legRBack: layer(), torso: layer(),
    legRFront: layer(), armFront: layer(), head: layer(),
  }
  const piece = (parent: Element, w: number) => {
    const g = mk('g', {}, parent)
    const base = { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }
    const o = mk('path', { ...base, stroke: BLUE, 'stroke-width': w + OL * 2 }, g)
    const f = mk('path', { ...base, stroke: FILL, 'stroke-width': w }, g)
    return {
      g,
      set(pts: number[][]) {
        const dd = 'M' + pts.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' L')
        o.setAttribute('d', dd); f.setAttribute('d', dd)
      },
      color(c: string) { f.setAttribute('stroke', c) },
    }
  }
  const leg = { L: piece(L.legL, LEGW), R: piece(L.legRBack, LEGW) }
  const torso = piece(L.torso, TORSOW)
  const arm = { L: piece(L.armFront, ARMW), R: piece(L.armFront, ARMW) }
  const headO = mk('circle', { r: 9.2 + OL, fill: BLUE }, L.head)
  const headF = mk('circle', { r: 9.2, fill: FILL }, L.head)
  const place = (g: Element, parent: Element) => { if (g.parentNode !== parent) parent.appendChild(g) }

  return function draw(p: Pose) {
    const W = 1 - p.side
    const td = d(p.t), right = [-td[1], td[0]], nk = add([0, 0], td, Ln.torso), shc = add(nk, td, -6)
    const sh = { L: add(shc, right, -8 * W), R: add(shc, right, 8 * W) }
    const hp = { L: add([0, 0], right, -4.6 * W), R: add([0, 0], right, 4.6 * W) }
    const pts: Record<string, [number, number]> = {}
    for (const s of ['L', 'R'] as const) {
      pts['e' + s] = add(sh[s], d(p['ua' + s]), Ln.ua); pts['h' + s] = add(pts['e' + s], d(p['fa' + s]), Ln.fa)
      pts['k' + s] = add(hp[s], d(p['th' + s]), Ln.th); pts['f' + s] = add(pts['k' + s], d(p['sh' + s]), Ln.sh)
    }
    const head = add(nk, td, Ln.neck + Ln.head)
    // Apoyo en el suelo: el pie o la mano más baja toca la línea.
    const low = Math.max(pts.fL[1] + LEGW / 2 + OL, pts.fR[1] + LEGW / 2 + OL, pts.hL[1] + ARMW / 2 + OL, pts.hR[1] + ARMW / 2 + OL)
    const dy = 150 - low
    const T = (q: number[]): [number, number] => [q[0] + 100, q[1] + dy]
    const prof = p.side > 0.5
    place(leg.R.g, prof ? L.legRFront : L.legRBack)
    for (const s of ['L', 'R'] as const) {
      const sg = prof ? 1 : s === 'L' ? -1 : 1
      const far = prof && s === 'L'
      const foot = T(pts['f' + s])
      leg[s].set([T(hp[s]), T(pts['k' + s]), foot, add(foot, [sg * 0.96, 0.28], 5.5)])
      arm[s].set([T(sh[s]), T(pts['e' + s]), T(pts['h' + s])])
      leg[s].color(far ? FAR : FILL); arm[s].color(far ? FAR : FILL)
      place(arm[s].g, p['back' + s] > 0.5 ? (s === 'L' ? L.armBackL : L.armBackR) : L.armFront)
    }
    torso.set([T(add([0, 0], td, 2)), T(shc)])
    const hd = T(head)
    for (const c of [headO, headF]) { c.setAttribute('cx', hd[0].toFixed(2)); c.setAttribute('cy', hd[1].toFixed(2)) }
  }
}

export default function LoaderKine({
  texto = 'Cargando…',
  pantallaCompleta = false,
  retrasoMs = 150,
  enLinea = false,
}: { texto?: string; pantallaCompleta?: boolean; retrasoMs?: number; enLinea?: boolean }) {
  const figRef = useRef<SVGGElement>(null)
  const trackRef = useRef<SVGLineElement>(null)
  const [visible, setVisible] = useState(retrasoMs <= 0)
  const [reducido, setReducido] = useState(false)

  useEffect(() => {
    if (retrasoMs <= 0) return
    const id = window.setTimeout(() => setVisible(true), retrasoMs)
    return () => window.clearTimeout(id)
  }, [retrasoMs])

  useEffect(() => {
    if (!visible || !figRef.current) return
    const draw = buildFigure(figRef.current)
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setReducido(quieto)
    if (quieto) { draw(P.rest); return }

    let i = STARTS[Math.floor(Math.random() * STARTS.length)]
    let t0 = performance.now(), last = t0, phase = 0, trackOff = 0, raf = 0
    let from: Pose = { ...P.rest }
    const x: Pose = { ...P.rest }
    const v: Pose = {}
    for (const k of KEYS) v[k] = 0

    const targetAt = (now: number, dt: number): Pose => {
      const step = SEQ[i]
      if (step[0] === 'RUN') { phase += dt * 2 * Math.PI * 1.9; return runPose(phase) }
      const tp = P[step[0]], e = ease(Math.min(1, (now - t0) / step[1])), p = { ...tp }
      for (const k of ANGK) p[k] = from[k] + dAng(from[k], tp[k]) * e
      p.side = from.side + (tp.side - from.side) * e
      return p
    }
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      const step = SEQ[i], tgt = targetAt(now, dt), running = step[0] === 'RUN'
      const w = running ? 36 : 19 // rigidez del resorte: movimiento suave y orgánico
      for (const k of KEYS) {
        const diff = ANGK.includes(k) ? dAng(x[k], tgt[k]) : tgt[k] - x[k]
        v[k] += (w * w * diff - 2 * w * v[k]) * dt; x[k] += v[k] * dt
      }
      const breath = Math.sin(now / 650) * (1 - x.side)
      draw({ ...x, backL: tgt.backL, backR: tgt.backR, t: x.t + breath * 1.1, uaL: x.uaL - breath * 1.5, uaR: x.uaR + breath * 1.5 })
      const tr = trackRef.current
      if (tr) {
        trackOff += running ? dt * 95 : 0
        tr.setAttribute('stroke-dashoffset', trackOff.toFixed(2))
        tr.setAttribute('opacity', running ? '1' : '0')
      }
      if (now - t0 >= step[1] + step[2]) {
        from = step[0] === 'RUN' ? runPose(phase) : { ...P[step[0]] }
        for (const k of ANGK) from[k] = tgt[k]
        i = (i + 1) % SEQ.length; t0 = now
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [visible])

  const contenido = (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center gap-3 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <svg width="200" height="192" viewBox="-4 -4 208 200" aria-hidden="true">
        <circle cx="100" cy="92" r="92" fill="none" strokeWidth="5" className="stroke-[#e3f1f9] dark:stroke-[#1f2a31]" />
        <circle cx="100" cy="92" r="92" fill="none" stroke={BLUE} strokeWidth="5" strokeLinecap="round" strokeDasharray="400 178">
          {!reducido && (
            <>
              <animateTransform attributeName="transform" type="rotate" from="0 100 92" to="360 100 92" dur="1.1s" repeatCount="indefinite" />
              <animate attributeName="stroke-dasharray" values="60 518;400 178;60 518" dur="2s" repeatCount="indefinite" />
            </>
          )}
        </circle>
        <circle cx="100" cy="92" r="80" className="fill-[#c8eed8] dark:fill-[#1e3a2c]" />
        <g transform="translate(100 95) scale(.78) translate(-100 -95)">
          <line x1="44" y1="150" x2="156" y2="150" stroke="#9ed9b8" strokeWidth="3" strokeLinecap="round" />
          <line ref={trackRef} x1="44" y1="150" x2="156" y2="150" stroke="#ffffff" strokeWidth="3" strokeDasharray="6 9" opacity="0" />
          <g ref={figRef} />
        </g>
      </svg>
      <p className="text-xl font-semibold tracking-tight text-slate-600 dark:text-ink-black-50">{texto}</p>
    </div>
  )

  // Dentro de otro contenedor (por ejemplo, encima de una tabla): sin envoltorio.
  if (enLinea) return contenido
  if (pantallaCompleta) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:!bg-[#151515]">{contenido}</div>
    )
  }
  return <div className="flex min-h-[60vh] items-center justify-center">{contenido}</div>
}
