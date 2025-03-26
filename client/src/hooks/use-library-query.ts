// If a userId is available, add it to the headers
  const headers: HeadersInit = {};
  if (userId) {
    // Ensure userId is sent as a number in string format
    headers['x-user-id'] = typeof userId === 'number' ? String(userId) : String(Number(userId));
  }