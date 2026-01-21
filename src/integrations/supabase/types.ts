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
      index_entries: {
        Row: {
          bons_carburant_nombre: number
          bons_carburant_valeur: number
          bons_entreprise_nombre: number
          bons_entreprise_valeur: number
          created_at: string
          entry_date: string
          gasoil1_index_arrivee: number
          gasoil1_index_depart: number
          gasoil1_jauge: number
          gasoil2_index_arrivee: number
          gasoil2_index_depart: number
          gasoil2_jauge: number
          id: string
          station_id: string
          super1_index_arrivee: number
          super1_index_depart: number
          super1_jauge: number
          super2_index_arrivee: number
          super2_index_depart: number
          super2_jauge: number
          total_bons: number | null
          total_gasoil_liters: number | null
          total_super_liters: number | null
          total_versements: number | null
          updated_at: string
          user_id: string
          versement_banque: number
          versement_banque_ref: string | null
          versement_liquidite: number
          versement_liquidite_note: string | null
          versement_momo: number
          versement_momo_ref: string | null
        }
        Insert: {
          bons_carburant_nombre?: number
          bons_carburant_valeur?: number
          bons_entreprise_nombre?: number
          bons_entreprise_valeur?: number
          created_at?: string
          entry_date: string
          gasoil1_index_arrivee?: number
          gasoil1_index_depart?: number
          gasoil1_jauge?: number
          gasoil2_index_arrivee?: number
          gasoil2_index_depart?: number
          gasoil2_jauge?: number
          id?: string
          station_id: string
          super1_index_arrivee?: number
          super1_index_depart?: number
          super1_jauge?: number
          super2_index_arrivee?: number
          super2_index_depart?: number
          super2_jauge?: number
          total_bons?: number | null
          total_gasoil_liters?: number | null
          total_super_liters?: number | null
          total_versements?: number | null
          updated_at?: string
          user_id: string
          versement_banque?: number
          versement_banque_ref?: string | null
          versement_liquidite?: number
          versement_liquidite_note?: string | null
          versement_momo?: number
          versement_momo_ref?: string | null
        }
        Update: {
          bons_carburant_nombre?: number
          bons_carburant_valeur?: number
          bons_entreprise_nombre?: number
          bons_entreprise_valeur?: number
          created_at?: string
          entry_date?: string
          gasoil1_index_arrivee?: number
          gasoil1_index_depart?: number
          gasoil1_jauge?: number
          gasoil2_index_arrivee?: number
          gasoil2_index_depart?: number
          gasoil2_jauge?: number
          id?: string
          station_id?: string
          super1_index_arrivee?: number
          super1_index_depart?: number
          super1_jauge?: number
          super2_index_arrivee?: number
          super2_index_depart?: number
          super2_jauge?: number
          total_bons?: number | null
          total_gasoil_liters?: number | null
          total_super_liters?: number | null
          total_versements?: number | null
          updated_at?: string
          user_id?: string
          versement_banque?: number
          versement_banque_ref?: string | null
          versement_liquidite?: number
          versement_liquidite_note?: string | null
          versement_momo?: number
          versement_momo_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "index_entries_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_ht: number
          amount_ttc: number
          created_at: string
          id: string
          product_type: string
          proforma_number: string
          station_id: string
          status: string
          supplier: string
          total_quantity: number
          unit_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_ht?: number
          amount_ttc?: number
          created_at?: string
          id?: string
          product_type?: string
          proforma_number: string
          station_id: string
          status?: string
          supplier: string
          total_quantity?: number
          unit_price?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_ht?: number
          amount_ttc?: number
          created_at?: string
          id?: string
          product_type?: string
          proforma_number?: string
          station_id?: string
          status?: string
          supplier?: string
          total_quantity?: number
          unit_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stations: {
        Row: {
          created_at: string
          id: string
          location: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          location: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string
          name?: string
        }
        Relationships: []
      }
      supplies: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          order_id: string
          product_type: string
          quantity_received: number
          reception_date: string
          station_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          product_type?: string
          quantity_received?: number
          reception_date?: string
          station_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          product_type?: string
          quantity_received?: number
          reception_date?: string
          station_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplies_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplies_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
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
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
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
      app_role: "admin" | "manager" | "operator"
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
      app_role: ["admin", "manager", "operator"],
    },
  },
} as const
