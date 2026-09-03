/**
 * 登录态管理（localStorage）
 */
export function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch (e) {
    return null;
  }
}

export function setAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export function isLoggedIn() {
  return !!localStorage.getItem('token');
}

export function isAdmin() {
  const user = getUser();
  return !!(user && user.role === 'admin');
}
