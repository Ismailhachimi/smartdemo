# SmartDemo server

The optional, self-hostable backend for the SmartDemo Mac app: upload recordings when you want to,
share them with a link, and see who watched what.

- **Share links** per prospect: label, optional password, expiry, download on/off, disable anytime.
- **Viewer analytics**: opens, plays, unique viewers, average watch time, completion, audience
  retention per segment, recent views. Viewers stay anonymous: no IP address is stored.
- **Email alerts** when a link is opened (at most once an hour per link).
- **Passwordless sign-in** by magic link. Personal access tokens for the Mac app.
- **Storage**: local disk / Docker volume, any S3-compatible service, or Azure Blob Storage.
- Link previews (Open Graph) with the video thumbnail for email, Slack and LinkedIn.

Recordings stay on the Mac until you send them. The server only receives what you upload.

## Stack

| | |
|---|---|
| `apps/api` | NestJS 12 · Drizzle ORM · PostgreSQL · Resend |
| `apps/web` | Next.js 16 · React 19 · Tailwind CSS 4 |
| `packages/db` | Drizzle schema, SQL migrations (applied automatically when the API starts) |
| `packages/emails` | Email templates (React Email) |
| `docker-compose.yml` | Postgres + API + web behind one Caddy entrypoint |

Turborepo + pnpm workspaces. Node 22+.

## Run it with Docker (production, VPS)

```bash
cd web
cp .env.example .env
# Fill at least APP_URL, APP_SECRET (openssl rand -hex 32) and POSTGRES_PASSWORD
docker compose up -d --build
```

Open `APP_URL`, sign in with your email, and you're the admin. Without `RESEND_API_KEY`, the
sign-in link is printed in the API logs:

```bash
docker compose logs -f api
```

Everything is served on a single port (`HTTP_PORT`, 8080 by default): `/api/*` goes to the
API, the rest to the web app. Put it behind your TLS reverse proxy (Dokploy, Traefik, Nginx,
Cloudflare Tunnel…) and set `APP_URL` to the public `https://` address.

**Dokploy**: create a *Compose* service pointing at this repository, set the compose path to
`web/docker-compose.yml`, add the environment variables from `.env.example`, and attach your
domain to the `proxy` service on port 80.

### Restricting who can sign in

`ALLOWED_EMAILS=me@company.com,@company.com` accepts that address and anyone at `company.com`.
Leave it empty to let anyone create an account. The first account becomes admin.

## Storage

| `STORAGE_DRIVER` | Where videos go | Notes |
|---|---|---|
| `local` (default) | The `media` Docker volume | Works out of the box. Back up the volume. |
| `s3` | AWS S3, Cloudflare R2, Scaleway, OVH, Backblaze B2, DigitalOcean Spaces, Wasabi, or the bundled SeaweedFS (`--profile s3`, `S3_ENDPOINT=http://s3:8333`) | Set `S3_BUCKET` and credentials; `S3_ENDPOINT` for non-AWS. The bucket is created if missing. Without keys, the AWS default chain is used (IAM role, IRSA on Kubernetes). |
| `azure` | Azure Blob Storage | Set `AZURE_STORAGE_CONNECTION_STRING`. The container is created if missing. |

Media is always streamed through the API (with HTTP Range support), so password, expiry and
disabled links are enforced and buckets can stay private. `STORAGE_PREFIX` puts every object
under a folder of the bucket.

Moving from one driver to another does not migrate existing files: copy them over with the
same keys (`videos/…`, `thumbnails/…`), for example with `rclone`.

## Adaptive streaming

After each upload, the API runs ffmpeg (included in its image) to make 1080p, 720p and 480p
copies of the video, never above the source, cut into 4-second HLS segments and stored next
to the MP4 (`hls/<id>/`). The player picks the quality the viewer's connection allows and offers
a manual choice. Videos uploaded before streaming existed are converted when the API starts.

