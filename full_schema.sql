-- ==========================================================
-- AllThatVision 통합 데이터베이스 스키마 & 테스트 데이터
-- 생성일: 2025-12-22
-- ==========================================================

-- 0. 확장 및 기본 함수
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 1. 테이블 생성
create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  group_no text not null check (group_no ~ '^[0-9]{4}$'),
  name text not null,
  school_type integer not null check (school_type in (1,2,3)) default 1,
  recognition_key text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  device_name text not null,
  sort_order integer,
  icon_path text
);

create table if not exists public.contents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  color_hex text not null default '#DBEAFE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_devices (
  content_id uuid not null references public.contents(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  primary key (content_id, device_id)
);

create table if not exists public.device_management (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  start_date date,
  end_date date,
  limited_period boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.school_contents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  content_id uuid not null references public.contents(id) on delete cascade,
  start_date date,
  end_date date,
  is_unlimited boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.school_devices (
  id uuid primary key default gen_random_uuid(),
  school_content_id uuid not null references public.school_contents(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  auth_key text not null unique,
  status text default 'active',
  memo text,
  created_at timestamptz not null default now()
);

create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  grade_number smallint not null,
  year smallint not null,
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  grade_id uuid not null references public.grades(id) on delete cascade,
  class_number smallint not null,
  class_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  year smallint not null,
  grade smallint not null check (grade >= 1 and grade <= 12),
  class_no smallint not null,
  student_no smallint not null,
  name text not null,
  gender text check (gender in ('M','F')),
  birth_date date,
  email text,
  height_cm numeric,
  weight_kg numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null check (role in ('admin', 'teacher', 'student')),
  birth_date date,
  school_id uuid references public.schools(id),
  class_id uuid references public.classes(id),
  student_number integer,
  granted_by uuid,
  granted_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operator_accounts (
  id uuid primary key default gen_random_uuid(),
  username varchar not null unique,
  password varchar not null,
  role text not null,
  school_id uuid references public.schools(id),
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.exercise_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  exercise_type text not null check (exercise_type in ('endurance','flexibility','strength')),
  year smallint not null,
  month smallint not null check (month between 1 and 12),
  avg_duration_seconds numeric,
  avg_accuracy numeric,
  avg_bpm numeric,
  avg_max_bpm numeric,
  avg_calories numeric,
  record_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exercise_ingest_events (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  recognition_key text not null,
  year smallint not null,
  grade smallint not null,
  class_no smallint not null,
  student_no smallint not null,
  exercise_type text not null,
  month smallint not null,
  created_at timestamptz not null default now()
);

-- 2. 인덱스 및 트리거
create index if not exists idx_schools_recognition_key on public.schools(recognition_key);
create index if not exists idx_device_mgmt_school_id on public.device_management(school_id);
create unique index if not exists idx_students_school_year_grade_classno_studentno on public.students(school_id, year, grade, class_no, student_no);
create unique index if not exists ux_exrec_student_year_month_type on public.exercise_records(student_id, year, month, exercise_type);
create unique index if not exists ux_ingest_idem_scope on public.exercise_ingest_events (idempotency_key, recognition_key, year, grade, class_no, student_no, exercise_type, month);

create trigger trg_students_set_updated_at before update on public.students for each row execute procedure public.set_updated_at();
create trigger trg_user_profiles_set_updated_at before update on public.user_profiles for each row execute procedure public.set_updated_at();
create trigger trg_exercise_records_set_updated_at before update on public.exercise_records for each row execute procedure public.set_updated_at();
create trigger trg_contents_set_updated_at before update on public.contents for each row execute procedure public.set_updated_at();

-- 3. 뷰(Views)
create or replace view public.student_details as
select s.*, sch.name as school_name
from public.students s
join public.schools sch on s.school_id = sch.id;

-- 4. RPC 함수 (배치 업서트 및 멱등성 처리)
create or replace function public.upsert_exercise_records_batch(p_items jsonb)
returns int
language plpgsql security definer set search_path = public
as $$
declare v_rows int := 0;
begin
  with input as (
    select (x->>'idempotency_key')::text as idempotency_key, (x->>'recognition_key')::text as recognition_key, (x->>'year')::smallint as year, (x->>'grade')::smallint as grade, (x->>'class_no')::smallint as class_no, (x->>'student_no')::smallint as student_no, (x->>'exercise_type')::text as exercise_type, (x->>'month')::smallint as month, (x->>'avg_duration_seconds')::numeric as d, (x->>'avg_accuracy')::numeric as a, (x->>'avg_bpm')::numeric as b, (x->>'avg_max_bpm')::numeric as mb, (x->>'avg_calories')::numeric as c
    from jsonb_array_elements(p_items) as x
  ),
  idem as (
    insert into public.exercise_ingest_events (idempotency_key, recognition_key, year, grade, class_no, student_no, exercise_type, month)
    select i.idempotency_key, i.recognition_key, i.year, i.grade, i.class_no, i.student_no, i.exercise_type, i.month from input i
    on conflict do nothing returning idempotency_key, recognition_key, year, grade, class_no, student_no, exercise_type, month
  ),
  filtered as (
    select i.* from input i join idem d using (idempotency_key, recognition_key, year, grade, class_no, student_no, exercise_type, month)
  ),
  keyed as (
    select recognition_key, year, grade, class_no, student_no, exercise_type, month, count(*) as n, sum(coalesce(d, 0)) as sum_d, sum(coalesce(a, 0)) as sum_a, sum(coalesce(b, 0)) as sum_b, sum(coalesce(mb, 0)) as sum_mb, sum(coalesce(c, 0)) as sum_c
    from filtered group by recognition_key, year, grade, class_no, student_no, exercise_type, month
  ),
  resolved as (
    select st.id as student_id, k.year, k.month, k.exercise_type, k.n, k.sum_d, k.sum_a, k.sum_b, k.sum_mb, k.sum_c
    from keyed k join public.schools s on s.recognition_key = k.recognition_key
    join public.students st on st.school_id = s.id and st.year = k.year and st.grade = k.grade and st.class_no = k.class_no and st.student_no = k.student_no
  ),
  upserted as (
    insert into public.exercise_records as er (student_id, exercise_type, year, month, avg_duration_seconds, avg_accuracy, avg_bpm, avg_max_bpm, avg_calories, record_count)
    select r.student_id, r.exercise_type, r.year, r.month, case when r.n > 0 then r.sum_d / r.n else null end, case when r.n > 0 then r.sum_a / r.n else null end, case when r.n > 0 then r.sum_b / r.n else null end, case when r.n > 0 then r.sum_mb / r.n else null end, case when r.n > 0 then r.sum_c / r.n else null end, r.n
    from resolved r
    on conflict (student_id, year, month, exercise_type)
    do update set
      avg_duration_seconds = ((coalesce(er.avg_duration_seconds,0) * er.record_count) + (excluded.avg_duration_seconds * excluded.record_count)) / (er.record_count + excluded.record_count),
      record_count = er.record_count + excluded.record_count,
      updated_at = now()
    returning 1
  )
  select count(*) into v_rows from upserted;
  return v_rows;
end;
$$;

-- 5. 테스트 데이터 (Seed)
do $$
declare
  v_school_id uuid;
begin
  -- 테스트 학교 생성
  insert into public.schools (group_no, name, school_type, recognition_key)
  values ('9001', '테스트초등학교', 1, 'TEST-9001')
  on conflict do nothing;

  select id into v_school_id from public.schools where recognition_key = 'TEST-9001' limit 1;

  -- 학생 20명 생성
  insert into public.students (school_id, year, grade, class_no, student_no, name, gender)
  select v_school_id, 2025, 1, 1, gs, lpad(gs::text, 2, '0') || '번 학생', (case when random() < 0.5 then 'M' else 'F' end)
  from generate_series(1, 20) as gs
  on conflict do nothing;

  -- 테스트용 마스터 기기 등록
  insert into public.devices (device_name, sort_order)
  values ('왕복오래달리기', 1), ('제자리멀리뛰기', 2), ('앉아윗몸앞으로굽히기', 3)
  on conflict do nothing;
end $$;

-- 6. 캐시 리로드
do $$ begin perform pg_notify('pgrst', 'reload schema'); exception when others then null; end $$;

