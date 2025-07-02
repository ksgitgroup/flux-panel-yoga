/**
 * 安全退出登录函数
 * 清除登录相关数据，但保留用户偏好设置（如主题）
 */
export const safeLogout = () => {
  // 需要保留的用户偏好设置
  const preservedSettings = {
    theme: localStorage.getItem('heroui-theme'),
    // 可以在这里添加其他需要保留的设置
  };

  // 清除所有localStorage数据
  localStorage.clear();

  // 恢复保留的设置
  Object.entries(preservedSettings).forEach(([key, value]) => {
    if (value) {
      if (key === 'theme') {
        localStorage.setItem('heroui-theme', value);
      }
      // 可以在这里添加其他设置的恢复逻辑
    }
  });
}; 