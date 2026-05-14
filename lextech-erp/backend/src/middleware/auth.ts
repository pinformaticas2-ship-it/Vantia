import { requireAuth as clerkRequireAuth } from '@clerk/express';

export const requireAuth = clerkRequireAuth();