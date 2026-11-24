/**
 * Schema types for the Supabase database.
 *
 * These mirror `supabase/migrations/*.sql`. Regenerate with `npm run db:types`
 * after starting local Supabase (`supabase start`); the checked-in copy keeps
 * the app and tests type-safe without a running database.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          display_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      households: {
        Row: {
          id: string
          name: string
          invite_code: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          invite_code: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          invite_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      household_members: {
        Row: {
          household_id: string
          user_id: string
          role: Database["public"]["Enums"]["household_role"]
          created_at: string
        }
        Insert: {
          household_id: string
          user_id: string
          role: Database["public"]["Enums"]["household_role"]
          created_at?: string
        }
        Update: {
          role?: Database["public"]["Enums"]["household_role"]
        }
        Relationships: []
      }
      patients: {
        Row: {
          id: string
          household_id: string
          name: string
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          name: string
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          archived_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      medicines: {
        Row: {
          id: string
          patient_id: string
          name: string
          dosage_amount: number
          dosage_unit: Database["public"]["Enums"]["dosage_unit"]
          frequency_per_day: number
          schedule_mode: Database["public"]["Enums"]["schedule_mode"]
          first_dose_time: string
          custom_times: string[] | null
          schedule_times: string[]
          stock_on_hand: number
          expiration_date: string
          treatment_end_date: string | null
          archived_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          name: string
          dosage_amount: number
          dosage_unit?: Database["public"]["Enums"]["dosage_unit"]
          frequency_per_day: number
          schedule_mode?: Database["public"]["Enums"]["schedule_mode"]
          first_dose_time?: string
          custom_times?: string[] | null
          schedule_times: string[]
          stock_on_hand?: number
          expiration_date: string
          treatment_end_date?: string | null
          archived_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          patient_id?: string
          name?: string
          dosage_amount?: number
          dosage_unit?: Database["public"]["Enums"]["dosage_unit"]
          frequency_per_day?: number
          schedule_mode?: Database["public"]["Enums"]["schedule_mode"]
          first_dose_time?: string
          custom_times?: string[] | null
          schedule_times?: string[]
          stock_on_hand?: number
          expiration_date?: string
          treatment_end_date?: string | null
          archived_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      dose_logs: {
        Row: {
          id: string
          medicine_id: string
          patient_id: string
          scheduled_date: string
          scheduled_time: string
          scheduled_for: string
          timezone: string
          status: Database["public"]["Enums"]["dose_status"]
          skip_reason: Database["public"]["Enums"]["skip_reason"] | null
          skip_note: string | null
          logged_by: string | null
          logged_at: string
          last_modified_by: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          medicine_id: string
          patient_id: string
          scheduled_date: string
          scheduled_time: string
          scheduled_for: string
          timezone?: string
          status: Database["public"]["Enums"]["dose_status"]
          skip_reason?: Database["public"]["Enums"]["skip_reason"] | null
          skip_note?: string | null
          logged_by?: string | null
          logged_at?: string
          last_modified_by?: string | null
          updated_at?: string
        }
        Update: {
          status?: Database["public"]["Enums"]["dose_status"]
          skip_reason?: Database["public"]["Enums"]["skip_reason"] | null
          skip_note?: string | null
          last_modified_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      stock_adjustments: {
        Row: {
          id: string
          medicine_id: string
          delta: number
          reason: Database["public"]["Enums"]["stock_change_reason"]
          actor: string | null
          dose_log_id: string | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          medicine_id: string
          delta: number
          reason: Database["public"]["Enums"]["stock_change_reason"]
          actor?: string | null
          dose_log_id?: string | null
          note?: string | null
          created_at?: string
        }
        Update: {
          note?: string | null
        }
        Relationships: []
      }
      join_attempts: {
        Row: {
          id: number
          user_id: string | null
          succeeded: boolean
          attempted_at: string
        }
        Insert: {
          user_id?: string | null
          succeeded: boolean
          attempted_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      join_household: {
        Args: { p_code: string }
        Returns: string
      }
      regenerate_invite_code: {
        Args: { p_household_id: string }
        Returns: string
      }
      get_invite_code: {
        Args: { p_household_id: string }
        Returns: string
      }
      restock_medicine: {
        Args: { p_medicine_id: string; p_quantity: number }
        Returns: number
      }
      log_dose: {
        Args: {
          p_medicine_id: string
          p_scheduled_date: string
          p_scheduled_time: string
          p_status: string
          p_skip_reason?: string | null
          p_skip_note?: string | null
          p_timezone?: string
        }
        Returns: string
      }
      update_dose_status: {
        Args: {
          p_dose_log_id: string
          p_status: string
          p_skip_reason?: string | null
          p_skip_note?: string | null
        }
        Returns: string
      }
      purge_patient: { Args: { p_patient_id: string }; Returns: undefined }
      purge_medicine: { Args: { p_medicine_id: string }; Returns: undefined }
      remove_caregiver: {
        Args: { p_household_id: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      household_role: "owner" | "caregiver"
      dose_status: "pending" | "taken" | "skipped"
      skip_reason: "forgot" | "out_of_stock" | "felt_unwell" | "doctor_advised"
      dosage_unit: "mg" | "ml"
      schedule_mode: "waking_hours" | "strict_interval" | "custom"
      stock_change_reason:
        | "initial"
        | "dose_taken"
        | "dose_reverted"
        | "restock"
        | "owner_edit"
    }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"]
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T]
