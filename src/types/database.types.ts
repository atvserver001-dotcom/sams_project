// AllThatVision 학교 운동 관리 시스템
// Supabase Database Types

export type UserRole = 'admin' | 'teacher' | 'student';
export type OperatorRole = 'admin' | 'school';
export type Gender = 'M' | 'F';

export type SchoolType = 1 | 2 | 3; // 1:초등학교, 2:중학교, 3:고등학교

export type ExerciseType = 
  | 'endurance'    // 지구력
  | 'flexibility'  // 유연성
  | 'strength';    // 근력

// ====================================
// 데이터베이스 테이블 타입
// ====================================

export interface School {
  id: string;
  group_no: string; // 4자리 숫자 문자열 (도메인 PK), 실제 DB PK는 id(uuid)
  name: string;
  school_type: SchoolType;
  device_ids?: string[]; // 레거시 환경 호환용 (존재하지 않을 수 있음)
  recognition_key: string;
  created_at: string;
}

export interface Device {
  id: string;
  device_name: string;
  sort_order?: number;
  page?: boolean; // 운영툴 메뉴 표시 여부
  icon_path?: string | null; // Supabase Storage 경로 (예: device-icons/devices/{id}/...)
}

export interface DeviceManagement {
  id: string;
  school_id: string; // schools.id FK
  device_id: string; // devices.id FK
  start_date?: string | null; // YYYY-MM-DD
  end_date?: string | null;
  limited_period: boolean;
  created_at: string;
}

export interface Student {
  id: string;
  school_id: string;
  year: number; // 학년도 (예: 2025)
  grade: number; // 학년 (1-12)
  class_no: number; // 학반
  student_no: number; // 학번 (반 내 번호)
  name: string; // 이름
  gender?: Gender | null; // 성별 (M/F)
  birth_date?: string | null; // YYYY-MM-DD
  email?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  notes?: string | null; // 특이사항
  created_at: string;
  updated_at: string;
}

export interface Grade {
  id: string;
  school_id: string;
  grade_number: number; // 1-12
  year: number; // 2025, 2026 등
  created_at: string;
}

