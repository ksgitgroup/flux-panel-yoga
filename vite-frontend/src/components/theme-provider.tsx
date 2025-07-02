import React, { useEffect } from 'react';
import { useTheme } from '@heroui/use-theme';

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    // 确保主题与HTML class同步
    const updateThemeClass = (currentTheme: string) => {
      if (currentTheme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.style.colorScheme = 'dark';
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.style.colorScheme = 'light';
      }
      // 保存到localStorage
      localStorage.setItem('heroui-theme', currentTheme);
    };

    // 初始化时检查localStorage
    const savedTheme = localStorage.getItem('heroui-theme');
    if (savedTheme && savedTheme !== theme) {
      setTheme(savedTheme);
    }

    // 监听主题变化
    updateThemeClass(theme);
  }, [theme, setTheme]);

  return <>{children}</>;
}; 