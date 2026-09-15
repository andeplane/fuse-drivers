# Working on Fuse Drivers

Fuse Drivers is a small TypeScript top-down offroad racing game for 1–5 friends, inspired by Super Off Road with Mario Kart style attack items. Phase one is single-player against bots in a browser. Later: create a room, scan a QR code, phones as controllers on a TV, and online rooms. `PLAN.md` has the pitch and milestones; `docs/adr/` has every rule and number. Prioritize responsive, fun gameplay and consistent outcomes. Deliver working changes promptly; scale process to the change.

## Default workflow

- One agent owns implementation and verification end to end. Work directly; do not create planner/reviewer/approver chains by default.
- Inspect `git status`, relevant code and nearby tests before editing. Preserve unrelated work. Stage only your own changes when committing; never `git add .`.
- Routine fixes, UI changes and bounded refactors need no design note. A change that contradicts an ADR gets a new ADR or an amendment to the existing one, then the code.
- Make reasonable implementation decisions autonomously. Ask only when missing information materially affects scope or an action needs authorization.
- Finish the requested scope with relevant checks and a concise report. Do not expand a development task into a release or an exhaustive audit.

## Architecture rules

Decided in ADR 001, 002 and 008. The two that matter every day:

- `src/shared/` imports nothing from Phaser, the DOM or Node. Rules, kernel, items, race step, bots and the runner live there; Phaser only presents. Phaser physics, timers and `Math.random` never touch gameplay.
- The tick order in ADR 002 is fixed. Outcomes resolve in that order and ties break by slot. Cosmetic changes must not alter simulation geometry, timing or player identity.

Balance values live in `src/shared/config.ts` once it exists; docs link to it rather than copying tables. Tracks are Tiled data, not code.

## Verification

- Run focused tests for the behavior changed. Add regressions for bugs. Use explicit interfaces and typed fakes for clocks, randomness and input; avoid `as any`, private-field mutation, global monkeypatches or real sleeps to make unit tests pass.
- Test observable behavior, not copies of implementation logic. Simulation changes keep the replay test green; if the hash changes on purpose, say so in the commit.
- For UI changes, exercise the affected browser flow. Documentation-only edits need a diff check, not game tests.
- Report what was actually tested and any remaining limits.

Before merging to main:

```sh
npm run typecheck
npm test
npm run build
```

## Documentation

- Update documentation directly affected by the change. Source modules are the authoritative definitions; link to them instead of copying.
- Never commit tokens, credential files or unredacted logs.
