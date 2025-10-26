import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClassConfig, BidOpportunity } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { formatDate, getBidOpportunityStatus } from "@/utils/dates";
import EditBidOpportunityDialog from "@/components/admin/EditBidOpportunityDialog";
import { useRealtimeBidTracking } from "@/hooks/useRealtimeBidTracking";
import { Trash2, Users, Coins, Plus, Edit, Eye, EyeOff, Loader2, RefreshCw, Archive, History } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { createBidOpportunity, deleteBidOpportunity } from "@/lib/classService";
import { supabase } from "@/lib/supabase";

interface DashboardProps {
  classes: ClassConfig[];
  archivedClasses: ClassConfig[];
  currentClass: ClassConfig | null;
  isViewingArchived?: boolean;
  onSelectClass: (classId: string) => void;
  onCreateClass: () => void;
  onUpdateOpportunity: (opportunityId: string, updatedOpportunity: BidOpportunity) => void;
  onRemoveClass?: (classId: string) => void;
  onChangePassword?: (classId: string, newPassword: string) => void;
  onArchiveClass?: (classId: string, isArchived: boolean) => void;
  onOpportunityCreated?: (opportunity: BidOpportunity) => void;
  onOpportunityDeleted?: (opportunityId: string) => void;
}

const Dashboard = ({ 
  classes, 
  archivedClasses,
  currentClass, 
  isViewingArchived = false,
  onSelectClass, 
  onCreateClass,
  onUpdateOpportunity,
  onRemoveClass,
  onChangePassword,
  onArchiveClass,
  onOpportunityCreated,
  onOpportunityDeleted
}: DashboardProps) => {
  const { toast } = useToast();
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [editingOpportunity, setEditingOpportunity] = useState<BidOpportunity | null>(null);
  const [showCreateOpportunityDialog, setShowCreateOpportunityDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
  const [opportunityBidders, setOpportunityBidders] = useState<Record<string, Array<{
    id: string;
    name: string;
    email: string;
    studentNumber?: string;
    bidTimestamp: string;
  }>>>({});
  
  // Create opportunity form state
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState<Date | undefined>(undefined);
  const [bidOpenDate, setBidOpenDate] = useState<Date | undefined>(undefined);
  const [bidCloseDate, setBidCloseDate] = useState<Date | undefined>(undefined);
  const [capacity, setCapacity] = useState<string>("");

  // Use real-time bid tracking
  const { statistics, isLoading: statsLoading, refresh: refreshStats } = useRealtimeBidTracking(currentClass?.id || null);
  
  // Fetch bidder details for a specific opportunity
  const fetchOpportunityBidders = async (opportunityId: string) => {
    try {
      // First, fetch all bids for this opportunity
      const { data: bids, error: bidsError } = await supabase
        .from('bids')
        .select('id, user_id, submission_timestamp')
        .eq('opportunity_id', opportunityId)
        .order('submission_timestamp', { ascending: true });

      if (bidsError) {
        console.error(`Error fetching bidders for opportunity ${opportunityId}:`, bidsError);
        return [];
      }

      if (!bids || bids.length === 0) {
        return [];
      }

      // Extract unique user IDs from the bids
      const userIds = [...new Set(bids.map(bid => bid.user_id))];

      // Fetch user details for all bidders
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, name, email, student_number')
        .in('id', userIds);

      if (usersError) {
        console.error(`Error fetching user details for opportunity ${opportunityId}:`, usersError);
        return [];
      }

      // Create a map of user ID to user details for quick lookup
      const userMap = new Map();
      (users || []).forEach(user => {
        userMap.set(user.id, user);
      });

      // Combine bid data with user details
      return bids.map(bid => {
        const user = userMap.get(bid.user_id);
        return {
          id: user?.id || bid.user_id,
          name: user?.name || 'Unknown User',
          email: user?.email || '',
          studentNumber: user?.student_number || '',
          bidTimestamp: bid.submission_timestamp
        };
      });
    } catch (error) {
      console.error('Error fetching opportunity bidders:', error);
      return [];
    }
  };

  // Load bidder details when an opportunity is selected
  useEffect(() => {
    const loadBidderDetails = async () => {
      if (selectedOpportunityId && currentClass?.bidOpportunities) {
        const bidders = await fetchOpportunityBidders(selectedOpportunityId);
        setOpportunityBidders(prev => ({
          ...prev,
          [selectedOpportunityId]: bidders
        }));
      }
    };

    loadBidderDetails();
  }, [selectedOpportunityId, currentClass?.bidOpportunities, lastUpdateTime]);

  // Debug: Log statistics changes
  useEffect(() => {
    if (currentClass?.id) {
      console.log('=== DASHBOARD STATISTICS UPDATE ===')
      console.log('Class ID:', currentClass.id)
      console.log('Statistics:', statistics)
      console.log('Is Loading:', statsLoading)
      setLastUpdateTime(Date.now())
    }
  }, [statistics, statsLoading, currentClass?.id])
  
  // Listen for bid submission events to trigger refresh
  useEffect(() => {
    const handleBidSubmitted = () => {
      console.log('=== BID SUBMITTED EVENT RECEIVED IN DASHBOARD ===')
      refreshStats()
    }

    window.addEventListener('bidSubmitted', handleBidSubmitted)
    
    return () => {
      window.removeEventListener('bidSubmitted', handleBidSubmitted)
    }
  }, [refreshStats])

  // Get the selected opportunity if there is one
  const selectedOpportunity = currentClass?.bidOpportunities?.find(
    opp => opp.id === selectedOpportunityId
  );
  
  // Get bidders for the selected opportunity
  const currentOpportunityBidders = selectedOpportunityId ? (opportunityBidders[selectedOpportunityId] || []) : [];
  
  const resetCreateForm = () => {
    setTitle("");
    setDescription("");
    setEventDate(undefined);
    setBidOpenDate(undefined);
    setBidCloseDate(undefined);
    setCapacity("");
  };

  const handleCapacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Allow empty string for clearing the field
    if (value === "") {
      setCapacity("");
      return;
    }
    
    // Only allow non-negative integers (including zero)
    const numericValue = parseInt(value, 10);
    if (!isNaN(numericValue) && numericValue >= 0) {
      setCapacity(value);
    }
  };

  const handleCapacityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow backspace, delete, tab, escape, enter, and arrow keys
    if ([8, 9, 27, 13, 37, 38, 39, 40, 46].indexOf(e.keyCode) !== -1 ||
        // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
        (e.keyCode === 65 && e.ctrlKey === true) ||
        (e.keyCode === 67 && e.ctrlKey === true) ||
        (e.keyCode === 86 && e.ctrlKey === true) ||
        (e.keyCode === 88 && e.ctrlKey === true)) {
      return;
    }
    
    // Ensure that it is a number and stop the keypress
    if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
      e.preventDefault();
    }
  };
  
  const handleCreateOpportunity = async () => {
    const capacityValue = parseInt(capacity, 10);
    
    if (!currentClass || !title || !description || !eventDate || !bidOpenDate || !bidCloseDate || isNaN(capacityValue) || capacityValue < 0) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields with valid values",
        variant: "destructive",
      });
      return;
    }
    
    setIsCreating(true);
    
    try {
      const newOpportunity = await createBidOpportunity(currentClass.id, {
        title,
        description,
        event_date: eventDate.toISOString(),
        opens_at: bidOpenDate.toISOString(),
        closes_at: bidCloseDate.toISOString(),
        capacity: capacityValue
      });
      
      onOpportunityCreated?.(newOpportunity);
      
      toast({
        title: "Opportunity created",
        description: "The bidding opportunity has been created successfully",
      });
      
      resetCreateForm();
      setShowCreateOpportunityDialog(false);
      
      // Refresh statistics to show the new opportunity
      refreshStats();
    } catch (error) {
      console.error("Error creating opportunity:", error);
      toast({
        title: "Failed to create opportunity",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };
  
  const handleDeleteOpportunity = async (opportunityId: string) => {
    const opportunityToDelete = currentClass?.bidOpportunities?.find(opp => opp.id === opportunityId);
    const opportunityTitle = opportunityToDelete?.title || 'this opportunity';
    
    console.log('=== DASHBOARD DELETE HANDLER STARTED ===');
    console.log('Opportunity ID:', opportunityId);
    console.log('Opportunity title:', opportunityTitle);
    console.log('Current class ID:', currentClass?.id);
    
    setIsDeleting(opportunityId);
    
    try {
      console.log('=== CALLING deleteBidOpportunity FUNCTION ===');
      
      // Call the delete function which should remove from Supabase
      await deleteBidOpportunity(opportunityId);
      console.log('=== deleteBidOpportunity COMPLETED SUCCESSFULLY ===');
      
      // Update local state
      onOpportunityDeleted?.(opportunityId);
      console.log('=== LOCAL STATE UPDATED ===');
      
      toast({
        title: "Opportunity deleted",
        description: `"${opportunityTitle}" has been permanently deleted`,
      });
      
      // Refresh statistics after deletion
      refreshStats();
      console.log('=== STATISTICS REFRESHED ===');
      
    } catch (error) {
      console.error("=== DASHBOARD DELETE ERROR ===");
      console.error("Error type:", typeof error);
      console.error("Error message:", error instanceof Error ? error.message : error);
      console.error("Full error object:", error);
      console.error("Stack trace:", error instanceof Error ? error.stack : 'No stack trace');
      
      toast({
        title: "Failed to delete opportunity",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(null);
      console.log('=== DASHBOARD DELETE HANDLER COMPLETED ===');
    }
  };
  
  const handleEditOpportunity = (opportunity: BidOpportunity) => {
    setEditingOpportunity(opportunity);
  };
  
  const handleSaveOpportunity = (updatedOpportunity: BidOpportunity) => {
    if (!currentClass) return;
    
    // Update the opportunity
    onUpdateOpportunity(updatedOpportunity.id, updatedOpportunity);
    
    // Refresh statistics to show updated data
    refreshStats();
    
    toast({
      title: "Changes saved",
      description: `The bidding opportunity has been updated`,
    });
  };


  // Get real-time bid count for a specific opportunity
  const getOpportunityBidCount = (opportunityId: string): number => {
    console.log('=== GETTING OPPORTUNITY BID COUNT ===')
    console.log('Opportunity ID:', opportunityId)
    console.log('Current statistics:', statistics)
    
    // Add null check for statistics to prevent TypeError
    if (!statistics || !statistics.opportunities) {
      console.log('No statistics or opportunities available')
      return 0;
    }
    
    const opportunityStats = statistics.opportunities.find(opp => opp.opportunityId === opportunityId);
    console.log('Found opportunity stats for', opportunityId, ':', opportunityStats)
    console.log('Bid count:', opportunityStats?.bidCount || 0)
    return opportunityStats?.bidCount || 0;
  };

  if (!currentClass) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-heading font-bold">Admin Dashboard</h1>
          <Button onClick={onCreateClass}>Create New Class</Button>
        </div>
        
        <Card className="mb-6">
          <CardContent className="p-6 flex flex-col items-center justify-center">
            <p className="text-lg mb-4">No class selected.</p>
            <p className="text-muted-foreground mb-4">
              Select a class from the sidebar to view its details and manage it.
            </p>
            {classes.length === 0 && (
              <Button onClick={onCreateClass}>Create Your First Class</Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-8">
      {/* Header Section */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-heading font-bold">Class Management</h1>
          <p className="text-muted-foreground text-lg">
            {isViewingArchived ? 'Viewing (Read-only)' : 'Managing'}: {currentClass.className}
            {isViewingArchived && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Archived
              </Badge>
            )}
          </p>
        </div>
        <div className="flex space-x-3">
          <Button 
            variant="outline"
            onClick={refreshStats}
            disabled={statsLoading || isViewingArchived}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${statsLoading ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
          {!isViewingArchived && (
            <>
              <Button 
                variant="secondary"
                onClick={() => onArchiveClass?.(currentClass.id, true)}
                className="flex items-center gap-2"
              >
                <Archive className="w-4 h-4" />
                Archive Class
              </Button>
              <Button 
                variant="destructive"
                onClick={() => onRemoveClass?.(currentClass.id)}
                className="flex items-center gap-2"
              >
                <Trash2 size={16} /> Remove Class
              </Button>
            </>
          )}
          {isViewingArchived && (
            <Button 
              variant="outline"
              onClick={() => onArchiveClass?.(currentClass.id, false)}
              className="flex items-center gap-2"
            >
              <Archive className="w-4 h-4" />
              Unarchive Class
            </Button>
          )}
        </div>
      </div>

      {/* Real-time Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : statistics?.totalStudents || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Enrolled in class
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tokens Available</CardTitle>
            <Coins className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {statsLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : statistics?.studentsWithTokens || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Ready to bid
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tokens Used</CardTitle>
            <Coins className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {statsLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : (statistics ? statistics.totalStudents - statistics.studentsWithTokens : 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Tokens in use
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tokens Refunded</CardTitle>
            <History className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {statsLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : statistics?.tokensRefunded || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Total refund events
            </p>
          </CardContent>
        </Card>
      </div>


      {/* Bidding Opportunities Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-heading font-bold">Bidding Opportunities</h2>
            <p className="text-muted-foreground">Manage bidding opportunities for Class: {currentClass.className}</p>
          </div>
          <Button 
            onClick={() => setShowCreateOpportunityDialog(true)}
            className="flex items-center gap-2"
            disabled={isViewingArchived}
          >
            <Plus className="w-4 h-4" />
            Add Opportunity
          </Button>
        </div>

        {currentClass.bidOpportunities && currentClass.bidOpportunities.length > 0 ? (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Capacity</TableHead>
                      <TableHead>Event Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Current Bids</TableHead>
                      <TableHead>Selected</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentClass.bidOpportunities.map((opportunity) => {
                      const realTimeBidCount = getOpportunityBidCount(opportunity.id);
                      
                      return (
                        <>
                          <TableRow 
                            key={opportunity.id}
                            className={selectedOpportunityId === opportunity.id ? "bg-academy-lightBlue/10" : ""}
                          >
                            <TableCell className="font-medium">{opportunity.title}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {opportunity.capacity || currentClass.capacity} students
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(opportunity.date)}</TableCell>
                            <TableCell>
                              <Badge variant={getBidOpportunityStatus(opportunity) === "Open for Bidding" ? "default" : "secondary"}>
                                {getBidOpportunityStatus(opportunity)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge variant="default" className="bg-blue-500" key={`bid-count-${opportunity.id}-${lastUpdateTime}`}>
                                  {statsLoading ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <span key={`count-${opportunity.id}-${realTimeBidCount}-${lastUpdateTime}`}>
                                      {realTimeBidCount}
                                    </span>
                                  )}
                                </Badge>
                                {realTimeBidCount > (opportunity.capacity || currentClass.capacity) && (
                                  <Badge variant="destructive" className="text-xs">
                                    Over capacity
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{opportunity.selectedStudents?.length || 0}</TableCell>
                            <TableCell>
                              <div className="flex space-x-2">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => setSelectedOpportunityId(
                                    selectedOpportunityId === opportunity.id ? null : opportunity.id
                                  )}
                                  className="flex items-center gap-1"
                                >
                                  {selectedOpportunityId === opportunity.id ? (
                                    <>
                                      <EyeOff className="w-4 h-4" />
                                      Hide Details
                                    </>
                                  ) : (
                                    <>
                                      <Eye className="w-4 h-4" />
                                      View Details
                                    </>
                                  )}
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditOpportunity(opportunity);
                                  }}
                                  disabled={isViewingArchived}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button 
                                  variant="destructive" 
                                  size="sm"
                                  onClick={() => {
                                    const confirmed = window.confirm(
                                      `Are you sure you want to delete "${opportunity.title}"? This action cannot be undone and will remove all associated bids.`
                                    );
                                    if (confirmed) {
                                      handleDeleteOpportunity(opportunity.id);
                                    }
                                  }}
                                  disabled={isDeleting === opportunity.id || isViewingArchived}
                                >
                                  {isDeleting === opportunity.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>

                          {/* Selected Opportunity Details */}
                          {selectedOpportunityId === opportunity.id && (
                            <TableRow>
                              <TableCell colSpan={8} className="p-0">
                                <div className="bg-blue-50/50 border-l-4 border-l-academy-blue p-6">
                                  <h3 className="text-lg font-semibold mb-4 text-academy-blue">
                                    Details of {opportunity.title}
                                  </h3>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                      <Label className="text-sm font-medium text-gray-600">Description</Label>
                                      <div className="mt-2 p-3 bg-white rounded-md border">
                                        <p className="text-gray-800">{opportunity.description}</p>
                                      </div>
                                     
                                     <div className="mt-4">
                                       <Label className="text-sm font-medium text-gray-600">Bidding Opens</Label>
                                       <div className="mt-2 p-3 bg-white rounded-md border">
                                         <p className="text-gray-800">
                                           {opportunity.bidOpenDate ? formatDate(opportunity.bidOpenDate) : "1 week before event"}
                                         </p>
                                       </div>
                                     </div>
                                     
                                     <div className="mt-4">
                                       <Label className="text-sm font-medium text-gray-600">Bidding Closes</Label>
                                       <div className="mt-2 p-3 bg-white rounded-md border">
                                         <p className="text-gray-800">
                                           {opportunity.bidCloseDate ? formatDate(opportunity.bidCloseDate) : formatDate(opportunity.date)}
                                         </p>
                                       </div>
                                     </div>
                                    </div>
                                    <div>
                                      <Label className="text-sm font-medium text-gray-600">Live Statistics</Label>
                                      <div className="mt-2 space-y-3">
                                        <div className="flex justify-between items-center p-2 bg-white rounded border">
                                          <span className="text-sm text-gray-600">Current Bids:</span>
                                          <span className="font-medium text-blue-600" key={`detail-bid-count-${opportunity.id}-${lastUpdateTime}`}>
                                            {statsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : realTimeBidCount}
                                          </span>
                                        </div>
                                        <div className="flex justify-between items-center p-2 bg-white rounded border">
                                          <span className="text-sm text-gray-600">Capacity:</span>
                                          <span className="font-medium text-purple-600">
                                            {opportunity.capacity || currentClass.capacity} students
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  {/* Student Bidders Section */}
                                  <div className="mt-4">
                                    {/* Student Bidders Section */}
                                    {currentOpportunityBidders.length > 0 && (
                                      <div className="mt-6">
                                        <Label className="text-sm font-medium text-gray-600 mb-3 block">
                                          Student Bidders ({currentOpportunityBidders.length})
                                        </Label>
                                        <div className="p-4 bg-white rounded-md border">
                                          <div className="space-y-3">
                                            {currentOpportunityBidders.map((bidder, index) => (
                                              <div key={bidder.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                                                <div className="flex items-center gap-3">
                                                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-medium text-blue-600">
                                                    {index + 1}
                                                  </div>
                                                  <div>
                                                    <div className="font-medium text-gray-900">{bidder.name}</div>
                                                    <div className="text-sm text-gray-500">{bidder.email}</div>
                                                    {bidder.studentNumber && (
                                                      <div className="text-xs text-gray-400">ID: {bidder.studentNumber}</div>
                                                    )}
                                                  </div>
                                                </div>
                                                <div className="text-right">
                                                  <div className="text-sm font-medium text-gray-700">
                                                    Submitted: {new Date(bidder.bidTimestamp).toLocaleDateString('en-US', {
                                                      month: '2-digit',
                                                      day: '2-digit',
                                                      year: 'numeric'
                                                    })}
                                                  </div>
                                                  <div className="text-xs text-gray-500">
                                                    {new Date(bidder.bidTimestamp).toLocaleTimeString('en-US', {
                                                      hour: '2-digit',
                                                      minute: '2-digit',
                                                      hour12: true
                                                    })}
                                                  </div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                          
                                          {/* Summary text in the requested format */}
                                          <div className="mt-4 pt-3 border-t border-gray-200">
                                            <div className="text-sm text-gray-600">
                                              <span className="font-medium">Bidding Summary:</span>
                                              <div className="mt-1 text-gray-700">
                                                {currentOpportunityBidders.map((bidder, index) => (
                                                  <span key={bidder.id}>
                                                    {bidder.name} (submitted: {new Date(bidder.bidTimestamp).toLocaleDateString('en-US', {
                                                      month: '2-digit',
                                                      day: '2-digit',
                                                      year: 'numeric'
                                                    })} {new Date(bidder.bidTimestamp).toLocaleTimeString('en-US', {
                                                      hour: '2-digit',
                                                      minute: '2-digit',
                                                      hour12: true
                                                    })})
                                                    {index < currentOpportunityBidders.length - 1 ? ', ' : ''}
                                                  </span>
                                                ))}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {/* No bidders message */}
                                    {currentOpportunityBidders.length === 0 && realTimeBidCount === 0 && (
                                      <div className="mt-6">
                                        <Label className="text-sm font-medium text-gray-600 mb-3 block">
                                          Student Bidders
                                        </Label>
                                        <div className="p-4 bg-white rounded-md border text-center">
                                          <div className="text-gray-500 text-sm">
                                            No students have placed bids for this opportunity yet.
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <h3 className="text-lg font-semibold mb-2">No Bidding Opportunities</h3>
              <p className="text-muted-foreground mb-4">
                Create your first bidding opportunity to get started.
              </p>
              <Button onClick={() => setShowCreateOpportunityDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create First Opportunity
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create Opportunity Dialog */}
      <Dialog open={showCreateOpportunityDialog} onOpenChange={setShowCreateOpportunityDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Bidding Opportunity</DialogTitle>
            <DialogDescription>
              Add a new bidding opportunity for students to participate in
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Dinner with Professor - Week 1"
                disabled={isCreating}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the opportunity in detail"
                rows={3}
                disabled={isCreating}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Event Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    disabled={isCreating}
                  >
                    {eventDate ? format(eventDate, "PPP") : <span>Pick the event date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={eventDate}
                    onSelect={setEventDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-2">
              <Label>Bidding Opens Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    disabled={isCreating}
                  >
                    {bidOpenDate ? format(bidOpenDate, "PPP") : <span>Pick when bidding opens</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={bidOpenDate}
                    onSelect={setBidOpenDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                This is when students can start bidding for this opportunity
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Bidding Closes Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    disabled={isCreating}
                  >
                    {bidCloseDate ? format(bidCloseDate, "PPP") : <span>Pick when bidding closes</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={bidCloseDate}
                    onSelect={setBidCloseDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                This is when bidding closes for this opportunity
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="capacity">Capacity</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="capacity"
                  type="text"
                  value={capacity}
                  onChange={handleCapacityChange}
                  onKeyDown={handleCapacityKeyDown}
                  placeholder="0"
                  disabled={isCreating}
                  required
                />
                <span className="text-sm text-muted-foreground">students</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Any positive number of students for this opportunity
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateOpportunityDialog(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button onClick={handleCreateOpportunity} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Opportunity"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Bid Opportunity Dialog */}
      {editingOpportunity && (
        <EditBidOpportunityDialog
          isOpen={!!editingOpportunity}
          onClose={() => setEditingOpportunity(null)}
          opportunity={editingOpportunity}
          currentClass={currentClass}
          onSave={handleSaveOpportunity}
        />
      )}

    </div>
  );
};

export default Dashboard;