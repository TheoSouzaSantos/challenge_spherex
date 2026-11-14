# AI-Assisted: the IRSA snapshot script generated with Claude Code (Anthropic) and reviewed by the team.
"""Save IRSA's SPHEREx search results (HTML) while the service is up, and join them into one place.

IRSA's search answers HTTP 502 for long stretches. This script runs a list of SIA queries, keeps
every HTML answer that comes back complete, and skips the ones it already has, so you can run it
again and again until everything is saved:

    .venv/Scripts/python scripts/snapshot_irsa.py                      # 5 test targets + M31, all collections
    .venv/Scripts/python scripts/snapshot_irsa.py --pos 83.82 -5.39 --name orion
    .venv/Scripts/python scripts/snapshot_irsa.py --url "https://irsa.ipac.caltech.edu/SIA?..."
    .venv/Scripts/python scripts/snapshot_irsa.py --refresh             # fetch everything again

Output in data/irsa_snapshot/:
    html/<name>__<collection>.html   the raw IRSA pages, exactly as served
    queries.txt                      every query URL, one per line
    manifest.json                    per query: URL, status, rows, when, attempts, error
    links.csv                        one row per image: IRSA file URL, AWS S3 key/URL, cut-out URL template
    index.html                       one page joining everything: query list + combined table of images

Image files: scripts/download_irsa.py (or --download here). Keep trying automatically: scripts/watch_irsa.py.
"""
import argparse
import csv
import html
import json
import sys
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from astro import current_position  # noqa: E402
from config import RELEASES, S3_HTTPS  # noqa: E402
from s3 import key_for  # noqa: E402
from targets import TARGETS  # noqa: E402

OUT = ROOT / "data" / "irsa_snapshot"
SIA = "https://irsa.ipac.caltech.edu/SIA"
RADIUS_DEG = 0.083333          # 5 arcmin, the same as the query the team started from
TRIES, WAIT_S, PAUSE_S, TIMEOUT_S = 6, 10, 2, 120

# The query the team started from (M31), kept exactly as given.
EXAMPLE = {"name": "m31", "url": "https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_dr1&POS=circle+10.6847+41.2687+0.083333&RESPONSEFORMAT=HTML",
           "collection": "spherex_dr1", "ra": 10.6847, "dec": 41.2687}


def sia_url(ra, dec, collection, radius=RADIUS_DEG):
    q = urlencode({"COLLECTION": collection, "POS": f"circle {ra:.5f} {dec:.5f} {radius}", "RESPONSEFORMAT": "HTML"})
    return f"{SIA}?{q}"


def build_queries(args):
    queries = [EXAMPLE]
    if args.url:
        queries.append({"name": args.name or "custom", "url": args.url, "collection": "custom", "ra": None, "dec": None})
    if args.pos:
        ra, dec = args.pos
        for c in RELEASES:
            queries.append({"name": args.name or f"pos_{ra:.3f}_{dec:+.3f}", "url": sia_url(ra, dec, c, args.radius),
                            "collection": c, "ra": ra, "dec": dec})
    if not args.only_extra:
        for t in TARGETS:
            ra, dec = current_position(t)   # where the target is during the SPHEREx surveys
            for c in RELEASES:
                queries.append({"name": t["slug"], "url": sia_url(ra, dec, c, args.radius), "collection": c, "ra": ra, "dec": dec})
    return queries


class TableParser(HTMLParser):
    """Reads the single <table> of an IRSA SIA HTML answer into (header, rows)."""

    def __init__(self):
        super().__init__()
        self.header, self.rows, self._row, self._cell, self._in = [], [], None, None, None

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag == "tr":
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell, self._in = [], tag

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in ("td", "th") and self._cell is not None:
            self._row.append("".join(self._cell).strip())
            self._cell, self._in = None, None
        elif tag == "tr" and self._row is not None:
            if not self.header and "access_url" in self._row:
                self.header = self._row          # the first row naming the columns
            elif self._row:
                self.rows.append(self._row)
            self._row = None


def parse_table(text):
    p = TableParser()
    p.feed(text)
    return p.header, [r for r in p.rows if len(r) == len(p.header)]


def is_good(status, text):
    """A usable answer: HTTP 200, a real table with the access_url column, not a proxy error page."""
    return status == 200 and "Proxy Error" not in text and "access_url" in text


