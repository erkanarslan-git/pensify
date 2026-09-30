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
          requested_role?: Database["public"]["Enums"]["app_role"] | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
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
        }
        Relationships: []
      }
      bookings: {
        Row: {
          booking_ref: string
          channel: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
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
          primary_guest_email?: string | null
          primary_guest_name?: string
          primary_guest_phone?: string | null
          updated_at?: string
        }
        Relationships: []
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
          property_id?: string
          room_id?: string | null
          updated_at?: string
        }
        Relationships: [
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
      cities: {
        Row: {
          country: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
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
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      cleaning_tasks: {
        Row: {
          cleaner_id: string | null
          completed_at: string | null
          created_at: string
          due_at: string
          id: string
          notes: string | null
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
      dispatch_messages: {
        Row: {
          body: string
          cleaner_id: string
          created_at: string
          error: string | null
          id: string
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
        ]
      }
      dispatch_replies: {
        Row: {
          applied: boolean
          applied_error: string | null
          cleaner_id: string
          id: string
          message_id: string | null
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
            foreignKeyName: "dispatch_replies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "cleaning_tasks"
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
          created_at: string
          geofence_radius_m: number
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
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
          permission: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          allowed?: boolean
          permission: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          permission?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
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
          permission: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed: boolean
          permission: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed?: boolean
          permission?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      admin_set_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      attach_audit: { Args: { target: unknown }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
    }
    Enums: {
      app_role: "owner" | "manager" | "cleaner" | "admin" | "reception"
      cleaning_status:
        | "pending"
        | "accepted"
        | "in_progress"
        | "completed"
        | "problem"
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
