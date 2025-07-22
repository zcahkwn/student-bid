-- Drop the existing function to allow recreation
DROP FUNCTION IF EXISTS public.get_opportunity_bid_status(uuid);

-- Recreate the function with corrected logic
CREATE OR REPLACE FUNCTION public.get_opportunity_bid_status(p_opportunity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
$function$;