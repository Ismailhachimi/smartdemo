CREATE TYPE "public"."stream_status" AS ENUM('none', 'queued', 'processing', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "stream_status" "stream_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "stream_key" text;