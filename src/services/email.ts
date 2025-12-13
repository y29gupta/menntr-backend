// src/services/email.ts
import type { EmailClient } from '@azure/communication-email';

export async function sendInviteMail(mailer: EmailClient, to: string, link: string, name?: string) {
  const subject = 'MENNTR Invitation';
  const html = `
    <p>Hi ${name || ''},</p>
    <p>You have been invited to MENNTR. Click the link below to complete setup:</p>
    <p><a href="${link}">${link}</a></p>
    <p>This link will expire.</p>
  `;

  const message = {
    senderAddress: process.env.ACS_FROM_EMAIL!, // must be set
    content: {
      subject,
      html,
    },
    recipients: {
      to: [{ address: to }],
    },
  };

  try {
    // beginSend returns a Poller which we wait for.
    const poller = await mailer.beginSend(message);
    const result = await poller.pollUntilDone();
    // result may contain per-recipient status
    return result;
  } catch (err) {
    // log full error server-side and rethrow a sanitized error
    console.error('sendInviteMail error:', err);
    throw new Error('Failed to send email');
  }
}
