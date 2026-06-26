# LIPA Cover Generator

LIPA is a Xiaohongshu / Douyin cover generator PWA. It turns uploaded images, material references, or text descriptions plus Chinese cover copy into social covers with batch generation, local history, and two production image engines.

## Features

- macOS-style creator UI with a LIPA app icon
- PWA manifest and service worker
- Generate up to 10 covers across 16:9, 4:3, 1:1, 3:4, and 9:16 ratios
- Local IndexedDB history
- Engine selector before generation
- Image2 / OpenAI GPT-Image-2 adapter
- SeeDance / 即梦 CLI adapter

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local` with the providers you want to use:

```env
OPENAI_API_KEY=
```

For SeeDance / 即梦, install and log in once on the machine:

```bash
curl -s https://jimeng.jianying.com/cli | bash
dreamina login
dreamina user_credit
```

## Run

```bash
npm run dev
```

Production preview:

```bash
npm run build
PORT=8790 npm run preview
```

## Speed Controls

Generation runs with bounded concurrency and per-image timeouts so one slow image cannot block the whole batch:

```env
IMAGE2_CONCURRENCY=2
IMAGE2_JOB_TIMEOUT_MS=180000
SEEDANCE_CONCURRENCY=1
SEEDANCE_JOB_TIMEOUT_MS=150000
OPENAI_TEXT_TIMEOUT_MS=45000
```

Image2 can safely run a small number of jobs in parallel. SeeDance defaults to one job at a time because the local CLI login/session is more fragile under parallel runs.

## Scripts

- `npm run dev` starts the Vite frontend and Express API.
- `npm run build` builds the PWA.
- `npm run preview` serves the built app through the Express API.
- `npm run typecheck` runs TypeScript checks.

## Notes

Do not commit `.env.local` or provider keys. SeeDance / Dreamina login state is stored in the local user account outside this project and is intentionally not part of the repository.
