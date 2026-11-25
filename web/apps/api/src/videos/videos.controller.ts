import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  PayloadTooLargeException,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { videos } from "@smartdemo/db";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { z } from "zod";
import { AuthGuard, CurrentUser } from "../auth/auth.guard.js";
import type { AuthUser } from "../auth/auth.service.js";
import { InjectDb, type Database } from "../common/db.module.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { env } from "../env.js";
import { StorageService } from "../storage/storage.service.js";
import { VideosService, shareUrl } from "./videos.service.js";

const UploadQuery = z.object({
  title: z.string().trim().max(200).optional(),
  durationSec: z.coerce.number().positive().max(86_400).optional(),
  width: z.coerce.number().int().positive().max(16_384).optional(),
  height: z.coerce.number().int().positive().max(16_384).optional(),
});

const RenameBody = z.object({ title: z.string().trim().min(1).max(200) });

export const ShareBody = z.object({
  label: z.string().trim().max(120).nullish(),
  password: z.string().min(4).max(200).nullish(),
  expiresAt: z.coerce.date().nullish(),
  allowDownload: z.boolean().optional(),
  notifyOnView: z.boolean().optional(),
  disabled: z.boolean().optional(),
});
export type ShareBodyT = z.infer<typeof ShareBody>;

const THUMB_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

@Controller("videos")
@UseGuards(AuthGuard)
export class VideosController {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly videos: VideosService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { videos: await this.videos.list(user.id) };
  }

  /**
   * Upload a recording. The request body is the raw video file (Content-Type: video/mp4),
   * metadata goes in the query string. A first share link is created right away, so the
   * desktop app can copy it to the clipboard.
   */
  @Post()
  async upload(@CurrentUser() user: AuthUser, @Req() req: Request, @Query(new ZodPipe(UploadQuery)) q: z.infer<typeof UploadQuery>) {
    const type = (req.headers["content-type"] ?? "").split(";")[0].trim();
    if (!type.startsWith("video/")) throw new BadRequestException("Envoie le fichier vidéo brut (Content-Type: video/mp4).");
    const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > maxBytes) throw new PayloadTooLargeException(`Fichier trop volumineux (max ${env.MAX_UPLOAD_MB} Mo).`);

    const title = q.title || `Vidéo du ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;
    const ext = type === "video/quicktime" ? "mov" : type === "video/webm" ? "webm" : "mp4";
    const [video] = await this.db
      .insert(videos)
      .values({
        ownerId: user.id,
        title,
        mimeType: type,
        durationSec: q.durationSec,
        width: q.width,
        height: q.height,
        storageKey: "pending",
      })
      .returning();
    const storageKey = `videos/${video.id}.${ext}`;
    try {
      const size = await this.storage.writeFromRequest(storageKey, req, maxBytes, type);
      if (size === 0) throw new BadRequestException("Fichier vide.");
      await this.db
        .update(videos)
        .set({ storageKey, sizeBytes: size, status: "ready", updatedAt: new Date() })
        .where(eq(videos.id, video.id));
    } catch (err) {
      await this.db.delete(videos).where(eq(videos.id, video.id));
      await this.storage.remove(storageKey);
      throw err;
    }
    const share = await this.videos.createShare(user.id, video.id, {});
    const saved = await this.videos.owned(user.id, video.id);
    return { video: this.videos.toDto(saved), share, shareUrl: shareUrl(share.slug), dashboardUrl: `${env.APP_URL}/videos/${video.id}` };
  }

  /** Poster image (the desktop app sends a frame from the recording). */
  @Put(":id/thumbnail")
  @HttpCode(204)
  async thumbnail(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Req() req: Request) {
    const video = await this.videos.owned(user.id, id);
    const type = (req.headers["content-type"] ?? "").split(";")[0].trim();
    const ext = THUMB_TYPES[type];
    if (!ext) throw new BadRequestException("Image JPEG, PNG ou WebP attendue.");
    const key = `thumbnails/${id}.${ext}`;
    await this.storage.writeFromRequest(key, req, 5 * 1024 * 1024, type);
    if (video.thumbnailKey && video.thumbnailKey !== key) await this.storage.remove(video.thumbnailKey);
    await this.db.update(videos).set({ thumbnailKey: key, updatedAt: new Date() }).where(eq(videos.id, id));
  }

  @Get(":id")
  detail(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.videos.detail(user.id, id);
  }

  @Patch(":id")
  async rename(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(RenameBody)) body: z.infer<typeof RenameBody>) {
    return { video: await this.videos.rename(user.id, id, body.title) };
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.videos.remove(user.id, id);
  }

  @Get(":id/stream")
  async stream(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Req() req: Request, @Res() res: Response) {
    const video = await this.videos.owned(user.id, id);
    await this.storage.send(req, res, video.storageKey, video.mimeType);
  }

  @Get(":id/thumbnail")
  async getThumbnail(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Req() req: Request, @Res() res: Response) {
    const video = await this.videos.owned(user.id, id);
    if (!video.thumbnailKey) {
      res.status(404).end();
      return;
    }
    await this.storage.send(req, res, video.thumbnailKey, mimeOf(video.thumbnailKey));
  }

  @Post(":id/shares")
  async createShare(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(ShareBody)) body: ShareBodyT) {
    return { share: await this.videos.createShare(user.id, id, body) };
  }
}

@Controller("shares")
@UseGuards(AuthGuard)
export class SharesController {
  constructor(private readonly videos: VideosService) {}

  @Patch(":id")
  async update(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(ShareBody)) body: ShareBodyT) {
    return { share: await this.videos.updateShare(user.id, id, body) };
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.videos.deleteShare(user.id, id);
  }
}

@Controller("activity")
@UseGuards(AuthGuard)
export class ActivityController {
  constructor(private readonly videos: VideosService) {}

  @Get()
  async activity(@CurrentUser() user: AuthUser) {
    return this.videos.activity(user.id);
  }
}

export function mimeOf(key: string): string {
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
