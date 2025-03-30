/**
 * Migration Dialog Component
 * 
 * This dialog is shown to users who have anonymous content that can be migrated
 * to their newly created or authenticated account. It:
 * 1. Explains the migration process
 * 2. Shows progress of migration
 * 3. Confirms successful migration of content
 */

import { useState, useEffect } from 'react';
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

  // Start migration when dialog opens
  useEffect(() => {
    if (isOpen && status === 'idle') {
      handleMigration();
    }
  }, [isOpen, status]);

  // Handle the migration process
  const handleMigration = async () => {
    setStatus('migrating');
    setMessage('Migrating your anonymous videos to your account...');

    try {
      const result = await migrateAnonymousContent(sessionId);
      
      if (result.success) {
        setStatus('success');
        // Extract the number of videos migrated from the message
        // This is a simple parsing based on expected message format
        const matches = result.message.match(/^(\d+)/);
        if (matches && matches[1]) {
          setVideoCount(parseInt(matches[1], 10));
        }
        setMessage(result.message);
      } else {
        setStatus('error');
        setMessage(result.message || 'Failed to migrate your content');
      }
    } catch (error: any) {
      setStatus('error');
      setMessage(error.message || 'An unexpected error occurred during migration');
    }
  };

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