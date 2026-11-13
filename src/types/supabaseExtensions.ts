import type { Json, Database as BaseDatabase } from './supabase';

type PublicSchema = BaseDatabase['public'];
type ProfileTable = PublicSchema['Tables']['profiles'];
type UserPreferencesTable = PublicSchema['Tables']['user_preferences'];
type MinutesApprovalCommentsTable = PublicSchema['Tables']['minutes_approval_comments'];
type TasksTable = PublicSchema['Tables']['tasks'];

type ActionsV2TaskRow = TasksTable['Row'] & {
  start_date: string | null;
  progress_percent: number;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  tags: string[];
  project_id: string | null;
  personal_project_id: string | null;
  reminder_at: string | null;
  parent_task_id: string | null;
};

type ActionsV2TaskInsert = TasksTable['Insert'] & {
  start_date?: string | null;
  progress_percent?: number;
  estimated_minutes?: number | null;
  actual_minutes?: number | null;
  tags?: string[];
  project_id?: string | null;
  personal_project_id?: string | null;
  reminder_at?: string | null;
  parent_task_id?: string | null;
};

type ActionsV2TaskUpdate = TasksTable['Update'] & {
  start_date?: string | null;
  progress_percent?: number;
  estimated_minutes?: number | null;
  actual_minutes?: number | null;
  tags?: string[];
  project_id?: string | null;
  personal_project_id?: string | null;
  reminder_at?: string | null;
  parent_task_id?: string | null;
};

