# Stack

Office JS API · TypeScript strict · JSZip · OPFS (Origin Private File System) · No backend · No cloud

# Project

PowerPoint Task Pane Add-in for Git-style version control. Runs entirely in the browser, stores data locally via OPFS. Optional sync to GitHub/GitLab.

# Structure

- `src/versions/` — version snapshot logic (save, list, restore)
- `src/diff/` — PPTX diff engine (unzip, parse DrawingML XML, compare shapes)
- `src/storage/` — OPFS read/write abstraction
- `src/ui/` — task pane UI components
- `src/taskpane/` — Office JS entry point (generated, minimal changes)

# Rules

- Never use `any` — always type correctly
- All storage goes through `src/storage/` abstraction — never call OPFS directly elsewhere
- Diff logic stays in `src/diff/` — never mix with UI
- No external network calls — this tool is fully offline by default
- Keep functions small and single-purpose — this is open source, must be readable

# Git — always do this automatically, never wait to be asked

- Start of every feature: create `feature/name` branch
- After every completed logical unit: commit with `feat:` `fix:` `chore:` `refactor:`
- After 3-5 commits: open PR to main with clear title and description
- Never commit to main directly

# GitHub

- Use `gh pr create` to open PRs — always include a clear title and body
- Use `gh pr create --draft` for work in progress

# Commands

- `npm start` — start dev server + sideload in PowerPoint
- `npm run build` — production build
- `npm run lint` — lint check

# Session

- Suggest /compact when context feels long or before switching features
