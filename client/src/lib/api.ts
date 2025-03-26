export async function apiRequest(
  method: string,
  url: string,
  data?: any,
  headers?: HeadersInit
): Promise<Response> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    credentials: 'include',
  };

  // Add auth header if user is authenticated
  const { session } = useAuthStore.getState();
  if (session?.user) {
    // Ensure user ID is sent as a number in string format
    const userId = session.user.id;
    (options.headers as Record<string, string>)['x-user-id'] = typeof userId === 'number' ? 
      String(userId) : String(Number(userId));
  }

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || response.statusText);
    }
    return response;
  } catch (error) {
    console.error('API request failed:', error);
    throw error; // Re-throw the error to be handled by the caller
  }
}