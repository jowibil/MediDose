
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18'
  }
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "dose_logs": {
                  Row: {
                    "id": string,"last_modified_by": string | null,"logged_at": string,"logged_by": string | null,"medicine_id": string,"patient_id": string,"scheduled_date": string,"scheduled_for": string,"scheduled_time": string,"skip_note": string | null,"skip_reason": Database["public"]['Enums']["skip_reason"] | null,"status": Database["public"]['Enums']["dose_status"],"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"last_modified_by"?: string | null,"logged_at"?: string,"logged_by"?: string | null,"medicine_id": string,"patient_id": string,"scheduled_date": string,"scheduled_for": string,"scheduled_time": string,"skip_note"?: string | null,"skip_reason"?: Database["public"]['Enums']["skip_reason"] | null,"status": Database["public"]['Enums']["dose_status"],"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "id"?: string,"last_modified_by"?: string | null,"logged_at"?: string,"logged_by"?: string | null,"medicine_id"?: string,"patient_id"?: string,"scheduled_date"?: string,"scheduled_for"?: string,"scheduled_time"?: string,"skip_note"?: string | null,"skip_reason"?: Database["public"]['Enums']["skip_reason"] | null,"status"?: Database["public"]['Enums']["dose_status"],"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dose_logs_last_modified_by_fkey"
      columns: ["last_modified_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dose_logs_logged_by_fkey"
      columns: ["logged_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dose_logs_medicine_id_fkey"
      columns: ["medicine_id"]
isOneToOne: false
      referencedRelation: "medicines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dose_logs_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    }
                  ]
                },"household_members": {
                  Row: {
                    "created_at": string,"household_id": string,"role": Database["public"]['Enums']["household_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"household_id": string,"role": Database["public"]['Enums']["household_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"household_id"?: string,"role"?: Database["public"]['Enums']["household_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "household_members_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "household_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"households": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"invite_code": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"invite_code": string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"invite_code"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "households_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"join_attempts": {
                  Row: {
                    "attempted_at": string,"id": number,"succeeded": boolean,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempted_at"?: string,"id"?: number,"succeeded": boolean,"user_id"?: string | null
                  }
                  Update: {
                    "attempted_at"?: string,"id"?: number,"succeeded"?: boolean,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "join_attempts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"medicines": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"created_by": string | null,"custom_times": (string)[] | null,"dosage_amount": number,"dosage_unit": Database["public"]['Enums']["dosage_unit"],"expiration_date": string,"first_dose_time": string,"frequency_per_day": number,"id": string,"name": string,"patient_id": string,"schedule_mode": Database["public"]['Enums']["schedule_mode"],"schedule_times": (string)[],"stock_on_hand": number,"treatment_end_date": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"custom_times"?: (string)[] | null,"dosage_amount": number,"dosage_unit"?: Database["public"]['Enums']["dosage_unit"],"expiration_date": string,"first_dose_time"?: string,"frequency_per_day": number,"id"?: string,"name": string,"patient_id": string,"schedule_mode"?: Database["public"]['Enums']["schedule_mode"],"schedule_times": (string)[],"stock_on_hand"?: number,"treatment_end_date"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"custom_times"?: (string)[] | null,"dosage_amount"?: number,"dosage_unit"?: Database["public"]['Enums']["dosage_unit"],"expiration_date"?: string,"first_dose_time"?: string,"frequency_per_day"?: number,"id"?: string,"name"?: string,"patient_id"?: string,"schedule_mode"?: Database["public"]['Enums']["schedule_mode"],"schedule_times"?: (string)[],"stock_on_hand"?: number,"treatment_end_date"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "medicines_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "medicines_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    }
                  ]
                },"patients": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"household_id": string,"id": string,"link_code": string | null,"name": string,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"household_id": string,"id"?: string,"link_code"?: string | null,"name": string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"household_id"?: string,"id"?: string,"link_code"?: string | null,"name"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "patients_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "patients_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"stock_adjustments": {
                  Row: {
                    "actor": string | null,"created_at": string,"delta": number,"dose_log_id": string | null,"id": string,"medicine_id": string,"note": string | null,"reason": Database["public"]['Enums']["stock_change_reason"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actor"?: string | null,"created_at"?: string,"delta": number,"dose_log_id"?: string | null,"id"?: string,"medicine_id": string,"note"?: string | null,"reason": Database["public"]['Enums']["stock_change_reason"]
                  }
                  Update: {
                    "actor"?: string | null,"created_at"?: string,"delta"?: number,"dose_log_id"?: string | null,"id"?: string,"medicine_id"?: string,"note"?: string | null,"reason"?: Database["public"]['Enums']["stock_change_reason"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_adjustments_actor_fkey"
      columns: ["actor"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_adjustments_dose_log_id_fkey"
      columns: ["dose_log_id"]
isOneToOne: false
      referencedRelation: "dose_logs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_adjustments_medicine_id_fkey"
      columns: ["medicine_id"]
isOneToOne: false
      referencedRelation: "medicines"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "archive_patient":
{ Args: { "p_patient_id": string }; Returns: undefined
                           },
"can_view_medicine":
{ Args: { "mid": string }; Returns: boolean
                           },
"can_view_patient":
{ Args: { "pid": string }; Returns: boolean
                           },
"claim_patient":
{ Args: { "p_code": string }; Returns: string
                           },
"generate_invite_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"get_invite_code":
{ Args: { "p_household_id": string }; Returns: string
                           },
"get_patient_link_code":
{ Args: { "p_patient_id": string }; Returns: string
                           },
"household_role":
{ Args: { "hid": string }; Returns: string
                           },
"is_household_member":
{ Args: { "hid": string }; Returns: boolean
                           },
"is_household_owner":
{ Args: { "hid": string }; Returns: boolean
                           },
"is_household_staff":
{ Args: { "hid": string }; Returns: boolean
                           },
"join_household":
{ Args: { "p_code": string }; Returns: string
                           },
"log_dose":
{ Args: { "p_medicine_id": string,"p_scheduled_date": string,"p_scheduled_time": string,"p_skip_note"?: string,"p_skip_reason"?: string,"p_status": string,"p_timezone"?: string }; Returns: string
                           },
"medicine_household":
{ Args: { "mid": string }; Returns: string
                           },
"patient_household":
{ Args: { "pid": string }; Returns: string
                           },
"patient_link_status":
{ Args: { "p_patient_id": string }; Returns: string
                           },
"purge_medicine":
{ Args: { "p_medicine_id": string }; Returns: undefined
                           },
"purge_patient":
{ Args: { "p_patient_id": string }; Returns: undefined
                           },
"regenerate_invite_code":
{ Args: { "p_household_id": string }; Returns: string
                           },
"remove_caregiver":
{ Args: { "p_household_id": string,"p_user_id": string }; Returns: undefined
                           },
"restock_medicine":
{ Args: { "p_medicine_id": string,"p_quantity": number }; Returns: number
                           },
"self_patient_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"set_patient_link_code":
{ Args: { "p_patient_id": string }; Returns: string
                           },
"shares_household_with":
{ Args: { "uid": string }; Returns: boolean
                           },
"unlink_patient":
{ Args: { "p_patient_id": string }; Returns: undefined
                           },
"update_dose_status":
{ Args: { "p_dose_log_id": string,"p_skip_note"?: string,"p_skip_reason"?: string,"p_status": string }; Returns: string
                           }
          }
          Enums: {
            "dosage_unit": "mg"|"ml","dose_status": "pending"|"taken"|"skipped","household_role": "owner"|"caregiver"|"patient","schedule_mode": "waking_hours"|"strict_interval"|"custom","skip_reason": "forgot"|"out_of_stock"|"felt_unwell"|"doctor_advised","stock_change_reason": "initial"|"dose_taken"|"dose_reverted"|"restock"|"owner_edit"|"disposed"|"dispose_reverted"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "dosage_unit": ["mg", "ml"],"dose_status": ["pending", "taken", "skipped"],"household_role": ["owner", "caregiver", "patient"],"schedule_mode": ["waking_hours", "strict_interval", "custom"],"skip_reason": ["forgot", "out_of_stock", "felt_unwell", "doctor_advised"],"stock_change_reason": ["initial", "dose_taken", "dose_reverted", "restock", "owner_edit", "disposed", "dispose_reverted"]
          }
        }
} as const
