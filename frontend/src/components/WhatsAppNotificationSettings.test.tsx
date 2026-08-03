import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import api from '../services/api';
import toast from 'react-hot-toast';
import WhatsAppNotificationSettings from './WhatsAppNotificationSettings';

jest.mock('../services/api', () => {
  const { jest: factoryJest } = require('@jest/globals');
  return {
    __esModule: true,
    default: { get: factoryJest.fn(), put: factoryJest.fn(), post: factoryJest.fn() },
  };
});

jest.mock('react-hot-toast', () => {
  const { jest: factoryJest } = require('@jest/globals');
  return {
    __esModule: true,
    default: { success: factoryJest.fn(), error: factoryJest.fn() },
  };
});

jest.mock('react-i18next', () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});

const mockedApi = api as any;
const mockedToast = toast as any;

const unconfigured = {
  phone: null,
  consented: false,
  verified: false,
  consentedAt: null,
  verifiedAt: null,
};

const pending = {
  phone: '18095550123',
  consented: true,
  verified: false,
  consentedAt: '2026-08-03T00:00:00.000Z',
  verifiedAt: null,
};

const verified = {
  ...pending,
  verified: true,
  verifiedAt: '2026-08-03T00:01:00.000Z',
};

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('WhatsAppNotificationSettings', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.get.mockReset();
    mockedApi.put.mockReset();
    mockedApi.post.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockedApi.get.mockResolvedValue({ data: { whatsapp: unconfigured } } as any);
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });

  const renderComponent = async (onVerificationChange = jest.fn()) => {
    await act(async () => {
      root.render(<WhatsAppNotificationSettings onVerificationChange={onVerificationChange} />);
    });
    return onVerificationChange;
  };

  const input = () => container.querySelector<HTMLInputElement>('input[type="tel"]')!;
  const consent = () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  const button = (name: string) =>
    Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(name))!;

  const change = (element: HTMLInputElement, value: string | boolean) => {
    act(() => {
      if (typeof value === 'boolean') {
        if (element.checked !== value) element.click();
        return;
      }
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('loads the unconfigured state with an empty phone and unchecked consent', async () => {
    await renderComponent();

    expect(mockedApi.get).toHaveBeenCalledWith('/notifications/whatsapp');
    expect(input().value).toBe('');
    expect(consent().checked).toBe(false);
    expect(container.textContent).toContain('settings.whatsappStateUnconfigured');
  });

  it('saves the full phone with explicit consent', async () => {
    mockedApi.put.mockResolvedValue({ data: { whatsapp: pending } } as any);
    await renderComponent();

    change(input(), '18095550123');
    change(consent(), true);
    await act(async () => button('settings.whatsappSaveIdle').click());

    expect(mockedApi.put).toHaveBeenCalledWith('/notifications/whatsapp', {
      phone: '18095550123',
      consent: true,
    });
  });

  it('offers a test while pending and refreshes to verified after success', async () => {
    mockedApi.get
      .mockResolvedValueOnce({ data: { whatsapp: pending } } as any)
      .mockResolvedValueOnce({ data: { whatsapp: verified } } as any);
    mockedApi.post.mockResolvedValue({ data: { success: true } } as any);
    const onVerificationChange = await renderComponent();

    expect(container.textContent).toContain('settings.whatsappStatePending');
    await act(async () => button('settings.whatsappTestIdle').click());

    expect(mockedApi.post).toHaveBeenCalledWith('/notifications/test/whatsapp');
    expect(mockedApi.get).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('settings.whatsappStateVerified');
    expect(onVerificationChange).toHaveBeenLastCalledWith(true);
  });

  it('returns a verified destination to pending when its phone changes', async () => {
    mockedApi.get.mockResolvedValue({ data: { whatsapp: verified } } as any);
    mockedApi.put.mockResolvedValue({ data: { whatsapp: { ...pending, phone: '18095550999' } } } as any);
    await renderComponent();

    change(input(), '18095550999');
    await act(async () => button('settings.whatsappSaveIdle').click());

    expect(container.textContent).toContain('settings.whatsappStatePending');
  });

  it('withdraws consent only after confirmation', async () => {
    mockedApi.get.mockResolvedValue({ data: { whatsapp: verified } } as any);
    mockedApi.put.mockResolvedValue({ data: { whatsapp: unconfigured } } as any);
    await renderComponent();

    await act(async () => button('settings.whatsappWithdraw').click());

    expect(window.confirm).toHaveBeenCalledWith('settings.whatsappWithdrawConfirm');
    expect(mockedApi.put).toHaveBeenCalledWith('/notifications/whatsapp', {
      phone: null,
      consent: false,
    });
  });

  it('does not withdraw consent when confirmation is cancelled', async () => {
    mockedApi.get.mockResolvedValue({ data: { whatsapp: verified } } as any);
    (window.confirm as any).mockReturnValue(false);
    await renderComponent();

    await act(async () => button('settings.whatsappWithdraw').click());

    expect(mockedApi.put).not.toHaveBeenCalled();
  });

  it('disables refresh while the latest configuration request is pending', async () => {
    await renderComponent();
    let resolveRefresh: ((value: any) => void) | undefined;
    mockedApi.get.mockReturnValueOnce(new Promise((resolve) => { resolveRefresh = resolve; }));
    const refresh = container.querySelector<HTMLButtonElement>('button[aria-label="settings.whatsappRefresh"]')!;

    act(() => refresh.click());
    expect(refresh.disabled).toBe(true);

    await act(async () => {
      resolveRefresh?.({ data: { whatsapp: unconfigured } });
      await Promise.resolve();
    });
    expect(refresh.disabled).toBe(false);
  });
  it('ignores a delayed GET after a newer save response is applied', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { whatsapp: verified } } as any);
    const onConfigurationChange = jest.fn();
    await act(async () => {
      root.render(<WhatsAppNotificationSettings onConfigurationChange={onConfigurationChange} />);
    });
    let resolveRefresh: ((value: any) => void) | undefined;
    mockedApi.get.mockReturnValueOnce(new Promise((resolve) => { resolveRefresh = resolve; }));
    mockedApi.put.mockResolvedValueOnce({ data: { whatsapp: { ...pending, phone: '18095550999' } } } as any);
    change(input(), '18095550999');
    const refresh = container.querySelector<HTMLButtonElement>('button[aria-label="settings.whatsappRefresh"]')!;

    await act(async () => {
      refresh.click();
      button('settings.whatsappSaveIdle').click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('settings.whatsappStatePending');
    await act(async () => {
      resolveRefresh?.({ data: { whatsapp: verified } });
      await Promise.resolve();
    });

    expect(input().value).toBe('18095550999');
    expect(container.textContent).toContain('settings.whatsappStatePending');
    expect(onConfigurationChange).toHaveBeenLastCalledWith(expect.objectContaining({
      phone: '18095550999', verified: false,
    }));
  });

  it.each(['save', 'withdraw', 'test'])('disables incompatible actions while %s is pending', async (mutation) => {
    mockedApi.get.mockResolvedValueOnce({ data: { whatsapp: verified } } as any);
    await renderComponent();
    let resolveMutation: ((value: any) => void) | undefined;
    const pendingRequest = new Promise((resolve) => { resolveMutation = resolve; });
    if (mutation === 'test') mockedApi.post.mockReturnValueOnce(pendingRequest);
    else mockedApi.put.mockReturnValueOnce(pendingRequest);
    const refresh = container.querySelector<HTMLButtonElement>('button[aria-label="settings.whatsappRefresh"]')!;
    const saveButton = button('settings.whatsappSaveIdle');
    const testButton = button('settings.whatsappTestIdle');
    const withdrawButton = button('settings.whatsappWithdraw');
    const action = mutation === 'save'
      ? saveButton
      : mutation === 'withdraw'
        ? withdrawButton
        : testButton;

    act(() => action.click());

    expect(refresh.disabled).toBe(true);
    expect(input().disabled).toBe(true);
    expect(consent().disabled).toBe(true);
    expect(saveButton.disabled).toBe(true);
    expect(testButton.disabled).toBe(true);
    expect(withdrawButton.disabled).toBe(true);

    await act(async () => {
      resolveMutation?.(mutation === 'test'
        ? { data: { success: true } }
        : { data: { whatsapp: mutation === 'withdraw' ? unconfigured : verified } });
      await Promise.resolve();
    });
  });
  it('shows translated actionable errors for load, save and test failures', async () => {
    mockedApi.get.mockRejectedValueOnce(new Error('load'));
    await renderComponent();
    expect(mockedToast.error).toHaveBeenCalledWith('settings.whatsappLoadError');

    mockedApi.put.mockRejectedValueOnce(new Error('save'));
    change(input(), '18095550123');
    change(consent(), true);
    await act(async () => button('settings.whatsappSaveIdle').click());
    expect(mockedToast.error).toHaveBeenCalledWith('settings.whatsappSaveError');

    mockedApi.get.mockResolvedValue({ data: { whatsapp: pending } } as any);
    await act(async () => root.render(<WhatsAppNotificationSettings key="pending" onVerificationChange={jest.fn()} />));
    mockedApi.post.mockRejectedValueOnce(new Error('test'));
    await act(async () => button('settings.whatsappTestIdle').click());
    expect(mockedToast.error).toHaveBeenCalledWith('settings.whatsappTestError');
  });
});

