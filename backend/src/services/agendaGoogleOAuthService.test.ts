export {};

const mockQuery = jest.fn();
const mockDecryptAgendaSecret = jest.fn();
const mockSetCredentials = jest.fn();

jest.mock('../config/database', () => ({ query: mockQuery }));
jest.mock('./agendaTokenVault', () => ({
  decryptAgendaSecret: mockDecryptAgendaSecret,
  encryptAgendaSecret: jest.fn(),
}));
jest.mock('../utils/jwt', () => ({ signGoogleAgendaOAuthState: jest.fn() }));
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn(() => ({ setCredentials: mockSetCredentials })),
    },
  },
}));

const { loadGoogleOAuthForUser } = require('./agendaGoogleOAuthService');

describe('Google Agenda OAuth loader state', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when Google Calendar has never been configured', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await expect(loadGoogleOAuthForUser(7)).resolves.toBeNull();
  });

  it('rejects a configured connection that has no refresh token', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: 31, oauth_refresh_token: null, external_default_calendar_id: null, status: 'ERROR' }],
    });

    await expect(loadGoogleOAuthForUser(7)).rejects.toThrow(/refresh token/i);
  });

  it('rejects a configured connection whose refresh token cannot be decrypted', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: 31, oauth_refresh_token: 'encrypted', external_default_calendar_id: null, status: 'CONNECTED' }],
    });
    mockDecryptAgendaSecret.mockReturnValue(null);

    await expect(loadGoogleOAuthForUser(7)).rejects.toThrow(/decrypt/i);
  });
});
