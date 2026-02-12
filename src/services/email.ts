import { config } from '../config';
import { AppError } from '../utils/errors';
import type { Transporter } from 'nodemailer';
import type { EmailClient } from '@azure/communication-email';

// Email template types
type InviteType = 'institution' | 'hod' | 'principal' | 'faculty' | 'student';

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
    private acsClient: EmailClient // EXISTING (DoNotReply)
    // private inviteMailer: Transporter // SMTP (invite@)
  ) {}

  private generateInviteTemplate(type: InviteType, data: InviteData): string {
    const { recipientName, inviteLink, institutionName, institutionCode } = data;
    const expiryMinutes = config.auth.otpExpiryMinutes;

    // Role display mapping
    const roleMap = {
      institution: 'Institution Administrator',
      hod: 'HOD',
      principal: 'Principal',
      faculty: 'Faculty',
      student: 'Student',
    };

    const roleDisplay = roleMap[type] || 'User';

    // Embedded Menntr logo as base64
    const menntrLogoBase64 =
      'data:image/png;base64,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 j8Kay0/Luvd JadE85UeyU5Mn0 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';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <!--[if mso]>
        <style type="text/css">
          body, table, td {font-family: Arial, sans-serif !important;}
        </style>
        <![endif]-->
      </head>
      <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;">
        
        <!-- Email Wrapper -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f5f5; padding: 40px 20px;">
          <tr>
            <td align="center">
              
              <!-- Email Container -->
              <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); max-width: 100%;">
                
<!-- Logo Section -->
<tr>
  <td style="padding: 40px 40px 0;">
    
    <!-- Logo -->
    <img 
      src="https://menntrprofilephotos.blob.core.windows.net/menntr/menntr-logo.png"
      alt="Menntr"
      height="38"
      style="display:block; height:38px; width:auto; border:0;"
    />

  </td>
</tr>

<!-- Divider Line (NOT full width) -->
<tr>
  <td style="padding: 20px 40px 0;">
    <div style="height:1px; background-color:#e5e7eb; width:100%;"></div>
  </td>
