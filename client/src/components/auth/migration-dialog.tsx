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
}

type MigrationStatus = 'idle' | 'migrating' | 'success' | 'error';

export function MigrationDialog({ isOpen, onClose, sessionId }: MigrationDialogProps) {
  const { migrateAnonymousContent } = useAuth();
  const [status, setStatus] = useState<MigrationStatus>('idle');
  const [message, setMessage] = useState<string>('');
  const [videoCount, setVideoCount] = useState<number>(0);

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
      const result = await migrateAnonymousContent(sessionId);
      console.log('[MigrationDialog] Migration result:', result);
      
      if (result.success) {
        setStatus('success');
        // Extract the number of videos migrated from the message
        // This is a simple parsing based on expected message format
        if (result.data?.migratedVideos !== undefined) {
          // Use the direct data if available (preferred)
          setVideoCount(result.data.migratedVideos);
        } else {
          // Fallback to parsing from message
          const matches = result.message.match(/^(\d+)/);
          if (matches && matches[1]) {
            setVideoCount(parseInt(matches[1], 10));
          }
        }
        setMessage(result.message);
      } else {
        console.error('[MigrationDialog] Migration failed with message:', result.message);
        
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
  }, [sessionId, migrateAnonymousContent]);

  // Start migration when dialog opens
  useEffect(() => {
    if (isOpen && status === 'idle') {
      handleMigration();
    }
  }, [isOpen, status, handleMigration]);

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
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
              onClick={onClose}
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