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
    'top: calc(38% + min(55vh, 440px) / 2 + 120px);',
    'left: 50%;',
    'transform: translateX(-50%) translateY(-20px);',
    'width: min(85vw, 650px);',
    'pointer-events: none;',
    'z-index: 700;',
    'display: none;',
    'opacity: 0;',
    'transition: opacity 0.6s ease, transform 0.6s ease;',
  ].join('');
  document.body.appendChild(container);

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

  // ─── Status header ────────────────────────────────────────
  const headerEl = document.createElement('div');
  headerEl.style.cssText = [
    'font: 12px Consolas, "Courier New", monospace;',
    'font-style: italic;',
    'color: rgba(140, 160, 190, 0.6);',
    'margin-bottom: 10px;',
    'text-transform: uppercase;',
    'letter-spacing: 1px;',
    'text-shadow: 0 0 8px rgba(0,0,0,0.9);',
  ].join('');
  headerEl.textContent = '> generando descripción...';
  box.appendChild(headerEl);

  // ─── Completed steps ──────────────────────────────────────
  const stepsEl = document.createElement('div');
  stepsEl.style.cssText = [
    'font: 11px Consolas, "Courier New", monospace;',
    'font-style: italic;',
    'color: rgba(140, 160, 190, 0.45);',
    'margin-bottom: 8px;',
    'text-shadow: 0 0 8px rgba(0,0,0,0.9);',
  ].join('');
  box.appendChild(stepsEl);

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

  // ─── Separator ────────────────────────────────────────────
  const sep = document.createElement('div');
  sep.style.cssText = [
    'height: 1px;',
    'background: rgba(255,255,255,0.06);',
    'margin: 12px 0 10px 0;',
    'display: none;',
  ].join('');
  box.appendChild(sep);

  // ─── Note ─────────────────────────────────────────────────
  const note = document.createElement('div');
  note.style.cssText = [
    'font: 11px Consolas, "Courier New", monospace;',
    'font-style: italic;',
    'color: rgba(140, 160, 190, 0.45);',
    'line-height: 1.5;',
    'text-shadow: 0 0 8px rgba(0,0,0,0.9);',
    'display: none;',
  ].join('');
  note.textContent = '* Análisis visual generado por el modelo de IA.';
  box.appendChild(note);

  // ─── State ────────────────────────────────────────────────
  let visible = false;
  let autoCloseTimer = -1;
  let autoCloseCallback: (() => void) | null = null;
  let ghostTimer = 0;
  let descriptionBuffer = '';
  let spinnerInterval: number | null = null;
  let elapsedTime = 0;
  let timerRunning = false;
  const SPINNER_CHARS = ['/', '-', '\\', '|'];
  let statusBase = ''; // base text without spinner/timer

  // ─── Update header with spinner + elapsed time ─────────────
  function refreshHeader() {
    let text = '> ' + statusBase;
    if (timerRunning) {
      const secs = Math.floor(elapsedTime);
      text += ' [' + secs + 's]';
    }
    if (spinnerInterval !== null) {
      // Append current spinner char (will be updated by interval)
    }
    headerEl.textContent = text;
  }

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

  function setStatus(text: string) {
    statusBase = text;
    refreshHeader();
  }

  function startSpinner() {
    stopSpinner();
    timerRunning = true;
    elapsedTime = 0;
    let i = 0;
    spinnerInterval = window.setInterval(() => {
      const s = headerEl.textContent || '';
      const base = s.replace(/ [\/\\| -]$/, '');
      headerEl.textContent = base + ' ' + SPINNER_CHARS[i % SPINNER_CHARS.length];
      i++;
    }, 250);
    refreshHeader();
  }

  function stopSpinner() {
    if (spinnerInterval !== null) {
      clearInterval(spinnerInterval);
      spinnerInterval = null;
    }
    timerRunning = false;
    // Remove trailing spinner char
    const s = headerEl.textContent || '';
    headerEl.textContent = s.replace(/ [\/\\| -]$/, '');
  }

  function appendLine(text: string) {
    if (!visible) return;
    const dot = document.createElement('span');
    dot.style.cssText = 'color:rgba(100,200,130,0.5);margin-right:6px;';
    dot.textContent = '✓';
    const span = document.createElement('span');
    span.textContent = text;
    const line = document.createElement('div');
    line.style.cssText = 'margin-bottom:2px;opacity:0;transition:opacity 0.5s ease;';
    line.appendChild(dot);
    line.appendChild(span);
    stepsEl.appendChild(line);
    requestAnimationFrame(() => { line.style.opacity = '1'; });
  }

  function showDescription(delta: string) {
    if (!visible) return;
    descriptionBuffer += delta;
    contentEl.style.display = 'block';
    contentEl.textContent = descriptionBuffer;
  }

  function descriptionDone(delayMs: number = 6000, onClose?: () => void) {
    if (!visible) return;
    // Show separator and note
    sep.style.display = 'block';
    note.style.display = 'block';
    autoCloseTimer = delayMs;
    autoCloseCallback = onClose || null;
  }

  function close() {
    hide();
  }

  function update(dt: number) {
    if (!visible) return;

    // Update elapsed timer
    if (timerRunning) {
      elapsedTime += dt;
      refreshHeader();
    }

    // Auto-close countdown
    if (autoCloseTimer > 0) {
      autoCloseTimer -= dt * 1000;
      if (autoCloseTimer <= 0) {
        if (autoCloseCallback) {
          const cb = autoCloseCallback;
          autoCloseCallback = null;
          cb();
        }
        hide();
      }
    }

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
