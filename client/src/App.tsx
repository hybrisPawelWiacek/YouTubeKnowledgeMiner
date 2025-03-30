import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Auth from "@/pages/auth";
import Library from "@/pages/library";
import Explorer from "@/pages/explorer";
import VideoDetailPage from "@/pages/video/[id]";
import { AppProvider } from "@/components/providers/app-provider";
import { useAuth } from "@/contexts/auth-context";
import { ErrorProvider } from "@/contexts/error-context";
import ErrorBoundary from "@/components/ui/error-boundary";

// Auth callback handler that processes OAuth redirects
function AuthCallback() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  
  useEffect(() => {
    // Redirect to home page when authentication is processed
    // This is a placeholder for the OAuth callback handling
    // The auth context will handle the actual authentication
    setLocation("/");
  }, [setLocation]);
  
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
    <AppProvider>
      <ErrorProvider>
        <Router />
      </ErrorProvider>
    </AppProvider>
  );
}

export default App;
