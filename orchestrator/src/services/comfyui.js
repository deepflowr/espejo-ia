/**
 * ComfyUI bridge — queues the EspejoIA_llms workflow and streams progress.
 *
 * Full pipeline in one ComfyUI workflow:
 * 1. QwenVL generates description + prompt_en + prompt_es from the photo
 * 2. Z-Image Turbo generates the portrait with ControlNet
 * 3. Outputs: final portrait, Canny edge, progress previews
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const COMFY_HOST = 'localhost';
const COMFY_PORT = 8188;
const COMFY_INPUT_DIR = 'C:\\ComfyUI\\ComfyUI-Easy-Install\\ComfyUI\\input';

// ─── Full pipeline workflow (EspejoIA_llms.json) ──────────────
const WORKFLOW = {
  "2": { "inputs": { "vae_name": "diffusion_pytorch_model.safetensors" }, "class_type": "VAELoader" },
  "3": { "inputs": { "clip_name": "qwen_3_4b.safetensors", "type": "lumina2", "device": "default" }, "class_type": "CLIPLoader" },
  "4": { "inputs": { "text": ["62", 0], "clip": ["3", 0] }, "class_type": "CLIPTextEncode" },
  "5": { "inputs": { "text": "", "clip": ["3", 0] }, "class_type": "CLIPTextEncode" },
  "7": { "inputs": { "width": 1024, "height": 1024, "batch_size": 1 }, "class_type": "EmptyLatentImage" },
  "8": { "inputs": { "select_decoder": "default", "pixel_shift_down_right": false, "tile_size": 512, "overlap": 64, "temporal_size": 64, "temporal_overlap": 8, "samples": ["58", 0], "vae": ["2", 0] }, "class_type": "VAEDecodePlusPlus" },
  "9": { "inputs": { "enabled": true, "clean_gpu": true, "clean_cpu": true, "unload_models": 3, "anything": ["8", 0] }, "class_type": "RAMCleanup" },
  "10": { "inputs": { "filename_prefix": "espejo_portrait", "images": ["8", 0] }, "class_type": "SaveImage" },
  "11": { "inputs": { "image": "{{INPUT_IMAGE}}" }, "class_type": "LoadImage" },
  "18": { "inputs": { "name": "Z-Image-Turbo-Fun-Controlnet-Union.safetensors" }, "class_type": "ModelPatchLoader" },
  "19": { "inputs": { "strength": 0.9, "model": ["53", 0], "model_patch": ["18", 0], "vae": ["2", 0], "image": ["49", 0] }, "class_type": "QwenImageDiffsynthControlnet" },
  "22": { "inputs": { "images": ["49", 0] }, "class_type": "PreviewImage" },
  "49": { "inputs": { "preprocessor": "LineartStandardPreprocessor", "resolution": 512, "image": ["11", 0] }, "class_type": "AIO_Preprocessor" },
  "53": { "inputs": { "unet_name": "z_image_turbo_fp8_e4m3fn.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader" },
  "56": { "inputs": { "filename_prefix": "espejo_canny", "images": ["22", 0] }, "class_type": "SaveImage" },
  "57": { "inputs": { "images": ["59", 0] }, "class_type": "PreviewImage" },
  "58": { "inputs": { "seed": 0, "steps": 12, "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "denoise": 1, "noise_mode": "GPU(=A1111)", "interval": 1, "omit_start_latent": true, "omit_final_latent": true, "model": ["19", 0], "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["7", 0] }, "class_type": "KSamplerProgress //Inspire" },
  "59": { "inputs": { "select_decoder": "default", "pixel_shift_down_right": false, "tile_size": 512, "overlap": 64, "temporal_size": 64, "temporal_overlap": 8, "samples": ["58", 1], "vae": ["2", 0] }, "class_type": "VAEDecodePlusPlus" },
  "60": { "inputs": { "filename_prefix": "espejo_preview", "images": ["57", 0] }, "class_type": "SaveImage" },
  "61": { "inputs": { "enabled": true, "clean_gpu": true, "clean_cpu": true, "unload_models": 3, "anything": ["59", 0] }, "class_type": "RAMCleanup" },
  "62": { "inputs": { "system_prompt": ["63", 0], "user_prompt": "Write a DETAILED prompt in English for Z-Image Turbo image generation based on the description above. Must describe:\n- Gender, ethnicity, exact age range\n- Face shape, jawline, cheekbones\n- Eyes, eyebrows, eyelashes\n- Nose shape and profile\n- Lips thickness and shape\n- Skin texture, imperfections, wrinkles\n- Hair color, style, texture\n- Facial expression and mood\n- Lighting, framing, background\n- Visible clothing and accessories\n\nBe precise and descriptive. Minimum 100 words.", "model_path": "C:\\ComfyUI\\ComfyUI-Easy-Install\\ComfyUI\\models\\LLM\\Qwen3-VL-8B-Instruct-abliterated-v2.0.Q5_K_M.gguf", "mmproj_path": "C:\\ComfyUI\\ComfyUI-Easy-Install\\ComfyUI\\models\\LLM\\Qwen3-VL-8B-Instruct-abliterated-v2.0.mmproj-f16.gguf", "output_max_tokens": 1024, "image_max_tokens": 4096, "ctx": 8192, "n_batch": 512, "gpu_layers": -1, "temperature": 0.1, "seed": 806, "unload_all_models": false, "top_p": 0.92, "repeat_penalty": 1.2, "top_k": 0, "pool_size": 4194304, "image": ["11", 0] }, "class_type": "SimpleQwenVLgguf" },
  "63": { "inputs": { "system_preset": "🖼️ Z-Image Turbo Prompt" }, "class_type": "SimpleMasterPromptLoader" },
  "72": { "inputs": { "model_name": "Qwen3-VL-8B-Instruct-abliterated-v2.0.Q5_K_M.gguf", "prompt_text": ["64", 0], "preset_system_prompt": "📝 Enhance", "custom_system_prompt": "Translate the prompt to Argentinian Spanish. Just the exact same text, don't include reasoning or details.", "max_tokens": 1024, "temperature": 0.1, "top_p": 0.9, "repetition_penalty": 1.1, "english_output": false, "device": "auto", "seed": 42 }, "class_type": "AILab_QwenVL_GGUF_PromptEnhancer" },
  "64": { "inputs": { "text": ["62", 0] }, "class_type": "ShowText|pysssss" },
  "69": { "inputs": { "text": ["72", 0] }, "class_type": "ShowText|pysssss" },
  "75": { "inputs": { "text": ["76", 0] }, "class_type": "ShowText|pysssss" },
  "76": { "inputs": { "model_name": "Qwen3-VL-8B-Instruct-abliterated-v2.0.Q5_K_M.gguf", "prompt_text": ["64", 0], "preset_system_prompt": "📝 Enhance", "custom_system_prompt": "Usando este prompt como base, Genera una DESCRIPCIÓN ESTRUCTURADA en español de la persona en la foto. Solamente la lista de bullets, sin párrafos introductorios ni explicaciones. Cada línea debe empezar con un asterisco y un espacio, en este formato exacto:\n\n* Género: masculino/femenino\n* Edad aproximada: ej: ~30 años\n* Etnia: descripción\n* Forma del rostro: ovalada/redonda/corazón/cuadrada/alargada\n* Ojos: color, forma, tamaño, cejas\n* Nariz: forma, tamaño, perfil\n* Labios: grosor, forma\n* Piel: tono, textura, imperfecciones\n* Maquillaje: si aplica, tipo y colores (sombra, labial, base, etc.)\n* Vello facial: si aplica, barba/bigote/cejas tupidas, color, grosor\n* Cabello: color, largo, estilo, textura\n* Expresión: estado de ánimo, emoción\n* Iluminación/Ambiente: dirección de luz, temperatura, fondo\n* Ropa/Accessorios: visible en el retrato\n\nSé preciso y descriptivo. NO inventes nada que no esté. Solamente la lista de bullets, sin texto adicional antes ni después.", "max_tokens": 1024, "temperature": 0.1, "top_p": 0.9, "repetition_penalty": 1.1, "english_output": false, "device": "auto", "seed": 42 }, "class_type": "AILab_QwenVL_GGUF_PromptEnhancer" },
  "77": { "inputs": { "filename_prefix": "espejo_text", "format": "txt", "text": ["69", 0] }, "class_type": "SaveText" },
  "78": { "inputs": { "filename_prefix": "espejo_text", "format": "txt", "text": ["75", 0] }, "class_type": "SaveText" }
};

/**
 * Save captured photo to disk in ComfyUI input folder.
 */
