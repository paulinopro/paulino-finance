import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnline } from '../hooks/useOnline';

const OfflineBanner: React.FC = () => {
  const online = useOnline();
  if (online) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-900/35 border-b border-amber-700/40 px-3 py-2.5 text-sm text-amber-100 text-center">
      <WifiOff className="shrink-0 w-4 h-4" aria-hidden />
      <span>Sin conexión. Los datos pueden no cargarse hasta que vuelvas a estar en línea.</span>
    </div>
  );
};

export default OfflineBanner;
