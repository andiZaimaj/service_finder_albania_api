import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;

  constructor(private readonly configService: ConfigService) {
    const key = this.configService.get<string>('RESEND_API_KEY');
    this.resend = key && !key.includes('placeholder') ? new Resend(key) : null;
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const frontend =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    const url = `${frontend}/reset-password?token=${encodeURIComponent(token)}`;
    const from =
      this.configService.get<string>('EMAIL_FROM') ??
      'Service Finder Albania <onboarding@resend.dev>';

    if (!this.resend) {
      this.logger.warn(
        `Resend not configured. Password reset link for ${to}: ${url}`,
      );
      return;
    }

    await this.resend.emails.send({
      from,
      to,
      subject: 'Reset your password',
      html: `<p>Click to reset your password:</p><p><a href="${url}">${url}</a></p>`,
    });
  }
}
