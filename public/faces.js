// The three assistants: solid-color faces, one expression each.
// <span data-face="biz|fol|voi" data-size="48"></span> is replaced with the SVG.
(() => {
  const FACES = {
    biz: { name: "Business Assistant", color: "var(--biz)", ink: "#1d1d1f",
      feat: '<circle cx="23" cy="27" r="4"/><circle cx="41" cy="27" r="4"/><path d="M19 38c3.5 7 22.5 7 26 0" fill="none" stroke-width="4" stroke-linecap="round"/>' },
    fol: { name: "Follow-up Assistant", color: "var(--fol)", ink: "#ffffff",
      feat: '<circle cx="23" cy="27" r="4"/><path d="M37 28c2-3 6-3 8 0" fill="none" stroke-width="4" stroke-linecap="round"/><path d="M20 39c4 6 20 6 24 0" fill="none" stroke-width="4" stroke-linecap="round"/>' },
    voi: { name: "Voice Assistant", color: "var(--voi)", ink: "#0b2a1a",
      feat: '<path d="M18 28c2-3 7-3 9 0M37 28c2-3 7-3 9 0" fill="none" stroke-width="3.6" stroke-linecap="round"/><ellipse cx="32" cy="41" rx="6" ry="7"/>' },
  };
  const svg = (k, size) => {
    const f = FACES[k];
    return `<svg class="face" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="${f.name}"><circle cx="32" cy="32" r="32" fill="${f.color}"/><circle cx="32" cy="32" r="31" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/><g fill="${f.ink}" stroke="${f.ink}">${f.feat}</g></svg>`;
  };
  window.MacomaFaces = { FACES, svg };
  const paint = (root = document) => root.querySelectorAll("[data-face]").forEach((el) => { el.outerHTML = svg(el.dataset.face, el.dataset.size || 40); });
  window.MacomaFaces.paint = paint;
  paint();
})();
