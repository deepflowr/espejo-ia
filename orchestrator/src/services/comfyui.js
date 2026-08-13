/**
 * ComfyUI bridge — queues EspejoIA workflows.
 *
 * Two-phase pipeline:
 * 1. Text workflow (QwenVL): photo -> prompt_en, descripcion, prompt_es
 * 2. Image workflow (Z-Image Turbo): photo + prompt_en -> canny edge -> portrait
 *
 * Phase 2 is triggered as soon as prompt_en is ready (saves time).
 * Canny edge is sent to frontend as soon as it's generated.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const COMFY_HOST = 'localhost';
const COMFY_PORT = 8188;
const COMFY_INPUT_DIR = 'C:\\ComfyUI\\ComfyUI-Easy-Install\\ComfyUI\\input';

// --- Load both workflows -------------------------------------------
const TEXT_WF_PATH = path.join(__dirname, '..', '..', '..', 'EspejoIA_Qwen text generation.json');
const IMAGE_WF_PATH = path.join(__dirname, '..', '..', '..', 'EspejoIA_image.json');

let TEXT_WF = null;
let IMAGE_WF = null;
try {
  TEXT_WF = JSON.parse(fs.readFileSync(TEXT_WF_PATH, 'utf-8'));
  console.log('ComfyUI: loaded text workflow from ' + TEXT_WF_PATH);
} catch (e) {
  console.error('ComfyUI: failed to load text workflow: ' + e.message);
  process.exit(1);
}
try {
  IMAGE_WF = JSON.parse(fs.readFileSync(IMAGE_WF_PATH, 'utf-8'));
  console.log('ComfyUI: loaded image workflow from ' + IMAGE_WF_PATH);
} catch (e) {
  console.error('ComfyUI: failed to load image workflow: ' + e.message);
  process.exit(1);
}

function saveInputImage(base64Data, sessionId) {
  const clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(clean, 'base64');
  const filename = 'espejo_capture_' + sessionId + '.png';
  const filepath = path.join(COMFY_INPUT_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  console.log('ComfyUI: saved input image -> ' + filepath);
  return filename;
}

function queuePrompt(workflowJson, clientId) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ prompt: workflowJson, client_id: clientId });
    const req = http.request({
      hostname: COMFY_HOST, port: COMFY_PORT,
      path: '/api/prompt', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.prompt_id) resolve(parsed.prompt_id);
          else reject(new Error('ComfyUI queue error: ' + body));
        } catch (e) { reject(new Error('ComfyUI parse error: ' + body)); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/** Poll history until output images/texts are available. */
function fetchOutputs(promptId, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (!timeoutMs) timeoutMs = 180000;
    const timeout = setTimeout(function () { reject(new Error('ComfyUI fetch timed out')); }, timeoutMs);
    var poll = function () {
      http.get('http://' + COMFY_HOST + ':' + COMFY_PORT + '/api/history/' + promptId, function (res) {
        var body = '';
        res.on('data', function (chunk) { body += chunk; });
        res.on('end', function () {
          try {
            var history = JSON.parse(body);
            var entry = history[promptId];
            if (!entry || !entry.outputs) { setTimeout(poll, 500); return; }
            var outputs = entry.outputs;
            var images = [];
            var texts = {};
            for (var nodeId of Object.keys(outputs)) {
              var nodeOut = outputs[nodeId];
              if (nodeOut.images) {
                for (var img of nodeOut.images) {
                  images.push({ filename: img.filename, subfolder: img.subfolder || '', type: img.type || 'output' });
                }
              }
              if (nodeOut.text) {
                var text = Array.isArray(nodeOut.text) ? nodeOut.text.join('') : String(nodeOut.text);
                if (nodeId === '10') texts.prompt_en = text;
                if (nodeId === '11') texts.descripcion = text;
                if (nodeId === '12') texts.prompt_es = text;
              }
            }
            if (images.length > 0 || Object.keys(texts).length > 0) {
              clearTimeout(timeout);
              resolve({ images: images, texts: texts });
              return;
            }
            setTimeout(poll, 500);
          } catch (e) { setTimeout(poll, 500); }
        });
      }).on('error', function () { setTimeout(poll, 500); });
    };
    poll();
  });
}

