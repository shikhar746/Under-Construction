import { useState, useEffect, useRef } from "react";

const FULL_TEXT = "under_construction";
const LOG_LINES = [
  { t: "", s: "$ npm run build" },
  { t: "", s: "[ok] resolving dependencies" },
  { t: "", s: "[ok] bundling modules" },
  { t: "", s: "[ok] optimizing assets" },
  { t: "wait", s: "[..] deploying to edge" },
  { t: "", s: "[ok] cache warmed" },
  { t: "wait", s: "[..] running final checks" },
];

const SNAP = 36;
const TAIL_LEN = 20;

export default function UnderConstruction() {
  const [typed, setTyped] = useState("");
  const [cursorOn, setCursorOn] = useState(true);
  const [progress, setProgress] = useState(0);
  const [noTransition, setNoTransition] = useState(false);
  const [logs, setLogs] = useState([LOG_LINES[0]]);

  const canvasRef = useRef(null);
  const pageRef = useRef(null);
  const rafRef = useRef(null);
  const stateRef = useRef({
    mouse: { x: -999, y: -999 },
    cursor: { x: -999, y: -999 },
    tail: Array.from({ length: TAIL_LEN }, () => ({ x: -999, y: -999 })),
    tailHead: 0,
    speed: 0,
    nodes: [],
    edges: [],
    pulses: [],
    ambient: [],
    pathCache: new Map(),
    logIdx: 1,
  });

  // typing effect
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTyped(FULL_TEXT.slice(0, i));
      if (i >= FULL_TEXT.length) clearInterval(id);
    }, 70);
    return () => clearInterval(id);
  }, []);

  // blinking cursor
  useEffect(() => {
    const id = setInterval(() => setCursorOn((v) => !v), 500);
    return () => clearInterval(id);
  }, []);

  // progress bar
  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) return p;
        return Math.min(100, p + Math.random() * 4 + 0.5);
      });
    }, 600);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (progress < 100) return;
    const t = setTimeout(() => {
      setNoTransition(true);
      setProgress(0);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => setNoTransition(false));
      });
    }, 400);
    return () => {
      clearTimeout(t);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [progress]);

  // log rotation
  useEffect(() => {
    const id = setInterval(() => {
      const st = stateRef.current;
      const line = LOG_LINES[st.logIdx % LOG_LINES.length];
      st.logIdx++;
      setLogs((prev) => {
        const next = [...prev, line];
        return next.length > 4 ? next.slice(-4) : next;
      });
    }, 1400);
    return () => clearInterval(id);
  }, []);

  // canvas: PCB + cursor
  useEffect(() => {
    const canvas = canvasRef.current;
    const page = pageRef.current;
    if (!canvas || !page) return;
    const ctx = canvas.getContext("2d");
    const st = stateRef.current;

    function build(W, H) {
      st.nodes = [];
      st.edges = [];
      st.pulses = [];
      st.pathCache.clear();
      const cols = Math.floor(W / SNAP) + 1;
      const rows = Math.floor(H / SNAP) + 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() < 0.22) {
            const x = c * SNAP;
            const y = r * SNAP;
            st.nodes.push({ x, y, base: { x, y }, gold: Math.random() < 0.1, size: Math.random() < 0.15 ? 2.8 : 1.6 });
          }
        }
      }
      st.nodes.forEach((n, i) => {
        const sorted = st.nodes
          .filter((_, j) => j !== i)
          .sort((a, b) => Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(b.x - n.x, b.y - n.y));
        sorted.slice(0, Math.floor(Math.random() * 2) + 1).forEach((m) => {
          if (Math.hypot(m.x - n.x, m.y - n.y) > SNAP * 4) return;
          if (st.edges.find((e) => (e.a === n && e.b === m) || (e.a === m && e.b === n))) return;
          st.edges.push({ a: n, b: m, gold: n.gold && m.gold });
        });
      });
      st.edges.forEach((e) => {
        if (Math.random() < 0.35) spawnPulse(e);
      });

      // Ambient pulses - evenly distributed anchors across the whole canvas
      // so the background breathes everywhere, not just near the cursor or
      // wherever PCB nodes happened to cluster.
      //
      // The original used a coarse 2x3..4x3 grid whose radius was nearly
      // the size of its own cell. With jitter on top, neighboring anchors
      // could drift together (hot spots) while corners far from any anchor
      // stayed dark (dead zones). This keeps the exact same per-anchor
      // brightness formula (so overall intensity is unchanged) but uses a
      // much denser, capped grid with a smaller radius-to-cell ratio and
      // tighter jitter, so coverage blends evenly with no gaps.
      st.ambient = [];
      const CELL = 130;
      const ambCols = Math.max(3, Math.min(20, Math.round(W / CELL)));
      const ambRows = Math.max(3, Math.min(14, Math.round(H / CELL)));
      const cellW = W / ambCols;
      const cellH = H / ambRows;
      const baseRadius = Math.min(cellW, cellH) * 0.82;
      for (let r = 0; r < ambRows; r++) {
        for (let c = 0; c < ambCols; c++) {
          st.ambient.push({
            x: (c + 0.5) * cellW + (Math.random() - 0.5) * cellW * 0.25,
            y: (r + 0.5) * cellH + (Math.random() - 0.5) * cellH * 0.25,
            phase: Math.random() * Math.PI * 2,
            period: 7 + Math.random() * 7,
            radius: baseRadius * (0.95 + Math.random() * 0.1),
            gold: Math.random() < 0.12,
          });
        }
      }
    }

    function getPath(a, b) {
      return Math.random() < 0.5
        ? [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }]
        : [{ x: a.x, y: a.y }, { x: a.x, y: b.y }, { x: b.x, y: b.y }];
    }

    function getCachedPath(e) {
      if (!st.pathCache.has(e)) st.pathCache.set(e, getPath(e.a, e.b));
      return st.pathCache.get(e);
    }

    function ptAlong(pts, t) {
      const segs = pts.slice(0, -1).map((p, i) => ({ len: Math.hypot(pts[i + 1].x - p.x, pts[i + 1].y - p.y), i }));
      const total = segs.reduce((s, x) => s + x.len, 0);
      if (!total) return pts[0];
      let d = t * total;
      for (const seg of segs) {
        if (d <= seg.len) {
          const f = d / seg.len;
          return { x: pts[seg.i].x + (pts[seg.i + 1].x - pts[seg.i].x) * f, y: pts[seg.i].y + (pts[seg.i + 1].y - pts[seg.i].y) * f };
        }
        d -= seg.len;
      }
      return pts[pts.length - 1];
    }

    function spawnPulse(e) {
      if (st.pulses.length >= 28) return;
      st.pulses.push({ edge: e, t: Math.random(), speed: 0.003 + Math.random() * 0.003, gold: e.gold || Math.random() < 0.07, rev: Math.random() < 0.5 });
    }

    function drawEdge(path, alpha, gold) {
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.strokeStyle = gold ? `rgba(234,179,8,${alpha})` : `rgba(56,130,246,${alpha})`;
      ctx.lineWidth = 0.7;
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    let W, H;

    function resize() {
      const r = page.getBoundingClientRect();
      W = canvas.width = r.width || window.innerWidth;
      H = canvas.height = r.height || window.innerHeight;
      build(W, H);
    }

    function onMouseMove(e) {
      const r = page.getBoundingClientRect();
      st.mouse.x = e.clientX - r.left;
      st.mouse.y = e.clientY - r.top;
    }
    function onMouseLeave() {
      st.mouse.x = -999;
      st.mouse.y = -999;
    }

    page.addEventListener("mousemove", onMouseMove);
    page.addEventListener("mouseleave", onMouseLeave);

    let animId;
    function frame() {
      ctx.clearRect(0, 0, W, H);
      const hasMouse = st.mouse.x > 0;

      // smooth cursor
      if (hasMouse) {
        const px = st.cursor.x === -999 ? st.mouse.x : st.cursor.x;
        const py = st.cursor.y === -999 ? st.mouse.y : st.cursor.y;
        st.cursor.x = px + (st.mouse.x - px) * 0.18;
        st.cursor.y = py + (st.mouse.y - py) * 0.18;
        st.speed = Math.hypot(st.cursor.x - px, st.cursor.y - py);
      } else {
        st.speed *= 0.8;
        st.cursor.x = -999;
        st.cursor.y = -999;
      }

      // push tail buffer
      st.tail[st.tailHead] = { x: st.cursor.x, y: st.cursor.y };
      st.tailHead = (st.tailHead + 1) % TAIL_LEN;

      // ambient background pulse - smooth, continuous, evenly spread across
      // the full canvas so there are no static "dead" regions. Independent
      // of mouse position, each anchor breathes on its own randomized
      // sine cycle so there's no synchronized/repeating pattern. Alpha and
      // radius-breathing formulas are unchanged from the original, so
      // overall intensity matches before — only the anchor placement (in
      // build()) was densified to remove gaps. fillRect is now limited to
      // each gradient's own bounding box instead of the full canvas, which
      // keeps this cheap even with more anchors on large displays.
      const tAmb = performance.now() / 1000;
      st.ambient.forEach((a) => {
        const wave = Math.sin((tAmb / a.period) * Math.PI * 2 + a.phase);
        const breathe = wave * 0.5 + 0.5; // 0..1, smooth, no jumps
        const alpha = 0.014 + breathe * 0.02;
        const r = a.radius * (0.85 + breathe * 0.2);
        const gr = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, r);
        const color = a.gold ? "234,179,8" : "56,130,246";
        gr.addColorStop(0, `rgba(${color},${alpha})`);
        gr.addColorStop(1, "transparent");
        ctx.fillStyle = gr;
        ctx.fillRect(a.x - r, a.y - r, r * 2, r * 2);
      });

      // cursor glow
      if (hasMouse) {
        const gr = ctx.createRadialGradient(st.cursor.x, st.cursor.y, 0, st.cursor.x, st.cursor.y, 140);
        gr.addColorStop(0, "rgba(56,130,246,0.045)");
        gr.addColorStop(1, "transparent");
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, W, H);
      }

      // node repulsion
      st.nodes.forEach((n) => {
        if (hasMouse) {
          const dx = st.cursor.x - n.base.x;
          const dy = st.cursor.y - n.base.y;
          const dist = Math.hypot(dx, dy);
          const force = Math.max(0, 1 - dist / 90);
          const ang = Math.atan2(dy, dx);
          n.x += (n.base.x - Math.cos(ang) * force * 12 - n.x) * 0.1;
          n.y += (n.base.y - Math.sin(ang) * force * 12 - n.y) * 0.1;
        } else {
          n.x += (n.base.x - n.x) * 0.06;
          n.y += (n.base.y - n.y) * 0.06;
        }
      });

      // PCB edges
      st.edges.forEach((e) => {
        const path = getCachedPath(e);
        const midX = (e.a.x + e.b.x) / 2;
        const midY = (e.a.y + e.b.y) / 2;
        const dist = hasMouse ? Math.hypot(st.cursor.x - midX, st.cursor.y - midY) : 999;
        const boost = hasMouse ? Math.max(0, 1 - dist / 150) * 0.2 : 0;
        drawEdge(path, (e.gold ? 0.18 : 0.08) + boost, e.gold);
      });

      // nodes
      st.nodes.forEach((n) => {
        const dist = hasMouse ? Math.hypot(st.cursor.x - n.x, st.cursor.y - n.y) : 999;
        const near = hasMouse && dist < 80;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
        ctx.fillStyle = near
          ? n.gold ? "rgba(234,179,8,1)" : "rgba(56,130,246,0.95)"
          : n.gold ? "rgba(234,179,8,0.55)" : "rgba(56,130,246,0.35)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.size + (near ? 4 : 2), 0, Math.PI * 2);
        ctx.strokeStyle = near
          ? n.gold ? "rgba(234,179,8,0.35)" : "rgba(56,130,246,0.3)"
          : n.gold ? "rgba(234,179,8,0.12)" : "rgba(56,130,246,0.1)";
        ctx.lineWidth = 0.7;
        ctx.stroke();
      });

      // pulses
      for (let pi = st.pulses.length - 1; pi >= 0; pi--) {
        const p = st.pulses[pi];
        p.t += p.speed * (hasMouse ? 1.4 : 1);
        if (p.t >= 1) {
          p.t = 0;
          if (Math.random() < 0.12) { st.pulses.splice(pi, 1); continue; }
        }
        const path = getCachedPath(p.edge);
        const t = p.rev ? 1 - p.t : p.t;
        const pos = ptAlong(path, t);
        const tailT = Math.max(0, t - 0.14);
        for (let s = 0; s < 8; s++) {
          const tf = tailT + (t - tailT) * (s / 8);
          const tp = ptAlong(path, tf);
          const frac = s / 8;
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, 0.9, 0, Math.PI * 2);
          ctx.fillStyle = p.gold ? `rgba(234,179,8,${frac * 0.3})` : `rgba(56,130,246,${frac * 0.3})`;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = p.gold ? "rgba(234,179,8,1)" : "rgba(56,130,246,1)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = p.gold ? "rgba(234,179,8,0.2)" : "rgba(56,130,246,0.2)";
        ctx.fill();
      }

      // random new pulses
      if (Math.random() < 0.008 && st.edges.length) {
        spawnPulse(st.edges[Math.floor(Math.random() * st.edges.length)]);
      }

      // comet cursor
      if (hasMouse && st.cursor.x > 0) {
        const tailLen = Math.min(TAIL_LEN - 1, Math.floor(st.speed * 2.5 + 4));
        const pts = [];
        for (let i = 0; i < tailLen; i++) {
          const idx = (st.tailHead - 1 - i + TAIL_LEN) % TAIL_LEN;
          const pt = st.tail[idx];
          if (pt.x > 0) pts.push(pt);
        }
        if (pts.length > 1) {
          for (let i = 1; i < pts.length; i++) {
            const frac = 1 - i / pts.length;
            ctx.beginPath();
            ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
            ctx.lineTo(pts[i].x, pts[i].y);
            ctx.strokeStyle = `rgba(234,179,8,${frac * frac * 0.6})`;
            ctx.lineWidth = frac * 2.5;
            ctx.lineCap = "round";
            ctx.stroke();
          }
        }
        // star head
        ctx.beginPath();
        ctx.arc(st.cursor.x, st.cursor.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(234,179,8,1)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(st.cursor.x, st.cursor.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(234,179,8,0.18)";
        ctx.fill();
      }

      animId = requestAnimationFrame(frame);
    }

    resize();
    frame();
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      page.removeEventListener("mousemove", onMouseMove);
      page.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  const MONO = "'JetBrains Mono','SF Mono','Fira Code',monospace";

  return (
    <div
      ref={pageRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        background: "#060b18",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        fontFamily: MONO,
        cursor: "none",
      }}
    >
      {/* grid */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(56,130,246,0.07) 1px,transparent 1px),linear-gradient(90deg,rgba(56,130,246,0.07) 1px,transparent 1px)", backgroundSize: "28px 28px", pointerEvents: "none" }} />

      {/* PCB canvas */}
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />

      {/* content - centered both axes, scales with viewport */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          width: "min(90vw, 480px)",
          maxHeight: "92vh",
          margin: "0 auto",
          padding: "clamp(0.5rem, 2vh, 1.5rem) clamp(1rem, 3vw, 2rem)",
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "clamp(14px, 2.4vh, 22px)",
        }}
      >
        {/* badge */}
        <div className="ucBadge" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "clamp(5px,0.9vh,7px) clamp(14px,2.6vw,18px)", border: "0.5px solid rgba(234,179,8,0.55)", borderRadius: 8, color: "#EAB308", fontSize: "clamp(13px,1.9vw,16px)", background: "rgba(234,179,8,0.07)", pointerEvents: "auto", cursor: "default" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#EAB308", display: "inline-block", animation: "pcbPulse 1.5s ease-in-out infinite" }} />
          build_status: in_progress
        </div>

        <div style={{ width: "100%" }}>
          <h1 className="ucHeading" style={{ color: "#E8F1FF", fontSize: "clamp(22px, 8.2vw, 68px)", fontWeight: 500, margin: "0 0 clamp(8px,1.4vh,12px)", letterSpacing: "0.5px", fontFamily: MONO, lineHeight: 1.15, display: "flex", alignItems: "baseline", justifyContent: "center", width: "100%" }}>
            <span>{typed}</span>
            <span style={{ color: "#EAB308", opacity: cursorOn ? 1 : 0, transition: "opacity 0.1s", width: "0.55ch", display: "inline-block", textAlign: "left" }}>_</span>
          </h1>

          <p style={{ color: "#3a5070", fontSize: "clamp(15px, 2.1vw, 19px)", margin: 0, fontFamily: MONO, overflowWrap: "break-word" }}>
            we're deploying something new. check back soon.
          </p>
        </div>

        {/* progress */}
        <div style={{ width: "100%", maxWidth: 440 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "clamp(13px,1.8vw,16px)", color: "#378ADD", marginBottom: 6 }}>
            <span>compiling assets</span>
            <span style={{ color: "#EAB308" }}>{Math.round(progress)}%</span>
          </div>
          <div style={{ height: "clamp(7px,1.1vh,9px)", background: "#0d1525", borderRadius: 4, overflow: "hidden", border: "0.5px solid rgba(56,130,246,0.15)", position: "relative" }}>
            <div style={{
              height: "100%",
              width: `${Math.round(progress)}%`,
              borderRadius: 4,
              background: "repeating-linear-gradient(45deg,#185FA5,#185FA5 8px,#378ADD 8px,#378ADD 16px)",
              transition: noTransition ? "none" : "width 0.4s linear",
              position: "relative",
            }}>
              <div style={{ position: "absolute", right: -1, top: "50%", transform: "translateY(-50%)", width: 7, height: 7, borderRadius: "50%", background: "#EAB308" }} />
            </div>
          </div>
        </div>

        {/* terminal */}
        <div style={{ width: "100%", maxWidth: 440, textAlign: "left", background: "rgba(8,14,28,0.85)", border: "0.5px solid rgba(56,130,246,0.18)", borderRadius: 8, padding: "clamp(10px,1.6vh,13px) clamp(14px,2.4vw,16px)", fontSize: "clamp(13px,1.8vw,15px)", color: "#378ADD", minHeight: "clamp(72px,11vh,90px)", fontFamily: MONO, overflowWrap: "break-word" }}>
          {logs.map((line, i) => (
            <div key={i} style={{ padding: "2px 0", color: line.t === "wait" ? "#EAB308" : "#378ADD" }}>
              {line.s}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        html, body { margin:0; padding:0; height:100%; overflow:hidden; }
        @keyframes pcbPulse{0%,100%{opacity:1}50%{opacity:0.4}}
        .ucBadge {
          will-change: transform, box-shadow, border-color;
          transition: transform 0.25s cubic-bezier(0.22,1,0.36,1),
                      box-shadow 0.25s cubic-bezier(0.22,1,0.36,1),
                      border-color 0.25s ease,
                      background-color 0.25s ease;
        }
        .ucBadge:hover {
          transform: scale(1.045);
          border-color: rgba(234,179,8,0.9);
          background: rgba(234,179,8,0.12);
          box-shadow: 0 0 0 1px rgba(234,179,8,0.15), 0 6px 24px rgba(234,179,8,0.18);
        }
        @media (max-width: 420px) {
          .ucBadge { white-space: nowrap; }
          .ucHeading { letter-spacing: 0.2px; }
        }
        @media (max-width: 340px) {
          .ucHeading { letter-spacing: 0px; }
        }
      `}</style>
    </div>
  );
}
// import { useState, useEffect, useRef } from "react";

// const FULL_TEXT = "under_construction";
// const LOG_LINES = [
//   { t: "", s: "$ npm run build" },
//   { t: "", s: "[ok] resolving dependencies" },
//   { t: "", s: "[ok] bundling modules" },
//   { t: "", s: "[ok] optimizing assets" },
//   { t: "wait", s: "[..] deploying to edge" },
//   { t: "", s: "[ok] cache warmed" },
//   { t: "wait", s: "[..] running final checks" },
// ];

// const SNAP = 36;
// const TAIL_LEN = 20;

// export default function UnderConstruction() {
//   const [typed, setTyped] = useState("");
//   const [cursorOn, setCursorOn] = useState(true);
//   const [progress, setProgress] = useState(0);
//   const [noTransition, setNoTransition] = useState(false);
//   const [logs, setLogs] = useState([LOG_LINES[0]]);

//   const canvasRef = useRef(null);
//   const pageRef = useRef(null);
//   const rafRef = useRef(null);
//   const stateRef = useRef({
//     mouse: { x: -999, y: -999 },
//     cursor: { x: -999, y: -999 },
//     tail: Array.from({ length: TAIL_LEN }, () => ({ x: -999, y: -999 })),
//     tailHead: 0,
//     speed: 0,
//     nodes: [],
//     edges: [],
//     pulses: [],
//     ambient: [],
//     pathCache: new Map(),
//     logIdx: 1,
//   });

//   // typing effect
//   useEffect(() => {
//     let i = 0;
//     const id = setInterval(() => {
//       i += 1;
//       setTyped(FULL_TEXT.slice(0, i));
//       if (i >= FULL_TEXT.length) clearInterval(id);
//     }, 70);
//     return () => clearInterval(id);
//   }, []);

//   // blinking cursor
//   useEffect(() => {
//     const id = setInterval(() => setCursorOn((v) => !v), 500);
//     return () => clearInterval(id);
//   }, []);

//   // progress bar
//   useEffect(() => {
//     const id = setInterval(() => {
//       setProgress((p) => {
//         if (p >= 100) return p;
//         return Math.min(100, p + Math.random() * 4 + 0.5);
//       });
//     }, 600);
//     return () => clearInterval(id);
//   }, []);

//   useEffect(() => {
//     if (progress < 100) return;
//     const t = setTimeout(() => {
//       setNoTransition(true);
//       setProgress(0);
//       rafRef.current = requestAnimationFrame(() => {
//         rafRef.current = requestAnimationFrame(() => setNoTransition(false));
//       });
//     }, 400);
//     return () => {
//       clearTimeout(t);
//       if (rafRef.current) cancelAnimationFrame(rafRef.current);
//     };
//   }, [progress]);

//   // log rotation
//   useEffect(() => {
//     const id = setInterval(() => {
//       const st = stateRef.current;
//       const line = LOG_LINES[st.logIdx % LOG_LINES.length];
//       st.logIdx++;
//       setLogs((prev) => {
//         const next = [...prev, line];
//         return next.length > 4 ? next.slice(-4) : next;
//       });
//     }, 1400);
//     return () => clearInterval(id);
//   }, []);

//   // canvas: PCB + cursor
//   useEffect(() => {
//     const canvas = canvasRef.current;
//     const page = pageRef.current;
//     if (!canvas || !page) return;
//     const ctx = canvas.getContext("2d");
//     const st = stateRef.current;

//     function build(W, H) {
//       st.nodes = [];
//       st.edges = [];
//       st.pulses = [];
//       st.pathCache.clear();
//       const cols = Math.floor(W / SNAP) + 1;
//       const rows = Math.floor(H / SNAP) + 1;
//       for (let r = 0; r < rows; r++) {
//         for (let c = 0; c < cols; c++) {
//           if (Math.random() < 0.22) {
//             const x = c * SNAP;
//             const y = r * SNAP;
//             st.nodes.push({ x, y, base: { x, y }, gold: Math.random() < 0.1, size: Math.random() < 0.15 ? 2.8 : 1.6 });
//           }
//         }
//       }
//       st.nodes.forEach((n, i) => {
//         const sorted = st.nodes
//           .filter((_, j) => j !== i)
//           .sort((a, b) => Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(b.x - n.x, b.y - n.y));
//         sorted.slice(0, Math.floor(Math.random() * 2) + 1).forEach((m) => {
//           if (Math.hypot(m.x - n.x, m.y - n.y) > SNAP * 4) return;
//           if (st.edges.find((e) => (e.a === n && e.b === m) || (e.a === m && e.b === n))) return;
//           st.edges.push({ a: n, b: m, gold: n.gold && m.gold });
//         });
//       });
//       st.edges.forEach((e) => {
//         if (Math.random() < 0.35) spawnPulse(e);
//       });

//       // ambient pulses - evenly distributed anchors across the whole canvas
//       // so the background breathes everywhere, not just near the cursor or
//       // wherever PCB nodes happened to cluster.
//       st.ambient = [];
//       const ambCols = Math.max(2, Math.min(4, Math.round(W / 260)));
//       const ambRows = Math.max(2, Math.min(3, Math.round(H / 260)));
//       const cellW = W / ambCols;
//       const cellH = H / ambRows;
//       for (let r = 0; r < ambRows; r++) {
//         for (let c = 0; c < ambCols; c++) {
//           st.ambient.push({
//             x: (c + 0.5) * cellW + (Math.random() - 0.5) * cellW * 0.55,
//             y: (r + 0.5) * cellH + (Math.random() - 0.5) * cellH * 0.55,
//             phase: Math.random() * Math.PI * 2,
//             period: 7 + Math.random() * 7,
//             radius: Math.min(cellW, cellH) * 0.9 + Math.random() * 40,
//             gold: Math.random() < 0.12,
//           });
//         }
//       }
//     }

//     function getPath(a, b) {
//       return Math.random() < 0.5
//         ? [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }]
//         : [{ x: a.x, y: a.y }, { x: a.x, y: b.y }, { x: b.x, y: b.y }];
//     }

//     function getCachedPath(e) {
//       if (!st.pathCache.has(e)) st.pathCache.set(e, getPath(e.a, e.b));
//       return st.pathCache.get(e);
//     }

//     function ptAlong(pts, t) {
//       const segs = pts.slice(0, -1).map((p, i) => ({ len: Math.hypot(pts[i + 1].x - p.x, pts[i + 1].y - p.y), i }));
//       const total = segs.reduce((s, x) => s + x.len, 0);
//       if (!total) return pts[0];
//       let d = t * total;
//       for (const seg of segs) {
//         if (d <= seg.len) {
//           const f = d / seg.len;
//           return { x: pts[seg.i].x + (pts[seg.i + 1].x - pts[seg.i].x) * f, y: pts[seg.i].y + (pts[seg.i + 1].y - pts[seg.i].y) * f };
//         }
//         d -= seg.len;
//       }
//       return pts[pts.length - 1];
//     }

//     function spawnPulse(e) {
//       if (st.pulses.length >= 28) return;
//       st.pulses.push({ edge: e, t: Math.random(), speed: 0.003 + Math.random() * 0.003, gold: e.gold || Math.random() < 0.07, rev: Math.random() < 0.5 });
//     }

//     function drawEdge(path, alpha, gold) {
//       ctx.beginPath();
//       ctx.moveTo(path[0].x, path[0].y);
//       for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
//       ctx.strokeStyle = gold ? `rgba(234,179,8,${alpha})` : `rgba(56,130,246,${alpha})`;
//       ctx.lineWidth = 0.7;
//       ctx.lineJoin = "round";
//       ctx.stroke();
//     }

//     let W, H;

//     function resize() {
//       const r = page.getBoundingClientRect();
//       W = canvas.width = r.width || window.innerWidth;
//       H = canvas.height = r.height || window.innerHeight;
//       build(W, H);
//     }

//     function onMouseMove(e) {
//       const r = page.getBoundingClientRect();
//       st.mouse.x = e.clientX - r.left;
//       st.mouse.y = e.clientY - r.top;
//     }
//     function onMouseLeave() {
//       st.mouse.x = -999;
//       st.mouse.y = -999;
//     }

//     page.addEventListener("mousemove", onMouseMove);
//     page.addEventListener("mouseleave", onMouseLeave);

//     let animId;
//     function frame() {
//       ctx.clearRect(0, 0, W, H);
//       const hasMouse = st.mouse.x > 0;

//       // smooth cursor
//       if (hasMouse) {
//         const px = st.cursor.x === -999 ? st.mouse.x : st.cursor.x;
//         const py = st.cursor.y === -999 ? st.mouse.y : st.cursor.y;
//         st.cursor.x = px + (st.mouse.x - px) * 0.18;
//         st.cursor.y = py + (st.mouse.y - py) * 0.18;
//         st.speed = Math.hypot(st.cursor.x - px, st.cursor.y - py);
//       } else {
//         st.speed *= 0.8;
//         st.cursor.x = -999;
//         st.cursor.y = -999;
//       }

//       // push tail buffer
//       st.tail[st.tailHead] = { x: st.cursor.x, y: st.cursor.y };
//       st.tailHead = (st.tailHead + 1) % TAIL_LEN;

//       // ambient background pulse - smooth, continuous, evenly spread across
//       // the full canvas so there are no static "dead" regions. Independent
//       // of mouse position, each anchor breathes on its own randomized
//       // sine cycle so there's no synchronized/repeating pattern.
//       const tAmb = performance.now() / 1000;
//       st.ambient.forEach((a) => {
//         const wave = Math.sin((tAmb / a.period) * Math.PI * 2 + a.phase);
//         const breathe = wave * 0.5 + 0.5; // 0..1, smooth, no jumps
//         const alpha = 0.014 + breathe * 0.02;
//         const r = a.radius * (0.85 + breathe * 0.2);
//         const gr = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, r);
//         const color = a.gold ? "234,179,8" : "56,130,246";
//         gr.addColorStop(0, `rgba(${color},${alpha})`);
//         gr.addColorStop(1, "transparent");
//         ctx.fillStyle = gr;
//         ctx.fillRect(0, 0, W, H);
//       });

//       // cursor glow
//       if (hasMouse) {
//         const gr = ctx.createRadialGradient(st.cursor.x, st.cursor.y, 0, st.cursor.x, st.cursor.y, 140);
//         gr.addColorStop(0, "rgba(56,130,246,0.045)");
//         gr.addColorStop(1, "transparent");
//         ctx.fillStyle = gr;
//         ctx.fillRect(0, 0, W, H);
//       }

//       // node repulsion
//       st.nodes.forEach((n) => {
//         if (hasMouse) {
//           const dx = st.cursor.x - n.base.x;
//           const dy = st.cursor.y - n.base.y;
//           const dist = Math.hypot(dx, dy);
//           const force = Math.max(0, 1 - dist / 90);
//           const ang = Math.atan2(dy, dx);
//           n.x += (n.base.x - Math.cos(ang) * force * 12 - n.x) * 0.1;
//           n.y += (n.base.y - Math.sin(ang) * force * 12 - n.y) * 0.1;
//         } else {
//           n.x += (n.base.x - n.x) * 0.06;
//           n.y += (n.base.y - n.y) * 0.06;
//         }
//       });

//       // PCB edges
//       st.edges.forEach((e) => {
//         const path = getCachedPath(e);
//         const midX = (e.a.x + e.b.x) / 2;
//         const midY = (e.a.y + e.b.y) / 2;
//         const dist = hasMouse ? Math.hypot(st.cursor.x - midX, st.cursor.y - midY) : 999;
//         const boost = hasMouse ? Math.max(0, 1 - dist / 150) * 0.2 : 0;
//         drawEdge(path, (e.gold ? 0.18 : 0.08) + boost, e.gold);
//       });

//       // nodes
//       st.nodes.forEach((n) => {
//         const dist = hasMouse ? Math.hypot(st.cursor.x - n.x, st.cursor.y - n.y) : 999;
//         const near = hasMouse && dist < 80;
//         ctx.beginPath();
//         ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
//         ctx.fillStyle = near
//           ? n.gold ? "rgba(234,179,8,1)" : "rgba(56,130,246,0.95)"
//           : n.gold ? "rgba(234,179,8,0.55)" : "rgba(56,130,246,0.35)";
//         ctx.fill();
//         ctx.beginPath();
//         ctx.arc(n.x, n.y, n.size + (near ? 4 : 2), 0, Math.PI * 2);
//         ctx.strokeStyle = near
//           ? n.gold ? "rgba(234,179,8,0.35)" : "rgba(56,130,246,0.3)"
//           : n.gold ? "rgba(234,179,8,0.12)" : "rgba(56,130,246,0.1)";
//         ctx.lineWidth = 0.7;
//         ctx.stroke();
//       });

//       // pulses
//       for (let pi = st.pulses.length - 1; pi >= 0; pi--) {
//         const p = st.pulses[pi];
//         p.t += p.speed * (hasMouse ? 1.4 : 1);
//         if (p.t >= 1) {
//           p.t = 0;
//           if (Math.random() < 0.12) { st.pulses.splice(pi, 1); continue; }
//         }
//         const path = getCachedPath(p.edge);
//         const t = p.rev ? 1 - p.t : p.t;
//         const pos = ptAlong(path, t);
//         const tailT = Math.max(0, t - 0.14);
//         for (let s = 0; s < 8; s++) {
//           const tf = tailT + (t - tailT) * (s / 8);
//           const tp = ptAlong(path, tf);
//           const frac = s / 8;
//           ctx.beginPath();
//           ctx.arc(tp.x, tp.y, 0.9, 0, Math.PI * 2);
//           ctx.fillStyle = p.gold ? `rgba(234,179,8,${frac * 0.3})` : `rgba(56,130,246,${frac * 0.3})`;
//           ctx.fill();
//         }
//         ctx.beginPath();
//         ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
//         ctx.fillStyle = p.gold ? "rgba(234,179,8,1)" : "rgba(56,130,246,1)";
//         ctx.fill();
//         ctx.beginPath();
//         ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
//         ctx.fillStyle = p.gold ? "rgba(234,179,8,0.2)" : "rgba(56,130,246,0.2)";
//         ctx.fill();
//       }

//       // random new pulses
//       if (Math.random() < 0.008 && st.edges.length) {
//         spawnPulse(st.edges[Math.floor(Math.random() * st.edges.length)]);
//       }

//       // comet cursor
//       if (hasMouse && st.cursor.x > 0) {
//         const tailLen = Math.min(TAIL_LEN - 1, Math.floor(st.speed * 2.5 + 4));
//         const pts = [];
//         for (let i = 0; i < tailLen; i++) {
//           const idx = (st.tailHead - 1 - i + TAIL_LEN) % TAIL_LEN;
//           const pt = st.tail[idx];
//           if (pt.x > 0) pts.push(pt);
//         }
//         if (pts.length > 1) {
//           for (let i = 1; i < pts.length; i++) {
//             const frac = 1 - i / pts.length;
//             ctx.beginPath();
//             ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
//             ctx.lineTo(pts[i].x, pts[i].y);
//             ctx.strokeStyle = `rgba(234,179,8,${frac * frac * 0.6})`;
//             ctx.lineWidth = frac * 2.5;
//             ctx.lineCap = "round";
//             ctx.stroke();
//           }
//         }
//         // star head
//         ctx.beginPath();
//         ctx.arc(st.cursor.x, st.cursor.y, 2.5, 0, Math.PI * 2);
//         ctx.fillStyle = "rgba(234,179,8,1)";
//         ctx.fill();
//         ctx.beginPath();
//         ctx.arc(st.cursor.x, st.cursor.y, 5, 0, Math.PI * 2);
//         ctx.fillStyle = "rgba(234,179,8,0.18)";
//         ctx.fill();
//       }

//       animId = requestAnimationFrame(frame);
//     }

//     resize();
//     frame();
//     window.addEventListener("resize", resize);

//     return () => {
//       cancelAnimationFrame(animId);
//       window.removeEventListener("resize", resize);
//       page.removeEventListener("mousemove", onMouseMove);
//       page.removeEventListener("mouseleave", onMouseLeave);
//     };
//   }, []);

//   const MONO = "'JetBrains Mono','SF Mono','Fira Code',monospace";

//   return (
//     <div
//       ref={pageRef}
//       style={{
//         position: "fixed",
//         inset: 0,
//         width: "100vw",
//         height: "100dvh",
//         background: "#060b18",
//         display: "flex",
//         alignItems: "center",
//         justifyContent: "center",
//         overflow: "hidden",
//         fontFamily: MONO,
//         cursor: "none",
//       }}
//     >
//       {/* grid */}
//       <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(56,130,246,0.07) 1px,transparent 1px),linear-gradient(90deg,rgba(56,130,246,0.07) 1px,transparent 1px)", backgroundSize: "28px 28px", pointerEvents: "none" }} />

//       {/* PCB canvas */}
//       <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />

//       {/* content - centered both axes, scales with viewport */}
//       <div
//         style={{
//           position: "relative",
//           zIndex: 1,
//           textAlign: "center",
//           width: "min(90vw, 480px)",
//           maxHeight: "92vh",
//           margin: "0 auto",
//           padding: "clamp(0.5rem, 2vh, 1.5rem) clamp(1rem, 3vw, 2rem)",
//           pointerEvents: "none",
//           display: "flex",
//           flexDirection: "column",
//           alignItems: "center",
//           justifyContent: "center",
//           gap: "clamp(14px, 2.4vh, 22px)",
//         }}
//       >
//         {/* badge */}
//         <div className="ucBadge" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "clamp(5px,0.9vh,7px) clamp(14px,2.6vw,18px)", border: "0.5px solid rgba(234,179,8,0.55)", borderRadius: 8, color: "#EAB308", fontSize: "clamp(13px,1.9vw,16px)", background: "rgba(234,179,8,0.07)", pointerEvents: "auto", cursor: "default" }}>
//           <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#EAB308", display: "inline-block", animation: "pcbPulse 1.5s ease-in-out infinite" }} />
//           build_status: in_progress
//         </div>

//         <div style={{ width: "100%" }}>
//           <h1 className="ucHeading" style={{ color: "#E8F1FF", fontSize: "clamp(22px, 8.2vw, 68px)", fontWeight: 500, margin: "0 0 clamp(8px,1.4vh,12px)", letterSpacing: "0.5px", fontFamily: MONO, lineHeight: 1.15, display: "flex", alignItems: "baseline", justifyContent: "center", width: "100%" }}>
//             <span>{typed}</span>
//             <span style={{ color: "#EAB308", opacity: cursorOn ? 1 : 0, transition: "opacity 0.1s", width: "0.55ch", display: "inline-block", textAlign: "left" }}>_</span>
//           </h1>

//           <p style={{ color: "#3a5070", fontSize: "clamp(15px, 2.1vw, 19px)", margin: 0, fontFamily: MONO, overflowWrap: "break-word" }}>
//             we're deploying something new. check back soon.
//           </p>
//         </div>

//         {/* progress */}
//         <div style={{ width: "100%", maxWidth: 440 }}>
//           <div style={{ display: "flex", justifyContent: "space-between", fontSize: "clamp(13px,1.8vw,16px)", color: "#378ADD", marginBottom: 6 }}>
//             <span>compiling assets</span>
//             <span style={{ color: "#EAB308" }}>{Math.round(progress)}%</span>
//           </div>
//           <div style={{ height: "clamp(7px,1.1vh,9px)", background: "#0d1525", borderRadius: 4, overflow: "hidden", border: "0.5px solid rgba(56,130,246,0.15)", position: "relative" }}>
//             <div style={{
//               height: "100%",
//               width: `${Math.round(progress)}%`,
//               borderRadius: 4,
//               background: "repeating-linear-gradient(45deg,#185FA5,#185FA5 8px,#378ADD 8px,#378ADD 16px)",
//               transition: noTransition ? "none" : "width 0.4s linear",
//               position: "relative",
//             }}>
//               <div style={{ position: "absolute", right: -1, top: "50%", transform: "translateY(-50%)", width: 7, height: 7, borderRadius: "50%", background: "#EAB308" }} />
//             </div>
//           </div>
//         </div>

//         {/* terminal */}
//         <div style={{ width: "100%", maxWidth: 440, textAlign: "left", background: "rgba(8,14,28,0.85)", border: "0.5px solid rgba(56,130,246,0.18)", borderRadius: 8, padding: "clamp(10px,1.6vh,13px) clamp(14px,2.4vw,16px)", fontSize: "clamp(13px,1.8vw,15px)", color: "#378ADD", minHeight: "clamp(72px,11vh,90px)", fontFamily: MONO, overflowWrap: "break-word" }}>
//           {logs.map((line, i) => (
//             <div key={i} style={{ padding: "2px 0", color: line.t === "wait" ? "#EAB308" : "#378ADD" }}>
//               {line.s}
//             </div>
//           ))}
//         </div>
//       </div>

//       <style>{`
//         html, body { margin:0; padding:0; height:100%; overflow:hidden; }
//         @keyframes pcbPulse{0%,100%{opacity:1}50%{opacity:0.4}}
//         .ucBadge {
//           will-change: transform, box-shadow, border-color;
//           transition: transform 0.25s cubic-bezier(0.22,1,0.36,1),
//                       box-shadow 0.25s cubic-bezier(0.22,1,0.36,1),
//                       border-color 0.25s ease,
//                       background-color 0.25s ease;
//         }
//         .ucBadge:hover {
//           transform: scale(1.045);
//           border-color: rgba(234,179,8,0.9);
//           background: rgba(234,179,8,0.12);
//           box-shadow: 0 0 0 1px rgba(234,179,8,0.15), 0 6px 24px rgba(234,179,8,0.18);
//         }
//         @media (max-width: 420px) {
//           .ucBadge { white-space: nowrap; }
//           .ucHeading { letter-spacing: 0.2px; }
//         }
//         @media (max-width: 340px) {
//           .ucHeading { letter-spacing: 0px; }
//         }
//       `}</style>
//     </div>
//   );
// }// import { useState, useEffect, useRef } from "react";

// // const FULL_TEXT = "under_construction";
// // const LOG_LINES = [
// //   { t: "", s: "$ npm run build" },
// //   { t: "", s: "[ok] resolving dependencies" },
// //   { t: "", s: "[ok] bundling modules" },
// //   { t: "", s: "[ok] optimizing assets" },
// //   { t: "wait", s: "[..] deploying to edge" },
// //   { t: "", s: "[ok] cache warmed" },
// //   { t: "wait", s: "[..] running final checks" },
// // ];

// // const SNAP = 36;
// // const TAIL_LEN = 20;

// // export default function UnderConstruction() {
// //   const [typed, setTyped] = useState("");
// //   const [cursorOn, setCursorOn] = useState(true);
// //   const [progress, setProgress] = useState(0);
// //   const [noTransition, setNoTransition] = useState(false);
// //   const [logs, setLogs] = useState([LOG_LINES[0]]);

// //   const canvasRef = useRef(null);
// //   const pageRef = useRef(null);
// //   const rafRef = useRef(null);
// //   const stateRef = useRef({
// //     mouse: { x: -999, y: -999 },
// //     cursor: { x: -999, y: -999 },
// //     tail: Array.from({ length: TAIL_LEN }, () => ({ x: -999, y: -999 })),
// //     tailHead: 0,
// //     speed: 0,
// //     nodes: [],
// //     edges: [],
// //     pulses: [],
// //     pathCache: new Map(),
// //     logIdx: 1,
// //   });

// //   // typing effect
// //   useEffect(() => {
// //     let i = 0;
// //     const id = setInterval(() => {
// //       i += 1;
// //       setTyped(FULL_TEXT.slice(0, i));
// //       if (i >= FULL_TEXT.length) clearInterval(id);
// //     }, 70);
// //     return () => clearInterval(id);
// //   }, []);

// //   // blinking cursor
// //   useEffect(() => {
// //     const id = setInterval(() => setCursorOn((v) => !v), 500);
// //     return () => clearInterval(id);
// //   }, []);

// //   // progress bar
// //   useEffect(() => {
// //     const id = setInterval(() => {
// //       setProgress((p) => {
// //         if (p >= 100) return p;
// //         return Math.min(100, p + Math.random() * 4 + 0.5);
// //       });
// //     }, 600);
// //     return () => clearInterval(id);
// //   }, []);

// //   useEffect(() => {
// //     if (progress < 100) return;
// //     const t = setTimeout(() => {
// //       setNoTransition(true);
// //       setProgress(0);
// //       rafRef.current = requestAnimationFrame(() => {
// //         rafRef.current = requestAnimationFrame(() => setNoTransition(false));
// //       });
// //     }, 400);
// //     return () => {
// //       clearTimeout(t);
// //       if (rafRef.current) cancelAnimationFrame(rafRef.current);
// //     };
// //   }, [progress]);

// //   // log rotation
// //   useEffect(() => {
// //     const id = setInterval(() => {
// //       const st = stateRef.current;
// //       const line = LOG_LINES[st.logIdx % LOG_LINES.length];
// //       st.logIdx++;
// //       setLogs((prev) => {
// //         const next = [...prev, line];
// //         return next.length > 4 ? next.slice(-4) : next;
// //       });
// //     }, 1400);
// //     return () => clearInterval(id);
// //   }, []);

// //   // canvas: PCB + cursor
// //   useEffect(() => {
// //     const canvas = canvasRef.current;
// //     const page = pageRef.current;
// //     if (!canvas || !page) return;
// //     const ctx = canvas.getContext("2d");
// //     const st = stateRef.current;

// //     function build(W, H) {
// //       st.nodes = [];
// //       st.edges = [];
// //       st.pulses = [];
// //       st.pathCache.clear();
// //       const cols = Math.floor(W / SNAP) + 1;
// //       const rows = Math.floor(H / SNAP) + 1;
// //       for (let r = 0; r < rows; r++) {
// //         for (let c = 0; c < cols; c++) {
// //           if (Math.random() < 0.22) {
// //             const x = c * SNAP;
// //             const y = r * SNAP;
// //             st.nodes.push({ x, y, base: { x, y }, gold: Math.random() < 0.1, size: Math.random() < 0.15 ? 2.8 : 1.6 });
// //           }
// //         }
// //       }
// //       st.nodes.forEach((n, i) => {
// //         const sorted = st.nodes
// //           .filter((_, j) => j !== i)
// //           .sort((a, b) => Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(b.x - n.x, b.y - n.y));
// //         sorted.slice(0, Math.floor(Math.random() * 2) + 1).forEach((m) => {
// //           if (Math.hypot(m.x - n.x, m.y - n.y) > SNAP * 4) return;
// //           if (st.edges.find((e) => (e.a === n && e.b === m) || (e.a === m && e.b === n))) return;
// //           st.edges.push({ a: n, b: m, gold: n.gold && m.gold });
// //         });
// //       });
// //       st.edges.forEach((e) => {
// //         if (Math.random() < 0.35) spawnPulse(e);
// //       });
// //     }

// //     function getPath(a, b) {
// //       return Math.random() < 0.5
// //         ? [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }]
// //         : [{ x: a.x, y: a.y }, { x: a.x, y: b.y }, { x: b.x, y: b.y }];
// //     }

// //     function getCachedPath(e) {
// //       if (!st.pathCache.has(e)) st.pathCache.set(e, getPath(e.a, e.b));
// //       return st.pathCache.get(e);
// //     }

// //     function ptAlong(pts, t) {
// //       const segs = pts.slice(0, -1).map((p, i) => ({ len: Math.hypot(pts[i + 1].x - p.x, pts[i + 1].y - p.y), i }));
// //       const total = segs.reduce((s, x) => s + x.len, 0);
// //       if (!total) return pts[0];
// //       let d = t * total;
// //       for (const seg of segs) {
// //         if (d <= seg.len) {
// //           const f = d / seg.len;
// //           return { x: pts[seg.i].x + (pts[seg.i + 1].x - pts[seg.i].x) * f, y: pts[seg.i].y + (pts[seg.i + 1].y - pts[seg.i].y) * f };
// //         }
// //         d -= seg.len;
// //       }
// //       return pts[pts.length - 1];
// //     }

// //     function spawnPulse(e) {
// //       if (st.pulses.length >= 28) return;
// //       st.pulses.push({ edge: e, t: Math.random(), speed: 0.003 + Math.random() * 0.003, gold: e.gold || Math.random() < 0.07, rev: Math.random() < 0.5 });
// //     }

// //     function drawEdge(path, alpha, gold) {
// //       ctx.beginPath();
// //       ctx.moveTo(path[0].x, path[0].y);
// //       for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
// //       ctx.strokeStyle = gold ? `rgba(234,179,8,${alpha})` : `rgba(56,130,246,${alpha})`;
// //       ctx.lineWidth = 0.7;
// //       ctx.lineJoin = "round";
// //       ctx.stroke();
// //     }

// //     let W, H;

// //     function resize() {
// //       const r = page.getBoundingClientRect();
// //       W = canvas.width = r.width || window.innerWidth;
// //       H = canvas.height = r.height || window.innerHeight;
// //       build(W, H);
// //     }

// //     function onMouseMove(e) {
// //       const r = page.getBoundingClientRect();
// //       st.mouse.x = e.clientX - r.left;
// //       st.mouse.y = e.clientY - r.top;
// //     }
// //     function onMouseLeave() {
// //       st.mouse.x = -999;
// //       st.mouse.y = -999;
// //     }

// //     page.addEventListener("mousemove", onMouseMove);
// //     page.addEventListener("mouseleave", onMouseLeave);

// //     let animId;
// //     function frame() {
// //       ctx.clearRect(0, 0, W, H);
// //       const hasMouse = st.mouse.x > 0;

// //       // smooth cursor
// //       if (hasMouse) {
// //         const px = st.cursor.x === -999 ? st.mouse.x : st.cursor.x;
// //         const py = st.cursor.y === -999 ? st.mouse.y : st.cursor.y;
// //         st.cursor.x = px + (st.mouse.x - px) * 0.18;
// //         st.cursor.y = py + (st.mouse.y - py) * 0.18;
// //         st.speed = Math.hypot(st.cursor.x - px, st.cursor.y - py);
// //       } else {
// //         st.speed *= 0.8;
// //         st.cursor.x = -999;
// //         st.cursor.y = -999;
// //       }

// //       // push tail buffer
// //       st.tail[st.tailHead] = { x: st.cursor.x, y: st.cursor.y };
// //       st.tailHead = (st.tailHead + 1) % TAIL_LEN;

// //       // cursor glow
// //       if (hasMouse) {
// //         const gr = ctx.createRadialGradient(st.cursor.x, st.cursor.y, 0, st.cursor.x, st.cursor.y, 140);
// //         gr.addColorStop(0, "rgba(56,130,246,0.045)");
// //         gr.addColorStop(1, "transparent");
// //         ctx.fillStyle = gr;
// //         ctx.fillRect(0, 0, W, H);
// //       }

// //       // node repulsion
// //       st.nodes.forEach((n) => {
// //         if (hasMouse) {
// //           const dx = st.cursor.x - n.base.x;
// //           const dy = st.cursor.y - n.base.y;
// //           const dist = Math.hypot(dx, dy);
// //           const force = Math.max(0, 1 - dist / 90);
// //           const ang = Math.atan2(dy, dx);
// //           n.x += (n.base.x - Math.cos(ang) * force * 12 - n.x) * 0.1;
// //           n.y += (n.base.y - Math.sin(ang) * force * 12 - n.y) * 0.1;
// //         } else {
// //           n.x += (n.base.x - n.x) * 0.06;
// //           n.y += (n.base.y - n.y) * 0.06;
// //         }
// //       });

// //       // PCB edges
// //       st.edges.forEach((e) => {
// //         const path = getCachedPath(e);
// //         const midX = (e.a.x + e.b.x) / 2;
// //         const midY = (e.a.y + e.b.y) / 2;
// //         const dist = hasMouse ? Math.hypot(st.cursor.x - midX, st.cursor.y - midY) : 999;
// //         const boost = hasMouse ? Math.max(0, 1 - dist / 150) * 0.2 : 0;
// //         drawEdge(path, (e.gold ? 0.18 : 0.08) + boost, e.gold);
// //       });

// //       // nodes
// //       st.nodes.forEach((n) => {
// //         const dist = hasMouse ? Math.hypot(st.cursor.x - n.x, st.cursor.y - n.y) : 999;
// //         const near = hasMouse && dist < 80;
// //         ctx.beginPath();
// //         ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
// //         ctx.fillStyle = near
// //           ? n.gold ? "rgba(234,179,8,1)" : "rgba(56,130,246,0.95)"
// //           : n.gold ? "rgba(234,179,8,0.55)" : "rgba(56,130,246,0.35)";
// //         ctx.fill();
// //         ctx.beginPath();
// //         ctx.arc(n.x, n.y, n.size + (near ? 4 : 2), 0, Math.PI * 2);
// //         ctx.strokeStyle = near
// //           ? n.gold ? "rgba(234,179,8,0.35)" : "rgba(56,130,246,0.3)"
// //           : n.gold ? "rgba(234,179,8,0.12)" : "rgba(56,130,246,0.1)";
// //         ctx.lineWidth = 0.7;
// //         ctx.stroke();
// //       });

// //       // pulses
// //       for (let pi = st.pulses.length - 1; pi >= 0; pi--) {
// //         const p = st.pulses[pi];
// //         p.t += p.speed * (hasMouse ? 1.4 : 1);
// //         if (p.t >= 1) {
// //           p.t = 0;
// //           if (Math.random() < 0.12) { st.pulses.splice(pi, 1); continue; }
// //         }
// //         const path = getCachedPath(p.edge);
// //         const t = p.rev ? 1 - p.t : p.t;
// //         const pos = ptAlong(path, t);
// //         const tailT = Math.max(0, t - 0.14);
// //         for (let s = 0; s < 8; s++) {
// //           const tf = tailT + (t - tailT) * (s / 8);
// //           const tp = ptAlong(path, tf);
// //           const frac = s / 8;
// //           ctx.beginPath();
// //           ctx.arc(tp.x, tp.y, 0.9, 0, Math.PI * 2);
// //           ctx.fillStyle = p.gold ? `rgba(234,179,8,${frac * 0.3})` : `rgba(56,130,246,${frac * 0.3})`;
// //           ctx.fill();
// //         }
// //         ctx.beginPath();
// //         ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
// //         ctx.fillStyle = p.gold ? "rgba(234,179,8,1)" : "rgba(56,130,246,1)";
// //         ctx.fill();
// //         ctx.beginPath();
// //         ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
// //         ctx.fillStyle = p.gold ? "rgba(234,179,8,0.2)" : "rgba(56,130,246,0.2)";
// //         ctx.fill();
// //       }

// //       // random new pulses
// //       if (Math.random() < 0.008 && st.edges.length) {
// //         spawnPulse(st.edges[Math.floor(Math.random() * st.edges.length)]);
// //       }

// //       // comet cursor
// //       if (hasMouse && st.cursor.x > 0) {
// //         const tailLen = Math.min(TAIL_LEN - 1, Math.floor(st.speed * 2.5 + 4));
// //         const pts = [];
// //         for (let i = 0; i < tailLen; i++) {
// //           const idx = (st.tailHead - 1 - i + TAIL_LEN) % TAIL_LEN;
// //           const pt = st.tail[idx];
// //           if (pt.x > 0) pts.push(pt);
// //         }
// //         if (pts.length > 1) {
// //           for (let i = 1; i < pts.length; i++) {
// //             const frac = 1 - i / pts.length;
// //             ctx.beginPath();
// //             ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
// //             ctx.lineTo(pts[i].x, pts[i].y);
// //             ctx.strokeStyle = `rgba(234,179,8,${frac * frac * 0.6})`;
// //             ctx.lineWidth = frac * 2.5;
// //             ctx.lineCap = "round";
// //             ctx.stroke();
// //           }
// //         }
// //         // star head
// //         ctx.beginPath();
// //         ctx.arc(st.cursor.x, st.cursor.y, 2.5, 0, Math.PI * 2);
// //         ctx.fillStyle = "rgba(234,179,8,1)";
// //         ctx.fill();
// //         ctx.beginPath();
// //         ctx.arc(st.cursor.x, st.cursor.y, 5, 0, Math.PI * 2);
// //         ctx.fillStyle = "rgba(234,179,8,0.18)";
// //         ctx.fill();
// //       }

// //       animId = requestAnimationFrame(frame);
// //     }

// //     resize();
// //     frame();
// //     window.addEventListener("resize", resize);

// //     return () => {
// //       cancelAnimationFrame(animId);
// //       window.removeEventListener("resize", resize);
// //       page.removeEventListener("mousemove", onMouseMove);
// //       page.removeEventListener("mouseleave", onMouseLeave);
// //     };
// //   }, []);

// //   const MONO = "'JetBrains Mono','SF Mono','Fira Code',monospace";

// //   return (
// //     <div
// //       ref={pageRef}
// //       style={{
// //         position: "fixed",
// //         inset: 0,
// //         width: "100vw",
// //         height: "100dvh",
// //         background: "#060b18",
// //         display: "flex",
// //         alignItems: "center",
// //         justifyContent: "center",
// //         overflow: "hidden",
// //         fontFamily: MONO,
// //         cursor: "none",
// //       }}
// //     >
// //       {/* grid */}
// //       <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(56,130,246,0.07) 1px,transparent 1px),linear-gradient(90deg,rgba(56,130,246,0.07) 1px,transparent 1px)", backgroundSize: "28px 28px", pointerEvents: "none" }} />

// //       {/* PCB canvas */}
// //       <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />

// //       {/* content - centered both axes, scales with viewport */}
// //       <div
// //         style={{
// //           position: "relative",
// //           zIndex: 1,
// //           textAlign: "center",
// //           width: "min(92vw, 480px)",
// //           maxHeight: "92vh",
// //           margin: "0 auto",
// //           padding: "clamp(0.5rem, 2vh, 1.5rem) clamp(1rem, 3vw, 2rem)",
// //           pointerEvents: "none",
// //           display: "flex",
// //           flexDirection: "column",
// //           alignItems: "center",
// //           justifyContent: "center",
// //           gap: "clamp(14px, 2.4vh, 22px)",
// //         }}
// //       >
// //         {/* badge */}
// //         <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "clamp(5px,0.9vh,7px) clamp(14px,2.6vw,18px)", border: "0.5px solid rgba(234,179,8,0.55)", borderRadius: 8, color: "#EAB308", fontSize: "clamp(12px,1.7vw,14px)", background: "rgba(234,179,8,0.07)" }}>
// //           <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#EAB308", display: "inline-block", animation: "pcbPulse 1.5s ease-in-out infinite" }} />
// //           build_status: in_progress
// //         </div>

// //         <div style={{ width: "100%" }}>
// //           <h1 style={{ color: "#E8F1FF", fontSize: "clamp(38px, 7.2vw, 60px)", fontWeight: 500, margin: "0 0 clamp(8px,1.4vh,12px)", letterSpacing: "0.5px", fontFamily: MONO, lineHeight: 1.15, display: "flex", alignItems: "baseline", justifyContent: "center", width: "100%" }}>
// //             <span>{typed}</span>
// //             <span style={{ color: "#EAB308", opacity: cursorOn ? 1 : 0, transition: "opacity 0.1s", width: "0.55ch", display: "inline-block", textAlign: "left" }}>_</span>
// //           </h1>

// //           <p style={{ color: "#3a5070", fontSize: "clamp(14px, 1.9vw, 17px)", margin: 0, fontFamily: MONO }}>
// //             we're deploying something new. check back soon.
// //           </p>
// //         </div>

// //         {/* progress */}
// //         <div style={{ width: "100%", maxWidth: 440 }}>
// //           <div style={{ display: "flex", justifyContent: "space-between", fontSize: "clamp(12px,1.6vw,14px)", color: "#378ADD", marginBottom: 6 }}>
// //             <span>compiling assets</span>
// //             <span style={{ color: "#EAB308" }}>{Math.round(progress)}%</span>
// //           </div>
// //           <div style={{ height: "clamp(7px,1.1vh,9px)", background: "#0d1525", borderRadius: 4, overflow: "hidden", border: "0.5px solid rgba(56,130,246,0.15)", position: "relative" }}>
// //             <div style={{
// //               height: "100%",
// //               width: `${Math.round(progress)}%`,
// //               borderRadius: 4,
// //               background: "repeating-linear-gradient(45deg,#185FA5,#185FA5 8px,#378ADD 8px,#378ADD 16px)",
// //               transition: noTransition ? "none" : "width 0.4s linear",
// //               position: "relative",
// //             }}>
// //               <div style={{ position: "absolute", right: -1, top: "50%", transform: "translateY(-50%)", width: 7, height: 7, borderRadius: "50%", background: "#EAB308" }} />
// //             </div>
// //           </div>
// //         </div>

// //         {/* terminal */}
// //         <div style={{ width: "100%", maxWidth: 440, textAlign: "left", background: "rgba(8,14,28,0.85)", border: "0.5px solid rgba(56,130,246,0.18)", borderRadius: 8, padding: "clamp(10px,1.6vh,13px) clamp(14px,2.4vw,16px)", fontSize: "clamp(12px,1.6vw,13.5px)", color: "#378ADD", minHeight: "clamp(72px,11vh,90px)", fontFamily: MONO }}>
// //           {logs.map((line, i) => (
// //             <div key={i} style={{ padding: "2px 0", color: line.t === "wait" ? "#EAB308" : "#378ADD" }}>
// //               {line.s}
// //             </div>
// //           ))}
// //         </div>
// //       </div>

// //       <style>{`
// //         html, body { margin:0; padding:0; height:100%; overflow:hidden; }
// //         @keyframes pcbPulse{0%,100%{opacity:1}50%{opacity:0.4}}
// //       `}</style>
// //     </div>
// //   );
// // }


// //
// //
// //
// //
// ///
// //
// //

// // import { useState, useEffect, useRef } from "react";

// // const FULL_TEXT = "under_construction";
// // const LOG_LINES = [
// //   { t: "", s: "$ npm run build" },
// //   { t: "", s: "[ok] resolving dependencies" },
// //   { t: "", s: "[ok] bundling modules" },
// //   { t: "", s: "[ok] optimizing assets" },
// //   { t: "wait", s: "[..] deploying to edge" },
// //   { t: "", s: "[ok] cache warmed" },
// //   { t: "wait", s: "[..] running final checks" },
// // ];

// // const SNAP = 36;
// // const TAIL_LEN = 20;

// // export default function UnderConstruction() {
// //   const [typed, setTyped] = useState("");
// //   const [cursorOn, setCursorOn] = useState(true);
// //   const [progress, setProgress] = useState(0);
// //   const [noTransition, setNoTransition] = useState(false);
// //   const [logs, setLogs] = useState([LOG_LINES[0]]);

// //   const canvasRef = useRef(null);
// //   const pageRef = useRef(null);
// //   const rafRef = useRef(null);
// //   const stateRef = useRef({
// //     mouse: { x: -999, y: -999 },
// //     cursor: { x: -999, y: -999 },
// //     tail: Array.from({ length: TAIL_LEN }, () => ({ x: -999, y: -999 })),
// //     tailHead: 0,
// //     speed: 0,
// //     nodes: [],
// //     edges: [],
// //     pulses: [],
// //     pathCache: new Map(),
// //     logIdx: 1,
// //   });

// //   // typing effect
// //   useEffect(() => {
// //     let i = 0;
// //     const id = setInterval(() => {
// //       i += 1;
// //       setTyped(FULL_TEXT.slice(0, i));
// //       if (i >= FULL_TEXT.length) clearInterval(id);
// //     }, 70);
// //     return () => clearInterval(id);
// //   }, []);

// //   // blinking cursor
// //   useEffect(() => {
// //     const id = setInterval(() => setCursorOn((v) => !v), 500);
// //     return () => clearInterval(id);
// //   }, []);

// //   // progress bar
// //   useEffect(() => {
// //     const id = setInterval(() => {
// //       setProgress((p) => {
// //         if (p >= 100) return p;
// //         return Math.min(100, p + Math.random() * 4 + 0.5);
// //       });
// //     }, 600);
// //     return () => clearInterval(id);
// //   }, []);

// //   useEffect(() => {
// //     if (progress < 100) return;
// //     const t = setTimeout(() => {
// //       setNoTransition(true);
// //       setProgress(0);
// //       rafRef.current = requestAnimationFrame(() => {
// //         rafRef.current = requestAnimationFrame(() => setNoTransition(false));
// //       });
// //     }, 400);
// //     return () => {
// //       clearTimeout(t);
// //       if (rafRef.current) cancelAnimationFrame(rafRef.current);
// //     };
// //   }, [progress]);

// //   // log rotation
// //   useEffect(() => {
// //     const id = setInterval(() => {
// //       const st = stateRef.current;
// //       const line = LOG_LINES[st.logIdx % LOG_LINES.length];
// //       st.logIdx++;
// //       setLogs((prev) => {
// //         const next = [...prev, line];
// //         return next.length > 4 ? next.slice(-4) : next;
// //       });
// //     }, 1400);
// //     return () => clearInterval(id);
// //   }, []);

// //   // canvas: PCB + cursor
// //   useEffect(() => {
// //     const canvas = canvasRef.current;
// //     const page = pageRef.current;
// //     if (!canvas || !page) return;
// //     const ctx = canvas.getContext("2d");
// //     const st = stateRef.current;

// //     function build(W, H) {
// //       st.nodes = [];
// //       st.edges = [];
// //       st.pulses = [];
// //       st.pathCache.clear();
// //       const cols = Math.floor(W / SNAP) + 1;
// //       const rows = Math.floor(H / SNAP) + 1;
// //       for (let r = 0; r < rows; r++) {
// //         for (let c = 0; c < cols; c++) {
// //           if (Math.random() < 0.22) {
// //             const x = c * SNAP;
// //             const y = r * SNAP;
// //             st.nodes.push({ x, y, base: { x, y }, gold: Math.random() < 0.1, size: Math.random() < 0.15 ? 2.8 : 1.6 });
// //           }
// //         }
// //       }
// //       st.nodes.forEach((n, i) => {
// //         const sorted = st.nodes
// //           .filter((_, j) => j !== i)
// //           .sort((a, b) => Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(b.x - n.x, b.y - n.y));
// //         sorted.slice(0, Math.floor(Math.random() * 2) + 1).forEach((m) => {
// //           if (Math.hypot(m.x - n.x, m.y - n.y) > SNAP * 4) return;
// //           if (st.edges.find((e) => (e.a === n && e.b === m) || (e.a === m && e.b === n))) return;
// //           st.edges.push({ a: n, b: m, gold: n.gold && m.gold });
// //         });
// //       });
// //       st.edges.forEach((e) => {
// //         if (Math.random() < 0.35) spawnPulse(e);
// //       });
// //     }

// //     function getPath(a, b) {
// //       return Math.random() < 0.5
// //         ? [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }]
// //         : [{ x: a.x, y: a.y }, { x: a.x, y: b.y }, { x: b.x, y: b.y }];
// //     }

// //     function getCachedPath(e) {
// //       if (!st.pathCache.has(e)) st.pathCache.set(e, getPath(e.a, e.b));
// //       return st.pathCache.get(e);
// //     }

// //     function ptAlong(pts, t) {
// //       const segs = pts.slice(0, -1).map((p, i) => ({ len: Math.hypot(pts[i + 1].x - p.x, pts[i + 1].y - p.y), i }));
// //       const total = segs.reduce((s, x) => s + x.len, 0);
// //       if (!total) return pts[0];
// //       let d = t * total;
// //       for (const seg of segs) {
// //         if (d <= seg.len) {
// //           const f = d / seg.len;
// //           return { x: pts[seg.i].x + (pts[seg.i + 1].x - pts[seg.i].x) * f, y: pts[seg.i].y + (pts[seg.i + 1].y - pts[seg.i].y) * f };
// //         }
// //         d -= seg.len;
// //       }
// //       return pts[pts.length - 1];
// //     }

// //     function spawnPulse(e) {
// //       if (st.pulses.length >= 28) return;
// //       st.pulses.push({ edge: e, t: Math.random(), speed: 0.003 + Math.random() * 0.003, gold: e.gold || Math.random() < 0.07, rev: Math.random() < 0.5 });
// //     }

// //     function drawEdge(path, alpha, gold) {
// //       ctx.beginPath();
// //       ctx.moveTo(path[0].x, path[0].y);
// //       for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
// //       ctx.strokeStyle = gold ? `rgba(234,179,8,${alpha})` : `rgba(56,130,246,${alpha})`;
// //       ctx.lineWidth = 0.7;
// //       ctx.lineJoin = "round";
// //       ctx.stroke();
// //     }

// //     let W, H;

// //     function resize() {
// //       const r = page.getBoundingClientRect();
// //       W = canvas.width = r.width || window.innerWidth;
// //       H = canvas.height = r.height || window.innerHeight;
// //       build(W, H);
// //     }

// //     function onMouseMove(e) {
// //       const r = page.getBoundingClientRect();
// //       st.mouse.x = e.clientX - r.left;
// //       st.mouse.y = e.clientY - r.top;
// //     }
// //     function onMouseLeave() {
// //       st.mouse.x = -999;
// //       st.mouse.y = -999;
// //     }

// //     page.addEventListener("mousemove", onMouseMove);
// //     page.addEventListener("mouseleave", onMouseLeave);

// //     let animId;
// //     function frame() {
// //       ctx.clearRect(0, 0, W, H);
// //       const hasMouse = st.mouse.x > 0;

// //       // smooth cursor
// //       if (hasMouse) {
// //         const px = st.cursor.x === -999 ? st.mouse.x : st.cursor.x;
// //         const py = st.cursor.y === -999 ? st.mouse.y : st.cursor.y;
// //         st.cursor.x = px + (st.mouse.x - px) * 0.18;
// //         st.cursor.y = py + (st.mouse.y - py) * 0.18;
// //         st.speed = Math.hypot(st.cursor.x - px, st.cursor.y - py);
// //       } else {
// //         st.speed *= 0.8;
// //         st.cursor.x = -999;
// //         st.cursor.y = -999;
// //       }

// //       // push tail buffer
// //       st.tail[st.tailHead] = { x: st.cursor.x, y: st.cursor.y };
// //       st.tailHead = (st.tailHead + 1) % TAIL_LEN;

// //       // cursor glow
// //       if (hasMouse) {
// //         const gr = ctx.createRadialGradient(st.cursor.x, st.cursor.y, 0, st.cursor.x, st.cursor.y, 140);
// //         gr.addColorStop(0, "rgba(56,130,246,0.045)");
// //         gr.addColorStop(1, "transparent");
// //         ctx.fillStyle = gr;
// //         ctx.fillRect(0, 0, W, H);
// //       }

// //       // node repulsion
// //       st.nodes.forEach((n) => {
// //         if (hasMouse) {
// //           const dx = st.cursor.x - n.base.x;
// //           const dy = st.cursor.y - n.base.y;
// //           const dist = Math.hypot(dx, dy);
// //           const force = Math.max(0, 1 - dist / 90);
// //           const ang = Math.atan2(dy, dx);
// //           n.x += (n.base.x - Math.cos(ang) * force * 12 - n.x) * 0.1;
// //           n.y += (n.base.y - Math.sin(ang) * force * 12 - n.y) * 0.1;
// //         } else {
// //           n.x += (n.base.x - n.x) * 0.06;
// //           n.y += (n.base.y - n.y) * 0.06;
// //         }
// //       });

// //       // PCB edges
// //       st.edges.forEach((e) => {
// //         const path = getCachedPath(e);
// //         const midX = (e.a.x + e.b.x) / 2;
// //         const midY = (e.a.y + e.b.y) / 2;
// //         const dist = hasMouse ? Math.hypot(st.cursor.x - midX, st.cursor.y - midY) : 999;
// //         const boost = hasMouse ? Math.max(0, 1 - dist / 150) * 0.2 : 0;
// //         drawEdge(path, (e.gold ? 0.18 : 0.08) + boost, e.gold);
// //       });

// //       // nodes
// //       st.nodes.forEach((n) => {
// //         const dist = hasMouse ? Math.hypot(st.cursor.x - n.x, st.cursor.y - n.y) : 999;
// //         const near = hasMouse && dist < 80;
// //         ctx.beginPath();
// //         ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
// //         ctx.fillStyle = near
// //           ? n.gold ? "rgba(234,179,8,1)" : "rgba(56,130,246,0.95)"
// //           : n.gold ? "rgba(234,179,8,0.55)" : "rgba(56,130,246,0.35)";
// //         ctx.fill();
// //         ctx.beginPath();
// //         ctx.arc(n.x, n.y, n.size + (near ? 4 : 2), 0, Math.PI * 2);
// //         ctx.strokeStyle = near
// //           ? n.gold ? "rgba(234,179,8,0.35)" : "rgba(56,130,246,0.3)"
// //           : n.gold ? "rgba(234,179,8,0.12)" : "rgba(56,130,246,0.1)";
// //         ctx.lineWidth = 0.7;
// //         ctx.stroke();
// //       });

// //       // pulses
// //       for (let pi = st.pulses.length - 1; pi >= 0; pi--) {
// //         const p = st.pulses[pi];
// //         p.t += p.speed * (hasMouse ? 1.4 : 1);
// //         if (p.t >= 1) {
// //           p.t = 0;
// //           if (Math.random() < 0.12) { st.pulses.splice(pi, 1); continue; }
// //         }
// //         const path = getCachedPath(p.edge);
// //         const t = p.rev ? 1 - p.t : p.t;
// //         const pos = ptAlong(path, t);
// //         const tailT = Math.max(0, t - 0.14);
// //         for (let s = 0; s < 8; s++) {
// //           const tf = tailT + (t - tailT) * (s / 8);
// //           const tp = ptAlong(path, tf);
// //           const frac = s / 8;
// //           ctx.beginPath();
// //           ctx.arc(tp.x, tp.y, 0.9, 0, Math.PI * 2);
// //           ctx.fillStyle = p.gold ? `rgba(234,179,8,${frac * 0.3})` : `rgba(56,130,246,${frac * 0.3})`;
// //           ctx.fill();
// //         }
// //         ctx.beginPath();
// //         ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
// //         ctx.fillStyle = p.gold ? "rgba(234,179,8,1)" : "rgba(56,130,246,1)";
// //         ctx.fill();
// //         ctx.beginPath();
// //         ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
// //         ctx.fillStyle = p.gold ? "rgba(234,179,8,0.2)" : "rgba(56,130,246,0.2)";
// //         ctx.fill();
// //       }

// //       // random new pulses
// //       if (Math.random() < 0.008 && st.edges.length) {
// //         spawnPulse(st.edges[Math.floor(Math.random() * st.edges.length)]);
// //       }

// //       // comet cursor
// //       if (hasMouse && st.cursor.x > 0) {
// //         const tailLen = Math.min(TAIL_LEN - 1, Math.floor(st.speed * 2.5 + 4));
// //         const pts = [];
// //         for (let i = 0; i < tailLen; i++) {
// //           const idx = (st.tailHead - 1 - i + TAIL_LEN) % TAIL_LEN;
// //           const pt = st.tail[idx];
// //           if (pt.x > 0) pts.push(pt);
// //         }
// //         if (pts.length > 1) {
// //           for (let i = 1; i < pts.length; i++) {
// //             const frac = 1 - i / pts.length;
// //             ctx.beginPath();
// //             ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
// //             ctx.lineTo(pts[i].x, pts[i].y);
// //             ctx.strokeStyle = `rgba(234,179,8,${frac * frac * 0.6})`;
// //             ctx.lineWidth = frac * 2.5;
// //             ctx.lineCap = "round";
// //             ctx.stroke();
// //           }
// //         }
// //         // star head
// //         ctx.beginPath();
// //         ctx.arc(st.cursor.x, st.cursor.y, 2.5, 0, Math.PI * 2);
// //         ctx.fillStyle = "rgba(234,179,8,1)";
// //         ctx.fill();
// //         ctx.beginPath();
// //         ctx.arc(st.cursor.x, st.cursor.y, 5, 0, Math.PI * 2);
// //         ctx.fillStyle = "rgba(234,179,8,0.18)";
// //         ctx.fill();
// //       }

// //       animId = requestAnimationFrame(frame);
// //     }

// //     resize();
// //     frame();
// //     window.addEventListener("resize", resize);

// //     return () => {
// //       cancelAnimationFrame(animId);
// //       window.removeEventListener("resize", resize);
// //       page.removeEventListener("mousemove", onMouseMove);
// //       page.removeEventListener("mouseleave", onMouseLeave);
// //     };
// //   }, []);

// //   const MONO = "'JetBrains Mono','SF Mono','Fira Code',monospace";

// //   return (
// //     <div
// //       ref={pageRef}
// //       style={{
// //         position: "fixed",
// //         inset: 0,
// //         width: "100vw",
// //         height: "100dvh",
// //         background: "#060b18",
// //         display: "flex",
// //         alignItems: "center",
// //         justifyContent: "center",
// //         overflow: "hidden",
// //         fontFamily: MONO,
// //         cursor: "none",
// //       }}
// //     >
// //       {/* grid */}
// //       <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(56,130,246,0.07) 1px,transparent 1px),linear-gradient(90deg,rgba(56,130,246,0.07) 1px,transparent 1px)", backgroundSize: "28px 28px", pointerEvents: "none" }} />

// //       {/* PCB canvas */}
// //       <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />

// //       {/* content - centered both axes, scales with viewport */}
// //       <div
// //         style={{
// //           position: "relative",
// //           zIndex: 1,
// //           textAlign: "center",
// //           width: "min(90vw, 480px)",
// //           maxHeight: "92vh",
// //           margin: "0 auto",
// //           padding: "clamp(0.5rem, 2vh, 1.5rem) clamp(1rem, 3vw, 2rem)",
// //           pointerEvents: "none",
// //           display: "flex",
// //           flexDirection: "column",
// //           alignItems: "center",
// //           justifyContent: "center",
// //           gap: "clamp(14px, 2.4vh, 22px)",
// //         }}
// //       >
// //         {/* badge */}
// //         <div className="ucBadge" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "clamp(5px,0.9vh,7px) clamp(14px,2.6vw,18px)", border: "0.5px solid rgba(234,179,8,0.55)", borderRadius: 8, color: "#EAB308", fontSize: "clamp(13px,1.9vw,16px)", background: "rgba(234,179,8,0.07)", pointerEvents: "auto", cursor: "default" }}>
// //           <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#EAB308", display: "inline-block", animation: "pcbPulse 1.5s ease-in-out infinite" }} />
// //           build_status: in_progress
// //         </div>

// //         <div style={{ width: "100%" }}>
// //           <h1 style={{ color: "#E8F1FF", fontSize: "clamp(42px, 8vw, 68px)", fontWeight: 500, margin: "0 0 clamp(8px,1.4vh,12px)", letterSpacing: "0.5px", fontFamily: MONO, lineHeight: 1.15, display: "flex", alignItems: "baseline", justifyContent: "center", width: "100%" }}>
// //             <span>{typed}</span>
// //             <span style={{ color: "#EAB308", opacity: cursorOn ? 1 : 0, transition: "opacity 0.1s", width: "0.55ch", display: "inline-block", textAlign: "left" }}>_</span>
// //           </h1>

// //           <p style={{ color: "#3a5070", fontSize: "clamp(15px, 2.1vw, 19px)", margin: 0, fontFamily: MONO, overflowWrap: "break-word" }}>
// //             we're deploying something new. check back soon.
// //           </p>
// //         </div>

// //         {/* progress */}
// //         <div style={{ width: "100%", maxWidth: 440 }}>
// //           <div style={{ display: "flex", justifyContent: "space-between", fontSize: "clamp(13px,1.8vw,16px)", color: "#378ADD", marginBottom: 6 }}>
// //             <span>compiling assets</span>
// //             <span style={{ color: "#EAB308" }}>{Math.round(progress)}%</span>
// //           </div>
// //           <div style={{ height: "clamp(7px,1.1vh,9px)", background: "#0d1525", borderRadius: 4, overflow: "hidden", border: "0.5px solid rgba(56,130,246,0.15)", position: "relative" }}>
// //             <div style={{
// //               height: "100%",
// //               width: `${Math.round(progress)}%`,
// //               borderRadius: 4,
// //               background: "repeating-linear-gradient(45deg,#185FA5,#185FA5 8px,#378ADD 8px,#378ADD 16px)",
// //               transition: noTransition ? "none" : "width 0.4s linear",
// //               position: "relative",
// //             }}>
// //               <div style={{ position: "absolute", right: -1, top: "50%", transform: "translateY(-50%)", width: 7, height: 7, borderRadius: "50%", background: "#EAB308" }} />
// //             </div>
// //           </div>
// //         </div>

// //         {/* terminal */}
// //         <div style={{ width: "100%", maxWidth: 440, textAlign: "left", background: "rgba(8,14,28,0.85)", border: "0.5px solid rgba(56,130,246,0.18)", borderRadius: 8, padding: "clamp(10px,1.6vh,13px) clamp(14px,2.4vw,16px)", fontSize: "clamp(13px,1.8vw,15px)", color: "#378ADD", minHeight: "clamp(72px,11vh,90px)", fontFamily: MONO, overflowWrap: "break-word" }}>
// //           {logs.map((line, i) => (
// //             <div key={i} style={{ padding: "2px 0", color: line.t === "wait" ? "#EAB308" : "#378ADD" }}>
// //               {line.s}
// //             </div>
// //           ))}
// //         </div>
// //       </div>

// //       <style>{`
// //         html, body { margin:0; padding:0; height:100%; overflow:hidden; }
// //         @keyframes pcbPulse{0%,100%{opacity:1}50%{opacity:0.4}}
// //         .ucBadge {
// //           will-change: transform, box-shadow, border-color;
// //           transition: transform 0.25s cubic-bezier(0.22,1,0.36,1),
// //                       box-shadow 0.25s cubic-bezier(0.22,1,0.36,1),
// //                       border-color 0.25s ease,
// //                       background-color 0.25s ease;
// //         }
// //         .ucBadge:hover {
// //           transform: scale(1.045);
// //           border-color: rgba(234,179,8,0.9);
// //           background: rgba(234,179,8,0.12);
// //           box-shadow: 0 0 0 1px rgba(234,179,8,0.15), 0 6px 24px rgba(234,179,8,0.18);
// //         }
// //         @media (max-width: 420px) {
// //           .ucBadge { white-space: nowrap; }
// //         }
// //       `}</style>
// //     </div>
// //   );
// // }