const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private isExtension: boolean = false;
  private tokenInitialized: Promise<void>;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.isExtension = typeof chrome !== 'undefined' && chrome.storage !== undefined;
    
    // Initialize token - async for extension context
    this.tokenInitialized = this.initializeToken();
    
    // Log configuration on initialization
    console.log('🔧 API Client initialized:');
    console.log('   Base URL:', this.baseUrl);
    console.log('   Context:', this.isExtension ? 'Extension' : 'Web');
  }

  private async initializeToken() {
    if (this.isExtension) {
      try {
        const result = await chrome.storage.local.get('auth_token');
        this.token = result.auth_token || null;
        console.log('   Token:', this.token ? 'Present' : 'Not set');
      } catch (error) {
        console.error('Error loading token from chrome.storage:', error);
        this.token = null;
      }
    } else {
      this.token = localStorage.getItem('auth_token');
      console.log('   Token:', this.token ? 'Present' : 'Not set');
    }
  }

  async setToken(token: string | null) {
    this.token = token;
    if (this.isExtension) {
      if (token) {
        await chrome.storage.local.set({ auth_token: token });
      } else {
        await chrome.storage.local.remove('auth_token');
      }
    } else {
      if (token) {
        localStorage.setItem('auth_token', token);
      } else {
        localStorage.removeItem('auth_token');
      }
    }
  }

  async getToken(): Promise<string | null> {
    // Always refresh from storage before returning token
    if (this.isExtension) {
      try {
        const result = await chrome.storage.local.get('auth_token');
        this.token = result.auth_token || null;
      } catch (error) {
        console.error('Error getting token from chrome.storage:', error);
      }
    } else {
      // In web app context, always check localStorage (content script may have synced token)
      try {
        const storedToken = localStorage.getItem('auth_token');
        if (storedToken !== this.token) {
          console.log('🔄 Token updated from localStorage:', !!storedToken);
          this.token = storedToken;
        }
      } catch (error) {
        console.error('Error getting token from localStorage:', error);
      }
    }
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    // Ensure token initialization is complete before making request
    await this.tokenInitialized;
    
    // Always refresh token from storage before making request (especially for extension)
    const token = await this.getToken();
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Auth endpoints don't require tokens (login, register, etc.)
    const authEndpoints = ['/auth/login', '/auth/register', '/auth/verify-email-otp', '/auth/verify-mobile-otp', '/auth/resend-otp', '/auth/google', '/auth/verify-google-otp'];
    const isAuthEndpoint = authEndpoints.some(authPath => endpoint.startsWith(authPath));

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      console.log('🔑 Token available for request:', endpoint.substring(0, 30) + '...');
    } else if (!isAuthEndpoint) {
      // Only warn for non-auth endpoints that might need a token
      console.warn('⚠️ No auth token available for request to:', endpoint);
    }

    try {
      const url = `${this.baseUrl}${endpoint}`;
      console.log('🌐 API Request:', options.method || 'GET', url);
      console.log('   Headers:', headers);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout for scan initiation
      
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      let data;
      
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch (parseError) {
          console.error('❌ Failed to parse JSON response:', parseError);
          const text = await response.text();
          console.error('   Response text:', text.substring(0, 500)); // Limit text length
          throw new Error('Invalid JSON response from server');
        }
      } else {
        // Get response text to see what we actually received
        const text = await response.text();
        console.error('❌ Non-JSON response received:');
        console.error('   URL:', url);
        console.error('   Content-Type:', contentType);
        console.error('   Status:', response.status, response.statusText);
        console.error('   Response preview:', text.substring(0, 500)); // Limit text length
        
        // If it's an HTML error page, provide a helpful error message
        if (contentType && contentType.includes('text/html')) {
          // Check for common error scenarios
          if (response.status === 404) {
            return {
              success: false,
              error: `API endpoint not found: ${endpoint}. Make sure the server is running on ${this.baseUrl.replace('/api', '')}`
            };
          } else if (response.status === 500) {
            return {
              success: false,
              error: 'Server error occurred. Check server logs for details.'
            };
          } else if (response.status === 401 || response.status === 403) {
            // Authentication error - clear token
            if (this.isExtension) {
              await chrome.storage.local.remove('auth_token');
            } else {
              localStorage.removeItem('auth_token');
            }
            this.token = null;
            return {
              success: false,
              error: 'Authentication failed. Please login again.'
            };
          } else if (response.status === 0 || !response.ok) {
            // Network error or CORS issue
            return {
              success: false,
              error: `Cannot connect to server at ${this.baseUrl.replace('/api', '')}. Make sure the backend server is running.`
            };
          } else {
            return {
              success: false,
              error: `Server returned HTML instead of JSON (Status: ${response.status}). This usually means the endpoint doesn't exist or there's a server error.`
            };
          }
        }
        
        // For other non-JSON responses, return a generic error
        return {
          success: false,
          error: `Expected JSON but got ${contentType || 'unknown'} (Status: ${response.status})`
        };
      }

      if (!response.ok) {
        // Handle authentication errors
        if (response.status === 401 || response.status === 403) {
          console.error('🔒 Authentication error:', response.status);
          // Clear invalid token
          if (this.isExtension) {
            await chrome.storage.local.remove('auth_token');
          } else {
            localStorage.removeItem('auth_token');
          }
          this.token = null;
          return {
            success: false,
            error: data.message || data.error || 'Not authorized. Please login again.',
          };
        }
        
        // For 400 errors, preserve the logged flag if present
        const errorResponse: any = {
          success: false,
          error: data.message || data.error || `Request failed (${response.status})`,
        };
        
        // If server indicates a log was created (for invalid URLs), preserve that flag
        if (data.logged !== undefined) {
          errorResponse.logged = data.logged;
        }
        if (data.message) {
          errorResponse.message = data.message;
        }
        
        return errorResponse;
      }

      // Backend returns { success: true, token, user } or { success: true, data: ... }
      // Return the data directly
      return { success: true, data: data as T };
    } catch (error) {
      console.error('❌ API Error:', error);
      
      // Provide helpful error messages
      let errorMessage = 'Unknown error';
      
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        errorMessage = `Cannot connect to server at ${this.baseUrl}`;
        console.error('🔴 Connection Error - Failed to fetch');
        console.error('   API Base URL:', this.baseUrl);
        console.error('   Endpoint:', endpoint);
        console.error('   Full URL:', `${this.baseUrl}${endpoint}`);
        console.error('   Possible causes:');
        console.error('   1. Server not running - Check: npm start (in server folder)');
        console.error('   2. Wrong port - Server should be on port 5000');
        console.error('   3. CORS issue - Check server CORS configuration');
        console.error('   4. Network/firewall blocking connection');
        console.error('   5. Browser blocking mixed content');
        console.error('');
        console.error('   💡 Quick checks:');
        console.error('   - Open: http://localhost:5000/api/health in browser');
        console.error('   - Check server console for errors');
        console.error('   - Check browser Network tab for failed requests');
      } else if (error instanceof Error) {
        errorMessage = error.message;
        if (error.name === 'AbortError') {
          errorMessage = 'Request timeout - Server took too long to respond';
        }
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  // Auth endpoints
  async login(email: string, password: string) {
    return this.request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(data: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }) {
    return this.request<{ sessionId: string; requiresOTP: boolean }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async verifyEmailOTP(sessionId: string, otp: string) {
    return this.request<{ message: string }>('/auth/verify-email-otp', {
      method: 'POST',
      body: JSON.stringify({ sessionId, otp }),
    });
  }

  async verifyMobileOTP(sessionId: string, otp: string) {
    return this.request<{ token: string; user: any }>('/auth/verify-mobile-otp', {
      method: 'POST',
      body: JSON.stringify({ sessionId, otp }),
    });
  }

  async resendOTP(sessionId: string, type: 'email' | 'mobile') {
    return this.request<{ message: string }>('/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ sessionId, type }),
    });
  }

  async googleAuth(idToken: string) {
    return this.request<{ sessionId?: string; requiresOTP?: boolean; token?: string; user?: any }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });
  }

  async verifyGoogleOTP(sessionId: string, phone: string, otp: string) {
    return this.request<{ token: string; user: any }>('/auth/verify-google-otp', {
      method: 'POST',
      body: JSON.stringify({ sessionId, phone, otp }),
    });
  }

  async logout() {
    // Try to call backend logout endpoint (may fail if token is invalid, that's okay)
    try {
      await this.request('/auth/logout', {
        method: 'POST',
      });
    } catch (error) {
      // Ignore errors - we'll clear client-side storage anyway
    }
  }

  async deleteAccount() {
    return this.request<{
      success: boolean;
      message: string;
    }>('/auth/account', {
      method: 'DELETE',
    });
  }

  // Scan endpoints - OWASP ZAP Integration
  async scanPage(url: string) {
    return this.request<{ scanId: string; status: string }>('/scan/page', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  async getScanStatus(scanId?: string) {
    const query = scanId ? `?scanId=${scanId}` : '';
    return this.request<{
      status: 'safe' | 'unsafe';
      critical: number;
      high: number;
      medium: number;
      low: number;
    }>(`/scan/status${query}`);
  }

  // Download scan - ClamAV Integration
  async scanDownload(fileUrl: string, fileName: string) {
    return this.request<{
      status: 'clean' | 'infected';
      threats?: string[];
    }>('/scan/download', {
      method: 'POST',
      body: JSON.stringify({ fileUrl, fileName }),
    });
  }

  // Ad blocker
  async toggleAdBlocker(enabled: boolean) {
    return this.request('/adblock/toggle', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  }

  // Password checker
  async checkPasswords() {
    return this.request<{
      weak: number;
      medium: number;
      strong: number;
      passwords: Array<{ site: string; strength: string }>;
    }>('/passwords/check');
  }

  // Clean data - Delete ALL activity logs
  async cleanData() {
    return this.request<{
      message: string;
      deletedCount: number;
    }>('/logs', {
      method: 'DELETE',
    });
  }

  // Network check - LibreSpeed API Integration
  async checkNetwork() {
    return this.request<{
      download: number;
      upload: number;
      ping: number;
      jitter: number;
    }>('/network/check');
  }

  // Activity logs
  async getLogs(type?: 'pages' | 'downloads' | 'network' | 'passwords') {
    const query = type ? `?type=${type}` : '';
    return this.request<{
      logs: Array<{
        id: string;
        timestamp: string;
        type: string;
        result: 'safe' | 'unsafe' | 'clean' | 'infected';
        threatLevel: 'critical' | 'high' | 'medium' | 'low' | 'none';
        source: string;
        details?: any;
      }>;
    }>(`/logs${query}`);
  }

  async exportLogs(type: 'pages' | 'downloads' | 'network' | 'passwords') {
    return this.request<{ downloadUrl: string }>(`/logs/export?type=${type}`);
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
export default apiClient;
