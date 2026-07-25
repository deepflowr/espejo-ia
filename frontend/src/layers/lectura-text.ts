/**
 * LecturaText — centered messages during LECTURA state.
 *
 * Cycles through messages from lectura-messages.json with typing animation.
 * Matches the text treatment of other floating text (no background/border).
 * Editable: just change the JSON file.
 */

import messagesData from '../data/lectura-messages.json';

const MESSAGES: string[] = messagesData.pensando;

export function createLecturaText() {
  const container = document.createElement('div');
  container.id = 'lectura-text';
  container.style.cssText = `
    position: fixed;
    top: calc(18% + min(58vh, 460px) + 20px);
    left: 50%;
    transform: translateX(-50%);
    width: min(58vh, 460px);
    text-align: left;
    pointer-events: none;
    z-index: 600;
    display: none;
  `;
  document.body.appendChild(container);

  const textEl = document.createElement('div');
  textEl.style.cssText = `
    display: inline-block;
    font: 24px Consolas, "Courier New", monospace;
    color: rgba(160, 160, 180, 0.85);
    text-shadow: 0 0 20px rgba(0, 0, 0, 0.95), 0 0 60px rgba(68, 170, 255, 0.06);
    letter-spacing: 2px;
    line-height: 1.4;
    padding: 4px 0;
  `;
  container.appendChild(textEl);

  // ─── State ───────────────────────────────────────────────
  let visible = false;
  let currentMessageIndex = 0;
  let visibleChars = 0;
  let charTimer = 0;
  let messageTimer = 0;
  const CHAR_INTERVAL = 0.045; // seconds per character
  const MESSAGE_DISPLAY_TIME = 3.5; // seconds to hold after fully typed
  let fullyTyped = false;
  let fading = false;
  let fadeOpacity = 1;

  // ─── Public API ──────────────────────────────────────────

  function show() {
    visible = true;
    container.style.display = 'block';
    currentMessageIndex = Math.floor(Math.random() * MESSAGES.length);
    visibleChars = 0;
    charTimer = 0;
    messageTimer = 0;
    fullyTyped = false;
    fading = false;
    fadeOpacity = 1;
    textEl.style.opacity = '1';
    updateText();
  }

  function hide() {
    visible = false;
    container.style.display = 'none';
  }

  function updateText() {
    const msg = MESSAGES[currentMessageIndex];
    const display = msg.slice(0, Math.floor(visibleChars));
    const cursor = visibleChars < msg.length ? '▊' : '';
    textEl.textContent = display + cursor;
  }

  function update(dt: number) {
    if (!visible) return;

    if (fading) {
      fadeOpacity -= dt * 0.5;
      textEl.style.opacity = String(fadeOpacity);
      if (fadeOpacity <= 0) {
        // Next message
        currentMessageIndex = (currentMessageIndex + 1) % MESSAGES.length;
        visibleChars = 0;
        charTimer = 0;
        messageTimer = 0;
        fullyTyped = false;
        fading = false;
        fadeOpacity = 1;
        textEl.style.opacity = '1';
        updateText();
      }
      return;
    }

    if (!fullyTyped) {
      charTimer += dt;
      while (charTimer >= CHAR_INTERVAL && visibleChars < MESSAGES[currentMessageIndex].length) {
        visibleChars++;
        charTimer -= CHAR_INTERVAL;
      }
      updateText();
      if (visibleChars >= MESSAGES[currentMessageIndex].length) {
        fullyTyped = true;
        messageTimer = 0;
      }
    } else {
      messageTimer += dt;
      if (messageTimer >= MESSAGE_DISPLAY_TIME) {
        fading = true;
      }
    }
  }

  function clear() {
    container.remove();
  }

  return { show, hide, update, clear };
}
