import React from 'react';

type PageHeaderProps = {
  title: string;
  subtitle?: string | React.ReactNode;
  /** Contenido a la derecha del título en desktop (ej. botón); en móvil queda debajo del subtítulo */
  actions?: React.ReactNode;
  className?: string;
};

/**
 * Encabezado de página unificado (móvil + desktop): título, subtítulo opcional y acciones.
 * Usar en todos los módulos para consistencia visual.
 */
const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions, className = '' }) => {
  return (
    <div
      className={`flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4 min-w-0 ${className}`}
    >
      <div className="min-w-[min(100%,12rem)] flex-1 space-y-1 text-center lg:text-left">
        <h1 className="page-title break-words lg:text-balance">{title}</h1>
        {subtitle ? (
          typeof subtitle === 'string' ? (
            <p className="text-dark-400 text-sm sm:text-base leading-snug max-w-prose mx-auto lg:mx-0">
              {subtitle}
            </p>
          ) : (
            <div className="max-w-prose mx-auto lg:mx-0 space-y-1.5 text-center lg:text-left">{subtitle}</div>
          )
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-col gap-2 shrink-0 w-full lg:w-auto lg:items-end lg:pt-0.5">{actions}</div>
      ) : null}
    </div>
  );
};

export default PageHeader;
