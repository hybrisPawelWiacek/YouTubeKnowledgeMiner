import { useSupabase } from "@supabase/auth-helpers-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Header() {
  const { user, session, supabaseClient } = useSupabase();
  const router = useRouter();
  const pathname = router.pathname;

  const { getLocalData } = useSupabase();
  const localData = getLocalData();
  const anonymousVideoCount = localData.videoCount || 0;
  const showVideoCounter = !user && anonymousVideoCount > 0;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <div className="mr-4 flex">
          <Link to="/" className="mr-6 flex items-center space-x-2">
            <Logo className="h-6 w-6" />
            <span className="hidden font-bold sm:inline-block">
              YouTube Buddy
            </span>
          </Link>
          <nav className="flex items-center space-x-6 text-sm font-medium">
            <Link
              to="/library"
              className={cn(
                "transition-colors hover:text-foreground/80 flex items-center",
                pathname === '/library' ? "text-foreground" : "text-foreground/60"
              )}
            >
              Library
              {showVideoCounter && (
                <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  {anonymousVideoCount}
                </span>
              )}
            </Link>
            {showVideoCounter && (
              <span className="text-xs text-muted-foreground">
                {anonymousVideoCount}/3 videos
              </span>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}