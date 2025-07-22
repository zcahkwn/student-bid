/*
  # Secure Bid Submission with Token Management

  1. New Functions
    - `submit_student_bid_secure()`: Atomic bid submission with authentication
    - `get_student_token_status()`: Real-time token status checking
    
  2. Security Features
    - Class password validation
    - Token availability verification
    - Duplicate bid prevention
    - Atomic transactions
    
  3. Real-time Updates
    - Automatic token status updates
    - Bid count tracking
    - Audit trail logging
*/

-- Create secure bid submission function with authentication
CREATE OR REPLACE FUNCTION submit_student_bid_secure(
  p_student_id uuid,
  p_opportunity_id uuid,
  p_class_password text
)
RETURNS jsonb AS $$
DECLARE
  v_student_record record;
  v_opportunity_record record;
  v_class_record record;
  v_bid_id uuid;
  v_result jsonb;
BEGIN
  -- Lock and validate student record
  SELECT * INTO v_student_record
  FROM students 
  WHERE id = p_student_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Student not found'
    );
  END IF;
  
  -- Validate class password
  SELECT * INTO v_class_record
  FROM classes
  WHERE id = v_student_record.class_id;
  
  IF NOT FOUND OR v_class_record.password_hash != p_class_password THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Invalid class password'
    );
  END IF;
  
  -- Check if student has tokens remaining
  IF v_student_record.tokens_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'No tokens remaining'
    );
  END IF;
  
  -- Validate opportunity
  SELECT * INTO v_opportunity_record
  FROM opportunities 
  WHERE id = p_opportunity_id AND class_id = v_student_record.class_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Opportunity not found or not accessible'
    );
  END IF;
  
  -- Check for duplicate bid
  IF EXISTS (
    SELECT 1 FROM bids 
    WHERE student_id = p_student_id AND opportunity_id = p_opportunity_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Bid already submitted for this opportunity'
    );
  END IF;
  
  -- Insert bid record
  INSERT INTO bids (student_id, opportunity_id, bid_amount, created_at)
  VALUES (p_student_id, p_opportunity_id, 1, NOW())
  RETURNING id INTO v_bid_id;
  
  -- Update student token status atomically
  UPDATE students 
  SET 
    tokens_remaining = tokens_remaining - 1,
    token_status = 'used'
  WHERE id = p_student_id;
  
  -- Log the bid in token history
  INSERT INTO token_history (student_id, opportunity_id, amount, type, description)
  VALUES (
    p_student_id, 
    p_opportunity_id, 
    -1, 
    'bid', 
    'Token used for bid submission'
  );
  
  -- Return success result
  RETURN jsonb_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'timestamp', NOW(),
    'tokens_remaining', v_student_record.tokens_remaining - 1
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', 'Bid submission failed: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get student token status
CREATE OR REPLACE FUNCTION get_student_token_status(p_student_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_student record;
BEGIN
  SELECT * INTO v_student
  FROM students
  WHERE id = p_student_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'error', 'Student not found'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'found', true,
    'student_id', v_student.id,
    'name', v_student.name,
    'email', v_student.email,
    'tokens_remaining', v_student.tokens_remaining,
    'token_status', v_student.token_status,
    'has_used_token', v_student.tokens_remaining <= 0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get class token statistics
CREATE OR REPLACE FUNCTION get_class_token_stats(p_class_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_total_students integer;
  v_available_tokens integer;
  v_used_tokens integer;
  v_total_bids integer;
BEGIN
  -- Get student counts
  SELECT 
    COUNT(*)::integer,
    COUNT(CASE WHEN tokens_remaining > 0 THEN 1 END)::integer,
    COUNT(CASE WHEN tokens_remaining <= 0 THEN 1 END)::integer
  INTO v_total_students, v_available_tokens, v_used_tokens
  FROM students
  WHERE class_id = p_class_id;
  
  -- Get total bids for this class
  SELECT COUNT(*)::integer INTO v_total_bids
  FROM bids b
  JOIN opportunities o ON b.opportunity_id = o.id
  WHERE o.class_id = p_class_id;
  
  RETURN jsonb_build_object(
    'total_students', v_total_students,
    'available_tokens', v_available_tokens,
    'used_tokens', v_used_tokens,
    'total_bids', v_total_bids,
    'last_updated', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;