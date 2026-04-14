import React from 'react';

const iconSrc = `${process.env.PUBLIC_URL || ''}/apple-touch-icon.png`;

/**
 * Icono de marca (apple-touch-icon) encima del título en pantallas de auth.
 * Tamaño de muestra 80px (sm: 88px); el recurso es 180×180 según convención Apple.
 */
const AuthBrandMark: React.FC = () => (
  <img
    src={iconSrc}
    alt="Paulino Finance"
    width={180}
    height={180}
    className="mx-auto mb-4 h-20 w-20 sm:h-[5.5rem] sm:w-[5.5rem] rounded-2xl object-cover shadow-lg bg-dark-800"
    decoding="async"
  />
);

export default AuthBrandMark;
