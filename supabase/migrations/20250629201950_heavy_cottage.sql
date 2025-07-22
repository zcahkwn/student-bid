/*
  # Enhanced Bid Tracking System

  1. New Tables
    - Enhanced `bids` table with proper relationships and constraints
    
  2. Security
    - Enable RLS on `bids` table
    - Add policies for authenticated users to manage bids
    
  3. Functions
    - Bid counting and validation functions
    - Enhanced bid submission with security
    - Real-time statistics for admin dashboard
*/

-- Drop existing functions first to avoid parameter conflicts
DROP FUNCTION IF EXISTS get_opportunity_bid_count(uuid);
DROP FUNCTION IF EXISTS student_has_bid(uuid, uuid);
DROP FUNCTION IF EXISTS get_student_bid_status(uuid, uuid);
DROP FUNCTION IF EXISTS get_class_opportunity_bid_counts(uuid);
DROP FUNCTION IF EXISTS get_class_bid_statistics(uuid);

-- Create enhanced bids table if it doesn't exist with proper structure
CREATE TABLE IF NOT EXISTS bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  bid_amount integer NOT NULL DEFAULT 1,
  is_winner boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  bid_status varchar(20) DEFAULT 'placed' CHECK (bid_status IN ('placed', 'confirmed', 'selected', 'rejected')),
  submission_timestamp timestamptz DEFAULT now(),
  validation_status varchar(20) DEFAULT 'validated' CHECK (validation_status IN ('validated', 'pending', 'failed')),
  
  -- Ensure one bid per student per opportunity
  UNIQUE(student_id, opportunity_id)
);