</tr>



                
                <!-- Main Content -->
                <tr>
                  <td style="padding: 40px 40px 48px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      
                      <!-- Title -->
                      <tr>
                        <td align="center" style="font-size: 24px; font-weight: 600; color: #1a1a1a; padding-bottom: 8px; letter-spacing: -0.3px;">
                          Welcome to Menntr
                        </td>
                      </tr>
                      
                      <!-- Subtitle -->
                      <tr>
                        <td align="center" style="font-size: 15px; color: #737373; padding-bottom: 32px; font-weight: 400;">
                          Setup Your Institution Account
                        </td>
                      </tr>
                      
                      <!-- Greeting Text -->
                      <tr>
                        <td style="font-size: 15px; color: #404040; line-height: 1.6; padding-bottom: 32px; text-align: left;">
                          Hello ${recipientName || 'Administrator'}, You have been invited to join MENNTR as an 
                          ${roleDisplay} for <strong style="font-weight: 600; color: #1a1a1a;">${institutionName || 'Global Tech University'}</strong>. 
                          To complete your secure setup, please use the institution code below during registration.
                        </td>
                      </tr>
                      
                      <!-- Institution Code Box -->
                      <tr>
                        <td style="padding: 28px 24px; background: linear-gradient(135deg, #f0f4ff 0%, #f8f9ff 100%); border: 1px solid #e3e8ff; border-radius: 12px; text-align: center;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="font-size: 11px; color: #666666; text-transform: uppercase; letter-spacing: 1px; padding-bottom: 12px; font-weight: 600;">
                                Institution Access Code
                              </td>
                            </tr>
                            <tr>
                              <td align="center" style="font-size: 28px; font-weight: 700; color: #4c6ef5; letter-spacing: 3px; font-family: 'Courier New', 'Consolas', monospace;">
                                ${institutionCode || 'MNTR-XXXX'}
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      
                      <!-- CTA Button -->
                      <tr>
                        <td align="center" style="padding: 32px 0;">
                          <!--[if mso]>
                          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${inviteLink}" style="height:42px;v-text-anchor:middle;width:250px;" arcsize="19%" strokecolor="#8b5cf6" fillcolor="#8b5cf6">
                            <w:anchorlock/>
                            <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:600;">Complete Institution Setup</center>
                          </v:roundrect>
                          <![endif]-->
                          <!--[if !mso]><!-->
                          <a href="${inviteLink}" 
                             style="display: inline-block; background-color: #8b5cf6; background-image: linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%); color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.25); mso-hide: all;">
                            Complete Institution Setup
                          </a>
                          <!--<![endif]-->
                        </td>
                      </tr>
                      
                      <!-- Expiry Notice -->
                      <tr>
                        <td align="center" style="padding-bottom: 32px;">
                          <span style="color: #dc2626; font-size: 13px; font-weight: 500;">
                            This link will expire in <strong style="font-weight: 700;">${expiryMinutes} mins</strong>
                          </span>
                        </td>
                      </tr>
                      
                      <!-- Security Note -->
                      <tr>
                        <td style="font-size: 13px; color: #737373; line-height: 1.6; text-align: center; padding-top: 24px; border-top: 1px solid #f0f0f0;">
                          Security Note: If you did not request this invitation, please contact your 
                          organization's IT department or ignore this email.
                        </td>
                      </tr>
                      
                    </table>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #fafafa; padding: 32px 40px; text-align: center; border-top: 1px solid #f0f0f0;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="font-size: 13px; font-weight: 600; color: #1a1a1a; padding-bottom: 12px;">
                          MENNTR • Smarter Campus Management for Everyone
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="font-size: 12px; color: #737373; line-height: 1.6;">
                          PathAxiom Pvt. Ltd. No. 332, Siddaiah Puranik Road 3rd Stage, 4th Block, Shakthi<br>
                          Ganapathi Nagar, Basaveshwar Nagar, Bengaluru, Karnataka – 560079
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
              </table>
              
            </td>
          </tr>
        </table>
        
      </body>
      </html>
    `;
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
        student: `Join ${data.institutionName || 'Your Institution'} on MENNTR`,
      };

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
      console.error('EMAIL INVITE ERROR:', {
        message: err?.message,
        code: err?.code,
        response: err?.response,
        responseCode: err?.responseCode,
        command: err?.command,
      });

      throw new AppError(`Failed to send invite email: ${err?.message || 'Email error'}`, 500);
    }
  }

  async sendInstitutionInvite(
    to: string,
    link: string,
    institutionCode: string,
    institutionName?: string,
    recipientName?: string
  ): Promise<void> {
    return this.sendInvite(to, link, 'institution', {
      recipientName,
      institutionName,
      institutionCode,
    });
  }

  async sendHODInvite(
    to: string,
    link: string,
    institutionCode: string,
    institutionName?: string,
    recipientName?: string
  ): Promise<void> {
    return this.sendInvite(to, link, 'hod', {
      recipientName,
      institutionName,
      institutionCode,
    });
  }

  async sendPrincipalInvite(
    to: string,
    link: string,
    institutionCode: string,
    institutionName?: string,
    recipientName?: string
  ): Promise<void> {
    return this.sendInvite(to, link, 'principal', {
      recipientName,
      institutionName,
      institutionCode,
    });
  }

  async sendFacultyInvite(
    to: string,
    link: string,
    institutionCode: string,
    institutionName?: string,
    recipientName?: string
  ): Promise<void> {
    return this.sendInvite(to, link, 'faculty', {
      recipientName,
      institutionName,
      institutionCode,
    });
  }

  async sendStudentInvite(
    to: string,
    link: string,
    institutionCode: string,
    institutionName?: string,
    recipientName?: string
  ): Promise<void> {
    return this.sendInvite(to, link, 'student', {
      recipientName,
      institutionName,
      institutionCode,
    });
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
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">

    <!--[if mso]>
    <style>
      body, table, td { font-family: Arial, sans-serif !important; }
    </style>
    <![endif]-->

  </head>

  <body style="margin:0; padding:0; background-color:#f5f5f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Roboto','Oxygen','Ubuntu','Cantarell',sans-serif;">

    <!-- Wrapper -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:32px 16px; background:#f5f5f5;">
      <tr>
        <td align="center">

          <!-- Container -->
          <table width="600" cellpadding="0" cellspacing="0" border="0"
            style="background:#ffffff; border-radius:12px; overflow:hidden; max-width:100%; box-shadow:0 2px 8px rgba(0,0,0,0.08);">

            <!-- Logo -->
            <tr>
              <td style="padding:32px 24px 0;">
                <img 
                  src="https://menntrprofilephotos.blob.core.windows.net/menntr/menntr-logo.png"
                  alt="Menntr"
                  height="38"
                  style="display:block; height:38px; width:auto; border:0;"
                />
              </td>
            </tr>

            <!-- Divider -->
            <tr>
              <td style="padding:20px 24px 0;">
                <div style="height:1px; background:#e5e7eb;"></div>
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding:32px 24px 40px;">

                <!-- Title -->
                <div style="text-align:center; font-size:22px; font-weight:600; color:#1a1a1a; margin-bottom:24px;">
                  Reset Your Password
                </div>

                <!-- Greeting -->
                <div style="font-size:15px; color:#404040; margin-bottom:16px;">
                  Hi ${name || 'there'},
                </div>

                <!-- Body -->
                <div style="font-size:15px; color:#404040; line-height:1.6; margin-bottom:28px;">
                  We received a request to reset your MENNTR account password.
                  To maintain account security, please create a new password immediately.
                </div>

                <!-- Button -->
                <div style="text-align:center; margin-bottom:28px;">

                  <!--[if mso]>
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                    href="${resetLink}"
                    style="height:42px;v-text-anchor:middle;width:220px;"
                    arcsize="19%" strokecolor="#8b5cf6" fillcolor="#8b5cf6">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:600;">
                      Reset Password
                    </center>
                  </v:roundrect>
                  <![endif]-->

                  <!--[if !mso]><!-->
                  <a href="${resetLink}"
                    style="display:inline-block; background:#8b5cf6;
                           background-image:linear-gradient(135deg,#8b5cf6 0%,#a855f7 100%);
                           color:#ffffff !important; text-decoration:none;
                           padding:14px 28px; border-radius:8px;
                           font-size:15px; font-weight:600;">
                    Reset Password
                  </a>
                  <!--<![endif]-->

                </div>

                <!-- Expiry Box -->
                <div style="background:#fff7ed; border:1px solid #facc15;
                            padding:14px 16px; border-radius:6px;
                            font-size:13px; color:#b45309;
                            text-align:center; margin-bottom:28px;">
                  ⚠️ This link will expire in ${expiryMinutes} minutes.
                </div>

                <!-- Security Note -->
                <div style="font-size:13px; color:#737373; line-height:1.6; margin-bottom:24px;">
                  Security Note: If you did not request a password reset,
                  please ignore this email. Your account remains secure and no changes have been made.
                </div>

                <!-- Divider -->
                <div style="height:1px; background:#e5e7eb; margin:20px 0;"></div>

                <!-- Backup Link -->
                <div style="font-size:13px; color:#737373; margin-bottom:8px;">
                  If the button does not work, copy and paste the link below into your browser:
                </div>

                <div style="font-size:12px; word-break:break-all;">
                  <a href="${resetLink}" style="color:#4c6ef5; text-decoration:underline;">
                    ${resetLink}
                  </a>
                </div>

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#fafafa; padding:24px; text-align:center; border-top:1px solid #f0f0f0;">

                <div style="font-size:13px; font-weight:600; color:#1a1a1a; margin-bottom:10px;">
                  MENNTR • Smarter Campus Management for Everyone
                </div>

                <div style="font-size:12px; color:#737373; line-height:1.6;">
                  PathAxiom Pvt. Ltd. No. 332, Siddaiah Puranik Road 3rd Stage,
                  4th Block, Shakthi Ganapathi Nagar, Basaveshwar Nagar,
                  Bengaluru, Karnataka – 560079
                </div>

              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>

  </body>
  </html>
  `;

    try {
      await this.sendSystemEmail(to, 'Reset Your MENNTR Password', html);
    } catch (err) {
      throw new AppError('Failed to send password reset email', 500);
    }
  }

  async sendPasswordChangedNotification(to: string, name?: string): Promise<void> {
    const supportLink = 'https://app.menntr.com/support'; // change if needed

    const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">

    <!--[if mso]>
    <style>
      body, table, td { font-family: Arial, sans-serif !important; }
    </style>
    <![endif]-->

  </head>

  <body style="margin:0; padding:0; background-color:#f5f5f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Roboto','Oxygen','Ubuntu','Cantarell',sans-serif;">

    <!-- Wrapper -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:32px 16px; background:#f5f5f5;">
      <tr>
        <td align="center">

          <!-- Container -->
          <table width="600" cellpadding="0" cellspacing="0" border="0"
            style="background:#ffffff; border-radius:12px; overflow:hidden; max-width:100%; box-shadow:0 2px 8px rgba(0,0,0,0.08);">

            <!-- Logo -->
            <tr>
              <td style="padding:32px 24px 0;">
                <img 
                  src="https://menntrprofilephotos.blob.core.windows.net/menntr/menntr-logo.png"
                  alt="Menntr"
                  height="38"
                  style="display:block; height:38px; width:auto; border:0;"
                />
              </td>
            </tr>

            <!-- Divider -->
            <tr>
              <td style="padding:20px 24px 0;">
                <div style="height:1px; background:#e5e7eb;"></div>
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding:32px 24px 40px;">

                <!-- Success Icon -->
                <div style="text-align:center; margin-bottom:20px;">
                  <div style="width:60px; height:60px; background:#dcfce7;
                              border-radius:50%; margin:0 auto;
                              line-height:60px; font-size:28px; color:#16a34a;">
                    ✓
                  </div>
                </div>

                <!-- Title -->
                <div style="text-align:center; font-size:22px; font-weight:600; color:#1a1a1a; margin-bottom:24px;">
                  Password Updated Successfully
                </div>

                <!-- Greeting -->
                <div style="font-size:15px; color:#404040; margin-bottom:16px;">
                  Hi ${name || 'there'},
                </div>

                <!-- Body -->
                <div style="font-size:15px; color:#404040; line-height:1.6; margin-bottom:28px;">
                  This is a confirmation that your MENNTR account password was successfully changed.
                </div>

                <!-- Security Alert Box -->
                <div style="background:#fef2f2; border:1px solid #ef4444;
                            padding:16px; border-radius:10px;
                            font-size:14px; color:#b91c1c;
                            text-align:center; margin-bottom:28px;">
                  ⚠️ <strong>Security Alert:</strong> If you did not perform this action,
                  please contact support immediately to secure your account.
                </div>

                <!-- Divider -->
                <div style="height:1px; background:#e5e7eb; margin:20px 0;"></div>

                <!-- Contact Support Button -->
                <div style="text-align:center; margin-top:20px;">

                  <!--[if mso]>
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                    href="${supportLink}"
                    style="height:42px;v-text-anchor:middle;width:180px;"
                    arcsize="20%" strokecolor="#4b5563" fillcolor="#ffffff">
                    <w:anchorlock/>
                    <center style="color:#374151;font-family:sans-serif;font-size:14px;font-weight:600;">
                      Contact Support
                    </center>
                  </v:roundrect>
                  <![endif]-->

                  <!--[if !mso]><!-->
                  <a href="${supportLink}"
                     style="display:inline-block;
                            padding:12px 24px;
                            border-radius:20px;
                            border:1px solid #6b7280;
                            color:#374151;
                            text-decoration:none;
                            font-size:14px;
                            font-weight:600;
                            background:#ffffff;">
                    Contact Support
                  </a>
                  <!--<![endif]-->

                </div>

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#fafafa; padding:24px; text-align:center; border-top:1px solid #f0f0f0;">

                <div style="font-size:13px; font-weight:600; color:#1a1a1a; margin-bottom:10px;">
                  MENNTR • Smarter Campus Management for Everyone
                </div>

                <div style="font-size:12px; color:#737373; line-height:1.6;">
                  PathAxiom Pvt. Ltd. No. 332, Siddaiah Puranik Road 3rd Stage,
                  4th Block, Shakthi Ganapathi Nagar, Basaveshwar Nagar,
                  Bengaluru, Karnataka – 560079
                </div>

              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>

  </body>
  </html>
  `;

    try {
      await this.sendSystemEmail(to, 'Your MENNTR Password Was Updated', html);
    } catch (err) {
      throw new AppError('Failed to send password change notification', 500);
    }
  }
}
