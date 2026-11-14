# Sources and references

## NASA data
- SPHEREx DR1 / QR3 spectral images (Level 2), NASA/IPAC Infrared Science Archive (IRSA): https://irsa.ipac.caltech.edu/Missions/spherex.html. Searched with IRSA TAP `https://irsa.ipac.caltech.edu/TAP` (`spherex.plane`, `spherex.artifact`) and SIA2 `https://irsa.ipac.caltech.edu/SIA`, cutouts via the IRSA cutout service. Public, no login.
- SPHEREx open data on AWS (NASA/IPAC): bucket `nasa-irsa-spherex`, region us-east-1, anonymous access. https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/index.html . We read Level 2 spectral images (`dr1/level2/`, `qr3/level2/`) for cut-outs and the all-sky cube tiles (`dr1/hips5_cube/hips_20261026/`) for spectra. AWS Registry of Open Data: registry.opendata.aws/spherex-dr1, registry.opendata.aws/spherex-qr3 (pending publish by AWS at the time of writing).
- SPHEREx DR1 all-sky data cube, HiPS (102 frames, 0.75-5.0 µm), IRSA: https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube (properties read 2026-11-14; hips_release_date 2026-11-01). Copyright Caltech/IPAC.
- IRSA SPHEREx tutorial notebooks (BSD-3-Clause): https://caltech-ipac.github.io/irsa-tutorials/spherex/ . Our search, wavelength, reprojection, flux-conversion and photometry steps follow "Introduction to SPHEREx Spectral Images" (https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/) and the SPHEREx mosaic tutorial (https://caltech-ipac.github.io/irsa-tutorials/spherex-mosaic/).
- SPHEREx Explanatory Supplement (flags, data products): https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHEREx_Expsupp.pdf

## Other data
- Gaia DR3 (ESA), queried from the ESA Gaia archive TAP `https://gea.esac.esa.int/tap-server/tap` (2026-11-14). Required acknowledgement: "This work has made use of data from the European Space Agency (ESA) mission Gaia (https://www.cosmos.esa.int/gaia), processed by the Gaia Data Processing and Analysis Consortium (DPAC, https://www.cosmos.esa.int/web/gaia/dpac/consortium). Funding for the DPAC has been provided by national institutions, in particular the institutions participating in the Gaia Multilateral Agreement." Cite Gaia Collaboration, Vallenari et al. 2023, A&A 674, A1.
- WISE 0855-0714 proper motion and parallax (not in Gaia): Luhman & Esplin 2016, AJ 152, 78; Kirkpatrick et al. 2021, ApJS 253, 7. Position from the challenge text.
- 2MASS color HiPS (IRSA mirror of the CDS HiPS): https://irsa.ipac.caltech.edu/data/hips/CDS/2MASS/Color. 2MASS is a joint project of UMass and IPAC/Caltech, funded by NASA and NSF.
- DSS2 color HiPS (IRSA mirror of the CDS HiPS): https://irsa.ipac.caltech.edu/data/hips/CDS/DSS2/color. Digitized Sky Survey, STScI.
- SIMBAD / Sesame name resolver (CDS, Strasbourg), used by the API when available: https://cds.unistra.fr/cgi-bin/nph-sesame
- OpenStreetMap Nominatim geocoding for "sky from a place" (© OpenStreetMap contributors, ODbL): https://nominatim.openstreetmap.org

## Libraries
| Library | Version | License | URL |
| --- | --- | --- | --- |
| Aladin Lite (CDS) | 3.8.2 | GPL-3.0 | https://aladin.cds.unistra.fr/AladinLite/ |
| PixiJS | 8.23.0 | MIT | https://pixijs.com |
| React | 19.3.1 | MIT | https://react.dev |
| Vite | 8.3 | MIT | https://vite.dev |
| gifenc | 1.0.3 | MIT | https://github.com/mattdesl/gifenc |
| Font Awesome (react-fontawesome, free-solid-svg-icons) | 7.x | MIT / CC BY 4.0 | https://fontawesome.com |
| Font Awesome Free (icons; react-fontawesome, svg-core, free-solid-svg-icons) | 7.x | Icons CC BY 4.0, code MIT | https://fontawesome.com/ |
| astropy | 8.0.2 | BSD-3-Clause | https://www.astropy.org |
| reproject | 0.21.0 | BSD-3-Clause | https://reproject.readthedocs.io |
| astroquery | 0.4.11 | BSD-3-Clause | https://astroquery.readthedocs.io |
| s3fs / fsspec | 2026.9 | BSD-3-Clause | https://s3fs.readthedocs.io |
| NumPy | 2.5 | BSD-3-Clause | https://numpy.org |
| SciPy | 1.18 | BSD-3-Clause | https://scipy.org |
| Pillow | 13.0 | MIT-CMU | https://python-pillow.org |
| requests | 2.34 | Apache-2.0 | https://requests.readthedocs.io |
| FastAPI | 0.163 | MIT | https://fastapi.tiangolo.com |
| Uvicorn | 0.54 | BSD-3-Clause | https://www.uvicorn.org |

Note: Aladin Lite is GPL-3.0, so the published app bundle should be released under a GPL-3.0-compatible license.

## Tools and design
- Design system adapted from VoltAgent/awesome-design-md (spacex/DESIGN.md), MIT license: https://github.com/VoltAgent/awesome-design-md . Our version is DESIGN.md in the repo root.
- Fonts from Google Fonts (SIL Open Font License): Barlow and Barlow Semi Condensed (Jeremy Tribby), IBM Plex Mono (IBM). https://fonts.google.com
- Icons: Font Awesome Free 7 (icons CC BY 4.0, code MIT): https://fontawesome.com/license/free
- Performance rules: Vercel "react-best-practices" agent skill (MIT): https://github.com/vercel-labs/agent-skills
- Space Apps 2026 Kit skills (MIT): https://github.com/angelinopires/space-apps-2026-kit
- Model tool for the idea: WiseView (Backyard Worlds), http://byw.tools/wiseview
- AI assistance: Claude Code (Anthropic) was used to write code and documentation; the team chose the design, targets and processing and checked the results.
