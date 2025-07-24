import { useState } from "react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Shield, Clock, CheckCircle, AlertTriangle, Coins } from "lucide-react";
import { toast } from "sonner";
import { Student, ClassConfig, BidOpportunity } from "@/types";
import { useStudentBidding } from "@/hooks/useStudentBidding";
import { formatDate, getBidOpportunityStatus, isBidOpportunityOpen } from "@/utils/dates";
import { supabase } from "@/lib/supabase";

interface EnhancedBidCardProps {
  student: Student;
  classConfig: ClassConfig;
  onBidSubmitted?: (bidId: string, updatedStudent: Student, opportunityId: string) => void;
}

const EnhancedBidCard = ({ student, classConfig, onBidSubmitted }: EnhancedBidCardProps) => {
  const [activeTab, setActiveTab] = useState("opportunity-0");
  const [currentStudent, setCurrentStudent] = useState<Student>(student);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const { isSubmitting, lastBidResponse, error, submitBid } = useStudentBidding();
  
  const bidOpportunities = classConfig.bidOpportunities || [];

  // Fetch real-time student status from database
  useEffect(() => {
    const fetchStudentStatus = async () => {
      if (!student?.id || !classConfig?.id) return;
      
      setIsLoadingStatus(true);
      try {
        const { data: enrollment, error } = await supabase
          .from('student_enrollments')
          .select('*')
          .eq('user_id', student.id)
          .eq('class_id', classConfig.id)
          .single();

        if (enrollment && !error) {
          const updatedStudent: Student = {
            ...student,
            hasUsedToken: enrollment.tokens_remaining <= 0,
            hasBid: enrollment.token_status === 'used',
            tokensRemaining: enrollment.tokens_remaining,
            tokenStatus: enrollment.token_status,
            biddingResult: enrollment.bidding_result
          };
          
          console.log('=== ENHANCED BID CARD STATUS UPDATE ===');
          console.log('Database enrollment:', enrollment);
          console.log('Updated student for bid card:', updatedStudent);
          
          setCurrentStudent(updatedStudent);
        }
      } catch (error) {
        console.error('Error fetching student status in bid card:', error);
      } finally {
        setIsLoadingStatus(false);
      }
    };

    fetchStudentStatus();

    // Set up real-time subscription for this component
    const channel = supabase
      .channel(`student-enrollment-${student.id}-${classConfig.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'student_enrollments',
          filter: `user_id=eq.${student.id}.and.class_id=eq.${classConfig.id}`,
        },
        (payload) => {
          console.log('=== BID CARD REAL-TIME UPDATE ===');
          console.log('Payload:', payload);
          
          const updatedData = payload.new;
          const updatedStudent: Student = {
            ...student,
            hasUsedToken: updatedData.tokens_remaining <= 0,
            hasBid: updatedData.token_status === 'used',
            tokensRemaining: updatedData.tokens_remaining,
            tokenStatus: updatedData.token_status,
            biddingResult: updatedData.bidding_result
          };
          
          setCurrentStudent(updatedStudent);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [student.id, classConfig.id]);

  // Update currentStudent when prop changes
  useEffect(() => {
    setCurrentStudent(student);
  }, [student]);

  const handleSubmitBid = async (opportunityId: string) => {
    console.log('=== FRONTEND BID SUBMISSION STARTED ===');
    console.log('Current student:', currentStudent);
    console.log('Opportunity ID:', opportunityId);
    console.log('Student has used token:', currentStudent?.hasUsedToken === true);
    
    if (!currentStudent || currentStudent.hasUsedToken === true) return;

    // Find the specific opportunity
    const opportunity = bidOpportunities.find(opp => opp.id === opportunityId);
    if (!opportunity) {
      toast.error("Opportunity not found");
      return;
    }

    // Check if opportunity is open for bidding
    if (!isBidOpportunityOpen(opportunity)) {
      toast.error("This opportunity is not currently open for bidding");
      return;
    }

    // Check if student has already bid on this opportunity
    const hasStudentBid = opportunity.bidders?.some(bidder => bidder.id === currentStudent.id);
    if (hasStudentBid) {
      toast.error("You have already placed a bid on this opportunity");
      return;
    }

    const response = await submitBid({
      userId: currentStudent.id,
      opportunityId
    });

    console.log('=== BID SUBMISSION RESPONSE ===');
    console.log('Response:', response);

    if (response.success && response.bidId && response.updatedStudent) {
      console.log('=== BID SUBMISSION SUCCESSFUL ===');
      console.log('Calling onBidSubmitted callback');
      
      // Update local state immediately
      if (response.updatedStudent) {
        setCurrentStudent(response.updatedStudent);
      }
      
      // Add a small delay to ensure database changes are propagated
      setTimeout(() => {
        console.log('=== TRIGGERING ADMIN DASHBOARD REFRESH ===');
        // This will trigger real-time updates in the admin dashboard
        window.dispatchEvent(new CustomEvent('bidSubmitted', {
          detail: { opportunityId, studentId: currentStudent.id }
        }));
      }, 500);
      
      onBidSubmitted?.(response.bidId, response.updatedStudent || currentStudent, opportunityId);
    } else {
      console.log('=== BID SUBMISSION FAILED ===');
      console.log('Error:', response.errorMessage);
    }
  };

  if (bidOpportunities.length === 0) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl font-heading">{classConfig.rewardTitle}</CardTitle>
          <CardDescription>{classConfig.rewardDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center py-4">No bid opportunities available at this time.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-xl font-heading flex items-center gap-2">
          <Coins className="w-5 h-5" />
          {classConfig.rewardTitle}
      </CardHeader>
      
      <CardContent>
        {/* Token Status Display */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-medium">Your Token Status:</span>
            {isLoadingStatus ? (
              <Badge variant="outline" className="animate-pulse">
                Loading...
              </Badge>
            ) : currentStudent?.hasUsedToken === true || currentStudent?.tokenStatus === 'used' ? (
              <Badge variant="secondary" className="bg-red-100 text-red-800">
                Token Unavailable
              </Badge>
            ) : (
              <Badge className="bg-green-100 text-green-800">
                Token Available
              </Badge>
            )}
          </div>
          
          {/* Real-time Status Indicator */}
          <div className="p-3 bg-gray-50 rounded-md">
            <div className="flex items-center gap-2 mb-2">
              {/* Enhanced Token Status Display */}
              {currentStudent?.tokenStatus === 'used' || currentStudent?.hasUsedToken === true ? (
                <Badge variant="secondary" className="bg-red-100 text-red-800 animate-pulse">
                  Token Used
                </Badge>
              ) : (
                <Badge className="bg-green-100 text-green-800">
                  Token Available
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              User: {currentStudent?.name} | 
              Status: {currentStudent?.tokenStatus === 'used' || currentStudent?.hasUsedToken === true ? 'Token Used' : 'Ready to Bid'}
              {currentStudent?.tokensRemaining !== undefined && (
                <span> | Tokens: {currentStudent.tokensRemaining}</span>
              )}
              {/* Display bidding result if available */}
              {currentStudent?.biddingResult && currentStudent.biddingResult !== 'pending' && (
                <span> | Result: {currentStudent.biddingResult === 'won' ? 'Selected' : 'Not Selected'}</span>
              )}
            </div>
          </div>
        </div>

        {/* Bid Opportunities Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-5 mb-4">
            {bidOpportunities.map((opportunity, index) => (
              <TabsTrigger key={opportunity.id} value={`opportunity-${index}`}>
                #{index + 1}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {bidOpportunities.map((opportunity, index) => {
            const hasStudentBid = opportunity.bidders?.some(bidder => bidder.id === currentStudent?.id);
            const isStudentSelected = opportunity.selectedStudents?.some(s => s.id === currentStudent?.id);
            const canSubmitBid = currentStudent?.hasUsedToken !== true && 
                               getBidOpportunityStatus(opportunity) === "Open for Bidding" &&
                               !hasStudentBid;

            return (
              <TabsContent key={opportunity.id} value={`opportunity-${index}`}>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium text-lg">{opportunity.title}</h3>
                    <p className="text-sm text-muted-foreground">{opportunity.description}</p>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Event Date:</span>
                    <span className="font-medium">{formatDate(opportunity.date)}</span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Status:</span>
                    {/* Your Result Column - Display bidding outcome */}
                    {hasStudentBid ? (
                      <div className="flex items-center gap-2">
                        {currentStudent.biddingResult === 'won' ? (
                          <Badge className="bg-green-500 text-white">
                            🎉 Selected
                          </Badge>
                        ) : currentStudent.biddingResult === 'lost' ? (
                          <Badge variant="secondary" className="bg-red-100 text-red-800">
                            Not Selected
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
                            Pending Selection
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-gray-400">
                        No Bid
                      </Badge>
                    )}
                  </div>
                  <div>
                    <Badge variant={getBidOpportunityStatus(opportunity) === "Open for Bidding" ? "default" : "secondary"}>
                      {getBidOpportunityStatus(opportunity)}
                    </Badge>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Capacity:</span>
                    <Badge variant="outline">{opportunity.capacity || classConfig.capacity} students</Badge>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Current Bids:</span>
                    <Badge variant="outline">{opportunity.bidders?.length || 0} students</Badge>
                  </div>
                  
                  {/* Bid Status */}
                  {hasStudentBid && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Your Result:</span>
                      {/* Enhanced Result Display with Real-time Updates */}
                      {currentStudent?.biddingResult === 'won' ? (
                        <Badge className="bg-green-500 text-white animate-bounce">
                          🎉 Selected
                        </Badge>
                      ) : currentStudent?.biddingResult === 'lost' ? (
                        <Badge variant="secondary" className="bg-red-100 text-red-800">
                          Not Selected
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-yellow-100 text-yellow-800 animate-pulse">
                          Pending Selection
                        </Badge>
                      )}
                    </div>
                  )}
                  
                  {/* Success Message */}
                  {currentStudent?.biddingResult === 'won' && hasStudentBid && (
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        🎉 Congratulations! You have been selected for this opportunity!
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {/* Error Display */}
                  {error && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  
                  {/* Recent Activity */}
                  {opportunity.bidders && opportunity.bidders.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Recent Bidders
                      </h4>
                      <div className="bg-gray-50 rounded-md p-2 max-h-20 overflow-y-auto">
                        {opportunity.bidders.slice(-3).map((bidder) => (
                          <div key={bidder.id} className="text-xs flex justify-between">
                            <span>{bidder.name}</span>
                            <span className="text-muted-foreground">
                              {bidder.id === currentStudent?.id ? 'You' : 'Recently'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Submit Button */}
                  <Button 
                    className="w-full mt-4" 
                    onClick={() => handleSubmitBid(opportunity.id)}
                    disabled={!canSubmitBid || isSubmitting || student?.tokenStatus === 'used'}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Submitting Bid...
                      </>
                    ) : hasStudentBid ? (
                      "Bid Already Submitted"
                    ) : currentStudent?.tokenStatus === 'used' || currentStudent?.hasUsedToken === true ? (
                      "Token Unavailable"
                    ) : getBidOpportunityStatus(opportunity) !== "Open for Bidding" ? (
                      "Bidding Not Open"
                    ) : (
                      "Use Token to Bid"
                    )}
                  </Button>
                </div>
              </TabsContent>
            );
    </Card>
  );
};

export default EnhancedBidCard;