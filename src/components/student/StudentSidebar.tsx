import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ClassConfig, Student } from "@/types";
import { cn } from "@/lib/utils";
import { isBidOpportunityOpen } from "@/utils/dates";
import { 
  Coins, 
  Calendar, 
  ChevronRight,
  BookOpen,
  Users,
} from "lucide-react";

interface StudentSidebarProps {
  classes: ClassConfig[];
  currentClass: ClassConfig | null;
  onSelectClass: (classId: string) => void;
  isCollapsed?: boolean;
  currentStudent: Student | null;
}

const StudentSidebar = ({ 
  classes, 
  currentClass, 
  onSelectClass,
  isCollapsed = false,
  currentStudent
}: StudentSidebarProps) => {
  const [hoveredClass, setHoveredClass] = useState<string | null>(null);

  return (
    <div className={cn(
      "fixed left-0 top-16 h-[calc(100vh-64px)] bg-white border-r border-gray-200 shadow-sm transition-all duration-300 z-40",
      isCollapsed ? "w-16" : "w-80"
    )}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            {!isCollapsed && (
              <h2 className="text-lg font-heading font-semibold text-gray-900">
                My Classes
              </h2>
            )}
          </div>
        </div>

        {/* Classes List */}
        <ScrollArea className="flex-1 p-2">
          <div className="space-y-2">
            {classes.length === 0 ? (
              <div className={cn(
                "text-center py-8",
                isCollapsed && "px-2"
              )}>
                {!isCollapsed ? (
                  <>
                    <BookOpen className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500 mb-3">No classes enrolled</p>
                    <p className="text-xs text-gray-400">Contact your instructor to get enrolled</p>
                  </>
                ) : (
                  <BookOpen className="w-6 h-6 mx-auto text-gray-400" />
                )}
              </div>
            ) : (
              classes.map((classItem) => {
                // Calculate class statistics
                const totalOpportunities = classItem.bidOpportunities?.length || 0;
                const openOpportunities = classItem.bidOpportunities?.filter(opp => isBidOpportunityOpen(opp)).length || 0;

                // Find the current student's enrollment in this specific class
                const studentInThisClass = classItem.students.find(s => s.id === currentStudent?.id);
                const hasUsedTokenInClass = studentInThisClass?.hasUsedToken === true || 
                                          studentInThisClass?.tokenStatus === 'used';
                return (
                  <Card
                    key={classItem.id}
                    className={cn(
                      "cursor-pointer transition-all duration-200 hover:shadow-md",
                      currentClass?.id === classItem.id 
                        ? "border-academy-blue bg-academy-blue/5 shadow-sm" 
                        : "border-gray-200 hover:border-gray-300",
                      isCollapsed && "p-2"
                    )}
                    onClick={() => onSelectClass(classItem.id)}
                    onMouseEnter={() => setHoveredClass(classItem.id)}
                    onMouseLeave={() => setHoveredClass(null)}
                  >
                    {isCollapsed ? (
                      <div className="flex items-center justify-center p-2">
                        <div className="w-8 h-8 rounded-full bg-academy-blue/10 flex items-center justify-center">
                          <span className="text-sm font-semibold text-academy-blue">
                            {classItem.className.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base font-semibold text-gray-900 truncate">
                              {classItem.className}
                            </CardTitle>
                            {currentClass?.id === classItem.id && (
                              <ChevronRight className="w-4 h-4 text-academy-blue" />
                            )}
                          </div>
                          <p className="text-xs text-gray-500 truncate">
                            {classItem.rewardTitle}
                          </p>
                        </CardHeader>
                        
                        <CardContent className="pt-0">
                          <div className="space-y-2">
                            {/* Opportunities Status */}
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-gray-400" />
                                <span className="text-gray-600">Opportunities</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="text-xs px-1 py-0">
                                  {totalOpportunities}
                                </Badge>
                                {openOpportunities > 0 && (
                                  <Badge className="text-xs px-1 py-0 bg-green-500">
                                    {openOpportunities} open
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Token Status */}
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1">
                                <Coins className="w-3 h-3 text-gray-400" />
                                <span className="text-gray-600">Token</span>
                              </div>
                              <Badge 
                                variant={
                                  hasUsedTokenInClass
                                    ? "secondary" 
                                    : "default"
                                }
                                className={`text-xs px-1 py-0 ${
                                  hasUsedTokenInClass
                                    ? "bg-red-100 text-red-800"
                                    : "bg-green-100 text-green-800"
                                }`}
                              >
                                {hasUsedTokenInClass
                                  ? "Used" 
                                  : "Available"
                                }
                              </Badge>
                            </div>

                            {/* Bid Status */}
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1">
                                <Users className="w-3 h-3 text-gray-400" />
                                <span className="text-gray-600">Students</span>
                              </div>
                              <Badge variant="outline" className="text-xs px-1 py-0">
                                {classItem.students?.length || 0}
                              </Badge>
                            </div>
                          </div>
                        </CardContent>
                      </>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        {!isCollapsed && (
          <div className="p-4 border-t border-gray-100">
            <div className="text-xs text-gray-500 text-center">
              {classes.length} {classes.length === 1 ? 'class' : 'classes'} enrolled
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentSidebar;