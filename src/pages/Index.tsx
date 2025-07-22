import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import AdminLoginForm from "@/components/admin/LoginForm";
import StudentLogin from "@/components/student/StudentLogin";
import AdminSidebar from "@/components/admin/AdminSidebar";
import Dashboard from "@/pages/admin/Dashboard";
import Students from "@/pages/admin/Students";
import Rewards from "@/pages/admin/Rewards";
import Selection from "@/pages/admin/Selection";
import StudentDashboard from "@/components/student/StudentDashboard";
import { Student, ClassConfig, AuthState, BidOpportunity } from "@/types";
import { initialAuthState, logout } from "@/utils/auth";
import { createClass, fetchClasses, updateClass, deleteClassAtomic, updateBidOpportunity, ClassDeletionResult } from "@/lib/classService";
import { Loader2, AlertTriangle, CheckCircle, Trash2, Menu, X, Info } from "lucide-react";

const Index = () => {
  // Auth state
  const [auth, setAuth] = useState<AuthState>(initialAuthState);
  
  // App state
  const [classes, setClasses] = useState<ClassConfig[]>([]);
  const [currentClass, setCurrentClass] = useState<ClassConfig | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // New class dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [isCreatingClass, setIsCreatingClass] = useState(false);
  
  // Class deletion state
  const [deletionInProgress, setDeletionInProgress] = useState<string | null>(null);
  const [deletionResult, setDeletionResult] = useState<ClassDeletionResult | null>(null);
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  
  const { toast } = useToast();
  
  // Load classes from Supabase on first render
  useEffect(() => {
    const loadClasses = async () => {
      try {
        setIsLoading(true);
        
        // Check if Supabase environment variables are available
        if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
          console.warn("Supabase environment variables not found, falling back to localStorage");
          throw new Error("Supabase not configured");
        }
        
        const fetchedClasses = await fetchClasses();
        setClasses(fetchedClasses);
        
        // If there's a current class in localStorage, try to find it in the fetched data
        const storedCurrentClassId = localStorage.getItem("currentClassId");
        if (storedCurrentClassId) {
          const foundClass = fetchedClasses.find(c => c.id === storedCurrentClassId);
          if (foundClass) {
            setCurrentClass(foundClass);
          } else {
            // Clear invalid stored class ID
            localStorage.removeItem("currentClassId");
          }
        } else if (fetchedClasses.length > 0) {
          // Auto-select first class if none is selected
          setCurrentClass(fetchedClasses[0]);
        }
      } catch (error) {
        console.error("Error loading classes:", error);
        
        // Fallback to localStorage if Supabase fails
        try {
          console.log("Attempting to load from localStorage as fallback");
          const storedClasses = localStorage.getItem("classData");
          if (storedClasses) {
            const parsedClasses = JSON.parse(storedClasses) as ClassConfig[];
            setClasses(parsedClasses);
            
            // Set current class if available
            const storedCurrentClassId = localStorage.getItem("currentClassId");
            if (storedCurrentClassId) {
              const foundClass = parsedClasses.find(c => c.id === storedCurrentClassId);
              if (foundClass) {
                setCurrentClass(foundClass);
              }
            } else if (parsedClasses.length > 0) {
              setCurrentClass(parsedClasses[0]);
            }
            
            toast({
              title: "Working offline",
              description: "Using locally stored data. Some features may be limited.",
              variant: "default",
            });
          } else {
            // No local data available either
            toast({
              title: "No data available",
              description: "Please ensure Supabase is configured or create a new class to get started.",
              variant: "destructive",
            });
          }
        } catch (localError) {
          console.error("Error loading from localStorage:", localError);
          toast({
            title: "Error loading data",
            description: "Failed to load classes from database and local storage. Please check your connection.",
            variant: "destructive",
          });
        }
      } finally {
        setIsLoading(false);
      }
    };
    
    loadClasses();
  }, [toast]);
  
  // Save current class ID to localStorage when it changes
  useEffect(() => {
    if (currentClass) {
      localStorage.setItem("currentClassId", currentClass.id);
    } else {
      localStorage.removeItem("currentClassId");
    }
  }, [currentClass]);
  
  const handleAdminLogin = (isSuccess: boolean) => {
    if (isSuccess) {
      setAuth({
        ...initialAuthState,
        isAdmin: true,
        currentAdmin: { username: "admin", password: "admin123" }
      });
    }
  };
  
  const handleStudentLogin = (isSuccess: boolean) => {
    if (isSuccess) {
      // Auth state is set within the StudentLogin component
      // This is just a callback for the UI flow
    }
  };
  
  const handleLogout = () => {
    setAuth(logout());
  };
  
  const handleSelectClass = (classId: string) => {
    const selectedClass = classes.find(c => c.id === classId);
    if (selectedClass) {
      setCurrentClass(selectedClass);
    }
  };
  
  const handleCreateClass = () => {
    setIsDialogOpen(true);
  };
  
  const handleSaveNewClass = async () => {
    if (!newClassName) {
      toast({
        title: "Missing information",
        description: "Please provide a class name",
        variant: "destructive",
      });
      return;
    }
    
    setIsCreatingClass(true);
    
    try {
      const newClass = await createClass({
        name: newClassName,
        rewardTitle: "Dinner with Professor",
        rewardDescription: "Join the professor for dinner and discussion at a local restaurant.",
        capacity: 7
      });
      
      const updatedClasses = [...classes, newClass];
      setClasses(updatedClasses);
      setCurrentClass(newClass);
      setIsDialogOpen(false);
      setNewClassName("");
      
      toast({
        title: "Class created successfully",
        description: `Class "${newClassName}" has been created and saved to the database`,
      });
    } catch (error) {
      console.error("Error creating class:", error);
      toast({
        title: "Failed to create class",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsCreatingClass(false);
    }
  };
  
  const handleUpdateStudents = (updatedStudents: Student[]) => {
    if (!currentClass) return;
    
    const updatedClass: ClassConfig = {
      ...currentClass,
      students: updatedStudents
    };
    
    const updatedClasses = classes.map(c => 
      c.id === currentClass.id ? updatedClass : c
    );
    
    setClasses(updatedClasses);
    setCurrentClass(updatedClass);
    
    // Also update localStorage for backward compatibility
    localStorage.setItem("classData", JSON.stringify(updatedClasses));
  };
  
  const handleUpdateReward = (config: Partial<ClassConfig>) => {
    if (!currentClass) return;
    
    const updatedClass: ClassConfig = {
      ...currentClass,
      ...config
    };
    
    const updatedClasses = classes.map(c => 
      c.id === currentClass.id ? updatedClass : c
    );
    
    setClasses(updatedClasses);
    setCurrentClass(updatedClass);
    
    // Also update localStorage for backward compatibility
    localStorage.setItem("classData", JSON.stringify(updatedClasses));
  };
  
  const handleSelectionComplete = async (selectedStudents: Student[], opportunityId?: string) => {
    if (!currentClass) return;

    // Instead of directly manipulating local state, trigger a re-fetch from the database
    // This ensures the UI reflects the latest state from Supabase after the RPC call
    try {
      const updatedClasses = await fetchClasses();
      setClasses(updatedClasses);

      // Find the updated current class from the re-fetched data
      const updatedCurrentClass = updatedClasses.find(c => c.id === currentClass.id);
      if (updatedCurrentClass) {
        setCurrentClass(updatedCurrentClass);
      }

      // Also update localStorage for backward compatibility
      localStorage.setItem("classData", JSON.stringify(updatedClasses));

      toast({
        title: "Selection saved",
        description: `The selection results have been saved and are now visible to students.`,
      });
    } catch (error) {
      console.error("Error refreshing classes after selection:", error);
      toast({
        title: "Error saving selection",
        description: "Failed to refresh class data after selection. Please refresh manually.",
        variant: "destructive",
      });
    }
  };
  
  const handleUpdateBidOpportunity = async (opportunityId: string, updatedOpportunity: BidOpportunity) => {
    if (!currentClass) return;
    
    try {
      // Update the opportunity in the database
      await updateBidOpportunity(opportunityId, {
        title: updatedOpportunity.title,
        description: updatedOpportunity.description,
        event_date: updatedOpportunity.date,
        opens_at: updatedOpportunity.bidOpenDate,
        closes_at: updatedOpportunity.date,
        capacity: updatedOpportunity.capacity
      });

      // Update local state
      const updatedOpportunities = currentClass.bidOpportunities.map(opp => 
        opp.id === opportunityId ? updatedOpportunity : opp
      );
      
      const updatedClass: ClassConfig = {
        ...currentClass,
        bidOpportunities: updatedOpportunities
      };
      
      const updatedClasses = classes.map(c => 
        c.id === currentClass.id ? updatedClass : c
      );
      
      setClasses(updatedClasses);
      setCurrentClass(updatedClass);
      
      // Also update localStorage for backward compatibility
      localStorage.setItem("classData", JSON.stringify(updatedClasses));

      toast({
        title: "Opportunity updated successfully",
        description: "The bidding opportunity has been saved to the database.",
      });
    } catch (error) {
      console.error("Error updating opportunity:", error);
      toast({
        title: "Failed to update opportunity",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };
  
  const handleOpportunityCreated = (opportunity: BidOpportunity) => {
    if (!currentClass) return;
    
    const updatedClass: ClassConfig = {
      ...currentClass,
      bidOpportunities: [...currentClass.bidOpportunities, opportunity]
    };
    
    const updatedClasses = classes.map(c => 
      c.id === currentClass.id ? updatedClass : c
    );
    
    setClasses(updatedClasses);
    setCurrentClass(updatedClass);
    
    // Also update localStorage for backward compatibility
    localStorage.setItem("classData", JSON.stringify(updatedClasses));
  };
  
  const handleOpportunityDeleted = (opportunityId: string) => {
    if (!currentClass) return;
    
    const updatedOpportunities = currentClass.bidOpportunities.filter(opp => opp.id !== opportunityId);
    
    const updatedClass: ClassConfig = {
      ...currentClass,
      bidOpportunities: updatedOpportunities
    };
    
    const updatedClasses = classes.map(c => 
      c.id === currentClass.id ? updatedClass : c
    );
    
    setClasses(updatedClasses);
    setCurrentClass(updatedClass);
    
    // Also update localStorage for backward compatibility
    localStorage.setItem("classData", JSON.stringify(updatedClasses));
  };
  
  const handleBidSubmitted = async (bidId: string, updatedStudent: Student, opportunityId: string) => {
    if (!currentClass || !auth.currentStudent) return;
    
    try {
      // Refresh the class data from the database to get the latest bid counts
      const refreshedClasses = await fetchClasses();
      const refreshedCurrentClass = refreshedClasses.find(c => c.id === currentClass.id);
      
      if (refreshedCurrentClass) {
        // Update the student in the refreshed class's students list
        const updatedStudents = refreshedCurrentClass.students.map(s => 
          s.id === updatedStudent.id ? updatedStudent : s
        );
        
        // Find the opportunity to update with the new bidder
        const updatedOpportunities = refreshedCurrentClass.bidOpportunities.map(opportunity => {
          if (opportunity.id === opportunityId) {
            // Add the student to this opportunity's bidders if not already there
            const isAlreadyBidding = opportunity.bidders.some(b => b.id === updatedStudent.id);
            const updatedBidders = isAlreadyBidding
              ? opportunity.bidders
              : [...opportunity.bidders, updatedStudent];
            
            return {
              ...opportunity,
              bidders: updatedBidders
            };
          }
          return opportunity;
        });
        
        // Also update the class-level bidders for backward compatibility
        const isAlreadyBidding = refreshedCurrentClass.bidders.some(b => b.id === updatedStudent.id);
        const updatedBidders = isAlreadyBidding
          ? refreshedCurrentClass.bidders
          : [...refreshedCurrentClass.bidders, updatedStudent];
        
        // Create the updated class
        const updatedClass: ClassConfig = {
          ...refreshedCurrentClass,
          students: updatedStudents,
          bidders: updatedBidders,
          bidOpportunities: updatedOpportunities
        };
        
        // Update the classes array
        const updatedClasses = refreshedClasses.map(c => 
          c.id === currentClass.id ? updatedClass : c
        );
        
        // Update state
        setClasses(updatedClasses);
        setCurrentClass(updatedClass);
        setAuth({
          ...auth,
          currentStudent: updatedStudent,
        });
        
        // Explicitly save to localStorage to ensure changes are persisted immediately
        localStorage.setItem("classData", JSON.stringify(updatedClasses));
      }
    } catch (error) {
      console.error("Error refreshing class data after bid:", error);
      
      // Fallback to the original logic if database refresh fails
      const updatedStudents = currentClass.students.map(s => 
        s.id === updatedStudent.id ? updatedStudent : s
      );
      
      const updatedOpportunities = currentClass.bidOpportunities.map(opportunity => {
        if (opportunity.id === opportunityId) {
          const isAlreadyBidding = opportunity.bidders.some(b => b.id === updatedStudent.id);
          const updatedBidders = isAlreadyBidding
            ? opportunity.bidders
            : [...opportunity.bidders, updatedStudent];
          
          return {
            ...opportunity,
            bidders: updatedBidders
          };
        }
        return opportunity;
      });
      
      const isAlreadyBidding = currentClass.bidders.some(b => b.id === updatedStudent.id);
      const updatedBidders = isAlreadyBidding
        ? currentClass.bidders
        : [...currentClass.bidders, updatedStudent];
      
      const updatedClass: ClassConfig = {
        ...currentClass,
        students: updatedStudents,
        bidders: updatedBidders,
        bidOpportunities: updatedOpportunities
      };
      
      const updatedClasses = classes.map(c => 
        c.id === currentClass.id ? updatedClass : c
      );
      
      setClasses(updatedClasses);
      setCurrentClass(updatedClass);
      setAuth({
        ...auth,
        currentClass: updatedClass
      });
      
      localStorage.setItem("classData", JSON.stringify(updatedClasses));
    }
  };
  
  const handleRemoveClass = async (classId: string) => {
    const classToDelete = classes.find(c => c.id === classId);
    if (!classToDelete) {
      console.log('=== CLASS NOT FOUND IN LOCAL STATE ===');
      console.log('Class ID:', classId);
      console.log('Available classes:', classes.map(c => ({ id: c.id, name: c.className })));
      toast({
        title: "Class not found",
        description: "The class to delete could not be found",
        variant: "destructive",
      });
      return;
    }
    
    // Show confirmation dialog
    console.log('=== SHOWING CONFIRMATION DIALOG ===');
    console.log('Class to delete:', { id: classToDelete.id, name: classToDelete.className });
    const confirmed = window.confirm(
      `Are you sure you want to delete "${classToDelete.className}"? This action cannot be undone and will remove all associated data including students, bids, and opportunities.`
    );
    
    if (!confirmed) {
      console.log('=== USER CANCELLED DELETION ===');
      return;
    }
    
    console.log('=== USER CONFIRMED DELETION ===');
    console.log('Starting deletion process for class:', classId);
    setDeletionInProgress(classId);
    
    try {
      console.log('=== CALLING deleteClassAtomic FUNCTION ===');
      const result = await deleteClassAtomic(classId);
      console.log('=== deleteClassAtomic RESULT ===');
      console.log('Result:', result);
      
      if (result.success) {
        console.log('=== DELETION SUCCESSFUL - UPDATING UI ===');
        const updatedClasses = classes.filter(c => c.id !== classId);
        console.log('Updated classes count:', updatedClasses.length);
        setClasses(updatedClasses);
        
        // If we deleted the current class, select a new one or set to null
        if (currentClass && currentClass.id === classId) {
          console.log('=== DELETED CURRENT CLASS - SELECTING NEW ONE ===');
          setCurrentClass(updatedClasses.length > 0 ? updatedClasses[0] : null);
        }
        
        // Update localStorage
        localStorage.setItem("classData", JSON.stringify(updatedClasses));
        
        toast({
          title: "Class deleted successfully",
          description: `${result.className} and ${Object.values(result.deletedRecords).reduce((a, b) => a + b, 0)} related records have been removed`,
        });
      } else {
        console.log('=== DELETION FAILED ===');
        console.log('Error:', result.error);
        toast({
          title: "Class deletion failed",
          description: result.error || "Failed to delete the class and its associated data.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("=== UNEXPECTED ERROR DURING CLASS DELETION ===");
      console.error("Error type:", typeof error);
      console.error("Error message:", error instanceof Error ? error.message : error);
      console.error("Full error object:", error);
      toast({
        title: "Class deletion failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setDeletionInProgress(null);
      console.log('=== CLASS DELETION PROCESS COMPLETED ===');
    }
  };
  
  const handleChangePassword = async (classId: string, newPassword: string) => {
    try {
      await updateClass(classId, { password: newPassword });
      
      const updatedClasses = classes.map(c => {
        if (c.id === classId) {
          return { ...c, password: newPassword };
        }
        return c;
      });
      
      setClasses(updatedClasses);
      
      // Update current class if it's the one being modified
      if (currentClass && currentClass.id === classId) {
        setCurrentClass({...currentClass, password: newPassword});
      }
      
      toast({
        title: "Password updated successfully",
        description: "The class password has been updated in the database",
      });
    } catch (error) {
      console.error("Error updating password:", error);
      toast({
        title: "Failed to update password",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };
  
  // Show loading screen while fetching data
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-heading font-semibold mb-2">Loading...</h2>
          <p className="text-muted-foreground">Fetching data from database</p>
        </div>
      </div>
    );
  }
  
  // Render based on authentication state
  if (auth.isAdmin) {
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
                Student Bidding System - Admin
              </h1>
            </div>
            <Button variant="outline" onClick={handleLogout}>Logout</Button>
          </div>
        </header>
        
        {/* Sidebar */}
        <AdminSidebar
          classes={classes}
          currentClass={currentClass}
          onSelectClass={handleSelectClass}
          onCreateClass={handleCreateClass}
          isCollapsed={sidebarCollapsed}
        />
        
        <main className={`min-h-[calc(100vh-64px)] transition-all duration-300 ${
          sidebarCollapsed ? 'ml-16' : 'ml-80'
        }`}>
          <div className="container mx-auto p-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-3 mb-6">
                <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                <TabsTrigger value="students">Students</TabsTrigger>
                <TabsTrigger value="selection">Selection</TabsTrigger>
              </TabsList>
              
              <TabsContent value="dashboard">
                <Dashboard 
                  classes={classes}
                  currentClass={currentClass}
                  onSelectClass={handleSelectClass}
                  onCreateClass={handleCreateClass}
                  onUpdateOpportunity={handleUpdateBidOpportunity}
                  onUpdateReward={handleUpdateReward}
                  onRemoveClass={handleRemoveClass}
                  onChangePassword={handleChangePassword}
                  onOpportunityCreated={handleOpportunityCreated}
                  onOpportunityDeleted={handleOpportunityDeleted}
                />
              </TabsContent>
              
              <TabsContent value="students">
                <Students 
                  currentClass={currentClass}
                  onUpdateStudents={handleUpdateStudents}
                />
              </TabsContent>
              
              <TabsContent value="selection">
                <Selection 
                  currentClass={currentClass}
                  onSelectionComplete={handleSelectionComplete}
                />
              </TabsContent>
            </Tabs>
          </div>
        </main>
        
        {/* New Class Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Class</DialogTitle>
              <DialogDescription>
                Enter the class name to create a new class.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="className">Class Name</Label>
                <Input
                  id="className"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="e.g., Economics 101"
                  disabled={isCreatingClass}
                />
              </div>
              
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
                disabled={isCreatingClass}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSaveNewClass}
                disabled={isCreatingClass}
              >
                {isCreatingClass ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Class"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Class Deletion Confirmation Dialog */}
      </div>
    );
  } else if (auth.isStudent && auth.currentStudent && auth.currentClass) {
    return (
      <div className="min-h-screen bg-gray-50">
        <StudentDashboard 
          student={auth.currentStudent}
          classConfig={auth.currentClass}
          onBidSubmitted={handleBidSubmitted}
          onLogout={handleLogout}
        />
      </div>
    );
  }
  
  // Login screen (default)
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-heading font-bold text-academy-blue mb-3">
              Student Bidding System
            </h1>
          </div>
          
          <Tabs defaultValue="student" className="w-full">
            <TabsList className="grid grid-cols-2 mb-8">
              <TabsTrigger value="student">Student Login</TabsTrigger>
              <TabsTrigger value="admin">Admin Login</TabsTrigger>
            </TabsList>
            
            <TabsContent value="student" className="flex justify-center">
              <StudentLogin 
                classes={classes}
                onLogin={(success) => {
                  if (success) {
                    // State is updated in the component through auth utilities
                    handleStudentLogin(success);
                  }
                }}
              />
            </TabsContent>
            
            <TabsContent value="admin" className="flex justify-center">
              <AdminLoginForm onLogin={handleAdminLogin} />
            </TabsContent>
          </Tabs>

          
        </div>
      </div>
      
      <footer className="border-t bg-white py-4 text-center text-sm text-muted-foreground">
        <div className="container mx-auto">
          Student Bidding System
        </div>
      </footer>
    </div>
  );
};

export default Index;