Until a video is converted, or with `STREAMING=off`, the MP4 is played. Segments are served
through the API like everything else, so share-link rules (password, expiry) still apply.
`STREAM_CONCURRENCY` (default 1) limits how many videos are converted at once.

## Email

Set `RESEND_API_KEY` and `EMAIL_FROM` (a sender on a domain verified in Resend). Without a
key, every email (sign-in links, view alerts) is printed in the API logs instead, which is
handy for development and for private installs. `EMAIL_LOG=1` prints them even with Resend.

Preview the templates with `pnpm email:preview`.

## Development

Everything runs in Docker, with live reload. You only need Docker.

```bash
cd web
cp .env.example .env          # set APP_URL=http://localhost:3000 and an APP_SECRET
docker compose -f docker-compose.dev.yml up
```

The web app is on `WEB_PORT` (3000), the API on `API_PORT` (4000), Postgres on
`localhost:5433` for database tools. Your checkout is mounted into the container: saving a file
recompiles and reloads. Dependencies live in Docker volumes, so there is nothing to install on
your machine. Sign-in links appear in the compose output.

Add `--profile s3` (and `STORAGE_DRIVER=s3` in `.env`) to store videos in a local S3 server
(SeaweedFS) instead of the `media` volume.

Run tooling inside the container, for example:

```bash
docker compose -f docker-compose.dev.yml exec app pnpm typecheck
docker compose -f docker-compose.dev.yml exec app pnpm db:generate   # after editing packages/db/src/schema.ts
```

Commit the new migration in `packages/db/drizzle/`: it is applied the next time the API starts.

## Connecting the Mac app

In SmartDemo, choose **Partage → Connecter un serveur…**, enter the server address and click
**Continuer dans le navigateur**. The browser opens `/connect` (sign in if needed), you click
**Autoriser**, and the page hands a token to the app through its `smartdemo://` link. The page
confirms as soon as the app has used it. From the web app, **Réglages → Connecter un Mac** starts
the same flow.

Without a browser handoff, create a token in **Réglages → Créer un token** and paste it in the
app's **Avec un token** tab.

Then **Partage → Envoyer la dernière vidéo** uploads the last recording and copies the share
link. You can also turn on automatic upload after each recording.

## API overview

All routes are under `/api`. Authenticated routes accept the session cookie or
`Authorization: Bearer sd_…`.

| Method | Route | |
|---|---|---|
| POST | `/auth/magic-link` | `{ email }` → sends a sign-in link |
| POST | `/auth/verify` | `{ token }` → session cookie |
| GET / PATCH | `/auth/me` | Current user / update name |
| GET / POST / DELETE | `/tokens` | Personal access tokens |
| GET | `/activity` | Views across all videos: this week vs last week, latest views, who is watching now |
| POST | `/videos?title=&durationSec=&width=&height=` | Raw video body (`Content-Type: video/mp4`) → video + first share link |
| PUT | `/videos/:id/thumbnail` | Raw JPEG/PNG/WebP body |
| GET / PATCH / DELETE | `/videos/:id` | Details with stats, rename, delete |
| GET | `/videos/:id/stream` | Owner playback (Range) |
| GET | `/videos/:id/hls/master.m3u8` · `/videos/:id/hls/:quality/:file` | Owner adaptive streaming |
| POST | `/videos/:id/shares` | New share link |
| PATCH / DELETE | `/shares/:id` | Update / delete a share link |
| GET | `/public/s/:slug` | Public metadata (+ media token unless password-protected) |
| POST | `/public/s/:slug/unlock` | `{ password }` → media token |
| GET | `/public/s/:slug/stream?t=` · `/download?t=` · `/thumbnail` | Public media |
| GET | `/public/s/:slug/hls/master.m3u8?t=` · `/public/s/:slug/hls/:quality/:file?t=` | Public adaptive streaming (playlists carry the token) |
| GET / POST | `/public/s/:slug/reactions` | Emoji reactions pinned to a moment of the video |
| POST | `/public/s/:slug/views` · `/public/views/:id/progress` | Viewer analytics |
