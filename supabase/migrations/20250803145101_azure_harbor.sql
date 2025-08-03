/*
  # Fix Auto Select Column Length Issue

  This migration fixes the column length issue where 'selected automatically' 
  is too long for the character varying(20) constraint.

  ## Changes Made
  1. Update the auto_select_and_refund_bids function to use 'auto_selected' instead
  2. This ensures the bid_status fits within the 20-character limit

  ## Security
  - Function maintains SECURITY DEFINER privileges
  - No changes to RLS policies needed
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS public.auto_select_and_refund_bids(uuid);

-- Recreate the function with the shorter status string
CREATE OR REPLACE FUNCTION public.auto_select_and_refund_bids(
  p_opportunity_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  bid_record RECORD;
  result_count INTEGER := 0;
BEGIN
  -- Update all bids for this opportunity to be automatically selected
  FOR bid_record IN 
    SELECT b.user_id, b.id as bid_id, se.class_id
    FROM bids b
    JOIN opportunities o ON b.opportunity_id = o.id
    JOIN student_enrollments se ON b.user_id = se.user_id AND o.class_id = se.class_id
    WHERE b.opportunity_id = p_opportunity_id
  LOOP
    -- Update the bid status (shortened to fit varchar(20))
    UPDATE bids 
    SET 
      is_winner = TRUE,
      bid_amount = 0,
      bid_status = 'auto_selected'
    WHERE id = bid_record.bid_id;
    
    -- Restore student's token
    UPDATE student_enrollments 
    SET 
      tokens_remaining = 1,
      token_status = 'unused',
      bidding_result = 'pending'
    WHERE user_id = bid_record.user_id 
      AND class_id = bid_record.class_id;
    
    -- Update token history to reflect refund
    UPDATE token_history 
    SET 
      amount = 0,
      description = 'Token refunded - automatic selection'
    WHERE user_id = bid_record.user_id 
      AND opportunity_id = p_opportunity_id 
      AND type = 'bid';
    
    result_count := result_count + 1;
  END LOOP;
  
  RETURN json_build_object(
    'success', true,
    'selected_count', result_count,
    'message', 'All bidders automatically selected and tokens refunded'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM,
    'sqlstate', SQLSTATE
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.auto_select_and_refund_bids TO authenticated;