/**
 * AnalysisHUD — captured photo with polaroid frame + scanner line.
 */

const PHOTO_SIZE = 'min(55vh, 440px)';
const PHOTO_TOP = '38%';
const PAD = '12px'; // polaroid white border

export async function createAnalysisHUD(): Promise<{
  update: (time: number, dt: number) => void;
  setPhoto: (img: HTMLImageElement | HTMLCanvasElement) => void;
  show: () => void;
  hide: () => void;
  clear: () => void;
}> {
  // ─── Outer container (positions the whole thing) ────────────
  const outer = document.createElement('div');
  outer.id = 'lectura-photo';
  outer.style.cssText = `
    position: fixed;
    top: ${PHOTO_TOP};
    left: 50%;
    transform: translate(-50%, -50%);
    width: ${PHOTO_SIZE};
    height: ${PHOTO_SIZE};
    pointer-events: none;
    z-index: 600;
    opacity: 0;
    transition: opacity 0.8s ease;
    display: none;
  `;
  document.body.appendChild(outer);

  // ─── Polaroid border (white frame around photo) ─────────────
  const polaroid = document.createElement('div');
  polaroid.style.cssText = `
    position: absolute;
    inset: 0;
    background: rgba(255,255,255,0.92);
    padding: ${PAD};
    border-radius: 2px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  `;
  outer.appendChild(polaroid);

  // ─── Photo itself ───────────────────────────────────────────
  const imgEl = document.createElement('img');
  imgEl.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
    -webkit-transform: scaleX(-1);
    transform: scaleX(-1);
    display: block;
  `;
  polaroid.appendChild(imgEl);

  // ─── RGB glitch bounding box corners ────────────────────────
  // Red, Green, Blue offset ghost corners at different offsets
  const rgbColors = ['#ff0000', '#00ff00', '#0000ff'];
  const rgbOffsets = [[-3, 0], [1.5, 1.5], [1, -2]];

  for (let c = 0; c < 3; c++) {
    const ghost = document.createElement('div');
    ghost.style.cssText = `
      position: absolute;
      inset: ${-2 + rgbOffsets[c][0]}px;
      pointer-events: none;
      z-index: ${601 + c};
      opacity: 0;
      transition: opacity 0.5s ease;
    `;
    // 4 corner L-shapes using borders
    ghost.innerHTML = `
      <div style="position:absolute;top:0;left:0;width:28px;height:28px;border-top:2.5px solid ${rgbColors[c]};border-left:2.5px solid ${rgbColors[c]};"></div>
      <div style="position:absolute;top:0;right:0;width:28px;height:28px;border-top:2.5px solid ${rgbColors[c]};border-right:2.5px solid ${rgbColors[c]};"></div>
      <div style="position:absolute;bottom:0;left:0;width:28px;height:28px;border-bottom:2.5px solid ${rgbColors[c]};border-left:2.5px solid ${rgbColors[c]};"></div>
      <div style="position:absolute;bottom:0;right:0;width:28px;height:28px;border-bottom:2.5px solid ${rgbColors[c]};border-right:2.5px solid ${rgbColors[c]};"></div>
    `;
    (ghost as any)._rgbIdx = c;
    outer.appendChild(ghost);
  }

  // ─── Scanner line with glow ─────────────────────────────────
  const scanLine = document.createElement('div');
  scanLine.style.cssText = `
    position: absolute;
    left: ${PAD};
    right: ${PAD};
    height: 2px;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(255,255,255,0.3) 20%,
      rgba(255,255,255,0.9) 50%,
      rgba(255,255,255,0.3) 80%,
      transparent 100%
    );
    box-shadow:
      0 0 10px rgba(255,255,255,0.4),
      0 0 20px rgba(255,255,255,0.2),
      0 0 40px rgba(200,200,255,0.1);
    pointer-events: none;
    z-index: 605;
    opacity: 0;
    transition: opacity 0.3s ease;
    mix-blend-mode: screen;
  `;
  // Position it inside the polaroid padding area
  const innerPad = parseInt(PAD);
  scanLine.style.top = `${innerPad}px`;
  scanLine.style.left = `${innerPad}px`;
  scanLine.style.right = `${innerPad}px`;
  outer.appendChild(scanLine);

  // ─── State ──────────────────────────────────────────────────
  let visible = false;
  let scanProgress = 0;
  const rgbGhosts = Array.from(outer.children).filter(c => (c as any)._rgbIdx !== undefined) as HTMLElement[];

  // ─── Public API ─────────────────────────────────────────────
  function setPhoto(img: HTMLImageElement | HTMLCanvasElement) {
    imgEl.src = img instanceof HTMLCanvasElement ? img.toDataURL() : img.src;
  }

  function show() {
    visible = true;
    outer.style.display = 'block';
    outer.style.opacity = '1';
    scanProgress = 1;
  }

  function hide() {
    visible = false;
    outer.style.display = 'none';
  }

  function update(time: number, dt: number) {
    if (!visible) return;
    scanProgress = Math.min(1, scanProgress + dt * 0.12);
    const op = Math.min(1, scanProgress * 2);

    // Container fade
    outer.style.opacity = String(op);

    // RGB ghost corners — fade in with offset timing
    for (let i = 0; i < rgbGhosts.length; i++) {
      const ghostOp = Math.min(1, Math.max(0, (scanProgress - i * 0.1) * 3));
      rgbGhosts[i].style.opacity = String(ghostOp * 0.6);
    }

    // Scanner line — sweeps down the photo area
    const innerH = `calc(100% - ${innerPad * 2}px)`;
    const progress = scanProgress;
    // Ease: accelerate then decelerate
    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    // Sweep from top to bottom of the inner photo area
    const scanPos = innerPad + eased * (outer.clientHeight - innerPad * 2 - 2);
    scanLine.style.top = `${Math.max(innerPad, Math.min(outer.clientHeight - innerPad - 2, scanPos))}px`;
    // Fade in, peak at middle, fade out at bottom
    const scanOp = Math.sin(progress * Math.PI) * 0.9;
    scanLine.style.opacity = String(Math.max(0, scanOp));

    // Subtle pulsing glow on RGB ghosts
    for (let i = 0; i < rgbGhosts.length; i++) {
      const pulse = 0.7 + 0.3 * Math.sin(time * 0.5 + i * 2.1);
      const current = parseFloat(rgbGhosts[i].style.opacity) || 0;
      rgbGhosts[i].style.opacity = String(current * pulse);
    }
  }

  function clear() {
    outer.remove();
  }

  return { update, setPhoto, show, hide, clear };
}
