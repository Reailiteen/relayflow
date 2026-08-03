/**
 * GENERATED — do not edit. Run `./scripts/generate-types.sh`.
 *
 * Produced from supabase/migrations by applying them to a throwaway cluster and
 * reading the catalog, rather than from the hosted project. The migrations are
 * the source of truth for the schema, and generating from them means anyone can
 * refresh this file without the database password.
 *
 * Checked in on purpose: typecheck must work on a clean clone with no database
 * and no credentials.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      activity_events: {
        Row: {
          id: string;
          cycle_id: string;
          entity_type: string;
          entity_id: string;
          action: string;
          actor_id: string | null;
          actor_role: Database["public"]["Enums"]["activity_actor_role"];
          before: Json | null;
          after: Json | null;
          reason: string | null;
          occurred_at: string;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          entity_type: string;
          entity_id: string;
          action: string;
          actor_id?: string | null;
          actor_role: Database["public"]["Enums"]["activity_actor_role"];
          before?: Json | null;
          after?: Json | null;
          reason?: string | null;
          occurred_at?: string;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          entity_type?: string;
          entity_id?: string;
          action?: string;
          actor_id?: string | null;
          actor_role?: Database["public"]["Enums"]["activity_actor_role"];
          before?: Json | null;
          after?: Json | null;
          reason?: string | null;
          occurred_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_events_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      allocations: {
        Row: {
          id: string;
          cycle_id: string;
          startup_id: string;
          weekly_hours: number;
          status: Database["public"]["Enums"]["allocation_status"];
          score: number | null;
          override_reason: string | null;
          justification: string | null;
          from_redistribution: boolean;
          revision: number;
          supersedes_allocation_id: string | null;
          redistribution_round_id: string | null;
          decided_by: string | null;
          decided_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          startup_id: string;
          weekly_hours: number;
          status?: Database["public"]["Enums"]["allocation_status"];
          score?: number | null;
          override_reason?: string | null;
          justification?: string | null;
          from_redistribution?: boolean;
          revision?: number;
          supersedes_allocation_id?: string | null;
          redistribution_round_id?: string | null;
          decided_by?: string | null;
          decided_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          startup_id?: string;
          weekly_hours?: number;
          status?: Database["public"]["Enums"]["allocation_status"];
          score?: number | null;
          override_reason?: string | null;
          justification?: string | null;
          from_redistribution?: boolean;
          revision?: number;
          supersedes_allocation_id?: string | null;
          redistribution_round_id?: string | null;
          decided_by?: string | null;
          decided_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "allocations_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "allocations_startup_id_fkey";
            columns: ["startup_id"];
            isOneToOne: false;
            referencedRelation: "startups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "allocations_supersedes_allocation_id_fkey";
            columns: ["supersedes_allocation_id"];
            isOneToOne: false;
            referencedRelation: "allocations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "allocations_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "allocations_redistribution_round_fk";
            columns: ["redistribution_round_id"];
            isOneToOne: false;
            referencedRelation: "redistribution_rounds";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_choice_fallbacks: {
        Row: {
          id: string;
          cycle_id: string;
          candidate_id: string;
          current_offer_index: number;
          response_deadline: string;
          status: Database["public"]["Enums"]["fallback_case_status"];
          opened_by: string;
          resolved_by: string | null;
          reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          candidate_id: string;
          current_offer_index?: number;
          response_deadline: string;
          status?: Database["public"]["Enums"]["fallback_case_status"];
          opened_by: string;
          resolved_by?: string | null;
          reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          candidate_id?: string;
          current_offer_index?: number;
          response_deadline?: string;
          status?: Database["public"]["Enums"]["fallback_case_status"];
          opened_by?: string;
          resolved_by?: string | null;
          reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_choice_fallbacks_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "candidate_choice_fallbacks_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: true;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "candidate_choice_fallbacks_opened_by_fkey";
            columns: ["opened_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "candidate_choice_fallbacks_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_document_fields: {
        Row: {
          id: string;
          document_id: string;
          key: string;
          label: string | null;
          extracted: string | null;
          confirmed: string | null;
          confidence: number | null;
        };
        Insert: {
          id?: string;
          document_id: string;
          key: string;
          label?: string | null;
          extracted?: string | null;
          confirmed?: string | null;
          confidence?: number | null;
        };
        Update: {
          id?: string;
          document_id?: string;
          key?: string;
          label?: string | null;
          extracted?: string | null;
          confirmed?: string | null;
          confidence?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_document_fields_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "candidate_documents";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_documents: {
        Row: {
          id: string;
          candidate_id: string;
          startup_id: string | null;
          kind: Database["public"]["Enums"]["document_kind"];
          status: Database["public"]["Enums"]["document_status"];
          file_name: string | null;
          storage_path: string | null;
          rejection_reason: string | null;
          verified_by: string | null;
          verified_at: string | null;
          created_at: string;
          updated_at: string;
          back_file_name: string | null;
          back_storage_path: string | null;
        };
        Insert: {
          id?: string;
          candidate_id: string;
          startup_id?: string | null;
          kind: Database["public"]["Enums"]["document_kind"];
          status?: Database["public"]["Enums"]["document_status"];
          file_name?: string | null;
          storage_path?: string | null;
          rejection_reason?: string | null;
          verified_by?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
          back_file_name?: string | null;
          back_storage_path?: string | null;
        };
        Update: {
          id?: string;
          candidate_id?: string;
          startup_id?: string | null;
          kind?: Database["public"]["Enums"]["document_kind"];
          status?: Database["public"]["Enums"]["document_status"];
          file_name?: string | null;
          storage_path?: string | null;
          rejection_reason?: string | null;
          verified_by?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
          back_file_name?: string | null;
          back_storage_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_documents_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "candidate_documents_startup_id_fkey";
            columns: ["startup_id"];
            isOneToOne: false;
            referencedRelation: "startups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "candidate_documents_verified_by_fkey";
            columns: ["verified_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      candidates: {
        Row: {
          id: string;
          cycle_id: string;
          user_id: string | null;
          full_name: string;
          email: string;
          phone: string | null;
          skills: string[];
          cv_url: string | null;
          portfolio_url: string | null;
          github_url: string | null;
          availability: Database["public"]["Enums"]["availability_status"];
          availability_confirmed_at: string | null;
          source: Database["public"]["Enums"]["candidate_source"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          user_id?: string | null;
          full_name: string;
          email: string;
          phone?: string | null;
          skills?: string[];
          cv_url?: string | null;
          portfolio_url?: string | null;
          github_url?: string | null;
          availability?: Database["public"]["Enums"]["availability_status"];
          availability_confirmed_at?: string | null;
          source?: Database["public"]["Enums"]["candidate_source"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          user_id?: string | null;
          full_name?: string;
          email?: string;
          phone?: string | null;
          skills?: string[];
          cv_url?: string | null;
          portfolio_url?: string | null;
          github_url?: string | null;
          availability?: Database["public"]["Enums"]["availability_status"];
          availability_confirmed_at?: string | null;
          source?: Database["public"]["Enums"]["candidate_source"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candidates_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "candidates_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      cycle_participations: {
        Row: {
          id: string;
          cycle_id: string;
          startup_id: string;
          status: Database["public"]["Enums"]["participation_status"];
          requested_total_hours: number;
          requested_intern_count: number;
          disciplines: string[];
          operator_score: number | null;
          internal_notes: string | null;
          startup_justification: string | null;
          allocation_acknowledged_at: string | null;
          allocation_acknowledged_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          startup_id: string;
          status?: Database["public"]["Enums"]["participation_status"];
          requested_total_hours?: number;
          requested_intern_count?: number;
          disciplines?: string[];
          operator_score?: number | null;
          internal_notes?: string | null;
          startup_justification?: string | null;
          allocation_acknowledged_at?: string | null;
          allocation_acknowledged_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          startup_id?: string;
          status?: Database["public"]["Enums"]["participation_status"];
          requested_total_hours?: number;
          requested_intern_count?: number;
          disciplines?: string[];
          operator_score?: number | null;
          internal_notes?: string | null;
          startup_justification?: string | null;
          allocation_acknowledged_at?: string | null;
          allocation_acknowledged_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cycle_participations_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cycle_participations_startup_id_fkey";
            columns: ["startup_id"];
            isOneToOne: false;
            referencedRelation: "startups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cycle_participations_allocation_acknowledged_by_fkey";
            columns: ["allocation_acknowledged_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      cycles: {
        Row: {
          id: string;
          name: string;
          stage: Database["public"]["Enums"]["cycle_stage"];
          starts_on: string;
          ends_on: string;
          funded_weekly_hours: number;
          selection_mode: Database["public"]["Enums"]["selection_mode"];
          deadlines: Json;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          stage?: Database["public"]["Enums"]["cycle_stage"];
          starts_on: string;
          ends_on: string;
          funded_weekly_hours: number;
          selection_mode?: Database["public"]["Enums"]["selection_mode"];
          deadlines: Json;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          stage?: Database["public"]["Enums"]["cycle_stage"];
          starts_on?: string;
          ends_on?: string;
          funded_weekly_hours?: number;
          selection_mode?: Database["public"]["Enums"]["selection_mode"];
          deadlines?: Json;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      document_requirement_templates: {
        Row: {
          id: string;
          cycle_id: string;
          title: string;
          owner: Database["public"]["Enums"]["requirement_owner"];
          required: boolean;
          position_id: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          title: string;
          owner: Database["public"]["Enums"]["requirement_owner"];
          required?: boolean;
          position_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          title?: string;
          owner?: Database["public"]["Enums"]["requirement_owner"];
          required?: boolean;
          position_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_requirement_templates_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_requirement_templates_position_id_fkey";
            columns: ["position_id"];
            isOneToOne: false;
            referencedRelation: "positions";
            referencedColumns: ["id"];
          },
        ];
      };
      evidence_items: {
        Row: {
          id: string;
          cycle_id: string;
          kind: Database["public"]["Enums"]["evidence_kind"];
          startup_id: string | null;
          suggested_startup_id: string | null;
          suggestion_confidence: number | null;
          confirmed_by: string | null;
          confirmed_at: string | null;
          title: string | null;
          body: string | null;
          storage_path: string | null;
          mime_type: string | null;
          byte_size: number | null;
          checksum_sha256: string | null;
          source: Database["public"]["Enums"]["evidence_source"];
          parent_item_id: string | null;
          added_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          kind: Database["public"]["Enums"]["evidence_kind"];
          startup_id?: string | null;
          suggested_startup_id?: string | null;
          suggestion_confidence?: number | null;
          confirmed_by?: string | null;
          confirmed_at?: string | null;
          title?: string | null;
          body?: string | null;
          storage_path?: string | null;
          mime_type?: string | null;
          byte_size?: number | null;
          checksum_sha256?: string | null;
          source?: Database["public"]["Enums"]["evidence_source"];
          parent_item_id?: string | null;
          added_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          kind?: Database["public"]["Enums"]["evidence_kind"];
          startup_id?: string | null;
          suggested_startup_id?: string | null;
          suggestion_confidence?: number | null;
          confirmed_by?: string | null;
          confirmed_at?: string | null;
          title?: string | null;
          body?: string | null;
          storage_path?: string | null;
          mime_type?: string | null;
          byte_size?: number | null;
          checksum_sha256?: string | null;
          source?: Database["public"]["Enums"]["evidence_source"];
          parent_item_id?: string | null;
          added_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "evidence_items_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evidence_items_startup_id_fkey";
            columns: ["startup_id"];
            isOneToOne: false;
            referencedRelation: "startups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evidence_items_suggested_startup_id_fkey";
            columns: ["suggested_startup_id"];
            isOneToOne: false;
            referencedRelation: "startups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evidence_items_confirmed_by_fkey";
            columns: ["confirmed_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evidence_items_parent_item_id_fkey";
            columns: ["parent_item_id"];
            isOneToOne: false;
            referencedRelation: "evidence_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evidence_items_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      exception_requests: {
        Row: {
          id: string;
          cycle_id: string;
          startup_id: string;
          kind: Database["public"]["Enums"]["exception_kind"];
          status: Database["public"]["Enums"]["exception_status"];
          reason: string;
          requested_deadline: string;
          granted_deadline: string | null;
          decision_note: string | null;
          requested_by: string;
          decided_by: string | null;
          decided_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          startup_id: string;
          kind: Database["public"]["Enums"]["exception_kind"];
          status?: Database["public"]["Enums"]["exception_status"];
          reason: string;
          requested_deadline: string;
          granted_deadline?: string | null;
          decision_note?: string | null;
          requested_by: string;
          decided_by?: string | null;
          decided_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          startup_id?: string;
          kind?: Database["public"]["Enums"]["exception_kind"];
          status?: Database["public"]["Enums"]["exception_status"];
          reason?: string;
          requested_deadline?: string;
          granted_deadline?: string | null;
          decision_note?: string | null;
          requested_by?: string;
          decided_by?: string | null;
          decided_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exception_requests_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exception_requests_startup_id_fkey";
            columns: ["startup_id"];
            isOneToOne: false;
            referencedRelation: "startups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exception_requests_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exception_requests_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      extracted_field_observations: {
        Row: {
          id: string;
          extracted_field_id: string;
          evidence_item_id: string | null;
          format: string | null;
          locator: Json | null;
          raw_representation: string | null;
          observed_value: Json | null;
          unit: string | null;
          period: Json | null;
          qualifier: string | null;
          relationship: Database["public"]["Enums"]["observation_relationship"];
        };
        Insert: {
          id?: string;
          extracted_field_id: string;
          evidence_item_id?: string | null;
          format?: string | null;
          locator?: Json | null;
          raw_representation?: string | null;
          observed_value?: Json | null;
          unit?: string | null;
          period?: Json | null;
          qualifier?: string | null;
          relationship?: Database["public"]["Enums"]["observation_relationship"];
        };
        Update: {
          id?: string;
          extracted_field_id?: string;
          evidence_item_id?: string | null;
          format?: string | null;
          locator?: Json | null;
          raw_representation?: string | null;
          observed_value?: Json | null;
          unit?: string | null;
          period?: Json | null;
          qualifier?: string | null;
          relationship?: Database["public"]["Enums"]["observation_relationship"];
        };
        Relationships: [
          {
            foreignKeyName: "extracted_field_observations_extracted_field_id_fkey";
            columns: ["extracted_field_id"];
            isOneToOne: false;
            referencedRelation: "extracted_fields";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extracted_field_observations_evidence_item_id_fkey";
            columns: ["evidence_item_id"];
            isOneToOne: false;
            referencedRelation: "evidence_items";
            referencedColumns: ["id"];
          },
        ];
      };
      extracted_fields: {
        Row: {
          id: string;
          extraction_run_id: string;
          cycle_id: string;
          startup_id: string;
          field_path: string;
          status: Database["public"]["Enums"]["evidence_field_status"];
          resolved_value: Json | null;
          corrected_value: Json | null;
          review_state: Database["public"]["Enums"]["field_review_state"];
          confirmed_by: string | null;
          confirmed_at: string | null;
          normalized_unit: string | null;
          period: Json | null;
        };
        Insert: {
          id?: string;
          extraction_run_id: string;
          cycle_id: string;
          startup_id: string;
          field_path: string;
          status: Database["public"]["Enums"]["evidence_field_status"];
          resolved_value?: Json | null;
          corrected_value?: Json | null;
          review_state?: Database["public"]["Enums"]["field_review_state"];
          confirmed_by?: string | null;
          confirmed_at?: string | null;
          normalized_unit?: string | null;
          period?: Json | null;
        };
        Update: {
          id?: string;
          extraction_run_id?: string;
          cycle_id?: string;
          startup_id?: string;
          field_path?: string;
          status?: Database["public"]["Enums"]["evidence_field_status"];
          resolved_value?: Json | null;
          corrected_value?: Json | null;
          review_state?: Database["public"]["Enums"]["field_review_state"];
          confirmed_by?: string | null;
          confirmed_at?: string | null;
          normalized_unit?: string | null;
          period?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "extracted_fields_extraction_run_id_fkey";
            columns: ["extraction_run_id"];
            isOneToOne: false;
            referencedRelation: "extraction_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extracted_fields_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extracted_fields_startup_id_fkey";
            columns: ["startup_id"];
            isOneToOne: false;
            referencedRelation: "startups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extracted_fields_confirmed_by_fkey";
            columns: ["confirmed_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      extraction_runs: {
        Row: {
          id: string;
          cycle_id: string;
          startup_id: string;
          contract_version: string;
          model: string;
          prompt_version: string | null;
          status: Database["public"]["Enums"]["extraction_run_status"];
          error: string | null;
          started_at: string | null;
          finished_at: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          startup_id: string;
          contract_version: string;
          model: string;
          prompt_version?: string | null;
          status?: Database["public"]["Enums"]["extraction_run_status"];
          error?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          startup_id?: string;
          contract_version?: string;
          model?: string;
          prompt_version?: string | null;
          status?: Database["public"]["Enums"]["extraction_run_status"];
          error?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "extraction_runs_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extraction_runs_startup_id_fkey";
            columns: ["startup_id"];
            isOneToOne: false;
            referencedRelation: "startups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extraction_runs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      fallback_offers: {
        Row: {
          id: string;
          fallback_case_id: string;
          selection_id: string;
          position: number;
        };
        Insert: {
          id?: string;
          fallback_case_id: string;
          selection_id: string;
          position: number;
        };
        Update: {
          id?: string;
          fallback_case_id?: string;
          selection_id?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "fallback_offers_fallback_case_id_fkey";
            columns: ["fallback_case_id"];
            isOneToOne: false;
            referencedRelation: "candidate_choice_fallbacks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fallback_offers_selection_id_fkey";
            columns: ["selection_id"];
            isOneToOne: false;
            referencedRelation: "selections";
            referencedColumns: ["id"];
          },
        ];
      };
      interviews: {
        Row: {
          id: string;
          position_id: string;
          candidate_id: string;
          mode: Database["public"]["Enums"]["interview_mode"];
          status: Database["public"]["Enums"]["interview_status"];
          scheduled_for: string | null;
          duration_minutes: number | null;
          location: string | null;
          recording_url: string | null;
          transcript_status: Database["public"]["Enums"]["transcript_status"];
          transcript: string | null;
          ai_summary: string | null;
          feedback: string | null;
          recommendation:
            Database["public"]["Enums"]["interview_recommendation"] | null;
          interviewer_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          position_id: string;
          candidate_id: string;
          mode?: Database["public"]["Enums"]["interview_mode"];
          status?: Database["public"]["Enums"]["interview_status"];
          scheduled_for?: string | null;
          duration_minutes?: number | null;
          location?: string | null;
          recording_url?: string | null;
          transcript_status?: Database["public"]["Enums"]["transcript_status"];
          transcript?: string | null;
          ai_summary?: string | null;
          feedback?: string | null;
          recommendation?:
            Database["public"]["Enums"]["interview_recommendation"] | null;
          interviewer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          position_id?: string;
          candidate_id?: string;
          mode?: Database["public"]["Enums"]["interview_mode"];
          status?: Database["public"]["Enums"]["interview_status"];
          scheduled_for?: string | null;
          duration_minutes?: number | null;
          location?: string | null;
          recording_url?: string | null;
          transcript_status?: Database["public"]["Enums"]["transcript_status"];
          transcript?: string | null;
          ai_summary?: string | null;
          feedback?: string | null;
          recommendation?:
            Database["public"]["Enums"]["interview_recommendation"] | null;
          interviewer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "interviews_position_id_fkey";
            columns: ["position_id"];
            isOneToOne: false;
            referencedRelation: "positions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interviews_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interviews_interviewer_id_fkey";
            columns: ["interviewer_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_preferences: {
        Row: {
          user_id: string;
          category: Database["public"]["Enums"]["notification_category"];
          channel: Database["public"]["Enums"]["notification_channel"];
          enabled: boolean;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          category: Database["public"]["Enums"]["notification_category"];
          channel: Database["public"]["Enums"]["notification_channel"];
          enabled: boolean;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          category?: Database["public"]["Enums"]["notification_category"];
          channel?: Database["public"]["Enums"]["notification_channel"];
          enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          occurrence_id: string;
          step_key: string;
          recipient_id: string;
          channel: Database["public"]["Enums"]["notification_channel"];
          category: Database["public"]["Enums"]["notification_category"];
          status: Database["public"]["Enums"]["notification_status"];
          title: string;
          body: string;
          data: Json;
          mandatory: boolean;
          read_at: string | null;
          attempts: number;
          max_attempts: number;
          scheduled_for: string;
          claim_token: string | null;
          claimed_until: string | null;
          provider_message_id: string | null;
          last_error: string | null;
          sent_at: string | null;
          delivered_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          occurrence_id: string;
          step_key?: string;
          recipient_id: string;
          channel: Database["public"]["Enums"]["notification_channel"];
          category: Database["public"]["Enums"]["notification_category"];
          status: Database["public"]["Enums"]["notification_status"];
          title: string;
          body: string;
          data?: Json;
          mandatory?: boolean;
          read_at?: string | null;
          attempts?: number;
          max_attempts?: number;
          scheduled_for?: string;
          claim_token?: string | null;
          claimed_until?: string | null;
          provider_message_id?: string | null;
          last_error?: string | null;
          sent_at?: string | null;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          occurrence_id?: string;
          step_key?: string;
          recipient_id?: string;
          channel?: Database["public"]["Enums"]["notification_channel"];
          category?: Database["public"]["Enums"]["notification_category"];
          status?: Database["public"]["Enums"]["notification_status"];
          title?: string;
          body?: string;
          data?: Json;
          mandatory?: boolean;
          read_at?: string | null;
          attempts?: number;
          max_attempts?: number;
          scheduled_for?: string;
          claim_token?: string | null;
          claimed_until?: string | null;
          provider_message_id?: string | null;
          last_error?: string | null;
          sent_at?: string | null;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_occurrence_id_fkey";
            columns: ["occurrence_id"];
            isOneToOne: false;
            referencedRelation: "reminder_occurrences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      placement_requirements: {
        Row: {
          id: string;
          placement_id: string;
          template_id: string | null;
          title: string;
          owner: Database["public"]["Enums"]["requirement_owner"];
          required: boolean;
          status: Database["public"]["Enums"]["requirement_status"];
          amendment_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          placement_id: string;
          template_id?: string | null;
          title: string;
          owner: Database["public"]["Enums"]["requirement_owner"];
          required?: boolean;
          status?: Database["public"]["Enums"]["requirement_status"];
          amendment_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          placement_id?: string;
          template_id?: string | null;
          title?: string;
          owner?: Database["public"]["Enums"]["requirement_owner"];
          required?: boolean;
          status?: Database["public"]["Enums"]["requirement_status"];
          amendment_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "placement_requirements_placement_id_fkey";
            columns: ["placement_id"];
            isOneToOne: false;
            referencedRelation: "placements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "placement_requirements_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "document_requirement_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      placement_signatures: {
        Row: {
          id: string;
          placement_id: string;
          kind: Database["public"]["Enums"]["signature_kind"];
          signer_id: string;
          signer_name: string;
          declaration_accepted: boolean;
          document_opened_at: string;
          signed_at: string;
        };
        Insert: {
          id?: string;
          placement_id: string;
          kind: Database["public"]["Enums"]["signature_kind"];
          signer_id: string;
          signer_name: string;
          declaration_accepted: boolean;
          document_opened_at: string;
          signed_at?: string;
        };
        Update: {
          id?: string;
          placement_id?: string;
          kind?: Database["public"]["Enums"]["signature_kind"];
          signer_id?: string;
          signer_name?: string;
          declaration_accepted?: boolean;
          document_opened_at?: string;
          signed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "placement_signatures_placement_id_fkey";
            columns: ["placement_id"];
            isOneToOne: false;
            referencedRelation: "placements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "placement_signatures_signer_id_fkey";
            columns: ["signer_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      placements: {
        Row: {
          id: string;
          cycle_id: string;
          selection_id: string;
          candidate_id: string;
          startup_id: string;
          position_id: string;
          committed_weekly_hours: number;
          starts_on: string;
          ends_on: string;
          supervisor_id: string | null;
          supervisor_name: string;
          status: Database["public"]["Enums"]["placement_status"];
          candidate_ready_at: string | null;
          startup_ready_at: string | null;
          details_finalized_at: string | null;
          qstp_approved_at: string | null;
          cancelled_at: string | null;
          cancellation_reason: string | null;
          replacement_for_placement_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          selection_id: string;
          candidate_id: string;
          startup_id: string;
          position_id: string;
          committed_weekly_hours: number;
          starts_on: string;
          ends_on: string;
          supervisor_id?: string | null;
          supervisor_name: string;
          status?: Database["public"]["Enums"]["placement_status"];
          candidate_ready_at?: string | null;
          startup_ready_at?: string | null;
          details_finalized_at?: string | null;
          qstp_approved_at?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          replacement_for_placement_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          selection_id?: string;
          candidate_id?: string;
          startup_id?: string;
          position_id?: string;
          committed_weekly_hours?: number;
          starts_on?: string;
          ends_on?: string;
          supervisor_id?: string | null;
          supervisor_name?: string;
          status?: Database["public"]["Enums"]["placement_status"];
          candidate_ready_at?: string | null;
          startup_ready_at?: string | null;
          details_finalized_at?: string | null;
          qstp_approved_at?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          replacement_for_placement_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "placements_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "placements_selection_id_fkey";
            columns: ["selection_id"];
            isOneToOne: true;
            referencedRelation: "selections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "placements_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "placements_startup_id_fkey";
            columns: ["startup_id"];
            isOneToOne: false;
            referencedRelation: "startups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "placements_position_id_fkey";
            columns: ["position_id"];
            isOneToOne: false;
            referencedRelation: "positions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "placements_supervisor_id_fkey";
            columns: ["supervisor_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "placements_replacement_for_placement_id_fkey";
            columns: ["replacement_for_placement_id"];
            isOneToOne: false;
            referencedRelation: "placements";
            referencedColumns: ["id"];
          },
        ];
      };
      pool_entries: {
        Row: {
          id: string;
          position_id: string;
          candidate_id: string;
          status: Database["public"]["Enums"]["pool_entry_status"];
          shared_at: string;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          position_id: string;
          candidate_id: string;
          status?: Database["public"]["Enums"]["pool_entry_status"];
          shared_at?: string;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          position_id?: string;
          candidate_id?: string;
          status?: Database["public"]["Enums"]["pool_entry_status"];
          shared_at?: string;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pool_entries_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pool_entries_position_id_fkey";
            columns: ["position_id"];
            isOneToOne: false;
            referencedRelation: "positions";
            referencedColumns: ["id"];
          },
        ];
      };
      position_intents: {
        Row: {
          id: string;
          cycle_id: string;
          startup_id: string;
          title: string;
          category: string;
          expected_deliverable: string;
          learning_outcomes: string[];
          work_mode: Database["public"]["Enums"]["work_arrangement"];
          supervisor_name: string;
          supervisor_id: string | null;
          weekly_supervision_minutes: number;
          maximum_interns: number;
          resources_ready: boolean;
          onboarding_ready: boolean;
          submitted_by: string;
          submitted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          startup_id: string;
          title: string;
          category: string;
          expected_deliverable: string;
          learning_outcomes?: string[];
          work_mode: Database["public"]["Enums"]["work_arrangement"];
          supervisor_name: string;
          supervisor_id?: string | null;
          weekly_supervision_minutes: number;
          maximum_interns: number;
          resources_ready?: boolean;
          onboarding_ready?: boolean;
          submitted_by: string;
          submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          startup_id?: string;
          title?: string;
          category?: string;
          expected_deliverable?: string;
          learning_outcomes?: string[];
          work_mode?: Database["public"]["Enums"]["work_arrangement"];
          supervisor_name?: string;
          supervisor_id?: string | null;
          weekly_supervision_minutes?: number;
          maximum_interns?: number;
          resources_ready?: boolean;
          onboarding_ready?: boolean;
          submitted_by?: string;
          submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "position_intents_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "position_intents_startup_id_fkey";
            columns: ["startup_id"];
            isOneToOne: false;
            referencedRelation: "startups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "position_intents_supervisor_id_fkey";
            columns: ["supervisor_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "position_intents_submitted_by_fkey";
            columns: ["submitted_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      position_review_history: {
        Row: {
          id: string;
          position_id: string;
          status: Database["public"]["Enums"]["position_status"];
          note: string | null;
          actor_id: string | null;
          occurred_at: string;
        };
        Insert: {
          id?: string;
          position_id: string;
          status: Database["public"]["Enums"]["position_status"];
          note?: string | null;
          actor_id?: string | null;
          occurred_at?: string;
        };
        Update: {
          id?: string;
          position_id?: string;
          status?: Database["public"]["Enums"]["position_status"];
          note?: string | null;
          actor_id?: string | null;
          occurred_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "position_review_history_position_id_fkey";
            columns: ["position_id"];
            isOneToOne: false;
            referencedRelation: "positions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "position_review_history_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      positions: {
        Row: {
          id: string;
          cycle_id: string;
          startup_id: string;
          intent_id: string | null;
          title: string;
          description: string;
          required_skills: string[];
          work_arrangement: Database["public"]["Enums"]["work_arrangement"];
          additional_requirements: string | null;
          intern_count: number;
          hours_per_intern: number;
          duration_weeks: number;
          supervisor_id: string | null;
          supervisor_name: string | null;
          status: Database["public"]["Enums"]["position_status"];
          review_note: string | null;
          redistribution_round_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          startup_id: string;
          intent_id?: string | null;
          title: string;
          description: string;
          required_skills?: string[];
          work_arrangement?: Database["public"]["Enums"]["work_arrangement"];
          additional_requirements?: string | null;
          intern_count: number;
          hours_per_intern: number;
          duration_weeks: number;
          supervisor_id?: string | null;
          supervisor_name?: string | null;
          status?: Database["public"]["Enums"]["position_status"];
          review_note?: string | null;
          redistribution_round_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          startup_id?: string;
          intent_id?: string | null;
          title?: string;
          description?: string;
          required_skills?: string[];
          work_arrangement?: Database["public"]["Enums"]["work_arrangement"];
          additional_requirements?: string | null;
          intern_count?: number;
          hours_per_intern?: number;
          duration_weeks?: number;
          supervisor_id?: string | null;
          supervisor_name?: string | null;
          status?: Database["public"]["Enums"]["position_status"];
          review_note?: string | null;
          redistribution_round_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "positions_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "positions_startup_id_fkey";
            columns: ["startup_id"];
            isOneToOne: false;
            referencedRelation: "startups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "positions_intent_id_fkey";
            columns: ["intent_id"];
            isOneToOne: false;
            referencedRelation: "position_intents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "positions_supervisor_id_fkey";
            columns: ["supervisor_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "positions_redistribution_round_fk";
            columns: ["redistribution_round_id"];
            isOneToOne: false;
            referencedRelation: "redistribution_rounds";
            referencedColumns: ["id"];
          },
        ];
      };
      prioritisation_policy_versions: {
        Row: {
          id: string;
          version: string;
          definition: Json;
          allocation_mode: Database["public"]["Enums"]["allocation_mode"];
          active: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          version: string;
          definition: Json;
          allocation_mode?: Database["public"]["Enums"]["allocation_mode"];
          active?: boolean;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          version?: string;
          definition?: Json;
          allocation_mode?: Database["public"]["Enums"]["allocation_mode"];
          active?: boolean;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prioritisation_policy_versions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      prioritisation_results: {
        Row: {
          id: string;
          run_id: string;
          startup_id: string;
          rating_id: string | null;
          extraction_run_id: string | null;
          status: Database["public"]["Enums"]["startup_outcome_status"];
          score: number | null;
          breakdown: Json | null;
          history_source: string | null;
          rank: number | null;
          tie_group: number | null;
          requires_tie_resolution: boolean;
          maximum_hours: number | null;
          proposed_hours: number | null;
          adjusted_hours: number | null;
          adjustment_reason: string | null;
          waitlist_rank: number | null;
          waitlist_order_status:
            Database["public"]["Enums"]["waitlist_order_status"] | null;
          waitlist_reason: string | null;
          blockers: Json;
          signals: Json;
          adjustments: Json;
          position_checks: Json;
          participation_id: string | null;
          requested_hours: number;
        };
        Insert: {
          id?: string;
          run_id: string;
          startup_id: string;
          rating_id?: string | null;
          extraction_run_id?: string | null;
          status: Database["public"]["Enums"]["startup_outcome_status"];
          score?: number | null;
          breakdown?: Json | null;
          history_source?: string | null;
          rank?: number | null;
          tie_group?: number | null;
          requires_tie_resolution?: boolean;
          maximum_hours?: number | null;
          proposed_hours?: number | null;
          adjusted_hours?: number | null;
          adjustment_reason?: string | null;
          waitlist_rank?: number | null;
          waitlist_order_status?:
            Database["public"]["Enums"]["waitlist_order_status"] | null;
          waitlist_reason?: string | null;
          blockers?: Json;
          signals?: Json;
          adjustments?: Json;
          position_checks?: Json;
          participation_id?: string | null;
          requested_hours?: number;
        };
        Update: {
          id?: string;
          run_id?: string;
          startup_id?: string;
          rating_id?: string | null;
          extraction_run_id?: string | null;
          status?: Database["public"]["Enums"]["startup_outcome_status"];
          score?: number | null;
          breakdown?: Json | null;
          history_source?: string | null;
          rank?: number | null;
          tie_group?: number | null;
          requires_tie_resolution?: boolean;
          maximum_hours?: number | null;
          proposed_hours?: number | null;
          adjusted_hours?: number | null;
          adjustment_reason?: string | null;
          waitlist_rank?: number | null;
          waitlist_order_status?:
            Database["public"]["Enums"]["waitlist_order_status"] | null;
          waitlist_reason?: string | null;
          blockers?: Json;
          signals?: Json;
          adjustments?: Json;
          position_checks?: Json;
          participation_id?: string | null;
          requested_hours?: number;
        };
        Relationships: [
          {
            foreignKeyName: "prioritisation_results_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "prioritisation_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prioritisation_results_startup_id_fkey";
            columns: ["startup_id"];
            isOneToOne: false;
            referencedRelation: "startups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prioritisation_results_rating_id_fkey";
            columns: ["rating_id"];
            isOneToOne: false;
            referencedRelation: "startup_ratings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prioritisation_results_extraction_run_id_fkey";
            columns: ["extraction_run_id"];
            isOneToOne: false;
            referencedRelation: "extraction_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prioritisation_results_participation_id_fkey";
            columns: ["participation_id"];
            isOneToOne: false;
            referencedRelation: "cycle_participations";
            referencedColumns: ["id"];
          },
        ];
      };
      prioritisation_runs: {
        Row: {
          id: string;
          cycle_id: string;
          version: number;
          status: Database["public"]["Enums"]["prioritisation_run_status"];
          policy_version_id: string | null;
          policy_snapshot: Json;
          history_snapshot: Json | null;
          budget_hours: number;
          maximum_qualified_hours: number;
          proposed_hours: number;
          residual_hours: number;
          within_budget: boolean;
          allocation_mode: Database["public"]["Enums"]["allocation_mode"];
          allocation_strategy: string;
          completeness: Database["public"]["Enums"]["prioritisation_run_completeness"];
          signals: Json;
          distribution: Json | null;
          created_by: string;
          created_at: string;
          confirmed_by: string | null;
          confirmed_at: string | null;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          version: number;
          status?: Database["public"]["Enums"]["prioritisation_run_status"];
          policy_version_id?: string | null;
          policy_snapshot: Json;
          history_snapshot?: Json | null;
          budget_hours: number;
          maximum_qualified_hours?: number;
          proposed_hours?: number;
          residual_hours?: number;
          within_budget: boolean;
          allocation_mode?: Database["public"]["Enums"]["allocation_mode"];
          allocation_strategy: string;
          completeness: Database["public"]["Enums"]["prioritisation_run_completeness"];
          signals?: Json;
          distribution?: Json | null;
          created_by: string;
          created_at?: string;
          confirmed_by?: string | null;
          confirmed_at?: string | null;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          version?: number;
          status?: Database["public"]["Enums"]["prioritisation_run_status"];
          policy_version_id?: string | null;
          policy_snapshot?: Json;
          history_snapshot?: Json | null;
          budget_hours?: number;
          maximum_qualified_hours?: number;
          proposed_hours?: number;
          residual_hours?: number;
          within_budget?: boolean;
          allocation_mode?: Database["public"]["Enums"]["allocation_mode"];
          allocation_strategy?: string;
          completeness?: Database["public"]["Enums"]["prioritisation_run_completeness"];
          signals?: Json;
          distribution?: Json | null;
          created_by?: string;
          created_at?: string;
          confirmed_by?: string | null;
          confirmed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "prioritisation_runs_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: true;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prioritisation_runs_policy_version_id_fkey";
            columns: ["policy_version_id"];
            isOneToOne: false;
            referencedRelation: "prioritisation_policy_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prioritisation_runs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prioritisation_runs_confirmed_by_fkey";
            columns: ["confirmed_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      push_tokens: {
        Row: {
          id: string;
          user_id: string;
          token: string;
          platform: string | null;
          device_id: string | null;
          created_at: string;
          last_seen_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          token: string;
          platform?: string | null;
          device_id?: string | null;
          created_at?: string;
          last_seen_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          token?: string;
          platform?: string | null;
          device_id?: string | null;
          created_at?: string;
          last_seen_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      qstp_staff: {
        Row: {
          user_id: string;
          role: Database["public"]["Enums"]["qstp_role"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          role: Database["public"]["Enums"]["qstp_role"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          role?: Database["public"]["Enums"]["qstp_role"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "qstp_staff_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      rating_citations: {
        Row: {
          id: string;
          rating_item_id: string;
          extracted_field_id: string | null;
          evidence_item_id: string | null;
          note: string | null;
        };
        Insert: {
          id?: string;
          rating_item_id: string;
          extracted_field_id?: string | null;
          evidence_item_id?: string | null;
          note?: string | null;
        };
        Update: {
          id?: string;
          rating_item_id?: string;
          extracted_field_id?: string | null;
          evidence_item_id?: string | null;
          note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "rating_citations_rating_item_id_fkey";
            columns: ["rating_item_id"];
            isOneToOne: false;
            referencedRelation: "startup_rating_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rating_citations_extracted_field_id_fkey";
            columns: ["extracted_field_id"];
            isOneToOne: false;
            referencedRelation: "extracted_fields";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rating_citations_evidence_item_id_fkey";
            columns: ["evidence_item_id"];
            isOneToOne: false;
            referencedRelation: "evidence_items";
            referencedColumns: ["id"];
          },
        ];
      };
      recovery_cases: {
        Row: {
          id: string;
          cycle_id: string;
          startup_id: string;
          placement_id: string | null;
          recoverable_hours: number;
          status: Database["public"]["Enums"]["recovery_status"];
          protected_until: string | null;
          reason: string;
          confirmed_by: string | null;
          redistribution_round_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          startup_id: string;
          placement_id?: string | null;
          recoverable_hours: number;
          status?: Database["public"]["Enums"]["recovery_status"];
          protected_until?: string | null;
          reason: string;
          confirmed_by?: string | null;
          redistribution_round_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          startup_id?: string;
          placement_id?: string | null;
          recoverable_hours?: number;
          status?: Database["public"]["Enums"]["recovery_status"];
          protected_until?: string | null;
          reason?: string;
          confirmed_by?: string | null;
          redistribution_round_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recovery_cases_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recovery_cases_startup_id_fkey";
            columns: ["startup_id"];
            isOneToOne: false;
            referencedRelation: "startups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recovery_cases_placement_id_fkey";
            columns: ["placement_id"];
            isOneToOne: false;
            referencedRelation: "placements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recovery_cases_confirmed_by_fkey";
            columns: ["confirmed_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recovery_cases_redistribution_round_fk";
            columns: ["redistribution_round_id"];
            isOneToOne: false;
            referencedRelation: "redistribution_rounds";
            referencedColumns: ["id"];
          },
        ];
      };
      redistribution_invitations: {
        Row: {
          id: string;
          round_id: string;
          startup_id: string;
          status: Database["public"]["Enums"]["redistribution_invitation_status"];
          proposed_hours: number;
          responded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          round_id: string;
          startup_id: string;
          status?: Database["public"]["Enums"]["redistribution_invitation_status"];
          proposed_hours: number;
          responded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          round_id?: string;
          startup_id?: string;
          status?: Database["public"]["Enums"]["redistribution_invitation_status"];
          proposed_hours?: number;
          responded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "redistribution_invitations_round_id_fkey";
            columns: ["round_id"];
            isOneToOne: false;
            referencedRelation: "redistribution_rounds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "redistribution_invitations_startup_id_fkey";
            columns: ["startup_id"];
            isOneToOne: false;
            referencedRelation: "startups";
            referencedColumns: ["id"];
          },
        ];
      };
      redistribution_rounds: {
        Row: {
          id: string;
          cycle_id: string;
          number: number;
          status: Database["public"]["Enums"]["redistribution_status"];
          available_hours: number;
          position_deadline: string;
          selection_deadline: string;
          created_by: string;
          created_at: string;
          closed_at: string | null;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          number: number;
          status?: Database["public"]["Enums"]["redistribution_status"];
          available_hours: number;
          position_deadline: string;
          selection_deadline: string;
          created_by: string;
          created_at?: string;
          closed_at?: string | null;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          number?: number;
          status?: Database["public"]["Enums"]["redistribution_status"];
          available_hours?: number;
          position_deadline?: string;
          selection_deadline?: string;
          created_by?: string;
          created_at?: string;
          closed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "redistribution_rounds_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "redistribution_rounds_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      reminder_occurrences: {
        Row: {
          id: string;
          cycle_id: string;
          rule_key: string;
          subject_type: Database["public"]["Enums"]["reminder_subject_type"];
          subject_id: string;
          occurrence_key: string;
          context: Json;
          detected_at: string;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          rule_key: string;
          subject_type: Database["public"]["Enums"]["reminder_subject_type"];
          subject_id: string;
          occurrence_key: string;
          context?: Json;
          detected_at: string;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          rule_key?: string;
          subject_type?: Database["public"]["Enums"]["reminder_subject_type"];
          subject_id?: string;
          occurrence_key?: string;
          context?: Json;
          detected_at?: string;
          resolved_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminder_occurrences_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
        ];
      };
      reminder_rule_configurations: {
        Row: {
          id: string;
          rule_key: string;
          cycle_id: string | null;
          enabled: boolean;
          schedule_offset_hours: number | null;
          audience: Json;
          required_channels: Database["public"]["Enums"]["notification_channel"][];
          preferred_channels: Database["public"]["Enums"]["notification_channel"][];
          mandatory: boolean;
          urgent: boolean;
          updated_by: string;
          created_at: string;
          updated_at: string;
          escalation_after_hours: number | null;
        };
        Insert: {
          id?: string;
          rule_key: string;
          cycle_id?: string | null;
          enabled?: boolean;
          schedule_offset_hours?: number | null;
          audience?: Json;
          required_channels?: Database["public"]["Enums"]["notification_channel"][];
          preferred_channels?: Database["public"]["Enums"]["notification_channel"][];
          mandatory?: boolean;
          urgent?: boolean;
          updated_by: string;
          created_at?: string;
          updated_at?: string;
          escalation_after_hours?: number | null;
        };
        Update: {
          id?: string;
          rule_key?: string;
          cycle_id?: string | null;
          enabled?: boolean;
          schedule_offset_hours?: number | null;
          audience?: Json;
          required_channels?: Database["public"]["Enums"]["notification_channel"][];
          preferred_channels?: Database["public"]["Enums"]["notification_channel"][];
          mandatory?: boolean;
          urgent?: boolean;
          updated_by?: string;
          created_at?: string;
          updated_at?: string;
          escalation_after_hours?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "reminder_rule_configurations_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reminder_rule_configurations_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      requirement_submission_fields: {
        Row: {
          id: string;
          submission_id: string;
          key: string;
          label: string | null;
          extracted: string | null;
          confirmed: string | null;
          confidence: number | null;
        };
        Insert: {
          id?: string;
          submission_id: string;
          key: string;
          label?: string | null;
          extracted?: string | null;
          confirmed?: string | null;
          confidence?: number | null;
        };
        Update: {
          id?: string;
          submission_id?: string;
          key?: string;
          label?: string | null;
          extracted?: string | null;
          confirmed?: string | null;
          confidence?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "requirement_submission_fields_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "requirement_submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      requirement_submissions: {
        Row: {
          id: string;
          requirement_id: string;
          revision: number;
          file_name: string;
          storage_path: string;
          submitted_by: string;
          submitted_at: string;
          correction_reason: string | null;
        };
        Insert: {
          id?: string;
          requirement_id: string;
          revision: number;
          file_name: string;
          storage_path: string;
          submitted_by: string;
          submitted_at?: string;
          correction_reason?: string | null;
        };
        Update: {
          id?: string;
          requirement_id?: string;
          revision?: number;
          file_name?: string;
          storage_path?: string;
          submitted_by?: string;
          submitted_at?: string;
          correction_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "requirement_submissions_requirement_id_fkey";
            columns: ["requirement_id"];
            isOneToOne: false;
            referencedRelation: "placement_requirements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requirement_submissions_submitted_by_fkey";
            columns: ["submitted_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      selection_conflicts: {
        Row: {
          id: string;
          cycle_id: string;
          candidate_id: string;
          attempted_selection_id: string | null;
          blocking_selection_id: string;
          status: Database["public"]["Enums"]["selection_conflict_status"];
          previous_startup_id: string;
          requested_startup_id: string;
          resolved_by: string | null;
          reason: string | null;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          candidate_id: string;
          attempted_selection_id?: string | null;
          blocking_selection_id: string;
          status?: Database["public"]["Enums"]["selection_conflict_status"];
          previous_startup_id: string;
          requested_startup_id: string;
          resolved_by?: string | null;
          reason?: string | null;
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          candidate_id?: string;
          attempted_selection_id?: string | null;
          blocking_selection_id?: string;
          status?: Database["public"]["Enums"]["selection_conflict_status"];
          previous_startup_id?: string;
          requested_startup_id?: string;
          resolved_by?: string | null;
          reason?: string | null;
          created_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "selection_conflicts_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "selection_conflicts_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "selection_conflicts_attempted_selection_id_fkey";
            columns: ["attempted_selection_id"];
            isOneToOne: false;
            referencedRelation: "selections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "selection_conflicts_blocking_selection_id_fkey";
            columns: ["blocking_selection_id"];
            isOneToOne: false;
            referencedRelation: "selections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "selection_conflicts_previous_startup_id_fkey";
            columns: ["previous_startup_id"];
            isOneToOne: false;
            referencedRelation: "startups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "selection_conflicts_requested_startup_id_fkey";
            columns: ["requested_startup_id"];
            isOneToOne: false;
            referencedRelation: "startups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "selection_conflicts_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      selections: {
        Row: {
          id: string;
          position_id: string;
          startup_id: string;
          candidate_id: string;
          status: Database["public"]["Enums"]["selection_status"];
          reserved_at: string;
          offered_at: string | null;
          accepted_at: string | null;
          confirmed_at: string | null;
          released_at: string | null;
          selected_by: string;
          override_reason: string | null;
          overridden_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          position_id: string;
          startup_id: string;
          candidate_id: string;
          status?: Database["public"]["Enums"]["selection_status"];
          reserved_at?: string;
          offered_at?: string | null;
          accepted_at?: string | null;
          confirmed_at?: string | null;
          released_at?: string | null;
          selected_by: string;
          override_reason?: string | null;
          overridden_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          position_id?: string;
          startup_id?: string;
          candidate_id?: string;
          status?: Database["public"]["Enums"]["selection_status"];
          reserved_at?: string;
          offered_at?: string | null;
          accepted_at?: string | null;
          confirmed_at?: string | null;
          released_at?: string | null;
          selected_by?: string;
          override_reason?: string | null;
          overridden_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "selections_position_id_fkey";
            columns: ["position_id"];
            isOneToOne: false;
            referencedRelation: "positions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "selections_startup_id_fkey";
            columns: ["startup_id"];
            isOneToOne: false;
            referencedRelation: "startups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "selections_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: true;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "selections_selected_by_fkey";
            columns: ["selected_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "selections_overridden_by_fkey";
            columns: ["overridden_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      slack_notification_targets: {
        Row: {
          id: string;
          user_id: string;
          workspace_id: string;
          channel_id: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          workspace_id: string;
          channel_id: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          workspace_id?: string;
          channel_id?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "slack_notification_targets_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      startup_members: {
        Row: {
          id: string;
          startup_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["startup_role"];
          status: Database["public"]["Enums"]["member_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          startup_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["startup_role"];
          status?: Database["public"]["Enums"]["member_status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          startup_id?: string;
          user_id?: string;
          role?: Database["public"]["Enums"]["startup_role"];
          status?: Database["public"]["Enums"]["member_status"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "startup_members_startup_id_fkey";
            columns: ["startup_id"];
            isOneToOne: false;
            referencedRelation: "startups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "startup_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      startup_rating_items: {
        Row: {
          id: string;
          rating_id: string;
          dimension: Database["public"]["Enums"]["rating_key"];
          value: number;
          rationale: string;
        };
        Insert: {
          id?: string;
          rating_id: string;
          dimension: Database["public"]["Enums"]["rating_key"];
          value: number;
          rationale: string;
        };
        Update: {
          id?: string;
          rating_id?: string;
          dimension?: Database["public"]["Enums"]["rating_key"];
          value?: number;
          rationale?: string;
        };
        Relationships: [
          {
            foreignKeyName: "startup_rating_items_rating_id_fkey";
            columns: ["rating_id"];
            isOneToOne: false;
            referencedRelation: "startup_ratings";
            referencedColumns: ["id"];
          },
        ];
      };
      startup_ratings: {
        Row: {
          id: string;
          cycle_id: string;
          startup_id: string;
          status: Database["public"]["Enums"]["rating_status"];
          rated_by: string;
          supersedes_id: string | null;
          revision_reason: string | null;
          submitted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          startup_id: string;
          status?: Database["public"]["Enums"]["rating_status"];
          rated_by: string;
          supersedes_id?: string | null;
          revision_reason?: string | null;
          submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          startup_id?: string;
          status?: Database["public"]["Enums"]["rating_status"];
          rated_by?: string;
          supersedes_id?: string | null;
          revision_reason?: string | null;
          submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "startup_ratings_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "startup_ratings_startup_id_fkey";
            columns: ["startup_id"];
            isOneToOne: false;
            referencedRelation: "startups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "startup_ratings_rated_by_fkey";
            columns: ["rated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "startup_ratings_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "startup_ratings";
            referencedColumns: ["id"];
          },
        ];
      };
      startups: {
        Row: {
          id: string;
          name: string;
          slug: string;
          sector: string | null;
          contact_email: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          sector?: string | null;
          contact_email: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          sector?: string | null;
          contact_email?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      task_assignments: {
        Row: {
          id: string;
          cycle_id: string;
          template_id: string | null;
          position_id: string;
          candidate_id: string;
          status: Database["public"]["Enums"]["task_assignment_status"];
          due_at: string;
          submitted_at: string | null;
          late_accepted: boolean;
          file_name: string | null;
          link_url: string | null;
          review_notes: string | null;
          reviewed_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          template_id?: string | null;
          position_id: string;
          candidate_id: string;
          status?: Database["public"]["Enums"]["task_assignment_status"];
          due_at: string;
          submitted_at?: string | null;
          late_accepted?: boolean;
          file_name?: string | null;
          link_url?: string | null;
          review_notes?: string | null;
          reviewed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          template_id?: string | null;
          position_id?: string;
          candidate_id?: string;
          status?: Database["public"]["Enums"]["task_assignment_status"];
          due_at?: string;
          submitted_at?: string | null;
          late_accepted?: boolean;
          file_name?: string | null;
          link_url?: string | null;
          review_notes?: string | null;
          reviewed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_assignments_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "task_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_position_id_fkey";
            columns: ["position_id"];
            isOneToOne: false;
            referencedRelation: "positions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      task_templates: {
        Row: {
          id: string;
          cycle_id: string;
          position_id: string;
          title: string;
          instructions: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          cycle_id: string;
          position_id: string;
          title: string;
          instructions: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          cycle_id?: string;
          position_id?: string;
          title?: string;
          instructions?: string;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_templates_cycle_id_fkey";
            columns: ["cycle_id"];
            isOneToOne: false;
            referencedRelation: "cycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_templates_position_id_fkey";
            columns: ["position_id"];
            isOneToOne: false;
            referencedRelation: "positions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_templates_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "users_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<PropertyKey, never>;
    Functions: {
      accept_offer: {
        Args: {
          p_selection_id: string;
        };
        Returns: Database["public"]["Tables"]["selections"]["Row"];
      };
      accept_reservation: {
        Args: {
          p_selection_id: string;
        };
        Returns: Database["public"]["Tables"]["selections"]["Row"];
      };
      actor_role_of: {
        Args: {
          p_user_id: string;
        };
        Returns: Database["public"]["Enums"]["activity_actor_role"];
      };
      adjust_prioritisation_result: {
        Args: {
          p_run_id: string;
          p_startup_id: string;
          p_hours: number;
          p_reason: string;
        };
        Returns: Database["public"]["Tables"]["prioritisation_results"]["Row"];
      };
      advance_cycle_stage: {
        Args: {
          p_cycle_id: string;
          p_to_stage: Database["public"]["Enums"]["cycle_stage"];
        };
        Returns: Database["public"]["Tables"]["cycles"]["Row"];
      };
      append_activity: {
        Args: {
          p_cycle_id: string;
          p_entity_type: string;
          p_entity_id: string;
          p_action: string;
          p_before?: Json;
          p_after?: Json;
          p_reason?: string;
        };
        Returns: Database["public"]["Tables"]["activity_events"]["Row"];
      };
      cancel_placement: {
        Args: {
          p_placement_id: string;
          p_reason: string;
        };
        Returns: Database["public"]["Tables"]["placements"]["Row"];
      };
      cancel_placement_with_recovery: {
        Args: {
          p_placement_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      candidate_shared_with_my_startup: {
        Args: {
          target_candidate_id: string;
        };
        Returns: boolean;
      };
      claim_due_notifications: {
        Args: {
          p_limit?: number;
        };
        Returns: {
          id: string;
          claim_token: string;
          recipient_id: string;
          channel: Database["public"]["Enums"]["notification_channel"];
          category: Database["public"]["Enums"]["notification_category"];
          title: string;
          body: string;
          data: Json;
          email: string;
          slack_channel_id: string;
          attempts: number;
          max_attempts: number;
        }[];
      };
      confirm_document_fields: {
        Args: {
          p_document_id: string;
          p_fields: Json;
        };
        Returns: Database["public"]["Tables"]["candidate_documents"]["Row"];
      };
      confirm_selection: {
        Args: {
          p_selection_id: string;
          p_starts_on: string;
          p_ends_on: string;
          p_supervisor_name: string;
          p_supervisor_id?: string;
        };
        Returns: Database["public"]["Tables"]["placements"]["Row"];
      };
      create_cycle_with_participations: {
        Args: {
          p_name: string;
          p_starts_on: string;
          p_ends_on: string;
          p_funded_weekly_hours: number;
          p_selection_mode: Database["public"]["Enums"]["selection_mode"];
          p_deadlines: Json;
          p_clone_from?: string;
        };
        Returns: Database["public"]["Tables"]["cycles"]["Row"];
      };
      create_position: {
        Args: {
          p_position: Json;
        };
        Returns: Database["public"]["Tables"]["positions"]["Row"];
      };
      create_prioritisation_run: {
        Args: {
          p_cycle_id: string;
          p_run: Json;
          p_results: Json;
        };
        Returns: Database["public"]["Tables"]["prioritisation_runs"]["Row"];
      };
      create_redistribution_round: {
        Args: {
          p_cycle_id: string;
          p_recovery_case_ids: string[];
          p_position_deadline: string;
          p_selection_deadline: string;
        };
        Returns: Database["public"]["Tables"]["redistribution_rounds"]["Row"];
      };
      decide_allocation: {
        Args: {
          p_cycle_id: string;
          p_startup_id: string;
          p_weekly_hours: number;
          p_score?: number;
          p_justification?: string;
          p_override_reason?: string;
          p_redistribution_round_id?: string;
        };
        Returns: Database["public"]["Tables"]["allocations"]["Row"];
      };
      decide_allocation_unchecked: {
        Args: {
          p_cycle_id: string;
          p_startup_id: string;
          p_weekly_hours: number;
          p_score?: number;
          p_justification?: string;
          p_override_reason?: string;
          p_redistribution_round_id?: string;
        };
        Returns: Database["public"]["Tables"]["allocations"]["Row"];
      };
      decide_exception: {
        Args: {
          p_exception_id: string;
          p_status: Database["public"]["Enums"]["exception_status"];
          p_granted_deadline?: string;
          p_note?: string;
        };
        Returns: Database["public"]["Tables"]["exception_requests"]["Row"];
      };
      decline_selection: {
        Args: {
          p_selection_id: string;
        };
        Returns: Database["public"]["Tables"]["selections"]["Row"];
      };
      effective_selection_deadline: {
        Args: {
          p_cycle_id: string;
          p_startup_id: string;
        };
        Returns: string;
      };
      emit_reminder: {
        Args: {
          p_cycle_id: string;
          p_rule_key: string;
          p_subject_type: Database["public"]["Enums"]["reminder_subject_type"];
          p_subject_id: string;
          p_occurrence_key: string;
          p_context: Json;
          p_step_key: string;
          p_recipients: string[];
          p_category: Database["public"]["Enums"]["notification_category"];
          p_title: string;
          p_body: string;
          p_required_channels: Database["public"]["Enums"]["notification_channel"][];
          p_preferred_channels: Database["public"]["Enums"]["notification_channel"][];
          p_mandatory: boolean;
          p_now: string;
        };
        Returns: number;
      };
      enqueue_candidate_availability_reminders: {
        Args: {
          p_now?: string;
        };
        Returns: number;
      };
      enqueue_document_verification_reminders: {
        Args: {
          p_now?: string;
        };
        Returns: number;
      };
      enqueue_exception_pending_reminders: {
        Args: {
          p_now?: string;
        };
        Returns: number;
      };
      enqueue_hours_at_risk_reminders: {
        Args: {
          p_now?: string;
        };
        Returns: number;
      };
      enqueue_pool_untouched_reminders: {
        Args: {
          p_now?: string;
        };
        Returns: number;
      };
      enqueue_positions_not_submitted_reminders: {
        Args: {
          p_now?: string;
        };
        Returns: number;
      };
      enqueue_selection_deadline_reminders: {
        Args: {
          p_now?: string;
        };
        Returns: number;
      };
      escalate_reminders: {
        Args: {
          p_now?: string;
        };
        Returns: number;
      };
      fanout_reminder_step: {
        Args: {
          p_occurrence_id: string;
          p_step_key: string;
          p_recipients: string[];
          p_category: Database["public"]["Enums"]["notification_category"];
          p_title: string;
          p_body: string;
          p_data?: Json;
          p_required_channels?: Database["public"]["Enums"]["notification_channel"][];
          p_preferred_channels?: Database["public"]["Enums"]["notification_channel"][];
          p_mandatory?: boolean;
        };
        Returns: number;
      };
      finish_notification_delivery: {
        Args: {
          p_id: string;
          p_claim_token: string;
          p_status: Database["public"]["Enums"]["notification_status"];
          p_error?: string;
          p_scheduled_for?: string;
          p_provider_message_id?: string;
        };
        Returns: boolean;
      };
      get_push_tokens: {
        Args: {
          p_user_ids: string[];
        };
        Returns: {
          user_id: string;
          token: string;
        }[];
      };
      has_qstp_role: {
        Args: {
          roles: Database["public"]["Enums"]["qstp_role"][];
        };
        Returns: boolean;
      };
      import_candidates: {
        Args: {
          p_cycle_id: string;
          p_candidates: Json;
        };
        Returns: Database["public"]["Tables"]["candidates"]["Row"][];
      };
      invite_to_redistribution: {
        Args: {
          p_round_id: string;
          p_startup_id: string;
          p_proposed_hours: number;
        };
        Returns: Database["public"]["Tables"]["redistribution_rounds"]["Row"];
      };
      is_member_of_position_startup: {
        Args: {
          target_position_id: string;
        };
        Returns: boolean;
      };
      is_qstp: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_startup_member: {
        Args: {
          target_startup_id: string;
        };
        Returns: boolean;
      };
      log_activity: {
        Args: {
          p_cycle_id: string;
          p_entity_type: string;
          p_entity_id: string;
          p_action: string;
          p_actor_role: Database["public"]["Enums"]["activity_actor_role"];
          p_before: Json;
          p_after: Json;
          p_reason: string;
        };
        Returns: undefined;
      };
      open_candidate_choice_fallback: {
        Args: {
          p_cycle_id: string;
          p_candidate_id: string;
          p_response_deadline: string;
        };
        Returns: Database["public"]["Tables"]["candidate_choice_fallbacks"]["Row"];
      };
      override_fallback: {
        Args: {
          p_case_id: string;
          p_selection_id: string;
          p_reason: string;
          p_high_risk_confirmed: boolean;
        };
        Returns: Database["public"]["Tables"]["candidate_choice_fallbacks"]["Row"];
      };
      owns_candidate: {
        Args: {
          target_candidate_id: string;
        };
        Returns: boolean;
      };
      publish_prioritisation_run: {
        Args: {
          p_run_id: string;
          p_acknowledge_incomplete?: boolean;
          p_reason?: string;
        };
        Returns: Database["public"]["Tables"]["prioritisation_runs"]["Row"];
      };
      qstp_operations_recipients: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
      record_document_extraction: {
        Args: {
          p_document_id: string;
          p_fields?: Json;
          p_failed?: boolean;
        };
        Returns: Database["public"]["Tables"]["candidate_documents"]["Row"];
      };
      release_selection: {
        Args: {
          p_selection_id: string;
          p_reason?: string;
        };
        Returns: Database["public"]["Tables"]["selections"]["Row"];
      };
      reminder_condition_holds: {
        Args: {
          p_rule_key: string;
          p_cycle_id: string;
          p_subject_id: string;
          p_now?: string;
        };
        Returns: boolean;
      };
      reminder_default_escalation_hours: {
        Args: {
          p_rule_key: string;
        };
        Returns: number;
      };
      reminder_settings: {
        Args: {
          p_rule_key: string;
          p_cycle_id: string;
          p_default_offset_hours?: number;
          p_default_preferred?: Database["public"]["Enums"]["notification_channel"][];
        };
        Returns: {
          enabled: boolean;
          offset_hours: number;
          required_channels: Database["public"]["Enums"]["notification_channel"][];
          preferred_channels: Database["public"]["Enums"]["notification_channel"][];
          mandatory: boolean;
          urgent: boolean;
          escalation_after_hours: number;
        }[];
      };
      reserve_candidate: {
        Args: {
          p_position_id: string;
          p_candidate_id: string;
          p_status?: Database["public"]["Enums"]["selection_status"];
        };
        Returns: Database["public"]["Tables"]["selections"]["Row"];
      };
      resolve_reminder_occurrences: {
        Args: {
          p_now?: string;
        };
        Returns: number;
      };
      resolve_selection_conflict: {
        Args: {
          p_conflict_id: string;
          p_resolution: Database["public"]["Enums"]["selection_conflict_status"];
          p_reason: string;
        };
        Returns: Database["public"]["Tables"]["selection_conflicts"]["Row"];
      };
      respond_to_fallback: {
        Args: {
          p_case_id: string;
          p_response: string;
          p_next_response_deadline?: string;
        };
        Returns: Database["public"]["Tables"]["candidate_choice_fallbacks"]["Row"];
      };
      respond_to_redistribution: {
        Args: {
          p_round_id: string;
          p_startup_id: string;
          p_response: Database["public"]["Enums"]["redistribution_invitation_status"];
        };
        Returns: Database["public"]["Tables"]["redistribution_invitations"]["Row"];
      };
      run_reminder_sweep: {
        Args: {
          p_now?: string;
        };
        Returns: Json;
      };
      save_extraction_run: {
        Args: {
          p_cycle_id: string;
          p_startup_id: string;
          p_run: Json;
          p_fields: Json;
        };
        Returns: Database["public"]["Tables"]["extraction_runs"]["Row"];
      };
      save_startup_rating_draft: {
        Args: {
          p_cycle_id: string;
          p_startup_id: string;
          p_items: Json;
        };
        Returns: Database["public"]["Tables"]["startup_ratings"]["Row"];
      };
      schedule_notification_worker: {
        Args: {
          p_function_url: string;
          p_worker_secret: string;
        };
        Returns: undefined;
      };
      set_candidate_availability: {
        Args: {
          p_candidate_id: string;
          p_availability: Database["public"]["Enums"]["availability_status"];
        };
        Returns: Database["public"]["Tables"]["candidates"]["Row"];
      };
      set_placement_readiness: {
        Args: {
          p_placement_id: string;
          p_party: string;
        };
        Returns: Database["public"]["Tables"]["placements"]["Row"];
      };
      share_pool: {
        Args: {
          p_position_id: string;
          p_candidate_ids: string[];
        };
        Returns: Database["public"]["Tables"]["pool_entries"]["Row"][];
      };
      snapshot_placement_requirements: {
        Args: {
          p_placement_id: string;
        };
        Returns: Database["public"]["Tables"]["placement_requirements"]["Row"][];
      };
      startup_recipients: {
        Args: {
          p_startup_id: string;
        };
        Returns: string[];
      };
      submit_requirement: {
        Args: {
          p_requirement_id: string;
          p_file_name: string;
          p_storage_path: string;
          p_fields?: Json;
          p_correction_reason?: string;
        };
        Returns: Database["public"]["Tables"]["requirement_submissions"]["Row"];
      };
      submit_startup_rating: {
        Args: {
          p_cycle_id: string;
          p_startup_id: string;
          p_items: Json;
          p_revision_reason?: string;
        };
        Returns: Database["public"]["Tables"]["startup_ratings"]["Row"];
      };
      transition_position: {
        Args: {
          p_position_id: string;
          p_to_status: Database["public"]["Enums"]["position_status"];
          p_note?: string;
        };
        Returns: Database["public"]["Tables"]["positions"]["Row"];
      };
      unschedule_notification_worker: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      update_position_details: {
        Args: {
          p_position_id: string;
          p_position: Json;
        };
        Returns: Database["public"]["Tables"]["positions"]["Row"];
      };
      upload_candidate_document: {
        Args: {
          p_document_id: string;
          p_file_name: string;
          p_storage_path: string;
          p_back_file_name?: string;
          p_back_storage_path?: string;
        };
        Returns: Database["public"]["Tables"]["candidate_documents"]["Row"];
      };
    };
    Enums: {
      activity_actor_role:
        | "program_manager"
        | "operations"
        | "viewer"
        | "owner"
        | "member"
        | "supervisor"
        | "candidate"
        | "system";
      allocation_mode: "priority" | "broad" | "distribution";
      allocation_status:
        "draft" | "confirmed" | "declined" | "forfeited" | "superseded";
      availability_status:
        | "unconfirmed"
        | "available"
        | "employed"
        | "not_interested"
        | "temporarily_unavailable"
        | "placed";
      candidate_source: "deema" | "csv" | "manual";
      cycle_stage:
        | "draft"
        | "allocation"
        | "positions"
        | "selection"
        | "completion"
        | "closed";
      document_kind:
        | "national_id"
        | "passport"
        | "bank_statement"
        | "qstp_contract"
        | "startup_nda"
        | "other";
      document_status:
        | "requested"
        | "uploaded"
        | "extracting"
        | "awaiting_candidate_review"
        | "submitted"
        | "verified"
        | "rejected";
      evidence_field_status:
        "supported" | "missing" | "conflicting" | "stale" | "not_applicable";
      evidence_kind: "note" | "document" | "extracted_section";
      evidence_source: "manual" | "upload" | "ai_split";
      exception_kind: "position_submission" | "candidate_selection";
      exception_status: "pending" | "approved" | "rejected" | "expired";
      extraction_run_status: "queued" | "running" | "succeeded" | "failed";
      fallback_case_status: "open" | "accepted" | "exhausted" | "overridden";
      field_review_state: "proposed" | "confirmed" | "corrected";
      interview_mode: "online" | "in_person";
      interview_recommendation: "advance" | "reject" | "undecided";
      interview_status:
        | "requested"
        | "confirmed"
        | "scheduled"
        | "completed"
        | "cancelled"
        | "no_show";
      member_status: "invited" | "active" | "suspended";
      notification_category:
        | "deadline"
        | "selection"
        | "exception"
        | "onboarding"
        | "candidate"
        | "system";
      notification_channel: "in_app" | "email" | "slack" | "push";
      notification_status:
        "queued" | "processing" | "sent" | "delivered" | "failed" | "bounced";
      observation_relationship: "primary" | "corroborating" | "conflicting";
      participation_status:
        "invited" | "accepted" | "declined" | "suspended" | "archived";
      placement_status:
        "confirmed" | "ready_to_start" | "onboarded" | "cancelled";
      pool_entry_status:
        | "pending"
        | "shortlisted"
        | "interview_requested"
        | "interviewed"
        | "interested"
        | "selected"
        | "rejected"
        | "withdrawn"
        | "lost";
      position_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "changes_requested"
        | "resubmitted"
        | "approved"
        | "locked"
        | "filled"
        | "closed"
        | "withdrawn";
      prioritisation_run_completeness: "complete_draft" | "partial_draft";
      prioritisation_run_status: "draft" | "confirmed" | "superseded";
      qstp_role: "program_manager" | "operations" | "viewer";
      rating_key:
        | "progress_against_stage"
        | "traction_strength"
        | "value_to_startup"
        | "value_to_intern"
        | "qstp_qatar_alignment"
        | "research_ecosystem_contribution";
      rating_status: "draft" | "submitted" | "superseded";
      recovery_status:
        | "potential"
        | "exception_protected"
        | "confirmed"
        | "recovered"
        | "replacement_protected"
        | "closed";
      redistribution_invitation_status:
        "invited" | "accepted" | "declined" | "expired";
      redistribution_status:
        | "draft"
        | "invitations"
        | "accelerated_positions"
        | "accelerated_selection"
        | "closed"
        | "cancelled";
      reminder_subject_type:
        "startup" | "candidate" | "exception" | "document" | "selection";
      requirement_owner: "candidate" | "startup" | "qstp";
      requirement_status:
        | "requested"
        | "awaiting_upload"
        | "uploaded"
        | "under_review"
        | "correction_requested"
        | "resubmitted"
        | "approved"
        | "rejected"
        | "expired"
        | "waived";
      selection_conflict_status: "open" | "dismissed" | "overridden";
      selection_mode: "first_come" | "candidate_choice";
      selection_status:
        | "offered"
        | "reserved"
        | "accepted"
        | "confirmed"
        | "declined"
        | "released"
        | "lost"
        | "cancelled";
      signature_kind:
        "qstp_agreement" | "startup_agreement" | "candidate_agreement";
      startup_outcome_status:
        | "scored"
        | "needs_information"
        | "awaiting_manual_scores"
        | "not_ready"
        | "not_fundable";
      startup_role: "owner" | "member" | "supervisor";
      task_assignment_status:
        "assigned" | "submitted" | "reviewed" | "withdrawn";
      transcript_status: "none" | "processing" | "ready" | "failed";
      waitlist_order_status:
        "resolved_by_score" | "tied_requires_qstp_resolution";
      work_arrangement: "onsite" | "hybrid" | "remote";
    };
    CompositeTypes: Record<PropertyKey, never>;
  };
}
