import { supabase } from '@/lib/supabase'
import { BidOpportunity, ClassConfig, Student } from '@/types'
import { RealtimeChannel } from '@supabase/supabase-js'

export interface OpportunityUpdatePayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  opportunity?: BidOpportunity
  opportunityId?: string
}

export interface ClassUpdatePayload {
  classId: string
  updates: Partial<ClassConfig>
}

export interface BidActivityPayload {
  opportunityId: string
  totalBidders: number
}

async function fetchOpportunityWithBidders(opportunityId: string, classId: string): Promise<BidOpportunity | null> {
  try {
    const { data: opportunity, error: oppError } = await supabase
      .from('opportunities')
      .select('*')
      .eq('id', opportunityId)
      .maybeSingle()

    if (oppError || !opportunity) {
      console.error('Error fetching opportunity:', oppError)
      return null
    }

    const { data: bids } = await supabase
      .from('bids')
      .select(`
        id,
        user_id,
        bid_amount,
        is_winner,
        bid_status,
        submission_timestamp,
        users!inner(id, name, email, student_number)
      `)
      .eq('opportunity_id', opportunityId)

    const { data: enrollments } = await supabase
      .from('student_enrollments')
      .select('*')
      .eq('class_id', classId)

    const bidders: Student[] = (bids || []).map(bid => {
      const enrollment = enrollments?.find(e => e.user_id === bid.user_id)
      return {
        id: bid.users.id,
        name: bid.users.name,
        email: bid.users.email,
        studentNumber: bid.users.student_number || '',
        hasUsedToken: enrollment ? enrollment.tokens_remaining <= 0 : false,
        hasBid: true,
        tokensRemaining: enrollment?.tokens_remaining || 0,
        tokenStatus: enrollment?.token_status || 'unused',
        biddingResult: enrollment?.bidding_result || 'pending',
        bidStatus: bid.bid_status
      }
    })

    const { data: selectedBids } = await supabase
      .from('bids')
      .select(`
        id,
        user_id,
        users!inner(id, name, email, student_number)
      `)
      .eq('opportunity_id', opportunityId)
      .eq('is_winner', true)

    const selectedStudents: Student[] = (selectedBids || []).map(bid => {
      const enrollment = enrollments?.find(e => e.user_id === bid.user_id)
      return {
        id: bid.users.id,
        name: bid.users.name,
        email: bid.users.email,
        studentNumber: bid.users.student_number || '',
        hasUsedToken: enrollment ? enrollment.tokens_remaining <= 0 : false,
        hasBid: true,
        tokensRemaining: enrollment?.tokens_remaining || 0,
        tokenStatus: enrollment?.token_status || 'unused',
        biddingResult: enrollment?.bidding_result || 'pending'
      }
    })

    return {
      id: opportunity.id,
      title: opportunity.title,
      description: opportunity.description,
      date: opportunity.date,
      capacity: opportunity.capacity,
      biddingStartTime: opportunity.bidding_start_time,
      biddingEndTime: opportunity.bidding_end_time,
      bidders,
      selectedStudents
    }
  } catch (error) {
    console.error('Error fetching opportunity with bidders:', error)
    return null
  }
}

