import { config } from '../config';
import { AppError } from '../utils/errors';
import type { Transporter } from 'nodemailer';
import type { EmailClient } from '@azure/communication-email';

// Email template types
type InviteType = 'institution' | 'hod' | 'principal' | 'faculty';

interface InviteData {
  recipientName?: string;
  inviteLink: string;
  inviterName?: string;
  institutionName?: string;
  institutionCode?: string;
  role?: string;
}

export class EmailService {
  constructor(
    private acsClient: EmailClient, // EXISTING (DoNotReply)
    // private inviteMailer: Transporter // SMTP (invite@)
  ) {}


  private generateInviteTemplate(type: InviteType, data: InviteData): string {
    const { recipientName, inviteLink, inviterName, institutionName, institutionCode, role } = data;
    const expiryMinutes = config.auth.otpExpiryMinutes;

    // Common styles
    const styles = `
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                  color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; }
        .button { display: inline-block; padding: 14px 32px; background: #667eea; 
                  color: white; text-decoration: none; border-radius: 6px; 
                  font-weight: bold; margin: 20px 0; }
        .button:hover { background: #5568d3; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .info-box { background: #f8f9fa; padding: 15px; border-left: 4px solid #667eea; 
                    margin: 15px 0; border-radius: 4px; }
      </style>
    `;

    switch (type) {
      case 'institution':
        return `
          ${styles}
          <div class="container">
            <div class="header">
              <h1>Welcome to MENNTR</h1>
            </div>
            <div class="content">
              <p>Hi ${recipientName || 'there'},</p>
              <p>Institution Code: ${institutionCode}</p>
              <p>You have been invited to join <strong>MENNTR</strong> as an institutional partner.</p>
              
              <div class="info-box">
                <strong>🎓 What's Next?</strong><br/>
                Complete your institution setup to unlock:
                <ul>
                  <li>Onboard faculty members (HOD, Principal, Teachers)</li>
                  <li>Manage institutional resources</li>
                  <li>Access mentorship tools and analytics</li>
                </ul>
              </div>
              
              <div style="text-align: center;">
                <a href="${inviteLink}" class="button">Complete Institution Setup</a>
              </div>
              
              <p style="color: #d32f2f; font-size: 14px;">
                ⚠️ This link will expire in <strong>${expiryMinutes} minutes</strong>.
              </p>
              
              <p style="margin-top: 30px; color: #666;">
                If you have any questions, feel free to reply to this email.
              </p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} MENNTR. All rights reserved.</p>
              <p>PathAxiom Technologies</p>
            </div>
          </div>
        `;

      case 'hod':
      case 'principal':
      case 'faculty':
        const roleDisplay = role || type.toUpperCase();
        const greeting = recipientName ? `Dr. ${recipientName}` : 'there';

        return `
          ${styles}
          <div class="container">
            <div class="header">
              <h1>Join ${institutionName || 'Your Institution'} on MENNTR</h1>
            </div>
            <div class="content">
              <p>Hi ${greeting},</p>
              
              <p>
                ${inviterName ? `<strong>${inviterName}</strong> from ` : ''}
                <strong>${institutionName || 'Your institution'}</strong> has invited you to join 
                MENNTR as a <strong>${roleDisplay}</strong>.
              </p>
              
              <div class="info-box">
                <strong>🚀 Your Role & Responsibilities:</strong><br/>
                ${this.getRoleDescription(type)}
              </div>
              
              <div style="text-align: center;">
                <a href="${inviteLink}" class="button">Accept Invitation</a>
              </div>
              
              <p style="color: #d32f2f; font-size: 14px;">
                ⚠️ This invitation expires in <strong>${expiryMinutes} minutes</strong>.
              </p>
              
              <p style="margin-top: 30px;">
                <strong>Need Help?</strong><br/>
                Contact your institution administrator or reply to this email.
              </p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} MENNTR. All rights reserved.</p>
              <p>PathAxiom Technologies</p>
            </div>
          </div>
        `;

      default:
        throw new AppError(`Unknown invite type: ${type}`, 400);
    }
  }


  private getRoleDescription(type: InviteType): string {
    const descriptions = {
      hod: `
        <ul>
          <li>Oversee department mentorship programs</li>
          <li>Assign and monitor faculty mentors</li>
          <li>Review departmental analytics and reports</li>
          <li>Coordinate with institutional leadership</li>
        </ul>
      `,
      principal: `
        <ul>
          <li>Manage institution-wide mentorship initiatives</li>
          <li>Approve faculty and student enrollments</li>
          <li>Access comprehensive institutional analytics</li>
          <li>Configure institutional policies and settings</li>
        </ul>
      `,
      faculty: `
        <ul>
          <li>Mentor assigned students</li>
          <li>Track mentee progress and performance</li>
          <li>Schedule and conduct mentoring sessions</li>
          <li>Collaborate with other faculty members</li>
        </ul>
      `,
      institution: '',
    };
    return descriptions[type] || '';
  }


