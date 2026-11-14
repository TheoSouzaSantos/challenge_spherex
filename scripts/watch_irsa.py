# AI-Assisted: the IRSA watcher generated with Claude Code (Anthropic) and reviewed by the team.
"""Check the SPHEREx services every 10 seconds and save whatever is still missing the moment they work.

IRSA's search and cut-out services go down (HTTP 502) for long stretches. This loop:
  1. pings each service with a tiny request (SIA search, TAP, IRSA cut-outs, AWS S3, the HiPS sky map),
  2. prints one status line and appends it to data/irsa_snapshot/watch_log.csv,
  3. when the search works: saves the search pages that are not saved yet (scripts/snapshot_irsa.py),
  4. when S3 or the cut-out service works: downloads the image cut-outs that are not saved yet
     (scripts/download_irsa.py), a batch per cycle so the loop keeps checking,
  5. stops when everything is saved (or keeps watching with --forever).

Rate limits: IRSA publishes none, so we ask little (five small requests per cycle). If a service
answers 429 or 503 with Retry-After, we wait that long and double our interval (up to 5 minutes),
then go back to normal once it answers again.

    .venv/Scripts/python scripts/watch_irsa.py                  # every 10 s until everything is saved
    .venv/Scripts/python scripts/watch_irsa.py --interval 30 --forever
    .venv/Scripts/python scripts/watch_irsa.py --no-download     # only the search pages
    .venv/Scripts/python scripts/watch_irsa.py --max-cycles 3    # quick test
"""
import argparse
import csv
import sys
import time
from argparse import Namespace
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

import download_irsa as dl  # noqa: E402
import snapshot_irsa as snap  # noqa: E402

LOG = snap.OUT / "watch_log.csv"
SIA_PROBE = "https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_qr3&POS=circle+10.6847+41.2687+0.0003&MAXREC=1&RESPONSEFORMAT=HTML"
TAP_PROBE = "https://irsa.ipac.caltech.edu/TAP/sync?QUERY=SELECT+TOP+1+planeid+FROM+spherex.plane&FORMAT=csv"
HIPS_PROBE = "https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube/properties"
NAMES = ["search", "tap", "cutouts", "s3", "hips"]


def probe_urls():
    """A known image from links.csv gives the cut-out and S3 probes (tiny reads).

    Prefer an image already cut out successfully: some search results only touch the circle's edge,
    and asking IRSA to cut those around the centre answers 422 "Arrays do not overlap", which would
    look like an outage.
    """
    links = dl.load_links()
    state = dl.load_state()
    good = [r for r in links if state.get(dl.state_key(r, False), {}).get("status") == "ok"]
    row = (good or links or [None])[0]
    cut = f"{row['irsa_url']}?center={float(row['center_ra']):.5f},{float(row['center_dec']):.5f}d&size=0.005" if row and row.get("center_ra") not in (None, "", "None") else None
    s3_url = row["s3_url"] if row and row["s3_url"] else None
    return {
        "search": (SIA_PROBE, None, lambda r: r.status_code == 200 and "access_url" in r.text and "Proxy Error" not in r.text),
        "tap": (TAP_PROBE, None, lambda r: r.status_code == 200 and "planeid" in r.text),
        "cutouts": (cut, None, lambda r: r.status_code == 200 and r.content[:6] == b"SIMPLE"),
        "s3": (s3_url, {"Range": "bytes=0-79"}, lambda r: r.status_code in (200, 206) and r.content[:6] == b"SIMPLE"),
        "hips": (HIPS_PROBE, None, lambda r: r.status_code == 200 and "hips_" in r.text),
    }


def probe(name, url, headers, good, timeout):
    if not url:
        return name, {"ok": False, "code": "-", "ms": 0, "retry_after": 0}
    t0 = time.time()
    try:
        r = requests.get(url, headers=headers or {}, timeout=timeout)
        ra = r.headers.get("Retry-After", "")
        return name, {"ok": bool(good(r)), "code": r.status_code, "ms": int((time.time() - t0) * 1000),
                      "retry_after": int(ra) if ra.isdigit() else 0}
    except requests.RequestException as e:
        return name, {"ok": False, "code": type(e).__name__[:12], "ms": int((time.time() - t0) * 1000), "retry_after": 0}


