import { useState } from "react";
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

interface EnhancedBidCardProps {
  student: Student;
  classConfig: ClassConfig;
  onBidSubmitted?: (bidId: string, updatedStudent: Student, opportunityId: string) => void;
}

const EnhancedBidCard = ({ student, classConfig, onBidSubmitted }: EnhancedBidCardProps) => {
  const [activeTab, setActiveTab] = useState("opportunity-0");
  const { isSubmitting, lastBidResponse, error, submitBid } = useStudentBidding();
  
  const bidOpportunities = classConfig.bidOpportunities || [];

  const handleSubmitBid = async (opportunityId: string) => {
    console.log('=== FRONTEND BID SUBMISSION STARTED ===');
    console.log('Current student:', student);
    console.log('Opportunity ID:', opportunityId);
    console.log('Student has used token:', student?.hasUsedToken === true);
    
    if (!student || student.hasUsedToken === true) return;

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
    const hasStudentBid = opportunity.bidders?.some(bidder => bidder.id === student.id);
    if (hasStudentBid) {
      toast.error("You have already placed a bid on this opportunity");
      return;
    }

    const response = await submitBid({
      userId: student.id,
      opportunityId
    });

    console.log('=== BID SUBMISSION RESPONSE ===');
    console.log('Response:', response);

    if (response.success && response.bidId && response.updatedStudent) {
      console.log('=== BID SUBMISSION SUCCESSFUL ===');
      console.log('Calling onBidSubmitted callback');
      
      // Add a small delay to ensure database changes are propagated
      setTimeout(() => {
        console.log('=== TRIGGERING ADMIN DASHBOARD REFRESH ===');
        // This will trigger real-time updates in the admin dashboard
        window.dispatchEvent(new CustomEvent('bidSubmitted', {
          detail: { opportunityId, studentId: student.id }
        }));
      }, 500);
      
      onBidSubmitted?.(response.bidId, response.updatedStudent, opportunityId);
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
        </CardTitle>
        <CardDescription>{classConfig.rewardDescription}</CardDescription>
      </CardHeader>
      
      <CardContent>
        {/* Token Status Display */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-medium">Your Token Status:</span>
            {student?.hasUsedToken === true ? (
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
              {student?.tokenStatus === 'used' || student?.hasUsedToken === true ? (
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
              User: {student?.name} | 
              Status: {student?.tokenStatus === 'used' || student?.hasUsedToken === true ? 'Token Used' : 'Ready to Bid'}
              {student?.tokensRemaining !== undefined && (
                <span> | Tokens: {student.tokensRemaining}</span>
              )}
              {/* Display bidding result if available */}
              {student?.biddingResult && student.biddingResult !== 'pending' && (
                <span> | Result: {student.biddingResult === 'won' ? 'Selected' : 'Not Selected'}</span>
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
            const hasStudentBid = opportunity.bidders?.some(bidder => bidder.id === student?.id);
            const isStudentSelected = opportunity.selectedStudents?.some(s => s.id === student?.id);
            const canSubmitBid = student?.hasUsedToken !== true && 
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
                        {student.biddingResult === 'won' ? (
                          <Badge className="bg-green-500 text-white">
                            Won
                          </Badge>
                        ) : student.biddingResult === 'lost' ? (
                          <Badge variant="secondary" className="bg-red-100 text-red-800">
                            Lost
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
                            Pending
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
                      {student?.biddingResult === 'won' ? (
                        <Badge className="bg-green-500 text-white animate-bounce">
                          🎉 Selected
                        </Badge>
                      ) : student?.biddingResult === 'lost' ? (
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
                  {student?.biddingResult === 'won' && hasStudentBid && (
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
                              {bidder.id === student?.id ? 'You' : 'Recently'}
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
                    ) : student?.tokenStatus === 'used' || student?.hasUsedToken === true ? (
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
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default EnhancedBidCard;