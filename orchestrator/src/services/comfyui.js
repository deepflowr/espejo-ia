/**
 * ComfyUI bridge — sends prompts to ComfyUI and receives previews/results.
 *
 * Connects to an existing ComfyUI WebSocket and forwards progress events.
 * To be implemented fully once ComfyUI workflow is defined.
 */

/**
 * Generate an image from a text prompt via ComfyUI.
 *
 * @param {string} promptEn - The English prompt to send
 * @param {function} onPreview - Called with { image_b64, step, total_steps }
 * @param {function} onComplete - Called with { image_b64 }
 * @param {function} onError
 */
function generate(promptEn, onPreview, onComplete, onError) {
  // TODO: Implement ComfyUI workflow bridge
  console.log('ComfyUI generate called with prompt:', promptEn);
  // Placeholder — will be implemented when ComfyUI integration begins
  onError(new Error('ComfyUI not yet implemented'));
}

module.exports = { generate };
