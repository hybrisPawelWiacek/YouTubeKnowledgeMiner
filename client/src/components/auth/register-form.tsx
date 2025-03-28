/**
 * Register Form Component
 * 
 * This component provides a form for user registration.
 * It handles form validation, submission, loading states, and error messages.
 */

import { useState } from 'react';
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
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

// Registration form schema
const registerSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  username: z.string().min(3, { message: "Username must be at least 3 characters" })
    .regex(/^[a-zA-Z0-9_]+$/, {
      message: "Username must contain only letters, numbers, and underscores"
    }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
  confirmPassword: z.string().min(6, { message: "Password must be at least 6 characters" }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

// Type for registration form values
type RegisterFormValues = z.infer<typeof registerSchema>;

// Props for the registration form component
interface RegisterFormProps {
  onSuccess?: () => void;
  onLoginClick?: () => void;
  showTitle?: boolean;
  className?: string;
}

export function RegisterForm({
  onSuccess,
  onLoginClick,
  showTitle = true,
  className = '',
}: RegisterFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();
  const { toast } = useToast();

  // Initialize form
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      username: '',
      password: '',
      confirmPassword: '',
    },
  });

  // Handle form submission
  const onSubmit = async (values: RegisterFormValues) => {
    setIsLoading(true);
    
    try {
      await register(values.email, values.username, values.password);
      
      // Clear the form
      form.reset();
      
      // Call success callback if provided
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      // Error is already handled in useAuth hook, but we can add specific handling here if needed
      console.error('Registration error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className={className}>
      {showTitle && (
        <CardHeader>
          <CardTitle className="text-center">Create an Account</CardTitle>
          <CardDescription className="text-center">
            Register to save your videos and access all features
          </CardDescription>
        </CardHeader>
      )}
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="email@example.com" 
                      type="email"
                      autoComplete="email"
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    We'll send a verification email to this address
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="johndoe" 
                      autoComplete="username"
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    You can use letters, numbers, and underscores
                  </FormDescription>
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
                      type="password" 
                      placeholder="••••••••" 
                      autoComplete="new-password"
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    At least 6 characters
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <Input 
                      type="password" 
                      placeholder="••••••••" 
                      autoComplete="new-password"
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
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </Button>
            
            {onLoginClick && (
              <div className="text-center text-sm pt-2">
                Already have an account?{' '}
                <Button 
                  variant="link" 
                  className="p-0 h-auto" 
                  type="button"
                  onClick={onLoginClick}
                >
                  Log in
                </Button>
              </div>
            )}
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}