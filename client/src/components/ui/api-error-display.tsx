import { AlertCircle, RefreshCw, AlertTriangle, WifiOff, ShieldAlert, Ban, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorType } from '@/contexts/error-context';
import { Link } from "wouter";

interface ApiErrorDisplayProps {
  type?: ErrorType;
  message?: string;
  code?: string;
  details?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Component for displaying API errors with appropriate visuals based on error type.
 * Includes an optional retry button when provided with an onRetry handler.
 */
export const ApiErrorDisplay = ({
  type = 'unknown',
  message = 'An error occurred. Please try again.',
  code,
  details,
  onRetry,
  className = '',
}: ApiErrorDisplayProps) => {
  console.log("ApiErrorDisplay props:", { type, message, code, details });
  // Determine icon based on error type
  const getIcon = () => {
    switch (type) {
      case 'network':
        return <WifiOff className="h-10 w-10 text-red-500" />;
      case 'session':
        return <ShieldAlert className="h-10 w-10 text-amber-500" />;
      case 'auth':
        return <ShieldAlert className="h-10 w-10 text-amber-500" />;
      case 'limit':
        return <Ban className="h-10 w-10 text-red-500" />;
      case 'validation':
        return <AlertTriangle className="h-10 w-10 text-amber-500" />;
      default:
        return <AlertCircle className="h-10 w-10 text-red-500" />;
    }
  };

  // Get title based on error type
  const getTitle = () => {
    switch (type) {
      case 'network':
        return 'Network Error';
      case 'session':
        return 'Session Error';
      case 'auth':
        return 'Authentication Required';
      case 'limit':
        return 'Limit Reached';
      case 'validation':
        return 'Validation Error';
      default:
        return 'Error';
    }
  };

  // Get helper text based on error type
  const getHelperText = () => {
    switch (type) {
      case 'network':
        return 'Please check your internet connection.';
      case 'session':
        return 'Your session may have expired.';
      case 'auth':
        return 'Please sign in to access this feature.';
      case 'limit':
        return 'You have reached the maximum limit for anonymous users.';
      default:
        return '';
    }
  };

  const helperText = getHelperText();

  return (
    <div className={`flex flex-col items-center justify-center p-6 text-center ${className}`}>
      <div className="flex flex-col items-center max-w-md gap-4">
        {getIcon()}
        <h3 className="text-xl font-semibold">{getTitle()}</h3>
        <p className="text-sm text-muted-foreground">{message}</p>
        
        {/* Additional details when provided */}
        {details && (
          <p className="text-sm text-muted-foreground mt-1">{details}</p>
        )}
        
        {/* Helper text based on error type */}
        {helperText && (
          <p className="text-xs text-muted-foreground">{helperText}</p>
        )}
        
        {/* Display error code for debugging/support */}
        {code && (
          <code className="text-xs bg-muted p-1 rounded">Error code: {code}</code>
        )}
        
        {/* Sign-in button for limit errors */}
        {type === 'limit' && (
          <Link to="/auth">
            <Button 
              className="mt-3"
              variant="default"
              size="sm"
            >
              <LogIn className="mr-2 h-4 w-4" />
              Sign In
            </Button>
          </Link>
        )}
        
        {/* Retry button when a retry handler is provided */}
        {onRetry && (
          <Button 
            onClick={onRetry} 
            className="mt-2"
            variant={type === 'limit' ? "outline" : "default"}
            size="sm"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        )}
      </div>
    </div>
  );
};