import type { NavigateOptions } from "react-router-dom";
import * as React from "react";

import { HeroUIProvider } from "@heroui/system";
import { useHref, useNavigate } from "react-router-dom";
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from '@/components/theme-provider';

declare module "@react-types/shared" {
  interface RouterConfig {
    routerOptions: NavigateOptions;
  }
}

export interface ProvidersProps {
  children: React.ReactNode;
}

export function Provider({ children }: ProvidersProps) {
  const navigate = useNavigate();

  return (
    <HeroUIProvider navigate={navigate} useHref={useHref}>
      <ThemeProvider>
        {children}
        <Toaster 
          position="top-center"
          toastOptions={{
            duration: 3000,
            className: 'dark:bg-gray-800 dark:text-white',
            style: {
              background: 'var(--toaster-bg, #ffffff)',
              color: 'var(--toaster-color, #000000)',
              border: '1px solid var(--toaster-border, #e5e7eb)',
            },
            success: {
              style: {
                background: '#10b981',
                color: '#ffffff',
              },
            },
            error: {
              style: {
                background: '#ef4444',
                color: '#ffffff',
              },
            },
          }}
        />
      </ThemeProvider>
    </HeroUIProvider>
  );
}
