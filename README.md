# Mancala

A web Mancala trainer — local play vs bots, pass-and-play, and post-game analysis.

Built with **Vite + React + TypeScript + Tailwind CSS + Framer Motion**.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | React 19, TypeScript 6 |
| Build | Vite 8 |
| Styling | Tailwind CSS v4 |
| State | Zustand with localStorage persistence |
| Routing | React Router v7 |
| Animation | Framer Motion |
| PWAs | vite-plugin-pwa + Workbox |
| Bots | Web Workers (alpha-beta search) |
| Testing | Vitest + Testing Library |
| Linting | ESLint + Prettier |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Type-check and build |
| `npm run preview` | Preview production build locally |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | ESLint check |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check |

## Screenshots

<!-- TODO: add screenshots -->

| Home | Game | Review |
|---|---|---|
| `[screenshot]` | `[screenshot]` | `[screenshot]` |

## PWA

The app is a Progressive Web App. After visiting, you can add it to your home screen (desktop or mobile) for offline-capable standalone use.

## Deploy

### Option A: Netlify CLI

```bash
npm install -g netlify-cli
netlify init        # follow prompts to connect to your Netlify account
netlify deploy --prod
```

### Option B: Netlify web dashboard

1. Push this repo to GitHub.
2. In the Netlify dashboard, click **Add new site → Import an existing project**.
3. Connect your GitHub account and select this repository.
4. Build command: `npm run build`
5. Publish directory: `dist`
6. Deploy.

### Custom subdomain

1. In the Netlify site settings, go to **Domain management → Add custom domain**.
2. Enter `mancala.<your-domain>` (e.g. `mancala.example.com`).
3. In your DNS provider, add a CNAME record:
   - **Name**: `mancala`
   - **Target**: `<your-site>.netlify.app`
4. Wait for DNS propagation and certificate provisioning (Netlify auto-provisions via Let's Encrypt).

---

See [`AGENTS.md`](./AGENTS.md) for project conventions.
