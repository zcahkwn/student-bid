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

export interface WithdrawBidRequest {
  userId: string
  opportunityId: string
}

export interface WithdrawBidResponse {
  success: boolean
  updatedStudent?: Student
  errorMessage?: string
  timestamp?: string
}

// Submit a bid and update student token status
export async function submitStudentBid(request: StudentBidRequest): Promise<StudentBidResponse> {
  const { userId, opportunityId } = request;

  try {
    const { data: opportunity, error: oppError } = await supabase
      .from('opportunities')
      .select('id, class_id, title, description')
      .eq('id', opportunityId)
      .single();

    if (oppError) {
      return {
        success: false,
        errorMessage: `Opportunity not found: ${oppError.message}`
      };
    }

    const { data: enrollment, error: enrollmentError } = await supabase
      .from('student_enrollments')
      .select('*')
      .eq('user_id', userId)
      .eq('class_id', opportunity.class_id)
      .single();

    if (enrollmentError) {
      return {
        success: false,
        errorMessage: `Student not enrolled in this class: ${enrollmentError.message}`
      };
    }

    if (enrollment.tokens_remaining <= 0) {
      return {
        success: false,
        errorMessage: 'No tokens remaining'
      };
    }

    const { data: existingBid, error: bidCheckError } = await supabase
      .from('bids')
      .select('id')
      .eq('user_id', userId)
      .eq('opportunity_id', opportunityId)
      .maybeSingle();

    if (bidCheckError) {
      return {
        success: false,
        errorMessage: `Error checking existing bid: ${bidCheckError.message}`
      };
    }

    if (existingBid) {
      return {
        success: false,
        errorMessage: 'You have already placed a bid for this opportunity'
      };
    }

    const { data: result, error } = await supabase.rpc('submit_student_bid_secure', {
      p_bid_amount: 1,
      p_user_id: userId,
      p_opportunity_id: opportunityId
    });

    if (error) {
      return {
        success: false,
        errorMessage: `Bid submission failed: ${error.message}`
      };
    }

    if (!result || !result.success) {
      return {
        success: false,
        errorMessage: result?.error_message || 'Bid submission failed'
      };
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    const { data: updatedEnrollment, error: updatedEnrollmentError } = await supabase
      .from('student_enrollments')
      .select('*')
      .eq('user_id', userId)
      .eq('class_id', opportunity.class_id)
      .single();

    if (userError || updatedEnrollmentError || !user || !updatedEnrollment) {
      return {
        success: true,
        bidId: result.bid_id,
        timestamp: new Date().toISOString()
      };
    }

    const updatedStudent: Student = {
      id: user.id,
      name: user.name,
      email: user.email,
      studentNumber: user.student_number || '',
      hasUsedToken: updatedEnrollment.tokens_remaining <= 0,
      hasBid: updatedEnrollment.token_status === 'used',
      tokensRemaining: updatedEnrollment.tokens_remaining,
      tokenStatus: updatedEnrollment.token_status,
      biddingResult: updatedEnrollment.bidding_result
    };

    return {
      success: true,
      bidId: result.bid_id,
      updatedStudent: updatedStudent,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error during bid submission:', error);
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unexpected error occurred'
    };
  }
}

// Withdraw a bid and restore student token status
export async function withdrawStudentBid(request: WithdrawBidRequest): Promise<WithdrawBidResponse> {
  const { userId, opportunityId } = request;

  try {
    const { data: opportunity, error: oppError } = await supabase
      .from('opportunities')
      .select('id, class_id, title, description')
      .eq('id', opportunityId)
      .single();

    if (oppError) {
      return {
        success: false,
        errorMessage: `Opportunity not found: ${oppError.message}`
      };
    }

    const { data: existingBid, error: bidCheckError } = await supabase
      .from('bids')
      .select('id')
      .eq('user_id', userId)
      .eq('opportunity_id', opportunityId)
      .maybeSingle();

    if (bidCheckError) {
      return {
        success: false,
        errorMessage: `Error checking existing bid: ${bidCheckError.message}`
      };
    }

    if (!existingBid) {
      return {
        success: false,
        errorMessage: 'No bid found to withdraw'
      };
    }

    const { data: result, error } = await supabase.rpc('withdraw_bid_secure', {
      p_user_id: userId,
      p_opportunity_id: opportunityId
    });

    if (error) {
      return {
        success: false,
        errorMessage: `Bid withdrawal failed: ${error.message}`
      };
    }

    if (!result || !result.success) {
      return {
        success: false,
        errorMessage: result?.error || 'Bid withdrawal failed'
      };
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    const { data: updatedEnrollment, error: updatedEnrollmentError } = await supabase
      .from('student_enrollments')
      .select('*')
      .eq('user_id', userId)
      .eq('class_id', opportunity.class_id)
      .single();

    if (userError || updatedEnrollmentError || !user || !updatedEnrollment) {
      return {
        success: true,
        timestamp: new Date().toISOString()
      };
    }

    const updatedStudent: Student = {
      id: user.id,
      name: user.name,
      email: user.email,
      studentNumber: user.student_number || '',
      hasUsedToken: updatedEnrollment.tokens_remaining <= 0,
      hasBid: updatedEnrollment.token_status === 'used',
      tokensRemaining: updatedEnrollment.tokens_remaining,
      tokenStatus: updatedEnrollment.token_status,
      biddingResult: updatedEnrollment.bidding_result
    };

    return {
      success: true,
      updatedStudent: updatedStudent,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error during bid withdrawal:', error);
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unexpected error occurred'
    };
  }
}

// Get real-time user status for a specific class
export async function getUserStatus(userId: string, classId: string): Promise<Student | null> {
  try {
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

    const hasAnyBids = bids && bids.length > 0;

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

          onUpdate(student);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}