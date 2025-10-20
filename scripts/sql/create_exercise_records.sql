-- 운동기록관리 테이블 (exercise_records)
-- 요구사항: id(int4), student_id(int4), year(int2), category_type(int2), record_type(int2), 1월~12월 12개 컬럼
-- 인덱스: (student_id, year, category_type, record_type)

create table if not exists public.exercise_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  year smallint not null,
  category_type smallint not null,
  record_type smallint not null,
  m01 numeric,
  m02 numeric,
  m03 numeric,
  m04 numeric,
  m05 numeric,
  m06 numeric,
  m07 numeric,
  m08 numeric,
  m09 numeric,
  m10 numeric,
  m11 numeric,
  m12 numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.exercise_records is '학생 운동 기록 관리 테이블';
comment on column public.exercise_records.student_id is '학생 식별자 (uuid)';
comment on column public.exercise_records.year is '년도 (int2)';
comment on column public.exercise_records.category_type is '카테고리 타입 (smallint)';
comment on column public.exercise_records.record_type is '기록 타입 (smallint)';
comment on column public.exercise_records.m01 is '1월 기록';
comment on column public.exercise_records.m02 is '2월 기록';
comment on column public.exercise_records.m03 is '3월 기록';
comment on column public.exercise_records.m04 is '4월 기록';
comment on column public.exercise_records.m05 is '5월 기록';
comment on column public.exercise_records.m06 is '6월 기록';
comment on column public.exercise_records.m07 is '7월 기록';
comment on column public.exercise_records.m08 is '8월 기록';
comment on column public.exercise_records.m09 is '9월 기록';
comment on column public.exercise_records.m10 is '10월 기록';
comment on column public.exercise_records.m11 is '11월 기록';
comment on column public.exercise_records.m12 is '12월 기록';
comment on column public.exercise_records.created_at is '생성일시';
comment on column public.exercise_records.updated_at is '수정일시';

-- 조회 성능을 위한 복합 인덱스
create index if not exists idx_exercise_records_student_year_cat_rec
  on public.exercise_records(student_id, year, category_type, record_type);

-- PostgREST(Supabase API) 스키마 캐시 리로드
do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception when others then
  null;
end $$;


