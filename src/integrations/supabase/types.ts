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
      audit_logs: {
        Row: {
          action: string
          country_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          module: string
          new_value: Json | null
          old_value: Json | null
          session_id: string | null
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          country_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          module: string
          new_value?: Json | null
          old_value?: Json | null
          session_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          country_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          module?: string
          new_value?: Json | null
          old_value?: Json | null
          session_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          contact_name: string | null
          country_id: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          tax_id: string | null
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          country_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          country_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      closure_events: {
        Row: {
          action: string
          author_id: string | null
          author_name: string | null
          closure_id: string
          country_id: string
          created_at: string
          from_status: string | null
          id: string
          reason: string | null
          tenant_id: string
          to_status: string | null
        }
        Insert: {
          action: string
          author_id?: string | null
          author_name?: string | null
          closure_id: string
          country_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          tenant_id: string
          to_status?: string | null
        }
        Update: {
          action?: string
          author_id?: string | null
          author_name?: string | null
          closure_id?: string
          country_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          tenant_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "closure_events_closure_id_fkey"
            columns: ["closure_id"]
            isOneToOne: false
            referencedRelation: "daily_closures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closure_events_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closure_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      closure_payments: {
        Row: {
          amount: number
          closure_id: string
          country_id: string
          created_at: string
          id: string
          payment_method_id: string
          reference: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          closure_id: string
          country_id: string
          created_at?: string
          id?: string
          payment_method_id: string
          reference?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          closure_id?: string
          country_id?: string
          created_at?: string
          id?: string
          payment_method_id?: string
          reference?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "closure_payments_closure_id_fkey"
            columns: ["closure_id"]
            isOneToOne: false
            referencedRelation: "daily_closures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closure_payments_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closure_payments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closure_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      closure_sales: {
        Row: {
          amount: number
          closure_id: string
          country_id: string
          created_at: string
          id: string
          index_end: number | null
          index_start: number | null
          nozzle_id: string | null
          product_id: string | null
          pump_id: string | null
          tank_id: string | null
          tenant_id: string
          unit_price: number
          updated_at: string
          volume: number
          volume_mode: string
        }
        Insert: {
          amount?: number
          closure_id: string
          country_id: string
          created_at?: string
          id?: string
          index_end?: number | null
          index_start?: number | null
          nozzle_id?: string | null
          product_id?: string | null
          pump_id?: string | null
          tank_id?: string | null
          tenant_id: string
          unit_price?: number
          updated_at?: string
          volume?: number
          volume_mode?: string
        }
        Update: {
          amount?: number
          closure_id?: string
          country_id?: string
          created_at?: string
          id?: string
          index_end?: number | null
          index_start?: number | null
          nozzle_id?: string | null
          product_id?: string | null
          pump_id?: string | null
          tank_id?: string | null
          tenant_id?: string
          unit_price?: number
          updated_at?: string
          volume?: number
          volume_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "closure_sales_closure_id_fkey"
            columns: ["closure_id"]
            isOneToOne: false
            referencedRelation: "daily_closures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closure_sales_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closure_sales_nozzle_id_fkey"
            columns: ["nozzle_id"]
            isOneToOne: false
            referencedRelation: "nozzles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closure_sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "petroleum_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closure_sales_pump_id_fkey"
            columns: ["pump_id"]
            isOneToOne: false
            referencedRelation: "pumps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closure_sales_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closure_sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_invoices: {
        Row: {
          amount: number
          amount_paid: number
          contract_id: string
          created_at: string
          id: string
          invoice_date: string
          invoice_month: number
          invoice_number: string
          invoice_year: number
          notes: string | null
          payment_date: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          amount_paid?: number
          contract_id: string
          created_at?: string
          id?: string
          invoice_date?: string
          invoice_month: number
          invoice_number?: string
          invoice_year: number
          notes?: string | null
          payment_date?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_paid?: number
          contract_id?: string
          created_at?: string
          id?: string
          invoice_date?: string
          invoice_month?: number
          invoice_number?: string
          invoice_year?: number
          notes?: string | null
          payment_date?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "maintenance_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_payments: {
        Row: {
          amount: number
          contract_id: string
          created_at: string
          id: string
          notes: string | null
          payment_date: string
          payment_month: number
          payment_year: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          contract_id: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_month: number
          payment_year: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          contract_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_month?: number
          payment_year?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "maintenance_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_payments_tenant_id_fkey"
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
          default_currency: string
          default_language: string
          flag: string | null
          fuel_products: Json
          id: string
          is_active: boolean
          iso_code: string
          locale: string
          name: string
          timezone: string
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
          default_currency: string
          default_language: string
          flag?: string | null
          fuel_products?: Json
          id?: string
          is_active?: boolean
          iso_code: string
          locale?: string
          name: string
          timezone?: string
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
          default_currency?: string
          default_language?: string
          flag?: string | null
          fuel_products?: Json
          id?: string
          is_active?: boolean
          iso_code?: string
          locale?: string
          name?: string
          timezone?: string
          updated_at?: string
          vat_rate?: number
        }
        Relationships: []
      }
      country_modules: {
        Row: {
          country_id: string
          created_at: string
          id: string
          is_enabled: boolean
          module_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          country_id: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          module_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          country_id?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          module_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "country_modules_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "country_modules_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "country_modules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_closures: {
        Row: {
          cash_variance: number
          closure_date: string
          country_id: string
          created_at: string
          created_by: string | null
          id: string
          last_reason: string | null
          notes: string | null
          rejected_at: string | null
          rejected_by: string | null
          reopened_at: string | null
          reopened_by: string | null
          station_id: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          tenant_id: string
          total_amount: number
          total_collected: number
          total_volume: number
          updated_at: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          cash_variance?: number
          closure_date: string
          country_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_reason?: string | null
          notes?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          station_id: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id: string
          total_amount?: number
          total_collected?: number
          total_volume?: number
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          cash_variance?: number
          closure_date?: string
          country_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_reason?: string | null
          notes?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          station_id?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id?: string
          total_amount?: number
          total_collected?: number
          total_volume?: number
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_closures_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_closures_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_closures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      depot_product_thresholds: {
        Row: {
          capacity_liters: number
          country_id: string | null
          created_at: string
          critical_threshold: number | null
          depot_id: string
          id: string
          min_threshold: number | null
          product_id: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          capacity_liters?: number
          country_id?: string | null
          created_at?: string
          critical_threshold?: number | null
          depot_id: string
          id?: string
          min_threshold?: number | null
          product_id: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          capacity_liters?: number
          country_id?: string | null
          created_at?: string
          critical_threshold?: number | null
          depot_id?: string
          id?: string
          min_threshold?: number | null
          product_id?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "depot_product_thresholds_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depot_product_thresholds_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depot_product_thresholds_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "petroleum_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depot_product_thresholds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      depotages: {
        Row: {
          country_id: string | null
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
          tenant_id: string | null
          tolerance_rate: number
          truck_id: string | null
          truck_nominal_capacity: number
          truck_registration: string
          updated_at: string
          user_id: string
        }
        Insert: {
          country_id?: string | null
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
          tenant_id?: string | null
          tolerance_rate?: number
          truck_id?: string | null
          truck_nominal_capacity?: number
          truck_registration: string
          updated_at?: string
          user_id: string
        }
        Update: {
          country_id?: string | null
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
          tenant_id?: string | null
          tolerance_rate?: number
          truck_id?: string | null
          truck_nominal_capacity?: number
          truck_registration?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "depotages_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
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
      depots: {
        Row: {
          capacity_liters: number
          code: string | null
          country_id: string | null
          created_at: string
          equipment_type_id: string | null
          id: string
          location: string | null
          name: string
          notes: string | null
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          capacity_liters?: number
          code?: string | null
          country_id?: string | null
          created_at?: string
          equipment_type_id?: string | null
          id?: string
          location?: string | null
          name: string
          notes?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          capacity_liters?: number
          code?: string | null
          country_id?: string | null
          created_at?: string
          equipment_type_id?: string | null
          id?: string
          location?: string | null
          name?: string
          notes?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "depots_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depots_equipment_type_id_fkey"
            columns: ["equipment_type_id"]
            isOneToOne: false
            referencedRelation: "equipment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_types: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_types_tenant_id_fkey"
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
          country_id: string | null
          created_at: string
          created_by: string
          id: string
          opened_at: string
          status: string
          tenant_id: string | null
          updated_at: string
          year: number
        }
        Insert: {
          closed_at?: string | null
          country_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          opened_at?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          closed_at?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          opened_at?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_years_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_years_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_alert_events: {
        Row: {
          action: string
          alert_id: string
          author_id: string | null
          author_name: string | null
          comment: string | null
          country_id: string
          created_at: string
          from_workflow: string | null
          id: string
          tenant_id: string
          to_workflow: string | null
        }
        Insert: {
          action: string
          alert_id: string
          author_id?: string | null
          author_name?: string | null
          comment?: string | null
          country_id: string
          created_at?: string
          from_workflow?: string | null
          id?: string
          tenant_id: string
          to_workflow?: string | null
        }
        Update: {
          action?: string
          alert_id?: string
          author_id?: string | null
          author_name?: string | null
          comment?: string | null
          country_id?: string
          created_at?: string
          from_workflow?: string | null
          id?: string
          tenant_id?: string
          to_workflow?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fraud_alert_events_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "fraud_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_alert_events_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_alert_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_alerts: {
        Row: {
          alert_date: string
          country_id: string
          created_at: string
          evidence: Json
          explanation: string
          fingerprint: string
          id: string
          last_comment: string | null
          priority: number
          rule_code: string
          severity: string
          station_id: string | null
          tenant_id: string
          title: string
          updated_at: string
          workflow: string
        }
        Insert: {
          alert_date: string
          country_id: string
          created_at?: string
          evidence?: Json
          explanation: string
          fingerprint: string
          id?: string
          last_comment?: string | null
          priority?: number
          rule_code: string
          severity: string
          station_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string
          workflow?: string
        }
        Update: {
          alert_date?: string
          country_id?: string
          created_at?: string
          evidence?: Json
          explanation?: string
          fingerprint?: string
          id?: string
          last_comment?: string | null
          priority?: number
          rule_code?: string
          severity?: string
          station_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
          workflow?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_alerts_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_alerts_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_rules: {
        Row: {
          country_id: string
          created_at: string
          id: string
          is_enabled: boolean
          params: Json
          rule_code: string
          severity: string
          tenant_id: string
          threshold: number
          updated_at: string
          window_days: number
        }
        Insert: {
          country_id: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          params?: Json
          rule_code: string
          severity?: string
          tenant_id: string
          threshold?: number
          updated_at?: string
          window_days?: number
        }
        Update: {
          country_id?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          params?: Json
          rule_code?: string
          severity?: string
          tenant_id?: string
          threshold?: number
          updated_at?: string
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "fraud_rules_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_card_accounts: {
        Row: {
          client_id: string
          contract_reference: string | null
          country_id: string
          created_at: string
          credit_limit: number
          credit_used: number
          id: string
          kind: string
          prepaid_balance: number
          status: string
          tenant_id: string
        }
        Insert: {
          client_id: string
          contract_reference?: string | null
          country_id: string
          created_at?: string
          credit_limit?: number
          credit_used?: number
          id?: string
          kind: string
          prepaid_balance?: number
          status?: string
          tenant_id: string
        }
        Update: {
          client_id?: string
          contract_reference?: string | null
          country_id?: string
          created_at?: string
          credit_limit?: number
          credit_used?: number
          id?: string
          kind?: string
          prepaid_balance?: number
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_card_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_card_accounts_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "tenant_countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_card_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_card_alerts: {
        Row: {
          account_id: string
          card_id: string | null
          country_id: string
          created_at: string
          explanation: string
          id: string
          rule_code: string
          severity: string
          tenant_id: string
          transaction_id: string | null
        }
        Insert: {
          account_id: string
          card_id?: string | null
          country_id: string
          created_at?: string
          explanation: string
          id?: string
          rule_code: string
          severity?: string
          tenant_id: string
          transaction_id?: string | null
        }
        Update: {
          account_id?: string
          card_id?: string | null
          country_id?: string
          created_at?: string
          explanation?: string
          id?: string
          rule_code?: string
          severity?: string
          tenant_id?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuel_card_alerts_account_id_tenant_id_country_id_fkey"
            columns: ["account_id", "tenant_id", "country_id"]
            isOneToOne: false
            referencedRelation: "fuel_card_accounts"
            referencedColumns: ["id", "tenant_id", "country_id"]
          },
          {
            foreignKeyName: "fuel_card_alerts_card_id_tenant_id_country_id_fkey"
            columns: ["card_id", "tenant_id", "country_id"]
            isOneToOne: false
            referencedRelation: "fuel_cards"
            referencedColumns: ["id", "tenant_id", "country_id"]
          },
        ]
      }
      fuel_card_drivers: {
        Row: {
          account_id: string
          active: boolean
          country_id: string
          id: string
          name: string
          phone: string | null
          tenant_id: string
        }
        Insert: {
          account_id: string
          active?: boolean
          country_id: string
          id?: string
          name: string
          phone?: string | null
          tenant_id: string
        }
        Update: {
          account_id?: string
          active?: boolean
          country_id?: string
          id?: string
          name?: string
          phone?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_card_drivers_account_id_tenant_id_country_id_fkey"
            columns: ["account_id", "tenant_id", "country_id"]
            isOneToOne: false
            referencedRelation: "fuel_card_accounts"
            referencedColumns: ["id", "tenant_id", "country_id"]
          },
        ]
      }
      fuel_card_invoices: {
        Row: {
          account_id: string
          actor_id: string
          amount: number
          country_id: string
          created_at: string
          id: string
          number: string
          paid: number
          period_end: string
          period_start: string
          tenant_id: string
        }
        Insert: {
          account_id: string
          actor_id: string
          amount: number
          country_id: string
          created_at?: string
          id?: string
          number: string
          paid?: number
          period_end: string
          period_start: string
          tenant_id: string
        }
        Update: {
          account_id?: string
          actor_id?: string
          amount?: number
          country_id?: string
          created_at?: string
          id?: string
          number?: string
          paid?: number
          period_end?: string
          period_start?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_card_invoices_account_id_tenant_id_country_id_fkey"
            columns: ["account_id", "tenant_id", "country_id"]
            isOneToOne: false
            referencedRelation: "fuel_card_accounts"
            referencedColumns: ["id", "tenant_id", "country_id"]
          },
        ]
      }
      fuel_card_limit_events: {
        Row: {
          account_id: string
          actor_id: string
          card_id: string | null
          country_id: string
          created_at: string
          id: string
          new_limit: number
          old_limit: number
          reason: string
          tenant_id: string
        }
        Insert: {
          account_id: string
          actor_id: string
          card_id?: string | null
          country_id: string
          created_at?: string
          id?: string
          new_limit: number
          old_limit: number
          reason: string
          tenant_id: string
        }
        Update: {
          account_id?: string
          actor_id?: string
          card_id?: string | null
          country_id?: string
          created_at?: string
          id?: string
          new_limit?: number
          old_limit?: number
          reason?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_card_limit_events_account_id_tenant_id_country_id_fkey"
            columns: ["account_id", "tenant_id", "country_id"]
            isOneToOne: false
            referencedRelation: "fuel_card_accounts"
            referencedColumns: ["id", "tenant_id", "country_id"]
          },
          {
            foreignKeyName: "fuel_card_limit_events_card_id_tenant_id_country_id_fkey"
            columns: ["card_id", "tenant_id", "country_id"]
            isOneToOne: false
            referencedRelation: "fuel_cards"
            referencedColumns: ["id", "tenant_id", "country_id"]
          },
        ]
      }
      fuel_card_transactions: {
        Row: {
          account_id: string
          actor_id: string
          amount: number
          card_id: string | null
          country_id: string
          driver_id: string | null
          id: string
          kind: string
          litres: number | null
          note: string | null
          occurred_at: string
          product_id: string | null
          reference: string | null
          station_id: string | null
          tenant_id: string
          vehicle_id: string | null
        }
        Insert: {
          account_id: string
          actor_id: string
          amount: number
          card_id?: string | null
          country_id: string
          driver_id?: string | null
          id?: string
          kind: string
          litres?: number | null
          note?: string | null
          occurred_at?: string
          product_id?: string | null
          reference?: string | null
          station_id?: string | null
          tenant_id: string
          vehicle_id?: string | null
        }
        Update: {
          account_id?: string
          actor_id?: string
          amount?: number
          card_id?: string | null
          country_id?: string
          driver_id?: string | null
          id?: string
          kind?: string
          litres?: number | null
          note?: string | null
          occurred_at?: string
          product_id?: string | null
          reference?: string | null
          station_id?: string | null
          tenant_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuel_card_transactions_account_id_tenant_id_country_id_fkey"
            columns: ["account_id", "tenant_id", "country_id"]
            isOneToOne: false
            referencedRelation: "fuel_card_accounts"
            referencedColumns: ["id", "tenant_id", "country_id"]
          },
          {
            foreignKeyName: "fuel_card_transactions_card_id_tenant_id_country_id_fkey"
            columns: ["card_id", "tenant_id", "country_id"]
            isOneToOne: false
            referencedRelation: "fuel_cards"
            referencedColumns: ["id", "tenant_id", "country_id"]
          },
          {
            foreignKeyName: "fuel_card_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "petroleum_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_card_transactions_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_card_vehicles: {
        Row: {
          account_id: string
          active: boolean
          country_id: string
          description: string | null
          id: string
          plate: string
          tenant_id: string
        }
        Insert: {
          account_id: string
          active?: boolean
          country_id: string
          description?: string | null
          id?: string
          plate: string
          tenant_id: string
        }
        Update: {
          account_id?: string
          active?: boolean
          country_id?: string
          description?: string | null
          id?: string
          plate?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_card_vehicles_account_id_tenant_id_country_id_fkey"
            columns: ["account_id", "tenant_id", "country_id"]
            isOneToOne: false
            referencedRelation: "fuel_card_accounts"
            referencedColumns: ["id", "tenant_id", "country_id"]
          },
        ]
      }
      fuel_cards: {
        Row: {
          account_id: string
          allocated_limit: number
          card_number: string
          country_id: string
          created_at: string
          driver_id: string | null
          expires_on: string
          holder_name: string | null
          id: string
          remaining: number
          replaced_by: string | null
          restrictions: Json
          status: string
          tenant_id: string
          vehicle_id: string | null
        }
        Insert: {
          account_id: string
          allocated_limit?: number
          card_number: string
          country_id: string
          created_at?: string
          driver_id?: string | null
          expires_on: string
          holder_name?: string | null
          id?: string
          remaining?: number
          replaced_by?: string | null
          restrictions?: Json
          status?: string
          tenant_id: string
          vehicle_id?: string | null
        }
        Update: {
          account_id?: string
          allocated_limit?: number
          card_number?: string
          country_id?: string
          created_at?: string
          driver_id?: string | null
          expires_on?: string
          holder_name?: string | null
          id?: string
          remaining?: number
          replaced_by?: string | null
          restrictions?: Json
          status?: string
          tenant_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuel_cards_account_id_tenant_id_country_id_fkey"
            columns: ["account_id", "tenant_id", "country_id"]
            isOneToOne: false
            referencedRelation: "fuel_card_accounts"
            referencedColumns: ["id", "tenant_id", "country_id"]
          },
          {
            foreignKeyName: "fuel_cards_driver_id_tenant_id_country_id_fkey"
            columns: ["driver_id", "tenant_id", "country_id"]
            isOneToOne: false
            referencedRelation: "fuel_card_drivers"
            referencedColumns: ["id", "tenant_id", "country_id"]
          },
          {
            foreignKeyName: "fuel_cards_vehicle_id_tenant_id_country_id_fkey"
            columns: ["vehicle_id", "tenant_id", "country_id"]
            isOneToOne: false
            referencedRelation: "fuel_card_vehicles"
            referencedColumns: ["id", "tenant_id", "country_id"]
          },
        ]
      }
      index_entries: {
        Row: {
          bons_carburant_nombre: number
          bons_carburant_valeur: number
          bons_entreprise_nombre: number
          bons_entreprise_valeur: number
          country_id: string | null
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
          tenant_id: string | null
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
          country_id?: string | null
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
          tenant_id?: string | null
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
          country_id?: string | null
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
          tenant_id?: string | null
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
            foreignKeyName: "index_entries_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
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
      license_modules: {
        Row: {
          created_at: string
          id: string
          module_key: string
          plan_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          module_key: string
          plan_id: string
        }
        Update: {
          created_at?: string
          id?: string
          module_key?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_modules_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "license_modules_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "license_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      license_plans: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          max_countries: number | null
          max_stations: number | null
          max_users: number | null
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          max_countries?: number | null
          max_stations?: number | null
          max_users?: number | null
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          max_countries?: number | null
          max_stations?: number | null
          max_users?: number | null
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      licenses: {
        Row: {
          activation_date: string | null
          automatic_renewal: boolean
          created_at: string
          expiration_date: string
          expiry_policy: string
          grace_period_days: number
          id: string
          license_number: string
          max_countries: number | null
          max_stations: number | null
          max_users: number | null
          notes: string | null
          plan_id: string
          start_date: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activation_date?: string | null
          automatic_renewal?: boolean
          created_at?: string
          expiration_date: string
          expiry_policy?: string
          grace_period_days?: number
          id?: string
          license_number: string
          max_countries?: number | null
          max_stations?: number | null
          max_users?: number | null
          notes?: string | null
          plan_id: string
          start_date?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activation_date?: string | null
          automatic_renewal?: boolean
          created_at?: string
          expiration_date?: string
          expiry_policy?: string
          grace_period_days?: number
          id?: string
          license_number?: string
          max_countries?: number | null
          max_stations?: number | null
          max_users?: number | null
          notes?: string | null
          plan_id?: string
          start_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "licenses_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "license_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_contracts: {
        Row: {
          amount: number
          billing_frequency: string
          client_contact: string | null
          contract_number: string
          contract_type: string
          created_at: string
          document_url: string | null
          end_date: string
          id: string
          lumatek_manager: string | null
          notes: string | null
          previous_contract_id: string | null
          signature_date: string | null
          sla: string | null
          start_date: string
          status: string
          support_level: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          billing_frequency?: string
          client_contact?: string | null
          contract_number?: string
          contract_type?: string
          created_at?: string
          document_url?: string | null
          end_date: string
          id?: string
          lumatek_manager?: string | null
          notes?: string | null
          previous_contract_id?: string | null
          signature_date?: string | null
          sla?: string | null
          start_date: string
          status?: string
          support_level?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_frequency?: string
          client_contact?: string | null
          contract_number?: string
          contract_type?: string
          created_at?: string
          document_url?: string | null
          end_date?: string
          id?: string
          lumatek_manager?: string | null
          notes?: string | null
          previous_contract_id?: string | null
          signature_date?: string | null
          sla?: string | null
          start_date?: string
          status?: string
          support_level?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_contracts_previous_contract_id_fkey"
            columns: ["previous_contract_id"]
            isOneToOne: false
            referencedRelation: "maintenance_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_core: boolean
          key: string
          label: string
          position: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_core?: boolean
          key: string
          label: string
          position?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_core?: boolean
          key?: string
          label?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      nozzles: {
        Row: {
          country_id: string | null
          created_at: string
          equipment_type_id: string | null
          id: string
          name: string
          notes: string | null
          number: number
          product_id: string | null
          pump_id: string
          station_id: string
          status: string
          tank_id: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          country_id?: string | null
          created_at?: string
          equipment_type_id?: string | null
          id?: string
          name: string
          notes?: string | null
          number?: number
          product_id?: string | null
          pump_id: string
          station_id: string
          status?: string
          tank_id?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          country_id?: string | null
          created_at?: string
          equipment_type_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          number?: number
          product_id?: string | null
          pump_id?: string
          station_id?: string
          status?: string
          tank_id?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nozzles_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nozzles_equipment_type_id_fkey"
            columns: ["equipment_type_id"]
            isOneToOne: false
            referencedRelation: "equipment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nozzles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "petroleum_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nozzles_pump_id_fkey"
            columns: ["pump_id"]
            isOneToOne: false
            referencedRelation: "pumps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nozzles_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nozzles_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nozzles_tenant_id_fkey"
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
          country_id: string | null
          created_at: string
          id: string
          product_type: string
          proforma_number: string
          station_id: string
          status: string
          supplier: string
          tenant_id: string | null
          total_quantity: number
          unit_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_ht?: number
          amount_ttc?: number
          country_id?: string | null
          created_at?: string
          id?: string
          product_type?: string
          proforma_number: string
          station_id: string
          status?: string
          supplier: string
          tenant_id?: string | null
          total_quantity?: number
          unit_price?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_ht?: number
          amount_ttc?: number
          country_id?: string | null
          created_at?: string
          id?: string
          product_type?: string
          proforma_number?: string
          station_id?: string
          status?: string
          supplier?: string
          tenant_id?: string | null
          total_quantity?: number
          unit_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
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
      payment_methods: {
        Row: {
          code: string
          country_id: string
          created_at: string
          id: string
          is_active: boolean
          kind: string
          label: string
          position: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          country_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          label: string
          position?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          country_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          label?: string
          position?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_methods_tenant_id_fkey"
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
          country_id: string | null
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
          tenant_id: string | null
          total_amount: number
          updated_at: string
          user_id: string
          zone_id: string | null
        }
        Insert: {
          bl_number?: string | null
          country_id?: string | null
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
          tenant_id?: string | null
          total_amount?: number
          updated_at?: string
          user_id: string
          zone_id?: string | null
        }
        Update: {
          bl_number?: string | null
          country_id?: string | null
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
          tenant_id?: string | null
          total_amount?: number
          updated_at?: string
          user_id?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "perequation_entries_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
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
          country_id: string | null
          created_at: string
          created_by: string
          effective_from: string
          id: string
          product_type: string
          rate_per_liter: number
          tenant_id: string | null
          updated_at: string
          zone_id: string
        }
        Insert: {
          country_id?: string | null
          created_at?: string
          created_by: string
          effective_from?: string
          id?: string
          product_type: string
          rate_per_liter?: number
          tenant_id?: string | null
          updated_at?: string
          zone_id: string
        }
        Update: {
          country_id?: string | null
          created_at?: string
          created_by?: string
          effective_from?: string
          id?: string
          product_type?: string
          rate_per_liter?: number
          tenant_id?: string | null
          updated_at?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perequation_rates_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
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
          country_id: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          country_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          country_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perequation_zones_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perequation_zones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          code: string
          created_at: string
          id: string
          label: string
          module: string
        }
        Insert: {
          action: string
          code: string
          created_at?: string
          id?: string
          label: string
          module: string
        }
        Update: {
          action?: string
          code?: string
          created_at?: string
          id?: string
          label?: string
          module?: string
        }
        Relationships: []
      }
      petroleum_products: {
        Row: {
          category: string
          code: string
          color: string
          country_id: string | null
          created_at: string
          density: number | null
          id: string
          name: string
          position: number
          status: string
          tenant_id: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          code: string
          color?: string
          country_id?: string | null
          created_at?: string
          density?: number | null
          id?: string
          name: string
          position?: number
          status?: string
          tenant_id?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          color?: string
          country_id?: string | null
          created_at?: string
          density?: number | null
          id?: string
          name?: string
          position?: number
          status?: string
          tenant_id?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "petroleum_products_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petroleum_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petroleum_products_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      price_structures: {
        Row: {
          country: string
          country_id: string | null
          created_at: string
          effective_date: string
          elements: Json
          gasoil_price: number
          id: string
          is_active: boolean
          label: string | null
          super_price: number
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          country?: string
          country_id?: string | null
          created_at?: string
          effective_date: string
          elements?: Json
          gasoil_price?: number
          id?: string
          is_active?: boolean
          label?: string | null
          super_price?: number
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          country?: string
          country_id?: string | null
          created_at?: string
          effective_date?: string
          elements?: Json
          gasoil_price?: number
          id?: string
          is_active?: boolean
          label?: string | null
          super_price?: number
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_structures_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
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
          country_id: string | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          country_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          country_id?: string | null
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
            foreignKeyName: "profiles_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
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
          country_id: string | null
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
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          country_id?: string | null
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
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          country_id?: string | null
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
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pump_index_entries_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
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
          country_id: string | null
          created_at: string
          equipment_type_id: string | null
          id: string
          name: string
          position: number
          product_id: string | null
          product_type: string
          station_id: string
          status: string
          tank_id: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          country_id?: string | null
          created_at?: string
          equipment_type_id?: string | null
          id?: string
          name: string
          position?: number
          product_id?: string | null
          product_type: string
          station_id: string
          status?: string
          tank_id?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          country_id?: string | null
          created_at?: string
          equipment_type_id?: string | null
          id?: string
          name?: string
          position?: number
          product_id?: string | null
          product_type?: string
          station_id?: string
          status?: string
          tank_id?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pumps_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pumps_equipment_type_id_fkey"
            columns: ["equipment_type_id"]
            isOneToOne: false
            referencedRelation: "equipment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pumps_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "petroleum_products"
            referencedColumns: ["id"]
          },
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
      reconciliation_events: {
        Row: {
          action: string
          author_id: string | null
          author_name: string | null
          comment: string | null
          country_id: string
          created_at: string
          data: Json | null
          from_workflow: string | null
          id: string
          reconciliation_id: string
          result: string | null
          tenant_id: string
          to_workflow: string | null
        }
        Insert: {
          action: string
          author_id?: string | null
          author_name?: string | null
          comment?: string | null
          country_id: string
          created_at?: string
          data?: Json | null
          from_workflow?: string | null
          id?: string
          reconciliation_id: string
          result?: string | null
          tenant_id: string
          to_workflow?: string | null
        }
        Update: {
          action?: string
          author_id?: string | null
          author_name?: string | null
          comment?: string | null
          country_id?: string
          created_at?: string
          data?: Json | null
          from_workflow?: string | null
          id?: string
          reconciliation_id?: string
          result?: string | null
          tenant_id?: string
          to_workflow?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_events_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_events_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "reconciliations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_tolerances: {
        Row: {
          amt_anomaly: number
          amt_critical: number
          amt_watch: number
          country_id: string
          created_at: string
          id: string
          product_id: string | null
          tenant_id: string
          updated_at: string
          vol_anomaly_pct: number
          vol_critical_pct: number
          vol_watch_pct: number
        }
        Insert: {
          amt_anomaly?: number
          amt_critical?: number
          amt_watch?: number
          country_id: string
          created_at?: string
          id?: string
          product_id?: string | null
          tenant_id: string
          updated_at?: string
          vol_anomaly_pct?: number
          vol_critical_pct?: number
          vol_watch_pct?: number
        }
        Update: {
          amt_anomaly?: number
          amt_critical?: number
          amt_watch?: number
          country_id?: string
          created_at?: string
          id?: string
          product_id?: string | null
          tenant_id?: string
          updated_at?: string
          vol_anomaly_pct?: number
          vol_critical_pct?: number
          vol_watch_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_tolerances_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_tolerances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "petroleum_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_tolerances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliations: {
        Row: {
          closure_id: string | null
          collected_amount: number
          computed_at: string
          computed_by: string | null
          country_id: string
          created_at: string
          details: Json
          id: string
          last_comment: string | null
          recon_date: string
          result: string
          sales_amount: number
          sales_volume: number
          station_id: string
          tenant_id: string
          updated_at: string
          value_variance: number
          volume_variance: number
          workflow: string
        }
        Insert: {
          closure_id?: string | null
          collected_amount?: number
          computed_at?: string
          computed_by?: string | null
          country_id: string
          created_at?: string
          details?: Json
          id?: string
          last_comment?: string | null
          recon_date: string
          result?: string
          sales_amount?: number
          sales_volume?: number
          station_id: string
          tenant_id: string
          updated_at?: string
          value_variance?: number
          volume_variance?: number
          workflow?: string
        }
        Update: {
          closure_id?: string | null
          collected_amount?: number
          computed_at?: string
          computed_by?: string | null
          country_id?: string
          created_at?: string
          details?: Json
          id?: string
          last_comment?: string | null
          recon_date?: string
          result?: string
          sales_amount?: number
          sales_volume?: number
          station_id?: string
          tenant_id?: string
          updated_at?: string
          value_variance?: number
          volume_variance?: number
          workflow?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliations_closure_id_fkey"
            columns: ["closure_id"]
            isOneToOne: false
            referencedRelation: "daily_closures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          position: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          position?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          position?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey"
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
          country_id: string | null
          created_at: string
          depot_id: string | null
          id: string
          location: string
          name: string
          status: string
          tenant_id: string | null
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          country_id?: string | null
          created_at?: string
          depot_id?: string | null
          id?: string
          location: string
          name: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          country_id?: string | null
          created_at?: string
          depot_id?: string | null
          id?: string
          location?: string
          name?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stations_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
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
      stock_movements: {
        Row: {
          country_id: string | null
          created_at: string
          depot_id: string | null
          id: string
          location_type: string
          movement_date: string
          movement_type: string
          physical_level: number | null
          product_id: string
          quantity: number
          reason: string | null
          reference: string | null
          requested_by: string | null
          requested_by_name: string | null
          station_id: string | null
          status: string
          tank_id: string | null
          tenant_id: string | null
          theoretical_at_count: number | null
          transfer_id: string | null
          validated_at: string | null
          validated_by: string | null
          validation_note: string | null
        }
        Insert: {
          country_id?: string | null
          created_at?: string
          depot_id?: string | null
          id?: string
          location_type: string
          movement_date?: string
          movement_type: string
          physical_level?: number | null
          product_id: string
          quantity: number
          reason?: string | null
          reference?: string | null
          requested_by?: string | null
          requested_by_name?: string | null
          station_id?: string | null
          status?: string
          tank_id?: string | null
          tenant_id?: string | null
          theoretical_at_count?: number | null
          transfer_id?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_note?: string | null
        }
        Update: {
          country_id?: string | null
          created_at?: string
          depot_id?: string | null
          id?: string
          location_type?: string
          movement_date?: string
          movement_type?: string
          physical_level?: number | null
          product_id?: string
          quantity?: number
          reason?: string | null
          reference?: string | null
          requested_by?: string | null
          requested_by_name?: string | null
          station_id?: string | null
          status?: string
          tank_id?: string | null
          tenant_id?: string | null
          theoretical_at_count?: number | null
          transfer_id?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "petroleum_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_name: string | null
          country_id: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          product_type: string | null
          tax_id: string | null
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          country_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          product_type?: string | null
          tax_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          country_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          product_type?: string | null
          tax_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
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
          country_id: string | null
          created_at: string
          id: string
          notes: string | null
          order_id: string
          product_type: string
          quantity_received: number
          reception_date: string
          station_id: string
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          country_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          product_type?: string
          quantity_received?: number
          reception_date?: string
          station_id: string
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          country_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          product_type?: string
          quantity_received?: number
          reception_date?: string
          station_id?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplies_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
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
      supply_request_events: {
        Row: {
          action: string
          author_id: string | null
          author_name: string | null
          country_id: string
          created_at: string
          data: Json | null
          from_status: string | null
          id: string
          reason: string | null
          request_id: string
          tenant_id: string
          to_status: string | null
        }
        Insert: {
          action: string
          author_id?: string | null
          author_name?: string | null
          country_id: string
          created_at?: string
          data?: Json | null
          from_status?: string | null
          id?: string
          reason?: string | null
          request_id: string
          tenant_id: string
          to_status?: string | null
        }
        Update: {
          action?: string
          author_id?: string | null
          author_name?: string | null
          country_id?: string
          created_at?: string
          data?: Json | null
          from_status?: string | null
          id?: string
          reason?: string | null
          request_id?: string
          tenant_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supply_request_events_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "supply_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_request_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_requests: {
        Row: {
          bl_number: string | null
          country_id: string
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_variance: number | null
          departed_at: string | null
          depot_id: string | null
          driver_name: string | null
          gauge_after: number | null
          gauge_before: number | null
          id: string
          last_reason: string | null
          loaded_at: string | null
          need_reason: string | null
          needed_date: string | null
          observations: string | null
          order_number: string | null
          product_id: string
          qty_approved: number | null
          qty_delivered: number | null
          qty_loaded: number | null
          qty_received: number | null
          qty_requested: number
          received_at: string | null
          reference: string | null
          seals: string | null
          seals_intact: boolean | null
          station_id: string
          status: string
          stock_movement_id: string | null
          supplier_id: string | null
          tank_id: string | null
          tenant_id: string
          transport_variance: number | null
          truck_id: string | null
          updated_at: string
          vehicle_registration: string | null
        }
        Insert: {
          bl_number?: string | null
          country_id: string
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_variance?: number | null
          departed_at?: string | null
          depot_id?: string | null
          driver_name?: string | null
          gauge_after?: number | null
          gauge_before?: number | null
          id?: string
          last_reason?: string | null
          loaded_at?: string | null
          need_reason?: string | null
          needed_date?: string | null
          observations?: string | null
          order_number?: string | null
          product_id: string
          qty_approved?: number | null
          qty_delivered?: number | null
          qty_loaded?: number | null
          qty_received?: number | null
          qty_requested: number
          received_at?: string | null
          reference?: string | null
          seals?: string | null
          seals_intact?: boolean | null
          station_id: string
          status?: string
          stock_movement_id?: string | null
          supplier_id?: string | null
          tank_id?: string | null
          tenant_id: string
          transport_variance?: number | null
          truck_id?: string | null
          updated_at?: string
          vehicle_registration?: string | null
        }
        Update: {
          bl_number?: string | null
          country_id?: string
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_variance?: number | null
          departed_at?: string | null
          depot_id?: string | null
          driver_name?: string | null
          gauge_after?: number | null
          gauge_before?: number | null
          id?: string
          last_reason?: string | null
          loaded_at?: string | null
          need_reason?: string | null
          needed_date?: string | null
          observations?: string | null
          order_number?: string | null
          product_id?: string
          qty_approved?: number | null
          qty_delivered?: number | null
          qty_loaded?: number | null
          qty_received?: number | null
          qty_requested?: number
          received_at?: string | null
          reference?: string | null
          seals?: string | null
          seals_intact?: boolean | null
          station_id?: string
          status?: string
          stock_movement_id?: string | null
          supplier_id?: string | null
          tank_id?: string | null
          tenant_id?: string
          transport_variance?: number | null
          truck_id?: string | null
          updated_at?: string
          vehicle_registration?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supply_requests_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_requests_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "petroleum_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_requests_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_requests_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_requests_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_requests_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      support_notifications: {
        Row: {
          audience: string
          created_at: string
          event: string
          id: string
          payload: Json
          sent_at: string | null
          status: string
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          audience: string
          created_at?: string
          event: string
          id?: string
          payload?: Json
          sent_at?: string | null
          status?: string
          tenant_id: string
          ticket_id: string
        }
        Update: {
          audience?: string
          created_at?: string
          event?: string
          id?: string
          payload?: Json
          sent_at?: string | null
          status?: string
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_notifications_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_events: {
        Row: {
          attachments: Json
          author_id: string | null
          author_name: string | null
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          is_lumatek: boolean
          message: string | null
          tenant_id: string
          ticket_id: string
          to_status: string | null
        }
        Insert: {
          attachments?: Json
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          is_lumatek?: boolean
          message?: string | null
          tenant_id: string
          ticket_id: string
          to_status?: string | null
        }
        Update: {
          attachments?: Json
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          is_lumatek?: boolean
          message?: string | null
          tenant_id?: string
          ticket_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          assigned_to_name: string | null
          attachments: Json
          category: string
          closed_at: string | null
          country_id: string | null
          created_at: string
          created_by: string
          created_by_name: string | null
          description: string
          first_response_at: string | null
          id: string
          module_key: string | null
          priority: string
          resolved_at: string | null
          sla_due_at: string | null
          sla_hours: number
          station_id: string | null
          status: string
          subject: string
          tenant_id: string
          ticket_number: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          attachments?: Json
          category: string
          closed_at?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string
          created_by_name?: string | null
          description?: string
          first_response_at?: string | null
          id?: string
          module_key?: string | null
          priority?: string
          resolved_at?: string | null
          sla_due_at?: string | null
          sla_hours?: number
          station_id?: string | null
          status?: string
          subject: string
          tenant_id: string
          ticket_number?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          attachments?: Json
          category?: string
          closed_at?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string
          created_by_name?: string | null
          description?: string
          first_response_at?: string | null
          id?: string
          module_key?: string | null
          priority?: string
          resolved_at?: string | null
          sla_due_at?: string | null
          sla_hours?: number
          station_id?: string | null
          status?: string
          subject?: string
          tenant_id?: string
          ticket_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_tenant_id_fkey"
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
          country_id: string | null
          created_at: string
          critical_threshold: number | null
          equipment_type_id: string | null
          id: string
          min_threshold: number | null
          name: string
          notes: string | null
          product_id: string | null
          product_type: string
          station_id: string
          status: string
          tenant_id: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          capacity_liters?: number
          country_id?: string | null
          created_at?: string
          critical_threshold?: number | null
          equipment_type_id?: string | null
          id?: string
          min_threshold?: number | null
          name: string
          notes?: string | null
          product_id?: string | null
          product_type: string
          station_id: string
          status?: string
          tenant_id?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          capacity_liters?: number
          country_id?: string | null
          created_at?: string
          critical_threshold?: number | null
          equipment_type_id?: string | null
          id?: string
          min_threshold?: number | null
          name?: string
          notes?: string | null
          product_id?: string | null
          product_type?: string
          station_id?: string
          status?: string
          tenant_id?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tanks_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanks_equipment_type_id_fkey"
            columns: ["equipment_type_id"]
            isOneToOne: false
            referencedRelation: "equipment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "petroleum_products"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "tanks_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
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
          configuration: Json
          country_id: string
          created_at: string
          currency: string | null
          id: string
          is_active: boolean
          is_default: boolean
          language: string | null
          status: string
          tenant_id: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          configuration?: Json
          country_id: string
          created_at?: string
          currency?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          language?: string | null
          status?: string
          tenant_id: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          configuration?: Json
          country_id?: string
          created_at?: string
          currency?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          language?: string | null
          status?: string
          tenant_id?: string
          timezone?: string | null
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
          app_description: string | null
          app_title: string | null
          code: string
          created_at: string
          default_currency: string
          default_language: string
          email: string | null
          favicon_url: string | null
          footer_note: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          name: string
          phone: string | null
          plan: string
          powered_by_label: string
          primary_color: string
          secondary_color: string
          show_powered_by: boolean
          slug: string
          status: string
          tax_id: string | null
          trade_name: string
          trial_ends_at: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          app_description?: string | null
          app_title?: string | null
          code: string
          created_at?: string
          default_currency?: string
          default_language?: string
          email?: string | null
          favicon_url?: string | null
          footer_note?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          plan?: string
          powered_by_label?: string
          primary_color?: string
          secondary_color?: string
          show_powered_by?: boolean
          slug: string
          status?: string
          tax_id?: string | null
          trade_name: string
          trial_ends_at?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          app_description?: string | null
          app_title?: string | null
          code?: string
          created_at?: string
          default_currency?: string
          default_language?: string
          email?: string | null
          favicon_url?: string | null
          footer_note?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          plan?: string
          powered_by_label?: string
          primary_color?: string
          secondary_color?: string
          show_powered_by?: boolean
          slug?: string
          status?: string
          tax_id?: string | null
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
          country_id: string | null
          created_at: string
          driver_name: string
          id: string
          nominal_capacity: number
          notes: string | null
          registration: string
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          compartment_count?: number
          compartments?: Json
          country_id?: string | null
          created_at?: string
          driver_name: string
          id?: string
          nominal_capacity?: number
          notes?: string | null
          registration: string
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          compartment_count?: number
          compartments?: Json
          country_id?: string | null
          created_at?: string
          driver_name?: string
          id?: string
          nominal_capacity?: number
          notes?: string | null
          registration?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trucks_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trucks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      units_of_measure: {
        Row: {
          code: string
          created_at: string
          factor_to_base: number
          id: string
          kind: string
          name: string
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          factor_to_base?: number
          id?: string
          kind?: string
          name: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          factor_to_base?: number
          id?: string
          kind?: string
          name?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_of_measure_tenant_id_fkey"
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
      user_role_assignments: {
        Row: {
          created_at: string
          id: string
          role_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_role_assignments_tenant_id_fkey"
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
      stock_levels: {
        Row: {
          alert_level: string | null
          capacity: number | null
          counted_at: string | null
          country_id: string | null
          critical_threshold: number | null
          depot_id: string | null
          entries: number | null
          exits: number | null
          initial_qty: number | null
          location_type: string | null
          min_threshold: number | null
          physical: number | null
          product_id: string | null
          sales: number | null
          station_id: string | null
          tank_id: string | null
          tenant_id: string | null
          theoretical: number | null
          variance: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "petroleum_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
      audit_request_meta: { Args: never; Returns: Record<string, unknown> }
      can_access_tenant: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_tenant_country: {
        Args: { _country_id: string; _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      can_write_module: {
        Args: { _module: string; _user_id: string }
        Returns: boolean
      }
      can_write_station: {
        Args: { _station_id: string; _user_id: string }
        Returns: boolean
      }
      closure_recompute: { Args: { _id: string }; Returns: undefined }
      closure_transition: {
        Args: { _action: string; _id: string; _reason?: string }
        Returns: string
      }
      create_stock_transfer: {
        Args: {
          _from_id: string
          _from_tank: string
          _from_type: string
          _product_id: string
          _quantity: number
          _reason: string
          _reference?: string
          _to_id: string
          _to_tank: string
          _to_type: string
        }
        Returns: string
      }
      fraud_alert_action: {
        Args: { _action: string; _comment: string; _id: string }
        Returns: string
      }
      fraud_rule_defaults: {
        Args: never
        Returns: {
          description: string
          is_enabled: boolean
          label: string
          rule_code: string
          severity: string
          threshold: number
          unit: string
          window_days: number
        }[]
      }
      fuel_card_action: {
        Args: {
          _account?: string
          _action: string
          _card?: string
          _country: string
          _data?: Json
          _tenant: string
        }
        Returns: Json
      }
      get_user_permissions: {
        Args: { _user_id: string }
        Returns: {
          code: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_tenant: { Args: { _user_id: string }; Returns: string }
      has_permission: {
        Args: { _permission_code: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_module_enabled: {
        Args: { _country_id: string; _module_key: string; _tenant_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      license_effective_status: {
        Args: { _expiration: string; _grace: number; _status: string }
        Returns: string
      }
      log_audit_event: {
        Args: {
          _action: string
          _country_id?: string
          _details?: Json
          _device?: string
          _entity_id?: string
          _entity_type?: string
          _module: string
        }
        Returns: undefined
      }
      recon_classify: {
        Args: {
          _amt: number
          _pct: number
          _t: Database["public"]["Tables"]["reconciliation_tolerances"]["Row"]
        }
        Returns: string
      }
      reconcile_station_day: {
        Args: { _date: string; _station: string }
        Returns: string
      }
      reconciliation_action: {
        Args: { _action: string; _comment: string; _id: string }
        Returns: string
      }
      run_fraud_scan: {
        Args: { _country: string; _from: string; _tenant: string; _to: string }
        Returns: number
      }
      seed_payment_methods: {
        Args: { _country: string; _tenant: string }
        Returns: undefined
      }
      shares_tenant_with: {
        Args: { _other_user_id: string; _user_id: string }
        Returns: boolean
      }
      stock_theoretical: {
        Args: {
          _location_id: string
          _location_type: string
          _product_id: string
          _tank_id: string
        }
        Returns: number
      }
      supply_transition: {
        Args: { _action: string; _data?: Json; _id: string; _reason?: string }
        Returns: string
      }
      tenant_license_limits: {
        Args: { _tenant_id: string }
        Returns: {
          license_id: string
          max_countries: number
          max_stations: number
          max_users: number
          plan_id: string
          status: string
        }[]
      }
      tenant_license_state: { Args: { _tenant_id: string }; Returns: Json }
      tenant_write_allowed: { Args: { _tenant_id: string }; Returns: boolean }
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
      app_role: ["admin", "manager", "operator"],
    },
  },
} as const
