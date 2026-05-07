import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

@Injectable()
export class MailerService {
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return Boolean(this.config.get<string>('SMTP_HOST') && this.fromAddress());
  }

  async sendPasswordReset(email: string, displayName: string, resetUrl: string, expiresAt: Date) {
    const from = this.fromAddress();
    if (!this.isConfigured() || !from) {
      throw new Error('SMTP is not configured');
    }

    await this.transport().sendMail({
      from,
      to: email,
      subject: 'Reset your StickerFoundry password',
      text: [
        `Hi ${displayName},`,
        '',
        'Use this link to reset your StickerFoundry password:',
        resetUrl,
        '',
        `This link expires at ${expiresAt.toISOString()}.`,
        'If you did not request this, you can ignore this email.',
      ].join('\n'),
    });
  }

  private transport() {
    if (this.transporter) return this.transporter;

    const port = Number.parseInt(this.config.get<string>('SMTP_PORT', '587'), 10);
    this.transporter = createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: Number.isFinite(port) ? port : 587,
      secure: this.config.get<string>('SMTP_SECURE', 'false').toLowerCase() === 'true',
      auth: this.config.get<string>('SMTP_USER')
        ? {
            user: this.config.get<string>('SMTP_USER'),
            pass: this.config.get<string>('SMTP_PASSWORD', ''),
          }
        : undefined,
    });
    return this.transporter;
  }

  private fromAddress() {
    return this.config.get<string>('SMTP_FROM');
  }
}
