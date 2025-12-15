import { config } from '../config';
import { AppError } from '../utils/errors';
import type { Transporter } from 'nodemailer';
import type { EmailClient } from '@azure/communication-email';

export class EmailService {
  constructor(
    private acsClient: EmailClient, // EXISTING (DoNotReply)
    private inviteMailer: Transporter // SMTP (invite@)
  ) {}

  /**
   * INVITATION EMAIL → SMTP (invite@pathaxiom.com)
   */
  async sendInvite(to: string, link: string, name?: string): Promise<void> {
    try {
      await this.inviteMailer.sendMail({
        from: config.email.inviteFromEmail, // invite@pathaxiom.com
        // replyTo: [config.email.inviteFromEmail],
        to,
        subject: 'MENNTR Invitation',
        html: `
          <p>Hi ${name || ''},</p>
          <p>You have been invited to MENNTR.</p>
          <p>
            <a href="${link}">Complete your setup</a>
          </p>
          <p>This link will expire in ${config.auth.otpExpiryMinutes} minutes.</p>
        `,
      });
    } catch (err: any) {
      console.error('SMTP INVITE ERROR:', {
        message: err?.message,
        code: err?.code,
        response: err?.response,
        responseCode: err?.responseCode,
        command: err?.command,
      });

      throw new AppError(`Failed to send invite email: ${err?.message || 'SMTP error'}`, 500);
    }
  }

  /**
   * OTHER EMAILS → ACS (DoNotReply@pathaxiom.com)
   * ⚠️ NOT MODIFIED
   */
  async sendSystemEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      const message = {
        senderAddress: config.email.fromEmail, // DoNotReply@pathaxiom.com
        content: { subject, html },
        recipients: {
          to: [{ address: to }],
        },
        replyTo: [{ address: 'invite@pathaxiom.com' }],
      };

      const poller = await this.acsClient.beginSend(message);
      await poller.pollUntilDone();
    } catch (err) {
      throw new AppError('Failed to send system email', 500);
    }
  }
}
