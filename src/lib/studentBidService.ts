import { supabase } from '@/lib/supabase'
import { Student } from '@/types'
import { getUserByCredentials, getUserEnrollments } from '@/lib/userService'

export interface StudentBidRequest {
  userId: string
  opportunityId: string
}

export interface StudentBidResponse {
  success: boolean
  bidId?: string
  updatedStudent?: Student
  errorMessage?: string
  timestamp?: string
}

// Submit a bid and update student token status
export async function submitStudentBid(request: StudentBidRequest): Promise<StudentBidResponse> {
  const { userId, opportunityId } = request;
  
  try {
    console.log('=== STARTING BID SUBMISSION DEBUG ===');
    console.log('User ID:', userId);
    console.log('Opportunity ID:', opportunityId);
    console.log('Supabase client status:', !!supabase);

    // Step 0: Fetch current student status before submission
    console.log('=== STEP 0: FETCH CURRENT STUDENT STATUS ===');
    const { data: currentEnrollment, error: currentError } = await supabase
      .from('student_enrollments')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (currentError) {
      console.error('Error fetching current enrollment:', currentError);
    } else {
      console.log('Current enrollment before bid:', currentEnrollment);
    }

    // First, let's verify the opportunity exists and get its class_id
    console.log('=== STEP 1: VERIFY OPPORTUNITY EXISTS ===');
    const { data: opportunity, error: oppError } = await supabase
      .from('opportunities')
      .select('id, class_id, title, description')
      .eq('id', opportunityId)
      .single();

    if (oppError) {
      console.error('Error fetching opportunity:', oppError);
      return {
        success: false,
        errorMessage: `Opportunity not found: ${oppError.message}`
      };
    }

    console.log('Opportunity found:', opportunity);

    // Verify student enrollment in the class
    console.log('=== STEP 2: VERIFY STUDENT ENROLLMENT ===');
    const { data: enrollment, error: enrollmentError } = await supabase
      .from('student_enrollments')
      .select('*')
      .eq('user_id', userId)
      .eq('class_id', opportunity.class_id)
      .single();

    if (enrollmentError) {
      console.error('Error checking enrollment:', enrollmentError);
      return {
        success: false,
        errorMessage: `Student not enrolled in this class: ${enrollmentError.message}`
      };
    }

    console.log('Student enrollment found:', enrollment);

    // Check if student has tokens available
    if (enrollment.tokens_remaining <= 0) {
      console.log('No tokens remaining for student');
      return {
        success: false,
        errorMessage: 'No tokens remaining'
      };
    }

    // Check for existing bid
    console.log('=== STEP 3: CHECK FOR EXISTING BID ===');
    const { data: existingBid, error: bidCheckError } = await supabase
      .from('bids')
      .select('id')
      .eq('user_id', userId) // Changed from student_id to user_id
      .eq('opportunity_id', opportunityId)
      .maybeSingle();

    if (bidCheckError) {
      console.error('Error checking existing bid:', bidCheckError);
      return {
        success: false,
        errorMessage: `Error checking existing bid: ${bidCheckError.message}`
      };
    }

    if (existingBid) {
      console.log('Student has already bid on this opportunity');
      return {
        success: false,
        errorMessage: 'You have already placed a bid for this opportunity'
      };
    }

    // Now try the RPC function
    console.log('=== STEP 4: CALLING RPC FUNCTION ===');
    
    // Use RPC function for secure bid submission
    const { data: result, error } = await supabase.rpc('submit_student_bid_secure', {
      p_bid_amount: 1,
      p_user_id: userId,
      p_opportunity_id: opportunityId
    });

    console.log('RPC function result:', result);
    console.log('RPC function error:', error);

    if (error) {
      console.error('RPC function failed:', error);
      return {
        success: false,
        errorMessage: `Bid submission failed: ${error.message}`
      };
    }

    if (!result || !result.success) {
      console.error('RPC function returned failure:', result);
      return {
        success: false,
        errorMessage: result?.error_message || 'Bid submission failed'
      };
    }

    console.log('=== STEP 5: FETCH UPDATED DATA ===');
    // Fetch updated user data
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    // Fetch updated enrollment data
    const { data: updatedEnrollment, error: updatedEnrollmentError } = await supabase
      .from('student_enrollments')
      .select('*')
      .eq('user_id', userId)
      .eq('class_id', opportunity.class_id)
      .single();

    if (userError || updatedEnrollmentError || !user || !updatedEnrollment) {
      console.error('Error fetching updated data:', userError || updatedEnrollmentError);
      // Still return success since the bid was submitted
      return {
        success: true,
        bidId: result.bid_id,
        timestamp: new Date().toISOString()
      };
    }

    console.log('Updated user data:', user);
    console.log('Updated enrollment data:', updatedEnrollment);

    // Create updated student object
    const updatedStudent: Student = {
      id: user.id,
      name: user.name,
      email: user.email,
      studentNumber: user.student_number || '',
      hasUsedToken: updatedEnrollment.tokens_remaining <= 0, // Set for this specific class
      hasBid: updatedEnrollment.token_status === 'used', // Set for this specific class
      tokensRemaining: updatedEnrollment.tokens_remaining,
      tokenStatus: updatedEnrollment.token_status,
      biddingResult: updatedEnrollment.bidding_result
    };

    console.log('=== BID SUBMISSION SUCCESSFUL ===');
    console.log('Updated student:', updatedStudent);
    console.log('Token status changed from', currentEnrollment?.token_status, 'to', updatedEnrollment.token_status);
    console.log('Tokens remaining changed from', currentEnrollment?.tokens_remaining, 'to', updatedEnrollment.tokens_remaining);

    return {
      success: true,
      bidId: result.bid_id,
      updatedStudent: updatedStudent,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('=== UNEXPECTED ERROR DURING BID SUBMISSION ===');
    console.error('Error type:', typeof error);
    console.error('Error message:', error instanceof Error ? error.message : error);
    console.error('Full error object:', error);
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unexpected error occurred'
    };
  }
}

