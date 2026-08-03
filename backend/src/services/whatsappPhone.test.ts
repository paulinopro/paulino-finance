import {
  maskWhatsAppPhone,
  normalizeWhatsAppPhone,
  toOpenWaChatId,
} from './whatsappPhone';

describe('WhatsApp phone domain', () => {
  it.each([
    ['+1 809-555-1234', '18095551234'],
    ['34 612 345 678', '34612345678'],
    ['18095551234', '18095551234'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeWhatsAppPhone(input)).toBe(expected);
  });

  it.each(['', '0123456789', '1234567', '1234567890123456', '1ABC5551234'])('rejects %s', (input) => {
    expect(() => normalizeWhatsAppPhone(input)).toThrow('Invalid WhatsApp phone number');
  });

  expect(maskWhatsAppPhone('18095551234')).toBe('*******1234');
  expect(toOpenWaChatId('18095551234')).toBe('18095551234@c.us');
});
