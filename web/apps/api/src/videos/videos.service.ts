import { Injectable, NotFoundException } from "@nestjs/common";
import { RETENTION_BUCKETS, reactions, shareLinks, videos, views, type ShareLink, type Video } from "@smartdemo/db";
import { and, asc, count, desc, eq, getTableColumns, gte, inArray, max } from "drizzle-orm";
import { hashPassword, randomSlug } from "../common/crypto.js";
import { InjectDb, type Database } from "../common/db.module.js";
import { env } from "../env.js";
import { StorageService } from "../storage/storage.service.js";
import { computeStats, describeUserAgent } from "./analytics.js";

export interface ShareInput {
  label?: string | null;
  password?: string | null;
  expiresAt?: Date | null;
  allowDownload?: boolean;
  notifyOnView?: boolean;
  disabled?: boolean;
}

export const shareUrl = (slug: string) => `${env.APP_URL}/v/${slug}`;

const DAY_MS = 86_400_000;
/** A viewer whose player reported progress this recently is "watching now". */
const LIVE_MS = 2 * 60_000;

const watchedShare = (buckets: number[]) => Math.min(1, new Set(buckets).size / RETENTION_BUCKETS);

@Injectable()
export class VideosService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly storage: StorageService,
  ) {}

  async owned(userId: string, id: string): Promise<Video> {
    const [video] = await this.db
      .select()
      .from(videos)
      .where(and(eq(videos.id, id), eq(videos.ownerId, userId)));
    if (!video) throw new NotFoundException("Vidéo introuvable");
    return video;
  }

  async list(userId: string) {
    const stats = this.db
      .select({ videoId: views.videoId, opens: count().as("opens"), lastViewAt: max(views.startedAt).as("last_view_at") })
      .from(views)
      .groupBy(views.videoId)
      .as("stats");
    const rows = await this.db
      .select({ ...getTableColumns(videos), opens: stats.opens, lastViewAt: stats.lastViewAt })
      .from(videos)
      .leftJoin(stats, eq(stats.videoId, videos.id))
      .where(eq(videos.ownerId, userId))
      .orderBy(desc(videos.createdAt));
    const links = rows.length
      ? await this.db
          .select({ videoId: shareLinks.videoId, slug: shareLinks.slug, disabled: shareLinks.disabled })
          .from(shareLinks)
          .where(inArray(shareLinks.videoId, rows.map((r) => r.id)))
          .orderBy(asc(shareLinks.createdAt))
      : [];
    return rows.map(({ opens, lastViewAt, ...v }) => {
      const own = links.filter((l) => l.videoId === v.id);
      const first = own.find((l) => !l.disabled);
      return {
        ...this.toDto(v),
        opens: Number(opens ?? 0),
        lastViewAt,
        linkCount: own.length,
        shareUrl: first ? shareUrl(first.slug) : null,
      };
    });
  }

  async detail(userId: string, id: string) {
    const video = await this.owned(userId, id);
    const links = await this.db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.videoId, id))
      .orderBy(asc(shareLinks.createdAt));
    const viewRows = await this.db
      .select()
      .from(views)
      .where(eq(views.videoId, id))
      .orderBy(desc(views.startedAt));

    const reactionRows = await this.db
      .select({ id: reactions.id, shareLinkId: reactions.shareLinkId, emoji: reactions.emoji, atSec: reactions.atSec, createdAt: reactions.createdAt })
      .from(reactions)
      .where(eq(reactions.videoId, id))
      .orderBy(asc(reactions.atSec));

    return {
      video: this.toDto(video),
      reactions: reactionRows.map((r) => ({ ...r, linkLabel: links.find((l) => l.id === r.shareLinkId)?.label ?? null })),
      shareLinks: links.map((l) => {
        const own = viewRows.filter((v) => v.shareLinkId === l.id);
        return { ...this.shareDto(l), stats: computeStats(own) };
      }),
      stats: computeStats(viewRows),
      recentViews: viewRows.slice(0, 50).map((v) => ({
        id: v.id,
        shareLinkId: v.shareLinkId,
        linkLabel: links.find((l) => l.id === v.shareLinkId)?.label ?? null,
        startedAt: v.startedAt,
        watchedSec: Math.round(v.watchedSec),
        watched: watchedShare(v.buckets),
        completed: v.completed,
        device: describeUserAgent(v.userAgent),
        referrer: v.referrer,
      })),
    };
  }

  /** Views across all of the user's videos: this week vs last week, and the latest views. */
  async activity(userId: string) {
    const now = Date.now();
    const recent = await this.db
      .select({ viewerId: views.viewerId, watchedSec: views.watchedSec, completed: views.completed, buckets: views.buckets, startedAt: views.startedAt })
      .from(views)
      .innerJoin(videos, eq(videos.id, views.videoId))
      .where(and(eq(videos.ownerId, userId), gte(views.startedAt, new Date(now - 14 * DAY_MS))));
    const thisWeek = recent.filter((r) => r.startedAt.getTime() >= now - 7 * DAY_MS);
    const lastWeek = recent.filter((r) => r.startedAt.getTime() < now - 7 * DAY_MS);

    const rows = await this.db
      .select({
        view: views,
        video: { id: videos.id, title: videos.title, durationSec: videos.durationSec, thumbnailKey: videos.thumbnailKey, updatedAt: videos.updatedAt },
        link: { id: shareLinks.id, label: shareLinks.label },
      })
      .from(views)
      .innerJoin(videos, eq(videos.id, views.videoId))
      .innerJoin(shareLinks, eq(shareLinks.id, views.shareLinkId))
      .where(eq(videos.ownerId, userId))
      .orderBy(desc(views.lastSeenAt))
      .limit(100);

    return {
      week: computeStats(thisWeek),
      previousWeek: computeStats(lastWeek),
      views: rows.map(({ view: v, video, link }) => ({
        id: v.id,
        startedAt: v.startedAt,
        lastSeenAt: v.lastSeenAt,
        live: now - v.lastSeenAt.getTime() < LIVE_MS && !v.completed,
        watchedSec: Math.round(v.watchedSec),
        watched: watchedShare(v.buckets),
        completed: v.completed,
        device: describeUserAgent(v.userAgent),
        video: { id: video.id, title: video.title, durationSec: video.durationSec, hasThumbnail: Boolean(video.thumbnailKey), updatedAt: video.updatedAt },
        link: { id: link.id, label: link.label },
      })),
    };
  }

  async rename(userId: string, id: string, title: string) {
    await this.owned(userId, id);
    const [video] = await this.db.update(videos).set({ title, updatedAt: new Date() }).where(eq(videos.id, id)).returning();
    return this.toDto(video);
  }

  async remove(userId: string, id: string) {
    const video = await this.owned(userId, id);
    await this.db.delete(videos).where(eq(videos.id, id));
    await this.storage.remove(video.storageKey);
    await this.storage.remove(video.thumbnailKey);
  }

  async createShare(userId: string, videoId: string, input: ShareInput) {
    await this.owned(userId, videoId);
    const [link] = await this.db
      .insert(shareLinks)
      .values({
        videoId,
        slug: randomSlug(),
        label: input.label?.trim() || null,
        passwordHash: input.password ? await hashPassword(input.password) : null,
        expiresAt: input.expiresAt ?? null,
        allowDownload: input.allowDownload ?? false,
        notifyOnView: input.notifyOnView ?? true,
      })
      .returning();
    return this.shareDto(link);
  }

  async updateShare(userId: string, shareId: string, input: ShareInput) {
    await this.ownedShare(userId, shareId);
    const patch: Partial<ShareLink> = {};
    if (input.label !== undefined) patch.label = input.label?.trim() || null;
    if (input.password !== undefined) patch.passwordHash = input.password ? await hashPassword(input.password) : null;
    if (input.expiresAt !== undefined) patch.expiresAt = input.expiresAt;
    if (input.allowDownload !== undefined) patch.allowDownload = input.allowDownload;
    if (input.notifyOnView !== undefined) patch.notifyOnView = input.notifyOnView;
    if (input.disabled !== undefined) patch.disabled = input.disabled;
    const [link] = await this.db.update(shareLinks).set(patch).where(eq(shareLinks.id, shareId)).returning();
    return this.shareDto(link);
  }

  async deleteShare(userId: string, shareId: string) {
    await this.ownedShare(userId, shareId);
    await this.db.delete(shareLinks).where(eq(shareLinks.id, shareId));
  }

  private async ownedShare(userId: string, shareId: string) {
    const [row] = await this.db
      .select({ id: shareLinks.id })
      .from(shareLinks)
      .innerJoin(videos, eq(videos.id, shareLinks.videoId))
      .where(and(eq(shareLinks.id, shareId), eq(videos.ownerId, userId)));
    if (!row) throw new NotFoundException("Lien introuvable");
  }

  toDto(v: Video) {
    return {
      id: v.id,
      title: v.title,
      status: v.status,
      sizeBytes: v.sizeBytes,
      durationSec: v.durationSec,
      width: v.width,
      height: v.height,
      hasThumbnail: Boolean(v.thumbnailKey),
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    };
  }

  shareDto(l: ShareLink) {
    return {
      id: l.id,
      slug: l.slug,
      url: shareUrl(l.slug),
      label: l.label,
      hasPassword: Boolean(l.passwordHash),
      expiresAt: l.expiresAt,
      allowDownload: l.allowDownload,
      notifyOnView: l.notifyOnView,
      disabled: l.disabled,
      createdAt: l.createdAt,
    };
  }
}
