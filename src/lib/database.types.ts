// Generated with Supabase MCP generate_typescript_types (project zeekxqinioeyrjyhuajw), trimmed to
// the Database type. Regenerate after every migration.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type OrderRow = {
  approved_at: string | null;
  approved_by: string | null;
  box_id: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cost_total: number;
  created_at: string;
  customer_id: string | null;
  destination: Database["public"]["Enums"]["destination"] | null;
  id: string;
  item_count: number;
  line_count: number;
  order_no: number;
  paid_krw: number;
  credit_due_krw: number;
  payment_method: Database["public"]["Enums"]["payment_method"];
  picked_up_at: string | null;
  picked_up_by: string | null;
  qr_token: string;
  ready_at: string | null;
  ready_by: string | null;
  request_id: string;
  seller_id: string;
  ship_city: string | null;
  ship_district: string | null;
  shipping_kg: number;
  shipping_krw: number;
  shipping_usd: number;
  status: Database["public"]["Enums"]["order_status"];
  subtotal: number;
  total_weight_g: number;
  type: Database["public"]["Enums"]["order_type"];
};

type BoxRow = {
  id: string;
  box_no: number;
  seller_id: string;
  destination: Database["public"]["Enums"]["destination"];
  status: Database["public"]["Enums"]["box_status"];
  order_count: number;
  item_count: number;
  total_weight_g: number;
  shipping_krw: number;
  shipping_usd: number;
  shipping_kg: number;
  created_at: string;
  closed_at: string | null;
  closed_by: string | null;
  picked_up_at: string | null;
  picked_up_by: string | null;
};

type ProductRow = {
  barcode: string;
  cost_price: number;
  created_at: string;
  id: string;
  is_archived: boolean;
  low_stock_threshold: number;
  name: string;
  photo_path: string | null;
  retail_price: number;
  stock: number;
  updated_at: string;
  weight_g: number;
  wholesale_price: number;
};