function saveInputImage(base64Data, sessionId) {
  const clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(clean, 'base64');
  const filename = `espejo_capture_${sessionId}.png`;
  const filepath = path.join(COMFY_INPUT_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  console.log(`ComfyUI: saved input image -> ${filepath}`);
  return filename;
}

/**
 * Queue a prompt to ComfyUI and return the prompt_id.
 */
function queuePrompt(workflowJson, clientId) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ prompt: workflowJson, client_id: clientId });
    const req = http.request({
      hostname: COMFY_HOST,
      port: COMFY_PORT,
      path: '/api/prompt',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.prompt_id) resolve(parsed.prompt_id);
          else reject(new Error(`ComfyUI queue error: ${body}`));
        } catch (e) {
          reject(new Error(`ComfyUI parse error: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Poll history until output images are available, also extract text node outputs.
 * Returns { images: [...], texts: { prompt_en, prompt_es, descripcion } }
 */
function fetchOutputs(promptId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('ComfyUI fetch timed out')), 180000);
    const poll = () => {
      http.get(`http://${COMFY_HOST}:${COMFY_PORT}/api/history/${promptId}`, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const history = JSON.parse(body);
            const entry = history[promptId];
            if (!entry || !entry.outputs) { setTimeout(poll, 500); return; }

            const outputs = entry.outputs;
            const images = [];
            const texts = {};

            for (const nodeId of Object.keys(outputs)) {
              const nodeOut = outputs[nodeId];
              // Collect images
              if (nodeOut.images) {
                for (const img of nodeOut.images) {
                  images.push({ filename: img.filename, subfolder: img.subfolder || '', type: img.type || 'output' });
                }
              }
              // Collect text outputs from ShowText and SaveText nodes
              if (nodeOut.text) {
                const text = Array.isArray(nodeOut.text) ? nodeOut.text.join('') : String(nodeOut.text);
                if (nodeId === '64') texts.prompt_en = text;
                if (nodeId === '69') texts.prompt_es = text;
                if (nodeId === '75') texts.descripcion = text;
                if (nodeId === '77' && !texts.prompt_es) texts.prompt_es = text;
                if (nodeId === '78' && !texts.descripcion) texts.descripcion = text;
              }
            }

            if (images.length > 0) {
              clearTimeout(timeout);
              resolve({ images, texts });
              return;
            }
            setTimeout(poll, 500);
          } catch (e) { setTimeout(poll, 500); }
        });
      }).on('error', () => setTimeout(poll, 500));
    };
    poll();
  });
}

