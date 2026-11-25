import {
  Body,
  Controller,
  ForbiddenException,
  GoneException,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { RETENTION_BUCKETS, shareLinks, users, videos, views, type ShareLink, type Video } from "@smartdemo/db";
import { videoViewedEmail } from "@smartdemo/emails";
import { and, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import type { Request, Response } from "express";
import { z } from "zod";
import { signAccess, verifyAccess, verifyPassword } from "../common/crypto.js";
import { InjectDb, type Database } from "../common/db.module.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { env } from "../env.js";
import { MailService } from "../mail/mail.service.js";
import { StorageService } from "../storage/storage.service.js";
import { mimeOf } from "../videos/videos.controller.js";

const ACCESS_TTL = 6 * 3600;
const NOTIFY_EVERY_MS = 60 * 60_000;
const SESSION_WINDOW_MS = 30 * 60_000;

const UnlockBody = z.object({ password: z.string().min(1).max(200) });
const ViewBody = z.object({
  viewerId: z.string().min(8).max(64),
  t: z.string().max(200),
  referrer: z.string().max(500).nullish(),
});
const ProgressBody = z.object({
  /** Seconds watched since the last report. */
  watchedDelta: z.number().min(0).max(120),
  position: z.number().min(0).max(86_400),
  /** Indices (0…RETENTION_BUCKETS-1) of the video segments watched since the last report. */
  buckets: z.array(z.number().int().min(0).max(RETENTION_BUCKETS - 1)).max(RETENTION_BUCKETS),
  completed: z.boolean().optional(),
});

/** Everything a viewer can reach through a share link. No authentication, only the link. */
@Controller("public")
export class PublicController {
  private readonly logger = new Logger("Public");

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly storage: StorageService,
    private readonly mail: MailService,
  ) {}

  private async resolve(slug: string): Promise<{ link: ShareLink; video: Video }> {
    const [row] = await this.db
      .select({ link: shareLinks, video: videos })
      .from(shareLinks)
      .innerJoin(videos, eq(videos.id, shareLinks.videoId))
      .where(eq(shareLinks.slug, slug));
    if (!row || row.link.disabled || row.video.status !== "ready") throw new NotFoundException("Cette vidéo n'existe pas ou n'est plus partagée.");
    if (row.link.expiresAt && row.link.expiresAt < new Date()) throw new GoneException("Ce lien a expiré.");
    return row;
  }

  private requireAccess(slug: string, token: string | undefined) {
    if (!verifyAccess(env.APP_SECRET, `share:${slug}`, token)) throw new UnauthorizedException("Accès expiré, recharge la page.");
  }

  /** Metadata for the share page. Includes a media access token unless the link has a password. */
  @Get("s/:slug")
  async meta(@Param("slug") slug: string) {
    const { link, video } = await this.resolve(slug);
    const locked = Boolean(link.passwordHash);
    return {
      slug,
      title: video.title,
      durationSec: video.durationSec,
      width: video.width,
      height: video.height,
      createdAt: video.createdAt,
      allowDownload: link.allowDownload,
      hasThumbnail: !locked && Boolean(video.thumbnailKey),
      locked,
      accessToken: locked ? null : signAccess(env.APP_SECRET, `share:${slug}`, ACCESS_TTL),
    };
  }

  @Post("s/:slug/unlock")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async unlock(@Param("slug") slug: string, @Body(new ZodPipe(UnlockBody)) body: z.infer<typeof UnlockBody>) {
    const { link } = await this.resolve(slug);
    if (link.passwordHash && !(await verifyPassword(body.password, link.passwordHash))) {
      throw new ForbiddenException("Mot de passe incorrect.");
    }
    return { accessToken: signAccess(env.APP_SECRET, `share:${slug}`, ACCESS_TTL) };
  }

  @Get("s/:slug/stream")
  async stream(@Param("slug") slug: string, @Query("t") t: string | undefined, @Req() req: Request, @Res() res: Response) {
    const { video } = await this.resolve(slug);
    this.requireAccess(slug, t);
    await this.storage.send(req, res, video.storageKey, video.mimeType);
  }

  @Get("s/:slug/download")
  async download(@Param("slug") slug: string, @Query("t") t: string | undefined, @Req() req: Request, @Res() res: Response) {
    const { link, video } = await this.resolve(slug);
    this.requireAccess(slug, t);
    if (!link.allowDownload) throw new ForbiddenException("Le téléchargement n'est pas autorisé pour ce lien.");
    const ext = video.storageKey.split(".").pop() ?? "mp4";
    const name = `${video.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "video"}.${ext}`;
    await this.storage.send(req, res, video.storageKey, video.mimeType, { download: name });
  }

  /** Poster image, also used for link previews (Open Graph). Hidden for password-protected links. */
  @Get("s/:slug/thumbnail")
  async thumbnail(@Param("slug") slug: string, @Req() req: Request, @Res() res: Response) {
    const { link, video } = await this.resolve(slug);
    if (link.passwordHash || !video.thumbnailKey) {
      res.status(404).end();
      return;
    }
    await this.storage.send(req, res, video.thumbnailKey, mimeOf(video.thumbnailKey), { cache: "public, max-age=600" });
  }

  /** Called when the share page opens. Returns the id used for progress reports. */
  @Post("s/:slug/views")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async startView(@Param("slug") slug: string, @Body(new ZodPipe(ViewBody)) body: z.infer<typeof ViewBody>, @Req() req: Request) {
    const { link, video } = await this.resolve(slug);
    this.requireAccess(slug, body.t);
    // Same viewer on the same link within 30 minutes = same session (reloads, double mounts).
    const [recent] = await this.db
      .select({ id: views.id })
      .from(views)
      .where(
        and(
          eq(views.shareLinkId, link.id),
          eq(views.viewerId, body.viewerId),
          gt(views.lastSeenAt, new Date(Date.now() - SESSION_WINDOW_MS)),
        ),
      )
      .orderBy(desc(views.lastSeenAt))
      .limit(1);
    if (recent) return { viewId: recent.id };

    const [view] = await this.db
      .insert(views)
      .values({
        shareLinkId: link.id,
        videoId: video.id,
        viewerId: body.viewerId,
        userAgent: req.headers["user-agent"]?.slice(0, 300),
        referrer: body.referrer?.slice(0, 500) || null,
      })
      .returning({ id: views.id });
    if (link.notifyOnView) void this.notify(link, video);
    return { viewId: view.id };
  }

  @Post("views/:id/progress")
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async progress(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(ProgressBody)) body: z.infer<typeof ProgressBody>) {
    const [view] = await this.db.select().from(views).where(eq(views.id, id));
    if (!view) throw new NotFoundException();
    const buckets = Array.from(new Set([...view.buckets, ...body.buckets])).sort((a, b) => a - b);
    await this.db
      .update(views)
      .set({
        watchedSec: view.watchedSec + body.watchedDelta,
        maxPosition: Math.max(view.maxPosition, body.position),
        completed: view.completed || Boolean(body.completed),
        buckets,
        lastSeenAt: new Date(),
      })
      .where(eq(views.id, id));
  }

  /** Emails the owner when a link is opened, at most once an hour per link. */
  private async notify(link: ShareLink, video: Video) {
    try {
      const cutoff = new Date(Date.now() - NOTIFY_EVERY_MS);
      const claimed = await this.db
        .update(shareLinks)
        .set({ lastNotifiedAt: new Date() })
        .where(and(eq(shareLinks.id, link.id), or(isNull(shareLinks.lastNotifiedAt), lt(shareLinks.lastNotifiedAt, cutoff))))
        .returning({ id: shareLinks.id });
      if (claimed.length === 0) return;
      const [owner] = await this.db.select().from(users).where(eq(users.id, video.ownerId));
      if (!owner) return;
      const email = await videoViewedEmail({
        appUrl: env.APP_URL,
        videoTitle: video.title,
        linkLabel: link.label,
        dashboardUrl: `${env.APP_URL}/videos/${video.id}`,
      });
      await this.mail.send(owner.email, email);
    } catch (err) {
      this.logger.warn(`View notification failed: ${(err as Error).message}`);
    }
  }
}
