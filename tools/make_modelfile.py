"""Create Ollama Modelfile for espejo-vl with thinking support."""
import os

content = (
    'FROM C:\\ComfyUI\\ComfyUI-Easy-Install\\ComfyUI\\models\\LLM\\Qwen3-VL-8B-Instruct-abliterated-v2.0.Q5_K_M.gguf\n'
    'ADAPTER C:\\ComfyUI\\ComfyUI-Easy-Install\\ComfyUI\\models\\LLM\\Qwen3-VL-8B-Instruct-abliterated-v2.0.mmproj-f16.gguf\n'
    'TEMPLATE """<|im_start|>system\n'
    '{{ .System }}<|im_end|>\n'
    '<|im_start|>user\n'
    '{{ .Prompt }}<|im_end|>\n'
    '<|im_start|>assistant\n'
    '"""\n'
    'PARAMETER stop <|im_end|>\n'
    'PARAMETER stop <|endoftext|>\n'
)

path = os.path.join(os.environ['TEMP'], 'espejo.Modelfile')
with open(path, 'w') as f:
    f.write(content)
print(f'Modelfile written to {path}')
