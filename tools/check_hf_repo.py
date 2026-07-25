"""Check HuggingFace repo for GGUF + mmproj files."""
import urllib.request, json

url = 'https://huggingface.co/api/models/OBLITERATUS/Qwen3.6-27B-OBLITERATED'
req = urllib.request.Request(url)
resp = urllib.request.urlopen(req, timeout=30)
data = json.loads(resp.read())

for s in data.get('siblings', []):
    name = s['rfilename']
    if name.endswith('.gguf') or 'mmproj' in name.lower():
        size_mb = s.get('size', 0) / 1024 / 1024
        print(f"{name} ({size_mb:.0f} MB)")
