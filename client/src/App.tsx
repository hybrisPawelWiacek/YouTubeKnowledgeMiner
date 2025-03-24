import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Auth from "@/pages/auth";
import Library from "@/pages/library";
import VideoDetailPage from "@/pages/video/[id]";
import { SupabaseProvider } from "@/hooks/use-supabase";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/auth" component={Auth} />
      <Route path="/library" component={Library} />
      <Route path="/video/:id" component={VideoDetailPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SupabaseProvider>
        <Router />
        <Toaster />
      </SupabaseProvider>
    </QueryClientProvider>
  );
}

export default App;
