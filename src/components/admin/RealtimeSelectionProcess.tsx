import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Users, Trophy, Activity, RefreshCw, Clock, User } from "lucide-react";
import { ClassConfig, Student } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/utils/dates";
import { supabase } from "@/lib/supabase";
import { updateSelectionResults, resetOpportunitySelection } from "@/lib/classService";

interface RealtimeSelectionProcessProps {
  currentClass: ClassConfig;
  onSelectionComplete: (selectedStudents: Student[], opportunityId?: string) => void;
}

interface OpportunityBidCount {
  opportunityId: string;
  bidCount: number;
  lastUpdated: string;
}

interface BidderInfo {
  id: string;
  name: string;
  email: string;
  studentNumber?: string;
  bidTimestamp: string;
  bidStatus: string;
}

const RealtimeSelectionProcess = ({ 
  currentClass, 
  onSelectionComplete 
}: RealtimeSelectionProcessProps) => {
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [bidCounts, setBidCounts] = useState<Record<string, OpportunityBidCount>>({});
  const [bidders, setBidders] = useState<Record<string, BidderInfo[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const { toast } = useToast();
  
  const bidOpportunities = currentClass.bidOpportunities || [];

  // Initialize with first opportunity
  useEffect(() => {
    if (bidOpportunities.length > 0 && !selectedOpportunityId) {
      setSelectedOpportunityId(bidOpportunities[0].id);
    }
  }, [bidOpportunities, selectedOpportunityId]);

  // Load selected students from currentClass when opportunity changes
  useEffect(() => {
    if (selectedOpportunityId && currentClass.bidOpportunities) {
      const selectedOpportunity = currentClass.bidOpportunities.find(
        opp => opp.id === selectedOpportunityId
      );
      
      if (selectedOpportunity && selectedOpportunity.selectedStudents) {
        console.log('Loading selected students from database:', selectedOpportunity.selectedStudents);
        setSelectedStudents(selectedOpportunity.selectedStudents);
      } else {
        setSelectedStudents([]);
      }
    }
  }, [selectedOpportunityId, currentClass.bidOpportunities]);
  // Fetch bidders for a specific opportunity
  const fetchBiddersForOpportunity = async (opportunityId: string) => {
    try {
      // First, get all bids for this opportunity
      const { data: bids, error: bidsError } = await supabase
        .from('bids')
        .select(`
          id,
          user_id,
          bid_status,
          submission_timestamp
        `)
        .eq('opportunity_id', opportunityId)
        .order('submission_timestamp', { ascending: false });

      if (bidsError) {
        console.error(`Error fetching bids for opportunity ${opportunityId}:`, bidsError);
        return [];
      }

      if (!bids || bids.length === 0) {
        return [];
      }

      // Get unique user IDs
      const userIds = [...new Set(bids.map(bid => bid.user_id))];

      // Fetch user details separately
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, name, email, student_number')
        .in('id', userIds);

      if (usersError) {
        console.error(`Error fetching users for opportunity ${opportunityId}:`, usersError);
        return [];
      }

      // Create a map of user details for quick lookup
      const userMap = new Map(users?.map(user => [user.id, user]) || []);

      // Combine bid and user data
      return bids.map(bid => {
        const user = userMap.get(bid.user_id);
        return {
          id: user?.id || bid.user_id,
          name: user?.name || 'Unknown User',
          email: user?.email || '',
          studentNumber: user?.student_number,
          bidTimestamp: bid.submission_timestamp,
          bidStatus: bid.bid_status
        };
      }).filter(bidder => bidder.name !== 'Unknown User'); // Filter out users not found
    } catch (error) {
      console.error('Error fetching bidders:', error);
      return [];
    }
  };

  // Fetch bid counts for all opportunities
  const fetchBidCounts = async () => {
    if (bidOpportunities.length === 0) {
      setIsLoading(false);
      return;
    }

    try {
      const counts: Record<string, OpportunityBidCount> = {};
      const allBidders: Record<string, BidderInfo[]> = {};
      
      for (const opportunity of bidOpportunities) {
        // Get bids for this opportunity
        const { data: bids, error: bidsError } = await supabase
          .from('bids')
          .select(`
            id, 
            submission_timestamp,
            bid_status,
            user_id
          `)
          .eq('opportunity_id', opportunity.id);

        if (bidsError) {
          console.error(`Error fetching bids for opportunity ${opportunity.id}:`, bidsError);
          continue;
        }

        const bidCount = bids?.length || 0;
        counts[opportunity.id] = {
          opportunityId: opportunity.id,
          bidCount,
          lastUpdated: new Date().toISOString()
        };

        if (bidCount > 0) {
          // Get unique user IDs for this opportunity
          const userIds = [...new Set(bids!.map(bid => bid.user_id))];

          // Fetch user details
          const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id, name, email, student_number')
            .in('id', userIds);

          if (usersError) {
            console.error(`Error fetching users for opportunity ${opportunity.id}:`, usersError);
            allBidders[opportunity.id] = [];
            continue;
          }

          // Create user map for quick lookup
          const userMap = new Map(users?.map(user => [user.id, user]) || []);

          // Combine bid and user data
          allBidders[opportunity.id] = bids!.map(bid => {
            const user = userMap.get(bid.user_id);
            return {
              id: user?.id || bid.user_id,
              name: user?.name || 'Unknown User',
              email: user?.email || '',
              studentNumber: user?.student_number,
              bidTimestamp: bid.submission_timestamp,
              bidStatus: bid.bid_status
            };
          }).filter(bidder => bidder.name !== 'Unknown User');
        } else {
          allBidders[opportunity.id] = [];
        }
      }

      setBidCounts(counts);
      setBidders(allBidders);
    } catch (error) {
      console.error('Error fetching bid counts:', error);
      toast({
        title: "Error Loading Data",
        description: "Failed to fetch bid counts from database",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Subscribe to real-time bid updates
  useEffect(() => {
    if (bidOpportunities.length === 0) return;

    const channels = bidOpportunities.map(opportunity => {
      const channel = supabase
        .channel(`bids-${opportunity.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bids',
            filter: `opportunity_id=eq.${opportunity.id}`,
          },
          async (payload) => {
            console.log('Real-time bid update:', payload);
            
            // Update bid counts
            setBidCounts(prev => {
              const current = prev[opportunity.id] || { opportunityId: opportunity.id, bidCount: 0, lastUpdated: '' };
              
              let newCount = current.bidCount;
              if (payload.eventType === 'INSERT') {
                newCount += 1;
                toast({
                  title: "New Bid Placed",
                  description: `A student has placed a bid for ${opportunity.title}`,
                });
              } else if (payload.eventType === 'DELETE') {
                newCount = Math.max(0, newCount - 1);
                toast({
                  title: "Bid Removed",
                  description: `A bid was removed from ${opportunity.title}`,
                });
              }
              
              return {
                ...prev,
                [opportunity.id]: {
                  opportunityId: opportunity.id,
                  bidCount: newCount,
                  lastUpdated: new Date().toISOString()
                }
              };
            });

            // Refresh bidders list for this opportunity
            try {
              const updatedBidders = await fetchBiddersForOpportunity(opportunity.id);
              setBidders(prev => ({
                ...prev,
                [opportunity.id]: updatedBidders
              }));
            } catch (error) {
              console.error('Error refreshing bidders after real-time update:', error);
            }
          }
        )
        .subscribe();

      return channel;
    });

    // Initial fetch
    fetchBidCounts();

    return () => {
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [bidOpportunities, toast]);

  // Manual refresh function
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchBidCounts();
    setIsRefreshing(false);
    toast({
      title: "Data Refreshed",
      description: "Bid counts have been updated from the database",
    });
  };

  // Start random selection process
  const startSelection = async () => {
    if (!selectedOpportunityId) {
      toast({
        title: "No Opportunity Selected",
        description: "Please select a bidding opportunity first",
        variant: "destructive",
      });
      return;
    }

    const currentBidCount = bidCounts[selectedOpportunityId]?.bidCount || 0;
    
    if (currentBidCount === 0) {
      toast({
        title: "No Bids Available",
        description: "No students have placed bids for this opportunity yet",
        variant: "destructive",
      });
      return;
    }

    setIsSelecting(true);

    try {
      // Use the already fetched bidders data
      const currentBidders = bidders[selectedOpportunityId] || [];
      const biddersAsStudents: Student[] = currentBidders.map(bidder => ({
        id: bidder.id,
        name: bidder.name,
        email: bidder.email,
        studentNumber: bidder.studentNumber,
        hasUsedToken: true,
        hasBid: true
      }));

      // Simulate selection process with animation
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Random selection
      const selectedOpportunity = bidOpportunities.find(opp => opp.id === selectedOpportunityId);
      const capacity = selectedOpportunity?.capacity || currentClass.capacity;
      const selectedCount = Math.min(capacity, biddersAsStudents.length);
      const shuffled = [...biddersAsStudents].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, selectedCount);

      setSelectedStudents(selected);
      onSelectionComplete(selected, selectedOpportunityId);

      // Update selection results in the database
      try {
        const selectedStudentIds = selected.map(s => s.id);
        const allBidderIds = biddersAsStudents.map(s => s.id);
        
        await updateSelectionResults(
          selectedOpportunityId,
          currentClass.id,
          selectedStudentIds,
          allBidderIds
        );
        
        console.log('Selection results successfully updated in database');
        
        // Refresh bidder data to reflect updated bid_status from database
        console.log('=== REFRESHING BIDDER DATA AFTER SELECTION ===');
        await fetchBidCounts();
        
        console.log('Bidder data refreshed successfully');
      } catch (updateError) {
        console.error('Error updating selection results in database:', updateError);
        toast({
          title: "Database Update Warning",
          description: "Selection completed but failed to update database records. Please check the console for details.",
          variant: "destructive",
        });
      }

      toast({
        title: "Selection Complete",
        description: `${selected.length} student${selected.length !== 1 ? 's' : ''} selected successfully`,
      });

    } catch (error) {
      console.error('Selection error:', error);
      toast({
        title: "Selection Failed",
        description: "An error occurred during the selection process",
        variant: "destructive",
      });
    } finally {
      setIsSelecting(false);
    }
  };

  const resetSelection = async () => {
    if (selectedOpportunityId) {
      setIsSelecting(true);
      try {
        console.log('=== STARTING SELECTION RESET ===');
        console.log('Opportunity ID:', selectedOpportunityId);
        
        await resetOpportunitySelection(selectedOpportunityId);
        
        console.log('=== DATABASE RESET COMPLETED ===');
        
        // Clear local state after successful database reset
        setSelectedStudents([]);
        
        // Refresh data from database to ensure consistency
        await fetchBidCounts();
        
        // Notify parent component of the reset
        onSelectionComplete([], selectedOpportunityId);
        
        toast({
          title: "Selection Reset",
          description: "Selection has been cleared and all student results reset to pending.",
        });
        
      } catch (error) {
        console.error('Error resetting selection:', error);
        toast({
          title: "Reset Failed",
          description: error instanceof Error ? error.message : "An unexpected error occurred during reset",
          variant: "destructive",
        });
      } finally {
        setIsSelecting(false);
      }
    }
  };

  const selectedOpportunity = bidOpportunities.find(opp => opp.id === selectedOpportunityId);
  const currentBidCount = selectedOpportunityId ? (bidCounts[selectedOpportunityId]?.bidCount || 0) : 0;
  const currentBidders = selectedOpportunityId ? (bidders[selectedOpportunityId] || []) : [];

  if (bidOpportunities.length === 0) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="text-xl mb-4">No Bidding Opportunities</h2>
            <p className="text-muted-foreground">
              Create some bidding opportunities first to run the selection process.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Opportunity Selection */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl font-heading flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              Selection Process - Real-time Monitoring
            </CardTitle>
          </div>
          <Button 
            onClick={handleRefresh} 
            disabled={isRefreshing || isLoading}
            variant="outline"
            size="sm"
          >
            {isRefreshing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              Select Bidding Opportunity:
            </label>
            <Select 
              value={selectedOpportunityId || ''} 
              onValueChange={setSelectedOpportunityId}
              disabled={isLoading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a bidding opportunity" />
              </SelectTrigger>
              <SelectContent>
                {bidOpportunities.map((opportunity) => {
                  const bidCount = bidCounts[opportunity.id]?.bidCount || 0;
                  return (
                    <SelectItem key={opportunity.id} value={opportunity.id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{opportunity.title} - {formatDate(opportunity.date)}</span>
                        <Badge variant="outline" className="ml-2">
                          {isLoading ? '...' : `${bidCount} bids`}
                        </Badge>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Selected Opportunity Details */}
          {selectedOpportunity && (
            <div className="p-4 bg-gray-50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-lg">{selectedOpportunity.title}</h3>
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-500" />
                  <Badge variant="default" className="animate-pulse">
                    {isLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      `${currentBidCount} Live Bids`
                    )}
                  </Badge>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Event Date:</span>
                  <div className="font-medium">{formatDate(selectedOpportunity.date)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Capacity:</span>
                  <div className="font-medium">{selectedOpportunity.capacity || currentClass.capacity} students</div>
                </div>
              </div>

              <div className="text-sm">
                <span className="text-muted-foreground">Description:</span>
                <div className="mt-1">{selectedOpportunity.description}</div>
              </div>

              {/* Real-time Status */}
              <Alert>
                <Users className="h-4 w-4" />
                <AlertDescription>
                  <strong>{currentBidCount} student{currentBidCount !== 1 ? 's' : ''}</strong> {currentBidCount === 1 ? 'has' : 'have'} placed bids for this opportunity.
                  {currentBidCount > (selectedOpportunity.capacity || currentClass.capacity) ? (
                    <span className="text-blue-600 font-medium"> Random selection will be required.</span>
                  ) : currentBidCount > 0 ? (
                    <span className="text-green-600 font-medium"> All bidders can be selected.</span>
                  ) : (
                    <span className="text-gray-600"> Waiting for bids...</span>
                  )}
                </AlertDescription>
              </Alert>

              {/* Live Bidders List */}
              {currentBidders.length > 0 && (
                <div className="mt-4 p-4 bg-white rounded-md border">
                  <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Students Who Have Placed Bids ({currentBidders.length})
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {currentBidders.map((bidder, index) => (
                      <div 
                        key={bidder.id} 
                        className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs font-medium text-blue-600">
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-medium">{bidder.name}</div>
                            <div className="text-xs text-gray-500">{bidder.email}</div>
                            {bidder.studentNumber && (
                              <div className="text-xs text-gray-400">ID: {bidder.studentNumber}</div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge 
                            variant="outline" 
                            className={`text-xs mt-1 ${
                              selectedStudents.length === 0 || !selectedStudents.some(s => s.id === bidder.id)
                                ? selectedStudents.length === 0 
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                                : 'bg-green-100 text-green-800'
                            }`}
                          >
                            {selectedStudents.length === 0 || !selectedStudents.some(s => s.id === bidder.id)
                              ? selectedStudents.length === 0 ? 'pending' : 'rejected'
                              : 'selected'
                            }
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {bidCounts[selectedOpportunity.id]?.lastUpdated && (
                <div className="text-xs text-muted-foreground">
                  Last updated: {new Date(bidCounts[selectedOpportunity.id].lastUpdated).toLocaleTimeString()}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selection Controls */}
      <div className="text-center space-y-6">
        {selectedStudents.length === 0 ? (
          <Button 
            onClick={startSelection} 
            disabled={isSelecting || currentBidCount === 0 || !selectedOpportunityId}
            size="lg"
            className="px-12 py-6 text-xl font-semibold bg-blue-600 hover:bg-blue-700 shadow-lg"
          >
            {isSelecting ? (
              <>
                <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                Selecting Students...
              </>
            ) : (
              <>
                <Trophy className="w-6 h-6 mr-3" />
                Start Random Selection
              </>
            )}
          </Button>
        ) : (
          <Button 
            onClick={resetSelection}
            variant="outline"
            size="lg"
            className="px-12 py-6 text-xl font-semibold"
          >
            Reset Selection
          </Button>
        )}
      </div>

      {/* Selected Students Display */}
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold flex items-center justify-center gap-2">
            <Users className="w-6 h-6" />
            Selected Students
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedStudents.length > 0 ? (
            <div className="space-y-4">
              {selectedStudents.map((student) => (
                <div 
                  key={student.id} 
                  className="p-6 bg-green-50 border-2 border-green-200 rounded-lg text-center"
                >
                  <div className="text-2xl font-bold text-green-800 mb-2">
                    🎉 {student.name}
                  </div>
                  <div className="text-lg text-green-600 mb-1">
                    {student.email}
                  </div>
                  {student.studentNumber && (
                    <div className="text-sm text-green-500">
                      Student #: {student.studentNumber}
                    </div>
                  )}
                </div>
              ))}
              
              <div className="text-center pt-4">
                <p className="text-lg font-medium text-gray-700">
                  🎊 Congratulations! {selectedStudents.length} student{selectedStudents.length !== 1 ? 's have' : ' has'} been selected!
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🎯</div>
              <p className="text-xl text-gray-500 mb-2">
                No students selected yet
              </p>
              <p className="text-gray-400">
                Select an opportunity and click "Start Random Selection" to begin
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RealtimeSelectionProcess;