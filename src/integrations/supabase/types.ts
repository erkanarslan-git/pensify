export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_requests: {
        Row: {
          created_at: string
          id: string
          message: string | null
          organization_id: string
          requested_role: Database["public"]["Enums"]["app_role"] | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          organization_id?: string
          requested_role?: Database["public"]["Enums"]["app_role"] | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          organization_id?: string
          requested_role?: Database["public"]["Enums"]["app_role"] | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_requests_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          organization_id: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_review_settings: {
        Row: {
          organization_id: string
          review_after_minutes: number
          updated_at: string
          warning_after_minutes: number
        }
        Insert: {
          organization_id: string
          review_after_minutes?: number
          updated_at?: string
          warning_after_minutes?: number
        }
        Update: {
          organization_id?: string
          review_after_minutes?: number
          updated_at?: string
          warning_after_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "attendance_review_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          diff: Json | null
          entity: string
          entity_id: string | null
          id: string
          metadata: Json | null
          organization_id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          active: boolean
          connection_id: string
          created_at: string
          currency: string
          iban: string | null
          id: string
          organization_id: string
          owner_name: string | null
          provider_account_id: string
        }
        Insert: {
          active?: boolean
          connection_id: string
          created_at?: string
          currency?: string
          iban?: string | null
          id?: string
          organization_id: string
          owner_name?: string | null
          provider_account_id: string
        }
        Update: {
          active?: boolean
          connection_id?: string
          created_at?: string
          currency?: string
          iban?: string | null
          id?: string
          organization_id?: string
          owner_name?: string | null
          provider_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_connections: {
        Row: {
          bank_name: string | null
          consent_expires_at: string | null
          created_at: string
          created_by: string | null
          disconnected_at: string | null
          disconnected_by: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          last_success_at: string | null
          next_check_at: string | null
          organization_id: string
          provider: string
          secret_ref: string | null
          status: string
          sync_cursor: string | null
          sync_lock_until: string | null
          updated_at: string
        }
        Insert: {
          bank_name?: string | null
          consent_expires_at?: string | null
          created_at?: string
          created_by?: string | null
          disconnected_at?: string | null
          disconnected_by?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          next_check_at?: string | null
          organization_id: string
          provider: string
          secret_ref?: string | null
          status?: string
          sync_cursor?: string | null
          sync_lock_until?: string | null
          updated_at?: string
        }
        Update: {
          bank_name?: string | null
          consent_expires_at?: string | null
          created_at?: string
          created_by?: string | null
          disconnected_at?: string | null
          disconnected_by?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          next_check_at?: string | null
          organization_id?: string
          provider?: string
          secret_ref?: string | null
          status?: string
          sync_cursor?: string | null
          sync_lock_until?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_settings: {
        Row: {
          auto_match_enabled: boolean
          check_times: string[]
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_match_enabled?: boolean
          check_times?: string[]
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_match_enabled?: boolean
          check_times?: string[]
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          account_id: string
          amount: number
          booking_date: string | null
          booking_status: string
          counterparty_iban: string | null
          counterparty_name: string | null
          currency: string
          exclude_reason: string | null
          first_seen_at: string
          id: string
          is_sample: boolean
          match_state: string
          matched_at: string | null
          matched_automatically: boolean
          matched_by: string | null
          organization_id: string
          provider_transaction_id: string
          remittance: string | null
          review_reason: string | null
          updated_at: string
          value_date: string | null
        }
        Insert: {
          account_id: string
          amount: number
          booking_date?: string | null
          booking_status: string
          counterparty_iban?: string | null
          counterparty_name?: string | null
          currency: string
          exclude_reason?: string | null
          first_seen_at?: string
          id?: string
          is_sample?: boolean
          match_state?: string
          matched_at?: string | null
          matched_automatically?: boolean
          matched_by?: string | null
          organization_id: string
          provider_transaction_id: string
          remittance?: string | null
          review_reason?: string | null
          updated_at?: string
          value_date?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          booking_date?: string | null
          booking_status?: string
          counterparty_iban?: string | null
          counterparty_name?: string | null
          currency?: string
          exclude_reason?: string | null
          first_seen_at?: string
          id?: string
          is_sample?: boolean
          match_state?: string
          matched_at?: string | null
          matched_automatically?: boolean
          matched_by?: string | null
          organization_id?: string
          provider_transaction_id?: string
          remittance?: string | null
          review_reason?: string | null
          updated_at?: string
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booking_ref: string
          channel: string | null
          company_address: string | null
          company_contact: string | null
          company_name: string | null
          company_vat_id: string | null
          created_at: string
          created_by: string | null
          customer_type: string
          id: string
          notes: string | null
          organization_id: string
          primary_guest_email: string | null
          primary_guest_name: string
          primary_guest_phone: string | null
          updated_at: string
        }
        Insert: {
          booking_ref?: string
          channel?: string | null
          company_address?: string | null
          company_contact?: string | null
          company_name?: string | null
          company_vat_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_type?: string
          id?: string
          notes?: string | null
          organization_id?: string
          primary_guest_email?: string | null
          primary_guest_name: string
          primary_guest_phone?: string | null
          updated_at?: string
        }
        Update: {
          booking_ref?: string
          channel?: string | null
          company_address?: string | null
          company_contact?: string | null
          company_name?: string | null
          company_vat_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_type?: string
          id?: string
          notes?: string | null
          organization_id?: string
          primary_guest_email?: string | null
          primary_guest_name?: string
          primary_guest_phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_accounts: {
        Row: {
          created_at: string
          dry_run: boolean
          enabled: boolean
          id: string
          is_test: boolean
          last_error: string | null
          last_pull_at: string | null
          last_push_at: string | null
          last_push_url_check: Json | null
          last_webhook_test: Json | null
          organization_id: string
          property_code: string | null
          provider: string
          secret_name: string | null
          updated_at: string
          wubook_acode: string | null
          wubook_lcode: string | null
        }
        Insert: {
          created_at?: string
          dry_run?: boolean
          enabled?: boolean
          id?: string
          is_test?: boolean
          last_error?: string | null
          last_pull_at?: string | null
          last_push_at?: string | null
          last_push_url_check?: Json | null
          last_webhook_test?: Json | null
          organization_id: string
          property_code?: string | null
          provider?: string
          secret_name?: string | null
          updated_at?: string
          wubook_acode?: string | null
          wubook_lcode?: string | null
        }
        Update: {
          created_at?: string
          dry_run?: boolean
          enabled?: boolean
          id?: string
          is_test?: boolean
          last_error?: string | null
          last_pull_at?: string | null
          last_push_at?: string | null
          last_push_url_check?: Json | null
          last_webhook_test?: Json | null
          organization_id?: string
          property_code?: string | null
          provider?: string
          secret_name?: string | null
          updated_at?: string
          wubook_acode?: string | null
          wubook_lcode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_integrations: {
        Row: {
          api_credentials: Json | null
          channel: Database["public"]["Enums"]["reservation_channel"]
          created_at: string
          direction: string
          enabled: boolean
          ical_url: string | null
          id: string
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          name: string | null
          organization_id: string
          property_id: string
          room_id: string | null
          updated_at: string
        }
        Insert: {
          api_credentials?: Json | null
          channel: Database["public"]["Enums"]["reservation_channel"]
          created_at?: string
          direction?: string
          enabled?: boolean
          ical_url?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          name?: string | null
          organization_id?: string
          property_id: string
          room_id?: string | null
          updated_at?: string
        }
        Update: {
          api_credentials?: Json | null
          channel?: Database["public"]["Enums"]["reservation_channel"]
          created_at?: string
          direction?: string
          enabled?: boolean
          ical_url?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          name?: string | null
          organization_id?: string
          property_id?: string
          room_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_integrations_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_integrations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_integrations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room_operational_status"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "channel_integrations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_property_mappings: {
        Row: {
          account_id: string
          created_at: string
          enabled: boolean
          external_property_code: string
          id: string
          last_error: string | null
          last_pull_at: string | null
          last_push_at: string | null
          organization_id: string
          property_id: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          enabled?: boolean
          external_property_code: string
          id?: string
          last_error?: string | null
          last_pull_at?: string | null
          last_push_at?: string | null
          organization_id: string
          property_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          enabled?: boolean
          external_property_code?: string
          id?: string
          last_error?: string | null
          last_pull_at?: string | null
          last_push_at?: string | null
          organization_id?: string
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_property_mappings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "channel_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_property_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_property_mappings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_room_mappings: {
        Row: {
          channel: string
          created_at: string
          external_rate_id: string | null
          external_room_id: string | null
          id: string
          organization_id: string
          property_id: string | null
          property_mapping_id: string | null
          rate_plan_id: string | null
          room_type_id: string
          sync_enabled: boolean
        }
        Insert: {
          channel: string
          created_at?: string
          external_rate_id?: string | null
          external_room_id?: string | null
          id?: string
          organization_id: string
          property_id?: string | null
          property_mapping_id?: string | null
          rate_plan_id?: string | null
          room_type_id: string
          sync_enabled?: boolean
        }
        Update: {
          channel?: string
          created_at?: string
          external_rate_id?: string | null
          external_room_id?: string | null
          id?: string
          organization_id?: string
          property_id?: string | null
          property_mapping_id?: string | null
          rate_plan_id?: string | null
          room_type_id?: string
          sync_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "channel_room_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_room_mappings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_room_mappings_property_mapping_id_fkey"
            columns: ["property_mapping_id"]
            isOneToOne: false
            referencedRelation: "channel_property_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_room_mappings_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_room_mappings_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          country: string
          created_at: string
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          id?: string
          name: string
          organization_id?: string
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cities_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaners: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          full_name: string
          hourly_rate: number | null
          id: string
          notes: string | null
          organization_id: string
          phone: string | null
          time_tracking_enabled: boolean
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name: string
          hourly_rate?: number | null
          id?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          time_tracking_enabled?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string
          hourly_rate?: number | null
          id?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          time_tracking_enabled?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaners_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_tasks: {
        Row: {
          cleaner_id: string | null
          completed_at: string | null
          created_at: string
          due_at: string
          id: string
          inspected_at: string | null
          inspected_by: string | null
          inspection_note: string | null
          inspection_state: string
          notes: string | null
          organization_id: string
          photos_count: number
          property_id: string
          room_id: string
          status: Database["public"]["Enums"]["cleaning_status"]
          updated_at: string
        }
        Insert: {
          cleaner_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_at: string
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          inspection_note?: string | null
          inspection_state?: string
          notes?: string | null
          organization_id?: string
          photos_count?: number
          property_id: string
          room_id: string
          status?: Database["public"]["Enums"]["cleaning_status"]
          updated_at?: string
        }
        Update: {
          cleaner_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          inspection_note?: string | null
          inspection_state?: string
          notes?: string | null
          organization_id?: string
          photos_count?: number
          property_id?: string
          room_id?: string
          status?: Database["public"]["Enums"]["cleaning_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_tasks_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: false
            referencedRelation: "cleaners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_tasks_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_tasks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room_operational_status"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "cleaning_tasks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      conflict_alerts: {
        Row: {
          check_in: string
          check_out: string
          created_at: string
          existing_reservation_id: string | null
          id: string
          incoming_channel: Database["public"]["Enums"]["reservation_channel"]
          incoming_payload: Json
          organization_id: string
          property_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          room_id: string
          status: string
        }
        Insert: {
          check_in: string
          check_out: string
          created_at?: string
          existing_reservation_id?: string | null
          id?: string
          incoming_channel: Database["public"]["Enums"]["reservation_channel"]
          incoming_payload: Json
          organization_id?: string
          property_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          room_id: string
          status?: string
        }
        Update: {
          check_in?: string
          check_out?: string
          created_at?: string
          existing_reservation_id?: string | null
          id?: string
          incoming_channel?: Database["public"]["Enums"]["reservation_channel"]
          incoming_payload?: Json
          organization_id?: string
          property_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          room_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "conflict_alerts_existing_reservation_id_fkey"
            columns: ["existing_reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_alerts_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_alerts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_alerts_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room_operational_status"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "conflict_alerts_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_executions: {
        Row: {
          detail: Json | null
          finished_at: string | null
          id: string
          job: string
          organization_id: string
          started_at: string
          status: string
        }
        Insert: {
          detail?: Json | null
          finished_at?: string | null
          id?: string
          job: string
          organization_id?: string
          started_at?: string
          status: string
        }
        Update: {
          detail?: Json | null
          finished_at?: string | null
          id?: string
          job?: string
          organization_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cron_executions_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_parties: {
        Row: {
          address: string | null
          contact: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          kind: string
          name: string
          organization_id: string
          phone: string | null
          updated_at: string
          vat: string | null
        }
        Insert: {
          address?: string | null
          contact?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          kind: string
          name: string
          organization_id: string
          phone?: string | null
          updated_at?: string
          vat?: string | null
        }
        Update: {
          address?: string | null
          contact?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          kind?: string
          name?: string
          organization_id?: string
          phone?: string | null
          updated_at?: string
          vat?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_parties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_messages: {
        Row: {
          body: string
          cleaner_id: string
          created_at: string
          error: string | null
          id: string
          organization_id: string
          provider: string
          scheduled_for: string
          sent_at: string
          sent_by: string | null
          status: string
          task_ids: string[]
          trigger: string
        }
        Insert: {
          body: string
          cleaner_id: string
          created_at?: string
          error?: string | null
          id?: string
          organization_id?: string
          provider?: string
          scheduled_for: string
          sent_at?: string
          sent_by?: string | null
          status?: string
          task_ids?: string[]
          trigger: string
        }
        Update: {
          body?: string
          cleaner_id?: string
          created_at?: string
          error?: string | null
          id?: string
          organization_id?: string
          provider?: string
          scheduled_for?: string
          sent_at?: string
          sent_by?: string | null
          status?: string
          task_ids?: string[]
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_messages_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: false
            referencedRelation: "cleaners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_messages_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_replies: {
        Row: {
          applied: boolean
          applied_error: string | null
          cleaner_id: string
          id: string
          message_id: string | null
          organization_id: string
          parsed_action: string | null
          raw_text: string
          received_at: string
          received_via: string
          task_id: string | null
        }
        Insert: {
          applied?: boolean
          applied_error?: string | null
          cleaner_id: string
          id?: string
          message_id?: string | null
          organization_id?: string
          parsed_action?: string | null
          raw_text: string
          received_at?: string
          received_via?: string
          task_id?: string | null
        }
        Update: {
          applied?: boolean
          applied_error?: string | null
          cleaner_id?: string
          id?: string
          message_id?: string | null
          organization_id?: string
          parsed_action?: string | null
          raw_text?: string
          received_at?: string
          received_via?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_replies_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: false
            referencedRelation: "cleaners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_replies_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "dispatch_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_replies_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_replies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "cleaning_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_absences: {
        Row: {
          cancelled: boolean
          correction_reason: string
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          kind: string
          member_id: string
          note: string
          organization_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          cancelled?: boolean
          correction_reason?: string
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          kind: string
          member_id: string
          note?: string
          organization_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          cancelled?: boolean
          correction_reason?: string
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          kind?: string
          member_id?: string
          note?: string
          organization_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_absences_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_absences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_overtime_rates: {
        Row: {
          cleaner_id: string
          hourly_rate: number
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cleaner_id: string
          hourly_rate: number
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cleaner_id?: string
          hourly_rate?: number
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_overtime_rates_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: true
            referencedRelation: "cleaners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_overtime_rates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_work_schedules: {
        Row: {
          created_at: string
          effective_from: string
          id: string
          member_id: string
          organization_id: string
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          created_at?: string
          effective_from: string
          id?: string
          member_id: string
          organization_id: string
          updated_at?: string
          weekdays?: number[]
        }
        Update: {
          created_at?: string
          effective_from?: string
          id?: string
          member_id?: string
          organization_id?: string
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "employee_work_schedules_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_work_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_outbox: {
        Row: {
          attempts: number
          created_at: string
          event: string
          id: string
          last_error: string | null
          next_attempt_at: string
          organization_id: string
          payload: Json
          property_id: string | null
          provider: string
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          organization_id: string
          payload: Json
          property_id?: string | null
          provider?: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          organization_id?: string
          payload?: Json
          property_id?: string | null
          provider?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_outbox_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_outbox_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      member_departments: {
        Row: {
          created_at: string
          department: string
          id: string
          is_lead: boolean
          is_worker: boolean
          lead_can_absence: boolean
          lead_can_assign: boolean
          lead_can_fix_time: boolean
          lead_can_report: boolean
          lead_can_reset_password: boolean
          member_id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department: string
          id?: string
          is_lead?: boolean
          is_worker?: boolean
          lead_can_absence?: boolean
          lead_can_assign?: boolean
          lead_can_fix_time?: boolean
          lead_can_report?: boolean
          lead_can_reset_password?: boolean
          member_id: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string
          id?: string
          is_lead?: boolean
          is_worker?: boolean
          lead_can_absence?: boolean
          lead_can_assign?: boolean
          lead_can_fix_time?: boolean
          lead_can_report?: boolean
          lead_can_reset_password?: boolean
          member_id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_departments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      member_property_access: {
        Row: {
          created_at: string
          id: string
          member_id: string
          organization_id: string
          property_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          organization_id: string
          property_id: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          organization_id?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_property_access_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_property_access_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_property_access_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      morning_push_deliveries: {
        Row: {
          created_at: string
          day: string
          finished_at: string | null
          organization_id: string
          sent_count: number
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day: string
          finished_at?: string | null
          organization_id: string
          sent_count?: number
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day?: string
          finished_at?: string | null
          organization_id?: string
          sent_count?: number
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      occupancy_rates: {
        Row: {
          closed: boolean
          created_at: string
          date: string
          guest_count: number | null
          id: string
          min_stay: number | null
          organization_id: string
          price: number
          property_id: string | null
          rate_plan_id: string
        }
        Insert: {
          closed?: boolean
          created_at?: string
          date: string
          guest_count?: number | null
          id?: string
          min_stay?: number | null
          organization_id: string
          price: number
          property_id?: string | null
          rate_plan_id: string
        }
        Update: {
          closed?: boolean
          created_at?: string
          date?: string
          guest_count?: number | null
          id?: string
          min_stay?: number | null
          organization_id?: string
          price?: number
          property_id?: string | null
          rate_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "occupancy_rates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occupancy_rates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occupancy_rates_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_access_secrets: {
        Row: {
          id: string
          kind: string
          organization_id: string
          property_id: string
          room_id: string | null
          secret_value: string
          updated_at: string
          updated_by: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          id?: string
          kind: string
          organization_id: string
          property_id: string
          room_id?: string | null
          secret_value: string
          updated_at?: string
          updated_by?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          id?: string
          kind?: string
          organization_id?: string
          property_id?: string
          room_id?: string | null
          secret_value?: string
          updated_at?: string
          updated_by?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_access_secrets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_access_secrets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_access_secrets_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room_operational_status"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "operational_access_secrets_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          active: boolean
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          active: boolean
          created_at: string
          default_currency: string
          id: string
          locale: string
          name: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_currency?: string
          id?: string
          locale?: string
          name: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_currency?: string
          id?: string
          locale?: string
          name?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_receipts: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          id: string
          organization_id: string
          request_payload: Json
          reservation_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          id: string
          organization_id: string
          request_payload: Json
          reservation_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          organization_id?: string
          request_payload?: Json
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_schedules: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          due_date: string
          id: string
          kind: string
          note: string | null
          organization_id: string
          payment_reference: string
          property_id: string
          reservation_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date: string
          id?: string
          kind?: string
          note?: string | null
          organization_id: string
          payment_reference?: string
          property_id: string
          reservation_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string
          id?: string
          kind?: string
          note?: string | null
          organization_id?: string
          payment_reference?: string
          property_id?: string
          reservation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_schedules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_schedules_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank_transaction_id: string | null
          created_at: string
          id: string
          kind: string
          method: string
          note: string | null
          organization_id: string
          paid_on: string
          property_id: string
          receipt_id: string | null
          recorded_by: string | null
          reservation_id: string
          reverse_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          schedule_id: string | null
          source: string
        }
        Insert: {
          amount: number
          bank_transaction_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          method?: string
          note?: string | null
          organization_id: string
          paid_on?: string
          property_id: string
          receipt_id?: string | null
          recorded_by?: string | null
          reservation_id: string
          reverse_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          schedule_id?: string | null
          source?: string
        }
        Update: {
          amount?: number
          bank_transaction_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          method?: string
          note?: string | null
          organization_id?: string
          paid_on?: string
          property_id?: string
          receipt_id?: string | null
          recorded_by?: string | null
          reservation_id?: string
          reverse_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          schedule_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_bank_tx_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "payment_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "payment_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          locale: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          locale?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          locale?: string
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          active: boolean
          address: string
          city_id: string
          cleaning_inspection_required: boolean
          clock_without_location: boolean
          clock_without_location_at: string | null
          clock_without_location_by: string | null
          clock_without_location_reason: string | null
          created_at: string
          external_source_id: string | null
          geofence_radius_m: number
          id: string
          import_batch_id: string | null
          import_needs_review: boolean
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          organization_id: string
          qr_token: string
          source_system: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address: string
          city_id: string
          cleaning_inspection_required?: boolean
          clock_without_location?: boolean
          clock_without_location_at?: string | null
          clock_without_location_by?: string | null
          clock_without_location_reason?: string | null
          created_at?: string
          external_source_id?: string | null
          geofence_radius_m?: number
          id?: string
          import_batch_id?: string | null
          import_needs_review?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          organization_id?: string
          qr_token?: string
          source_system?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string
          city_id?: string
          cleaning_inspection_required?: boolean
          clock_without_location?: boolean
          clock_without_location_at?: string | null
          clock_without_location_by?: string | null
          clock_without_location_reason?: string | null
          created_at?: string
          external_source_id?: string | null
          geofence_radius_m?: number
          id?: string
          import_batch_id?: string | null
          import_needs_review?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          organization_id?: string
          qr_token?: string
          source_system?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          locale: string
          organization_id: string
          token: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          locale?: string
          organization_id: string
          token: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          locale?: string
          organization_id?: string
          token?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_plans: {
        Row: {
          active: boolean
          base_price: number
          code: string
          created_at: string
          currency: string
          guest_prices: Json
          id: string
          min_stay: number
          name: string
          organization_id: string
          property_id: string | null
          room_type_id: string
        }
        Insert: {
          active?: boolean
          base_price: number
          code: string
          created_at?: string
          currency?: string
          guest_prices?: Json
          id?: string
          min_stay?: number
          name: string
          organization_id: string
          property_id?: string | null
          room_type_id: string
        }
        Update: {
          active?: boolean
          base_price?: number
          code?: string
          created_at?: string
          currency?: string
          guest_prices?: Json
          id?: string
          min_stay?: number
          name?: string
          organization_id?: string
          property_id?: string | null
          room_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_plans_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_plans_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_customers: {
        Row: {
          linked_at: string
          linked_by: string | null
          organization_id: string
          payer_id: string
          reservation_id: string
        }
        Insert: {
          linked_at?: string
          linked_by?: string | null
          organization_id: string
          payer_id: string
          reservation_id: string
        }
        Update: {
          linked_at?: string
          linked_by?: string | null
          organization_id?: string
          payer_id?: string
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_customers_organization_id_payer_id_fkey"
            columns: ["organization_id", "payer_id"]
            isOneToOne: false
            referencedRelation: "customer_parties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reservation_customers_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_extensions: {
        Row: {
          created_at: string
          created_by: string | null
          days: number
          id: string
          new_check_out: string
          note: string | null
          old_check_out: string
          organization_id: string
          reservation_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          days: number
          id?: string
          new_check_out: string
          note?: string | null
          old_check_out: string
          organization_id: string
          reservation_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          days?: number
          id?: string
          new_check_out?: string
          note?: string | null
          old_check_out?: string
          organization_id?: string
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_extensions_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_occupants: {
        Row: {
          organization_id: string
          person_id: string
          reservation_id: string
        }
        Insert: {
          organization_id: string
          person_id: string
          reservation_id: string
        }
        Update: {
          organization_id?: string
          person_id?: string
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_occupants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_occupants_organization_id_person_id_fkey"
            columns: ["organization_id", "person_id"]
            isOneToOne: false
            referencedRelation: "customer_parties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reservation_occupants_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          booking_id: string | null
          channel: Database["public"]["Enums"]["reservation_channel"]
          check_in: string
          check_out: string
          company_name: string | null
          created_at: string
          created_by: string | null
          customer_type: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          discount_amount: number | null
          discount_reason: string | null
          external_created_at: string | null
          external_id: string | null
          guest_email: string | null
          guest_name: string
          guest_phone: string | null
          guests_confirmed: boolean
          guests_count: number
          ical_uid: string | null
          id: string
          list_price: number | null
          notes: string | null
          organization_id: string
          payer_ibans: string[]
          price_overridden_at: string | null
          price_overridden_by: string | null
          property_id: string
          revenue: number
          room_id: string
          status: Database["public"]["Enums"]["reservation_status"]
          status_before_delete:
            | Database["public"]["Enums"]["reservation_status"]
            | null
          tv_origin: string | null
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          channel?: Database["public"]["Enums"]["reservation_channel"]
          check_in: string
          check_out: string
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_type?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_amount?: number | null
          discount_reason?: string | null
          external_created_at?: string | null
          external_id?: string | null
          guest_email?: string | null
          guest_name: string
          guest_phone?: string | null
          guests_confirmed?: boolean
          guests_count?: number
          ical_uid?: string | null
          id?: string
          list_price?: number | null
          notes?: string | null
          organization_id?: string
          payer_ibans?: string[]
          price_overridden_at?: string | null
          price_overridden_by?: string | null
          property_id: string
          revenue?: number
          room_id: string
          status?: Database["public"]["Enums"]["reservation_status"]
          status_before_delete?:
            | Database["public"]["Enums"]["reservation_status"]
            | null
          tv_origin?: string | null
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          channel?: Database["public"]["Enums"]["reservation_channel"]
          check_in?: string
          check_out?: string
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_type?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_amount?: number | null
          discount_reason?: string | null
          external_created_at?: string | null
          external_id?: string | null
          guest_email?: string | null
          guest_name?: string
          guest_phone?: string | null
          guests_confirmed?: boolean
          guests_count?: number
          ical_uid?: string | null
          id?: string
          list_price?: number | null
          notes?: string | null
          organization_id?: string
          payer_ibans?: string[]
          price_overridden_at?: string | null
          price_overridden_by?: string | null
          property_id?: string
          revenue?: number
          room_id?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          status_before_delete?:
            | Database["public"]["Enums"]["reservation_status"]
            | null
          tv_origin?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room_operational_status"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "reservations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          allowed: boolean
          organization_id: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          allowed?: boolean
          organization_id?: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          organization_id?: string
          permission?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      room_issues: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          category: string
          created_at: string
          description: string
          id: string
          organization_id: string
          property_id: string
          reported_by: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          room_id: string
          status: string
          task_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          category?: string
          created_at?: string
          description: string
          id?: string
          organization_id: string
          property_id: string
          reported_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          room_id: string
          status?: string
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          organization_id?: string
          property_id?: string
          reported_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          room_id?: string
          status?: string
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_issues_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_issues_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_issues_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room_operational_status"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "room_issues_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_issues_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "cleaning_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      room_types: {
        Row: {
          active: boolean
          base_occupancy: number
          capacity: number
          code: string
          created_at: string
          description: string | null
          external_source_id: string | null
          id: string
          import_batch_id: string | null
          import_needs_review: boolean
          name: string
          organization_id: string
          property_id: string | null
          size_sqm: number | null
          source_system: string | null
        }
        Insert: {
          active?: boolean
          base_occupancy?: number
          capacity?: number
          code: string
          created_at?: string
          description?: string | null
          external_source_id?: string | null
          id?: string
          import_batch_id?: string | null
          import_needs_review?: boolean
          name: string
          organization_id: string
          property_id?: string | null
          size_sqm?: number | null
          source_system?: string | null
        }
        Update: {
          active?: boolean
          base_occupancy?: number
          capacity?: number
          code?: string
          created_at?: string
          description?: string | null
          external_source_id?: string | null
          id?: string
          import_batch_id?: string | null
          import_needs_review?: boolean
          name?: string
          organization_id?: string
          property_id?: string | null
          size_sqm?: number | null
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_types_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          active: boolean
          capacity: number
          channel_sync_mode: string
          created_at: string
          default_cleaner_id: string | null
          external_source_id: string | null
          floor: number | null
          ical_feed_token: string | null
          id: string
          import_batch_id: string | null
          import_needs_review: boolean
          key_code: string | null
          notes: string | null
          number: string
          organization_id: string
          property_id: string
          room_type_id: string | null
          sales_channels: string[]
          source_system: string | null
          source_title: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["room_status"]
          status_changed_at: string | null
          status_changed_by: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          capacity?: number
          channel_sync_mode?: string
          created_at?: string
          default_cleaner_id?: string | null
          external_source_id?: string | null
          floor?: number | null
          ical_feed_token?: string | null
          id?: string
          import_batch_id?: string | null
          import_needs_review?: boolean
          key_code?: string | null
          notes?: string | null
          number: string
          organization_id?: string
          property_id: string
          room_type_id?: string | null
          sales_channels?: string[]
          source_system?: string | null
          source_title?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["room_status"]
          status_changed_at?: string | null
          status_changed_by?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          capacity?: number
          channel_sync_mode?: string
          created_at?: string
          default_cleaner_id?: string | null
          external_source_id?: string | null
          floor?: number | null
          ical_feed_token?: string | null
          id?: string
          import_batch_id?: string | null
          import_needs_review?: boolean
          key_code?: string | null
          notes?: string | null
          number?: string
          organization_id?: string
          property_id?: string
          room_type_id?: string | null
          sales_channels?: string[]
          source_system?: string | null
          source_title?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["room_status"]
          status_changed_at?: string | null
          status_changed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_default_cleaner_id_fkey"
            columns: ["default_cleaner_id"]
            isOneToOne: false
            referencedRelation: "cleaners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_jobs: {
        Row: {
          attempts: number
          channel: Database["public"]["Enums"]["reservation_channel"]
          completed_at: string | null
          created_at: string
          direction: string
          error_message: string | null
          id: string
          integration_id: string | null
          organization_id: string
          payload: Json
          property_id: string | null
          result: Json | null
          room_id: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          channel: Database["public"]["Enums"]["reservation_channel"]
          completed_at?: string | null
          created_at?: string
          direction: string
          error_message?: string | null
          id?: string
          integration_id?: string | null
          organization_id?: string
          payload?: Json
          property_id?: string | null
          result?: Json | null
          room_id?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          channel?: Database["public"]["Enums"]["reservation_channel"]
          completed_at?: string | null
          created_at?: string
          direction?: string
          error_message?: string | null
          id?: string
          integration_id?: string | null
          organization_id?: string
          payload?: Json
          property_id?: string | null
          result?: Json | null
          room_id?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_jobs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "channel_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_jobs_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_jobs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_jobs_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room_operational_status"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "sync_jobs_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          break_minutes: number
          break_started_at: string | null
          cleaner_id: string
          clock_in_accuracy_m: number | null
          clock_in_at: string
          clock_in_lat: number | null
          clock_in_lng: number | null
          clock_out_at: string | null
          clock_out_lat: number | null
          clock_out_lng: number | null
          created_at: string
          id: string
          manual_override_at: string | null
          manual_override_by: string | null
          needs_review: boolean
          notes: string | null
          organization_id: string
          paid_amount: number | null
          paid_at: string | null
          paid_by: string | null
          payment_period_end: string | null
          payment_period_start: string | null
          property_id: string
          review_reason: string | null
          source: string
          status: Database["public"]["Enums"]["time_entry_status"]
          updated_at: string
        }
        Insert: {
          break_minutes?: number
          break_started_at?: string | null
          cleaner_id: string
          clock_in_accuracy_m?: number | null
          clock_in_at?: string
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          clock_out_at?: string | null
          clock_out_lat?: number | null
          clock_out_lng?: number | null
          created_at?: string
          id?: string
          manual_override_at?: string | null
          manual_override_by?: string | null
          needs_review?: boolean
          notes?: string | null
          organization_id?: string
          paid_amount?: number | null
          paid_at?: string | null
          paid_by?: string | null
          payment_period_end?: string | null
          payment_period_start?: string | null
          property_id: string
          review_reason?: string | null
          source?: string
          status?: Database["public"]["Enums"]["time_entry_status"]
          updated_at?: string
        }
        Update: {
          break_minutes?: number
          break_started_at?: string | null
          cleaner_id?: string
          clock_in_accuracy_m?: number | null
          clock_in_at?: string
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          clock_out_at?: string | null
          clock_out_lat?: number | null
          clock_out_lng?: number | null
          created_at?: string
          id?: string
          manual_override_at?: string | null
          manual_override_by?: string | null
          needs_review?: boolean
          notes?: string | null
          organization_id?: string
          paid_amount?: number | null
          paid_at?: string | null
          paid_by?: string | null
          payment_period_end?: string | null
          payment_period_start?: string | null
          property_id?: string
          review_reason?: string | null
          source?: string
          status?: Database["public"]["Enums"]["time_entry_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: false
            referencedRelation: "cleaners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entry_breaks: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          organization_id: string
          started_at: string
          time_entry_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          organization_id: string
          started_at?: string
          time_entry_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          organization_id?: string
          started_at?: string
          time_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entry_breaks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_breaks_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entry_corrections: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_break_minutes: number | null
          new_clock_in_at: string | null
          new_clock_out_at: string | null
          old_break_minutes: number | null
          old_clock_in_at: string | null
          old_clock_out_at: string | null
          organization_id: string
          reason: string | null
          time_entry_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_break_minutes?: number | null
          new_clock_in_at?: string | null
          new_clock_out_at?: string | null
          old_break_minutes?: number | null
          old_clock_in_at?: string | null
          old_clock_out_at?: string | null
          organization_id: string
          reason?: string | null
          time_entry_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_break_minutes?: number | null
          new_clock_in_at?: string | null
          new_clock_out_at?: string | null
          old_break_minutes?: number | null
          old_clock_in_at?: string | null
          old_clock_out_at?: string | null
          organization_id?: string
          reason?: string | null
          time_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entry_corrections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_corrections_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entry_overtime: {
        Row: {
          approved_at: string
          approved_by: string
          hourly_rate: number
          minutes: number
          organization_id: string
          reason: string
          time_entry_id: string
        }
        Insert: {
          approved_at?: string
          approved_by: string
          hourly_rate: number
          minutes: number
          organization_id: string
          reason: string
          time_entry_id: string
        }
        Update: {
          approved_at?: string
          approved_by?: string
          hourly_rate?: number
          minutes?: number
          organization_id?: string
          reason?: string
          time_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entry_overtime_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_overtime_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: true
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_activity: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          id: string
          kind: string
          organization_id: string
          todo_id: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          organization_id: string
          todo_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          organization_id?: string
          todo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_activity_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_activity_todo_id_fkey"
            columns: ["todo_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_attachments: {
        Row: {
          content_type: string
          created_at: string
          file_name: string
          id: string
          object_path: string
          organization_id: string
          size_bytes: number
          todo_id: string
          uploaded_by: string
        }
        Insert: {
          content_type: string
          created_at?: string
          file_name: string
          id?: string
          object_path: string
          organization_id: string
          size_bytes: number
          todo_id: string
          uploaded_by: string
        }
        Update: {
          content_type?: string
          created_at?: string
          file_name?: string
          id?: string
          object_path?: string
          organization_id?: string
          size_bytes?: number
          todo_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_attachments_todo_id_fkey"
            columns: ["todo_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id"]
          },
        ]
      }
      todos: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          created_at: string
          created_by: string | null
          department: string | null
          done: boolean
          done_at: string | null
          done_by: string | null
          due_at: string | null
          due_date: string | null
          id: string
          notes: string | null
          organization_id: string
          priority: string
          property_id: string | null
          recurrence: string
          recurrence_period: string | null
          recurrence_root: string | null
          reminder_at: string | null
          reminder_status: string
          reservation_id: string | null
          room_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          due_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          priority?: string
          property_id?: string | null
          recurrence?: string
          recurrence_period?: string | null
          recurrence_root?: string | null
          reminder_at?: string | null
          reminder_status?: string
          reservation_id?: string | null
          room_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          due_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          priority?: string
          property_id?: string | null
          recurrence?: string
          recurrence_period?: string | null
          recurrence_root?: string | null
          reminder_at?: string | null
          reminder_status?: string
          reservation_id?: string | null
          room_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "todos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room_operational_status"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "todos_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      tv_displays: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          organization_id: string
          revoked_at: string | null
          rotation_seconds: number
          token_hash: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          organization_id: string
          revoked_at?: string | null
          rotation_seconds?: number
          token_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          organization_id?: string
          revoked_at?: string | null
          rotation_seconds?: number
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "tv_displays_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tv_source_settings: {
        Row: {
          colors: Json
          organization_id: string
        }
        Insert: {
          colors?: Json
          organization_id: string
        }
        Update: {
          colors?: Json
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tv_source_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          allowed: boolean
          organization_id: string
          permission: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed: boolean
          organization_id?: string
          permission: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed?: boolean
          organization_id?: string
          permission?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wubook_inbox: {
        Row: {
          account_id: string | null
          event_type: string
          id: string
          lcode: string
          meta: Json | null
          organization_id: string
          rcode: string
          received_at: string
          status: string
        }
        Insert: {
          account_id?: string | null
          event_type: string
          id?: string
          lcode: string
          meta?: Json | null
          organization_id: string
          rcode: string
          received_at?: string
          status: string
        }
        Update: {
          account_id?: string | null
          event_type?: string
          id?: string
          lcode?: string
          meta?: Json | null
          organization_id?: string
          rcode?: string
          received_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "wubook_inbox_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "channel_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wubook_inbox_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      room_operational_status: {
        Row: {
          organization_id: string | null
          property_id: string | null
          room_id: string | null
          status: Database["public"]["Enums"]["room_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_organization_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _apply_bank_match: {
        Args: {
          _actor: string
          _allocations: Json
          _auto: boolean
          _link_payment_ids: string[]
          _tx_id: string
        }
        Returns: number
      }
      _purge_trashed_reservation: {
        Args: { _cutoff: string; _id: string }
        Returns: string
      }
      _require_room_manager: { Args: { _property_id: string }; Returns: string }
      access_secret_authorized: {
        Args: { _edit: boolean; _property: string; _room: string }
        Returns: string
      }
      active_organization_id: { Args: never; Returns: string }
      admin_get_member_properties: {
        Args: { _user_id: string }
        Returns: {
          property_id: string
        }[]
      }
      admin_get_property_qr: {
        Args: { _id: string }
        Returns: {
          address: string
          city_name: string
          geofence_radius_m: number
          id: string
          latitude: number
          longitude: number
          name: string
          qr_token: string
        }[]
      }
      admin_link_cleaner: {
        Args: { _cleaner_id: string; _user_id: string }
        Returns: undefined
      }
      admin_list_cleaner_rates: {
        Args: never
        Returns: {
          hourly_rate: number
          id: string
        }[]
      }
      admin_list_property_qr_tokens: {
        Args: never
        Returns: {
          id: string
          qr_token: string
        }[]
      }
      admin_list_users: {
        Args: never
        Returns: {
          banned_until: string
          created_at: string
          email: string
          full_name: string
          roles: Database["public"]["Enums"]["app_role"][]
          user_id: string
        }[]
      }
      admin_mark_time_entry_paid: {
        Args: {
          _amount: number
          _entry_id: string
          _period_end: string
          _period_start: string
        }
        Returns: undefined
      }
      admin_remove_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_resolve_access_request: {
        Args: {
          _approve: boolean
          _grant_role: Database["public"]["Enums"]["app_role"]
          _request_id: string
        }
        Returns: undefined
      }
      admin_set_member_name: {
        Args: { _full_name: string; _user_id: string }
        Returns: undefined
      }
      admin_set_member_properties: {
        Args: { _property_ids: string[]; _user_id: string }
        Returns: undefined
      }
      admin_set_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      app_to_org_role: {
        Args: { _r: Database["public"]["Enums"]["app_role"] }
        Returns: Database["public"]["Enums"]["org_role"]
      }
      apply_bank_match: {
        Args: {
          _allocations: Json
          _link_payment_ids?: string[]
          _tx_id: string
        }
        Returns: number
      }
      approve_time_entry_overtime: {
        Args: { _entry_id: string; _minutes: number; _reason: string }
        Returns: undefined
      }
      assign_cleaning_task: {
        Args: { _cleaner_id?: string; _task_id: string }
        Returns: undefined
      }
      assign_room_issue: {
        Args: { _issue_id: string; _user_id?: string }
        Returns: undefined
      }
      attach_audit: { Args: { target: unknown }; Returns: undefined }
      attendance_personnel: { Args: never; Returns: Json }
      attendance_review_controls: { Args: never; Returns: Json }
      can_access_property: { Args: { _property: string }; Returns: boolean }
      can_finance_action: {
        Args: { _org: string; _permission: string; _property: string }
        Returns: boolean
      }
      can_manage_payments: {
        Args: { _org: string; _property: string }
        Returns: boolean
      }
      can_read_bank_transactions: { Args: { _org: string }; Returns: boolean }
      can_read_customer: {
        Args: { _id: string; _org: string }
        Returns: boolean
      }
      can_read_employee_time: {
        Args: { _org: string; _property?: string; _user: string }
        Returns: boolean
      }
      can_read_todo: { Args: { _id: string }; Returns: boolean }
      can_reset_member_password: { Args: { _target: string }; Returns: boolean }
      claim_morning_push: {
        Args: { _day: string; _org: string; _user: string }
        Returns: boolean
      }
      cleaner_user: { Args: { _cleaner: string }; Returns: string }
      cleaning_assignment_options: {
        Args: never
        Returns: {
          cleaner_id: string
          full_name: string
          property_id: string
        }[]
      }
      clock_break_end: { Args: { _entry_id: string }; Returns: string }
      clock_break_start: { Args: { _entry_id: string }; Returns: string }
      clock_start: {
        Args: {
          _accuracy: number
          _lat: number
          _lng: number
          _property_id: string
          _source?: string
          _token: string
        }
        Returns: string
      }
      clock_start_for_task: {
        Args: {
          _accuracy: number
          _lat: number
          _lng: number
          _task_id: string
        }
        Returns: string
      }
      clock_stop: {
        Args: { _entry_id: string; _lat: number; _lng: number }
        Returns: undefined
      }
      clock_toggle_break: { Args: { _entry_id: string }; Returns: string }
      collect_payment_receipt: {
        Args: {
          _allocations: Json
          _amount: number
          _date: string
          _kind?: string
          _method: string
          _note: string
          _request_id: string
          _reservation: string
        }
        Returns: string
      }
      correct_time_entry: {
        Args: {
          _break_minutes: number
          _clock_in_at: string
          _clock_out_at: string
          _entry_id: string
          _reason: string
        }
        Returns: undefined
      }
      create_booking_with_reservations: {
        Args: { _booking: Json; _lines: Json }
        Returns: string
      }
      create_customer_booking: {
        Args: { _booking: Json; _lines: Json }
        Returns: string
      }
      create_rooms_bulk: {
        Args: {
          _floor: number
          _numbers: string[]
          _property_id: string
          _room_type_id: string
        }
        Returns: number
      }
      create_tv_display: { Args: { _name: string }; Returns: Json }
      customer_history: {
        Args: {
          _active?: boolean
          _from?: string
          _kind?: string
          _page?: number
          _party?: string
          _person?: string
          _property?: string
          _search?: string
          _size?: number
          _status?: string
          _to?: string
        }
        Returns: Json
      }
      default_organization_id: { Args: never; Returns: string }
      department_work_report: {
        Args: { _from: string; _property?: string; _to: string }
        Returns: Json
      }
      employee_attendance_board: {
        Args: { _from: string; _to: string; _user_id?: string }
        Returns: Json
      }
      exclude_bank_transaction: {
        Args: { _reason: string; _tx_id: string }
        Returns: undefined
      }
      extend_reservation: {
        Args: {
          _new_check_out: string
          _note?: string
          _reservation_id: string
        }
        Returns: string
      }
      finance_dashboard: { Args: { _today: string }; Returns: Json }
      finance_installment_page: {
        Args: {
          _filter?: string
          _page?: number
          _search?: string
          _size?: number
          _today: string
        }
        Returns: Json
      }
      finance_plan_candidates: {
        Args: {
          _page?: number
          _search?: string
          _size?: number
          _today: string
        }
        Returns: Json
      }
      general_todo_action: {
        Args: { _action: string; _id: string; _note?: string }
        Returns: undefined
      }
      guest_directory: {
        Args: {
          _kind?: string
          _page?: number
          _search?: string
          _size?: number
        }
        Returns: Json
      }
      has_department_assignment: {
        Args: { _department: string; _org: string; _target?: string }
        Returns: boolean
      }
      has_department_power: {
        Args: { _org: string; _power: string; _target_user: string }
        Returns: boolean
      }
      has_organization_permission: {
        Args: { _org: string; _permission: string }
        Returns: boolean
      }
      has_organization_role: {
        Args: {
          _org: string
          _roles: Database["public"]["Enums"]["org_role"][]
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_wp_rooms: { Args: { _batch: Json }; Returns: Json }
      is_department_lead: {
        Args: { _department: string; _org: string }
        Returns: boolean
      }
      is_department_worker: {
        Args: { _department: string; _org: string; _user: string }
        Returns: boolean
      }
      is_org_admin: { Args: { _org: string }; Returns: boolean }
      is_organization_member: { Args: { _org: string }; Returns: boolean }
      link_reservation_customers: {
        Args: {
          _confirm: boolean
          _payer: string
          _people: string[]
          _reservations: string[]
        }
        Returns: undefined
      }
      list_access_secret_metadata: {
        Args: { _property: string; _room?: string }
        Returns: Json
      }
      list_my_clock_properties: {
        Args: never
        Returns: {
          geofence_radius_m: number
          id: string
          latitude: number
          longitude: number
          name: string
          qr_token: string
        }[]
      }
      list_reservation_trash: {
        Args: {
          _from?: string
          _limit?: number
          _offset?: number
          _search?: string
          _to?: string
        }
        Returns: Json
      }
      list_team_cleaners: {
        Args: never
        Returns: {
          active: boolean
          email: string
          full_name: string
          id: string
          notes: string
          phone: string
          user_id: string
        }[]
      }
      maintenance_board: { Args: never; Returns: Json }
      member_user: { Args: { _member: string }; Returns: string }
      morning_task_counts: {
        Args: { _day: string }
        Returns: {
          organization_id: string
          overdue_count: number
          today_count: number
          user_id: string
        }[]
      }
      move_rooms_to_type: {
        Args: { _from_type: string; _to_type: string }
        Returns: number
      }
      my_app_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      my_org_role: {
        Args: { _org?: string }
        Returns: Database["public"]["Enums"]["org_role"]
      }
      my_report_teams: { Args: never; Returns: string[] }
      my_shift_context: { Args: { _property_id?: string }; Returns: Json }
      my_time_management_access: { Args: never; Returns: boolean }
      my_todo_departments: {
        Args: never
        Returns: {
          department: string
          is_lead: boolean
          members: string[]
        }[]
      }
      org_to_app_role: {
        Args: { _r: Database["public"]["Enums"]["org_role"] }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      overtime_board: { Args: { _from: string; _to: string }; Returns: Json }
      payment_reservation_context: {
        Args: { _reservation: string }
        Returns: Json
      }
      personnel_overtime: {
        Args: { _from: string; _to: string; _user_id: string }
        Returns: Json
      }
      purge_expired_reservation_trash: {
        Args: { _now?: string }
        Returns: Json
      }
      purge_reservation: { Args: { _id: string }; Returns: undefined }
      quote_room_price:
        | {
            Args: { _check_in: string; _check_out: string; _room_id: string }
            Returns: number
          }
        | {
            Args: {
              _check_in: string
              _check_out: string
              _guests: number
              _room_id: string
            }
            Returns: number
          }
      remove_todo_attachment: { Args: { _id: string }; Returns: undefined }
      reopen_cleaning_task: {
        Args: {
          _reason: string
          _task_id: string
          _to: Database["public"]["Enums"]["cleaning_status"]
        }
        Returns: undefined
      }
      replace_payment_plan: {
        Args: {
          _ibans: string[]
          _reservation: string
          _retained: Json
          _rows: Json
        }
        Returns: undefined
      }
      report_room_issue: {
        Args: {
          _category: string
          _description?: string
          _room_id: string
          _task_id?: string
        }
        Returns: string
      }
      request_access: {
        Args: {
          _message: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: string
      }
      reservation_trash_blocker: { Args: { _id: string }; Returns: string }
      reserve_todo_attachment: {
        Args: {
          _file_name: string
          _size: number
          _todo: string
          _type: string
        }
        Returns: Json
      }
      resolve_clock_property: {
        Args: { _token: string }
        Returns: {
          address: string
          geofence_radius_m: number
          id: string
          latitude: number
          longitude: number
          name: string
        }[]
      }
      resolve_room_issue: {
        Args: { _issue_id: string; _note?: string }
        Returns: undefined
      }
      restore_reservation: { Args: { _id: string }; Returns: undefined }
      reveal_access_secret: {
        Args: { _kind: string; _property: string; _room: string }
        Returns: string
      }
      reverse_manual_payment: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      review_cleaning_task: {
        Args: { _approved: boolean; _reason?: string; _task_id: string }
        Returns: undefined
      }
      review_stale_shifts: { Args: never; Returns: number }
      revoke_tv_display: { Args: { _id: string }; Returns: undefined }
      room_capacity: { Args: { _room_id: string }; Returns: number }
      room_type_availability: {
        Args: { _date: string; _property: string }
        Returns: {
          booked: number
          free: number
          room_type_id: string
          total: number
        }[]
      }
      save_access_secret: {
        Args: {
          _from?: string
          _kind: string
          _property: string
          _room: string
          _until?: string
          _value: string
        }
        Returns: undefined
      }
      save_attendance_review_controls: {
        Args: { _review: number; _warning: number }
        Returns: undefined
      }
      save_customer: { Args: { _data: Json; _id?: string }; Returns: string }
      save_general_todo: { Args: { _input: Json }; Returns: string }
      save_guest_prices: {
        Args: { _prices: Json; _room_type_id: string }
        Returns: undefined
      }
      save_occupancy_prices: {
        Args: {
          _from: string
          _prices: Json
          _room_type_id: string
          _to: string
        }
        Returns: number
      }
      save_reservation_payer_ibans: {
        Args: { _ibans: string[]; _reservation: string }
        Returns: undefined
      }
      save_room_type_full: {
        Args: {
          _base_occupancy: number
          _capacity: number
          _code: string
          _description: string
          _name: string
          _price: number
          _property_id: string
          _room_type_id: string
        }
        Returns: string
      }
      save_room_type_with_plan: {
        Args: {
          _capacity: number
          _name: string
          _price: number
          _property_id: string
          _room_type_id: string
        }
        Returns: string
      }
      save_tv_source_colors: { Args: { _colors: Json }; Returns: undefined }
      set_cleaning_inspection_preference: {
        Args: { _property: string; _required: boolean }
        Returns: undefined
      }
      set_employee_overtime_rate: {
        Args: { _cleaner_id: string; _rate: number }
        Returns: undefined
      }
      set_room_type_active: {
        Args: { _active: boolean; _room_type_id: string }
        Returns: undefined
      }
      set_rooms_distribution: {
        Args: { _channels: string[]; _mode: string; _room_ids: string[] }
        Returns: number
      }
      set_rooms_status: {
        Args: {
          _room_ids: string[]
          _status: Database["public"]["Enums"]["room_status"]
        }
        Returns: number
      }
      set_tv_rotation: {
        Args: { _id: string; _seconds: number }
        Returns: undefined
      }
      soft_delete_reservation: {
        Args: { _id: string; _reason?: string }
        Returns: undefined
      }
      sync_member_time_profile: {
        Args: { _member: string }
        Returns: undefined
      }
      todo_attachment_access: {
        Args: { _path: string; _write: boolean }
        Returns: boolean
      }
      todo_member_names: {
        Args: never
        Returns: {
          full_name: string
          id: string
        }[]
      }
      transition_cleaning_task: {
        Args: {
          _task_id: string
          _to: Database["public"]["Enums"]["cleaning_status"]
        }
        Returns: Database["public"]["Enums"]["cleaning_status"]
      }
      tv_snapshot: { Args: { _token: string }; Returns: Json }
      tv_snapshot_v2: { Args: { _token: string }; Returns: Json }
      tv_snapshot_v3: { Args: { _token: string }; Returns: Json }
      tv_snapshot_v3_base: { Args: { _token: string }; Returns: Json }
      tv_snapshot_v3_rooms: { Args: { _token: string }; Returns: Json }
      unmatch_bank_transaction: {
        Args: { _reason: string; _tx_id: string }
        Returns: undefined
      }
      update_guest_contact: {
        Args: {
          _address: string
          _company: string
          _contact: string
          _email: string
          _phone: string
          _reservation: string
          _vat: string
        }
        Returns: undefined
      }
      verify_cron_secret: {
        Args: { _name: string; _value: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "manager" | "cleaner" | "admin" | "reception"
      cleaning_status:
        | "pending"
        | "accepted"
        | "in_progress"
        | "completed"
        | "problem"
      org_role:
        | "owner"
        | "admin"
        | "operations_manager"
        | "property_manager"
        | "reception"
        | "cleaner"
      reservation_channel:
        | "booking"
        | "airbnb"
        | "check24"
        | "woocommerce"
        | "phone"
        | "direct"
        | "walkin"
        | "website"
        | "ical"
        | "expedia"
      reservation_status:
        | "confirmed"
        | "tentative"
        | "cancelled"
        | "no_show"
        | "checked_in"
        | "checked_out"
      room_status:
        | "available"
        | "occupied"
        | "checkout_today"
        | "cleaning_required"
        | "cleaning_in_progress"
        | "cleaned"
        | "maintenance"
      time_entry_status:
        | "active"
        | "on_break"
        | "completed"
        | "manually_adjusted"
        | "auto_closed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "manager", "cleaner", "admin", "reception"],
      cleaning_status: [
        "pending",
        "accepted",
        "in_progress",
        "completed",
        "problem",
      ],
      org_role: [
        "owner",
        "admin",
        "operations_manager",
        "property_manager",
        "reception",
        "cleaner",
      ],
      reservation_channel: [
        "booking",
        "airbnb",
        "check24",
        "woocommerce",
        "phone",
        "direct",
        "walkin",
        "website",
        "ical",
        "expedia",
      ],
      reservation_status: [
        "confirmed",
        "tentative",
        "cancelled",
        "no_show",
        "checked_in",
        "checked_out",
      ],
      room_status: [
        "available",
        "occupied",
        "checkout_today",
        "cleaning_required",
        "cleaning_in_progress",
        "cleaned",
        "maintenance",
      ],
      time_entry_status: [
        "active",
        "on_break",
        "completed",
        "manually_adjusted",
        "auto_closed",
      ],
    },
  },
} as const
