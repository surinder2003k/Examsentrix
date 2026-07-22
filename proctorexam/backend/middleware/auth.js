import { createClerkClient, verifyToken } from '@clerk/backend';
import dotenv from 'dotenv';
dotenv.config();

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export async function authenticate(req, res, next) {
  const supabase = req.app.get('supabase');
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify the JWT token from Clerk using the standalone verifyToken function
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY
    });
    const clerkId = payload.sub;

    if (!clerkId) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    // Get user from Supabase
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_id', clerkId)
      .maybeSingle();

    if (error) {
      console.error('Supabase user lookup error:', error);
    }

    if (!user) {
      // User not synced yet - try to get from Clerk and create
      try {
        const clerkUser = await clerkClient.users.getUser(clerkId);
        const email = clerkUser.emailAddresses?.[0]?.emailAddress || '';
        const name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || email;

        // Default new users to student role; super admin is set via separate admin flow
        const role = 'student';
        const is_active = true;

        const { data: newUser, error: insertError } = await supabase
          .from('users')
          .insert({ clerk_id: clerkId, email, name, role, is_active })
          .select()
          .single();

        if (insertError) {
          console.error('Auto-create user error:', insertError);
          // Cannot proceed safely without a valid Supabase user row.
          // The frontend SyncUser component will retry.
          return res.status(500).json({ error: 'Failed to create user session. Please retry.' });
        }

        req.user = newUser;
        req.clerkId = clerkId;
        return next();
      } catch (clerkError) {
        console.error('Clerk user fetch error:', clerkError);
        return res.status(401).json({ error: 'User not found' });
      }
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account pending verification or deactivated.' });
    }

    req.user = user;
    req.clerkId = clerkId;
    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}