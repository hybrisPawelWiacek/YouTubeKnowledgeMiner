import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Auth from "@/pages/auth";
import Library from "@/pages/library";
import Explorer from "@/pages/explorer";
import VideoDetailPage from "@/pages/video/[id]";
import { SupabaseProvider, useSupabase } from "@/hooks/use-supabase";
import { ErrorProvider } from "@/contexts/error-context";
import ErrorBoundary from "@/components/ui/error-boundary";

// Auth callback handler that processes OAuth redirects
function AuthCallback() {
  const [, setLocation] = useLocation();
  const { supabase } = useSupabase();
  
  useEffect(() => {
    // Handle the OAuth callback
    if (supabase) {
      // Supabase will automatically handle the token exchange
      // Just redirect back to home page or profile page
      setLocation("/");
    }
  }, [supabase, setLocation]);
  
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">Processing Authentication...</h2>
        <p className="text-gray-600">Please wait while we complete your sign-in.</p>
      </div>
    </div>
  );
}

function Router() {
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/auth" component={Auth} />
        <Route path="/auth/callback" component={AuthCallback} />
        <Route path="/library" component={Library} />
        <Route path="/explorer" component={Explorer} />
        <Route path="/video/:id" component={VideoDetailPage} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SupabaseProvider>
        <ErrorProvider>
          <Router />
          <Toaster />
        </ErrorProvider>
      </SupabaseProvider>
    </QueryClientProvider>
  );
}

export default App;
