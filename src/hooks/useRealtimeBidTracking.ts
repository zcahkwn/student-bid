import { useState, useEffect, useCallback } from 'react'
import { 
  getClassBidStatistics, 
  subscribeToClassBidUpdates, 
  ClassBidStatistics 
} from '@/lib/bidTrackingService'
import { supabase } from '@/lib/supabase'

export const useRealtimeBidTracking = (classId: string | null) => {
  const [statistics, setStatistics] = useState<ClassBidStatistics>({
    totalStudents: 0,
    studentsWithTokens: 0,
    studentsWhoBid: 0,
    totalBids: 0,
    opportunities: []
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch initial statistics
  const fetchStatistics = useCallback(async () => {
    if (!classId) return

    try {
      setIsLoading(true)
      setError(null)
      console.log('=== FETCHING BID STATISTICS ===')
      console.log('Class ID:', classId)
      const stats = await getClassBidStatistics(classId)
      console.log('Fetched statistics:', stats)
      setStatistics(stats)
    } catch (err) {
      console.error('Error fetching bid statistics:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch statistics')
    } finally {
      setIsLoading(false)
    }
  }, [classId])

  // Subscribe to real-time updates
  useEffect(() => {
    if (!classId) return

    console.log('=== SETTING UP REAL-TIME SUBSCRIPTION ===')
    console.log('Class ID:', classId)

    // Fetch initial data
    fetchStatistics()

    // Subscribe to real-time updates
    const unsubscribe = subscribeToClassBidUpdates(classId, (updatedStats) => {
      console.log('=== REAL-TIME STATISTICS UPDATE RECEIVED ===')
      console.log('Updated statistics:', updatedStats)
      console.log('Previous statistics:', statistics)
      setStatistics(updatedStats)
    })

    // Also subscribe to student_enrollments changes for selection updates
    const enrollmentChannel = supabase
      .channel(`class-enrollments-${classId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'student_enrollments',
          filter: `class_id=eq.${classId}`
        },
        async (payload) => {
          console.log('=== STUDENT ENROLLMENT UPDATE RECEIVED ===')
          console.log('Payload:', payload)
          
          // Refresh statistics when enrollment bidding_result changes
          if (payload.new && payload.old && 
              payload.new.bidding_result !== payload.old.bidding_result) {
            console.log('Bidding result changed, refreshing statistics')
            const refreshedStats = await getClassBidStatistics(classId)
            setStatistics(refreshedStats)
          }
        }
      )
      .subscribe()

    console.log('Real-time subscription established for class:', classId)

    return () => {
      unsubscribe()
      supabase.removeChannel(enrollmentChannel)
    }
  }, [classId, fetchStatistics])

  // Manual refresh function
  const refresh = useCallback(() => {
    console.log('=== MANUAL REFRESH TRIGGERED ===')
    fetchStatistics()
  }, [fetchStatistics])

  return {
    statistics,
    isLoading,
    error,
    refresh
  }
}