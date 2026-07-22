-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (sync with Clerk)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role VARCHAR(20) CHECK (role IN ('super_admin', 'teacher', 'student')) DEFAULT 'student',
    name TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Exams table
CREATE TABLE exams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    created_by UUID REFERENCES users(id) ON DELETE CASCADE,
    duration_minutes INTEGER NOT NULL,
    deadline TIMESTAMP NOT NULL,
    result_publish_time TIMESTAMP NOT NULL,
    total_questions_pool INTEGER NOT NULL,
    questions_per_student INTEGER NOT NULL,
    passing_percentage INTEGER DEFAULT 40,
    shuffle_questions BOOLEAN DEFAULT true,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
    results_released BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Questions pool
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_answer INTEGER NOT NULL,
    difficulty VARCHAR(10) CHECK (difficulty IN ('easy', 'medium', 'hard')),
    marks INTEGER DEFAULT 1,
    is_common BOOLEAN DEFAULT false,
    category TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Student's personalized exam paper
CREATE TABLE student_exams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES users(id) ON DELETE CASCADE,
    exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
    question_ids UUID[] NOT NULL,
    status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'expired')),
    started_at TIMESTAMP,
    submitted_at TIMESTAMP,
    score INTEGER,
    percentage DECIMAL(5,2),
    tab_switch_count INTEGER DEFAULT 0,
    focus_alert_count INTEGER DEFAULT 0,
    teacher_message TEXT,
    socket_id TEXT,
    ip_address INET,
    device_fingerprint TEXT,
    UNIQUE(student_id, exam_id)
);

-- Student responses
CREATE TABLE responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_exam_id UUID REFERENCES student_exams(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id),
    selected_answer INTEGER,
    time_taken_seconds INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Proctoring events
CREATE TABLE proctoring_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_exam_id UUID REFERENCES student_exams(id),
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB,
    severity VARCHAR(10) DEFAULT 'low',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Teacher monitoring sessions
CREATE TABLE monitoring_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID REFERENCES users(id),
    exam_id UUID REFERENCES exams(id),
    active_student_id UUID,
    started_at TIMESTAMP DEFAULT NOW(),
    ended_at TIMESTAMP
);

-- Keep-alive table
CREATE TABLE keep_alive (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE proctoring_logs ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid()::text = clerk_id);

CREATE POLICY "Teachers and admins can view all users" ON users
    FOR SELECT USING (
        (SELECT role FROM users WHERE clerk_id = auth.uid()::text) IN ('teacher', 'super_admin')
    );

CREATE POLICY "Super admin can update roles" ON users
    FOR UPDATE USING (
        (SELECT role FROM users WHERE clerk_id = auth.uid()::text) = 'super_admin'
    );

-- Temporarily disable RLS on users to fix infinite recursion
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Exams policies
CREATE POLICY "Teachers can manage own exams" ON exams
    FOR ALL USING (
        created_by = (SELECT id FROM users WHERE clerk_id = auth.uid()::text) OR 
        EXISTS (SELECT 1 FROM users WHERE clerk_id = auth.uid()::text AND role = 'super_admin')
    );

CREATE POLICY "Students can view published exams" ON exams
    FOR SELECT USING (status = 'published' AND deadline > NOW());

-- Student exams policies
CREATE POLICY "Students can view own exams" ON student_exams
    FOR SELECT USING (student_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text));

CREATE POLICY "Teachers can view exam students" ON student_exams
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM exams e 
            JOIN users u ON u.clerk_id = auth.uid()::text
            WHERE e.id = student_exams.exam_id 
            AND (e.created_by = u.id OR u.role = 'super_admin')
        )
    );

CREATE POLICY "Results visible after publish time" ON student_exams
    FOR SELECT USING (
        (SELECT result_publish_time FROM exams WHERE id = student_exams.exam_id) <= NOW()
        OR student_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
        OR EXISTS (
            SELECT 1 FROM users WHERE clerk_id = auth.uid()::text AND role IN ('teacher', 'super_admin')
        )
    );

-- Questions policies
CREATE POLICY "Teachers manage exam questions" ON questions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM exams e 
            JOIN users u ON u.clerk_id = auth.uid()::text
            WHERE e.id = questions.exam_id AND e.created_by = u.id
        ) OR EXISTS (
            SELECT 1 FROM users WHERE clerk_id = auth.uid()::text AND role = 'super_admin'
        )
    );

-- Proctoring logs policies
CREATE POLICY "Teachers view proctoring logs" ON proctoring_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM student_exams se
            JOIN exams e ON e.id = se.exam_id
            JOIN users u ON u.clerk_id = auth.uid()::text
            WHERE se.id = proctoring_logs.student_exam_id
            AND (e.created_by = u.id OR u.role IN ('teacher', 'super_admin'))
        )
    );

-- Enable realtime
ALTER TABLE student_exams REPLICA IDENTITY FULL;
ALTER TABLE proctoring_logs REPLICA IDENTITY FULL;

-- Function to generate shuffled question paper
CREATE OR REPLACE FUNCTION generate_student_paper(
    p_student_id UUID,
    p_exam_id UUID
) RETURNS UUID AS $$
DECLARE
    v_paper_id UUID;
    v_common_questions UUID[];
    v_random_questions UUID[];
    v_all_questions UUID[];
    v_questions_per_student INTEGER;
    v_common_count INTEGER;
BEGIN
    SELECT questions_per_student INTO v_questions_per_student
    FROM exams WHERE id = p_exam_id;
    
    SELECT ARRAY_AGG(id) INTO v_common_questions
    FROM questions
    WHERE exam_id = p_exam_id AND is_common = true;
    
    v_common_count := COALESCE(array_length(v_common_questions, 1), 0);
    
    SELECT ARRAY_AGG(id) INTO v_random_questions
    FROM (
        SELECT id FROM questions
        WHERE exam_id = p_exam_id AND is_common = false
        ORDER BY RANDOM()
        LIMIT (v_questions_per_student - v_common_count)
    ) subq;
    
    v_all_questions := v_common_questions || v_random_questions;
    
    SELECT ARRAY_AGG(id ORDER BY RANDOM()) INTO v_all_questions
    FROM UNNEST(v_all_questions) AS id;
    
    INSERT INTO student_exams (student_id, exam_id, question_ids, status)
    VALUES (p_student_id, p_exam_id, v_all_questions, 'assigned')
    RETURNING id INTO v_paper_id;
    
    RETURN v_paper_id;
END;
$$ LANGUAGE plpgsql;