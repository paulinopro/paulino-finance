import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnline } from '../hooks/useOnline';
import { useTranslation } from 'react-i18next';

const OfflineBanner: React.FC = () => {
  const { t } = useTranslation();
  const online = useOnline();
  if (online) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-900/35 border-b border-amber-700/40 px-3 py-2.5 text-sm text-amber-100 text-center">
      <WifiOff className="shrink-0 w-4 h-4" aria-hidden />
      <span>{t('common.offlineBanner.message')}</span>
    </div>
  );
};

export default OfflineBanner;
