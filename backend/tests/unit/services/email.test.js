const config = require('../../../src/config/index');

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

jest.mock('../../../src/config/index', () => ({
  smtp: {
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    from: 'no-reply@gap-app.local',
  },
  appUrl: 'http://localhost:3000',
}));

const nodemailer = require('nodemailer');

describe('Email Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    // Reset smtp host to empty (no SMTP configured) by default
    config.smtp.host = '';
  });

  describe('sendEmail', () => {
    it('logs to console when SMTP host is not configured', async () => {
      config.smtp.host = '';
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Re-require after reset to get fresh module state
      jest.resetModules();
      jest.mock('../../../src/config/index', () => ({
        smtp: { host: '', port: 587, secure: false, user: '', pass: '', from: 'no-reply@gap-app.local' },
        appUrl: 'http://localhost:3000',
      }));
      jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

      const { sendEmail } = require('../../../src/services/email');
      await sendEmail('to@test.com', 'Subject', '<p>Body</p>');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('To: to@test.com'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Subject: Subject'));
      consoleSpy.mockRestore();
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
          subject: 'Set your password — G.A.P. Portal',
          html: expect.stringContaining('http://localhost:3000/set-password?token=mytoken123'),
        })
      );
      expect(mockSendMail.mock.calls[0][0].html).toContain('Hello Alice');
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
          subject: 'Reset your password — G.A.P. Portal',
          html: expect.stringContaining('http://app.example.com/set-password?token=resettoken789'),
        })
      );
    });
  });
});