export interface Class {
  id: string;
  grade_id: string;
  class_number: number;
  class_name?: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  birth_date?: string;
  school_id?: string;
  class_id?: string;
  student_number?: number;
  granted_by?: string;
  granted_at?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 폐기: 레거시 기록 단건 테이블 타입 (현재 프로젝트에선 사용하지 않음)
export interface ExerciseRecord {
  id: string;
  student_id: string;
  exercise_type: ExerciseType; // 'endurance' | 'flexibility' | 'strength'
  year: number; // 연도
  month: number; // 1-12
  avg_duration_seconds: number | null; // 평균 운동시간(초)
  avg_accuracy: number | null; // 평균 정확도(%)
  avg_bpm: number | null; // 평균 심박수
  avg_max_bpm: number | null; // 최대 심박 평균
  avg_calories: number | null; // 평균 칼로리(kcal)
  record_count: number; // 월 내 집계 건수
  created_at: string;
  updated_at: string;
}

export interface PermissionLog {
  id: string;
  grantor_id?: string;
  grantee_id: string;
  role_granted: UserRole;
  action: 'grant' | 'revoke' | 'update';
  created_at: string;
}

// 운영 계정 테이블 타입
export interface OperatorAccount {
  id: string;
  username: string;
  password: string; // 요구사항상 평문 저장
  role: OperatorRole;
  school_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ====================================
// 뷰(View) 타입
// ====================================

export interface StudentDetail {
  id: string;
  email: string;
  full_name: string;
  student_number?: number;
  class_number?: number;
  grade_number?: number;
  year?: number;
  school_name?: string;
  school_id?: string;
  is_active: boolean;
}

export interface ExerciseStatistics {
  user_id: string;
  full_name: string;
  student_number?: number;
  total_exercises: number;
  total_duration_minutes: number;
  overall_avg_heart_rate?: number;
  peak_heart_rate?: number;
  first_exercise_date?: string;
  last_exercise_date?: string;
}

// ====================================
// 조인된 데이터 타입
// ====================================

export interface ExerciseRecordWithUser extends ExerciseRecord {
  user_profiles?: UserProfile;
}

export interface ExerciseRecordWithDetails extends ExerciseRecord {
  user_profiles?: {
    full_name: string;
    student_number?: number;
    class_id?: string;
  };
  classes?: {
    class_number: number;
    class_name?: string;
  };
  grades?: {
    grade_number: number;
    year: number;
  };
  schools?: {
    name: string;
  };
}

// Supabase JSON 타입 정의 (RPC 인자 등)
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface UserProfileWithRelations extends UserProfile {
  schools?: School;
  classes?: Class & {
    grades?: Grade;
  };
}

// ====================================
// API 요청/응답 타입
// ====================================

export interface CreateExerciseRecordDTO {
  exercise_type: ExerciseType;
  exercise_name: string;
  exercise_date: string;
  exercise_duration: number;
  min_heart_rate?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  notes?: string;
}

export interface CreateStudentDTO {
  email: string;
  full_name: string;
  class_id: string;
  student_number: number;
}

export interface CreateTeacherDTO {
  email: string;
  full_name: string;
  school_id: string;
}

export interface UpdateUserProfileDTO {
  full_name?: string;
  class_id?: string;
  student_number?: number;
  is_active?: boolean;
}

export interface GrantRoleDTO {
  email: string;
  full_name: string;
  role: UserRole;
  school_id?: string;
  class_id?: string;
  student_number?: number;
}

// ====================================
// 필터 및 쿼리 타입
// ====================================

export interface ExerciseRecordFilters {
  user_id?: string;
  school_id?: string;
  class_id?: string;
  exercise_type?: ExerciseType;
  date_from?: string;
  date_to?: string;
}

export interface UserProfileFilters {
  role?: UserRole;
  school_id?: string;
  class_id?: string;
  is_active?: boolean;
}

// ====================================
// 통계 및 집계 타입
// ====================================

export interface HeartRateZone {
  zone: 'rest' | 'light' | 'moderate' | 'hard' | 'maximum';
  min_bpm: number;
  max_bpm: number;
  percentage: number;
}

export interface ExerciseSummary {
  total_exercises: number;
  total_duration: number;
  avg_duration: number;
  most_common_type: ExerciseType;
  avg_heart_rate: number;
  total_by_type: Record<ExerciseType, number>;
}

export interface ClassStatistics {
  class_id: string;
  class_number: number;
  grade_number: number;
  total_students: number;
  active_students: number;
  total_exercises: number;
  avg_exercises_per_student: number;
  total_duration_minutes: number;
  avg_heart_rate: number;
}

export interface SchoolStatistics {
  school_id: string;
  school_name: string;
  total_students: number;
  total_teachers: number;
  total_classes: number;
  total_exercises: number;
  avg_exercises_per_student: number;
  total_duration_hours: number;
}

// ====================================
// Supabase Database 타입 (자동 생성)
// ====================================

export interface Database {
  public: {
    Tables: {
      schools: {
        Row: School;
        Insert: {
          group_no: string;
          name: string;
          school_type: SchoolType;
          recognition_key: string;
          device_ids?: string[];
        };
        Update: Partial<{
          group_no: string;
          name: string;
          school_type: SchoolType;
          recognition_key: string;
          device_ids?: string[];
        }>;
      };
      devices: {
        Row: Device;
        Insert: Omit<Device, 'id'>;
        Update: Partial<Device>;
      };
      device_management: {
        Row: DeviceManagement;
        Insert: {
          school_id: string;
          device_id: string;
          start_date?: string | null;
          end_date?: string | null;
          limited_period?: boolean; // DB default false
        };
        Update: Partial<{
          school_id: string;
          device_id: string;
          start_date?: string | null;
          end_date?: string | null;
          limited_period?: boolean;
        }>;
      };
      grades: {
        Row: Grade;
        Insert: Omit<Grade, 'id' | 'created_at'>;
        Update: Partial<Omit<Grade, 'id' | 'created_at'>>;
      };
      classes: {
        Row: Class;
        Insert: Omit<Class, 'id' | 'created_at'>;
        Update: Partial<Omit<Class, 'id' | 'created_at'>>;
      };
      user_profiles: {
        Row: UserProfile;
        Insert: Omit<UserProfile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<UserProfile, 'id' | 'created_at'>>;
      };
      exercise_records: {
        Row: ExerciseRecord;
        Insert: Omit<ExerciseRecord, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ExerciseRecord, 'id' | 'created_at'>>;
      };
      permission_logs: {
        Row: PermissionLog;
        Insert: Omit<PermissionLog, 'id' | 'created_at'>;
        Update: never;
      };
      operator_accounts: {
        Row: OperatorAccount;
        Insert: Omit<OperatorAccount, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<OperatorAccount, 'id' | 'created_at'>>;
      };
      students: {
        Row: Student;
        Insert: Omit<Student, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Student, 'id' | 'created_at'>>;
      };
    };
    Views: {
      student_details: {
        Row: StudentDetail;
      };
      exercise_statistics: {
        Row: ExerciseStatistics;
      };
    };
    Functions: {
      upsert_exercise_record_by_key_idem: {
        Args: {
          p_idempotency_key: string
          p_recognition_key: string
          p_year: number
          p_grade: number
          p_class_no: number
          p_student_no: number
          p_exercise_type: ExerciseType
          p_month: number
          p_avg_duration_seconds: number | null
          p_avg_accuracy: number | null
          p_avg_bpm: number | null
          p_avg_max_bpm: number | null
          p_avg_calories: number | null
        }
        Returns: boolean
      }
      upsert_exercise_records_batch: {
        Args: {
          p_items: Json
        }
        Returns: number
      }
    };
    Enums: {
      user_role: UserRole;
      exercise_type: ExerciseType;
      operator_role: OperatorRole;
    };
  };
}

