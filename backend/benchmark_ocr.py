"""
GateShield OCR concurrency benchmark.

Fires N simultaneous CNIC / DLS requests (N = 1, 2, 3, 4 by default) at a running
OCR service, and records:
- per-request completion time and total wall time per level
- stage timings / queue wait (if the server sets X-OCR-Timing, i.e. OCR_TIMING_HEADER=1)
- peak RSS of the server process tree and CPU utilisation while the level runs
- parsed OCR output for every request (for accuracy comparison)

Usage (from backend/):
    venv\\Scripts\\python.exe benchmark_ocr.py --url http://127.0.0.1:8000 --label new_3x2 --out results_new.json
    venv\\Scripts\\python.exe benchmark_ocr.py --compare results_baseline.json results_new.json

This script only sends normal OCR requests; it does not change the service.
"""

from __future__ import annotations

import argparse
import json
import statistics
import threading
import time
from pathlib import Path
from urllib.parse import urlparse

import psutil
import requests

SAMPLES = Path(__file__).resolve().parent / "samples"
IMAGES = {
    "cnic": ["smart_cnic.jpg", "cnic_front.jpg", "old_cnic.jpg"],
    "dls": ["dls_newer.jpg", "dls_older.jpg"],
}


def find_server_pid(port: int) -> int | None:
    for conn in psutil.net_connections(kind="tcp"):
        if conn.laddr and conn.laddr.port == port and conn.status == psutil.CONN_LISTEN:
            return conn.pid
    return None


def process_tree(pid: int) -> list[psutil.Process]:
    try:
        root = psutil.Process(pid)
        return [root] + root.children(recursive=True)
    except psutil.NoSuchProcess:
        return []


def tree_rss_mb(pid: int) -> tuple[float, int]:
    total, count = 0, 0
    for p in process_tree(pid):
        try:
            total += p.memory_info().rss
            count += 1
        except psutil.Error:
            pass
    return total / (1024 * 1024), count


class Sampler(threading.Thread):
    def __init__(self, pid: int | None, interval: float = 0.25):
        super().__init__(daemon=True)
        self.pid, self.interval = pid, interval
        self.stop_event = threading.Event()
        self.rss: list[float] = []
        self.cpu: list[float] = []

    def run(self) -> None:
        psutil.cpu_percent(interval=None)
        while not self.stop_event.is_set():
            time.sleep(self.interval)
            self.cpu.append(psutil.cpu_percent(interval=None))
            if self.pid:
                self.rss.append(tree_rss_mb(self.pid)[0])

    def summary(self) -> dict:
        return {
            "peak_rss_mb": round(max(self.rss), 1) if self.rss else None,
            "avg_cpu_pct": round(statistics.mean(self.cpu), 1) if self.cpu else None,
            "peak_cpu_pct": round(max(self.cpu), 1) if self.cpu else None,
        }


def one_request(url: str, kind: str, image: str, barrier: threading.Barrier, out: list, idx: int) -> None:
    data = (SAMPLES / image).read_bytes()
    barrier.wait()
    start = time.perf_counter()
    try:
        r = requests.post(
            f"{url}/scan-{kind}",
            files={"file": (image, data, "image/jpeg")},
            timeout=600,
        )
        elapsed = time.perf_counter() - start
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        timing = json.loads(r.headers["X-OCR-Timing"]) if "X-OCR-Timing" in r.headers else None
        out[idx] = {
            "kind": kind, "image": image, "status": r.status_code,
            "latency_s": round(elapsed, 3), "timing": timing,
            "parsed": body.get("parsed"), "text_count": len(body.get("text", []) or []),
            "response_bytes": len(r.content),
        }
    except Exception as exc:
        out[idx] = {"kind": kind, "image": image, "status": "error", "error": str(exc),
                    "latency_s": round(time.perf_counter() - start, 3)}


