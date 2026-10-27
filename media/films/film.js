// Macoma film engine. A film is HTML built from the helpers below; every element carries
// its timing (data-in / data-out, in seconds) and Film.render(t) draws the exact frame for
// time t. Open a film in a browser to preview it; media/render.mjs captures it frame by
// frame (?capture) and encodes the video, with UI sounds from the data-sfx markers.
(() => {
  const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeOutQuart = (x) => 1 - Math.pow(1 - x, 4);
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const easeBack = (x) => { const c = 1.5; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const at = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `data-${k}='${typeof v === "string" ? v : JSON.stringify(v)}'`).join(" ");
  const MARK = "../../public/brand/mark.svg";

  // --- building blocks ----------------------------------------------------------------------
  const F = {
    MARK,
    at,
    fields: (colors, dur) =>
      `<div class="fields">${colors
        .map((c, i) => {
          const [x, y, s] = [[-260, -220, 1000], [1180, 120, 900], [200, 640, 820], [1300, 640, 760], [700, -300, 700]][i % 5];
          const kf = [[0, { x: 0, y: 0, s: 1 }], [dur, { x: (i % 2 ? -1 : 1) * 160, y: (i % 3 ? 1 : -1) * 110, s: 1.12 }]];
          const big = s * 1.5, off = (big - s) / 2;
          return `<i style="left:${x - off}px;top:${y - off}px;width:${big}px;height:${big}px;background:radial-gradient(closest-side, ${c} 0%, ${c}cc 35%, ${c}00 100%)" ${at({ kf })}></i>`;
        })
        .join("")}</div>`,

    // Big words that blur-rise in one by one.
    kin: (text, { t, out, y = 430, cls = "", gap = 0.09 }) => {
      let i = 0;
      const words = text.split(/(\s+|\n)/).map((w) => {
        if (w === "\n") return "<br>";
        if (/^\s+$/.test(w)) return " ";
        const soft = w.startsWith("~");
        return `<span class="w${soft ? " soft" : ""}" ${at({ in: t + i++ * gap, out, fx: "word", d: 0.7 })}>${esc(soft ? w.slice(1) : w)}</span>`;
      });
      return `<div class="kin ${cls}" style="top:${y}px">${words.join("")}</div>`;
    },

    time: (text, { x, y, t, out }) => `<div class="time-tag" style="left:${x}px;top:${y}px" ${at({ in: t, out, fx: "up" })}>${esc(text)}</div>`,

    cap: ({ h, p, tag, x, y, t, out }) =>
      `<div class="cap" style="left:${x}px;top:${y}px">${tag ? `<span class="tag glass" ${at({ in: t, out, fx: "up" })}>${esc(tag)}</span>` : ""}<h2 ${at({ in: t + 0.1, out, fx: "up" })}>${h}</h2>${p ? `<p ${at({ in: t + 0.3, out, fx: "up" })}>${p}</p>` : ""}</div>`,

    // An iPhone. `kf` moves it: [[time, {x, y, s, ry, rz, o}], ...]
    phone: ({ kf, content, dark = false, time = "9:41" }) =>
      `<div class="phone" ${at({ kf })}><div class="screen">${content}<div class="island"></div>
        <div class="sbar" style="color:${dark ? "#fff" : "#111"}"><span>${time}</span><span class="icons"><b style="height:5px"></b><b style="height:7px"></b><b style="height:9px"></b><b style="height:11px"></b><span class="batt"><i></i></span></span></div></div></div>`,

    header: (name = "Macoma", face = "biz") => `<div class="hdr"><span class="back"></span><span data-face="${face}" data-size="46"></span><span class="name">${esc(name)} ›</span></div>`,

    // Messages. Items: ["me"|"it", text, t] · ["typing", t, tEnd] · ["meta", text, t] ·
    // ["draft", {to, text, yes}, t] · ["inv", {...}, t] · ["day", text, t]
    thread: (items, { out } = {}) =>
      `<div class="thread" ${at({ in: 0, out, fx: "fade" })}>${items
        .map(([kind, a, b]) => {
          if (kind === "typing") return `<div class="msg it" ${at({ in: a, out: b, fx: "msg" })}><div><span class="typing"><i></i><i></i><i></i></span></div></div>`;
          if (kind === "meta") return `<div class="msg" ${at({ in: b, fx: "msg" })}><div class="meta">${esc(a)}</div></div>`;
          if (kind === "day") return `<div class="msg" ${at({ in: b, fx: "msg" })}><div class="meta c">${esc(a)}</div></div>`;
          if (kind === "draft")
            return `<div class="msg it" ${at({ in: b, fx: "msg", sfx: "recv" })}><div><div class="draft"><div class="to">${esc(a.to)}</div>${esc(a.text)}${a.yes !== false ? `<div class="yes">Reply YES to send</div>` : ""}</div></div></div>`;
          if (kind === "inv")
            return `<div class="msg it" ${at({ in: b, fx: "msg", sfx: "recv" })}><div><div class="inv"><div class="row"><span>${esc(a.num)}</span><span>${esc(a.due)}</span></div><div class="amt">${esc(a.amount)}</div><div class="row"><span>${esc(a.to)}</span><span>${esc(a.what)}</span></div><div class="ap">Pay with Apple Pay</div></div></div></div>`;
          return `<div class="msg ${kind}" ${at({ in: b, fx: "msg", sfx: kind === "me" ? "send" : "recv" })}><div><div class="b">${esc(a)}</div></div></div>`;
        })
        .join("")}</div>`,

    // The text field. Segments: [start, sendAt, text]
    inbar: (segments) => `<div class="inbar"><span class="plus">+</span><span class="field" ${at({ typing: segments })}></span></div>`,

    lock: ({ date, clock, t = 0, out, wall }) =>
      `<div class="lock" style="background:${wall}" ${at({ in: t, out, fx: "fade", d: 0.6 })}><div class="date">${esc(date)}</div><div class="clock">${esc(clock)}</div></div>`,

    notif: ({ title, when = "now", msg, t, out, y = 300, icon }) =>
      `<div class="notif" style="top:${y}px" ${at({ in: t, out, fx: "drop", sfx: "notify" })}><span class="ic">${icon || `<img src="${MARK}" alt="">`}</span><span class="t">${esc(title)}<span>${esc(when)}</span></span><span class="m">${esc(msg)}</span></div>`,

    // Connections: tiles around a hub, linked by lines that draw in, with data flowing in.
    hub: ({ cx = 960, cy = 520, rx = 560, ry = 300, tiles, t, out, start = -90 }) => {
      const pos = tiles.map((tile, i) => {
        const ang = ((start + (360 / tiles.length) * i) * Math.PI) / 180;
        return { ...tile, x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang), i };
      });
      const lines = pos.map((p) => `<path d="M${p.x.toFixed(1)} ${p.y.toFixed(1)} L${cx} ${cy}" ${at({ in: t + 0.5 + p.i * 0.12, out, fx: "draw", d: 0.8 })}/>`).join("");
      const flows = pos.map((p) => `<span class="flow" ${at({ in: t + 1.4 + p.i * 0.12, out, fx: "flow", from: [p.x, p.y], to: [cx, cy], phase: p.i * 0.23 })}></span>`).join("");
      const tilesHtml = pos
        // Tiles above the hub put their label above the icon, so the link line never crosses it.
        .map((p) => `<div class="tile${p.y < cy - 20 ? " up" : ""}" style="left:${p.x - 95}px;${p.y < cy - 20 ? `bottom:${1080 - p.y - 59}px` : `top:${p.y - 59}px`}" ${at({ in: t + 0.3 + p.i * 0.12, out, fx: "pop", sfx: "tick" })}><div class="sq" style="background:${p.color}">${p.icon || esc(p.letter)}</div><span>${esc(p.name)}</span>${p.note ? `<em>${esc(p.note)}</em>` : ""}</div>`)
        .join("");
      return `<svg class="links">${lines}</svg>${flows}<div class="hub glass" style="left:${cx - 105}px;top:${cy - 105}px" ${at({ in: t, out, fx: "pop" })}><img src="${MARK}" alt=""></div>${tilesHtml}`;
    },

    end: ({ t, tagline, sub = "Join the waitlist · macoma.app" }) =>
      `<div class="end"><div class="card glass" ${at({ in: t, fx: "pop", d: 0.8 })}><img class="mark" src="${MARK}" alt=""><div class="faces"><span data-face="biz" data-size="70"></span><span data-face="fol" data-size="70"></span><span data-face="voi" data-size="70"></span></div><div class="word">macoma</div><div class="tagline">${tagline}</div><div class="cta">${esc(sub)}</div><div class="fine">Coming soon. Concept demo; details may change. Apple Pay is a trademark of Apple Inc.</div></div></div>`,
  };

  // --- drawing a frame ------------------------------------------------------------------
  let items = [], kfs = [], typers = [], flows = [], heights = new Map(), dots = [];
  function prepare() {
    window.MacomaFaces?.paint();
    items = [...document.querySelectorAll("[data-in]")];
    kfs = [...document.querySelectorAll("[data-kf]")].map((el) => ({ el, keys: JSON.parse(el.dataset.kf) }));
    typers = [...document.querySelectorAll("[data-typing]")].map((el) => ({ el, segs: JSON.parse(el.dataset.typing) }));
    dots = [...document.querySelectorAll(".typing")];
    for (const el of document.querySelectorAll('[data-fx="msg"]')) heights.set(el, el.offsetHeight);
    for (const el of document.querySelectorAll('[data-fx="draw"]')) { const L = el.getTotalLength(); el.dataset.len = L; el.style.strokeDasharray = `${L}`; }
  }

  function render(t) {
    for (const el of items) {
      const tin = +el.dataset.in, tout = el.dataset.out !== undefined ? +el.dataset.out : Infinity, d = +(el.dataset.d || 0.55);
      const a = clamp((t - tin) / d), b = clamp((t - tout) / d), ea = easeOut(a), eb = easeOut(b), v = ea * (1 - eb);
      const fx = el.dataset.fx;
      const s = el.style;
      if (fx === "msg") {
        const h = heights.get(el) || 0;
        const grow = easeOutQuart(clamp((t - tin) / 0.42));
        s.height = `${h * grow * (1 - eb)}px`;
        const inner = el.firstElementChild;
        inner.style.opacity = clamp((t - tin) / 0.22) * (1 - eb);
        inner.style.transform = `scale(${0.84 + 0.16 * easeBack(clamp((t - tin) / 0.45))})`;
        inner.style.transformOrigin = el.classList.contains("me") ? "100% 100%" : "0 100%";
        continue;
      }
      if (fx === "draw") { s.strokeDashoffset = `${+el.dataset.len * (1 - ea)}`; s.opacity = 1 - eb; continue; }
      if (fx === "flow") {
        const [x1, y1] = JSON.parse(el.dataset.from), [x2, y2] = JSON.parse(el.dataset.to);
        const f = ((t - tin) * 0.5 + +el.dataset.phase) % 1;
        s.left = `${x1 + (x2 - x1) * f}px`; s.top = `${y1 + (y2 - y1) * f}px`;
        s.opacity = t < tin ? 0 : Math.sin(Math.PI * f) * (1 - eb) * clamp((t - tin) / 0.4);
        continue;
      }
      s.opacity = v;
      s.visibility = v <= 0.001 ? "hidden" : "visible";
      if (fx === "up") s.transform = `translateY(${(1 - ea) * 46 - eb * 24}px)`;
      else if (fx === "pop") s.transform = `scale(${0.88 + 0.12 * easeBack(a)})`;
      else if (fx === "drop") s.transform = `translateY(${(1 - ea) * -80}px) scale(${0.96 + 0.04 * ea})`;
      else if (fx === "press") { const k = clamp((t - tin) / 0.3); s.opacity = 1; s.visibility = "visible"; s.transform = `scale(${1 - 0.07 * Math.sin(Math.PI * k)})`; }
      else if (fx === "word") { s.transform = `translateY(${(1 - ea) * 0.35}em)`; s.filter = `blur(${(1 - ea) * 14 + eb * 10}px)`; }
    }
    for (const { el, keys } of kfs) {
      let k = 0;
      while (k < keys.length - 1 && t > keys[k + 1][0]) k++;
      const [t0, a] = keys[k], [t1, b] = keys[Math.min(k + 1, keys.length - 1)];
      const p = t1 > t0 ? easeInOut(clamp((t - t0) / (t1 - t0))) : 1;
      const g = (n, dflt) => { const x = a[n] ?? dflt, y = b[n] ?? a[n] ?? dflt; return x + (y - x) * p; };
      el.style.transform = `translate(${g("x", 0)}px, ${g("y", 0)}px) perspective(2200px) rotateY(${g("ry", 0)}deg) rotateZ(${g("rz", 0)}deg) scale(${g("s", 1)})`;
      if (a.o !== undefined || b.o !== undefined) el.style.opacity = g("o", 1);
    }
    for (const { el, segs } of typers) {
      const seg = segs.find(([st, send]) => t >= st && t < send);
      if (!seg) { el.textContent = "Text Message"; el.classList.add("ph"); continue; }
      const [st, send, text] = seg;
      const n = Math.round(text.length * clamp((t - st) / Math.max(0.3, send - st - 0.35)));
      el.classList.remove("ph");
      el.innerHTML = `${esc(text.slice(0, n))}${Math.floor(t * 2.4) % 2 === 0 ? '<span class="caret"></span>' : ""}`;
    }
    for (const el of dots) [...el.children].forEach((d, i) => { d.style.transform = `translateY(${-4 * Math.max(0, Math.sin(t * 7 - i * 0.7))}px)`; });
  }

  // Sound cues for the renderer: [{t, kind}]
  const cues = () => [...document.querySelectorAll("[data-sfx]")].map((el) => ({ t: +el.dataset.in, kind: el.dataset.sfx })).sort((a, b) => a.t - b.t);

  function start(duration) {
    prepare();
    window.Film = { render, duration, cues, ready: true };
    if (new URLSearchParams(location.search).has("capture")) { render(0); return; }
    const t0 = performance.now();
    const loop = () => { render(((performance.now() - t0) / 1000) % duration); requestAnimationFrame(loop); };
    loop();
  }

  window.F = F;
  window.FilmStart = start;
})();
