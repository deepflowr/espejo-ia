/**
 * LecturaThinking — black box that slides down, matching prompt-box style.
 *
 * Shows streaming description text with status updates.
 * Same styling as prompt-box: black bg, white border, RGB ghosts, Consolas.
 */

export function createLecturaThinking() {
  // ─── Container ────────────────────────────────────────────
  const container = document.createElement('div');
  container.id = 'lectura-thinking';
  container.style.cssText = [
    'position: fixed;',
    'top: calc(32% + min(52vh, 400px) / 2 + 18px + 50px + 20px);',
    'left: 50%;',
    'transform: translateX(-50%) translateY(-20px);',
    'width: min(85vw, 650px);',
    'pointer-events: none;',
    'z-index: 700;',
    'display: none;',
    'opacity: 0;',
    'transition: opacity 0.6s ease, transform 0.6s ease;',
    'animation: boxFloat 5s ease-in-out infinite;',
  ].join('');
  document.body.appendChild(container);
  const boxAnimStyle = document.createElement('style');
  boxAnimStyle.textContent = `
    @keyframes boxFloat {
      0% { transform: translateX(-50%) translateY(-2px); }
      50% { transform: translateX(-50%) translateY(2px); }
      100% { transform: translateX(-50%) translateY(-2px); }
    }
  `;
  document.head.appendChild(boxAnimStyle);

  // ─── Inner box ────────────────────────────────────────────
  const box = document.createElement('div');
  box.style.cssText = [
    'position: relative;',
    'background: rgba(0, 0, 0, 0.92);',
    'border: 1px solid rgba(255, 255, 255, 0.12);',
    'border-radius: 0;',
    'padding: 20px 24px;',
    'box-shadow: 0 8px 40px rgba(0,0,0,0.5), 0 0 12px rgba(255,255,255,0.08);',
  ].join('');
  container.appendChild(box);

  // ─── RGB ghost boxes ──────────────────────────────────────
  const ghosts: HTMLDivElement[] = ['#ff0000','#00ff00','#0000ff'].map(color => {
    const g = document.createElement('div');
    g.style.cssText = [
      'position: absolute; top: -1px; left: -1px; right: -1px; bottom: -1px;',
      'border: 1px solid ' + color + ';',
      'pointer-events: none; opacity: 0.25; mix-blend-mode: screen;',
    ].join('');
    box.appendChild(g);
    return g;
  });

  // ─── Title: DESCRIPCIÓN ───────────────────────────────────
  const titleEl = document.createElement('div');
  titleEl.style.cssText = [
    'font: 12px Consolas, "Courier New", monospace;',
    'font-style: italic;',
    'color: rgb(220, 210, 120);',
    'margin-bottom: 12px;',
    'text-transform: uppercase;',
    'letter-spacing: 1px;',
    'text-shadow: 0 0 8px rgba(0,0,0,0.9);',
  ].join('');
  titleEl.textContent = '> DESCRIPCIÓN';
  box.appendChild(titleEl);

  // ─── Description content ──────────────────────────────────
  const contentEl = document.createElement('div');
  contentEl.style.cssText = [
    'font: 14px Consolas, "Courier New", monospace;',
    'color: rgba(210, 220, 240, 0.85);',
    'line-height: 1.6;',
    'white-space: pre-wrap;',
    'word-wrap: break-word;',
    'text-shadow: 0 0 8px rgba(0,0,0,0.9);',
    'display: none;',
  ].join('');
  box.appendChild(contentEl);

  // ─── State ────────────────────────────────────────────────
  let visible = false;
  let ghostTimer = 0;
  let descriptionBuffer = '';

  // ─── Public API ──────────────────────────────────────────

  function show() {
    visible = true;
    container.style.display = 'block';
    requestAnimationFrame(() => {
      container.style.opacity = '1';
      container.style.transform = 'translateX(-50%) translateY(0)';
    });
  }

  function hide() {
    visible = false;
    container.style.opacity = '0';
    container.style.transform = 'translateX(-50%) translateY(-20px)';
    setTimeout(() => { container.style.display = 'none'; }, 600);
  }

  function clear() {
    container.remove();
  }

  function setStatus(_text: string) {
    // No-op — status now via lectura-status element
  }

  function startSpinner() {
    // No-op — removed
  }

  function stopSpinner() {
    // No-op — removed
  }

  function appendLine(_text: string) {
    // No-op — removed
  }

  function showDescription(delta: string) {
    if (!visible) return;
    descriptionBuffer += delta;
    contentEl.style.display = 'block';
    contentEl.innerHTML = descriptionBuffer.replace(
      /^(\s*)\*/gm,
      '$1<span style="color:rgb(220,210,120)">*</span>'
    );
  }

  function descriptionDone(_delayMs?: number, _onClose?: () => void) {
    // No-op — wave-based flow now
  }

  function close() {
    hide();
  }

  function update(dt: number) {
    if (!visible) return;

    // RGB ghost glitch
    ghostTimer -= dt;
    if (ghostTimer <= 0) {
      for (let i = 0; i < ghosts.length; i++) {
        const ox = (Math.random() - 0.5) * 3;
        const oy = (Math.random() - 0.5) * 3;
        ghosts[i].style.transform = 'translate(' + ox.toFixed(2) + 'px, ' + oy.toFixed(2) + 'px)';
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
