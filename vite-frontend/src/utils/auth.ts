import {
  getPermissionsFromToken,
  getPrincipalTypeFromToken,
  getRoleCodesFromToken,
  getRoleIdFromToken,
  isAdminToken,
  isTokenValid
} from './jwt';
import type { LoginResponse } from '@/api';

/**
 * 权限工具类
 */

/**
 * 获取当前用户的token
 * @returns token
 */
export function getToken(): string | null {
  return localStorage.getItem('token');
}

export function getPrincipalType(): string | null {
  const token = getToken();
  if (!token || !isTokenValid(token)) {
    return null;
  }
  return getPrincipalTypeFromToken(token);
}

/**
 * 获取当前用户的角色ID
 * @returns 角色ID
 */
export function getCurrentUserRoleId(): number | null {
  const token = getToken();
  if (!token || !isTokenValid(token)) {
    return null;
  }
  return getRoleIdFromToken(token);
}

/**
 * 判断当前用户是否是管理员
 * @returns 是否是管理员
 */
export function isAdmin(): boolean {
  const token = getToken();
  if (!token || !isTokenValid(token)) {
    return false;
  }
  return isAdminToken(token) || localStorage.getItem('admin') === 'true';
}

export function getPermissions(): string[] {
  const token = getToken();
  if (!token || !isTokenValid(token)) {
    return [];
  }
  const stored = localStorage.getItem('permissions');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      /* ignore invalid cache */
    }
  }
  return getPermissionsFromToken(token);
}

export function getRoleCodes(): string[] {
  const token = getToken();
  if (!token || !isTokenValid(token)) {
    return [];
  }
  const stored = localStorage.getItem('role_codes');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      /* ignore invalid cache */
    }
  }
  return getRoleCodesFromToken(token);
}

/**
 * Check if user has a specific permission.
 * Backward compatible: module.write implies module.create/update/delete.
 */
export function hasPermission(permissionCode: string): boolean {
  if (!permissionCode) {
    return false;
  }
  if (isAdmin()) {
    return true;
  }
  const perms = getPermissions();
  if (perms.includes(permissionCode)) {
    return true;
  }
  // module.write implies module.create/update/delete
  if (permissionCode.endsWith('.create') || permissionCode.endsWith('.update') || permissionCode.endsWith('.delete')) {
    const module = permissionCode.substring(0, permissionCode.lastIndexOf('.'));
    return perms.includes(module + '.write');
  }
  return false;
}

export function hasAnyPermission(permissionCodes: string[] = []): boolean {
  if (!permissionCodes.length) {
    return true;
  }
  if (isAdmin()) {
    return true;
  }
  return permissionCodes.some((code) => hasPermission(code));
}

/**
 * 判断当前用户是否有指定角色
 * @param targetRoleId 目标角色ID
 * @returns 是否有指定角色
 */
export function hasRole(targetRoleId: number): boolean {
  const roleId = getCurrentUserRoleId();
  return roleId === targetRoleId;
}

/**
 * 判断当前用户是否已登录且token有效
 * @returns 是否已登录
 */
export function isLoggedIn(): boolean {
  const token = getToken();
  return token ? isTokenValid(token) : false;
}

export function persistAuthSession(authData?: LoginResponse) {
  if (!authData?.token || authData.role_id === undefined || !authData.name) {
    return false;
  }

  localStorage.setItem('token', authData.token);
  localStorage.setItem('role_id', authData.role_id.toString());
  localStorage.setItem('name', authData.name);
  localStorage.setItem('admin', String(authData.admin ?? authData.role_id === 0));
  localStorage.setItem('principal_type', authData.principalType || 'legacy');
  localStorage.setItem('auth_source', authData.authSource || 'local');
  localStorage.setItem('permissions', JSON.stringify(authData.permissions || []));
  localStorage.setItem('role_codes', JSON.stringify(authData.roleCodes || []));
  if (authData.email) {
    localStorage.setItem('email', authData.email);
  } else {
    localStorage.removeItem('email');
  }
  return true;
}

export function clearAuthSessionStorage() {
  localStorage.removeItem('token');
  localStorage.removeItem('role_id');
  localStorage.removeItem('name');
  localStorage.removeItem('admin');
  localStorage.removeItem('principal_type');
  localStorage.removeItem('auth_source');
  localStorage.removeItem('permissions');
  localStorage.removeItem('role_codes');
  localStorage.removeItem('email');
  localStorage.removeItem('force_password_change');
  localStorage.removeItem('force_two_factor_setup');
}

/**
 * 权限检查装饰器函数
 * @param fn 要执行的函数
 * @param errorMsg 权限不足时的错误提示
 * @returns 包装后的函数
 */
export function requireAdmin<T extends (...args: any[]) => any>(
  fn: T, 
  errorMsg: string = '权限不足，仅管理员可操作'
): T {
  return ((...args: Parameters<T>) => {
    if (!isAdmin()) {
      console.warn(errorMsg);
      return false;
    }
    return fn(...args);
  }) as T;
} 
