```sql
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
    SELECT DISTINCT b.user_id, u.name, u.email
    FROM bids b
    JOIN users u ON u.id = b.user_id -- Corrected: b.user_id
    WHERE b.opportunity_id = OLD.id
  LOOP
    -- Update student enrollment to restore token
    UPDATE student_enrollments 
    SET 
      tokens_remaining = tokens_remaining + 1,
      token_status = 'unused',
      bidding_result = 'pending',
      updated_at = NOW()
    WHERE user_id = bid_record.user_id -- Corrected: bid_record.user_id
      AND class_id = class_id_var;
    
    -- Log the token restoration in token_history
    INSERT INTO token_history (
      user_id, -- Corrected: user_id
      opportunity_id,
      amount,
      type,
      description,
      created_at
    ) VALUES (
      bid_record.user_id, -- Corrected: bid_record.user_id
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
```