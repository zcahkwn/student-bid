import { supabase } from '@/lib/supabase'

export interface ClassBidStatistics {
  totalStudents: number
  studentsWithTokens: number
  tokensRefunded: number
  totalBids: number
  opportunities: Array<{
    opportunityId: string
    description: string
    eventDate: string
    capacity: number
    bidCount: number
  }>
}

// Get comprehensive class bid statistics for admin dashboard
export async function getClassBidStatistics(classId: string): Promise<ClassBidStatistics> {
  try {
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('student_enrollments')
      .select('user_id, tokens_remaining')
      .eq('class_id', classId)

    if (enrollmentsError) throw enrollmentsError

    const totalStudents = enrollments?.length || 0
    const studentsWithTokens = enrollments?.filter(e => e.tokens_remaining > 0).length || 0

    const { data: opportunities, error: opportunitiesError } = await supabase
      .from('opportunities')
      .select('id, description, event_date, capacity')
      .eq('class_id', classId)

    if (opportunitiesError) throw opportunitiesError

    const opportunityIds = opportunities?.map(o => o.id) || []
    let totalBids = 0
    let tokensRefunded = 0
    const opportunityStats: Array<{
      opportunityId: string
      description: string
      eventDate: string
      capacity: number
      bidCount: number
    }> = []

    if (opportunityIds.length > 0) {
      const { data: bids, error: bidsError } = await supabase
        .from('bids')
        .select('id, opportunity_id, user_id, bid_status')
        .in('opportunity_id', opportunityIds)

      if (bidsError) throw bidsError

      totalBids = bids?.length || 0
      tokensRefunded = bids?.filter(b => b.bid_status === 'auto_selected').length || 0

      const bidCountsByOpportunity: Record<string, number> = {}
      bids?.forEach(bid => {
        bidCountsByOpportunity[bid.opportunity_id] = (bidCountsByOpportunity[bid.opportunity_id] || 0) + 1
      })

      opportunities?.forEach(opp => {
        opportunityStats.push({
          opportunityId: opp.id,
          description: opp.description,
          eventDate: opp.event_date,
          capacity: opp.capacity || 7,
          bidCount: bidCountsByOpportunity[opp.id] || 0
        })
      })
    } else {
      opportunities?.forEach(opp => {
        opportunityStats.push({
          opportunityId: opp.id,
          description: opp.description,
          eventDate: opp.event_date,
          capacity: opp.capacity || 7,
          bidCount: 0
        })
      })
    }

    return {
      totalStudents,
      studentsWithTokens,
      tokensRefunded,
      totalBids,
      opportunities: opportunityStats
    }
  } catch (error) {
    console.error('Error getting class bid statistics:', error)
    return {
      totalStudents: 0,
      studentsWithTokens: 0,
      tokensRefunded: 0,
      totalBids: 0,
      opportunities: []
    }
  }
}

// Subscribe to real-time bid updates for a class
export function subscribeToClassBidUpdates(
  classId: string,
  onUpdate: (statistics: ClassBidStatistics) => void
) {
  const channel = supabase
    .channel(`class-bids-${classId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bids',
      },
      async () => {
        const updatedStats = await getClassBidStatistics(classId)
        onUpdate(updatedStats)
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'student_enrollments',
        filter: `class_id=eq.${classId}`
      },
      async () => {
        const updatedStats = await getClassBidStatistics(classId)
        onUpdate(updatedStats)
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}