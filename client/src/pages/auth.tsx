import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useSupabase } from "@/hooks/use-supabase";
import { LoginForm } from "@/components/auth/login-form";
import { RegisterForm } from "@/components/auth/register-form";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { OAuthSetupGuide } from "@/components/auth/oauth-setup-guide";

export default function Auth() {
  const [activeTab, setActiveTab] = useState('login');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const { signInWithGoogle } = useSupabase();
  
  // Handle switching to forgot password tab
  const handleForgotPassword = () => {
    setActiveTab("forgot-password");
  };
  
  // Handle back to login from forgot password
  const handleBackToLogin = () => {
    setActiveTab("login");
  };
  
  // Handle login form success
  const handleLoginSuccess = () => {
    // Any additional logic on successful login
  };
  
  // Handle register form success
  const handleRegisterSuccess = () => {
    // After successful registration, switch to login tab
    setActiveTab("login");
  };
  
  // Handle forgot password form success
  const handleForgotPasswordSuccess = () => {
    // After sending reset email, switch to login tab
    setActiveTab("login");
  };
  
  // Handle Google authentication
  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
      // Redirect will be handled by the OAuth provider
    } catch (error) {
      console.error('Google sign in error:', error);
    } finally {
      // This might not execute immediately as the page will be redirected
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      
      <main className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md bg-zinc-900">
          <Tabs defaultValue="login" value={activeTab} onValueChange={setActiveTab}>
            <CardHeader>
              {activeTab === "forgot-password" ? (
                <CardTitle className="text-center">Reset Your Password</CardTitle>
              ) : (
                <>
                  <div className="flex justify-center mb-4">
                    <TabsList className="bg-zinc-800">
                      <TabsTrigger value="login">Login</TabsTrigger>
                      <TabsTrigger value="register">Register</TabsTrigger>
                    </TabsList>
                  </div>
                  <CardTitle className="text-center">YouTubeKnowledgeMiner</CardTitle>
                  <CardDescription className="text-center">
                    Mine knowledge from your YouTube videos
                  </CardDescription>
                </>
              )}
            </CardHeader>
            
            {/* Google sign-in button for login/register tabs only */}
            {activeTab !== "forgot-password" && (
              <CardContent>
                <Button 
                  variant="outline" 
                  className="w-full bg-white text-black hover:bg-gray-100 border-gray-300 flex items-center justify-center gap-2 h-10"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleLoading}
                >
                  {isGoogleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FcGoogle className="h-5 w-5" />
                  )}
                  <span>{isGoogleLoading ? "Signing in..." : "Sign in with Google"}</span>
                </Button>
                
                <div className="flex items-center my-4">
                  <Separator className="flex-grow" />
                  <span className="px-3 text-sm text-gray-500">OR</span>
                  <Separator className="flex-grow" />
                </div>
              </CardContent>
            )}
            
            <TabsContent value="login">
              <LoginForm 
                onSuccess={handleLoginSuccess}
                onForgotPassword={handleForgotPassword}
                showTitle={false}
              />
            </TabsContent>
            
            <TabsContent value="register">
              <RegisterForm 
                onSuccess={handleRegisterSuccess}
                onLoginClick={() => setActiveTab("login")}
                showTitle={false}
              />
            </TabsContent>
            
            <TabsContent value="forgot-password">
              <ForgotPasswordForm 
                onSuccess={handleForgotPasswordSuccess}
                onBackToLogin={handleBackToLogin}
                showTitle={false}
              />
            </TabsContent>
          </Tabs>
        </Card>
      </main>
      
      <Footer />
    </div>
  );
}