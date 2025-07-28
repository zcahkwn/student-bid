import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Activity, RefreshCw, Coins, Users } from "lucide-react";
import { ClassConfig, Student } from "@/types";
import { supabase } from "@/lib/supabase";
import { getClassStudents } from "@/lib/userService";
import { useToast } from "@/hooks/use-toast";

interface RealtimeStudentManagerProps {
  currentClass: ClassConfig;
  onStudentUpdate: (students: Student[]) => void;
}

const RealtimeStudentManager = ({ currentClass, onStudentUpdate }: RealtimeStudentManagerProps) => {
  const [students, setStudents] = useState<Student[]>(currentClass.students);
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tokenStats, setTokenStats] = useState({
    total: 0,
    available: 0,
    used: 0
  });
  
  const { toast } = useToast();

  // Subscribe to real-time student enrollment updates
  useEffect(() => {
    const channel = supabase
      .channel(`class-students-${currentClass.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'student_enrollments',
          filter: `class_id=eq.${currentClass.id}`,
        },
        (payload) => {
          console.log('Student enrollment update received:', payload);
          handleEnrollmentUpdate(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'users',
        },
        (payload) => {
          console.log('User update received:', payload);
          handleUserUpdate(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentClass.id]);

  // Handle real-time enrollment updates
  const handleEnrollmentUpdate = async (payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    // Refresh the entire student list when enrollments change
    await refreshStudentData();
    
    if (eventType === 'UPDATE' && newRecord) {
      // Get user info for the toast
      const { data: user } = await supabase
        .from('users')
        .select('name')
        .eq('id', newRecord.user_id)
        .single();
        
      const wasTokenAvailable = oldRecord?.tokens_remaining > 0;
      const isTokenNowUsed = newRecord.tokens_remaining <= 0;
      
      // Show toast notification for token status change
      if (wasTokenAvailable && isTokenNowUsed && user) {
        toast({
          title: "Token Status Updated",
          description: `${user.name} has used their token`,
        });
      }
    }
  };

  // Handle real-time user updates
  const handleUserUpdate = async (payload: any) => {
    // Refresh the student list when user info changes
    await refreshStudentData();
  };

  // Calculate token statistics
  useEffect(() => {
    const total = students.length;
    const used = students.filter(s => s.hasUsedToken === true).length;
    const available = total - used;
    
    setTokenStats({ total, available, used });
  }, [students]);

  // Refresh student data from database
  const refreshStudentData = async () => {
    setIsRefreshing(true);
    try {
      const updatedStudents = await getClassStudents(currentClass.id);

      setStudents(updatedStudents);
      onStudentUpdate(updatedStudents);
      
      toast({
        title: "Data Refreshed",
        description: "Student data has been updated from the database",
      });
    } catch (error) {
      console.error('Error refreshing student data:', error);
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh student data",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter students based on search query
  const filteredStudents = students.filter(student => 
    student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Token Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tokenStats.total}</div>
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
            <div className="text-2xl font-bold text-green-600">{tokenStats.available}</div>
            <p className="text-xs text-muted-foreground">
              Ready to bid
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tokens Used</CardTitle>
            <Activity className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{tokenStats.used}</div>
            <p className="text-xs text-muted-foreground">
              Bids submitted
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Real-time Activity Alert */}
      {tokenStats.used > 0 && (
        <Alert>
          <Activity className="h-4 w-4" />
          <AlertDescription>
            <strong>{tokenStats.used} student{tokenStats.used > 1 ? 's have' : ' has'}</strong> used their token for bidding
          </AlertDescription>
        </Alert>
      )}

      {/* Student Management Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <Users className="w-5 h-5" />
              Student List - Real-time Updates
            </CardTitle>
            <CardDescription>
              Live view of student token status and bidding activity
            </CardDescription>
          </div>
          <Button 
            onClick={refreshStudentData} 
            disabled={isRefreshing}
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
        
        <CardContent>
          <div className="mb-4">
            <Label htmlFor="search" className="sr-only">Search</Label>
            <Input
              id="search"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          {filteredStudents.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              {students.length === 0 
                ? "No students in this class yet." 
                : "No students match your search"}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Student Number</TableHead>
                  <TableHead>Token Status</TableHead>
                  <TableHead>Bid Status</TableHead>
                  <TableHead>Tokens Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((student) => (
                  <TableRow 
                    key={student.id}
                    className={student.hasUsedToken === true ? "bg-red-50" : "bg-green-50"}
                  >
                    <TableCell className="font-medium">{student.name}</TableCell>
                    <TableCell>{student.email}</TableCell>
                    <TableCell>{student.studentNumber || 'N/A'}</TableCell>
                    <TableCell>
                      {student.hasUsedToken === true ? (
                        <Badge variant="secondary" className="bg-red-100 text-red-800">
                          Token Unavailable
                        </Badge>
                      ) : (
                        <Badge className="bg-green-100 text-green-800">
                          Token Available
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {student.hasBid === true ? (
                        <Badge variant="default">Bid Submitted</Badge>
                      ) : (
                        <Badge variant="outline">No Bid</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {student.tokensRemaining ?? (student.hasUsedToken === true ? 0 : 1)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RealtimeStudentManager;