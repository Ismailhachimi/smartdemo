import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { apiTokens, loginTokens, sessions, users, type User } from "@smartdemo/db";
import { magicLinkEmail } from "@smartdemo/emails";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { InjectDb, type Database } from "../common/db.module.js";
import { randomToken, sha256 } from "../common/crypto.js";
import { env } from "../env.js";
import { MailService } from "../mail/mail.service.js";

export const SESSION_COOKIE = "sd_session";
export const SESSION_DAYS = 30;
const LINK_MINUTES = 15;
export const API_TOKEN_PREFIX = "sd_";

export type AuthUser = Pick<User, "id" | "email" | "name" | "role">;

@Injectable()
export class AuthService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly mail: MailService,
  ) {}

  isAllowed(email: string): boolean {
    const rules = env.ALLOWED_EMAILS;
    if (rules.length === 0) return true;
    return rules.some((r) => (r.startsWith("@") ? email.endsWith(r) : email === r));
  }

  async requestMagicLink(rawEmail: string, next?: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    if (!this.isAllowed(email)) throw new ForbiddenException("Cette adresse n'est pas autorisée sur ce serveur.");
    const token = randomToken();
    await this.db.insert(loginTokens).values({
      email,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000),
    });
    const url = `${env.APP_URL}/auth/verify?token=${encodeURIComponent(token)}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
    await this.mail.send(email, await magicLinkEmail({ url, appUrl: env.APP_URL, minutes: LINK_MINUTES }));
  }

  /** Consumes a magic link token and opens a session. Creates the account on first sign-in. */
  async verify(token: string, userAgent: string | undefined): Promise<{ user: AuthUser; sessionToken: string }> {
    const [login] = await this.db
      .update(loginTokens)
      .set({ usedAt: new Date() })
      .where(
        and(eq(loginTokens.tokenHash, sha256(token)), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, new Date())),
      )
      .returning();
    if (!login) throw new UnauthorizedException("Ce lien a expiré ou a déjà été utilisé.");

    let [user] = await this.db.select().from(users).where(eq(users.email, login.email));
    if (!user) {
      const [{ n }] = await this.db.select({ n: count() }).from(users);
      [user] = await this.db
        .insert(users)
        .values({ email: login.email, role: n === 0 ? "admin" : "member" })
        .onConflictDoNothing()
        .returning();
      user ??= (await this.db.select().from(users).where(eq(users.email, login.email)))[0];
    }

    const sessionToken = randomToken();
    await this.db.insert(sessions).values({
      userId: user.id,
      tokenHash: sha256(sessionToken),
      userAgent: userAgent?.slice(0, 300),
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
    });
    return { user: pick(user), sessionToken };
  }

  async userFromSession(token: string): Promise<AuthUser | null> {
    const [row] = await this.db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())));
    return row ? pick(row.user) : null;
  }

  async userFromApiToken(token: string): Promise<AuthUser | null> {
    if (!token.startsWith(API_TOKEN_PREFIX)) return null;
    const [row] = await this.db
      .select({ user: users, tokenId: apiTokens.id, lastUsedAt: apiTokens.lastUsedAt })
      .from(apiTokens)
      .innerJoin(users, eq(users.id, apiTokens.userId))
      .where(and(eq(apiTokens.tokenHash, sha256(token)), isNull(apiTokens.revokedAt)));
    if (!row) return null;
    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
      await this.db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.tokenId));
    }
    return pick(row.user);
  }

  async logout(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  }

  async updateProfile(userId: string, name: string | null): Promise<AuthUser> {
    const [user] = await this.db.update(users).set({ name }).where(eq(users.id, userId)).returning();
    return pick(user);
  }
}

function pick(u: User): AuthUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}
