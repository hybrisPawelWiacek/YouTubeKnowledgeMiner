/**
 * Login Form Component
 * 
 * This component provides a form for user login.
 * It handles form validation, submission, loading states, and error messages.
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

// Login form schema
const loginSchema = z.object({
  emailOrUsername: z.string().min(3, { 
    message: "Please enter a valid email or username (min 3 characters)" 
  }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

// Type for login form values
type LoginFormValues = z.infer<typeof loginSchema>;

// Props for the login form component
interface LoginFormProps {
  onSuccess?: () => void;
  redirectTo?: string;
  showTitle?: boolean;
  className?: string;
  onForgotPassword?: () => void;
}

export function LoginForm({
  onSuccess,
  redirectTo = '/',
  showTitle = true,
  className = '',
  onForgotPassword
}: LoginFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();

  // Initialize form
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      emailOrUsername: '',
      password: '',
    },
  });

  // Handle form submission
  const onSubmit = async (values: LoginFormValues) => {
    setIsLoading(true);
    
    try {
      await login(values.emailOrUsername, values.password);
      
      // Call success callback if provided
      if (onSuccess) {
        onSuccess();
      } else {
        // Otherwise redirect to the specified path
        setLocation(redirectTo);
      }
    } catch (error: any) {
      // Error is already handled in useAuth hook, so we don't need to display it here
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className={className}>
      {showTitle && (
        <CardHeader>
          <CardTitle className="text-center">Log In</CardTitle>
          <CardDescription className="text-center">
            Enter your credentials to access your account
          </CardDescription>
        </CardHeader>
      )}
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="emailOrUsername"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email or Username</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="email@example.com or username" 
                      autoComplete="username"
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
                  <div className="flex justify-between items-center">
                    <FormLabel>Password</FormLabel>
                    {onForgotPassword && (
                      <Button 
                        variant="link" 
                        className="text-xs p-0 h-auto" 
                        type="button"
                        onClick={onForgotPassword}
                      >
                        Forgot password?
                      </Button>
                    )}
                  </div>
                  <FormControl>
                    <Input 
                      type="password" 
                      placeholder="••••••••" 
                      autoComplete="current-password"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          
          <CardFooter>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Logging in...
                </>
              ) : (
                'Log In'
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}