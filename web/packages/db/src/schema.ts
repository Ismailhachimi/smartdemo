import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const userRole = pgEnum("user_role", ["admin", "member"]);
export const videoStatus = pgEnum("video_status", ["uploading", "ready", "failed"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: userRole("role").notNull().default("member"),
  createdAt: createdAt(),
});

/** One-time sign-in links sent by email. Only the SHA-256 of the token is stored. */
export const loginTokens = pgTable("login_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Browser sessions (httpOnly cookie). Only the SHA-256 of the token is stored. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Personal access tokens used by the desktop app. */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("api_tokens_user_idx").on(t.userId)],
);

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: videoStatus("status").notNull().default("uploading"),
    mimeType: text("mime_type").notNull().default("video/mp4"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    durationSec: real("duration_sec"),
    width: integer("width"),
    height: integer("height"),
    storageKey: text("storage_key").notNull(),
    thumbnailKey: text("thumbnail_key"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("videos_owner_idx").on(t.ownerId, t.createdAt)],
);

/**
 * A shareable link to a video. One video can have many links (one per prospect, for example),
 * each with its own label, expiry, password and analytics.
 */
export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    label: text("label"),
    passwordHash: text("password_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    allowDownload: boolean("allow_download").notNull().default(false),
    notifyOnView: boolean("notify_on_view").notNull().default(true),
    disabled: boolean("disabled").notNull().default(false),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("share_links_slug_idx").on(t.slug), index("share_links_video_idx").on(t.videoId)],
);

/** Number of equal segments a video is split into for retention analytics. */
export const RETENTION_BUCKETS = 20;

/**
 * One playback session on a share link. Viewers are anonymous: no IP address is stored,
 * only a random id kept in the viewer's browser to count unique viewers.
 */
export const views = pgTable(
  "views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shareLinkId: uuid("share_link_id").notNull().references(() => shareLinks.id, { onDelete: "cascade" }),
    videoId: uuid("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
    viewerId: text("viewer_id").notNull(),
    userAgent: text("user_agent"),
    referrer: text("referrer"),
    watchedSec: real("watched_sec").notNull().default(0),
    maxPosition: real("max_position").notNull().default(0),
    completed: boolean("completed").notNull().default(false),
    buckets: jsonb("buckets").$type<number[]>().notNull().default(sql`'[]'::jsonb`),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("views_video_idx").on(t.videoId, t.startedAt), index("views_share_idx").on(t.shareLinkId)],
);

export const usersRelations = relations(users, ({ many }) => ({ videos: many(videos) }));
export const videosRelations = relations(videos, ({ one, many }) => ({
  owner: one(users, { fields: [videos.ownerId], references: [users.id] }),
  shareLinks: many(shareLinks),
}));
/** The emojis viewers can react with, in picker order. */
export const REACTION_EMOJIS = ["👍", "❤️", "🔥", "👏", "😮", "🤔"] as const;

/** A viewer's emoji reaction, pinned to a moment of the video. */
export const reactions = pgTable(
  "reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
    shareLinkId: uuid("share_link_id").notNull().references(() => shareLinks.id, { onDelete: "cascade" }),
    viewId: uuid("view_id").references(() => views.id, { onDelete: "set null" }),
    viewerId: text("viewer_id").notNull(),
    emoji: text("emoji").notNull(),
    atSec: real("at_sec").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("reactions_video_idx").on(t.videoId, t.atSec), index("reactions_share_idx").on(t.shareLinkId)],
);

export const shareLinksRelations = relations(shareLinks, ({ one, many }) => ({
  video: one(videos, { fields: [shareLinks.videoId], references: [videos.id] }),
  views: many(views),
}));
export const viewsRelations = relations(views, ({ one }) => ({
  shareLink: one(shareLinks, { fields: [views.shareLinkId], references: [shareLinks.id] }),
}));

export type User = typeof users.$inferSelect;
export type Video = typeof videos.$inferSelect;
export type ShareLink = typeof shareLinks.$inferSelect;
export type View = typeof views.$inferSelect;
export type Reaction = typeof reactions.$inferSelect;
