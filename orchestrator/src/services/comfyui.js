/**
 * ComfyUI bridge — queues the EspejoIA workflow and streams progress.
 *
 * Sends the captured photo + prompt_en to ComfyUI via its API,
 * tracks execution via WebSocket, and forwards preview images.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const COMFY_HOST = 'localhost';
const COMFY_PORT = 8188;
const COMFY_INPUT_DIR = 'C:\\ComfyUI\\ComfyUI-Easy-Install\\ComfyUI\\input';

// ─── API-exported workflow with placeholder markers ───────────
const WORKFLOW = {
  "2": { "inputs": { "vae_name": "diffusion_pytorch_model.safetensors" }, "class_type": "VAELoader" },
  "3": { "inputs": { "clip_name": "qwen_3_4b.safetensors", "type": "lumina2", "device": "default" }, "class_type": "CLIPLoader" },
  "4": { "inputs": { "text": "{{PROMPT_EN}}", "clip": ["3", 0] }, "class_type": "CLIPTextEncode" },
  "5": { "inputs": { "text": "", "clip": ["3", 0] }, "class_type": "CLIPTextEncode" },
  "6": { "inputs": { "seed": 0, "steps": 8, "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "denoise": 1, "model": ["19", 0], "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["7", 0] }, "class_type": "KSampler" },
  "7": { "inputs": { "width": 1024, "height": 1024, "batch_size": 1 }, "class_type": "EmptyLatentImage" },
  "8": { "inputs": { "select_decoder": "default", "pixel_shift_down_right": false, "tile_size": 512, "overlap": 64, "temporal_size": 64, "temporal_overlap": 8, "samples": ["6", 0], "vae": ["2", 0] }, "class_type": "VAEDecodePlusPlus" },
  "9": { "inputs": { "enabled": true, "clean_gpu": true, "clean_cpu": true, "unload_models": 3, "anything": ["8", 0] }, "class_type": "RAMCleanup" },
  "10": { "inputs": { "filename_prefix": "espejo_output", "images": ["8", 0] }, "class_type": "SaveImage" },
  "11": { "inputs": { "image": "{{INPUT_IMAGE}}" }, "class_type": "LoadImage" },
  "18": { "inputs": { "name": "Z-Image-Turbo-Fun-Controlnet-Union.safetensors" }, "class_type": "ModelPatchLoader" },
  "19": { "inputs": { "strength": 0.9, "model": ["53", 0], "model_patch": ["18", 0], "vae": ["2", 0], "image": ["49", 0] }, "class_type": "QwenImageDiffsynthControlnet" },
  "22": { "inputs": { "images": ["49", 0] }, "class_type": "PreviewImage" },
  "49": { "inputs": { "preprocessor": "LineartStandardPreprocessor", "resolution": 512, "image": ["11", 0] }, "class_type": "AIO_Preprocessor" },
  "53": { "inputs": { "unet_name": "z_image_turbo_fp8_e4m3fn.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader" }
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
function queuePrompt(workflowJson) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ prompt: workflowJson });
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
 * Poll history until output images are available.
 */
function fetchOutputs(promptId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('ComfyUI fetch timed out')), 120000);
    const poll = () => {
      http.get(`http://${COMFY_HOST}:${COMFY_PORT}/api/history/${promptId}`, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const history = JSON.parse(body);
            const outputs = history[promptId]?.outputs;
            if (outputs) {
              const images = [];
              for (const nodeId of Object.keys(outputs)) {
                const nodeOut = outputs[nodeId];
                if (nodeOut.images) {
                  for (const img of nodeOut.images) {
                    images.push({ filename: img.filename, subfolder: img.subfolder || '', type: img.type || 'output' });
                  }
                }
              }
              if (images.length > 0) { clearTimeout(timeout); resolve(images); return; }
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
 * Generate an image from prompt + photo via ComfyUI.
 *
 * @param {string} promptEn - English prompt
 * @param {string} photoBase64 - Captured photo (base64)
 * @param {string} sessionId - Session ID for file naming
 * @param {function} onPreview - ({ step, total_steps, image_b64 })
 * @param {function} onComplete - ({ image_b64 })
 * @param {function} onError - (Error)
 */
async function generate(promptEn, photoBase64, sessionId, onPreview, onComplete, onError) {
  try {
    const inputFilename = saveInputImage(photoBase64, sessionId);

    const workflowStr = JSON.stringify(WORKFLOW)
      .replace('{{PROMPT_EN}}', promptEn.replace(/"/g, '\\"'))
      .replace('{{INPUT_IMAGE}}', inputFilename);
    const workflow = JSON.parse(workflowStr);

    const promptId = await queuePrompt(workflow);
    console.log(`ComfyUI: queued prompt ${promptId}`);

    // Track progress via WebSocket
    const wsUrl = `ws://${COMFY_HOST}:${COMFY_PORT}/ws?clientId=espejo-${sessionId}`;
    const ws = new WebSocket(wsUrl);
    let wsClosed = false;

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
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

    const outputImages = await fetchOutputs(promptId);
    if (outputImages.length === 0) throw new Error('No output images from ComfyUI');

    const output = outputImages[0];
    const resultBase64 = await fetchImageBase64(output.filename, output.subfolder, output.type);

    if (ws && !wsClosed) ws.close();
    onComplete({ image_b64: resultBase64 });

  } catch (err) {
    console.error('ComfyUI error:', err.message);
    onError(err);
  }
}

module.exports = { generate };

