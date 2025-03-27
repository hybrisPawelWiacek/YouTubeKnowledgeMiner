import { createContext, useContext, useState, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';

// Error types for handling specific error scenarios
export type ErrorType = 
  | 'network'   // Network connectivity issues
  | 'session'   // Session related errors 
  | 'auth'      // Authentication errors
  | 'limit'     // Anonymous limit reached
  | 'validation' // Input validation errors
  | 'unknown';   // Fallback for unclassified errors

// Error details interface
export interface ErrorDetails {
  message: string;
  code?: string;
  details?: string;
  type: ErrorType;
}

// Error context interface
interface ErrorContextType {
  // Current error state
  error: ErrorDetails | null;
  // Set error with details
  setError: (error: ErrorDetails | null) => void;
  // Clear current error
  clearError: () => void;
  // Handle API errors with automatic type detection
  handleApiError: (error: any, defaultMessage?: string) => void;
  // Handle anonymous session specific errors
  handleAnonymousError: (error: any, defaultMessage?: string) => void;
}

// Create the context with default values
const ErrorContext = createContext<ErrorContextType>({
  error: null,
  setError: () => {},
  clearError: () => {},
  handleApiError: () => {},
  handleAnonymousError: () => {},
});

// Custom hook to use the error context
export const useError = () => useContext(ErrorContext);

// Error provider component
export const ErrorProvider = ({ children }: { children: ReactNode }) => {
  const [error, setError] = useState<ErrorDetails | null>(null);
  const { toast } = useToast();

  // Clear the current error
  const clearError = () => {
    setError(null);
  };

  // Determine error type from error code or message
  const getErrorType = (error: any): ErrorType => {
    // Check if error has a code property
    if (error?.code) {
      switch (error.code) {
        case 'SESSION_REQUIRED':
          return 'session';
        case 'AUTH_REQUIRED':
          return 'auth';
        case 'ANONYMOUS_LIMIT_REACHED':
          return 'limit';
        case 'VALIDATION_ERROR':
          return 'validation';
        default:
          break;
      }
    }

    // Check error message for network-related issues
    const message = error?.message || '';
    if (
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('offline') ||
      message.includes('failed to fetch')
    ) {
      return 'network';
    }

    // Default to unknown type
    return 'unknown';
  };

  // Handle API errors with toast notifications
  const handleApiError = (error: any, defaultMessage = 'An error occurred. Please try again.') => {
    console.error('API error:', error);

    // Extract error message
    let message = defaultMessage;
    let code: string | undefined;
    let details: string | undefined;

    if (error?.message) {
      message = error.message;
    }

    if (error?.code) {
      code = error.code;
    }

    if (error?.details) {
      details = error.details;
    }

    // Try to parse error from response
    if (error?.response) {
      try {
        const data = error.response.data;
        if (data?.message) {
          message = data.message;
        }
        if (data?.code) {
          code = data.code;
        }
        if (data?.details) {
          details = data.details;
        }
      } catch (e) {
        console.error('Error parsing API error response:', e);
      }
    }

    // Determine error type
    const type = getErrorType(error);

    // Set error state
    const errorDetails: ErrorDetails = {
      message,
      code,
      details,
      type,
    };
    
    setError(errorDetails);

    // Show toast notification based on error type
    switch (type) {
      case 'network':
        toast({
          title: 'Network Error',
          description: 'Please check your internet connection and try again.',
          variant: 'destructive',
        });
        break;
      case 'session':
        toast({
          title: 'Session Error',
          description: 'Your session has expired. Please refresh the page.',
          variant: 'destructive',
        });
        break;
      case 'auth':
        toast({
          title: 'Authentication Required',
          description: 'Please sign in to continue.',
          variant: 'destructive',
        });
        break;
      case 'limit':
        toast({
          title: 'Limit Reached',
          description: 'You have reached the maximum number of videos for anonymous users. Please sign up for an account to continue.',
          variant: 'destructive',
        });
        break;
      case 'validation':
        toast({
          title: 'Validation Error',
          description: message,
          variant: 'destructive',
        });
        break;
      default:
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
    }
  };

  // Handle anonymous session specific errors
  const handleAnonymousError = (error: any, defaultMessage = 'An error occurred with your session. Please refresh the page.') => {
    // Specialized error handling for anonymous session errors
    console.error('Anonymous session error:', error);
    
    let message = defaultMessage;
    let code: string | undefined;
    let details: string | undefined;
    
    if (error?.message) {
      message = error.message;
    }
    
    if (error?.code) {
      code = error.code;
    }
    
    if (error?.details) {
      details = error.details;
    }
    
    // Determine error type with focus on anonymous session issues
    const type = error?.code === 'ANONYMOUS_LIMIT_REACHED' ? 'limit' : 
                 error?.code === 'SESSION_REQUIRED' ? 'session' : 
                 getErrorType(error);
    
    // Set error state
    const errorDetails: ErrorDetails = {
      message,
      code,
      details,
      type,
    };
    
    setError(errorDetails);
    
    // Toast notification
    if (type === 'limit') {
      toast({
        title: 'Video Limit Reached',
        description: 'You can save up to 3 videos as a guest. Create an account to save unlimited videos and unlock all features.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Session Error',
        description: message,
        variant: 'destructive',
      });
    }
  };

  return (
    <ErrorContext.Provider
      value={{
        error,
        setError,
        clearError,
        handleApiError,
        handleAnonymousError,
      }}
    >
      {children}
    </ErrorContext.Provider>
  );
};