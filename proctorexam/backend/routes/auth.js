import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { checkRole } from '../middleware/roleCheck.js';
import { createClerkClient } from '@clerk/backend';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || '';

// Sync Clerk user to Supabase after signup/login
router.post('/sync', async (req, res) => {
  const supabase = req.app.get('supabase');
  const { clerk_id, email, name } = req.body;

  if (!clerk_id || !email) {
    return res.status(400).json({ error: 'clerk_id and email required' });
  }

  try {
    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_id', clerk_id)
      .maybeSingle();

    if (existing) {
      // Update existing user - preserve role; elevate to super_admin if configured email
      const isSuperAdmin = SUPER_ADMIN_EMAIL && email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
      const role = isSuperAdmin ? 'super_admin' : existing.role;
      // Activate existing users on login — only new signups need approval
      const is_active = true;
      
      const { data, error } = await supabase
        .from('users')
        .update({ email, name, is_active, role })
        .eq('clerk_id', clerk_id)
        .select()
        .single();

      if (error) {
        console.error('Update error:', error);
        return res.json({ user: { ...existing, role, is_active }, isNew: false });
      }
      return res.json({ user: data, isNew: false });
    }

    // Create new user - assign super_admin role to configured email
    const isSuperAdmin = SUPER_ADMIN_EMAIL && email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
    const role = isSuperAdmin ? 'super_admin' : 'student';
    // New users are INACTIVE (pending verification) by default
    const is_active = isSuperAdmin ? true : false;

    // Check if email already exists (e.g. from seed data with a different clerk_id)
    const { data: existingByEmail } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (existingByEmail) {
      // Update the existing row with the real clerk_id
      const { data: updated, error: updErr } = await supabase
        .from('users')
        .update({ clerk_id, name: name || existingByEmail.name, role: isSuperAdmin ? 'super_admin' : existingByEmail.role, is_active: isSuperAdmin ? true : existingByEmail.is_active })
        .eq('email', email)
        .select()
        .single();
      if (updErr) console.error('Update existing email user error:', updErr);
      
      // Update Clerk metadata
      const finalUser = updated || existingByEmail;
      if (finalUser && finalUser.clerk_id) {
        try {
          await clerkClient.users.updateUserMetadata(finalUser.clerk_id, {
            publicMetadata: { role: finalUser.role }
          });
        } catch (clerkErr) {
          console.error('Clerk metadata update error (sync existing):', clerkErr);
        }
      }
      return res.json({ user: finalUser, isNew: false });
    }

    const { data, error } = await supabase
      .from('users')
      .insert({ clerk_id, email, name, role, is_active })
      .select()
      .single();

    if (error) {
      console.error('Insert error:', error);
      return res.json({ 
        user: { clerk_id, email, name, role, is_active, id: 'pending' }, 
        isNew: true 
      });
    }

    // Update Clerk metadata for new user
    if (data && data.clerk_id) {
      try {
        await clerkClient.users.updateUserMetadata(data.clerk_id, {
          publicMetadata: { role: data.role }
        });
      } catch (clerkErr) {
        console.error('Clerk metadata update error (sync new):', clerkErr);
      }
    }
    return res.json({ user: data, isNew: true });
  } catch (error) {
    console.error('Sync error:', error);
    const isSuperAdmin = SUPER_ADMIN_EMAIL && email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
    return res.json({ 
      user: { clerk_id, email, role: isSuperAdmin ? 'super_admin' : 'student', is_active: isSuperAdmin ? true : false }, 
      isNew: false 
    });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  return res.json({ user: req.user });
});

// Super admin - approve user (activate and assign role)
router.post('/approve-user', authenticate, checkRole('super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { email, role } = req.body;

  if (!email || !role) {
    return res.status(400).json({ error: 'Email and role required' });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .update({ is_active: true, role })
      .eq('email', email)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'User not found' });

    // Sync role changes back to Clerk publicMetadata
    if (data.clerk_id) {
      try {
        await clerkClient.users.updateUserMetadata(data.clerk_id, {
          publicMetadata: { role }
        });
      } catch (clerkErr) {
        console.error('Clerk metadata update error (approve):', clerkErr);
      }
    }

    return res.json({ user: data });
  } catch (error) {
    console.error('Approve user error:', error);
    return res.status(500).json({ error: 'Failed to approve user' });
  }
});

