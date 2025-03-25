import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

export function OAuthSetupGuide() {
  const [isCopied, setIsCopied] = useState(false);
  
  const callbackUrl = `${window.location.origin}/auth/callback`;
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText(callbackUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="link" className="text-xs" size="sm">
          Need help setting up Google Auth?
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Configuring Google Authentication with Supabase</DialogTitle>
          <DialogDescription>
            Follow these steps to enable Google sign-in for your application
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Step 1: Create a project in Google Cloud Console</h3>
            <ol className="space-y-2 ml-6 list-decimal">
              <li>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center">Google Cloud Console <ExternalLink className="h-3 w-3 ml-1" /></a></li>
              <li>Create a new project or select an existing one</li>
              <li>Navigate to "APIs & Services" > "OAuth consent screen"</li>
              <li>Fill in the required information for your app</li>
              <li>Add the necessary scopes (email, profile)</li>
              <li>Add your test users if you're keeping the app in testing mode</li>
            </ol>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Step 2: Create OAuth credentials</h3>
            <ol className="space-y-2 ml-6 list-decimal">
              <li>Go to "APIs & Services" > "Credentials"</li>
              <li>Click "Create Credentials" > "OAuth client ID"</li>
              <li>Select "Web application" as the application type</li>
              <li>Add a name for your OAuth client</li>
              <li>Under "Authorized redirect URIs", add the following callback URL:</li>
              <div className="flex items-center space-x-2 bg-muted p-2 rounded-md">
                <code className="text-sm flex-1 break-all">{callbackUrl}</code>
                <Button variant="outline" size="sm" onClick={copyToClipboard}>
                  {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <li>Click "Create" and note down your Client ID and Client Secret</li>
            </ol>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Step 3: Configure Supabase Auth</h3>
            <ol className="space-y-2 ml-6 list-decimal">
              <li>Log in to your <a href="https://app.supabase.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center">Supabase dashboard <ExternalLink className="h-3 w-3 ml-1" /></a></li>
              <li>Select your project</li>
              <li>Go to "Authentication" > "Providers"</li>
              <li>Find "Google" in the list and click "Enable"</li>
              <li>Enter your Google Client ID and Client Secret from Step 2</li>
              <li>Save the configuration</li>
            </ol>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Step 4: Update environment variables</h3>
            <ol className="space-y-2 ml-6 list-decimal">
              <li>Make sure your application has the necessary Supabase environment variables:</li>
              <div className="bg-muted p-2 rounded-md">
                <code className="text-sm block">SUPABASE_URL=https://your-project-id.supabase.co</code>
                <code className="text-sm block">SUPABASE_KEY=your-anon-key</code>
              </div>
              <li>Restart your application if necessary</li>
            </ol>
          </div>
        </div>
        
        <DialogFooter>
          <Button type="button" onClick={() => window.open("https://supabase.com/docs/guides/auth/social-login/auth-google", "_blank")}>
            View Supabase Documentation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}