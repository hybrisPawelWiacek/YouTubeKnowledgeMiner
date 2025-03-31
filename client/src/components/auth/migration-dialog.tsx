/**
 * Migration Dialog Component
 * 
 * This dialog is shown to users who have anonymous content that can be migrated
 * to their newly created or authenticated account. It:
 * 1. Explains the migration process
 * 2. Shows progress of migration
 * 3. Confirms successful migration of content
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

interface MigrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  authToken?: string; // Optional auth token to use directly
}

type MigrationStatus = 'idle' | 'migrating' | 'success' | 'error';

export function MigrationDialog({ isOpen, onClose, sessionId, authToken }: MigrationDialogProps) {
  const { migrateAnonymousContent, refreshUser } = useAuth();
  const [status, setStatus] = useState<MigrationStatus>('idle');
  const [message, setMessage] = useState<string>('');
  const [videoCount, setVideoCount] = useState<number>(0);
  
  // Track if we're using a directly provided auth token
  const [usingProvidedToken, setUsingProvidedToken] = useState<boolean>(!!authToken);

  // Handle the migration process
  const handleMigration = useCallback(async () => {
    console.log('[MigrationDialog] Starting migration for session:', sessionId);
    setStatus('migrating');
    setMessage('Migrating your anonymous videos to your account...');

    try {
      // Add debug info about the session being migrated
      if (!sessionId || sessionId.trim() === '') {
        console.error('[MigrationDialog] Invalid session ID:', sessionId);
        throw new Error('Invalid anonymous session ID');
      }

      console.log('[MigrationDialog] Calling migrateAnonymousContent with session ID:', sessionId);
      console.log('[MigrationDialog] Auth token available:', !!authToken);
      
      if (authToken) {
        console.log('[MigrationDialog] Using provided auth token (first 10 chars):', 
                   authToken.substring(0, 10) + '...');
      } else {
        console.log('[MigrationDialog] No auth token provided, will use token from auth context');
      }
      
      // Perform the migration
      const result = await migrateAnonymousContent(sessionId, authToken);
      console.log('[MigrationDialog] Migration result:', result);
      
      if (result.success) {
        console.log('[MigrationDialog] Migration successful');
        setStatus('success');
        
        // Extract the number of videos migrated from the result
        if (result.data?.migratedVideos !== undefined) {
          // Use the direct data if available (preferred)
          console.log('[MigrationDialog] Videos migrated:', result.data.migratedVideos);
          setVideoCount(result.data.migratedVideos);
        } else {
          // Fallback to parsing from message
          const matches = result.message?.match(/^(\d+)/);
          if (matches && matches[1]) {
            const count = parseInt(matches[1], 10);
            console.log('[MigrationDialog] Videos migrated (parsed from message):', count);
            setVideoCount(count);
          }
        }
        
        // Set the success message
        setMessage(result.message || `Successfully migrated your content`);
        
        // Import and use our enhanced clearAnonymousSession function
        try {
          const { clearAnonymousSession } = await import('@/lib/anonymous-session');
          
          // Always force reload after migration to ensure clean state
          const shouldForceReload = true;
          
          console.log(`[MigrationDialog] Clearing anonymous session with page reload`);
          
          // Force refresh the user state to update the UI before reload
          await refreshUser();
          console.log('[MigrationDialog] Auth state refreshed after migration');
          
          // First, ensure all cookies related to anonymous sessions are cleared
          const paths = ['/', '/api', '/api/auth', '/api/anonymous', '/videos', ''];
          const cookieNames = ['anonymousSessionId', 'anonymous_session_id', 'anonymous_session', 'x-anonymous-session'];
          
          cookieNames.forEach(name => {
            paths.forEach(path => {
              document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; SameSite=Lax`;
              console.log(`[MigrationDialog] Manually cleared cookie ${name} on path ${path}`);
            });
          });
          
          // Also remove from localStorage directly
          localStorage.removeItem('ytk_anon_session_id');
          console.log('[MigrationDialog] Directly removed anonymous session from localStorage');
          
          // Now use the thorough clearAnonymousSession function with a delay
          setTimeout(() => {
            console.log('[MigrationDialog] Clearing session with reload after delay');
            clearAnonymousSession(true); // Always force reload to ensure clean state
          }, 1000);
          
          console.log('[MigrationDialog] Anonymous session cleared successfully');
        } catch (error) {
          console.error('[MigrationDialog] Error during cleanup:', error);
          
          // Even if there's an error, still try to force a clean state
          try {
            // Force a direct cleanup of known storage locations
            localStorage.removeItem('ytk_anon_session_id');
            document.cookie = 'anonymousSessionId=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
            document.cookie = 'anonymous_session_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
            
            // Refresh user state
            await refreshUser();
            
            // Force reload after a short delay
            setTimeout(() => {
              window.location.href = '/';
            }, 1000);
          } catch (fallbackErr) {
            console.error('[MigrationDialog] Even fallback cleanup failed:', fallbackErr);
            // Last resort: just reload the page
            window.location.href = '/';
          }
        }
      } else {
        console.error('[MigrationDialog] Migration failed with message:', result.message);
        console.error('[MigrationDialog] Error code:', result.error?.code);
        
        // Check for specific error codes and provide helpful messages
        if (result.error?.code === 'AUTH_REQUIRED') {
          setMessage('Authentication required. Please make sure you are logged in and try again.');
        } else {
          setMessage(result.message || 'Failed to migrate your content');
        }
        
        setStatus('error');
      }
    } catch (error: any) {
      console.error('[MigrationDialog] Migration error:', error);
      
      // Check response.data for error details from API
      let errorDetails = 'An unexpected error occurred during migration';
      
      if (error.response?.data) {
        const apiError = error.response.data;
        console.log('[MigrationDialog] API error response:', apiError);
        
        if (apiError.error?.code === 'AUTH_REQUIRED') {
          errorDetails = 'Authentication required. Please log in again and try once more.';
        } else if (apiError.message) {
          errorDetails = apiError.message;
        }
      } else if (error.message) {
        errorDetails = error.message;
      }
      
      console.error('[MigrationDialog] Error details:', errorDetails);
      setStatus('error');
      setMessage(errorDetails);
    }
  }, [sessionId, migrateAnonymousContent, authToken, refreshUser]);

  // Start migration when dialog opens with a slight delay to ensure auth token is available
  useEffect(() => {
    if (isOpen && status === 'idle') {
      // Add a short delay to ensure the authentication token has been properly set
      // in cookies/localStorage before attempting the migration
      console.log('[MigrationDialog] Dialog opened - preparing for migration...');
      console.log('[MigrationDialog] Session ID to migrate:', sessionId);
      console.log('[MigrationDialog] Auth token provided directly:', !!authToken);
      
      // Check if we should try to get the auth token from localStorage as fallback
      if (!authToken) {
        const localStorageToken = localStorage.getItem('auth_token');
        if (localStorageToken) {
          console.log('[MigrationDialog] Found auth token in localStorage, will use it for migration');
        } else {
          console.log('[MigrationDialog] No auth token in localStorage, will rely on auth context token');
        }
      }
      
      // Set up a timer with a slightly longer delay to ensure the auth token is available
      const migrationTimer = setTimeout(() => {
        console.log('[MigrationDialog] Starting migration after delay');
        handleMigration();
      }, 1500); // 1.5 second delay for better reliability
      
      return () => {
        clearTimeout(migrationTimer);
      };
    }
  }, [isOpen, status, handleMigration, authToken, sessionId]);

  // Content based on migration status
  const renderContent = () => {
    switch (status) {
      case 'migrating':
        return (
          <>
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
            <p className="text-center text-muted-foreground">{message}</p>
          </>
        );
      
      case 'success':
        return (
          <>
            <div className="flex justify-center items-center py-8">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <p className="text-center mb-4">
              <span className="font-semibold">{videoCount} videos</span> have been successfully migrated to your account!
            </p>
            <p className="text-center text-muted-foreground">
              You can now access all your videos in your personal library.
            </p>
          </>
        );
      
      case 'error':
        return (
          <>
            <div className="flex justify-center items-center py-8">
              <AlertTriangle className="h-16 w-16 text-destructive" />
            </div>
            <p className="text-center mb-4 font-semibold">Migration failed</p>
            <p className="text-center text-muted-foreground">{message}</p>
            <div className="mt-6 flex justify-center">
              <Button variant="outline" onClick={handleMigration}>
                Try Again
              </Button>
            </div>
          </>
        );
      
      default:
        return (
          <p className="text-center py-8 text-muted-foreground">
            Preparing to migrate your content...
          </p>
        );
    }
  };

  // Handle dialog close with additional page refresh logic
  const handleClose = () => {
    // If migration was successful, force a complete page refresh
    // This ensures all state is completely reset
    if (status === 'success') {
      console.log('[MigrationDialog] Migration was successful - triggering page refresh on close');
      // Call the onClose first to update parent components
      onClose();
      // Then force a complete page reload to reset all state
      window.location.href = '/';
    } else {
      // Just call the regular onClose if migration wasn't successful
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {status === 'success' 
              ? 'Migration Complete' 
              : status === 'error' 
                ? 'Migration Error' 
                : 'Migrating Your Content'}
          </DialogTitle>
          <DialogDescription>
            {status === 'success' 
              ? 'Your anonymous content has been added to your account'
              : status === 'error'
                ? 'There was a problem migrating your content'
                : 'Please wait while we migrate your anonymous videos to your account'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {renderContent()}
        </div>

        <DialogFooter>
          {(status === 'success' || status === 'error') && (
            <Button 
              onClick={handleClose}
              className="w-full sm:w-auto"
            >
              {status === 'success' ? 'Go to Library' : 'Close'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}