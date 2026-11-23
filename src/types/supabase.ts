export type Database = {
  public: {
    Tables: {
      // ─── Core: Meetings ──────────────────────────────────────────────────
      meetings: {
        Row: {
          id: string;
          subject: string;
          request_date: string;
          request_local_date: string | null;
          duration: string;
          location: string;
          representative: string;
          phone: string;
          notes: string | null;
          priority: 'high' | 'medium' | 'low';
          status: 'open' | 'closed';
          status_type: 'requested' | 'approved' | 'rejected';
          created_at: string;
          user_id: string;
          guest_emails: string[] | null;
          start_time: string | null;
          end_time: string | null;
          archived_participant_ids: string[] | null;
          calendar_id: string | null;
          repeat_type: string | null;
          repeat_interval: number | null;
          repeat_end_date: string | null;
          repeat_weekday: number | null;
          is_online: boolean | null;
          conference_room_id: string | null;
          members_only: boolean | null;
          meeting_manager: string | null;
          participant_user_ids: string[] | null;
          reminder_minutes: number | null;
          notify_users: string[] | null;
          series_id: string | null;
          external_informees: string[];
          send_sms: boolean | null;
          shared_count: number | null;
          external_participants: any[] | null;
        };
        Insert: {
          id?: string;
          subject: string;
          request_date: string;
          duration: string;
          location: string;
          representative: string;
          phone: string;
          notes?: string | null;
          priority: 'high' | 'medium' | 'low';
          status?: 'open' | 'closed';
          status_type?: 'requested' | 'approved' | 'rejected';
          created_at?: string;
          user_id: string;
          guest_emails?: string[] | null;
          start_time?: string | null;
          end_time?: string | null;
          archived_participant_ids?: string[] | null;
          calendar_id?: string | null;
          repeat_type?: string | null;
          repeat_interval?: number | null;
          repeat_end_date?: string | null;
          repeat_weekday?: number | null;
          is_online?: boolean | null;
          conference_room_id?: string | null;
          members_only?: boolean | null;
          meeting_manager?: string | null;
          participant_user_ids?: string[] | null;
          reminder_minutes?: number | null;
          notify_users?: string[] | null;
          external_informees?: string[];
          send_sms?: boolean | null;
          shared_count?: number | null;
          external_participants?: any[] | null;
        };
        Update: {
          id?: string;
          subject?: string;
          request_date?: string;
          duration?: string;
          location?: string;
          representative?: string;
          phone?: string;
          notes?: string | null;
          priority?: 'high' | 'medium' | 'low';
          status?: 'open' | 'closed';
          status_type?: 'requested' | 'approved' | 'rejected';
          created_at?: string;
          user_id?: string;
          guest_emails?: string[] | null;
          start_time?: string | null;
          end_time?: string | null;
          archived_participant_ids?: string[] | null;
          calendar_id?: string | null;
          repeat_type?: string | null;
          repeat_interval?: number | null;
          repeat_end_date?: string | null;
          repeat_weekday?: number | null;
          is_online?: boolean | null;
          conference_room_id?: string | null;
          members_only?: boolean | null;
          meeting_manager?: string | null;
          participant_user_ids?: string[] | null;
          reminder_minutes?: number | null;
          notify_users?: string[] | null;
          external_informees?: string[];
          send_sms?: boolean | null;
          shared_count?: number | null;
          external_participants?: any[] | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          user_id: string;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          organization: string | null;
          position: string | null;
          location: string | null;
          bio: string | null;
          avatar_url: string | null;
          telegram_token: string | null;
          telegram_chat_id: string | null;
          webhook_url: string | null;
          google_calendar_token: string | null;
          google_calendar_expires_at: string | null;
          is_admin: boolean | null;
          is_active: boolean | null;
          is_hidden: boolean | null;
          can_broadcast: boolean;
          user_group: string | null;
          position_id: string | null;
          primary_position_id: string | null;
          primary_unit_id: string | null;
          national_id: string | null;
          birth_date: string | null;
          gender: string | null;
          city: string | null;
          department: string | null;
          employee_id: string | null;
          hire_date: string | null;
          bale_chat_id: string | null;
          username: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
          organization?: string | null;
          position?: string | null;
          location?: string | null;
          bio?: string | null;
          avatar_url?: string | null;
          telegram_token?: string | null;
          telegram_chat_id?: string | null;
          webhook_url?: string | null;
          google_calendar_token?: string | null;
          google_calendar_expires_at?: string | null;
          is_admin?: boolean | null;
          is_active?: boolean | null;
          is_hidden?: boolean | null;
          can_broadcast?: boolean;
          user_group?: string | null;
          position_id?: string | null;
          primary_position_id?: string | null;
          primary_unit_id?: string | null;
          national_id?: string | null;
          birth_date?: string | null;
          gender?: string | null;
          city?: string | null;
          department?: string | null;
          employee_id?: string | null;
          hire_date?: string | null;
          bale_chat_id?: string | null;
          username?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
          organization?: string | null;
          position?: string | null;
          location?: string | null;
          bio?: string | null;
          avatar_url?: string | null;
          telegram_token?: string | null;
          telegram_chat_id?: string | null;
          webhook_url?: string | null;
          google_calendar_token?: string | null;
          google_calendar_expires_at?: string | null;
          is_admin?: boolean | null;
          is_active?: boolean | null;
          is_hidden?: boolean | null;
          can_broadcast?: boolean;
          user_group?: string | null;
          position_id?: string | null;
          primary_position_id?: string | null;
          primary_unit_id?: string | null;
          national_id?: string | null;
          birth_date?: string | null;
          gender?: string | null;
          city?: string | null;
          department?: string | null;
          employee_id?: string | null;
          hire_date?: string | null;
          bale_chat_id?: string | null;
          username?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      participants: {
        Row: {
          id: string;
          meeting_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          meeting_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'participants_meeting_id_fkey';
            columns: ['meeting_id'];
            isOneToOne: false;
            referencedRelation: 'meetings';
            referencedColumns: ['id'];
          }
        ];
      };
      actions: {
        Row: {
          id: string;
          title: string;
          status: 'open' | 'closed';
          meeting_id: string;
          assignee: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          status?: 'open' | 'closed';
          meeting_id: string;
          assignee: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          status?: 'open' | 'closed';
          meeting_id?: string;
          assignee?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'actions_meeting_id_fkey';
            columns: ['meeting_id'];
            isOneToOne: false;
            referencedRelation: 'meetings';
            referencedColumns: ['id'];
          }
        ];
      };
      tasks: {
        Row: {
          id: string;
          title: string;
          description: string;
          status: 'pending' | 'in_progress' | 'completed';
          priority: 'high' | 'medium' | 'low';
          due_date: string;
          assignee: string;
          archived: boolean;
          created_at: string;
          user_id: string;
          source_message_id: string | null;
          source_message_body: string | null;
          current_assignee_id: string | null;
          created_by_id: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          description: string;
          status?: 'pending' | 'in_progress' | 'completed';
          priority: 'high' | 'medium' | 'low';
          due_date: string;
          assignee: string;
          archived?: boolean;
          created_at?: string;
          user_id: string;
          source_message_id?: string | null;
          source_message_body?: string | null;
          current_assignee_id?: string | null;
          created_by_id?: string | null;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string;
          status?: 'pending' | 'in_progress' | 'completed';
          priority?: 'high' | 'medium' | 'low';
          due_date?: string;
          assignee?: string;
          archived?: boolean;
          created_at?: string;
          user_id?: string;
          source_message_id?: string | null;
          source_message_body?: string | null;
          current_assignee_id?: string | null;
          created_by_id?: string | null;
        };
        Relationships: [];
      };
      notes: {
        Row: {
          id: string;
          title: string;
          content: string;
          note_type: 'text' | 'voice';
          status: 'active' | 'archived';
          file_url: string | null;
          file_type: string | null;
          file_name: string | null;
          file_size: number | null;
          drawing_data: string | null;
          created_at: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          title: string;
          content: string;
          note_type?: 'text' | 'voice';
          status?: 'active' | 'archived';
          file_url?: string | null;
          file_type?: string | null;
          file_name?: string | null;
          file_size?: number | null;
          drawing_data?: string | null;
          created_at?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          title?: string;
          content?: string;
          note_type?: 'text' | 'voice';
          status?: 'active' | 'archived';
          file_url?: string | null;
          file_type?: string | null;
          file_name?: string | null;
          file_size?: number | null;
          drawing_data?: string | null;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          name: string;
          phone: string;
          subject: string;
          created_at: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone: string;
          subject: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string;
          subject?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      contacts_email: {
        Row: {
          id: string;
          name: string;
          email: string | null;
          phone: string | null;
          company: string | null;
          position: string | null;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          company?: string | null;
          position?: string | null;
          user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string | null;
          phone?: string | null;
          company?: string | null;
          position?: string | null;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          message: string;
          type: 'meeting' | 'task' | 'note' | 'chat' | 'channel' | 'call' | 'system';
          read: boolean;
          sender_id: string | null;
          sender_name: string | null;
          sender_avatar_url: string | null;
          action_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          message: string;
          type: 'meeting' | 'task' | 'note' | 'chat' | 'channel' | 'call' | 'system';
          read?: boolean;
          sender_id?: string | null;
          sender_name?: string | null;
          sender_avatar_url?: string | null;
          action_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          message?: string;
          type?: 'meeting' | 'task' | 'note' | 'chat' | 'channel' | 'call' | 'system';
          read?: boolean;
          sender_id?: string | null;
          sender_name?: string | null;
          sender_avatar_url?: string | null;
          action_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      shared_meetings: {
        Row: {
          id: string;
          meeting_id: string | null;
          sender_id: string | null;
          sender_name: string;
          recipient_id: string | null;
          status: 'pending' | 'approved' | 'rejected';
          meeting_data: any | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          meeting_id?: string | null;
          sender_id?: string | null;
          sender_name: string;
          recipient_id?: string | null;
          status?: 'pending' | 'approved' | 'rejected';
          meeting_data?: any | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          meeting_id?: string | null;
          sender_id?: string | null;
          sender_name?: string;
          recipient_id?: string | null;
          status?: 'pending' | 'approved' | 'rejected';
          meeting_data?: any | null;
          created_at?: string;
        };
        Relationships: [];
      };
      // ─── System / Config ─────────────────────────────────────────────────
      system_config: {
        Row: {
          id: string;
          section: string;
          key: string;
          value: string | null;
          value_type: string | null;
          label: string | null;
          updated_by: string | null;
          updated_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          section: string;
          key: string;
          value?: string | null;
          value_type?: string | null;
          label?: string | null;
          updated_by?: string | null;
          updated_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          section?: string;
          key?: string;
          value?: string | null;
          value_type?: string | null;
          label?: string | null;
          updated_by?: string | null;
          updated_at?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          user_id: string | null;
          user_name: string | null;
          ip_address: string | null;
          module: string | null;
          action: string;
          details: string | null;
          severity: string;
          entity_name: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          user_name?: string | null;
          ip_address?: string | null;
          module?: string | null;
          action: string;
          details?: string | null;
          severity?: string;
          entity_name?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          user_name?: string | null;
          ip_address?: string | null;
          module?: string | null;
          action?: string;
          details?: string | null;
          severity?: string;
          entity_name?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      // ─── Organization ─────────────────────────────────────────────────────
      org_organizations: {
        Row: {
          id: string;
          name: string;
          display_name: string | null;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          display_name?: string | null;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          display_name?: string | null;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      org_units: {
        Row: {
          id: string;
          name: string;
          sort_order: number | null;
          organization_id: string | null;
          parent_unit_id: string | null;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          sort_order?: number | null;
          organization_id?: string | null;
          parent_unit_id?: string | null;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          sort_order?: number | null;
          organization_id?: string | null;
          parent_unit_id?: string | null;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      org_positions: {
        Row: {
          id: string;
          title: string;
          level: number;
          color: string | null;
          icon: string | null;
          unit_id: string;
          parent_position_id: string | null;
          sort_order: number | null;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          level: number;
          color?: string | null;
          icon?: string | null;
          unit_id: string;
          parent_position_id?: string | null;
          sort_order?: number | null;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          level?: number;
          color?: string | null;
          icon?: string | null;
          unit_id?: string;
          parent_position_id?: string | null;
          sort_order?: number | null;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'org_positions_unit_id_fkey';
            columns: ['unit_id'];
            isOneToOne: false;
            referencedRelation: 'org_units';
            referencedColumns: ['id'];
          }
        ];
      };
      org_position_members: {
        Row: {
          id: string;
          position_id: string;
          user_id: string;
          is_primary: boolean;
          start_date: string | null;
          end_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          position_id: string;
          user_id: string;
          is_primary?: boolean;
          start_date?: string | null;
          end_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          position_id?: string;
          user_id?: string;
          is_primary?: boolean;
          start_date?: string | null;
          end_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'org_position_members_position_id_fkey';
            columns: ['position_id'];
            isOneToOne: false;
            referencedRelation: 'org_positions';
            referencedColumns: ['id'];
          }
        ];
      };
      org_level_definitions: {
        Row: {
          id: string;
          level: number;
          label: string;
          color: string;
          icon: string;
          sort_order: number;
          organization_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          level: number;
          label: string;
          color?: string;
          icon?: string;
          sort_order?: number;
          organization_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          level?: number;
          label?: string;
          color?: string;
          icon?: string;
          sort_order?: number;
          organization_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      org_level_permissions: {
        Row: {
          id: string;
          level: number;
          permission_key: string;
          granted: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          level: number;
          permission_key: string;
          granted?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          level?: number;
          permission_key?: string;
          granted?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      org_position_permissions: {
        Row: {
          id: string;
          position_id: string;
          permission_key: string;
          granted: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          position_id: string;
          permission_key: string;
          granted?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          position_id?: string;
          permission_key?: string;
          granted?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'org_position_permissions_position_id_fkey';
            columns: ['position_id'];
            isOneToOne: false;
            referencedRelation: 'org_positions';
            referencedColumns: ['id'];
          }
        ];
      };
      // ─── User Groups ───────────────────────────────────────────────────────
      user_groups: {
        Row: {
          id: string;
          name: string;
          display_name: string | null;
          description: string | null;
          permissions: Record<string, boolean>;
          is_system: boolean | null;
          is_public: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          display_name?: string | null;
          description?: string | null;
          permissions?: Record<string, boolean>;
          is_system?: boolean | null;
          is_public?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          display_name?: string | null;
          description?: string | null;
          permissions?: Record<string, boolean>;
          is_system?: boolean | null;
          is_public?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_group_members: {
        Row: {
          id: string;
          user_id: string;
          group_id: string;
          added_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          group_id: string;
          added_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          group_id?: string;
          added_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      group_members: {
        Row: {
          id: string;
          group_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      // ─── User Preferences & Presence ─────────────────────────────────────
      user_preferences: {
        Row: {
          id: string;
          user_id: string;
          default_landing_page: string | null;
          theme: string | null;
          language: string | null;
          notifications_enabled: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          default_landing_page?: string | null;
          theme?: string | null;
          language?: string | null;
          notifications_enabled?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          default_landing_page?: string | null;
          theme?: string | null;
          language?: string | null;
          notifications_enabled?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_auto_accept_organizers: {
        Row: {
          user_id: string;
          organizer_user_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          organizer_user_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          organizer_user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      user_presence: {
        Row: {
          user_id: string;
          is_online: boolean;
          status: 'online' | 'away' | 'busy' | 'offline' | null;
          last_seen: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          is_online?: boolean;
          status?: 'online' | 'away' | 'busy' | 'offline' | null;
          last_seen?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          is_online?: boolean;
          status?: 'online' | 'away' | 'busy' | 'offline' | null;
          last_seen?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_access_relations: {
        Row: {
          id: string;
          user_id: string;
          related_user_id: string;
          relation_type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          related_user_id: string;
          relation_type: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          related_user_id?: string;
          relation_type?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      user_bale_mapping: {
        Row: {
          id: string;
          user_id: string;
          bale_chat_id: string;
          bale_username: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          bale_chat_id: string;
          bale_username?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          bale_chat_id?: string;
          bale_username?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      // ─── Calendar ─────────────────────────────────────────────────────────
      calendars: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          color: string;
          type: 'private' | 'public' | 'shared' | string;
          is_active: boolean;
          is_occasions: boolean | null;
          is_personal_public: boolean | null;
          description: string | null;
          enable_reminder: boolean | null;
          create_online_link: boolean | null;
          show_time_overlap: boolean | null;
          free_for_all: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          color?: string;
          type?: 'private' | 'public' | 'shared' | string;
          is_active?: boolean;
          is_occasions?: boolean | null;
          is_personal_public?: boolean | null;
          description?: string | null;
          enable_reminder?: boolean | null;
          create_online_link?: boolean | null;
          show_time_overlap?: boolean | null;
          free_for_all?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          color?: string;
          type?: 'private' | 'public' | 'shared' | string;
          is_active?: boolean;
          is_occasions?: boolean | null;
          is_personal_public?: boolean | null;
          description?: string | null;
          enable_reminder?: boolean | null;
          create_online_link?: boolean | null;
          show_time_overlap?: boolean | null;
          free_for_all?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      calendar_occasions: {
        Row: {
          id: string;
          title: string;
          calendar_type: string;
          month: number;
          day: number;
          is_holiday: boolean;
          is_celebration: boolean;
          is_active: boolean;
          description: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          calendar_type: string;
          month: number;
          day: number;
          is_holiday?: boolean;
          is_celebration?: boolean;
          is_active?: boolean;
          description?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          title?: string;
          calendar_type?: string;
          month?: number;
          day?: number;
          is_holiday?: boolean;
          is_celebration?: boolean;
          is_active?: boolean;
          description?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      calendar_subscriptions: {
        Row: {
          id: string;
          calendar_id: string;
          user_id: string;
          permission: 'view' | 'edit';
          created_at: string;
        };
        Insert: {
          id?: string;
          calendar_id: string;
          user_id: string;
          permission?: 'view' | 'edit';
          created_at?: string;
        };
        Update: {
          id?: string;
          calendar_id?: string;
          user_id?: string;
          permission?: 'view' | 'edit';
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_subscriptions_calendar_id_fkey';
            columns: ['calendar_id'];
            isOneToOne: false;
            referencedRelation: 'calendars';
            referencedColumns: ['id'];
          }
        ];
      };
      all_day_events: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          type: string;
          date_jy: number;
          date_jm: number;
          date_jd: number;
          color: string | null;
          calendar_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          type?: string;
          date_jy: number;
          date_jm: number;
          date_jd: number;
          color?: string | null;
          calendar_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          type?: string;
          date_jy?: number;
          date_jm?: number;
          date_jd?: number;
          color?: string | null;
          calendar_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      // ─── Chat ─────────────────────────────────────────────────────────────
      chat_conversations: {
        Row: {
          id: string;
          participant_a: string;
          participant_b: string;
          last_message_at: string | null;
          deleted_for_a: boolean;
          deleted_for_b: boolean;
          pinned_for_a: boolean | null;
          pinned_for_b: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          participant_a: string;
          participant_b: string;
          last_message_at?: string | null;
          deleted_for_a?: boolean;
          deleted_for_b?: boolean;
          pinned_for_a?: boolean | null;
          pinned_for_b?: boolean | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          participant_a?: string;
          participant_b?: string;
          last_message_at?: string | null;
          deleted_for_a?: boolean;
          deleted_for_b?: boolean;
          pinned_for_a?: boolean | null;
          pinned_for_b?: boolean | null;
          created_at?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          body: string | null;
          message_type: 'normal' | 'important' | 'urgent' | 'confidential';
          status: 'pending' | 'in_progress' | 'done' | null;
          reply_to_id: string | null;
          read_by: string[] | null;
          mentioned_user_ids: string[] | null;
          is_forwarded: boolean;
          forwarded_from_name: string | null;
          file_url: string | null;
          file_name: string | null;
          file_type: string | null;
          voice_url: string | null;
          voice_duration: number | null;
          deleted_for_all: boolean;
          deleted_for_sender: boolean;
          is_pinned: boolean | null;
          pinned_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id: string;
          body?: string | null;
          message_type?: 'normal' | 'important' | 'urgent' | 'confidential';
          status?: 'pending' | 'in_progress' | 'done' | null;
          reply_to_id?: string | null;
          read_by?: string[] | null;
          mentioned_user_ids?: string[] | null;
          is_forwarded?: boolean;
          forwarded_from_name?: string | null;
          file_url?: string | null;
          file_name?: string | null;
          file_type?: string | null;
          voice_url?: string | null;
          voice_duration?: number | null;
          deleted_for_all?: boolean;
          deleted_for_sender?: boolean;
          is_pinned?: boolean | null;
          pinned_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          sender_id?: string;
          body?: string | null;
          message_type?: 'normal' | 'important' | 'urgent' | 'confidential';
          status?: 'pending' | 'in_progress' | 'done' | null;
          reply_to_id?: string | null;
          read_by?: string[] | null;
          mentioned_user_ids?: string[] | null;
          is_forwarded?: boolean;
          forwarded_from_name?: string | null;
          file_url?: string | null;
          file_name?: string | null;
          file_type?: string | null;
          voice_url?: string | null;
          voice_duration?: number | null;
          deleted_for_all?: boolean;
          deleted_for_sender?: boolean;
          is_pinned?: boolean | null;
          pinned_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'chat_conversations';
            referencedColumns: ['id'];
          }
        ];
      };
      chat_message_reactions: {
        Row: {
          message_id: string;
          user_id: string;
          emoji: string;
          created_at: string | null;
        };
        Insert: {
          message_id: string;
          user_id: string;
          emoji: string;
          created_at?: string | null;
        };
        Update: {
          message_id?: string;
          user_id?: string;
          emoji?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      chat_message_read_log: {
        Row: {
          message_id: string;
          user_id: string;
          seen_at: string;
        };
        Insert: {
          message_id: string;
          user_id: string;
          seen_at?: string;
        };
        Update: {
          message_id?: string;
          user_id?: string;
          seen_at?: string;
        };
        Relationships: [];
      };
      chat_message_read_receipts: {
        Row: {
          conversation_id: string;
          user_id: string;
          last_read_at: string;
        };
        Insert: {
          conversation_id: string;
          user_id: string;
          last_read_at?: string;
        };
        Update: {
          conversation_id?: string;
          user_id?: string;
          last_read_at?: string;
        };
        Relationships: [];
      };
      chat_message_stars: {
        Row: {
          message_id: string;
          user_id: string;
          created_at: string | null;
        };
        Insert: {
          message_id: string;
          user_id: string;
          created_at?: string | null;
        };
        Update: {
          message_id?: string;
          user_id?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      chat_reminders: {
        Row: {
          id: string;
          message_id: string;
          user_id: string;
          remind_at: string;
          note: string | null;
          is_dismissed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          user_id: string;
          remind_at: string;
          note?: string | null;
          is_dismissed?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          user_id?: string;
          remind_at?: string;
          note?: string | null;
          is_dismissed?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      chat_tags: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          color: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          color: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          color?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      chat_message_tag_assignments: {
        Row: {
          message_id: string;
          tag_id: string;
          user_id: string;
          created_at: string | null;
        };
        Insert: {
          message_id: string;
          tag_id: string;
          user_id: string;
          created_at?: string | null;
        };
        Update: {
          message_id?: string;
          tag_id?: string;
          user_id?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      // ─── Channels ─────────────────────────────────────────────────────────
      channels: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          type: 'channel' | 'group';
          created_by: string;
          is_private: boolean;
          is_locked: boolean | null;
          member_count: number;
          last_message_preview: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          type?: 'channel' | 'group';
          created_by: string;
          is_private?: boolean;
          is_locked?: boolean | null;
          member_count?: number;
          last_message_preview?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          type?: 'channel' | 'group';
          created_by?: string;
          is_private?: boolean;
          is_locked?: boolean | null;
          member_count?: number;
          last_message_preview?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      channel_members: {
        Row: {
          channel_id: string;
          user_id: string;
          role: 'admin' | 'moderator' | 'member';
          joined_at: string | null;
        };
        Insert: {
          channel_id: string;
          user_id: string;
          role?: 'admin' | 'moderator' | 'member';
          joined_at?: string | null;
        };
        Update: {
          channel_id?: string;
          user_id?: string;
          role?: 'admin' | 'moderator' | 'member';
          joined_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'channel_members_channel_id_fkey';
            columns: ['channel_id'];
            isOneToOne: false;
            referencedRelation: 'channels';
            referencedColumns: ['id'];
          }
        ];
      };
      channel_messages: {
        Row: {
          id: string;
          channel_id: string;
          sender_id: string | null;
          body: string | null;
          message_type: 'normal' | 'important' | 'urgent';
          is_forwarded: boolean;
          forwarded_from_name: string | null;
          file_url: string | null;
          file_name: string | null;
          file_type: string | null;
          voice_url: string | null;
          voice_duration: number | null;
          reply_to_id: string | null;
          read_by: string[] | null;
          mentioned_user_ids: string[] | null;
          is_pinned: boolean;
          pinned_by: string | null;
          deleted_for_all: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          channel_id: string;
          sender_id?: string | null;
          body?: string | null;
          message_type?: 'normal' | 'important' | 'urgent';
          is_forwarded?: boolean;
          forwarded_from_name?: string | null;
          file_url?: string | null;
          file_name?: string | null;
          file_type?: string | null;
          voice_url?: string | null;
          voice_duration?: number | null;
          reply_to_id?: string | null;
          read_by?: string[] | null;
          mentioned_user_ids?: string[] | null;
          is_pinned?: boolean;
          pinned_by?: string | null;
          deleted_for_all?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          channel_id?: string;
          sender_id?: string | null;
          body?: string | null;
          message_type?: 'normal' | 'important' | 'urgent';
          is_forwarded?: boolean;
          forwarded_from_name?: string | null;
          file_url?: string | null;
          file_name?: string | null;
          file_type?: string | null;
          voice_url?: string | null;
          voice_duration?: number | null;
          reply_to_id?: string | null;
          read_by?: string[] | null;
          mentioned_user_ids?: string[] | null;
          is_pinned?: boolean;
          pinned_by?: string | null;
          deleted_for_all?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'channel_messages_channel_id_fkey';
            columns: ['channel_id'];
            isOneToOne: false;
            referencedRelation: 'channels';
            referencedColumns: ['id'];
          }
        ];
      };
      channel_message_reactions: {
        Row: {
          message_id: string;
          user_id: string;
          emoji: string;
          created_at: string | null;
        };
        Insert: {
          message_id: string;
          user_id: string;
          emoji: string;
          created_at?: string | null;
        };
        Update: {
          message_id?: string;
          user_id?: string;
          emoji?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      channel_message_read_log: {
        Row: {
          message_id: string;
          user_id: string;
          seen_at: string;
        };
        Insert: {
          message_id: string;
          user_id: string;
          seen_at?: string;
        };
        Update: {
          message_id?: string;
          user_id?: string;
          seen_at?: string;
        };
        Relationships: [];
      };
      channel_message_stars: {
        Row: {
          message_id: string;
          user_id: string;
          created_at: string | null;
        };
        Insert: {
          message_id: string;
          user_id: string;
          created_at?: string | null;
        };
        Update: {
          message_id?: string;
          user_id?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      channel_message_private_pins: {
        Row: {
          message_id: string;
          user_id: string;
          created_at: string | null;
        };
        Insert: {
          message_id: string;
          user_id: string;
          created_at?: string | null;
        };
        Update: {
          message_id?: string;
          user_id?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      channel_group_tasks: {
        Row: {
          id: string;
          channel_id: string;
          message_id: string;
          title: string;
          body: string | null;
          created_by: string;
          status: 'open' | 'done' | 'archived';
          due_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          channel_id: string;
          message_id: string;
          title: string;
          body?: string | null;
          created_by: string;
          status?: 'open' | 'done' | 'archived';
          due_date: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          channel_id?: string;
          message_id?: string;
          title?: string;
          body?: string | null;
          created_by?: string;
          status?: 'open' | 'done' | 'archived';
          due_date?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      channel_group_task_assignments: {
        Row: {
          id: string;
          group_task_id: string;
          assignee_id: string;
          status: 'pending' | 'in_progress' | 'completed' | 'archived';
          created_at: string | null;
        };
        Insert: {
          id?: string;
          group_task_id: string;
          assignee_id: string;
          status?: 'pending' | 'in_progress' | 'completed' | 'archived';
          created_at?: string | null;
        };
        Update: {
          id?: string;
          group_task_id?: string;
          assignee_id?: string;
          status?: 'pending' | 'in_progress' | 'completed' | 'archived';
          created_at?: string | null;
        };
        Relationships: [];
      };
      channel_group_task_activities: {
        Row: {
          id: string;
          group_task_id: string;
          user_id: string;
          note: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_task_id: string;
          user_id: string;
          note: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_task_id?: string;
          user_id?: string;
          note?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      // ─── Video Conference ─────────────────────────────────────────────────
      conference_rooms: {
        Row: {
          id: string;
          code: string;
          name: string | null;
          host_id: string;
          status: 'active' | 'ended';
          max_participants: number;
          is_locked: boolean;
          password: string | null;
          waiting_room_enabled: boolean;
          allow_reactions: boolean;
          allow_screen_share: boolean;
          allow_chat: boolean;
          chat_enabled: boolean;
          speaking_limit_enabled: boolean;
          record_enabled: boolean;
          recording_consent_required: boolean;
          require_approval: boolean;
          meeting_id: string | null;
          expires_at: string | null;
          created_at: string;
          ended_at: string | null;
          current_phase: 'SCHEDULED' | 'WAITING' | 'COUNTDOWN' | 'LIVE' | 'BREAK' | 'RESUMING' | 'ENDED';
          phase_started_at: string;
          phase_ends_at: string | null;
          phase_revision: number;
          phase_allow_mic: boolean;
          phase_allow_camera: boolean;
          phase_allow_chat: boolean;
        };
        Insert: {
          id?: string;
          code: string;
          name?: string | null;
          host_id: string;
          status?: 'active' | 'ended';
          max_participants?: number;
          is_locked?: boolean;
          password?: string | null;
          waiting_room_enabled?: boolean;
          allow_reactions?: boolean;
          allow_screen_share?: boolean;
          allow_chat?: boolean;
          chat_enabled?: boolean;
          speaking_limit_enabled?: boolean;
          record_enabled?: boolean;
          recording_consent_required?: boolean;
          require_approval?: boolean;
          meeting_id?: string | null;
          expires_at?: string | null;
          created_at?: string;
          ended_at?: string | null;
          current_phase?: 'SCHEDULED' | 'WAITING' | 'COUNTDOWN' | 'LIVE' | 'BREAK' | 'RESUMING' | 'ENDED';
          phase_started_at?: string;
          phase_ends_at?: string | null;
          phase_revision?: number;
          phase_allow_mic?: boolean;
          phase_allow_camera?: boolean;
          phase_allow_chat?: boolean;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string | null;
          host_id?: string;
          status?: 'active' | 'ended';
          max_participants?: number;
          is_locked?: boolean;
          password?: string | null;
          waiting_room_enabled?: boolean;
          allow_reactions?: boolean;
          allow_screen_share?: boolean;
          allow_chat?: boolean;
          chat_enabled?: boolean;
          speaking_limit_enabled?: boolean;
          record_enabled?: boolean;
          recording_consent_required?: boolean;
          require_approval?: boolean;
          meeting_id?: string | null;
          expires_at?: string | null;
          created_at?: string;
          ended_at?: string | null;
          current_phase?: 'SCHEDULED' | 'WAITING' | 'COUNTDOWN' | 'LIVE' | 'BREAK' | 'RESUMING' | 'ENDED';
          phase_started_at?: string;
          phase_ends_at?: string | null;
          phase_revision?: number;
          phase_allow_mic?: boolean;
          phase_allow_camera?: boolean;
          phase_allow_chat?: boolean;
        };
        Relationships: [];
      };
      conference_phase_events: {
        Row: {
          id: string;
          room_id: string;
          revision: number;
          from_phase: string | null;
          to_phase: string;
          actor_user_id: string | null;
          reason: string;
          duration_seconds: number | null;
          phase_started_at: string;
          phase_ends_at: string | null;
          allow_mic: boolean;
          allow_camera: boolean;
          allow_chat: boolean;
          runtime_sync_status: 'PENDING' | 'DISPATCHED' | 'DONE' | 'FAILED' | 'SUPERSEDED';
          last_dispatched_at: string | null;
          enforcement_attempts: number;
          enforced_at: string | null;
          last_enforcement_error: string | null;
          participants_updated: number;
          participants_offline: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          revision: number;
          from_phase?: string | null;
          to_phase: string;
          actor_user_id?: string | null;
          reason: string;
          duration_seconds?: number | null;
          phase_started_at: string;
          phase_ends_at?: string | null;
          allow_mic: boolean;
          allow_camera: boolean;
          allow_chat: boolean;
          runtime_sync_status?: 'PENDING' | 'DISPATCHED' | 'DONE' | 'FAILED' | 'SUPERSEDED';
          last_dispatched_at?: string | null;
          enforcement_attempts?: number;
          enforced_at?: string | null;
          last_enforcement_error?: string | null;
          participants_updated?: number;
          participants_offline?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          revision?: number;
          from_phase?: string | null;
          to_phase?: string;
          actor_user_id?: string | null;
          reason?: string;
          duration_seconds?: number | null;
          phase_started_at?: string;
          phase_ends_at?: string | null;
          allow_mic?: boolean;
          allow_camera?: boolean;
          allow_chat?: boolean;
          runtime_sync_status?: 'PENDING' | 'DISPATCHED' | 'DONE' | 'FAILED' | 'SUPERSEDED';
          last_dispatched_at?: string | null;
          enforcement_attempts?: number;
          enforced_at?: string | null;
          last_enforcement_error?: string | null;
          participants_updated?: number;
          participants_offline?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conference_phase_events_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'conference_rooms';
            referencedColumns: ['id'];
          }
        ];
      };
      conference_participants: {
        Row: {
          id: string;
          room_id: string;
          user_id: string | null;
          peer_id: string;
          display_name: string;
          role: 'host' | 'admin' | 'moderator' | 'member' | 'guest';
          status: 'joined' | 'left' | 'disconnected';
          is_muted: boolean;
          is_video_off: boolean;
          is_hand_raised: boolean;
          is_screen_sharing: boolean;
          mic_publishing_disabled: boolean;
          camera_publishing_disabled: boolean;
          screen_publishing_disabled: boolean;
          livekit_rejoin_blocked_until: string | null;
          speaking_seconds: number | null;
          network_quality: number | null;
          last_seen: string | null;
          joined_at: string;
          left_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id?: string | null;
          peer_id: string;
          display_name: string;
          role?: 'host' | 'admin' | 'moderator' | 'member' | 'guest';
          status?: 'joined' | 'left' | 'disconnected';
          is_muted?: boolean;
          is_video_off?: boolean;
          is_hand_raised?: boolean;
          is_screen_sharing?: boolean;
          mic_publishing_disabled?: boolean;
          camera_publishing_disabled?: boolean;
          screen_publishing_disabled?: boolean;
          livekit_rejoin_blocked_until?: string | null;
          speaking_seconds?: number | null;
          network_quality?: number | null;
          last_seen?: string | null;
          joined_at?: string;
          left_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string | null;
          peer_id?: string;
          display_name?: string;
          role?: 'host' | 'admin' | 'moderator' | 'member' | 'guest';
          status?: 'joined' | 'left' | 'disconnected';
          is_muted?: boolean;
          is_video_off?: boolean;
          is_hand_raised?: boolean;
          is_screen_sharing?: boolean;
          mic_publishing_disabled?: boolean;
          camera_publishing_disabled?: boolean;
          screen_publishing_disabled?: boolean;
          livekit_rejoin_blocked_until?: string | null;
          speaking_seconds?: number | null;
          network_quality?: number | null;
          last_seen?: string | null;
          joined_at?: string;
          left_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'conference_participants_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'conference_rooms';
            referencedColumns: ['id'];
          }
        ];
      };
      conference_spotlights: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conference_spotlights_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'conference_rooms';
            referencedColumns: ['id'];
          }
        ];
      };
      conference_speaker_sessions: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          granted_by: string;
          starts_at: string;
          active_started_at: string | null;
          expires_at: string | null;
          allocated_seconds: number;
          used_seconds: number;
          status: 'QUEUED' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'CANCELLED' | 'COMPLETED';
          queue_position: number | null;
          paused_at: string | null;
          ended_at: string | null;
          end_reason: string | null;
          enforcement_status: 'NONE' | 'PENDING' | 'DISPATCHED' | 'DONE' | 'FAILED';
          enforcement_requested_at: string;
          last_dispatched_at: string | null;
          enforced_at: string | null;
          enforcement_attempts: number;
          last_enforcement_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id: string;
          granted_by: string;
          starts_at?: string;
          active_started_at?: string | null;
          expires_at?: string | null;
          allocated_seconds: number;
          used_seconds?: number;
          status?: 'QUEUED' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'CANCELLED' | 'COMPLETED';
          queue_position?: number | null;
          paused_at?: string | null;
          ended_at?: string | null;
          end_reason?: string | null;
          enforcement_status?: 'NONE' | 'PENDING' | 'DISPATCHED' | 'DONE' | 'FAILED';
          enforcement_requested_at?: string;
          last_dispatched_at?: string | null;
          enforced_at?: string | null;
          enforcement_attempts?: number;
          last_enforcement_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string;
          granted_by?: string;
          starts_at?: string;
          active_started_at?: string | null;
          expires_at?: string | null;
          allocated_seconds?: number;
          used_seconds?: number;
          status?: 'QUEUED' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'CANCELLED' | 'COMPLETED';
          queue_position?: number | null;
          paused_at?: string | null;
          ended_at?: string | null;
          end_reason?: string | null;
          enforcement_status?: 'NONE' | 'PENDING' | 'DISPATCHED' | 'DONE' | 'FAILED';
          enforcement_requested_at?: string;
          last_dispatched_at?: string | null;
          enforced_at?: string | null;
          enforcement_attempts?: number;
          last_enforcement_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conference_speaker_sessions_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'conference_rooms';
            referencedColumns: ['id'];
          }
        ];
      };
      conference_messages: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          display_name: string;
          body: string;
          created_at: string | null;
          reply_to_id: string | null;
          reply_to_body: string | null;
          reply_to_name: string | null;
          is_deleted: boolean;
          role: 'admin' | 'moderator' | 'user' | 'system';
          image_url: string | null;
          image_path: string | null;
          edited_at: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id: string;
          display_name?: string;
          body?: string;
          created_at?: string | null;
          reply_to_id?: string | null;
          reply_to_body?: string | null;
          reply_to_name?: string | null;
          is_deleted?: boolean;
          role?: 'admin' | 'moderator' | 'user' | 'system';
          image_url?: string | null;
          image_path?: string | null;
          edited_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string;
          display_name?: string;
          body?: string;
          created_at?: string | null;
          reply_to_id?: string | null;
          reply_to_body?: string | null;
          reply_to_name?: string | null;
          is_deleted?: boolean;
          role?: 'admin' | 'moderator' | 'user' | 'system';
          image_url?: string | null;
          image_path?: string | null;
          edited_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
        };
        Relationships: [];
      };
      conference_message_reactions: {
        Row: {
          id: string;
          message_id: string;
          room_id: string;
          user_id: string;
          emoji: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          room_id: string;
          user_id: string;
          emoji: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          room_id?: string;
          user_id?: string;
          emoji?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      conference_message_mentions: {
        Row: {
          message_id: string;
          room_id: string;
          mentioned_user_id: string;
          created_at: string;
        };
        Insert: {
          message_id: string;
          room_id: string;
          mentioned_user_id: string;
          created_at?: string;
        };
        Update: {
          message_id?: string;
          room_id?: string;
          mentioned_user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      conference_private_messages: {
        Row: {
          id: string;
          room_id: string;
          sender_id: string;
          recipient_id: string;
          sender_name: string;
          recipient_name: string;
          body: string;
          reply_to_id: string | null;
          reply_to_body: string | null;
          reply_to_sender_name: string | null;
          is_deleted: boolean;
          edited_at: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          read_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          sender_id: string;
          recipient_id: string;
          sender_name?: string;
          recipient_name?: string;
          body?: string;
          reply_to_id?: string | null;
          reply_to_body?: string | null;
          reply_to_sender_name?: string | null;
          is_deleted?: boolean;
          edited_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          read_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          sender_id?: string;
          recipient_id?: string;
          sender_name?: string;
          recipient_name?: string;
          body?: string;
          reply_to_id?: string | null;
          reply_to_body?: string | null;
          reply_to_sender_name?: string | null;
          is_deleted?: boolean;
          edited_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          read_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conference_private_messages_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'conference_rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conference_private_messages_reply_to_id_fkey';
            columns: ['reply_to_id'];
            isOneToOne: false;
            referencedRelation: 'conference_private_messages';
            referencedColumns: ['id'];
          }
        ];
      };
      conference_moderator_messages: {
        Row: {
          id: string;
          room_id: string;
          sender_id: string;
          sender_name: string;
          body: string;
          reply_to_id: string | null;
          reply_to_body: string | null;
          reply_to_sender_name: string | null;
          is_deleted: boolean;
          edited_at: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          sender_id: string;
          sender_name?: string;
          body?: string;
          reply_to_id?: string | null;
          reply_to_body?: string | null;
          reply_to_sender_name?: string | null;
          is_deleted?: boolean;
          edited_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          sender_id?: string;
          sender_name?: string;
          body?: string;
          reply_to_id?: string | null;
          reply_to_body?: string | null;
          reply_to_sender_name?: string | null;
          is_deleted?: boolean;
          edited_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conference_moderator_messages_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'conference_rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conference_moderator_messages_reply_to_id_fkey';
            columns: ['reply_to_id'];
            isOneToOne: false;
            referencedRelation: 'conference_moderator_messages';
            referencedColumns: ['id'];
          }
        ];
      };
      conference_polls: {
        Row: {
          id: string;
          room_id: string;
          created_by: string;
          question: string;
          options: string[];
          is_active: boolean;
          poll_type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'YES_NO' | 'TRUE_FALSE';
          is_anonymous: boolean;
          result_visibility: 'LIVE' | 'AFTER_VOTE' | 'AFTER_CLOSE' | 'HIDDEN';
          status: 'DRAFT' | 'OPEN' | 'CLOSED';
          time_limit_seconds: number | null;
          opened_at: string | null;
          closes_at: string | null;
          revision: number;
          created_at: string;
          ended_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          created_by: string;
          question: string;
          options: string[];
          is_active?: boolean;
          poll_type?: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'YES_NO' | 'TRUE_FALSE';
          is_anonymous?: boolean;
          result_visibility?: 'LIVE' | 'AFTER_VOTE' | 'AFTER_CLOSE' | 'HIDDEN';
          status?: 'DRAFT' | 'OPEN' | 'CLOSED';
          time_limit_seconds?: number | null;
          opened_at?: string | null;
          closes_at?: string | null;
          revision?: number;
          created_at?: string;
          ended_at?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          created_by?: string;
          question?: string;
          options?: string[];
          is_active?: boolean;
          poll_type?: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'YES_NO' | 'TRUE_FALSE';
          is_anonymous?: boolean;
          result_visibility?: 'LIVE' | 'AFTER_VOTE' | 'AFTER_CLOSE' | 'HIDDEN';
          status?: 'DRAFT' | 'OPEN' | 'CLOSED';
          time_limit_seconds?: number | null;
          opened_at?: string | null;
          closes_at?: string | null;
          revision?: number;
          created_at?: string;
          ended_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      conference_poll_options: {
        Row: {
          id: string;
          poll_id: string;
          room_id: string;
          label: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          poll_id: string;
          room_id: string;
          label: string;
          position: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          poll_id?: string;
          room_id?: string;
          label?: string;
          position?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conference_poll_options_poll_id_fkey';
            columns: ['poll_id'];
            isOneToOne: false;
            referencedRelation: 'conference_polls';
            referencedColumns: ['id'];
          }
        ];
      };
      conference_poll_votes: {
        Row: {
          id: string;
          poll_id: string;
          user_id: string;
          option_id: string;
          option_index: number;
          room_id: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          poll_id: string;
          user_id: string;
          option_id: string;
          option_index: number;
          room_id: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          poll_id?: string;
          user_id?: string;
          option_id?: string;
          option_index?: number;
          room_id?: string;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'conference_poll_votes_poll_id_fkey';
            columns: ['poll_id'];
            isOneToOne: false;
            referencedRelation: 'conference_polls';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conference_poll_votes_option_id_fkey';
            columns: ['option_id'];
            isOneToOne: false;
            referencedRelation: 'conference_poll_options';
            referencedColumns: ['id'];
          }
        ];
      };
      conference_waiting_room: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          display_name: string;
          status: 'waiting' | 'admitted' | 'rejected' | 'expired';
          requested_at: string;
          resolved_at: string | null;
          expires_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id: string;
          display_name?: string;
          status?: 'waiting' | 'admitted' | 'rejected' | 'expired';
          requested_at?: string;
          resolved_at?: string | null;
          expires_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string;
          display_name?: string;
          status?: 'waiting' | 'admitted' | 'rejected' | 'expired';
          requested_at?: string;
          resolved_at?: string | null;
          expires_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conference_waiting_room_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'conference_rooms';
            referencedColumns: ['id'];
          }
        ];
      };
      conference_whiteboard_boards: {
        Row: {
          room_id: string;
          is_locked: boolean;
          revision: number;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          room_id: string;
          is_locked?: boolean;
          revision?: number;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          room_id?: string;
          is_locked?: boolean;
          revision?: number;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      conference_whiteboard_pages: {
        Row: {
          id: string;
          room_id: string;
          title: string;
          position: number;
          snapshot_data: unknown;
          revision: number;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          title?: string;
          position: number;
          snapshot_data?: unknown;
          revision?: number;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          title?: string;
          position?: number;
          snapshot_data?: unknown;
          revision?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      conference_whiteboard_snapshots: {
        Row: {
          id: string;
          room_id: string;
          page_id: string;
          revision: number;
          snapshot_data: unknown;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          page_id: string;
          revision: number;
          snapshot_data: unknown;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          page_id?: string;
          revision?: number;
          snapshot_data?: unknown;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      conference_whiteboard: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          stroke_data: any;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id: string;
          stroke_data?: any;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string;
          stroke_data?: any;
          created_at?: string;
        };
        Relationships: [];
      };
      banned_users: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          display_name: string;
          banned_by: string;
          banned_at: string;
          expires_at: string | null;
          reason: string | null;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id: string;
          display_name: string;
          banned_by: string;
          banned_at?: string;
          expires_at?: string | null;
          reason?: string | null;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string;
          display_name?: string;
          banned_by?: string;
          banned_at?: string;
          expires_at?: string | null;
          reason?: string | null;
        };
        Relationships: [];
      };
      room_mod_actions: {
        Row: {
          id: string;
          room_id: string;
          by_admin_id: string;
          action_type: string;
          target_user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          by_admin_id: string;
          action_type: string;
          target_user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          by_admin_id?: string;
          action_type?: string;
          target_user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      call_sessions: {
        Row: {
          id: string;
          caller_id: string;
          callee_id: string;
          call_type: 'audio' | 'video';
          status: 'ringing' | 'active' | 'ended' | 'declined' | 'missed';
          offer: string | null;
          answer: string | null;
          caller_candidates: any[] | null;
          callee_candidates: any[] | null;
          conversation_id: string | null;
          started_at: string | null;
          ended_at: string | null;
          duration_seconds: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          caller_id: string;
          callee_id: string;
          call_type: 'audio' | 'video';
          status?: 'ringing' | 'active' | 'ended' | 'declined' | 'missed';
          offer?: string | null;
          answer?: string | null;
          caller_candidates?: any[] | null;
          callee_candidates?: any[] | null;
          conversation_id?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          duration_seconds?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          caller_id?: string;
          callee_id?: string;
          call_type?: 'audio' | 'video';
          status?: 'ringing' | 'active' | 'ended' | 'declined' | 'missed';
          offer?: string | null;
          answer?: string | null;
          caller_candidates?: any[] | null;
          callee_candidates?: any[] | null;
          conversation_id?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          duration_seconds?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      pending_approvals: {
        Row: {
          id: string;
          room_id: string;
          user_id: string | null;
          guest_id: string | null;
          display_name: string | null;
          status: 'pending' | 'approved' | 'rejected';
          expires_at: string;
          created_at: string;
          approved_by: string | null;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id?: string | null;
          guest_id?: string | null;
          display_name?: string | null;
          status?: 'pending' | 'approved' | 'rejected';
          expires_at?: string;
          created_at?: string;
          approved_by?: string | null;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string | null;
          guest_id?: string | null;
          display_name?: string | null;
          status?: 'pending' | 'approved' | 'rejected';
          expires_at?: string;
          created_at?: string;
          approved_by?: string | null;
        };
        Relationships: [];
      };
      // ─── SMS & Notifications config ────────────────────────────────────────
      sms_delivery_policies: {
        Row: {
          category: string;
          event_type: string;
          delivery_mode: 'immediate' | 'window' | 'fixed_time';
          window_start: string;
          window_end: string;
          fixed_time: string;
          timezone: string;
          locked_immediate: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          category: string;
          event_type: string;
          delivery_mode?: 'immediate' | 'window' | 'fixed_time';
          window_start?: string;
          window_end?: string;
          fixed_time?: string;
          timezone?: string;
          locked_immediate?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          category?: string;
          event_type?: string;
          delivery_mode?: 'immediate' | 'window' | 'fixed_time';
          window_start?: string;
          window_end?: string;
          fixed_time?: string;
          timezone?: string;
          locked_immediate?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      sms_templates: {
        Row: {
          id: string;
          category: string;
          event_type: string;
          audience: string;
          subject: string | null;
          body: string;
          placeholders: string[] | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category: string;
          event_type: string;
          audience: string;
          subject?: string | null;
          body: string;
          placeholders?: string[] | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          category?: string;
          event_type?: string;
          audience?: string;
          subject?: string | null;
          body?: string;
          placeholders?: string[] | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sms_providers: {
        Row: {
          id: string;
          title: string;
          provider_name: string;
          provider_type: string;
          api_url: string;
          api_key: string;
          line_number: string;
          sender_number: string;
          username: string;
          password: string;
          token: string;
          is_public_gateway: boolean;
          is_default: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          provider_name: string;
          provider_type: string;
          api_url?: string;
          api_key?: string;
          line_number?: string;
          sender_number?: string;
          username?: string;
          password?: string;
          token?: string;
          is_public_gateway?: boolean;
          is_default?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          provider_name?: string;
          provider_type?: string;
          api_url?: string;
          api_key?: string;
          line_number?: string;
          sender_number?: string;
          username?: string;
          password?: string;
          token?: string;
          is_public_gateway?: boolean;
          is_default?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sms_dispatch_logs: {
        Row: {
          id: string;
          created_at: string;
          triggered_by_user_id: string | null;
          target_user_id: string | null;
          target_phone: string;
          category: string | null;
          event_type: string | null;
          audience: string | null;
          message: string;
          provider_id: string | null;
          provider_name: string | null;
          status: string;
          error_text: string | null;
          pack_id: string | null;
          message_ids: string[] | null;
          cost: number | null;
          raw_response: any | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          triggered_by_user_id?: string | null;
          target_user_id?: string | null;
          target_phone?: string;
          category?: string | null;
          event_type?: string | null;
          audience?: string | null;
          message?: string;
          provider_id?: string | null;
          provider_name?: string | null;
          status?: string;
          error_text?: string | null;
          pack_id?: string | null;
          message_ids?: string[] | null;
          cost?: number | null;
          raw_response?: any | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          triggered_by_user_id?: string | null;
          target_user_id?: string | null;
          target_phone?: string;
          category?: string | null;
          event_type?: string | null;
          audience?: string | null;
          message?: string;
          provider_id?: string | null;
          provider_name?: string | null;
          status?: string;
          error_text?: string | null;
          pack_id?: string | null;
          message_ids?: string[] | null;
          cost?: number | null;
          raw_response?: any | null;
        };
        Relationships: [];
      };
      sms_group_rules: {
        Row: {
          id: string;
          group_id: string;
          sms_category: string;
          enabled: boolean;
          provider_id: string | null;
          provider_key: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          sms_category: string;
          enabled?: boolean;
          provider_id?: string | null;
          provider_key?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          sms_category?: string;
          enabled?: boolean;
          provider_id?: string | null;
          provider_key?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      notification_templates: {
        Row: {
          id: string;
          category: string;
          event_type: string;
          audience: string;
          title: string;
          body: string;
          icon: string;
          color: string;
          placeholders: string[] | null;
          is_active: boolean;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          category: string;
          event_type: string;
          audience: string;
          title: string;
          body: string;
          icon?: string;
          color?: string;
          placeholders?: string[] | null;
          is_active?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          category?: string;
          event_type?: string;
          audience?: string;
          title?: string;
          body?: string;
          icon?: string;
          color?: string;
          placeholders?: string[] | null;
          is_active?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      notification_group_rules: {
        Row: {
          id: string;
          event_type: string;
          audience: string;
          category: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_type: string;
          audience: string;
          category: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_type?: string;
          audience?: string;
          category?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      broadcast_messages: {
        Row: {
          id: string;
          title: string;
          body: string;
          sender_id: string;
          scope: string;
          target_group_ids: string[] | null;
          sent_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          body: string;
          sender_id: string;
          scope: string;
          target_group_ids?: string[] | null;
          sent_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          body?: string;
          sender_id?: string;
          scope?: string;
          target_group_ids?: string[] | null;
          sent_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      broadcast_recipients: {
        Row: {
          id: string;
          message_id: string;
          user_id: string;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          user_id: string;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          user_id?: string;
          is_read?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      // ─── Spark AI ────────────────────────────────────────────────────────
      spark_config: {
        Row: {
          id: string;
          module: string;
          enabled: boolean;
          trigger_keywords: string[] | null;
          description: string | null;
          voice_response_template: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          module: string;
          enabled?: boolean;
          trigger_keywords?: string[] | null;
          description?: string | null;
          voice_response_template?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          module?: string;
          enabled?: boolean;
          trigger_keywords?: string[] | null;
          description?: string | null;
          voice_response_template?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      spark_ai_settings: {
        Row: {
          id: string;
          provider: string | null;
          api_key: string | null;
          model: string | null;
          enabled: boolean;
          updated_at: string;
        };
        Insert: {
          id?: string;
          provider?: string | null;
          api_key?: string | null;
          model?: string | null;
          enabled?: boolean;
          updated_at?: string;
        };
        Update: {
          id?: string;
          provider?: string | null;
          api_key?: string | null;
          model?: string | null;
          enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      spark_field_keywords: {
        Row: {
          id: string;
          module: string;
          field_key: string;
          field_label: string;
          extract_keywords: string[] | null;
          example: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          module: string;
          field_key: string;
          field_label: string;
          extract_keywords?: string[] | null;
          example?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          module?: string;
          field_key?: string;
          field_label?: string;
          extract_keywords?: string[] | null;
          example?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      spark_assistant_logs: {
        Row: {
          id: string;
          user_id: string;
          module: string | null;
          input_text: string | null;
          parsed_fields: any | null;
          action_taken: string | null;
          result: any | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          module?: string | null;
          input_text?: string | null;
          parsed_fields?: any | null;
          action_taken?: string | null;
          result?: any | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          module?: string | null;
          input_text?: string | null;
          parsed_fields?: any | null;
          action_taken?: string | null;
          result?: any | null;
          created_at?: string;
        };
        Relationships: [];
      };
      spark_memory: {
        Row: {
          id: string;
          user_id: string;
          key: string;
          value: any;
          usage_count: number | null;
          last_used_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          key: string;
          value: any;
          usage_count?: number | null;
          last_used_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          key?: string;
          value?: any;
          usage_count?: number | null;
          last_used_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      // ─── Daily Reports ────────────────────────────────────────────────────
      daily_report_config: {
        Row: {
          id: string;
          is_enabled: boolean;
          send_time: string | null;
          send_days: number[] | null;
          send_via_sms: boolean;
          send_via_notification: boolean;
          send_via_bale: boolean;
          recipient_user_ids: string[] | null;
          recipient_group_ids: string[] | null;
          notification_title_tpl: string | null;
          notification_body_tpl: string | null;
          sms_tpl: string | null;
          last_sent_date: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          is_enabled?: boolean;
          send_time?: string | null;
          send_days?: number[] | null;
          send_via_sms?: boolean;
          send_via_notification?: boolean;
          send_via_bale?: boolean;
          recipient_user_ids?: string[] | null;
          recipient_group_ids?: string[] | null;
          notification_title_tpl?: string | null;
          notification_body_tpl?: string | null;
          sms_tpl?: string | null;
          last_sent_date?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          is_enabled?: boolean;
          send_time?: string | null;
          send_days?: number[] | null;
          send_via_sms?: boolean;
          send_via_notification?: boolean;
          send_via_bale?: boolean;
          recipient_user_ids?: string[] | null;
          recipient_group_ids?: string[] | null;
          notification_title_tpl?: string | null;
          notification_body_tpl?: string | null;
          sms_tpl?: string | null;
          last_sent_date?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      social_channel_configs: {
        Row: {
          id: string;
          channel: string;
          bot_token: string | null;
          bot_username: string | null;
          default_chat_id: string | null;
          is_active: boolean;
          webhook_url: string | null;
          webhook_secret: string | null;
          notes: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          channel: string;
          bot_token?: string | null;
          bot_username?: string | null;
          default_chat_id?: string | null;
          is_active?: boolean;
          webhook_url?: string | null;
          webhook_secret?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          channel?: string;
          bot_token?: string | null;
          bot_username?: string | null;
          default_chat_id?: string | null;
          is_active?: boolean;
          webhook_url?: string | null;
          webhook_secret?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      hr_sso_config: {
        Row: {
          id: string;
          provider: string;
          client_id: string | null;
          client_secret: string | null;
          redirect_uri: string | null;
          base_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          provider: string;
          client_id?: string | null;
          client_secret?: string | null;
          redirect_uri?: string | null;
          base_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          provider?: string;
          client_id?: string | null;
          client_secret?: string | null;
          redirect_uri?: string | null;
          base_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rahyab_inbox: {
        Row: {
          id: string;
          row_id: number | null;
          sender: string | null;
          receiver: string | null;
          message: string | null;
          received_at: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          row_id?: number | null;
          sender?: string | null;
          receiver?: string | null;
          message?: string | null;
          received_at?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          row_id?: number | null;
          sender?: string | null;
          receiver?: string | null;
          message?: string | null;
          received_at?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      meeting_inbox: {
        Row: {
          id: string;
          meeting_id: string | null;
          user_id: string;
          status: string;
          delegate_to: string | null;
          is_read: boolean;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          meeting_id?: string | null;
          user_id: string;
          status?: string;
          delegate_to?: string | null;
          is_read?: boolean;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          meeting_id?: string | null;
          user_id?: string;
          status?: string;
          delegate_to?: string | null;
          is_read?: boolean;
          created_at?: string | null;
        };
        Relationships: [];
      };
      meeting_agenda_items: {
        Row: {
          id: string;
          meeting_id: string;
          title: string;
          presenter: string | null;
          duration_minutes: number | null;
          sort_order: number;
          created_at: string;
          description: string | null;
          source_decision_id: string | null;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          title: string;
          presenter?: string | null;
          duration_minutes?: number | null;
          sort_order?: number;
          created_at?: string;
          description?: string | null;
          source_decision_id?: string | null;
        };
        Update: {
          id?: string;
          meeting_id?: string;
          title?: string;
          presenter?: string | null;
          duration_minutes?: number | null;
          sort_order?: number;
          created_at?: string;
          description?: string | null;
          source_decision_id?: string | null;
        };
        Relationships: [];
      };
      attachments: {
        Row: {
          id: string;
          entity_type: string;
          entity_id: string;
          file_name: string;
          file_url: string;
          file_size: number | null;
          mime_type: string | null;
          uploaded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          entity_type: string;
          entity_id: string;
          file_name: string;
          file_url: string;
          file_size?: number | null;
          mime_type?: string | null;
          uploaded_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          entity_type?: string;
          entity_id?: string;
          file_name?: string;
          file_url?: string;
          file_size?: number | null;
          mime_type?: string | null;
          uploaded_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      task_workflow: {
        Row: {
          id: string;
          task_id: string;
          actor_id: string;
          action: 'created' | 'referred' | 'accepted' | 'completed' | 'rejected' | 'note_added';
          from_user_id: string | null;
          to_user_id: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          actor_id: string;
          action: 'created' | 'referred' | 'accepted' | 'completed' | 'rejected' | 'note_added';
          from_user_id?: string | null;
          to_user_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          actor_id?: string;
          action?: 'created' | 'referred' | 'accepted' | 'completed' | 'rejected' | 'note_added';
          from_user_id?: string | null;
          to_user_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      task_workflow_steps: {
        Row: {
          id: string;
          task_id: string;
          actor_id: string;
          action: string;
          from_user_id: string | null;
          to_user_id: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          actor_id: string;
          action: string;
          from_user_id?: string | null;
          to_user_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          actor_id?: string;
          action?: string;
          from_user_id?: string | null;
          to_user_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_all_users: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          email: string;
          created_at: string;
          full_name: string | null;
          organization: string | null;
          position: string | null;
        }[];
      };
      get_email_by_username: {
        Args: { p_username: string };
        Returns: string | null;
      };
      get_channel_unread_counts: {
        Args: { p_user_id: string };
        Returns: { channel_id: string; unread_count: number }[];
      };
      get_unread_counts: {
        Args: { p_user_id: string };
        Returns: { conversation_id: string; unread_count: number }[];
      };
      create_channel: {
        Args: { p_name: string; p_description: string | null; p_type: string; p_is_private: boolean; p_member_ids: string[] };
        Returns: string;
      };
      mark_channel_messages_read: {
        Args: { p_channel_id: string };
        Returns: undefined;
      };
      mark_channel_message_read: {
        Args: { p_message_id: string };
        Returns: undefined;
      };
      delete_channel_message: {
        Args: { p_message_id: string };
        Returns: undefined;
      };
      insert_channel_system_message: {
        Args: { p_channel_id: string; p_content: string };
        Returns: undefined;
      };
      find_or_create_direct_conversation: {
        Args: { user_a: string; user_b: string };
        Returns: string;
      };
      toggle_pin_chat: {
        Args: { p_conversation_id: string };
        Returns: undefined;
      };
      clear_chat_for_user: {
        Args: { p_conversation_id: string };
        Returns: undefined;
      };
      delete_chat_for_user: {
        Args: { p_conversation_id: string };
        Returns: undefined;
      };
      delete_chat_message_for_me: {
        Args: { p_message_id: string };
        Returns: undefined;
      };
      delete_chat_message_for_all: {
        Args: { p_message_id: string };
        Returns: undefined;
      };
      mark_conversation_messages_read: {
        Args: { p_conversation_id: string };
        Returns: undefined;
      };
      remove_self_from_meeting: {
        Args: { p_meeting_id: string };
        Returns: undefined;
      };
      flag_meeting_rejected: {
        Args: { p_meeting_id: string };
        Returns: undefined;
      };
      resend_meeting_invitations: {
        Args: { p_meeting_id: string };
        Returns: undefined;
      };
      room_has_password: {
        Args: { p_room_id: string };
        Returns: boolean;
      };
      share_contact_to_user: {
        Args: { p_contact_id: string; p_target_user_id: string };
        Returns: undefined;
      };
      get_sms_dispatch_info: {
        Args: { target_user_id: string; p_category: string };
        Returns: { provider_id: string | null; phone: string | null }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
