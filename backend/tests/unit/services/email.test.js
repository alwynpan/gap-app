jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), trace: jest.fn(), fatal: jest.fn() },
  maskEmail: (e) => {
    if (!e || typeof e !== 'string') {
      return e;
    }
    const atIdx = e.indexOf('@');
    if (atIdx < 0) {
      return '***@***';
    }
    const local = e.slice(0, atIdx);
    const domain = e.slice(atIdx + 1);
    if (local.length <= 2) {
      return `${local}@${domain}`;
    }
    return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
  },
  maskName: (n) => n,
  maskToken: (t) => t,
  maskStudentId: (s) => s,
  redactMeta: (m) => m,
}));

describe('Email Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('sendEmail', () => {
    it('logs to console when SMTP host is not configured', async () => {
      jest.mock('../../../src/config/index', () => ({
        smtp: { host: '', port: 587, secure: false, user: '', pass: '', from: 'no-reply@gap-app.local' },
        appUrl: 'http://localhost:3000',
      }));
      jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

      const { sendEmail } = require('../../../src/services/email');
      const { logger: mockLogger } = require('../../../src/utils/logger');
      const delivered = await sendEmail('to@test.com', 'Subject', '<p>Body</p>');

      // Reported as NOT delivered, so callers cannot count it as sent.
      expect(delivered).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('To: to@test.com'));
      // The body carries a one-time token, so it is never logged unless opted in.
      expect(mockLogger.warn).not.toHaveBeenCalledWith(expect.stringContaining('<p>Body</p>'));
    });

    it('warns and does not send when SMTP host is missing in production', async () => {
      const savedNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        jest.resetModules();
        jest.mock('../../../src/config/index', () => ({
          smtp: { host: '', port: 587, secure: false, user: '', pass: '', from: 'no-reply@gap-app.local' },
          appUrl: 'http://localhost:3000',
        }));
        jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

        const { sendEmail } = require('../../../src/services/email');
        const nodemailer = require('nodemailer');
        const { logger: mockLogger } = require('../../../src/utils/logger');
        await sendEmail('to@test.com', 'Subject', '<p>Body</p>');

        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('SMTP not configured; email NOT sent'));
        expect(mockLogger.info).not.toHaveBeenCalled();
        expect(nodemailer.createTransport).not.toHaveBeenCalled();
      } finally {
        if (savedNodeEnv === undefined) {
          delete process.env.NODE_ENV;
        } else {
          process.env.NODE_ENV = savedNodeEnv;
        }
      }
    });

    it('sends email via transporter when SMTP is configured', async () => {
      const mockSendMail = jest.fn().mockResolvedValue({});
      jest.resetModules();
      jest.mock('../../../src/config/index', () => ({
        smtp: { host: 'smtp.test.com', port: 587, secure: false, user: 'user', pass: 'pass', from: 'from@test.com' },
        appUrl: 'http://localhost:3000',
      }));
      jest.mock('nodemailer', () => ({
        createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
      }));

      const { sendEmail } = require('../../../src/services/email');
      await sendEmail('to@test.com', 'Test Subject', '<p>Hello</p>');

      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'from@test.com',
        to: 'to@test.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
      });
    });
  });

  describe('sendPasswordSetupEmail', () => {
    it('sends setup email with token URL using first_name', async () => {
      const mockSendMail = jest.fn().mockResolvedValue({});
      jest.resetModules();
      jest.mock('../../../src/config/index', () => ({
        smtp: { host: 'smtp.test.com', port: 587, secure: false, user: '', pass: '', from: 'no-reply@gap.local' },
        appUrl: 'http://localhost:3000',
      }));
      jest.mock('nodemailer', () => ({
        createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
      }));

      const { sendPasswordSetupEmail } = require('../../../src/services/email');
      const user = { email: 'user@test.com', username: 'testuser', first_name: 'Alice' };
      await sendPasswordSetupEmail(user, 'mytoken123');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: 'Set your password — Group Assignment Portal',
          html: expect.stringContaining('http://localhost:3000/set-password?token=mytoken123'),
        })
      );
      expect(mockSendMail.mock.calls[0][0].html).toContain('Hello Alice');
      expect(mockSendMail.mock.calls[0][0].html).toContain('testuser');
    });

    it('escapes HTML in name, username and token to prevent injection', async () => {
      const mockSendMail = jest.fn().mockResolvedValue({});
      jest.resetModules();
      jest.mock('../../../src/config/index', () => ({
        smtp: { host: 'smtp.test.com', port: 587, secure: false, user: '', pass: '', from: 'no-reply@gap.local' },
        appUrl: 'http://localhost:3000',
      }));
      jest.mock('nodemailer', () => ({
        createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
      }));

      const { sendPasswordSetupEmail } = require('../../../src/services/email');
      const user = {
        email: 'user@test.com',
        username: 'a<b>c',
        first_name: '<script>alert(1)</script>',
      };
      await sendPasswordSetupEmail(user, 'tok"<img>');

      const { html } = mockSendMail.mock.calls[0][0];
      // Escaped forms present
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('a&lt;b&gt;c');
      // Token escaped in the URL
      expect(html).toContain('token=tok&quot;&lt;img&gt;');
      // Raw markup absent
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('a<b>c');
    });

    it('falls back to username when first_name is absent', async () => {
      const mockSendMail = jest.fn().mockResolvedValue({});
      jest.resetModules();
      jest.mock('../../../src/config/index', () => ({
        smtp: { host: 'smtp.test.com', port: 587, secure: false, user: '', pass: '', from: 'no-reply@gap.local' },
        appUrl: 'http://localhost:3000',
      }));
      jest.mock('nodemailer', () => ({
        createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
      }));

      const { sendPasswordSetupEmail } = require('../../../src/services/email');
      const user = { email: 'user@test.com', username: 'bobsmith', first_name: null };
      await sendPasswordSetupEmail(user, 'tok456');

      expect(mockSendMail.mock.calls[0][0].html).toContain('Hello bobsmith');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('sends reset email with token URL', async () => {
      const mockSendMail = jest.fn().mockResolvedValue({});
      jest.resetModules();
      jest.mock('../../../src/config/index', () => ({
        smtp: { host: 'smtp.test.com', port: 587, secure: false, user: '', pass: '', from: 'no-reply@gap.local' },
        appUrl: 'http://app.example.com',
      }));
      jest.mock('nodemailer', () => ({
        createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
      }));

      const { sendPasswordResetEmail } = require('../../../src/services/email');
      const user = { email: 'user@test.com', username: 'carol', first_name: 'Carol' };
      await sendPasswordResetEmail(user, 'resettoken789');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: 'Reset your password — Group Assignment Portal',
          html: expect.stringContaining('http://app.example.com/set-password?token=resettoken789'),
        })
      );
    });

    it('escapes HTML in name and token to prevent injection', async () => {
      const mockSendMail = jest.fn().mockResolvedValue({});
      jest.resetModules();
      jest.mock('../../../src/config/index', () => ({
        smtp: { host: 'smtp.test.com', port: 587, secure: false, user: '', pass: '', from: 'no-reply@gap.local' },
        appUrl: 'http://app.example.com',
      }));
      jest.mock('nodemailer', () => ({
        createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
      }));

      const { sendPasswordResetEmail } = require('../../../src/services/email');
      const user = {
        email: 'user@test.com',
        username: 'dave',
        first_name: '<b>Dave</b>',
      };
      await sendPasswordResetEmail(user, 'reset"<x>');

      const { html } = mockSendMail.mock.calls[0][0];
      expect(html).toContain('&lt;b&gt;Dave&lt;/b&gt;');
      expect(html).toContain('token=reset&quot;&lt;x&gt;');
      expect(html).not.toContain('<b>Dave</b>');
    });
  });
});
