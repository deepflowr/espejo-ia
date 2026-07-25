/**
 * Ollama service — streams AI narration from a local Ollama instance.
 *
 * Calls http://localhost:11434/api/chat with streaming enabled.
 * Parses delimited output into pensamiento_es, prompt_en, prompt_es.
 */

const http = require('http');

const OLLAMA_HOST = 'localhost';
const OLLAMA_PORT = 11434;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:12b';

const DELIM_PROMPT_EN = '[PROMPT_EN]';
const DELIM_PROMPT_ES = '[PROMPT_ES]';

const SYSTEM_PROMPT = `Eres un analista visual que describe retratos para generar un reflejo en un espejo mágico.

Genera una DESCRIPCIÓN ESTRUCTURADA en español de la persona en la foto. Solamente la lista de bullets, sin párrafos introductorios ni explicaciones. Cada línea debe empezar con un asterisco y un espacio, en este formato exacto:

* Género: masculino/femenino
* Edad aproximada: ej: ~30 años
* Etnia: descripción
* Forma del rostro: ovalada/redonda/corazón/cuadrada/alargada
* Ojos: color, forma, tamaño, cejas
* Nariz: forma, tamaño, perfil
* Labios: grosor, forma
* Piel: tono, textura, imperfecciones
* Maquillaje: si aplica, tipo y colores (sombra, labial, base, etc.)
* Vello facial: si aplica, barba/bigote/cejas tupidas, color, grosor
* Cabello: color, largo, estilo, textura
* Expresión: estado de ánimo, emoción
* Iluminación/Ambiente: dirección de luz, temperatura, fondo
* Ropa/Accessorios: visible en el retrato

Sé preciso y descriptivo. NO inventes nada que no esté en la foto. Solamente la lista de bullets, sin texto adicional antes ni después.

Después de la descripción, agrega este delimitador exacto:

${DELIM_PROMPT_EN}
Write a DETAILED prompt in English for Z-Image Turbo image generation based on the description above. Must describe:
- Gender, ethnicity, exact age range
- Face shape, jawline, cheekbones
- Eyes, eyebrows, eyelashes
- Nose shape and profile
- Lips thickness and shape
- Skin texture, imperfections, wrinkles
- Hair color, style, texture
- Facial expression and mood
- Lighting, framing, background
- Visible clothing and accessories

Be precise and descriptive. Minimum 100 words.

${DELIM_PROMPT_ES}
Traduce el PROMPT_EN al español exactamente. Solo la traducción, sin agregar nada.`;

/**
 * Strip data:image/...;base64, prefix if present.
 */
function stripDataUrlPrefix(b64) {
  const idx = b64.indexOf(';base64,');
  if (idx !== -1) return b64.substring(idx + 8);
  // Also check for plain comma prefix
  const comma = b64.indexOf(',');
  if (comma !== -1 && !b64.startsWith('/') && !b64.startsWith('i')) return b64.substring(comma + 1);
  return b64;
}

/**
 * Determine which channel a position in accumulated text belongs to.
 * Returns 'prompt_en' or 'prompt_es', or null if no delimiter yet.
 */
function getChannelFor(text) {
  // Use '[' as the universal delimiter trigger — model only uses brackets for delimiters
  const bracketIdx = text.indexOf('[');
  if (bracketIdx === -1) {
    return text.trim().length > 0 ? 'descripcion' : null;
  }
  // Once we see '[', check which delimiter follows (or default to prompt_en)
  const after = text.substring(bracketIdx);
  if (after.includes(DELIM_PROMPT_ES)) return 'prompt_es';
  return 'prompt_en';
}

/**
 * Remove any delimiter markers from a text delta.
 */
function stripDelimiters(text) {
  // Strip any [PROMPT...] or partial [PROMPT... (including [P, [PR, [PRO, etc.)
  return text.replace(/\[PROMPT[^\]]*\]?/g, '');
}

/**
 * Extract content between two delimiters.
 */
