import { useState, useEffect, useCallback } from 'react'
import { submitStudentBid, withdrawStudentBid, StudentBidRequest, StudentBidResponse, WithdrawBidRequest, WithdrawBidResponse } from '@/lib/studentBidService'
import { Student } from '@/types'
import { useToast } from '@/hooks/use-toast'

interface StudentBiddingState {
  isSubmitting: boolean
  isWithdrawing: boolean
  lastBidResponse: StudentBidResponse | null
  lastWithdrawResponse: WithdrawBidResponse | null
  error: string | null
}

export const useStudentBidding = () => {
  const [state, setState] = useState<StudentBiddingState>({
    isSubmitting: false,
    isWithdrawing: false,
    lastBidResponse: null,
    lastWithdrawResponse: null,
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

  // Withdraw a bid
  const withdrawBid = useCallback(async (request: WithdrawBidRequest): Promise<WithdrawBidResponse> => {
    setState(prev => ({
      ...prev,
      isWithdrawing: true,
      error: null
    }))

    try {
      const response = await withdrawStudentBid(request)
      
      setState(prev => ({
        ...prev,
        isWithdrawing: false,
        lastWithdrawResponse: response,
        error: response.success ? null : response.errorMessage || 'Bid withdrawal failed'
      }))

      if (response.success) {
        toast({
          title: "Bid Withdrawn Successfully",
          description: "Your bid has been withdrawn and your token has been restored",
        })
      } else {
        toast({
          title: "Bid Withdrawal Failed",
          description: response.errorMessage || 'Failed to withdraw your bid',
          variant: "destructive",
        })
      }

      return response
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unexpected error'
      
      setState(prev => ({
        ...prev,
        isWithdrawing: false,
        error: errorMessage
      }))

      toast({
        title: "Bid Withdrawal Error",
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
    submitBid,
    withdrawBid
  }
}