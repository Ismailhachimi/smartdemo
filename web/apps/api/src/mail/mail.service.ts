import { Global, Injectable, Logger, Module } from "@nestjs/common";
import type { RenderedEmail } from "@smartdemo/emails";
import { Resend } from "resend";
import { env } from "../env.js";

/**
 * Sends transactional emails with Resend. Without RESEND_API_KEY (local development, or a
 * self-hosted install without email), emails are printed to the logs instead, links included,
 * so you can still sign in.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger("Mail");
  private readonly resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

  constructor() {
    if (!this.resend) this.logger.warn("RESEND_API_KEY is not set: emails are printed to the logs.");
  }

  async send(to: string, email: RenderedEmail): Promise<void> {
    if (!this.resend || env.EMAIL_LOG) this.print(to, email);
    if (!this.resend) return;
    const { error } = await this.resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (error) {
      this.logger.error(`Resend failed for ${to}: ${error.message}`);
      throw new Error("Email delivery failed");
    }
  }

  private print(to: string, email: RenderedEmail) {
    const bar = "─".repeat(64);
    this.logger.log(`\n${bar}\n✉️  To: ${to}\n   Subject: ${email.subject}\n${bar}\n${email.text.trim()}\n${bar}`);
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
