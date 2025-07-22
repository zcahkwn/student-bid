import { useState, useEffect, useCallback } from 'react'
import { submitStudentBid, StudentBidRequest, StudentBidResponse } from '@/lib/studentBidService'
import { Student } from '@/types'
import { useToast } from '@/hooks/use-toast'

interface StudentBiddingState {
  isSubmitting: boolean
  lastBidResponse: StudentBidResponse | null
  error: string | null
}

export const useStudentBidding = () => {
  const [state, setState] = useState<StudentBiddingState>({
    isSubmitting: false,
    lastBidResponse: null,
    error: null
  })
  
  const { toast } = useToast()

  // Submit a bid
  const submitBid = useCallback(async (request: StudentBidRequest): Promise<StudentBidResponse> => {
    setState(prev => ({
      ...prev,
      isSubmitting: true,
      error: null
    }))

    try {
      const response = await submitStudentBid(request)
      
      setState(prev => ({
        ...prev,
        isSubmitting: false,
        lastBidResponse: response,
        error: response.success ? null : response.errorMessage || 'Bid submission failed'
      }))

      if (response.success) {
        toast({
          title: "Bid Submitted Successfully",
          description: "Your token has been used and your bid is recorded",
        })
      } else {
        toast({
          title: "Bid Submission Failed",
          description: response.errorMessage || 'You may not have permission to bid on this opportunity',
          variant: "destructive",
        })
      }

      return response
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unexpected error'
      
      setState(prev => ({
        ...prev,
        isSubmitting: false,
        error: errorMessage
      }))

      toast({
        title: "Bid Submission Error",
        description: errorMessage,
        variant: "destructive",
      })

      return {
        success: false,
        errorMessage
      }
    }
  }, [toast])

  return {
    ...state,
    submitBid
  }
}