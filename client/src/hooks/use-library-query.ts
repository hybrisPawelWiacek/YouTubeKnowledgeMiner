// If a userId is available, add it to the headers
  const headers: HeadersInit = {};
  if (userId) {
    headers['x-user-id'] = String(userId);
  }