export function subscribeToOpportunityChanges(
  classId: string,
  onOpportunityUpdate: (payload: OpportunityUpdatePayload) => void
): () => void {
  const channel = supabase
    .channel(`opportunities-${classId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'opportunities',
        filter: `class_id=eq.${classId}`
      },
      async (payload) => {
        console.log('=== NEW OPPORTUNITY CREATED ===', payload)
        const newOpportunity = await fetchOpportunityWithBidders(payload.new.id, classId)
        if (newOpportunity) {
          onOpportunityUpdate({
            type: 'INSERT',
            opportunity: newOpportunity
          })
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'opportunities',
        filter: `class_id=eq.${classId}`
      },
      async (payload) => {
        console.log('=== OPPORTUNITY UPDATED ===', payload)
        const updatedOpportunity = await fetchOpportunityWithBidders(payload.new.id, classId)
        if (updatedOpportunity) {
          onOpportunityUpdate({
            type: 'UPDATE',
            opportunity: updatedOpportunity
          })
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'opportunities',
        filter: `class_id=eq.${classId}`
      },
      (payload) => {
        console.log('=== OPPORTUNITY DELETED ===', payload)
        onOpportunityUpdate({
          type: 'DELETE',
          opportunityId: payload.old.id
        })
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

export function subscribeToClassChanges(
  classId: string,
  onClassUpdate: (payload: ClassUpdatePayload) => void
): () => void {
  const channel = supabase
    .channel(`class-${classId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'classes',
        filter: `id=eq.${classId}`
      },
      (payload) => {
        console.log('=== CLASS UPDATED ===', payload)
        onClassUpdate({
          classId: payload.new.id,
          updates: {
            className: payload.new.name,
            capacity: payload.new.capacity,
            isArchived: payload.new.is_archived
          }
        })
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

export function subscribeToBidActivity(
  classId: string,
  onBidActivity: (payload: BidActivityPayload) => void
): () => void {
  const channel = supabase
    .channel(`bids-${classId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'bids'
      },
      async (payload) => {
        const { data: opportunity } = await supabase
          .from('opportunities')
          .select('id, class_id')
          .eq('id', payload.new.opportunity_id)
          .maybeSingle()

        if (opportunity && opportunity.class_id === classId) {
          console.log('=== BID PLACED ===', payload)
          const { count } = await supabase
            .from('bids')
            .select('*', { count: 'exact', head: true })
            .eq('opportunity_id', payload.new.opportunity_id)

          onBidActivity({
            opportunityId: payload.new.opportunity_id,
            totalBidders: count || 0
          })
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'bids'
      },
      async (payload) => {
        const { data: opportunity } = await supabase
          .from('opportunities')
          .select('id, class_id')
          .eq('id', payload.old.opportunity_id)
          .maybeSingle()

        if (opportunity && opportunity.class_id === classId) {
          console.log('=== BID WITHDRAWN ===', payload)
          const { count } = await supabase
            .from('bids')
            .select('*', { count: 'exact', head: true })
            .eq('opportunity_id', payload.old.opportunity_id)

          onBidActivity({
            opportunityId: payload.old.opportunity_id,
            totalBidders: count || 0
          })
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'bids'
      },
      async (payload) => {
        const { data: opportunity } = await supabase
          .from('opportunities')
          .select('id, class_id')
          .eq('id', payload.new.opportunity_id)
          .maybeSingle()

        if (opportunity && opportunity.class_id === classId) {
          console.log('=== BID UPDATED ===', payload)
          const { count } = await supabase
            .from('bids')
            .select('*', { count: 'exact', head: true })
            .eq('opportunity_id', payload.new.opportunity_id)

          onBidActivity({
            opportunityId: payload.new.opportunity_id,
            totalBidders: count || 0
          })
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

export function subscribeToEnrollmentDeletion(
  userId: string,
  classId: string,
  onEnrollmentDeleted: () => void
): () => void {
  const channel = supabase
    .channel(`enrollment-deletion-${userId}-${classId}`)
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'student_enrollments',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        if (payload.old.class_id === classId) {
          console.log('=== ENROLLMENT DELETED ===', payload)
          onEnrollmentDeleted()
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

export function subscribeToUserEnrollmentUpdates(
  userId: string,
  classId: string,
  onUpdate: (student: Student) => void
): () => void {
  const channel = supabase
    .channel(`user-enrollment-${userId}-${classId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'student_enrollments',
        filter: `user_id=eq.${userId}`
      },
      async (payload) => {
        if (payload.new.class_id !== classId) return

        const updatedData = payload.new

        const { data: user } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single()

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
          .eq('opportunities.class_id', classId)

        if (user) {
          const biddingResult = updatedData.bidding_result

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
          }

          onUpdate(student)
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${userId}`
      },
      async (payload) => {
        const updatedUserData = payload.new

        const { data: enrollment } = await supabase
          .from('student_enrollments')
          .select('*')
          .eq('user_id', userId)
          .eq('class_id', classId)
          .single()

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
          .eq('opportunities.class_id', classId)

        if (enrollment) {
          const hasPlacedBids = enrollment.token_status === 'used'

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
          }

          onUpdate(student)
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
