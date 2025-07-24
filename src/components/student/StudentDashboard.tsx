import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EnhancedBidCard from "@/components/student/EnhancedBidCard";
import StudentSidebar from "@/components/student/StudentSidebar";
import { Student, ClassConfig, BidOpportunity } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { formatDate, getBidOpportunityStatus } from "@/utils/dates";
import { useNavigate, useLocation } from "react-router-dom";
import { Menu, X, Users, Calendar, Trophy, Clock, Coins } from "lucide-react";
import { subscribeToUserEnrollmentUpdates } from "@/lib/studentBidService";
import { fetchClasses } from "@/lib/classService";
import { supabase } from "@/lib/supabase";

const StudentDashboard = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get student and classes data from location state
  const initialStudent = location.state?.student || null;
  const allClasses = location.state?.classes || [];
  
  // Use local state to track current student and selected class
  const [student, setStudent] = useState<Student | null>(initialStudent);
  const [classes, setClasses] = useState<ClassConfig[]>(allClasses);
  const [currentClass, setCurrentClass] = useState<ClassConfig | null>(
    allClasses.length > 0 ? allClasses[0] : null
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Add state for tracking real-time updates
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  
  // Subscribe to real-time user enrollment updates
  useEffect(() => {
    if (!student?.id || !currentClass?.id) {
      console.log('Skipping real-time subscription setup: student or currentClass not ready.');
      return;
    }

    console.log('=== SETTING UP REAL-TIME SUBSCRIPTION ===');
    console.log('Student ID:', student.id, 'Class ID:', currentClass.id);

    // Initial fetch of current status from database
    const fetchCurrentStatus = async () => {
      setIsLoadingStatus(true);
      try {
        const { data: enrollment, error } = await supabase
          .from('student_enrollments')
          .select('*')
          .eq('user_id', student.id)
          .eq('class_id', currentClass.id)
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
          
          console.log('=== INITIAL STATUS FETCH ===');
          console.log('Database enrollment:', enrollment);
          console.log('Updated student:', updatedStudent);
          
          setStudent(updatedStudent);
        }
      } catch (error) {
        console.error('Error fetching initial status:', error);
      } finally {
        setIsLoadingStatus(false);
      }
    };

    fetchCurrentStatus();

    const unsubscribe = subscribeToUserEnrollmentUpdates(
      student.id,
      currentClass.id,
      async (updatedStudent) => {
        console.log('=== REAL-TIME UPDATE RECEIVED ===');
        console.log('Updated student data:', updatedStudent);
        console.log('Token status:', updatedStudent.tokenStatus);
        console.log('Bidding result:', updatedStudent.biddingResult);
        console.log('Tokens remaining:', updatedStudent.tokensRemaining);
        
        // Store previous student state for comparison
        const previousStudent = student;
        
        // Check for significant changes to show notifications
        const tokenStatusChanged = previousStudent?.tokenStatus !== updatedStudent.tokenStatus;
        const biddingResultChanged = previousStudent?.biddingResult !== updatedStudent.biddingResult;
        
        // Directly update the student state with the latest enrollment data
        console.log('=== UPDATING STUDENT STATE ===');
        setStudent(updatedStudent);

        // Update currentClass with the updated student data
        setCurrentClass(prevCurrentClass => {
          if (!prevCurrentClass) return prevCurrentClass;

          // Update bidOpportunities: specifically the selectedStudents within each opportunity
          const updatedBidOpportunities = prevCurrentClass.bidOpportunities.map(opp => {
            let newSelectedStudents = [...opp.selectedStudents]; // Start with current selected students

            // Check if this is the opportunity the student bid on (or was selected for)
            // This is a heuristic; ideally, the real-time payload would indicate the specific opportunity.
            // For now, we'll assume the change applies to the opportunity the student has a bid on.
            const isRelevantOpportunity = opp.bidders.some(b => b.id === updatedStudent.id);

            if (isRelevantOpportunity) {
              if (updatedStudent.biddingResult === 'won') {
                // If student won and is not already in selectedStudents, add them
                if (!newSelectedStudents.some(s => s.id === updatedStudent.id)) {
                  newSelectedStudents.push(updatedStudent);
                }
              } else if (updatedStudent.biddingResult === 'lost' || updatedStudent.biddingResult === 'pending') {
                // If student lost/pending and is currently in selectedStudents, remove them
                newSelectedStudents = newSelectedStudents.filter(s => s.id !== updatedStudent.id);
              }
            }

            // Also ensure the student's bid status is updated within the bidders array
            const updatedBiddersForOpp = opp.bidders.map(b =>
              b.id === updatedStudent.id ? updatedStudent : b
            );

            return { ...opp, selectedStudents: newSelectedStudents, bidders: updatedBiddersForOpp };
          });
          
          return {
            ...prevCurrentClass,
            students: prevCurrentClass.students.map(s => 
              s.id === updatedStudent.id ? updatedStudent : s
            ),
            bidders: prevCurrentClass.bidders.map(s => 
              s.id === updatedStudent.id ? updatedStudent : s
            ),
            selectedStudents: prevCurrentClass.selectedStudents.map(s => 
              s.id === updatedStudent.id ? updatedStudent : s
            ),
            bidOpportunities: updatedBidOpportunities // Crucial update
          };
        });
        
        // Update classes array with the updated student data
        setClasses(prevClasses => 
          prevClasses.map(classItem => {
            if (classItem.id === currentClass.id) {
              return {
                ...classItem,
                students: classItem.students.map(s => 
                  s.id === updatedStudent.id ? updatedStudent : s
                ),
                bidders: classItem.bidders.map(s => 
                  s.id === updatedStudent.id ? updatedStudent : s
                ),
                selectedStudents: classItem.selectedStudents.map(s => 
                  s.id === updatedStudent.id ? updatedStudent : s
                ),
                // Update bidOpportunities within this classItem as well
                bidOpportunities: classItem.bidOpportunities.map(opp => {
                  let newSelectedStudents = [...opp.selectedStudents];
                  const isRelevantOpportunity = opp.bidders.some(b => b.id === updatedStudent.id);

                  if (isRelevantOpportunity) {
                    if (updatedStudent.biddingResult === 'won') {
                      if (!newSelectedStudents.some(s => s.id === updatedStudent.id)) {
                        newSelectedStudents.push(updatedStudent);
                      }
                    } else if (updatedStudent.biddingResult === 'lost' || updatedStudent.biddingResult === 'pending') {
                      newSelectedStudents = newSelectedStudents.filter(s => s.id !== updatedStudent.id);
                    }
                  }

                  // Also ensure the student's bid status is updated within the bidders array
                  const updatedBiddersForOpp = opp.bidders.map(b =>
                    b.id === updatedStudent.id ? updatedStudent : b
                  );

                  return {
                    ...opp,
                    selectedStudents: newSelectedStudents,
                    bidders: updatedBiddersForOpp
                  };
                })
              };
            }
            return classItem;
          })
        );
        
        // Show appropriate toast notifications for status changes
        // Show toast notification for token status change
        if (tokenStatusChanged && updatedStudent.tokenStatus === 'used') {
          toast({
            title: "Token Status Updated",
            description: "Your token has been used for bidding. You can now see your bid status.",
          });
        }
        
        // Show toast notification for bidding result change
        if (biddingResultChanged && updatedStudent.biddingResult !== 'pending') {
          console.log('=== BIDDING RESULT CHANGED ===');
          console.log('Previous result:', previousStudent?.biddingResult);
          console.log('New result:', updatedStudent.biddingResult);
          
          const resultMessage = updatedStudent.biddingResult === 'won' 
            ? "🎉 Congratulations! You have been selected for the opportunity!" 
            : "Unfortunately, you were not selected this time. Better luck next time!";
            
          toast({
            title: "Bidding Result Updated",
            description: resultMessage,
            duration: updatedStudent.biddingResult === 'won' ? 10000 : 5000, // Show longer for wins
          });
        }
      }
    );

    return unsubscribe;
  }, [student?.id, currentClass?.id, toast]);

  // Load the latest class configuration from localStorage on component mount
  useEffect(() => {
    if (student && classes.length > 0) {
      const storedClassesStr = localStorage.getItem("classData");
      if (storedClassesStr) {
        try {
          const storedClasses = JSON.parse(storedClassesStr);
          
          // Clean up old rewardDescription from localStorage data
          storedClasses.forEach((classConfig: any) => {
            if ('rewardDescription' in classConfig) {
              delete classConfig.rewardDescription;
            }
          });
          
          // Update classes with stored data
          const updatedClasses = classes.map(classConfig => {
            const storedClass = storedClasses.find((c: ClassConfig) => c.id === classConfig.id);
            return storedClass || classConfig;
          });
          setClasses(updatedClasses);
          
          // Update current class if it exists in stored data
          if (currentClass) {
            const updatedCurrentClass = updatedClasses.find(c => c.id === currentClass.id);
            if (updatedCurrentClass) {
              setCurrentClass(updatedCurrentClass);
            }
          }
        } catch (error) {
          console.error("Error parsing stored class data:", error);
        }
      }
    }
  }, []);
  
  const handleSelectClass = (classId: string) => {
    const selectedClass = classes.find(c => c.id === classId);
    if (selectedClass) {
      setCurrentClass(selectedClass);
    }
  };
  
  if (!student || classes.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-heading font-bold mb-6">Student Dashboard</h1>
          <p className="text-center text-muted-foreground py-8">
            Please log in to view your dashboard
          </p>
          <div className="flex justify-center">
            <Button onClick={() => navigate("/")}>Back to Login</Button>
          </div>
        </div>
      </div>
    );
  }
  
  const handleBidSubmitted = (bidId: string, updatedStudent: Student, opportunityId: string) => {
    // Get current classes from localStorage
    const storedClassesStr = localStorage.getItem("classData");
    if (storedClassesStr) {
      try {
        const storedClasses = JSON.parse(storedClassesStr);
        
        // Find and update the current class
        const updatedClasses = storedClasses.map((c: ClassConfig) => {
          if (c.id === currentClass?.id) {
            // Update the student in the students array
            const updatedStudents = c.students.map((s: Student) => 
              s.id === updatedStudent.id ? updatedStudent : s
            );
            
            // Update the opportunity with the new bidder
            const updatedOpportunities = c.bidOpportunities.map((opp: BidOpportunity) => {
              if (opp.id === opportunityId) {
                // Make sure we're not adding duplicate bidders
                if (!opp.bidders.some(b => b.id === updatedStudent.id)) {
                  return {
                    ...opp,
                    bidders: [...opp.bidders, updatedStudent]
                  };
                }
              }
              return opp;
            });
            
            // Also update class-level bidders list for backward compatibility
            const updatedBidders = c.bidders && Array.isArray(c.bidders) ? 
              [...c.bidders] : [];
            
            if (!updatedBidders.some(b => b.id === updatedStudent.id)) {
              updatedBidders.push(updatedStudent);
            }
            
            // Return updated class
            return {
              ...c,
              students: updatedStudents,
              bidders: updatedBidders,
              bidOpportunities: updatedOpportunities
            };
          }
          return c;
        });
        
        // Save updated classes back to localStorage
        localStorage.setItem("classData", JSON.stringify(updatedClasses));
        
        // Find the updated class config to use for state updates
        const updatedClassConfig = updatedClasses.find((c: ClassConfig) => c.id === currentClass?.id);
        
        // Update UI state
        setCurrentClass(updatedClassConfig);
        setClasses(updatedClasses);
        
      } catch (error) {
        console.error("Error updating class data:", error);
      }
    }
    
    toast({
      title: "Bid placed successfully",
      description: `You have placed a bid for the opportunity.`,
    });
  };
  
  const handleLogout = () => {
    navigate("/");
  };

  // The 'student' state is kept up-to-date by the real-time subscription
  // and should reflect the latest enrollment status.
  const studentBidOpportunity = currentClass?.bidOpportunities?.find(
    opportunity => opportunity.bidders && opportunity.bidders.some(bidder => bidder.id === student.id)
  );
  
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b relative z-50">
        <div className="container mx-auto p-4 flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="md:hidden"
            >
              {sidebarCollapsed ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
            </Button>
            <h1 className="text-2xl font-heading font-bold text-academy-blue mb-4 md:mb-0">
              Student Dashboard
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">Welcome, {student.name}</span>
            <Button variant="outline" onClick={handleLogout}>Logout</Button>
          </div>
        </div>
      </header>
      
      {/* Sidebar */}
      <StudentSidebar
        classes={classes}
        currentClass={currentClass}
        onSelectClass={handleSelectClass}
        isCollapsed={sidebarCollapsed}
      />
      
      <main className={`min-h-[calc(100vh-64px)] transition-all duration-300 ${
        sidebarCollapsed ? 'ml-16' : 'ml-80'
      }`}>
        <div className="container mx-auto p-4 max-w-6xl">
          {currentClass ? (
            <Tabs defaultValue="overview" className="space-y-6">
              <TabsList className="grid grid-cols-3 mb-6">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
                <TabsTrigger value="profile">Profile</TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview">
                <div className="space-y-6">
                  {/* Class Header */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-xl font-heading">{currentClass.className}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-academy-blue">
                            {currentClass.bidOpportunities?.length || 0}
                          </div>
                          <div className="text-sm text-gray-600">Total Opportunities</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-600">
                            {currentClass.bidOpportunities?.filter(opp => {
                              const now = new Date();
                              const eventDate = new Date(opp.date);
                              const biddingOpensDate = opp.bidOpenDate 
                                ? new Date(opp.bidOpenDate)
                                : new Date(eventDate.getTime() - 7 * 24 * 60 * 60 * 1000);
                              return now >= biddingOpensDate && now < eventDate;
                            }).length || 0}
                          </div>
                          <div className="text-sm text-gray-600">Open for Bidding</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold">
                            {student?.tokenStatus === 'used' || student?.hasUsedToken === true ? (
                              <span className="text-red-600">0</span>
                            ) : (
                              <span className="text-green-600">1</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600">Tokens Available</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-purple-600">
                            {currentClass.bidders?.filter(b => b.id === student.id).length || 0}
                          </div>
                          <div className="text-sm text-gray-600">Your Bids</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Token Status */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg font-heading flex items-center gap-2">
                        <Coins className="w-5 h-5" />
                        Token Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <span>Your bidding token:</span>
                        {student?.tokenStatus === 'used' || student?.hasUsedToken === true ? (
                          <Badge variant="secondary" className="bg-red-100 text-red-800">Token Used</Badge>
                        ) : (
                          <Badge className="bg-academy-blue animate-pulse">Token Available</Badge>
                        )}
                      </div>
                      
                      {/* Enhanced Bid Status Display */}
                      {studentBidOpportunity && student?.biddingResult && (
                        <div className="mt-4 p-3 bg-gray-50 rounded-md">
                          <h4 className="font-medium mb-2 flex items-center gap-2">
                            <Trophy className="w-4 h-4" />
                            Your Bid Status
                          </h4>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div className="font-medium">Event</div>
                            <div className="font-medium">Status</div>
                            <div className="font-medium">Result</div>
                            <div>{studentBidOpportunity.title}</div>
                            <div>
                              <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800">
                                Bid Submitted
                              </Badge>
                            </div>
                            <div>
                              {/* Real-time Result Display */}
                              {student.biddingResult === 'won' ? (
                                <Badge variant="default" className="bg-green-500 text-white text-xs animate-bounce">
                                  🎉 Selected
                                </Badge>
                              ) : student.biddingResult === 'lost' ? (
                                <Badge variant="secondary" className="bg-red-100 text-red-800 text-xs">
                                  Not Selected
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-yellow-100 text-yellow-800 text-xs animate-pulse">
                                  Pending Selection
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          {/* Additional Status Information */}
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <div className="text-xs text-gray-600">
                              <div className="flex justify-between">
                                <span>Token Status:</span>
                                <span className={student.tokenStatus === 'used' ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                                  {student.tokenStatus === 'used' ? 'Used' : 'Available'}
                                </span>
                              </div>
                              {student.tokensRemaining !== undefined && (
                                <div className="flex justify-between mt-1">
                                  <span>Tokens Remaining:</span>
                                  <span className="font-medium">{student.tokensRemaining}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Recent Opportunities */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg font-heading flex items-center gap-2">
                        <Calendar className="w-5 h-5" />
                        Recent Opportunities
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 max-h-72 overflow-y-auto">
                        {currentClass.bidOpportunities?.slice(0, 5).map((opportunity) => (
                          <div 
                            key={opportunity.id}
                            className="p-3 border rounded-md flex justify-between items-center"
                          >
                            <div>
                              <div className="font-medium">{opportunity.title}</div>
                              <div className="text-sm text-muted-foreground">{formatDate(opportunity.date)}</div>
                            </div>
                            <div className="flex flex-col items-end">
                              <Badge variant={getBidOpportunityStatus(opportunity) === "Open for Bidding" ? "default" : "secondary"} className="mb-1">
                                {getBidOpportunityStatus(opportunity)}
                              </Badge>
                              {/* Enhanced Bid Status Display */}
                              {opportunity.bidders && opportunity.bidders.some(bidder => bidder.id === student.id) && (
                                <div className="flex flex-col items-end gap-1">
                                  <span className="text-xs text-academy-blue font-medium">✓ Bid Submitted</span>
                                  {student.biddingResult && student.biddingResult !== 'pending' && (
                                    <Badge 
                                      variant={student.biddingResult === 'won' ? 'default' : 'secondary'}
                                      className={`text-xs ${
                                        student.biddingResult === 'won' 
                                          ? 'bg-green-500 text-white' 
                                          : 'bg-red-100 text-red-800'
                                      }`}
                                    >
                                      {student.biddingResult === 'won' ? 'Selected' : 'Not Selected'}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )) || (
                          <p className="text-center text-muted-foreground py-4">
                            No opportunities available yet
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
              
              <TabsContent value="opportunities">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <EnhancedBidCard
                    student={student} // Always pass the main student state
                    classConfig={currentClass}
                    onBidSubmitted={handleBidSubmitted}
                  />
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg font-heading">All Opportunities</CardTitle>
                      <CardDescription>Complete list of bidding opportunities for this class</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {currentClass.bidOpportunities?.map((opportunity) => (
                          <div 
                            key={opportunity.id}
                            className="p-4 border rounded-md"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-medium">{opportunity.title}</h4>
                              <Badge variant={getBidOpportunityStatus(opportunity) === "Open for Bidding" ? "default" : "secondary"}>
                                {getBidOpportunityStatus(opportunity)}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">{opportunity.description}</p>
                            <div className="flex justify-between items-center text-xs text-gray-500">
                              <span>Event: {formatDate(opportunity.date)}</span>
                              <span>Capacity: {opportunity.capacity || currentClass.capacity} students</span>
                            </div>
                            {opportunity.bidders && opportunity.bidders.some(bidder => bidder.id === student.id) && (
                              <div className="mt-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800">
                                    Bid Submitted
                                  </Badge>
                                  {/* Show result if available */}
                                  {student.biddingResult && student.biddingResult !== 'pending' && (
                                    <Badge 
                                      variant={student.biddingResult === 'won' ? 'default' : 'secondary'}
                                      className={`text-xs ${
                                        student.biddingResult === 'won' 
                                          ? 'bg-green-500 text-white' 
                                          : 'bg-red-100 text-red-800'
                                      }`}
                                    >
                                      {student.biddingResult === 'won' ? '🎉 Selected' : 'Not Selected'}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )) || (
                          <p className="text-center text-muted-foreground py-8">
                            No opportunities available yet
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
              
              <TabsContent value="profile">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg font-heading">Your Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-1">
                          <div className="text-sm text-muted-foreground">Name:</div>
                          <div className="col-span-2 font-medium">{student.name}</div>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <div className="text-sm text-muted-foreground">Email:</div>
                          <div className="col-span-2">{student.email}</div>
                        </div>
                        {student.studentNumber && (
                          <div className="grid grid-cols-3 gap-1">
                            <div className="text-sm text-muted-foreground">Student Number:</div>
                            <div className="col-span-2">{student.studentNumber}</div>
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-1">
                          <div className="text-sm text-muted-foreground">Classes Enrolled:</div>
                          <div className="col-span-2">{classes.length}</div>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <div className="text-sm text-muted-foreground">Token Status:</div>
                          <div className="col-span-2">
                            <Badge 
                              variant={student?.tokenStatus === 'used' ? 'secondary' : 'default'}
                              className={`text-xs ${
                                student?.tokenStatus === 'used' 
                                  ? 'bg-red-100 text-red-800' 
                                  : 'bg-green-100 text-green-800'
                              }`}
                            >
                              {student?.tokenStatus === 'used' ? 'Token Used' : 'Token Available'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg font-heading">Class Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {classes.map((classItem) => {
                          const studentInClass = classItem.students.find(s => s.id === student.id);
                          return (
                            <div key={classItem.id} className="p-3 border rounded-md">
                              <div className="flex justify-between items-start mb-2">
                                <h4 className="font-medium">{classItem.className}</h4>
                                <Badge variant={studentInClass?.tokenStatus === 'used' || studentInClass?.hasUsedToken === true ? "secondary" : "default"}>
                                  {studentInClass?.tokenStatus === 'used' || studentInClass?.hasUsedToken === true ? "Token Used" : "Token Available"}
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {classItem.bidOpportunities?.length || 0} opportunities • 
                                {classItem.bidders?.filter(b => b.id === student.id).length || 0} bids placed
                                {/* Show bidding results summary */}
                                {studentInClass?.biddingResult && studentInClass.biddingResult !== 'pending' && (
                                  <span className={`ml-2 font-medium ${
                                    studentInClass.biddingResult === 'won' ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    • {studentInClass.biddingResult === 'won' ? 'Selected' : 'Not Selected'}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <h2 className="text-xl mb-4">No Class Selected</h2>
                <p className="text-muted-foreground">
                  Select a class from the sidebar to view its details and opportunities.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default StudentDashboard;