// Get real-time user status for a specific class
export async function getUserStatus(userId: string, classId: string): Promise<Student | null> {
  try {
    console.log('=== FETCHING USER STATUS ===');
    console.log('User ID:', userId, 'Class ID:', classId);
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    const { data: enrollment, error: enrollmentError } = await supabase
      .from('student_enrollments')
      .select('*')
      .eq('user_id', userId)
      .eq('class_id', classId)
      .single();

    // Fetch bid data for this class to get accurate bidding status
    const { data: bids, error: bidsError } = await supabase
      .from('bids')
      .select(`
        id,
        opportunity_id,
        is_winner,
        bid_status,
        submission_timestamp,
        opportunities!inner(class_id)
      `)
      .eq('user_id', userId)
      .eq('opportunities.class_id', classId);

    if (userError || enrollmentError || !user || !enrollment) {
      console.error('Error fetching user status:', userError || enrollmentError);
      return null;
    }

    // Determine if student has any bids in this class
    const hasAnyBids = bids && bids.length > 0;
    
    // Determine overall bidding result for this class
    let overallBiddingResult = enrollment.bidding_result;
    if (bids && bids.length > 0) {
      const hasWonAny = bids.some(bid => bid.is_winner === true);
      const hasLostAny = bids.some(bid => bid.is_winner === false);
      
      if (hasWonAny) {
        overallBiddingResult = 'won';
      } else if (hasLostAny && !hasWonAny) {
        overallBiddingResult = 'lost';
      } else {
        overallBiddingResult = 'pending';
      }
    }

    console.log('=== USER STATUS FETCHED ===');
    console.log('User data:', user);
    console.log('Enrollment data:', enrollment);
    console.log('Bid data:', bids);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      studentNumber: user.student_number || '',
      hasUsedToken: enrollment.tokens_remaining <= 0,
      hasBid: hasAnyBids || enrollment.token_status === 'used',
      tokensRemaining: enrollment.tokens_remaining,
      tokenStatus: enrollment.token_status,
      biddingResult: overallBiddingResult
    };
  } catch (error) {
    console.error('Error getting user status:', error);
    return null;
  }
}

