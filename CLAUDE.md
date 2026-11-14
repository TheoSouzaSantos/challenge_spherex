# NASA Space Apps 2026 - Challenge 12: Planet X and SPHEREx

Read `CHALLENGE.md` (scope, MVP, architecture), `docs/WORKFLOW.md` (team's chosen UI: desktop-only React + PixiJS sky viewer, feature tiers, schedule, data contract — this overrides CHALLENGE.md where they differ) and `docs/SPHEREX_NOTES.md` (IRSA/SPHEREx technical facts) before any work. Work in `hackathon-mode` (skill) posture.

## Specialist agents (.claude/agents/)
| Agent | Owns |
| --- | --- |
| spherex-data-engineer | `backend/` (FastAPI, IRSA TAP + cutouts, cache, config of releases), `scripts/prebake.py` |
| spherex-image-processor | `backend/imaging.py` (zodi/flags, reprojection, visit coadds, stretch, difference, GIF, spectra) |
| sky-viewer-frontend | `AstroDevs-FP/` (Vite+React+PixiJS, Aladin Lite sky map, flipbook, layers, URL params, Vercel) |
| astro-science-validator | `docs/TARGETS.md`, `docs/VALIDATION.md`, science copy; reviews the others |
| pitch-and-submission | `SUBMISSION.md`, `DEMO.md`, README polish, References checklist |
| hackathon-lead | `STATUS.md`, `docs/API.md`; coordinates the others, checkpoints, scope cuts |
| local-pitch-coach | `PITCH.md` (live pitch for local judges + Q&A sheet) |

Suggested order: hackathon-lead (plan) -> data-engineer + image-processor (prebake the 5 test targets) -> frontend on prebaked data, deploy -> live backend -> validator -> pitch-and-submission (Sunday 16:00) -> local-pitch-coach.

## Skills (.claude/skills/)
Synced from https://github.com/angelinopires/space-apps-2026-kit: choose-challenge (already done), hackathon-mode, design-reference, nasa-data, submit-and-demo, pitch-deck.

## Always
- Everything user/judge-facing in English. No NASA logos or Space Apps branding.
- Every dataset/library/font goes into `SOURCES.md` immediately.
- Checkpoints: Sat 11:00 hello deployed · Sat 14:00 works on sample data · Sat 19:00 live NASA data · Sun 12:00 feature freeze · Sun 20:00 submitted.