export type Database = Omit<BaseDatabase, 'public'> & {
  public: Omit<PublicSchema, 'Tables' | 'Functions'> & {
    Tables: Omit<PublicSchema['Tables'], 'profiles' | 'user_preferences' | 'minutes_approval_comments' | 'tasks' | 'minutes'> & {
      minutes: {
        Row: PublicSchema['Tables']['minutes']['Row'] & { admin_finalization: Json; admin_published_at: string | null; admin_published_by_user_id: string | null };
        Insert: PublicSchema['Tables']['minutes']['Insert'];
        Update: PublicSchema['Tables']['minutes']['Update'];
        Relationships: PublicSchema['Tables']['minutes']['Relationships'];
      };
      profiles: {
        Row: ProfileTable['Row'] & {
          is_security_admin: boolean;
          security_role_version: number;
          account_status: string;
          registration_source: 'legacy' | 'public_phone_registration' | 'admin_created' | 'imported';
        };
        Insert: ProfileTable['Insert'] & {
          is_security_admin?: boolean;
          security_role_version?: number;
          account_status?: string;
          registration_source?: 'legacy' | 'public_phone_registration' | 'admin_created' | 'imported';
        };
        Update: ProfileTable['Update'] & {
          is_security_admin?: boolean;
          security_role_version?: number;
          account_status?: string;
          registration_source?: 'legacy' | 'public_phone_registration' | 'admin_created' | 'imported';
        };
        Relationships: ProfileTable['Relationships'];
      };
      user_preferences: {
        Row: UserPreferencesTable['Row'] & {
          onboarding_version: number;
          onboarding_status: 'pending' | 'completed' | 'skipped';
          onboarding_completed_at: string | null;
          onboarding_skipped_at: string | null;
        };
        Insert: UserPreferencesTable['Insert'] & {
          onboarding_version?: number;
          onboarding_status?: 'pending' | 'completed' | 'skipped';
          onboarding_completed_at?: string | null;
          onboarding_skipped_at?: string | null;
        };
        Update: UserPreferencesTable['Update'] & {
          onboarding_version?: number;
          onboarding_status?: 'pending' | 'completed' | 'skipped';
          onboarding_completed_at?: string | null;
          onboarding_skipped_at?: string | null;
        };
        Relationships: UserPreferencesTable['Relationships'];
      };
      minutes_approval_comments: {
        Row: MinutesApprovalCommentsTable['Row'] & {
          decision_id: string | null;
        };
        Insert: MinutesApprovalCommentsTable['Insert'] & {
          decision_id?: string | null;
        };
        Update: MinutesApprovalCommentsTable['Update'] & {
          decision_id?: string | null;
        };
        Relationships: MinutesApprovalCommentsTable['Relationships'];
      };
      tasks: {
        Row: ActionsV2TaskRow;
        Insert: ActionsV2TaskInsert;
        Update: ActionsV2TaskUpdate;
        Relationships: TasksTable['Relationships'];
      };
      projects: {
        Row: { id: string; name: string; code: string | null; created_at: string };
        Insert: { id?: string; name: string; code?: string | null; created_at?: string };
        Update: { id?: string; name?: string; code?: string | null; created_at?: string };
        Relationships: [];
      };
      task_personal_projects: {
        Row: { id: string; owner_id: string; name: string; description: string | null; color: string | null; created_at: string };
        Insert: { id?: string; owner_id: string; name: string; description?: string | null; color?: string | null; created_at?: string };
        Update: { id?: string; owner_id?: string; name?: string; description?: string | null; color?: string | null; created_at?: string };
        Relationships: [];
      };
      task_checklist_items: {
        Row: { id: string; task_id: string; title: string; is_completed: boolean; sort_order: number; created_by: string; created_at: string; completed_at: string | null };
        Insert: { id?: string; task_id: string; title: string; is_completed?: boolean; sort_order?: number; created_by?: string; created_at?: string; completed_at?: string | null };
        Update: { id?: string; task_id?: string; title?: string; is_completed?: boolean; sort_order?: number; created_by?: string; created_at?: string; completed_at?: string | null };
        Relationships: [];
      };
      task_attachments: {
        Row: { id: string; task_id: string; file_name: string; file_path: string; file_size: number | null; mime_type: string | null; uploaded_by: string; created_at: string };
        Insert: { id?: string; task_id: string; file_name: string; file_path: string; file_size?: number | null; mime_type?: string | null; uploaded_by?: string; created_at?: string };
        Update: { id?: string; task_id?: string; file_name?: string; file_path?: string; file_size?: number | null; mime_type?: string | null; uploaded_by?: string; created_at?: string };
        Relationships: [];
      };
      task_dependencies: {
        Row: { id: string; task_id: string; depends_on_task_id: string; created_by: string; created_at: string };
        Insert: { id?: string; task_id: string; depends_on_task_id: string; created_by?: string; created_at?: string };
        Update: { id?: string; task_id?: string; depends_on_task_id?: string; created_by?: string; created_at?: string };
        Relationships: [];
      };
    };
    Functions: PublicSchema['Functions'] & {
      get_my_call_history: { Args: { p_limit?: number }; Returns: { id: string; caller_id: string; callee_id: string; created_at: string; duration_seconds: number }[] };
      clear_my_call_history: { Args: Record<string, never>; Returns: number };
      admin_correct_minutes: {
        Args: {
          p_minute_id: string; p_expected_updated_at: string; p_payload: Json;
          p_decisions: Json; p_deleted_decision_ids: string[]; p_deleted_external_participant_ids: string[];
          p_status: string; p_reason: string; p_signatories: Json; p_decision_states: Json;
        };
        Returns: { success: boolean; error_code?: string; minute_id?: string; updated_at?: string; code?: string; message?: string };
      };

      set_user_role_level: {
        Args: {
          p_target_user_id: string;
          p_role: 'user' | 'admin' | 'security_admin';
          p_change_reason?: string | null;
        };
        Returns: {
          ok?: boolean;
          error?: string;
          role?: 'user' | 'admin' | 'security_admin';
          new_version?: number;
          current_role?: 'user' | 'admin' | 'security_admin';
        };
      };
      get_my_app_bootstrap_v1: {
        Args: Record<PropertyKey, never>;
        Returns: {
          has_session?: boolean;
          access_level?: string;
          reason_code?: string;
          next_step?: string | null;
          user_id?: string | null;
          session_id?: string | null;
          account_status?: string | null;
          profile_completion_status?: string | null;
          mfa_required?: boolean;
          has_verified_totp?: boolean;
          current_aal?: string | null;
          is_admin?: boolean;
          permissions?: Record<string, boolean> | null;
        };
      };
      get_daily_report_scheduler_diagnostics: {
        Args: {
          p_run_limit?: number;
          p_sms_limit?: number;
        };
        Returns: unknown;
      };
      get_management_capabilities_v1: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      get_management_scope_people_v1: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      get_management_decisions_v2: {
        Args: {
          p_search?: string | null;
          p_status?: string | null;
          p_unit_id?: string | null;
          p_owner_user_id?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: unknown;
      };
      get_management_minutes_v1: {
        Args: {
          p_search?: string | null;
          p_status?: string | null;
          p_view?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: unknown;
      };
      get_management_decisions_v3: {
        Args: {
          p_search?: string | null;
          p_status?: string | null;
          p_unit_id?: string | null;
          p_owner_user_id?: string | null;
          p_view?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: unknown;
      };
      get_management_decision_detail_v1: {
        Args: { p_decision_id: string };
        Returns: unknown;
      };
      manage_management_decision_v1: {
        Args: {
          p_decision_id: string;
          p_expected_updated_at?: string | null;
          p_status?: string | null;
          p_progress_percent?: number | null;
          p_report_text?: string | null;
        };
        Returns: unknown;
      };
      get_management_tasks_v1: {
        Args: {
          p_search?: string | null;
          p_status?: string | null;
          p_assignee_user_id?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: unknown;
      };
      get_management_tasks_v2: {
        Args: {
          p_search?: string | null;
          p_status?: string | null;
          p_assignee_user_id?: string | null;
          p_view?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: unknown;
      };
      get_management_task_detail_v1: {
        Args: { p_task_id: string };
        Returns: unknown;
      };
      assign_meeting_owner_delegate: {
        Args: {
          p_meeting_id: string;
          p_delegate_user_id: string;
        };
        Returns: unknown;
      };
      decline_meeting_invitation_v2: {
        Args: {
          p_meeting_inbox_id: string;
        };
        Returns: unknown;
      };
      get_my_meeting_owner_delegations_v1: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      get_my_meeting_delegations_v1: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      get_my_calendar_meetings_v1: {
        Args: { p_from: string; p_to: string };
        Returns: PublicSchema['Tables']['meetings']['Row'][];
      };
      manage_management_task_v1: {
        Args: {
          p_task_id: string;
          p_status?: string | null;
          p_progress_percent?: number | null;
          p_priority?: string | null;
          p_due_date?: string | null;
          p_assignee_user_id?: string | null;
          p_note?: string | null;
        };
        Returns: unknown;
      };
    };
  };
};
