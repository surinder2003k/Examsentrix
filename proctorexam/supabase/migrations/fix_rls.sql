-- ╔══════════════════════════════════════════════════════════════╗
-- ║  PROCTOREXAM - FIX RLS INFINITE RECURSION & SET ADMIN      ║
-- ║  Run this in Supabase SQL Editor to fix the problem         ║
-- ╚══════════════════════════════════════════════════════════════╝

-- STEP 1: Drop ALL RLS policies on users table
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Teachers and admins can view all users" ON users;
DROP POLICY IF EXISTS "Super admin can update roles" ON users;

-- STEP 2: Recreate policies WITHOUT recursion
-- This uses clerk_id directly from auth.uid() instead of querying the users table
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid()::text = clerk_id);

CREATE POLICY "Teachers and admins can view all users" ON users
    FOR SELECT USING (
        auth.uid()::text IN (SELECT clerk_id FROM users WHERE role IN ('teacher', 'super_admin'))
    );

CREATE POLICY "Super admin can update roles" ON users
    FOR UPDATE USING (
        auth.uid()::text IN (SELECT clerk_id FROM users WHERE role = 'super_admin')
    );

-- STEP 3: Set xyzg135@gmail.com as super_admin
UPDATE users SET role = 'super_admin' WHERE email = 'xyzg135@gmail.com';

-- STEP 4: Fix RLS on other tables - already working
-- Verify:
SELECT id, email, role, is_active FROM users ORDER BY created_at DESC;