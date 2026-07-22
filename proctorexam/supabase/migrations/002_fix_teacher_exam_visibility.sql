-- Fix: Allow teachers and super_admins to view ALL exams
-- Run this in Supabase SQL Editor

-- Drop the restrictive teacher policy if it exists
DROP POLICY IF EXISTS "Teachers can manage own exams" ON exams;

-- Teachers and admins can VIEW all exams
CREATE POLICY "Teachers and admins can view all exams" ON exams
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE clerk_id = auth.uid()::text 
            AND role IN ('teacher', 'super_admin')
        )
    );

-- Teachers can only MANAGE (INSERT/UPDATE/DELETE) their own exams
CREATE POLICY "Teachers can manage own exams" ON exams
    FOR INSERT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE clerk_id = auth.uid()::text 
            AND id = created_by
        )
    );

CREATE POLICY "Teachers can update own exams" ON exams
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE clerk_id = auth.uid()::text 
            AND (id = created_by OR role = 'super_admin')
        )
    );

CREATE POLICY "Teachers can delete own exams" ON exams
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE clerk_id = auth.uid()::text 
            AND (id = created_by OR role = 'super_admin')
        )
    );
