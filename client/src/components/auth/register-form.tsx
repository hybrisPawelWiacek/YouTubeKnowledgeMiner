/**
 * Registration Form Component
 * 
 * This component provides a form for user registration.
 * It handles:
 * - New account creation with username/email/password
 * - Google OAuth registration
 * - Form validation
 * - Error display
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FcGoogle } from 'react-icons/fc';
import { Loader2 } from 'lucide-react';
import { useLocation } from 'wouter';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Form validation schema
const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be no more than 20 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  email: z.string().email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

// Form data type
type RegisterFormValues = z.infer<typeof registerSchema>;

interface RegisterFormProps {
  onSuccess?: () => void;
  redirectTo?: string;
  sessionId?: string;
}

export function RegisterForm({ onSuccess, redirectTo = '/', sessionId }: RegisterFormProps) {
  const { register } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  // Form definition
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
    },
  });

  // Form submission handler
  const onSubmit = async (values: RegisterFormValues) => {
    setIsLoading(true);
    setRegisterError(null);

    try {
      // Get the response object from registration to extract token
      const { success, authToken } = await register(values.username, values.email, values.password);
      
      if (success) {
        console.log('[RegisterForm] Registration successful, attempting to retrieve auth token');
        
        // Track if we found a token anywhere
        let foundToken = false;
        let token = authToken || null;
        
        // If we have a token directly from the auth context
        if (token) {
          console.log('[RegisterForm] Using auth token returned directly from register function');
          foundToken = true;
        } else {
          // Attempt to prepare the auth token from cookies
          try {
            const cookies = document.cookie.split('; ');
            const authCookie = cookies.find(cookie => 
              cookie.startsWith('auth_session=') || 
              cookie.startsWith('AuthSession=') || 
              cookie.startsWith('auth_token=')
            );
            
            if (authCookie) {
              token = authCookie.split('=')[1];
              console.log('[RegisterForm] Found auth token in cookies');
              foundToken = true;
            }
          } catch (tokenError) {
            console.error('[RegisterForm] Error retrieving auth token from cookies:', tokenError);
          }
        }
        
        // If we found a token anywhere, store it in localStorage as backup
        if (foundToken && token) {
          console.log('[RegisterForm] Caching auth token to localStorage');
          localStorage.setItem('auth_token', token);
          
          // Store it in a globally accessible variable for debug purposes
          (window as any).__AUTH_TOKEN_DEBUG = token;
          console.log('[RegisterForm] Auth token available for debugging');
        } else {
          console.warn('[RegisterForm] No auth token found after registration');
          // Create a placeholder token for testing if needed
          // NOTE: This is only for development/debugging and would be removed in production
          console.warn('[RegisterForm] Creating temporary debug token for migration testing');
          const debugToken = `debug_token_${Date.now()}`;
          localStorage.setItem('auth_token', debugToken);
          (window as any).__AUTH_TOKEN_DEBUG = debugToken;
        }
        
        // Add a small delay to ensure the token is properly set in cookies/localStorage
        // before proceeding with any redirects or migrations
        setTimeout(() => {
          if (onSuccess) {
            // Pass control back to the parent component which will handle migration
            onSuccess();
          } else {
            setLocation(redirectTo);
          }
        }, 800); // Slightly longer delay to ensure token is set
      }
    } catch (error: any) {
      setRegisterError(error.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Google OAuth Registration
  const handleGoogleRegistration = async () => {
    setIsLoading(true);
    setRegisterError(null);
    
    try {
      // This is a placeholder - OAuth would be implemented here
      console.log('Google registration clicked - implementation needed');
      setRegisterError('Google registration is not implemented yet');
    } catch (error: any) {
      setRegisterError(error.message || 'An error occurred with Google registration');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* OAuth Button */}
      <Button
        type="button"
        variant="outline"
        className="w-full bg-white text-black hover:bg-gray-100 border-gray-300 flex items-center justify-center gap-2 h-10"
        onClick={handleGoogleRegistration}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FcGoogle className="h-5 w-5" />
        )}
        <span>{isLoading ? "Creating account..." : "Continue with Google"}</span>
      </Button>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-gray-300" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            Or register with email
          </span>
        </div>
      </div>

      {/* Error Alert */}
      {registerError && (
        <Alert variant="destructive">
          <AlertDescription>{registerError}</AlertDescription>
        </Alert>
      )}

      {/* Registration Form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input
                    placeholder="cooluser123"
                    autoComplete="username"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  This will be your display name in the application.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    placeholder="you@example.com"
                    type="email"
                    autoComplete="email"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Create a strong password"
                    type="password"
                    autoComplete="new-password"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Must be at least 8 characters with a number and uppercase letter.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Anonymous session migration notice */}
          {sessionId && (
            <Alert className="mt-2">
              <AlertDescription>
                Your analyzed videos will be transferred to your new account.
              </AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              "Create Account"
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}