function extractSection(text, fromDelim, toDelim) {
  const start = text.indexOf(fromDelim);
  if (start === -1) return '';
  const contentStart = start + fromDelim.length;
  if (!toDelim) return text.substring(contentStart).trim();
  const end = text.indexOf(toDelim, contentStart);
  if (end === -1) return text.substring(contentStart).trim();
  return text.substring(contentStart, end).trim();
}

/**
 * Stream narration from Ollama given a base64 photo.
 *
 * @param {string} imageB64 - Base64-encoded JPEG photo
 * @param {function} onChunk - Called with { channel, text_delta, done }
 * @param {function} onComplete - Called with { pensamiento_es, prompt_en, prompt_es }
 * @param {function} onError
 */
function startStream(imageB64, onChunk, onComplete, onError) {
  const cleanB64 = stripDataUrlPrefix(imageB64);

  const body = JSON.stringify({
    model: OLLAMA_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: 'Analyze this photo and generate the two sections from the system prompt.',
        images: [cleanB64],
      },
    ],
    stream: true,
    think: true,
    options: {
      temperature: 0.8,
      top_p: 0.9,
    },
  });

  const req = http.request(
    {
      hostname: OLLAMA_HOST,
      port: OLLAMA_PORT,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    (res) => {
      let accumulated = '';
      let accumulatedThinking = '';
      let currentChannel = null;
      let thinkingDone = false;
      let completed = false;

      const processDelta = (delta, thinkingDelta, isLast) => {
        if (completed) return; // prevent double trigger
        // Accumulate native thinking
        if (thinkingDelta) {
          accumulatedThinking += thinkingDelta;
          if (!thinkingDone) {
            onChunk({ channel: 'thinking_es', text_delta: thinkingDelta, done: false });
          }
        }
        // Close thinking channel when content starts or stream ends
        if (!thinkingDone && (currentChannel || isLast)) {
          thinkingDone = true;
          onChunk({ channel: 'thinking_es', text_delta: '', done: true });
        }

        // Process content as before
        accumulated += delta;
        const newChannel = getChannelFor(accumulated);

        if (newChannel !== currentChannel) {
          if (currentChannel) {
            onChunk({ channel: currentChannel, text_delta: '', done: true });
          }
          currentChannel = newChannel;
        }

        const clean = stripDelimiters(delta);
        if (clean && currentChannel) {
          onChunk({ channel: currentChannel, text_delta: clean, done: false });
        }

        if (isLast) {
          if (currentChannel) {
            onChunk({ channel: currentChannel, text_delta: '', done: true });
          }
          if (!thinkingDone) {
            thinkingDone = true;
            onChunk({ channel: 'thinking_es', text_delta: '', done: true });
          }
          completed = true;
          onComplete({
            pensamiento_es: accumulatedThinking,
            descripcion: extractSection(accumulated, '', DELIM_PROMPT_EN),
            prompt_en: extractSection(accumulated, DELIM_PROMPT_EN, DELIM_PROMPT_ES),
            prompt_es: extractSection(accumulated, DELIM_PROMPT_ES, null),
          });
        }
      };

      let buffer = '';

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            const content = data.message?.content || '';
            const thinking = data.message?.thinking || '';
            if (content || thinking) {
              processDelta(content, thinking, data.done === true);
            } else if (data.done) {
              processDelta('', '', true);
            }
          } catch (e) {
            // Skip malformed JSON lines
          }
        }
      });

      res.on('end', () => {
        // Process any remaining buffer
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer);
            if (data.message && data.message.content) {
              processDelta(data.message.content, '', true);
              return;
            }
          } catch (e) { /* ignore */ }
        }
        // Finalize even if empty
        if (accumulated || currentChannel) {
          processDelta('', '', true);
        }
      });

      res.on('error', onError);
    },
  );

  req.on('error', onError);
  req.write(body);
  req.end();
}

module.exports = { startStream };
