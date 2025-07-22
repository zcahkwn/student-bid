import { supabase } from '@/lib/supabase'
import { Student, BidOpportunity } from '@/types'

interface BidStatus {
  opportunityId: string
  opportunityDescription: string
  hasBid: boolean
  bidAmount: number
  isWinner: boolean
  bidCreatedAt?: string
}

export interface ClassBidStatistics {
  totalStudents: number
  studentsWithTokens: number
  studentsWhoBid: number
  totalBids: number
  opportunities: Array<{
    opportunityId: string
    description: string
    eventDate: string
    capacity: number
    bidCount: number
  }>
}

// Get bid count for a specific opportunity
async function getOpportunityBidCount(opportunityId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .rpc('get_opportunity_bid_count', { opportunity_uuid: opportunityId })

    if (error) throw error
    return data || 0
  } catch (error) {
    console.error('Error getting opportunity bid count:', error)
    return 0
  }
}

// Check if a student has bid on a specific opportunity
async function studentHasBid(studentId: string, opportunityId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .rpc('student_has_bid', { 
        student_uuid: studentId, 
        opportunity_uuid: opportunityId 
      })

    if (error) throw error
    return data || false
  } catch (error) {
    console.error('Error checking if student has bid:', error)
    return false
  }
}

// Get student's bid status across all opportunities in a class
async function getStudentBidStatus(studentId: string, classId: string): Promise<BidStatus[]> {
  try {
    const { data, error } = await supabase
      .rpc('get_student_bid_status', { 
        student_uuid: studentId, 
        class_uuid: classId 
      })

    if (error) throw error
    
    return (data || []).map((row: any) => ({
      opportunityId: row.opportunity_id,
      opportunityDescription: row.opportunity_description,
      hasBid: row.has_bid,
      bidAmount: row.bid_amount,
      isWinner: row.is_winner,
      bidCreatedAt: row.bid_created_at
    }))
  } catch (error) {
    console.error('Error getting student bid status:', error)
    return []
  }
}

// Get bid counts for all opportunities in a class
async function getClassOpportunityBidCounts(classId: string): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase
      .rpc('get_class_opportunity_bid_counts', { class_uuid: classId })

    if (error) throw error
    
    const bidCounts: Record<string, number> = {}
    ;(data || []).forEach((row: any) => {
      bidCounts[row.opportunity_id] = row.bid_count
    })
    
    return bidCounts
  } catch (error) {
    console.error('Error getting class opportunity bid counts:', error)
    return {}
  }
}

