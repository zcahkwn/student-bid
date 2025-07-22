/*
  # Atomic Class Deletion System

  1. Functions
    - `get_class_deletion_counts()`: Count related records efficiently
    - `delete_class_atomic()`: Perform atomic class deletion with cascading
    - `preview_class_deletion()`: Preview what would be deleted
    
  2. Features
    - Comprehensive cascading deletion
    - Audit trail logging
    - Error handling and recovery
    - Performance optimized counting
    
  3. Security
    - Atomic transactions
    - Proper error handling
    - Audit logging for compliance
*/

-- Simple function to count related records efficiently
CREATE OR REPLACE FUNCTION get_class_deletion_counts(p_class_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_students integer := 0;
  v_opportunities integer := 0;
  v_bids integer := 0;
  v_token_history integer := 0;
  v_dinner_tables integer := 0;
BEGIN
  -- Count students
  SELECT COUNT(*)::integer INTO v_students
  FROM students WHERE class_id = p_class_id;
  
  -- Count opportunities
  SELECT COUNT(*)::integer INTO v_opportunities
  FROM opportunities WHERE class_id = p_class_id;
  
  -- Count bids (via opportunities)
  SELECT COUNT(*)::integer INTO v_bids
  FROM bids b
  JOIN opportunities o ON b.opportunity_id = o.id
  WHERE o.class_id = p_class_id;
  
  -- Count token history (via students)
  SELECT COUNT(*)::integer INTO v_token_history
  FROM token_history th
  JOIN students s ON th.student_id = s.id
  WHERE s.class_id = p_class_id;
  
  -- Count dinner tables
  SELECT COUNT(*)::integer INTO v_dinner_tables
  FROM dinner_tables
  WHERE class_id = p_class_id AND is_active = true;
  
  RETURN jsonb_build_object(
    'students', v_students,
    'opportunities', v_opportunities,
    'bids', v_bids,
    'token_history', v_token_history,
    'dinner_tables', v_dinner_tables
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Streamlined atomic class deletion function
CREATE OR REPLACE FUNCTION delete_class_atomic(
  p_class_id uuid,
  p_class_name text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_class_name text;
  v_counts jsonb;
  v_dinner_table_name text;
  v_start_time timestamptz := NOW();
BEGIN
  -- Validate class exists
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
  
  -- Get dinner table name if exists
  SELECT table_name INTO v_dinner_table_name
  FROM dinner_tables
  WHERE class_id = p_class_id AND is_active = true
  LIMIT 1;
  
  -- Perform atomic deletion
  -- Foreign key cascades will handle most of the cleanup
  
  -- 1. Handle dinner table if exists
  IF v_dinner_table_name IS NOT NULL THEN
    BEGIN
      -- Mark as inactive
      UPDATE dinner_tables 
      SET is_active = false 
      WHERE class_id = p_class_id;
      
      -- Drop the table
      EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', v_dinner_table_name);
      
    EXCEPTION
      WHEN OTHERS THEN
        -- Log error but continue
        INSERT INTO dinner_table_audit (table_name, action, details, performed_by)
        VALUES (
          v_dinner_table_name,
          'DROP',
          jsonb_build_object('error', SQLERRM, 'class_id', p_class_id),
          auth.uid()
        );
    END;
  END IF;
  
  -- 2. Delete the class (cascades will handle the rest)
  DELETE FROM classes WHERE id = p_class_id;
  
  -- 3. Log successful deletion
  INSERT INTO dinner_table_audit (table_name, action, details, performed_by)
  VALUES (
    'classes',
    'DELETE',
    jsonb_build_object(
      'class_id', p_class_id,
      'class_name', v_class_name,
      'deleted_counts', v_counts,
      'duration_ms', EXTRACT(MILLISECONDS FROM (NOW() - v_start_time))
    ),
    auth.uid()
  );
  
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to preview what would be deleted
CREATE OR REPLACE FUNCTION preview_class_deletion(p_class_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_class_name text;
  v_counts jsonb;
  v_dinner_table_name text;
BEGIN
  -- Get class info
  SELECT name INTO v_class_name
  FROM classes
  WHERE id = p_class_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'error', 'Class not found'
    );
  END IF;
  
  -- Get counts
  v_counts := get_class_deletion_counts(p_class_id);
  
  -- Get dinner table name
  SELECT table_name INTO v_dinner_table_name
  FROM dinner_tables
  WHERE class_id = p_class_id AND is_active = true
  LIMIT 1;
  
  RETURN jsonb_build_object(
    'found', true,
    'class_id', p_class_id,
    'class_name', v_class_name,
    'would_delete', v_counts,
    'dinner_table_name', v_dinner_table_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create minimal indexes for performance
CREATE INDEX IF NOT EXISTS idx_classes_deletion ON classes(id, name);
CREATE INDEX IF NOT EXISTS idx_dinner_tables_class_active ON dinner_tables(class_id, is_active);