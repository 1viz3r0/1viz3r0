/// <reference types="chrome" />

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

export const extensionAuth = {
  async setToken(token: string): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({ auth_token: token });
    } else {
      localStorage.setItem('auth_token', token);
    }
  },

  async getToken(): Promise<string | null> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get('auth_token');
      return result.auth_token || null;
    } else {
      return localStorage.getItem('auth_token');
    }
  },

  async removeToken(): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.remove('auth_token');
    } else {
      localStorage.removeItem('auth_token');
    }
  },

  async setUser(user: User): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({ user: JSON.stringify(user) });
    } else {
      localStorage.setItem('user', JSON.stringify(user));
    }
  },

  async getUser(): Promise<User | null> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get('user');
      return result.user ? JSON.parse(result.user) : null;
    } else {
      const user = localStorage.getItem('user');
      return user ? JSON.parse(user) : null;
    }
  },

  async removeUser(): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.remove('user');
    } else {
      localStorage.removeItem('user');
    }
  },

  async clearAll(): Promise<void> {
    await this.removeToken();
    await this.removeUser();
  }
};
