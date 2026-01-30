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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ban_appeals: {
        Row: {
          admin_response: string | null
          appeal_message: string
          ban_reason: string | null
          created_at: string
          email: string
          id: string
          resolved_at: string | null
          status: string
          telegram_chat_id: string | null
          user_id: string
          username: string | null
        }
        Insert: {
          admin_response?: string | null
          appeal_message: string
          ban_reason?: string | null
          created_at?: string
          email: string
          id?: string
          resolved_at?: string | null
          status?: string
          telegram_chat_id?: string | null
          user_id: string
          username?: string | null
        }
        Update: {
          admin_response?: string | null
          appeal_message?: string
          ban_reason?: string | null
          created_at?: string
          email?: string
          id?: string
          resolved_at?: string | null
          status?: string
          telegram_chat_id?: string | null
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      blocked_devices: {
        Row: {
          banned_by_admin_id: string | null
          banned_user_id: string
          created_at: string
          fingerprint: string | null
          id: string
          ip_address: string | null
          is_active: boolean
          reason: string | null
        }
        Insert: {
          banned_by_admin_id?: string | null
          banned_user_id: string
          created_at?: string
          fingerprint?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean
          reason?: string | null
        }
        Update: {
          banned_by_admin_id?: string | null
          banned_user_id?: string
          created_at?: string
          fingerprint?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean
          reason?: string | null
        }
        Relationships: []
      }
      card_checks: {
        Row: {
          card_details: string | null
          created_at: string
          gateway: string
          id: string
          result: string | null
          status: string
          user_id: string
        }
        Insert: {
          card_details?: string | null
          created_at?: string
          gateway: string
          id?: string
          result?: string | null
          status?: string
          user_id: string
        }
        Update: {
          card_details?: string | null
          created_at?: string
          gateway?: string
          id?: string
          result?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      deleted_notifications: {
        Row: {
          created_at: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: []
      }
      deletion_otps: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          otp_hash: string
          user_id: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          otp_hash: string
          user_id: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          otp_hash?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: []
      }
      gateway_status: {
        Row: {
          id: string
          name: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id: string
          name: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          name?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      gateway_urls: {
        Row: {
          created_at: string
          id: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          url?: string
        }
        Relationships: []
      }
      gateways: {
        Row: {
          card_types: string
          charge_amount: string | null
          code: string | null
          created_at: string
          cvc_required: boolean
          description: string
          display_order: number
          edge_function_name: string | null
          icon_color: string
          icon_name: string
          id: string
          is_active: boolean
          name: string
          speed: string
          status: string
          success_rate: string
          type: string
          updated_at: string
        }
        Insert: {
          card_types?: string
          charge_amount?: string | null
          code?: string | null
          created_at?: string
          cvc_required?: boolean
          description: string
          display_order?: number
          edge_function_name?: string | null
          icon_color?: string
          icon_name?: string
          id: string
          is_active?: boolean
          name: string
          speed?: string
          status?: string
          success_rate?: string
          type: string
          updated_at?: string
        }
        Update: {
          card_types?: string
          charge_amount?: string | null
          code?: string | null
          created_at?: string
          cvc_required?: boolean
          description?: string
          display_order?: number
          edge_function_name?: string | null
          icon_color?: string
          icon_name?: string
          id?: string
          is_active?: boolean
          name?: string
          speed?: string
          status?: string
          success_rate?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      health_check_sessions: {
        Row: {
          chat_id: string
          created_at: string
          id: string
          is_stopped: boolean | null
          message_id: number
          updated_at: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          id?: string
          is_stopped?: boolean | null
          message_id: number
          updated_at?: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          id?: string
          is_stopped?: boolean | null
          message_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_announcements: boolean | null
          email_credit_additions: boolean | null
          email_ticket_replies: boolean | null
          email_topup_status: boolean | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_announcements?: boolean | null
          email_credit_additions?: boolean | null
          email_ticket_replies?: boolean | null
          email_topup_status?: boolean | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_announcements?: boolean | null
          email_credit_additions?: boolean | null
          email_ticket_replies?: boolean | null
          email_topup_status?: boolean | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_reads: {
        Row: {
          created_at: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      password_reset_otps: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          otp_code: string
          telegram_chat_id: string | null
          used: boolean
          user_id: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          otp_code: string
          telegram_chat_id?: string | null
          used?: boolean
          user_id: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          otp_code?: string
          telegram_chat_id?: string | null
          used?: boolean
          user_id?: string
          verified?: boolean
        }
        Relationships: []
      }
      pending_bans: {
        Row: {
          admin_chat_id: string
          ban_reason: string | null
          created_at: string
          id: string
          step: string | null
          user_email: string | null
          user_id: string
          user_telegram_chat_id: string | null
          username: string | null
        }
        Insert: {
          admin_chat_id: string
          ban_reason?: string | null
          created_at?: string
          id?: string
          step?: string | null
          user_email?: string | null
          user_id: string
          user_telegram_chat_id?: string | null
          username?: string | null
        }
        Update: {
          admin_chat_id?: string
          ban_reason?: string | null
          created_at?: string
          id?: string
          step?: string | null
          user_email?: string | null
          user_id?: string
          user_telegram_chat_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      pending_gateway_additions: {
        Row: {
          admin_chat_id: string
          card_types: string | null
          charge_amount: string | null
          created_at: string
          cvc_required: boolean | null
          description: string | null
          edge_function_name: string | null
          gateway_code: string | null
          gateway_id: string | null
          gateway_name: string | null
          gateway_type: string | null
          icon_color: string | null
          icon_name: string | null
          id: string
          speed: string | null
          step: string
          success_rate: string | null
        }
        Insert: {
          admin_chat_id: string
          card_types?: string | null
          charge_amount?: string | null
          created_at?: string
          cvc_required?: boolean | null
          description?: string | null
          edge_function_name?: string | null
          gateway_code?: string | null
          gateway_id?: string | null
          gateway_name?: string | null
          gateway_type?: string | null
          icon_color?: string | null
          icon_name?: string | null
          id?: string
          speed?: string | null
          step?: string
          success_rate?: string | null
        }
        Update: {
          admin_chat_id?: string
          card_types?: string | null
          charge_amount?: string | null
          created_at?: string
          cvc_required?: boolean | null
          description?: string | null
          edge_function_name?: string | null
          gateway_code?: string | null
          gateway_id?: string | null
          gateway_name?: string | null
          gateway_type?: string | null
          icon_color?: string | null
          icon_name?: string | null
          id?: string
          speed?: string | null
          step?: string
          success_rate?: string | null
        }
        Relationships: []
      }
      pending_verifications: {
        Row: {
          created_at: string
          email: string | null
          expires_at: string
          id: string
          telegram_chat_id: string
          verification_code: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          email?: string | null
          expires_at: string
          id?: string
          telegram_chat_id: string
          verification_code: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          telegram_chat_id?: string
          verification_code?: string
          verified?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ban_reason: string | null
          banned_at: string | null
          banned_until: string | null
          created_at: string
          credits: number
          id: string
          is_banned: boolean
          name: string | null
          telegram_chat_id: string | null
          telegram_username: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          ban_reason?: string | null
          banned_at?: string | null
          banned_until?: string | null
          created_at?: string
          credits?: number
          id?: string
          is_banned?: boolean
          name?: string | null
          telegram_chat_id?: string | null
          telegram_username?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          ban_reason?: string | null
          banned_at?: string | null
          banned_until?: string | null
          created_at?: string
          credits?: number
          id?: string
          is_banned?: boolean
          name?: string | null
          telegram_chat_id?: string | null
          telegram_username?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      site_stats: {
        Row: {
          id: string
          total_checks: number
          total_users: number
          updated_at: string
        }
        Insert: {
          id?: string
          total_checks?: number
          total_users?: number
          updated_at?: string
        }
        Update: {
          id?: string
          total_checks?: number
          total_users?: number
          updated_at?: string
        }
        Relationships: []
      }
      spending_alert_settings: {
        Row: {
          created_at: string
          daily_threshold: number | null
          enabled: boolean | null
          id: string
          last_daily_alert: string | null
          last_weekly_alert: string | null
          updated_at: string
          user_id: string
          weekly_threshold: number | null
        }
        Insert: {
          created_at?: string
          daily_threshold?: number | null
          enabled?: boolean | null
          id?: string
          last_daily_alert?: string | null
          last_weekly_alert?: string | null
          updated_at?: string
          user_id: string
          weekly_threshold?: number | null
        }
        Update: {
          created_at?: string
          daily_threshold?: number | null
          enabled?: boolean | null
          id?: string
          last_daily_alert?: string | null
          last_weekly_alert?: string | null
          updated_at?: string
          user_id?: string
          weekly_threshold?: number | null
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          created_at: string
          id: string
          message: string
          priority: string
          status: string
          subject: string
          ticket_id: string
          updated_at: string
          user_email: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          priority?: string
          status?: string
          subject: string
          ticket_id: string
          updated_at?: string
          user_email: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          priority?: string
          status?: string
          subject?: string
          ticket_id?: string
          updated_at?: string
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          created_at: string
          id: string
          is_admin: boolean
          message: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_admin?: boolean
          message: string
          ticket_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_admin?: boolean
          message?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      topup_transactions: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string
          id: string
          payment_method: string
          proof_image_url: string | null
          rejection_reason: string | null
          status: string
          transaction_hash: string | null
          updated_at: string
          user_id: string
          wallet_address: string | null
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string
          id?: string
          payment_method: string
          proof_image_url?: string | null
          rejection_reason?: string | null
          status?: string
          transaction_hash?: string | null
          updated_at?: string
          user_id: string
          wallet_address?: string | null
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          payment_method?: string
          proof_image_url?: string | null
          rejection_reason?: string | null
          status?: string
          transaction_hash?: string | null
          updated_at?: string
          user_id?: string
          wallet_address?: string | null
        }
        Relationships: []
      }
      user_device_logs: {
        Row: {
          created_at: string
          fingerprint: string
          id: string
          ip_address: string | null
          last_seen: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          fingerprint: string
          id?: string
          ip_address?: string | null
          last_seen?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          fingerprint?: string
          id?: string
          ip_address?: string | null
          last_seen?: string
          user_agent?: string | null
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
      user_sessions: {
        Row: {
          browser: string | null
          created_at: string
          device_info: string | null
          id: string
          ip_address: string | null
          is_current: boolean | null
          last_active: string
          location: string | null
          os: string | null
          session_token: string
          user_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean | null
          last_active?: string
          location?: string | null
          os?: string | null
          session_token: string
          user_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean | null
          last_active?: string
          location?: string | null
          os?: string | null
          session_token?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      handle_topup_completion: {
        Args: { p_transaction_id: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
