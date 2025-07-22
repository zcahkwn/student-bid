/*
  # Student Bid Recording System

  1. Enhanced Tables
    - Update bids table with comprehensive tracking
    - Add bid validation and status tracking
    - Create audit trail for all bid activities
    
  2. Security & Validation
    - Comprehensive eligibility checks
    - Opportunity availability validation
    - Real-time status updates
    
  3. Functions
    - Atomic bid submission with full validation
    - Real-time bid status tracking
    - Comprehensive audit logging
*/

-- Add additional columns to bids table for comprehensive tracking
DO $$
BEGIN
  -- Add bid_status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bids' AND column_name = 'bid_status'
  ) THEN
    ALTER TABLE bids ADD COLUMN bid_status VARCHAR(20) DEFAULT 'placed' 
    CHECK (bid_status IN ('placed', 'confirmed', 'selected', 'rejected'));
  END IF;

  -- Add submission_timestamp for precise tracking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bids' AND column_name = 'submission_timestamp'
  ) THEN
    ALTER TABLE bids ADD COLUMN submission_timestamp TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- Add validation_status for eligibility tracking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bids' AND column_name = 'validation_status'
  ) THEN
    ALTER TABLE bids ADD COLUMN validation_status VARCHAR(20) DEFAULT 'validated'
    CHECK (validation_status IN ('validated', 'pending', 'failed'));
  END IF;
END $$;

-- Create comprehensive bid submission function with full validation
CREATE OR REPLACE FUNCTION submit_student_bid_comprehensive(
  p_student_id uuid,
  p_opportunity_id uuid,
  p_class_password text,
  p_bid_amount integer DEFAULT 1
)
RETURNS jsonb AS $$
DECLARE
  v_student_record record;
  v_opportunity_record record;
  v_class_record record;
  v_bid_id uuid;
  v_existing_bid_count integer;
  v_opportunity_capacity integer;
  v_current_time timestamptz := NOW();
  v_result jsonb;
BEGIN
  -- Step 1: Comprehensive Student Validation
  SELECT s.*, c.password_hash, c.name as class_name
  INTO v_student_record
  FROM students s
  JOIN classes c ON s.class_id = c.id
  WHERE s.id = p_student_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'STUDENT_NOT_FOUND',
      'error_message', 'Student not found or not enrolled in any class',
      'timestamp', v_current_time
    );
  END IF;
  
  -- Step 2: Class Password Validation
  IF v_student_record.password_hash != p_class_password THEN
    -- Log failed authentication attempt
    INSERT INTO token_history (student_id, amount, type, description)
    VALUES (p_student_id, 0, 'bid', 'Failed bid attempt: Invalid class password');
    
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_PASSWORD',
      'error_message', 'Invalid class password provided',
      'timestamp', v_current_time
    );
  END IF;
  
  -- Step 3: Student Eligibility Validation
  IF v_student_record.tokens_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NO_TOKENS',
      'error_message', 'Student has no bidding tokens remaining',
      'current_tokens', v_student_record.tokens_remaining,
      'timestamp', v_current_time
    );
  END IF;
  
  -- Step 4: Opportunity Validation
  SELECT o.*, c.capacity_default
  INTO v_opportunity_record
  FROM opportunities o
  JOIN classes c ON o.class_id = c.id
  WHERE o.id = p_opportunity_id AND o.class_id = v_student_record.class_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'OPPORTUNITY_NOT_FOUND',
      'error_message', 'Opportunity not found or not accessible to this student',
      'timestamp', v_current_time
    );
  END IF;
  
  -- Step 5: Opportunity Timing Validation
  IF v_current_time < v_opportunity_record.opens_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'BIDDING_NOT_OPEN',
      'error_message', 'Bidding has not opened for this opportunity yet',
      'opens_at', v_opportunity_record.opens_at,
      'timestamp', v_current_time
    );
  END IF;
  
  IF v_current_time > v_opportunity_record.closes_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'BIDDING_CLOSED',
      'error_message', 'Bidding has closed for this opportunity',
      'closed_at', v_opportunity_record.closes_at,
      'timestamp', v_current_time
    );
  END IF;
  
  -- Step 6: Duplicate Bid Check
  SELECT COUNT(*) INTO v_existing_bid_count
  FROM bids 
  WHERE student_id = p_student_id AND opportunity_id = p_opportunity_id;
  
  IF v_existing_bid_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'DUPLICATE_BID',
      'error_message', 'Student has already placed a bid for this opportunity',
      'existing_bids', v_existing_bid_count,
      'timestamp', v_current_time
    );
  END IF;
  
  -- Step 7: Capacity Check (Optional Warning)
  SELECT COUNT(*) INTO v_existing_bid_count
  FROM bids b
  WHERE b.opportunity_id = p_opportunity_id;
  
  v_opportunity_capacity := COALESCE(v_opportunity_record.capacity, v_opportunity_record.capacity_default);
  
  -- Step 8: Atomic Bid Insertion
  INSERT INTO bids (
    student_id, 
    opportunity_id, 
    bid_amount, 
    bid_status,
    submission_timestamp,
    validation_status,
    created_at
  )
  VALUES (
    p_student_id, 
    p_opportunity_id, 
    p_bid_amount,
    'placed',
    v_current_time,
    'validated',
    v_current_time
  )
  RETURNING id INTO v_bid_id;
  
  -- Step 9: Update Student Token Status Atomically
  UPDATE students 
  SET 
    tokens_remaining = tokens_remaining - 1,
    token_status = CASE 
      WHEN tokens_remaining - 1 <= 0 THEN 'used'
      ELSE 'unused'
    END
  WHERE id = p_student_id;
  
  -- Step 10: Create Comprehensive Audit Trail
  INSERT INTO token_history (
    student_id, 
    opportunity_id, 
    amount, 
    type, 
    description,
    created_at
  )
  VALUES (
    p_student_id, 
    p_opportunity_id, 
    -1, 
    'bid', 
    jsonb_build_object(
      'bid_id', v_bid_id,
      'bid_amount', p_bid_amount,
      'opportunity_title', v_opportunity_record.description,
      'class_name', v_student_record.class_name,
      'submission_method', 'comprehensive_validation',
      'tokens_before', v_student_record.tokens_remaining,
      'tokens_after', v_student_record.tokens_remaining - 1
    )::text,
    v_current_time
  );
  
  -- Step 11: Return Comprehensive Success Response
  v_result := jsonb_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'student_id', p_student_id,
    'opportunity_id', p_opportunity_id,
    'bid_details', jsonb_build_object(
      'bid_amount', p_bid_amount,
      'bid_status', 'placed',
      'submission_timestamp', v_current_time,
      'validation_status', 'validated'
    ),
    'student_status', jsonb_build_object(
      'tokens_before', v_student_record.tokens_remaining,
      'tokens_after', v_student_record.tokens_remaining - 1,
      'token_status', CASE 
        WHEN v_student_record.tokens_remaining - 1 <= 0 THEN 'used'
        ELSE 'unused'
      END
    ),
    'opportunity_status', jsonb_build_object(
      'total_bids', v_existing_bid_count + 1,
      'capacity', v_opportunity_capacity,
      'capacity_exceeded', (v_existing_bid_count + 1) > v_opportunity_capacity,
      'opens_at', v_opportunity_record.opens_at,
      'closes_at', v_opportunity_record.closes_at
    ),
    'timestamp', v_current_time
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error for debugging
    INSERT INTO token_history (student_id, opportunity_id, amount, type, description)
    VALUES (
      p_student_id, 
      p_opportunity_id, 
      0, 
      'bid', 
      'ERROR: ' || SQLERRM
    );
    
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'SYSTEM_ERROR',
      'error_message', 'An unexpected error occurred during bid submission',
      'error_details', SQLERRM,
      'timestamp', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get real-time bid status for Selection Process
