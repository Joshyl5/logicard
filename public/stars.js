/* Reusable twinkling star canvas — attach to any canvas#stars element */
(function () {
  const canvas = document.getElementById('stars');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let stars  = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  class Star {
    constructor() { this.reset(); }
    reset() {
      this.x     = Math.random() * canvas.width;
      this.y     = Math.random() * canvas.height;
      this.r     = Math.random() * 1.6 + 0.2;
      this.alpha = Math.random() * 0.7 + 0.1;
      this.speed = Math.random() * 0.008 + 0.002;
      this.phase = Math.random() * Math.PI * 2;
    }
    draw(t) {
      const tw = this.alpha * (0.6 + 0.4 * Math.sin(t * this.speed * 60 + this.phase));
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,225,255,${tw})`;
      ctx.fill();
    }
  }

  function init() {
    resize();
    const count = Math.floor((canvas.width * canvas.height) / 5000);
    stars = Array.from({ length: count }, () => new Star());
  }

  function loop(t) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => s.draw(t));
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', init);
  init();
  requestAnimationFrame(loop);
})();
