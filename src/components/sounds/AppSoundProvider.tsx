'use client';

import { useEffect, type ReactNode } from 'react';
import { preloadAppSounds } from './index';

export default function AppSoundProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    preloadAppSounds();
  }, []);

  return <>{children}</>;
}
