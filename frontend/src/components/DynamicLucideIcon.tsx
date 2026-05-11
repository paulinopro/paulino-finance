import React, { lazy, memo, Suspense } from 'react';
import { Tag } from 'lucide-react';
import { LUCIDE_DYNAMIC_IMPORTS } from '../lib/lucideDynamicRegistry';
import { getResolvedLucideIcon } from '../lib/lucideIconCache';

export type SvgIconProps = Omit<React.ComponentPropsWithoutRef<typeof Tag>, 'ref'>;

type Props = SvgIconProps & {
  kebab: string;
};

type LazyLucideIcon = React.LazyExoticComponent<React.ComponentType<SvgIconProps>>;

const lazyIconCache = new Map<string, LazyLucideIcon>();

function lazied(kebab: string): LazyLucideIcon | null {
  const importer = LUCIDE_DYNAMIC_IMPORTS[kebab];
  if (!importer) return null;
  let L = lazyIconCache.get(kebab);
  if (!L) {
    L = lazy(importer);
    lazyIconCache.set(kebab, L);
  }
  return L;
}

export const DynamicLucideIcon = memo(function DynamicLucideIcon({ kebab, ...props }: Props) {
  const Cached = getResolvedLucideIcon(kebab);
  if (Cached) {
    return <Cached {...props} aria-hidden />;
  }
  const L = lazied(kebab);
  if (!L) return <Tag {...props} aria-hidden />;
  return (
    <Suspense
      fallback={
        <span
          aria-hidden
          className={[props.className, 'inline-block rounded bg-current opacity-25'].filter(Boolean).join(' ')}
          style={{
            width: props.size ?? undefined,
            height: props.size ?? undefined,
          }}
        />
      }
    >
      <L {...props} aria-hidden />
    </Suspense>
  );
});