// Super admin - deny & remove user completely
router.post('/disallow-user', authenticate, checkRole('super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  // Don't allow removing the configured super admin
  if (SUPER_ADMIN_EMAIL && email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: 'Cannot remove super admin account' });
  }

  try {
    // Get the user's primary database ID and Clerk ID
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, clerk_id')
      .eq('email', email)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (user) {
      // 1. Fetch all student exams for this user
      const { data: exams } = await supabase
        .from('student_exams')
        .select('id')
        .eq('student_id', user.id);

      if (exams && exams.length > 0) {
        const examIds = exams.map(e => e.id);
        // 2. Cascade delete responses
        await supabase
          .from('responses')
          .delete()
          .in('student_exam_id', examIds);
      }

      // 3. Delete student exams
      await supabase
        .from('student_exams')
        .delete()
        .eq('student_id', user.id);

      // 4. Delete user account from Clerk (prevents auto-recreation on next sync)
      if (user.clerk_id) {
        try {
          await clerkClient.users.deleteUser(user.clerk_id);
        } catch (clerkErr) {
          console.error('Clerk deleteUser error:', clerkErr);
        }
      }

      // 5. Delete user from Supabase
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', user.id);

      if (deleteError) throw deleteError;
    }

    return res.json({ success: true, message: `User ${email} denied and fully removed` });
  } catch (error) {
    console.error('Deny user error:', error);
    return res.status(500).json({ error: 'Failed to deny user: ' + (error.message || error) });
  }
});

// Super admin - change user role (grant/revoke teacher, etc.)
router.post('/change-role', authenticate, checkRole('super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { email, role } = req.body;

  if (!email || !role) {
    return res.status(400).json({ error: 'Email and role required' });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .update({ role })
      .eq('email', email)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'User not found' });

    // Sync role changes back to Clerk publicMetadata
    if (data.clerk_id) {
      try {
        await clerkClient.users.updateUserMetadata(data.clerk_id, {
          publicMetadata: { role }
        });
      } catch (clerkErr) {
        console.error('Clerk metadata update error (change-role):', clerkErr);
      }
    }

    return res.json({ user: data });
  } catch (error) {
    console.error('Change role error:', error);
    return res.status(500).json({ error: 'Failed to change role' });
  }
});

// Super admin - grant teacher role (legacy fallback)
router.post('/grant-teacher', authenticate, checkRole('super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { email } = req.body;
  try {
    const { data, error } = await supabase.from('users').update({ role: 'teacher' }).eq('email', email).select().single();
    if (error) throw error;

    if (data && data.clerk_id) {
      try {
        await clerkClient.users.updateUserMetadata(data.clerk_id, {
          publicMetadata: { role: 'teacher' }
        });
      } catch (clerkErr) {
        console.error('Clerk metadata update error (grant-teacher):', clerkErr);
      }
    }

    return res.json({ user: data });
  } catch (e) {
    return res.status(500).json({ error: 'Failed' });
  }
});

// Super admin - revoke teacher role (legacy fallback)
router.post('/revoke-teacher', authenticate, checkRole('super_admin'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { email } = req.body;
  try {
    const { data, error } = await supabase.from('users').update({ role: 'student' }).eq('email', email).select().single();
    if (error) throw error;

    if (data && data.clerk_id) {
      try {
        await clerkClient.users.updateUserMetadata(data.clerk_id, {
          publicMetadata: { role: 'student' }
        });
      } catch (clerkErr) {
        console.error('Clerk metadata update error (revoke-teacher):', clerkErr);
      }
    }

    return res.json({ user: data });
  } catch (e) {
    return res.status(500).json({ error: 'Failed' });
  }
});

// Super admin - list all users
router.get('/users', authenticate, checkRole('super_admin', 'teacher'), async (req, res) => {
  const supabase = req.app.get('supabase');

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json({ users: data });
  } catch (error) {
    console.error('List users error:', error);
    return res.status(500).json({ error: 'Failed to list users' });
  }
});

export default router;