-- Enable RLS
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bids_student_id ON bids(student_id);
CREATE INDEX IF NOT EXISTS idx_bids_opportunity_id ON bids(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_bids_student_opportunity ON bids(student_id, opportunity_id);
CREATE INDEX IF NOT EXISTS idx_bids_created_at ON bids(created_at);
CREATE INDEX IF NOT EXISTS idx_bids_bid_status ON bids(bid_status);

-- RLS Policies for bids
DROP POLICY IF EXISTS "Allow authenticated users to view bids" ON bids;
DROP POLICY IF EXISTS "Allow authenticated users to insert bids" ON bids;
DROP POLICY IF EXISTS "Allow authenticated users to update bids" ON bids;

CREATE POLICY "Allow authenticated users to view bids"
  ON bids FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert bids"
  ON bids FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update bids"
  ON bids FOR UPDATE
  TO authenticated
  USING (true);

-- Function to get bid count for an opportunity
CREATE OR REPLACE FUNCTION get_opportunity_bid_count(opportunity_uuid uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::integer
  FROM bids
  WHERE opportunity_id = opportunity_uuid;
$$;

-- Function to check if student has bid on opportunity
CREATE OR REPLACE FUNCTION student_has_bid(student_uuid uuid, opportunity_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM bids
    WHERE student_id = student_uuid AND opportunity_id = opportunity_uuid
  );
$$;

-- Function to get student's bid status across all opportunities in a class
CREATE OR REPLACE FUNCTION get_student_bid_status(student_uuid uuid, class_uuid uuid)
RETURNS TABLE(
  opportunity_id uuid,
  opportunity_description text,
  has_bid boolean,
  bid_amount integer,
  is_winner boolean,
  bid_created_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    o.id as opportunity_id,
    o.description as opportunity_description,
    CASE WHEN b.id IS NOT NULL THEN true ELSE false END as has_bid,
    COALESCE(b.bid_amount, 0) as bid_amount,
    COALESCE(b.is_winner, false) as is_winner,
    b.created_at as bid_created_at
  FROM opportunities o
  LEFT JOIN bids b ON o.id = b.opportunity_id AND b.student_id = student_uuid
  WHERE o.class_id = class_uuid
  ORDER BY o.event_date;
$$;

-- Function to get all bid counts for opportunities in a class
CREATE OR REPLACE FUNCTION get_class_opportunity_bid_counts(class_uuid uuid)
RETURNS TABLE(
  opportunity_id uuid,
  opportunity_description text,
  bid_count bigint,
  capacity integer,
  event_date date
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    o.id as opportunity_id,
    o.description as opportunity_description,
    COUNT(b.id) as bid_count,
    o.capacity,
    o.event_date
  FROM opportunities o
  LEFT JOIN bids b ON o.id = b.opportunity_id
  WHERE o.class_id = class_uuid
  GROUP BY o.id, o.description, o.capacity, o.event_date
  ORDER BY o.event_date;
$$;

-- Enhanced submit_student_bid_secure function
CREATE OR REPLACE FUNCTION submit_student_bid_secure(
  p_student_id uuid,
  p_opportunity_id uuid,
  p_class_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id uuid;
  v_student_record students%ROWTYPE;
  v_opportunity_record opportunities%ROWTYPE;
  v_bid_id uuid;
  v_result jsonb;
BEGIN
  -- Get opportunity and validate it exists
  SELECT * INTO v_opportunity_record
  FROM opportunities
  WHERE id = p_opportunity_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Opportunity not found'
    );
  END IF;
  
  v_class_id := v_opportunity_record.class_id;
  
  -- Validate class password
  IF NOT EXISTS (
    SELECT 1 FROM classes 
    WHERE id = v_class_id AND password_hash = p_class_password
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Invalid class password'
    );
  END IF;
  
  -- Get student record and validate
  SELECT * INTO v_student_record
  FROM students
  WHERE id = p_student_id AND class_id = v_class_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Student not found in this class'
    );
  END IF;
  
  -- Check if student has tokens remaining
  IF v_student_record.tokens_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'No tokens remaining'
    );
  END IF;
  
  -- Check if student has already bid on this opportunity
  IF EXISTS (
    SELECT 1 FROM bids 
    WHERE student_id = p_student_id AND opportunity_id = p_opportunity_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Student has already bid on this opportunity'
    );
  END IF;
  
  -- Insert the bid
  INSERT INTO bids (student_id, opportunity_id, bid_amount, bid_status)
  VALUES (p_student_id, p_opportunity_id, 1, 'placed')
  RETURNING id INTO v_bid_id;
  
  -- Update student token status
  UPDATE students
  SET 
    tokens_remaining = tokens_remaining - 1,
    token_status = 'used'
  WHERE id = p_student_id;
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'timestamp', now(),
    'tokens_remaining', v_student_record.tokens_remaining - 1
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', SQLERRM
    );
END;
$$;

-- Function to get real-time bid statistics for admin dashboard
CREATE OR REPLACE FUNCTION get_class_bid_statistics(class_uuid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH opportunity_stats AS (
    SELECT 
      o.id,
      o.description,
      o.event_date,
      o.capacity,
      COUNT(b.id) as bid_count
    FROM opportunities o
    LEFT JOIN bids b ON o.id = b.opportunity_id
    WHERE o.class_id = class_uuid
    GROUP BY o.id, o.description, o.event_date, o.capacity
  )
  SELECT jsonb_build_object(
    'total_students', (
      SELECT COUNT(*) FROM students WHERE class_id = class_uuid
    ),
    'students_with_tokens', (
      SELECT COUNT(*) FROM students 
      WHERE class_id = class_uuid AND tokens_remaining > 0
    ),
    'students_who_bid', (
      SELECT COUNT(DISTINCT b.student_id)
      FROM bids b
      JOIN opportunities o ON b.opportunity_id = o.id
      WHERE o.class_id = class_uuid
    ),
    'total_bids', (
      SELECT COUNT(*)
      FROM bids b
      JOIN opportunities o ON b.opportunity_id = o.id
      WHERE o.class_id = class_uuid
    ),
    'opportunities', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'opportunity_id', os.id,
          'description', os.description,
          'event_date', os.event_date,
          'capacity', os.capacity,
          'bid_count', os.bid_count
        ) ORDER BY os.event_date
      )
      FROM opportunity_stats os
    )
  );
$$;