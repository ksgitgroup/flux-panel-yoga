/**
 * 剪贴板工具类
 * 兼容现代浏览器和旧版浏览器的复制功能
 */

/**
 * 检测是否为Safari浏览器
 * @returns {boolean}
 */
const isSafari = () => {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
};

/**
 * Safari专用的复制方法
 * @param {string} text - 要复制的文本
 * @returns {Promise<boolean>}
 */
const safariCopy = (text) => {
  return new Promise((resolve, reject) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // Safari需要元素可见且可聚焦
    textArea.style.position = 'absolute';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    textArea.style.fontSize = '12pt';
    textArea.style.border = '0';
    textArea.style.padding = '0';
    textArea.style.margin = '0';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    
    document.body.appendChild(textArea);
    
    // Safari需要先聚焦
    textArea.focus();
    textArea.setSelectionRange(0, text.length);
    
    try {
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        resolve(true);
      } else {
        reject(new Error('Safari execCommand 复制失败'));
      }
    } catch (error) {
      document.body.removeChild(textArea);
      reject(error);
    }
  });
};

/**
 * 复制文本到剪贴板
 * @param {string} text - 要复制的文本
 * @param {string} label - 复制内容的标签，用于提示消息（可选）
 * @returns {Promise<boolean>} - 返回复制是否成功
 */
export const copyToClipboard = async (text, label = '内容') => {
  if (!text) {
    throw new Error('复制内容不能为空');
  }

  try {
    // Safari浏览器特殊处理
    if (isSafari()) {
      // 优先尝试现代API，但Safari对安全上下文要求严格
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch (clipboardError) {
          console.warn('Safari Clipboard API失败，降级到execCommand:', clipboardError);
          // 降级到Safari专用方法
          await safariCopy(text);
          return true;
        }
      } else {
        // 直接使用Safari专用方法
        await safariCopy(text);
        return true;
      }
    }
    
    // 方法1: 使用现代浏览器的 Clipboard API（非Safari浏览器首选）
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    
    // 方法2: 使用 document.execCommand（通用兼容性方案）
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // 设置样式，使其不可见且不影响页面布局
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.style.opacity = '0';
    textArea.style.pointerEvents = 'none';
    textArea.style.zIndex = '-1';
    
    // 添加到 DOM
    document.body.appendChild(textArea);
    
    // 选择文本
    textArea.focus();
    textArea.select();
    
    // 兼容iOS设备的选择
    if (navigator.userAgent.match(/ipad|iphone/i)) {
      textArea.setSelectionRange(0, text.length);
    }
    
    // 尝试复制
    const successful = document.execCommand('copy');
    
    // 清理 DOM
    document.body.removeChild(textArea);
    
    if (successful) {
      return true;
    } else {
      throw new Error('document.execCommand 复制失败');
    }
    
  } catch (error) {
    console.error('复制失败:', error);
    throw new Error(`复制${label}失败`);
  }
};

/**
 * 复制文本到剪贴板（带成功提示）
 * 适用于 Vue 组件中使用，会显示 Element UI 的消息提示
 * @param {string} text - 要复制的文本
 * @param {string} label - 复制内容的标签
 * @param {object} vm - Vue 组件实例（用于调用 $message）
 * @returns {Promise<void>}
 */
export const copyWithMessage = async (text, label = '内容', vm) => {
  try {
    await copyToClipboard(text, label);
    if (vm && vm.$message) {
      vm.$message.success(`${label}已复制到剪贴板`);
    }
  } catch (error) {
    console.error('复制失败详情:', error);
    
    // 为Safari提供更详细的错误信息
    let errorMessage = error.message || `复制${label}失败，请手动复制`;
    
    if (isSafari() && !window.isSecureContext) {
      errorMessage = `复制失败：Safari需要HTTPS环境。请手动复制${label}`;
    } else if (isSafari() && error.message.includes('Safari')) {
      errorMessage = `Safari复制失败，请手动选择并复制${label}`;
    }
    
    if (vm && vm.$message) {
      vm.$message.error(errorMessage);
    } else {
      console.error(errorMessage);
    }
  }
};

/**
 * 检查浏览器是否支持剪贴板操作
 * @returns {object} - 返回支持的功能信息
 */
export const getClipboardSupport = () => {
  const hasClipboardAPI = !!(navigator.clipboard && window.isSecureContext);
  const hasExecCommand = !!document.execCommand;
  const browserInfo = {
    isSafari: isSafari(),
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent),
    isSecureContext: window.isSecureContext
  };
  
  return {
    modern: hasClipboardAPI,      // 是否支持现代 Clipboard API
    legacy: hasExecCommand,       // 是否支持 execCommand
    supported: hasClipboardAPI || hasExecCommand,  // 是否支持任何复制方法
    browser: browserInfo,         // 浏览器信息
    recommendedMethod: browserInfo.isSafari ? 'safari-optimized' : 
                      hasClipboardAPI ? 'clipboard-api' : 'exec-command'
  };
};

/**
 * 显示手动复制提示（当自动复制失败时使用）
 * @param {string} text - 要复制的文本
 * @param {string} label - 复制内容的标签
 * @param {object} vm - Vue 组件实例
 */
export const showManualCopyDialog = (text, label, vm) => {
  if (vm && vm.$alert) {
    const isSafariBrowser = isSafari();
    const message = isSafariBrowser 
      ? `Safari浏览器限制，无法自动复制。请手动选择并复制以下${label}：\n\n${text}`
      : `请手动复制以下${label}：\n\n${text}`;
    
    vm.$alert(
      message, 
      isSafariBrowser ? 'Safari复制提示' : '复制提示', 
      {
        confirmButtonText: '已复制',
        type: 'info',
        dangerouslyUseHTMLString: false,
        customClass: 'copy-dialog'
      }
    );
  }
};

/**
 * 带降级方案的复制方法
 * 如果自动复制失败，会显示手动复制对话框
 * @param {string} text - 要复制的文本  
 * @param {string} label - 复制内容的标签
 * @param {object} vm - Vue 组件实例
 * @returns {Promise<void>}
 */
export const copyWithFallback = async (text, label = '内容', vm) => {
  // 如果是Safari并且不在安全上下文中，直接显示手动复制对话框
  if (isSafari() && !window.isSecureContext) {
    console.warn('Safari非HTTPS环境，直接使用手动复制');
    showManualCopyDialog(text, label, vm);
    return;
  }
  
  try {
    await copyToClipboard(text, label);
    if (vm && vm.$message) {
      vm.$message.success(`${label}已复制到剪贴板`);
    }
  } catch (error) {
    console.error('自动复制失败，显示手动复制对话框:', error);
    
    // 如果是Safari或自动复制失败，显示手动复制对话框
    if (isSafari() || error.message.includes('失败')) {
      showManualCopyDialog(text, label, vm);
    } else {
      // 其他错误正常提示
      if (vm && vm.$message) {
        vm.$message.error(error.message || `复制${label}失败`);
      }
    }
  }
};

export default {
  copyToClipboard,
  copyWithMessage,
  copyWithFallback,
  showManualCopyDialog,
  getClipboardSupport
}; 