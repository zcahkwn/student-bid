import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  // Add debug logging for database operations
  global: {
    headers: {
      'X-Client-Info': 'student-bidding-system'
    }
  }
})

// Database types for normalized schema
interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          name: string
          email: string
          student_number: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          student_number: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          student_number?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      classes: {
        Row: {
          id: string
          name: string
          capacity_default: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          capacity_default?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          capacity_default?: number
          created_at?: string
          updated_at?: string
        }
      }
      student_enrollments: {
        Row: {
          user_id: string
          class_id: string
          tokens_remaining: number
          token_status: string
          bidding_result: string
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          class_id: string
          tokens_remaining?: number
          token_status?: string
          bidding_result?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          class_id?: string
          tokens_remaining?: number
          token_status?: string
          bidding_result?: string
          created_at?: string
          updated_at?: string
        }
      }
      opportunities: {
        Row: {
          id: string
          class_id: string
          description: string
          opens_at: string
          closes_at: string
          event_date: string
          capacity: number
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          class_id: string
          description: string
          opens_at: string
          closes_at: string
          event_date: string
          capacity?: number
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          class_id?: string
          description?: string
          opens_at?: string
          closes_at?: string
          event_date?: string
          capacity?: number
          status?: string
          created_at?: string
        }
      }
      bids: {
        Row: {
          id: string
          user_id: string
          opportunity_id: string
          bid_amount: number
          is_winner: boolean
          bid_status: string
          submission_timestamp: string
          validation_status: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          opportunity_id: string
          bid_amount?: number
          is_winner?: boolean
          bid_status?: string
          submission_timestamp?: string
          validation_status?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          opportunity_id?: string
          bid_amount?: number
          is_winner?: boolean
          bid_status?: string
          submission_timestamp?: string
          validation_status?: string
          created_at?: string
        }
      }
      token_history: {
        Row: {
          id: string
          user_id: string
          class_id: string
          opportunity_id: string
          amount: number
          type: string
          description: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          class_id: string
          opportunity_id?: string
          amount: number
          type: string
          description?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          class_id?: string
          opportunity_id?: string
          amount?: number
          type?: string
          description?: string
          created_at?: string
        }
      }
    }
  }
}