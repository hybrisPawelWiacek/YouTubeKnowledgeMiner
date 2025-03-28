/**
 * Forgot Password Form Component
 * 
 * This component provides a form for requesting a password reset.
 * It handles form validation, submission, loading states, and success messages.
 */

import { useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';

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

// Forgot password form schema
const forgotPasswordSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
});

// Type for forgot password form values
type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

// Props for the forgot password form component
interface ForgotPasswordFormProps {
  onSuccess?: () => void;
  onBackToLogin?: () => void;
  showTitle?: boolean;
  className?: string;
}

export function ForgotPasswordForm({
  onSuccess,
  onBackToLogin,
  showTitle = true,
  className = '',
}: ForgotPasswordFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { resetPassword } = useAuth();

  // Initialize form
  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  // Handle form submission
  const onSubmit = async (values: ForgotPasswordFormValues) => {
    setIsLoading(true);
    
    try {
      await resetPassword(values.email);
      
      // Clear the form
      form.reset();
      
      // Call success callback if provided
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      // Error handling is done in the useAuth hook
      console.error('Password reset request error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className={className}>
      {showTitle && (
        <CardHeader>
          {onBackToLogin ? (
            <div className="flex items-center">
              <Button 
                variant="ghost" 
                size="sm" 
                className="p-0 mr-2" 
                onClick={onBackToLogin}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <CardTitle>Reset Your Password</CardTitle>
            </div>
          ) : (
            <CardTitle className="text-center">Reset Your Password</CardTitle>
          )}
          <CardDescription className="text-center">
            Enter your email to receive a password reset link
          </CardDescription>
        </CardHeader>
      )}
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
              Enter your email address and we'll send you a link to reset your password.
            </p>
            
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="your.email@example.com" 
                      type="email"
                      autoComplete="email"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          
          <CardFooter className="flex flex-col space-y-2">
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Reset Link'
              )}
            </Button>
            
            {onBackToLogin && !showTitle && (
              <Button 
                variant="ghost" 
                className="w-full mt-2" 
                type="button"
                onClick={onBackToLogin}
              >
                Back to Login
              </Button>
            )}
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}