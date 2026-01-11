-- ==========================================
-- Supabase Schema Export (public schema)
-- Project: SAMS_TEST (qrnhzzagyhrhrtxrtowt)
-- Generated: 2026-01-11
-- ==========================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

-- 2. FUNCTIONS
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_exercise_record_by_key(p_recognition_key text, p_year smallint, p_grade smallint, p_class_no smallint, p_student_no smallint, p_exercise_type text, p_month smallint, p_avg_duration_seconds numeric, p_avg_accuracy numeric, p_avg_bpm numeric, p_avg_max_bpm numeric, p_avg_calories numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_school_id  uuid;
  v_student_id uuid;
begin
  -- 1) 학교 확인
  select s.id into v_school_id
  from public.schools s
  where s.recognition_key = p_recognition_key
  limit 1;

  if v_school_id is null then
    raise exception 'invalid recognition_key';
  end if;

  -- 2) 학생 확인
  select st.id into v_student_id
  from public.students st
  where st.school_id = v_school_id
    and st.year = p_year
    and st.grade = p_grade
    and st.class_no = p_class_no
    and st.student_no = p_student_no
  limit 1;

  if v_student_id is null then
    -- 필요시 여기서 학생 자동 생성 로직 추가 가능
    raise exception 'student not found';
  end if;

  -- 3) upsert (student_id + year + month + exercise_type 유니크 키 가정)
  insert into public.exercise_records (
    student_id, year, month, exercise_type,
    avg_duration_seconds, avg_accuracy, avg_bpm, avg_max_bpm, avg_calories,
    record_count
  )
  values (
    v_student_id, p_year, p_month, p_exercise_type,
    p_avg_duration_seconds, p_avg_accuracy, p_avg_bpm, p_avg_max_bpm, p_avg_calories,
    1
  )
  on conflict (student_id, year, month, exercise_type)
  do update set
    avg_duration_seconds = (exercise_records.avg_duration_seconds * exercise_records.record_count + excluded.avg_duration_seconds) / (exercise_records.record_count + 1),
    avg_accuracy = (exercise_records.avg_accuracy * exercise_records.record_count + excluded.avg_accuracy) / (exercise_records.record_count + 1),
    avg_bpm = (exercise_records.avg_bpm * exercise_records.record_count + excluded.avg_bpm) / (exercise_records.record_count + 1),
    avg_max_bpm = (exercise_records.avg_max_bpm * exercise_records.record_count + excluded.avg_max_bpm) / (exercise_records.record_count + 1),
    avg_calories = (exercise_records.avg_calories * exercise_records.record_count + excluded.avg_calories) / (exercise_records.record_count + 1),
    record_count = exercise_records.record_count + 1,
    updated_at = now();

  return v_student_id;
end;
$function$;

-- 3. TABLES (Dependencies Order)
-- ------------------------------------------

-- Table: schools
CREATE TABLE IF NOT EXISTS public.schools (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    group_no text CHECK (group_no ~ '^[0-9]{4}$'),
    name text,
    school_type integer DEFAULT 1 CHECK (school_type = ANY (ARRAY[1, 2, 3])),
    recognition_key text,
    created_at timestamp with time zone DEFAULT now()
);

-- Table: devices
CREATE TABLE IF NOT EXISTS public.devices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    device_name text,
    sort_order integer,
    icon_path text
);

-- Table: contents
CREATE TABLE IF NOT EXISTS public.contents (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text,
    description text,
    created_at timestamp with time zone DEFAULT now()
);

-- Table: operator_accounts
CREATE TABLE IF NOT EXISTS public.operator_accounts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid REFERENCES public.schools(id),
    username text UNIQUE,
    password_hash text,
    email text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Table: grades
CREATE TABLE IF NOT EXISTS public.grades (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid REFERENCES public.schools(id),
    grade_name text,
    sort_order integer
);

-- Table: classes
CREATE TABLE IF NOT EXISTS public.classes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    grade_id uuid REFERENCES public.grades(id),
    class_name text,
    sort_order integer
);

-- Table: students
CREATE TABLE IF NOT EXISTS public.students (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid REFERENCES public.schools(id),
    year smallint,
    grade smallint,
    class_no smallint,
    student_no smallint,
    name text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Table: user_profiles
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid REFERENCES public.schools(id),
    student_id uuid REFERENCES public.students(id),
    profile_data jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Table: exercise_records
CREATE TABLE IF NOT EXISTS public.exercise_records (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id uuid REFERENCES public.students(id),
    year smallint,
    month smallint,
    exercise_type text,
    avg_duration_seconds numeric,
    avg_accuracy numeric,
    avg_bpm numeric,
    avg_max_bpm numeric,
    avg_calories numeric,
    record_count integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Table: school_contents
CREATE TABLE IF NOT EXISTS public.school_contents (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid REFERENCES public.schools(id),
    content_id uuid REFERENCES public.contents(id),
    is_active boolean DEFAULT true
);

-- Table: content_devices
CREATE TABLE IF NOT EXISTS public.content_devices (
    content_id uuid REFERENCES public.contents(id),
    device_id uuid REFERENCES public.devices(id),
    PRIMARY KEY (content_id, device_id)
);

-- Table: device_management
CREATE TABLE IF NOT EXISTS public.device_management (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid REFERENCES public.schools(id),
    device_id uuid REFERENCES public.devices(id),
    serial_number text,
    status text
);

-- Table: school_devices
CREATE TABLE IF NOT EXISTS public.school_devices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id uuid REFERENCES public.schools(id),
    device_id uuid REFERENCES public.devices(id),
    auth_key text UNIQUE,
    nickname text
);

-- Table: school_device_pages
CREATE TABLE IF NOT EXISTS public.school_device_pages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    school_device_id uuid REFERENCES public.school_devices(id),
    page_name text,
    sort_order integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Table: school_device_page_blocks
CREATE TABLE IF NOT EXISTS public.school_device_page_blocks (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    page_id uuid REFERENCES public.school_device_pages(id),
    type text CHECK (type = ANY (ARRAY['text'::text, 'image'::text])),
    subtitle text,
    body text,
    sort_order integer DEFAULT 1,
    image_name text,
    image_original_path text,
    image_thumb_path text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 4. INDEXES
-- ------------------------------------------
CREATE INDEX idx_schools_recognition_key ON public.schools USING btree (recognition_key);
CREATE INDEX idx_device_mgmt_school_id ON public.device_management USING btree (school_id);
CREATE UNIQUE INDEX idx_students_school_year_grade_classno_studentno ON public.students USING btree (school_id, year, grade, class_no, student_no);
CREATE UNIQUE INDEX idx_exercise_records_unique ON public.exercise_records USING btree (student_id, year, month, exercise_type);
CREATE INDEX idx_school_device_pages_sort ON public.school_device_pages USING btree (school_device_id, sort_order);
CREATE INDEX idx_school_device_page_blocks_page_id ON public.school_device_page_blocks USING btree (page_id);
CREATE INDEX idx_school_device_page_blocks_sort ON public.school_device_page_blocks USING btree (page_id, sort_order);

-- 5. TRIGGERS
-- ------------------------------------------

CREATE TRIGGER trg_operator_accounts_set_updated_at BEFORE UPDATE ON public.operator_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_exercise_records_set_updated_at BEFORE UPDATE ON public.exercise_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_students_set_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_profiles_set_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER update_operator_accounts_updated_at BEFORE UPDATE ON public.operator_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_school_device_pages_set_updated_at BEFORE UPDATE ON public.school_device_pages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_school_device_page_blocks_set_updated_at BEFORE UPDATE ON public.school_device_page_blocks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
