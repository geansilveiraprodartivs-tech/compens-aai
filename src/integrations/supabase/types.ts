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
      brands: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      price_sources: {
        Row: {
          base_url: string | null
          created_at: string
          id: string
          is_active: boolean
          last_run_at: string | null
          last_status: string | null
          name: string
          source_type: string
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_status?: string | null
          name: string
          source_type?: string
        }
        Update: {
          base_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          source_type?: string
        }
        Relationships: []
      }
      product_prices: {
        Row: {
          collected_at: string
          id: string
          is_promotion: boolean
          price: number
          product_id: string
          quantity: number
          source_id: string | null
          source_url: string | null
          store_location_id: string
          unit: string
          valid_until: string | null
        }
        Insert: {
          collected_at?: string
          id?: string
          is_promotion?: boolean
          price: number
          product_id: string
          quantity?: number
          source_id?: string | null
          source_url?: string | null
          store_location_id: string
          unit?: string
          valid_until?: string | null
        }
        Update: {
          collected_at?: string
          id?: string
          is_promotion?: boolean
          price?: number
          product_id?: string
          quantity?: number
          source_id?: string | null
          source_url?: string | null
          store_location_id?: string
          unit?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_prices_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "price_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_prices_store_location_id_fkey"
            columns: ["store_location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          brand_id: string | null
          category: string | null
          created_at: string
          id: string
          name: string
          package_qty: number | null
          unit: string | null
        }
        Insert: {
          barcode?: string | null
          brand_id?: string | null
          category?: string | null
          created_at?: string
          id?: string
          name: string
          package_qty?: number | null
          unit?: string | null
        }
        Update: {
          barcode?: string | null
          brand_id?: string | null
          category?: string | null
          created_at?: string
          id?: string
          name?: string
          package_qty?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          budget: number | null
          cep: string | null
          city: string | null
          created_at: string
          display_name: string | null
          id: string
          lat: number | null
          lng: number | null
          location_label: string | null
          neighborhood: string | null
          radius_km: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          budget?: number | null
          cep?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          lat?: number | null
          lng?: number | null
          location_label?: string | null
          neighborhood?: string | null
          radius_km?: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          budget?: number | null
          cep?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location_label?: string | null
          neighborhood?: string | null
          radius_km?: number
          updated_at?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          collected_at: string
          ends_at: string | null
          id: string
          product_id: string | null
          promo_price: number | null
          regular_price: number | null
          source_id: string | null
          source_url: string | null
          starts_at: string | null
          store_location_id: string
          title: string
        }
        Insert: {
          collected_at?: string
          ends_at?: string | null
          id?: string
          product_id?: string | null
          promo_price?: number | null
          regular_price?: number | null
          source_id?: string | null
          source_url?: string | null
          starts_at?: string | null
          store_location_id: string
          title: string
        }
        Update: {
          collected_at?: string
          ends_at?: string | null
          id?: string
          product_id?: string | null
          promo_price?: number | null
          regular_price?: number | null
          source_id?: string | null
          source_url?: string | null
          starts_at?: string | null
          store_location_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "price_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_store_location_id_fkey"
            columns: ["store_location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_payments: {
        Row: {
          created_at: string
          id: string
          method: string
          paid_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          method?: string
          paid_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          method?: string
          paid_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      savings_records: {
        Row: {
          created_at: string
          id: string
          note: string | null
          potential_savings: number
          real_savings: number
          session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          potential_savings?: number
          real_savings?: number
          session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          potential_savings?: number
          real_savings?: number
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "shopping_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          brand: string | null
          checked: boolean
          created_at: string
          id: string
          list_id: string
          name: string
          package_size: number | null
          package_unit: string | null
          price: number
          product_id: string | null
          quantity: number
          reference_price: number | null
          unit: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          checked?: boolean
          created_at?: string
          id?: string
          list_id: string
          name: string
          package_size?: number | null
          package_unit?: string | null
          price?: number
          product_id?: string | null
          quantity?: number
          reference_price?: number | null
          unit?: string
          user_id: string
        }
        Update: {
          brand?: string | null
          checked?: boolean
          created_at?: string
          id?: string
          list_id?: string
          name?: string
          package_size?: number | null
          package_unit?: string | null
          price?: number
          product_id?: string | null
          quantity?: number
          reference_price?: number | null
          unit?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          budget: number | null
          created_at: string
          id: string
          name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          budget?: number | null
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          budget?: number | null
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shopping_sessions: {
        Row: {
          budget: number | null
          finished_at: string | null
          id: string
          items_count: number
          list_id: string | null
          promotions_used: number
          started_at: string
          status: string
          store_location_id: string | null
          store_name: string | null
          total_spent: number
          user_id: string
        }
        Insert: {
          budget?: number | null
          finished_at?: string | null
          id?: string
          items_count?: number
          list_id?: string | null
          promotions_used?: number
          started_at?: string
          status?: string
          store_location_id?: string | null
          store_name?: string | null
          total_spent?: number
          user_id: string
        }
        Update: {
          budget?: number | null
          finished_at?: string | null
          id?: string
          items_count?: number
          list_id?: string | null
          promotions_used?: number
          started_at?: string
          status?: string
          store_location_id?: string | null
          store_name?: string | null
          total_spent?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_sessions_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_sessions_store_location_id_fkey"
            columns: ["store_location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_locations: {
        Row: {
          address: string | null
          cep: string | null
          city: string | null
          created_at: string
          id: string
          label: string | null
          lat: number | null
          lng: number | null
          neighborhood: string | null
          state: string | null
          store_id: string
        }
        Insert: {
          address?: string | null
          cep?: string | null
          city?: string | null
          created_at?: string
          id?: string
          label?: string | null
          lat?: number | null
          lng?: number | null
          neighborhood?: string | null
          state?: string | null
          store_id: string
        }
        Update: {
          address?: string | null
          cep?: string | null
          city?: string | null
          created_at?: string
          id?: string
          label?: string | null
          lat?: number | null
          lng?: number | null
          neighborhood?: string | null
          state?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_locations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          chain: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          website: string | null
        }
        Insert: {
          chain?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          website?: string | null
        }
        Update: {
          chain?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          website?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
