import React, { useState } from 'react';
import { Power, PowerOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../services/api';

type Props = {
  resourcePath: string;
  entityId: number;
  isActive: boolean;
  entityLabel: string;
  onChanged: () => void | Promise<void>;
};

const EntityActiveToggle: React.FC<Props> = ({ resourcePath, entityId, isActive, entityLabel, onChanged }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const actionLabel = t(isActive ? 'common.activation.disableEntity' : 'common.activation.enableEntity', {
    entity: entityLabel,
  });

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.patch(`/${resourcePath}/${entityId}/active-status`, { isActive: !isActive });
      toast.success(t(isActive ? 'common.activation.disabled' : 'common.activation.enabled'));
      await onChanged();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('common.activation.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={[
          'rounded-full px-2 py-1 text-[0.65rem] font-semibold',
          isActive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-dark-700 text-dark-300',
        ].join(' ')}
      >
        {t(isActive ? 'common.activation.active' : 'common.activation.inactive')}
      </span>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-dark-300 transition-colors hover:bg-dark-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/60 disabled:cursor-wait disabled:opacity-50"
        title={actionLabel}
        aria-label={actionLabel}
        aria-pressed={isActive}
      >
        {isActive ? <PowerOff className="h-[18px] w-[18px]" aria-hidden /> : <Power className="h-[18px] w-[18px]" aria-hidden />}
      </button>
    </span>
  );
};

export default EntityActiveToggle;