  async sendInvite(
    to: string,
    link: string,
    type: InviteType = 'institution',
    data: Partial<InviteData> = {}
  ): Promise<void> {
    try {
      const inviteData: InviteData = {
        recipientName: data.recipientName,
        inviteLink: link,
        inviterName: data.inviterName,
        institutionName: data.institutionName,
        institutionCode: data.institutionCode,
        role: data.role,
      };

      const html = this.generateInviteTemplate(type, inviteData);

      const subjectMap = {
        institution: 'MENNTR Institution Invitation',
        hod: `Join ${data.institutionName || 'Your Institution'} on MENNTR as HOD`,
        principal: `Join ${data.institutionName || 'Your Institution'} on MENNTR as Principal`,
        faculty: `Join ${data.institutionName || 'Your Institution'} on MENNTR`,
      };

      // await this.inviteMailer.sendMail({
      //   from: config.email.inviteFromEmail, // invite@pathaxiom.com
      //   to,
      //   subject: subjectMap[type],
      //   html,
      // });
      const message = {
        senderAddress: config.email.inviteFromEmail, // invite@pathaxiom.com
        content: {
          subject: subjectMap[type],
          html,
        },
        recipients: {
          to: [{ address: to }],
        },
        replyTo: [{ address: config.email.inviteFromEmail }],
      };

      const poller = await this.acsClient.beginSend(message);
      await poller.pollUntilDone();
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


  async sendInstitutionInvite(to: string, link: string, name?: string): Promise<void> {
    return this.sendInvite(to, link, 'institution', { recipientName: name });
  }


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


  async sendPasswordReset(to: string, resetLink: string, name?: string): Promise<void> {
    const expiryMinutes = config.auth.resetTokenExpiryMinutes;

    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
      <h2>Password Reset Request</h2>

      <p>Hi ${name || 'there'},</p>

      <p>
        We received a request to reset your MENNTR account password.
      </p>

      <p style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}"
           style="
             background: #667eea;
             color: #ffffff;
             padding: 12px 28px;
             border-radius: 6px;
             text-decoration: none;
             font-weight: bold;
           ">
          Reset Password
        </a>
      </p>

      <p style="color: #d32f2f;">
        ⚠️ This link will expire in ${expiryMinutes} minutes.
      </p>

      <p>
        If you did not request this, please ignore this email.
      </p>

      <p style="margin-top: 30px;">
        — MENNTR Security Team
      </p>
    </div>
  `;

    try {
      await this.sendSystemEmail(to, 'Reset your MENNTR password', html);
    } catch (err) {
      throw new AppError('Failed to send password reset email', 500);
    }
  }

  async sendPasswordChangedNotification(to: string): Promise<void> {
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
      <h2>Password Updated Successfully</h2>

      <p>
        This is a confirmation that your MENNTR account password was changed.
      </p>

      <p>
        If you did not perform this action, please contact support immediately.
      </p>

      <p style="margin-top: 30px;">
        — MENNTR Security Team
      </p>
    </div>
  `;

    try {
      await this.sendSystemEmail(to, 'Your MENNTR password was changed', html);
    } catch (err) {
      throw new AppError('Failed to send password change notification', 500);
    }
  }
}

/**
 * USAGE EXAMPLES:
 *
 * // 1. Institution Setup
 * await emailService.sendInvite(
 *   'institution@example.com',
 *   'https://menntr.com/setup/abc123',
 *   'institution',
 *   { recipientName: 'Dr. Sharma' }
 * );
 *
 * // 2. HOD Invitation (after institution onboarded)
 * await emailService.sendInvite(
 *   'hod@institution.edu',
 *   'https://menntr.com/join/xyz789',
 *   'hod',
 *   {
 *     recipientName: 'Kumar',
 *     inviterName: 'Dr. Sharma',
 *     institutionName: 'IIT Bangalore'
 *   }
 * );
 *
 * // 3. Principal Invitation
 * await emailService.sendInvite(
 *   'principal@school.edu',
 *   'https://menntr.com/join/def456',
 *   'principal',
 *   {
 *     recipientName: 'Patel',
 *     institutionName: 'National Public School',
 *     inviterName: 'Admin Team'
 *   }
 * );
 *
 * // 4. Faculty Invitation
 * await emailService.sendInvite(
 *   'faculty@college.edu',
 *   'https://menntr.com/join/ghi789',
 *   'faculty',
 *   {
 *     recipientName: 'Singh',
 *     institutionName: 'St. Joseph\'s College',
 *     role: 'Assistant Professor'
 *   }
 * );
 */
