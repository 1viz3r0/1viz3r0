import { useState } from 'react';
import { Key, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import apiClient from '@/lib/apiClient';

export default function PrivacyTab() {
  const [isCheckingPasswords, setIsCheckingPasswords] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [passwordStats, setPasswordStats] = useState<{ weak: number; medium: number; strong: number } | null>(null);
  const { toast } = useToast();

  const handlePasswordCheck = async () => {
    setIsCheckingPasswords(true);
    try {
      const response = await apiClient.checkPasswords();
      
      if (response.success && response.data) {
        setPasswordStats({
          weak: response.data.weak,
          medium: response.data.medium,
          strong: response.data.strong,
        });
        toast({
          title: 'Password Check Complete',
          description: `Found ${response.data.weak} weak passwords`,
        });
      } else {
        toast({
          title: 'Check failed',
          description: response.error || 'Could not check passwords',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to check passwords',
        variant: 'destructive',
      });
    } finally {
      setIsCheckingPasswords(false);
    }
  };

  const handleCleanData = async () => {
    setIsCleaning(true);
    try {
      // Delete all logs from backend
      const response = await apiClient.cleanData();
      
      if (response.success && response.data) {
        const deletedCount = response.data.deletedCount || 0;
        
        // Clear extension local storage (cached logs and any other cached data)
        if (typeof chrome !== 'undefined' && chrome.storage) {
          try {
            // Clear any cached logs or data from local storage
            // Keep essential data like auth_token, settings, etc.
            const storage = await chrome.storage.local.get(null);
            const keysToRemove: string[] = [];
            
            // Remove cached log data (if any)
            for (const key of Object.keys(storage)) {
              if (key.includes('logs') || key.includes('cache') || key.includes('Log')) {
                keysToRemove.push(key);
              }
            }
            
            if (keysToRemove.length > 0) {
              await chrome.storage.local.remove(keysToRemove);
              console.log(`🗑️ Cleared ${keysToRemove.length} cached items from extension storage`);
            }
          } catch (storageError) {
            console.error('Error clearing extension storage:', storageError);
            // Don't fail the whole operation if storage cleanup fails
          }
        }
        
        // Notify background script and other components to refresh logs
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          try {
            chrome.runtime.sendMessage({
              type: 'LOGS_CLEARED',
              deletedCount: deletedCount
            }).catch((error) => {
              // Ignore errors if no listeners are registered
              console.log('No message listeners for LOGS_CLEARED');
            });
          } catch (messageError) {
            console.error('Error sending LOGS_CLEARED message:', messageError);
          }
        }
        
        toast({
          title: 'Data Cleaned',
          description: `Successfully deleted ${deletedCount} activity log${deletedCount !== 1 ? 's' : ''} and cleared cached data`,
        });
      } else {
        toast({
          title: 'Clean failed',
          description: response.error || 'Could not clean data',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error cleaning data:', error);
      toast({
        title: 'Error',
        description: 'Failed to clean data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="p-4">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm">Password Checker</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Check the strength of your saved passwords
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          <Button
            className="w-full"
            onClick={handlePasswordCheck}
            disabled={isCheckingPasswords}
          >
            {isCheckingPasswords ? 'Checking...' : 'Check Passwords'}
          </Button>

          {passwordStats && (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span>Weak:</span>
                <span className="font-medium text-destructive">{passwordStats.weak}</span>
              </div>
              <div className="flex justify-between">
                <span>Medium:</span>
                <span className="font-medium text-yellow-500">{passwordStats.medium}</span>
              </div>
              <div className="flex justify-between">
                <span>Strong:</span>
                <span className="font-medium text-safe">{passwordStats.strong}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4">
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm">Clean Data</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Clear browsing logs and cached data
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Button
            variant="destructive"
            className="w-full"
            onClick={handleCleanData}
            disabled={isCleaning}
          >
            {isCleaning ? 'Cleaning...' : 'Clean Now'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
