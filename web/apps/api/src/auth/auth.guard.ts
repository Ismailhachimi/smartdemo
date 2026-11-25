import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService, SESSION_COOKIE, type AuthUser } from "./auth.service.js";

type AuthedRequest = Request & { user?: AuthUser };

/**
 * Accepts either the browser session cookie or a personal access token
 * (`Authorization: Bearer sd_…`, used by the desktop app).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    let user: AuthUser | null = null;
    if (header?.startsWith("Bearer ")) {
      user = await this.auth.userFromApiToken(header.slice(7).trim());
    } else {
      const cookie = req.cookies?.[SESSION_COOKIE] as string | undefined;
      if (cookie) user = await this.auth.userFromSession(cookie);
    }
    if (!user) throw new UnauthorizedException("Connexion requise.");
    req.user = user;
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user!;
});
