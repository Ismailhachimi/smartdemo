import { Injectable, Logger, NotFoundException, type OnApplicationBootstrap } from "@nestjs/common";
import type { Request, Response } from "express";
import { videos } from "@smartdemo/db";
import { and, eq, inArray } from "drizzle-orm";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { InjectDb, type Database } from "../common/db.module.js";
import { env } from "../env.js";
import { StorageService } from "../storage/storage.service.js";

/** Renditions, best first. Only those at or below the source height are made. */
const LADDER = [
  { height: 1080, maxrate: 5000 },
  { height: 720, maxrate: 2800 },
  { height: 480, maxrate: 1200 },
];
const SEGMENT_SEC = 4;

export const streamPrefix = (videoId: string) => `hls/${videoId}/`;

/**
 * Adaptive streaming, self-hosted: after an upload, ffmpeg turns the MP4 into HLS (several
 * qualities cut into 4-second segments) stored next to it. Until that is done, or when ffmpeg
 * is missing, the MP4 is served as before.
 */
@Injectable()
export class StreamingService implements OnApplicationBootstrap {
  private readonly logger = new Logger("Streaming");
  private enabled = false;
  private readonly queue: string[] = [];
  private running = 0;

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly storage: StorageService,
  ) {}

  async onApplicationBootstrap() {
    if (env.STREAMING === "off") {
      this.logger.log("Adaptive streaming off (STREAMING=off): videos are served as MP4");
      return;
    }
    const version = await run(env.FFMPEG_PATH, ["-version"]).catch(() => null);
    if (!version) {
      this.logger.warn(`ffmpeg not found (${env.FFMPEG_PATH}): videos are served as MP4 only`);
      return;
    }
    this.enabled = true;
    this.logger.log(`Adaptive streaming on (${version.stdout.split("\n")[0]})`);
    // Catch up: videos uploaded before streaming existed, and jobs cut short by a restart.
    const pending = await this.db
      .select({ id: videos.id })
      .from(videos)
      .where(and(eq(videos.status, "ready"), inArray(videos.streamStatus, ["none", "queued", "processing"])));
    for (const v of pending) await this.enqueue(v.id);
  }

  /** Queues a video for transcoding. No-op when streaming is unavailable. */
  async enqueue(videoId: string) {
    if (!this.enabled || this.queue.includes(videoId)) return;
    await this.db.update(videos).set({ streamStatus: "queued" }).where(eq(videos.id, videoId));
    this.queue.push(videoId);
    this.pump();
  }

  /** Removes a video's HLS files (when the video is deleted). */
  async remove(videoId: string) {
    await this.storage.removePrefix(streamPrefix(videoId));
  }

  /**
   * Serves one HLS file of a video: `file` is "master.m3u8", "<height>p/index.m3u8" or
   * "<height>p/seg_0000.ts". With `token`, playlist entries get `?t=<token>` appended so the
   * player's next requests carry the share link's access token.
   */
  async send(req: Request, res: Response, video: { streamStatus: string; streamKey: string | null }, file: string, token?: string) {
    if (video.streamStatus !== "ready" || !video.streamKey) throw new NotFoundException("Pas de version streaming pour cette vidéo.");
    if (!/^(master\.m3u8|\d{3,4}p\/(index\.m3u8|seg_\d{4,6}\.ts))$/.test(file)) throw new NotFoundException();
    const key = video.streamKey + file;
    if (file.endsWith(".ts")) {
      await this.storage.send(req, res, key, "video/mp2t", { cache: "private, max-age=86400" });
      return;
    }
    const text = await this.storage.readText(key);
    if (text === null) throw new NotFoundException();
    const body = token
      ? text
          .split("\n")
          .map((line) => (line && !line.startsWith("#") ? `${line}?t=${encodeURIComponent(token)}` : line))
          .join("\n")
      : text;
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "private, no-cache");
    res.send(body);
  }

  private pump() {
    while (this.running < env.STREAM_CONCURRENCY && this.queue.length) {
      const id = this.queue.shift()!;
      this.running++;
      void this.transcode(id).finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  private async transcode(videoId: string) {
    const [video] = await this.db.select().from(videos).where(eq(videos.id, videoId));
    if (!video || video.status !== "ready") return;
    const started = Date.now();
    await this.db.update(videos).set({ streamStatus: "processing" }).where(eq(videos.id, videoId));
    const work = await mkdtemp(join(tmpdir(), "smartdemo-hls-"));
    try {
      const source = await this.storage.readablePath(video.storageKey, work);
      try {
        const probe = await this.probe(source.path);
        const out = join(work, "out");
        await run(env.FFMPEG_PATH, ffmpegArgs(source.path, out, probe));
        const prefix = streamPrefix(videoId);
        await this.storage.removePrefix(prefix);
        for (const file of await walk(out)) {
          const key = prefix + relative(out, file).split("\\").join("/");
          await this.storage.putFile(key, file, file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t");
        }
        await this.db.update(videos).set({ streamStatus: "ready", streamKey: prefix }).where(eq(videos.id, videoId));
        this.logger.log(`Video ${videoId}: HLS ready (${probe.height}p source, ${Math.round((Date.now() - started) / 1000)} s)`);
      } finally {
        await source.cleanup();
      }
    } catch (err) {
      await this.db.update(videos).set({ streamStatus: "failed" }).where(eq(videos.id, videoId));
      this.logger.error(`Video ${videoId}: HLS failed: ${(err as Error).message.slice(-800)}`);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  private async probe(path: string): Promise<{ height: number; audio: boolean }> {
    const { stdout } = await run(env.FFPROBE_PATH, ["-v", "error", "-show_entries", "stream=codec_type,height", "-of", "json", path]);
    const streams = (JSON.parse(stdout).streams ?? []) as { codec_type: string; height?: number }[];
    const height = streams.find((s) => s.codec_type === "video")?.height;
    if (!height) throw new Error("No video stream");
    return { height, audio: streams.some((s) => s.codec_type === "audio") };
  }
}

function ffmpegArgs(input: string, out: string, probe: { height: number; audio: boolean }): string[] {
  let rungs = LADDER.filter((r) => r.height <= probe.height);
  if (rungs.length === 0) rungs = [{ height: probe.height - (probe.height % 2), maxrate: 1200 }];
  const n = rungs.length;
  const split = `[0:v]split=${n}${rungs.map((_, i) => `[s${i}]`).join("")}`;
  const scales = rungs.map((r, i) => `[s${i}]scale=-2:${r.height}:flags=lanczos[v${i}]`);
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-filter_complex", [split, ...scales].join(";")];
  rungs.forEach((r, i) => {
    args.push("-map", `[v${i}]`);
    args.push(`-maxrate:v:${i}`, `${r.maxrate}k`, `-bufsize:v:${i}`, `${r.maxrate * 2}k`);
  });
  if (probe.audio) rungs.forEach(() => args.push("-map", "0:a:0"));
  args.push(
    // Screen recordings: sharp text matters more than file size.
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-profile:v", "high",
    // Keyframes on segment boundaries, so every quality switches cleanly.
    "-force_key_frames", `expr:gte(t,n_forced*${SEGMENT_SEC})`, "-sc_threshold", "0",
  );
  if (probe.audio) args.push("-c:a", "aac", "-b:a", "128k", "-ac", "2");
  const streamMap = rungs.map((r, i) => `v:${i}${probe.audio ? `,a:${i}` : ""},name:${r.height}p`).join(" ");
  args.push(
    "-f", "hls",
    "-hls_time", String(SEGMENT_SEC),
    "-hls_playlist_type", "vod",
    "-hls_flags", "independent_segments",
    "-hls_segment_filename", join(out, "%v", "seg_%04d.ts"),
    "-master_pl_name", "master.m3u8",
    "-var_stream_map", streamMap,
    join(out, "%v", "index.m3u8"),
  );
  return args;
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])));
  return files.flat();
}

function run(cmd: string, args: string[]): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve({ stdout }) : reject(new Error(`${cmd} exited with ${code}: ${stderr}`))));
  });
}
