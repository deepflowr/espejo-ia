/**
 * LecturaThinking — black box that grows from bottom up.
 *
 * Shows:
 *  1. Header: current status + completed steps (fixed at top)
 *  2. Description section (only)
 *  3. Auto-closes after a delay
 *
 * Visual: black background, margins on bottom/sides,
 * grows from bottom edge up to ~1/3 of screen.
 */

export function createLecturaThinking() {
  // ─── Container ────────────────────────────────────────────
  const container = document.createElement('div');
  container.id = 'lectura-thinking';
  container.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    pointer-events: none;
    z-index: 700;
    display: none;
  `;
  document.body.appendChild(container);

  // ─── Inner box ────────────────────────────────────────────
  const box = document.createElement('div');
  box.style.cssText = `
    position: relative;
    margin: 0 24px 24px 24px;
    background: rgba(0, 0, 0, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0;
    overflow: hidden;
    height: 0;
    transition: none;
    box-shadow: 0 -8px 40px rgba(0,0,0,0.6), 0 0 12px rgba(255,255,255,0.08);
    display: flex;
    flex-direction: column;
  `;
  container.appendChild(box);

  // ─── RGB ghost boxes ──────────────────────────────────────
  const ghosts: HTMLDivElement[] = ['#ff0000','#00ff00','#0000ff'].map(color => {
    const g = document.createElement('div');
    g.style.cssText = [
      'position: absolute; top: -1px; left: -1px; right: -1px; bottom: -1px;',
      'border: 1px solid ' + color + ';',
      'pointer-events: none; opacity: 0.2; mix-blend-mode: screen;',
    ].join('');
    box.appendChild(g);
    return g;
  });

  // ─── Header: status line (fixed at top) ───────────────────
  const headerEl = document.createElement('div');
  headerEl.style.cssText = `
    padding: 16px 24px 8px 24px;
    flex-shrink: 0;
    font: 15px Consolas, "Courier New", monospace;
    color: rgba(200, 210, 230, 0.9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-shadow: 0 0 8px rgba(0,0,0,0.9);
    opacity: 0;
    transition: opacity 0.5s ease;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  `;
  headerEl.textContent = '>';
  box.appendChild(headerEl);

  // ─── Completed steps (below header, inline) ───────────────
  const stepsEl = document.createElement('div');
  stepsEl.style.cssText = `
    padding: 0 24px 4px 24px;
    flex-shrink: 0;
    font: 13px Consolas, "Courier New", monospace;
    color: rgba(140, 160, 180, 0.6);
    opacity: 0;
    transition: opacity 0.5s ease;
  `;
  box.appendChild(stepsEl);

  // ─── Content area (scrollable, fills remaining) ───────────
  const contentEl = document.createElement('div');
  contentEl.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 4px 24px 20px 24px;
    font: 14px Consolas, "Courier New", monospace;
    color: rgba(180, 190, 200, 0.8);
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
    text-shadow: 0 0 8px rgba(0,0,0,0.9);
    opacity: 0;
    transition: opacity 0.5s ease;
    scroll-behavior: smooth;
  `;
  box.appendChild(contentEl);

  // ─── Ghost glitch timer ────────────────────────────────────
  let ghostTimer = 0;

  // ─── Scanning line glow at top edge ───────────────────────
  const topGlow = document.createElement('div');
  topGlow.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(100, 140, 255, 0.15) 30%,
      rgba(100, 140, 255, 0.3) 50%,
      rgba(100, 140, 255, 0.15) 70%,
      transparent 100%
    );
    opacity: 0;
    transition: opacity 0.8s ease;
  `;
  box.appendChild(topGlow);

  // ─── State ────────────────────────────────────────────────
  let visible = false;
  let expanding = false;
  let shrinking = false;
  let currentHeight = 0;
  let targetHeight = 0;
  let minHeight = 0;
  const MIN_HEIGHT_RATIO = 0.33;
  const MAX_HEIGHT_RATIO = 0.50;
  const EXPAND_SPEED = 350;
  const SHRINK_SPEED = 200;
  let descriptionBuffer = '';
  let autoCloseTimer = -1;
  let autoCloseCallback: (() => void) | null = null;
  let spinnerInterval: number | null = null;
  const SPINNER_CHARS = ['/', '-', '\\', '|'];

  // ─── Helper: create a section label with [brackets] ────────
  function addLabel(text: string): HTMLElement {
    const lbl = document.createElement('div');
    lbl.style.cssText = `
      font: 16px Consolas, "Courier New", monospace;
      color: rgba(190, 200, 215, 0.85);
      margin: 14px 0 6px 0;
      opacity: 0;
      transition: opacity 0.8s ease;
    `;
    lbl.textContent = `[${text}]`;
    contentEl.appendChild(lbl);
    requestAnimationFrame(() => { lbl.style.opacity = '0.6'; });
    return lbl;
  }

  // ─── Auto-scroll to bottom ─────────────────────────────────
  function scrollToBottom() {
    contentEl.scrollTop = contentEl.scrollHeight;
  }

  // ─── Grow box only if content overflows current height ─────
  function growToFit() {
    if (!visible || shrinking || expanding) return;
    // Only grow if content actually exceeds the current box inner height
    const boxInnerH = currentHeight - headerEl.offsetHeight - stepsEl.offsetHeight - 60;
    if (contentEl.scrollHeight > boxInnerH + 5) {
      const needed = contentEl.scrollHeight + headerEl.offsetHeight + stepsEl.offsetHeight + 60;
      const maxH = window.innerHeight * MAX_HEIGHT_RATIO;
      const newTarget = Math.min(maxH, Math.max(minHeight, needed));
      if (newTarget > currentHeight + 10) {
        targetHeight = newTarget;
        expanding = true;
      }
    }
  }

  // ─── Public API ──────────────────────────────────────────

  function show() {
    visible = true;
    container.style.display = 'block';
    expanding = true;
    shrinking = false;
    currentHeight = 0;
    descriptionBuffer = '';
    autoCloseTimer = -1;
    stopSpinner();
    contentEl.style.overflow = 'hidden';
    const vh = window.innerHeight;
    minHeight = vh * MIN_HEIGHT_RATIO;
    targetHeight = minHeight;
    headerEl.style.opacity = '0';
    stepsEl.style.opacity = '0';
    contentEl.style.opacity = '0';
    topGlow.style.opacity = '0';
    contentEl.innerHTML = '';
    stepsEl.innerHTML = '';
  }

  function hide() {
    visible = false;
    shrinking = false;
    expanding = false;
    stopSpinner();
    container.style.display = 'none';
    headerEl.textContent = '>';
    stepsEl.innerHTML = '';
    contentEl.innerHTML = '';
    descriptionBuffer = '';
    autoCloseTimer = -1;
  }

  function clear() {
    container.remove();
  }

  /** Status line (top of box) */
  function setStatus(text: string) {
    headerEl.textContent = `> ${text}`;
  }

  /** Start console spinner animation in the header */
  function startSpinner() {
    stopSpinner();
    let i = 0;
    spinnerInterval = window.setInterval(() => {
      const s = headerEl.textContent || '';
      // Replace any spinner char at end
      const base = s.replace(/ [\/\\| -]$/, '');
      headerEl.textContent = `${base} ${SPINNER_CHARS[i % SPINNER_CHARS.length]}`;
      i++;
    }, 250);
  }

  /** Stop spinner animation */
  function stopSpinner() {
    if (spinnerInterval !== null) {
      clearInterval(spinnerInterval);
      spinnerInterval = null;
    }
  }

  /** Append a completed step (✓ line) */
  function appendLine(text: string) {
    if (!visible) return;
    const dot = document.createElement('span');
    dot.style.cssText = `color: rgba(100, 200, 130, 0.5); margin-right: 6px;`;
    dot.textContent = '✓';
    const span = document.createElement('span');
    span.textContent = text;
    const line = document.createElement('div');
    line.style.cssText = `margin-bottom: 2px; opacity: 0; transition: opacity 0.5s ease;`;
    line.appendChild(dot);
    line.appendChild(span);
    stepsEl.appendChild(line);
    requestAnimationFrame(() => { line.style.opacity = '1'; });
  }

  /** Show description content (streaming structured text) */
  let descLabel: HTMLElement | null = null;
  let descContent: HTMLElement | null = null;

  function showDescription(delta: string) {
    if (!visible) return;
    contentEl.style.opacity = '1';
    if (!descLabel) {
      descLabel = addLabel('Descripción de la persona a reflejar');
    }
    if (!descContent) {
      descContent = document.createElement('div');
      descContent.style.cssText = `
        font: 15px Consolas, "Courier New", monospace;
        color: rgba(190, 200, 215, 0.85);
        line-height: 1.7;
        white-space: pre-wrap;
      `;
      contentEl.appendChild(descContent);
    }
    descriptionBuffer += delta;
    descContent.textContent = descriptionBuffer;
  }

  /**
   * Mark description as done and schedule auto-close.
   * @param delayMs How long to wait before closing (ms)
   * @param onClose Callback when box finishes closing
   */
  function descriptionDone(delayMs: number = 6000, onClose?: () => void) {
    if (!visible) return;
    autoCloseTimer = delayMs;
    autoCloseCallback = onClose || null;
  }

  /** Start closing the box (slide-down animation) */
  function close() {
    if (!visible || shrinking) return;
    shrinking = true;
    autoCloseTimer = -1;
    stopSpinner();
    // Hide scrollbar during close
    contentEl.style.overflow = 'hidden';
  }

  function update(dt: number) {
    if (!visible) return;

    // Auto-close countdown
    if (autoCloseTimer > 0) {
      autoCloseTimer -= dt * 1000;
      if (autoCloseTimer <= 0) {
        close();
      }
    }

    if (shrinking) {
      currentHeight = Math.max(0, currentHeight - SHRINK_SPEED * dt);
      box.style.height = `${currentHeight}px`;
      const progress = currentHeight / targetHeight;
      headerEl.style.opacity = String(progress);
      stepsEl.style.opacity = String(progress);
      contentEl.style.opacity = String(progress);
      if (currentHeight <= 0) {
        shrinking = false;
        visible = false;
        container.style.display = 'none';
        if (autoCloseCallback) {
          autoCloseCallback();
          autoCloseCallback = null;
        }
      }
      return;
    }

    if (expanding) {
      currentHeight = Math.min(targetHeight, currentHeight + EXPAND_SPEED * dt);
      box.style.height = `${currentHeight}px`;

      const progress = currentHeight / targetHeight;
      if (progress > 0.5) {
        headerEl.style.opacity = String(Math.min(1, (progress - 0.5) / 0.3));
        topGlow.style.opacity = String(Math.min(0.5, (progress - 0.5) / 0.3 * 0.5));
      }
      if (progress > 0.6) {
        stepsEl.style.opacity = String(Math.min(1, (progress - 0.6) / 0.2));
      }
      if (progress > 0.7 && contentEl.children.length > 0) {
        contentEl.style.opacity = String(Math.min(1, (progress - 0.7) / 0.2));
      }

      if (currentHeight >= targetHeight) {
        expanding = false;
        headerEl.style.opacity = '1';
        stepsEl.style.opacity = '1';
        topGlow.style.opacity = '0.5';
        if (contentEl.children.length > 0) contentEl.style.opacity = '1';
      }
    }

    const pulse = 0.3 + 0.2 * Math.sin(Date.now() / 2000);
    topGlow.style.opacity = String(expanding ? parseFloat(topGlow.style.opacity) : pulse);

    // RGB ghost glitch
    ghostTimer -= dt;
    if (ghostTimer <= 0) {
      for (let i = 0; i < ghosts.length; i++) {
        const ox = (Math.random() - 0.5) * 3;
        const oy = (Math.random() - 0.5) * 3;
        ghosts[i].style.transform = 'translate(' + ox + 'px, ' + oy + 'px)';
        ghosts[i].style.opacity = String(0.1 + Math.random() * 0.15);
      }
      ghostTimer = 0.06 + Math.random() * 0.1;
    }
    for (let i = 0; i < ghosts.length; i++) {
      const cur = ghosts[i].style.transform;
      if (cur && !cur.includes('translate(0px, 0px)')) {
        const m = cur.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
        if (m) {
          const x = parseFloat(m[1]), y = parseFloat(m[2]);
          const nx = x + (0 - x) * 0.08;
          const ny = y + (0 - y) * 0.08;
          if (Math.abs(nx) < 0.1 && Math.abs(ny) < 0.1) {
            ghosts[i].style.transform = 'translate(0px, 0px)';
          } else {
            ghosts[i].style.transform = 'translate(' + nx.toFixed(2) + 'px, ' + ny.toFixed(2) + 'px)';
          }
        }
      }
    }
  }

  return { show, hide, update, clear, setStatus, appendLine, showDescription, descriptionDone, close, startSpinner, stopSpinner };
}