type Rel = { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[] };

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      credit_payments: {
        Row: { id: string; order_id: string; amount_krw: number; paid_at: string; recorded_by: string };
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: "credit_payments_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "orders"; referencedColumns: ["id"] },
          { foreignKeyName: "credit_payments_recorded_by_fkey"; columns: ["recorded_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      boxes: {
        Row: BoxRow;
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: "boxes_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      app_settings: {
        Row: { id: boolean; kr_shipping_krw: number; updated_at: string; uz_shipping_usd_per_kg: number };
        Insert: { id?: boolean; kr_shipping_krw?: number; updated_at?: string; uz_shipping_usd_per_kg?: number };
        Update: { id?: boolean; kr_shipping_krw?: number; updated_at?: string; uz_shipping_usd_per_kg?: number };
        Relationships: [];
      };
      // No client grants: only server code with the service key touches this table.
      app_secrets: {
        Row: { id: boolean; telegram_bot_token: string | null; telegram_chat_id: string | null; telegram_enabled: boolean; updated_at: string };
        Insert: never;
        Update: { telegram_bot_token?: string | null; telegram_chat_id?: string | null; telegram_enabled?: boolean; updated_at?: string };
        Relationships: [];
      };
      customers: {
        Row: { created_at: string; id: string; name: string | null; phone: string };
        Insert: { created_at?: string; id?: string; name?: string | null; phone: string };
        Update: { created_at?: string; id?: string; name?: string | null; phone?: string };
        Relationships: [];
      };
      order_items: {
        Row: {
          barcode: string;
          id: string;
          is_wholesale: boolean;
          line_total: number;
          line_weight_g: number;
          name: string;
          order_id: string;
          photo_path: string | null;
          product_id: string;
          qty: number;
          unit_cost: number;
          unit_price: number;
          unit_weight_g: number;
        };
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: "order_items_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "orders"; referencedColumns: ["id"] },
          { foreignKeyName: "order_items_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
        ];
      };
      orders: {
        Row: OrderRow;
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: "orders_cancelled_by_fkey"; columns: ["cancelled_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "orders_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
          { foreignKeyName: "orders_box_id_fkey"; columns: ["box_id"]; isOneToOne: false; referencedRelation: "boxes"; referencedColumns: ["id"] },
          { foreignKeyName: "orders_picked_up_by_fkey"; columns: ["picked_up_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "orders_ready_by_fkey"; columns: ["ready_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "orders_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      products: {
        Row: ProductRow;
        Insert: {
          barcode: string;
          cost_price?: number;
          low_stock_threshold?: number;
          name: string;
          photo_path?: string | null;
          retail_price?: number;
          weight_g?: number;
          wholesale_price?: number;
        };
        Update: {
          cost_price?: number;
          is_archived?: boolean;
          low_stock_threshold?: number;
          name?: string;
          photo_path?: string | null;
          retail_price?: number;
          weight_g?: number;
          wholesale_price?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          is_active: boolean;
          role: Database["public"]["Enums"]["app_role"];
          username: string;
        };
        Insert: never;
        Update: { full_name?: string; is_active?: boolean; role?: Database["public"]["Enums"]["app_role"] };
        Relationships: [];
      };
      stock_movements: {
        Row: {
          cost_price: number | null;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["movement_kind"];
          order_id: string | null;
          product_id: string;
          qty_change: number;
          user_id: string;
        };
        Insert: never;
        Update: never;
        Relationships: Rel[];
      };
    };
    Views: {
      low_stock_products: { Row: ProductRow; Relationships: [] };
      inventory_summary: {
        Row: { cost_value: number | null; retail_value: number | null; wholesale_value: number | null };
        Relationships: [];
      };
    };
    Functions: {
      adjust_stock: { Args: { p_new_stock: number; p_product_id: string; p_expected_stock?: number }; Returns: ProductRow };
      change_stock: { Args: { p_delta: number; p_product_id: string }; Returns: ProductRow };
      app_role: { Args: never; Returns: Database["public"]["Enums"]["app_role"] };
      analytics_report: { Args: { p_from: string; p_to: string; p_seller?: string | null }; Returns: Json };
      least_sold: {
        Args: { p_days: number; p_seller?: string | null; p_limit?: number };
        Returns: { product_id: string; name: string; photo_path: string | null; stock: number; qty_sold: number }[];
      };
      cancel_order: { Args: { p_order_id: string }; Returns: OrderRow };
      approve_order: { Args: { p_order_id: string }; Returns: OrderRow };
      record_credit_payment: { Args: { p_order_id: string; p_amount: number }; Returns: OrderRow };
      update_order_info: {
        Args: { p_order_id: string; p_phone: string; p_name: string; p_payment: Database["public"]["Enums"]["payment_method"] };
        Returns: OrderRow;
      };
      close_box: { Args: { p_box_id: string }; Returns: BoxRow };
      box_picked_up: { Args: { p_box_id: string }; Returns: BoxRow };
      submit_seller_order: {
        Args: {
          p_request_id: string;
          p_items: Json;
          p_customer_phone: string;
          p_customer_name: string;
          p_city: string;
          p_district: string;
          p_payment_method: Database["public"]["Enums"]["payment_method"];
          p_destination: Database["public"]["Enums"]["destination"];
        };
        Returns: OrderRow;
      };
      seller_catalog: {
        Args: { p_query?: string | null; p_limit?: number; p_offset?: number };
        Returns: {
          id: string;
          barcode: string;
          name: string;
          photo_path: string | null;
          retail_price: number;
          wholesale_price: number;
          weight_g: number;
          stock: number;
        }[];
      };
      my_orders: { Args: { p_limit?: number; p_offset?: number }; Returns: Json };
      my_order: { Args: { p_id?: string | null; p_request_id?: string | null }; Returns: Json };
      customer_stats: {
        Args: { p_seller?: string | null; p_customer?: string | null };
        Returns: {
          id: string;
          phone: string;
          name: string | null;
          created_at: string;
          orders: number;
          items: number;
          spent: number;
          shipping_usd: number;
          tekpe_orders: number;
          last_order_at: string | null;
        }[];
      };
      rename_customer: {
        Args: { p_customer: string; p_name: string };
        Returns: Database["public"]["Tables"]["customers"]["Row"];
      };
      create_order: {
        Args: {
          p_customer_name: string | null;
          p_customer_phone: string | null;
          p_destination: Database["public"]["Enums"]["destination"] | null;
          p_items: Json;
          p_payment_method: Database["public"]["Enums"]["payment_method"];
          p_request_id: string;
          p_type: Database["public"]["Enums"]["order_type"];
        };
        Returns: OrderRow;
      };
      restock_product: { Args: { p_cost_price?: number; p_product_id: string; p_qty: number }; Returns: ProductRow };
      set_order_status: {
        Args: { p_order_id: string; p_status: Database["public"]["Enums"]["order_status"] };
        Returns: OrderRow;
      };
    };
    Enums: {
      app_role: "admin" | "manager" | "seller";
      box_status: "open" | "closed" | "picked_up";
      destination: "KR" | "UZ";
      movement_kind: "restock" | "sale" | "cancel" | "adjust";
      order_status: "completed" | "pending" | "new" | "ready" | "picked_up" | "cancelled";
      order_type: "store" | "tekpe";
      payment_method: "cash" | "card" | "transfer" | "credit";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Order = Tables<"orders">;
export type OrderItem = Tables<"order_items">;
export type Product = Tables<"products">;
export type Profile = Tables<"profiles">;
export type Box = Tables<"boxes">;