def fetch(url, tries=TRIES, log=print):
    last = ""
    for attempt in range(1, tries + 1):
        try:
            r = requests.get(url, timeout=TIMEOUT_S)
            if is_good(r.status_code, r.text):
                return r.text, attempt, ""
            last = f"HTTP {r.status_code}" + (" (proxy error page)" if "Proxy Error" in r.text else "")
        except requests.RequestException as e:
            last = type(e).__name__
        if attempt < tries:
            wait = WAIT_S * attempt
            log(f"    {last}, trying again in {wait}s")
            time.sleep(wait)
    return None, tries, last


def mjd_to_date(mjd):
    try:
        return datetime.fromtimestamp((float(mjd) - 40587) * 86400, timezone.utc).strftime("%Y-%m-%d")
    except ValueError:
        return ""


def load_manifest():
    mpath = OUT / "manifest.json"
    return json.loads(mpath.read_text()) if mpath.exists() else {}


def missing_queries(queries):
    """Queries with no good saved copy yet."""
    manifest = load_manifest()
    return [q for q in queries if not (manifest.get(qfile(q), {}).get("ok") and (OUT / "html" / qfile(q)).exists())]


def qfile(q):
    return f"{q['name']}__{q['collection']}.html"


def save_queries(queries, refresh=False, tries=TRIES, log=print):
    """Fetch every query that has no good copy yet (or all, with refresh). Returns (saved_ok, total)."""
    (OUT / "html").mkdir(parents=True, exist_ok=True)
    manifest = load_manifest()
    for q in queries:
        fname = qfile(q)
        path = OUT / "html" / fname
        entry = manifest.get(fname, {})
        if path.exists() and entry.get("ok") and not refresh:
            continue
        log(f"> {fname}")
        text, attempts, err = fetch(q["url"], tries=tries, log=log)
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        if text:
            path.write_text(text, encoding="utf-8")
            _, rows = parse_table(text)
            manifest[fname] = {**q, "file": f"html/{fname}", "ok": True, "rows": len(rows), "fetched_utc": now, "attempts": attempts}
            log(f"  saved, {len(rows)} rows")
        else:
            manifest[fname] = {**q, "file": f"html/{fname}" if path.exists() else None, "ok": bool(entry.get("ok")),
                               "rows": entry.get("rows"), "fetched_utc": entry.get("fetched_utc"),
                               "last_try_utc": now, "attempts": attempts, "error": err}
            log(f"  not saved: {err}" + ("  (keeping the earlier copy)" if entry.get("ok") else ""))
        time.sleep(PAUSE_S)
    for q in queries:                      # make sure every planned query is listed, even if never tried
        manifest.setdefault(qfile(q), {**q, "file": None, "ok": False, "error": "not tried yet"})
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    (OUT / "queries.txt").write_text("\n".join(m["url"] for m in manifest.values()) + "\n", encoding="utf-8")
    links = write_links(manifest)
    write_index(manifest, links)
    return sum(1 for m in manifest.values() if m.get("ok")), len(manifest)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--pos", nargs=2, type=float, metavar=("RA", "DEC"), help="extra position in degrees (all collections)")
    ap.add_argument("--url", help="extra SIA URL to save as-is")
    ap.add_argument("--name", help="name for --pos / --url")
    ap.add_argument("--radius", type=float, default=RADIUS_DEG, help="search radius in degrees (default 5 arcmin)")
    ap.add_argument("--only-extra", action="store_true", help="skip the five test targets")
    ap.add_argument("--refresh", action="store_true", help="fetch again even if a good copy is saved")
    ap.add_argument("--download", action="store_true", help="after saving the pages, download the image cut-outs too")
    ap.add_argument("--full", action="store_true", help="with --download: whole ~65 MB images instead of cut-outs (huge)")
    args = ap.parse_args()

    good, total = save_queries(build_queries(args), refresh=args.refresh)
    print(f"\n{good}/{total} queries saved · {OUT}")
    if good < total:
        print("Run again (or scripts/watch_irsa.py) to fill in the ones IRSA did not answer.")
    if args.download:
        from download_irsa import download_missing
        download_missing(full=args.full)