/** Poll for a specific image by filename prefix. Resolves with image info or null. */
function pollForImage(promptId, prefix, timeoutMs) {
  return new Promise(function (resolve) {
    if (!timeoutMs) timeoutMs = 180000;
    var timeout = setTimeout(function () { resolve(null); }, timeoutMs);
    var poll = function () {
      http.get('http://' + COMFY_HOST + ':' + COMFY_PORT + '/api/history/' + promptId, function (res) {
        var body = '';
        res.on('data', function (chunk) { body += chunk; });
        res.on('end', function () {
          try {
            var history = JSON.parse(body);
            var entry = history[promptId];
            if (!entry || !entry.outputs) { setTimeout(poll, 300); return; }
            for (var nodeId of Object.keys(entry.outputs)) {
              var nodeOut = entry.outputs[nodeId];
              if (nodeOut.images) {
                for (var img of nodeOut.images) {
                  if (img.filename.startsWith(prefix)) {
                    clearTimeout(timeout);
                    resolve({ filename: img.filename, subfolder: img.subfolder || '', type: img.type || 'output' });
                    return;
                  }
                }
              }
            }
            setTimeout(poll, 300);
          } catch (e) { setTimeout(poll, 300); }
        });
      }).on('error', function () { setTimeout(poll, 300); });
    };
    poll();
  });
}

function fetchImageBase64(filename, subfolder, type) {
  return new Promise(function (resolve, reject) {
    var params = new URLSearchParams({ filename: filename, subfolder: subfolder, type: type }).toString();
    http.get('http://' + COMFY_HOST + ':' + COMFY_PORT + '/api/view?' + params, function (res) {
      var chunks = [];
      res.on('data', function (chunk) { chunks.push(chunk); });
      res.on('end', function () {
        resolve('data:image/png;base64,' + Buffer.concat(chunks).toString('base64'));
      });
    }).on('error', reject);
  });
}

/**
 * Parse a ComfyUI binary WS frame (denoise preview / bpreview).
 * Format: [uint32 type_len][uint32 data_len][type_json][data_json][binary_image]
 */
function parseBinaryFrame(buf) {
  if (!buf || buf.length < 8) return null;
  var typeLen = buf.readUInt32BE(0);
  var dataLen = buf.readUInt32BE(4);
  var offset = 8;
  if (offset + typeLen + dataLen > buf.length) {
    // try little-endian
    typeLen = buf.readUInt32LE(0);
    dataLen = buf.readUInt32LE(4);
    offset = 8;
    if (offset + typeLen + dataLen > buf.length) return null;
  }
  var typeStr = buf.slice(offset, offset + typeLen).toString('utf8');
  var dataStr = buf.slice(offset + typeLen, offset + typeLen + dataLen).toString('utf8');
  var binary = buf.slice(offset + typeLen + dataLen);
  var parsed = null;
  try { parsed = JSON.parse(dataStr); } catch (e) { parsed = null; }
  return { type: typeStr, data: parsed, binary: binary };
}

/**
 * Queue the image workflow with the captured photo and prompt_en.
 * Polls aggressively for canny edge and sends it via callback as soon as ready.
 */
async function queueImageWorkflow(inputFilename, promptEnText, clientId, onCannyReady) {
  var imgWf = JSON.parse(JSON.stringify(IMAGE_WF));
  imgWf["11"].inputs.image = inputFilename;
  imgWf["4"].inputs.text = promptEnText;
  imgWf["5"].inputs.text = '';

  var imgClientId = clientId + '-img';
  var imagePromptId = await queuePrompt(imgWf, imgClientId);
  console.log('ComfyUI: image workflow queued (prompt_id: ' + imagePromptId + ')');

  // Poll for canny edge (node 56 = "Canny" prefix) as soon as available
  pollForImage(imagePromptId, 'Canny', 300000).then(async function (cannyImg) {
    if (cannyImg && onCannyReady) {
      console.log('ComfyUI: canny edge ready, sending to frontend');
      var b64 = await fetchImageBase64(cannyImg.filename, cannyImg.subfolder, cannyImg.type);
      onCannyReady({ image_b64: b64 });
    }
  }).catch(function (err) {
    console.warn('ComfyUI: canny poll error: ' + err.message);
  });

  return imagePromptId;
}

