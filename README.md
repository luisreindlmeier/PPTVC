# Gedonus

**Version control for the AI presentation era.**

AI tools like Claude for PowerPoint and Microsoft Copilot are rewriting finance decks in minutes. Nobody has built the governance layer that sits on top. Gedonus is that layer — tracking every change, every number, every approval, directly inside PowerPoint.

![Gedonus task pane overview](assets/readme.png)

## The Problem

Every developer has Git. Every codebase has an audit trail. The analysts, associates, and portfolio managers who spend half their careers in PowerPoint have nothing comparable — and AI just made that gap a compliance problem.

Gedonus is building the infrastructure layer that makes AI-assisted presentation workflows trustworthy. Starting with version control and diff. Expanding to approval workflows, multi-user collaboration, and enterprise compliance exports.

The long-term position: the governance standard for AI-generated presentation documents.

## Tech Stack

- Office JS API
- React + TypeScript (strict)
- Vite + Tailwind
- JSZip + fast-xml-parser for PPTX/DrawingML processing
- OPFS (Origin Private File System) for local-first persistence
- GitHub App integration via Cloudflare Worker for team sync

## Quick Start

```bash
npm install
npm start
```

Starts the local dev server and sideload flow for PowerPoint.

## Scripts

- `npm start` — dev server + sideload
- `npm run build` — production build
- `npm run lint` — lint checks

## Status

Early-stage, actively developed. Version control and visual diff workflows are stable, GitHub sync enabled. Approval workflows, and compliance export are in progress.

---