def write_links(manifest):
    """links.csv: every image in every saved answer, with its IRSA URL, AWS S3 location and a cut-out URL."""
    rows = []
    for fname, m in manifest.items():
        if not m.get("ok") or not m.get("file"):
            continue
        header, table = parse_table((OUT / m["file"]).read_text(encoding="utf-8"))
        col = {h: i for i, h in enumerate(header)}
        for r in table:
            url = r[col["access_url"]]
            key = key_for({"url": url, "cloud_access": html.unescape(r[col["cloud_access"]]) if "cloud_access" in col else ""})
            ra, dec = m.get("ra"), m.get("dec")
            rows.append({
                "query": m["name"], "center_ra": ra, "center_dec": dec, "collection": r[col["obs_collection"]] if "obs_collection" in col else m["collection"],
                "obs_id": r[col["obs_id"]], "detector": r[col["energy_bandpassname"]].replace("SPHEREx-", ""),
                "t_min_mjd": r[col["t_min"]], "date": mjd_to_date(r[col["t_min"]]),
                "irsa_url": url, "s3_key": key or "", "s3_url": (S3_HTTPS + key) if key else "",
                "cutout_url": f"{url}?center={ra:.6f},{dec:.6f}d&size=0.1" if ra is not None else "",
                "size_bytes": r[col["access_estsize"]] if "access_estsize" in col else "",
            })
    rows.sort(key=lambda x: (x["query"], x["detector"], x["t_min_mjd"]))
    with open(OUT / "links.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else ["query"])
        w.writeheader()
        w.writerows(rows)
    return rows


def write_index(manifest, links):
    """index.html: one page that joins every saved answer."""
    e = html.escape

    def link(href, label):
        return f'<a href="{e(href)}">{label}</a>' if href else ""

    qrows = "".join(
        f"<tr><td>{e(m['name'])}</td><td>{e(m['collection'])}</td>"
        f"<td class='{'ok' if m.get('ok') else 'bad'}'>{'saved' if m.get('ok') else e(m.get('error', 'not yet'))}</td>"
        f"<td class=num>{m.get('rows') or ''}</td><td>{e(m.get('fetched_utc') or '')}</td>"
        f"<td>{link(m.get('file') if m.get('ok') else '', 'saved page')}</td><td>{link(m['url'], 'live query')}</td></tr>"
        for m in manifest.values())
    lrows = "".join(
        f"<tr><td>{e(r['query'])}</td><td>{e(r['collection'])}</td><td>{e(r['detector'])}</td><td>{e(r['date'])}</td>"
        f"<td>{e(r['obs_id'])}</td><td>{link(r['irsa_url'], 'IRSA')}</td><td>{link(r['s3_url'], 'AWS S3')}</td>"
        f"<td>{link(r['cutout_url'], 'cut-out')}</td></tr>"
        for r in links)
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CosmoSight · saved IRSA SPHEREx searches</title>
<style>body{{font:14px/1.4 system-ui,sans-serif;margin:24px;background:#000;color:#f0f0f5}}a{{color:#f2a541}}
table{{border-collapse:collapse;margin:12px 0 28px}}td,th{{border-bottom:1px solid #26262c;padding:4px 10px;text-align:left}}
th{{color:#a3a3ae;font-weight:500}}.num{{text-align:right}}.ok{{color:#6fd58a}}.bad{{color:#ff6b5e}}</style></head><body>
<h1>Saved IRSA SPHEREx searches</h1>
<p>Built {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} by scripts/snapshot_irsa.py. {sum(1 for m in manifest.values() if m.get('ok'))} of {len(manifest)} queries saved, {len(links)} images.
Files: <a href="links.csv">links.csv</a> · <a href="queries.txt">queries.txt</a> · <a href="manifest.json">manifest.json</a></p>
<h2>Queries</h2><table><tr><th>Target</th><th>Collection</th><th>Status</th><th>Rows</th><th>Saved (UTC)</th><th></th><th></th></tr>{qrows}</table>
<h2>All images</h2><table><tr><th>Target</th><th>Collection</th><th>Det</th><th>Date</th><th>obs_id</th><th colspan=3>Links</th></tr>{lrows}</table>
</body></html>"""
    (OUT / "index.html").write_text(page, encoding="utf-8")


if __name__ == "__main__":
    main()