/**
 * Generate portrait from captured photo via two-phase ComfyUI pipeline.
 *
 * Phase 1 (text): QwenVL workflow -> streams descripcion, prompt_es
 * Phase 2 (image): Triggered when prompt_en arrives -> Z-Image Turbo
 *
 * Callbacks:
 *   onStreamChunk({ channel, text_delta, done }) - text outputs
 *   onPreview({ step, total_steps, image_b64 }) - progress
 *   onCannyReady({ image_b64 }) - canny edge immediately when ready
 *   onComplete({ portrait_b64, canny_b64 }) - final outputs
 *   onError(Error)
 */
async function generate(photoBase64, sessionId, onStreamChunk, onPreview, onCannyReady, onComplete, onError) {
  try {
    var inputFilename = saveInputImage(photoBase64, sessionId);
    var clientId = 'espejo-' + sessionId;

    // --- Phase 1: Text workflow ---------------------------------
    var textWf = JSON.parse(JSON.stringify(TEXT_WF));
    textWf["1"].inputs.image = inputFilename;

    var wsUrl = 'ws://' + COMFY_HOST + ':' + COMFY_PORT + '/ws?clientId=' + clientId;
    var ws = new WebSocket(wsUrl);
    var wsReady = await new Promise(function (resolve) {
      var t = setTimeout(function () { ws.close(); resolve(false); }, 5000);
      ws.on('open', function () { clearTimeout(t); resolve(true); });
      ws.on('error', function () { clearTimeout(t); resolve(false); });
    });
    if (!wsReady) throw new Error('ComfyUI WebSocket connection failed');
    var wsClosed = false;
    var streamedChannels = new Set();
    var imagePromptId = null;

    var textPromptId = await queuePrompt(textWf, clientId);

    var lastProgressStep = 0;
    var lastProgressMax = 0;
    ws.on('message', function (data) {
      // Binary preview frame (denoise progression) — ComfyUI bpreview
      if (Buffer.isBuffer(data) && data.length > 8) {
        var frame = parseBinaryFrame(data);
        if (frame && frame.binary && frame.binary.length > 100 && onPreview) {
          onPreview({
            image_b64: 'data:image/png;base64,' + frame.binary.toString('base64'),
            step: lastProgressStep,
            total_steps: lastProgressMax,
          });
          return;
        }
      }
      try {
        var msg = JSON.parse(data.toString());
        if (msg.type === 'executed' && msg.data) {
          var node = msg.data.node;
          var output = msg.data.output;

          // Extract text from text workflow nodes
          var nodeText = null;
          if (output) {
            if (typeof output === 'string') nodeText = output;
            else if (Array.isArray(output)) nodeText = output.join('');
            else if (output.text) nodeText = Array.isArray(output.text) ? output.text.join('') : String(output.text);
            else if (output.string) nodeText = Array.isArray(output.string) ? output.string.join('') : String(output.string);
            else if (output.output) nodeText = typeof output.output === 'string' ? output.output : JSON.stringify(output.output);
            if (!nodeText) {
              for (var k of Object.keys(output)) {
                var v = output[k];
                if (typeof v === 'string') { nodeText = v; break; }
                if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') { nodeText = v.join(''); break; }
              }
            }
          }
          if (nodeText) {
            var channelMap = { '10': 'prompt_en', '11': 'descripcion', '12': 'prompt_es' };
            var channel = channelMap[node];
            console.log('ComfyUI WS: node=' + node + ' channel=' + channel + ' imagePromptId=' + imagePromptId);
            if (channel && onStreamChunk) {
              streamedChannels.add(channel);
              onStreamChunk({ channel: channel, text_delta: nodeText, done: true });
              // Phase 2 trigger: prompt_en ready -> queue image workflow
              if (channel === 'prompt_en' && !imagePromptId) {
                console.log('ComfyUI: prompt_en received via WS - queuing image workflow...');
                queueImageWorkflow(inputFilename, nodeText, clientId, onCannyReady)
                  .then(function (id) { imagePromptId = id; console.log('ComfyUI: image workflow queued (prompt_id: ' + id + ')'); })
                  .catch(function (err) { console.error('ComfyUI: image workflow error: ' + err.message); });
              }
            }
          }
        }
        if (msg.type === 'progress' && msg.data) {
          var value = msg.data.value;
          var max = msg.data.max;
          lastProgressStep = value;
          lastProgressMax = max;
          if (onPreview && max > 0) onPreview({ step: value, total_steps: max });
        }
        if (msg.type === 'execution_success' && msg.data && msg.data.prompt_id === textPromptId) {
          if (!wsClosed) { ws.close(); wsClosed = true; }
        }
      } catch (e) {
        console.warn('ComfyUI WS handler error: ' + (e && e.message ? e.message : e));
      }
    });
    ws.on('error', function () {});
    ws.on('close', function () { wsClosed = true; });

    // Fallback: poll history for texts WS might have missed
    var textResult = await fetchOutputs(textPromptId, 180000);
    var historyTexts = textResult.texts || {};
    for (var ch in historyTexts) {
      if (historyTexts.hasOwnProperty(ch) && !streamedChannels.has(ch) && historyTexts[ch] && onStreamChunk) {
        streamedChannels.add(ch);
        onStreamChunk({ channel: ch, text_delta: historyTexts[ch], done: true });
        if (ch === 'prompt_en' && !imagePromptId) {
          console.log('ComfyUI: prompt_en from history - queuing image workflow...');
          queueImageWorkflow(inputFilename, historyTexts[ch], clientId, onCannyReady)
            .then(function (id) { imagePromptId = id; })
            .catch(function (err) { console.error('ComfyUI: image workflow error: ' + err.message); });
        }
      }
    }

    // Wait for image workflow to be queued (race condition guard)
    if (!imagePromptId) {
      console.log('ComfyUI: waiting for image workflow to be queued...');
      for (var wait = 0; wait < 100 && !imagePromptId; wait++) {
        await new Promise(function (r) { setTimeout(r, 100); });
      }
    }
    if (imagePromptId) {
      console.log('ComfyUI: image workflow prompt_id = ' + imagePromptId);
    } else {
      console.warn('ComfyUI: image workflow was NOT queued (prompt_en never received?)');
    }

    // --- Wait for image workflow to complete --------------------
    var finalResult = { portrait_b64: null, canny_b64: null, steps: [] };

    if (imagePromptId) {
      console.log('ComfyUI: waiting for image workflow outputs...');
      var imgResult = await fetchOutputs(imagePromptId, 300000);
      var outputImages = imgResult.images || [];

      var cannyImg = null;
      var portraitImg = null;
      var stepImgs = [];
      for (var i = 0; i < outputImages.length; i++) {
        var img = outputImages[i];
        // Only pick saved outputs (type 'output'), not PreviewImage temp intermediates
        if (img.filename.startsWith('Canny') && img.type === 'output') cannyImg = img;
        if (img.filename.startsWith('Espejo_Step') && img.type === 'output') stepImgs.push(img);
        if (img.filename.startsWith('Espejo_Final') && img.type === 'output') portraitImg = img;
      }
      // Fallback if no typed output found (older workflow naming)
      if (!portraitImg) {
        for (var i = 0; i < outputImages.length; i++) {
          var img = outputImages[i];
          if (img.filename.startsWith('Espejo_Final')) { portraitImg = img; break; }
          if (img.filename.startsWith('ComfyUI')) portraitImg = img; // legacy
        }
      }

      if (cannyImg && !finalResult.canny_b64) {
        finalResult.canny_b64 = await fetchImageBase64(cannyImg.filename, cannyImg.subfolder, cannyImg.type);
        console.log('ComfyUI: canny edge fetched from final poll');
      }
      // Denoise progression steps (saved in order by filename counter)
      stepImgs.sort(function (a, b) { return a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0; });
      for (var i = 0; i < stepImgs.length; i++) {
        try {
          finalResult.steps.push(await fetchImageBase64(stepImgs[i].filename, stepImgs[i].subfolder, stepImgs[i].type));
        } catch (e) { /* skip unreadable step */ }
      }
      if (finalResult.steps.length > 0) console.log('ComfyUI: ' + finalResult.steps.length + ' step previews fetched');
      if (portraitImg) {
        finalResult.portrait_b64 = await fetchImageBase64(portraitImg.filename, portraitImg.subfolder, portraitImg.type);
        console.log('ComfyUI: portrait fetched');
      }
    }

    if (ws && !wsClosed) ws.close();
    onComplete(finalResult);

  } catch (err) {
    console.error('ComfyUI error: ' + err.message);
    onError(err);
  }
}

module.exports = { generate };
