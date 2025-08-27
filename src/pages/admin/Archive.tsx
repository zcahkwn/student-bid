import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ClassConfig } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/utils/dates";
import { Archive, ArchiveRestore, Calendar, Users, Loader2 } from "lucide-react";

interface ArchiveProps {
  archivedClasses: ClassConfig[];
  onUnarchiveClass: (classId: string) => void;
  isLoading?: boolean;
  isViewOnly?: boolean;
}

const Archive = ({ archivedClasses, onUnarchiveClass, isLoading = false, isViewOnly = false }: ArchiveProps) => {
  const [unarchivingClass, setUnarchivingClass] = useState<string | null>(null);
  const { toast } = useToast();

  const handleUnarchive = async (classId: string, className: string) => {
    if (isViewOnly) {
      toast({
        title: "Action not available",
        description: "Cannot unarchive classes in view-only mode",
        variant: "destructive",
      });
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to unarchive "${className}"? This will move it back to the active classes list.`
    );
    
    if (!confirmed) return;

    setUnarchivingClass(classId);
    
    try {
      await onUnarchiveClass(classId);
      
      toast({
        title: "Class unarchived",
        description: `"${className}" has been moved back to active classes`,
      });
    } catch (error) {
      console.error("Error unarchiving class:", error);
      toast({
        title: "Failed to unarchive class",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setUnarchivingClass(null);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-heading font-semibold mb-2">Loading archived classes...</h2>
            <p className="text-muted-foreground">Fetching archived data from database</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-8">
      {/* Header Section */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-heading font-bold flex items-center gap-2">
            <Archive className="w-8 h-8" />
            Archived Classes
          </h1>
          <p className="text-muted-foreground text-lg">
            Manage and restore archived classes
          </p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Archived Classes</CardTitle>
            <Archive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{archivedClasses.length}</div>
            <p className="text-xs text-muted-foreground">
              Total archived
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {archivedClasses.reduce((total, cls) => total + (cls.students?.length || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all archived classes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Opportunities</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {archivedClasses.reduce((total, cls) => total + (cls.bidOpportunities?.length || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all archived classes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Archived Classes Table */}
      {archivedClasses.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-heading">Archived Classes</CardTitle>
            <CardDescription>
              Classes that have been archived and are no longer active
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class Name</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Opportunities</TableHead>
                  <TableHead>Total Bids</TableHead>
                  <TableHead>Archived Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archivedClasses.map((classItem) => (
                  <TableRow key={classItem.id}>
                    <TableCell className="font-medium">{classItem.className}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {classItem.students?.length || 0} students
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {classItem.bidOpportunities?.length || 0} opportunities
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {classItem.bidders?.length || 0} bids
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      Recently archived
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnarchive(classItem.id, classItem.className)}
                        disabled={unarchivingClass === classItem.id || isViewOnly}
                        className="flex items-center gap-2"
                      >
                        {unarchivingClass === classItem.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Unarchiving...
                          </>
                        ) : isViewOnly ? (
                          <>
                            <ArchiveRestore className="w-4 h-4" />
                            View Only
                          </>
                        ) : (
                          <>
                            <ArchiveRestore className="w-4 h-4" />
                            Unarchive
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <Archive className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Archived Classes</h3>
            <p className="text-muted-foreground mb-4">
              You haven't archived any classes yet. Archive classes that are no longer active to keep your workspace organized.
            </p>
            <Alert>
              <Archive className="h-4 w-4" />
              <AlertDescription>
                <strong>Tip:</strong> Archived classes preserve all data including students, bids, and opportunities. 
                You can unarchive them at any time to make them active again.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Archive;