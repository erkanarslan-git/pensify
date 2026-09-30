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
      bookings: {
        Row: {
          booking_ref: string
          channel: string | null
          created_at: string
          created_by: string | null
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
          created_at?: string
          created_by?: string | null
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
          created_at?: string
          created_by?: string | null
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
            referencedRelation: "rooms"
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
      occupancy_rates: {
        Row: {
          closed: boolean
          created_at: string
          date: string
          id: string
          min_stay: number | null
          organization_id: string
          price: number
          rate_plan_id: string
        }
        Insert: {
          closed?: boolean
          created_at?: string
          date: string
          id?: string
          min_stay?: number | null
          organization_id: string
          price: number
          rate_plan_id: string
        }
        Update: {
          closed?: boolean
          created_at?: string
          date?: string
          id?: string
          min_stay?: number | null
          organization_id?: string
          price?: number
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
            foreignKeyName: "occupancy_rates_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
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
          created_at: string
          geofence_radius_m: number
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          organization_id: string
          qr_token: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address: string
          city_id: string
          created_at?: string
          geofence_radius_m?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          organization_id?: string
          qr_token?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string
          city_id?: string
          created_at?: string
          geofence_radius_m?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          organization_id?: string
          qr_token?: string
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
      rate_plans: {
        Row: {
          active: boolean
          base_price: number
          code: string
          created_at: string
          currency: string
          id: string
          min_stay: number
          name: string
          organization_id: string
          room_type_id: string
        }
        Insert: {
          active?: boolean
          base_price: number
          code: string
          created_at?: string
          currency?: string
          id?: string
          min_stay?: number
          name: string
          organization_id: string
          room_type_id: string
        }
        Update: {
          active?: boolean
          base_price?: number
          code?: string
          created_at?: string
          currency?: string
          id?: string
          min_stay?: number
          name?: string
          organization_id?: string
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
            foreignKeyName: "rate_plans_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
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
          created_at: string
          created_by: string | null
          external_id: string | null
          guest_email: string | null
          guest_name: string
          guest_phone: string | null
          guests_count: number
          ical_uid: string | null
          id: string
          notes: string | null
          organization_id: string
          property_id: string
          revenue: number
          room_id: string
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          channel?: Database["public"]["Enums"]["reservation_channel"]
          check_in: string
          check_out: string
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          guest_email?: string | null
          guest_name: string
          guest_phone?: string | null
          guests_count?: number
          ical_uid?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          property_id: string
          revenue?: number
          room_id: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          channel?: Database["public"]["Enums"]["reservation_channel"]
          check_in?: string
          check_out?: string
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          guest_email?: string | null
          guest_name?: string
          guest_phone?: string | null
          guests_count?: number
          ical_uid?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          property_id?: string
          revenue?: number
          room_id?: string
          status?: Database["public"]["Enums"]["reservation_status"]
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
      room_types: {
        Row: {
          active: boolean
          base_occupancy: number
          capacity: number
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
          size_sqm: number | null
        }
        Insert: {
          active?: boolean
          base_occupancy?: number
          capacity?: number
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          size_sqm?: number | null
        }
        Update: {
          active?: boolean
          base_occupancy?: number
          capacity?: number
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          size_sqm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "room_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          capacity: number
          created_at: string
          default_cleaner_id: string | null
          floor: number | null
          ical_feed_token: string | null
          id: string
          notes: string | null
          number: string
          organization_id: string
          property_id: string
          status: Database["public"]["Enums"]["room_status"]
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          default_cleaner_id?: string | null
          floor?: number | null
          ical_feed_token?: string | null
          id?: string
          notes?: string | null
          number: string
          organization_id?: string
          property_id: string
          status?: Database["public"]["Enums"]["room_status"]
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          default_cleaner_id?: string | null
          floor?: number | null
          ical_feed_token?: string | null
          id?: string
          notes?: string | null
          number?: string
          organization_id?: string
          property_id?: string
          status?: Database["public"]["Enums"]["room_status"]
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
          notes: string | null
          organization_id: string
          paid_amount: number | null
          paid_at: string | null
          paid_by: string | null
          payment_period_end: string | null
          payment_period_start: string | null
          property_id: string
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
          notes?: string | null
          organization_id?: string
          paid_amount?: number | null
          paid_at?: string | null
          paid_by?: string | null
          payment_period_end?: string | null
          payment_period_start?: string | null
          property_id: string
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
          notes?: string | null
          organization_id?: string
          paid_amount?: number | null
          paid_at?: string | null
          paid_by?: string | null
          payment_period_end?: string | null
          payment_period_start?: string | null
          property_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      attach_audit: { Args: { target: unknown }; Returns: undefined }
      can_access_property: { Args: { _property: string }; Returns: boolean }
      create_booking_with_reservations: {
        Args: { _booking: Json; _lines: Json }
        Returns: string
      }
      default_organization_id: { Args: never; Returns: string }
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
      is_org_admin: { Args: { _org: string }; Returns: boolean }
      is_organization_member: { Args: { _org: string }; Returns: boolean }
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
      my_app_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      my_org_role: {
        Args: { _org?: string }
        Returns: Database["public"]["Enums"]["org_role"]
      }
      org_to_app_role: {
        Args: { _r: Database["public"]["Enums"]["org_role"] }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      request_access: {
        Args: {
          _message: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: string
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
