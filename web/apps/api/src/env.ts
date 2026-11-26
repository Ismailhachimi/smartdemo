import { z } from "zod";

const flag = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v === "" ? undefined : v === "1" || v.toLowerCase() === "true"));

/** Optional string where "" counts as unset (docker compose passes empty variables). */
const optional = z
  .string()
  .optional()
  .transform((v) => v || undefined);

const schema = z
  .object({
  NODE_ENV: z.string().default("development"),
  API_PORT: z.coerce.number().int().default(4000),
  /** Public URL of the whole app (what people open in their browser), without trailing slash. */
  APP_URL: z
    .string()
    .url()
    .default("http://localhost:8080")
    .transform((u) => u.replace(/\/+$/, "")),
  DATABASE_URL: z.string().min(1),
  /** Secret used to sign short-lived media access tokens. Use a long random string. */
  APP_SECRET: z.string().min(16, "APP_SECRET must be at least 16 characters"),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(4096),

  /** Where media is stored: "local" (folder / Docker volume), "s3" (any S3-compatible) or "azure". */
  STORAGE_DRIVER: z.enum(["local", "s3", "azure"]).default("local"),
  /** Optional key prefix inside the bucket / container, e.g. "smartdemo/". */
  STORAGE_PREFIX: z.string().default(""),
  STORAGE_DIR: z.string().default("./storage"),
  /** Adaptive streaming: "auto" makes HLS copies when ffmpeg is available, "off" serves MP4 only. */
  STREAMING: z.enum(["auto", "off"]).default("auto"),
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
  /** Videos transcoded at the same time. Each one uses all CPU cores ffmpeg can get. */
  STREAM_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  S3_BUCKET: optional,
  S3_REGION: z.string().default("us-east-1"),
  /** Custom endpoint for S3-compatible services (R2, Scaleway, SeaweedFS…). Empty for AWS. */
  S3_ENDPOINT: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  /** Path-style URLs (bucket in the path). Defaults to true when S3_ENDPOINT is set. */
  S3_FORCE_PATH_STYLE: flag,
  AZURE_STORAGE_CONNECTION_STRING: optional,
  AZURE_STORAGE_CONTAINER: z.string().default("smartdemo"),

  /** Comma-separated emails or @domains allowed to sign in. Empty = anyone can create an account. */
  ALLOWED_EMAILS: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  RESEND_API_KEY: optional,
  EMAIL_FROM: z.string().default("SmartDemo <onboarding@resend.dev>"),
  /** Also print emails to the logs when Resend is configured. */
  EMAIL_LOG: flag,
  /** Force the Secure flag on cookies. Defaults to true when APP_URL is https. */
  COOKIE_SECURE: flag,
})
  .superRefine((e, ctx) => {
    if (e.STORAGE_DRIVER === "s3" && !e.S3_BUCKET) {
      ctx.addIssue({ code: "custom", path: ["S3_BUCKET"], message: "Required when STORAGE_DRIVER=s3" });
    }
    if (e.STORAGE_DRIVER === "azure" && !e.AZURE_STORAGE_CONNECTION_STRING) {
      ctx.addIssue({ code: "custom", path: ["AZURE_STORAGE_CONNECTION_STRING"], message: "Required when STORAGE_DRIVER=azure" });
    }
  });

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ Invalid environment:\n" + z.prettifyError(parsed.error));
    process.exit(1);
  }
  return parsed.data;
}

export const env = load();
export const cookieSecure = env.COOKIE_SECURE ?? env.APP_URL.startsWith("https://");
