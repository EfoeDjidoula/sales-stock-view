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
      clients: {
        Row: {
          address: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          tax_id: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          created_at: string
          currency_code: string
          currency_decimals: number
          currency_symbol: string
          date_format: string
          fuel_products: Json
          id: string
          is_active: boolean
          locale: string
          name: string
          updated_at: string
          vat_rate: number
        }
        Insert: {
          code: string
          created_at?: string
          currency_code?: string
          currency_decimals?: number
          currency_symbol?: string
          date_format?: string
          fuel_products?: Json
          id?: string
          is_active?: boolean
          locale?: string
          name: string
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          code?: string
          created_at?: string
          currency_code?: string
          currency_decimals?: number
          currency_symbol?: string
          date_format?: string
          fuel_products?: Json
          id?: string
          is_active?: boolean
          locale?: string
          name?: string
          updated_at?: string
          vat_rate?: number
        }
        Relationships: []
      }
      depotages: {
        Row: {
          created_at: string
          depotage_date: string
          depotage_ecart: number | null
          ecart: number | null
          end_time: string | null
          gauge_after: number
          id: string
          notes: string | null
          product_type: string
          quantity_to_unload: number
          quantity_unloaded: number
          start_time: string | null
          station_id: string
          stock_before: number
          stock_theoretical: number | null
          tank_capacity_liters: number
          tank_id: string | null
          tenant_id: string
          tolerance_rate: number
          truck_id: string | null
          truck_nominal_capacity: number
          truck_registration: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          depotage_date?: string
          depotage_ecart?: number | null
          ecart?: number | null
          end_time?: string | null
          gauge_after?: number
          id?: string
          notes?: string | null
          product_type?: string
          quantity_to_unload?: number
          quantity_unloaded?: number
          start_time?: string | null
          station_id: string
          stock_before?: number
          stock_theoretical?: number | null
          tank_capacity_liters?: number
          tank_id?: string | null
          tenant_id?: string
          tolerance_rate?: number
          truck_id?: string | null
          truck_nominal_capacity?: number
          truck_registration: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          depotage_date?: string
          depotage_ecart?: number | null
          ecart?: number | null
          end_time?: string | null
          gauge_after?: number
          id?: string
          notes?: string | null
          product_type?: string
          quantity_to_unload?: number
          quantity_unloaded?: number
          start_time?: string | null
          station_id?: string
          stock_before?: number
          stock_theoretical?: number | null
          tank_capacity_liters?: number
          tank_id?: string | null
          tenant_id?: string
          tolerance_rate?: number
          truck_id?: string | null
          truck_nominal_capacity?: number
          truck_registration?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "depotages_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depotages_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depotages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_years: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string
          id: string
          opened_at: string
          status: string
          tenant_id: string
          updated_at: string
          year: number
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          opened_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          year: number
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          opened_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_years_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "index_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      perequation_entries: {
        Row: {
          bl_number: string | null
          created_at: string
          delivery_date: string
          id: string
          notes: string | null
          product_type: string
          quantity_liters: number
          rate_per_liter: number
          received_date: string | null
          station_id: string
          status: string
          supply_id: string | null
          tenant_id: string
          total_amount: number
          updated_at: string
          user_id: string
          zone_id: string | null
        }
        Insert: {
          bl_number?: string | null
          created_at?: string
          delivery_date?: string
          id?: string
          notes?: string | null
          product_type: string
          quantity_liters?: number
          rate_per_liter?: number
          received_date?: string | null
          station_id: string
          status?: string
          supply_id?: string | null
          tenant_id?: string
          total_amount?: number
          updated_at?: string
          user_id: string
          zone_id?: string | null
        }
        Update: {
          bl_number?: string | null
          created_at?: string
          delivery_date?: string
          id?: string
          notes?: string | null
          product_type?: string
          quantity_liters?: number
          rate_per_liter?: number
          received_date?: string | null
          station_id?: string
          status?: string
          supply_id?: string | null
          tenant_id?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "perequation_entries_supply_id_fkey"
            columns: ["supply_id"]
            isOneToOne: false
            referencedRelation: "supplies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perequation_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perequation_entries_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "perequation_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      perequation_rates: {
        Row: {
          created_at: string
          created_by: string
          effective_from: string
          id: string
          product_type: string
          rate_per_liter: number
          tenant_id: string
          updated_at: string
          zone_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          effective_from?: string
          id?: string
          product_type: string
          rate_per_liter?: number
          tenant_id?: string
          updated_at?: string
          zone_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          effective_from?: string
          id?: string
          product_type?: string
          rate_per_liter?: number
          tenant_id?: string
          updated_at?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perequation_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perequation_rates_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "perequation_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      perequation_zones: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perequation_zones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      price_structures: {
        Row: {
          country: string
          created_at: string
          effective_date: string
          elements: Json
          gasoil_price: number
          id: string
          is_active: boolean
          label: string | null
          super_price: number
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          country?: string
          created_at?: string
          effective_date: string
          elements?: Json
          gasoil_price?: number
          id?: string
          is_active?: boolean
          label?: string | null
          super_price?: number
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          country?: string
          created_at?: string
          effective_date?: string
          elements?: Json
          gasoil_price?: number
          id?: string
          is_active?: boolean
          label?: string | null
          super_price?: number
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_structures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pump_index_entries: {
        Row: {
          created_at: string
          entry_date: string
          entry_id: string
          id: string
          index_arrivee: number
          index_depart: number
          liters_sold: number | null
          product_type: string
          pump_id: string
          station_id: string
          tank_id: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_date: string
          entry_id: string
          id?: string
          index_arrivee?: number
          index_depart?: number
          liters_sold?: number | null
          product_type: string
          pump_id: string
          station_id: string
          tank_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entry_date?: string
          entry_id?: string
          id?: string
          index_arrivee?: number
          index_depart?: number
          liters_sold?: number | null
          product_type?: string
          pump_id?: string
          station_id?: string
          tank_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pump_index_entries_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "index_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pump_index_entries_pump_id_fkey"
            columns: ["pump_id"]
            isOneToOne: false
            referencedRelation: "pumps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pump_index_entries_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pump_index_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pumps: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          product_type: string
          station_id: string
          tank_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
          product_type: string
          station_id: string
          tank_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          product_type?: string
          station_id?: string
          tank_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pumps_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pumps_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pumps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      station_assignments: {
        Row: {
          created_at: string
          id: string
          station_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          station_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          station_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_assignments_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          created_at: string
          id: string
          location: string
          name: string
          tenant_id: string
          zone_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          location: string
          name: string
          tenant_id?: string
          zone_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          location?: string
          name?: string
          tenant_id?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "perequation_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          product_type: string | null
          tax_id: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          product_type?: string | null
          tax_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          product_type?: string | null
          tax_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "supplies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tanks: {
        Row: {
          capacity_liters: number
          created_at: string
          id: string
          name: string
          notes: string | null
          product_type: string
          station_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          capacity_liters?: number
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          product_type: string
          station_id: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          capacity_liters?: number
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          product_type?: string
          station_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tanks_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_branding: {
        Row: {
          accent_color: string
          address: string | null
          app_description: string | null
          app_title: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          display_name: string
          favicon_url: string | null
          footer_note: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          primary_color: string
          tax_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          address?: string | null
          app_description?: string | null
          app_title?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          display_name: string
          favicon_url?: string | null
          footer_note?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          primary_color?: string
          tax_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          address?: string | null
          app_description?: string | null
          app_title?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          display_name?: string
          favicon_url?: string | null
          footer_note?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          primary_color?: string
          tax_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_branding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_countries: {
        Row: {
          country_id: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          country_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          country_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_countries_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_countries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_modules: {
        Row: {
          allowed_roles: Database["public"]["Enums"]["app_role"][]
          created_at: string
          id: string
          is_enabled: boolean
          module_key: string
          position: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allowed_roles?: Database["public"]["Enums"]["app_role"][]
          created_at?: string
          id?: string
          is_enabled?: boolean
          module_key: string
          position?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allowed_roles?: Database["public"]["Enums"]["app_role"][]
          created_at?: string
          id?: string
          is_enabled?: boolean
          module_key?: string
          position?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_modules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          code: string
          created_at: string
          default_currency: string
          default_language: string
          email: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          name: string
          phone: string | null
          plan: string
          primary_color: string
          secondary_color: string
          slug: string
          status: string
          trade_name: string
          trial_ends_at: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          default_currency?: string
          default_language?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          plan?: string
          primary_color?: string
          secondary_color?: string
          slug: string
          status?: string
          trade_name: string
          trial_ends_at?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          default_currency?: string
          default_language?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          plan?: string
          primary_color?: string
          secondary_color?: string
          slug?: string
          status?: string
          trade_name?: string
          trial_ends_at?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      trucks: {
        Row: {
          compartment_count: number
          compartments: Json
          created_at: string
          driver_name: string
          id: string
          nominal_capacity: number
          notes: string | null
          registration: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          compartment_count?: number
          compartments?: Json
          created_at?: string
          driver_name: string
          id?: string
          nominal_capacity?: number
          notes?: string | null
          registration: string
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          compartment_count?: number
          compartments?: Json
          created_at?: string
          driver_name?: string
          id?: string
          nominal_capacity?: number
          notes?: string | null
          registration?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trucks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_country_access: {
        Row: {
          country_id: string
          created_at: string
          id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          country_id: string
          created_at?: string
          id?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          country_id?: string
          created_at?: string
          id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_country_access_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_country_access_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      tank_destocking_daily: {
        Row: {
          entry_date: string | null
          product_type: string | null
          station_id: string | null
          tank_id: string | null
          total_liters: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pump_index_entries_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_access_tenant: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      can_write_station: {
        Args: { _station_id: string; _user_id: string }
        Returns: boolean
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_tenant: { Args: { _user_id: string }; Returns: string }
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
