/**
 * PLACEHOLDER — regenerate with `pnpm --filter @relayflow/data generate:types`
 * once the local Supabase stack is running.
 *
 * Checked in on purpose: typecheck must work on a clean clone without a
 * database. CI regenerates and diffs this file, so schema drift fails the
 * build instead of surfacing as a runtime parse error.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          slug: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          slug?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: 'owner' | 'admin' | 'member' | 'guest';
          status: 'invited' | 'active' | 'suspended';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: 'owner' | 'admin' | 'member' | 'guest';
          status?: 'invited' | 'active' | 'suspended';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          role?: 'owner' | 'admin' | 'member' | 'guest';
          status?: 'invited' | 'active' | 'suspended';
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      create_organization_with_owner: {
        Args: { p_name: string; p_slug: string };
        Returns: Json;
      };
    };
    Enums: {
      membership_role: 'owner' | 'admin' | 'member' | 'guest';
      membership_status: 'invited' | 'active' | 'suspended';
    };
    CompositeTypes: Record<never, never>;
  };
}