def run_level(url: str, kind: str, n: int, pid: int | None) -> dict:
    images = IMAGES[kind]
    barrier = threading.Barrier(n)
    results: list = [None] * n
    threads = [
        threading.Thread(target=one_request, args=(url, kind, images[i % len(images)], barrier, results, i))
        for i in range(n)
    ]
    sampler = Sampler(pid)
    sampler.start()
    wall_start = time.perf_counter()
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    wall = time.perf_counter() - wall_start
    sampler.stop_event.set()
    sampler.join()

    latencies = [r["latency_s"] for r in results]
    queue_waits = [r["timing"]["queue_wait_s"] for r in results if r.get("timing")]
    return {
        "kind": kind, "concurrency": n,
        "wall_s": round(wall, 2),
        "latency_min_s": round(min(latencies), 2),
        "latency_avg_s": round(statistics.mean(latencies), 2),
        "latency_max_s": round(max(latencies), 2),
        "queue_wait_max_s": round(max(queue_waits), 2) if queue_waits else None,
        "errors": sum(1 for r in results if r.get("status") != 200),
        **sampler.summary(),
        "requests": results,
    }


def benchmark(args) -> None:
    port = urlparse(args.url).port or 80
    pid = find_server_pid(port)
    idle_rss, proc_count = tree_rss_mb(pid) if pid else (None, 0)
    print(f"[{args.label}] server pid={pid} processes={proc_count} idle_rss={idle_rss and round(idle_rss)} MB")

    # One untimed warm request per kind so lazily-initialised baselines are comparable.
    for kind in args.kinds:
        run_level(args.url, kind, 1, None)

    levels = []
    for kind in args.kinds:
        for n in args.levels:
            res = run_level(args.url, kind, n, pid)
            levels.append(res)
            print(
                f"[{args.label}] {kind.upper()} x{n}: wall={res['wall_s']}s "
                f"lat(avg/max)={res['latency_avg_s']}/{res['latency_max_s']}s "
                f"queue_max={res['queue_wait_max_s']} peakRSS={res['peak_rss_mb']}MB "
                f"cpu(avg/peak)={res['avg_cpu_pct']}/{res['peak_cpu_pct']}% errors={res['errors']}"
            )
            time.sleep(args.pause)

    summary = {
        "label": args.label, "url": args.url,
        "server_processes": proc_count, "idle_rss_mb": idle_rss and round(idle_rss, 1),
        "cpu_count": psutil.cpu_count(), "levels": levels,
    }
    Path(args.out).write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Saved {args.out}")


def compare(a_path: str, b_path: str) -> None:
    """Compare parsed OCR outputs per image between two result files."""
    def parsed_by_image(path):
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        out: dict[str, list] = {}
        for lvl in data["levels"]:
            for r in lvl["requests"]:
                out.setdefault(f'{r["kind"]}:{r["image"]}', []).append(r.get("parsed"))
        return data["label"], out

    la, a = parsed_by_image(a_path)
    lb, b = parsed_by_image(b_path)
    all_match = True
    for key in sorted(set(a) | set(b)):
        ref = a.get(key, [None])[0]
        variants_a = {json.dumps(p, sort_keys=True) for p in a.get(key, [])}
        variants_b = {json.dumps(p, sort_keys=True) for p in b.get(key, [])}
        same = variants_a == variants_b and len(variants_b) == 1
        all_match &= same
        print(f"{'MATCH' if same else 'DIFF '}  {key}  ({la}: {len(variants_a)} variant(s), {lb}: {len(variants_b)} variant(s))")
        if not same:
            for p in variants_b - variants_a:
                print(f"   {lb} only: {p}")
            print(f"   {la} ref : {json.dumps(ref, sort_keys=True)}")
    print("ALL OUTPUTS IDENTICAL" if all_match else "OUTPUT DIFFERENCES FOUND")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8000")
    ap.add_argument("--label", default="run")
    ap.add_argument("--out", default="benchmark_results.json")
    ap.add_argument("--levels", default="1,2,3,4")
    ap.add_argument("--kinds", default="cnic,dls")
    ap.add_argument("--pause", type=float, default=2.0)
    ap.add_argument("--compare", nargs=2, metavar=("A_JSON", "B_JSON"))
    args = ap.parse_args()
    if args.compare:
        compare(*args.compare)
    else:
        args.levels = [int(x) for x in args.levels.split(",")]
        args.kinds = [k.strip() for k in args.kinds.split(",")]
        benchmark(args)
