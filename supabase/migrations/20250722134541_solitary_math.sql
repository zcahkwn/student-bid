/*
  # Restore student tokens when opportunity is deleted

  1. New Functions
    - `restore_tokens_on_opportunity_deletion()` - Restores tokens for students who bid on deleted opportunities
  
  2. New Triggers
    - `trigger_restore_tokens_on_opportunity_deletion` - Automatically calls the function when opportunities are deleted
  
  3. Token History Logging
    - Records token restoration events in the token_history table for audit purposes
  
  4. Student Enrollment Updates
    - Updates tokens_remaining and token_status for affected students
    - Resets bidding_result to 'pending' for students who had their tokens restored
*/

-- Function to restore tokens when an opportunity is deleted
CREATE OR REPLACE FUNCTION restore_tokens_on_opportunity_deletion()
RETURNS TRIGGER AS $$
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
    SELECT DISTINCT b.student_id, u.name, u.email
    FROM bids b
    JOIN users u ON u.id = b.student_id
    WHERE b.opportunity_id = OLD.id
  LOOP
    -- Update student enrollment to restore token
    UPDATE student_enrollments 
    SET 
      tokens_remaining = tokens_remaining + 1,
      token_status = 'unused',
      bidding_result = 'pending',
      updated_at = NOW()
    WHERE user_id = bid_record.student_id 
      AND class_id = class_id_var;
    
    -- Log the token restoration in token_history
    INSERT INTO token_history (
      student_id,
      opportunity_id,
      amount,
      type,
      description,
      created_at
    ) VALUES (
      bid_record.student_id,
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
$$ LANGUAGE plpgsql;

-- Create trigger to automatically restore tokens when opportunities are deleted
DROP TRIGGER IF EXISTS trigger_restore_tokens_on_opportunity_deletion ON opportunities;

CREATE TRIGGER trigger_restore_tokens_on_opportunity_deletion
  BEFORE DELETE ON opportunities
  FOR EACH ROW
  EXECUTE FUNCTION restore_tokens_on_opportunity_deletion();

-- Add helpful comment
COMMENT ON FUNCTION restore_tokens_on_opportunity_deletion() IS 
'Automatically restores tokens for students who had placed bids on an opportunity when that opportunity is deleted. Also logs the restoration in token_history for audit purposes.';