// Get comprehensive class bid statistics for admin dashboard
export async function getClassBidStatistics(classId: string): Promise<ClassBidStatistics> {
  try {
    console.log('=== GETTING CLASS BID STATISTICS ===')
    console.log('Class ID:', classId)
    
    // First, let's check if there are ANY bids in the entire bids table
    console.log('=== CHECKING ALL BIDS IN DATABASE ===')
    const { data: allBids, error: allBidsError } = await supabase
      .from('bids')
      .select('id, user_id, opportunity_id, bid_status, created_at')
      .limit(20)
    
    if (allBidsError) {
      console.error('Error fetching all bids:', allBidsError)
    } else {
      console.log('Sample of all bids in database:', allBids)
      console.log('Total bids found in sample:', allBids?.length || 0)
    }
    
    // Get total students enrolled in this class
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('student_enrollments')
      .select('user_id, tokens_remaining')
      .eq('class_id', classId)

    if (enrollmentsError) throw enrollmentsError

    const totalStudents = enrollments?.length || 0
    const studentsWithTokens = enrollments?.filter(e => e.tokens_remaining > 0).length || 0
    
    console.log('Enrollment stats:', { totalStudents, studentsWithTokens })

    // Get all opportunities for this class
    const { data: opportunities, error: opportunitiesError } = await supabase
      .from('opportunities')
      .select('id, description, event_date, capacity')
      .eq('class_id', classId)

    if (opportunitiesError) throw opportunitiesError
    
    console.log('Opportunities found:', opportunities?.length || 0)
    console.log('Opportunity IDs:', opportunities?.map(o => o.id) || [])

    // Get all bids for opportunities in this class - FIXED QUERY
    const opportunityIds = opportunities?.map(o => o.id) || []
    let totalBids = 0
    let studentsWhoBid = 0
    const opportunityStats: Array<{
      opportunityId: string
      description: string
      eventDate: string
      capacity: number
      bidCount: number
    }> = []

    if (opportunityIds.length > 0) {
      console.log('Fetching bids for opportunities:', opportunityIds)
      
      // Direct query to get all bids for these opportunities
      const { data: bids, error: bidsError } = await supabase
        .from('bids')
        .select('id, opportunity_id, user_id, bid_status')
        .in('opportunity_id', opportunityIds)

      if (bidsError) throw bidsError

      console.log('Raw bids data from database:', bids)
      totalBids = bids?.length || 0
      console.log('Total bids found:', totalBids)
      
      // Count unique students who have bid
      const uniqueStudentIds = new Set(bids?.map(b => b.user_id) || [])
      studentsWhoBid = uniqueStudentIds.size
      console.log('Unique students who bid:', studentsWhoBid)
      // Log each bid individually for debugging
      if (bids && bids.length > 0) {
        console.log('=== INDIVIDUAL BID DETAILS ===')
        bids.forEach((bid, index) => {
          console.log(`Bid ${index + 1}:`, {
            id: bid.id,
            user_id: bid.user_id,
            opportunity_id: bid.opportunity_id,
            bid_status: bid.bid_status,
            created_at: bid.created_at
          })
        })
      }
      
      console.log('Unique student IDs who bid:', Array.from(uniqueStudentIds))

      // Calculate bid counts per opportunity
      const bidCountsByOpportunity: Record<string, number> = {}
      bids?.forEach(bid => {
        bidCountsByOpportunity[bid.opportunity_id] = (bidCountsByOpportunity[bid.opportunity_id] || 0) + 1
      })
      
      console.log('Bid counts by opportunity:', bidCountsByOpportunity)

      // Build opportunity statistics
      opportunities?.forEach(opp => {
        const bidCount = bidCountsByOpportunity[opp.id] || 0
        console.log(`Opportunity ${opp.id}: ${bidCount} bids`)
        
        opportunityStats.push({
          opportunityId: opp.id,
          description: opp.description,
          eventDate: opp.event_date,
          capacity: opp.capacity || 7,
          bidCount: bidCount
        })
      })
    } else {
      // If no opportunities, still add them to the stats with 0 bids
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
    
    // Additional debugging: Check if there are bids for this specific class
    console.log('=== CHECKING BIDS FOR THIS CLASS SPECIFICALLY ===')
    const { data: classBids, error: classBidsError } = await supabase
      .from('bids')
      .select(`
        id, 
        user_id, 
        opportunity_id, 
        bid_status,
        opportunities!inner(class_id)
      `)
      .eq('opportunities.class_id', classId)
    
    if (classBidsError) {
      console.error('Error fetching class bids:', classBidsError)
    } else {
      console.log('Bids found for this class via join:', classBids)
      console.log('Number of class bids via join:', classBids?.length || 0)
    }
    
    const finalStats = {
      totalStudents,
      studentsWithTokens,
      studentsWhoBid,
      totalBids,
      opportunities: opportunityStats
    }
    
    console.log('=== FINAL STATISTICS ===')
    console.log('Final stats:', finalStats)
    
    return finalStats
  } catch (error) {
    console.error('Error getting class bid statistics:', error)
    return {
      totalStudents: 0,
      studentsWithTokens: 0,
      studentsWhoBid: 0,
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
  console.log('=== CREATING REAL-TIME SUBSCRIPTION ===')
  console.log('Class ID:', classId)
  
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
        console.log('=== BID TABLE CHANGE DETECTED ===')
        console.log('Refreshing statistics for class:', classId)
        // Refresh statistics when any bid changes
        const updatedStats = await getClassBidStatistics(classId)
        console.log('Updated stats after bid change:', updatedStats)
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
        console.log('=== STUDENT ENROLLMENT CHANGE DETECTED ===')
        console.log('Refreshing statistics for class:', classId)
        // Refresh when student enrollment or token status changes
        const updatedStats = await getClassBidStatistics(classId)
        console.log('Updated stats after enrollment change:', updatedStats)
        onUpdate(updatedStats)
      }
    )
    .subscribe()

  console.log('Real-time channel subscribed:', `class-bids-${classId}`)

  return () => {
    console.log('=== UNSUBSCRIBING FROM REAL-TIME UPDATES ===')
    console.log('Class ID:', classId)
    supabase.removeChannel(channel)
  }
}

// Update bid opportunities with real-time bid counts
export async function updateBidOpportunitiesWithCounts(
  opportunities: BidOpportunity[],
  classId: string
): Promise<BidOpportunity[]> {
  try {
    const bidCounts = await getClassOpportunityBidCounts(classId)
    
    return opportunities.map(opportunity => {
      const bidCount = bidCounts[opportunity.id] || 0
      
      // Create mock bidders array based on bid count
      // In a real implementation, you'd fetch actual bidder details
      const mockBidders: Student[] = Array.from({ length: bidCount }, (_, index) => ({
        id: `bidder-${opportunity.id}-${index}`,
        name: `Bidder ${index + 1}`,
        email: `bidder${index + 1}@example.com`,
        hasUsedToken: true,
        hasBid: true
      }))
      
      return {
        ...opportunity,
        bidders: mockBidders
      }
    })
  } catch (error) {
    console.error('Error updating opportunities with bid counts:', error)
    return opportunities
  }
}