/**
 * Fetch an output image as base64 data URI.
 */
function fetchImageBase64(filename, subfolder, type) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ filename, subfolder, type }).toString();
    http.get(`http://${COMFY_HOST}:${COMFY_PORT}/api/view?${params}`, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const base64 = Buffer.concat(chunks).toString('base64');
        resolve(`data:image/png;base64,${base64}`);
      });
    }).on('error', reject);
  });
}

/**
 * Generate portrait from captured photo via ComfyUI (full pipeline: QwenVL + Z-Image Turbo).
 *
 * @param {string} photoBase64 - Captured photo (base64)
 * @param {string} sessionId - Session ID for file naming
 * @param {function} onStreamChunk - ({ channel, text_delta, done }) — text outputs as nodes execute
 * @param {function} onPreview - ({ step, total_steps, image_b64 })
 * @param {function} onComplete - ({ portrait_b64, canny_b64, previews })
 * @param {function} onError - (Error)
 */
async function generate(photoBase64, sessionId, onStreamChunk, onPreview, onComplete, onError) {
  try {
    const inputFilename = saveInputImage(photoBase64, sessionId);

    const workflow = JSON.parse(JSON.stringify(WORKFLOW));
    workflow["11"].inputs.image = inputFilename;

    const clientId = `espejo-${sessionId}`;

    // Connect WebSocket FIRST, then queue prompt
    const wsUrl = `ws://${COMFY_HOST}:${COMFY_PORT}/ws?clientId=${clientId}`;
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => { ws.on('open', resolve); });
    let wsClosed = false;
    const streamedChannels = new Set();

    // Now queue the prompt (WebSocket is ready to receive events)
    const promptId = await queuePrompt(workflow, clientId);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        // Node execution complete — extract text outputs
        if (msg.type === 'executed' && msg.data) {
          const { node, output } = msg.data;
          console.log(`ComfyUI node ${node} executed`);
          // Try multiple output formats — some nodes use 'text', others 'string'
          let nodeText = null;
          if (output) {
            if (typeof output === 'string') nodeText = output;
            else if (Array.isArray(output)) nodeText = output.join('');
            else if (output.text) nodeText = Array.isArray(output.text) ? output.text.join('') : String(output.text);
            else if (output.string) nodeText = Array.isArray(output.string) ? output.string.join('') : String(output.string);
            else if (output.output) nodeText = typeof output.output === 'string' ? output.output : JSON.stringify(output.output);
            // Fallback: try first property value that's a string
            if (!nodeText) {
              for (const k of Object.keys(output)) {
                const v = output[k];
                if (typeof v === 'string') { nodeText = v; break; }
                if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') { nodeText = v.join(''); break; }
              }
            }
          }
          if (nodeText) {
            const channelMap = { '64': 'prompt_en', '69': 'prompt_es', '75': 'descripcion' };
            const channel = channelMap[node];
            if (channel && onStreamChunk) {
              console.log(`ComfyUI stream: ${channel} (${nodeText.length} chars)`);
              streamedChannels.add(channel);
              onStreamChunk({ channel, text_delta: nodeText, done: true });
            }
          }
        }

        if (msg.type === 'progress' && msg.data) {
          const { value, max } = msg.data;
          if (onPreview && max > 0) onPreview({ step: value, total_steps: max });
        }
        if (msg.type === 'execution_success' && msg.data?.prompt_id === promptId) {
          if (!wsClosed) { ws.close(); wsClosed = true; }
        }
      } catch (e) {
        // Binary = preview image from ComfyUI
        if (Buffer.isBuffer(data) && data.length > 100 && onPreview) {
          onPreview({ image_b64: `data:image/png;base64,${data.toString('base64')}`, step: -1, total_steps: -1 });
        }
      }
    });
    ws.on('error', () => {});
    ws.on('close', () => { wsClosed = true; });

    // Fallback: poll history for texts that WebSocket missed (e.g. if node events arrived before listener)
    const resultData = await fetchOutputs(promptId);
    if (resultData.images.length === 0) throw new Error('No output images from ComfyUI');

    // Forward only text outputs from history that WebSocket didn't already catch
    const historyTexts = resultData.texts || {};
    for (const [channel, text] of Object.entries(historyTexts)) {
      if (!streamedChannels.has(channel) && text && onStreamChunk) {
        console.log(`ComfyUI history fallback: ${channel} (${text.length} chars)`);
        streamedChannels.add(channel);
        onStreamChunk({ channel, text_delta: text, done: true });
      }
    }

    const outputImages = resultData.images;
    console.log(`ComfyUI output images: ${outputImages.map(i => i.filename).join(', ')}`);

    // Categorize by filename prefix
    const portrait = outputImages.find(i => i.filename.startsWith('espejo_portrait'));
    const canny = outputImages.find(i => i.filename.startsWith('espejo_canny'));
    const previews = outputImages.filter(i => i.filename.startsWith('espejo_preview'));

    console.log(`ComfyUI categorized - portrait: ${!!portrait}, canny: ${!!canny}, previews: ${previews.length}`);

    const result = {};

    if (portrait) {
      result.portrait_b64 = await fetchImageBase64(portrait.filename, portrait.subfolder, portrait.type);
    }
    if (canny) {
      result.canny_b64 = await fetchImageBase64(canny.filename, canny.subfolder, canny.type);
    }
    if (previews.length > 0) {
      result.previews = await Promise.all(
        previews.map(p => fetchImageBase64(p.filename, p.subfolder, p.type))
      );
    }

    if (ws && !wsClosed) ws.close();
    onComplete(result);

  } catch (err) {
    console.error('ComfyUI error:', err.message);
    onError(err);
  }
}

module.exports = { generate };

