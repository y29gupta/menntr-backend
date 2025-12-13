import type { EmailClient } from '@azure/communication-email';
import { config } from '../config';
import { AppError } from '../utils/errors';

export class EmailService {
  constructor(private client: EmailClient) {}

  async sendInvite(to: string, link: string, name?: string): Promise<void> {
    const subject = 'MENNTR Invitation';
    const html = `
      <p>Hi ${name || ''},</p>
      <p>You have been invited to MENNTR. Click the link below to complete setup:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link will expire in ${config.auth.otpExpiryMinutes} minutes.</p>
    `;

    const message = {
      senderAddress: config.email.fromEmail,
      content: { subject, html },
      recipients: {
        to: [{ address: to }],
      },
    };

    try {
      const poller = await this.client.beginSend(message);
      await poller.pollUntilDone();
    } catch (error) {
      throw new AppError('Failed to send email', 500);
    }
  }
}