CREATE OR REPLACE FUNCTION get_opportunity_bid_status(p_opportunity_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_opportunity record;
  v_bid_stats record;
  v_recent_bids jsonb;
  v_result jsonb;
BEGIN
  -- Get opportunity details
  SELECT o.*, c.capacity_default, c.name as class_name
  INTO v_opportunity
  FROM opportunities o
  JOIN classes c ON o.class_id = c.id
  WHERE o.id = p_opportunity_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Opportunity not found'
    );
  END IF;
  
  -- Get bid statistics
  SELECT 
    COUNT(*)::integer as total_bids,
    COUNT(CASE WHEN bid_status = 'placed' THEN 1 END)::integer as active_bids,
    COUNT(CASE WHEN bid_status = 'selected' THEN 1 END)::integer as selected_bids,
    MAX(submission_timestamp) as last_bid_time,
    MIN(submission_timestamp) as first_bid_time
  INTO v_bid_stats
  FROM bids
  WHERE opportunity_id = p_opportunity_id;
  
  -- Get recent bids with student details
  SELECT jsonb_agg(
    jsonb_build_object(
      'bid_id', b.id,
      'student_name', s.name,
      'student_email', s.email,
      'bid_amount', b.bid_amount,
      'bid_status', b.bid_status,
      'submission_timestamp', b.submission_timestamp
    ) ORDER BY b.submission_timestamp DESC
  ) INTO v_recent_bids
  FROM bids b
  JOIN students s ON b.student_id = s.id
  WHERE b.opportunity_id = p_opportunity_id
  LIMIT 10;
  
  -- Build comprehensive result
  v_result := jsonb_build_object(
    'success', true,
    'opportunity_id', p_opportunity_id,
    'opportunity_details', jsonb_build_object(
      'description', v_opportunity.description,
      'opens_at', v_opportunity.opens_at,
      'closes_at', v_opportunity.closes_at,
      'event_date', v_opportunity.event_date,
      'capacity', COALESCE(v_opportunity.capacity, v_opportunity.capacity_default),
      'status', v_opportunity.status,
      'class_name', v_opportunity.class_name
    ),
    'bid_statistics', jsonb_build_object(
      'total_bids', COALESCE(v_bid_stats.total_bids, 0),
      'active_bids', COALESCE(v_bid_stats.active_bids, 0),
      'selected_bids', COALESCE(v_bid_stats.selected_bids, 0),
      'last_bid_time', v_bid_stats.last_bid_time,
      'first_bid_time', v_bid_stats.first_bid_time,
      'capacity_exceeded', COALESCE(v_bid_stats.total_bids, 0) > COALESCE(v_opportunity.capacity, v_opportunity.capacity_default)
    ),
    'recent_bids', COALESCE(v_recent_bids, '[]'::jsonb),
    'last_updated', NOW()
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to validate student eligibility before bidding
CREATE OR REPLACE FUNCTION check_student_eligibility(
  p_student_id uuid,
  p_opportunity_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_student record;
  v_opportunity record;
  v_existing_bid_count integer;
  v_result jsonb;
BEGIN
  -- Get student details with class info
  SELECT s.*, c.name as class_name, c.capacity_default
  INTO v_student
  FROM students s
  JOIN classes c ON s.class_id = c.id
  WHERE s.id = p_student_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Student not found',
      'error_code', 'STUDENT_NOT_FOUND'
    );
  END IF;
  
  -- Get opportunity details
  SELECT * INTO v_opportunity
  FROM opportunities
  WHERE id = p_opportunity_id AND class_id = v_student.class_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Opportunity not found or not accessible',
      'error_code', 'OPPORTUNITY_NOT_FOUND'
    );
  END IF;
  
  -- Check if student has tokens
  IF v_student.tokens_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'No bidding tokens remaining',
      'error_code', 'NO_TOKENS',
      'tokens_remaining', v_student.tokens_remaining
    );
  END IF;
  
  -- Check if bidding is open
  IF NOW() < v_opportunity.opens_at THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Bidding has not opened yet',
      'error_code', 'BIDDING_NOT_OPEN',
      'opens_at', v_opportunity.opens_at
    );
  END IF;
  
  IF NOW() > v_opportunity.closes_at THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Bidding has closed',
      'error_code', 'BIDDING_CLOSED',
      'closed_at', v_opportunity.closes_at
    );
  END IF;
  
  -- Check for existing bid
  SELECT COUNT(*) INTO v_existing_bid_count
  FROM bids
  WHERE student_id = p_student_id AND opportunity_id = p_opportunity_id;
  
  IF v_existing_bid_count > 0 THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Already placed a bid for this opportunity',
      'error_code', 'DUPLICATE_BID',
      'existing_bids', v_existing_bid_count
    );
  END IF;
  
  -- Student is eligible
  RETURN jsonb_build_object(
    'eligible', true,
    'student_details', jsonb_build_object(
      'name', v_student.name,
      'email', v_student.email,
      'tokens_remaining', v_student.tokens_remaining,
      'token_status', v_student.token_status
    ),
    'opportunity_details', jsonb_build_object(
      'description', v_opportunity.description,
      'opens_at', v_opportunity.opens_at,
      'closes_at', v_opportunity.closes_at,
      'capacity', COALESCE(v_opportunity.capacity, v_student.capacity_default)
    ),
    'checked_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create indexes for optimal performance
CREATE INDEX IF NOT EXISTS idx_bids_bid_status ON bids(bid_status);
CREATE INDEX IF NOT EXISTS idx_bids_submission_timestamp ON bids(submission_timestamp);
CREATE INDEX IF NOT EXISTS idx_bids_validation_status ON bids(validation_status);
CREATE INDEX IF NOT EXISTS idx_bids_opportunity_status ON bids(opportunity_id, bid_status);
CREATE INDEX IF NOT EXISTS idx_bids_student_status ON bids(student_id, bid_status);

-- Create trigger to automatically update opportunity status based on bid activity
CREATE OR REPLACE FUNCTION update_opportunity_on_bid_change()
RETURNS TRIGGER AS $$
DECLARE
  v_bid_count integer;
  v_capacity integer;
BEGIN
  -- Get current bid count for the opportunity
  SELECT COUNT(*) INTO v_bid_count
  FROM bids
  WHERE opportunity_id = COALESCE(NEW.opportunity_id, OLD.opportunity_id)
    AND bid_status IN ('placed', 'confirmed');
  
  -- Get opportunity capacity
  SELECT COALESCE(o.capacity, c.capacity_default) INTO v_capacity
  FROM opportunities o
  JOIN classes c ON o.class_id = c.id
  WHERE o.id = COALESCE(NEW.opportunity_id, OLD.opportunity_id);
  
  -- Update opportunity status if needed
  -- This could trigger additional business logic based on bid counts
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for bid changes
DROP TRIGGER IF EXISTS trigger_update_opportunity_on_bid_change ON bids;
CREATE TRIGGER trigger_update_opportunity_on_bid_change
  AFTER INSERT OR UPDATE OR DELETE ON bids
  FOR EACH ROW
  EXECUTE FUNCTION update_opportunity_on_bid_change();