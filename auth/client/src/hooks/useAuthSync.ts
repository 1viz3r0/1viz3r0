import { useEffect } from 'react';

/**
 * Hook to listen for auth sync events from the extension
 * This allows the web app to react to auth changes from the extension
 */
export function useAuthSync(onAuthChange: () => void) {
  useEffect(() => {
    const handleAuthSync = (event: CustomEvent) => {
      if (event.detail.cleared) {
        // Auth was cleared from extension
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        onAuthChange();
      } else if (event.detail.token) {
        // Auth was set from extension or web app
        // Update localStorage if user data is provided in event
        if (event.detail.user) {
          localStorage.setItem('auth_token', event.detail.token);
          localStorage.setItem('user', JSON.stringify(event.detail.user));
        }
        onAuthChange();
      }
    };

    window.addEventListener('auth-sync', handleAuthSync as EventListener);

    return () => {
      window.removeEventListener('auth-sync', handleAuthSync as EventListener);
    };
  }, [onAuthChange]);
}
