CREATE TABLE "reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"share_link_id" uuid NOT NULL,
	"view_id" uuid,
	"viewer_id" text NOT NULL,
	"emoji" text NOT NULL,
	"at_sec" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_share_link_id_share_links_id_fk" FOREIGN KEY ("share_link_id") REFERENCES "public"."share_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_view_id_views_id_fk" FOREIGN KEY ("view_id") REFERENCES "public"."views"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reactions_video_idx" ON "reactions" USING btree ("video_id","at_sec");--> statement-breakpoint
CREATE INDEX "reactions_share_idx" ON "reactions" USING btree ("share_link_id");