def all_queries():
    """The default queries plus anything saved or attempted before (custom --pos / --url runs)."""
    default = snap.build_queries(Namespace(url=None, pos=None, name=None, radius=snap.RADIUS_DEG, only_extra=False))
    known = {snap.qfile(q): q for q in default}
    for fname, m in snap.load_manifest().items():
        known.setdefault(fname, {k: m.get(k) for k in ("name", "url", "collection", "ra", "dec")})
    return list(known.values())


def log_row(stamp, res, missing_q, missing_f):
    new = not LOG.exists()
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["time"] + [f"{n}_{k}" for n in NAMES for k in ("ok", "code", "ms")] + ["missing_pages", "missing_files"])
        w.writerow([stamp] + [v for n in NAMES for v in (int(res[n]["ok"]), res[n]["code"], res[n]["ms"])] + [missing_q, missing_f])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--interval", type=float, default=10, help="seconds between checks (default 10)")
    ap.add_argument("--forever", action="store_true", help="keep watching after everything is saved")
    ap.add_argument("--max-cycles", type=int, help="stop after this many checks")
    ap.add_argument("--batch", type=int, default=120, help="files to download per cycle")
    ap.add_argument("--no-download", action="store_true", help="only save the search pages")
    ap.add_argument("--full", action="store_true", help="download full images (~65 MB each) instead of cut-outs")
    ap.add_argument("--timeout", type=float, default=20, help="seconds before a probe counts as down")
    args = ap.parse_args()

    base = interval = max(1.0, args.interval)
    cycle = 0
    print(f"Watching SPHEREx services every {base:g}s. Ctrl+C to stop. Log: {LOG}")
    try:
        while True:
            cycle += 1
            t0 = time.time()
            urls = probe_urls()
            with ThreadPoolExecutor(len(urls)) as ex:
                res = dict(ex.map(lambda kv: probe(kv[0], *kv[1], args.timeout), urls.items()))

            queries = all_queries()
            missing_q = snap.missing_queries(queries)
            missing_f = [] if args.no_download else dl.pending(args.full)
            stamp = datetime.now().strftime("%H:%M:%S")
            line = "  ".join(f"{n} {'up' if res[n]['ok'] else 'down'} ({res[n]['code']})" for n in NAMES)
            print(f"{stamp}  {line}  | pages missing {len(missing_q)} · files missing {len(missing_f)}")
            log_row(datetime.now().isoformat(timespec="seconds"), res, len(missing_q), len(missing_f))

            # 1. search pages
            if missing_q and res["search"]["ok"]:
                print(f"  search is up: saving {len(missing_q)} missing page(s)")
                snap.save_queries(missing_q, tries=2, log=lambda m: print("  " + m))
                missing_f = [] if args.no_download else dl.pending(args.full)

            # 2. image files, from whichever source answers
            sources = tuple(s for s, name in (("s3", "s3"), ("irsa", "cutouts")) if res[name]["ok"])
            if missing_f and sources:
                dl.download_missing(full=args.full, limit=args.batch, sources=sources, log=lambda m: print("  " + m))

            if not args.forever and not snap.missing_queries(all_queries()) and (args.no_download or not dl.pending(args.full)):
                print("Everything is saved. Done.")
                break
            if args.max_cycles and cycle >= args.max_cycles:
                print(f"Stopped after {cycle} checks.")
                break

            # rate limiting: honour Retry-After, back off on 429, recover when things answer
            retry = max(r["retry_after"] for r in res.values())
            if any(r["code"] == 429 for r in res.values()):
                interval = min(interval * 2, 300)
                print(f"  rate limited: checking every {interval:g}s for now")
            elif interval != base and all(r["code"] != 429 for r in res.values()):
                interval = base
            time.sleep(max(0.0, max(interval, retry) - (time.time() - t0)))
    except KeyboardInterrupt:
        print("\nStopped. Run again any time: it continues where it left off.")


if __name__ == "__main__":
    main()
