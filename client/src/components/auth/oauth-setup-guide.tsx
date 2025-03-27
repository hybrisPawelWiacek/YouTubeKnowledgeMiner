import React, { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, HelpCircleIcon } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Component that provides a guide for Supabase OAuth configuration
 * Used in the auth page to help users or developers set up OAuth
 */
export function OAuthSetupGuide() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <AlertDialogTrigger asChild>
        <button 
          className="text-xs text-muted-foreground flex items-center gap-1 underline" 
          onClick={() => setIsOpen(true)}
        >
          <HelpCircleIcon size={12} /> OAuth Setup Instructions
        </button>
      </AlertDialogTrigger>
      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Setting Up Google OAuth Authentication</AlertDialogTitle>
            <AlertDialogDescription>
              To enable Google sign-in for your application, follow these steps to configure Supabase and Google Cloud Console.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="supabase-setup">
                <AccordionTrigger>Step 1: Supabase Project Setup</AccordionTrigger>
                <AccordionContent>
                  <ol className="list-decimal pl-5 space-y-2">
                    <li>Sign in to your Supabase account at <a href="https://app.supabase.io" target="_blank" rel="noopener noreferrer" className="text-primary underline">app.supabase.io</a></li>
                    <li>Create a new project or select your existing project</li>
                    <li>In the project dashboard, navigate to <strong>Authentication &gt; Providers</strong></li>
                    <li>Find the <strong>Google</strong> provider and toggle it to enabled</li>
                    <li>Leave the Client ID and Client Secret fields blank for now (you'll fill these later)</li>
                    <li>Copy your Supabase project URL and API Key (from Project Settings &gt; API) - you'll need these for your application</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="google-setup">
                <AccordionTrigger>Step 2: Google OAuth Credentials Setup</AccordionTrigger>
                <AccordionContent>
                  <ol className="list-decimal pl-5 space-y-2">
                    <li>Go to the <a href="https://console.developers.google.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline">Google Cloud Console</a></li>
                    <li>Create a new project or select an existing one</li>
                    <li>Navigate to <strong>APIs &amp; Services &gt; Credentials</strong></li>
                    <li>Click <strong>Create Credentials</strong> and select <strong>OAuth client ID</strong></li>
                    <li>If prompted, configure the OAuth consent screen:
                      <ul className="list-disc pl-5 mt-2">
                        <li>Select <strong>External</strong> user type (or Internal if applicable)</li>
                        <li>Enter your app name, user support email, and developer contact information</li>
                        <li>Add domains to the authorized domains list (including your Supabase project domain)</li>
                        <li>You can keep the app in "Testing" mode initially</li>
                      </ul>
                    </li>
                    <li>Back in the "Create OAuth client ID" screen:
                      <ul className="list-disc pl-5 mt-2">
                        <li>Select <strong>Web application</strong> as the Application type</li>
                        <li>Add a name for your OAuth client</li>
                        <li>Add <strong>Authorized JavaScript origins</strong>: <code className="bg-muted p-1 rounded">https://[YOUR_PROJECT_REF].supabase.co</code></li>
                        <li>Add <strong>Authorized redirect URIs</strong>: <code className="bg-muted p-1 rounded">https://[YOUR_PROJECT_REF].supabase.co/auth/v1/callback</code></li>
                        <li>Also add your local development URIs if needed</li>
                      </ul>
                    </li>
                    <li>Click <strong>Create</strong></li>
                    <li>A popup will display your <strong>Client ID</strong> and <strong>Client Secret</strong> - copy these values</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="connect-both">
                <AccordionTrigger>Step 3: Connect Google to Supabase</AccordionTrigger>
                <AccordionContent>
                  <ol className="list-decimal pl-5 space-y-2">
                    <li>Return to your Supabase project dashboard</li>
                    <li>Go to <strong>Authentication &gt; Providers &gt; Google</strong> again</li>
                    <li>Enter the <strong>Client ID</strong> and <strong>Client Secret</strong> you copied from Google Cloud Console</li>
                    <li>Save your changes</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="configure-app">
                <AccordionTrigger>Step 4: Configure Your Application</AccordionTrigger>
                <AccordionContent>
                  <ol className="list-decimal pl-5 space-y-2">
                    <li>Set the environment variables in your application:
                      <ul className="list-disc pl-5 mt-2">
                        <li><code className="bg-muted p-1 rounded">SUPABASE_URL</code>: Your Supabase project URL</li>
                        <li><code className="bg-muted p-1 rounded">SUPABASE_KEY</code>: Your Supabase anon/public API key</li>
                      </ul>
                    </li>
                    <li>If you're using this application, you can set these in the project's environment variables</li>
                    <li>Once configured, the Google Sign-In button will work automatically</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
          
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setIsOpen(false)}>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default OAuthSetupGuide;