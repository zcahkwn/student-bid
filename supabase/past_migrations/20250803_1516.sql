


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."delete_class_atomic"("p_class_id" "uuid", "p_class_name" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_class_name text;
  v_counts jsonb;
  v_start_time timestamptz := NOW();
BEGIN
  -- Validate class exists and get its name
  SELECT name INTO v_class_name
  FROM classes
  WHERE id = p_class_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Class not found',
      'class_id', p_class_id
    );
  END IF;
  
  -- Use provided name or fetched name
  v_class_name := COALESCE(p_class_name, v_class_name);
  
  -- Get counts before deletion
  v_counts := get_class_deletion_counts(p_class_id);
  
  -- Perform atomic deletion
  -- Deleting the class will cascade to associated opportunities, bids, and student enrollments
  -- due to ON DELETE CASCADE foreign key constraints.
  DELETE FROM classes WHERE id = p_class_id;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'class_id', p_class_id,
    'class_name', v_class_name,
    'deleted_counts', v_counts,
    'duration_ms', EXTRACT(MILLISECONDS FROM (NOW() - v_start_time)),
    'timestamp', NOW()
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Return error response
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'class_id', p_class_id,
      'class_name', v_class_name,
      'timestamp', NOW()
    );
END;
$$;


ALTER FUNCTION "public"."delete_class_atomic"("p_class_id" "uuid", "p_class_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_class_bid_statistics"("class_uuid" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
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


ALTER FUNCTION "public"."get_class_bid_statistics"("class_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_class_bid_stats"("p_class_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_total_bids integer;
  v_last_bid_time timestamptz;
  v_active_bidders integer;
BEGIN
  -- Get total bids for the class
  SELECT COUNT(*)::integer INTO v_total_bids
  FROM bids b
  JOIN opportunities o ON b.opportunity_id = o.id
  WHERE o.class_id = p_class_id;
  
  -- Get last bid timestamp
  SELECT MAX(b.created_at) INTO v_last_bid_time
  FROM bids b
  JOIN opportunities o ON b.opportunity_id = o.id
  WHERE o.class_id = p_class_id;
  
  -- Get count of students who have placed bids
  SELECT COUNT(DISTINCT b.student_id)::integer INTO v_active_bidders
  FROM bids b
  JOIN opportunities o ON b.opportunity_id = o.id
  WHERE o.class_id = p_class_id;
  
  RETURN jsonb_build_object(
    'total_bids', v_total_bids,
    'last_bid_time', v_last_bid_time,
    'active_bidders', v_active_bidders
  );
END;
$$;


ALTER FUNCTION "public"."get_class_bid_stats"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_class_deletion_counts"("p_class_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_students integer := 0;
  v_opportunities integer := 0;
  v_bids integer := 0;
  v_token_history integer := 0;
BEGIN
  -- Count students (via student_enrollments)
  SELECT COUNT(DISTINCT se.user_id)::integer INTO v_students
  FROM student_enrollments se
  WHERE se.class_id = p_class_id;
  
  -- Count opportunities
  SELECT COUNT(*)::integer INTO v_opportunities
  FROM opportunities o 
  WHERE o.class_id = p_class_id;
  
  -- Count bids (via opportunities) - explicitly using user_id
  SELECT COUNT(*)::integer INTO v_bids
  FROM bids b
  INNER JOIN opportunities o ON b.opportunity_id = o.id
  WHERE o.class_id = p_class_id;
  
  -- Count token history (via opportunities) - explicitly using user_id
  SELECT COUNT(*)::integer INTO v_token_history
  FROM token_history th
  INNER JOIN opportunities o ON th.opportunity_id = o.id
  WHERE o.class_id = p_class_id;
  
  RETURN jsonb_build_object(
    'students', v_students,
    'opportunities', v_opportunities,
    'bids', v_bids,
    'token_history', v_token_history
  );
END;
$$;


ALTER FUNCTION "public"."get_class_deletion_counts"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_class_opportunity_bid_counts"("class_uuid" "uuid") RETURNS TABLE("opportunity_id" "uuid", "opportunity_description" "text", "bid_count" bigint, "capacity" integer, "event_date" "date")
    LANGUAGE "sql" STABLE
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


ALTER FUNCTION "public"."get_class_opportunity_bid_counts"("class_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_class_token_stats"("p_class_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."get_class_token_stats"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_opportunity_bid_count"("opportunity_uuid" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COUNT(*)::integer
  FROM bids
  WHERE opportunity_id = opportunity_uuid;
$$;


ALTER FUNCTION "public"."get_opportunity_bid_count"("opportunity_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_opportunity_bid_status"("p_opportunity_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_opportunity record;
  v_bid_stats record;
  v_recent_bids jsonb;
  v_result jsonb;
BEGIN
  -- Get opportunity details
  -- Removed reference to c.capacity_default
  SELECT o.*, c.name as class_name
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
  
  -- Get recent bids with student details (using 'users' table instead of 'students')
  SELECT jsonb_agg(
    jsonb_build_object(
      'bid_id', b.id,
      'student_name', u.name,
      'student_email', u.email,
      'bid_amount', b.bid_amount,
      'bid_status', b.bid_status,
      'submission_timestamp', b.submission_timestamp
    ) ORDER BY b.submission_timestamp DESC
  ) INTO v_recent_bids
  FROM bids b
  JOIN users u ON b.student_id = u.id -- Corrected: using 'users' table
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
      'capacity', COALESCE(v_opportunity.capacity, 7), -- Corrected: using opportunity capacity or default 7
      'status', v_opportunity.status,
      'class_name', v_opportunity.class_name
    ),
    'bid_statistics', jsonb_build_object(
      'total_bids', COALESCE(v_bid_stats.total_bids, 0),
      'active_bids', COALESCE(v_bid_stats.active_bids, 0),
      'selected_bids', COALESCE(v_bid_stats.selected_bids, 0),
      'last_bid_time', v_bid_stats.last_bid_time,
      'first_bid_time', v_bid_stats.first_bid_time,
      'capacity_exceeded', COALESCE(v_bid_stats.total_bids, 0) > COALESCE(v_opportunity.capacity, 7) -- Corrected: using opportunity capacity or default 7
    ),
    'recent_bids', COALESCE(v_recent_bids, '[]'::jsonb),
    'last_updated', NOW()
  );
  
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_opportunity_bid_status"("p_opportunity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_opportunity_selections"("p_opportunity_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_class_id uuid;
  v_result json;
BEGIN
  -- Get the class_id for this opportunity
  SELECT class_id INTO v_class_id
  FROM opportunities
  WHERE id = p_opportunity_id;
  
  IF v_class_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Opportunity not found'
    );
  END IF;

  -- Get selected students
  SELECT json_build_object(
    'success', true,
    'selected_students', json_agg(
      json_build_object(
        'id', u.id,
        'name', u.name,
        'email', u.email,
        'student_number', u.student_number,
        'bidding_result', se.bidding_result
      )
    )
  ) INTO v_result
  FROM student_enrollments se
  JOIN users u ON se.user_id = u.id
  WHERE se.class_id = v_class_id
    AND se.bidding_result = 'won';

  RETURN COALESCE(v_result, json_build_object('success', true, 'selected_students', '[]'::json));
END;
$$;


ALTER FUNCTION "public"."get_opportunity_selections"("p_opportunity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_student_bid_status"("user_uuid" "uuid", "class_uuid" "uuid") RETURNS TABLE("opportunity_id" "uuid", "opportunity_description" "text", "has_bid" boolean, "bid_amount" integer, "is_winner" boolean, "bid_created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id as opportunity_id,
    o.description as opportunity_description,
    CASE WHEN b.id IS NOT NULL THEN true ELSE false END as has_bid,
    COALESCE(b.bid_amount, 0) as bid_amount,
    COALESCE(b.is_winner, false) as is_winner,
    b.created_at as bid_created_at
  FROM opportunities o
  LEFT JOIN bids b ON o.id = b.opportunity_id AND b.user_id = user_uuid
  WHERE o.class_id = class_uuid
  ORDER BY o.event_date;
END;
$$;


ALTER FUNCTION "public"."get_student_bid_status"("user_uuid" "uuid", "class_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_student_token_status"("p_user_id" "uuid", "p_class_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_data record;
  v_enrollment_data record;
BEGIN
  -- Get user details
  SELECT id, name, email, student_number INTO v_user_data
  FROM users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'error', 'User not found'
    );
  END IF;

  -- Get enrollment details for the specific class
  SELECT tokens_remaining, token_status INTO v_enrollment_data
  FROM student_enrollments
  WHERE user_id = p_user_id AND class_id = p_class_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'error', 'User not enrolled in this class'
    );
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'user_id', v_user_data.id,
    'name', v_user_data.name,
    'email', v_user_data.email,
    'student_number', v_user_data.student_number,
    'tokens_remaining', v_enrollment_data.tokens_remaining,
    'token_status', v_enrollment_data.token_status,
    'has_used_token', v_enrollment_data.tokens_remaining <= 0
  );
END;
$$;


ALTER FUNCTION "public"."get_student_token_status"("p_user_id" "uuid", "p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_dinner_table_action"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO dinner_table_audit (table_name, action, details, performed_by)
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    CASE 
      WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
      ELSE to_jsonb(NEW)
    END,
    auth.uid()
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."log_dinner_table_action"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_opportunity_selection"("p_opportunity_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_class_id uuid;
    v_updated_enrollments_count integer := 0;
    v_updated_bids_count integer := 0;
BEGIN
    -- Get the class_id associated with the opportunity
    SELECT class_id INTO v_class_id FROM opportunities WHERE id = p_opportunity_id;

    IF v_class_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error_message', 'Opportunity not found.');
    END IF;

    -- Reset student_enrollments for students who bid on this opportunity
    -- ONLY reset bidding_result to 'pending' and update timestamp
    UPDATE student_enrollments se
    SET
        bidding_result = 'pending',
        updated_at = now()
    FROM bids b
    WHERE se.user_id = b.user_id
      AND b.opportunity_id = p_opportunity_id
      AND se.class_id = v_class_id
    RETURNING 1 INTO v_updated_enrollments_count;

    -- Reset bid status and is_winner for bids related to this opportunity
    UPDATE bids
    SET
        bid_status = 'placed', -- Reset to 'placed' so it can be withdrawn
        is_winner = FALSE,     -- Ensure it's not marked as a winner
        validation_status = 'validated', -- Assuming it's valid again
        submission_timestamp = now() -- Update timestamp to reflect reset
    WHERE opportunity_id = p_opportunity_id
    RETURNING 1 INTO v_updated_bids_count;

    RETURN jsonb_build_object('success', true, 'message', 'Selection reset successfully.', 'reset_count', v_updated_enrollments_count, 'bids_reset_count', v_updated_bids_count);

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error_message', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."reset_opportunity_selection"("p_opportunity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_tokens_on_opportunity_deletion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  bid_record RECORD;
  class_id_var UUID;
  restored_count INTEGER := 0;
BEGIN
  -- Get the class_id from the deleted opportunity
  class_id_var := OLD.class_id;
  
  -- Log the opportunity deletion
  RAISE NOTICE 'Opportunity deleted: % (Class: %)', OLD.id, class_id_var;
  
  -- Find all students who had bids on this opportunity and restore their tokens
  FOR bid_record IN 
    SELECT DISTINCT b.user_id, u.name, u.email
    FROM bids b
    JOIN users u ON u.id = b.user_id
    WHERE b.opportunity_id = OLD.id
  LOOP
    -- Update student enrollment to restore token
    UPDATE student_enrollments 
    SET 
      tokens_remaining = tokens_remaining + 1,
      token_status = 'unused',
      bidding_result = 'pending',
      updated_at = NOW()
    WHERE user_id = bid_record.user_id 
      AND class_id = class_id_var;
    
    -- Log the token restoration in token_history
    INSERT INTO token_history (
      user_id, -- Changed from student_id to user_id
      opportunity_id,
      amount,
      type,
      description,
      created_at
    ) VALUES (
      bid_record.user_id, -- Changed from student_id to user_id
      OLD.id,
      1,
      'refund',
      'Token restored due to opportunity deletion: ' || OLD.title,
      NOW()
    );
    
    restored_count := restored_count + 1;
    
    RAISE NOTICE 'Token restored for student: % (%) - Total restored: %', 
      bid_record.name, bid_record.email, restored_count;
  END LOOP;
  
  -- Log summary
  RAISE NOTICE 'Opportunity deletion complete. Restored tokens for % students', restored_count;
  
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."restore_tokens_on_opportunity_deletion"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."restore_tokens_on_opportunity_deletion"() IS 'Automatically restores tokens for students who had placed bids on an opportunity when that opportunity is deleted. Also logs the restoration in token_history for audit purposes.';



CREATE OR REPLACE FUNCTION "public"."sanitize_table_name"("input_name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Convert to lowercase, replace spaces and special chars with underscores
  -- Remove any characters that aren't alphanumeric or underscore
  RETURN regexp_replace(
    regexp_replace(
      lower(trim(input_name)), 
      '[^a-z0-9_]', '_', 'g'
    ), 
    '_+', '_', 'g'
  );
END;
$$;


ALTER FUNCTION "public"."sanitize_table_name"("input_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."student_has_bid"("user_uuid" "uuid", "opportunity_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1
    FROM bids
    WHERE user_id = user_uuid AND opportunity_id = opportunity_uuid
  );
END;
$$;


ALTER FUNCTION "public"."student_has_bid"("user_uuid" "uuid", "opportunity_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_student_bid_secure"("p_user_id" "uuid", "p_opportunity_id" "uuid", "p_bid_amount" integer) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$DECLARE
  v_class_id uuid;
  v_enrollment_record record;
  v_opportunity_record record;
  v_existing_bid_count integer;
  v_bid_id uuid;
  v_result json;
BEGIN
  -- Get opportunity details including capacity, status, opens_at, closes_at from opportunities table
  SELECT o.id, o.class_id, o.capacity, o.status, o.opens_at, o.closes_at
  INTO v_opportunity_record
  FROM opportunities o
  WHERE o.id = p_opportunity_id;

  -- Check if opportunity exists
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Opportunity not found'
    );
  END IF;

  -- Check if bidding window is open based on opens_at and closes_at
  IF NOW() < v_opportunity_record.opens_at THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Bidding has not opened yet'
    );
  END IF;

  IF NOW() > v_opportunity_record.closes_at THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Bidding has already closed'
    );
  END IF;

  -- If bidding window is open and status is 'upcoming', update status to 'open'
  IF v_opportunity_record.status = 'upcoming' AND NOW() >= v_opportunity_record.opens_at AND NOW() < v_opportunity_record.closes_at THEN
    UPDATE opportunities
    SET status = 'open'
    WHERE id = p_opportunity_id
    RETURNING status INTO v_opportunity_record.status; -- Update the record variable with the new status
  END IF;

  -- Final check if opportunity is open for bidding (after potential status update)
  IF v_opportunity_record.status != 'open' THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Opportunity is not open for bidding'
    );
  END IF;

  -- Get student enrollment
  SELECT se.user_id, se.class_id, se.tokens_remaining, se.token_status
  INTO v_enrollment_record
  FROM student_enrollments se
  WHERE se.user_id = p_user_id AND se.class_id = v_opportunity_record.class_id;

  -- Check if student is enrolled
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Student is not enrolled in this class'
    );
  END IF;

  -- Check if student has tokens
  IF v_enrollment_record.tokens_remaining < p_bid_amount THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Insufficient tokens remaining'
    );
  END IF;

  -- Check if student already has a bid for this opportunity
  SELECT COUNT(*)
  INTO v_existing_bid_count
  FROM bids b
  WHERE b.user_id = p_user_id AND b.opportunity_id = p_opportunity_id;

  IF v_existing_bid_count > 0 THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Student has already placed a bid for this opportunity'
    );
  END IF;

  -- Check if opportunity has reached capacity
  SELECT COUNT(*)
  INTO v_existing_bid_count
  FROM bids b
  WHERE b.opportunity_id = p_opportunity_id AND b.bid_status = 'placed';

  -- Create the bid
  INSERT INTO bids (user_id, opportunity_id, bid_amount, bid_status, validation_status)
  VALUES (p_user_id, p_opportunity_id, p_bid_amount, 'placed', 'validated')
  RETURNING id INTO v_bid_id;

  -- Update student enrollment (reduce tokens)
  UPDATE student_enrollments
  SET 
    tokens_remaining = tokens_remaining - p_bid_amount,
    token_status = CASE 
      WHEN tokens_remaining - p_bid_amount <= 0 THEN 'used'
      ELSE token_status
    END,
    updated_at = NOW()
  WHERE user_id = p_user_id AND class_id = v_opportunity_record.class_id;

  -- Log token usage
  INSERT INTO token_history (user_id, opportunity_id, amount, type, description)
  VALUES (p_user_id, p_opportunity_id, -p_bid_amount, 'bid', 'Token used for bid submission');

  -- Return success
  RETURN json_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'message', 'Bid submitted successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error_message', 'Database error: ' || SQLERRM
    );
END;$$;


ALTER FUNCTION "public"."submit_student_bid_secure"("p_user_id" "uuid", "p_opportunity_id" "uuid", "p_bid_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_opportunity_on_bid_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_bid_count integer;
  v_capacity integer;
BEGIN
  -- Get current bid count for the opportunity
  SELECT COUNT(*) INTO v_bid_count
  FROM bids
  WHERE opportunity_id = COALESCE(NEW.opportunity_id, OLD.opportunity_id)
    AND bid_status IN ('placed', 'confirmed');
  
  -- Get opportunity capacity directly from opportunities table
  SELECT o.capacity INTO v_capacity
  FROM opportunities o
  WHERE o.id = COALESCE(NEW.opportunity_id, OLD.opportunity_id);
  
  -- Update opportunity status if needed
  -- This could trigger additional business logic based on bid counts
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."update_opportunity_on_bid_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_opportunity_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Update status based on current time
  IF NEW.opens_at > NOW() THEN
    NEW.status = 'upcoming';
  ELSIF NEW.opens_at <= NOW() AND NEW.closes_at > NOW() THEN
    NEW.status = 'open';
  ELSIF NEW.closes_at <= NOW() AND NEW.event_date >= CURRENT_DATE THEN
    NEW.status = 'closed';
  ELSE
    NEW.status = 'completed';
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_opportunity_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_selection_results_atomic"("p_opportunity_id" "uuid", "p_selected_user_ids" "uuid"[], "p_all_bidder_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_class_id uuid;
    v_selected_count integer;
    v_rejected_count integer;
    v_enrollment_won_count integer;
    v_enrollment_lost_count integer;
BEGIN
    -- Get the class_id for the given opportunity
    SELECT class_id INTO v_class_id
    FROM opportunities
    WHERE id = p_opportunity_id;

    IF v_class_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error_message', 'Opportunity not found.');
    END IF;

    -- 1. Update bids for selected students
    UPDATE bids
    SET
        is_winner = TRUE,
        bid_status = 'selected',
        submission_timestamp = now() -- Update timestamp to reflect selection processing
    WHERE
        opportunity_id = p_opportunity_id AND user_id = ANY(p_selected_user_ids)
    RETURNING 1 INTO v_selected_count; -- Count updated rows

    -- 2. Update bids for non-selected students (who placed a bid on this opportunity)
    UPDATE bids
    SET
        is_winner = FALSE,
        bid_status = 'rejected',
        submission_timestamp = now() -- Update timestamp to reflect selection processing
    WHERE
        opportunity_id = p_opportunity_id AND user_id = ANY(p_all_bidder_ids) AND NOT (user_id = ANY(p_selected_user_ids))
    RETURNING 1 INTO v_rejected_count; -- Count updated rows

    -- 3. Update student_enrollments for selected students
    UPDATE student_enrollments
    SET
        bidding_result = 'won',
        updated_at = now()
    WHERE
        user_id = ANY(p_selected_user_ids) AND class_id = v_class_id
    RETURNING 1 INTO v_enrollment_won_count; -- Count updated rows

    -- 4. Update student_enrollments for non-selected students (who placed a bid on this opportunity)
    UPDATE student_enrollments
    SET
        bidding_result = 'lost',
        updated_at = now()
    WHERE
        user_id = ANY(p_all_bidder_ids) AND NOT (user_id = ANY(p_selected_user_ids)) AND class_id = v_class_id
    RETURNING 1 INTO v_enrollment_lost_count; -- Count updated rows

    -- Return success with counts of updated records
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Selection results updated successfully.',
        'updated_bids_selected', COALESCE(v_selected_count, 0),
        'updated_bids_rejected', COALESCE(v_rejected_count, 0),
        'updated_enrollments_won', COALESCE(v_enrollment_won_count, 0),
        'updated_enrollments_lost', COALESCE(v_enrollment_lost_count, 0)
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error_message', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."update_selection_results_atomic"("p_opportunity_id" "uuid", "p_selected_user_ids" "uuid"[], "p_all_bidder_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_token_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Update token_status based on tokens_remaining
  IF NEW.tokens_remaining <= 0 THEN
    NEW.token_status = 'used';
  ELSE
    NEW.token_status = 'unused';
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_token_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."withdraw_bid_secure"("p_user_id" "uuid", "p_opportunity_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_class_id uuid;
  v_bid_id uuid;
  v_token_history_id uuid;
  v_deleted_bids integer := 0;
  v_deleted_history integer := 0;
  v_updated_enrollments integer := 0;
BEGIN
  -- Get the class_id for this opportunity
  SELECT class_id INTO v_class_id
  FROM opportunities
  WHERE id = p_opportunity_id;
  
  IF v_class_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Opportunity not found'
    );
  END IF;

  -- Check if the user has actually placed a bid for this opportunity
  SELECT id INTO v_bid_id
  FROM bids
  WHERE user_id = p_user_id AND opportunity_id = p_opportunity_id;
  
  IF v_bid_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No bid found for this user and opportunity'
    );
  END IF;

  -- Start transaction operations
  BEGIN
    -- Delete the bid from bids table
    DELETE FROM bids 
    WHERE user_id = p_user_id AND opportunity_id = p_opportunity_id;
    
    GET DIAGNOSTICS v_deleted_bids = ROW_COUNT;

    -- Delete the token history entry for this bid
    DELETE FROM token_history 
    WHERE user_id = p_user_id 
      AND opportunity_id = p_opportunity_id 
      AND type = 'bid';
    
    GET DIAGNOSTICS v_deleted_history = ROW_COUNT;

    -- Restore the student's token in student_enrollments
    UPDATE student_enrollments 
    SET 
      tokens_remaining = 1,
      token_status = 'unused'::character varying,
      bidding_result = 'pending'::character varying,
      updated_at = now()
    WHERE user_id = p_user_id AND class_id = v_class_id;
    
    GET DIAGNOSTICS v_updated_enrollments = ROW_COUNT;

    -- Verify that we actually updated an enrollment record
    IF v_updated_enrollments = 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Student enrollment not found for this class'
      );
    END IF;

    -- Return success with operation counts
    RETURN jsonb_build_object(
      'success', true,
      'deleted_bids', v_deleted_bids,
      'deleted_history', v_deleted_history,
      'updated_enrollments', v_updated_enrollments,
      'opportunity_id', p_opportunity_id,
      'class_id', v_class_id,
      'user_id', p_user_id
    );

  EXCEPTION WHEN OTHERS THEN
    -- Rollback happens automatically
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'sqlstate', SQLSTATE
    );
  END;
