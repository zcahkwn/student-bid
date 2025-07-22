import { useState, useEffect, useCallback } from 'react'
import { 
  getClassBidStatistics, 
  subscribeToClassBidUpdates, 
  ClassBidStatistics 
} from '@/lib/bidTrackingService'

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

    console.log('Real-time subscription established for class:', classId)

    return unsubscribe
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