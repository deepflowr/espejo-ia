/**
 * AnalysisHUD — captured photo with polaroid frame + scanner line.
 */

const PHOTO_SIZE = 'min(52vh, 400px)';
const PHOTO_TOP = '32%';
const PAD = '10px'; // polaroid white border

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
  // Floating animation
  const floatStyle = document.createElement('style');
  floatStyle.textContent = `
    @keyframes fotoFloat {
      0% { transform: translate(-50%, calc(-50% - 4px)); }
      50% { transform: translate(-50%, calc(-50% + 4px)); }
      100% { transform: translate(-50%, calc(-50% - 4px)); }
    }
    #lectura-photo.visible {
      animation: fotoFloat 4s ease-in-out infinite;
    }
  `;
  document.head.appendChild(floatStyle);
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

  // ─── RGB glitch full borders (matches prompt box style) ──────
  const rgbColors = ['#ff0000', '#00ff00', '#0000ff'];
  const rgbGhosts: HTMLDivElement[] = [];

  for (let c = 0; c < 3; c++) {
    const ghost = document.createElement('div');
    ghost.style.cssText = [
      'position: absolute; top: -2px; left: -2px; right: -2px; bottom: -2px;',
      'border: 1px solid ' + rgbColors[c] + ';',
      'pointer-events: none; z-index: ' + (601 + c) + ';',
      'opacity: 0;',
      'transition: opacity 0.5s ease;',
    ].join('');
    (ghost as any)._rgbIdx = c;
    outer.appendChild(ghost);
    rgbGhosts.push(ghost);
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

  // ─── Public API ─────────────────────────────────────────────
  function setPhoto(img: HTMLImageElement | HTMLCanvasElement) {
    imgEl.src = img instanceof HTMLCanvasElement ? img.toDataURL() : img.src;
  }

  function show() {
    visible = true;
    outer.style.display = 'block';
    outer.style.opacity = '1';
    outer.classList.add('visible');
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

    // RGB ghosts — dynamic glitch (same as prompt/thinking boxes)
    for (let i = 0; i < rgbGhosts.length; i++) {
      const ghostOp = Math.min(1, Math.max(0, (scanProgress - i * 0.1) * 3));
      rgbGhosts[i].style.opacity = String(ghostOp * 0.6);
      // Random offset glitch
      const cur = rgbGhosts[i].style.transform || '';
      if (Math.random() < 0.02) {
        const ox = (Math.random() - 0.5) * 3;
        const oy = (Math.random() - 0.5) * 3;
        rgbGhosts[i].style.transform = 'translate(' + ox.toFixed(2) + 'px, ' + oy.toFixed(2) + 'px)';
      } else if (cur) {
        const m = cur.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
        if (m) {
          const x = parseFloat(m[1]), y = parseFloat(m[2]);
          const nx = x + (0 - x) * 0.08;
          const ny = y + (0 - y) * 0.08;
          if (Math.abs(nx) < 0.1 && Math.abs(ny) < 0.1) {
            rgbGhosts[i].style.transform = 'translate(0px, 0px)';
          } else {
            rgbGhosts[i].style.transform = 'translate(' + nx.toFixed(2) + 'px, ' + ny.toFixed(2) + 'px)';
          }
        }
      }
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
  }

  function clear() {
    outer.remove();
  }

  return { update, setPhoto, show, hide, clear };
}