END;
$$;


ALTER FUNCTION "public"."withdraw_bid_secure"("p_user_id" "uuid", "p_opportunity_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."bids" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "opportunity_id" "uuid",
    "is_winner" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "bid_amount" integer DEFAULT 1 NOT NULL,
    "bid_status" character varying(20) DEFAULT 'placed'::character varying,
    "submission_timestamp" timestamp with time zone DEFAULT "now"(),
    "validation_status" character varying(20) DEFAULT 'validated'::character varying,
    CONSTRAINT "bids_bid_status_check" CHECK ((("bid_status")::"text" = ANY (ARRAY[('placed'::character varying)::"text", ('confirmed'::character varying)::"text", ('selected'::character varying)::"text", ('rejected'::character varying)::"text"]))),
    CONSTRAINT "bids_validation_status_check" CHECK ((("validation_status")::"text" = ANY (ARRAY[('validated'::character varying)::"text", ('pending'::character varying)::"text", ('failed'::character varying)::"text"])))
);


ALTER TABLE "public"."bids" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."opportunities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid",
    "description" "text" NOT NULL,
    "opens_at" timestamp with time zone NOT NULL,
    "closes_at" timestamp with time zone NOT NULL,
    "event_date" "date" NOT NULL,
    "capacity" integer DEFAULT 7,
    "status" "text" DEFAULT 'upcoming'::"text",
    "draw_seed" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "title" "text",
    CONSTRAINT "opportunities_status_check" CHECK (("status" = ANY (ARRAY['upcoming'::"text", 'open'::"text", 'closed'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."opportunities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_enrollments" (
    "user_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "tokens_remaining" integer DEFAULT 1,
    "token_status" character varying(20) DEFAULT 'unused'::character varying,
    "bidding_result" character varying(20) DEFAULT 'pending'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "student_enrollments_bidding_result_check" CHECK ((("bidding_result")::"text" = ANY ((ARRAY['pending'::character varying, 'won'::character varying, 'lost'::character varying])::"text"[]))),
    CONSTRAINT "student_enrollments_token_status_check" CHECK ((("token_status")::"text" = ANY ((ARRAY['unused'::character varying, 'used'::character varying])::"text"[])))
);


ALTER TABLE "public"."student_enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."token_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "opportunity_id" "uuid",
    "amount" integer NOT NULL,
    "type" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "token_history_type_check" CHECK (("type" = ANY (ARRAY['bid'::"text", 'reset'::"text", 'topup'::"text", 'refund'::"text"])))
);


ALTER TABLE "public"."token_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "student_number" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_student_id_opportunity_id_key" UNIQUE ("user_id", "opportunity_id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_enrollments"
    ADD CONSTRAINT "student_enrollments_pkey" PRIMARY KEY ("user_id", "class_id");



ALTER TABLE ONLY "public"."token_history"
    ADD CONSTRAINT "token_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_bids_bid_amount" ON "public"."bids" USING "btree" ("bid_amount");



CREATE INDEX "idx_bids_bid_status" ON "public"."bids" USING "btree" ("bid_status");



CREATE INDEX "idx_bids_created_at" ON "public"."bids" USING "btree" ("created_at");



CREATE INDEX "idx_bids_opportunity_id" ON "public"."bids" USING "btree" ("opportunity_id");



CREATE INDEX "idx_bids_opportunity_status" ON "public"."bids" USING "btree" ("opportunity_id", "bid_status");



CREATE INDEX "idx_bids_student_id" ON "public"."bids" USING "btree" ("user_id");



CREATE INDEX "idx_bids_student_opportunity" ON "public"."bids" USING "btree" ("user_id", "opportunity_id");



CREATE INDEX "idx_bids_student_status" ON "public"."bids" USING "btree" ("user_id", "bid_status");



CREATE INDEX "idx_bids_submission_timestamp" ON "public"."bids" USING "btree" ("submission_timestamp");



CREATE INDEX "idx_bids_validation_status" ON "public"."bids" USING "btree" ("validation_status");



CREATE INDEX "idx_classes_deletion" ON "public"."classes" USING "btree" ("id", "name");



CREATE INDEX "idx_opportunities_capacity" ON "public"."opportunities" USING "btree" ("capacity");



CREATE INDEX "idx_opportunities_class_id" ON "public"."opportunities" USING "btree" ("class_id");



CREATE INDEX "idx_opportunities_title" ON "public"."opportunities" USING "btree" ("title");



CREATE INDEX "idx_student_enrollments_class_id" ON "public"."student_enrollments" USING "btree" ("class_id");



CREATE INDEX "idx_student_enrollments_user_id" ON "public"."student_enrollments" USING "btree" ("user_id");



CREATE INDEX "idx_token_history_opportunity_id" ON "public"."token_history" USING "btree" ("opportunity_id");



CREATE INDEX "idx_token_history_student_id" ON "public"."token_history" USING "btree" ("user_id");



CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email");



CREATE INDEX "idx_users_student_number" ON "public"."users" USING "btree" ("student_number");



CREATE OR REPLACE TRIGGER "trigger_restore_tokens_on_opportunity_deletion" BEFORE DELETE ON "public"."opportunities" FOR EACH ROW EXECUTE FUNCTION "public"."restore_tokens_on_opportunity_deletion"();



CREATE OR REPLACE TRIGGER "trigger_update_opportunity_on_bid_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."bids" FOR EACH ROW EXECUTE FUNCTION "public"."update_opportunity_on_bid_change"();



CREATE OR REPLACE TRIGGER "update_opportunity_status_trigger" BEFORE UPDATE ON "public"."opportunities" FOR EACH ROW EXECUTE FUNCTION "public"."update_opportunity_status"();



CREATE OR REPLACE TRIGGER "update_student_enrollments_updated_at" BEFORE UPDATE ON "public"."student_enrollments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "bids_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bids"
    ADD CONSTRAINT "fk_bids_user_id" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_enrollments"
    ADD CONSTRAINT "student_enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_enrollments"
    ADD CONSTRAINT "student_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."token_history"
    ADD CONSTRAINT "token_history_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE SET NULL;



CREATE POLICY "Allow anon and authenticated users to delete users" ON "public"."users" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow anon and authenticated users to insert users" ON "public"."users" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow anon and authenticated users to manage student enrollment" ON "public"."student_enrollments" TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Allow anon and authenticated users to select users" ON "public"."users" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow anon and authenticated users to update users" ON "public"."users" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users to delete token history" ON "public"."token_history" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to insert bids" ON "public"."bids" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to insert token history" ON "public"."token_history" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to manage bids" ON "public"."bids" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users to select token history" ON "public"."token_history" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to update bids" ON "public"."bids" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to update token history" ON "public"."token_history" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users to view bids" ON "public"."bids" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow system operations on token history" ON "public"."token_history" USING (true) WITH CHECK (true);



CREATE POLICY "Enable delete for anon and authenticated users" ON "public"."classes" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Enable delete for anon and authenticated users" ON "public"."opportunities" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "Enable insert for anon and authenticated users" ON "public"."classes" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Enable insert for anon and authenticated users" ON "public"."opportunities" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Enable select for anon and authenticated users" ON "public"."classes" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Enable select for anon and authenticated users" ON "public"."opportunities" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Enable update for anon and authenticated users" ON "public"."classes" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Enable update for anon and authenticated users" ON "public"."opportunities" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."bids" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."opportunities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."token_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."delete_class_atomic"("p_class_id" "uuid", "p_class_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_class_atomic"("p_class_id" "uuid", "p_class_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_class_atomic"("p_class_id" "uuid", "p_class_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_class_bid_statistics"("class_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_class_bid_statistics"("class_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_class_bid_statistics"("class_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_class_bid_stats"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_class_bid_stats"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_class_bid_stats"("p_class_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_class_deletion_counts"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_class_deletion_counts"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_class_deletion_counts"("p_class_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_class_opportunity_bid_counts"("class_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_class_opportunity_bid_counts"("class_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_class_opportunity_bid_counts"("class_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_class_token_stats"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_class_token_stats"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_class_token_stats"("p_class_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_opportunity_bid_count"("opportunity_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_opportunity_bid_count"("opportunity_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_opportunity_bid_count"("opportunity_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_opportunity_bid_status"("p_opportunity_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_opportunity_bid_status"("p_opportunity_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_opportunity_bid_status"("p_opportunity_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_opportunity_selections"("p_opportunity_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_opportunity_selections"("p_opportunity_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_opportunity_selections"("p_opportunity_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_student_bid_status"("user_uuid" "uuid", "class_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_student_bid_status"("user_uuid" "uuid", "class_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_student_bid_status"("user_uuid" "uuid", "class_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_student_token_status"("p_user_id" "uuid", "p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_student_token_status"("p_user_id" "uuid", "p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_student_token_status"("p_user_id" "uuid", "p_class_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_dinner_table_action"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_dinner_table_action"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_dinner_table_action"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_opportunity_selection"("p_opportunity_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reset_opportunity_selection"("p_opportunity_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_opportunity_selection"("p_opportunity_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."restore_tokens_on_opportunity_deletion"() TO "anon";
GRANT ALL ON FUNCTION "public"."restore_tokens_on_opportunity_deletion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_tokens_on_opportunity_deletion"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sanitize_table_name"("input_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sanitize_table_name"("input_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sanitize_table_name"("input_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."student_has_bid"("user_uuid" "uuid", "opportunity_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."student_has_bid"("user_uuid" "uuid", "opportunity_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."student_has_bid"("user_uuid" "uuid", "opportunity_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_student_bid_secure"("p_user_id" "uuid", "p_opportunity_id" "uuid", "p_bid_amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."submit_student_bid_secure"("p_user_id" "uuid", "p_opportunity_id" "uuid", "p_bid_amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_student_bid_secure"("p_user_id" "uuid", "p_opportunity_id" "uuid", "p_bid_amount" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_opportunity_on_bid_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_opportunity_on_bid_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_opportunity_on_bid_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_opportunity_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_opportunity_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_opportunity_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_selection_results_atomic"("p_opportunity_id" "uuid", "p_selected_user_ids" "uuid"[], "p_all_bidder_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."update_selection_results_atomic"("p_opportunity_id" "uuid", "p_selected_user_ids" "uuid"[], "p_all_bidder_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_selection_results_atomic"("p_opportunity_id" "uuid", "p_selected_user_ids" "uuid"[], "p_all_bidder_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_token_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_token_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_token_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."withdraw_bid_secure"("p_user_id" "uuid", "p_opportunity_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."withdraw_bid_secure"("p_user_id" "uuid", "p_opportunity_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."withdraw_bid_secure"("p_user_id" "uuid", "p_opportunity_id" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."bids" TO "anon";
GRANT ALL ON TABLE "public"."bids" TO "authenticated";
GRANT ALL ON TABLE "public"."bids" TO "service_role";



GRANT ALL ON TABLE "public"."classes" TO "anon";
GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";



GRANT ALL ON TABLE "public"."opportunities" TO "anon";
GRANT ALL ON TABLE "public"."opportunities" TO "authenticated";
GRANT ALL ON TABLE "public"."opportunities" TO "service_role";



GRANT ALL ON TABLE "public"."student_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."student_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."student_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."token_history" TO "anon";
GRANT ALL ON TABLE "public"."token_history" TO "authenticated";
GRANT ALL ON TABLE "public"."token_history" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























RESET ALL;
