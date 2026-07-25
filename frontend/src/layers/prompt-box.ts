/**
 * PromptBox — black box that slides down from below the photo.
 *
 * Shows the Spanish prompt in quoted Consolas text, matching the
 * thinking box styling: white border, RGB ghost, no rounded corners.
 */

export function createPromptBox() {
  // ─── Container ────────────────────────────────────────────
  const container = document.createElement('div');
  container.id = 'prompt-box';
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

  // ─── Inner box (white border, no radius, like bounding box) ──
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
  const ghostColors = ['#ff0000', '#00ff00', '#0000ff'];
  const ghosts: HTMLDivElement[] = ghostColors.map(color => {
    const g = document.createElement('div');
    g.style.cssText = [
      'position: absolute; top: -1px; left: -1px; right: -1px; bottom: -1px;',
      'border: 1px solid ' + color + ';',
      'pointer-events: none; opacity: 0.25; mix-blend-mode: screen;',
      'transition: none;',
    ].join('');
    box.appendChild(g);
    return g;
  });

  // ─── Title: PROMPT (ES) ───────────────────────────────────
  const title = document.createElement('div');
  title.style.cssText = [
    'font: 12px Consolas, "Courier New", monospace;',
    'font-style: italic;',
    'color: rgba(140, 160, 190, 0.6);',
    'margin-bottom: 10px;',
    'text-transform: uppercase;',
    'letter-spacing: 1px;',
    'text-shadow: 0 0 8px rgba(0,0,0,0.9);',
  ].join('');
  title.textContent = '> PROMPT (ES)';
  box.appendChild(title);

  // ─── Prompt text (quoted, Consolas like description) ──────
  const promptEl = document.createElement('div');
  promptEl.style.cssText = [
    'font: 14px Consolas, "Courier New", monospace;',
    'color: rgba(210, 220, 240, 0.85);',
    'line-height: 1.6;',
    'white-space: pre-wrap;',
    'word-wrap: break-word;',
    'text-shadow: 0 0 8px rgba(0,0,0,0.9);',
  ].join('');
  box.appendChild(promptEl);

  // ─── Separator ────────────────────────────────────────────
  const sep = document.createElement('div');
  sep.style.cssText = [
    'height: 1px;',
    'background: rgba(255,255,255,0.06);',
    'margin: 14px 0 10px 0;',
  ].join('');
  box.appendChild(sep);

  // ─── Note (small Consolas, italic, gray) ──────────────────
  const note = document.createElement('div');
  note.style.cssText = [
    'font: 11px Consolas, "Courier New", monospace;',
    'font-style: italic;',
    'color: rgba(140, 160, 190, 0.45);',
    'line-height: 1.5;',
    'text-shadow: 0 0 8px rgba(0,0,0,0.9);',
  ].join('');
  note.textContent = '* El modelo utiliza internamente el prompt en inglés (PROMPT_EN) para generar la imagen. Esta es su traducción al español.';
  box.appendChild(note);

  // ─── Ghost glitch timer ───────────────────────────────────
  let glitchTimer = 0;

  // ─── Public API ───────────────────────────────────────────
  function show(promptText: string) {
    const clean = promptText.replace(/^[\s\]\[,]+/, '').trim();
    promptEl.textContent = '«' + clean + '»';
    container.style.display = 'block';
    requestAnimationFrame(() => {
      container.style.opacity = '1';
      container.style.transform = 'translateX(-50%) translateY(0)';
    });
    // Reset ghost positions
    for (let i = 0; i < ghosts.length; i++) {
      ghosts[i].style.transform = 'translate(0, 0)';
    }
  }

  function hide() {
    container.style.opacity = '0';
    container.style.transform = 'translateX(-50%) translateY(-20px)';
    setTimeout(() => { container.style.display = 'none'; }, 600);
  }

  function setText(text: string) {
    const clean = text.replace(/^[\s\]\[,]+/, '').trim();
    promptEl.textContent = '«' + clean + '»';
  }

  function update(_time: number, dt: number) {
    // RGB ghost glitch animation
    glitchTimer -= dt;
    if (glitchTimer <= 0) {
      for (let i = 0; i < ghosts.length; i++) {
        const ox = (Math.random() - 0.5) * 3;
        const oy = (Math.random() - 0.5) * 3;
        ghosts[i].style.transform = 'translate(' + ox + 'px, ' + oy + 'px)';
        ghosts[i].style.opacity = String(0.15 + Math.random() * 0.15);
      }
      glitchTimer = 0.06 + Math.random() * 0.1;
    }
    // Recover ghost positions
    for (let i = 0; i < ghosts.length; i++) {
      const cur = ghosts[i].style.transform;
      if (cur !== 'translate(0px, 0px)') {
        const match = cur.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
        if (match) {
          const x = parseFloat(match[1]);
          const y = parseFloat(match[2]);
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

  return { show, hide, setText, update };
}
