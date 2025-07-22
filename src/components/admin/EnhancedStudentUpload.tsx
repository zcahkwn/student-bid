import { useState, ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Student } from "@/types";
import { uploadCSVToSupabase, CSVUploadResult } from "@/lib/csvUploadService";
import { Loader2, Upload, CheckCircle, AlertCircle, FileText, Database, RefreshCw } from "lucide-react";

interface EnhancedStudentUploadProps {
  classId: string;
  onUpload: (students: Student[]) => void;
}

const EnhancedStudentUpload = ({ classId, onUpload }: EnhancedStudentUploadProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<CSVUploadResult | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setUploadResult(null); // Clear previous results
    }
  };

  const simulateProgress = () => {
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);
    return interval;
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a CSV file to upload",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    const progressInterval = simulateProgress();
    
    try {
      const result = await uploadCSVToSupabase(file, classId);
      
      // Complete the progress
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      setUploadResult(result);
      
      if (result.success) {
        toast({
          title: "Upload successful",
          description: result.message,
        });
        
        // Trigger a refresh of the student list
        onUpload([]);
      } else {
        toast({
          title: "Upload failed",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      clearInterval(progressInterval);
      setUploadProgress(0);
      
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      
      setUploadResult({
        success: false,
        recordsProcessed: 0,
        errors: [errorMessage],
        duplicatesSkipped: 0,
        message: "Upload failed due to an error"
      });
      
      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setFile(null);
      // Reset file input
      const fileInput = document.getElementById('csvFile') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="csvFile">Upload CSV File</Label>
          <Input 
            id="csvFile" 
            type="file" 
            accept=".csv" 
            onChange={handleFileChange}
            disabled={isUploading}
          />
          <div className="text-sm text-muted-foreground space-y-1">
            <p><strong>REQUIRED COLUMNS:</strong></p>
            <p>• <strong>Name</strong> - Student's full name</p>
            <p>• <strong>Email</strong> - Student's email address</p>
            <p>• <strong>Student Number</strong> - Student's ID number (required for login)</p>
            <p className="text-amber-600 font-medium">⚠️ All three fields are required for student login</p>
            <p>• Supported format: CSV (.csv)</p>
          </div>
        </div>

        {/* File Preview */}
        {file && !isUploading && (
          <Alert>
            <FileText className="h-4 w-4" />
            <AlertDescription>
              <strong>Selected file:</strong> {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </AlertDescription>
          </Alert>
        )}

        {/* Upload Progress */}
        {isUploading && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Replacing students in database...</span>
            </div>
            <Progress value={uploadProgress} className="w-full" />
            <p className="text-xs text-muted-foreground">
              Removing existing students and uploading new data...
            </p>
          </div>
        )}

        {/* Upload Results */}
        {uploadResult && (
          <div className="space-y-3">
            <Alert variant={uploadResult.success ? "default" : "destructive"}>
              {uploadResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                <strong>{uploadResult.success ? "Success!" : "Upload Failed"}</strong>
                <br />
                {uploadResult.message}
              </AlertDescription>
            </Alert>

          </div>
        )}

        <Button 
          onClick={handleUpload} 
          disabled={!file || isUploading}
          className="w-full bg-red-600 hover:bg-red-700"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Replacing Students...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Upload or Replace Students CSV Data
            </>
          )}
        </Button>

        {/* CSV Template Download */}
        <div className="border-t pt-4">
          <h4 className="font-medium text-sm mb-2">Template:</h4>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              const csvContent = "Name,Email,Student Number\nJohn Doe,john.doe@example.com,ST2024001\nJane Smith,jane.smith@example.com,A123456\nBob Wilson,bob.wilson@example.com,B789012";
              const blob = new Blob([csvContent], { type: 'text/csv' });
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'student_template.csv';
              a.click();
              window.URL.revokeObjectURL(url);
            }}
          >
            Download CSV Template
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default EnhancedStudentUpload;