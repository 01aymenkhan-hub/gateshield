"""Provision pinned offline Urdu-worker assets. Downloads NO identity images.

python provision_urdu.py --destination C:/private/urdu-worker
Run once during deployment; runtime inference never downloads model code.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import sys
import tarfile
import zipfile

import requests

REVISION = '52d6c8ffea26cc873ac5ad116f8631268d7eb503'
ASSETS = {
    'Qwen3VL-2B-Instruct-Q4_K_M.gguf': '089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae',
    'mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf': 'f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82',
}
RUNTIMES = {
    'win32': ('llama-b12020-bin-win-cpu-x64.zip', '07e81782f5a16c7ffef42403183808e02f271c9ece3aa2d64040b2620ae8d519'),
    'linux': ('llama-b12020-bin-ubuntu-x64.tar.gz', '1b69032f9ab60dc6aa909689fda941fa1b9162f6ab46b863582d5649d96ac6be'),
}


def digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def download(url, target, expected):
    if target.exists() and digest(target) == expected:
        return
    partial = target.with_name(target.name + '.partial')
    print('Downloading', target.name, flush=True)
    with requests.get(url, stream=True, timeout=(15, 90)) as response:
        response.raise_for_status()
        with partial.open('wb') as handle:
            for chunk in response.iter_content(1024 * 1024):
                handle.write(chunk)
    if digest(partial) != expected:
        raise ValueError('Asset integrity check failed: ' + target.name)
    partial.replace(target)


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument('--destination', type=Path, required=True)
    args = cli.parse_args()
    if sys.platform not in RUNTIMES:
        cli.error('This provisioner supports Windows x64 and Ubuntu x64.')
    root = args.destination.resolve()
    root.mkdir(parents=True, exist_ok=True)
    models = root / 'models'; models.mkdir(exist_ok=True)
    runtime = root / 'runtime'; runtime.mkdir(exist_ok=True)
    for name, sha in ASSETS.items():
        download(f'https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/{REVISION}/{name}', models / name, sha)
    archive_name, sha = RUNTIMES[sys.platform]
    archive = root / archive_name
    download(f'https://github.com/ggml-org/llama.cpp/releases/download/b12020/{archive_name}', archive, sha)
    if archive_name.endswith('.zip'):
        with zipfile.ZipFile(archive) as handle:
            if any(not (runtime / name).resolve().is_relative_to(runtime) for name in handle.namelist()):
                raise ValueError('Unsafe runtime archive entry.')
            handle.extractall(runtime)
    else:
        with tarfile.open(archive) as handle:
            handle.extractall(runtime, filter='data')
    binary = next(runtime.rglob('llama-server.exe' if sys.platform == 'win32' else 'llama-server'))
    if sys.platform != 'win32': binary.chmod(0o755)
    licenses = root / 'licenses'; licenses.mkdir(exist_ok=True)
    for name, url in {
        'Qwen-Apache-2.0.txt': 'https://www.apache.org/licenses/LICENSE-2.0.txt',
        'llama.cpp-MIT.txt': 'https://raw.githubusercontent.com/ggml-org/llama.cpp/b12020/LICENSE',
    }.items():
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        (licenses / name).write_text(response.text, encoding='utf8')
    key = root / 'worker.key'
    if not key.exists():
        with os.fdopen(os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as handle:
            handle.write(secrets.token_urlsafe(48))
    configuration = {
        'OCR_URDU_URL': 'http://127.0.0.1:8011',
        'OCR_URDU_BINARY': str(binary),
        'OCR_URDU_MODEL': str(models / 'Qwen3VL-2B-Instruct-Q4_K_M.gguf'),
        'OCR_URDU_MMPROJ': str(models / 'mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf'),
        'OCR_URDU_KEY_FILE': str(key),
    }
    (root / 'worker-paths.json').write_text(json.dumps(configuration, indent=2), encoding='utf8')
    print(json.dumps(configuration, indent=2))


if __name__ == '__main__': main()