// Subscribe to real-time user enrollment updates
export function subscribeToUserEnrollmentUpdates(
  userId: string,
  classId: string,
  onUpdate: (student: Student) => void
) {
  console.log('=== SETTING UP REAL-TIME SUBSCRIPTION ===');
  console.log('User ID:', userId, 'Class ID:', classId);
  
  const channel = supabase
    .channel(`user-enrollment-${userId}-${classId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'student_enrollments',
        filter: `user_id=eq.${userId}.and.class_id=eq.${classId}`,
      },
      async (payload) => {
        console.log('=== REAL-TIME ENROLLMENT UPDATE ===');
        console.log('Payload:', payload);
        console.log('Previous data:', payload.old);
        console.log('New data:', payload.new);
        
        const updatedData = payload.new;
        
        // Fetch user data to get name, email, etc.
        const { data: user } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();

        // Fetch latest bid data for this class
        const { data: latestBids } = await supabase
          .from('bids')
          .select(`
            id,
            opportunity_id,
            is_winner,
            bid_status,
            opportunities!inner(class_id)
          `)
          .eq('user_id', userId)
          .eq('opportunities.class_id', classId);

        if (user) {
          // Use the bidding_result directly from student_enrollments table
          const biddingResult = updatedData.bidding_result;

          const student: Student = {
            id: user.id,
            name: user.name,
            email: user.email,
            studentNumber: user.student_number || '',
            hasUsedToken: updatedData.tokens_remaining <= 0,
            hasBid: (latestBids && latestBids.length > 0) || updatedData.token_status === 'used',
            tokensRemaining: updatedData.tokens_remaining,
            tokenStatus: updatedData.token_status,
            biddingResult: biddingResult
          };
          
          console.log('=== CALLING onUpdate CALLBACK ===');
          console.log('Updated student object:', student);
          console.log('Token status changed:', payload.old?.token_status, '->', updatedData.token_status);
          console.log('Bidding result changed:', payload.old?.bidding_result, '->', overallBiddingResult);
          
          onUpdate(student);
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${userId}`,
      },
      async (payload) => {
        console.log('=== REAL-TIME USER UPDATE ===');
        console.log('User payload:', payload);
        const updatedUserData = payload.new;
        
        // Fetch enrollment data
        const { data: enrollment } = await supabase
          .from('student_enrollments')
          .select('*')
          .eq('user_id', userId)
          .eq('class_id', classId)
          .single();

        // Fetch latest bid data for this class
        const { data: latestBids } = await supabase
          .from('bids')
          .select(`
            id,
            opportunity_id,
            is_winner,
            bid_status,
            opportunities!inner(class_id)
          `)
          .eq('user_id', userId)
          .eq('opportunities.class_id', classId);

        if (enrollment) {
          // Check if student has placed bids by checking token status
          const hasPlacedBids = enrollment.token_status === 'used';

          const student: Student = {
            id: updatedUserData.id,
            name: updatedUserData.name,
            email: updatedUserData.email,
            studentNumber: updatedUserData.student_number || '',
            hasUsedToken: enrollment.tokens_remaining <= 0,
            hasBid: hasPlacedBids,
            tokensRemaining: enrollment.tokens_remaining,
            tokenStatus: enrollment.token_status,
            biddingResult: enrollment.bidding_result
          };
          
          console.log('=== USER UPDATE - CALLING onUpdate ===');
          console.log('Updated student from user change:', student);
          onUpdate(student);
        }
      }
    )
    .subscribe();

  console.log('=== REAL-TIME SUBSCRIPTION ESTABLISHED ===');
  
  return () => {
    console.log('=== UNSUBSCRIBING FROM REAL-TIME UPDATES ===');
    supabase.removeChannel(channel);
  };
}