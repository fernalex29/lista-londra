/* Neve che scende: fiocchi leggeri su canvas, ferma se l'utente preferisce meno animazioni */
(function () {
  const cv = document.getElementById("snow"), ctx = cv.getContext && cv.getContext("2d");
  if (!ctx) return;
  const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, flakes = [];
  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(110, W * H / 9000));
    while (flakes.length < n) flakes.push(make(true));
    flakes.length = n;
    if (still) draw();
  }
  function make(anywhere) {
    const r = Math.random() * 2.6 + .8;
    return { x: Math.random() * W, y: anywhere ? Math.random() * H : -6, r,
             vy: .35 + r * .32, vx: (Math.random() - .5) * .3, ph: Math.random() * 6.28, a: .45 + Math.random() * .5 };
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const f of flakes) {
      ctx.globalAlpha = f.a; ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  let last = 0;
  function tick(t) {
    const dt = Math.min(48, t - last || 16) / 16; last = t;
    for (const f of flakes) {
      f.ph += .012 * dt;
      f.y += f.vy * dt; f.x += (f.vx + Math.sin(f.ph) * .35) * dt;
      if (f.y > H + 6) Object.assign(f, make(false));
      if (f.x < -6) f.x = W + 6; else if (f.x > W + 6) f.x = -6;
    }
    draw();
    requestAnimationFrame(tick);
  }
  addEventListener("resize", size);
  size();
  if (!still) requestAnimationFrame(tick);
})();
