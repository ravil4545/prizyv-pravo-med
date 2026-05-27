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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      analytics_events: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          created_at: string | null
          device_type: string | null
          duration_seconds: number | null
          event_ref: string | null
          event_type: string
          event_value: number | null
          id: string
          ip_address: unknown
          os: string | null
          page_title: string | null
          page_url: string
          referrer: string | null
          session_id: string
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          duration_seconds?: number | null
          event_ref?: string | null
          event_type: string
          event_value?: number | null
          id?: string
          ip_address?: unknown
          os?: string | null
          page_title?: string | null
          page_url: string
          referrer?: string | null
          session_id: string
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          duration_seconds?: number | null
          event_ref?: string | null
          event_type?: string
          event_value?: number | null
          id?: string
          ip_address?: unknown
          os?: string | null
          page_title?: string | null
          page_url?: string
          referrer?: string | null
          session_id?: string
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      article_document_rules: {
        Row: {
          article_id: string
          created_at: string | null
          document_subtype_id: string | null
          document_type_id: string | null
          id: string
          keywords: string[] | null
          updated_at: string | null
        }
        Insert: {
          article_id: string
          created_at?: string | null
          document_subtype_id?: string | null
          document_type_id?: string | null
          id?: string
          keywords?: string[] | null
          updated_at?: string | null
        }
        Update: {
          article_id?: string
          created_at?: string | null
          document_subtype_id?: string | null
          document_type_id?: string | null
          id?: string
          keywords?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "article_document_rules_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "disease_articles_565"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_document_rules_document_subtype_id_fkey"
            columns: ["document_subtype_id"]
            isOneToOne: false
            referencedRelation: "document_subtypes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_document_rules_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
        ]
      }
      article_user_assessment: {
        Row: {
          article_id: string
          created_at: string | null
          id: string
          score_v: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          article_id: string
          created_at?: string | null
          id?: string
          score_v?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          article_id?: string
          created_at?: string | null
          id?: string
          score_v?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_user_assessment_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "disease_articles_565"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          post_id: string
          status: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          post_id: string
          status?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          post_id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_id: string | null
          category: string | null
          content: string
          created_at: string | null
          excerpt: string | null
          id: string
          image_url: string | null
          published_at: string | null
          slug: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          author_id?: string | null
          category?: string | null
          content: string
          created_at?: string | null
          excerpt?: string | null
          id?: string
          image_url?: string | null
          published_at?: string | null
          slug: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string | null
          category?: string | null
          content?: string
          created_at?: string | null
          excerpt?: string | null
          id?: string
          image_url?: string | null
          published_at?: string | null
          slug?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      case_events: {
        Row: {
          created_at: string | null
          description: string | null
          event_date: string
          event_type: string
          id: string
          outcome: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          event_date: string
          event_type: string
          id?: string
          outcome?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          event_date?: string
          event_type?: string
          id?: string
          outcome?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      case_notes: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          lawyer_client_id: string
          note_type: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          lawyer_client_id: string
          note_type?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          lawyer_client_id?: string
          note_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_notes_lawyer_client_id_fkey"
            columns: ["lawyer_client_id"]
            isOneToOne: false
            referencedRelation: "lawyer_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          created_at: string | null
          id: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          title?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_document_access: {
        Row: {
          client_user_id: string
          created_at: string
          id: string
          is_active: boolean
          lawyer_id: string
        }
        Insert: {
          client_user_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          lawyer_id: string
        }
        Update: {
          client_user_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          lawyer_id?: string
        }
        Relationships: []
      }
      consultations: {
        Row: {
          consultant_id: string | null
          created_at: string | null
          id: string
          notes: string | null
          scheduled_at: string | null
          status: string | null
          subject: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          consultant_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          scheduled_at?: string | null
          status?: string | null
          subject: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          consultant_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          scheduled_at?: string | null
          status?: string | null
          subject?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      contact_submissions: {
        Row: {
          age: string | null
          created_at: string | null
          email: string
          id: string
          ip_address: unknown
          message: string
          name: string
          phone: string
          source: string | null
          stage: string | null
          status: string | null
          user_agent: string | null
        }
        Insert: {
          age?: string | null
          created_at?: string | null
          email: string
          id?: string
          ip_address?: unknown
          message: string
          name: string
          phone: string
          source?: string | null
          stage?: string | null
          status?: string | null
          user_agent?: string | null
        }
        Update: {
          age?: string | null
          created_at?: string | null
          email?: string
          id?: string
          ip_address?: unknown
          message?: string
          name?: string
          phone?: string
          source?: string | null
          stage?: string | null
          status?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      demo_visitors: {
        Row: {
          ai_questions_used: number
          anonymous_user_id: string
          browser: string | null
          city: string | null
          converted_to_user: boolean
          converted_user_id: string | null
          country: string | null
          created_at: string
          device_type: string | null
          document_uploads_used: number
          first_visit_at: string
          id: string
          ip_address: unknown
          last_visit_at: string
          os: string | null
          pages_visited: string[] | null
          session_id: string | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          ai_questions_used?: number
          anonymous_user_id: string
          browser?: string | null
          city?: string | null
          converted_to_user?: boolean
          converted_user_id?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          document_uploads_used?: number
          first_visit_at?: string
          id?: string
          ip_address?: unknown
          last_visit_at?: string
          os?: string | null
          pages_visited?: string[] | null
          session_id?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          ai_questions_used?: number
          anonymous_user_id?: string
          browser?: string | null
          city?: string | null
          converted_to_user?: boolean
          converted_user_id?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          document_uploads_used?: number
          first_visit_at?: string
          id?: string
          ip_address?: unknown
          last_visit_at?: string
          os?: string | null
          pages_visited?: string[] | null
          session_id?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      diagnoses: {
        Row: {
          article_number: string
          category: string | null
          created_at: string | null
          description: string
          id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          article_number: string
          category?: string | null
          created_at?: string | null
          description: string
          id?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          article_number?: string
          category?: string | null
          created_at?: string | null
          description?: string
          id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      disease_articles_565: {
        Row: {
          article_number: string
          body: string | null
          category: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          title: string
          updated_at: string | null
        }
        Insert: {
          article_number: string
          body?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          title: string
          updated_at?: string | null
        }
        Update: {
          article_number?: string
          body?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      document_article_links: {
        Row: {
          ai_category_chance: number | null
          ai_explanation: string | null
          ai_fitness_category: string | null
          ai_recommendations: string[] | null
          article_id: string
          created_at: string | null
          document_id: string
          id: string
        }
        Insert: {
          ai_category_chance?: number | null
          ai_explanation?: string | null
          ai_fitness_category?: string | null
          ai_recommendations?: string[] | null
          article_id: string
          created_at?: string | null
          document_id: string
          id?: string
        }
        Update: {
          ai_category_chance?: number | null
          ai_explanation?: string | null
          ai_fitness_category?: string | null
          ai_recommendations?: string[] | null
          article_id?: string
          created_at?: string | null
          document_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_article_links_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "disease_articles_565"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_article_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "medical_documents_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      document_subtypes: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          type_id: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          type_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_subtypes_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      family_access: {
        Row: {
          accepted_at: string | null
          expires_at: string
          id: string
          invite_token: string
          invited_at: string
          invitee_email: string
          owner_user_id: string
          relationship: string | null
          revoked_at: string | null
          scopes: Json
          status: string
          viewer_user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          expires_at?: string
          id?: string
          invite_token: string
          invited_at?: string
          invitee_email: string
          owner_user_id: string
          relationship?: string | null
          revoked_at?: string | null
          scopes?: Json
          status?: string
          viewer_user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          expires_at?: string
          id?: string
          invite_token?: string
          invited_at?: string
          invitee_email?: string
          owner_user_id?: string
          relationship?: string | null
          revoked_at?: string | null
          scopes?: Json
          status?: string
          viewer_user_id?: string | null
        }
        Relationships: []
      }
      forum_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          post_id: string
          status: string | null
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          post_id: string
          status?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          post_id?: string
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forum_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_posts: {
        Row: {
          content: string
          created_at: string | null
          id: string
          status: string | null
          title: string
          topic_type: Database["public"]["Enums"]["forum_topic_type"]
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          status?: string | null
          title: string
          topic_type: Database["public"]["Enums"]["forum_topic_type"]
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          status?: string | null
          title?: string
          topic_type?: Database["public"]["Enums"]["forum_topic_type"]
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      lawyer_chat_messages: {
        Row: {
          content: string | null
          created_at: string
          edited_at: string | null
          file_name: string | null
          file_size: number | null
          file_url: string | null
          id: string
          is_read: boolean
          lawyer_client_id: string
          message_type: string
          sender_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          edited_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_read?: boolean
          lawyer_client_id: string
          message_type?: string
          sender_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          edited_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_read?: boolean
          lawyer_client_id?: string
          message_type?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lawyer_chat_messages_lawyer_client_id_fkey"
            columns: ["lawyer_client_id"]
            isOneToOne: false
            referencedRelation: "lawyer_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      lawyer_client_med_docs: {
        Row: {
          ai_category_chance: number | null
          ai_explanation: string | null
          ai_fitness_category: string | null
          ai_recommendations: Json | null
          created_at: string
          document_date: string | null
          file_url: string
          id: string
          lawyer_client_id: string
          lawyer_id: string
          raw_text: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          ai_category_chance?: number | null
          ai_explanation?: string | null
          ai_fitness_category?: string | null
          ai_recommendations?: Json | null
          created_at?: string
          document_date?: string | null
          file_url: string
          id?: string
          lawyer_client_id: string
          lawyer_id: string
          raw_text?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          ai_category_chance?: number | null
          ai_explanation?: string | null
          ai_fitness_category?: string | null
          ai_recommendations?: Json | null
          created_at?: string
          document_date?: string | null
          file_url?: string
          id?: string
          lawyer_client_id?: string
          lawyer_id?: string
          raw_text?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lawyer_client_med_docs_lawyer_client_id_fkey"
            columns: ["lawyer_client_id"]
            isOneToOne: false
            referencedRelation: "lawyer_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      lawyer_clients: {
        Row: {
          case_won: boolean | null
          client_birth_year: number | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          client_user_id: string | null
          conscription_date: string | null
          created_at: string
          crm_stage: string
          diagnosis: string | null
          expected_category: string | null
          id: string
          lawyer_id: string
          notes: string | null
          priority: string
          updated_at: string
        }
        Insert: {
          case_won?: boolean | null
          client_birth_year?: number | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          client_user_id?: string | null
          conscription_date?: string | null
          created_at?: string
          crm_stage?: string
          diagnosis?: string | null
          expected_category?: string | null
          id?: string
          lawyer_id: string
          notes?: string | null
          priority?: string
          updated_at?: string
        }
        Update: {
          case_won?: boolean | null
          client_birth_year?: number | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          client_user_id?: string | null
          conscription_date?: string | null
          created_at?: string
          crm_stage?: string
          diagnosis?: string | null
          expected_category?: string | null
          id?: string
          lawyer_id?: string
          notes?: string | null
          priority?: string
          updated_at?: string
        }
        Relationships: []
      }
      lawyer_profiles: {
        Row: {
          accent_color: string | null
          bio: string | null
          brand_about: string | null
          brand_email: string | null
          brand_phone: string | null
          brand_subtitle: string | null
          brand_telegram: string | null
          brand_template: string | null
          brand_whatsapp: string | null
          clients_limit: number | null
          created_at: string | null
          full_name: string
          is_active: boolean | null
          license_number: string | null
          photo_url: string | null
          slug: string | null
          specialization: string | null
          subscription_tier: string | null
          subscription_until: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accent_color?: string | null
          bio?: string | null
          brand_about?: string | null
          brand_email?: string | null
          brand_phone?: string | null
          brand_subtitle?: string | null
          brand_telegram?: string | null
          brand_template?: string | null
          brand_whatsapp?: string | null
          clients_limit?: number | null
          created_at?: string | null
          full_name: string
          is_active?: boolean | null
          license_number?: string | null
          photo_url?: string | null
          slug?: string | null
          specialization?: string | null
          subscription_tier?: string | null
          subscription_until?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accent_color?: string | null
          bio?: string | null
          brand_about?: string | null
          brand_email?: string | null
          brand_phone?: string | null
          brand_subtitle?: string | null
          brand_telegram?: string | null
          brand_template?: string | null
          brand_whatsapp?: string | null
          clients_limit?: number | null
          created_at?: string | null
          full_name?: string
          is_active?: boolean | null
          license_number?: string | null
          photo_url?: string | null
          slug?: string | null
          specialization?: string | null
          subscription_tier?: string | null
          subscription_until?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      lawyer_template_uses: {
        Row: {
          created_at: string
          id: string
          lawyer_client_id: string | null
          lawyer_id: string
          template_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          lawyer_client_id?: string | null
          lawyer_id: string
          template_key: string
        }
        Update: {
          created_at?: string
          id?: string
          lawyer_client_id?: string | null
          lawyer_id?: string
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "lawyer_template_uses_lawyer_client_id_fkey"
            columns: ["lawyer_client_id"]
            isOneToOne: false
            referencedRelation: "lawyer_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_documents: {
        Row: {
          ai_analysis: Json | null
          ai_fitness_category: string | null
          ai_recommendations: string | null
          created_at: string
          document_type: string
          extracted_text: string | null
          file_name: string
          file_path: string
          id: string
          updated_at: string
          upload_date: string
          user_id: string
        }
        Insert: {
          ai_analysis?: Json | null
          ai_fitness_category?: string | null
          ai_recommendations?: string | null
          created_at?: string
          document_type: string
          extracted_text?: string | null
          file_name: string
          file_path: string
          id?: string
          updated_at?: string
          upload_date?: string
          user_id: string
        }
        Update: {
          ai_analysis?: Json | null
          ai_fitness_category?: string | null
          ai_recommendations?: string | null
          created_at?: string
          document_type?: string
          extracted_text?: string | null
          file_name?: string
          file_path?: string
          id?: string
          updated_at?: string
          upload_date?: string
          user_id?: string
        }
        Relationships: []
      }
      medical_documents_v2: {
        Row: {
          ai_category_chance: number | null
          ai_explanation: string | null
          ai_fitness_category: string | null
          ai_recommendations: string[] | null
          created_at: string | null
          document_date: string | null
          document_subtype_id: string | null
          document_type_id: string | null
          file_url: string
          id: string
          is_classified: boolean | null
          linked_article_id: string | null
          meta: Json | null
          raw_text: string | null
          title: string | null
          updated_at: string | null
          uploaded_at: string | null
          user_id: string
        }
        Insert: {
          ai_category_chance?: number | null
          ai_explanation?: string | null
          ai_fitness_category?: string | null
          ai_recommendations?: string[] | null
          created_at?: string | null
          document_date?: string | null
          document_subtype_id?: string | null
          document_type_id?: string | null
          file_url: string
          id?: string
          is_classified?: boolean | null
          linked_article_id?: string | null
          meta?: Json | null
          raw_text?: string | null
          title?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
          user_id: string
        }
        Update: {
          ai_category_chance?: number | null
          ai_explanation?: string | null
          ai_fitness_category?: string | null
          ai_recommendations?: string[] | null
          created_at?: string | null
          document_date?: string | null
          document_subtype_id?: string | null
          document_type_id?: string | null
          file_url?: string
          id?: string
          is_classified?: boolean | null
          linked_article_id?: string | null
          meta?: Json | null
          raw_text?: string | null
          title?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_documents_v2_document_subtype_id_fkey"
            columns: ["document_subtype_id"]
            isOneToOne: false
            referencedRelation: "document_subtypes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_documents_v2_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_documents_v2_linked_article_id_fkey"
            columns: ["linked_article_id"]
            isOneToOne: false
            referencedRelation: "disease_articles_565"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          actual_address: string | null
          birth_date: string | null
          birth_place: string | null
          city: string | null
          court_by_military: string | null
          court_by_registration: string | null
          created_at: string | null
          education_course: string | null
          education_institution: string | null
          education_specialty: string | null
          education_type: string | null
          full_name: string | null
          id: string
          military_commissariat: string | null
          military_commissariat_address: string | null
          passport_code: string | null
          passport_issue_date: string | null
          passport_issued_by: string | null
          passport_number: string | null
          passport_series: string | null
          phone: string | null
          prosecutor_office: string | null
          region: string | null
          registration_address: string | null
          superior_military_commissariat: string | null
          superior_military_commissariat_address: string | null
          updated_at: string | null
          work_address: string | null
          work_place: string | null
          work_position: string | null
        }
        Insert: {
          actual_address?: string | null
          birth_date?: string | null
          birth_place?: string | null
          city?: string | null
          court_by_military?: string | null
          court_by_registration?: string | null
          created_at?: string | null
          education_course?: string | null
          education_institution?: string | null
          education_specialty?: string | null
          education_type?: string | null
          full_name?: string | null
          id: string
          military_commissariat?: string | null
          military_commissariat_address?: string | null
          passport_code?: string | null
          passport_issue_date?: string | null
          passport_issued_by?: string | null
          passport_number?: string | null
          passport_series?: string | null
          phone?: string | null
          prosecutor_office?: string | null
          region?: string | null
          registration_address?: string | null
          superior_military_commissariat?: string | null
          superior_military_commissariat_address?: string | null
          updated_at?: string | null
          work_address?: string | null
          work_place?: string | null
          work_position?: string | null
        }
        Update: {
          actual_address?: string | null
          birth_date?: string | null
          birth_place?: string | null
          city?: string | null
          court_by_military?: string | null
          court_by_registration?: string | null
          created_at?: string | null
          education_course?: string | null
          education_institution?: string | null
          education_specialty?: string | null
          education_type?: string | null
          full_name?: string | null
          id?: string
          military_commissariat?: string | null
          military_commissariat_address?: string | null
          passport_code?: string | null
          passport_issue_date?: string | null
          passport_issued_by?: string | null
          passport_number?: string | null
          passport_series?: string | null
          phone?: string | null
          prosecutor_office?: string | null
          region?: string | null
          registration_address?: string | null
          superior_military_commissariat?: string | null
          superior_military_commissariat_address?: string | null
          updated_at?: string | null
          work_address?: string | null
          work_place?: string | null
          work_position?: string | null
        }
        Relationships: []
      }
      rag_chunks: {
        Row: {
          category: string | null
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          is_foundational: boolean | null
          last_refined: string | null
          priority: string | null
          schedule_articles: string[] | null
          section_title: string | null
          tags: string[] | null
          target_category: string | null
          type: string | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string | null
          embedding?: string | null
          id: string
          is_foundational?: boolean | null
          last_refined?: string | null
          priority?: string | null
          schedule_articles?: string[] | null
          section_title?: string | null
          tags?: string[] | null
          target_category?: string | null
          type?: string | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_foundational?: boolean | null
          last_refined?: string | null
          priority?: string | null
          schedule_articles?: string[] | null
          section_title?: string | null
          tags?: string[] | null
          target_category?: string | null
          type?: string | null
        }
        Relationships: []
      }
      rag_system_context: {
        Row: {
          content: string
          name: string
          updated_at: string | null
        }
        Insert: {
          content: string
          name: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      "ravil4545@gmail.com": {
        Row: {
          created_at: string
          id: number
        }
        Insert: {
          created_at?: string
          id?: number
        }
        Update: {
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      test_templates: {
        Row: {
          category: string | null
          created_at: string
          id: string
          test_name: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          test_name: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          test_name?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          age: number | null
          approved_at: string | null
          article_565: string | null
          author_name: string
          category: string | null
          city: string | null
          content: string
          created_at: string | null
          display_order: number | null
          featured: boolean | null
          id: string
          photo_url: string | null
          rating: number | null
          status: string | null
          video_url: string | null
        }
        Insert: {
          age?: number | null
          approved_at?: string | null
          article_565?: string | null
          author_name: string
          category?: string | null
          city?: string | null
          content: string
          created_at?: string | null
          display_order?: number | null
          featured?: boolean | null
          id?: string
          photo_url?: string | null
          rating?: number | null
          status?: string | null
          video_url?: string | null
        }
        Update: {
          age?: number | null
          approved_at?: string | null
          article_565?: string | null
          author_name?: string
          category?: string | null
          city?: string | null
          content?: string
          created_at?: string | null
          display_order?: number | null
          featured?: boolean | null
          id?: string
          photo_url?: string | null
          rating?: number | null
          status?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      user_diagnoses: {
        Row: {
          ai_fitness_category: string | null
          created_at: string | null
          diagnosis_code: string | null
          diagnosis_name: string
          id: string
          medical_documents: string | null
          notes: string | null
          updated_at: string | null
          user_article: string | null
          user_fitness_category: string | null
          user_id: string
        }
        Insert: {
          ai_fitness_category?: string | null
          created_at?: string | null
          diagnosis_code?: string | null
          diagnosis_name: string
          id?: string
          medical_documents?: string | null
          notes?: string | null
          updated_at?: string | null
          user_article?: string | null
          user_fitness_category?: string | null
          user_id: string
        }
        Update: {
          ai_fitness_category?: string | null
          created_at?: string | null
          diagnosis_code?: string | null
          diagnosis_name?: string
          id?: string
          medical_documents?: string | null
          notes?: string | null
          updated_at?: string | null
          user_article?: string | null
          user_fitness_category?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_diagnoses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          admin_override: boolean
          ai_questions_used: number
          created_at: string
          document_uploads_used: number
          free_ai_limit: number
          free_document_limit: number
          id: string
          is_paid: boolean
          paid_until: string | null
          payment_link_clicked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_override?: boolean
          ai_questions_used?: number
          created_at?: string
          document_uploads_used?: number
          free_ai_limit?: number
          free_document_limit?: number
          id?: string
          is_paid?: boolean
          paid_until?: string | null
          payment_link_clicked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_override?: boolean
          ai_questions_used?: number
          created_at?: string
          document_uploads_used?: number
          free_ai_limit?: number
          free_document_limit?: number
          id?: string
          is_paid?: boolean
          paid_until?: string | null
          payment_link_clicked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_test_results: {
        Row: {
          ai_summary: string | null
          created_at: string
          file_path: string | null
          id: string
          template_id: string | null
          test_date: string | null
          updated_at: string
          user_id: string
          user_notes: string | null
        }
        Insert: {
          ai_summary?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          template_id?: string | null
          test_date?: string | null
          updated_at?: string
          user_id: string
          user_notes?: string | null
        }
        Update: {
          ai_summary?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          template_id?: string | null
          test_date?: string | null
          updated_at?: string
          user_id?: string
          user_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_test_results_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "test_templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      analytics_summary: {
        Row: {
          avg_duration: number | null
          date: string | null
          page_views: number | null
          total_events: number | null
          unique_sessions: number | null
          unique_users: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_family_invite: { Args: { p_token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_rag_chunks: {
        Args: {
          match_count?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          category: string
          content: string
          id: string
          schedule_articles: string[]
          similarity: number
          target_category: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      forum_topic_type:
        | "urgent"
        | "diagnoses"
        | "success_stories"
        | "legal"
        | "health"
        | "general"
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
      forum_topic_type: [
        "urgent",
        "diagnoses",
        "success_stories",
        "legal",
        "health",
        "general",
      ],
    },
  },
} as const
