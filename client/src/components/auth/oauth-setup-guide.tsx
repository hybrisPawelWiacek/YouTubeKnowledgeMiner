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
          Need help setting up OAuth?
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Configuring OAuth with Supabase</DialogTitle>
          <DialogDescription>
            Follow these steps to enable third-party authentication for your application
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Step 1: Set up your OAuth provider</h3>
            <p>Each OAuth provider has its own setup process. The most common ones are:</p>
            <ul className="space-y-1 ml-6 list-disc">
              <li><a href="https://supabase.com/docs/guides/auth/social-login/auth-google" className="text-primary hover:underline inline-flex items-center">Google <ExternalLink className="h-3 w-3 ml-1" /></a></li>
              <li><a href="https://supabase.com/docs/guides/auth/social-login/auth-github" className="text-primary hover:underline inline-flex items-center">GitHub <ExternalLink className="h-3 w-3 ml-1" /></a></li>
              <li><a href="https://supabase.com/docs/guides/auth/social-login/auth-facebook" className="text-primary hover:underline inline-flex items-center">Facebook <ExternalLink className="h-3 w-3 ml-1" /></a></li>
              <li><a href="https://supabase.com/docs/guides/auth/social-login/auth-apple" className="text-primary hover:underline inline-flex items-center">Apple <ExternalLink className="h-3 w-3 ml-1" /></a></li>
            </ul>
            <p>For all providers, you will need to use the following callback URL:</p>
            <div className="flex items-center space-x-2 bg-muted p-2 rounded-md">
              <code className="text-sm flex-1 break-all">{callbackUrl}</code>
              <Button variant="outline" size="sm" onClick={copyToClipboard}>
                {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Step 2: Configure Supabase Auth</h3>
            <ol className="space-y-2 ml-6 list-decimal">
              <li>Log in to your <a href="https://app.supabase.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center">Supabase dashboard <ExternalLink className="h-3 w-3 ml-1" /></a></li>
              <li>Select your project</li>
              <li>Go to Authentication and then Providers</li>
              <li>Find your chosen provider in the list and click Enable</li>
              <li>Enter your Client ID and Client Secret from your provider</li>
              <li>Save the configuration</li>
            </ol>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Step 3: Update environment variables</h3>
            <ol className="space-y-2 ml-6 list-decimal">
              <li>Make sure your application has the necessary Supabase environment variables:</li>
              <div className="bg-muted p-2 rounded-md">
                <code className="text-sm block">SUPABASE_URL=https://your-project-id.supabase.co</code>
                <code className="text-sm block">SUPABASE_KEY=your-anon-key</code>
              </div>
              <li>These values can be found in your Supabase project settings under API</li>
              <li>Restart your application if necessary</li>
            </ol>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Step 4: Testing</h3>
            <ol className="space-y-2 ml-6 list-decimal">
              <li>Try signing in with your OAuth provider to ensure everything is working</li>
              <li>If you encounter issues, check the Supabase logs in your dashboard</li>
              <li>You may need to add test users if your OAuth app is in development/testing mode</li>
            </ol>
          </div>
        </div>
        
        <DialogFooter>
          <Button type="button" onClick={() => window.open("https://supabase.com/docs/guides/auth/social-login", "_blank")}>
            View Supabase Documentation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}