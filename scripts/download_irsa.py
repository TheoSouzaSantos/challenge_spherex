# AI-Assisted: the image download script generated with Claude Code (Anthropic) and reviewed by the team.
"""Download the SPHEREx images listed in data/irsa_snapshot/links.csv, skipping what is already saved.

By default it saves a CUT-OUT around each search centre (IMAGE, FLAGS and ZODI, a few tens of KB each),
read straight from NASA's open data bucket on AWS, with IRSA's cut-out service as the fallback. The
full images are ~65 MB each (4,455 of them would be ~290 GB), so --full is there only for a few files.

    .venv/Scripts/python scripts/download_irsa.py                  # all missing cut-outs (6' wide)
    .venv/Scripts/python scripts/download_irsa.py --query wise-0855 --size 0.2
    .venv/Scripts/python scripts/download_irsa.py --full --query wise-0855 --limit 5

Progress is kept in data/irsa_snapshot/downloads.json, so it can be stopped and started at any time.
Files go to data/irsa_snapshot/cutouts/<query>/ (or full/<query>/).
"""
import argparse
import csv
import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import s3  # noqa: E402

OUT = ROOT / "data" / "irsa_snapshot"
STATE = OUT / "downloads.json"
CUT_SIZE_DEG = 0.1          # 6 arcmin, the same size the cutout_url column in links.csv uses
WORKERS = 12              # S3 copes easily; IRSA's cut-out service is only the fallback
DONE = {"ok", "outside"}    # "outside": the search circle touched the image but the centre is off the detector
_lock = threading.Lock()


def load_links():
    path = OUT / "links.csv"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_state():
    return json.loads(STATE.read_text()) if STATE.exists() else {}


def save_state(state):
    tmp = STATE.with_suffix(".part")
    tmp.write_text(json.dumps(state, indent=1))
    tmp.replace(STATE)


def state_key(row, full):
    return f"{'full' if full else 'cut'}|{row['query']}|{row['s3_key']}"


def dest(row, full):
    name = Path(row["s3_key"] or row["irsa_url"]).name
    return OUT / ("full" if full else "cutouts") / row["query"] / name


def pending(full=False, query=None):
    state = load_state()
    rows = [r for r in load_links() if not query or r["query"] == query]
    return [r for r in rows if state.get(state_key(r, full), {}).get("status") not in DONE]


def _looks_fits(path):
    try:
        with open(path, "rb") as f:
            return f.read(6) == b"SIMPLE"
    except OSError:
        return False


def _stream(url, path, timeout=180):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".part")
    with requests.get(url, stream=True, timeout=timeout) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 16):
                f.write(chunk)
    if not _looks_fits(tmp):
        tmp.unlink(missing_ok=True)
        raise ValueError("not a FITS file (probably an error page)")
    tmp.replace(path)
    return path.stat().st_size


def fetch_one(row, full, size, sources):
    """Returns (status, source, bytes, error)."""
    path = dest(row, full)
    errors = []
    ra = float(row["center_ra"]) if row.get("center_ra") not in (None, "", "None") else None
    dec = float(row["center_dec"]) if row.get("center_dec") not in (None, "", "None") else None
    for src in sources:
        try:
            if full:
                url = row["s3_url"] if src == "s3" else row["irsa_url"]
                if not url:
                    continue
                return "ok", src, _stream(url, path), ""
            if ra is None:
                return "failed", "", 0, "no search centre for this query"
            if src == "s3" and row["s3_key"]:
                path.parent.mkdir(parents=True, exist_ok=True)
                got = s3.cutout(row["s3_key"], ra, dec, size, path)
                if got is None:
                    return "outside", "s3", 0, ""
                return "ok", "s3", path.stat().st_size, ""
            if src == "irsa":
                url = f"{row['irsa_url']}?center={ra:.6f},{dec:.6f}d&size={size:.4f}"
                return "ok", "irsa", _stream(url, path), ""
        except Exception as e:  # noqa: BLE001 - try the next source, report the reason
            errors.append(f"{src}: {type(e).__name__} {str(e)[:120]}")
    return "failed", "", 0, "; ".join(errors) or "no source available"


def download_missing(full=False, size=CUT_SIZE_DEG, workers=WORKERS, limit=None, query=None,
                     sources=("s3", "irsa"), log=print):
    """Download what is missing. Returns a summary dict."""
    todo = pending(full, query)
    total_todo = len(todo)
    if limit:
        todo = todo[:limit]
    state = load_state()
    counts = {"ok": 0, "outside": 0, "failed": 0}
    if not todo:
        log("  nothing left to download")
        return {**counts, "remaining": 0}
    log(f"  downloading {len(todo)} of {total_todo} missing {'full images' if full else 'cut-outs'} "
        f"(sources: {', '.join(sources)})")
    t0 = time.time()
    with ThreadPoolExecutor(workers) as ex:
        futs = {ex.submit(fetch_one, r, full, size, sources): r for r in todo}
        for i, fut in enumerate(as_completed(futs), 1):
            r = futs[fut]
            status, src, nbytes, err = fut.result()
            counts[status] += 1
            with _lock:
                state[state_key(r, full)] = {
                    "status": status, "source": src, "bytes": nbytes, "error": err,
                    "file": str(dest(r, full).relative_to(OUT)) if status == "ok" else None,
                    "utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                }
                if i % 25 == 0 or i == len(todo):
                    save_state(state)
            if i % 50 == 0 or i == len(todo):
                log(f"  {i}/{len(todo)} · saved {counts['ok']} · off-detector {counts['outside']} · failed {counts['failed']} "
                    f"· {time.time() - t0:.0f}s")
    remaining = len(pending(full, query))
    log(f"  done: {counts['ok']} saved, {counts['outside']} off the detector, {counts['failed']} failed, {remaining} still missing")
    return {**counts, "remaining": remaining}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--full", action="store_true", help="whole images (~65 MB each) instead of cut-outs")
    ap.add_argument("--size", type=float, default=CUT_SIZE_DEG, help="cut-out width in degrees (default 0.1 = 6')")
    ap.add_argument("--query", help="only this query/target, e.g. wise-0855")
    ap.add_argument("--limit", type=int, help="at most this many files this run")
    ap.add_argument("--workers", type=int, default=WORKERS)
    ap.add_argument("--source", choices=["s3", "irsa", "both"], default="both", help="where to read the pixels")
    args = ap.parse_args()
    if not load_links():
        sys.exit("data/irsa_snapshot/links.csv is missing: run scripts/snapshot_irsa.py first.")
    if args.full:
        n = len(pending(True, args.query)[: args.limit or None])
        print(f"Full images are ~65 MB each: {n} files ~ {n * 0.065:.1f} GB.")
    sources = ("s3", "irsa") if args.source == "both" else (args.source,)
    download_missing(args.full, args.size, args.workers, args.limit, args.query, sources)


if __name__ == "__main__":
    main()
