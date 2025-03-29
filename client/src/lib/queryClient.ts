import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  customHeaders?: HeadersInit,
): Promise<Response> {
  // Add cache-busting for anonymous sessions
  let finalUrl = url;
  try {
    const { hasAnonymousSession } = await import('./anonymous-session');
    if (hasAnonymousSession()) {
      const urlObj = new URL(url, window.location.origin);
      urlObj.searchParams.set('_t', Date.now().toString());
      finalUrl = urlObj.toString();
    }
  } catch (error) {
    console.error('Error processing URL in apiRequest:', error);
  }

  const res = await fetch(finalUrl, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(customHeaders || {})
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    // Ensure we're not using cached responses for GET requests to anonymous APIs
    cache: method === 'GET' ? 'no-store' : 'default'
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Add anonymous session header if available
    const headers: HeadersInit = {};
    try {
      // Dynamically import to avoid circular dependencies
      const { getOrCreateAnonymousSessionId, hasAnonymousSession } = await import('./anonymous-session');
      if (hasAnonymousSession()) {
        const sessionId = getOrCreateAnonymousSessionId();
        headers['x-anonymous-session'] = sessionId;
      }
    } catch (error) {
      console.error('Error getting anonymous session for query:', error);
    }

    // Add a timestamp to avoid browser caching when using anonymous sessions
    const url = new URL(queryKey[0] as string, window.location.origin);
    
    // Add a cache-busting parameter for anonymous sessions
    const { hasAnonymousSession } = await import('./anonymous-session');
    if (hasAnonymousSession()) {
      url.searchParams.set('_t', Date.now().toString());
    }
    
    const res = await fetch(url.toString(), {
      credentials: "include",
      headers,
      // Ensure we're not using cached responses for anonymous sessions
      cache: hasAnonymousSession() ? 'no-store' : 'default'
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
