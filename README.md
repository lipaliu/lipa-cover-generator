# LIPA Cover Generator

LIPA is a Xiaohongshu / Douyin cover generator PWA. It turns one base image plus Chinese cover copy into 3:4 social covers with batch generation, local history, and selectable image engines.

## Features

- macOS-style creator UI with a LIPA app icon
- PWA manifest and service worker
- Generate 1, 2, 4, or 10 covers
- Local IndexedDB history
- Engine selector before generation
- OpenAI GPT-Image-2 adapter
- Alibaba DashScope / Tongyi Wanxiang adapter
- Dreamina / 即梦 CLI adapter

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local` with the providers you want to use:

```env
OPENAI_API_KEY=
DASHSCOPE_API_KEY=
```

For Dreamina / 即梦, install and log in once on the machine:

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

## Scripts

- `npm run dev` starts the Vite frontend and Express API.
- `npm run build` builds the PWA.
- `npm run preview` serves the built app through the Express API.
- `npm run typecheck` runs TypeScript checks.

## Notes

Do not commit `.env.local` or provider keys. Dreamina login state is stored in the local user account outside this project and is intentionally not part of the repository.
